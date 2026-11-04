#!/usr/bin/env node
/*
 * Pictures of headings on the book's pages (tests/e2e/mocks/heads-options.js): a 4-page Arabic book made on the
 * spot (mocks/heads-book.js) with headings at four levels — فصل / مبحث / مطلب / فرع — beside a highlight and a
 * note, in three looks; then the add sheet, the contents list and «خلاصة الورد» with what the portion covered.
 *
 *   node tests/e2e/heads-options.js      → tests/e2e/shots/hd-*.png
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
  const vp = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 };
  try {
    const PDF = path.join(os.tmpdir(), 'naqra-heads-book.pdf');
    const marks = await Book.make(browser, PDF);
    const A = await H.newUser(browser, env, 'hd@test.local', vp);
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
    await a.fill('#ab-title', 'التاريخ الإسلامي (تجربة)').catch(() => {});
    await a.click('#ab-form button.btn.gold');
    await a.waitForSelector('#pl-form', { timeout: 30000 });
    await a.fill('#pl-per', '3');
    await a.click('#pl-form button.btn.gold');
    await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
    const bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
    // portion 1 = pages 1–3, portion 2 = page 4; a highlight and a note on page 1 beside the headings
    await a.evaluate(
      async ({ id, lines }) => {
        const { D, S, U } = window.A;
        const wirds = [
          { id: 'w1', n: 1, from: 1, to: 3, start: U.today(), due: U.today() },
          { id: 'w2', n: 2, from: 4, to: 4, start: U.addDays(U.today(), 1), due: U.addDays(U.today(), 1) },
        ];
        await D.update(`books/${id}`, { title: 'التاريخ الإسلامي (تجربة)', wirds });
        const l = lines.find((x) => x.p === 1 && x.k === 1).first;
        await D.set(`notes/${D.newId()}`, { b: id, page: 1, kind: 'hl', text: '', rect: { x: l.x + l.w * 0.35, y: l.y, w: l.w * 0.65, h: l.h }, color: '#f5c542', by: S.me, at: U.nowIso(), likes: {}, replies: {}, crop: null });
        const l2 = lines.find((x) => x.p === 1 && x.k === 2).first;
        await D.set(`notes/${D.newId()}`, { b: id, page: 1, kind: 'note', text: 'السقيفة = مكان مسقوف كانوا بيجتمعوا فيه', rect: { x: l2.x + 0.04, y: l2.y + l2.h / 2, w: 0, h: 0 }, color: '#4fc59a', by: S.me, at: U.nowIso(), likes: {}, replies: {}, crop: null });
        await D.saveProg(id, () => ({ last: 1, seen: [[1, 1]] }));
        U.store.set('rdFocusOffered', U.today());
      },
      { id: bookId, lines: marks.lines },
    );
    await T(1500);
    await closeAll(a);
    await a.addStyleTag({ content: '#toasts { display: none !important; }' });
    await a.addScriptTag({ path: path.join(__dirname, 'mocks', 'heads-options.js') });
    await a.evaluate((o) => window.HeadMock.setup(o), { bookId, heads: marks.heads, pages: 4 });

    await a.evaluate((id) => window.A.R.open(id, { page: 1 }), bookId);
    await a.waitForSelector('.pg-ov[data-p="1"] .hlb', { timeout: 20000 });
    await T(2500);
    for (const s of ['a', 'b', 'c']) {
      await a.evaluate((s) => {
        window.HeadMock.draw(s);
        window.HeadMock.strip(1, 0.9);
      }, s);
      await T(400);
      await H.shot(a, 'hd-1' + s);
    }
    // night pages, look أ
    const themeOf = () => a.evaluate(() => (document.querySelector('.rd') || {}).dataset.theme);
    await a.evaluate(() => window.HeadMock.clear());
    for (let i = 0; i < 3 && (await themeOf()) !== 'night'; i++) {
      await a.click('[data-act="theme"]');
      await T(300);
    }
    await T(1200);
    await a.evaluate(() => {
      window.HeadMock.draw('a');
      window.HeadMock.strip(1, 0.9);
    });
    await T(300);
    await H.shot(a, 'hd-1a-night');
    for (let i = 0; i < 3 && (await themeOf()) !== 'day'; i++) {
      await a.click('[data-act="theme"]');
      await T(300);
    }
    await T(800);
    await a.evaluate(() => window.HeadMock.clear());
    // adding a heading, the contents, «خلاصة الورد»
    await a.evaluate(() => window.HeadMock.add());
    await T(800);
    await H.shot(a, 'hd-2-add');
    await closeAll(a);
    await a.evaluate(() => window.HeadMock.toc());
    await T(500);
    await H.shot(a, 'hd-3-toc');
    await closeAll(a);
    await a.evaluate(() => {
      document.querySelectorAll('.hm-strip').forEach((e) => e.remove());
      window.A.R.close();
    });
    await T(600);
    await a.evaluate(() => window.HeadMock.take({ id: 'w1', from: 1, to: 3 }));
    await T(700);
    await H.shot(a, 'hd-4-take');
    console.log('done');
  } finally {
    await browser.close();
    await env.stop();
  }
})();
