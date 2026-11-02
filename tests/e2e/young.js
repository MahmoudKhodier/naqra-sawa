#!/usr/bin/env node
/*
 * For young readers: stations in the portion, «مستعجل؟ ٥ دقايق بس», «من غير حرق» (others' notes on pages ahead wait),
 * the golden page, emoji reactions on a line (long-press), «اقرا ١٠ صفحات بس» when behind, the quote as a story
 * picture, «اليوم البسيط» (on this phone, or set by the owner for a member).
 *
 *   node tests/e2e/young.js
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
  await p.evaluate(() => window.A.V.sheets.slice().forEach((s) => s.close()));
  await T(300);
};
const closeReader = (p) => p.evaluate(() => window.A.R.isOpen() && window.A.R.close(true));
const readerReady = (p) => until(p, 'reader open', () => window.A.R.isOpen() && document.querySelector('.pg canvas'), null, 20000);
/* Opened away from where reading goes on, the reader is «looking around»: «كمّل من هنا» makes it count. */
const readHere = async (p) => {
  await T(300);
  await p.evaluate(() => window.A.R._state().browsing && document.querySelector('.rd [data-act="browse-here"]').click());
  await T(200);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId, bUid, cid;
  try {
    await step('Owner and a young member, a book with 8 pages a portion', async () => {
      const A = await H.newUser(browser, env, 'ya@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الصغيرين');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'خالو');
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
      const B = await H.newUser(browser, env, 'yb@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 }, hasTouch: true });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'يوسف');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
      bUid = await b.evaluate(() => window.A.S.me);
      for (const pg of [a, b]) await pg.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
    });

    await step('«مستعجل؟ ٥ دقايق بس» opens the book with a 5-minute focus session', async () => {
      await closeAll(b);
      await b.evaluate(() => window.A.V.go('home'));
      await b.waitForSelector('[data-act="read-quick"]');
      await b.click('[data-act="read-quick"]');
      await readerReady(b);
      await until(b, 'focus running', () => { const f = window.A.R._focus(); return f && f.target === 300; }, null, 6000);
      await closeReader(b);
    });

    await step('Stations: a star after every few pages of the portion, and a cheer when one is reached', async () => {
      await b.evaluate((id) => window.A.R.open(id, { page: 9 }), bookId);
      await readerReady(b);
      await until(b, 'on p. 9', () => window.A.R._state().cur === 9);
      await readHere(b);
      const ends = await b.$$eval('#rd-wprog i.se', (x) => x.length);
      assert(ends === 2, 'station ends in an 8-page portion: ' + ends); // 3 + 3 + 2
      let seen = [];
      for (let pg = 9; pg <= 12; pg++) {
        await b.evaluate((x) => window.A.R._markSeen(x), pg);
        await T(80);
        const c = await b.evaluate(() => window.A.R._wird().cheer);
        if (c && seen[seen.length - 1] !== c) seen.push(c);
      }
      assert(seen.some((c) => /محطة ١ من ٣/.test(c)), 'station cheer: ' + seen.join(' | '));
      const label = await b.evaluate(() => window.A.R._wird().label);
      assert(/⭐/.test(label), 'label: ' + label);
      await closeReader(b);
      return seen.join(' | ');
    });

    await step('The golden page: found when read, +XP, recorded on the member doc', async () => {
      const gp = await b.evaluate((id) => {
        const bk = window.A.S.books.get(id);
        return window.A.G.goldenPage(id, bk.wirds[2]); // portion 3 (p. 17–24): nothing read there yet
      }, bookId);
      assert(gp >= 18 && gp <= 24, 'golden page ' + gp);
      await b.evaluate(([id, p]) => window.A.R.open(id, { page: p }), [bookId, gp]);
      await readerReady(b);
      await until(b, 'on the golden page', (p) => window.A.R._state().cur === p, gp);
      await readHere(b);
      assert(await b.$('#rd-wprog i.gd:not(.found)'), 'no «?» square for the golden page');
      const xp0 = await b.evaluate(() => window.A.G.of(window.A.S.me).xp);
      await b.evaluate((p) => window.A.R._markSeen(p), gp);
      await until(b, 'recorded', (id) => !!((window.A.S.members.get(window.A.S.me) || {}).gold || {})[id + '|w3'], bookId);
      await until(b, 'found square', () => !!document.querySelector('#rd-wprog i.gd.found'));
      const xp1 = await b.evaluate(() => window.A.G.of(window.A.S.me).xp);
      assert(xp1 - xp0 >= 15, `XP ${xp0} → ${xp1}`);
      await closeReader(b);
      return `p. ${gp}, XP ${xp0} → ${xp1}`;
    });

    await step('«من غير حرق»: a note ahead waits closed; the reader counts it; it opens once there', async () => {
      // the owner writes on p. 30; the young member has read up to about p. 16
      const nid = await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 30, kind: 'q', text: 'مين توقع اللي حصل هنا؟', rect: { x: 0.3, y: 0.4, w: 0, h: 0 }, by: S.me, at: U.nowIso(), wid: 'w4', likes: {}, replies: {} });
        return n;
      }, bookId);
      await until(b, 'note arrived', (id) => window.A.S.notes.has(id), nid);
      await closeAll(b);
      await b.evaluate(() => window.A.V.go('circle'));
      await until(b, 'closed card in the news', () => !!document.querySelector('.feed .ncard.locked'));
      assert(!/مين توقع/.test(await b.textContent('.feed')), 'the words show in the news');
      // in the reader: the 👀 count while on portion 3 (the note is on the next portion's last page? no: portion 4)
      await b.evaluate((id) => window.A.R.open(id, { page: 24 }), bookId);
      await readerReady(b);
      await until(b, 'on p. 24', () => window.A.R._state().cur === 24);
      await until(b, '👀 count', () => !document.querySelector('#rd-ahead').hidden);
      // reach p. 30: it shows on the page and in the news
      await b.evaluate((id) => window.A.D.saveProg(id, (c) => ({ seen: window.A.U.rangesAdd(c.seen, Array.from({ length: 30 }, (_, i) => i + 1)) })), bookId);
      await closeReader(b);
      await b.evaluate(() => window.A.V.go('circle'));
      await until(b, 'open card', (id) => !!document.querySelector(`.feed .ncard [data-nid="${id}"]`), nid);
      return nid;
    });

    await step('Emoji reactions: long-press a line, pick 🔥; the other member sees it on that line', async () => {
      await closeAll(b);
      await b.evaluate((id) => window.A.R.open(id, { page: 20 }), bookId);
      await readerReady(b);
      await until(b, 'on p. 20', () => window.A.R._state().cur === 20);
      await T(500);
      const box = await b.$eval('.pg[data-p="20"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top, 120) + 60 }; });
      await b.mouse.move(box.x, box.y);
      await b.mouse.down();
      await T(700);
      await b.mouse.up();
      await b.waitForSelector('#rx-bar [data-e="🔥"]', { timeout: 4000 });
      await b.click('#rx-bar [data-e="🔥"]');
      await until(b, 'saved', () => [...window.A.S.reacts.values()].some((r) => r.e === '🔥'));
      await until(b, 'bubble', () => !!document.querySelector('.pg[data-p="20"] .rx-m'));
      // On a phone: hold, then slide the finger up to the bar and across it without lifting; let go picks.
      await T(400);
      const cdp = await b.context().newCDPSession(b);
      const pt = await b.$eval('.pg[data-p="20"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top, 120) + 260 }; });
      const top0 = await b.$eval('#rd-scroll', (e) => e.scrollTop);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await T(750);
      await b.waitForSelector('#rx-bar .rx-i', { timeout: 3000 });
      // lifting the finger where it went down picks nothing and leaves the bar open
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await T(300);
      assert(await b.$('#rx-bar:not(.out)'), 'bar stays open after a plain lift');
      assert([...(await b.evaluate(() => [...window.A.S.reacts.values()].map((r) => r.e)))].join() === '🔥', 'a plain lift picks nothing');
      await b.evaluate(() => window.A.R._rxClose && window.A.R._rxClose());
      await T(300);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await T(750);
      await b.waitForSelector('#rx-bar .rx-i', { timeout: 3000 });
      const at = (e) => b.$eval(`#rx-bar [data-e="${e}"]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const wow = await at('😮'), laugh = await at('😂'), heart = await at('❤️');
      const path = [];
      for (let i = 1; i <= 6; i++) path.push({ x: pt.x + ((wow.x - pt.x) * i) / 6, y: pt.y + ((wow.y - pt.y) * i) / 6 });
      for (let i = 1; i <= 6; i++) path.push({ x: wow.x + ((heart.x - wow.x) * i) / 6, y: wow.y });
      for (let i = 1; i <= 3; i++) path.push({ x: heart.x + ((laugh.x - heart.x) * i) / 3, y: wow.y - 6 });
      for (const q of path) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [q] });
        await T(30);
      }
      assert(await b.$('#rx-bar [data-e="😂"].hov'), 'the emoji under the finger lifts');
      assert(Math.abs((await b.$eval('#rd-scroll', (e) => e.scrollTop)) - top0) < 4, 'the page does not scroll while sliding');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until(b, 'slide picked 😂', () => [...window.A.S.reacts.values()].some((r) => r.e === '😂'));
      await cdp.detach();
      await until(a, 'owner has it', () => [...window.A.S.reacts.values()].some((r) => r.e === '😂'));
      await a.evaluate((id) => window.A.R.open(id, { page: 20 }), bookId);
      await readerReady(a);
      await until(a, 'owner sees the bubble', () => !!document.querySelector('.pg[data-p="20"] .rx-m'), null, 8000);
      await H.shot(a, 'young-reaction');
      await closeReader(a);
      await closeReader(b);
    });

    await step('Behind: «اقرا ١٠ صفحات بس النهارده» with a button', async () => {
      // the plan started 3 days ago for the owner's book: portions 1–3 are late for the owner
      await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        const bk = S.books.get(id);
        const wirds = bk.wirds.map((w, i) => Object.assign({}, w, { start: U.addDays(U.today(), i - 3), due: U.addDays(U.today(), i - 3) }));
        await D.update(`books/${id}`, { wirds });
      }, bookId);
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('home'));
      await until(a, 'catch-up line', () => /بس النهارده/.test((document.querySelector('.catchup') || {}).textContent || ''), null, 8000);
      assert(await a.$('.catchup [data-act="read"]'), 'no «يلا» button');
    });

    await step('The quote as a story picture (1080×1920)', async () => {
      const size = await a.evaluate(async (id) => {
        const { D, S, U, V } = window.A;
        const n = D.newId();
        await D.set(`notes/${n}`, { b: id, page: 5, kind: 'quote', text: 'القراءة سفر بلا حقائب، ورفقة لا تخذلك.', rect: null, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
        const blob = await V.storyCard(S.notes.get(n));
        const bmp = await createImageBitmap(blob);
        return { w: bmp.width, h: bmp.height, kb: Math.round(blob.size / 1024) };
      }, bookId);
      assert(size.w === 1080 && size.h === 1920 && size.kb > 20, 'story: ' + JSON.stringify(size));
      return JSON.stringify(size);
    });

    await step('«اليوم البسيط»: the owner turns it on for the young member; their Today has three things', async () => {
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle', { seg: 'members' }));
      await a.click(`.members [data-uid="${bUid}"]`);
      await a.click('.mi:has-text("اليوم البسيط")');
      await until(b, 'flag arrived', (u) => !!(window.A.S.circle && window.A.S.circle.simple && window.A.S.circle.simple[u]), bUid);
      await closeAll(b);
      await b.evaluate(() => window.A.V.go('home'));
      await until(b, 'simple home', () => !!document.querySelector('.home.simple'));
      assert(!(await b.$('.hcard.week')) && !(await b.$('.goal-strip')), 'extra cards still there');
      assert(await b.$('.home.simple .quests'), 'no quests');
      const pick = await b.evaluate(() => window.A.V.menuItems('shelf', {}).some((x) => /اختارلي/.test(x.t)));
      assert(!pick, '«اختارلي كتاب» still offered');
      // their own Settings win
      await b.evaluate(() => { window.A.U.store.set('simpleToday', false); window.A.V.go('home'); });
      await until(b, 'full home', () => !document.querySelector('.home.simple'));
    });

    await step('English and no console errors', async () => {
      await b.evaluate(() => window.A.L.set('en'));
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
