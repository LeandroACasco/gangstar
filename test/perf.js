const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
  const k = async (c, ms = 150) => { await p.evaluate((c) => __midp.key(c, true), c); await p.waitForTimeout(ms); await p.evaluate((c) => __midp.key(c, false), c); };
  await p.waitForTimeout(9000); await k(-5); await p.waitForTimeout(2500); await k(-5); await p.waitForTimeout(2000); await k(-5);
  await p.waitForTimeout(9000); await k(-7); await p.waitForTimeout(2000); await k(-7); await p.waitForTimeout(2000);
  await p.evaluate(() => { const r = __vm.run.bind(__vm); window.__busy = 0; __vm.run = (t, b) => { const s = performance.now(); const x = r(t, b); __busy += performance.now() - s; return x; }; });
  await p.evaluate(() => __midp.key(-2, true)); await p.waitForTimeout(4000); await p.evaluate(() => __midp.key(-2, false));
  console.log('busy ms per second:', (await p.evaluate(() => __busy)) / 4);
  console.log('storage:', await p.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k).length)));
  await b.close();
})();
