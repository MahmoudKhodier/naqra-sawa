#!/usr/bin/env node
/*
 * Shelves that scale (one row per book, table shelf_books) against the fake Supabase:
 * a legacy one-row shelf shows and moves into rows (and again after an older app writes it),
 * 3,000 books in one write, one edit = one row, one removal = one soft-deleted row,
 * a circle-mate sees it live, after a reload, on a new phone (paged fetch), and from the cache with REST blocked.
 *
 *   node tests/e2e/library.js        # PASS/FAIL per step, exit 1 on any FAIL
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
async function until(page, what, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
async function untilDb(env, what, sql, params, ok, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await env.fake.sql(sql, params);
    if (ok(last)) return last;
    if (Date.now() > end) throw new Error('timed out waiting for: ' + what + ' — last: ' + JSON.stringify(last).slice(0, 300));
    await T(150);
  }
}
const closeSheets = async (p) => {
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
const countOf = (p, uid) => p.evaluate((u) => Object.keys((window.A.S.shelf.get(u || window.A.S.me) || {}).items || {}).length, uid || null);

/* Rows a page (or a whole context) sends to shelf_books (upserts) and how many reads it makes. */
function watchRows(page) {
  const w = { upserts: [], selects: 0 };
  page.on('request', (r) => {
    if (r.method() !== 'POST' || !/\/rest\/v1\/__query$/.test(r.url())) return;
    let q;
    try {
      q = JSON.parse(r.postData() || '{}');
    } catch (e) {
      return;
    }
    if (q.table !== 'shelf_books') return;
    if (q.method === 'upsert') w.upserts.push(Array.isArray(q.body) ? q.body.length : 1);
    else if ((q.method || 'select') === 'select') w.selects++;
  });
  w.reset = () => {
    w.upserts = [];
    w.selects = 0;
  };
  w.rows = () => w.upserts.reduce((a, b) => a + b, 0);
  return w;
}

async function joinCircle(browser, env, email, nick, code) {
  const u = await H.newUser(browser, env, email, code ? { url: env.siteUrl + '#join-' + code } : {});
  const p = u.page;
  if (!code) {
    await p.fill('#cn-name', 'حلقة المكتبة الكبيرة');
    await p.click('#circle-new button');
  }
  await p.waitForSelector('#join-name', { timeout: 20000 });
  await p.fill('#join-name', nick);
  await p.click('#join-form button[type=submit]');
  await p.waitForSelector('.home');
  await T(300);
  await closeSheets(p);
  return u;
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const pages = [];
  let a, b, l, wa, wb, wl, A, B, Lid, code;
  const timings = {};
  try {
    await step('Three members join a circle', async () => {
      const ua = await joinCircle(browser, env, 'mahmoud@test.local', 'محمود');
      a = ua.page;
      code = (await env.fake.sql('select invite_code from public.circles'))[0].invite_code;
      const ub = await joinCircle(browser, env, 'sara@test.local', 'سارة', code);
      b = ub.page;
      const ul = await joinCircle(browser, env, 'laila@test.local', 'ليلى', code);
      l = ul.page;
      pages.push(a, b, l);
      wa = watchRows(a);
      wb = watchRows(b);
      A = await a.evaluate(() => window.A.S.me);
      B = await b.evaluate(() => window.A.S.me);
      Lid = await l.evaluate(() => window.A.S.me);
      await l.context().close(); // Laila comes back later on a fresh phone
      pages.splice(pages.indexOf(l), 1);
      ctx.joined = true;
    });

    await step('A legacy one-row shelf of 200 books shows to others, then moves into rows when its owner opens the app', async () => {
      const items = {};
      for (let i = 0; i < 200; i++) items['lg' + i] = { title: 'كتاب قديم ' + i, author: 'كاتب ' + (i % 9), status: i % 5 ? 'read' : 'want', rating: i % 6, finished: '2024-0' + (1 + (i % 9)), tags: [], at: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' };
      await env.fake.sql(`insert into public.shelves (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data`, [Lid, JSON.stringify({ items, keep: 'me' })]);
      await until(a, 'Mahmoud sees the legacy shelf live', (u) => Object.keys((window.A.S.shelf.get(u) || {}).items || {}).length === 200, Lid);
      const lc = await H.newContext(browser);
      wl = watchRows(lc);
      const t0 = Date.now();
      const ul = await H.newUser(browser, env, 'laila@test.local', { context: lc });
      l = ul.page;
      pages.push(l);
      await until(l, 'Laila sees her 200 books', () => Object.keys((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).length === 200);
      // the old one-row copy stays for app versions that only read it (KEEP_LEGACY in platform.js)
      await untilDb(env, 'rows written, the old copy kept', `select (select count(*)::int from public.shelf_books where user_id = $1 and not deleted) as n, (select data from public.shelves where user_id = $1) as d`, [Lid], (r) => r[0].n === 200 && Object.keys(r[0].d.items || {}).length === 200);
      const d = (await env.fake.sql('select data from public.shelves where user_id = $1', [Lid]))[0].data;
      assert(d.keep === 'me', 'other keys of the shelves row lost: ' + JSON.stringify(d));
      const row = (await env.fake.sql(`select data from public.shelf_books where user_id = $1 and id = 'lg7'`, [Lid]))[0].data;
      assert(row.title === 'كتاب قديم 7' && row.rating === 1, 'row data: ' + JSON.stringify(row));
      await T(500);
      assert((await countOf(l)) === 200 && (await countOf(a, Lid)) === 200, 'counts after the move: ' + (await countOf(l)) + ' / ' + (await countOf(a, Lid)));
      assert(wl.rows() === 200, 'the move sent ' + wl.rows() + ' rows');
      const v = await l.evaluate(() => window.A.S.shelf.get(window.A.S.me).keep);
      assert(v === 'me', 'view lost the other key');
      ctx.legacy = true;
      return `${wl.rows()} rows in ${wl.upserts.length} request(s), ${Date.now() - t0} ms from opening the site`;
    }, ['joined']);

    await step('An older app writes the one-row shelf again: newer copies win, stale ones do not, deleted stays deleted', async () => {
      // Laila deletes lg3 in the new app first.
      await l.evaluate(() => {
        const { D, S } = window.A;
        return D.mutate(`shelf/${S.me}`, () => {
          const items = Object.assign({}, S.shelf.get(S.me).items);
          delete items.lg3;
          return { items };
        });
      });
      await untilDb(env, 'lg3 soft-deleted', `select deleted from public.shelf_books where user_id = $1 and id = 'lg3'`, [Lid], (r) => r[0] && r[0].deleted === true);
      wl.reset();
      const later = new Date(Date.now() + 60000).toISOString();
      const items = {
        lg1: { title: 'عدّلته من التطبيق القديم', status: 'read', at: '2025-01-01T00:00:00.000Z', updatedAt: later },
        lg2: { title: 'نسخة قديمة', status: 'read', at: '2025-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
        lg3: { title: 'كتاب قديم 3', status: 'read', at: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
        old1: { title: 'جديد من التطبيق القديم', status: 'want', at: later, updatedAt: later },
      };
      await env.fake.sql(`update public.shelves set data = $2 where user_id = $1`, [Lid, JSON.stringify({ items, keep: 'me' })]);
      await untilDb(env, 'moved again', `select (select data from public.shelves where user_id = $1) as d, (select jsonb_object_agg(id, jsonb_build_object('t', data ->> 'title', 'del', deleted)) from public.shelf_books where user_id = $1 and id in ('lg1', 'lg2', 'lg3', 'old1')) as r`, [Lid], (r) => r[0].r && r[0].r.old1); // the old copy itself stays (KEEP_LEGACY)
      const r = (await env.fake.sql(`select jsonb_object_agg(id, jsonb_build_object('t', data ->> 'title', 'del', deleted)) as r from public.shelf_books where user_id = $1 and id in ('lg1', 'lg2', 'lg3', 'old1')`, [Lid]))[0].r;
      assert(r.lg1.t === 'عدّلته من التطبيق القديم', 'the newer legacy copy should win: ' + JSON.stringify(r.lg1));
      assert(r.lg2.t === 'كتاب قديم 2', 'a stale legacy copy overwrote the row: ' + JSON.stringify(r.lg2));
      assert(r.lg3.del === true, 'a deleted book came back: ' + JSON.stringify(r.lg3));
      assert(r.old1.t === 'جديد من التطبيق القديم' && !r.old1.del, 'new legacy book: ' + JSON.stringify(r.old1));
      assert(wl.rows() === 2, 'expected 2 rows sent (lg1, old1), got ' + wl.rows());
      await until(l, 'view updated', () => Object.keys(window.A.S.shelf.get(window.A.S.me).items).length === 200 && window.A.S.shelf.get(window.A.S.me).items.lg1.title === 'عدّلته من التطبيق القديم');
      // Re-opening does nothing more: the move is idempotent.
      wl.reset();
      await l.reload();
      await H.settled(l);
      await until(l, 'shelf back after reload', () => window.A.S.shelf && window.A.S.shelf.get(window.A.S.me) && Object.keys(window.A.S.shelf.get(window.A.S.me).items).length === 200);
      await T(2500);
      assert(wl.rows() === 0, 're-opening sent rows again: ' + wl.rows());
      return 'lg1 newer wins, lg2 stale ignored, lg3 stays deleted, old1 added; reopen sends 0 rows';
    }, ['legacy']);

    await step('One write of 3,000 books lands as rows, in batches of ≤ 500', async () => {
      wa.reset();
      const t0 = Date.now();
      const ms = await a.evaluate(async () => {
        const { D, S, U } = window.A;
        const t = U.nowIso();
        const items = {};
        const tags = ['novel', 'history', 'philo'];
        for (let i = 0; i < 3000; i++) {
          const y = 2026 - (i % 8);
          items['bk' + String(i).padStart(4, '0')] = { title: (i % 2 ? 'Book ' : 'كتاب ') + i, author: 'Author ' + (i % 50), status: i % 10 === 9 ? 'want' : 'read', rating: i % 6, finished: `${y}-${String(1 + (i % 12)).padStart(2, '0')}`, tags: [tags[i % 3]], pages: 100 + (i % 400), review: i % 3 ? '' : 'مراجعة قصيرة للكتاب رقم ' + i, isbn: String(9780000000000 + i), at: t, updatedAt: t };
        }
        const s = performance.now();
        await D.mutate(`shelf/${S.me}`, () => ({ items }));
        return Math.round(performance.now() - s);
      });
      timings.write3000 = ms;
      const n = (await env.fake.sql('select count(*)::int as n from public.shelf_books where user_id = $1 and not deleted', [A]))[0].n;
      assert(n === 3000, 'rows in the database: ' + n);
      assert(wa.rows() === 3000, 'rows sent: ' + wa.rows());
      assert(Math.max(...wa.upserts) <= 500, 'a batch over 500: ' + wa.upserts.join(','));
      const legacy = (await env.fake.sql('select data from public.shelves where user_id = $1', [A]))[0];
      assert(!legacy || !legacy.data.items, 'items were written to the shelves row too');
      assert((await countOf(a)) === 3000, 'local count ' + (await countOf(a)));
      ctx.big = true;
      return `${ms} ms for D.mutate (${wa.upserts.length} requests: ${wa.upserts.join('+')}), ${Date.now() - t0} ms in all`;
    }, ['joined']);

    await step('Editing one book sends one row; removing one soft-deletes one row', async () => {
      const t0 = (await env.fake.sql('select clock_timestamp()::text as t'))[0].t;
      wa.reset();
      await a.evaluate(() => {
        const { D, S, U } = window.A;
        return D.mutate(`shelf/${S.me}`, () => {
          const items = Object.assign({}, S.shelf.get(S.me).items);
          items.bk0042 = Object.assign({}, items.bk0042, { rating: 5, review: 'غيّرت رأيي', updatedAt: U.nowIso() });
          return { items };
        });
      });
      assert(wa.rows() === 1 && wa.upserts.length === 1, 'edit sent ' + wa.rows() + ' rows in ' + wa.upserts.length + ' requests');
      const ch = await env.fake.sql('select id, data ->> \'rating\' as r from public.shelf_books where user_id = $1 and updated_at > $2', [A, t0]);
      assert(ch.length === 1 && ch[0].id === 'bk0042' && ch[0].r === '5', 'changed rows: ' + JSON.stringify(ch));
      const t1 = (await env.fake.sql('select clock_timestamp()::text as t'))[0].t;
      wa.reset();
      await a.evaluate(() => {
        const { D, S } = window.A;
        return D.mutate(`shelf/${S.me}`, () => {
          const items = Object.assign({}, S.shelf.get(S.me).items);
          delete items.bk0100;
          return { items };
        });
      });
      assert(wa.rows() === 1, 'removal sent ' + wa.rows() + ' rows');
      const del = await env.fake.sql('select id, deleted, data from public.shelf_books where user_id = $1 and updated_at > $2', [A, t1]);
      assert(del.length === 1 && del[0].id === 'bk0100' && del[0].deleted === true && JSON.stringify(del[0].data) === '{}', 'removed rows: ' + JSON.stringify(del));
      assert((await countOf(a)) === 2999, 'local count ' + (await countOf(a)));
      // Through the app's own sheet code path too (V.saveShelfItem).
      wa.reset();
      await a.evaluate(() => window.A.V.saveShelfItem('bk0007', { status: 'read', rating: 3 }));
      assert(wa.rows() === 1, 'V.saveShelfItem sent ' + wa.rows() + ' rows');
      ctx.edited = true;
      return 'edit: 1 row, removal: 1 tombstone, V.saveShelfItem: 1 row';
    }, ['big']);

    await step('A too-long book is refused as too_large (app check and database cap)', async () => {
      const r = await a.evaluate(async () => {
        const { S } = window.A;
        const items = Object.assign({}, S.shelf.get(S.me).items, { huge: { title: 'x', review: 'م'.repeat(40000) } });
        let app = null, db = null;
        try {
          await S.db.doc(`shelf/${S.me}`).set({ items });
        } catch (e) {
          app = e.code;
        }
        const { error } = await window.A.P.sb().from('shelf_books').upsert({ user_id: S.me, id: 'huge2', data: { review: 'م'.repeat(40000) } });
        db = window.A.P.mapErr(error).code;
        return { app, db, has: !!S.shelf.get(S.me).items.huge };
      });
      assert(r.app === 'too_large' && r.db === 'too_large' && !r.has, JSON.stringify(r));
    }, ['big']);

    await step('A circle-mate sees the 3,000 books live', async () => {
      await until(b, "Sara sees Mahmoud's shelf", (u) => {
        const it = (window.A.S.shelf.get(u) || {}).items || {};
        return Object.keys(it).length === 2999 && it.bk0042 && it.bk0042.rating === 5 && !it.bk0100;
      }, A, 120000);
      return `${await countOf(b, A)} books`;
    }, ['edited']);

    await step('…after a reload (only what changed is fetched), and on a new phone (paged full fetch)', async () => {
      wb.reset();
      await T(7000); // the catch-up fetch 3 s after a burst of live rows, then the cache save
      const catchUp = wb.selects;
      wb.reset();
      const t0 = Date.now();
      await b.reload();
      await H.settled(b);
      await until(b, 'shelf after reload', (u) => window.A.S.shelf && Object.keys((window.A.S.shelf.get(u) || {}).items || {}).length === 2999, A);
      timings.reloadB = Date.now() - t0;
      await T(1500);
      const reloadSelects = wb.selects;
      const nc = await H.newContext(browser);
      const w2 = watchRows(nc);
      const t1 = Date.now();
      const nb = await H.newUser(browser, env, 'sara@test.local', { context: nc });
      pages.push(nb.page);
      await until(nb.page, 'shelf on a new phone', (u) => window.A.S.shelf && Object.keys((window.A.S.shelf.get(u) || {}).items || {}).length === 2999, A, 60000);
      timings.newPhone = Date.now() - t1;
      const lc = await countOf(nb.page, Lid);
      assert(lc === 200, "Laila's shelf on the new phone: " + lc);
      await T(500);
      assert(w2.selects >= 4, 'expected ≥ 4 pages (3,000+ rows at 1000 a page), got ' + w2.selects);
      await nb.context.close();
      pages.splice(pages.indexOf(nb.page), 1);
      return `catch-up after the live burst: ${catchUp} request(s); reload: ${timings.reloadB} ms, ${reloadSelects} shelf_books request(s) (it re-reads the 5 s before the newest row: here all 3,000 were written within 5 s); new phone: ${timings.newPhone} ms from opening the site to all 3,000 (incl. sign-in), ${w2.selects} pages`;
    }, ['edited']);

    await step('Cold start from the cache with the database unreachable still shows the shelves', async () => {
      await T(2000);
      await b.context().route('**/rest/v1/**', (r) => r.abort());
      await b.reload();
      await H.settled(b);
      await until(b, 'shelves from the cache', (ids) => window.A.S.shelf && Object.keys((window.A.S.shelf.get(ids[0]) || {}).items || {}).length === 2999 && Object.keys((window.A.S.shelf.get(ids[1]) || {}).items || {}).length === 200, [A, Lid]);
      await b.context().unroute('**/rest/v1/**');
      b.__errors.length = 0; // the blocked requests
    }, ['edited']);

    await step('Time to first «مكتبتي» with 3,000 books', async () => {
      await a.evaluate(() => window.A.V.go('home'));
      await T(500);
      const t0 = Date.now();
      await a.evaluate(() => window.A.V.go('shelf', { st: 'read' }));
      await a.waitForSelector('.shelf-list li, .shelf li, .sh-row', { timeout: 30000 });
      timings.firstShelf = Date.now() - t0;
      await H.shot(a, 'lib-3000');
      // and right after a cold start from the cache
      await T(2000);
      const t1 = Date.now();
      await a.reload();
      await H.settled(a);
      const t2 = Date.now();
      await a.evaluate(() => window.A.V.go('shelf', { st: 'read' }));
      await a.waitForSelector('.shelf-list li, .shelf li, .sh-row', { timeout: 30000 });
      timings.firstShelfCold = Date.now() - t2;
      timings.reloadA = t2 - t1;
      return `${timings.firstShelf} ms (warm), ${timings.firstShelfCold} ms right after a reload (app ready in ${timings.reloadA} ms)`;
    }, ['big']);
  } catch (e) {
    console.log('FATAL', e);
    results.push({ name: 'fatal', status: 'FAIL' });
  } finally {
    console.log('\n==== console / page errors ====');
    for (const p of pages) {
      const errs = (p.__errors || []).filter((x) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(x));
      if (errs.length) {
        console.log(`-- ${p.__email}: ${errs.length}`);
        for (const e of errs.slice(0, 10)) console.log('   ' + e.slice(0, 300));
      }
    }
    console.log('timings', JSON.stringify(timings));
    await browser.close().catch(() => {});
    await env.stop().catch(() => {});
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    const skip = results.filter((r) => r.status === 'SKIP').length;
    console.log(`==== ${pass} passed, ${fail} failed, ${skip} skipped`);
    process.exit(fail ? 1 : 0);
  }
})();
