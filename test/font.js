const H = require('./helpers');
(async () => {
  const { b, p } = await H.open();
  await p.waitForTimeout(12000);
  const r = await p.evaluate(() => {
    const A = VM.classes.get('a'), d = VM.classes.get('d');
    const D = A.sv.D;
    const out = {}; out.map = 'AÁÉÍÓÚÑÜ¿¡NEaá'.split('').map(c => c + '=' + (D[c.charCodeAt(0)] & 255)).join(' ');
    for (const name of ['cX', 'cW']) {
      const f = d.sv[name]; if (!f) { out[name] = 'null'; continue; }
      const h = f['a.h'], g = f['a.g'];
      const ok = [];
      for (let c = 32; c < 256; c++) { const n = D[c] & 255; if (n < h.length && g[n] !== 0) ok.push(String.fromCharCode(c)); }
      out[name] = ok.join('');
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
