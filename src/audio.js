// Sound for MMAPI players: a small General-MIDI-ish synthesizer + WAV playback via Web Audio.
'use strict';

const SoundEngine = (() => {
  let ctx = null, master = null, noiseBuf = null, enabled = true, unlocked = false;
  const midiCache = new WeakMap(), wavCache = new WeakMap();
  const active = new Set();

  function u8(a) { return new Uint8Array(a.buffer, a.byteOffset, a.length); }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.6 : 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // ---------- MIDI parsing ----------
  function parseMidi(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(0) !== 0x4d546864) return null;
    const ntr = dv.getUint16(10), div = dv.getUint16(12);
    let p = 8 + dv.getUint32(4);
    const events = [];
    for (let tr = 0; tr < ntr && p < b.length; tr++) {
      if (dv.getUint32(p) !== 0x4d54726b) break;
      const len = dv.getUint32(p + 4); let q = p + 8; const end = q + len; p = end;
      let tick = 0, rs = 0, order = 0;
      const vlq = () => { let v = 0, c; do { c = b[q++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && q < end); return v; };
      while (q < end) {
        tick += vlq();
        let st = b[q];
        if (st & 0x80) q++; else st = rs;
        if (st === 0xff) {
          const type = b[q++], l = vlq();
          if (type === 0x51) events.push({ tick, o: order++, k: 'tempo', v: (b[q] << 16) | (b[q + 1] << 8) | b[q + 2] });
          if (type === 0x2f) { q += l; break; }
          q += l;
        } else if (st === 0xf0 || st === 0xf7) { q += vlq(); }
        else {
          rs = st;
          const hi = st & 0xf0, ch = st & 15;
          const a = b[q++], c2 = (hi === 0xc0 || hi === 0xd0) ? 0 : b[q++];
          if (hi === 0x90 && c2 > 0) events.push({ tick, o: order++, k: 'on', ch, n: a, v: c2 });
          else if (hi === 0x80 || (hi === 0x90 && c2 === 0)) events.push({ tick, o: order++, k: 'off', ch, n: a });
          else if (hi === 0xc0) events.push({ tick, o: order++, k: 'prog', ch, v: a });
          else if (hi === 0xb0 && (a === 7 || a === 11)) events.push({ tick, o: order++, k: 'vol', ch, c: a, v: c2 });
        }
      }
    }
    events.sort((x, y) => x.tick - y.tick || (x.k === 'off' ? -1 : 0) - (y.k === 'off' ? -1 : 0) || x.o - y.o);
    let tempo = 500000, lastTick = 0, time = 0;
    const tpq = div & 0x8000 ? 96 : div;
    const prog = new Array(16).fill(0), vol = new Array(16).fill(100), expr = new Array(16).fill(127);
    const open = new Map(), notes = [];
    for (const e of events) {
      time += ((e.tick - lastTick) * tempo) / tpq / 1e6; lastTick = e.tick;
      if (e.k === 'tempo') tempo = e.v;
      else if (e.k === 'prog') prog[e.ch] = e.v;
      else if (e.k === 'vol') { if (e.c === 7) vol[e.ch] = e.v; else expr[e.ch] = e.v; }
      else if (e.k === 'on') {
        const key = e.ch * 128 + e.n;
        if (open.has(key)) { const nn = open.get(key); nn.d = time - nn.t; }
        const nn = { t: time, d: 0.3, ch: e.ch, n: e.n, v: (e.v / 127) * (vol[e.ch] / 127) * (expr[e.ch] / 127), p: prog[e.ch] };
        open.set(key, nn); notes.push(nn);
      } else if (e.k === 'off') {
        const key = e.ch * 128 + e.n; const nn = open.get(key);
        if (nn) { nn.d = Math.max(0.02, time - nn.t); open.delete(key); }
      }
    }
    for (const nn of open.values()) nn.d = Math.max(0.05, time - nn.t);
    return { notes, length: Math.max(time, ...notes.map((n) => n.t + n.d), 0.1) };
  }

  function instrument(p) {
    // returns [waveform, decay?, cutoff]
    if (p < 8) return ['triangle', 1.2, 0];
    if (p < 16) return ['sine', 0.6, 0];
    if (p < 24) return ['square', 0, 2500];
    if (p < 32) return ['sawtooth', 1.0, 2200];
    if (p < 40) return ['triangle', 0, 0];
    if (p < 56) return ['sawtooth', 0, 1800];
    if (p < 64) return ['sawtooth', 0, 2600];
    if (p < 80) return ['square', 0, 3000];
    if (p < 88) return ['square', 0, 4000];
    if (p < 96) return ['triangle', 0, 0];
    return ['square', 0.5, 2500];
  }

  function scheduleNote(nn, t0, out, list) {
    const t = t0 + nn.t, dur = Math.max(0.03, nn.d);
    if (nn.ch === 9) return drum(nn, t, out, list);
    const [wave, decay, cutoff] = instrument(nn.p);
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = 440 * Math.pow(2, (nn.n - 69) / 12);
    const g = ctx.createGain();
    const peak = 0.16 * nn.v * (wave === 'square' || wave === 'sawtooth' ? 0.55 : 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    if (decay) g.gain.setTargetAtTime(0, t + 0.01, decay / 3);
    g.gain.setValueAtTime(decay ? peak * Math.exp(-3 * dur / decay) : peak, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    let node = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
    node.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.08);
    list.push(o);
  }
  function drum(nn, t, out, list) {
    const n = nn.n, g = ctx.createGain();
    if (n === 35 || n === 36) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5 * nn.v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); list.push(o); return;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    let len = 0.12, lvl = 0.25;
    if (n === 42 || n === 44 || n === 46 || n === 51 || n === 59) { f.type = 'highpass'; f.frequency.value = 7000; len = n === 46 ? 0.25 : 0.05; lvl = 0.12; }
    else if (n === 38 || n === 40 || n === 39) { f.type = 'bandpass'; f.frequency.value = 1800; len = 0.15; lvl = 0.35; }
    else if (n === 49 || n === 57 || n === 52 || n === 55) { f.type = 'highpass'; f.frequency.value = 5000; len = 0.6; lvl = 0.12; }
    else { f.type = 'bandpass'; f.frequency.value = 400 + (n - 40) * 40; len = 0.15; lvl = 0.25; }
    g.gain.setValueAtTime(lvl * nn.v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02); list.push(s);
  }

  function isMidi(p) { return /mid/i.test(p.type) || (p.data[0] === 0x4d && p.data[1] === 0x54); }

  function prepare(p) {
    if (!p.data) return;
    if (isMidi(p)) { if (!midiCache.has(p.data)) midiCache.set(p.data, parseMidi(u8(p.data))); }
    else if (ctx && !wavCache.has(p.data)) {
      const copy = u8(p.data).slice().buffer;
      wavCache.set(p.data, new Promise((res) => ctx.decodeAudioData(copy, res, () => res(null))));
    }
  }

  function playOnce(p) {
    const run = p.run;
    if (!run || !ctx) return;
    const out = run.gain;
    if (isMidi(p)) {
      const song = midiCache.get(p.data);
      if (!song) return;
      const t0 = ctx.currentTime + 0.03;
      run.nodes = [];
      for (const nn of song.notes) scheduleNote(nn, t0, out, run.nodes);
      run.timer = setTimeout(() => ended(p, run), song.length * 1000 + 30);
    } else {
      wavCache.get(p.data).then((buf) => {
        if (p.run !== run || !buf) { if (p.run === run) ended(p, run); return; }
        const s = ctx.createBufferSource(); s.buffer = buf; s.connect(out);
        s.onended = () => { if (p.run === run) ended(p, run); };
        run.nodes = [s]; s.start();
      });
    }
  }
  function ended(p, run) {
    if (p.run !== run) return;
    run.count++;
    if (p.loops === -1 || run.count < p.loops) { playOnce(p); return; }
    stop(p);
    if (p.state === 400) p.state = 300;
  }

  function start(p) {
    stop(p);
    if (!ensureCtx()) return;
    prepare(p);
    const gain = ctx.createGain();
    gain.connect(master);
    p.run = { gain, nodes: [], count: 0, timer: 0 };
    active.add(p);
    volume(p);
    if (!unlocked) { p.run.waiting = true; return; }
    playOnce(p);
  }
  function stop(p) {
    const run = p.run;
    if (!run) return;
    p.run = null;
    active.delete(p);
    clearTimeout(run.timer);
    for (const n of run.nodes) { try { n.stop(); } catch (e) {} }
    try { run.gain.disconnect(); } catch (e) {}
  }
  function volume(p) {
    if (p.run) p.run.gain.gain.value = p.muted ? 0 : (p.volume / 100) * (isMidi(p) ? 1 : 0.8);
  }

  return {
    prepare, start, stop, volume,
    stopAll() { for (const p of Array.from(active)) { stop(p); if (p.state === 400) p.state = 300; } },
    unlock() {
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (unlocked) return;
      unlocked = true;
      for (const p of active) if (p.run && p.run.waiting) { p.run.waiting = false; if (p.loops === -1 || p.loops > 1) playOnce(p); }
      // also decode any WAVs prepared before the context existed
    },
    setEnabled(on) { enabled = on; if (master) master.gain.value = on ? 0.6 : 0; },
    isEnabled: () => enabled,
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && unlocked) ctx.resume(); },
  };
})();
