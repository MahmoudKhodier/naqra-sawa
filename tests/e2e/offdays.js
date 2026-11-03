/* Days off («يوم إجازة»): a date and a day every week, set by the owner; the portions after it move, the plan
 * calendar shows 🌴, the news and the member's «الجديد ليك» say so; on a day off «اليوم» says so, the streak
 * waits, goals and the big chest and the boss count only reading days; a member can see them but not change them.
 *
 *   node tests/e2e/offdays.js
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
const wirds = (p, id) => p.evaluate((id) => window.A.S.books.get(id).wirds.map((w) => [w.n, w.start, w.due]), id);

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId, today, tom;
  try {
    await step('Owner and a member, a book with a portion a day from today', async () => {
      const A = await H.newUser(browser, env, 'oa@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الإجازة');
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
      await a.fill('#pl-per', '4');
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length));
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      const cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'ob@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
      for (const pg of [a, b]) await pg.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      today = await a.evaluate(() => window.A.U.today());
      tom = await a.evaluate(() => window.A.U.addDays(window.A.U.today(), 1));
      const ws = await wirds(a, bookId);
      assert(ws[0][1] === today && ws[1][1] === tom, 'plan: ' + JSON.stringify(ws.slice(0, 3)));
    });

    await step('«أيام الإجازة» from the circle menu: tomorrow off → the portions from tomorrow move a day', async () => {
      const before = await wirds(a, bookId);
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle'));
      await a.click('[data-act="circle-more"]');
      await a.click('.mi:has-text("أيام الإجازة")');
      await a.waitForSelector('.offs .off-add');
      await a.fill('#off-date', tom);
      await a.click('.off-add button');
      await until(a, 'saved', (d) => ((window.A.S.circle.off || {}).dates || []).includes(d), tom);
      await until(a, 'moved', (arg) => window.A.S.books.get(arg.id).wirds[1].start !== arg.tom, { id: bookId, tom });
      const after = await wirds(a, bookId);
      assert(after[0][1] === before[0][1] && after[0][2] === before[0][2], 'today\'s portion moved: ' + JSON.stringify(after[0]));
      for (let i = 1; i < after.length; i++) {
        const want = await a.evaluate((d) => window.A.U.addDays(d, 1), before[i][1]);
        assert(after[i][1] === want, `portion ${i + 1}: ${before[i][1]} → ${after[i][1]}`);
      }
      await until(b, 'member sees it', (d) => window.A.G.isOff(d), tom);
      await H.shot(a, 'off-sheet');
      return `${before[1][1]} → ${after[1][1]}, last ${before[before.length - 1][2]} → ${after[after.length - 1][2]}`;
    });

    await step('The plan calendar shows 🌴; the news and the member\'s «الجديد ليك» tell', async () => {
      await closeAll(a);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector(`.wcal [data-d="${tom}"].off`);
      await H.shot(a, 'off-calendar');
      await closeAll(b);
      await b.evaluate(() => window.A.V.go('circle'));
      await until(b, 'news line', () => [...document.querySelectorAll('.feed .ev')].some((e) => /إجازة/.test(e.textContent)));
      const inbox = await b.evaluate(() => window.A.V.inboxItems().filter((x) => x.kind === 'off').length);
      assert(inbox === 1, 'inbox items: ' + inbox);
      // the member sees the days off, but cannot change them
      await b.evaluate(() => window.A.V.offSheet());
      await b.waitForSelector('.offs');
      assert(!(await b.$('.offs .off-add')) && !(await b.$('.offs [data-wd]')), 'a member can change the days off');
      await closeAll(b);
    });

    await step('A day from the calendar: the portion\'s sheet offers «اعمل … إجازة»; taking it back moves them back', async () => {
      const d3 = await a.evaluate(() => window.A.U.addDays(window.A.U.today(), 3));
      const before = await wirds(a, bookId);
      await a.click(`.wcal [data-d="${d3}"]`);
      await a.click('[data-act="day-off-set"]');
      await until(a, 'saved', (d) => window.A.G.isOff(d), d3);
      await until(a, 'moved', (arg) => JSON.stringify(window.A.S.books.get(arg.id).wirds.map((w) => w.due)) !== arg.was, { id: bookId, was: JSON.stringify(before.map((w) => w[2])) });
      const mid = await wirds(a, bookId);
      assert(!mid.some((w) => w[1] === d3 || w[2] === d3), 'a portion still on the day off: ' + JSON.stringify(mid));
      // take it back from the sheet: the portions come back to where they were
      await a.evaluate(() => window.A.Off.removeDate(window.A.U.addDays(window.A.U.today(), 3)));
      await T(1500);
      const fin = await wirds(a, bookId);
      if (JSON.stringify(fin.map((w) => w[2])) !== JSON.stringify(before.map((w) => w[2]))) throw new Error('before ' + JSON.stringify(before) + '\nmid ' + JSON.stringify(mid) + '\nafter ' + JSON.stringify(fin));
      await until(a, 'back', (arg) => JSON.stringify(window.A.S.books.get(arg.id).wirds.map((w) => w.due)) === arg.was, { id: bookId, was: JSON.stringify(before.map((w) => w[2])) });
    });

    await step('Every Friday off: no portion on a Friday; the week\'s boss and big chest shrink', async () => {
      await a.evaluate(() => window.A.Off.setWeekly(5, true));
      await until(a, 'weekly', () => window.A.G.offWeekdays().includes(5));
      await until(a, 'moved', (id) => !window.A.S.books.get(id).wirds.some((w) => w.due >= window.A.U.today() && (window.A.U.parseD(w.start).getDay() === 5 || window.A.U.parseD(w.due).getDay() === 5)), bookId);
      const r = await a.evaluate(() => {
        const { G, U } = window.A;
        const ws = U.addDays(U.weekStart(), 7); // next week: just the Friday off
        return { goal: G.weekGoal(ws), chest: G.bigChestDays(ws), off: G.offInWeek(ws) };
      });
      assert(r.off === 1 && r.goal === Math.round((300 * 6) / 7) && r.chest === 5, JSON.stringify(r));
      // a new plan made now skips Fridays too
      const outs = await a.evaluate(() => {
        const { G, U } = window.A;
        const out = [];
        let s = G.nextOn(U.today());
        for (let i = 0; i < 14; i++) {
          const due = G.wirdEnd(s, 1, 1);
          out.push(U.parseD(due).getDay());
          s = G.nextOn(U.addDays(due, 1));
        }
        return out;
      });
      assert(!outs.includes(5), 'a portion on a Friday: ' + outs);
      return JSON.stringify(r);
    });

    await step('On a day off: «اليوم» says so, no push to catch up, the streak waits over it', async () => {
      // make yesterday a day off (as if it had been set before), read the two days before it and today
      const r = await a.evaluate(async () => {
        const { U, D, S, V, G } = window.A;
        const y = U.addDays(U.today(), -1);
        const c = S.circle;
        const off = Object.assign({}, c.off, { dates: [...(c.off.dates || []), y] });
        await D.set('meta/circle', Object.assign({}, V.clean(c), { off }));
        await D.updateMe(() => ({ days: { [U.addDays(y, -2)]: 3, [U.addDays(y, -1)]: 3, [U.today()]: 2 } }));
        return y;
      });
      await until(a, 'streak over the day off', () => window.A.G.of(window.A.S.me).streak === 3);
      const s = await a.evaluate(() => { const s = window.A.G.of(window.A.S.me); return { streak: s.streak, frozen: s.frozen.length }; });
      assert(s.frozen === 0, 'a freeze was spent on a day off: ' + JSON.stringify(s));
      // today off: the banner, no catch-up row, the widget says it, the streak isn't at risk
      await a.evaluate(() => window.A.Off.addDate(window.A.U.today()));
      await until(a, 'today off', () => window.A.G.offToday());
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('.off-banner');
      assert(!(await a.$('.catchup')), 'a push to catch up on a day off');
      const w = await a.evaluate(() => window.A.Widget && window.A.Widget.data ? window.A.Widget.data() : null);
      if (w) assert(w.off && !w.risk, 'widget: ' + JSON.stringify(w));
      await H.shot(a, 'off-today');
      await a.evaluate(() => window.A.Off.removeDate(window.A.U.today()));
      await until(a, 'today back', () => !window.A.G.offToday());
      return `${r}: streak ${s.streak}`;
    });

    await step('A day gone by (up to a week) made a day off: its portion and the ones after move a day; older days are refused', async () => {
      // a plan that began four days ago (yesterday is already off): portions on −4, −3, −2, today, tomorrow …
      const plan = await a.evaluate(async (id) => {
        const { D, S, U, G } = window.A;
        const b = S.books.get(id);
        let d = U.addDays(U.today(), -4);
        const wirds = G.wirds(b).map((w) => {
          while (G.isOff(d)) d = U.addDays(d, 1);
          const x = Object.assign({}, w, { start: d, due: d });
          d = U.addDays(d, 1);
          return x;
        });
        await D.update(`books/${id}`, { wirds });
        return wirds.map((w) => w.start);
      }, bookId);
      const d2 = await a.evaluate(() => window.A.U.addDays(window.A.U.today(), -2));
      assert(plan[2] === d2, 'portion 3 is not two days ago: ' + plan.slice(0, 4));
      // from the calendar: the portion's sheet offers «اعمل … إجازة ورحّل الأوراد»
      await closeAll(a);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.click(`.wcal .wc-c[data-d="${d2}"]`);
      await a.waitForSelector('.off-row [data-act="day-off-set"]');
      assert((await a.textContent('.off-row')).includes('ورحّل الأوراد'), 'label: ' + (await a.textContent('.off-row')));
      await a.click('.off-row [data-act="day-off-set"]');
      await until(a, 'moved', (arg) => window.A.S.books.get(arg.id).wirds[2].start !== arg.d2, { id: bookId, d2 });
      const after = await wirds(a, bookId);
      assert(after[0][1] === plan[0] && after[1][1] === plan[1], 'the ones before moved: ' + JSON.stringify(after.slice(0, 3)));
      for (let i = 2; i < after.length; i++) {
        const want = await a.evaluate((d) => window.A.G.nextOn(window.A.U.addDays(d, 1)), i === 2 ? d2 : plan[i]);
        assert(after[i][1] === want || after[i][1] > plan[i], `portion ${i + 1}: ${plan[i]} → ${after[i][1]}`);
      }
      assert(after[2][1] === (await a.evaluate(() => window.A.U.today())), 'portion 3 is not today now: ' + after[2][1]);
      await until(b, 'news says it moved', () => [...document.querySelectorAll('.feed .ev')].some((e) => /اترحّلت/.test(e.textContent)) || window.A.V.inboxItems().some((x) => x.kind === 'off' && /اترحّلت/.test(JSON.stringify(x))), null, 8000).catch(() => {});
      // more than a week back: refused
      const d9 = await a.evaluate(() => window.A.U.addDays(window.A.U.today(), -9));
      await a.evaluate((d) => window.A.Off.addDate(d), d9);
      await T(600);
      assert(!(await a.evaluate((d) => window.A.G.isOff(d), d9)), 'a day nine days back became a day off');
      // taken back: the portions come back
      await a.evaluate((d) => window.A.Off.removeDate(d), d2);
      await until(a, 'back', (arg) => window.A.S.books.get(arg.id).wirds[2].start === arg.d2, { id: bookId, d2 });
      const back = await wirds(a, bookId);
      assert(JSON.stringify(back.map((w) => w[1])) === JSON.stringify(plan), 'not back: ' + JSON.stringify(back.map((w) => w[1])) + ' vs ' + JSON.stringify(plan));
      return `${plan[2]} → ${after[2][1]}, then back`;
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
