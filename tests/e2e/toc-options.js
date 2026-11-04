#!/usr/bin/env node
/*
 * Pictures of «الفهرس» mock-ups (tests/e2e/mocks/toc-options.js) on the fixture book, which has a printed
 * contents page (page 2) and no contents inside the file — like the owner's book: four members, portions of
 * 4 pages, me on page 12 (in chapter 2).
 *
 *   node tests/e2e/toc-options.js      → tests/e2e/shots/toc-*.png
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const closeAll = async (p) => {
  await p.evaluate(() => window.A.V.sheets.slice().forEach((s) => s.close()));
  await T(350);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const vp = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 };
  try {
    const A = await H.newUser(browser, env, 'toc@test.local', vp);
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
    await a.fill('#pl-per', '4');
    await a.click('#pl-form button.btn.gold');
    await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
    const bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
    await a.evaluate(async (id) => {
      const { D, U } = window.A;
      const wirds = Array.from({ length: 10 }, (_, i) => ({ id: 'w' + (i + 1), n: i + 1, from: 1 + i * 4, to: 4 + i * 4, start: U.addDays(U.today(), i - 2), due: U.addDays(U.today(), i - 2) }));
      await D.update(`books/${id}`, { title: 'رحلة في عالم الكتب', wirds });
      const done = {};
      for (let i = 1; i <= 2; i++) done['w' + i] = new Date().toISOString();
      await D.saveProg(id, () => ({ done, last: 12, seen: [[1, 12]] }));
    }, bookId);
    const cid = await a.evaluate(() => window.A.P.circle().id);
    const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
    const uids = {};
    for (const [key, name, last] of [['sara', 'سارة', 18], ['omar', 'عمر', 8], ['laila', 'ليلى', 13]]) {
      const U2 = await H.newUser(browser, env, `toc-${key}@test.local`, Object.assign({ url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code }, vp));
      const q = U2.page;
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', name);
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.shell #screen .home', { timeout: 15000 });
      uids[key] = await q.evaluate(async ({ bookId, last }) => {
        await window.A.D.saveProg(bookId, () => ({ last, seen: [[1, last]] }));
        return window.A.S.me;
      }, { bookId, last });
      await U2.context.close().catch(() => {});
    }
    await a.waitForFunction(() => window.A.S.members.size === 4, null, { timeout: 15000 });
    await T(1500);
    await closeAll(a);
    await a.addStyleTag({ content: '#toasts { display: none !important; }' });
    await a.addScriptTag({ path: path.join(__dirname, 'mocks', 'toc-options.js') });
    await a.evaluate(({ bookId, uids }) => window.TocMock.setup(Object.assign({ bookId, me: window.A.S.me }, uids)), { bookId, uids });

    // the reader on the first page of chapter 2: its name on top, chapter ticks, the heading's mark
    await a.evaluate((id) => {
      window.A.U.store.set('rdFocusOffered', window.A.U.today());
      window.A.R.open(id, { page: 10 });
    }, bookId);
    await a.waitForSelector('.pg-ov[data-p="10"]', { timeout: 20000 });
    await T(2500);
    await a.evaluate(() => window.TocMock.reader(10));
    await T(300);
    await H.shot(a, 'toc-1-reader');
    await a.evaluate(() => document.querySelectorAll('.tm-strip').forEach((e) => e.remove()));
    // the index, three looks
    for (const s of ['a', 'b', 'c']) {
      await a.evaluate((s) => window.TocMock.sheet(s), s);
      await T(500);
      await H.shot(a, 'toc-2' + s);
      await closeAll(a);
    }
    // adding a heading: like a highlight, kind «عنوان»
    await a.evaluate(() => window.TocMock.add());
    await T(700);
    await H.shot(a, 'toc-3-add');
    await closeAll(a);
    // what the app finds by itself in a book with words
    await a.evaluate(() => window.TocMock.suggestBoxes(10));
    await a.evaluate(() => window.TocMock.suggest());
    await T(900);
    await H.shot(a, 'toc-4-suggest');
    await closeAll(a);
    // from the printed contents page
    await a.evaluate(() => window.TocMock.print());
    await T(900);
    await H.shot(a, 'toc-5-print');
    await closeAll(a);
    // highlights used as headings → headings
    await a.evaluate(() => window.TocMock.convert());
    await T(900);
    await H.shot(a, 'toc-6-convert');
    await closeAll(a);
    await a.evaluate(() => window.A.R.close());
    await T(600);
    // the plan by chapters on the book's page
    await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
    await a.waitForSelector('.tabpane');
    await a.evaluate(() => window.TocMock.plan());
    await a.$eval('.tabs', (e) => e.scrollIntoView());
    await T(400);
    await H.shot(a, 'toc-7-plan');
    // Today: the chapter under the portion
    await a.evaluate(() => {
      document.querySelectorAll('[data-rt-skip]').forEach((e) => e.removeAttribute('data-rt-skip'));
      window.A.V.go('home');
    });
    await a.waitForSelector('.hero .hi-w');
    await T(500);
    await a.evaluate(() => window.TocMock.hero());
    await T(300);
    await H.shot(a, 'toc-8-today');
    console.log('done');
  } finally {
    await browser.close();
    await env.stop();
  }
})();
