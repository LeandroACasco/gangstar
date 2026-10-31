const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
  const k = async (c, ms = 150) => { await p.evaluate((c) => __midp.key(c, true), c); await p.waitForTimeout(ms); await p.evaluate((c) => __midp.key(c, false), c); };
  await p.waitForTimeout(9000); await k(-5); await p.waitForTimeout(2500); await k(-5); await p.waitForTimeout(2000); await k(-5);
  await p.waitForTimeout(9000); await k(-7); await p.waitForTimeout(2000); await k(-7); await p.waitForTimeout(2000);
  await p.evaluate(() => __midp.key(-2, true)); await p.waitForTimeout(1500);
  const res = await p.evaluate(() => {
    const VM = __vm;
    for (const t of VM.threads) t.sleepUntil = Infinity; // freeze game
    const user = ['d', 'b', 'a', 'c', 'GloftGANG'];
    function snap() {
      const out = new Map(), seen = new Set();
      const walk = (v, path, depth) => {
        if (v === null || v === undefined) return;
        if (typeof v !== 'object') { out.set(path, v); return; }
        if (v instanceof JStr) { out.set(path, 'S:' + v.s); return; }
        if (seen.has(v)) return; seen.add(v);
        if (ArrayBuffer.isView(v)) { if (v.length < 5000) out.set(path, Array.from(v).join(',')); else out.set(path, 'len' + v.length + ':' + v.reduce((a, x, i) => (a * 31 + x * (i + 1)) | 0, 0)); return; }
        if (Array.isArray(v)) { if (depth < 6) v.forEach((x, i) => walk(x, path + '[' + i + ']', depth + 1)); return; }
        if (v instanceof JObj && user.includes(v.cls.name)) { for (const k of Object.keys(v)) if (k !== 'cls') walk(v[k], path + '.' + k, depth + 1); }
      };
      for (const n of user) { const c = VM.classes.get(n); for (const k in c.sv) walk(c.sv[k], n + '.' + k, 0); }
      return out;
    }
    const s1 = snap();
    const d = VM.classes.get('d');
    const T = d.sv.T, bQ = d.sv.bQ;
    d.sv.bQ = 1;
    VM.callSync('d', 'ac()V', []);
    const bQafter = d.sv.bQ;
    d.sv.bQ = bQ;
    const s2 = snap();
    const diffs = [];
    for (const [k, v] of s2) if (s1.get(k) !== v) diffs.push(k + ': ' + String(s1.get(k)).slice(0, 60) + ' -> ' + String(v).slice(0, 60));
    for (const k of s1.keys()) if (!s2.has(k)) diffs.push('removed ' + k);
    return { T, bQ, bQafter, n: s1.size, diffs, fU: d.sv.fU, fV: d.sv.fV };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
