#!/usr/bin/env node
/*
 * Pictures of the top of a book's page as it is and in three mock-up looks (tests/e2e/mocks/book-hero.js), on a
 * book like the owner's: 432 pages, 43 portions, 15% read, a reading pace for the forecast.
 *
 *   node tests/e2e/book-hero.js      → tests/e2e/shots/bh-*.png
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');
const T = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  try {
    const A = await H.newUser(browser, env, 'bh@test.local', { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 });
    const a = A.page;
    await a.fill('#cn-name', 'حلقة');
    await a.click('#circle-new button');
    await a.waitForSelector('#join-name', { timeout: 20000 });
    await a.fill('#join-name', 'محمود خضير');
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
      const { D, S, U } = window.A;
      const wirds = Array.from({ length: 43 }, (_, i) => ({ id: 'w' + (i + 1), n: i + 1, from: 9 + i * 10, to: Math.min(432, 18 + i * 10), start: U.addDays(U.today(), i - 8), due: U.addDays(U.today(), i - 8) }));
      await D.update(`books/${id}`, Object.assign({}, { title: 'التاريخ الإسلامي الوجيز', author: 'محمد سهيل طقوش', pages: 432, wirds }));
      const days = {};
      for (let i = 1; i <= 8; i++) days[U.addDays(U.today(), -i)] = 14;
      await D.updateMe(() => ({ days }));
      const done = {};
      for (let i = 1; i <= 7; i++) done['w' + i] = new Date().toISOString();
      await D.saveProg(id, () => ({ done, last: 73, seen: [[1, 72]] }));
    }, bookId);
    await T(2500);
    await a.evaluate(() => window.A.V.sheets.slice().forEach((s) => s.close()));
    await a.addStyleTag({ content: '#toasts { display: none !important; }' });
    await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
    await a.waitForSelector('.bp-hero');
    await T(500);
    await H.shot(a, 'bh-0-now');
    await a.addScriptTag({ path: path.join(__dirname, 'mocks', 'book-hero.js') });
    for (const s of ['a', 'b', 'c']) {
      await a.evaluate(() => {
        document.querySelectorAll('[data-rt-skip]').forEach((e) => e.removeAttribute('data-rt-skip'));
        document.getElementById('screen').innerHTML = '';
        window.A.V.go('home');
      });
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.bp-hero');
      await a.evaluate((s) => window.BookMock.show(s), s);
      await a.evaluate(() => (document.getElementById('screen').scrollTop = 0));
      await T(400);
      await H.shot(a, 'bh-' + s);
    }
    console.log('done');
  } finally {
    await browser.close();
    await env.stop();
  }
})();
