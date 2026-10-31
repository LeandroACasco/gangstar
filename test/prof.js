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
    for (const t of VM.threads) t.sleepUntil = Infinity;
    const G = VM.classes.get('javax/microedition/lcdui/Graphics');
    let nat = 0, calls = 0;
    for (const [k, m] of G.methods) { const f = m.fn; m.fn = (...a) => { const s = performance.now(); const r = f(...a); nat += performance.now() - s; calls++; return r; }; }
    const d = VM.classes.get('d');
    const N = 30; const t0 = performance.now();
    for (let i = 0; i < N; i++) { d.sv.bQ = 1; VM.callSync('d', 'ac()V', []); d.sv.bQ = 0; }
    const tot = (performance.now() - t0) / N;
    return { msPerRender: tot, nativeGfxMs: nat / N, gfxCalls: calls / N };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
