// Gangstar: Crime City specific port layer.
//
// 60 fps: the game logic keeps running at its native 10 ticks/s. Between ticks we render extra frames with
// interpolated camera and actor positions, using the game's own "draw without updating" flag (d.bQ).
//
// How an extra frame is made faithful to the real one:
//  * During every real gameplay tick we capture the game state at the exact moment the world starts to be
//    drawn (entry of d.b(Graphics), the map renderer, called once per frame). At that point all of the
//    frame's logic has run, including transient values that only the drawing uses (aim lock, player pose).
//  * An extra frame restores that capture, moves actors/camera to interpolated positions, and runs the
//    frame with d.bQ=1 (draw only). Bullets/effects (d.bu/d.bv) live inside the logic-only block, so they
//    are injected at their original place (just before b.B()).
//  * Afterwards the real current state is restored, so the extra frames never affect the game logic.
//  * If a real tick never reached the map renderer (dialog boxes, cutscenes, menus), its frame is shown
//    as-is: those screens are static and need no interpolation.
'use strict';

const Gangstar = (() => {
  const tracked = [];          // every game object (classes a, b, c, d)
  const actors = [];           // instances of class b (people, cars...): fields 'b.a','b.b' = x,y in 24.8 fixed point
  const randoms = [];
  let D = null, userClasses = [];
  let prev = null, cur = null, tickAt = 0, tickLen = 100, lastAlpha = -1;
  let active = false, inInterp = false, drawSnap = null;
  const opts = { smooth: true, speed: 1, quick: true, smoothTurn: true };

  // ----- game clock and tick pacing -----
  // The game's main loop (d.run) runs one tick, then spins on Thread.yield() until 100 ms of
  // System.currentTimeMillis() have passed. Waking up every few ms overshoots (the game ran at ~9 ticks/s),
  // so the yield inside that wait sleeps exactly until the tick is due. The clock the game sees can run
  // faster than real time ("game speed"): everything, including mission timers, scales together.
  let clockReal = performance.now(), clockGame = Date.now();
  const gameNow = () => clockGame + (performance.now() - clockReal) * opts.speed;
  function setSpeed(v) {
    const g = gameNow();
    clockReal = performance.now(); clockGame = g;
    opts.speed = Math.min(2, Math.max(0.5, v || 1));
  }
  function yieldHook(t) {
    const f = t.frames[t.frames.length - 1];
    if (!f || f.m.name !== 'run' || f.m.cls !== D) return YIELD;
    if (f.ipc === 64) return undefined;          // unconditional yield at the top of the loop: the tick is next
    if (f.ipc === 101) {                          // inside the wait for the next tick
      const due = Number(D.sv.at) + 100;
      if (nudged) {                               // a key went down: start the next tick now (see nudge)
        nudged = false;
        const g = gameNow();
        if (due > g) clockGame += due - g;
        return undefined;
      }
      const left = (due - gameNow()) / opts.speed;  // real ms
      if (left > 3) { t.sleepFor = left - 2; return YIELD; } // timers wake late: aim a bit early...
      while (gameNow() < due) { /* ...and wait out the last couple of ms here */ }
      return undefined;
    }
    return YIELD;
  }
  // ----- quicker response -----
  // Two things made the controls feel late, each worth up to a tick (100 ms):
  //  * a key pressed just after a tick waited for the next one. When a key goes down, the wait for the
  //    next tick ends now: the clock the game sees jumps ahead by the rest of the wait. At most once every
  //    300 ms, so mashing a button cannot speed the game up.
  //  * the in-between frames went from the previous tick to the last one, so the picture was a whole tick
  //    behind the game. They now run half a tick ahead (opts.lead), continuing the last movement for that
  //    half; a sudden stop shows at most half a step of overshoot. The camera stays within one tile of
  //    the real one and the map tiles that this uncovers are drawn into the spare slot of the map buffer.
  let nudged = false, lastNudge = 0;
  function nudge() {
    if (!opts.quick || !D || D.sv.T !== 7 || nudged) return;
    const now = performance.now();
    if (now - lastNudge < 300) return;
    lastNudge = now; nudged = true;
    for (const t of VM.threads) if (t.name === 'java-thread' && !t.done) t.sleepUntil = 0;
  }
  const cheats = { health: false, ammo: false, noPolice: false };

  // Game variables (found by reverse engineering d.java):
  //   d.cx = money, d.cw = wanted level (stars), d.cm[w] = weapon w (low 16 bits = ammo, 0 = not owned),
  //   player = d.cd (class b): j[0] = health, j[1] = max health. d.dc = HUD dirty flags.
  function applyCheats() {
    if (!D || D.sv.T !== 7 || !D.sv.cd) return;
    const sv = D.sv, pl = sv.cd, j = pl['b.j'];
    if (cheats.health && j && j[0] < j[1]) { j[0] = j[1]; sv.dc |= 0x102; }
    if (cheats.ammo && sv.cm) for (let w = 1; w < sv.cm.length; w++) {
      const v = sv.cm[w];
      if (v > 0 && (v & 0xFFFF) < 999) { sv.cm[w] = (v & ~0xFFFF) | 999; sv.dc |= 4; }
    }
    if (cheats.noPolice && sv.cw !== 0) { sv.cw = 0; sv.dc |= 0x10; }
  }
  function addMoney(n) {
    if (!D || !D.sv.cd) return false;
    D.sv.cx = Math.min(99999999, D.sv.cx + n); D.sv.dc |= 1;
    return true;
  }
  // ----- driving: up/down and left/right are separate keys -----
  // On foot (d.cA set, handled by d.aE()) the game moves in the 8 directions of keys 1..9, so two directions
  // pressed together must become one diagonal key. In a vehicle (d.cA clear, d.aG()) with the game's car
  // controls (d.cH == 1) it reads 2 = accelerate, 8 = brake/reverse, 4/6 = steer as independent keys and
  // ignores 1/3/7/9 entirely: a diagonal there meant "no gas, no steering".
  // driving() tells the controls which of the two the game wants right now; onDrivingChange fires when it
  // flips (getting in/out of a car with a direction held).
  let wasDriving = false;
  const driving = () => !!(D && D.sv.T === 7 && !D.sv.cA && D.sv.cH === 1);
  const hooks = { onDrivingChange: null };

  const stats = { renders: 0, ticks: 0, renderMs: 0, realShown: 0, turned: 0, lastTurn: 0 };

  function beforeStart() {
    for (const n of ['a', 'b', 'c', 'd']) {
      const c = VM.loadClass(n);
      userClasses.push(c);
      c.onNew = (o) => { tracked.push(o); if (n === 'b') actors.push(o); };
    }
    VM.loadClass('java/util/Random').onNew = (o) => randoms.push(o);
    D = VM.loadClass('d');
    MIDP.state.flushHook = onTickFlush;
    MIDP.state.clock = () => Math.floor(gameNow());
    MIDP.state.yieldHook = yieldHook;
    VM.hookMethod('d', 'b(Ljavax/microedition/lcdui/Graphics;)V', (orig, g) => {
      if (!inInterp && opts.smooth) drawSnap = saveState();
      return orig(g);
    });
    const orig = (name) => Object.assign({}, D.methods.get(name), { fn: null });
    const bu = orig('bu()V'), bv = orig('bv()V');
    // smooth turning: a car has 16 pre-drawn directions (b.i[1], 22.5° apart, counter-clockwise) and turns
    // one step per tick, so with smooth movement the jump from one picture to the next showed. In the
    // in-between frames the car (b.g draws an actor) is drawn turned by the part of the step still to come.
    const turning = (origG, self) => {
      const t = turnAngle(self);
      if (!t) return origG(self);
      // where the car lands on the screen: draw it once without drawing (this frame's state is thrown away
      // afterwards anyway), then for real, turned around the centre of that
      const box = MIDP.state.measure = [];
      try { origG(self); } finally { MIDP.state.measure = null; }
      if (!box.length) return origG(self);
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (let i = 0; i < box.length; i += 4) { x1 = Math.min(x1, box[i]); y1 = Math.min(y1, box[i + 1]); x2 = Math.max(x2, box[i + 2]); y2 = Math.max(y2, box[i + 3]); }
      stats.turned++; stats.lastTurn = t;
      MIDP.state.rotate = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, a: t };
      try { return origG(self); } finally { MIDP.state.rotate = null; }
    };
    VM.hookMethod('b', 'g()V', turning);
    VM.hookMethod('b', 'B()V', (origB) => {
      if (inInterp) { VM.invokeSync(bu, []); VM.invokeSync(bv, []); }
      return origB();
    });
    requestAnimationFrame(frame);
  }

  function snapshotPositions() {
    const m = new Map();
    for (const o of actors) m.set(o, [o['b.a'], o['b.b'], o['b.i'] ? o['b.i'][1] : 0]);
    return { actors: m, cam: [D.sv.fU, D.sv.fV] };
  }

  // end of every real game tick (flushGraphics)
  function onTickFlush() {
    const now = performance.now();
    stats.ticks++;
    if (tickAt) tickLen = Math.min(200, Math.max(60, tickLen * 0.8 + (now - tickAt) * 0.2));
    tickAt = now;
    edgeDrawn = new Set();                      // the real frame may have reused the spare slot
    applyCheats();
    const dr = driving();
    if (dr !== wasDriving) { wasDriving = dr; if (hooks.onDrivingChange) hooks.onDrivingChange(dr); }
    const snap = drawSnap; drawSnap = null;
    const ok = opts.smooth && snap && D.sv.T === 7 && !D.sv.ee && !D.sv.ar;
    if (!ok) { active = false; prev = cur = null; stats.realShown++; return true; }
    prev = cur;
    cur = snapshotPositions(); cur.state = snap;
    if (!prev) { active = false; stats.realShown++; return true; }
    active = true; lastAlpha = -1;
    return false; // extra frames (including alpha = 1) are presented by frame()
  }

  // ----- state capture -----
  function saveState() {
    const objs = new Array(tracked.length), arrs = [];
    for (let i = 0; i < tracked.length; i++) {
      const o = tracked[i], c = Object.assign({}, o);
      objs[i] = c;
      for (const k in c) { const v = c[k]; if (v && ArrayBuffer.isView(v) && v.length <= 64) arrs.push([v, v.slice()]); }
    }
    const statics = userClasses.map((c) => {
      const sv = Object.assign({}, c.sv);
      for (const k in sv) { const v = sv[k]; if (v && ArrayBuffer.isView(v) && v.length <= 4096) arrs.push([v, v.slice()]); }
      return sv;
    });
    const seeds = randoms.map((r) => r.seed);
    return { objs, statics, arrs, seeds, n: tracked.length };
  }
  function restoreState(s) {
    for (let i = 0; i < s.n; i++) Object.assign(tracked[i], s.objs[i]);
    userClasses.forEach((c, i) => Object.assign(c.sv, s.statics[i]));
    for (const [a, copy] of s.arrs) a.set(copy);
    randoms.forEach((r, i) => { if (i < s.seeds.length) r.seed = s.seeds[i]; });
  }

  const LEAD = 0.5;
  let drawAlpha = 1;
  function turnAngle(o) {
    if (!inInterp || !opts.smoothTurn || !cur || !prev) return 0;
    const c = cur.actors.get(o), p = prev.actors.get(o);
    if (!c || !p) return 0;
    let d = (c[2] - p[2]) & 15; if (d > 8) d -= 16;
    if (d !== 1 && d !== -1) return 0;           // only one-step turns: cars (people turn in 45° steps)
    const t = Math.min(drawAlpha, 1.25);
    return (1 - t) * d * Math.PI / 8;            // canvas angles turn clockwise, directions counter-clockwise
  }
  const lerp = (a, b, t, max) => (Math.abs(b - a) > max ? b : Math.round(a + (b - a) * t));

  // the live state only changes when Java code runs (VM.epoch), so it is captured once per change, not per frame
  let liveSnap = null, liveEpoch = -1;
  function renderInterpolated(alpha) {
    if (!liveSnap || liveEpoch !== VM.epoch) liveSnap = saveState();
    const saved = liveSnap;
    try {
      restoreState(cur.state);
      drawAlpha = alpha;
      for (const [o, c] of cur.actors) {
        const p = prev.actors.get(o);
        if (!p) continue;
        o['b.a'] = lerp(p[0], c[0], alpha, 72 << 8);
        o['b.b'] = lerp(p[1], c[1], alpha, 72 << 8);
      }
      const near = (v, c) => Math.max(c - 23, Math.min(c + 23, v));   // within a tile of the real camera
      D.sv.fU = near(lerp(prev.cam[0], cur.cam[0], alpha, 96), cur.cam[0]);
      D.sv.fV = near(lerp(prev.cam[1], cur.cam[1], alpha, 96), cur.cam[1]);
      edgeTiles();
      D.sv.bQ = 1;
      D.sv.am = MIDP.newGraphics(MIDP.state.backImage);
      inInterp = true;
      VM.callSync('d', 'ac()V', []);
    } catch (e) {
      console.warn('interp frame failed', e);
      active = false;
    } finally {
      inInterp = false;
      restoreState(saved);
      liveEpoch = VM.epoch;
    }
    MIDP.present();
  }

  // Map tiles visible from the in-between camera that the game has not drawn for the real one. The game
  // keeps (screen width + 24) / 24 columns by 13 rows from tile (d.fG, d.fH) in a wrap-around buffer one
  // column and one row larger (see Wide): the column just before or after that range, and the row just
  // above or below, land in the spare slot and can be drawn there without touching the game's tiles.
  let edgeDrawn = new Set();
  function edgeTiles() {
    const sv = D.sv;
    if (sv.ee || !sv.ho || sv.fG < 0 || sv.fH < 0) return;
    const cols = (MIDP.SW + 24) / 24, rows = 13, N = sv.ho.w / 24, R = sv.ho.h / 24;
    if (N < cols + 1 || R < rows + 1) return;
    const x0 = Math.floor(sv.fU / 24), x1 = Math.floor((sv.fU + MIDP.SW - 1) / 24);
    const y0 = Math.floor(sv.fV / 24), y1 = Math.floor((sv.fV + 276 - 1) / 24);
    const okX = (x) => x >= sv.fG - 1 && x <= sv.fG + cols, okY = (y) => y >= sv.fH - 1 && y <= sv.fH + rows;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x >= sv.fG && x < sv.fG + cols && y >= sv.fH && y < sv.fH + rows) continue;   // the game's own
      if (!okX(x) || !okY(y)) continue;
      const k = x + ',' + y;
      if (edgeDrawn.has(k)) continue;
      edgeDrawn.add(k);
      VM.callSync('d', 'u(II)V', [x, y]);
    }
  }

  function gameThreadIdle() {
    for (const t of VM.threads) if (t.name === 'java-thread' && t.status !== 'yield' && t.status !== undefined) return false;
    return VM.events.length === 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!active || !cur || !prev || !VM.running) return;
    if (!gameThreadIdle()) return;
    const alpha = Math.min(1, (now - tickAt) / tickLen) + (opts.quick ? LEAD : 0);
    if (alpha === lastAlpha) return;
    lastAlpha = alpha;
    const t0 = performance.now();
    renderInterpolated(alpha);
    stats.renders++; stats.renderMs += performance.now() - t0;
  }

  // after a save state is loaded: track the rebuilt objects instead of the old ones
  function adopt(objs) {
    tracked.length = 0; actors.length = 0; randoms.length = 0;
    for (const o of objs) {
      const n = o.cls.name;
      if (n === 'a' || n === 'b' || n === 'c' || n === 'd') { tracked.push(o); if (n === 'b') actors.push(o); }
      else if (n === 'java/util/Random') randoms.push(o);
    }
    prev = cur = null; drawSnap = null; active = false; tickAt = 0; liveSnap = null;
    // the map buffer image may come from an older version with another size (see Wide): rebuild it,
    // the next map refresh (d.Z -> d.Y) creates it again at the current size and redraws it whole
    if (D) { D.sv.ho = null; D.sv.fL = -1; }
  }

  return { beforeStart, adopt, opts, setSpeed, nudge, driving, hooks, cheats, addMoney, stats, tracked, actors, _render: (a) => renderInterpolated(a) };
})();
