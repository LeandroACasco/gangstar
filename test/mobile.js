const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const ctl of ['game', 'phone']) for (const [name, vp] of [['portrait', { width: 393, height: 780 }], ['landscape', { width: 851, height: 393 }]]) {
    const p = await b.newPage({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
    await p.addInitScript((c) => localStorage.setItem('gangstar:ui:ctl', JSON.stringify(c)), ctl);
    await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
    await p.waitForTimeout(800);
    await p.tap('#overlay');
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `test/m-${ctl}-${name}.png` });
    const s = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight, document.getElementById('screenWrap').offsetWidth]);
    console.log(ctl, name, s);
    await p.close();
  }
  await b.close();
})();
