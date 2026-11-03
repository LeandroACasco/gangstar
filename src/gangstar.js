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
  const opts = { smooth: true, speed: 1 };

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
      const left = (due - gameNow()) / opts.speed;  // real ms
      if (left > 3) { t.sleepFor = left - 2; return YIELD; } // timers wake late: aim a bit early...
      while (gameNow() < due) { /* ...and wait out the last couple of ms here */ }
      return undefined;
    }
    return YIELD;
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

  const stats = { renders: 0, ticks: 0, renderMs: 0, realShown: 0 };

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
    VM.hookMethod('b', 'B()V', (origB) => {
      if (inInterp) { VM.invokeSync(bu, []); VM.invokeSync(bv, []); }
      return origB();
    });
    requestAnimationFrame(frame);
  }

  function snapshotPositions() {
    const m = new Map();
    for (const o of actors) m.set(o, [o['b.a'], o['b.b']]);
    return { actors: m, cam: [D.sv.fU, D.sv.fV] };
  }

  // end of every real game tick (flushGraphics)
  function onTickFlush() {
    const now = performance.now();
    stats.ticks++;
    if (tickAt) tickLen = Math.min(200, Math.max(60, tickLen * 0.8 + (now - tickAt) * 0.2));
    tickAt = now;
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

  const lerp = (a, b, t, max) => (Math.abs(b - a) > max ? b : Math.round(a + (b - a) * t));

  // the live state only changes when Java code runs (VM.epoch), so it is captured once per change, not per frame
  let liveSnap = null, liveEpoch = -1;
  function renderInterpolated(alpha) {
    if (!liveSnap || liveEpoch !== VM.epoch) liveSnap = saveState();
    const saved = liveSnap;
    try {
      restoreState(cur.state);
      for (const [o, c] of cur.actors) {
        const p = prev.actors.get(o);
        if (!p) continue;
        o['b.a'] = lerp(p[0], c[0], alpha, 72 << 8);
        o['b.b'] = lerp(p[1], c[1], alpha, 72 << 8);
      }
      D.sv.fU = lerp(prev.cam[0], cur.cam[0], alpha, 96);
      D.sv.fV = lerp(prev.cam[1], cur.cam[1], alpha, 96);
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

  function gameThreadIdle() {
    for (const t of VM.threads) if (t.name === 'java-thread' && t.status !== 'yield' && t.status !== undefined) return false;
    return VM.events.length === 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!active || !cur || !prev || !VM.running) return;
    if (!gameThreadIdle()) return;
    const alpha = Math.min(1, (now - tickAt) / tickLen);
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
  }

  return { beforeStart, adopt, opts, setSpeed, driving, hooks, cheats, addMoney, stats, tracked, actors, _render: (a) => renderInterpolated(a) };
})();
