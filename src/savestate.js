// Save states: serialize the whole running game (Java heap reachable from the game's classes, the game
// thread's call stack, images, sound players) and rebuild it later, like a console emulator.
'use strict';

const SaveState = (() => {
  const USER = ['GloftGANG', 'a', 'b', 'c', 'd', 'com/alcatelonetouchx/CanvasPlus', 'com/alcatelonetouchx/JavaMagicGameCanvas'];
  const IMAGE = 'javax/microedition/lcdui/Image', GRAPHICS = 'javax/microedition/lcdui/Graphics', CLASS = 'java/lang/Class';
  const SKIP = new Set(['cls', 'canvas', 'ctx', 'run', 'jt', '__hash']);
  const FORMAT = 1;

  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  function gameThread() { return VM.threads.find((t) => t.name === 'java-thread' && !t.done); }

  function canSave() {
    if (!VM.running) return 'El juego no está corriendo';
    const t = gameThread();
    if (!t) return 'El juego todavía está arrancando';
    if (t.status !== 'yield') return 'Ocupado, probá de nuevo';
    if (t.frames.length !== 1 || t.frames[0].m.name !== 'run') return 'No se puede guardar en este momento';
    if (VM.events.length) return 'Ocupado, probá de nuevo';
    return null;
  }

  // ---------------- capture ----------------
  function capture() {
    const why = canSave();
    if (why) throw new Error(why);
    const ids = new Map(), entries = [];
    const enc = (v) => {
      if (v === null || v === undefined) return null;
      switch (typeof v) {
        case 'number': return Number.isFinite(v) ? v : { N: String(v) };
        case 'bigint': return { L: v.toString() };
        case 'boolean': return { B: v ? 1 : 0 };
        case 'string': return { S: v };
        case 'function': return null;
      }
      if (v instanceof D) return { D: Number.isFinite(v.v) ? v.v : String(v.v) };
      let id = ids.get(v);
      if (id !== undefined) return { r: id };
      id = entries.length; ids.set(v, id); entries.push(null);
      entries[id] = encObj(v);
      return { r: id };
    };
    const encObj = (v) => {
      if (v instanceof JStr) return { k: 's', s: v.s, i: VM.interned.get(v.s) === v ? 1 : 0 };
      if (ArrayBuffer.isView(v)) return { k: 't', c: v.constructor.name, jt: v.jt, b: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
      if (Array.isArray(v)) return { k: 'A', jt: v.jt, v: v.map(enc) };
      if (v instanceof JObj) {
        const name = v.cls.name;
        if (name === CLASS) return { k: 'cls', n: v.ref.name };
        const e = { k: 'o', c: name, p: {} };
        for (const key of Object.keys(v)) {
          if (SKIP.has(key)) continue;
          const val = v[key];
          if (key === 'g' && name === GRAPHICS) {
            const g = val;
            e.g = { img: enc(g.img), tx: g.tx, ty: g.ty, cx: g.cx, cy: g.cy, cw: g.cw, ch: g.ch, color: g.color, font: enc(g.font) };
            continue;
          }
          if (val !== null && typeof val === 'object' && !(val instanceof JObj) && !ArrayBuffer.isView(val) && !Array.isArray(val) && !(val instanceof D)) continue;
          e.p[key] = enc(val);
        }
        if (name === IMAGE) e.png = v.canvas.toDataURL('image/png');
        return e;
      }
      return null; // unknown JS object: not part of the game state
    };

    const statics = {};
    for (const n of USER) {
      const c = VM.classes.get(n);
      if (!c) continue;
      statics[n] = { state: c.state, sv: Object.fromEntries(Object.entries(c.sv).map(([k, v]) => [k, enc(v)])) };
    }
    const t = gameThread(), f = t.frames[0];
    const thread = { cls: f.m.cls.name, key: f.m.key, pc: f.pc, ipc: f.ipc, stack: f.stack.map(enc), locals: f.locals.map(enc) };
    const st = MIDP.state;
    const roots = { current: enc(st.current), display: enc(st.display), midlet: enc(st.midlet) };
    return { format: FORMAT, game: 'gangstar', entries, statics, thread, roots };
  }

  // ---------------- restore ----------------
  async function restore(data) {
    if (!data || data.format !== FORMAT || data.game !== 'gangstar') throw new Error('Formato de guardado desconocido');
    // 1. decode all images first (async), so the swap below happens in one go
    const bitmaps = new Map();
    await Promise.all(data.entries.map(async (e, id) => {
      if (!e || e.k !== 'o' || !e.png) return;
      const img = new Image(); img.src = e.png;
      await img.decode();
      bitmaps.set(id, img);
    }));

    // 2. build objects
    const objs = new Array(data.entries.length);
    const dec = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if ('r' in v) return objs[v.r];
      if ('L' in v) return BigInt(v.L);
      if ('D' in v) return new D(typeof v.D === 'number' ? v.D : Number(v.D));
      if ('S' in v) return v.S;
      if ('B' in v) return !!v.B;
      if ('N' in v) return Number(v.N);
      return null;
    };
    data.entries.forEach((e, id) => {
      if (!e) return;
      switch (e.k) {
        case 's': objs[id] = e.i ? VM.intern(e.s) : new JStr(e.s); break;
        case 't': {
          const bytes = unb64(e.b), Ctor = globalThis[e.c];
          const a = new Ctor(bytes.buffer, 0, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
          if (e.jt !== undefined) a.jt = e.jt;
          objs[id] = a; break;
        }
        case 'A': { const a = new Array(e.v.length); if (e.jt !== undefined) a.jt = e.jt; objs[id] = a; break; }
        case 'cls': objs[id] = VM.classObject(VM.loadClass(e.n)); break;
        case 'o': {
          const c = VM.loadClass(e.c);
          const o = c === VM.StringClass ? new JStr('') : new JObj(c);
          objs[id] = o;
          break;
        }
      }
    });
    const newObjs = [];
    data.entries.forEach((e, id) => {
      if (!e) return;
      const o = objs[id];
      if (e.k === 'A') { for (let i = 0; i < e.v.length; i++) o[i] = dec(e.v[i]); return; }
      if (e.k !== 'o') return;
      for (const k in e.p) o[k] = dec(e.p[k]);
      if (e.png !== undefined) {
        const cv = document.createElement('canvas'); cv.width = Math.max(1, o.w); cv.height = Math.max(1, o.h);
        const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmaps.get(id), 0, 0);
        ctx.save(); ctx.__clip = null; ctx.__fill = null;
        o.canvas = cv; o.ctx = ctx;
      }
      newObjs.push(o);
    });
    // graphics need their image's context
    data.entries.forEach((e, id) => {
      if (!e || !e.g) return;
      const g = e.g, img = dec(g.img), col = g.color & 0xffffff;
      objs[id].g = { img, ctx: img.ctx, tx: g.tx, ty: g.ty, cx: g.cx, cy: g.cy, cw: g.cw, ch: g.ch, color: col,
        css: '#' + col.toString(16).padStart(6, '0'), font: dec(g.font) };
    });

    // 3. swap the world (synchronous from here on)
    SoundEngine.stopAll();
    VM.events.length = 0;
    for (const n in data.statics) {
      const c = VM.loadClass(n), s = data.statics[n];
      for (const k in s.sv) c.sv[k] = dec(s.sv[k]);
      c.state = 2;
    }
    const st = MIDP.state;
    st.current = dec(data.roots.current) || st.current;
    if (data.roots.display) st.display = dec(data.roots.display);
    if (data.roots.midlet) st.midlet = dec(data.roots.midlet);
    st.backImage = st.current && st.current.back;
    const th = data.thread;
    const m = VM.findMethod(VM.loadClass(th.cls), th.key);
    const t = { frames: [], sleepUntil: 0, done: false, name: 'java-thread', status: 'yield' };
    const f = VM.pushFrame(t, m, []);
    f.pc = th.pc; f.ipc = th.ipc;
    f.locals = th.locals.map(dec); while (f.locals.length < Math.max(m.maxLocals, 1)) f.locals.push(undefined);
    f.stack = th.stack.map(dec);
    VM.threads = VM.threads.filter((x) => x.name !== 'java-thread');
    VM.threads.push(t);
    Gangstar.adopt(newObjs);
    for (const o of newObjs) if (o.cls.name === 'j2meweb/PlayerImpl' && o.state === 400) {
      if (o.loops === -1) SoundEngine.start(o); else o.state = 300;
    }
    if (st.backImage) MIDP.present(st.backImage);
  }

  // ---------------- packing (gzip JSON) ----------------
  async function pack(data) {
    const json = new TextEncoder().encode(JSON.stringify(data));
    if (typeof CompressionStream === 'undefined') return new Blob([json], { type: 'application/json' });
    return await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  async function unpack(blob) {
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x1f && head[1] === 0x8b) text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    else text = await blob.text();
    return JSON.parse(text);
  }

  // ---------------- slots in IndexedDB ----------------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('gangstar-states', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('slots');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('slots', mode), s = tx.objectStore('slots');
      const r = fn(s);
      tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error);
    });
  }
  function thumbnail() {
    const c = document.createElement('canvas'); c.width = 120; c.height = 160;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true;
    x.drawImage(document.getElementById('screen'), 0, 0, 120, 160);
    return c.toDataURL('image/jpeg', 0.7);
  }
  async function saveSlot(slot, lang) {
    const data = capture();
    const blob = await pack(data);
    const rec = { slot, date: Date.now(), thumb: thumbnail(), blob, lang, size: blob.size };
    await idb('readwrite', (s) => s.put(rec, slot));
    return rec;
  }
  async function loadSlot(slot) {
    const rec = await idb('readonly', (s) => s.get(slot));
    if (!rec) throw new Error('Ranura vacía');
    await restore(await unpack(rec.blob));
    return rec;
  }
  async function listSlots() {
    const all = await idb('readonly', (s) => s.getAll());
    const keys = await idb('readonly', (s) => s.getAllKeys());
    const out = {}; (keys || []).forEach((k, i) => { const r = all[i]; out[k] = { date: r.date, thumb: r.thumb, size: r.size, lang: r.lang }; });
    return out;
  }
  async function deleteSlot(slot) { await idb('readwrite', (s) => s.delete(slot)); }
  async function exportSlot(slot) {
    const rec = await idb('readonly', (s) => s.get(slot));
    if (!rec) throw new Error('Ranura vacía');
    return rec.blob;
  }
  async function importToSlot(slot, blob, lang) {
    const data = await unpack(blob);
    if (!data || data.format !== FORMAT || data.game !== 'gangstar') throw new Error('Ese archivo no es un guardado de Gangstar');
    await restore(data);
    const rec = { slot, date: Date.now(), thumb: thumbnail(), blob: await pack(data), lang, size: blob.size };
    await idb('readwrite', (s) => s.put(rec, slot));
  }

  return { canSave, capture, restore, pack, unpack, saveSlot, loadSlot, listSlots, deleteSlot, exportSlot, importToSlot };
})();
