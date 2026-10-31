const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true });
  const logs = [];
  p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
  const steps = JSON.parse(process.argv[2] || '[]');
  let i = 0;
  for (const s of steps) {
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.key) { await p.evaluate((k) => { __midp.key(k, true); }, s.key); await p.waitForTimeout(150); await p.evaluate((k) => { __midp.key(k, false); }, s.key); }
    if (s.hold) { await p.evaluate((k) => __midp.key(k, true), s.hold); await p.waitForTimeout(s.ms); await p.evaluate((k) => __midp.key(k, false), s.hold); }
    if (s.fps) { const f0 = await p.evaluate(() => __midp.state.frames); await p.waitForTimeout(3000); const f1 = await p.evaluate(() => __midp.state.frames); console.log('fps', (f1 - f0) / 3); }
    if (s.shot) { const d = await p.evaluate(() => document.getElementById('screen').toDataURL()); require('fs').writeFileSync('test/' + s.shot + '.png', Buffer.from(d.split(',')[1], 'base64')); }
    if (s.page) await p.screenshot({ path: 'test/' + s.page + '.png' });
  }
  const st = await p.evaluate(() => ({ frames: __midp.state.frames, errors: __vm.errors, threads: __vm.threads.map(t => t.name + ':' + t.frames.length) }));
  console.log(JSON.stringify(st));
  console.log(logs.slice(0, 40).join('\n'));
  await b.close();
})();
