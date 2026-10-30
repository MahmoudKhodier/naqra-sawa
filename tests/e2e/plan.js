#!/usr/bin/env node
/*
 * The plan: the calendar, who may change it (owner, admins, who added the book), a portion's pages moved by
 * a page or two (the next portion takes the difference), «الورد يخلص في الصفحة دي» from the reader, and the
 * «مين وصل فين» tabs.
 *
 *   node tests/e2e/plan.js
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
const ranges = (p) => p.evaluate(() => [...window.A.S.books.values()][0].wirds.map((w) => `${w.from}-${w.to}`).join(' '));

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId, cid, bUid;
  try {
    await step('Owner adds a book with 8 pages a portion; a member joins', async () => {
      const A = await H.newUser(browser, env, 'owner@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الخطة');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'منى');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.fill('#pl-per', '8');
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length));
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'member@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
      bUid = await b.evaluate(() => window.A.S.me);
      for (const pg of [a, b]) await pg.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      return await ranges(a);
    });

    await step('Plan tab is a calendar; only the owner (who added the book) can change it', async () => {
      await closeAll(a);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.wcal');
      const cells = await a.$$eval('.wcal .wc-c:not(.cont)', (x) => x.map((e) => e.textContent.trim()));
      assert(cells.length === 5, 'a lead cell per portion: ' + cells.join('|'));
      assert(await a.$('[data-act="plan"]'), 'owner has no «عدّل الخطة»');
      await closeAll(b);
      await b.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await b.waitForSelector('.wcal');
      assert(!(await b.$('[data-act="plan"]')), 'a member can change the plan');
      await b.click('.wc-c:not(.cont)[data-w="w2"]');
      await b.waitForSelector('.wsheet');
      assert(!(await b.$('.wsheet [data-act="wird-pages"]')), 'a member can change the pages');
      await closeAll(b);
    });

    await step('Owner moves the end of portion 2 one page later: portion 3 starts a page later', async () => {
      await a.click('.wc-c:not(.cont)[data-w="w2"]');
      await a.click('.wsheet [data-act="wird-pages"]');
      await a.waitForSelector('#wp-form');
      await a.click('#wp-form [data-step="to"][data-d="1"]');
      await a.click('#wp-form [data-step="to"][data-d="1"]');
      await a.click('#wp-form [data-step="to"][data-d="-1"]');
      const shown = await a.textContent('#wp-form');
      assert(/كان/.test(shown), 'no "was" in the preview: ' + shown);
      await a.click('#wp-form button.btn.gold');
      await until(a, 'saved', () => [...window.A.S.books.values()][0].wirds[1].to === 17);
      await until(b, 'the member sees it', () => [...window.A.S.books.values()][0].wirds[2].from === 18);
      const r = await ranges(a);
      assert(r === '1-8 9-17 18-24 25-32 33-40', 'ranges: ' + r);
      return r;
    });

    await step('Made an admin, the member can change the pages too', async () => {
      const err = await a.evaluate(([c, u]) => window.A.P.setRole(c, u, 'admin').then(() => '', (e) => String(e.message || e)), [cid, bUid]);
      assert(!err, 'setRole: ' + err);
      await b.reload();
      await b.waitForSelector('.shell #screen', { timeout: 20000 });
      await until(b, 'admin', () => window.A.S.canEdit, null, 15000).catch(async (e) => {
        throw new Error(e.message + ' ' + JSON.stringify(await env.fake.sql('select role from public.circle_members where user_id = $1', [bUid]).catch((x) => String(x))) + ' ' + JSON.stringify(await b.evaluate(() => ({ r: window.A.P.role && window.A.P.role(), me: window.A.S.meInfo }))));
      });
      await b.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await closeAll(b);
      await b.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await b.waitForSelector('.wcal');
      assert(await b.$('[data-act="plan"]'), 'admin has no «عدّل الخطة»');
      await b.click('.wc-c:not(.cont)[data-w="w4"]');
      assert(await b.waitForSelector('.wsheet [data-act="wird-pages"]', { timeout: 4000 }), 'admin cannot change the pages');
      await closeAll(b);
    });

    await step('From the reader: «الورد ٣ يخلص في الصفحة دي»', async () => {
      await closeAll(a);
      await a.evaluate((id) => window.A.R.open(id, { page: 21 }), bookId);
      await until(a, 'reader on 21', () => window.A.R.isOpen() && window.A.R.current().page === 21, null, 15000);
      await T(600);
      await a.evaluate(() => document.querySelector('.rd [data-act="more"]').click());
      await a.click('.mi:has-text("الورد ٣ يخلص في الصفحة دي")');
      await a.click('.sheet [data-yes]');
      await until(a, 'saved', () => [...window.A.S.books.values()][0].wirds[2].to === 21);
      const r = await ranges(a);
      assert(r === '1-8 9-17 18-21 22-32 33-40', 'ranges: ' + r);
      // at the start of a portion: the one before can run on to this page
      await a.evaluate(() => window.A.R.goTo(23, false));
      await until(a, 'on 23', () => window.A.R.current().page === 23);
      await a.evaluate(() => document.querySelector('.rd [data-act="more"]').click());
      await a.click('.mi:has-text("الورد ٣ يكمّل لحد الصفحة دي")');
      await a.click('.sheet [data-yes]');
      await until(a, 'extended', () => [...window.A.S.books.values()][0].wirds[2].to === 23);
      await a.evaluate(() => window.A.R.close(true));
      return await ranges(a);
    });

    await step('«مين وصل فين»: the three tabs, all portions with a cheer for whoever is behind', async () => {
      await closeAll(a);
      await b.evaluate((id) => window.A.D.saveProg(id, (c) => ({ done: Object.assign({}, c.done, { w1: window.A.U.nowIso() }) })), bookId);
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('.race .rc-tabs');
      await a.click('[data-act="race-tab"][data-t="all"]');
      await a.waitForSelector('.rc-mx');
      const dots = await a.$$eval('.rc-mx .rc-mx-c.d', (x) => x.length);
      assert(dots === 1, 'done dots: ' + dots);
      await a.click('[data-act="race-tab"][data-t="book"]');
      await a.waitForSelector('.rc-lanes');
      const lanes = await a.$$eval('.rc-lanes li', (x) => x.length);
      assert(lanes === 2, 'lanes: ' + lanes);
      await a.click('[data-act="race-tab"][data-t="now"]');
      await a.waitForSelector('.rc-rows');
    });

    await step('Pages of a portion counted by mistake come off from its sheet', async () => {
      await closeAll(b);
      await b.evaluate((id) => window.A.D.saveProg(id, (c) => ({ seen: window.A.U.rangesAdd(c.seen, [24, 25]), last: 25 })), bookId);
      await b.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await b.waitForSelector('.wcal');
      await b.click('.wc-c:not(.cont)[data-w="w4"]');
      await b.click('.wsheet [data-act="wird-uncount"]');
      await b.click('.sheet [data-yes]');
      await until(b, 'seen cleared', (id) => !window.A.U.rangesCountIn(window.A.D.prog(id).seen, 24, 32), bookId);
      const last = await b.evaluate((id) => window.A.D.prog(id).last, bookId);
      assert(last === 23, 'the place to go on from: ' + last);
    });

    await step('No errors in the console', async () => {
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
