const H = require('./helpers');
(async () => {
  const { b, p, shot, pos, toGameplay } = await H.open();
  await toGameplay();
  await p.evaluate(() => Gangstar.addMoney(777));
  await p.keyboard.down('w'); await p.waitForTimeout(800); await p.keyboard.up('w'); await p.waitForTimeout(600);
  const before = await pos();
  await p.evaluate(() => SaveState.saveSlot(1, 'es'));
  console.log('slots', JSON.stringify(await p.evaluate(async () => Object.fromEntries(Object.entries(await SaveState.listSlots()).map(([k, v]) => [k, { size: v.size, date: !!v.date, thumb: v.thumb.length }])))));
  await p.reload(); await p.waitForTimeout(12000); // title / menu
  await shot('ss2-title');
  await p.evaluate(() => SaveState.loadSlot(1));
  await p.waitForTimeout(500);
  const after = await pos();
  console.log('before', before, 'after reload+load', after, 'money', await p.evaluate(() => VM.classes.get('d').sv.cx));
  const s0 = await p.evaluate(() => ({ ...Gangstar.stats }));
  await p.keyboard.down('s'); await p.waitForTimeout(2000); await p.keyboard.up('s');
  const s1 = await p.evaluate(() => ({ ...Gangstar.stats }));
  console.log('renders/s', (s1.renders - s0.renders) / 2, 'ticks/s', (s1.ticks - s0.ticks) / 2, 'moved to', await pos());
  await p.keyboard.press('Escape'); await p.waitForTimeout(1000); await shot('ss2-pause');
  console.log('T', await p.evaluate(() => VM.classes.get('d').sv.T), 'errors', await p.evaluate(() => VM.errors));
  await b.close();
})();
