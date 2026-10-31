const H = require('./helpers');
(async () => {
  const { b, p, shot, pos, toGameplay } = await H.open();
  p.on('console', (m) => { if (m.type() === 'warning' && !/willRead/.test(m.text())) console.log('WARN', m.text().slice(0, 200)); });
  await toGameplay();
  await p.keyboard.down('w'); await p.waitForTimeout(800); await p.keyboard.up('w'); await p.waitForTimeout(500);
  const before = await pos();
  const r = await p.evaluate(async () => {
    const t0 = performance.now(); const data = SaveState.capture(); const t1 = performance.now();
    const blob = await SaveState.pack(data); const t2 = performance.now();
    window.__saved = blob;
    const imgs = data.entries.filter(e => e && e.png).length;
    return { entries: data.entries.length, imgs, json: JSON.stringify(data).length, gz: blob.size, captureMs: t1 - t0, packMs: t2 - t1, money: VM.classes.get('d').sv.cx };
  });
  console.log('save', JSON.stringify(r));
  await shot('ss-saved');
  // change the world: walk far, add money
  await p.evaluate(() => Gangstar.addMoney(5000));
  await p.keyboard.down('s'); await p.waitForTimeout(1500); await p.keyboard.up('s'); await p.waitForTimeout(500);
  const moved = await pos();
  const r2 = await p.evaluate(async () => { const t0 = performance.now(); await SaveState.restore(await SaveState.unpack(__saved)); return { ms: performance.now() - t0, money: VM.classes.get('d').sv.cx }; });
  await p.waitForTimeout(300);
  const after = await pos();
  await shot('ss-restored');
  console.log('before', before, 'moved', moved, 'after restore', after, JSON.stringify(r2));
  // keep playing after restore
  await p.keyboard.down('w'); await p.waitForTimeout(1000); await p.keyboard.up('w'); await p.waitForTimeout(500);
  const later = await pos();
  const st = await p.evaluate(() => ({ ...Gangstar.stats, errors: VM.errors, threads: VM.threads.map(t => t.name + ':' + t.status) }));
  console.log('after walking', later, JSON.stringify(st));
  await shot('ss-later');
  await b.close();
})();
