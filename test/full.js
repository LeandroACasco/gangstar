const H = require('./helpers');
(async () => {
  const { b, p, k, shot, pos, toGameplay } = await H.open({ width: 1200, height: 800 });
  await p.evaluate(() => { localStorage.setItem('gangstar:ui:ctl', '"game"'); }); await p.reload();
  console.log('gameplay', await toGameplay());
  await shot('h-dialog-es');
  // keyboard WASD
  const kb = async (name, keys, ms = 700) => {
    const a = await pos();
    for (const c of keys) await p.keyboard.down(c);
    await p.waitForTimeout(ms);
    for (const c of keys) await p.keyboard.up(c);
    await p.waitForTimeout(400);
    const z = await pos(); console.log(name, 'dx', z[0] - a[0], 'dy', z[1] - a[1]);
  };
  await kb('W', ['w']); await kb('S', ['s']); await kb('W+A', ['w', 'a']); await kb('S+D', ['s', 'd']); await kb('ArrowUp', ['ArrowUp']);
  // joystick drag up-left
  const j = await p.locator('#joy').boundingBox();
  const a = await pos();
  await p.mouse.move(j.x + j.width / 2, j.y + j.height / 2); await p.mouse.down();
  await p.mouse.move(j.x + j.width / 2 - 40, j.y + j.height / 2 - 40, { steps: 4 });
  await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(400);
  const z = await pos(); console.log('joystick up-left dx', z[0] - a[0], 'dy', z[1] - a[1]);
  // smoothness stats
  const s0 = await p.evaluate(() => ({ ...Gangstar.stats })); await p.keyboard.down('s'); await p.waitForTimeout(2000); await p.keyboard.up('s');
  const s1 = await p.evaluate(() => ({ ...Gangstar.stats }));
  console.log('renders/s', (s1.renders - s0.renders) / 2, 'ticks/s', (s1.ticks - s0.ticks) / 2);
  // Enter = pause menu
  await p.keyboard.press('Escape'); await p.waitForTimeout(1200); await shot('h-pause');
  console.log('state T after Esc', await p.evaluate(() => VM.classes.get('d').sv.T));
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  console.log('state T after 2nd Enter', await p.evaluate(() => VM.classes.get('d').sv.T));
  await p.screenshot({ path: 'test/h-page.png' });
  console.log('errors', await p.evaluate(() => VM.errors));
  await b.close();
})();
