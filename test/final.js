const H = require('./helpers');
(async () => {
  const { b, p, toGameplay } = await H.open({ width: 393, height: 780 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await toGameplay();
  await p.evaluate(() => __midp.key(50, true)); await p.waitForTimeout(600);
  await p.screenshot({ path: 'test/final-phone.png' });
  await p.evaluate(() => __midp.key(50, false));
  console.log(await p.evaluate(() => VM.errors));
  await b.close();
})();
