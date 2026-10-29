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
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, process.env.LONGERR ? 25 : 5).join('\n      ')}`);
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
    const vp = p.viewportSize();
    await tap(cdp, vp.width / 2, vp.height / 2); // the middle of the page toggles the bars (portrait or landscape)
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

    await step('A long note (2,700 characters) saves in full: shared, private, takeaway and chat; cards offer «اقرأ الباقي»', async () => {
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const text = fs.readFileSync(path.join(H.FIXTURES, 'long-note-ar.txt'), 'utf8').trim();
      const c = await cur(p);
      const bid = ctx.book.id;
      const compose = async () => {
        await until(p, 'previous sheet gone', () => !document.querySelector('.sheet-wrap'), null, 4000);
        await p.evaluate(({ bid, c }) => window.A.V.composeNote({ bookId: bid, page: c, rect: { x: 0.8, y: 0.85, w: 0, h: 0 }, crop: null }), { bid, c });
        await p.waitForSelector('.sheet-wrap.in #nk-text');
      };
      // shared, typed as one paste-like insert (respects the box's limit like a real paste)
      await compose();
      await p.waitForSelector('#nk-text');
      await p.focus('#nk-text');
      await p.keyboard.insertText(text);
      const inBox = await p.$eval('#nk-text', (e) => e.value.length);
      assert(inBox === text.length, `the box kept ${inBox} of ${text.length} characters`);
      await p.click('.sheet-wrap.in [data-save]');
      await until(p, 'shared note saved', (n) => [...window.A.S.notes.values()].some((x) => x.text && x.text.length === n), text.length, 6000);
      // private
      await compose();
      await p.waitForSelector('#nk-text');
      await p.focus('#nk-text');
      await p.keyboard.insertText(text);
      await p.click('.sheet-wrap.in [data-vis="me"]');
      await p.click('.sheet-wrap.in [data-save]');
      try {
        await until(p, 'private note saved', (n) => Object.values((window.A.S.priv && window.A.S.priv.notes) || {}).some((x) => x.text && x.text.length === n), text.length, 6000);
      } catch (e) {
        const dbg = await p.evaluate(() => ({ priv: Object.values((window.A.S.priv && window.A.S.priv.notes) || {}).map((x) => x.text && x.text.length), notes: [...window.A.S.notes.values()].map((x) => x.text && x.text.length), sheets: document.querySelectorAll('.sheet-wrap').length, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }));
        throw new Error(e.message + ' ' + JSON.stringify(dbg));
      }
      const db = await env.fake.sql("select max(length(data->>'text')) as n from public.docs where col = 'notes'");
      assert(+db[0].n === [...text].length, `database has ${db[0].n} of ${[...text].length} characters`); // Postgres counts an emoji as one
      // a paste longer than the box allows says so
      await compose();
      await p.waitForSelector('#nk-text');
      const warned = await p.evaluate(() => {
        const ta = document.getElementById('nk-text');
        const dt = new DataTransfer();
        dt.setData('text/plain', 'x'.repeat(+ta.getAttribute('maxlength') + 5));
        ta.focus();
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return [...document.querySelectorAll('.toast')].some((t) => /أطول من المسموح/.test(t.textContent));
      });
      assert(warned, 'no warning for a paste that does not fit');
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      // the card shows the start and «اقرأ الباقي», which opens the whole note
      await showBars(p);
      await p.click('.rd [data-act="close"]');
      await T(700); // the session summary shows after closing the book
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'notes' }), bid);
      await T(500);
      await p.click('.nc-more');
      await p.waitForSelector('.nt-text');
      const shown = await p.$eval('.nt-text', (e) => e.textContent.length);
      assert(shown === text.length, `the note sheet shows ${shown} characters`);
      await H.shot(p, 'r07b-long-note');
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      // a chat message and a takeaway of the same length
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'talk', ch: 'gen' }), bid);
      await T(400);
      await p.focus('textarea[id^="in-"]');
      await p.keyboard.insertText(text);
      await p.click('.composer button.btn');
      await until(p, 'long message saved', (n) => [...window.A.S.msgs].some((m) => m.text && m.text.length === n), text.length, 6000);
      const w = ctx.book.wirds[0].id;
      await until(p, 'sheets closed', () => !document.querySelector('.sheet-wrap'), null, 4000);
      await p.evaluate(({ bid, w }) => window.A.V.writeTake(bid, w), { bid, w });
      await p.waitForSelector('#take-text');
      await p.focus('#take-text');
      await p.keyboard.insertText(text);
      await p.click('.sheet-wrap.in [data-save]');
      await until(p, 'long takeaway saved', (n) => [...window.A.S.notes.values()].some((x) => x.kind === 'take' && x.text.length === n), text.length, 6000);
      // drafts are dropped once the server has the text
      try {
        await until(p, 'drafts cleared', () => !Object.keys(localStorage).some((k) => k.startsWith('qs:draft:')), null, 6000);
      } catch (e) {
        throw new Error('drafts left after saving: ' + (await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('qs:draft:')).join(', '))));
      }
      await p.evaluate(({ bid, c }) => window.A.R.open(bid, { page: c }), { bid, c });
      await T(1200);
      return `${text.length} characters kept everywhere`;
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

    await step("Eye button hides other people's marks; the menu gives a clean page; your own stay", async () => {
      const c = await cur(p);
      const bid = ctx.book.id;
      // someone else's highlight on this page
      // posted by someone else: written straight into the database (the app only posts in your own name)
      const cid = (await env.fake.sql('select id from public.circles limit 1'))[0].id;
      const other = '00000000-0000-4000-8000-0000000000aa';
      for (const [id, rect, kind] of [['other-hl-1', { x: 0.2, y: 0.5, w: 0.5, h: 0.04 }, 'hl'], ['other-pin-1', { x: 0.25, y: 0.62, w: 0, h: 0 }, 'note']])
        await env.fake.sql('insert into public.docs (circle_id, col, id, data) values ($1, $2, $3, $4)', [cid, 'notes', id, JSON.stringify({ b: bid, page: c, kind, rect, color: '', text: 'من حد تاني', by: other, at: new Date().toISOString(), wid: '', likes: {}, replies: {} })]);
      ctx.otherPin = 'other-pin-1';
      await until(p, "the other person's highlight drawn", (pg) => !!document.querySelector(`.pg[data-p="${pg}"] .hlb[data-nid="other-hl-1"]`), c, 6000);
      const count = () => p.evaluate((pg) => ({ all: document.querySelectorAll(`.pg[data-p="${pg}"] .hlb, .pg[data-p="${pg}"] .pinb`).length, other: document.querySelectorAll(`.pg[data-p="${pg}"] [data-nid="other-hl-1"]`).length }), c);
      const before = await count();
      await showBars(p);
      await p.click('#rd-eye');
      await T(400);
      const mine = await count();
      assert(mine.other === 0, "others' highlight still showing after the eye button");
      assert(mine.all === before.all - 2, `your own marks should stay: ${before.all} → ${mine.all}`);
      assert(await p.$eval('#rd-eye', (e) => e.classList.contains('on')), 'eye button does not show the filter is on');
      await H.shot(p, 'r08-others-hidden');
      await menu(p, 'صفحة نضيفة');
      const none = await count();
      assert(none.all === 0, 'clean page still shows ' + none.all + ' marks');
      await showBars(p);
      await p.click('#rd-eye');
      await T(400);
      const back = await count();
      assert(back.all === before.all, `eye did not bring everything back: ${back.all}/${before.all}`);
      const kept = await p.evaluate(() => window.A.U.store.get('rdMarks'));
      assert(kept === 'all', 'preference not saved: ' + kept);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      return `${before.all} marks → ${mine.all} (mine only) → 0 (clean) → ${back.all}`;
    }, ['open', 'cdp']);

    await step("Move notes: mine moves for everyone; someone else's only on my screen; hide for me and bring back", async () => {
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const c = await cur(p);
      const hold = async (sel, dx, dy) => {
        await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
        await T(400);
        const b = await (await p.$(sel)).boundingBox();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        await ctx.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await T(650);
        for (let i = 1; i <= 6; i++) {
          await ctx.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }] });
          await T(30);
        }
        await ctx.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await T(700);
      };
      // mine
      const myPin = await p.evaluate((pg) => {
        const mine = [...window.A.S.notes.values()].filter((x) => x.by === window.A.S.me && x.page === pg && x.rect && x.rect.w === 0);
        mine.sort((a, b) => Math.abs(a.rect.y - 0.4) - Math.abs(b.rect.y - 0.4));
        const n = mine[0];
        return n && { id: n.id, x: n.rect.x, y: n.rect.y };
      }, c);
      assert(myPin, 'no pin of mine on this page');
      await hold(`.pg[data-p="${c}"] .pinb[data-nid="${myPin.id}"]`, -50, -60);
      const moved = await p.evaluate((id) => window.A.S.notes.get(id).rect, myPin.id);
      assert(Math.abs(moved.x - myPin.x) > 0.05 && Math.abs(moved.y - myPin.y) > 0.03, `my pin did not move: ${JSON.stringify(myPin)} → ${JSON.stringify(moved)}`);
      const db = await env.fake.sql("select data->'rect' as r from public.docs where col = 'notes' and id = $1", [myPin.id]);
      assert(Math.abs(db[0].r.x - moved.x) < 0.001, 'the move did not reach the database (others would not see it)');
      assert(!(await p.$('.sheet-wrap')), 'the note sheet opened after a drag');
      // someone else's
      const before = (await env.fake.sql("select data->'rect' as r from public.docs where id = 'other-pin-1'"))[0].r;
      await hold(`.pg[data-p="${c}"] .pinb[data-nid="other-pin-1"]`, 70, 50);
      const mv = await p.evaluate(() => window.A.S.priv && window.A.S.priv.moved && window.A.S.priv.moved['other-pin-1']);
      const after = (await env.fake.sql("select data->'rect' as r from public.docs where id = 'other-pin-1'"))[0].r;
      assert(mv && mv.x > before.x, 'not moved on my screen: ' + JSON.stringify(mv));
      assert(after.x === before.x && after.y === before.y, "someone else's note changed in the database");
      await H.shot(p, 'r08b-moved-notes');
      // put back, hide for me, bring back
      await p.$eval(`.pg[data-p="${c}"] .pinb[data-nid="other-pin-1"]`, (e) => e.scrollIntoView({ block: 'center' }));
      await T(400);
      await tap(ctx.cdp, ...(await (async () => { const b = await (await p.$(`.pg[data-p="${c}"] .pinb[data-nid="other-pin-1"]`)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; })()));
      await p.waitForSelector('[data-unmove]', { timeout: 4000 });
      await T(500);
      const sheets = await p.$$eval('.sheet-wrap', (x) => x.length);
      assert(sheets === 1, 'one tap opened ' + sheets + ' note sheets');
      await p.click('[data-unmove]');
      await until(p, 'put back', () => !(window.A.S.priv.moved || {})['other-pin-1']);
      await p.click('[data-hideme]');
      await T(300);
      const hidT = await p.$$eval('.toast', (x) => x.filter((t) => /اتخبّت/.test(t.textContent)).length);
      assert(hidT === 1, 'hide toast shown ' + hidT + ' times');
      await until(p, 'hidden for me', (pg) => !document.querySelector(`.pg[data-p="${pg}"] [data-nid="other-pin-1"]`), c);
      await menu(p, 'رجّع الملاحظات اللي خبّيتها');
      await until(p, 'shown again', (pg) => !!document.querySelector(`.pg[data-p="${pg}"] [data-nid="other-pin-1"]`), c);
      return 'mine → database; theirs → my private copy only; hide + bring back';
    }, ['open', 'cdp']);

    await step('Portion progress while reading: bar fills, cheers at the start, half-way, last pages and the end', async () => {
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const w = ctx.book.wirds[1];
      await p.evaluate((pg) => window.A.R.goTo(pg, false), w.from);
      await T(500);
      const seen = [];
      for (let pg = w.from; pg <= w.to; pg++) {
        await p.evaluate((x) => window.A.R._markSeen(x), pg);
        await T(60);
        const s = await p.evaluate(() => window.A.R._wird());
        if (s.cheer && seen[seen.length - 1] !== s.cheer) seen.push(s.cheer);
        if (pg === Math.floor((w.from + w.to) / 2)) await H.shot(p, 'r08c-portion-progress');
      }
      const s = await p.evaluate(() => window.A.R._wird());
      assert(s.width === '100%', 'bar not full at the end: ' + s.width);
      const joined = seen.join(' | ');
      assert(/نص الورد/.test(joined) && /فاضل/.test(joined) && /خلّصت صفحات الورد/.test(joined), 'cheers: ' + joined);
      await showBars(p);
      return `${w.to - w.from + 1} pages; ${seen.length} cheers`;
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

    await step('Landscape: bars become side rails, vertical slider works, page uses the width; back to portrait', async () => {
      await showBars(p);
      await p.setViewportSize({ width: 844, height: 390 });
      await T(1200);
      const info = await p.evaluate(() => {
        const r = (sel) => {
          const b = document.querySelector(sel).getBoundingClientRect();
          return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
        };
        return { land: document.querySelector('.rd').classList.contains('land'), top: r('.rd-top'), bot: r('.rd-bot'), scrub: r('#rd-scrub'), page: r(`.pg[data-p="${window.A.R.current().page}"]`) };
      });
      await H.shot(p, 'r09-landscape');
      assert(info.land, 'no landscape layout');
      assert(info.top.w < 100 && info.top.h > 300 && info.top.r >= 840, 'top rail not on the right side: ' + JSON.stringify(info.top));
      assert(info.bot.w < 100 && info.bot.l <= 4, 'bottom rail not on the left side: ' + JSON.stringify(info.bot));
      assert(info.scrub.h > info.scrub.w * 2, 'slider is not vertical: ' + JSON.stringify(info.scrub));
      assert(info.page.w > 700, 'page does not use the width: ' + JSON.stringify(info.page));
      // drag the vertical slider to ~80% of the book
      const sc = info.scrub;
      await p.mouse.move(sc.l + sc.w / 2, sc.t + 4);
      await p.mouse.down();
      await p.mouse.move(sc.l + sc.w / 2, sc.t + sc.h * 0.8, { steps: 6 });
      await p.mouse.up();
      await T(900);
      const c = await cur(p);
      assert(c > 85 && c < 110, 'slider landed on page ' + c);
      // tools to the other side from ⋯, and back
      await menu(p, 'انقل الأدوات لليمين');
      await T(500);
      const sw = await p.evaluate(() => {
        const t = document.querySelector('.rd-top').getBoundingClientRect();
        const b = document.querySelector('.rd-bot').getBoundingClientRect();
        return { topL: Math.round(t.left), botR: Math.round(b.right), store: window.A.U.store.get('rdTools') };
      });
      await H.shot(p, 'r09b-landscape-swapped');
      assert(sw.topL <= 4 && sw.botR >= 840 && sw.store === 'right', 'rails did not swap: ' + JSON.stringify(sw));
      await tap(ctx.cdp, 420, 200);
      await T(700);
      const swHidden = await p.evaluate(() => document.querySelector('.rd-bot').getBoundingClientRect().left >= 840 && document.querySelector('.rd-top').getBoundingClientRect().right <= 4);
      assert(swHidden, 'swapped rails did not slide off their own edges');
      await menu(p, 'انقل الأدوات للشمال');
      await T(500);
      const unsw = await p.evaluate(() => document.querySelector('.rd-top').getBoundingClientRect().right >= 840);
      assert(unsw, 'rails did not go back');
      await tap(ctx.cdp, 420, 200);
      await T(700);
      const hidden = await p.evaluate(() => {
        const t = document.querySelector('.rd-top').getBoundingClientRect();
        return document.querySelector('.rd').classList.contains('ui-off') && t.left >= 840;
      });
      assert(hidden, 'rails did not slide away on tap');
      await H.shot(p, 'r10-landscape-reading');
      await p.setViewportSize({ width: 390, height: 844 });
      await T(1000);
      const back = await p.evaluate(() => !document.querySelector('.rd').classList.contains('land'));
      assert(back, 'still in landscape layout after rotating back');
      return `slider → page ${c}; rails ${info.top.w}px / ${info.bot.w}px`;
    }, ['open', 'cdp']);

    await step('Screen stays awake while reading', async () => {
      const s = await p.evaluate(() => window.A.R._awake && window.A.R._awake());
      assert(s === true, 'keep-awake not requested: ' + s);
    }, ['open', 'cdp']);

    await step('Book discussion: every portion button opens that portion (also from the path), threads stay separate', async () => {
      if (await p.evaluate(() => window.A.R.isOpen())) {
        await showBars(p);
        await p.click('.rd [data-act="close"]');
        await T(600);
      }
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const bid = ctx.book.id;
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'talk' }), bid);
      await T(500);
      const on = () => p.$eval('.talk-chips .chip.on', (e) => e.dataset.ch);
      const ws = ctx.book.wirds;
      const first = await on();
      await p.click(`.talk-chips .chip[data-ch="${ws[0].id}"]`);
      await T(400);
      assert((await on()) === ws[0].id, `tapping portion 1 left ${await on()} selected (was ${first})`);
      await p.fill('textarea[id^="in-"]', 'رسالة في الورد الأول');
      await p.click('.composer button.btn'); // on a phone Enter makes a new line; the button sends
      await T(600);
      await p.click(`.talk-chips .chip[data-ch="${ws[1].id}"]`);
      await T(400);
      assert((await on()) === ws[1].id, 'tapping portion 2 did not select it');
      const leak = await p.evaluate(() => /رسالة في الورد الأول/.test(document.querySelector('.tabpane').textContent));
      assert(!leak, "portion 1's message shows in portion 2");
      await p.click(`.talk-chips .chip[data-ch="${ws[0].id}"]`);
      await T(400);
      const back = await p.evaluate(() => /رسالة في الورد الأول/.test(document.querySelector('.tabpane').textContent));
      assert(back, "portion 1's message is missing when going back");
      await p.click(`.talk-chips .chip[data-ch="gen"]`);
      await T(300);
      assert((await on()) === 'gen', 'the General chip did not select');
      // from the portions path: portion 5 → sheet → its discussion
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bid);
      await T(400);
      await p.click(`.wpv-n[data-w="${ws[4].id}"]`);
      await p.waitForSelector('.wsheet', { timeout: 4000 });
      await p.click('.wsheet [data-act="book-tab"]');
      await T(600);
      assert((await on()) === ws[4].id, 'the portion sheet opened the wrong discussion: ' + (await on()));
      const inView = await p.evaluate(() => {
        const row = document.querySelector('.talk-chips').getBoundingClientRect();
        const c = document.querySelector('.talk-chips .chip.on').getBoundingClientRect();
        return c.left >= row.left - 1 && c.right <= row.right + 1;
      });
      assert(inView, 'the selected portion chip is scrolled out of view');
      await H.shot(p, 'r11-portion-talk');
      return `${ws.length} portions; chips and the path open the right thread`;
    }, ['open']);

    await step('Rename a book from the pencil by its title; the Reading settings change the reader', async () => {
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      const bid = ctx.book.id;
      await p.evaluate((id) => window.A.V.go('book-' + id), bid);
      await T(500);
      await p.click('.bp-edit');
      await p.waitForSelector('#eb-form');
      await p.fill('#eb-title', 'كتاب باسم جديد');
      await p.fill('#eb-author', 'مؤلف معروف');
      await p.click('#eb-form button.btn');
      await until(p, 'title saved', () => [...window.A.S.books.values()].some((b) => b.title === 'كتاب باسم جديد' && b.author === 'مؤلف معروف'), null, 6000);
      await until(p, 'sheet closed after saving', () => !document.querySelector('#eb-form'), null, 4000);
      const h1 = await p.$eval('.bp-info h1', (e) => e.textContent.trim());
      assert(h1.startsWith('كتاب باسم جديد'), 'page still shows ' + h1);
      // Settings → Reading
      await p.click('[data-go="settings"]');
      await T(600);
      await p.click('[data-act="rd-tools"][data-v="right"]');
      await p.click('[data-act="rd-marks"][data-v="mine"]');
      await T(300);
      await H.shot(p, 'r12-reading-settings');
      const prefs = await p.evaluate(() => ({ tools: window.A.U.store.get('rdTools'), marks: window.A.U.store.get('rdMarks') }));
      assert(prefs.tools === 'right' && prefs.marks === 'mine', JSON.stringify(prefs));
      await p.click('[data-act="rd-tools"][data-v="left"]');
      await p.click('[data-act="rd-marks"][data-v="all"]');
      return `renamed to «${h1}»; settings saved`;
    }, ['open']);

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
