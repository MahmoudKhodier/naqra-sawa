#!/usr/bin/env node
/*
 * «كتب بقراها لوحدي»: a member picks a PDF on the phone and reads it right away, just for themselves.
 * By default the file stays on the device (no upload, no storage request); the book's details, progress and
 * notes go to the member's private docs. Member A picks fixtures/arabic-40.pdf, reads a few pages (counted in
 * A's day), adds a note (forced private), reloads (it still opens from the device), opens the app in a second
 * browser (the same account: «الملف على جهاز تاني», a wrong file is refused, the same file is picked again),
 * finishes it (offered to the shelf) and deletes it (the device copy goes too). Member B in the same circle
 * sees nothing. Then the upload option: «احفظ نسخة على السيرفر…» puts the file in A's private folder, which B
 * cannot read, and deleting removes it from the server.
 *
 *   node tests/e2e/private.js        # PASS/FAIL per step, exit 1 on any FAIL
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
const OTHER = path.join(H.FIXTURES, 'english-12.pdf');
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ctx = {};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function step(name, fn, needs = []) {
  const missing = needs.filter((k) => ctx[k] === undefined);
  if (missing.length) {
    results.push('SKIP');
    return console.log(`SKIP  ${name}  (needs ${missing.join(', ')})`);
  }
  const t0 = Date.now();
  try {
    const d = await fn();
    results.push('PASS');
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)${d ? '  — ' + d : ''}`);
  } catch (e) {
    results.push('FAIL');
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
async function until(p, what, fn, arg, timeout = 15000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const closeSheets = async (p) => {
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
const readerReady = (p, what = 'reader open') => until(p, what, () => window.A.R.isOpen() && [...document.querySelectorAll('.pg canvas')].some((c) => c.width > 50), null, 30000);
/* What this browser keeps under 'lb:<id>' (the device copy) and whether it is in the evictable cache index. */
const deviceCopy = (p, id) =>
  p.evaluate(
    (id) =>
      new Promise((res) => {
        const r = indexedDB.open('qs-books', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('blobs');
        r.onsuccess = () => {
          const q = r.result.transaction('blobs').objectStore('blobs').get('lb:' + id);
          q.onsuccess = () => {
            const v = q.result;
            r.result.close();
            res({ bytes: v ? v.byteLength : 0, indexed: !!window.A.U.store.get('cacheIndex', {})['lb:' + id] });
          };
        };
      }),
    id
  );
/* Count requests to Supabase storage from this page from now on. */
const watchStorage = (p) => {
  const seen = [];
  p.on('request', (r) => /\/storage\/v1\//.test(r.url()) && seen.push(r.method() + ' ' + r.url()));
  return seen;
};

/* The circle's week recap shows by itself once a week (on Fridays this week's): marked as seen here, so it
   never covers what a step is about to tap. */
const noRecap = (p) =>
  p.evaluate(() => {
    const { U, S } = window.A;
    const ws = U.weekStart();
    U.store.set('circleRecap:' + S.me, U.parseD(U.today()).getDay() === 5 ? ws : U.addDays(ws, -7));
    if (window.A.Goals) window.A.Goals.off = true; // firsts celebrations have their own test (goals.js)
  });

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, a2;
  try {
    await step('A makes a circle; B joins it with the invite link', async () => {
      const A = await H.newUser(browser, env, 'priv-a@test.local', { viewport: { width: 390, height: 844 } });
      a = ctx.a = A.page;
      await a.fill('#cn-name', 'حلقة سرية');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'أمل');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      ctx.circle = await a.evaluate(() => window.A.P.circle().id);
      ctx.Auid = await a.evaluate(() => window.A.S.me);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [ctx.circle]))[0].invite_code;
      const B = await H.newUser(browser, env, 'priv-b@test.local', { url: env.siteUrl + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = ctx.b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'باسم');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      ctx.Buid = await b.evaluate(() => window.A.S.me);
      await until(a, 'A sees B', () => window.A.S.members.size === 2);
      for (const pg of [a, b]) await noRecap(pg);
      return `circle ${ctx.circle}`;
    });

    await step('«مكتبتي» shows «كتب بقراها لوحدي» on my own shelf only (the file stays on the phone), with the add in the ⋯ menu too', async () => {
      await a.click('[data-go="shelf"]');
      await a.waitForSelector('#mylib', { timeout: 8000 });
      const txt = await a.textContent('#mylib');
      assert(/لوحدي/.test(txt) && /محدش في الحلقة/.test(txt) && /موبايلك/.test(txt), 'the block does not explain who sees it and where the file is: ' + txt);
      await a.click('[data-act="shelf-more"]');
      await a.waitForSelector('.menu-sheet .mi', { timeout: 5000 });
      const items = await a.$$eval('.menu-sheet .mi', (els) => els.map((e) => e.textContent.trim()));
      assert(items.some((t) => /ليا أنا بس/.test(t)), 'no private add in the shelf ⋯ menu: ' + items.join(' | '));
      await closeSheets(a);
      await a.evaluate((u) => window.A.V.go('shelf', { uid: u }), ctx.Buid);
      await T(300);
      assert(!(await a.$('#mylib')), 'the private block shows on someone else\'s shelf');
      await a.evaluate(() => window.A.V.go('shelf'));
      await a.waitForSelector('#mylib');
      await H.shot(a, 'p01-shelf-empty');
      ctx.shelf = true;
    }, ['b']);

    await step('A picks arabic-40.pdf: no upload, no storage request, no plan; the reader opens right away from the device', async () => {
      const storage = watchStorage(a);
      await a.click('#mylib [data-act="my-add"]');
      const hints = await a.textContent('.sheet');
      assert(/موبايلك/.test(hints) && !/٢٠ ميجا/.test(hints), 'the pick step does not say the file stays on the phone: ' + hints);
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      assert(!(await a.$('#ab-upload')) && !(await a.$('input[name=ab-status]')), 'circle-only choices shown for a private book');
      const cloud = await a.$eval('#ab-cloud', (e) => ({ on: e.checked, off: e.disabled }));
      assert(!cloud.on && !cloud.off, 'the server copy switch should be there and off: ' + JSON.stringify(cloud));
      const form = await a.textContent('#ab-form');
      assert(/محدش في الحلقة/.test(form) && /موبايلك/.test(form) && /احفظ نسخة على السيرفر/.test(form), 'the form does not say who sees it / where the file is: ' + form);
      await H.shot(a, 'p02-add-form');
      await a.$eval('#ab-cloud', (e) => e.closest('.my-up').scrollIntoView({ block: 'center' }));
      await H.shot(a, 'p02-add-form-switch');
      await a.click('#ab-form button.btn.gold');
      await until(a, 'private book saved', () => window.A.S.myBooks.size === 1, null, 30000);
      await readerReady(a);
      assert(!(await a.$('#pl-form')), 'the reading-plan wizard opened for a private book');
      const bk = await a.evaluate(() => [...window.A.S.myBooks.values()][0]);
      ctx.book = bk;
      assert(bk.id.startsWith('my-') && bk.pages === 40 && Array.isArray(bk.parts) && !bk.parts.length && !bk.wirds && bk.fp && bk.bytes > 0, 'book doc: ' + JSON.stringify(Object.assign({}, bk, { cover: !!bk.cover })));
      const docs = await env.fake.sql(`select col from public.docs where circle_id = $1 and id = $2`, [ctx.circle, bk.id]);
      assert(docs.length === 1 && docs[0].col === `data/users/${ctx.Auid}/my/books`, 'stored where: ' + JSON.stringify(docs));
      const objs = await env.fake.sql(`select name from storage.objects where bucket_id = 'books'`);
      assert(!objs.length, 'something was uploaded: ' + JSON.stringify(objs));
      assert(!storage.length, 'storage requests: ' + storage.join(' | '));
      const copy = await deviceCopy(a, bk.id);
      assert(copy.bytes === bk.bytes && !copy.indexed, 'device copy: ' + JSON.stringify(copy));
      assert(await a.$('.rd-title .rd-lock'), 'the reader does not show the lock on a private book');
      return `${Math.round(bk.bytes / 1024)} KB on the device, 0 storage requests`;
    }, ['shelf']);

    await step('Reading counts for A\'s day (pages, streak) but nothing goes to the circle\'s progress or presence', async () => {
      const day0 = await a.evaluate(() => ((window.A.S.members.get(window.A.S.me) || {}).days || {})[window.A.U.today()] || 0);
      for (const pg of [1, 2, 3]) await a.evaluate((x) => window.A.R._markSeen(x), pg);
      await a.evaluate(() => window.A.R.flush());
      await until(a, 'pages in my day', (d0) => (((window.A.S.members.get(window.A.S.me) || {}).days || {})[window.A.U.today()] || 0) === d0 + 3, day0, 10000);
      const prog = await a.evaluate((id) => window.A.D.prog(id), ctx.book.id);
      assert(prog && prog.seen && prog.last === 3, 'my progress: ' + JSON.stringify(prog));
      const rows = await env.fake.sql(`select col, id from public.docs where circle_id = $1 and (data->>'b' = $2 or id like $3)`, [ctx.circle, ctx.book.id, ctx.book.id + '%']);
      assert(rows.length === 2 && rows.every((r) => r.col.startsWith(`data/users/${ctx.Auid}/`)), 'rows about the book outside my private tree: ' + JSON.stringify(rows));
      const s = await a.evaluate(() => window.A.G.of(window.A.S.me));
      assert(s.streak >= 1 && s.pages >= 3, 'streak/pages: ' + JSON.stringify({ streak: s.streak, pages: s.pages }));
      await until(b, 'B sees A online', (u) => window.A.S.peers.some((x) => x.by === u), ctx.Auid, 15000);
      const seen = await b.evaluate((u) => ({ now: window.A.D.readingNow().length, pres: window.A.S.peers.filter((x) => x.by === u).map((x) => x.presence) }), ctx.Auid);
      assert(seen.now === 0 && seen.pres.every((x) => !x.b), 'B sees A reading: ' + JSON.stringify(seen));
      return `+3 pages today, streak ${s.streak}`;
    }, ['book']);

    await step('A pins a note: the sheet says it is private, there is no «for the circle» choice, it is saved privately', async () => {
      await a.click('[data-tool="pin"]');
      const c = await a.evaluate(() => window.A.R.current().page);
      const box = await (await a.$(`.pg[data-p="${c}"] .pg-ov`)).boundingBox();
      await a.mouse.click(box.x + box.width * 0.6, box.y + Math.min(120, box.height / 3));
      await a.waitForSelector('.sheet-wrap.in #nk-text', { timeout: 5000 });
      assert(await a.$('.sheet .rd-onlyme'), 'no "only you" line in the note sheet');
      assert(!(await a.$('.sheet [data-vis]')), 'the sheet still offers «للحلقة كلها»');
      await H.shot(a, 'p03-note-sheet');
      await a.fill('#nk-text', 'ملاحظة سرية جدا');
      await a.click('.sheet [data-save]');
      await until(a, 'private note saved', (id) => Object.values((window.A.S.priv && window.A.S.priv.notes) || {}).some((n) => n.b === id && n.text === 'ملاحظة سرية جدا'), ctx.book.id, 10000);
      const shared = await env.fake.sql(`select id from public.docs where circle_id = $1 and col in ('notes', 'msgs') and data->>'b' = $2`, [ctx.circle, ctx.book.id]);
      assert(!shared.length, 'the note went to the shared notes: ' + JSON.stringify(shared));
      await closeSheets(a);
      const refused = await a.evaluate((id) => window.A.D.set('notes/x1', { b: id, text: 'x', by: window.A.S.me }).then(() => false, (e) => e.code), ctx.book.id);
      assert(refused === 'invalid_argument', 'a shared note on a private book was not refused: ' + refused);
      ctx.note = true;
    }, ['book']);

    await step('B sees nothing: not the book, the note, the progress or a hint on A\'s shelf', async () => {
      await T(1500);
      const st = await b.evaluate(async (a) => {
        const S = window.A.S;
        const docs = await window.A.P.sb().from('docs').select('col, id').like('col', `data/users/${a}%`);
        return {
          books: [...S.books.values()].map((x) => x.title),
          mine: S.myBooks.size,
          notes: [...S.notes.values()].length,
          prog: [...S.prog.values()].filter((p) => p.u === a).length,
          docs: (docs.data || []).length,
        };
      }, ctx.Auid);
      assert(!st.books.length && !st.mine && !st.notes && !st.prog && !st.docs, 'B state: ' + JSON.stringify(st));
      await b.evaluate((u) => window.A.V.go('shelf', { uid: u }), ctx.Auid);
      await T(400);
      assert(!(await b.$('#mylib')) && !(await b.textContent('#screen')).includes(ctx.book.title), 'B sees the private book on A\'s shelf');
      return JSON.stringify(st);
    }, ['note']);

    await step('The reader keeps circle things out of a private book: no portions, no «نقاش الكتاب»', async () => {
      await a.click('.rd [data-act="more"]').catch(async () => {
        await a.mouse.click(195, 420);
        await T(400);
        await a.click('.rd [data-act="more"]');
      });
      await a.waitForSelector('.menu-sheet .mi');
      const items = await a.$$eval('.menu-sheet .mi', (els) => els.map((e) => e.textContent.trim()));
      assert(!items.some((t) => /نقاش الكتاب/.test(t)), 'discussion offered: ' + items.join(' | '));
      await closeSheets(a);
      assert(await a.$eval('#rd-wprog', (e) => e.hidden), 'a portion bar shows');
    }, ['book']);

    await step('After a reload the book still opens from the device, where A stopped, with no storage request', async () => {
      await a.evaluate(() => window.A.R.isOpen() && window.A.R.close(true));
      await T(500);
      await a.reload({ waitUntil: 'load' });
      await a.waitForSelector('.shell #screen', { timeout: 20000 });
      await noRecap(a);
      const storage = watchStorage(a);
      await a.evaluate(() => window.A.V.go('shelf'));
      await a.waitForSelector('#mylib .my-it [data-act="my-read"].btn', { timeout: 10000 });
      assert(!(await a.$('#mylib .my-it.away')), 'shown as «on another device» on the device that has it');
      await a.click('#mylib .my-it [data-act="my-read"].btn');
      await readerReady(a, 'reader open after reload');
      const at = await a.evaluate(() => window.A.R.current().page);
      assert(at === 3, 'opened at page ' + at);
      assert(!storage.length, 'storage requests: ' + storage.join(' | '));
      await a.evaluate(() => window.A.R.close(true));
      ctx.reload = true;
      return `opened at p. ${at}`;
    }, ['book']);

    await step('A on a second browser: «الملف على جهاز تاني», progress and note there; a wrong file is refused, the same file is picked again and opens', async () => {
      const A2 = await H.newUser(browser, env, 'priv-a@test.local', { viewport: { width: 390, height: 844 } });
      a2 = A2.page;
      await a2.waitForSelector('.shell #screen', { timeout: 20000 }).catch(async () => {
        await a2.click(`[data-circle="${ctx.circle}"]`).catch(() => {});
        await a2.waitForSelector('.shell #screen', { timeout: 15000 });
      });
      await noRecap(a2);
      await until(a2, 'my private book synced', (id) => window.A.S.myBooks.has(id) && !!window.A.D.prog(id), ctx.book.id, 15000);
      await a2.evaluate(() => window.A.V.go('shelf'));
      await a2.waitForSelector('#mylib .my-it.away', { timeout: 10000 });
      const txt = await a2.textContent('#mylib .my-it');
      assert(/الملف على جهاز تاني/.test(txt) && /اختار الملف تاني/.test(txt), 'row: ' + txt);
      assert(!(await a2.$('#mylib .my-it [data-act="my-read"].btn')), 'a read button while the file is elsewhere');
      const st = await a2.evaluate((id) => ({ last: window.A.D.prog(id).last, note: Object.values((window.A.S.priv && window.A.S.priv.notes) || {}).some((n) => n.b === id) }), ctx.book.id);
      assert(st.last === 3 && st.note, 'progress/note not synced: ' + JSON.stringify(st));
      await H.shot(a2, 'p04-file-elsewhere');
      // a different PDF (12 pages) is refused
      await a2.setInputFiles('#mylib input[data-repick]', OTHER);
      await a2.waitForSelector('.toast', { timeout: 8000 });
      assert(/نفس الملف/.test(await a2.textContent('.toast-wrap, body')), 'no "pick the same file" message');
      assert(!(await deviceCopy(a2, ctx.book.id)).bytes && (await a2.$('#mylib .my-it.away')), 'a wrong file was kept');
      // the same file: kept on this device and opened at the synced page
      const storage = watchStorage(a2);
      await a2.setInputFiles('#mylib input[data-repick]', PDF);
      await readerReady(a2, 'reader open on the second browser');
      const at = await a2.evaluate(() => window.A.R.current().page);
      const copy = await deviceCopy(a2, ctx.book.id);
      assert(copy.bytes === ctx.book.bytes && !copy.indexed, 'device copy: ' + JSON.stringify(copy));
      assert(at === 3 && !storage.length, `page ${at}, storage requests: ${storage.join(' | ')}`);
      await a2.evaluate(() => window.A.R.close(true));
      await a2.waitForSelector('#mylib .my-it [data-act="my-read"].btn', { timeout: 8000 });
      assert(!(await a2.$('#mylib .my-it.away')), 'still «on another device» after picking it');
      return `re-picked, opened at p. ${at}`;
    }, ['reload']);

    await step('Finishing it offers to put it on my shelf as read (title only)', async () => {
      // on a Friday the circle's week recap shows by itself first
      for (let i = 0; i < 3 && (await a.$('.sheet-wrap')); i++) await a.keyboard.press('Escape').then(() => T(300));
      await a.evaluate((id) => window.A.R.open(id), ctx.book.id);
      await readerReady(a);
      // the last page: pages further up may still be settling their heights, so go again until it is the current one
      for (let i = 0; i < 6 && (await a.evaluate(() => window.A.R.current().page)) !== 40; i++) {
        await a.evaluate(() => window.A.R.goTo(40));
        await T(800);
      }
      await a.click('.rd [data-act="browse-here"]').catch(() => {});
      await a.waitForSelector('#rd-prompt [data-act="book-done"]', { timeout: 8000 });
      await a.click('#rd-prompt [data-act="book-done"]');
      await a.waitForSelector('.sheet [data-save]', { timeout: 8000 });
      assert(/لوحدك/.test(await a.textContent('.sheet')), 'the offer does not say the file stays private');
      await a.click('.sheet [data-save]');
      await until(a, 'on my shelf', (t) => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).some((x) => x.title === t && x.status === 'read'), ctx.book.title, 10000);
      const prog = await a.evaluate((id) => window.A.D.prog(id), ctx.book.id);
      assert(prog.finished, 'not marked finished');
      const it = await a.evaluate((t) => Object.values(window.A.S.shelf.get(window.A.S.me).items).find((x) => x.title === t), ctx.book.title);
      assert(!it.together && !JSON.stringify(it).includes('my-'), 'the shelf item links the private book: ' + JSON.stringify(it));
      await closeSheets(a);
    }, ['book']);

    await step('A deletes it from «مكتبتي»: the device copy, the details, the progress and the note are gone', async () => {
      await a.evaluate(() => window.A.R.isOpen() && window.A.R.close(true));
      await a.evaluate(() => window.A.V.go('shelf'));
      await a.waitForSelector('#mylib [data-act="my-menu"]');
      await H.shot(a, 'p05-shelf-with-book');
      await a.click('#mylib [data-act="my-menu"]');
      await a.click('.menu-sheet .mi.danger');
      await a.waitForSelector('.sheet [data-yes]', { timeout: 5000 });
      assert(/الملف الأصلي/.test(await a.textContent('.sheet:has([data-yes])')), 'the confirm does not say the original file stays on the phone');
      await a.click('.sheet [data-yes]');
      await until(a, 'book gone', () => window.A.S.myBooks.size === 0 && window.A.S.myProg.size === 0, null, 10000);
      await until(a, 'note gone', (id) => !Object.values((window.A.S.priv && window.A.S.priv.notes) || {}).some((n) => n.b === id), ctx.book.id, 10000);
      let copy = 1;
      for (let i = 0; i < 50 && copy; i++) {
        copy = (await deviceCopy(a, ctx.book.id)).bytes; // removed right after the docs
        if (copy) await T(200);
      }
      assert(!copy, 'the device copy is still there');
      const live = await env.fake.sql(`select col, id from public.docs where circle_id = $1 and not deleted and col like 'data/users/%/my/%'`, [ctx.circle]);
      assert(!live.length, 'rows left: ' + JSON.stringify(live));
      const days = await a.evaluate(() => ((window.A.S.members.get(window.A.S.me) || {}).days || {})[window.A.U.today()] || 0);
      assert(days >= 3, 'the pages read stopped counting');
      assert(!(await a.$('#mylib .my-it')), 'still listed');
      await until(a2, 'gone on the second browser too', () => window.A.S.myBooks.size === 0, null, 15000);
    }, ['book']);

    await step('Option «احفظ نسخة على السيرفر»: the file goes to my private folder, B cannot read it, deleting removes it', async () => {
      await T(600);
      await closeSheets(a); // a «first book finished» celebration may be up
      await a.click('#mylib [data-act="my-add"]');
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form label.my-up');
      assert(await a.$eval('#ab-cloud', (e) => e.checked), 'the switch did not turn on');
      await a.click('#ab-form button.btn.gold');
      await until(a, 'private book saved', () => window.A.S.myBooks.size === 1, null, 30000);
      await readerReady(a);
      const bk = await a.evaluate(() => [...window.A.S.myBooks.values()][0]);
      assert(bk.parts.length === 1 && bk.parts[0].id.startsWith(`${ctx.circle}/private/${ctx.Auid}/`), 'parts: ' + JSON.stringify(bk.parts));
      const objs = await env.fake.sql(`select name from storage.objects where bucket_id = 'books'`);
      assert(objs.length === 1 && objs[0].name === bk.parts[0].id, 'storage: ' + JSON.stringify(objs));
      const file = bk.parts[0].id;
      const tries = await b.evaluate(async (file) => {
        const sb = window.A.P.sb();
        const out = {};
        const sign = await sb.storage.from('books').createSignedUrl(file, 60);
        out.sign = !!sign.error && !(sign.data && sign.data.signedUrl);
        const dl = await sb.storage.from('books').download(file).catch((e) => ({ error: e }));
        out.download = !!dl.error;
        out.fetchAsset = await window.A.P.fetchAsset(file).then(() => 'got it', (e) => 'refused ' + (e.status || ''));
        const rm = await sb.storage.from('books').remove([file]);
        out.removed = (rm.data || []).length;
        const planted = await sb.storage.from('books').upload(file.replace(/[^/]+$/, 'planted.pdf'), new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        out.plant = !!planted.error;
        return out;
      }, file);
      assert(tries.sign && tries.download && /^refused/.test(tries.fetchAsset) && tries.removed === 0 && tries.plant, 'B got at the private file: ' + JSON.stringify(tries));
      // the second browser has no device copy but opens it from the server
      await until(a2, 'synced to the second browser', (id) => window.A.S.myBooks.has(id), bk.id, 15000);
      await a2.evaluate(() => window.A.V.go('shelf'));
      await a2.waitForSelector('#mylib .my-it [data-act="my-read"].btn', { timeout: 10000 });
      assert(!(await a2.$('#mylib .my-it.away')), 'an uploaded book shown as «on another device»');
      await a.evaluate(() => window.A.R.close(true));
      await a.evaluate(() => window.A.V.go('shelf'));
      await a.waitForSelector('#mylib [data-act="my-menu"]');
      await a.click('#mylib [data-act="my-menu"]');
      await a.click('.menu-sheet .mi.danger');
      await a.waitForSelector('.sheet [data-yes]', { timeout: 5000 });
      assert(/السيرفر/.test(await a.textContent('.sheet:has([data-yes])')), 'the confirm does not mention the server copy');
      await a.click('.sheet [data-yes]');
      await until(a, 'book gone', () => window.A.S.myBooks.size === 0, null, 10000);
      const left = await env.fake.sql(`select name from storage.objects where bucket_id = 'books'`);
      assert(!left.length, 'files left: ' + JSON.stringify(left));
      return JSON.stringify(tries);
    }, ['book']);

    for (const [n, p] of [['A', a], ['A (second browser)', a2], ['B', b]]) {
      if (!p) continue;
      const errs = p.__errors.filter((e) => !/favicon|404 \(Not Found\)|status of 40[03]/.test(e));
      await step(`No unexpected console errors (${n})`, async () => assert(!errs.length, errs.slice(0, 5).join('\n')));
    }
  } finally {
    await browser.close().catch(() => {});
    await env.stop().catch(() => {});
  }
  const fail = results.filter((r) => r !== 'PASS').length;
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
})();
