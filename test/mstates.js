const H = require('./helpers');
(async () => {
  const { b, p, toGameplay } = await H.open({ width: 393, height: 780 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await toGameplay();
  await p.evaluate(() => SaveState.saveSlot(1, 'es'));
  await p.tap('#btnStates'); await p.waitForTimeout(800);
  await p.screenshot({ path: 'test/m-states.png' });
  await b.close();
})();
