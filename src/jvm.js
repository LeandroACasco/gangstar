// Tiny JVM (CLDC subset) interpreter in JavaScript.
// Values: int/float -> JS number, long -> BigInt, double -> D wrapper, refs -> JObj / JStr / arrays (typed arrays tagged with .jt)
'use strict';

class D { constructor(v) { this.v = v; } }
const D0 = new D(0);
class JObj { constructor(cls) { this.cls = cls; } }
class JStr extends JObj { constructor(s) { super(VM.StringClass); this.s = s; } }
class JavaThrow { constructor(obj) { this.obj = obj; } }
const YIELD = { yield: true }, PUSHED = { pushed: true };

const ACC_STATIC = 0x0008, ACC_ABSTRACT = 0x0400, ACC_INTERFACE = 0x0200;

function mutf8(b) {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if ((c & 0xE0) === 0xC0) s += String.fromCharCode(((c & 0x1F) << 6) | (b[i++] & 0x3F));
    else { const c2 = b[i++], c3 = b[i++]; s += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F)); }
  }
  return s;
}

function parseClass(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  const u1 = () => bytes[p++], u2 = () => { const v = dv.getUint16(p); p += 2; return v; }, u4 = () => { const v = dv.getUint32(p); p += 4; return v; };
  if (dv.getUint32(0) !== 0xCAFEBABE) throw new Error('bad class');
  const n = u2(), cp = new Array(n);
  for (let i = 1; i < n; i++) {
    const tag = u1();
    switch (tag) {
      case 1: { const l = u2(); cp[i] = { tag, s: mutf8(bytes.subarray(p, p + l)) }; p += l; break; }
      case 3: cp[i] = { tag, v: dv.getInt32(p) }; p += 4; break;
      case 4: cp[i] = { tag, v: dv.getFloat32(p) }; p += 4; break;
      case 5: cp[i] = { tag, v: dv.getBigInt64(p) }; p += 8; i++; break;
      case 6: cp[i] = { tag, v: new D(dv.getFloat64(p)) }; p += 8; i++; break;
      case 7: cp[i] = { tag, ni: u2() }; break;
      case 8: cp[i] = { tag, si: u2() }; break;
      case 9: case 10: case 11: cp[i] = { tag, ci: u2(), nti: u2() }; break;
      case 12: cp[i] = { tag, ni: u2(), di: u2() }; break;
      default: throw new Error('cp tag ' + tag);
    }
  }
  const utf = (i) => cp[i].s;
  const access = u2(), thisName = utf(cp[u2()].ni), si = u2(), superName = si ? utf(cp[si].ni) : null;
  const ifaces = []; for (let k = u2(); k > 0; k--) ifaces.push(utf(cp[u2()].ni));
  const readAttrs = () => { const a = {}; for (let k = u2(); k > 0; k--) { const nm = utf(u2()), l = u4(); a[nm] = bytes.subarray(p, p + l); p += l; } return a; };
  const fields = [];
  for (let k = u2(); k > 0; k--) {
    const acc = u2(), name = utf(u2()), desc = utf(u2()), at = readAttrs();
    let cv;
    if (at.ConstantValue) { const e = cp[(at.ConstantValue[0] << 8) | at.ConstantValue[1]]; cv = e.tag === 8 ? { str: utf(e.si) } : e.v; }
    fields.push({ acc, name, desc, cv });
  }
  const methods = [];
  for (let k = u2(); k > 0; k--) {
    const acc = u2(), name = utf(u2()), desc = utf(u2()), at = readAttrs();
    const m = { acc, name, desc };
    if (at.Code) {
      const c = at.Code, cdv = new DataView(c.buffer, c.byteOffset, c.byteLength);
      m.maxLocals = cdv.getUint16(2);
      const cl = cdv.getUint32(4);
      m.code = c.slice(8, 8 + cl);
      let q = 8 + cl; const en = cdv.getUint16(q); q += 2;
      m.exc = [];
      for (let e = 0; e < en; e++, q += 8) {
        const ct = cdv.getUint16(q + 6);
        m.exc.push({ s: cdv.getUint16(q), e: cdv.getUint16(q + 2), h: cdv.getUint16(q + 4), t: ct ? utf(cp[ct].ni) : null });
      }
    }
    methods.push(m);
  }
  return { access, thisName, superName, ifaces, fields, methods, cp };
}

function parseDesc(desc) {
  const args = []; let i = 1;
  while (desc[i] !== ')') {
    const s = i;
    while (desc[i] === '[') i++;
    if (desc[i] === 'L') i = desc.indexOf(';', i);
    i++;
    args.push(desc.substring(s, i));
  }
  return { args, ret: desc.substring(i + 1) };
}
const defaultFor = (d) => d === 'J' ? 0n : d === 'D' ? D0 : (d[0] === 'L' || d[0] === '[') ? null : 0;

class JClass {
  constructor(name) {
    this.name = name; this.sup = null; this.ifaces = []; this.methods = new Map(); this.vcache = new Map();
    this.sv = {}; this.staticNames = new Set(); this.instFields = []; this.state = 0; this.cp = null; this.rc = null;
    this.isInterface = false; this.isNative = false; this.allFields = null;
  }
  instanceFields() {
    if (this.allFields) return this.allFields;
    const a = this.sup ? this.sup.instanceFields().slice() : [];
    for (const f of this.instFields) a.push(f);
    return (this.allFields = a);
  }
}

const VM = {
  K: [],
  classes: new Map(), natives: {}, files: {}, threads: [], events: [], interned: new Map(), manifest: {},
  StringClass: null, current: null, log: (...a) => console.log('[java]', ...a), errors: [],

  defineNative(name, spec) { this.natives[name] = spec; },

  intern(s) { let o = this.interned.get(s); if (!o) { o = new JStr(s); this.interned.set(s, o); } return o; },
  str(s) { return s === null || s === undefined ? null : new JStr(String(s)); },

  loadClass(name) {
    let c = this.classes.get(name);
    if (c) return c;
    c = new JClass(name);
    this.classes.set(name, c);
    const file = this.files[name + '.class'];
    if (file && !this.natives[name]) {
      const cf = parseClass(file);
      c.cp = cf.cp; c.rc = new Array(cf.cp.length); c.isInterface = !!(cf.access & ACC_INTERFACE);
      c.sup = cf.superName ? this.loadClass(cf.superName) : null;
      c.ifaces = cf.ifaces.map((n) => this.loadClass(n));
      for (const f of cf.fields) {
        if (f.acc & ACC_STATIC) {
          c.staticNames.add(f.name);
          c.sv[f.name] = f.cv !== undefined ? (f.cv && f.cv.str !== undefined ? this.intern(f.cv.str) : f.cv) : defaultFor(f.desc);
        } else c.instFields.push([name + '.' + f.name, defaultFor(f.desc), f.name]);
      }
      for (const m of cf.methods) this.addMethod(c, m);
    } else {
      const spec = this.natives[name];
      c.isNative = true;
      if (!spec) {
        console.warn('Missing class ' + name + ', stubbing');
        c.sup = name === 'java/lang/Object' ? null : this.loadClass('java/lang/Object');
      } else {
        c.isInterface = !!spec.iface;
        c.sup = spec.sup === null || name === 'java/lang/Object' ? null : this.loadClass(spec.sup || 'java/lang/Object');
        c.ifaces = (spec.ifaces || []).map((n) => this.loadClass(n));
        for (const k in spec.m || {}) {
          const i = k.indexOf('(');
          const nm = k.substring(0, i), desc = k.substring(i);
          const isStatic = nm[0] === '$';
          this.addMethod(c, { name: isStatic ? nm.substring(1) : nm, desc, acc: isStatic ? ACC_STATIC : 0, fn: spec.m[k] });
        }
        for (const k in spec.statics || {}) { c.staticNames.add(k); c.sv[k] = null; }
        c.spec = spec;
      }
    }
    return c;
  },

  addMethod(c, m) {
    const pd = parseDesc(m.desc);
    const isStatic = !!(m.acc & ACC_STATIC);
    const cats = isStatic ? [] : [1];
    for (const a of pd.args) cats.push(a === 'J' || a === 'D' ? 2 : 1);
    const mm = {
      cls: c, name: m.name, desc: m.desc, key: m.name + m.desc, isStatic, abstract: !!(m.acc & ACC_ABSTRACT) && !m.fn,
      fn: m.fn || null, code: m.code || null, maxLocals: m.maxLocals || 0, exc: m.exc || [], cats, nargs: cats.length,
      retVoid: pd.ret === 'V', ret: pd.ret,
    };
    if (!mm.fn && !mm.code && !mm.abstract) mm.abstract = true;
    c.methods.set(mm.key, mm);
  },

  findMethod(c, key) {
    for (let k = c; k; k = k.sup) { const m = k.methods.get(key); if (m && !m.abstract) return m; }
    // search interfaces (for abstract declarations)
    return null;
  },
  findVirtual(c, key) {
    let m = c.vcache.get(key);
    if (m === undefined) { m = this.findMethod(c, key); c.vcache.set(key, m); }
    return m;
  },

  classOf(o) {
    if (o instanceof JObj) return o.cls;
    return this.loadClass('java/lang/Object');
  },

  isSubclass(c, target) {
    if (c === target) return true;
    for (const i of c.ifaces) if (this.isSubclass(i, target)) return true;
    return c.sup ? this.isSubclass(c.sup, target) : false;
  },
  instanceOf(o, name) {
    if (o === null || o === undefined) return false;
    if (name === 'java/lang/Object') return true;
    if (o instanceof JObj) { if (name[0] === '[') return false; return this.isSubclass(o.cls, this.loadClass(name)); }
    if (o.jt !== undefined) {
      if (name[0] !== '[') return false;
      if (o.jt === name) return true;
      return name.length > 2 && name[1] === 'L' && o.jt[1] === 'L' || (name[1] === '[' && o.jt[1] === '[');
    }
    return false;
  },

  newObject(c) {
    const o = c === this.StringClass ? new JStr('') : new JObj(c);
    if (c.onNew) c.onNew(o);
    const fs = c.instanceFields();
    for (let i = 0; i < fs.length; i++) o[fs[i][0]] = fs[i][1];
    if (c.isNative || this.nativeBase(c)) {
      for (let k = c; k; k = k.sup) if (k.spec && k.spec.alloc) { k.spec.alloc(o); }
    }
    return o;
  },
  nativeBase(c) { for (let k = c; k; k = k.sup) if (k.isNative && k.name !== 'java/lang/Object') return k; return null; },

  throwNew(name, msg) {
    const c = this.loadClass(name);
    const o = this.newObject(c);
    o.msg = msg === undefined ? null : msg;
    throw new JavaThrow(o);
  },

  newArray(type, n) {
    if (n < 0) this.throwNew('java/lang/NegativeArraySizeException');
    let a;
    switch (type) {
      case 'Z': case 'B': a = new Int8Array(n); break;
      case 'C': a = new Uint16Array(n); break;
      case 'S': a = new Int16Array(n); break;
      case 'I': a = new Int32Array(n); break;
      case 'F': a = new Float32Array(n); break;
      case 'J': a = new BigInt64Array(n); break;
      case 'D': a = new Array(n).fill(D0); break;
      default: a = new Array(n).fill(null);
    }
    a.jt = '[' + type;
    return a;
  },
  multiArray(desc, dims, di) {
    const et = desc.substring(1);
    const a = this.newArray(et, dims[di]);
    if (di + 1 < dims.length) for (let i = 0; i < a.length; i++) a[i] = this.multiArray(et, dims, di + 1);
    return a;
  },

  // ---------- constant pool resolution ----------
  cpClassName(c, idx) { return c.cp[c.cp[idx].ni].s; },
  resolveRef(c, idx) {
    let r = c.rc[idx];
    if (r) return r;
    const e = c.cp[idx], nt = c.cp[e.nti];
    const owner = this.cpClassName(c, e.ci), name = c.cp[nt.ni].s, desc = c.cp[nt.di].s;
    r = { owner, name, desc, key: name + desc };
    if (e.tag === 9) { r.ftype = desc; }
    else { const pd = parseDesc(desc); r.nargs = pd.args.length; r.retVoid = pd.ret === 'V'; r.retBool = pd.ret === 'Z'; }
    c.rc[idx] = r;
    return r;
  },
  fieldDecl(owner, name) {
    for (let k = this.loadClass(owner); k; k = k.sup) {
      if (k.staticNames.has(name)) return k;
      for (const i of k.ifaces) { const d = this.ifaceStatic(i, name); if (d) return d; }
    }
    return null;
  },
  ifaceStatic(c, name) { if (c.staticNames.has(name)) return c; for (const i of c.ifaces) { const d = this.ifaceStatic(i, name); if (d) return d; } return null; },
  instFieldKey(owner, name) {
    for (let k = this.loadClass(owner); k; k = k.sup) for (const f of k.instFields) if (f[2] === name) return f[0];
    return owner + '.' + name;
  },

  // returns true if class ready; otherwise pushes <clinit> frames onto thread
  ensureInit(t, c) {
    if (c.state !== 0) return true;
    const chain = [];
    for (let k = c; k && k.state === 0; k = k.sup) chain.push(k);
    let pushed = false;
    for (const k of chain) {
      k.state = 1;
      if (k.spec && k.spec.clinit) { k.spec.clinit(k); k.state = 2; continue; }
      const m = k.methods.get('<clinit>()V');
      if (m && m.code) { this.pushFrame(t, m, []); pushed = true; }
      else k.state = 2;
    }
    // frames pushed in order sub..super => super runs first (top of stack). Good.
    return !pushed;
  },

  pushFrame(t, m, args) {
    const locals = new Array(Math.max(m.maxLocals, 1));
    let s = 0;
    for (let i = 0; i < args.length; i++) { locals[s] = args[i]; s += m.cats[i]; }
    const f = { m, code: m.code, pc: 0, ipc: 0, stack: [], locals };
    t.frames.push(f);
    return f;
  },

  // call a java method (virtual dispatch on name+desc) in a fresh thread
  spawn(name, obj, key, args, cls) {
    const c = cls || this.classOf(obj);
    const m = this.findVirtual(c, key);
    if (!m) return null;
    const t = { frames: [], sleepUntil: 0, done: false, name };
    if (m.fn) { try { m.fn(t, obj, ...args); } catch (e) { this.uncaught(t, e); } return null; }
    this.pushFrame(t, m, obj === null ? args : [obj, ...args]);
    return t;
  },

  // run a method to completion right now (used for render-only frames)
  callSync(clsName, key, args, budget = 2e7) {
    const c = this.loadClass(clsName);
    const m = this.findMethod(c, key);
    const t = { frames: [], sleepUntil: 0, done: false, name: 'sync' };
    this.pushFrame(t, m, args);
    const s = this.run(t, budget);
    if (s !== 'done') throw new Error('callSync did not finish: ' + s);
    return t.result;
  },

  invokeSync(m, args, budget = 2e7) {
    const t = { frames: [], sleepUntil: 0, done: false, name: 'sync' };
    this.pushFrame(t, m, args);
    const s = this.run(t, budget);
    if (s !== 'done') throw new Error('invokeSync did not finish: ' + s);
    return t.result;
  },
  // replace a bytecode method with a JS wrapper; wrapper(callOriginal, ...args)
  hookMethod(clsName, key, wrapper) {
    const c = this.loadClass(clsName), m = c.methods.get(key);
    if (!m) throw new Error('hook: no method ' + clsName + '.' + key);
    const orig = Object.assign({}, m, { fn: null });
    const callOrig = (...a) => this.invokeSync(orig, a);
    m.fn = (t, ...a) => wrapper(callOrig, ...a);
    for (const k of this.classes.values()) k.vcache.clear();
    return orig;
  },

  uncaught(t, e) {
    let msg;
    if (e instanceof JavaThrow) msg = 'Uncaught Java exception ' + e.obj.cls.name + (e.obj.msg ? ': ' + e.obj.msg : '');
    else msg = 'Internal error: ' + (e && e.stack || e);
    console.error(msg, t.trace || '');
    this.errors.push(msg);
  },

  toThrowable(e, f) {
    if (e instanceof JavaThrow) return e.obj;
    if (e instanceof TypeError) {
      const o = this.newObject(this.loadClass('java/lang/NullPointerException'));
      o.msg = String(e.message); o.jsErr = e;
      return o;
    }
    throw e;
  },

  stackTrace(t) {
    return t.frames.map((f) => f.m.cls.name + '.' + f.m.name + ' pc=' + f.ipc).reverse().join('\n  ');
  },

  // ---------- interpreter ----------
  run(t, budget) {
    this.epoch = (this.epoch || 0) + 1; // anything that runs Java code may change game state
    const prev = this.curThread;
    this.curThread = t;
    try { return this.run0(t, budget); } finally { this.curThread = prev; }
  },
  run0(t, budget) {
    const frames = t.frames;
    outer: for (;;) {
      if (frames.length === 0) { t.done = true; return 'done'; }
      const f = frames[frames.length - 1];
      const code = f.code, st = f.stack, lo = f.locals, cls = f.m.cls, cp = cls.cp;
      let pc = f.pc, opc = pc;
      try {
        for (;;) {
          if (--budget < 0) { f.pc = pc; return 'budget'; }
          opc = pc;
          const op = code[pc++];
          switch (op) {
            case 0x00: break;
            case 0x01: st.push(null); break;
            case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08: st.push(op - 3); break;
            case 0x09: case 0x0a: st.push(BigInt(op - 9)); break;
            case 0x0b: case 0x0c: case 0x0d: st.push(op - 0x0b); break;
            case 0x0e: case 0x0f: st.push(new D(op - 0x0e)); break;
            case 0x10: st.push((code[pc++] << 24) >> 24); break;
            case 0x11: st.push((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); pc += 2; break;
            case 0xcb: st.push(this.K[code[pc++]]); break; // port-specific: push a patched constant (see Gangstar)
            case 0x12: case 0x13: case 0x14: {
              let idx; if (op === 0x12) idx = code[pc++]; else { idx = (code[pc] << 8) | code[pc + 1]; pc += 2; }
              const e = cp[idx];
              if (e.tag === 8) st.push(this.intern(cp[e.si].s));
              else if (e.tag === 7) st.push(this.classObject(this.loadClass(cp[e.ni].s)));
              else st.push(e.v);
              break;
            }
            // loads
            case 0x15: case 0x16: case 0x17: case 0x18: case 0x19: st.push(lo[code[pc++]]); break;
            case 0x1a: case 0x1b: case 0x1c: case 0x1d: st.push(lo[op - 0x1a]); break;
            case 0x1e: case 0x1f: case 0x20: case 0x21: st.push(lo[op - 0x1e]); break;
            case 0x22: case 0x23: case 0x24: case 0x25: st.push(lo[op - 0x22]); break;
            case 0x26: case 0x27: case 0x28: case 0x29: st.push(lo[op - 0x26]); break;
            case 0x2a: case 0x2b: case 0x2c: case 0x2d: st.push(lo[op - 0x2a]); break;
            // array loads
            case 0x2e: case 0x2f: case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: {
              const i = st.pop(), a = st.pop();
              if (a === null) this.throwNew('java/lang/NullPointerException');
              if (i < 0 || i >= a.length) this.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
              st.push(a[i]); break;
            }
            // stores
            case 0x36: case 0x37: case 0x38: case 0x39: case 0x3a: lo[code[pc++]] = st.pop(); break;
            case 0x3b: case 0x3c: case 0x3d: case 0x3e: lo[op - 0x3b] = st.pop(); break;
            case 0x3f: case 0x40: case 0x41: case 0x42: lo[op - 0x3f] = st.pop(); break;
            case 0x43: case 0x44: case 0x45: case 0x46: lo[op - 0x43] = st.pop(); break;
            case 0x47: case 0x48: case 0x49: case 0x4a: lo[op - 0x47] = st.pop(); break;
            case 0x4b: case 0x4c: case 0x4d: case 0x4e: lo[op - 0x4b] = st.pop(); break;
            // array stores
            case 0x4f: case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: {
              const v = st.pop(), i = st.pop(), a = st.pop();
              if (a === null) this.throwNew('java/lang/NullPointerException');
              if (i < 0 || i >= a.length) this.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
              a[i] = v; break;
            }
            // stack ops
            case 0x57: st.pop(); break;
            case 0x58: { const v = st.pop(); if (!this.cat2(v)) st.pop(); break; }
            case 0x59: st.push(st[st.length - 1]); break;
            case 0x5a: { const v1 = st.pop(), v2 = st.pop(); st.push(v1, v2, v1); break; }
            case 0x5b: { const v1 = st.pop(), v2 = st.pop();
              if (this.cat2(v2)) st.push(v1, v2, v1); else { const v3 = st.pop(); st.push(v1, v3, v2, v1); } break; }
            case 0x5c: { const v1 = st[st.length - 1];
              if (this.cat2(v1)) st.push(v1); else { const v2 = st[st.length - 2]; st.push(v2, v1); } break; }
            case 0x5d: { const v1 = st.pop();
              if (this.cat2(v1)) { const v2 = st.pop(); st.push(v1, v2, v1); }
              else { const v2 = st.pop(), v3 = st.pop(); st.push(v2, v1, v3, v2, v1); } break; }
            case 0x5e: { const v1 = st.pop();
              if (this.cat2(v1)) { const v2 = st.pop();
                if (this.cat2(v2)) st.push(v1, v2, v1); else { const v3 = st.pop(); st.push(v1, v3, v2, v1); } }
              else { const v2 = st.pop(), v3 = st.pop();
                if (this.cat2(v3)) st.push(v2, v1, v3, v2, v1); else { const v4 = st.pop(); st.push(v2, v1, v4, v3, v2, v1); } }
              break; }
            case 0x5f: { const v1 = st.pop(), v2 = st.pop(); st.push(v1, v2); break; }
            // int arithmetic
            case 0x60: { const b = st.pop(); st.push((st.pop() + b) | 0); break; }
            case 0x64: { const b = st.pop(); st.push((st.pop() - b) | 0); break; }
            case 0x68: { const b = st.pop(); st.push(Math.imul(st.pop(), b)); break; }
            case 0x6c: { const b = st.pop(), a = st.pop(); if (b === 0) this.throwNew('java/lang/ArithmeticException', '/ by zero'); st.push((a / b) | 0); break; }
            case 0x70: { const b = st.pop(), a = st.pop(); if (b === 0) this.throwNew('java/lang/ArithmeticException', '/ by zero'); st.push((a % b) | 0); break; }
            case 0x74: st.push((-st.pop()) | 0); break;
            case 0x78: { const b = st.pop(); st.push(st.pop() << b); break; }
            case 0x7a: { const b = st.pop(); st.push(st.pop() >> b); break; }
            case 0x7c: { const b = st.pop(); st.push((st.pop() >>> b) | 0); break; }
            case 0x7e: { const b = st.pop(); st.push(st.pop() & b); break; }
            case 0x80: { const b = st.pop(); st.push(st.pop() | b); break; }
            case 0x82: { const b = st.pop(); st.push(st.pop() ^ b); break; }
            // long arithmetic
            case 0x61: { const b = st.pop(); st.push(BigInt.asIntN(64, st.pop() + b)); break; }
            case 0x65: { const b = st.pop(); st.push(BigInt.asIntN(64, st.pop() - b)); break; }
            case 0x69: { const b = st.pop(); st.push(BigInt.asIntN(64, st.pop() * b)); break; }
            case 0x6d: { const b = st.pop(), a = st.pop(); if (b === 0n) this.throwNew('java/lang/ArithmeticException', '/ by zero'); st.push(BigInt.asIntN(64, a / b)); break; }
            case 0x71: { const b = st.pop(), a = st.pop(); if (b === 0n) this.throwNew('java/lang/ArithmeticException', '/ by zero'); st.push(a % b); break; }
            case 0x75: st.push(BigInt.asIntN(64, -st.pop())); break;
            case 0x79: { const b = st.pop(); st.push(BigInt.asIntN(64, st.pop() << BigInt(b & 63))); break; }
            case 0x7b: { const b = st.pop(); st.push(st.pop() >> BigInt(b & 63)); break; }
            case 0x7d: { const b = st.pop(); st.push(BigInt.asIntN(64, BigInt.asUintN(64, st.pop()) >> BigInt(b & 63))); break; }
            case 0x7f: { const b = st.pop(); st.push(st.pop() & b); break; }
            case 0x81: { const b = st.pop(); st.push(st.pop() | b); break; }
            case 0x83: { const b = st.pop(); st.push(st.pop() ^ b); break; }
            // float
            case 0x62: { const b = st.pop(); st.push(Math.fround(st.pop() + b)); break; }
            case 0x66: { const b = st.pop(); st.push(Math.fround(st.pop() - b)); break; }
            case 0x6a: { const b = st.pop(); st.push(Math.fround(st.pop() * b)); break; }
            case 0x6e: { const b = st.pop(); st.push(Math.fround(st.pop() / b)); break; }
            case 0x72: { const b = st.pop(); st.push(Math.fround(st.pop() % b)); break; }
            case 0x76: st.push(-st.pop()); break;
            // double
            case 0x63: { const b = st.pop(); st.push(new D(st.pop().v + b.v)); break; }
            case 0x67: { const b = st.pop(); st.push(new D(st.pop().v - b.v)); break; }
            case 0x6b: { const b = st.pop(); st.push(new D(st.pop().v * b.v)); break; }
            case 0x6f: { const b = st.pop(); st.push(new D(st.pop().v / b.v)); break; }
            case 0x73: { const b = st.pop(); st.push(new D(st.pop().v % b.v)); break; }
            case 0x77: st.push(new D(-st.pop().v)); break;
            case 0x84: { const i = code[pc], c = (code[pc + 1] << 24) >> 24; lo[i] = (lo[i] + c) | 0; pc += 2; break; }
            // conversions
            case 0x85: st.push(BigInt(st.pop())); break;
            case 0x86: break;
            case 0x87: st.push(new D(st.pop())); break;
            case 0x88: st.push(Number(BigInt.asIntN(32, st.pop()))); break;
            case 0x89: st.push(Math.fround(Number(st.pop()))); break;
            case 0x8a: st.push(new D(Number(st.pop()))); break;
            case 0x8b: st.push(this.f2i(st.pop())); break;
            case 0x8c: st.push(this.f2l(st.pop())); break;
            case 0x8d: st.push(new D(st.pop())); break;
            case 0x8e: st.push(this.f2i(st.pop().v)); break;
            case 0x8f: st.push(this.f2l(st.pop().v)); break;
            case 0x90: st.push(Math.fround(st.pop().v)); break;
            case 0x91: st.push((st.pop() << 24) >> 24); break;
            case 0x92: st.push(st.pop() & 0xFFFF); break;
            case 0x93: st.push((st.pop() << 16) >> 16); break;
            // compares
            case 0x94: { const b = st.pop(), a = st.pop(); st.push(a > b ? 1 : a < b ? -1 : 0); break; }
            case 0x95: case 0x96: { const b = st.pop(), a = st.pop(); st.push(a > b ? 1 : a < b ? -1 : a === b ? 0 : (op === 0x96 ? 1 : -1)); break; }
            case 0x97: case 0x98: { const b = st.pop().v, a = st.pop().v; st.push(a > b ? 1 : a < b ? -1 : a === b ? 0 : (op === 0x98 ? 1 : -1)); break; }
            // branches
            case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e: {
              const v = st.pop(); let j;
              switch (op) { case 0x99: j = v === 0; break; case 0x9a: j = v !== 0; break; case 0x9b: j = v < 0; break;
                case 0x9c: j = v >= 0; break; case 0x9d: j = v > 0; break; default: j = v <= 0; }
              if (j) pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); else pc += 2;
              break;
            }
            case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4: case 0xa5: case 0xa6: {
              const b = st.pop(), a = st.pop(); let j;
              switch (op) { case 0x9f: case 0xa5: j = a === b; break; case 0xa0: case 0xa6: j = a !== b; break;
                case 0xa1: j = a < b; break; case 0xa2: j = a >= b; break; case 0xa3: j = a > b; break; default: j = a <= b; }
              if (j) pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); else pc += 2;
              break;
            }
            case 0xa7: pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); break;
            case 0xa8: st.push(pc + 2); pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); break;
            case 0xa9: pc = lo[code[pc]]; break;
            case 0xaa: {
              let q = pc + ((4 - (pc & 3)) & 3);
              const rd = (k) => (code[k] << 24) | (code[k + 1] << 16) | (code[k + 2] << 8) | code[k + 3];
              const def = rd(q), low = rd(q + 4), high = rd(q + 8), v = st.pop();
              pc = opc + ((v < low || v > high) ? def : rd(q + 12 + (v - low) * 4));
              break;
            }
            case 0xab: {
              let q = pc + ((4 - (pc & 3)) & 3);
              const rd = (k) => (code[k] << 24) | (code[k + 1] << 16) | (code[k + 2] << 8) | code[k + 3];
              const def = rd(q), n = rd(q + 4), v = st.pop();
              let target = def;
              for (let k = 0; k < n; k++) if (rd(q + 8 + k * 8) === v) { target = rd(q + 12 + k * 8); break; }
              pc = opc + target;
              break;
            }
            // returns
            case 0xac: case 0xad: case 0xae: case 0xaf: case 0xb0: case 0xb1: {
              const rv = op === 0xb1 ? undefined : st.pop();
              frames.pop();
              if (f.m.name === '<clinit>') f.m.cls.state = 2;
              if (frames.length === 0) { t.done = true; t.result = rv; return 'done'; }
              if (op !== 0xb1) frames[frames.length - 1].stack.push(rv);
              continue outer;
            }
            // fields
            case 0xb2: case 0xb3: {
              const idx = (code[pc] << 8) | code[pc + 1];
              const r = cls.rc[idx] || this.resolveRef(cls, idx);
              if (!r.decl) { r.decl = this.fieldDecl(r.owner, r.name); if (!r.decl) throw new Error('No static field ' + r.owner + '.' + r.name); }
              if (r.decl.state === 0 && !this.ensureInit(t, r.decl)) { f.pc = opc; continue outer; }
              pc += 2;
              if (op === 0xb2) st.push(r.decl.sv[r.name]); else r.decl.sv[r.name] = st.pop();
              break;
            }
            case 0xb4: {
              const idx = (code[pc] << 8) | code[pc + 1]; pc += 2;
              const r = cls.rc[idx] || this.resolveRef(cls, idx);
              const k = r.fk || (r.fk = this.instFieldKey(r.owner, r.name));
              const o = st.pop(); if (o === null) this.throwNew('java/lang/NullPointerException', 'getfield ' + r.name);
              st.push(o[k]); break;
            }
            case 0xb5: {
              const idx = (code[pc] << 8) | code[pc + 1]; pc += 2;
              const r = cls.rc[idx] || this.resolveRef(cls, idx);
              const k = r.fk || (r.fk = this.instFieldKey(r.owner, r.name));
              const v = st.pop(), o = st.pop(); if (o === null) this.throwNew('java/lang/NullPointerException', 'putfield ' + r.name);
              o[k] = v; break;
            }
            // invokes
            case 0xb6: case 0xb7: case 0xb8: case 0xb9: {
              const idx = (code[pc] << 8) | code[pc + 1];
              const r = cls.rc[idx] || this.resolveRef(cls, idx);
              let m;
              if (op === 0xb8) {
                m = r.m || (r.m = this.findMethod(this.loadClass(r.owner), r.key));
                if (!m) throw new Error('No method ' + r.owner + '.' + r.key);
                if (m.cls.state === 0 && !this.ensureInit(t, m.cls)) { f.pc = opc; continue outer; }
              }
              pc += op === 0xb9 ? 4 : 2;
              const n = r.nargs + (op === 0xb8 ? 0 : 1);
              const args = n === 0 ? [] : st.splice(st.length - n, n);
              if (op !== 0xb8) {
                const recv = args[0];
                if (recv === null || recv === undefined) this.throwNew('java/lang/NullPointerException', 'invoke ' + r.owner + '.' + r.key);
                if (op === 0xb7) m = r.m || (r.m = this.findMethod(this.loadClass(r.owner), r.key));
                else m = this.findVirtual(this.classOf(recv), r.key);
                if (!m) throw new Error('No method ' + this.classOf(recv).name + '/' + r.owner + '.' + r.key);
              }
              if (m.fn) {
                f.pc = pc; f.ipc = opc;
                const rv = m.fn(t, ...args);
                if (rv === YIELD) { return 'yield'; }
                if (rv === PUSHED) continue outer;
                if (!r.retVoid) st.push(rv === true ? 1 : rv === false ? 0 : rv);
              } else {
                f.pc = pc; f.ipc = opc;
                this.pushFrame(t, m, args);
                continue outer;
              }
              break;
            }
            case 0xbb: {
              const idx = (code[pc] << 8) | code[pc + 1];
              const c = this.loadClass(this.cpClassName(cls, idx));
              if (c.state === 0 && !this.ensureInit(t, c)) { f.pc = opc; continue outer; }
              pc += 2;
              st.push(this.newObject(c)); break;
            }
            case 0xbc: { const at = code[pc++]; st.push(this.newArray(' ZCFDBSIJ'[at - 3] || 'I', st.pop())); break; }
            case 0xbd: {
              const idx = (code[pc] << 8) | code[pc + 1]; pc += 2;
              const nm = this.cpClassName(cls, idx);
              st.push(this.newArray(nm[0] === '[' ? nm : 'L' + nm + ';', st.pop())); break;
            }
            case 0xbe: { const a = st.pop(); if (a === null) this.throwNew('java/lang/NullPointerException'); st.push(a.length); break; }
            case 0xbf: { const o = st.pop(); if (o === null) this.throwNew('java/lang/NullPointerException'); throw new JavaThrow(o); }
            case 0xc0: pc += 2; break; // checkcast: lenient
            case 0xc1: {
              const idx = (code[pc] << 8) | code[pc + 1]; pc += 2;
              st.push(this.instanceOf(st.pop(), this.cpClassName(cls, idx)) ? 1 : 0); break;
            }
            case 0xc2: case 0xc3: st.pop(); break;
            case 0xc4: {
              const wop = code[pc++], i = (code[pc] << 8) | code[pc + 1]; pc += 2;
              if (wop === 0x84) { const c = (((code[pc] << 8) | code[pc + 1]) << 16) >> 16; pc += 2; lo[i] = (lo[i] + c) | 0; }
              else if (wop >= 0x15 && wop <= 0x19) st.push(lo[i]);
              else if (wop >= 0x36 && wop <= 0x3a) lo[i] = st.pop();
              else if (wop === 0xa9) pc = lo[i];
              break;
            }
            case 0xc5: {
              const idx = (code[pc] << 8) | code[pc + 1], nd = code[pc + 2]; pc += 3;
              const dims = st.splice(st.length - nd, nd);
              st.push(this.multiArray(this.cpClassName(cls, idx), dims, 0)); break;
            }
            case 0xc6: { const v = st.pop(); if (v === null) pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); else pc += 2; break; }
            case 0xc7: { const v = st.pop(); if (v !== null) pc = opc + ((((code[pc] << 8) | code[pc + 1]) << 16) >> 16); else pc += 2; break; }
            case 0xc8: pc = opc + ((code[pc] << 24) | (code[pc + 1] << 16) | (code[pc + 2] << 8) | code[pc + 3]); break;
            case 0xc9: st.push(pc + 4); pc = opc + ((code[pc] << 24) | (code[pc + 1] << 16) | (code[pc + 2] << 8) | code[pc + 3]); break;
            default: throw new Error('Unknown opcode 0x' + op.toString(16) + ' in ' + cls.name + '.' + f.m.name);
          }
        }
      } catch (e) {
        if (!(e instanceof JavaThrow) && !(e instanceof TypeError)) { f.pc = opc; f.ipc = opc; t.trace = this.stackTrace(t); throw e; }
        f.ipc = opc;
        const ex = this.toThrowable(e);
        if (this.traceThrows) console.error('THROW ' + ex.cls.name + ' ' + (ex.msg || '') + ' at ' + this.stackTrace(t).split('\n').slice(0, 6).join(' <') + (e instanceof TypeError ? ' JS:' + e.message : ''));
        if (!this.handle(t, ex)) {
          t.trace = this.stackTrace(t); t.frames.length = 0; t.done = true;
          this.uncaught(t, new JavaThrow(ex));
          if (ex.jsErr) console.error(ex.jsErr);
          return 'done';
        }
        continue outer;
      }
    }
  },

  handle(t, ex) {
    const frames = t.frames;
    while (frames.length) {
      const f = frames[frames.length - 1];
      for (const h of f.m.exc) {
        if (f.ipc >= h.s && f.ipc < h.e && (h.t === null || this.isSubclass(ex.cls, this.loadClass(h.t)))) {
          f.pc = h.h; f.stack.length = 0; f.stack.push(ex);
          return true;
        }
      }
      if (f.m.name === '<clinit>') f.m.cls.state = 2;
      frames.pop();
    }
    return false;
  },

  cat2(v) { return typeof v === 'bigint' || v instanceof D; },
  f2i(v) { if (v !== v) return 0; if (v >= 2147483647) return 2147483647; if (v <= -2147483648) return -2147483648; return Math.trunc(v) | 0; },
  f2l(v) { if (v !== v) return 0n; if (v >= 9.2e18) return 9223372036854775807n; if (v <= -9.2e18) return -9223372036854775808n; return BigInt(Math.trunc(v)); },

  classObject(c) {
    if (!c.classObj) { c.classObj = new JObj(this.loadClass('java/lang/Class')); c.classObj.ref = c; }
    return c.classObj;
  },

  // ---------- scheduler ----------
  running: false, paused: false,
  // freeze the game at its next safe point (all threads yielded); resolves when frozen
  freeze() {
    this.paused = true;
    return new Promise((res) => {
      const check = () => (this.threads.every((t) => t.done || t.status === 'yield' || t.status === undefined) ? res() : setTimeout(check, 4));
      check();
    });
  },
  unfreeze() { this.paused = false; },
  start() {
    this.running = true;
    this.tick();
  },
  addThread(t) { if (t) this.threads.push(t); },
  runEvents() {
    while (this.events.length) {
      const ev = this.events.shift();
      const t = ev();
      if (!t) continue;
      let s;
      try { s = this.run(t, 5e6); } catch (e) { this.uncaught(t, e); continue; }
      if (s !== 'done') this.threads.push(t);
    }
  },
  tick() {
    if (!this.running) return;
    const start = performance.now();
    try {
      if (!this.paused) this.runEvents();
      for (;;) {
        const now = performance.now();
        let any = false;
        for (const t of this.threads) {
          if (t.done || t.sleepUntil > now) continue;
          if (this.paused && t.status === 'yield') continue; // frozen at a safe point
          if (this.paused && t.status === undefined) continue;
          any = true;
          let s;
          try { s = this.run(t, 40000); } catch (e) { this.uncaught(t, e); t.done = true; continue; }
          t.status = s;
          if (t.sleepFor) { t.sleepUntil = performance.now() + t.sleepFor; t.sleepFor = 0; }
          else if (s === 'yield') t.sleepUntil = performance.now() + (t.yieldDelay || 1);
          if (this.events.length && !this.paused) this.runEvents();
        }
        this.threads = this.threads.filter((t) => !t.done);
        if (!any || performance.now() - start > 12) break;
      }
    } catch (e) { console.error(e); this.errors.push(String(e)); }
    const now = performance.now();
    let next = Infinity;
    for (const t of this.threads) next = Math.min(next, t.sleepUntil);
    const delay = this.events.length ? 0 : next === Infinity ? 16 : Math.max(0, next - now);
    setTimeout(() => this.tick(), Math.min(delay, 16));
  },
};
