const H = require('./helpers');
(async () => {
  const { b, p, k, shot, pos, toGameplay } = await H.open();
  console.log('gameplay', await toGameplay());
  await shot('d0');
  const test = async (name, keys) => {
    const a = await pos();
    for (const c of keys) await p.evaluate((c) => __midp.key(c, true), c);
    await p.waitForTimeout(700);
    for (const c of keys) await p.evaluate((c) => __midp.key(c, false), c);
    await p.waitForTimeout(400);
    const z = await pos(); console.log(name, 'dx', z[0] - a[0], 'dy', z[1] - a[1]);
  };
  await test('2 (up)', [50]); await test('8 (down)', [56]); await test('1 (up-left)', [49]);
  await test('2+4 together', [50, 52]); await test('9 (down-right)', [57]); await test('8+6 together', [56, 54]);
  await test('arrow up', [-1]);
  await b.close();
})();
