const H = require('./helpers');
(async () => {
  const { b, p, k, shot, pos, toGameplay } = await H.open();
  console.log('gameplay', await toGameplay());
  const cmp = async (label) => {
    const r = await p.evaluate(() => new Promise((res) => {
      const st = MIDP.state, fh = st.flushHook;
      st.flushHook = (img) => {
        const ret = fh(img);
        st.flushHook = fh;
        const A = document.createElement('canvas'); A.width = 240; A.height = 320; A.getContext('2d').drawImage(img.canvas, 0, 0);
        if (ret !== false) { res({ skipped: 'real frame presented (dialog/menu)' }); return ret; }
        Gangstar._render(1);
        const a = A.getContext('2d').getImageData(0, 0, 240, 320).data, bb = img.ctx.getImageData(0, 0, 240, 320).data;
        let diff = 0; const D = document.createElement('canvas'); D.width = 240; D.height = 320; const dc = D.getContext('2d'); const di = dc.createImageData(240, 320);
        for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]); if (d > 30) { diff++; di.data[i] = 255; di.data[i + 3] = 255; } else { di.data[i] = di.data[i + 1] = di.data[i + 2] = a[i] / 3; di.data[i + 3] = 255; } }
        dc.putImageData(di, 0, 0);
        res({ diffPixels: diff, real: A.toDataURL(), interp: img.canvas.toDataURL(), map: D.toDataURL() });
        return ret;
      };
    }));
    const fs = require('fs');
    for (const n of ['real', 'interp', 'map']) if (r[n]) { fs.writeFileSync(`test/cmp-${label}-${n}.png`, Buffer.from(r[n].split(',')[1], 'base64')); delete r[n]; }
    console.log(label, JSON.stringify(r));
  };
  await p.keyboard.down('w'); await p.waitForTimeout(500); await cmp('walking'); await p.keyboard.up('w');
  // shoot: hold 5 while moving
  await p.keyboard.down('Space'); await p.waitForTimeout(350); await cmp('shooting'); await p.waitForTimeout(200); await cmp('shooting2'); await p.keyboard.up('Space');
  await b.close();
})();
