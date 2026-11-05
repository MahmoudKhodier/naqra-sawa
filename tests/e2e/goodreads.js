#!/usr/bin/env node
/*
 * Goodreads on a phone (390×844) against the fake Supabase: the export file (CSV) brings a member's shelf;
 * importing it again doubles nothing and keeps what was changed here. The sync through the shelf's RSS feed is
 * gone (Goodreads turned the feeds off, late October 2026): a member who had linked it gets a word about it,
 * and the app never calls the old goodreads_feed RPC.
 *
 *   node tests/e2e/goodreads.js        # PASS/FAIL per step, exit 1 on any FAIL
 */
'use strict';
const fs = require('fs');
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
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ctx = {};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function step(name, fn, needs = []) {
  const missing = needs.filter((k) => ctx[k] === undefined);
  if (missing.length) {
    results.push({ name, status: 'SKIP' });
    return console.log(`SKIP  ${name}  (needs ${missing.join(', ')})`);
  }
  const t0 = Date.now();
  try {
    const d = await fn();
    results.push({ name, status: 'PASS' });
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)${d ? '  — ' + d : ''}`);
  } catch (e) {
    results.push({ name, status: 'FAIL' });
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
async function until(page, what, fn, arg, timeout = 10000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const closeSheets = async (p) => {
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
/* The import sheet from the shelf's ⋯ menu. */
async function openSheet(p) {
  await closeSheets(p);
  await p.evaluate(() => window.A.V.go('shelf', { st: 'read' }));
  await T(400);
  await p.click('[data-act="shelf-more"]');
  await p.click('.mi:has-text("Goodreads")');
  await p.waitForSelector('#imp-file', { state: 'attached' });
}
const items = (p) => p.evaluate(() => Object.entries((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).map(([id, x]) => Object.assign({ id }, x)));
const byTitle = (list, re) => list.filter((x) => re.test(x.title));
const one = (list, re) => {
  const f = byTitle(list, re);
  assert(f.length === 1, `${re}: ${f.length} copies`);
  return f[0];
};
const CSV = path.join(H.FIXTURES, 'goodreads_library_export.csv');

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p;
  const rpcCalls = [];
  try {
    await step('A member imports the Goodreads CSV, adds Dune by hand and changes a rating', async () => {
      const a = await H.newUser(browser, env, 'mahmoud@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = a.page;
      p.on('request', (r) => /\/rpc\/goodreads_feed/.test(r.url()) && rpcCalls.push(r.url()));
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AARwMB/1t+5gUAAAAASUVORK5CYII=', 'base64');
      await p.context().route(/^https:\/\/(covers\.openlibrary\.org|i\.gr-assets\.com)\//,(r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
      await p.fill('#cn-name', 'حلقة جودريدز');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name');
      await p.fill('#join-name', 'محمود');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.home');
      await T(400);
      await closeSheets(p);
      await p.evaluate(async () => {
        const { D, S, U } = window.A;
        const t = U.nowIso();
        await D.mutate(`shelf/${S.me}`, () => ({ items: { dune1: { title: 'Dune', author: 'Frank Herbert', status: 'read', rating: 4, finished: '', tags: [], pages: 0, review: '', at: t, updatedAt: t } } }));
      });
      await openSheet(p);
      assert(!(await p.$('#gr-url, [data-gr-link], [data-gr-sync]')), 'the old Goodreads link box is still there');
      assert(!(await p.$('.gr-gone')), 'the "sync stopped" note shows for a member who never linked');
      await T(600); // the sheet slides up
      await H.shot(p, 'g01-import-sheet');
      await p.setInputFiles('#imp-file', CSV);
      await p.waitForSelector('.imp-sum');
      await p.click('[data-imp-go]');
      await until(p, 'CSV imported', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).length === 7);
      const it = await items(p);
      const fel = one(it, /Fellowship/);
      assert(fel.rating === 5 && fel.grId === '34' && JSON.stringify(fel.lists) === '["fantasy"]', 'CSV row: ' + JSON.stringify(fel));
      one(it, /^Dune/);
      await T(300);
      await p.evaluate((id) => window.A.V.saveShelfItem(id, { rating: 3 }), fel.id);
      await until(p, 'rating changed by hand', () => Object.values(window.A.S.shelf.get(window.A.S.me).items).some((x) => /Fellowship/.test(x.title) && x.rating === 3));
      ctx.csv = true;
      return `${it.length} books`;
    });

    await step('The same export again: nothing doubled, the rating changed here stays', async () => {
      await openSheet(p);
      await p.setInputFiles('#imp-file', CSV);
      await p.waitForSelector('.imp-sum');
      const go = await p.$eval('[data-imp-go]', (b) => ({ off: b.disabled, t: b.textContent.trim() }));
      assert(go.off, 'the second import offers to add something: ' + go.t);
      await closeSheets(p);
      const it = await items(p);
      assert(it.length === 7, 'books after the second import: ' + it.length);
      assert(one(it, /Fellowship/).rating === 3, 'the hand-made rating changed');
      return go.t;
    }, ['csv']);

    await step('A member who had linked Goodreads is told the sync stopped; the app never calls the old sync', async () => {
      await p.evaluate(async () => {
        const { D, S, U } = window.A;
        await D.mutate(`shelf/${S.me}`, () => Object.assign({}, S.shelf.get(S.me), { id: undefined, gr: { id: '777', at: U.addDays(U.today(), -3) + 'T10:00:00.000Z', ids: ['34'], reviews: true } }));
        U.store.set('grLink:' + S.me, { id: '777', key: '', at: '', reviews: true, ids: [] });
      });
      // a reload and coming back to the app used to start the sync after 12 hours
      await p.reload();
      // it opens again where it was (the shelf), once the circle has loaded
      await until(p, 'loaded again', () => window.A && window.A.S.phase === 'ready' && window.A.S.loaded.shelf, null, 20000);
      await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await T(4500);
      await openSheet(p);
      const note = await p.$eval('.gr-gone', (e) => e.textContent).catch(() => '');
      assert(/Goodreads/.test(note) && /صدّر/.test(note), 'note: ' + note);
      await T(600); // the sheet slides up
      await H.shot(p, 'g02-sync-gone');
      await closeSheets(p);
      assert(!rpcCalls.length, 'goodreads_feed called: ' + rpcCalls.length);
      assert((await items(p)).length === 7, 'the books changed');
      return note.slice(0, 60) + '…';
    }, ['csv']);

    const errs = (p && p.__errors) || [];
    await step('No page errors', async () => {
      const bad = errs.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(e));
      assert(!bad.length, bad.slice(0, 5).join('\n'));
    });
  } catch (e) {
    console.log('FAIL  (setup)  ' + ((e && e.stack) || e));
    results.push({ status: 'FAIL' });
  } finally {
    await browser.close().catch(() => {});
    await env.stop().catch(() => {});
  }
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${results.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
