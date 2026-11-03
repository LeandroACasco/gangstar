// Promotional art (cover, city at sunset, characters) for the presentation around the game.
//
// The pictures come only from the private data package (art/*.webp), never from the public repository.
// With them: the start screen gets the cover as its background, and on a wide screen the bands on both
// sides of the menus (drawn in the original 240 px in the middle) show the city with a character on each
// side, at the device's full resolution, behind the game canvas (whose bands are left transparent).
'use strict';

const Art = (() => {
  const urls = {};
  const has = (n) => !!urls[n];
  function init(files) {
    for (const k in files) {
      const m = /^art\/(\w+)\.webp$/.exec(k);
      if (m) urls[m[1]] = URL.createObjectURL(new Blob([files[k]], { type: 'image/webp' }));
    }
    return Object.keys(urls).length > 0;
  }
  const load = (n) => new Promise((res) => { if (!urls[n]) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = urls[n]; });

  // start screen: the cover behind "tap to start"
  // (on a wide screen: the cover in the middle, over the side backdrop)
  function startScreen(el, sides) {
    if (!has('cover')) return;
    const shade = 'linear-gradient(rgba(0,0,0,.1), rgba(0,0,0,.45) 55%, rgba(0,0,0,.85))';
    if (sides) {
      el.style.backgroundImage = `${shade}, url(${urls.cover}), url(${sides})`;
      el.style.backgroundSize = '100% 100%, auto 100%, 100% 100%';
      el.style.backgroundPosition = 'center, center, center'; el.style.backgroundRepeat = 'no-repeat';
    } else {
      el.style.backgroundImage = `${shade}, url(${urls.cover})`;
      el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center 20%';
    }
    el.classList.add('art');
  }

  // backdrop for a W x 320 screen: city across, a character in each side band, the middle left dark
  async function backdrop(W, heightPx) {
    if (W <= 240 || !has('city')) return null;
    const H = Math.max(320, Math.min(1440, Math.round(heightPx))), k = H / 320, Wp = Math.round(W * k);
    const c = document.createElement('canvas'); c.width = Wp; c.height = H;
    const x = c.getContext('2d');
    // two different characters (the pair is already on the cover and the title screen)
    const cast = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].filter(has).sort(() => Math.random() - 0.5);
    const [city, palms, left, right] = await Promise.all([load('city'), load('palms'), load(cast[0] || 'pair'), load(cast[1] || 'pair')]);
    x.fillStyle = '#120a14'; x.fillRect(0, 0, Wp, H);
    const cover = (img, dx, dy, dw, dh) => {         // draw img to fill the box, cropping the excess
      const s = Math.max(dw / img.width, dh / img.height), w = img.width * s, h = img.height * s;
      x.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
    };
    const band = Math.round((W - 240) / 2 * k);
    // each band: the sunset city (palms when the band is narrow and tall), darker towards the game
    for (const side of [0, 1]) {
      const bx = side ? Wp - band : 0;
      x.save(); x.beginPath(); x.rect(bx, 0, band, H); x.clip();
      cover(band / H < 0.55 && palms ? palms : city, bx, 0, band, H);
      const g = x.createLinearGradient(side ? bx : bx + band, 0, side ? bx + band : bx, 0);
      g.addColorStop(0, 'rgba(10,6,14,.85)'); g.addColorStop(0.35, 'rgba(10,6,14,.35)'); g.addColorStop(1, 'rgba(10,6,14,.15)');
      x.fillStyle = g; x.fillRect(bx, 0, band, H);
      const v = x.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, 'rgba(0,0,0,.25)'); v.addColorStop(0.6, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
      x.fillStyle = v; x.fillRect(bx, 0, band, H);
      // a character standing at the bottom, when there is room for it
      const who = side ? right : left;
      if (who && band > H * 0.28) {
        const h = H * 0.92, w = who.width * h / who.height, s = Math.min(1, (band * 0.96) / w);
        const dw = w * s, dh = h * s;
        x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = H * 0.03;
        x.drawImage(who, bx + (band - dw) / 2, H - dh, dw, dh);
        x.shadowBlur = 0;
      }
      x.restore();
    }
    return await new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : null), 'image/webp', 0.9));
  }

  return { init, has, startScreen, backdrop };
})();
