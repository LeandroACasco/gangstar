const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
  const k = async (c, ms = 150) => { await p.evaluate((c) => __midp.key(c, true), c); await p.waitForTimeout(ms); await p.evaluate((c) => __midp.key(c, false), c); };
  await p.waitForTimeout(9000); await k(-5); await p.waitForTimeout(2500); await k(-5); await p.waitForTimeout(2000); await k(-5);
  await p.waitForTimeout(9000); await k(-7); await p.waitForTimeout(2000); await k(-7); await p.waitForTimeout(2000);
  await p.waitForTimeout(3000); await k(-2, 1500); await p.waitForTimeout(500); await p.evaluate(() => __midp.key(-1, true)); await p.waitForTimeout(600);
  const s0 = await p.evaluate(() => ({ ...Gangstar.stats }));
  const trace = await p.evaluate(() => new Promise((res) => {
    const D = VM.classes.get('d'); const out = []; const orig = VM.callSync.bind(VM);
    VM.callSync = (c, k, a) => { const pl = D.sv.cd; out.push([Math.round(performance.now()), D.sv.fV, pl['b.b'] >> 8, 'r']); return orig(c, k, a); };
    const fh = MIDP.state.flushHook; MIDP.state.flushHook = (img) => { const pl = D.sv.cd; out.push([Math.round(performance.now()), D.sv.fV, pl['b.b'] >> 8, 'TICK']); return fh(img); };
    setTimeout(() => { VM.callSync = orig; MIDP.state.flushHook = fh; res(out); }, 400);
  }));
  console.log(trace.map((x) => x.join(' ')).join('\n'));
  // grab 12 consecutive presented frames ~16ms apart
  const shots = [];
  for (let i = 0; i < 12; i++) { shots.push(await p.evaluate(() => document.getElementById('screen').toDataURL())); await p.waitForTimeout(10); }
  await p.waitForTimeout(2000);
  const s1 = await p.evaluate(() => ({ ...Gangstar.stats }));
  await p.evaluate(() => __midp.key(-1, false));
  const fs = require('fs');
  shots.forEach((d, i) => fs.writeFileSync('test/f' + i + '.png', Buffer.from(d.split(',')[1], 'base64')));
  const dt = 2 + 12 * 0.03;
  console.log('renders/s', ((s1.renders - s0.renders) / dt).toFixed(1), 'ticks/s', ((s1.ticks - s0.ticks) / dt).toFixed(1), 'ms/render', ((s1.renderMs - s0.renderMs) / (s1.renders - s0.renders)).toFixed(2));
  console.log('tracked', await p.evaluate(() => [Gangstar.tracked.length, Gangstar.actors.length]));
  await b.close();
})();
