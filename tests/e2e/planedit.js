#!/usr/bin/env node
/*
 * Changing a plan, and every place that shows it: «يوم زيادة», «يوم تعويض بعده» (and taking it out), «قسّم الباقي
 * من هنا», a little left over going on the last portion, a portion far from the usual size marked, a line in the
 * news and «الجديد ليك» for the others, «رجّعها». After each change: the plan's calendar and list, «اليوم» (the
 * portion, its day, the catch-up line, «مين وصل فين»), the widget's texts, the reader's portion bar, the «التقدّم»
 * table, a member's phone.
 *
 *   node tests/e2e/planedit.js      → tests/e2e/shots/pe-*.png
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
    console.log(`FAIL  ${name}\n      ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n      ')}`);
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
async function shot(p, name) {
  await p.addStyleTag({ content: '#toasts { visibility: hidden !important; }' });
  await T(300);
  return H.shot(p, name);
}
const plan = (p, id) => p.evaluate((id) => window.A.S.books.get(id).wirds.map((w) => ({ id: w.id, n: w.n, from: w.from, to: w.to, start: w.start, due: w.due })), id);
const day = (p, n) => p.evaluate((n) => window.A.U.addDays(window.A.U.today(), n), n);
/* What the app shows for the book right now, everywhere it shows the plan. */
const views = (p, id) =>
  p.evaluate((id) => {
    const { G, S, A: _ } = window.A;
    const b = S.books.get(id);
    const w = G.myCurrent(b);
    const g = G.groupCurrent(b);
    const wd = window.A.Widget && window.A.Widget.data ? window.A.Widget.data() : null;
    return { mine: w && w.n, minePages: w && `${w.from}-${w.to}`, mineDue: w && w.due, group: g && g.n, gapToday: G.gapDay(b), widget: wd && wd.line, n: b.wirds.length };
  }, id);

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId;
  try {
    await step('A circle of two, a 40-page book in portions of 4 a day, begun three days ago; the owner is up to date', async () => {
      const A = await H.newUser(browser, env, 'pea@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الخطة');
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
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const wirds = S.books.get(id).wirds.map((w, i) => Object.assign({}, w, { start: U.addDays(U.today(), i - 3), due: U.addDays(U.today(), i - 3) }));
        await D.update(`books/${id}`, { wirds });
        const done = {};
        for (const w of wirds.slice(0, 3)) done[w.id] = new Date().toISOString();
        await D.saveProg(id, () => ({ done, last: 12, seen: [[1, 12]] }));
      }, bookId);
      const cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'peb@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await b.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await until(a, 'two members', () => window.A.S.members.size === 2);
      await T(1500);
      await closeAll(a);
      await closeAll(b);
      const v = await views(a, bookId);
      assert(v.mine === 4 && v.group === 4 && v.minePages === '13-16', 'start: ' + JSON.stringify(v));
      return JSON.stringify(v);
    });

    await step('The portion\'s sheet shows the planner four tools; a member sees none', async () => {
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.click('.wcal .wc-c:not(.cont)[data-w="w4"]');
      await a.waitForSelector('.wsheet .ws-plan');
      const tools = await a.$$eval('.ws-plan [data-act]', (x) => x.map((e) => e.dataset.act));
      assert(tools.join() === 'wird-pages,wird-extend,wird-gap,wird-replan', 'tools: ' + tools);
      await shot(a, 'pe-tools');
      await closeAll(a);
      await b.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await b.click('.wcal .wc-c:not(.cont)[data-w="w4"]');
      await b.waitForSelector('.wsheet');
      assert(!(await b.$('.wsheet .ws-plan')), 'a member has the tools');
      await closeAll(b);
    });

    await step('«يوم زيادة» for today\'s portion: it ends tomorrow, the ones after move a day; Today, the widget and her phone follow; the news says so', async () => {
      const before = await plan(a, bookId);
      await a.click('.wcal .wc-c:not(.cont)[data-w="w4"]');
      await a.click('.ws-plan [data-act="wird-extend"]');
      await a.click('.sheet [data-yes]');
      const tom = await day(a, 1);
      await until(a, 'saved', (arg) => window.A.S.books.get(arg.id).wirds[3].due === arg.tom, { id: bookId, tom });
      const after = await plan(a, bookId);
      for (let i = 4; i < after.length; i++) assert(after[i].start === (await a.evaluate((d) => window.A.U.addDays(d, 1), before[i].start)), `portion ${i + 1}: ${before[i].start} → ${after[i].start}`);
      assert(after.every((w, i) => w.from === before[i].from && w.to === before[i].to), 'pages changed');
      const v = await views(a, bookId);
      assert(v.mine === 4 && v.mineDue === tom && /الورد ٤/.test(v.widget || ''), 'views: ' + JSON.stringify(v));
      await a.evaluate(() => window.A.V.go('home'));
      const due = await a.textContent('.hero .due');
      assert(/بكرة/.test(due), 'Today says: ' + due);
      await until(b, 'her phone', (arg) => window.A.S.books.get(arg.id).wirds[3].due === arg.tom, { id: bookId, tom });
      await until(b, 'news for her', () => window.A.V.inboxItems().some((x) => x.kind === 'off' && x.o && x.o.kind === 'plan'));
      await b.evaluate(() => window.A.V.go('circle'));
      await until(b, 'news line', () => [...document.querySelectorAll('.feed .ev')].some((e) => /تعديل في خطة/.test(e.textContent) && /يوم زيادة/.test(e.textContent)));
      await shot(b, 'pe-news');
      return `w4 due ${tom}`;
    });

    await step('«رجّعها» puts it back as it was, and the news line goes', async () => {
      const before = await plan(a, bookId);
      await a.evaluate(() => window.A.V.actions['plan-undo']());
      await until(a, 'back', (arg) => window.A.S.books.get(arg.id).wirds[3].due === arg.today, { id: bookId, today: await day(a, 0) });
      const after = await plan(a, bookId);
      assert(after[4].start === (await a.evaluate((d) => window.A.U.addDays(d, -1), before[4].start)), 'not back: ' + JSON.stringify(after.slice(3, 6)));
      await until(b, 'news gone', () => !window.A.V.inboxItems().some((x) => x.kind === 'off' && x.o && x.o.kind === 'plan'));
    });

    await step('«يوم تعويض» after yesterday\'s portion: today is a catch-up day — calendar 🔄, list row, Today\'s line, the widget, the reader and the table follow', async () => {
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.click('.wcal .wc-c:not(.cont)[data-w="w3"]');
      await a.click('.ws-plan [data-act="wird-gap"]');
      await a.click('.sheet [data-yes]');
      const today = await day(a, 0), tom = await day(a, 1);
      await until(a, 'saved', (arg) => window.A.S.books.get(arg.id).wirds[3].start === arg.tom, { id: bookId, tom });
      const v = await views(a, bookId);
      assert(v.gapToday && v.mine === 4 && v.mineDue === tom && v.group === 4, 'views: ' + JSON.stringify(v));
      await closeAll(a);
      await a.waitForSelector(`.wcal .wc-x.gap[data-d="${today}"]`);
      await shot(a, 'pe-cal-gap');
      await a.click('.plan-views [data-v="list"]');
      await a.waitForSelector('.wlist .wl-off.gap');
      await shot(a, 'pe-list-gap');
      await a.click('.plan-views [data-v="cal"]');
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('.hero .hi-gap');
      const hero = await a.textContent('.hero');
      assert(/الورد ٤/.test(hero) && /بكرة/.test(hero), 'Today: ' + hero.replace(/\s+/g, ' ').slice(0, 200));
      await shot(a, 'pe-today-gap');
      // the reader's portion bar: a square per page of my portion
      await a.evaluate((id) => window.A.R.open(id, { page: 13 }), bookId);
      await until(a, 'reader', () => window.A.R.isOpen() && document.querySelectorAll('#rd-wprog i').length > 0, null, 15000);
      const sq = await a.$$eval('#rd-wprog i', (x) => x.length);
      assert(sq === 4, 'squares: ' + sq);
      await a.evaluate(() => window.A.R.close(true));
      // the «التقدّم» table: a column per portion
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'people' }), bookId);
      const cols = await a.$$eval('.matrix thead th[scope="col"]', (x) => x.length);
      assert(cols === v.n, `columns ${cols} vs ${v.n} portions`);
      return JSON.stringify(v);
    });

    await step('The catch-up day taken out from the calendar: the portions come back a day', async () => {
      const today = await day(a, 0);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.click(`.wcal .wc-x.gap[data-d="${today}"]`);
      await a.click('.mi:has-text("شيل يوم التعويض")');
      await until(a, 'back', (arg) => window.A.S.books.get(arg.id).wirds[3].start === arg.today, { id: bookId, today });
      const v = await views(a, bookId);
      assert(!v.gapToday && v.mineDue === today, 'views: ' + JSON.stringify(v));
      // the calendar draws again; a click before that (fast machines) landed on the portion after
      await a.waitForSelector(`.wcal .wc-c:not(.cont)[data-w="w4"][data-d="${today}"]`);
    });

    await step('«قسّم الباقي من هنا» from portion 4 at 6 pages a day: fewer portions, the first ids kept, the end earlier; everything follows', async () => {
      const before = await plan(a, bookId);
      await a.click('.wcal .wc-c:not(.cont)[data-w="w4"]');
      await a.click('.ws-plan [data-act="wird-replan"]');
      await a.waitForSelector('#rp-form');
      if (await a.$('#rp-form [data-by="per"]:not(.on)')) await a.click('#rp-form [data-by="per"]');
      for (let i = 0; i < 2; i++) await a.click('#rp-form [data-per="1"]');
      const sum = await a.textContent('#rp-form .rp-sum');
      assert(/٥ أوراد/.test(sum) && /كل ورد ٦ صفحات|٦/.test(sum), 'summary: ' + sum);
      await shot(a, 'pe-replan');
      await a.click('#rp-form button.btn.gold');
      await until(a, 'saved', (id) => window.A.S.books.get(id).wirds.length === 8, bookId);
      const after = await plan(a, bookId);
      assert(after.slice(0, 3).every((w, i) => JSON.stringify(w) === JSON.stringify(before[i])), 'the first three moved');
      assert(after.slice(3).map((w) => `${w.from}-${w.to}`).join(' ') === '13-18 19-24 25-30 31-36 37-40', 'pages: ' + after.slice(3).map((w) => `${w.from}-${w.to}`).join(' '));
      assert(after.slice(3).map((w) => w.id).join() === 'w4,w5,w6,w7,w8', 'ids: ' + after.slice(3).map((w) => w.id));
      const v = await views(a, bookId);
      assert(v.minePages === '13-18' && v.n === 8 && /ص ١٣–١٨/.test(v.widget || ''), 'views: ' + JSON.stringify(v));
      await until(b, 'her phone', (id) => window.A.S.books.get(id).wirds.length === 8, bookId);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'people' }), bookId);
      assert((await a.$$eval('.matrix thead th[scope="col"]', (x) => x.length)) === 8, 'table columns');
      return after.map((w) => `${w.from}-${w.to}`).join(' ');
    });

    await step('A little left over (2 pages) goes on the last portion, not a day of its own', async () => {
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.click('.wcal .wc-c:not(.cont)[data-w="w5"]');
      await a.click('.ws-plan [data-act="wird-pages"]');
      await a.waitForSelector('#wp-form');
      await a.click('#wp-form [data-mode="roll"]');
      for (let i = 0; i < 2; i++) await a.click('#wp-form [data-step="to"][data-d="-1"]');
      const sum = await a.textContent('#wp-form .wp-sum');
      assert(/اتضافت على آخر ورد/.test(sum), 'summary: ' + sum);
      await a.click('#wp-form button.btn.gold');
      await until(a, 'saved', (id) => window.A.S.books.get(id).wirds[4].to === 22, bookId);
      const after = await plan(a, bookId);
      assert(after.length === 8 && after[7].from === 35 && after[7].to === 40, 'end: ' + after.map((w) => `${w.from}-${w.to}`).join(' '));
      return after.map((w) => `${w.from}-${w.to}`).join(' ');
    });

    await step('A portion far longer than usual is marked in the calendar and the list', async () => {
      await a.click('.wcal .wc-c:not(.cont)[data-w="w6"]');
      await a.click('.ws-plan [data-act="wird-pages"]');
      await a.waitForSelector('#wp-form');
      await a.click('#wp-form [data-mode="next"]');
      for (let i = 0; i < 5; i++) await a.click('#wp-form [data-step="to"][data-d="1"]');
      await a.click('#wp-form button.btn.gold');
      await until(a, 'saved', (id) => window.A.S.books.get(id).wirds[5].to - window.A.S.books.get(id).wirds[5].from + 1 === 11, bookId);
      await closeAll(a);
      await a.waitForSelector('.wcal .wc-c[data-w="w6"] small.odd');
      await shot(a, 'pe-cal-odd');
      await a.click('.plan-views [data-v="list"]');
      await a.waitForSelector('.wlist .wl-r[data-w="w6"] .wl-odd');
      await a.click('.plan-views [data-v="cal"]');
    });

    await step('«خلّصته» follows the pages: a planner moves pages, my marks and hers are laid again on the new portions; a day off changes nothing', async () => {
      await closeAll(a);
      await closeAll(b);
      // a fresh plan: ten portions of 4 pages, begun three days ago; I finished 1–16 (portions 1–4, old marks
      // without pages first), she marked portions 1–4 done in the app
      await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const wirds = Array.from({ length: 10 }, (_, i) => ({ id: 'w' + (i + 1), n: i + 1, from: i * 4 + 1, to: i * 4 + 4, start: U.addDays(U.today(), i - 3), due: U.addDays(U.today(), i - 3) }));
        await D.update(`books/${id}`, { wirds });
        const t = new Date().toISOString();
        await D.saveProg(id, () => ({ done: { w1: t, w2: t, w3: t, w4: t }, doneR: null, last: 17, seen: [[1, 16]] }));
      }, bookId);
      await until(a, 'pages recorded for the old marks', (id) => { const p = window.A.D.prog(id); return p.doneR && p.doneR.w4 && p.doneR.w4[1] === 16; }, bookId, 10000);
      await until(b, 'her phone has the plan', (id) => window.A.S.books.get(id).wirds[9].to === 40, bookId);
      await b.evaluate(async (id) => {
        for (const w of ['w1', 'w2', 'w3', 'w4']) await window.A.V.markWird(id, w).then(() => new Promise((r) => setTimeout(r, 1600)));
        window.A.V.sheets.slice().forEach((s) => s.close());
      }, bookId);
      await until(b, 'her marks', (id) => Object.keys(window.A.D.prog(id).done || {}).length === 4 && window.A.D.prog(id).doneR.w4[1] === 16, bookId, 15000);
      // the planner makes portion 4 end at 18 (portion 5 takes the difference): 4 is now 13–18, unread past 16
      await a.evaluate(async (id) => {
        const { S, V, G } = window.A;
        const b = S.books.get(id);
        await V.savePlan(b, V.reflow(G.wirds(b), 3, 18, 'next'), { k: 'pages', n: 4, mode: 'next' });
      }, bookId);
      await until(a, 'my marks follow the pages', (id) => { const p = window.A.D.prog(id); return !p.done.w4 && p.done.w3; }, bookId, 10000);
      let v = await views(a, bookId);
      assert(v.mine === 4 && v.minePages === '13-18', 'my place: ' + JSON.stringify(v));
      await until(b, 'hers too, on her phone', (id) => { const p = window.A.D.prog(id); return !p.done.w4 && p.done.w3 && p.doneR.w3[1] === 12; }, bookId, 10000);
      // shorter portion 2 with the rest rolled along: 1–4, 5–6, 7–10, 11–16, 17–18 …: pages 1–16 are portions 1–4 now
      await a.evaluate(async (id) => {
        const { S, V, G } = window.A;
        const b = S.books.get(id);
        await V.savePlan(b, V.reflow(G.wirds(b), 1, 6, 'roll'), { k: 'pages', n: 2, mode: 'roll' });
      }, bookId);
      await until(a, 'laid again', (id) => { const p = window.A.D.prog(id); return p.doneR.w3 && p.doneR.w3[1] === 10; }, bookId, 10000);
      const mine = await a.evaluate((id) => Object.keys(window.A.D.prog(id).done).sort().join(), bookId);
      assert(mine === 'w1,w2,w3,w4', 'done after the roll: ' + mine);
      v = await views(a, bookId);
      assert(v.mine === 5 && v.minePages === '17-18', 'my place after the roll: ' + JSON.stringify(v));
      // a day off yesterday moves dates only: my marks stay as they are
      const before = await a.evaluate((id) => JSON.stringify(window.A.D.prog(id).done), bookId);
      await a.evaluate(() => window.A.Off.addDate(window.A.U.addDays(window.A.U.today(), -1)));
      await until(a, 'day off', () => window.A.G.isOff(window.A.U.addDays(window.A.U.today(), -1)));
      await T(2500);
      assert((await a.evaluate((id) => JSON.stringify(window.A.D.prog(id).done), bookId)) === before, 'a day off changed my marks');
      v = await views(a, bookId);
      assert(v.mine === 5 && v.minePages === '17-18', 'my place after the day off: ' + JSON.stringify(v));
      // Today opens where I am: page 17, the first page of portion 5
      await a.evaluate(() => window.A.V.go('home'));
      const cta = await a.$eval('.hero [data-act="read"]', (e) => +e.dataset.p);
      assert(cta === 17, 'Today opens at p. ' + cta);
      return `${mine}; place ${v.minePages}`;
    });

    await step('No console errors', async () => {
      const errs = [...(a.__errors || []), ...(b.__errors || [])].filter((e) => !/favicon|fonts|404/.test(e));
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
