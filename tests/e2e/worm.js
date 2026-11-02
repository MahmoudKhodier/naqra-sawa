#!/usr/bin/env node
/*
 * For bookworms (site/js/v-worm.js), two members on phones against the fake Supabase:
 * «مين ذوقه شبهك» (taste score, books both loved, picks from a member's favourites → my want list),
 * «اختارلي كتاب» (filters, «غيره», «هبدأ فيه», empty want list) and personal challenges (each kind's
 * progress, celebration once, edit/delete, read-only on someone else's profile), in مصري and English.
 *
 *   node tests/e2e/worm.js        # PASS/FAIL per step, exit 1 on any FAIL
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
  for (let i = 0; i < 5 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const TODAY = dkey(now);
const MONTH = TODAY.slice(0, 7);
const YEAR = TODAY.slice(0, 4);
const PREV = String(+YEAR - 1);
const MONTH1 = MONTH + '-01';
const LASTPREV = dkey(new Date(now.getFullYear(), now.getMonth(), 0)); // last day of the month before

/* My shelf (منى). Read this year: ثلاثية غرناطة, Atomic Habits, Homo Deus (this month), الأيام (year only). */
const A_ITEMS = [
  { title: 'ثلاثية غرناطة', author: 'رضوى عاشور', status: 'read', rating: 5, tags: ['novel'], finished: MONTH, pages: 500 },
  { title: 'الأيام', author: 'طه حسين', status: 'read', rating: 4, tags: ['bio'], finished: YEAR, pages: 200 },
  { title: 'عبقرية عمر', author: 'العقاد', status: 'read', rating: 3, tags: ['history'], finished: PREV + '-05' },
  { title: 'Atomic Habits', author: 'James Clear', status: 'read', rating: 4, tags: ['self'], finished: MONTH, lists: ['أعيده'] },
  { title: 'Sapiens', author: 'Yuval Noah Harari', status: 'read', rating: 5, tags: ['history'], finished: PREV + '-03' },
  { title: 'Homo Deus', author: 'Yuval Noah Harari', status: 'read', rating: 4, tags: ['history'], finished: MONTH },
  { title: 'Dune', author: 'Frank Herbert', status: 'want', pages: 600, tags: ['novel'] },
  { title: 'الغريب', author: 'ألبير كامو', status: 'want', pages: 150, tags: ['novel'], lists: ['كلاسيكيات'] },
  { title: 'مئة عام من العزلة', author: 'ماركيز', status: 'want', pages: 350, tags: ['novel'], lists: ['كلاسيكيات'] },
  { title: 'كتاب بلا صفحات', author: 'مجهول', status: 'want', pages: 0, tags: ['philo'] },
];
/* سارة: four books in common (ratings 5/5, 2/4, 3/3, one unrated) and favourites I don't have. */
const B_ITEMS = [
  { title: 'ثلاثية غرناطة', author: 'رضوى عاشور', status: 'read', rating: 5, tags: ['novel'], finished: PREV + '-01' },
  { title: 'الأيام', author: 'طه حسين', status: 'read', rating: 2, tags: ['bio'], finished: PREV + '-02' },
  { title: 'عبقرية عمر', author: 'العقاد', status: 'read', rating: 3, tags: ['history'], finished: PREV + '-02' },
  { title: 'Atomic Habits', author: 'James Clear', status: 'read', rating: 0, tags: ['self'], finished: PREV + '-04' },
  { title: 'الطنطورية', author: 'رضوى عاشور', status: 'read', rating: 5, tags: ['novel'], finished: PREV + '-09', pages: 380 },
  { title: 'دعاء الكروان', author: 'طه حسين', status: 'read', rating: 4, tags: ['novel'], finished: PREV + '-10' },
  { title: '1984', author: 'George Orwell', status: 'read', rating: 5, tags: ['novel'], finished: PREV + '-06' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', status: 'read', rating: 3, tags: ['science'], finished: PREV + '-07' },
  { title: 'Dune', author: 'Frank Herbert', status: 'read', rating: 5, tags: ['novel'], finished: PREV + '-08' },
];
/* Expected score: ratings (1 + 0.5 + 1) / 3 × 0.5 + books 4/6 × 0.2 + authors 4/5 × 0.2 + tags 4/4 × 0.1 = 0.81. */
const SCORE = 81;

async function seedShelf(page, items) {
  await page.evaluate(async (list) => {
    const { D, S, U } = window.A;
    const t = U.nowIso();
    const cur = (S.shelf.get(S.me) || {}).items || {};
    const obj = Object.assign({}, cur);
    for (const it of list) obj[D.newId()] = Object.assign({ rating: 0, review: '', tags: [], pages: 0, at: t, updatedAt: t }, it);
    await D.mutate('shelf/' + S.me, () => ({ items: obj }));
  }, items);
}
const shelfOf = (page) => page.evaluate(() => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}));
/* Screenshot with a block scrolled to the top, below the sticky header. */
const shotAt = async (page, sel, name) => {
  await page.$eval(sel, (e) => {
    e.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -(document.querySelector('.hud') || { offsetHeight: 0 }).offsetHeight - 12);
  });
  await T(250);
  await H.shot(page, name);
};
const toastText = (page) => page.$$eval('#toasts .toast', (x) => x.map((t) => t.textContent).join(' | '));

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p, q;
  try {
    await step('Two members join a circle', async () => {
      const a = await H.newUser(browser, env, 'mona@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = a.page;
      await p.fill('#cn-name', 'حلقة الدودة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await T(400);
      await closeSheets(p);
      const code = (await env.fake.sql('select invite_code from public.circles'))[0].invite_code;
      const b = await H.newUser(browser, env, 'sara@test.local', { url: env.siteUrl + '#join-' + code, viewport: { width: 390, height: 844 } });
      q = b.page;
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', 'سارة');
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await closeSheets(q);
      ctx.Auid = await p.evaluate(() => window.A.S.me);
      ctx.Buid = await q.evaluate(() => window.A.S.me);
      await until(p, 'منى sees سارة', (u) => window.A.S.members.has(u), ctx.Buid);
      // count celebrations instead of drawing them; level-ups from the seeded reading are not what this tests
      for (const pg of [p, q]) await pg.evaluate(() => {
        window.__conf = 0;
        window.A.U.confetti = () => window.__conf++;
        window.A.V.levelUp = () => {};
        if (window.A.Goals) window.A.Goals.off = true; // firsts and the daily goal have their own test (goals.js)
      });
      ctx.joined = true;
    });

    await step('Too few books in common: the profile says so instead of a number', async () => {
      await seedShelf(p, A_ITEMS);
      await seedShelf(q, B_ITEMS.slice(0, 1));
      await until(p, 'سارة’s first book arrived', (u) => Object.keys((window.A.S.shelf.get(u) || {}).items || {}).length === 1, ctx.Buid);
      await p.evaluate((u) => window.A.V.go('me', { uid: u }), ctx.Buid);
      await p.waitForSelector('#wm-taste');
      const txt = await p.textContent('#wm-taste');
      assert(/لسه مفيش كتب مشتركة كفاية/.test(txt) && !(await p.$('#wm-taste .wm-score')), 'no “not enough yet”: ' + txt);
    }, ['joined']);

    await step('Taste match: the score, books both loved, and favourites not on my shelf', async () => {
      await seedShelf(q, B_ITEMS.slice(1));
      await until(p, 'سارة’s shelf arrived', (u) => Object.keys((window.A.S.shelf.get(u) || {}).items || {}).length === 9, ctx.Buid);
      await p.waitForSelector('#wm-taste .wm-score');
      const calc = await p.evaluate((u) => window.A.V.worm.taste(window.A.S.me, u), ctx.Buid);
      assert(calc.score === SCORE && calc.common === 4, 'taste: ' + JSON.stringify({ score: calc.score, common: calc.common }));
      const head = await p.textContent('#wm-taste .wm-pct-t');
      assert(head.includes('ذوقكم شبه بعض') && head.includes('٨١٪'), 'headline: ' + head);
      const loved = await p.$$eval('#wm-taste .wm-lv > span:last-child', (x) => x.map((e) => e.textContent.trim()));
      assert(loved.length === 1 && loved[0] === 'ثلاثية غرناطة', 'loved: ' + JSON.stringify(loved));
      const recs = await p.$$eval('#wm-taste .wm-recs .wm-rt b', (x) => x.map((e) => e.textContent));
      assert(JSON.stringify(recs) === JSON.stringify(['الطنطورية', '1984', 'دعاء الكروان']), 'recs: ' + JSON.stringify(recs));
      const h4 = await p.$$eval('#wm-taste .wm-h4', (x) => x.map((e) => e.textContent).join(' / '));
      assert(/كتب سارة المفضلة/.test(h4), 'favourites heading: ' + h4);
      await shotAt(p, '#wm-taste', 'worm-taste');
      ctx.taste = true;
      return `${calc.score}% from ${calc.common} books`;
    }, ['joined']);

    await step('Add a recommendation to «عايز أقرأه»; a second tap says it is already there', async () => {
      await p.click('#wm-taste .wm-recs li:has-text("الطنطورية") [data-act="wm-want"]');
      await until(p, 'saved as want', () => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).some((x) => x.title === 'الطنطورية' && x.status === 'want'));
      const it = (await shelfOf(p)).find((x) => x.title === 'الطنطورية');
      assert(it.from === ctx.Buid && it.pages === 380 && it.author === 'رضوى عاشور', 'item: ' + JSON.stringify(it));
      await p.waitForSelector('#wm-taste .wm-recs li:has-text("الطنطورية") .wm-added');
      await T(2600); // let the “saved” message go by
      await p.evaluate((u) => {
        const it = window.A.V.shelfItems(u).find((x) => x.title === 'الطنطورية');
        const el = document.createElement('button');
        el.dataset.uid = u;
        el.dataset.id = it.id;
        return window.A.V.actions['wm-want'](el);
      }, ctx.Buid);
      await until(p, 'already-there message', () => /موجود في مكتبتك/.test(document.getElementById('toasts').textContent), null, 6000);
      const n = (await shelfOf(p)).filter((x) => x.title === 'الطنطورية').length;
      assert(n === 1, 'added twice: ' + n);
    }, ['taste']);

    await step('My profile: «أقرب ذوق ليك» ranks members, tap opens their profile', async () => {
      await p.evaluate(() => window.A.V.go('me'));
      await p.waitForSelector('#wm-taste .wm-row');
      const row = await p.textContent('#wm-taste .wm-row');
      assert(/أقرب ذوق ليك/.test(await p.textContent('#wm-taste h2')) && row.includes('سارة') && row.includes('٨١٪'), 'row: ' + row);
      await p.click('#wm-taste .wm-row');
      await until(p, 'سارة’s profile', (u) => window.A.V.state.route === 'me' && window.A.V.state.opts.uid === u, ctx.Buid);
      await p.evaluate(() => window.A.V.go('me'));
    }, ['taste']);

    await step('«اختارلي كتاب» and «تحدياتي» are gone (the owner\'s Simple Today for everyone)', async () => {
      const pick = await p.evaluate(() => window.A.V.menuItems('shelf', {}).some((x) => /اختارلي/.test(x.t)));
      assert(!pick, '«اختارلي كتاب» still in the shelf menu');
      await p.evaluate(() => window.A.V.go('me'));
      await p.waitForSelector('#wm-taste');
      assert(!(await p.$('#wm-ch')), '«تحدياتي» still on «أنا»');
    });

    await step('In English (and a look at فصحى)', async () => {
      await p.click('[data-go="settings"]');
      await p.click('[data-act="lang"][data-l="en"]');
      await p.waitForFunction(() => document.documentElement.lang === 'en');
      await p.evaluate((u) => window.A.V.go('me', { uid: u }), ctx.Buid);
      await p.waitForSelector('#wm-taste .wm-score');
      const head = await p.textContent('#wm-taste .wm-pct-t');
      assert(head === `Your tastes match ${SCORE}%`, 'headline: ' + head);
      const h4 = await p.$$eval('#wm-taste .wm-h4', (x) => x.map((e) => e.textContent).join(' / '));
      assert(/Books you both loved/.test(h4) && /سارة's favourites you don't have/.test(h4), 'headings: ' + h4);
      assert(/In “Want to read”/.test(await p.textContent('#wm-taste .wm-recs')), 'added marker');
      await shotAt(p, '#wm-taste', 'worm-taste-en');
      assert(/Closest taste to yours/.test(await (async () => { await p.evaluate(() => window.A.V.go('me')); await p.waitForSelector('#wm-taste'); return p.textContent('#wm-taste'); })()), 'ranking title');
      // فصحى, briefly
      await p.click('[data-go="settings"]');
      await p.click('[data-act="lang"][data-l="ar"]');
      await p.waitForFunction(() => document.documentElement.lang === 'ar');
      await p.evaluate((u) => window.A.V.go('me', { uid: u }), ctx.Buid);
      await p.waitForSelector('#wm-taste .wm-score');
      const fus = await p.textContent('#wm-taste .wm-pct-t');
      assert(fus === 'ذوقكما متشابه بنسبة ٨١٪', 'فصحى headline: ' + fus);
      await p.click('[data-go="settings"]');
      await p.click('[data-act="lang"][data-l="eg"]');
      await p.waitForFunction(() => document.documentElement.lang === 'ar-EG');
    });

    await step('No errors in the console', async () => {
      const errs = [p, q].flatMap((pg) => (pg.__errors || []).filter((e) => !/favicon|fonts|404|Failed to fetch|openlibrary/.test(e)));
      assert(!errs.length, errs.slice(0, 4).join('\n'));
    });
  } finally {
    await browser.close();
    await env.stop();
    const fail = results.filter((r) => r.status !== 'PASS').length;
    console.log(`\n==== ${results.length - fail} passed, ${fail} failed or skipped`);
    process.exit(fail ? 1 : 0);
  }
})();
