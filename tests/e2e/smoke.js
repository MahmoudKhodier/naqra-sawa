#!/usr/bin/env node
/*
 * End-to-end smoke test through the REAL UI against the fake Supabase
 * (real Postgres 16 + the project's migration and RLS).
 *
 *   npm ci --prefix tests/fake-supabase   # once: pg + ws for the fake server
 *   node tests/e2e/smoke.js               # PASS/FAIL per step, exit 1 on any FAIL (~50 s)
 *   HEADED=1 SLOWMO=200 node tests/e2e/smoke.js
 *
 * Needs Node 22, PostgreSQL 16 binaries (PG_BIN, default /usr/lib/postgresql/16/bin) and Playwright
 * (local or global). As root, Postgres runs as the `postgres` OS user (PG_OS_USER to change).
 *
 * Users: A (owner, desktop), B (invited, phone, dark mode), C (outsider).
 * Screenshots go to tests/e2e/shots/.
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
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}
const { chromium } = loadPlaywright();
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');

const results = [];
const ctx = {}; // values shared between steps
const T = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn, needs = []) {
  const missing = needs.filter((k) => ctx[k] === undefined);
  if (missing.length) {
    results.push({ name, status: 'SKIP', detail: 'needs ' + missing.join(', ') });
    console.log(`SKIP  ${name}  (needs ${missing.join(', ')})`);
    return;
  }
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', ms: Date.now() - t0, detail });
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)${detail ? '  — ' + detail : ''}`);
  } catch (e) {
    results.push({ name, status: 'FAIL', ms: Date.now() - t0, detail: String((e && e.message) || e).split('\n').slice(0, 6).join('\n') });
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
/** page.waitForFunction with a readable error. */
async function until(page, what, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error(`timed out waiting for: ${what}`);
  }
}
const mark = (page) => page.evaluate(() => (window.__noReload = Math.random()));
const notReloaded = async (page, m) => assert((await page.evaluate(() => window.__noReload)) === m, 'page was reloaded (expected a live update)');
const appState = (page) =>
  page.evaluate(() => {
    const S = window.A.S;
    return { me: S.me, circle: window.A.P.circle && window.A.P.circle(), members: [...S.members.keys()], books: [...S.books.values()], notes: [...S.notes.values()], prog: [...S.prog.values()] };
  });

(async () => {
  const t0 = Date.now();
  const env = await H.start();
  console.log(`env: site ${env.siteUrl}  fake ${env.fakeUrl}  (booted in ${Date.now() - t0} ms)\n`);
  const browser = await chromium.launch(process.env.HEADED ? { headless: false, slowMo: +process.env.SLOWMO || 0 } : {});
  const pages = {};
  fs.rmSync(H.SHOTS, { recursive: true, force: true });
  try {
    /* ---------------- A: sign in, create circle, onboarding ---------------- */
    await step('A signs in with the email code', async () => {
      const A = await H.newUser(browser, env, 'ahmed@test.local', { viewport: { width: 1280, height: 860 } });
      pages.A = A.page;
      ctx.A = A;
      await A.page.waitForSelector('#cn-name', { timeout: 10000 });
      const otp = env.fake.otpLog.filter((o) => o.email === 'ahmed@test.local');
      assert(otp.length === 1, 'expected one OTP request, got ' + otp.length);
      return 'circles screen shown';
    });

    await step('A creates a circle', async () => {
      const p = pages.A;
      await p.fill('#cn-name', 'حلقة الاختبار');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      ctx.circleId = await p.evaluate(() => window.A.P.circle().id);
      const rows = await env.fake.sql('select role from public.circle_members where circle_id = $1', [ctx.circleId]);
      assert(rows.length === 1 && rows[0].role === 'owner', 'owner membership row missing');
      return 'circle ' + ctx.circleId;
    }, ['A']);

    await step('A picks a name (onboarding) and reaches home', async () => {
      const p = pages.A;
      await p.fill('#join-name', 'أحمد');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      ctx.Auid = await p.evaluate(() => window.A.S.me);
      const prof = await env.fake.sql('select data from public.profiles where user_id = $1', [ctx.Auid]);
      assert(prof[0] && prof[0].data.nick === 'أحمد', 'profile row not saved');
      await H.shot(p, '01-A-home');
    }, ['circleId']);

    await step('A opens Circle → invite sheet and reads the invite link', async () => {
      const p = pages.A;
      await p.click('[data-go="circle"]');
      await p.click('[data-act="invite"]');
      await p.waitForSelector('#inv-url', { timeout: 10000 });
      const link = (await p.textContent('#inv-url')).trim();
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [ctx.circleId]))[0].invite_code;
      assert(link.endsWith('#join-' + code), `link ${link} does not carry invite code ${code}`);
      ctx.invite = link;
      await H.shot(p, '02-A-invite');
      await p.keyboard.press('Escape');
      return link;
    }, ['Auid']);

    /* ---------------- B: invite link → sign in → join → name ---------------- */
    await step('B opens the invite link, signs in and lands in A’s circle', async () => {
      const B = await H.newUser(browser, env, 'basma@test.local', { url: ctx.invite, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      pages.B = B.page;
      ctx.B = B;
      await B.page.waitForSelector('#join-name', { timeout: 20000 });
      const cid = await B.page.evaluate(() => window.A.P.circle().id);
      assert(cid === ctx.circleId, `B is in ${cid}, expected ${ctx.circleId}`);
      const eyebrow = await B.page.textContent('.ob-card .eyebrow');
      assert(/حلقة الاختبار/.test(eyebrow), 'onboarding does not show the circle name: ' + eyebrow);
    }, ['invite']);

    await step('B sets a name; A sees B join live (no reload)', async () => {
      const mA = await mark(pages.A);
      const p = pages.B;
      await p.fill('#join-name', 'بسمة');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      ctx.Buid = await p.evaluate(() => window.A.S.me);
      await until(pages.A, 'A sees 2 members incl. B’s name', (b) => window.A.S.members.size === 2 && window.A.D.name(b) === 'بسمة', ctx.Buid);
      await notReloaded(pages.A, mA);
      await H.shot(p, '03-B-home');
    }, ['B']);

    /* ---------------- A adds a book + plan; B sees it live ---------------- */
    await step('A adds a book (upload arabic-40.pdf) and saves a plan', async () => {
      const p = pages.A;
      const mB = await mark(pages.B);
      ctx.mB = mB;
      await p.click('[data-go="home"]');
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await H.shot(p, '04-A-plan');
      await p.click('#pl-form button.btn.gold');
      await until(p, 'book with a plan in A’s state', () => [...window.A.S.books.values()].some((b) => (b.wirds || []).length > 0), null, 20000);
      const b = (await appState(p)).books[0];
      ctx.bookId = b.id;
      ctx.book = b;
      assert(b.pages === 40, 'expected 40 pages, got ' + b.pages);
      assert((b.parts || []).length === 1, 'expected one uploaded part');
      const objs = await env.fake.sql(`select name, metadata->>'size' as size from storage.objects where bucket_id = 'books'`);
      assert(objs.length === 1 && objs[0].name === b.parts[0].id && objs[0].name.startsWith(ctx.circleId + '/'), 'storage object missing/misnamed: ' + JSON.stringify(objs));
      return `${b.id}: ${b.wirds.length} portions, file ${objs[0].size} bytes`;
    }, ['Buid']);

    await step('B sees the new book appear live without reload', async () => {
      const p = pages.B;
      await until(p, 'book card on B’s home', (id) => window.A.S.books.has(id) && (window.A.S.books.get(id).wirds || []).length > 0 && !!document.querySelector('.wcard [data-act="read"]'), ctx.bookId);
      await notReloaded(p, ctx.mB);
      await H.shot(p, '05-B-book-live');
    }, ['bookId']);

    await step('B opens the book: PDF fetched through a signed URL and pages render', async () => {
      const p = pages.B;
      const signed = [];
      p.on('request', (r) => /\/storage\/v1\/object\/sign\//.test(r.url()) && signed.push(r.method() + ' ' + r.url().split('?')[0]));
      await p.click('.wcard [data-act="read"]');
      await p.waitForSelector('#reader:not([hidden]) .pg[data-p="1"] canvas', { timeout: 30000 });
      await until(p, 'page 1 canvas painted', () => {
        const c = document.querySelector('.pg[data-p="1"] canvas');
        return c && c.width > 50 && c.height > 50;
      }, null, 30000);
      const n = await p.$$eval('.pg canvas', (cs) => cs.filter((c) => c.width > 0).length);
      assert(signed.some((s) => s.startsWith('POST')) && signed.some((s) => s.startsWith('GET')), 'no signed URL round trip: ' + JSON.stringify(signed));
      await H.shot(p, '06-B-reader');
      // presence: A sees B reading this book right now
      await until(pages.A, 'A sees B “reading now” (presence)', ([b, u]) => window.A.D.readingNow(b).some((x) => x.uid === u), [ctx.bookId, ctx.Buid], 10000);
      return `${n} canvases rendered; A sees B reading now`;
    }, ['bookId']);

    await step('B highlights a passage on page 1 with a comment', async () => {
      const p = pages.B;
      await p.click('#reader [data-tool="hl"]');
      const ov = p.locator('.pg[data-p="1"] .pg-ov');
      await ov.scrollIntoViewIfNeeded();
      const bb = await ov.boundingBox();
      await p.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.2);
      await p.mouse.down();
      await p.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.25, { steps: 5 });
      await p.mouse.move(bb.x + bb.width * 0.75, bb.y + bb.height * 0.3, { steps: 5 });
      await p.mouse.up();
      await p.waitForSelector('#nk-text', { timeout: 10000 });
      await p.fill('#nk-text', 'جملة تستاهل نقف عندها');
      await H.shot(p, '07-B-compose');
      await p.click('.sheet [data-save]');
      await until(p, 'note saved in B’s state', () => [...window.A.S.notes.values()].some((n) => n.kind === 'hl'));
      const n = (await appState(p)).notes[0];
      ctx.noteId = n.id;
      const row = await env.fake.sql(`select data->>'kind' as kind, data->>'by' as by, updated_by::text from public.docs where circle_id = $1 and col = 'notes' and id = $2`, [ctx.circleId, n.id]);
      assert(row[0] && row[0].kind === 'hl' && row[0].by === ctx.Buid && row[0].updated_by === ctx.Buid, 'note row not in docs: ' + JSON.stringify(row));
      await T(400);
      await H.shot(p, '08-B-highlight');
      return 'note ' + n.id;
    }, ['bookId']);

    await step('A sees B’s highlight in the home feed live', async () => {
      const p = pages.A;
      const m = await mark(p);
      await p.click('[data-go="home"]');
      await until(p, 'note card in A’s feed', (id) => window.A.S.notes.has(id) && !!document.querySelector(`.feed .ncard [data-act="like"][data-nid="${id}"]`), ctx.noteId);
      const txt = await p.textContent('.feed .ncard');
      assert(/بسمة/.test(txt) && /جملة تستاهل/.test(txt), 'feed card lacks author/text: ' + txt.slice(0, 120));
      await notReloaded(p, m);
      await H.shot(p, '09-A-feed');
    }, ['noteId']);

    await step('A likes the highlight; B sees the like live', async () => {
      const p = pages.A;
      const mB = await mark(pages.B);
      await p.click(`.feed .ncard [data-act="like"][data-nid="${ctx.noteId}"]`);
      await until(p, 'like stored in A’s state', ([id, a]) => !!((window.A.S.notes.get(id).likes || {})[a]), [ctx.noteId, ctx.Auid]);
      await until(pages.B, 'B sees A’s like', ([id, a]) => !!(((window.A.S.notes.get(id) || {}).likes || {})[a]), [ctx.noteId, ctx.Auid]);
      const likeTxt = (await p.textContent(`.feed .ncard [data-act="like"][data-nid="${ctx.noteId}"]`)).trim();
      assert(/[1١]/.test(likeTxt), 'like count not shown as 1: ' + likeTxt);
      const row = await env.fake.sql(`select data->'likes' as likes from public.docs where circle_id = $1 and col = 'notes' and id = $2`, [ctx.circleId, ctx.noteId]);
      assert(row[0].likes && row[0].likes[ctx.Auid], 'like not in DB');
      await notReloaded(pages.B, mB);
    }, ['noteId']);

    await step('B marks the first portion (wird) done; A sees it in the feed', async () => {
      const p = pages.B;
      await p.click('#reader [data-act="close"]');
      await p.waitForSelector('.wcard [data-act="mark-wird"]', { timeout: 10000 });
      await p.click('.wcard [data-act="mark-wird"]');
      await until(p, 'B’s progress has w1 done', (b) => {
        const pr = window.A.D.prog(b);
        return !!(pr && pr.done && pr.done.w1);
      }, ctx.bookId);
      await T(300);
      await H.shot(p, '10-B-wird-done');
      await p.keyboard.press('Escape');
      await until(pages.A, 'A sees B’s done mark', ([b, u]) => {
        const pr = window.A.D.prog(b, u);
        return !!(pr && pr.done && pr.done.w1) && /الورد|portion/i.test((document.querySelector('.feed') || {}).textContent || '');
      }, [ctx.bookId, ctx.Buid]);
      ctx.wirdDone = true;
    }, ['bookId']);

    /* ---------------- C: an outsider ---------------- */
    await step('C (outsider) signs in and creates an own circle', async () => {
      const C = await H.newUser(browser, env, 'carim@test.local', { viewport: { width: 390, height: 844 } });
      pages.C = C.page;
      await C.page.waitForSelector('#cn-name', { timeout: 10000 });
      const txt = await C.page.textContent('.circles-pick');
      assert(!/حلقة الاختبار/.test(txt), 'C sees A’s circle in the circles list');
      await C.page.fill('#cn-name', 'حلقة كريم');
      await C.page.click('#circle-new button');
      await C.page.waitForSelector('#join-name', { timeout: 20000 });
      await C.page.fill('#join-name', 'كريم');
      await C.page.click('#join-form button[type=submit]');
      await C.page.waitForSelector('.shell #screen .home', { timeout: 15000 });
      const st = await appState(C.page);
      ctx.Cuid = st.me;
      assert(st.circle.id !== ctx.circleId, 'C ended up in A’s circle');
      assert(st.books.length === 0 && st.notes.length === 0, 'C sees books/notes');
      assert(st.members.length === 1, 'C sees other members: ' + st.members.length);
      await H.shot(C.page, '11-C-home');
    }, ['circleId']);

    await step('C cannot read or write A’s circle through the API (RLS)', async () => {
      const r = await pages.C.evaluate(async ({ circle, book, file, A, B }) => {
        const sb = window.A.P.sb();
        const out = {};
        out.circles = (await sb.from('circles').select('id').eq('id', circle)).data;
        out.members = (await sb.from('circle_members').select('user_id').eq('circle_id', circle)).data;
        out.docs = (await sb.from('docs').select('id').eq('circle_id', circle)).data;
        out.profiles = (await sb.from('profiles').select('user_id').in('user_id', [A, B])).data;
        out.shelves = (await sb.from('shelves').select('user_id').in('user_id', [A, B])).data;
        out.upsert = (await sb.from('docs').upsert({ circle_id: circle, col: 'books', id: 'evil', data: { title: 'x' }, deleted: false }).select('id').single()).error;
        out.merge = (await sb.rpc('doc_merge', { p_circle: circle, p_col: 'books', p_id: book, p_patch: { title: 'hacked' } })).error;
        out.rename = await sb.from('circles').update({ name: 'hacked' }).eq('id', circle).select('id');
        out.reset = (await sb.rpc('reset_invite_code', { p_circle: circle })).error;
        out.remove = (await sb.rpc('remove_member', { p_circle: circle, p_user: B })).error;
        out.bytes = (await sb.rpc('circle_storage_bytes', { p_circle: circle })).error;
        out.sign = (await sb.storage.from('books').createSignedUrl(file, 60)).error;
        out.upload = (await sb.storage.from('books').upload(circle + '/evil.pdf', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { contentType: 'application/pdf' })).error;
        out.rm = (await sb.storage.from('books').remove([file])).data;
        out.joinBad = (await sb.rpc('join_circle', { p_code: '000000000000' })).error;
        return JSON.parse(JSON.stringify(out, (k, v) => (v instanceof Error ? { message: v.message, statusCode: v.statusCode } : v)));
      }, { circle: ctx.circleId, book: ctx.bookId, file: ctx.book.parts[0].id, A: ctx.Auid, B: ctx.Buid });
      const bad = [];
      for (const k of ['circles', 'members', 'docs', 'profiles', 'shelves']) if (!Array.isArray(r[k]) || r[k].length) bad.push(`${k} visible: ${JSON.stringify(r[k])}`);
      if (!r.upsert || r.upsert.code !== '42501') bad.push('docs upsert not refused: ' + JSON.stringify(r.upsert));
      if (!r.merge || r.merge.code !== 'P0002') bad.push('doc_merge not refused: ' + JSON.stringify(r.merge));
      if (r.rename.error || (r.rename.data || []).length) bad.push('circle rename affected rows: ' + JSON.stringify(r.rename));
      for (const k of ['reset', 'remove', 'bytes']) if (!r[k] || r[k].code !== '42501') bad.push(`${k} not refused with 42501: ${JSON.stringify(r[k])}`);
      if (!r.sign) bad.push('signed URL issued for A’s file');
      if (!r.upload || r.upload.statusCode !== '403') bad.push('upload into A’s folder not refused: ' + JSON.stringify(r.upload));
      if (!Array.isArray(r.rm) || r.rm.length) bad.push('remove of A’s file returned ' + JSON.stringify(r.rm));
      if (!r.joinBad || r.joinBad.code !== 'P0002') bad.push('bad invite code not P0002: ' + JSON.stringify(r.joinBad));
      const still = await env.fake.sql(`select (select count(*) from storage.objects where bucket_id = 'books')::int as files, (select name from public.circles where id = $1) as name, (select data->>'title' from public.docs where circle_id = $1 and id = $2) as title`, [ctx.circleId, ctx.bookId]);
      if (still[0].files !== 1 || still[0].name !== 'حلقة الاختبار' || still[0].title !== ctx.book.title) bad.push('A’s data changed: ' + JSON.stringify(still[0]));
      assert(!bad.length, bad.join('\n'));
      return '15 probes refused';
    }, ['Cuid', 'bookId']);

    await step('C receives no realtime changes from A’s circle; B does', async () => {
      await pages.C.evaluate((circle) => {
        const sb = window.A.P.sb();
        window.__probe = [];
        window.__probeCh = sb
          .channel('probe-' + Date.now())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'circle_id=eq.' + circle }, (p) => window.__probe.push(['docs', p.eventType]))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => window.__probe.push(['profiles', p.new && p.new.user_id]))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, (p) => window.__probe.push(['circle_members', p.eventType]))
          .subscribe((s) => (window.__probeStatus = s));
      }, ctx.circleId);
      await until(pages.C, 'probe channel subscribed', () => window.__probeStatus === 'SUBSCRIBED');
      await pages.A.evaluate(() => window.A.D.set('probe/p1', { at: new Date().toISOString() }));
      await pages.A.evaluate(() => window.A.D.updateMe(() => ({ probe: 1 })));
      // positive control: the member B gets it live through the app's own subscription
      const t1 = Date.now();
      for (;;) {
        const n = await pages.B.evaluate(async () => (await (await window.claude.use('db')).collection('probe').get()).size);
        if (n === 1) break;
        if (Date.now() - t1 > 10000) throw new Error('B (member) did not receive the probe doc live');
        await T(150);
      }
      await T(1500);
      const got = await pages.C.evaluate(() => window.__probe);
      const bSaw = await env.fake.sql(`select 1 from public.docs where circle_id = $1 and col = 'probe'`, [ctx.circleId]);
      assert(bSaw.length === 1, 'probe doc was not written');
      assert(got.length === 0, 'C received events from A’s circle: ' + JSON.stringify(got));
      await pages.C.evaluate(() => window.__probeCh.unsubscribe());
      return 'C got 0 events';
    }, ['Cuid']);

    await step('Presence channel of A’s circle is not readable by C', async () => {
      // C knows A's circle id (e.g. a removed member, or from a shared signed URL path) and joins its
      // presence room both ways: as a public channel (what the app uses today) and as a private one.
      const seen = await pages.C.evaluate(async (circle) => {
        const sb = window.A.P.sb();
        const probe = async (priv) => {
          const ch = sb.channel('room-' + circle, { config: { private: priv, presence: { key: 'spy' } } });
          const status = await new Promise((res) => {
            ch.on('presence', { event: 'sync' }, () => {});
            ch.subscribe((s, e) => (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR') && res(s + (e ? ': ' + e.message : '')));
            setTimeout(() => res('TIMED_OUT'), 5000);
          });
          await new Promise((r) => setTimeout(r, 800));
          const st = ch.presenceState();
          await ch.unsubscribe();
          return { status, keys: Object.entries(st).filter(([k]) => k !== 'spy').map(([k, v]) => k + '=' + JSON.stringify(v.map(({ presence_ref, ...m }) => m))) };
        };
        return { public: await probe(false), private: await probe(true) };
      }, ctx.circleId);
      const leaks = [];
      if (seen.public.keys.length) leaks.push('public join (anon key is enough): ' + seen.public.keys.join('; '));
      if (seen.private.keys.length) leaks.push('private join: ' + seen.private.keys.join('; '));
      assert(!leaks.length, 'C (not a member) read the members’ presence in room-<A’s circle> via ' + leaks.join(' | '));
      return `public: ${seen.public.status}, private: ${seen.private.status}`;
    }, ['Cuid']);

    await step('Covers: A uploads a cover photo (public URL works without auth); C cannot write to A’s folder', async () => {
      const url = await pages.A.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 60;
        c.height = 90;
        c.getContext('2d').fillRect(0, 0, 60, 90);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
        return window.A.P.uploadCover(blob);
      });
      assert(/\/storage\/v1\/object\/public\/covers\//.test(url) && url.includes(ctx.Auid + '/'), 'unexpected cover URL ' + url);
      const r = await fetch(url);
      assert(r.status === 200 && /image\/jpeg/.test(r.headers.get('content-type') || ''), 'public cover not served: ' + r.status);
      const err = await pages.C.evaluate(async (A) => {
        const { error } = await window.A.P.sb().storage.from('covers').upload(A + '/evil.jpg', new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
        return error && error.statusCode;
      }, ctx.Auid);
      assert(err === '403', 'C could upload into A’s covers folder: ' + err);
      return url.replace(env.fakeUrl, '');
    }, ['Cuid']);

    /* ---------------- persistence, offline start, delta sync ---------------- */
    await step('B reloads: book, highlight, like and wird mark persist', async () => {
      const p = pages.B;
      await T(2000); // the IndexedDB cache write is debounced 1.5 s
      const cache = await p.evaluate((C) => new Promise((res) => {
        const r = indexedDB.open('qs-sync', 1);
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get('sync:' + C);
          g.onsuccess = () => res(g.result ? { docs: g.result.docs.length, since: g.result.since } : null);
          g.onerror = () => res(null);
        };
        r.onerror = () => res(null);
      }), ctx.circleId);
      assert(cache && cache.docs >= 3, 'IndexedDB cache missing or empty: ' + JSON.stringify(cache));
      await p.reload();
      await p.waitForSelector('.shell #screen .home', { timeout: 20000 });
      await until(p, 'state after reload', ([b, n, a]) => {
        const S = window.A.S;
        const pr = window.A.D.prog(b);
        return S.books.has(b) && S.notes.has(n) && !!(S.notes.get(n).likes || {})[a] && !!(pr && pr.done && pr.done.w1);
      }, [ctx.bookId, ctx.noteId, ctx.Auid]);
      await H.shot(p, '12-B-after-reload');
      return `cache had ${cache.docs} docs, since ${cache.since}`;
    }, ['wirdDone']);

    await step('B starts offline from the IndexedDB cache (REST blocked)', async () => {
      const p = pages.B;
      await ctx.B.context.route(/\/rest\/v1\//, (r) => r.abort('internetdisconnected'));
      try {
        await p.reload();
        await p.waitForSelector('.shell #screen .home', { timeout: 20000 });
        await until(p, 'cached book shown offline', (b) => window.A.S.books.has(b) && !!document.querySelector('.wcard'), ctx.bookId);
        await H.shot(p, '13-B-offline');
      } finally {
        await ctx.B.context.unroute(/\/rest\/v1\//);
      }
      await p.reload();
      await p.waitForSelector('.shell #screen .home', { timeout: 20000 });
    }, ['wirdDone']);

    await step('B starts offline after the access token expired (as after >1 h away)', async () => {
      const p = pages.B;
      const ctxB = ctx.B.context;
      // supabase-js retries the refresh for 30 s before giving up; the fake does the same, shortened to 3 s here
      await ctxB.addInitScript(() => {
        if (sessionStorage.getItem('__fastRefresh')) window.__fakeSbRefreshWindowMs = 3000;
      });
      await p.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('qs-auth'));
        s.expires_at = Math.floor(Date.now() / 1000) - 60;
        localStorage.setItem('qs-auth', JSON.stringify(s));
        sessionStorage.setItem('__fastRefresh', '1');
      });
      await ctxB.route(/\/(rest|auth)\/v1\//, (r) => r.abort('internetdisconnected'));
      let outcome;
      const t1 = Date.now();
      try {
        await p.reload();
        await p.waitForFunction(() => document.querySelector('.shell #screen .home') || document.querySelector('#auth-mail'), null, { timeout: 40000 });
        outcome = (await p.$('#auth-mail')) ? 'sign-in screen' : 'cached app';
        await H.shot(p, '13b-B-offline-expired');
      } finally {
        await ctxB.unroute(/\/(rest|auth)\/v1\//);
        await p.evaluate(() => sessionStorage.removeItem('__fastRefresh'));
      }
      const secs = ((Date.now() - t1) / 1000).toFixed(1);
      await p.reload();
      await p.waitForSelector('.shell #screen .home', { timeout: 20000 }); // back online: the expired session refreshes fine
      assert(outcome === 'cached app', `offline start with an expired access token showed the ${outcome} after ${secs} s (with real supabase-js: after ~30 s of refresh retries) instead of the cached circle`);
      return `cached app after ${secs} s`;
    }, ['wirdDone']);

    await step('Slow network (2.5 s per REST call): the cached circle paints before the network answers', async () => {
      const p = pages.B;
      const ctxB = ctx.B.context;
      await T(1600);
      const slow = async (r) => {
        await T(2500);
        r.continue().catch(() => {});
      };
      await ctxB.route(/\/rest\/v1\//, slow);
      let ms;
      try {
        const t1 = Date.now();
        await p.reload();
        await p.waitForSelector('.shell .wcard', { timeout: 30000 });
        ms = Date.now() - t1;
      } finally {
        await ctxB.unroute(/\/rest\/v1\//, slow);
      }
      await p.waitForSelector('.shell #screen .home', { timeout: 20000 });
      assert(ms < 2000, `first paint took ${(ms / 1000).toFixed(1)} s although everything was cached: boot waits for myCircles, then fetchCircle + fetchPeople (2 sequential calls) + deltaSync before rendering`);
      return `${ms} ms`;
    }, ['wirdDone']);

    await step('Delta sync: B closed, A writes, B reopens and gets only newer rows', async () => {
      const ctxB = ctx.B.context;
      await T(1800);
      await pages.B.close();
      await pages.A.evaluate((id) => window.A.D.update('books/' + id, { author: 'مؤلف مجهول' }), ctx.bookId);
      await pages.A.click(`.feed .ncard [data-act="like"][data-nid="${ctx.noteId}"]`); // unlike
      await until(pages.A, 'unlike applied', ([id, a]) => !(window.A.S.notes.get(id).likes || {})[a], [ctx.noteId, ctx.Auid]);
      const before = env.fake.queries.length;
      const p = H.attachErrors(await ctxB.newPage());
      pages.B = p;
      await p.goto(env.siteUrl);
      await p.waitForSelector('.shell #screen .home', { timeout: 20000 });
      await until(p, 'B has A’s offline edits', ([b, n, a]) => {
        const S = window.A.S;
        return (S.books.get(b) || {}).author === 'مؤلف مجهول' && !((S.notes.get(n) || {}).likes || {})[a];
      }, [ctx.bookId, ctx.noteId, ctx.Auid]);
      const q = env.fake.queries.slice(before).filter((x) => x.kind === 'rest' && x.table === 'docs' && x.uid === ctx.Buid && x.method === 'select');
      assert(q.length >= 1, 'no docs query from B');
      const cur = (q[0].filters || []).find((f) => f.column === 'updated_at');
      assert(cur && /^gte?$/.test(cur.op) && cur.value > '2000', 'first docs query was not a delta (cursor ' + JSON.stringify(cur) + ')');
      return `cursor ${cur.op} ${cur.value}`;
    }, ['wirdDone']);

    await step('Realtime reconnect: sockets dropped, B resubscribes and still gets live updates', async () => {
      env.fake.kickRealtime();
      await T(2500);
      await pages.A.evaluate((id) => window.A.D.update('books/' + id, { author: 'بعد إعادة الاتصال' }), ctx.bookId);
      await until(pages.B, 'B sees post-reconnect update', (b) => (window.A.S.books.get(b) || {}).author === 'بعد إعادة الاتصال', ctx.bookId, 15000);
    }, ['wirdDone']);

    const memberMenu = async (page, uid, re) => {
      await page.click('[data-go="circle"]');
      await page.click(`[data-act="member-menu"][data-uid="${uid}"]`);
      const item = page.locator('.menu-sheet .mi', { hasText: re });
      await item.first().click();
    };

    await step('A makes B an admin; B gets admin rights live (Edit button, no reload)', async () => {
      const mB = await mark(pages.B);
      await memberMenu(pages.A, ctx.Buid, /خلّيه مشرف|Make admin/);
      await until(pages.A, 'A sees B as admin', (u) => window.A.P.role(u) === 'admin', ctx.Buid);
      const db = await env.fake.sql('select role from public.circle_members where circle_id = $1 and user_id = $2', [ctx.circleId, ctx.Buid]);
      assert(db[0].role === 'admin', 'role not admin in DB');
      await until(pages.B, 'B’s platform knows it is admin', () => window.A.P.role() === 'admin');
      await pages.B.click('[data-go="circle"]');
      let live = true;
      try {
        await pages.B.waitForSelector('[data-act="edit-circle"]', { timeout: 4000 });
      } catch (e) {
        live = false;
      }
      const flags = await pages.B.evaluate(() => ({ canEdit: window.A.S.canEdit, isOwner: window.A.S.isOwner, role: window.A.P.role() }));
      await notReloaded(pages.B, mB);
      ctx.promoted = true;
      if (!live) {
        await pages.B.reload();
        await pages.B.waitForSelector('.shell', { timeout: 20000 });
        await pages.B.click('[data-go="circle"]');
        await pages.B.waitForSelector('[data-act="edit-circle"]', { timeout: 10000 });
      }
      assert(live, `B is admin (P.role()=${flags.role}) but S.canEdit=${flags.canEdit}: no Edit button until a reload`);
    }, ['wirdDone']);

    await step('B (admin) renames the circle; A sees the new name live', async () => {
      const mA = await mark(pages.A);
      await pages.B.click('[data-act="edit-circle"]');
      await pages.B.fill('#ec-name', 'حلقة القراءة الكبيرة');
      await pages.B.click('#ec-form button');
      await until(pages.A, 'A sees the new circle name', () => window.A.P.circle().name === 'حلقة القراءة الكبيرة' && /حلقة القراءة الكبيرة/.test(document.body.textContent));
      const db = await env.fake.sql('select name, settings from public.circles where id = $1', [ctx.circleId]);
      assert(db[0].name === 'حلقة القراءة الكبيرة', 'name not saved: ' + JSON.stringify(db[0]));
      await notReloaded(pages.A, mA);
    }, ['promoted']);

    await step('A demotes B; a stale edit by B is not shown as saved', async () => {
      await pages.A.keyboard.press('Escape');
      await memberMenu(pages.A, ctx.Buid, /شيل الإشراف|Remove admin/);
      await until(pages.B, 'B’s platform knows it is a member again', () => window.A.P.role() === 'member');
      await pages.B.click('[data-go="home"]');
      await pages.B.click('[data-go="circle"]');
      if (!(await pages.B.$('[data-act="edit-circle"]'))) return 'Edit button gone';
      const errsBefore = pages.B.__errors.length;
      await pages.B.click('[data-act="edit-circle"]');
      await pages.B.fill('#ec-name', 'اسم ماينفعش يتحفظ');
      await pages.B.click('#ec-form button');
      await T(1500);
      const db = await env.fake.sql('select name from public.circles where id = $1', [ctx.circleId]);
      const shown = await pages.B.evaluate(() => window.A.P.circle().name);
      const toast = await pages.B.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
      await H.shot(pages.B, '14a-B-stale-edit');
      await pages.B.reload();
      await pages.B.waitForSelector('.shell', { timeout: 20000 });
      const uncaught = pages.B.__errors.slice(errsBefore).filter((e) => /pageerror/.test(e));
      assert(db[0].name === 'حلقة القراءة الكبيرة', 'RLS let a member rename the circle!');
      assert(shown !== 'اسم ماينفعش يتحفظ', `after demotion B still sees the Edit button; B's rename was dropped by RLS (0 rows updated, no error) but B's app shows "${shown}" as saved${toast ? ' (toast: ' + toast + ')' : ', no warning'}; it reverts only on reload`);
      assert(!uncaught.length, `after demotion B still sees the Edit button (S.canEdit is stale); saving is refused client-side but as an uncaught rejection (${uncaught[0].split('\n')[0]}) with the toast "${toast}"`);
    }, ['promoted']);

    await step('A resets the invite link: the old link is refused, the new one works', async () => {
      const p = pages.A;
      await p.keyboard.press('Escape');
      await p.click('[data-go="circle"]');
      await p.click('[data-act="invite"]');
      await p.click('[data-reset]');
      await p.click('[data-yes]');
      await until(p, 'new link in the sheet', (old) => {
        const el = document.querySelector('#inv-url');
        return el && el.textContent.trim() !== old;
      }, ctx.invite);
      const fresh = (await p.textContent('#inv-url')).trim();
      await p.keyboard.press('Escape');
      const D = await H.newUser(browser, env, 'dina@test.local', { url: ctx.invite });
      pages.D = D.page;
      await D.page.waitForSelector('#cn-name', { timeout: 15000 });
      const inA = await env.fake.sql('select 1 from public.circle_members m join auth.users u on u.id = m.user_id where m.circle_id = $1 and u.email = $2', [ctx.circleId, 'dina@test.local']);
      assert(!inA.length, 'old invite link still let D join');
      // Opening the new link in the same tab only changes the #hash: no reload, and auth.js has no
      // hashchange handling for #join-…, so nothing happens. Recorded, then joined via the paste box.
      await D.page.goto(fresh);
      await T(1500);
      const hashJoin = !!(await D.page.$('#join-name'));
      if (!hashJoin) {
        await D.page.fill('#cj-code', fresh);
        await D.page.click('#circle-join button');
      }
      await D.page.waitForSelector('#join-name', { timeout: 20000 });
      const cid = await D.page.evaluate(() => window.A.P.circle().id);
      assert(cid === ctx.circleId, 'new link did not join A’s circle');
      return hashJoin ? fresh : `${fresh} (joined via the paste box; opening the link in the already-open tab did nothing)`;
    }, ['circleId']);

    await step('A deletes the book: B sees it disappear live, the PDF leaves storage', async () => {
      const p = pages.A;
      const mB = await mark(pages.B);
      await pages.B.click('[data-go="home"]');
      await p.click('[data-go="home"]');
      await p.click(`.wcard [data-go="book-${ctx.bookId}"]`);
      await p.click(`[data-act="book-menu"][data-b="${ctx.bookId}"]`);
      await p.locator('.menu-sheet .mi.danger').first().click();
      await p.click('[data-yes]');
      await until(pages.B, 'book gone from B', (b) => !window.A.S.books.has(b) && !document.querySelector('.wcard'), ctx.bookId);
      await notReloaded(pages.B, mB);
      const t1 = Date.now();
      let objs;
      do {
        objs = await env.fake.sql(`select name from storage.objects where bucket_id = 'books'`);
        if (!objs.length) break;
        await T(200);
      } while (Date.now() - t1 < 5000);
      const doc = await env.fake.sql(`select deleted, data from public.docs where circle_id = $1 and col = 'books' and id = $2`, [ctx.circleId, ctx.bookId]);
      assert(doc[0].deleted === true && JSON.stringify(doc[0].data) === '{}', 'book not tombstoned');
      assert(!objs.length, 'storage object left behind: ' + JSON.stringify(objs));
    }, ['bookId']);

    await step('A removes B from the circle; B is kicked out live', async () => {
      const p = pages.B;
      await pages.A.evaluate(([c, u]) => window.A.P.removeMember(c, u), [ctx.circleId, ctx.Buid]);
      await p.waitForSelector('#cn-name', { timeout: 15000 }); // after the kick toast B reloads into the circles screen
      const txt = await p.textContent('.circles-pick');
      assert(!/حلقة الاختبار/.test(txt), 'A’s circle still listed for B');
      await until(pages.A, 'A sees 1 member', () => window.A.S.members.size === 1);
      await H.shot(p, '14-B-kicked');
    }, ['Buid']);

    await step('A signs out: back to sign-in, session and synced cache cleared', async () => {
      const p = pages.A;
      await p.keyboard.press('Escape');
      await p.click('[data-go="me"]');
      await p.click('[data-auth="signout"]');
      await p.waitForSelector('#auth-mail', { timeout: 15000 });
      const left = await p.evaluate(async () => ({ keys: Object.keys(localStorage), dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null }));
      const bad = left.keys.filter((k) => k === 'qs-auth' || (k.startsWith('qs:') && !/^qs:(lang|theme|sound)$/.test(k)));
      assert(!left.dbs || !left.dbs.includes('qs-sync'), 'IndexedDB qs-sync still there');
      assert(!bad.length, `left in localStorage: ${bad.join(', ')} (IndexedDB after sign-out: ${JSON.stringify(left.dbs)})`);
      return `remaining IndexedDB: ${JSON.stringify(left.dbs)}`;
    }, ['circleId']);
  } finally {
    /* ---------------- report ---------------- */
    console.log('\n==== console / page errors ====');
    for (const [who, p] of Object.entries(pages)) {
      const errs = p.__errors || [];
      const http = errs.filter((e) => /Failed to load resource/.test(e));
      const other = errs.filter((e) => !/Failed to load resource/.test(e));
      console.log(`-- ${who}: ${other.length} errors, ${http.length} HTTP error responses`);
      for (const e of other) console.log('   ' + e.split('\n').slice(0, 4).join('\n     '));
      for (const e of http) console.log('   ' + e);
    }
    const fails = results.filter((r) => r.status === 'FAIL').length;
    const skips = results.filter((r) => r.status === 'SKIP').length;
    console.log(`\n==== ${results.length - fails - skips} passed, ${fails} failed, ${skips} skipped  (${((Date.now() - t0) / 1000).toFixed(1)} s) — screenshots in ${path.relative(process.cwd(), H.SHOTS) || H.SHOTS}`);
    await browser.close().catch(() => {});
    await env.stop().catch(() => {});
    process.exitCode = fails ? 1 : 0;
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
