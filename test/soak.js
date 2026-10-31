const H = require('./helpers');
(async () => {
  const { b, p, shot, toGameplay } = await H.open();
  await toGameplay();
  await p.evaluate(() => {
    window.__maxd = 0; window.__deltas = [];
    const D = VM.classes.get('d'); let last = new Map();
    const fh = MIDP.state.flushHook;
    MIDP.state.flushHook = (img) => {
      for (const o of Gangstar.actors) { const l = last.get(o); if (l) { const d = Math.max(Math.abs(o['b.a'] - l[0]), Math.abs(o['b.b'] - l[1])) >> 8; if (d > 0 && d < 400) __deltas.push(d); } last.set(o, [o['b.a'], o['b.b']]); }
      return fh(img);
    };
  });
  const keys = ['w', 'a', 's', 'd', 'Space', 'f', 'q', 'r'];
  const t0 = Date.now(); let i = 0;
  const s0 = await p.evaluate(() => ({ ...Gangstar.stats }));
  while (Date.now() - t0 < 60000) {
    const k1 = keys[Math.floor(Math.random() * 4)], k2 = Math.random() < 0.3 ? keys[4 + Math.floor(Math.random() * 4)] : null;
    await p.keyboard.down(k1); if (k2) await p.keyboard.down(k2);
    await p.waitForTimeout(300 + Math.random() * 900);
    await p.keyboard.up(k1); if (k2) await p.keyboard.up(k2);
    if (++i % 20 === 0) await shot('soak' + (i / 20));
  }
  const r = await p.evaluate((s0) => {
    const s = Gangstar.stats; const d = __deltas.sort((a, b) => a - b);
    return { renders: s.renders - s0.renders, ticks: s.ticks - s0.ticks, realShown: s.realShown - s0.realShown, msPerRender: (s.renderMs - s0.renderMs) / (s.renders - s0.renders),
      tracked: Gangstar.tracked.length, actors: Gangstar.actors.length, errors: VM.errors, T: VM.classes.get('d').sv.T,
      p50: d[Math.floor(d.length * .5)], p99: d[Math.floor(d.length * .99)], max: d[d.length - 1], inCar: VM.classes.get('d').sv.cd['b.i'] && VM.classes.get('d').sv.cd['b.i'][3] };
  }, s0);
  console.log(JSON.stringify(r));
  await b.close();
})();
