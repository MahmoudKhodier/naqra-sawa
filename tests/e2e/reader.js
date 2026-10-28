#!/usr/bin/env node
/*
 * PDF reader test on a phone (390×844, touch, 2× screen) through the real UI
 * against the fake Supabase. Exercises everything a reader does in a session.
 *
 *   node tests/e2e/reader.js        # PASS/FAIL per step, exit 1 on any FAIL
 *
 * Book: fixtures/outline-120.pdf (120 A5 pages with a table of contents).
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
const PDF = path.join(H.FIXTURES, 'outline-120.pdf');
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
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, 5).join('\n      ')}`);
  }
}
async function until(page, what, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const cur = (p) => p.evaluate(() => window.A.R.current() && window.A.R.current().page);
const rd = (p) => p.evaluate(() => window.A.R._debug && window.A.R._debug());
/** Pages around the current one that are painted (canvas with pixels). */
const painted = (p) =>
  p.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.pg')) {
      const c = el.querySelector('canvas');
      out[el.dataset.p] = c ? c.width : 0;
    }
    return out;
  });
const canvasMP = (p) => p.evaluate(() => [...document.querySelectorAll('.pg canvas')].reduce((t, c) => t + c.width * c.height, 0) / 1e6);
async function touchDrag(cdp, pts, stepMs = 16) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts[0] });
  for (let i = 1; i < pts.length; i++) {
    await T(stepMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts[i] });
  }
  await T(stepMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const swipe = (cdp, x0, x1, y = 430) => touchDrag(cdp, [0, 1, 2, 3, 4].map((i) => [{ x: x0 + ((x1 - x0) * i) / 4, y: y + i }]));
async function pinch(cdp, cx, cy, d0, d1) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const d = d0 + ((d1 - d0) * i) / 8;
    pts.push([{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }]);
  }
  await touchDrag(cdp, pts, 20);
}
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await T(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Make sure the reader's bars are showing (a middle tap toggles them). */
async function showBars(p) {
  if (await p.$('.rd.ui-off')) {
    const cdp = await p.context().newCDPSession(p);
    await tap(cdp, 195, 430);
    await T(450);
    await cdp.detach();
  }
}
async function menu(p, text) {
  await showBars(p);
  await p.click('.rd [data-act="more"]');
  await p.click(`.mi:has-text("${text}")`);
  await T(400);
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p;
  try {
    await step('Sign in on a phone, create a circle, upload the 120-page book', async () => {
      const u = await H.newUser(browser, env, 'reader@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = u.page;
      ctx.p = p;
      await p.fill('#cn-name', 'حلقة القراية');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'قارئ');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      // Book direction comes from the PDF's text, not the file name.
      const dir = {};
      for (const f of ['arabic-40.pdf', 'english-12.pdf']) {
        await p.locator('[data-act="add-book"]:visible').first().click();
        await p.setInputFiles('#ab-file', path.join(H.FIXTURES, f));
        await p.waitForSelector('#ab-form', { timeout: 30000 });
        dir[f] = await p.$eval('#ab-lang', (e) => e.value);
        await p.keyboard.press('Escape');
        await T(400);
      }
      assert(dir['arabic-40.pdf'] === 'ar' && dir['english-12.pdf'] === 'en', 'direction detection: ' + JSON.stringify(dir));
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      ctx.author = await p.$eval('#ab-author', (e) => e.value);
      await p.selectOption('#ab-lang', 'ar'); // read it as an Arabic (right-to-left) book
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.click('#pl-form button.btn.gold');
      await until(p, 'book with plan', () => [...window.A.S.books.values()].some((b) => (b.wirds || []).length > 0), null, 20000);
      const b = await p.evaluate(() => [...window.A.S.books.values()][0]);
      ctx.book = b;
      assert(b.pages === 120, 'pages ' + b.pages);
      assert(!ctx.author, 'junk PDF author kept: ' + ctx.author);
      assert((b.toc || []).length === 11, 'table of contents entries: ' + (b.toc || []).length);
      return `${b.pages} pages, ${b.wirds.length} portions, ${b.toc.length} contents entries; direction ${JSON.stringify(dir)}`;
    });

    await step('Open the reader: first page painted quickly and sharp (2× screen)', async () => {
      await T(800);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      await H.shot(p, 'r00-home');
      const t0 = Date.now();
      await p.locator('[data-act="read"]:visible').first().click({ timeout: 8000 });
      await until(p, 'page painted', () => [...document.querySelectorAll('.pg canvas')].some((c) => c.width > 100), null, 30000);
      const ms = Date.now() - t0;
      const pg = await painted(p);
      const first = Object.entries(pg).find(([, w]) => w > 0);
      const cssW = await p.$eval(`.pg[data-p="${first[0]}"]`, (e) => e.getBoundingClientRect().width);
      await H.shot(p, 'r01-open');
      ctx.open = true;
      assert(first[1] >= cssW * 1.9, `canvas ${first[1]}px for ${cssW}px css: not sharp on a 2× screen`);
      return `${ms} ms to first page; canvas ${first[1]}px for ${Math.round(cssW)}css px`;
    }, ['book']);

    await step('Fling-scroll to page ~60: pages around the current one paint, memory stays bounded', async () => {
      const cdp = await p.context().newCDPSession(p);
      ctx.cdp = cdp;
      for (let i = 0; i < 12; i++) {
        await p.evaluate(() => document.getElementById('rd-scroll').scrollBy(0, 2600));
        await T(60);
      }
      await T(2500);
      const c = await cur(p);
      const pg = await painted(p);
      const near = [c - 1, c, c + 1].filter((x) => x >= 1 && x <= 120);
      const blank = near.filter((x) => !pg[x]);
      const mp = await canvasMP(p);
      await H.shot(p, 'r02-scrolled');
      assert(c > 40, 'did not move far: ' + c);
      assert(!blank.length, 'blank pages near current: ' + blank.join(','));
      assert(mp < 40, 'too many canvas pixels kept: ' + mp.toFixed(1) + ' MP');
      return `page ${c}; ${Object.keys(pg).length} page boxes, ${mp.toFixed(1)} MP of canvases`;
    }, ['open']);

    await step('Jump to a page with the page box', async () => {
      await showBars(p);
      await p.click('#rd-pgin');
      await p.fill('#rd-pgin', '١٠٠');
      await p.press('#rd-pgin', 'Enter');
      await T(1500);
      const c = await cur(p);
      assert(Math.abs(c - 100) <= 1, 'landed on ' + c);
      return 'page ' + c;
    }, ['open']);

    await step('Pinch to zoom keeps the same page under the fingers, re-renders sharp', async () => {
      const before = await cur(p);
      await pinch(ctx.cdp, 195, 420, 120, 260);
      await T(1800);
      const z = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      const after = await cur(p);
      const pg = await painted(p);
      const w = await p.$eval(`.pg[data-p="${after}"]`, (e) => e.getBoundingClientRect().width);
      await H.shot(p, 'r03-pinched');
      assert(z > 1.6, 'zoom only ' + z);
      assert(Math.abs(after - before) <= 1, `jumped from page ${before} to ${after}`);
      assert(pg[after] >= Math.min(w * 1.9, 3000), `page ${after} canvas ${pg[after]} for ${Math.round(w)} css px (blurry)`);
      return `zoom ${z}; page ${before}→${after}`;
    }, ['open', 'cdp']);

    await step('Zoomed way in (max): memory stays bounded', async () => {
      for (let i = 0; i < 4; i++) await pinch(ctx.cdp, 195, 420, 100, 260).then(() => T(900));
      await p.evaluate(() => document.getElementById('rd-scroll').scrollBy(0, 4000));
      await T(2500);
      const z = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      const mp = await canvasMP(p);
      assert(mp < 60, `${mp.toFixed(1)} MP of canvases kept at zoom ${z}`);
      return `zoom ${z}: ${mp.toFixed(1)} MP`;
    }, ['open', 'cdp']);

    await step('Back to fit width from the menu', async () => {
      await showBars(p);
      await menu(p, 'ملء العرض');
      await T(800);
      const z = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      assert(z === 1, 'zoom ' + z);
    }, ['open']);

    await step('Page colour: day → sepia → night', async () => {
      const seen = [];
      for (let i = 0; i < 3; i++) {
        await p.click('.rd [data-act="theme"]');
        seen.push(await p.$eval('.rd', (e) => e.dataset.theme));
      }
      await p.click('.rd [data-act="theme"]');
      await p.click('.rd [data-act="theme"]');
      await H.shot(p, 'r04-night');
      await p.click('.rd [data-act="theme"]');
      assert(seen.join() === 'sepia,night,day', seen.join());
    }, ['open']);

    await step('Page-by-page mode: swipe and edge taps turn pages in the Arabic direction', async () => {
      await menu(p, 'صفحة صفحة');
      await T(900);
      const c0 = await cur(p);
      await swipe(ctx.cdp, 80, 320); // finger moves right → next page in an RTL book
      await T(900);
      const c1 = await cur(p);
      await swipe(ctx.cdp, 320, 80); // back
      await T(900);
      const c2 = await cur(p);
      await tap(ctx.cdp, 30, 430); // left edge → next in RTL
      await T(900);
      const c3 = await cur(p);
      await H.shot(p, 'r05-paged');
      assert(c1 === c0 + 1 && c2 === c0 && c3 === c0 + 1, `pages ${c0} → ${c1} → ${c2} → ${c3}`);
      return `${c0} → ${c1} → ${c2} → ${c3}`;
    }, ['open', 'cdp']);

    await step('Middle tap shows/hides the toolbars', async () => {
      const off0 = await p.$eval('.rd', (e) => e.classList.contains('ui-off'));
      await tap(ctx.cdp, 195, 430);
      await T(500);
      const off1 = await p.$eval('.rd', (e) => e.classList.contains('ui-off'));
      await tap(ctx.cdp, 195, 430);
      await T(500);
      const off2 = await p.$eval('.rd', (e) => e.classList.contains('ui-off'));
      assert(off0 !== off1 && off1 !== off2, `${off0} ${off1} ${off2}`);
    }, ['open', 'cdp']);

    await step('Highlight a passage with a finger and save a note', async () => {
      await menu(p, 'تمرير متواصل');
      await showBars(p);
      await showBars(p);
      await p.click('[data-tool="hl"]');
      const c = await cur(p);
      const box = await (await p.$(`.pg[data-p="${c}"] .pg-ov`)).boundingBox();
      const y = Math.max(box.y + 40, 180);
      await touchDrag(ctx.cdp, [0, 1, 2, 3, 4, 5].map((i) => [{ x: box.x + 30 + i * 50, y: y + i * 12 }]));
      await p.waitForSelector('#nk-text', { timeout: 5000 });
      await p.fill('#nk-text', 'جملة مهمة');
      await p.click('.sheet [data-save]');
      await until(p, 'highlight drawn', (pg) => !!document.querySelector(`.pg[data-p="${pg}"] .hlb`), c, 8000);
      await H.shot(p, 'r06-highlight');
      ctx.hlPage = c;
      return 'on page ' + c;
    }, ['open', 'cdp']);

    await step('Pin a note with a tap (the note box stays open on a phone)', async () => {
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      await showBars(p);
      await p.click('[data-tool="pin"]');
      const c = await cur(p);
      const box = await (await p.$(`.pg[data-p="${c}"] .pg-ov`)).boundingBox();
      await tap(ctx.cdp, box.x + box.width * 0.7, Math.max(box.y + 80, 260));
      await p.waitForSelector('#nk-text', { timeout: 5000 });
      await T(700);
      assert(await p.$('.sheet-wrap.in #nk-text'), 'the note box closed by itself right after the tap');
      await p.fill('#nk-text', 'سؤال؟');
      await p.click('.sheet [data-save]', { timeout: 6000 });
      await until(p, 'pin drawn', (pg) => !!document.querySelector(`.pg[data-p="${pg}"] .pinb`), c, 8000);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
    }, ['open', 'cdp']);

    await step('Bookmark this page, then find it and the notes in the panel', async () => {
      await menu(p, 'علّم الصفحة');
      await T(600);
      const c = await cur(p);
      await showBars(p);
      await p.click('.rd [data-act="panel"]');
      await p.click('.rd-panel [data-act="pfilter"][data-f="all"]');
      const items = await p.$$eval('.rp-item', (x) => x.length);
      const marks = await p.$$eval('.rp-marks .chip', (x) => x.map((e) => e.textContent));
      await H.shot(p, 'r07-panel');
      assert(items >= 2, 'notes in panel: ' + items);
      assert(marks.length >= 1, 'no bookmark chip');
      await p.click('.rd [data-act="panel"]');
      return `${items} notes, bookmarks ${marks.join(' ')} (page ${c})`;
    }, ['open', 'cdp']);

    await step('Close and reopen: resumes on the same page, opens from the device cache', async () => {
      const c = await cur(p);
      await showBars(p);
      await p.click('.rd [data-act="close"]');
      await T(600);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const reqs = [];
      const on = (r) => /storage\/v1\/object/.test(r.url()) && reqs.push(r.url());
      p.on('request', on);
      const t0 = Date.now();
      await p.locator('[data-act="read"]:visible').first().click({ timeout: 8000 });
      await until(p, 'painted', () => [...document.querySelectorAll('.pg canvas')].some((x) => x.width > 100), null, 20000);
      const ms = Date.now() - t0;
      p.off('request', on);
      await T(600);
      const c2 = await cur(p);
      assert(Math.abs(c2 - c) <= 1, `reopened on ${c2}, was ${c}`);
      assert(!reqs.length, 'fetched the file again: ' + reqs.length);
      return `page ${c2}, ${ms} ms, no download`;
    }, ['open', 'cdp']);

    await step('Table of contents: lists chapters and jumps to one', async () => {
      await showBars(p);
      await menu(p, 'الفهرس');
      await p.waitForSelector('.toc-list button', { timeout: 8000 });
      const rows = await p.$$eval('.toc-list button', (x) => x.map((e) => e.textContent.trim()));
      await H.shot(p, 'r08-toc');
      await p.click('.toc-list button:has-text("Hijra")');
      const trail = [];
      for (let i = 0; i < 8; i++) {
        trail.push(await cur(p));
        await T(200);
      }
      const c = await cur(p);
      console.log('      page after the jump:', trail.join(' '), 'paged', await p.$eval('.rd', (e) => e.classList.contains('paged')));
      assert(Math.abs(c - 58) <= 1, 'landed on ' + c);
      return `${rows.length} entries; Hijra → page ${c}`;
    }, ['open', 'cdp']);

    await step('Contents also jumps correctly in page-by-page mode', async () => {
      await menu(p, 'صفحة صفحة');
      await T(700);
      await menu(p, 'الفهرس');
      await p.waitForSelector('.toc-list button', { timeout: 8000 });
      await p.click('.toc-list button:has-text("Medina")');
      const trail = [];
      for (let i = 0; i < 8; i++) {
        trail.push(await cur(p));
        await T(200);
      }
      assert(trail.every((x) => x === 77), 'pages after the jump: ' + trail.join(' '));
      await menu(p, 'تمرير متواصل');
      await T(600);
      return 'page 77';
    }, ['open', 'cdp']);

    await step('Double-tap zooms in at that spot, double-tap again fits the width', async () => {
      const z0 = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      await tap(ctx.cdp, 200, 400);
      await T(120);
      await tap(ctx.cdp, 200, 400);
      await T(1200);
      const z1 = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      await tap(ctx.cdp, 200, 400);
      await T(120);
      await tap(ctx.cdp, 200, 400);
      await T(1200);
      const z2 = await p.evaluate(() => JSON.parse(localStorage.getItem('qs:readerPrefs')).zoom);
      assert(z0 === 1 && z1 >= 1.8 && z2 === 1, `zoom ${z0} → ${z1} → ${z2}`);
      return `zoom ${z0} → ${z1} → ${z2}`;
    }, ['open', 'cdp']);

    await step('Screen stays awake while reading', async () => {
      const s = await p.evaluate(() => window.A.R._awake && window.A.R._awake());
      assert(s === true, 'keep-awake not requested: ' + s);
    }, ['open', 'cdp']);

    await step('No errors in the console', async () => {
      const errs = p.__errors.filter((e) => !/favicon|fonts|404/.test(e));
      assert(!errs.length, errs.slice(0, 4).join('\n'));
    }, ['p']);
  } catch (e) {
    console.error('crash', e);
  } finally {
    await browser.close();
    await env.stop();
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n==== ${results.filter((r) => r.status === 'PASS').length} passed, ${fail} failed, ${results.filter((r) => r.status === 'SKIP').length} skipped — screenshots in tests/e2e/shots`);
    process.exit(fail ? 1 : 0);
  }
})();
