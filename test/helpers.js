const { chromium } = require('playwright');
exports.open = async (vp = { width: 420, height: 860 }, extra = {}) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: vp, ...extra });
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html' + (process.env.GQ || ''));  // GQ='?w=432' tests a wide screen
  const k = async (c, ms = 150) => { await p.evaluate((c) => __midp.key(c, true), c); await p.waitForTimeout(ms); await p.evaluate((c) => __midp.key(c, false), c); };
  const shot = async (name) => { const d = await p.evaluate(() => document.getElementById('screen').toDataURL()); require('fs').writeFileSync('test/' + name + '.png', Buffer.from(d.split(',')[1], 'base64')); };
  const hud = () => p.evaluate(() => { const c = document.getElementById('screen').getContext('2d').getImageData(0, 300, 240, 20).data; let n = 0; for (let i = 0; i < c.length; i += 4) if (c[i] > 150 && c[i + 2] > 100 && c[i + 1] < 120) n++; return n; });
  const pos = () => p.evaluate(() => { const c = VM.classes.get('d').sv.cd; return c ? [c['b.a'] >> 8, c['b.b'] >> 8] : null; });
  const toGameplay = async () => {
    await p.waitForTimeout(9000); await k(-5); await p.waitForTimeout(2500); await k(-5); await p.waitForTimeout(2000); await k(-5);
    await p.waitForTimeout(8000);
    for (let i = 0; i < 40; i++) { if ((await hud()) > 200) return true; await k(i % 3 === 0 ? -7 : 53); await p.waitForTimeout(600); }
    return false;
  };
  return { b, p, k, shot, hud, pos, toGameplay };
};
