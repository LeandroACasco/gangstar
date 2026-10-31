const H = require('./helpers');
(async () => {
  const { b, p, toGameplay } = await H.open();
  await toGameplay();
  console.log(await p.evaluate(() => { const D = VM.classes.get('d').sv, B = VM.classes.get('b').sv; return { cx: D.cx, cw: D.cw, cm: Array.from(D.cm), h: D.cd['b.h'], max: B.p[B.r][6], weapon: D.cd['b.i'][3] }; }));
  await b.close();
})();
