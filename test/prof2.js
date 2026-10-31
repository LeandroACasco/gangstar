const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  await p.goto('file://' + process.cwd() + '/dist/gangstar.html');
  const k = async (c, ms = 150) => { await p.evaluate((c) => __midp.key(c, true), c); await p.waitForTimeout(ms); await p.evaluate((c) => __midp.key(c, false), c); };
  await p.waitForTimeout(9000); await k(-5); await p.waitForTimeout(2500); await k(-5); await p.waitForTimeout(2000); await k(-5);
  await p.waitForTimeout(9000); await k(-7); await p.waitForTimeout(2000); await k(-7); await p.waitForTimeout(2000);
  const s0 = await p.evaluate(() => ({ ...Gangstar.stats }));
  await p.waitForTimeout(3000);
  const s1 = await p.evaluate(() => ({ ...Gangstar.stats }));
  console.log('idle: renders/s', (s1.renders - s0.renders) / 3, 'ticks/s', (s1.ticks - s0.ticks) / 3, 'ms/render', ((s1.renderMs - s0.renderMs) / (s1.renders - s0.renders)).toFixed(2));
  const r = await p.evaluate(() => {
    const G = VM.classes.get('javax/microedition/lcdui/Graphics');
    const per = {};
    for (const [k, m] of G.methods) { const f = m.fn; m.fn = (...a) => { const s = performance.now(); const r = f(...a); per[k] = (per[k] || 0) + performance.now() - s; return r; }; }
    const D = VM.classes.get('d'); const t0 = performance.now();
    for (let i = 0; i < 10; i++) { D.sv.bQ = 1; D.sv.am = MIDP.newGraphics(MIDP.state.backImage); VM.callSync('d', 'ac()V', []); D.sv.bQ = 0; }
    const tot = (performance.now() - t0) / 10;
    const calls = {}; const m = G.methods.get("drawRGB([IIIIIIIZ)V"); const f0 = m.fn; m.fn = (t,o,rgb,off,scan,x,y,w,h,al) => { const k = w+"x"+h+" a"+al+" len"+rgb.length; calls[k]=(calls[k]||0)+1; return f0(t,o,rgb,off,scan,x,y,w,h,al); };
    D.sv.bQ = 1; D.sv.am = MIDP.newGraphics(MIDP.state.backImage); VM.callSync("d", "ac()V", []); D.sv.bQ = 0; per.calls = calls;
    return { tot, calls: per.calls, per: Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + (v / 10).toFixed(2)) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
