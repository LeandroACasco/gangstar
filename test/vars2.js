const H = require('./helpers');
(async () => {
  const { b, p, shot, toGameplay } = await H.open();
  await toGameplay();
  await shot('v0');
  await p.evaluate(() => { const D = VM.classes.get('d').sv; D.cn = 37; D.cx = 12345; D.cw = 3; D.cm[1] = 77; D.dc |= 0xFF | 0x100 | 0x10; });
  await p.waitForTimeout(6000); await shot('v1');
  console.log(await p.evaluate(() => { const D = VM.classes.get('d').sv; return { cn: D.cn, cx: D.cx, cw: D.cw, cm: Array.from(D.cm) }; }));
  await b.close();
})();
