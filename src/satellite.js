// Satellite view for the map screen and the radar.
//
// The game's own map (pause → Mapa) is one flat-coloured pixel per 24 px tile, and the radar is a dark
// circle with dots. Here the whole city is drawn once with the game's real tiles (d.u(x,y) draws one tile,
// redirected into a private image so the game's map buffer is never touched) into a small "aerial photo"
// of S px per tile. It is shown on a canvas laid over the game screen at the device's resolution:
//   * map screen (d.T == 10): the game draws its map from d.c(Graphics); that call is replaced by a fill
//     with a key colour, so everything the game draws on top (player, missions, shops, legend) stays.
//   * radar (gameplay): the radar background colour is the key.
// The overlay shows the satellite image and, over it, the game's own pixels of that area with the key
// colour made transparent.
'use strict';

const Satellite = (() => {
  const S = 6;                              // world image: px per tile
  const MAP_KEY = 0x13e2c4;                 // colour that c(Graphics) paints instead of the flat map (no marker uses it)
  const RADAR_BG = 0x0b0909;                // radar inner circle (d.aR)
  const RADAR = { x: 20, y: 281, d: 38 };   // inner circle, 240-px HUD layout (also on wide screens)
  const opts = { map: true, radar: true };
  let D = null, world = null, worldKey = '', job = null, lastFrames = -1, drawn = false;
  let layer = null, lctx = null, tmp = null, tctx = null, screen = null, btn = null;
  const listeners = { onState: null };

  // ----- the city as one image -----
  function key() {
    const sv = D.sv;
    return sv.fK + ':' + sv.fz + 'x' + sv.fA + ':' + (sv.fy ? Array.from(sv.fy).join(',') : '');
  }
  function ready() { return world && worldKey === key(); }
  function build() {
    if (job || !D || !D.sv.ho || !D.sv.fy) return;
    const sv = D.sv, k = key(), TW = sv.fz * sv.ft, TH = sv.fA * sv.fu;
    const priv = MIDP.makeImage(sv.ho.w, sv.ho.h, true), g = MIDP.newGraphics(priv);
    const cols = sv.ho.w / 24, rows = sv.ho.h / 24;          // d.u wraps tile positions in this size
    const out = document.createElement('canvas'); out.width = TW * S; out.height = TH * S;
    const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
    const blocks = [];
    for (let by = 0; by < TH; by += rows) for (let bx = 0; bx < TW; bx += cols) blocks.push([bx, by]);
    job = { k, done: 0, total: blocks.length };
    if (listeners.onState) listeners.onState('building');
    const step = () => {
      if (!job || job.k !== key()) { job = null; return; }   // level changed meanwhile
      if (D.sv.ee) { setTimeout(step, 200); return; }        // cutscene: d.u draws differently, wait
      const t0 = performance.now(), keep = D.sv.fF;
      D.sv.fF = g;
      try {
        while (job.done < blocks.length && performance.now() - t0 < 12) {
          const [bx, by] = blocks[job.done++];
          const x2 = Math.min(TW, bx + cols), y2 = Math.min(TH, by + rows);
          for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++) VM.callSync('d', 'u(II)V', [x, y]);
          for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++)
            o.drawImage(priv.canvas, (x % cols) * 24, (y % rows) * 24, 24, 24, x * S, y * S, S, S);
        }
      } catch (e) { console.warn('satellite build failed', e); job = null; D.sv.fF = keep; return; }
      D.sv.fF = keep;
      if (job.done < blocks.length) { setTimeout(step, 0); return; }
      world = out; worldKey = job.k; job = null; lastFrames = -1;
      if (D.sv.T === 10) D.sv.dc |= 255;                      // redraw the open map screen
      if (listeners.onState) listeners.onState('ready');
    };
    setTimeout(step, 0);
  }

  // ----- hooks -----
  const onMap = () => D && D.sv.T === 10;
  const mapActive = () => opts.map && onMap() && ready() && D.sv.fR > 0 && D.sv.fS > 0;
  const radarActive = () => opts.radar && D && D.sv.T === 7 && D.sv.cd && ready();

  function beforeStart() {
    D = VM.classes.get('d');
    VM.hookMethod('d', 'c(Ljavax/microedition/lcdui/Graphics;)V', (orig, g) => {
      if (opts.map && onMap() && !ready()) build();
      if (!mapActive()) return orig(g);
      const r = mapRect();
      MIDP.fillRectWith(g, r.x, r.y, r.w, r.h, MAP_KEY);
    });
    MIDP.state.afterBlit = afterBlit;
  }
  function mapRect() {
    const sv = D.sv;
    // in game coordinates; on a wide screen the map screen is drawn centred (Wide.dx)
    return { x: sv.ad, y: sv.ae, w: sv.fz * ((sv.fR * sv.ft) >> 8), h: sv.fA * ((sv.fS * sv.fu) >> 8) };
  }

  // ----- overlay -----
  function attach(wrap, screenCanvas, mapButton) {
    screen = screenCanvas; btn = mapButton;
    layer = document.createElement('canvas');
    layer.id = 'satLayer';
    wrap.insertBefore(layer, screenCanvas.nextSibling);
    lctx = layer.getContext('2d');
    tmp = document.createElement('canvas');
    tctx = tmp.getContext('2d', { willReadFrequently: true });
  }
  function fitLayer() {
    const w = Math.round(screen.clientWidth * devicePixelRatio), h = Math.round(screen.clientHeight * devicePixelRatio);
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; lastFrames = -1; }
  }
  // the game's pixels of a region, with the key colour transparent, drawn over the overlay
  function keyed(x, y, w, h, keyColor, kx, ky) {
    if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
    tctx.clearRect(0, 0, w, h);
    tctx.drawImage(screen, x, y, w, h, 0, 0, w, h);
    const id = tctx.getImageData(0, 0, w, h), d = id.data;
    const r = keyColor >> 16, gg = (keyColor >> 8) & 255, b = keyColor & 255;
    // near the key, not exactly it: some browsers (Brave's fingerprinting protection) add slight noise to
    // pixels read back from a canvas, and the pixels that missed showed as dark dots over the picture
    const T = 10;
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i] - r) <= T && Math.abs(d[i + 1] - gg) <= T && Math.abs(d[i + 2] - b) <= T) d[i + 3] = 0;
    tctx.putImageData(id, 0, 0);
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(tmp, 0, 0, w, h, x * kx, y * ky, w * kx, h * ky);
  }
  function afterBlit() {
    if (!layer) return;
    const map = mapActive(), radar = radarActive();
    if (btn) btn.hidden = !onMap();
    if (opts.radar && D && D.sv.T === 7 && !ready()) build();
    if (!map && !radar) { if (drawn) { lctx.clearRect(0, 0, layer.width, layer.height); drawn = false; } return; }
    const f = MIDP.state.frames || 0;
    if (f === lastFrames) return;                 // the game's picture only changes on real frames
    lastFrames = f;
    fitLayer();
    const kx = layer.width / MIDP.SW, ky = layer.height / MIDP.SH;
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
    if (map) {
      const r = mapRect(), x = r.x + Wide.dx;
      lctx.drawImage(world, x * kx, r.y * ky, r.w * kx, r.h * ky);
      keyed(x, r.y, r.w, r.h, MAP_KEY, kx, ky);
    } else {
      // radar: 17 px from the centre = d.fw (horizontal) / d.fx (vertical) world px, centred on the player
      const sv = D.sv, pl = sv.cd;
      const wx = pl['b.a'] >> 8, wy = pl['b.b'] >> 8;
      const rad = RADAR.d / 2, cx = (RADAR.x + rad) * kx, cy = (RADAR.y + rad) * ky;
      const hw = rad * sv.fw / 17 * S / 24, hh = rad * sv.fx / 17 * S / 24;
      lctx.save();
      lctx.beginPath(); lctx.ellipse(cx, cy, rad * kx, rad * ky, 0, 0, Math.PI * 2); lctx.clip();
      lctx.fillStyle = '#0b0909'; lctx.fillRect(cx - rad * kx, cy - rad * ky, 2 * rad * kx, 2 * rad * ky);
      lctx.drawImage(world, wx * S / 24 - hw, wy * S / 24 - hh, 2 * hw, 2 * hh, cx - rad * kx, cy - rad * ky, 2 * rad * kx, 2 * rad * ky);
      lctx.restore();
      keyed(RADAR.x - 1, RADAR.y - 1, RADAR.d + 2, RADAR.d + 2, RADAR_BG, kx, ky);
    }
    drawn = true;
  }
  function refresh() { lastFrames = -1; if (D && D.sv.T === 10) D.sv.dc |= 255; }

  return { beforeStart, attach, opts, refresh, listeners, get ready() { return !!(D && ready()); }, _build: build };
})();
