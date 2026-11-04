#!/usr/bin/env node
/*
 * Pictures of the heading sheet on a phone held sideways: as it is now, and three looks without scrolling
 * (tests/e2e/mocks/hsheet-options.js), on the 4-page book with headings (mocks/heads-book.js).
 *
 *   node tests/e2e/hsheet-options.js      → tests/e2e/shots/hx-*.png
 */
'use strict';
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');
const Book = require('./mocks/heads-book');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const closeAll = async (p) => {
  await p.evaluate(() => window.A.V.sheets.slice().forEach((s) => s.close()));
  await T(350);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  try {
    const PDF = path.join(os.tmpdir(), 'naqra-hsheet-book.pdf');
    const marks = await Book.make(browser, PDF);
    const A = await H.newUser(browser, env, 'hx@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const a = A.page;
    await a.fill('#cn-name', 'حلقة');
    await a.click('#circle-new button');
    await a.waitForSelector('#join-name', { timeout: 20000 });
    await a.fill('#join-name', 'محمود');
    await a.click('#join-form button[type=submit]');
    await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
    await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
    await a.locator('[data-act="add-book"]:visible').first().click();
    await a.setInputFiles('#ab-file', PDF);
    await a.waitForSelector('#ab-form', { timeout: 30000 });
    await a.click('#ab-form button.btn.gold');
    await a.waitForSelector('#pl-form', { timeout: 30000 });
    await a.fill('#pl-per', '3');
    await a.click('#pl-form button.btn.gold');
    await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
    const bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
    // the three headings above the فرع, so the sheet has a path to show
    await a.evaluate(
      async ({ id, hs }) => {
        const { D, S, U } = window.A;
        for (const h of hs.filter((x) => x.p === 1 && x.l < 4)) await D.set(`heads/${D.newId()}`, { b: id, page: 1, y: h.y + h.h / 2, l: h.l, t: h.t, by: S.me, at: U.nowIso() });
        U.store.set('rdFocusOffered', U.today());
        U.store.set('rdOrientAsk', false);
      },
      { id: bookId, hs: marks.heads },
    );
    await T(1000);
    await closeAll(a);
    await a.setViewportSize({ width: 844, height: 390 });
    await a.addStyleTag({ content: '#toasts { display: none !important; }' });
    await a.addScriptTag({ path: path.join(__dirname, 'mocks', 'hsheet-options.js') });
    const h4 = marks.heads.find((x) => x.p === 1 && x.l === 4);
    await a.evaluate(({ id, h }) => window.HSheet.setup({ bookId: id, head: Object.assign({}, h), path: ['الفصل الثالث', 'المبحث الأول', 'المطلب الأول'] }), { id: bookId, h: h4 });
    await a.evaluate((id) => window.A.R.open(id, { page: 1 }), bookId);
    await a.waitForSelector('.pg[data-p="1"] canvas', { timeout: 20000 });
    await T(1500);
    await a.evaluate((y) => window.A.R.goToY(1, y), h4.y - 0.15);
    await T(800);
    // now: the real sheet
    await a.evaluate((h) => window.A.Hd.edit({ bookId: window.A.R.bookId(), page: 1, y: h.y + h.h / 2, text: h.t }), h4);
    await T(700);
    await H.shot(a, 'hx-0-now');
    await closeAll(a);
    for (const s of ['a', 'b', 'c']) {
      await a.evaluate((s) => window.HSheet.show(s), s);
      await T(700);
      await H.shot(a, 'hx-' + s);
      await closeAll(a);
      await a.evaluate(() => window.HSheet.clear());
    }
    // ب held upright too
    await a.setViewportSize({ width: 390, height: 844 });
    await T(1200);
    await a.evaluate(() => window.HSheet.show('b'));
    await T(700);
    await H.shot(a, 'hx-b-upright');
    console.log('done');
  } finally {
    await browser.close();
    await env.stop();
  }
})();
