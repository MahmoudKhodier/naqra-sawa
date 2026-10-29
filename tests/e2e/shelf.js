#!/usr/bin/env node
/*
 * Shelf, badges and app updates on a phone (390×844) against the fake Supabase:
 * Goodreads import, search/sort, quick status moves, duplicate warning, friends who read a book,
 * badge levels and details, and the Android update prompt (with a stand-in native layer).
 *
 *   node tests/e2e/shelf.js        # PASS/FAIL per step, exit 1 on any FAIL
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
const items = (p) => p.evaluate(() => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}));

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const pages = [];
  let p, q;
  try {
    await step('Two members join a circle', async () => {
      const a = await H.newUser(browser, env, 'mahmoud@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = a.page;
      pages.push(p);
      // Cover images come from Open Library; the sandbox has no internet, so answer with a tiny picture.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AARwMB/1t+5gUAAAAASUVORK5CYII=', 'base64');
      await a.page.context().route('https://covers.openlibrary.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
      await p.fill('#cn-name', 'حلقة المكتبة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name');
      await p.fill('#join-name', 'محمود');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.home');
      await T(400);
      await closeSheets(p);
      const code = (await env.fake.sql('select invite_code from public.circles'))[0].invite_code;
      const b = await H.newUser(browser, env, 'sara@test.local', { url: env.siteUrl + '#join-' + code, viewport: { width: 390, height: 844 } });
      q = b.page;
      pages.push(q);
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', 'سارة');
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.home');
      await closeSheets(q);
      ctx.joined = true;
    });

    await step('Bulk-add one book, then import a Goodreads export: preview counts, other shelves left out', async () => {
      await p.click('[data-go="shelf"]');
      await T(400);
      await p.click('[data-act="bulk-shelf"]');
      await p.fill('#bulk-text', 'الأيام - طه حسين');
      await p.click('[data-bulk]');
      await until(p, 'bulk item saved', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).length === 1);
      await closeSheets(p);
      await p.click('[data-act="import-shelf"]');
      await p.setInputFiles('#imp-file', path.join(H.FIXTURES, 'goodreads_library_export.csv'));
      await p.waitForSelector('.imp-sum');
      const sum = await p.$$eval('.imp-sum b', (x) => x.map((e) => e.textContent));
      const notes = await p.$eval('.imp-notes', (e) => e.textContent);
      await H.shot(p, 's01-import-preview');
      assert(sum.join(',') === '٣,١,١', 'read/reading/want: ' + sum.join(','));
      assert(/did-not-finish/.test(notes), 'the did-not-finish shelf is not reported: ' + notes);
      assert(/موجود عندك/.test(notes), 'the existing «الأيام» should be completed, not added: ' + notes);
      await p.click('[data-imp-go]');
      await until(p, 'imported', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).length === 6);
      const it = await items(p);
      const lotr = it.find((x) => /Fellowship/.test(x.title));
      assert(lotr && lotr.title === 'The Fellowship of the Ring', 'series not stripped: ' + (lotr && lotr.title));
      assert(lotr.rating === 5 && lotr.finished === '2021-03' && lotr.pages === 398, 'rating/date/pages: ' + JSON.stringify(lotr));
      assert(lotr.review === 'Loved it.\n\n"Not all those who wander are lost", truly & deeply.', 'review: ' + JSON.stringify(lotr.review));
      assert(/covers\.openlibrary\.org\/b\/isbn\/9780618346257/.test(lotr.cover), 'cover: ' + lotr.cover);
      const gr = it.find((x) => x.title === 'ثلاثية غرناطة');
      assert(gr && gr.review === 'رواية جميلة،\nفيها حزن كتير.' && gr.author === 'رضوى عاشور', 'Arabic row: ' + JSON.stringify(gr));
      const ayam = it.filter((x) => x.title === 'الأيام');
      assert(ayam.length === 1 && ayam[0].rating === 5 && ayam[0].finished === '2019-05', 'existing book not completed: ' + JSON.stringify(ayam));
      const st = it.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
      assert(st.read === 4 && st.reading === 1 && st.want === 1, 'statuses: ' + JSON.stringify(st));
      await T(600);
      await H.shot(p, 's02-shelf-after-import');
      // importing the same file again adds nothing
      await p.click('[data-act="import-shelf"]');
      await p.setInputFiles('#imp-file', path.join(H.FIXTURES, 'goodreads_library_export.csv'));
      await p.waitForSelector('.imp-sum');
      const again = await p.$eval('[data-imp-go]', (b) => b.disabled);
      assert(again, 'a second import of the same file offers to add books again');
      await closeSheets(p);
      ctx.imported = true;
      return `${it.length} books; statuses ${JSON.stringify(st)}`;
    }, ['joined']);

    await step('Search and sort the shelf', async () => {
      // make the read tab long enough to show the tools
      await p.evaluate(async () => {
        const { D, S, U } = window.A;
        const t = U.nowIso();
        await D.mutate(`shelf/${S.me}`, () => {
          const items = Object.assign({}, S.shelf.get(S.me).items);
          for (const [i, n] of ['أولاد حارتنا|نجيب محفوظ', 'عبقرية عمر|العقاد', 'Dune|Frank Herbert'].entries()) {
            const [title, author] = n.split('|');
            items['x' + i] = { title, author, status: 'read', rating: i + 1, finished: '', tags: [], pages: 0, review: '', at: t, updatedAt: t };
          }
          return { items };
        });
      });
      await p.evaluate(() => window.A.V.go('shelf', { st: 'read' }));
      await p.waitForSelector('#sh-q');
      await p.fill('#sh-q', 'محفوظ');
      await T(300);
      const hits = await p.$$eval('.shelf-list .sl-t b', (x) => x.map((e) => e.textContent));
      assert(hits.length === 1 && hits[0] === 'أولاد حارتنا', 'search by author: ' + hits.join(' | '));
      await p.fill('#sh-q', 'غرناطه'); // ه for ة still finds it
      await T(300);
      const hits2 = await p.$$eval('.shelf-list .sl-t b', (x) => x.map((e) => e.textContent));
      assert(hits2.length === 1 && hits2[0] === 'ثلاثية غرناطة', 'search ignoring spelling: ' + hits2.join(' | '));
      await p.fill('#sh-q', '');
      await p.selectOption('#sh-sort', 'rating');
      await T(300);
      const first = await p.$eval('.shelf-list .sl-t b', (e) => e.textContent);
      assert(['The Fellowship of the Ring', 'الأيام', "Man's Search for Meaning"].includes(first), 'sorted by rating, first is ' + first);
      await H.shot(p, 's03-shelf-search');
      return 'author, spelling-insensitive title, rating sort';
    }, ['imported']);

    await step('Want → reading → read from the book sheet, then rate it', async () => {
      await p.evaluate(() => window.A.V.go('shelf', { st: 'want' }));
      await T(300);
      await p.click('.shelf-list li button');
      await p.click('[data-move="reading"]');
      await until(p, 'moved to reading', () => Object.values(window.A.S.shelf.get(window.A.S.me).items).some((x) => /Sapiens/.test(x.title) && x.status === 'reading'));
      await T(400);
      await p.evaluate(() => window.A.V.go('shelf', { st: 'reading' }));
      await T(300);
      await p.click('.shelf-list li button:has-text("Sapiens")');
      await p.click('[data-move="read"]');
      await p.waitForSelector('#sf-form', { timeout: 4000 });
      await p.click('#sf-stars [data-star="4"]');
      await p.click('#sf-form button.btn.gold');
      await until(p, 'finished and rated', () => Object.values(window.A.S.shelf.get(window.A.S.me).items).some((x) => /Sapiens/.test(x.title) && x.status === 'read' && x.rating === 4 && x.finished));
      return 'Sapiens: want → reading → read ★4';
    }, ['imported']);

    await step('Adding a book that is already there asks first', async () => {
      await closeSheets(p);
      await p.click('[data-act="shelf-add"]');
      await p.fill('#sf-title', 'الايام'); // different hamza spelling
      await p.fill('#sf-author', 'طه حسين');
      await p.click('#sf-form button.btn.gold');
      await p.waitForSelector('.sheet-wrap.in [data-ok], .confirm', { timeout: 4000 }).catch(() => {});
      const asked = await p.evaluate(() => /موجود في مكتبتك/.test(document.body.textContent));
      assert(asked, 'no duplicate warning');
      await closeSheets(p);
      const n = (await items(p)).filter((x) => /الأيام|الايام/.test(x.title)).length;
      assert(n === 1, 'duplicate was added anyway: ' + n);
    }, ['imported']);

    await step("A friend's copy shows in the book sheet", async () => {
      await q.evaluate(async () => {
        const { D, S, U } = window.A;
        const t = U.nowIso();
        await D.mutate(`shelf/${S.me}`, () => ({ items: { a1: { title: 'ثلاثية غرناطة', author: 'رضوى عاشور', status: 'read', rating: 5, finished: '2024-01', tags: [], pages: 0, review: '', at: t, updatedAt: t } } }));
      });
      await until(p, 'friend shelf synced', () => [...window.A.S.shelf.values()].some((s) => s.id !== window.A.S.me && s.items && s.items.a1), null, 8000);
      await p.evaluate(() => window.A.V.go('shelf', { st: 'read' }));
      await T(300);
      await p.click('.shelf-list li button:has-text("ثلاثية غرناطة")');
      await p.waitForSelector('.sd-others');
      const who = await p.$eval('.sd-others', (e) => e.textContent);
      await H.shot(p, 's04-book-sheet-friends');
      assert(/سارة/.test(who), 'friend not listed: ' + who);
      await closeSheets(p);
    }, ['imported']);

    await step('Badges: groups two per row, levels, details sheet with how-to and who has it', async () => {
      await p.evaluate(async () => {
        const { D, U } = window.A;
        const days = {}, secs = {};
        for (let i = 0; i < 40; i++) {
          const d = U.addDays(U.today(), -i);
          days[d] = i === 3 ? 120 : 30;
          secs[d] = 1100;
        }
        await D.updateMe(() => ({ days, secs }));
      });
      await T(800);
      await closeSheets(p);
      await p.click('[data-go="me"]');
      await T(500);
      const grid = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.badges .bdg')];
        const tops = new Set(cards.slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().top)));
        return { n: cards.length, perRow: 6 / tops.size, got: document.querySelectorAll('.badges .bdg.got').length };
      });
      assert(grid.perRow === 2, 'cards per row: ' + grid.perRow);
      assert(grid.n === 22, 'groups: ' + grid.n);
      await p.click('.bdg[data-g="pages"]');
      await p.waitForSelector('.bd-tiers');
      const tiers = await p.$$eval('.bd-tiers li', (x) => x.map((e) => e.classList.contains('got')));
      assert(tiers.join() === 'true,true,false,false', 'page levels: ' + tiers.join());
      assert(await p.$('.bd-tip'), 'no how-to tip');
      await H.shot(p, 's05-badge-detail');
      await closeSheets(p);
      return `${grid.n} groups, ${grid.got} with a level earned`;
    }, ['joined']);

    await step('Android update: checks by itself, asks with what is new since my build, installs the newest', async () => {
      await p.route('https://api.github.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            name: 'نقرأ سوا — Android (build 15)',
            published_at: new Date().toISOString(),
            assets: [{ name: 'naqra-sawa.apk', size: 9800000, updated_at: new Date().toISOString() }],
            body: 'notes\n\n<!-- whats-new\n15|ميزة ١٥|Feature 15\n14|ميزة ١٤|Feature 14\n13|ميزة ١٣|Feature 13\n12|قديمة|Old\n-->',
          }),
        }),
      );
      await p.evaluate(() => {
        const A = window.A;
        A.P.native = true;
        A.P.cfg.apkUrl = 'https://github.com/o/r/releases/download/android-latest/naqra-sawa.apk';
        window.__inst = [];
        const plugins = { App: { getInfo: async () => ({ build: '12' }) }, AppUpdate: { canInstall: async () => ({ allowed: true }), addListener: async () => ({ remove() {} }), install: async (o) => window.__inst.push(o) } };
        A.P.plugin = (n) => plugins[n] || null;
        A.U.store.del('updCheckedAt');
        A.U.store.del('updLater');
      });
      await p.evaluate(() => window.A.Upd.check());
      await p.waitForSelector('.upd-ask', { timeout: 5000 });
      const news = await p.$$eval('.upd-news li', (x) => x.map((e) => e.textContent));
      assert(news.join('|') === 'ميزة ١٥|ميزة ١٤|ميزة ١٣', 'what is new: ' + news.join('|'));
      assert(await p.$('[data-go="settings"] .nv-b'), 'no dot on the Settings tab');
      await H.shot(p, 's06-update-prompt');
      await p.click('[data-upd-later]');
      await T(400);
      await p.evaluate(() => window.A.Upd.check(true));
      await T(500);
      assert(!(await p.$('.upd-ask')), 'asked again right after «Later»');
      await p.click('[data-go="settings"]');
      await T(400);
      await p.click('.upd-row [data-act="app-update"]');
      await until(p, 'install requested', () => window.__inst.length === 1);
      const req = await p.evaluate(() => window.__inst[0]);
      assert(req.minBuild === 15 && /android-latest/.test(req.url), 'install request: ' + JSON.stringify(req));
      return 'prompt with builds 13–15, «Later» respected, installs build ≥ 15';
    }, ['joined']);
  } finally {
    console.log('\n==== console / page errors ====');
    for (const pg of pages) for (const e of pg.__errors || []) console.log('  ' + e);
    const bad = results.filter((r) => r.status === 'FAIL').length;
    const skip = results.filter((r) => r.status === 'SKIP').length;
    console.log(`==== ${results.length - bad - skip} passed, ${bad} failed, ${skip} skipped — screenshots in tests/e2e/shots`);
    await browser.close();
    await env.stop();
    process.exit(bad ? 1 : 0);
  }
})();
