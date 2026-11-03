// CLDC / MIDP 2.0 / MMAPI / RMS native implementations for the JS JVM.
'use strict';

const MIDP = (() => {
  let SW = 240, SH = 320;
  const jstr = (o) => (o === null || o === undefined ? 'null' : o instanceof JStr ? o.s : String(o));
  const N = (name, spec) => VM.defineNative(name, spec);
  const NPE = () => VM.throwNew('java/lang/NullPointerException');
  const checkRange = (a, off, len) => {
    if (a === null) NPE();
    if (off < 0 || len < 0 || off + len > a.length) VM.throwNew('java/lang/ArrayIndexOutOfBoundsException');
  };
  const state = { display: null, current: null, midlet: null, screenCtx: null, onFlush: null, onExit: null, storagePrefix: 'j2me:' };

  // ---------------- java.lang ----------------
  N('java/lang/Object', {
    sup: null,
    m: {
      '<init>()V': () => {},
      'getClass()Ljava/lang/Class;': (t, o) => VM.classObject(VM.classOf(o)),
      'hashCode()I': (t, o) => { if (o.__hash === undefined) o.__hash = (Math.random() * 0x7fffffff) | 0; return o.__hash; },
      'equals(Ljava/lang/Object;)Z': (t, o, x) => o === x,
      'toString()Ljava/lang/String;': (t, o) => VM.str(VM.classOf(o).name.replace(/\//g, '.') + '@' + (o.__hash || 0).toString(16)),
      'notify()V': () => {}, 'notifyAll()V': () => {}, 'wait()V': () => YIELD, 'wait(J)V': (t) => { t.sleepFor = 1; return YIELD; },
    },
  });
  N('java/lang/Class', {
    m: {
      'getResourceAsStream(Ljava/lang/String;)Ljava/io/InputStream;': (t, c, name) => {
        let n = jstr(name);
        if (n[0] === '/') n = n.substring(1);
        else { const cn = c.ref.name; const i = cn.lastIndexOf('/'); if (i >= 0) n = cn.substring(0, i + 1) + n; }
        const data = VM.files[n];
        if (!data) return null;
        return newStream(new Int8Array(data.buffer, data.byteOffset, data.length));
      },
      'getName()Ljava/lang/String;': (t, c) => VM.str(c.ref.name.replace(/\//g, '.')),
    },
  });
  N('java/lang/Runnable', { iface: true, m: {} });

  const S = (t, o) => o.s;
  N('java/lang/String', {
    m: {
      '<init>()V': (t, o) => { o.s = ''; },
      '<init>(Ljava/lang/String;)V': (t, o, s) => { o.s = s.s; },
      '<init>([B)V': (t, o, b) => { o.s = latin1(b, 0, b.length); },
      '<init>([BII)V': (t, o, b, off, len) => { checkRange(b, off, len); o.s = latin1(b, off, len); },
      '<init>([BLjava/lang/String;)V': (t, o, b, enc) => { o.s = decodeBytes(b, 0, b.length, jstr(enc)); },
      '<init>([BIILjava/lang/String;)V': (t, o, b, off, len, enc) => { o.s = decodeBytes(b, off, len, jstr(enc)); },
      '<init>([C)V': (t, o, c) => { o.s = String.fromCharCode.apply(null, c); },
      '<init>([CII)V': (t, o, c, off, len) => { o.s = String.fromCharCode.apply(null, c.subarray(off, off + len)); },
      '<init>(Ljava/lang/StringBuffer;)V': (t, o, sb) => { o.s = sb.sb; },
      'length()I': (t, o) => o.s.length,
      'charAt(I)C': (t, o, i) => { if (i < 0 || i >= o.s.length) VM.throwNew('java/lang/StringIndexOutOfBoundsException'); return o.s.charCodeAt(i); },
      'compareTo(Ljava/lang/String;)I': (t, o, x) => { const a = o.s, b = x.s; const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d) return d; } return a.length - b.length; },
      'equals(Ljava/lang/Object;)Z': (t, o, x) => x instanceof JStr && x.s === o.s,
      'equalsIgnoreCase(Ljava/lang/String;)Z': (t, o, x) => x !== null && x.s.toLowerCase() === o.s.toLowerCase(),
      'hashCode()I': (t, o) => { let h = 0; for (let i = 0; i < o.s.length; i++) h = (Math.imul(h, 31) + o.s.charCodeAt(i)) | 0; return h; },
      'toUpperCase()Ljava/lang/String;': (t, o) => VM.str(o.s.toUpperCase()),
      'toLowerCase()Ljava/lang/String;': (t, o) => VM.str(o.s.toLowerCase()),
      'trim()Ljava/lang/String;': (t, o) => { const r = o.s.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, ''); return r === o.s ? o : VM.str(r); },
      'indexOf(I)I': (t, o, c) => o.s.indexOf(String.fromCharCode(c)),
      'indexOf(II)I': (t, o, c, f) => o.s.indexOf(String.fromCharCode(c), f),
      'indexOf(Ljava/lang/String;)I': (t, o, s) => o.s.indexOf(s.s),
      'indexOf(Ljava/lang/String;I)I': (t, o, s, f) => o.s.indexOf(s.s, f),
      'lastIndexOf(I)I': (t, o, c) => o.s.lastIndexOf(String.fromCharCode(c)),
      'substring(I)Ljava/lang/String;': (t, o, a) => VM.str(o.s.substring(a)),
      'substring(II)Ljava/lang/String;': (t, o, a, b) => VM.str(o.s.substring(a, b)),
      'startsWith(Ljava/lang/String;)Z': (t, o, s) => o.s.startsWith(s.s),
      'endsWith(Ljava/lang/String;)Z': (t, o, s) => o.s.endsWith(s.s),
      'concat(Ljava/lang/String;)Ljava/lang/String;': (t, o, s) => VM.str(o.s + s.s),
      'replace(CC)Ljava/lang/String;': (t, o, a, b) => VM.str(o.s.split(String.fromCharCode(a)).join(String.fromCharCode(b))),
      'toString()Ljava/lang/String;': (t, o) => o,
      'intern()Ljava/lang/String;': (t, o) => VM.intern(o.s),
      'getBytes()[B': (t, o) => { const a = VM.newArray('B', o.s.length); for (let i = 0; i < o.s.length; i++) a[i] = o.s.charCodeAt(i); return a; },
      'toCharArray()[C': (t, o) => { const a = VM.newArray('C', o.s.length); for (let i = 0; i < o.s.length; i++) a[i] = o.s.charCodeAt(i); return a; },
      'getChars(II[CI)V': (t, o, b, e, dst, d) => { for (let i = b; i < e; i++) dst[d + i - b] = o.s.charCodeAt(i); },
      '$valueOf(I)Ljava/lang/String;': (t, i) => VM.str(String(i)),
      '$valueOf(J)Ljava/lang/String;': (t, i) => VM.str(String(i)),
      '$valueOf(C)Ljava/lang/String;': (t, c) => VM.str(String.fromCharCode(c)),
      '$valueOf(Z)Ljava/lang/String;': (t, b) => VM.str(b ? 'true' : 'false'),
      '$valueOf(Ljava/lang/Object;)Ljava/lang/String;': (t, o) => VM.str(jstr(o)),
    },
  });
  function latin1(b, off, len) { let s = ''; for (let i = off; i < off + len; i++) s += String.fromCharCode(b[i] & 0xff); return s; }
  function decodeBytes(b, off, len, enc) {
    if (/utf-?8/i.test(enc)) return new TextDecoder('utf-8').decode(new Uint8Array(b.buffer, b.byteOffset + off, len));
    return latin1(b, off, len);
  }

  const sbApp = (t, o, v) => { o.sb += v; return o; };
  N('java/lang/StringBuffer', {
    alloc: (o) => { o.sb = ''; },
    m: {
      '<init>()V': (t, o) => { o.sb = ''; },
      '<init>(I)V': (t, o) => { o.sb = ''; },
      '<init>(Ljava/lang/String;)V': (t, o, s) => { o.sb = s.s; },
      'append(Ljava/lang/String;)Ljava/lang/StringBuffer;': (t, o, s) => sbApp(t, o, s === null ? 'null' : s.s),
      'append(Ljava/lang/Object;)Ljava/lang/StringBuffer;': (t, o, s) => sbApp(t, o, jstr(s)),
      'append(I)Ljava/lang/StringBuffer;': (t, o, v) => sbApp(t, o, String(v)),
      'append(J)Ljava/lang/StringBuffer;': (t, o, v) => sbApp(t, o, String(v)),
      'append(C)Ljava/lang/StringBuffer;': (t, o, v) => sbApp(t, o, String.fromCharCode(v)),
      'append(Z)Ljava/lang/StringBuffer;': (t, o, v) => sbApp(t, o, v ? 'true' : 'false'),
      'append([C)Ljava/lang/StringBuffer;': (t, o, v) => sbApp(t, o, String.fromCharCode.apply(null, v)),
      'toString()Ljava/lang/String;': (t, o) => VM.str(o.sb),
      'length()I': (t, o) => o.sb.length,
      'charAt(I)C': (t, o, i) => o.sb.charCodeAt(i),
      'setLength(I)V': (t, o, n) => { o.sb = o.sb.length >= n ? o.sb.substring(0, n) : o.sb + '\0'.repeat(n - o.sb.length); },
      'setCharAt(IC)V': (t, o, i, c) => { o.sb = o.sb.substring(0, i) + String.fromCharCode(c) + o.sb.substring(i + 1); },
      'deleteCharAt(I)Ljava/lang/StringBuffer;': (t, o, i) => { o.sb = o.sb.substring(0, i) + o.sb.substring(i + 1); return o; },
      'delete(II)Ljava/lang/StringBuffer;': (t, o, a, b) => { o.sb = o.sb.substring(0, a) + o.sb.substring(b); return o; },
      'insert(ILjava/lang/String;)Ljava/lang/StringBuffer;': (t, o, i, s) => { o.sb = o.sb.substring(0, i) + jstr(s) + o.sb.substring(i); return o; },
      'insert(IC)Ljava/lang/StringBuffer;': (t, o, i, c) => { o.sb = o.sb.substring(0, i) + String.fromCharCode(c) + o.sb.substring(i); return o; },
      'reverse()Ljava/lang/StringBuffer;': (t, o) => { o.sb = o.sb.split('').reverse().join(''); return o; },
    },
  });
  N('java/lang/Integer', {
    m: {
      '$parseInt(Ljava/lang/String;)I': (t, s) => { const v = parseInt(s.s, 10); if (isNaN(v)) VM.throwNew('java/lang/NumberFormatException'); return v | 0; },
      '$parseInt(Ljava/lang/String;I)I': (t, s, r) => { const v = parseInt(s.s, r); if (isNaN(v)) VM.throwNew('java/lang/NumberFormatException'); return v | 0; },
      '$toString(I)Ljava/lang/String;': (t, i) => VM.str(String(i)),
      '$toHexString(I)Ljava/lang/String;': (t, i) => VM.str((i >>> 0).toString(16)),
      '<init>(I)V': (t, o, v) => { o.v = v; },
      'intValue()I': (t, o) => o.v,
    },
  });
  N('java/lang/Math', {
    m: {
      '$abs(I)I': (t, a) => (a < 0 ? -a | 0 : a), '$abs(J)J': (t, a) => (a < 0n ? BigInt.asIntN(64, -a) : a),
      '$max(II)I': (t, a, b) => (a > b ? a : b), '$min(II)I': (t, a, b) => (a < b ? a : b),
      '$max(JJ)J': (t, a, b) => (a > b ? a : b), '$min(JJ)J': (t, a, b) => (a < b ? a : b),
      '$sqrt(D)D': (t, a) => new D(Math.sqrt(a.v)), '$sin(D)D': (t, a) => new D(Math.sin(a.v)), '$cos(D)D': (t, a) => new D(Math.cos(a.v)),
      '$abs(D)D': (t, a) => new D(Math.abs(a.v)), '$floor(D)D': (t, a) => new D(Math.floor(a.v)), '$ceil(D)D': (t, a) => new D(Math.ceil(a.v)),
    },
  });
  N('java/lang/System', {
    statics: { out: 1, err: 1 },
    clinit: (c) => { c.sv.out = VM.newObject(VM.loadClass('java/io/PrintStream')); c.sv.err = c.sv.out; },
    m: {
      '$currentTimeMillis()J': () => BigInt(state.clock ? state.clock() : Date.now()),
      '$gc()V': () => {},
      '$getProperty(Ljava/lang/String;)Ljava/lang/String;': (t, k) => {
        const p = { 'microedition.platform': 'j2me-web', 'microedition.encoding': 'ISO-8859-1', 'microedition.configuration': 'CLDC-1.1', 'microedition.profiles': 'MIDP-2.0' }[jstr(k)];
        return p ? VM.str(p) : null;
      },
      '$arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V': (t, src, sp, dst, dp, len) => {
        if (src === null || dst === null) NPE();
        if (len < 0 || sp < 0 || dp < 0 || sp + len > src.length || dp + len > dst.length) VM.throwNew('java/lang/ArrayIndexOutOfBoundsException');
        if (len === 0) return;
        if (src === dst) { if (src.copyWithin) src.copyWithin(dp, sp, sp + len); else { const tmp = src.slice(sp, sp + len); for (let i = 0; i < len; i++) dst[dp + i] = tmp[i]; } return; }
        if (ArrayBuffer.isView(src) && ArrayBuffer.isView(dst) && src.constructor === dst.constructor) dst.set(src.subarray(sp, sp + len), dp);
        else for (let i = 0; i < len; i++) dst[dp + i] = src[sp + i];
      },
    },
  });
  N('java/io/PrintStream', {
    m: {
      'println(Ljava/lang/String;)V': (t, o, s) => VM.log(jstr(s)),
      'println(Ljava/lang/Object;)V': (t, o, s) => VM.log(jstr(s)),
      'println(I)V': (t, o, s) => VM.log(s),
      'println()V': () => {},
      'print(Ljava/lang/String;)V': (t, o, s) => VM.log(jstr(s)),
    },
  });
  N('java/lang/Runtime', {
    m: {
      '$getRuntime()Ljava/lang/Runtime;': () => state.runtime || (state.runtime = VM.newObject(VM.loadClass('java/lang/Runtime'))),
      'freeMemory()J': () => 1500000n, 'totalMemory()J': () => 2000000n, 'gc()V': () => {},
    },
  });
  N('java/lang/Thread', {
    ifaces: ['java/lang/Runnable'],
    m: {
      '<init>()V': (t, o) => { o.target = null; },
      '<init>(Ljava/lang/Runnable;)V': (t, o, r) => { o.target = r; },
      'start()V': (t, o) => {
        const target = o.target || o;
        const th = VM.spawn('java-thread', target, 'run()V', []);
        if (th) { o.jt = th; VM.addThread(th); }
      },
      'run()V': (t, o) => { if (o.target) { const th = VM.spawn('run', o.target, 'run()V', []); if (th) VM.addThread(th); } },
      '$yield()V': (t) => (state.yieldHook ? state.yieldHook(t) : YIELD),
      '$sleep(J)V': (t, ms) => { t.sleepFor = Math.max(1, Number(ms)); return YIELD; },
      '$currentThread()Ljava/lang/Thread;': () => state.threadObj || (state.threadObj = VM.newObject(VM.loadClass('java/lang/Thread'))),
      'setPriority(I)V': () => {}, 'isAlive()Z': (t, o) => !!(o.jt && !o.jt.done), 'join()V': () => YIELD,
      'interrupt()V': () => {},
    },
  });
  N('java/util/Random', {
    m: {
      '<init>()V': (t, o) => { o.seed = (BigInt(Date.now()) ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n); },
      '<init>(J)V': (t, o, s) => { o.seed = (s ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n); },
      'setSeed(J)V': (t, o, s) => { o.seed = (s ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n); },
      'nextInt()I': (t, o) => rnext(o, 32),
      'nextInt(I)I': (t, o, n) => {
        if (n <= 0) VM.throwNew('java/lang/IllegalArgumentException');
        if ((n & -n) === n) return Number((BigInt(n) * BigInt(rnext(o, 31))) >> 31n);
        let bits, val;
        do { bits = rnext(o, 31); val = bits % n; } while (bits - val + (n - 1) < 0 || bits - val + (n - 1) > 2147483647);
        return val;
      },
      'nextLong()J': (t, o) => BigInt.asIntN(64, (BigInt(rnext(o, 32)) << 32n) + BigInt(rnext(o, 32))),
    },
  });
  function rnext(o, bits) {
    o.seed = (o.seed * 0x5DEECE66Dn + 0xBn) & ((1n << 48n) - 1n);
    return Number(BigInt.asIntN(32, o.seed >> BigInt(48 - bits)));
  }

  // exceptions
  const exc = (name, sup) => N(name, { sup, m: {} });
  N('java/lang/Throwable', {
    m: {
      '<init>()V': (t, o) => { o.msg = null; },
      '<init>(Ljava/lang/String;)V': (t, o, s) => { o.msg = s ? s.s : null; },
      'getMessage()Ljava/lang/String;': (t, o) => VM.str(o.msg),
      'toString()Ljava/lang/String;': (t, o) => VM.str(o.cls.name.replace(/\//g, '.') + (o.msg ? ': ' + o.msg : '')),
      'printStackTrace()V': (t, o) => console.warn('[java] printStackTrace', o.cls.name, o.msg || ''),
    },
  });
  exc('java/lang/Exception', 'java/lang/Throwable');
  exc('java/lang/Error', 'java/lang/Throwable');
  exc('java/lang/OutOfMemoryError', 'java/lang/Error');
  exc('java/lang/RuntimeException', 'java/lang/Exception');
  for (const n of ['NullPointerException', 'ArithmeticException', 'ClassCastException', 'NegativeArraySizeException',
    'IllegalArgumentException', 'IllegalStateException', 'IndexOutOfBoundsException', 'SecurityException'])
    exc('java/lang/' + n, 'java/lang/RuntimeException');
  exc('java/lang/ArrayIndexOutOfBoundsException', 'java/lang/IndexOutOfBoundsException');
  exc('java/lang/StringIndexOutOfBoundsException', 'java/lang/IndexOutOfBoundsException');
  exc('java/lang/NumberFormatException', 'java/lang/IllegalArgumentException');
  exc('java/lang/InterruptedException', 'java/lang/Exception');
  exc('java/io/IOException', 'java/lang/Exception');
  exc('java/io/EOFException', 'java/io/IOException');
  exc('javax/microedition/rms/RecordStoreException', 'java/lang/Exception');
  for (const n of ['InvalidRecordIDException', 'RecordStoreNotFoundException', 'RecordStoreFullException', 'RecordStoreNotOpenException'])
    exc('javax/microedition/rms/' + n, 'javax/microedition/rms/RecordStoreException');
  exc('javax/microedition/media/MediaException', 'java/lang/Exception');

  // ---------------- java.io ----------------
  function newStream(bytes) {
    const o = VM.newObject(VM.loadClass('java/io/ByteArrayInputStream'));
    o.buf = bytes; o.pos = 0; o.mark = 0;
    return o;
  }
  N('java/io/InputStream', {
    m: {
      '<init>()V': () => {},
      'read()I': (t, o) => (o.pos < o.buf.length ? o.buf[o.pos++] & 0xff : -1),
      'read([B)I': (t, o, b) => streamRead(o, b, 0, b.length),
      'read([BII)I': (t, o, b, off, len) => streamRead(o, b, off, len),
      'skip(J)J': (t, o, n) => { const k = Math.max(0, Math.min(Number(n), o.buf.length - o.pos)); o.pos += k; return BigInt(k); },
      'available()I': (t, o) => o.buf.length - o.pos,
      'close()V': () => {},
      'reset()V': (t, o) => { o.pos = o.mark; },
      'mark(I)V': (t, o) => { o.mark = o.pos; },
      'markSupported()Z': () => true,
    },
  });
  function streamRead(o, b, off, len) {
    checkRange(b, off, len);
    if (len === 0) return 0;
    if (o.pos >= o.buf.length) return -1;
    const n = Math.min(len, o.buf.length - o.pos);
    b.set(o.buf.subarray(o.pos, o.pos + n), off);
    o.pos += n;
    return n;
  }
  N('java/io/ByteArrayInputStream', {
    sup: 'java/io/InputStream',
    m: {
      '<init>([B)V': (t, o, b) => { o.buf = b; o.pos = 0; o.mark = 0; },
      '<init>([BII)V': (t, o, b, off, len) => { o.buf = b.subarray(off, off + len); o.pos = 0; o.mark = 0; },
    },
  });

  // ---------------- MIDlet / Display ----------------
  N('javax/microedition/midlet/MIDlet', {
    m: {
      '<init>()V': (t, o) => { state.midlet = o; },
      'getAppProperty(Ljava/lang/String;)Ljava/lang/String;': (t, o, k) => { const v = VM.manifest[jstr(k)]; return v === undefined ? null : VM.str(v); },
      'notifyDestroyed()V': () => { VM.running = false; state.onExit && state.onExit(); },
      'notifyPaused()V': () => {},
      'resumeRequest()V': () => {},
      'platformRequest(Ljava/lang/String;)Z': () => false,
      'checkPermission(Ljava/lang/String;)I': () => 1,
    },
  });
  N('javax/microedition/lcdui/Display', {
    m: {
      '$getDisplay(Ljavax/microedition/midlet/MIDlet;)Ljavax/microedition/lcdui/Display;': () =>
        state.display || (state.display = VM.newObject(VM.loadClass('javax/microedition/lcdui/Display'))),
      'setCurrent(Ljavax/microedition/lcdui/Displayable;)V': (t, o, d) => {
        if (d === null || d === state.current) return;
        const prev = state.current;
        state.current = d;
        if (prev) VM.events.push(() => VM.spawn('hide', prev, 'hideNotify()V', []));
        VM.events.push(() => VM.spawn('show', d, 'showNotify()V', []));
      },
      'getCurrent()Ljavax/microedition/lcdui/Displayable;': () => state.current,
      'vibrate(I)Z': (t, o, ms) => { try { if (MIDP.vibration && navigator.vibrate) navigator.vibrate(Math.min(ms, 400)); } catch (e) {} return true; },
      'flashBacklight(I)Z': () => true,
      'isColor()Z': () => true,
      'numColors()I': () => 65536,
      'callSerially(Ljava/lang/Runnable;)V': (t, o, r) => VM.events.push(() => VM.spawn('serial', r, 'run()V', [])),
    },
  });
  N('javax/microedition/lcdui/Displayable', {
    m: {
      'getWidth()I': () => SW, 'getHeight()I': () => SH,
      'setCommandListener(Ljavax/microedition/lcdui/CommandListener;)V': () => {},
      'addCommand(Ljavax/microedition/lcdui/Command;)V': () => {},
      'removeCommand(Ljavax/microedition/lcdui/Command;)V': () => {},
      'isShown()Z': (t, o) => state.current === o,
      'setTitle(Ljava/lang/String;)V': () => {},
    },
  });
  N('javax/microedition/lcdui/CommandListener', { iface: true, m: {} });

  const GA = { UP: 1, DOWN: 6, LEFT: 2, RIGHT: 5, FIRE: 8, A: 9, B: 10, C: 11, D: 12 };
  const keyToAction = { '-1': GA.UP, '-2': GA.DOWN, '-3': GA.LEFT, '-4': GA.RIGHT, '-5': GA.FIRE,
    50: GA.UP, 56: GA.DOWN, 52: GA.LEFT, 54: GA.RIGHT, 53: GA.FIRE, 49: GA.A, 51: GA.B, 55: GA.C, 57: GA.D };
  const actionToKey = { 1: -1, 6: -2, 2: -3, 5: -4, 8: -5, 9: 49, 10: 51, 11: 55, 12: 57 };
  const keyNames = { '-1': 'Arriba', '-2': 'Abajo', '-3': 'Izquierda', '-4': 'Derecha', '-5': 'OK', '-6': 'Soft1', '-7': 'Soft2', 42: '*', 35: '#' };
  N('javax/microedition/lcdui/Canvas', {
    sup: 'javax/microedition/lcdui/Displayable',
    m: {
      '<init>()V': () => {},
      'getGameAction(I)I': (t, o, k) => keyToAction[k] || 0,
      'getKeyCode(I)I': (t, o, a) => { if (!actionToKey[a]) VM.throwNew('java/lang/IllegalArgumentException'); return actionToKey[a]; },
      'getKeyName(I)Ljava/lang/String;': (t, o, k) => VM.str(keyNames[k] || (k >= 48 && k <= 57 ? String.fromCharCode(k) : 'Tecla')),
      'setFullScreenMode(Z)V': () => {},
      'repaint()V': (t, o) => { requestPaint(o); }, 'repaint(IIII)V': (t, o) => { requestPaint(o); },
      'serviceRepaints()V': () => {},
      'hasPointerEvents()Z': () => false, 'hasPointerMotionEvents()Z': () => false, 'hasRepeatEvents()Z': () => false,
      'isDoubleBuffered()Z': () => true,
      'keyPressed(I)V': () => {}, 'keyReleased(I)V': () => {}, 'keyRepeated(I)V': () => {},
      'pointerPressed(II)V': () => {}, 'pointerReleased(II)V': () => {}, 'pointerDragged(II)V': () => {},
      'showNotify()V': () => {}, 'hideNotify()V': () => {}, 'sizeChanged(II)V': () => {},
      'paint(Ljavax/microedition/lcdui/Graphics;)V': () => {},
    },
  });
  function requestPaint(canvas) {
    if (canvas.back) return; // GameCanvas: painting goes through flushGraphics
    if (state.paintPending) return;
    state.paintPending = true;
    VM.events.push(() => {
      state.paintPending = false;
      const g = newGraphics(state.screenImage);
      const t = VM.spawn('paint', canvas, 'paint(Ljavax/microedition/lcdui/Graphics;)V', [g]);
      if (!t) return null;
      t.onDone = () => flush(state.screenImage);
      return t;
    });
  }
  N('javax/microedition/lcdui/game/GameCanvas', {
    sup: 'javax/microedition/lcdui/Canvas',
    m: {
      '<init>(Z)V': (t, o) => { o.back = makeImage(SW, SH, true); fillWhite(o.back); },
      'getGraphics()Ljavax/microedition/lcdui/Graphics;': (t, o) => newGraphics(o.back),
      'flushGraphics()V': (t, o) => { if (state.current === o) flush(o.back); },
      'flushGraphics(IIII)V': (t, o) => { if (state.current === o) flush(o.back); },
      'getKeyStates()I': () => 0,
      'paint(Ljavax/microedition/lcdui/Graphics;)V': (t, o, g) => { g.g.ctx.drawImage(o.back.canvas, 0, 0); },
    },
  });
  function blit(img) {
    if (!state.screenCtx) return;
    if (state.blit) state.blit(img, state.screenCtx); else state.screenCtx.drawImage(img.canvas, 0, 0);
    if (state.afterBlit) state.afterBlit(img);
  }
  function flush(img) {
    state.backImage = img;
    if (state.flushHook && state.flushHook(img) === false) { state.frames = (state.frames || 0) + 1; return; }
    blit(img);
    state.frames = (state.frames || 0) + 1;
    if (state.onFlush) state.onFlush();
  }

  // ---------------- Images ----------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }
  function makeImage(w, h, mutable) {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.__clip = null; ctx.__fill = null;
    const o = VM.newObject(VM.loadClass('javax/microedition/lcdui/Image'));
    o.canvas = canvas; o.ctx = ctx; o.w = w; o.h = h; o.mutable = mutable;
    return o;
  }
  function fillWhite(img) { img.ctx.fillStyle = '#fff'; img.ctx.fillRect(0, 0, img.w, img.h); img.ctx.__fill = null; }
  function imageFromRGBA(w, h, data) {
    const img = makeImage(w, h, false);
    img.ctx.putImageData(new ImageData(data, w, h), 0, 0);
    return img;
  }
  function imageFromBytes(b, off, len) {
    const u = new Uint8Array(b.buffer, b.byteOffset + off, len);
    let png;
    try { png = decodePNG(u); } catch (e) { console.warn('PNG decode failed', e); VM.throwNew('java/lang/IllegalArgumentException', 'bad image'); }
    return imageFromRGBA(png.w, png.h, png.data);
  }
  function argbToRGBA(rgb, off, scan, w, h, alpha) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = rgb[off + y * scan + x], i = (y * w + x) * 4;
      d[i] = (v >> 16) & 255; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; d[i + 3] = alpha ? (v >>> 24) : 255;
    }
    return d;
  }
  N('javax/microedition/lcdui/Image', {
    m: {
      '$createImage(II)Ljavax/microedition/lcdui/Image;': (t, w, h) => {
        if (w <= 0 || h <= 0) VM.throwNew('java/lang/IllegalArgumentException');
        const i = makeImage(w, h, true); fillWhite(i); return i;
      },
      '$createImage([BII)Ljavax/microedition/lcdui/Image;': (t, b, off, len) => { checkRange(b, off, len); return imageFromBytes(b, off, len); },
      '$createImage(Ljava/lang/String;)Ljavax/microedition/lcdui/Image;': (t, name) => {
        let n = jstr(name); if (n[0] === '/') n = n.substring(1);
        const d = VM.files[n]; if (!d) VM.throwNew('java/io/IOException', n);
        return imageFromBytes(new Int8Array(d.buffer, d.byteOffset, d.length), 0, d.length);
      },
      '$createImage(Ljavax/microedition/lcdui/Image;)Ljavax/microedition/lcdui/Image;': (t, src) => {
        const i = makeImage(src.w, src.h, false); i.ctx.drawImage(src.canvas, 0, 0); return i;
      },
      '$createImage(Ljavax/microedition/lcdui/Image;IIIII)Ljavax/microedition/lcdui/Image;': (t, src, x, y, w, h, tr) => {
        const sw = tr >= 4 ? h : w, sh = tr >= 4 ? w : h;
        const i = makeImage(sw, sh, false);
        const g = newGraphics(i);
        drawRegion(g.g, src, x, y, w, h, tr, 0, 0, 0);
        return i;
      },
      '$createRGBImage([IIIZ)Ljavax/microedition/lcdui/Image;': (t, rgb, w, h, alpha) => imageFromRGBA(w, h, argbToRGBA(rgb, 0, w, w, h, alpha)),
      'getGraphics()Ljavax/microedition/lcdui/Graphics;': (t, o) => { if (!o.mutable) VM.throwNew('java/lang/IllegalStateException'); return newGraphics(o); },
      'getWidth()I': (t, o) => o.w, 'getHeight()I': (t, o) => o.h,
      'isMutable()Z': (t, o) => o.mutable,
      'getRGB([IIIIIII)V': (t, o, rgb, off, scan, x, y, w, h) => {
        if (w <= 0 || h <= 0) return;
        const d = o.ctx.getImageData(x, y, w, h).data;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const i = (yy * w + xx) * 4;
          rgb[off + yy * scan + xx] = (d[i + 3] << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        }
      },
    },
  });

  // ---------------- Fonts ----------------
  const fontCache = new Map();
  const measureCtx = document.createElement('canvas').getContext('2d');
  function getFont(face, style, size) {
    const key = face + ':' + style + ':' + size;
    let f = fontCache.get(key);
    if (f) return f;
    f = VM.newObject(VM.loadClass('javax/microedition/lcdui/Font'));
    f.face = face; f.style = style; f.size = size;
    const px = size === 8 ? 11 : size === 16 ? 16 : 13;
    f.px = px;
    f.css = (style & 2 ? 'italic ' : '') + (style & 1 ? 'bold ' : '') + px + 'px ' + (face === 32 ? 'monospace' : 'Arial, Helvetica, sans-serif');
    f.height = px + 3;
    f.baseline = px;
    fontCache.set(key, f);
    return f;
  }
  const strW = (f, s) => { measureCtx.font = f.css; return Math.round(measureCtx.measureText(s).width); };
  N('javax/microedition/lcdui/Font', {
    m: {
      '$getFont(III)Ljavax/microedition/lcdui/Font;': (t, face, style, size) => getFont(face, style, size),
      '$getFont(I)Ljavax/microedition/lcdui/Font;': () => getFont(0, 0, 0),
      '$getDefaultFont()Ljavax/microedition/lcdui/Font;': () => getFont(0, 0, 0),
      'getHeight()I': (t, f) => f.height,
      'getBaselinePosition()I': (t, f) => f.baseline,
      'stringWidth(Ljava/lang/String;)I': (t, f, s) => strW(f, s.s),
      'charWidth(C)I': (t, f, c) => strW(f, String.fromCharCode(c)),
      'charsWidth([CII)I': (t, f, c, o, l) => strW(f, String.fromCharCode.apply(null, c.subarray(o, o + l))),
      'substringWidth(Ljava/lang/String;II)I': (t, f, s, o, l) => strW(f, s.s.substr(o, l)),
      'getSize()I': (t, f) => f.size, 'getStyle()I': (t, f) => f.style, 'getFace()I': (t, f) => f.face,
      'isBold()Z': (t, f) => !!(f.style & 1),
    },
  });

  // ---------------- Graphics ----------------
  function newGraphics(img) {
    const o = VM.newObject(VM.loadClass('javax/microedition/lcdui/Graphics'));
    o.g = { img, ctx: img.ctx, tx: 0, ty: 0, cx: 0, cy: 0, cw: img.w, ch: img.h, color: 0, css: '#000000', font: getFont(0, 0, 0) };
    return o;
  }
  function applyClip(g) {
    const ctx = g.ctx;
    const key = g.cx + ',' + g.cy + ',' + g.cw + ',' + g.ch;
    if (ctx.__clip !== key) {
      ctx.restore(); ctx.save();
      ctx.beginPath(); ctx.rect(g.cx, g.cy, g.cw, g.ch); ctx.clip();
      ctx.__clip = key; ctx.__fill = null;
    }
    return g.cw > 0 && g.ch > 0;
  }
  // optional observer of where drawing lands (absolute coordinates, before clipping)
  function touch(g, x, y, w, h) {
    if (!state.onDraw) return;
    const x1 = Math.max(x, g.cx), y1 = Math.max(y, g.cy), x2 = Math.min(x + w, g.cx + g.cw), y2 = Math.min(y + h, g.cy + g.ch);
    if (x2 > x1 && y2 > y1) state.onDraw(g.img, x1, y1, x2, y2);
  }
  function fill(g) { if (g.ctx.__fill !== g.css) { g.ctx.fillStyle = g.css; g.ctx.__fill = g.css; } }
  function setColor(g, c) { c &= 0xffffff; g.color = c; g.css = '#' + c.toString(16).padStart(6, '0'); }
  function frect(g, x, y, w, h) { if (w <= 0 || h <= 0) return; touch(g, x + g.tx, y + g.ty, w, h); g.ctx.fillRect(x + g.tx, y + g.ty, w, h); }
  function line(g, x1, y1, x2, y2) {
    if (x1 === x2) { const a = Math.min(y1, y2); frect(g, x1, a, 1, Math.abs(y2 - y1) + 1); return; }
    if (y1 === y2) { const a = Math.min(x1, x2); frect(g, a, y1, Math.abs(x2 - x1) + 1, 1); return; }
    let dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1, err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      frect(g, x1, y1, 1, 1);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }
  function anchorImg(x, y, w, h, a) {
    if (a === 0) return [x, y];
    if (a & 1) x -= (w >> 1); else if (a & 8) x -= w;
    if (a & 2) y -= (h >> 1); else if (a & 32) y -= h;
    return [x, y];
  }
  const TR = [
    [1, 0, 0, 1, 0, 0], // 0 NONE
    [1, 0, 0, -1, 0, 'h'], // 1 MIRROR_ROT180
    [-1, 0, 0, 1, 'w', 0], // 2 MIRROR
    [-1, 0, 0, -1, 'w', 'h'], // 3 ROT180
    [0, 1, 1, 0, 0, 0], // 4 MIRROR_ROT270
    [0, 1, -1, 0, 'h', 0], // 5 ROT90
    [0, -1, 1, 0, 0, 'w'], // 6 ROT270
    [0, -1, -1, 0, 'h', 'w'], // 7 MIRROR_ROT90
  ];
  function drawRegion(g, img, sx, sy, w, h, tr, x, y, anchor) {
    if (w <= 0 || h <= 0) return;
    if (!applyClip(g)) return;
    const dw = tr >= 4 ? h : w, dh = tr >= 4 ? w : h;
    [x, y] = anchorImg(x + g.tx, y + g.ty, dw, dh, anchor);
    touch(g, x, y, dw, dh);
    const L = state.layer, ctx = L ? L.ctx : g.ctx;
    if (L) { layerBox(L, x, y, dw, dh); x -= L.ox; y -= L.oy; }
    if (tr === 0) { ctx.drawImage(img.canvas, sx, sy, w, h, x, y, w, h); return; }
    const m = TR[tr] || TR[0];
    const e = m[4] === 'w' ? w : m[4] === 'h' ? h : 0, f = m[5] === 'w' ? w : m[5] === 'h' ? h : 0;
    ctx.setTransform(m[0], m[1], m[2], m[3], x + e, y + f);
    ctx.drawImage(img.canvas, sx, sy, w, h, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // Used by the port to turn a car smoothly between two of its 16 pre-drawn directions:
  // state.layer = { ctx, ox, oy, box }: image drawing goes to that canvas instead, shifted by (-ox, -oy),
  // and box grows to cover it; drawLayer() then puts that part on the screen turned at once. Turning the pieces one by one made
  // overlapping see-through parts (headlight beams at night) blend differently from frame to frame.
  function layerBox(L, x, y, w, h) {
    const b = L.box;
    if (!b) return;
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x + w > b[2]) b[2] = x + w; if (y + h > b[3]) b[3] = y + h;
  }
  // put the (x, y, w, h) part of a layer on the screen, turned by a radians around (cx, cy)
  function drawLayer(go, canvas, x, y, w, h, cx, cy, a) {
    const g = go.g;
    if (!applyClip(g)) return;
    const ctx = g.ctx, c = Math.cos(a), sn = Math.sin(a);
    ctx.setTransform(c, sn, -sn, c, cx - c * cx + sn * cy, cy - sn * cx - c * cy);
    ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const rgbCache = new Map();
  function drawString(g, s, x, y, a) {
    if (!applyClip(g) || !s) return;
    const ctx = g.ctx, f = g.font;
    ctx.font = f.css;
    if (a === 0) a = 20;
    ctx.textAlign = a & 1 ? 'center' : a & 8 ? 'right' : 'left';
    let yy = y + g.ty;
    if (a & 32) yy -= f.height; else if (a & 64) yy -= f.baseline;
    ctx.textBaseline = 'top';
    touch(g, g.cx, yy, g.cw, f.height);
    fill(g);
    ctx.fillText(s, x + g.tx, yy + 1);
  }
  function arcPath(g, x, y, w, h, sa, aa, pie) {
    const ctx = g.ctx;
    touch(g, x + g.tx, y + g.ty, w + 1, h + 1);
    const cx = x + g.tx + w / 2, cy = y + g.ty + h / 2;
    ctx.beginPath();
    if (Math.abs(aa) >= 360) { ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
    if (pie) ctx.moveTo(cx, cy);
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, -sa * Math.PI / 180, -(sa + aa) * Math.PI / 180, aa > 0);
    if (pie) ctx.closePath();
  }
  const G = (fn) => (t, o, ...a) => fn(o.g, ...a);
  N('javax/microedition/lcdui/Graphics', {
    m: {
      'setColor(I)V': G((g, c) => setColor(g, c)),
      'setColor(III)V': G((g, r, gg, b) => setColor(g, ((r & 255) << 16) | ((gg & 255) << 8) | (b & 255))),
      'getColor()I': G((g) => g.color),
      'setGrayScale(I)V': G((g, v) => setColor(g, (v << 16) | (v << 8) | v)),
      'getDisplayColor(I)I': (t, o, c) => c & 0xffffff,
      'setFont(Ljavax/microedition/lcdui/Font;)V': G((g, f) => { g.font = f || getFont(0, 0, 0); }),
      'getFont()Ljavax/microedition/lcdui/Font;': G((g) => g.font),
      'setStrokeStyle(I)V': () => {}, 'getStrokeStyle()I': () => 0,
      'translate(II)V': G((g, x, y) => { g.tx += x; g.ty += y; }),
      'getTranslateX()I': G((g) => g.tx), 'getTranslateY()I': G((g) => g.ty),
      'setClip(IIII)V': G((g, x, y, w, h) => {
        x += g.tx; y += g.ty;
        const x2 = Math.min(x + w, g.img.w), y2 = Math.min(y + h, g.img.h);
        g.cx = Math.max(0, x); g.cy = Math.max(0, y); g.cw = Math.max(0, x2 - g.cx); g.ch = Math.max(0, y2 - g.cy);
      }),
      'clipRect(IIII)V': G((g, x, y, w, h) => {
        x += g.tx; y += g.ty;
        const nx = Math.max(g.cx, x), ny = Math.max(g.cy, y);
        const x2 = Math.min(g.cx + g.cw, x + w), y2 = Math.min(g.cy + g.ch, y + h);
        g.cx = nx; g.cy = ny; g.cw = Math.max(0, x2 - nx); g.ch = Math.max(0, y2 - ny);
      }),
      'getClipX()I': G((g) => g.cx - g.tx), 'getClipY()I': G((g) => g.cy - g.ty),
      'getClipWidth()I': G((g) => g.cw), 'getClipHeight()I': G((g) => g.ch),
      'fillRect(IIII)V': G((g, x, y, w, h) => { if (applyClip(g)) { fill(g); frect(g, x, y, w, h); } }),
      'drawRect(IIII)V': G((g, x, y, w, h) => {
        if (w < 0 || h < 0 || !applyClip(g)) return;
        fill(g);
        frect(g, x, y, w + 1, 1); frect(g, x, y + h, w + 1, 1);
        frect(g, x, y + 1, 1, h - 1); frect(g, x + w, y + 1, 1, h - 1);
      }),
      'fillRoundRect(IIIIII)V': G((g, x, y, w, h) => { if (applyClip(g)) { fill(g); frect(g, x, y, w, h); } }),
      'drawRoundRect(IIIIII)V': G((g, x, y, w, h) => {
        if (w < 0 || h < 0 || !applyClip(g)) return;
        fill(g); frect(g, x + 1, y, w - 1, 1); frect(g, x + 1, y + h, w - 1, 1); frect(g, x, y + 1, 1, h - 1); frect(g, x + w, y + 1, 1, h - 1);
      }),
      'drawLine(IIII)V': G((g, a, b, c, d) => { if (applyClip(g)) { fill(g); line(g, a, b, c, d); } }),
      'fillArc(IIIIII)V': G((g, x, y, w, h, sa, aa) => { if (applyClip(g) && w > 0 && h > 0) { fill(g); arcPath(g, x, y, w, h, sa, aa, true); g.ctx.fill(); } }),
      'drawArc(IIIIII)V': G((g, x, y, w, h, sa, aa) => {
        if (!applyClip(g)) return;
        g.ctx.strokeStyle = g.css; g.ctx.lineWidth = 1;
        arcPath(g, x + 0.5, y + 0.5, w, h, sa, aa, false); g.ctx.stroke();
      }),
      'fillTriangle(IIIIII)V': G((g, x1, y1, x2, y2, x3, y3) => {
        if (!applyClip(g)) return; fill(g);
        touch(g, Math.min(x1, x2, x3) + g.tx, Math.min(y1, y2, y3) + g.ty, Math.max(x1, x2, x3) - Math.min(x1, x2, x3) + 1, Math.max(y1, y2, y3) - Math.min(y1, y2, y3) + 1);
        const c = g.ctx; c.beginPath(); c.moveTo(x1 + g.tx, y1 + g.ty); c.lineTo(x2 + g.tx, y2 + g.ty); c.lineTo(x3 + g.tx, y3 + g.ty); c.closePath(); c.fill();
      }),
      'drawString(Ljava/lang/String;III)V': G((g, s, x, y, a) => drawString(g, s.s, x, y, a)),
      'drawSubstring(Ljava/lang/String;IIIII)V': G((g, s, o, l, x, y, a) => drawString(g, s.s.substr(o, l), x, y, a)),
      'drawChar(CIII)V': G((g, c, x, y, a) => drawString(g, String.fromCharCode(c), x, y, a)),
      'drawChars([CIIIII)V': G((g, c, o, l, x, y, a) => drawString(g, String.fromCharCode.apply(null, c.subarray(o, o + l)), x, y, a)),
      'drawImage(Ljavax/microedition/lcdui/Image;III)V': G((g, img, x, y, a) => {
        if (img === null) NPE();
        if (!applyClip(g)) return;
        const [dx, dy] = anchorImg(x + g.tx, y + g.ty, img.w, img.h, a);
        touch(g, dx, dy, img.w, img.h);
        if (state.layer) { layerBox(state.layer, dx, dy, img.w, img.h); state.layer.ctx.drawImage(img.canvas, dx - state.layer.ox, dy - state.layer.oy); return; }
        g.ctx.drawImage(img.canvas, dx, dy);
      }),
      'drawRegion(Ljavax/microedition/lcdui/Image;IIIIIIII)V': G((g, img, sx, sy, w, h, tr, x, y, a) => {
        if (img === null) NPE();
        drawRegion(g, img, sx, sy, w, h, tr, x, y, a);
      }),
      'drawRGB([IIIIIIIZ)V': G((g, rgb, off, scan, x, y, w, h, alpha) => {
        if (w <= 0 || h <= 0 || !applyClip(g)) return;
        // Sprites are decoded to ARGB every frame; identical pixel blocks repeat, so cache them as canvases.
        let h1 = 0x811c9dc5 ^ w, h2 = (h * 2654435761) | (alpha ? 1 : 0);
        for (let yy = 0; yy < h; yy++) {
          const row = off + yy * scan;
          for (let xx = 0; xx < w; xx++) { const v = rgb[row + xx]; h1 = Math.imul(h1 ^ v, 16777619); h2 = (Math.imul(h2, 31) + v) | 0; }
        }
        const key = w + ':' + h + ':' + h1 + ':' + h2;
        let c = rgbCache.get(key);
        if (c) { rgbCache.delete(key); rgbCache.set(key, c); }
        else {
          c = makeCanvas(w, h);
          c.getContext('2d').putImageData(new ImageData(argbToRGBA(rgb, off, scan, w, h, alpha), w, h), 0, 0);
          rgbCache.set(key, c);
          if (rgbCache.size > 4000) rgbCache.delete(rgbCache.keys().next().value);
        }
        touch(g, x + g.tx, y + g.ty, w, h);
        if (state.layer) { layerBox(state.layer, x + g.tx, y + g.ty, w, h); state.layer.ctx.drawImage(c, x + g.tx - state.layer.ox, y + g.ty - state.layer.oy); return; }
        g.ctx.drawImage(c, x + g.tx, y + g.ty);
      }),
      'copyArea(IIIIIII)V': G((g, sx, sy, w, h, dx, dy, a) => {
        const [x, y] = anchorImg(dx + g.tx, dy + g.ty, w, h, a);
        const tmp = makeCanvas(w, h); tmp.getContext('2d').drawImage(g.img.canvas, sx + g.tx, sy + g.ty, w, h, 0, 0, w, h);
        if (applyClip(g)) { touch(g, x, y, w, h); g.ctx.drawImage(tmp, x, y); }
      }),
    },
  });

  // ---------------- Media ----------------
  N('javax/microedition/media/Manager', {
    m: {
      '$createPlayer(Ljava/io/InputStream;Ljava/lang/String;)Ljavax/microedition/media/Player;': (t, is, type) => {
        if (is === null) VM.throwNew('java/lang/IllegalArgumentException');
        const p = VM.newObject(VM.loadClass('j2meweb/PlayerImpl'));
        p.data = is.pos === 0 ? is.buf : is.buf.subarray(is.pos);
        is.pos = is.buf.length;
        p.type = jstr(type);
        p.state = 100; p.loops = 1; p.volume = 100;
        return p;
      },
      '$playTone(III)V': () => {},
      '$getSupportedContentTypes(Ljava/lang/String;)[Ljava/lang/String;': () => {
        const a = VM.newArray('Ljava/lang/String;', 2); a[0] = VM.str('audio/midi'); a[1] = VM.str('audio/x-wav'); return a;
      },
    },
  });
  for (const n of ['javax/microedition/media/Controllable', 'javax/microedition/media/Player', 'javax/microedition/media/Control',
    'javax/microedition/media/control/VolumeControl', 'javax/microedition/media/PlayerListener'])
    N(n, { iface: true, m: {} });
  N('j2meweb/PlayerImpl', {
    ifaces: ['javax/microedition/media/Player'],
    m: {
      'realize()V': (t, p) => { if (p.state < 200) p.state = 200; },
      'prefetch()V': (t, p) => { if (p.state < 300) p.state = 300; SoundEngine.prepare(p); },
      'start()V': (t, p) => { if (p.state === 0) VM.throwNew('java/lang/IllegalStateException'); p.state = 400; SoundEngine.start(p); },
      'stop()V': (t, p) => { if (p.state === 400) p.state = 300; SoundEngine.stop(p); },
      'close()V': (t, p) => { SoundEngine.stop(p); p.state = 0; },
      'deallocate()V': (t, p) => { SoundEngine.stop(p); if (p.state > 200) p.state = 200; },
      'getState()I': (t, p) => p.state,
      'setLoopCount(I)V': (t, p, n) => { p.loops = n; },
      'getDuration()J': () => -1n,
      'getMediaTime()J': () => 0n,
      'setMediaTime(J)J': () => 0n,
      'addPlayerListener(Ljavax/microedition/media/PlayerListener;)V': () => {},
      'getContentType()Ljava/lang/String;': (t, p) => VM.str(p.type),
      'getControl(Ljava/lang/String;)Ljavax/microedition/media/Control;': (t, p, name) => {
        if (!/Volume/.test(jstr(name))) return null;
        const c = VM.newObject(VM.loadClass('j2meweb/VolumeImpl')); c.player = p; return c;
      },
      'getControls()[Ljavax/microedition/media/Control;': () => VM.newArray('Ljavax/microedition/media/Control;', 0),
    },
  });
  N('j2meweb/VolumeImpl', {
    ifaces: ['javax/microedition/media/control/VolumeControl'],
    m: {
      'setLevel(I)I': (t, c, l) => { c.player.volume = Math.max(0, Math.min(100, l)); SoundEngine.volume(c.player); return c.player.volume; },
      'getLevel()I': (t, c) => c.player.volume,
      'setMute(Z)V': (t, c, m) => { c.player.muted = !!m; SoundEngine.volume(c.player); },
      'isMuted()Z': (t, c) => !!c.player.muted,
    },
  });

  // ---------------- RMS (saves) ----------------
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i] & 255); return btoa(s); };
  const unb64 = (s) => { const b = atob(s); const a = VM.newArray('B', b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const storeKey = (name) => state.storagePrefix + 'rms:' + name;
  function loadStore(name) { try { const v = localStorage.getItem(storeKey(name)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveStore(rs) {
    try { localStorage.setItem(storeKey(rs.name), JSON.stringify({ next: rs.next, recs: rs.recs })); } catch (e) { console.warn('save failed', e); }
    if (MIDP.onSave) MIDP.onSave();
  }
  const getRec = (rs, id) => { const r = rs.recs[id]; if (r === undefined) VM.throwNew('javax/microedition/rms/InvalidRecordIDException'); return r; };
  N('javax/microedition/rms/RecordStore', {
    m: {
      '$openRecordStore(Ljava/lang/String;Z)Ljavax/microedition/rms/RecordStore;': (t, name, create) => {
        const n = jstr(name);
        let d = loadStore(n);
        if (!d) {
          if (!create) VM.throwNew('javax/microedition/rms/RecordStoreNotFoundException', n);
          d = { next: 1, recs: {} };
        }
        const rs = VM.newObject(VM.loadClass('javax/microedition/rms/RecordStore'));
        rs.name = n; rs.next = d.next; rs.recs = d.recs;
        saveStore(rs);
        return rs;
      },
      '$deleteRecordStore(Ljava/lang/String;)V': (t, name) => {
        const n = jstr(name);
        if (!loadStore(n)) VM.throwNew('javax/microedition/rms/RecordStoreNotFoundException', n);
        try { localStorage.removeItem(storeKey(n)); } catch (e) {}
      },
      '$listRecordStores()[Ljava/lang/String;': () => {
        const names = [];
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(state.storagePrefix + 'rms:')) names.push(k.substring((state.storagePrefix + 'rms:').length)); } } catch (e) {}
        if (!names.length) return null;
        const a = VM.newArray('Ljava/lang/String;', names.length); names.forEach((n, i) => (a[i] = VM.str(n))); return a;
      },
      'closeRecordStore()V': () => {},
      'addRecord([BII)I': (t, rs, b, off, len) => {
        const id = rs.next++;
        rs.recs[id] = b === null ? '' : b64(new Uint8Array(b.buffer, b.byteOffset + off, len));
        saveStore(rs); return id;
      },
      'setRecord(I[BII)V': (t, rs, id, b, off, len) => {
        getRec(rs, id);
        rs.recs[id] = b === null ? '' : b64(new Uint8Array(b.buffer, b.byteOffset + off, len));
        saveStore(rs);
      },
      'getRecord(I)[B': (t, rs, id) => { const r = getRec(rs, id); return r === '' ? null : unb64(r); },
      'getRecord(I[BI)I': (t, rs, id, buf, off) => { const a = unb64(getRec(rs, id)); buf.set(a, off); return a.length; },
      'getRecordSize(I)I': (t, rs, id) => atob(getRec(rs, id)).length,
      'deleteRecord(I)V': (t, rs, id) => { getRec(rs, id); delete rs.recs[id]; saveStore(rs); },
      'getNumRecords()I': (t, rs) => Object.keys(rs.recs).length,
      'getNextRecordID()I': (t, rs) => rs.next,
      'getSize()I': (t, rs) => JSON.stringify(rs.recs).length,
      'getSizeAvailable()I': () => 1 << 20,
      'getName()Ljava/lang/String;': (t, rs) => VM.str(rs.name),
      'getVersion()I': () => 1,
      'enumerateRecords(Ljavax/microedition/rms/RecordFilter;Ljavax/microedition/rms/RecordComparator;Z)Ljavax/microedition/rms/RecordEnumeration;': (t, rs) => {
        const e = VM.newObject(VM.loadClass('j2meweb/RecordEnumImpl'));
        e.rs = rs; e.ids = Object.keys(rs.recs).map(Number).sort((a, b) => b - a); e.i = 0;
        return e;
      },
    },
  });
  for (const n of ['RecordEnumeration', 'RecordFilter', 'RecordComparator', 'RecordListener']) N('javax/microedition/rms/' + n, { iface: true, m: {} });
  N('j2meweb/RecordEnumImpl', {
    ifaces: ['javax/microedition/rms/RecordEnumeration'],
    m: {
      'hasNextElement()Z': (t, e) => e.i < e.ids.length,
      'hasPreviousElement()Z': (t, e) => e.i > 0,
      'nextRecordId()I': (t, e) => { if (e.i >= e.ids.length) VM.throwNew('javax/microedition/rms/InvalidRecordIDException'); return e.ids[e.i++]; },
      'nextRecord()[B': (t, e) => { if (e.i >= e.ids.length) VM.throwNew('javax/microedition/rms/InvalidRecordIDException'); return unb64(e.rs.recs[e.ids[e.i++]]); },
      'previousRecordId()I': (t, e) => e.ids[--e.i],
      'numRecords()I': (t, e) => e.ids.length,
      'reset()V': (t, e) => { e.i = 0; },
      'destroy()V': () => {},
      'rebuild()V': (t, e) => { e.ids = Object.keys(e.rs.recs).map(Number).sort((a, b) => b - a); e.i = 0; },
      'keepUpdated(Z)V': () => {}, 'isKeptUpdated()Z': () => false,
    },
  });

  // ---------------- public API ----------------
  return {
    state, get SW() { return SW; }, get SH() { return SH; },
    setScreen(w, h) { SW = w; SH = h; },
    present(img) { blit(img || state.backImage); },
    newGraphics, makeImage, drawLayer,
    // fill a rectangle on a Java Graphics with a given colour, leaving its current colour as it was
    fillRectWith(go, x, y, w, h, color) {
      const g = go.g, c = g.color, css = g.css;
      setColor(g, color);
      if (applyClip(g)) { fill(g); frect(g, x, y, w, h); }
      g.color = c; g.css = css;
    },
    vibration: true,
    onSave: null,
    boot(files, screenCanvas, opts = {}) {
      VM.files = files;
      state.storagePrefix = opts.storagePrefix || 'j2me:';
      VM.StringClass = VM.loadClass('java/lang/String');
      const mf = files['META-INF/MANIFEST.MF'];
      if (mf) for (const line of new TextDecoder().decode(mf).split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) VM.manifest[line.substring(0, i).trim()] = line.substring(i + 1).trim(); }
      Object.assign(VM.manifest, opts.props || {});
      state.screenCtx = screenCanvas.getContext('2d');
      state.screenCtx.imageSmoothingEnabled = false;
      state.screenImage = makeImage(SW, SH, true);
      const main = (VM.manifest['MIDlet-1'] || '').split(',').pop().trim().replace(/\./g, '/');
      if (opts.beforeStart) opts.beforeStart();
      const cls = VM.loadClass(main);
      const obj = VM.newObject(cls);
      state.midletObj = obj;
      const t = { frames: [], sleepUntil: 0, done: false, name: 'main' };
      VM.pushFrame(t, VM.findMethod(cls, 'startApp()V'), [obj]);
      VM.pushFrame(t, VM.findMethod(cls, '<init>()V'), [obj]);
      VM.ensureInit(t, cls);
      VM.addThread(t);
      VM.start();
    },
    key(code, down) {
      const c = state.current;
      if (!c) return;
      VM.events.push(() => VM.spawn('key', c, down ? 'keyPressed(I)V' : 'keyReleased(I)V', [code]));
    },
    visibility(visible) {
      const c = state.current;
      if (!c) return;
      if (visible) VM.events.push(() => VM.spawn('show', c, 'showNotify()V', []));
      else VM.events.push(() => VM.spawn('hide', c, 'hideNotify()V', []));
    },
  };
})();
