#!/usr/bin/env node
/*
 * Goodreads sync on a phone (390×844) against the fake Supabase. The database's goodreads_feed RPC answers from
 * the http stand-in in tests/sql/supabase_stubs.sql (extensions.http_stub), filled here from
 * tests/e2e/fixtures/goodreads_rss.xml:
 *   a member imports the Goodreads CSV, adds a book by hand, edits a rating, then links Goodreads →
 *   no duplicates; CSV books change only where Goodreads changed and the member didn't; the hand-edited rating
 *   survives; new books arrive; to-read → read moves; a re-read is kept; a second sync changes nothing;
 *   later Goodreads changes flow in, a book removed in the app stays removed; the auto sync after 12 h runs once.
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
  await p.waitForSelector('#gr-wrap');
}
const items = (p) => p.evaluate(() => Object.entries((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).map(([id, x]) => Object.assign({ id }, x)));
const shelfGr = (p) => p.evaluate(() => (window.A.S.shelf.get(window.A.S.me) || {}).gr || null);
const byTitle = (list, re) => list.filter((x) => re.test(x.title));
const one = (list, re) => {
  const f = byTitle(list, re);
  assert(f.length === 1, `${re}: ${f.length} copies`);
  return f[0];
};

const FEED = fs.readFileSync(path.join(H.FIXTURES, 'goodreads_rss.xml'), 'utf8');
const URL1 = 'https://www.goodreads.com/review/list_rss/777?shelf=%23ALL%23&page=1';
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mahmoud\'s bookshelf: all</title></channel></rss>';
/* Change a fixture: every `from` must be there (so a typo can't make a test pass by accident). */
function edit(xml, pairs) {
  for (const [from, to] of pairs) {
    assert(xml.includes(from), 'fixture edit not found: ' + from.slice(0, 80));
    xml = xml.split(from).join(to);
  }
  return xml;
}
const item = (id, rest) => `<item><title>${rest.title}</title><book_id>${id}</book_id><book id="${id}"><num_pages>${rest.pages || 0}</num_pages></book><author_name>${rest.author}</author_name><user_rating>${rest.rating || 0}</user_rating><user_read_at><![CDATA[${rest.readAt || ''}]]></user_read_at><user_shelves>${rest.shelves || ''}</user_shelves><user_review><![CDATA[]]></user_review></item>`;

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const sql = (q, params) => env.fake.sql(q, params);
  const feedCalls = async () => +(await sql(`select count(*)::int as n from extensions.http_stub_log where url like 'https://www.goodreads.com/review/list_rss/777?%'`))[0].n;
  const setFeed = (xml) => sql(`insert into extensions.http_stub (url, status, body) values ($1, 200, $2) on conflict (url) do update set status = 200, body = excluded.body`, [URL1, xml]);
  let p;
  try {
    await setFeed(FEED);
    await sql(`insert into extensions.http_stub (url, status, body) values ($1, 200, $2)`, ['^https://www\\.goodreads\\.com/review/list_rss/777\\?shelf=%23ALL%23&page=([2-9]|[1-6][0-9])$', EMPTY]);
    await sql(`insert into extensions.http_stub (url, status, body) values ($1, 404, 'Not found')`, ['^https://www\\.goodreads\\.com/review/list_rss/404\\?']);

    await step('A member imports the Goodreads CSV, adds Dune by hand and changes a rating', async () => {
      const a = await H.newUser(browser, env, 'mahmoud@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = a.page;
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AARwMB/1t+5gUAAAAASUVORK5CYII=', 'base64');
      await p.context().route(/^https:\/\/(covers\.openlibrary\.org|i\.gr-assets\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
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
      await p.click('[data-go="shelf"]');
      await T(400);
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("Goodreads")');
      await p.waitForSelector('#gr-url');
      await H.shot(p, 'g01-import-sheet');
      await p.setInputFiles('#imp-file', path.join(H.FIXTURES, 'goodreads_library_export.csv'));
      await p.waitForSelector('.imp-sum');
      assert(await p.$eval('#gr-wrap', (e) => e.hidden), 'the Goodreads link box should step aside during the CSV preview');
      await p.click('[data-imp-go]');
      await until(p, 'CSV imported', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).length === 7);
      const it = await items(p);
      const fel = one(it, /Fellowship/);
      assert(fel.rating === 5 && fel.grId === '34' && JSON.stringify(fel.lists) === '["fantasy"]', 'CSV row: ' + JSON.stringify(fel));
      await T(300);
      await p.evaluate((id) => window.A.V.saveShelfItem(id, { rating: 3 }), fel.id);
      await until(p, 'rating changed by hand', () => Object.values(window.A.S.shelf.get(window.A.S.me).items).some((x) => /Fellowship/.test(x.title) && x.rating === 3));
      ctx.csv = true;
      return `${it.length} books`;
    });

    await step('Links: profile links and RSS links are read, other links refused', async () => {
      const r = await p.evaluate(() => {
        const f = window.A.Imp.parseGrLink;
        return [
          f('https://www.goodreads.com/user/show/12345-mahmoud-k'),
          f('https://m.goodreads.com/user/show/12345'),
          f('goodreads.com/user/show/12345-name?ref=nav'),
          f('https://www.goodreads.com/review/list_rss/12345?key=AbC-9_x&shelf=%23ALL%23'),
          f('https://www.goodreads.com/review/list/12345-name?shelf=read'),
          f(' 12345 '),
          f('https://www.goodreads.com/author/show/12345.Someone'),
          f('https://evil.example/goodreads.com/user/show/1x'),
          f('https://www.goodreads.com/user/show/1234567890123'),
        ];
      });
      const want = [{ id: '12345', key: '' }, { id: '12345', key: '' }, { id: '12345', key: '' }, { id: '12345', key: 'AbC-9_x' }, { id: '12345', key: '' }, { id: '12345', key: '' }, null, null, null];
      assert(JSON.stringify(r) === JSON.stringify(want), JSON.stringify(r));
    }, ['csv']);

    await step('A wrong account number gives a clear message and links nothing', async () => {
      await closeSheets(p);
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("Goodreads")');
      await p.waitForSelector('#gr-url');
      await p.fill('#gr-url', 'https://www.goodreads.com/user/show/404-nobody');
      await p.click('[data-gr-link]');
      await until(p, 'error shown', () => !document.querySelector('#gr-err').hidden);
      const msg = await p.$eval('#gr-err', (e) => e.textContent);
      assert(/ملقيناش حساب/.test(msg), msg);
      assert(!(await shelfGr(p)), 'linked anyway');
      await p.fill('#gr-url', 'https://www.goodreads.com/author/show/12.X');
      await p.click('[data-gr-link]');
      assert(/مش لينك بروفايل/.test(await p.$eval('#gr-err', (e) => e.textContent)), 'bad link not refused');
    }, ['csv']);

    await step('Linking syncs: no duplicates, only what changed on Goodreads (and not here) changes', async () => {
      await p.fill('#gr-url', 'https://m.goodreads.com/user/show/777-mahmoud');
      await p.click('[data-gr-link]');
      await until(p, 'linked', () => !!document.querySelector('.gr-box.on .gr-res'), null, 15000);
      const sum = await p.$$eval('.gr-res b', (x) => x.map((e) => e.textContent).join(','));
      await H.shot(p, 'g02-linked');
      assert(sum === '٢,٤,٣', 'new/updated/unchanged: ' + sum);
      const it = await items(p);
      assert(it.length === 9, 'books: ' + it.length + ' ' + it.map((x) => x.title).join(' | '));
      const keys = await p.evaluate(() => Object.values(window.A.S.shelf.get(window.A.S.me).items).map((x) => window.A.Imp.key(x.title, x.author)));
      assert(new Set(keys).size === keys.length, 'duplicates: ' + keys.join(' | '));
      const fel = one(it, /Fellowship/);
      assert(fel.rating === 3, 'hand-edited rating overwritten: ' + fel.rating);
      assert(fel.gr && fel.gr.rating === 4, 'Goodreads rating not remembered: ' + JSON.stringify(fel.gr));
      assert(/openlibrary/.test(fel.cover), 'cover replaced: ' + fel.cover);
      const gra = one(it, /غرناطة/);
      assert(gra.rating === 5 && gra.review === 'رواية جميلة،\nفيها حزن كتير.', 'Granada: ' + JSON.stringify(gra));
      const sap = one(it, /Sapiens/);
      assert(sap.status === 'read' && sap.finished === '2024-05' && sap.rating === 4, 'Sapiens to-read → read: ' + JSON.stringify(sap));
      const man = one(it, /Man's Search/);
      assert(man.finished === '2025-01' && JSON.stringify(man.reads) === '[{"finished":"2020-08"}]', 're-read: ' + JSON.stringify(man));
      const ah = one(it, /Atomic Habits/);
      assert(ah.status === 'reading' && /openlibrary/.test(ah.cover), 'Atomic Habits: ' + JSON.stringify(ah));
      const ayam = one(it, /الأيام/);
      assert(ayam.rating === 5 && ayam.finished === '2019-05' && !ayam.cover, 'الأيام: ' + JSON.stringify(ayam));
      const phm = one(it, /Project Hail Mary/);
      assert(phm.status === 'read' && phm.rating === 5 && phm.finished === '2025-06' && phm.pages === 476 && phm.grId === '999' && phm.src === 'goodreads', 'new book: ' + JSON.stringify(phm));
      assert(/\/999\.jpg$/.test(phm.cover), 'full-size cover: ' + phm.cover);
      assert(JSON.stringify(phm.lists) === '["sci-fi","favorites"]', 'lists: ' + JSON.stringify(phm.lists));
      assert(phm.review === 'Funny & clever.\n\nRocky!', 'review: ' + JSON.stringify(phm.review));
      const dnf = one(it, /Gave Up/);
      assert(dnf.status === 'dnf' && !dnf.cover && dnf.rating === 2, "didn't finish: " + JSON.stringify(dnf));
      const dune = one(it, /^Dune$/);
      assert(dune.id === 'dune1' && dune.grId === '234' && dune.rating === 4 && dune.pages === 412 && dune.finished === '2016-10' && /234\.jpg$/.test(dune.cover) && !dune.src, 'hand-added Dune linked and filled: ' + JSON.stringify(dune));
      const gr = await shelfGr(p);
      assert(gr && gr.id === '777' && gr.at && gr.ids.length === 9 && gr.reviews === true, 'shelf link: ' + JSON.stringify(gr));
      assert(!JSON.stringify(gr).includes('key'), 'the RSS key went into shared data');
      const row = (await sql(`select data from public.shelves where data ? 'gr'`))[0];
      assert(row && row.data.gr.id === '777', 'gr not stored in shelves.data: ' + JSON.stringify(row && row.data && row.data.gr));
      ctx.linked = true;
      return `${it.length} books, summary ${sum}`;
    }, ['csv']);

    await step('A second sync changes nothing', async () => {
      const before = JSON.stringify((await items(p)).sort((a, b) => a.id.localeCompare(b.id)));
      const n0 = await feedCalls();
      await p.click('[data-gr-sync]');
      await until(p, 'synced again', () => !!document.querySelector('[data-gr-sync]') && !document.querySelector('[data-gr-sync]').disabled && /٠/.test(document.querySelector('.gr-res b').textContent), null, 15000);
      const sum = await p.$$eval('.gr-res b', (x) => x.map((e) => e.textContent).join(','));
      assert(sum === '٠,٠,٩', 'summary: ' + sum);
      const after = JSON.stringify((await items(p)).sort((a, b) => a.id.localeCompare(b.id)));
      assert(before === after, 'items changed on a sync with nothing new');
      const n = (await feedCalls()) - n0;
      assert(n === 2, 'pages fetched: ' + n + ' (want page 1 and an empty page 2)');
      const last = await p.$eval('.gr-at', (e) => e.textContent);
      assert(/آخر مزامنة: دلوقتي/.test(last), 'last sync line: ' + last);
    }, ['linked']);

    await step('Later Goodreads changes flow in; edits made here and books removed here stay', async () => {
      const it0 = await items(p);
      // in the app: change Granada's rating, remove Project Hail Mary
      await p.evaluate((id) => window.A.V.saveShelfItem(id, { rating: 3 }), one(it0, /غرناطة/).id);
      const phm = one(it0, /Project Hail Mary/).id;
      await p.evaluate(async (id) => {
        const { D, S } = window.A;
        await D.mutate(`shelf/${S.me}`, () => {
          const cur = S.shelf.get(S.me);
          const items = Object.assign({}, cur.items);
          delete items[id];
          return { items }; // the way the shelf screen removes a book
        });
      }, phm);
      await until(p, 'removed', (id) => !window.A.S.shelf.get(window.A.S.me).items[id], phm);
      // on Goodreads: Fellowship 4 → 2, Granada 5 → 2, Atomic Habits finished in Sep 2025 with ★4
      await setFeed(
        edit(FEED, [
          ['<user_rating>4</user_rating>\n      <user_read_at><![CDATA[Sun, 14 Mar 2021', '<user_rating>2</user_rating>\n      <user_read_at><![CDATA[Sun, 14 Mar 2021'],
          ['<user_rating>5</user_rating>\n      <user_read_at><![CDATA[Sat, 02 Jul 2022', '<user_rating>2</user_rating>\n      <user_read_at><![CDATA[Sat, 02 Jul 2022'],
          ['<user_rating>0</user_rating>\n      <user_read_at><![CDATA[]]></user_read_at>', '<user_rating>4</user_rating>\n      <user_read_at><![CDATA[Tue, 30 Sep 2025 00:00:00 +0000]]></user_read_at>'],
          ['<user_shelves>currently-reading</user_shelves>', '<user_shelves>read</user_shelves>'],
        ])
      );
      await closeSheets(p);
      await p.screenshot({ path: '/tmp/claude-0/-home-user-naqra-sawa/7e805eea-e646-56e0-a81e-9929043ef038/scratchpad/g-debug.png' });
      await openSheet(p);
      await p.waitForSelector('[data-gr-sync]');
      const gr0 = await shelfGr(p);
      await p.click('[data-gr-sync]');
      await until(p, 'synced', () => !!document.querySelector('.gr-res'), null, 15000);
      const sum = await p.$$eval('.gr-res b', (x) => x.map((e) => e.textContent).join(','));
      const note = await p.$eval('.gr-box', (e) => e.textContent);
      await H.shot(p, 'g03-later-sync');
      const it = await items(p);
      assert(one(it, /Fellowship/).rating === 3, 'Fellowship rating: ' + one(it, /Fellowship/).rating);
      assert(one(it, /غرناطة/).rating === 3, 'Granada rating edited here: ' + one(it, /غرناطة/).rating);
      const ah = one(it, /Atomic Habits/);
      assert(ah.status === 'read' && ah.finished === '2025-09' && ah.rating === 4, 'Atomic Habits: ' + JSON.stringify(ah));
      assert(!byTitle(it, /Project Hail Mary/).length, 'a book removed here came back (shelf gr before: ' + JSON.stringify(gr0 && gr0.ids && gr0.ids.length) + ')');
      assert(sum === '٠,١,٨', 'summary: ' + sum);
      assert(/مش هنرجّعه/.test(note), 'no note about the removed book: ' + note);
      ctx.later = true;
    }, ['linked']);

    await step('Auto sync: quietly once the last sync is over 12 hours old, and only once', async () => {
      await closeSheets(p);
      await setFeed(edit(FEED, [['  </channel>', item(5907, { title: 'The Hobbit', author: 'J.R.R. Tolkien', rating: 5, readAt: 'Mon, 01 Sep 2025 00:00:00 +0000', pages: 310 }) + '\n  </channel>']]));
      // shortly after a sync: nothing happens on reload
      const n0 = await feedCalls();
      await p.reload({ waitUntil: 'load' });
      await p.waitForSelector('.home, .shell', { timeout: 20000 });
      await T(5000);
      assert((await feedCalls()) === n0, 'synced again although the last sync was minutes ago');
      // 13 hours later
      const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
      await sql(`update public.shelves set data = jsonb_set(data, '{gr,at}', to_jsonb($1::text)) where data ? 'gr'`, [old]);
      await p.reload({ waitUntil: 'load' });
      await p.waitForSelector('.home, .shell', { timeout: 20000 });
      await until(p, 'auto sync brought The Hobbit', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).some((x) => x.title === 'The Hobbit'), null, 20000);
      const toast = await p.waitForSelector('.toast', { timeout: 5000 }).then((e) => e.textContent()).catch(() => '');
      assert(/Goodreads/.test(toast) && /جديد/.test(toast), 'toast: ' + toast);
      const n1 = await feedCalls();
      assert(n1 - n0 === 2, 'pages fetched by the auto sync: ' + (n1 - n0));
      const gr = await shelfGr(p);
      assert(Date.now() - Date.parse(gr.at) < 60000, 'last sync not updated: ' + gr.at);
      for (let i = 0; i < 4; i++) {
        await p.evaluate(() => window.A.D.bump());
        await T(1200);
      }
      await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await T(4000);
      assert((await feedCalls()) === n1, 'auto sync ran more than once');
      const it = await items(p);
      const keys = it.map((x) => x.title);
      assert(new Set(keys).size === keys.length && it.length === 9, 'books after auto sync: ' + keys.join(' | '));
      return toast.trim();
    }, ['later']);

    await step('Unlink: the link goes, the books stay', async () => {
      await openSheet(p);
      await p.click('[data-gr-unlink]');
      await p.click('[data-yes]');
      await until(p, 'unlinked', () => !!document.querySelector('#gr-url') && !document.querySelector('.gr-box.on'));
      const gr = await shelfGr(p);
      assert(gr && !gr.id && gr.off && gr.ids.length >= 9, 'shelf gr after unlink: ' + JSON.stringify(gr));
      assert((await items(p)).length === 9, 'books removed on unlink');
      assert(!(await p.evaluate(() => localStorage.getItem('qs:grLink:' + window.A.S.me))), 'device link kept');
    }, ['linked']);

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
