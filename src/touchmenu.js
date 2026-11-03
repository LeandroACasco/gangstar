// Touch for the game's own menus (title, main menu, options, pause, help...).
//
// The menus are drawn as lines of text (class a, a(Graphics, String, x, y, anchor, ...)) and the highlighted
// line is the index d.Z, moved by the up/down keys. While a menu is on screen every text line drawn is
// remembered with its position on the screen; a tap on a line moves the selection there (pressing up or
// down and watching d.Z, so disabled entries the game skips are handled by the game itself) and confirms.
// A tap on the bottom corners is the soft key below it (ELEGIR / ATRÁS), a vertical swipe scrolls
// (up/down keys), and a tap anywhere else is OK. In gameplay the on-screen controls are used instead.
'use strict';

const TouchMenu = (() => {
  let D = null, lines = [], frameLines = [], frameNo = -1, busy = false;
  const TOP = 16, BOTTOM = 32, VCENTER = 2;

  function beforeStart() {
    D = VM.classes.get('d');
    // every text call ends in this one (x, y, anchor, then wrap width and flags)
    VM.hookMethod('a', 'a(Ljavax/microedition/lcdui/Graphics;Ljava/lang/String;IIIIIIZZ)I', (orig, self, g, str, x, y, anchor, ...rest) => {
      if (D.sv.T !== 7 && str && str.s) {
        const f = MIDP.state.frames || 0;
        if (f !== frameNo) { if (frameLines.length) lines = frameLines; frameLines = []; frameNo = f; }
        const gg = g.g, h = 14;
        const top = anchor & BOTTOM ? y - h : anchor & VCENTER ? y - h / 2 : y;
        frameLines.push({ s: str.s, x: x + gg.tx, y: top + gg.ty, h, anchor });
      }
      return orig(self, g, str, x, y, anchor, ...rest);
    });
  }
  const current = () => (lines.length ? lines : frameLines);   // the last complete frame
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // the menu entries: lines between the title and the soft key labels, in drawing order
  function entries() {
    const all = current().filter((l, i, a) => a.findIndex((o) => o.s === l.s && o.y === l.y) === i);
    return all.filter((l) => l.y > 24 && l.y + l.h < 302);
  }

  async function select(target, press) {
    // move the highlight (d.Z) to the tapped entry, then confirm
    for (let i = 0; i < 12 && D.sv.Z !== target; i++) {
      const before = D.sv.Z;
      press(D.sv.Z < target ? 56 : 50, true); await sleep(60); press(D.sv.Z < target ? 56 : 50, false);
      for (let w = 0; w < 10 && D.sv.Z === before; w++) await sleep(30);
      if (D.sv.Z === before) break;              // the game did not move: not a list we understand
    }
    if (D.sv.Z === target) { press(53, true); await sleep(80); press(53, false); return true; }
    return false;
  }

  // x, y: tap in game screen pixels; dy: vertical swipe (px), press(code, down)
  async function tap(x, y, press, dy = 0) {
    if (!D || busy) return;
    busy = true;
    try {
      const W = MIDP.SW;
      if (Math.abs(dy) > 24) {                   // swipe: scroll the list / text
        const code = dy < 0 ? 56 : 50, n = Math.min(6, Math.round(Math.abs(dy) / 22));
        for (let i = 0; i < n; i++) { press(code, true); await sleep(50); press(code, false); await sleep(70); }
        return;
      }
      if (y >= 296) {                            // soft keys
        const side = x < W / 3 ? -6 : x > W * 2 / 3 ? -7 : 53;
        press(side, true); await sleep(80); press(side, false);
        return;
      }
      const list = entries();
      const hit = list.findIndex((l) => y >= l.y - 4 && y <= l.y + l.h + 4);
      if (hit >= 0 && list.length > 1 && typeof D.sv.Z === 'number' && D.sv.Z >= 0 && D.sv.Z < list.length + 2) {
        if (await select(hit, press)) return;
      }
      press(53, true); await sleep(80); press(53, false);   // anything else: OK
    } finally { busy = false; }
  }
  return { beforeStart, tap, entries };
})();
