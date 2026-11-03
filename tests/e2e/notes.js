/* Notes in the news and their sheet, on a phone with touch:
 * a short note opens with a tap; one row of buttons on the card (like, reply, page, share, edit); «الصفحة» opens
 * the book at the note itself (zoomed in too); the sheet closes with a swipe down; «عدّل» moves a note between
 * the whole circle and «ليا بس», and deletes it.
 *
 *   node tests/e2e/notes.js
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const { chromium } = loadPlaywright();
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const d = await fn();
    results.push('PASS');
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)${d ? '  — ' + d : ''}`);
  } catch (e) {
    results.push('FAIL');
    console.log(`FAIL  ${name}\n      ${String((e && e.message) || e).split('\n').slice(0, 5).join('\n      ')}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function until(p, what, fn, arg, timeout = 10000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const closeAll = async (p) => {
  await p.evaluate(() => window.A.V.sheets.slice().forEach((s) => s.close()));
  await T(300);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, bookId, nid;
  try {
    await step('A circle with a book; a short note of mine on p. 20, low on the page', async () => {
      const A = await H.newUser(browser, env, 'na@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الملاحظات');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'محمود');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length));
      await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      // read up to there, so no-spoilers doesn't close it
      await a.evaluate((id) => window.A.D.saveProg(id, (c) => ({ seen: window.A.U.rangesAdd(c.seen, Array.from({ length: 30 }, (_, i) => i + 1)) })), bookId);
      nid = await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 20, kind: 'note', text: 'ملاحظة صغيرة', rect: { x: 0.8, y: 0.85, w: 0, h: 0 }, by: S.me, at: U.nowIso(), wid: '', likes: {}, replies: {} });
        return n;
      }, bookId);
      await until(a, 'note in', (id) => window.A.S.notes.has(id), nid);
    });

    await step('The card: one row of buttons; a tap on a short note opens it', async () => {
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle'));
      const card = `.feed .ncard:has([data-nid="${nid}"])`;
      await a.waitForSelector(card);
      const row = await a.$eval(`${card} .nc-acts`, (f) => {
        const bs = [...f.children];
        return { acts: bs.map((b) => b.dataset.act), tops: new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size };
      });
      const has = await a.$eval(`${card} .nc-acts`, (f) => !!f.querySelector('[data-rx="note"]'));
      assert(has && ['open-note', 'note-page', 'note-share', 'note-edit'].every((x) => row.acts.includes(x)), 'buttons: ' + row.acts);
      assert(row.tops === 1, 'buttons on ' + row.tops + ' rows');
      await H.shot(a, 'notes-card');
      await a.click(`${card} .nc-text`);
      await a.waitForSelector('.sheet .nt');
      assert(!(await a.$('.sheet .nt [data-del]')), '«امسح» is still in the note\'s sheet');
    });

    await step('The sheet closes with a swipe down', async () => {
      const cdp = await a.context().newCDPSession(a);
      const r = await a.$eval('.sheet', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 30 }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [r] });
      for (let i = 1; i <= 8; i++) {
        await T(20);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y + i * 25 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await until(a, 'closed', () => !window.A.V.sheets.length, null, 3000);
    });

    await step('«الصفحة» opens the book at the note itself, zoomed in too', async () => {
      // read it zoomed in, like the owner does
      await a.evaluate((id) => window.A.U.store.set('zoom:' + id, 1.8), bookId);
      await a.click(`.feed .ncard:has([data-nid="${nid}"]) [data-act="note-page"]`);
      await until(a, 'painted', () => window.A.R.isOpen() && [...document.querySelectorAll('.pg canvas')].some((x) => x.width > 100), null, 20000);
      await T(700);
      const at = await a.evaluate(() => window.A.R._anchor());
      // the screen's point 40% down sits on the note (p. 20, near y 0.85)
      const mid = await a.evaluate(() => {
        const sc = document.querySelector('#rd-scroll');
        const st = window.A.R._state();
        return { cur: st.cur };
      });
      const shown = await a.evaluate((id) => {
        const el = document.querySelector(`.pg [data-nid="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, vh: innerHeight, vw: innerWidth };
      }, nid);
      assert(shown && shown.top > 0 && shown.top < shown.vh && shown.left > -10 && shown.left < shown.vw, 'the note is not on screen: ' + JSON.stringify(shown) + ' ' + JSON.stringify(at));
      await H.shot(a, 'notes-page');
      await a.evaluate(() => window.A.R.close(true));
      return `p. ${mid.cur}, note at ${Math.round(shown.top)}px`;
    });

    await step('«عدّل»: only me, back to the circle, then delete from inside', async () => {
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle'));
      await a.click(`.feed .ncard:has([data-nid="${nid}"]) [data-act="note-edit"]`);
      await a.waitForSelector('.sheet [data-vis="me"]');
      await a.click('.sheet [data-vis="me"]');
      await a.click('.sheet [data-save]');
      await until(a, 'private', (id) => !window.A.S.notes.has(id) && !!(window.A.S.priv && window.A.S.priv.notes && window.A.S.priv.notes[id]), nid);
      await a.evaluate((id) => window.A.V.editNote(Object.assign({ id, by: window.A.S.me, priv: true }, window.A.S.priv.notes[id])), nid);
      await a.waitForSelector('.sheet [data-vis="all"]');
      await a.click('.sheet [data-vis="all"]');
      await a.click('.sheet [data-save]');
      await until(a, 'shared again', (id) => window.A.S.notes.has(id) && !(window.A.S.priv.notes || {})[id], nid);
      const n = await a.evaluate((id) => window.A.S.notes.get(id), nid);
      assert(n.text === 'ملاحظة صغيرة' && n.page === 20 && n.by === (await a.evaluate(() => window.A.S.me)), 'note: ' + JSON.stringify(n));
      await a.evaluate((id) => window.A.V.editNote(window.A.S.notes.get(id)), nid);
      await a.waitForSelector('.sheet [data-del]');
      await a.click('.sheet [data-del]');
      await a.click('.sheet [data-yes]');
      await until(a, 'deleted', (id) => !window.A.S.notes.has(id), nid);
    });

    await step('«انسخ» copies the words; the owner pins a note on top of the news for a day; it goes when the time is up', async () => {
      await a.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const id2 = await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 12, kind: 'note', text: 'ملاحظة مهمة للحلقة كلها', rect: { x: 0.5, y: 0.3, w: 0, h: 0 }, by: S.me, at: U.nowIso(), wid: '', likes: {}, replies: {} });
        return n;
      }, bookId);
      await until(a, 'in', (id) => window.A.S.notes.has(id), id2);
      await closeAll(a);
      await a.evaluate((id) => window.A.V.openNote(id), id2);
      await a.click('.sheet [data-copy]');
      await T(300);
      const clip = await a.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      assert(clip === 'ملاحظة مهمة للحلقة كلها', 'clipboard: ' + clip);
      await a.click('.sheet [data-pin]');
      await a.click('.menu-sheet .mi:has-text("يوم")');
      await until(a, 'pinned', (id) => ((window.A.S.circle || {}).pins || []).some((p) => p.nid === id), id2);
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle'));
      await a.waitForSelector(`.pinned .ncard [data-nid="${id2}"]`);
      assert(!(await a.$(`#feed-list [data-nid="${id2}"]`)), 'also in the news below');
      await H.shot(a, 'notes-pinned');
      // the day is over: it goes back among the news
      await a.evaluate(async () => {
        const { D, S, V } = window.A;
        await D.set('meta/circle', Object.assign({}, V.clean(S.circle), { pins: S.circle.pins.map((p) => Object.assign({}, p, { until: '2020-01-01T00:00:00.000Z' })) }));
      });
      await until(a, 'unpinned', () => !document.querySelector('.pinned'));
    });

    await step('Share as pictures: a long note over several, square, night, the cover colours; the sheet\'s few choices', async () => {
      const long = Array.from({ length: 14 }, (_, i) => `فقرة ${i + 1}: جَهّز الجيش قوامه ثلاثة آلاف مقاتل، ووضع نظامًا فريدًا للقيادة المتعاقبة لحماية الراية، ثم كانت المعركة.`).join('\n\n');
      const r = await a.evaluate(async ({ id, text }) => {
        const { V, S, U } = window.A;
        const n = { id: 'x', b: id, page: 7, kind: 'note', text, by: S.me, at: U.nowIso() };
        const dims = async (b) => { const im = await createImageBitmap(b); return [im.width, im.height]; };
        const story = await V.storyCards(n, { size: 'story', theme: 'paper' });
        const sq = await V.storyCards(n, { size: 'square', theme: 'night' });
        const one = await V.storyCards(Object.assign({}, n, { text: 'جملة قصيرة' }), { size: 'story', theme: 'cover' });
        const toUrl = (b) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
        return { n: story.length, sq: sq.length, sqDims: await dims(sq[0]), stDims: await dims(story[0]), one: one.length, shots: [await toUrl(story[0]), await toUrl(story[1]), await toUrl(sq[0]), await toUrl(one[0])] };
      }, { id: bookId, text: long });
      assert(r.n >= 2 && r.n <= 6, 'story pages ' + r.n);
      assert(r.sqDims.join() === '1080,1080' && r.stDims.join() === '1080,1920', 'sizes ' + r.sqDims + ' / ' + r.stDims);
      assert(r.one === 1, 'a short note made ' + r.one + ' pictures');
      const fs = require('fs');
      r.shots.forEach((d, i) => fs.writeFileSync(path.join(H.SHOTS, `notes-story-${i + 1}.png`), Buffer.from(d.split(',')[1], 'base64')));
      // the sheet: a few choices up front, the rest folded away
      const nid3 = await a.evaluate(async ({ id, text }) => {
        const { D, S, U } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 7, kind: 'note', text, rect: { x: 0.5, y: 0.5, w: 0, h: 0 }, by: S.me, at: U.nowIso(), wid: '', likes: {}, replies: {} });
        return n;
      }, { id: bookId, text: long });
      await until(a, 'in', (id) => window.A.S.notes.has(id), nid3);
      await closeAll(a);
      await a.evaluate((id) => window.A.V.storySheet(window.A.S.notes.get(id)), nid3);
      await until(a, 'pictures', () => document.querySelectorAll('#story-prev img').length >= 2, null, 15000);
      assert(!(await a.isVisible('.st-sws')), 'the switches are not folded away');
      await a.click('[data-size="square"]');
      await until(a, 'square', () => document.querySelector('#story-prev.sq img'), null, 15000);
      const lay = await a.evaluate(() => { const box = document.querySelector('#story-prev'); const im = [...box.querySelectorAll('img')]; return { disp: getComputedStyle(box).display, tops: new Set(im.map((i) => Math.round(i.getBoundingClientRect().top))).size, w: Math.round(im[0].getBoundingClientRect().width) }; });
      if (lay.tops !== 1) lay.rules = await a.evaluate(() => { const out = []; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) if (r.cssText && r.cssText.includes('story-prev')) out.push(r.cssText.slice(0, 120)); } catch (e) { out.push('x ' + ss.href); } } return out; });
      assert(lay.tops === 1, 'pictures not side by side: ' + JSON.stringify(lay));
      await H.shot(a, 'notes-story-sheet');
      await closeAll(a);
      return `${r.n} story pictures, ${r.sq} square`;
    });

    await step('Reactions: a tap is 👍 (older apps still see a like); hold and slide to 😂; replies, chat and «خلّص الورد» too', async () => {
      const id4 = await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 9, kind: 'note', text: 'جملة حلوة', rect: { x: 0.5, y: 0.5, w: 0, h: 0 }, by: S.me, at: U.nowIso(), wid: '', likes: {}, replies: { r1: { by: S.me, text: 'رد صغير', at: U.nowIso() } } });
        return n;
      }, bookId);
      await until(a, 'in', (id) => window.A.S.notes.has(id), id4);
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle'));
      const pill = `.feed .ncard:has([data-nid="${id4}"]) [data-rx="note"]`;
      await a.waitForSelector(pill);
      await a.click(pill);
      await until(a, '👍', (id) => { const n = window.A.S.notes.get(id); return n.rx && n.rx[window.A.S.me] === '👍' && n.likes[window.A.S.me]; }, id4);
      // hold, slide to 😂, let go
      const cdp = await a.context().newCDPSession(a);
      const b0 = await a.$eval(pill, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [b0] });
      await T(650);
      await a.waitForSelector('#rx-gbar .rx-i');
      const t = await a.$eval('#rx-gbar [data-e="😂"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b0.x + ((t.x - b0.x) * i) / 8, y: b0.y + ((t.y - b0.y) * i) / 8 }] });
        await T(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await until(a, '😂', (id) => window.A.S.notes.get(id).rx[window.A.S.me] === '😂', id4);
      await T(400);
      await H.shot(a, 'notes-react');
      // a tap now takes it back
      await a.click(pill);
      await until(a, 'taken back', (id) => !window.A.S.notes.get(id).likes[window.A.S.me], id4);
      // a reply
      await a.evaluate((id) => window.A.V.openNote(id), id4);
      await a.waitForSelector('.sheet .rep [data-rx="rep"]');
      await a.click('.sheet .rep [data-rx="rep"]');
      await until(a, 'reply 👍', (id) => ((window.A.S.notes.get(id).rrx || {}).r1 || {})[window.A.S.me] === '👍', id4);
      await closeAll(a);
      // a chat message, from its ⋯ menu
      await a.evaluate(() => window.A.V.go('circle', { seg: 'chat' }));
      await a.fill('.thread textarea', 'أهلًا يا جماعة');
      await a.press('.thread textarea', 'Enter').catch(() => {});
      await a.click('.thread .composer button').catch(() => {});
      await until(a, 'sent', () => window.A.S.msgs.some((m) => m.text === 'أهلًا يا جماعة'));
      await a.click('.msg [data-act="msg-menu"]');
      await a.click('.menu-sheet .mi:has-text("تفاعل")');
      await a.waitForSelector('#rx-gbar [data-e="🔥"]');
      await a.click('#rx-gbar [data-e="🔥"]');
      await until(a, 'chat 🔥', () => { const m = window.A.S.msgs.find((x) => x.text === 'أهلًا يا جماعة'); return m && m.react && m.react['🔥'] && m.react['🔥'][window.A.S.me]; });
      await a.waitForSelector('.msg .reacts [data-rx="msg"]');
      // «خلّص الورد» in the news
      await a.evaluate((id) => window.A.V.markWird(id, window.A.S.books.get(id).wirds[0].id), bookId);
      await a.evaluate(() => window.A.V.go('circle'));
      await closeAll(a);
      await a.waitForSelector('.feed .ev [data-rx="ev"]');
      await a.click('.feed .ev [data-rx="ev"]');
      await until(a, 'event 👍', () => [...window.A.S.evrx.values()].some((r) => r.e === '👍' && r.by === window.A.S.me));
    });

    await step('No console errors', async () => {
      const errs = (a.__errors || []).filter((e) => !/favicon|fonts|404/.test(e));
      assert(!errs.length, errs.slice(0, 4).join('\n'));
    });
  } finally {
    await browser.close();
    await env.stop();
    const fail = results.filter((r) => r === 'FAIL').length;
    console.log(`\n==== ${results.length - fail} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
