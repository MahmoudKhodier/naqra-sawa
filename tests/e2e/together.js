#!/usr/bin/env node
/*
 * The circle together: a book everyone finished moves to «خلّصناها», the whole circle reading today, and the
 * circle's week recap.
 *
 *   node tests/e2e/together.js
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
  for (let i = 0; i < 5 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(250));
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId;
  try {
    await step('Two members, a book with a plan', async () => {
      const A = await H.newUser(browser, env, 'ahmed@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة سوا');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'أحمد');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length));
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      const cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'basma@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'بسمة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
    });

    await step('«قراية الحلقة النهارده»: one of two, then the whole circle', async () => {
      await a.evaluate(() => window.A.D.addPagesToday(4));
      await a.evaluate(() => window.A.V.go('circle'));
      await until(a, 'today card', () => /١ من ٢/.test((document.querySelector('.together-today') || {}).textContent || ''));
      await b.evaluate(() => window.A.D.addPagesToday(2));
      await until(a, 'full', () => document.querySelector('.together-today.full'));
      const t = await a.$eval('.together-today', (e) => e.textContent);
      assert(/الحلقة كاملة النهارده/.test(t), 'no full-circle line: ' + t);
      await closeAll(a);
    });

    await step('Everyone finished the book: a card on Today, then it moves to «خلّصناها»', async () => {
      await a.evaluate((id) => window.A.D.saveProg(id, () => ({ finished: window.A.U.nowIso() })), bookId);
      await a.evaluate(() => window.A.V.go('home'));
      await T(500);
      assert(!(await a.$('.together-done')), 'card before everyone finished');
      await b.evaluate((id) => window.A.D.saveProg(id, () => ({ finished: window.A.U.nowIso() })), bookId);
      await until(a, 'all-done card', () => document.querySelector('.together-done'));
      await closeAll(a);
      await a.click('.together-done [data-act="to-done"]');
      await until(a, 'status done', (id) => window.A.S.books.get(id).status === 'done', bookId);
      await until(b, 'B sees it done', (id) => window.A.S.books.get(id).status === 'done', bookId);
      await b.evaluate(() => window.A.V.go('books'));
      await T(400);
      const t = await b.$eval('.books', (e) => e.textContent);
      assert(/خلّصناها/.test(t), 'not under «خلّصناها»: ' + t.slice(0, 200));
      await closeAll(a);
    });

    await step('The circle’s week: pages per member, full days, portions, best note, open questions', async () => {
      await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        await D.set(`notes/${D.newId()}`, { b: id, page: 3, kind: 'quote', text: 'جملة الأسبوع', rect: null, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
        await D.set(`notes/${D.newId()}`, { b: id, page: 5, kind: 'q', text: 'ليه البطل عمل كده؟', rect: null, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
        await D.saveProg(id, (c) => ({ done: Object.assign({}, c.done, { w1: U.nowIso() }) }));
      }, bookId);
      await T(600);
      await a.evaluate(() => window.A.V.circleRecap(window.A.U.weekStart()));
      await a.waitForSelector('.circle-recap');
      const t = await a.$eval('.circle-recap', (e) => e.textContent);
      assert(/٦/.test(t) && /أحمد/.test(t) && /بسمة/.test(t), 'pages/members missing: ' + t.slice(0, 200));
      assert(/جملة الأسبوع/.test(t), 'best note missing');
      assert(/ليه البطل/.test(t), 'open question missing');
      const rows = await a.$$eval('.cr-rows li', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
      assert(/أحمد/.test(rows[0]), 'order: ' + rows.join(' | '));
      await H.shot(a, 'together-recap');
      await closeAll(a);
      // shown by itself once a week
      await a.evaluate(() => window.A.U.store.del('circleRecap:' + window.A.S.me));
      const ws = await a.evaluate(() => {
        window.A.V.checkRecap();
        return window.A.U.store.get('circleRecap:' + window.A.S.me, '');
      });
      await T(1800);
      const shown = await a.$('.circle-recap');
      const isFri = await a.evaluate(() => window.A.U.parseD(window.A.U.today()).getDay() === 5);
      // on any day but Friday it's last week's, which is empty here: nothing to show
      assert(isFri ? !!shown && ws : !shown, `auto recap: shown=${!!shown} friday=${isFri} key=${ws}`);
      await closeAll(a);
    });

    await step('English and no console errors', async () => {
      await a.evaluate(() => {
        window.A.L.set('en');
        window.A.V.go('circle');
      });
      await a.waitForSelector('.together-today');
      const t = await a.$eval('.together-today', (e) => e.textContent);
      assert(/whole circle read today/i.test(t), 'English: ' + t);
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
