#!/usr/bin/env node
/*
 * Pictures of the plan tab in four mock-up looks (tests/e2e/mocks/plan-options.js) on a circle like the owner's:
 * four members, a long plan of portions of different sizes started a week ago, a day off next week. Also the
 * Today header with a streak freeze and the news in colour, to look at.
 *
 *   node tests/e2e/plan-options.js      → tests/e2e/shots/po-*.png
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
  await T(300);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const vp = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 };
  try {
    const A = await H.newUser(browser, env, 'poa@test.local', vp);
    const a = A.page;
    await a.fill('#cn-name', 'حلقة التاريخ');
    await a.click('#circle-new button');
    await a.waitForSelector('#join-name', { timeout: 20000 });
    await a.fill('#join-name', 'محمود خضير');
    await a.click('#join-form button[type=submit]');
    await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
    await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
    await a.locator('[data-act="add-book"]:visible').first().click();
    await a.setInputFiles('#ab-file', PDF);
    await a.waitForSelector('#ab-form', { timeout: 30000 });
    await a.fill('#ab-form input[name="title"], #ab-title', 'التاريخ الإسلامي الوجيز').catch(() => {});
    await a.click('#ab-form button.btn.gold');
    await a.waitForSelector('#pl-form', { timeout: 30000 });
    await a.fill('#pl-per', '4');
    await a.click('#pl-form button.btn.gold');
    await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
    const bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
    // a long plan like the owner's: a portion a day from a week ago, sizes 5–12 pages, a day off next Friday
    await a.evaluate(async (bookId) => {
      const { D, S, U } = window.A;
      const sizes = [10, 10, 10, 10, 10, 10, 10, 5, 10, 12, 8, 10, 10, 6, 10, 10, 10, 12, 10, 10, 9, 10, 10, 10, 7, 10, 10, 10, 10, 10, 12, 10, 10, 10, 10, 10, 8, 10, 10, 10, 10, 10, 10];
      const off = U.addDays(U.weekStart(), 13); // Friday next week
      let d = U.addDays(U.today(), -7), p = 1;
      const wirds = sizes.map((n, i) => {
        if (d === off) d = U.addDays(d, 1);
        const w = { id: 'w' + (i + 1), n: i + 1, from: p, to: p + n - 1, start: d, due: d };
        p += n;
        d = U.addDays(d, 1);
        return w;
      });
      const b = S.books.get(bookId);
      await D.set(`books/${bookId}`, Object.assign({}, b, { title: 'التاريخ الإسلامي الوجيز', pages: p - 1, wirds }));
      await D.set('meta/circle', Object.assign({}, window.A.V.clean(S.circle), { off: { dates: [off], weekly: [] } }));
      const done = {};
      for (let i = 1; i <= 7; i++) done['w' + i] = new Date(Date.now() - (8 - i) * 864e5).toISOString();
      await D.saveProg(bookId, () => ({ done, last: 67, seen: [[1, 67]] }));
    }, bookId);
    const cid = await a.evaluate(() => window.A.P.circle().id);
    const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
    const people = [['سارة', 7], ['عمر', 4], ['ليلى', 8]];
    for (const [name, upto] of people) {
      const U2 = await H.newUser(browser, env, `po-${upto}@test.local`, Object.assign({ url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code }, vp));
      const q = U2.page;
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', name);
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await q.evaluate(
        async ({ bookId, upto }) => {
          const done = {};
          for (let i = 1; i <= upto; i++) done['w' + i] = new Date(Date.now() - (9 - i) * 864e5).toISOString();
          await window.A.D.saveProg(bookId, () => ({ done, last: 1 }));
        },
        { bookId, upto },
      );
      await U2.context.close().catch(() => {});
    }
    await a.waitForFunction(() => window.A.S.members.size === 4, null, { timeout: 15000 });
    // a streak freeze and a few notes of every kind for the news
    await a.evaluate(async (bookId) => {
      const { D, S, U } = window.A;
      const days = {};
      for (let i = 0; i <= 8; i++) days[U.addDays(U.today(), -i)] = 10; // nine days in a row: a streak freeze
      await D.updateMe(() => ({ days }));
      const mk = (kind, page, text) => D.set(`notes/${D.newId()}`, { b: bookId, page, kind, text, rect: kind === 'take' ? null : { x: 0.1, y: 0.3, w: kind === 'note' || kind === 'q' ? 0.004 : 0.6, h: kind === 'note' || kind === 'q' ? 0.004 : 0.05 }, color: '#f2c94c', by: S.me, wid: kind === 'take' ? 'w5' : '', at: U.nowIso(), likes: {}, replies: {}, crop: null });
      await mk('take', 46, 'مفيش راحة بمجرد الوصول للمدينة بعد اضطهاد ورحلة شاقة؛ بدأت الغزوات ورحلة الجهاد.');
      await mk('q', 30, 'ليه الهجرة كانت للمدينة بالذات؟');
      await mk('quote', 22, 'الأمم لا تُبنى إلا بالصبر والعدل.');
      await mk('note', 12, 'ملاحظة: الخريطة في الصفحة دي مهمة.');
      await mk('hl', 9, 'تظليل على جملة مهمة');
    }, bookId);
    await T(2500);
    await closeAll(a);
    await a.addStyleTag({ content: '#toasts { display: none !important; }' });
    await a.evaluate(() => window.A.V.go('home'));
    await T(800);
    await H.shot(a, 'po-today-head');
    await a.evaluate(() => window.A.V.go('circle'));
    await a.waitForSelector('.feed .ncard');
    await a.$eval('.feed', (e) => e.scrollIntoView());
    await T(400);
    await H.shot(a, 'po-news');
    await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
    await a.waitForSelector('.wcal');
    await a.$eval('.wc-now', (e) => e.scrollIntoView());
    await T(300);
    await H.shot(a, 'po-0-now');
    await a.addScriptTag({ path: path.join(__dirname, 'mocks', 'plan-options.js') });
    for (const s of ['calm', 'list', 'bar', 'week']) {
      await a.evaluate(() => window.A.V.go('home'));
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.wcal');
      await a.evaluate((s) => window.PlanMock.show(s), s);
      await a.$eval('.pm-note', (e) => e.scrollIntoView());
      await a.evaluate(() => (document.getElementById('screen').scrollTop -= 8));
      await T(300);
      await H.shot(a, 'po-' + s);
    }
    console.log('done');
  } finally {
    await browser.close();
    await env.stop();
  }
})();
