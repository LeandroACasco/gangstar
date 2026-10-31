// Minimal synchronous DEFLATE decoder (RFC 1951) + zip + PNG decoding.
const Inflate = (() => {
  const LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEXT  = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DEXT  = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  function buildTree(lengths, n) {
    const counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(n);
    for (let i = 0; i < n; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    for (let i = 0; i < n; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
    return { counts, syms };
  }
  let fixedL = null, fixedD = null;
  function fixed() {
    if (fixedL) return;
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    fixedL = buildTree(l, 288);
    const d = new Uint8Array(30).fill(5);
    fixedD = buildTree(d, 30);
  }

  function inflateRaw(src, start = 0, sizeHint = 0) {
    let pos = start, bitbuf = 0, bitcnt = 0;
    let out = new Uint8Array(Math.max(sizeHint, src.length * 4, 1024)), op = 0;
    const ensure = (n) => {
      if (op + n <= out.length) return;
      let nl = out.length * 2; while (nl < op + n) nl *= 2;
      const o = new Uint8Array(nl); o.set(out.subarray(0, op)); out = o;
    };
    const bits = (n) => {
      while (bitcnt < n) { bitbuf |= (src[pos++] | 0) << bitcnt; bitcnt += 8; }
      const v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v;
    };
    const decode = (t) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = t.counts[len];
        if (code - count < first) return t.syms[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('bad huffman code');
    };
    let final = 0;
    do {
      final = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        ensure(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      } else {
        let lt, dt;
        if (type === 1) { fixed(); lt = fixedL; dt = fixedD; }
        else {
          const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
          const cl = new Uint8Array(19);
          for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
          const ct = buildTree(cl, 19);
          const lens = new Uint8Array(hlit + hdist);
          for (let i = 0; i < hlit + hdist;) {
            const sym = decode(ct);
            if (sym < 16) lens[i++] = sym;
            else if (sym === 16) { const p = lens[i - 1]; let r = 3 + bits(2); while (r--) lens[i++] = p; }
            else if (sym === 17) { let r = 3 + bits(3); while (r--) lens[i++] = 0; }
            else { let r = 11 + bits(7); while (r--) lens[i++] = 0; }
          }
          lt = buildTree(lens.subarray(0, hlit), hlit);
          dt = buildTree(lens.subarray(hlit), hdist);
        }
        for (;;) {
          const sym = decode(lt);
          if (sym < 256) { ensure(1); out[op++] = sym; }
          else if (sym === 256) break;
          else {
            const li = sym - 257;
            const len = LBASE[li] + bits(LEXT[li]);
            const di = decode(dt);
            const dist = DBASE[di] + bits(DEXT[di]);
            ensure(len);
            for (let k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
          }
        }
      }
    } while (!final);
    return out.subarray(0, op);
  }
  return { inflateRaw };
})();

// Read a zip archive (stored/deflated) into {name: Uint8Array}
function unzip(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip/jar');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = u.subarray(ds, ds + csize);
    files[name] = method === 0 ? raw.slice() : Inflate.inflateRaw(raw, 0, usize).slice();
  }
  return files;
}

// Decode PNG bytes into {w, h, data: Uint8ClampedArray RGBA}. CRCs are ignored on purpose.
function decodePNG(b) {
  if (b[0] !== 0x89 || b[1] !== 0x50) throw new Error('not png');
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, pal = null, trns = null;
  const idat = []; let idatLen = 0;
  while (p + 8 <= b.length) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
      h = ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) >>> 0;
      depth = d[8]; ctype = d[9]; interlace = d[12];
    } else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') { idat.push(d); idatLen += d.length; }
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const z = new Uint8Array(idatLen); let o = 0;
  for (const c of idat) { z.set(c, o); o += c.length; }
  const raw = Inflate.inflateRaw(z, 2);
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = Math.max(1, (chans * depth) >> 3);
  const out = new Uint8ClampedArray(w * h * 4);

  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  let rp = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil(pw * chans * depth / 8);
    let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let y = 0; y < ph; y++) {
      const ft = raw[rp++];
      for (let i = 0; i < stride; i++) {
        const x = raw[rp++] | 0, a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v;
        switch (ft) {
          case 0: v = x; break;
          case 1: v = x + a; break;
          case 2: v = x + up; break;
          case 3: v = x + ((a + up) >> 1); break;
          default: { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
            v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
        }
        cur[i] = v;
      }
      const yy = y0 + y * dy;
      for (let xi = 0; xi < pw; xi++) {
        const di = ((yy * w) + x0 + xi * dx) * 4;
        const sample = (ci) => {
          if (depth === 8) return cur[xi * chans + ci];
          if (depth === 16) return cur[(xi * chans + ci) * 2];
          const bitpos = (xi * chans + ci) * depth;
          return (cur[bitpos >> 3] >> (8 - depth - (bitpos & 7))) & ((1 << depth) - 1);
        };
        let r, g, bb, al = 255;
        if (ctype === 3) {
          const ix = sample(0);
          r = pal[ix * 3]; g = pal[ix * 3 + 1]; bb = pal[ix * 3 + 2];
          if (trns && ix < trns.length) al = trns[ix];
        } else if (ctype === 0 || ctype === 4) {
          let v = sample(0); const raw0 = v;
          if (depth < 8) v = Math.round(v * 255 / ((1 << depth) - 1));
          r = g = bb = v;
          if (ctype === 4) al = sample(1);
          else if (trns && trns.length >= 2 && ((trns[0] << 8) | trns[1]) === raw0) al = 0;
        } else {
          r = sample(0); g = sample(1); bb = sample(2);
          if (ctype === 6) al = sample(3);
          else if (trns && trns.length >= 6 && trns[1] === r && trns[3] === g && trns[5] === bb) al = 0;
        }
        out[di] = r; out[di + 1] = g; out[di + 2] = bb; out[di + 3] = al;
      }
      const t = prev; prev = cur; cur = t;
    }
  }
  return { w, h, data: out };
}
