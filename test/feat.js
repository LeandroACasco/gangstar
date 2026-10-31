const H = require('./helpers');
(async () => {
  const { b, p, shot, pos, toGameplay } = await H.open({ width: 1200, height: 800 });
  await p.addInitScript(() => {
    // fake gamepad
    window.__gp = { id: 'Test Pad', index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__gp];
  });
  await p.reload();
  console.log('gameplay', await toGameplay());
  await p.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
  // stick up-left
  let a = await pos();
  await p.evaluate(() => { __gp.axes[0] = -0.8; __gp.axes[1] = -0.8; }); await p.waitForTimeout(700);
  await p.evaluate(() => { __gp.axes[0] = 0; __gp.axes[1] = 0; }); await p.waitForTimeout(400);
  let z = await pos(); console.log('pad stick up-left', z[0] - a[0], z[1] - a[1]);
  a = await pos();
  await p.evaluate(() => { __gp.buttons[13].pressed = true; }); await p.waitForTimeout(700);
  await p.evaluate(() => { __gp.buttons[13].pressed = false; }); await p.waitForTimeout(400);
  z = await pos(); console.log('pad dpad down', z[0] - a[0], z[1] - a[1]);
  // Start = pause
  await p.evaluate(() => { __gp.buttons[9].pressed = true; }); await p.waitForTimeout(300);
  await p.evaluate(() => { __gp.buttons[9].pressed = false; }); await p.waitForTimeout(800);
  console.log('T after Start', await p.evaluate(() => VM.classes.get('d').sv.T));
  await p.evaluate(() => { __gp.buttons[1].pressed = true; }); await p.waitForTimeout(300);
  await p.evaluate(() => { __gp.buttons[1].pressed = false; }); await p.waitForTimeout(800);
  console.log('T after B', await p.evaluate(() => VM.classes.get('d').sv.T));
  // F5 quick save, move, F9 quick load
  await p.keyboard.press('F5'); await p.waitForTimeout(800);
  const saved = await pos();
  await p.keyboard.down('s'); await p.waitForTimeout(1000); await p.keyboard.up('s'); await p.waitForTimeout(300);
  await p.keyboard.press('F9'); await p.waitForTimeout(800);
  console.log('quick save', saved, 'after quick load', await pos());
  // Select+RB saves via pad
  await p.evaluate(() => { __gp.buttons[8].pressed = true; }); await p.waitForTimeout(100);
  await p.evaluate(() => { __gp.buttons[5].pressed = true; }); await p.waitForTimeout(200);
  await p.evaluate(() => { __gp.buttons[5].pressed = false; __gp.buttons[8].pressed = false; }); await p.waitForTimeout(600);
  console.log('toast', await p.textContent('#toast'));
  // cheats
  await p.click('#btnMenu'); await p.check('#chAmmo'); await p.check('#chPolice'); await p.check('#chHealth'); await p.click('#chMoney');
  await p.click('#menuClose');
  await p.evaluate(() => { const D = VM.classes.get('d').sv; D.cm[1] = 3; D.cw = 4; D.cd['b.j'][0] = 10; });
  await p.waitForTimeout(400);
  console.log('cheats', JSON.stringify(await p.evaluate(() => { const D = VM.classes.get('d').sv; return { ammo: D.cm[1] & 0xFFFF, cw: D.cw, hp: D.cd['b.j'][0], max: D.cd['b.j'][1], money: D.cx }; })));
  // states dialog UI
  await p.click('#btnStates'); await p.waitForTimeout(500);
  await p.screenshot({ path: 'test/states-dlg.png' });
  await p.locator('.slot').nth(1).locator('.save').click(); await p.waitForTimeout(800);
  await p.screenshot({ path: 'test/states-dlg2.png' });
  await p.locator('.slot').nth(1).locator('.load').click(); await p.waitForTimeout(800);
  console.log('dialog open after load', await p.evaluate(() => document.getElementById('states').open), 'T', await p.evaluate(() => VM.classes.get('d').sv.T), 'errors', await p.evaluate(() => VM.errors));
  await b.close();
})();
