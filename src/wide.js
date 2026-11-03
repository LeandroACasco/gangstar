// Wide screen for Gangstar: Crime City.
//
// The game was written for a 240x320 screen and has that size baked into its code as plain constants
// (sipush 240, bipush 120, the 264x312 map tile buffer...). To show more of the city we rewrite those
// constants when the classes are loaded: each one becomes the port opcode 0xcb, which pushes a value from
// VM.K. Instruction lengths never change, so jumps, exception tables and save states stay valid.
'use strict';

const Wide = (() => {
  let clearBands = false;   // menus: leave the side bands transparent (presentation art behind the canvas)
  // operand bytes after the opcode (0 for everything not listed); -1 = variable length
  const LEN = new Int8Array(256);
  for (const o of [0x10, 0x12, 0x15, 0x16, 0x17, 0x18, 0x19, 0x36, 0x37, 0x38, 0x39, 0x3a, 0xa9, 0xbc]) LEN[o] = 1;
  for (const o of [0x11, 0x13, 0x14, 0x84, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xbb, 0xbd, 0xc0, 0xc1, 0xc6, 0xc7]) LEN[o] = 2;
  for (let o = 0x99; o <= 0xa8; o++) LEN[o] = 2;
  LEN[0xc5] = 3; LEN[0xb9] = 4; LEN[0xc8] = 4; LEN[0xc9] = 4;
  LEN[0xaa] = LEN[0xab] = LEN[0xc4] = -1;

  function* walk(code) {
    let pc = 0;
    while (pc < code.length) {
      const op = code[pc];
      let n = LEN[op];
      if (n === -1) {
        if (op === 0xc4) n = code[pc + 1] === 0x84 ? 5 : 3;
        else {
          const base = (pc + 4) & ~3, rd = (i) => ((code[i] << 24) | (code[i + 1] << 16) | (code[i + 2] << 8) | code[i + 3]);
          if (op === 0xaa) { const lo = rd(base + 4), hi = rd(base + 8); n = base - pc - 1 + 12 + (hi - lo + 1) * 4; }
          else { const np = rd(base + 4); n = base - pc - 1 + 8 + np * 8; }
        }
      }
      yield [pc, op];
      pc += 1 + n;
    }
  }

  // constant value at pc, if the instruction is a bipush/sipush
  // (bipush, sipush, or ldc/ldc_w of an int from the class constant pool)
  function constAt(code, pc, cp) {
    const op = code[pc];
    if (op === 0x10) return (code[pc + 1] << 24) >> 24;
    if (op === 0x11) return (((code[pc + 1] << 8) | code[pc + 2]) << 16) >> 16;
    if (cp && (op === 0x12 || op === 0x13)) {
      const e = cp[op === 0x12 ? code[pc + 1] : (code[pc + 1] << 8) | code[pc + 2]];
      if (e && e.tag === 3) return e.v;
    }
    return null;
  }

  // VM.K[i] is the value in use; orig[i] the game's original constant, used while drawing menus (Narrow)
  const orig = [];
  function setK(code, pc, value) {
    const was = constAt(code, pc, null) ?? constAt(code, pc, curCp);
    let idx = VM.K.findIndex((v, i) => v === value && orig[i] === was);
    if (idx < 0) { idx = VM.K.length; VM.K.push(value); orig.push(was); }
    if (idx > 255) throw new Error('too many patched constants');
    const len = code[pc] === 0x11 || code[pc] === 0x13 ? 3 : 2;
    code[pc] = 0xcb; code[pc + 1] = idx;
    if (len === 3) code[pc + 2] = 0x00; // nop
  }

  const stats = { patched: 0 };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // name and descriptor of the method an invoke instruction calls
  function invoked(code, pc, cp) {
    const e = cp[(code[pc + 1] << 8) | code[pc + 2]], nt = e && cp[e.nti];
    return nt ? cp[nt.ni].s + cp[nt.di].s : '';
  }
  // pcs of constants passed straight to Graphics.setColor(r, g, b): a 240 there is a color, not a size
  function colorArgs(code, cp) {
    const out = new Set(), last = [];
    for (const [pc, op] of walk(code)) {
      if (op === 0xb6 && invoked(code, pc, cp) === 'setColor(III)V') for (const q of last.slice(-3)) out.add(q);
      last.push(pc); if (last.length > 3) last.shift();
    }
    return out;
  }

  // map: { oldValue: newValue } for every method of the class; per[methodKey] adds/overrides values for that
  // method only, and a per-method value of null leaves that constant alone
  let curCp = null;
  function patchClass(name, map, per = {}, keep = null) {
    const cls = VM.loadClass(name);
    curCp = cls.cp;
    for (const m of cls.methods.values()) {
      if (!m.code || (keep && !keep.includes(m.key))) continue;
      const mm = per[m.key] === false ? null : Object.assign({}, map, per[m.key]);
      if (!mm) continue;
      const colors = colorArgs(m.code, cls.cp);
      for (const [pc] of walk(m.code)) {
        const v = constAt(m.code, pc, cls.cp);
        if (v === null || colors.has(pc)) continue;
        const at = v + '@' + pc;                      // "value@pc" patches one instruction only
        const to = has(mm, at) ? mm[at] : has(mm, v) ? mm[v] : null;
        if (to !== null && to !== v) { setK(m.code, pc, to); stats.patched++; }
      }
    }
  }

  // ----- map buffer with a spare column and row -----
  // The city is drawn from a wrap-around image (d.ho) holding exactly the tiles on screen plus one:
  // 264x312 = 11x13 tiles. Scrolling one tile redraws the new column over the slot of the one that just
  // left. The in-between frames of "smooth movement" (gangstar.js) show the camera up to one tick behind,
  // so the edge opposite to the movement was taken from a slot that already held the other side: a strip
  // of wrong tiles there. The image gets one more column and row as the wrap-around size (u(II) wraps tile
  // positions in it, b(Graphics) copies it to the screen, the a(...) drawers wrap sprites into it), while
  // Z() still redraws only the visible 11 (or more on a wide screen) by 13, so the tiles that just left
  // stay valid in the spare slot. Applies to every width, the original one included.
  // Menus (title, main menu...) also use this image for their animated background, with the original
  // 264/312 written in their own code: while they run (Narrow) every patched constant, these included,
  // goes back to its original value, so both sides agree on the layout.
  const BUF = { Y: 'Y()V', D: 'd(IIII)V', U: 'u(II)V', BLIT: 'b(Ljavax/microedition/lcdui/Graphics;)V',
    A1: 'a(La;IIIII)V', A2: 'a(IIIIII)V' };
  function bufferPer(W) {
    const BW = W + 48, BH = 312 + 24, wrap = { 264: BW, 312: BH };
    return {
      [BUF.Y]: { '264@6': BW, '312@9': BH },         // createImage; the 264 further down is the radar map
      [BUF.D]: wrap, [BUF.BLIT]: wrap, [BUF.A1]: wrap, [BUF.A2]: wrap,
      [BUF.U]: Object.assign({ '11@72': BW / 24, '13@81': BH / 24 }, wrap),   // tile -> buffer slot
    };
  }

  function apply(W) {
    const cols = (W + 24) / 24;                      // tiles Z() redraws across the screen
    if (W === 240 && !globalThis.__forcePatch) {     // original width: only the map buffer changes
      patchClass('d', {}, bufferPer(W), Object.values(BUF));
      Narrow.init(W);                                // menus: original buffer layout (dx = 0)
      return;
    }
    const map = { 240: W, 239: W - 1, 120: W >> 1, 264: W + 24, 76800: W * 320,
      30720: (W >> 1) << 8, 61440: W << 8, 67584: (W + 24) << 8 };  // the same sizes in 24.8 fixed point
    const per = Object.assign({
      'b([B)[B': false,                              // data decompressor: its 240/256 are not screen sizes
      'Z()V': { 11: cols },                          // map buffer refresh: 11 = 264/24 columns
      // the HUD keeps its original 240-wide layout; Hud below spreads it over the wider screen
      'j(Z)V': false,                                // HUD bar backgrounds
      'aP()V': { '240@687': 240, '240@751': 240 },   // bottom bar clip rectangles
      'aR()V': false,                                // radar
    }, bufferPer(W));
    // right softkey label ("SALTAR", "ATRÁS") at x = 238, and the dialog text wrap width 236
    // (other 2xx constants nearby are text ids, not positions)
    const wrap = Object.fromEntries([302, 719, 1224, 1270, 1316].map((pc) => ['236@' + pc, W - 4]));
    Object.assign(per, { 'b(III)V': { 238: W - 2 }, 'aL()Z': Object.assign(wrap, { '120@227': 120 }) });
    per['bv()V'] = { '120@298': 120 };              // 120 here is an effect timer, not the screen centre
    // (and in aL, 120@227 is a dialog timer)
    const dbg = globalThis.__wideDbg || {};
    if (dbg.per) for (const k in dbg.per) per[k] = dbg.per[k] === false ? false : Object.assign({}, per[k], dbg.per[k]);
    patchClass('d', map, per, dbg.keep || null);
    patchClass('a', { 240: W, 239: W - 1 });         // text renderer: default wrap width and right edge
    Narrow.init(W);
    Hud.init(W);
  }

  // ----- menus in their original layout -----
  // Title, main menu and the pause menu are built around a 240 px screen (backgrounds, boxes, aligned
  // text) and look broken when stretched. While those screens are drawn the patched constants go back
  // to their original values and drawing is shifted to the middle of the screen.
  const Narrow = (() => {
    // d.T -> the method that runs (logic and drawing) for that screen; loading (6) and gameplay (7) stay wide
    const STATES = { 1: 'ad()V', 3: 'af()V', 4: 'ag()V', 5: 'ak()V', 8: 'aU()V', 9: 'ah()V', 10: 'aj()V' };  // 10: map
    // the pause screen (9) draws the city behind the menu with these: they always run wide
    const WIDE = ['at()V', 'C(II)V', 'Z()V', 'Y()V'];
    let W = 240, dx = 0, on = false, depth = 0, wideK = null;
    const g = () => { const D = VM.classes.get('d'); return D.sv.am && D.sv.am.g; };
    function init(w) {
      W = w; dx = (w - 240) >> 1;
      for (const key of Object.values(STATES)) {
        VM.hookMethod('d', key, (origFn) => {
          const gr = g();
          if (!gr || depth) return origFn();
          wideK = VM.K.slice();
          for (let i = 0; i < orig.length; i++) VM.K[i] = orig[i];
          gr.tx += dx; on = true; depth++;
          try { return origFn(); } finally { depth--; gr.tx -= dx; VM.K.splice(0, wideK.length, ...wideK); }
        });
      }
      for (const key of WIDE) {
        VM.hookMethod('d', key, (origFn, ...a) => {
          if (!depth) return origFn(...a);
          const gr = g(), narrowK = VM.K.slice();
          VM.K.splice(0, wideK.length, ...wideK); if (gr) gr.tx -= dx; depth = 0;
          try { return origFn(...a); } finally { depth = 1; if (gr) gr.tx += dx; VM.K.splice(0, narrowK.length, ...narrowK); }
        });
      }
    }
    function current() {
      if (on && !(VM.classes.get('d').sv.T in STATES)) on = false;
      return on;
    }
    return { init, get on() { return current(); }, get dx() { return dx; } };
  })();

  // ----- HUD layout on a wide screen -----
  // The game draws its HUD bars (top: rows 0-17, bottom: rows 294-319) in the original 240 px. When the
  // screen is presented, the right half of each bar is moved to the right edge and the gap is filled
  // with a plain piece of the bar. The game only redraws the HUD when something changes, so we keep
  // track of whether the bar currently on screen is the HUD: drawing it (d.j) turns that on, and any
  // other drawing that lands past x=240 in those rows (dialogs, cutscenes, menus) turns it off.
  const Hud = (() => {
    let W = 240, top = false, bottom = false;
    const BARS = [
      { y: 0, h: 18, split: 165, fill: 170 },      // stars, palms | skyline, money (or a street name, see below)
      { y: 294, h: 26, split: 160, fill: 199 },    // radar, health, palms | weapon, ammo
    ];
    function init(w) {
      W = w;
      VM.hookMethod('d', 'j(Z)V', (orig, isTop) => { const r = orig(isTop); if (isTop) top = true; else bottom = true; return r; });
      MIDP.state.onDraw = (img, x1, y1, x2, y2) => {
        if (x2 <= 240 || img !== MIDP.state.backImage) return;
        if (y1 < 18) top = false;
        if (y2 > 294) bottom = false;
      };
      MIDP.state.blit = blit;
    }
    function blit(img, ctx) {
      const src = img.canvas;
      const T = VM.classes.get('d').sv.T;
      if (T === 6) {                                 // level loading ("Noticias"): drawn in the left 240 px
        const dx = (W - 240) >> 1, split = 298;      // text ends at row 296; the progress bar (rows 300+) runs the whole width
        ctx.drawImage(src, 0, 0, 240, split, dx, 0, 240, split);
        ctx.drawImage(src, 0, 0, 1, split, 0, 0, dx, split);                        // sky and city carry on
        ctx.drawImage(src, 239, 0, 1, split, dx + 240, 0, W - dx - 240, split);     // to the edges
        ctx.drawImage(src, 0, split, W, 320 - split, 0, split, W, 320 - split);
        return;
      }
      if (Narrow.on) {                               // a menu drawn in the middle: black bands on the sides
        const dx = Narrow.dx;
        if (clearBands) { ctx.clearRect(0, 0, dx, 320); ctx.clearRect(dx + 240, 0, W - dx - 240, 320); }   // art behind
        else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dx, 320); ctx.fillRect(dx + 240, 0, W - dx - 240, 320); }
        ctx.drawImage(src, dx, 0, 240, 320, dx, 0, 240, 320);
        return;
      }
      if (!top && !bottom) { ctx.drawImage(src, 0, 0); return; }
      ctx.drawImage(src, 0, 18, W, 276, 0, 18, W, 276);
      BARS.forEach((b, i) => {
        if (!(i ? bottom : top)) { ctx.drawImage(src, 0, b.y, W, b.h, 0, b.y, W, b.h); return; }
        // while a street name is shown (d.da > 0, d.cZ[0] == 0) it is centred in x = 96..240: keep that box whole
        const D = VM.classes.get('d').sv, split = !i && D.da > 0 && D.cZ && D.cZ[0] === 0 ? 96 : b.split;
        const right = 240 - split;
        ctx.drawImage(src, 0, b.y, split, b.h, 0, b.y, split, b.h);
        ctx.drawImage(src, b.fill, b.y, 1, b.h, split, b.y, W - right - split, b.h);
        ctx.drawImage(src, split, b.y, right, b.h, W - right, b.y, right, b.h);
      });
    }
    return { init, get state() { return { top, bottom }; } };
  })();

  return { apply, walk, constAt, patchClass, stats, Hud, get dx() { return Narrow.on ? Narrow.dx : 0; }, set clearBands(v) { clearBands = !!v; } };
})();
