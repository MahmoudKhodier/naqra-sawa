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
      assert(['like', 'open-note', 'note-page', 'note-share', 'note-edit'].every((x) => row.acts.includes(x)), 'buttons: ' + row.acts);
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
