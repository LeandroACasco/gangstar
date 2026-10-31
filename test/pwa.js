const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 780 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
  await p.goto('http://localhost:8765/');
  await p.waitForTimeout(1500);
  console.log('setup visible', await p.isVisible('#setup'));
  await p.screenshot({ path: 'test/pwa-setup.png' });
  await p.setInputFiles('#dataIn', 'dist/gangstar-datos.zip');
  await p.waitForTimeout(12000);
  console.log('setup visible after pick', await p.isVisible('#setup'), 'frames', await p.evaluate(() => MIDP.state.frames));
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
  console.log('service worker', sw);
  await p.reload(); await p.waitForTimeout(3000);
  console.log('after reload: setup visible', await p.isVisible('#setup'));
  await p.waitForTimeout(6000);
  const d = await p.evaluate(() => document.getElementById('screen').toDataURL()); require('fs').writeFileSync('test/pwa-game.png', Buffer.from(d.split(',')[1], 'base64'));
  // offline
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(9000);
  console.log('offline: frames', await p.evaluate(() => MIDP.state.frames), 'setup', await p.isVisible('#setup'));
  const m = await (await ctx.request.get('http://localhost:8765/manifest.webmanifest').catch(() => null));
  await b.close();
})();
