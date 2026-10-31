const H = require('./helpers');
(async () => {
  const { b, p, toGameplay } = await H.open();
  p.on('console', (m) => { if (m.type() === 'warning') console.log('WARN', m.text().slice(0, 200)); });
  await toGameplay();
  await p.keyboard.down('Space'); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const D = VM.classes.get('d'), B = VM.classes.get('b');
    const mB = B.methods.get('B()V'), mbv = D.methods.get('bv()V');
    let calls = 0; const f = mB.fn; mB.fn = (...a) => { calls++; return f(...a); };
    Gangstar._render(1);
    mB.fn = f;
    const hh = D.sv.hh, hj = D.sv.hj;
    return { calls, hasFnB: !!f, hh: hh && Array.from(hh).slice(0, 24), hj: hj && Array.from(hj).slice(0, 16), hhLen: hh && hh.length, hjLen: hj && hj.length };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
