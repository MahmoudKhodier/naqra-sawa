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

    await step('«اختارلي كتاب»: a pick from the want list, filters, «غيره», «هبدأ فيه»', async () => {
      await p.click('[data-go="shelf"]');
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("اختارلي كتاب")');
      await p.waitForSelector('.wm-pick-sheet #wm-pick');
      const title = () => p.textContent('#wm-pick .wm-pt');
      const want = ['Dune', 'الغريب', 'مئة عام من العزلة', 'كتاب بلا صفحات', 'الطنطورية'];
      assert(want.includes(await title()), 'first pick: ' + (await title()));
      // short: under 200 pages, plus books without a page count
      await p.click('[data-f="len"] [data-v="short"]');
      const short = ['الغريب', 'كتاب بلا صفحات'];
      const t1 = await title();
      assert(short.includes(t1), 'short pick: ' + t1);
      assert(/واحد من كتابين/.test(await p.textContent('.wm-pc')), 'count: ' + (await p.textContent('.wm-pc')));
      await p.click('.wm-pick-sheet [data-again]');
      const t2 = await title();
      assert(short.includes(t2) && t2 !== t1, `another: ${t1} → ${t2}`);
      for (let i = 0; i < 4; i++) {
        const a = await title();
        await p.click('.wm-pick-sheet [data-again]');
        assert((await title()) !== a, 'the same book twice in a row');
      }
      // a category
      await p.click('[data-f="tag"] [data-v="philo"]');
      assert((await title()) === 'كتاب بلا صفحات', 'philosophy: ' + (await title()));
      assert(await p.$eval('.wm-pick-sheet [data-again]', (b) => b.disabled), '«غيره» with one book left');
      assert(!(await p.$('#wm-pick .wm-time')), 'a time without pages');
      // one of my shelves, any length
      await p.click('[data-f="tag"] [data-v=""]');
      await p.click('[data-f="len"] [data-v="any"]');
      await p.click('[data-f="list"] [data-v="كلاسيكيات"]');
      const t3 = await title();
      assert(['الغريب', 'مئة عام من العزلة'].includes(t3), 'list pick: ' + t3);
      if (t3 !== 'الغريب') await p.click('.wm-pick-sheet [data-again]');
      assert((await title()) === 'الغريب', 'could not reach الغريب');
      const time = await p.textContent('#wm-pick .wm-time');
      assert(/ساعتين و٣٠ دقيقة/.test(time), 'time for 150 pages: ' + time);
      await p.click('[data-f="len"] [data-v="long"]');
      assert(/مفيش كتاب بالمواصفات دي/.test(await p.textContent('.wm-out')), 'no empty state for long classics');
      await p.click('[data-f="len"] [data-v="short"]');
      assert((await title()) === 'الغريب', 'back to short');
      await T(700); // the shuffle settles
      await H.shot(p, 'worm-pick');
      await p.click('.wm-pick-sheet [data-start]');
      await until(p, 'moved to reading', (d) => Object.values((window.A.S.shelf.get(window.A.S.me) || {}).items || {}).some((x) => x.title === 'الغريب' && x.status === 'reading' && x.started === d), TODAY);
      await until(p, 'shelf on «بقرأه»', () => window.A.V.state.route === 'shelf' && window.A.V.state.opts.st === 'reading');
      const g = (await shelfOf(p)).find((x) => x.title === 'الغريب');
      assert(g.lists && g.lists[0] === 'كلاسيكيات' && g.pages === 150, 'other fields lost: ' + JSON.stringify(g));
      await T(300);
    }, ['joined']);

    await step('«اختارلي كتاب» with an empty want list', async () => {
      await q.evaluate(() => window.A.V.worm.pickSheet());
      await q.waitForSelector('.sheet .empty');
      assert(/«عايز أقرأه» فاضية/.test(await q.textContent('.sheet .empty')), 'empty state text');
      await closeSheets(q);
    }, ['joined']);

    const newChallenge = async (fill) => {
      await p.click('#wm-ch [data-act="wm-ch-new"]');
      await p.waitForSelector('#wm-ch-form');
      await fill();
      await p.click('#wm-ch-form button:not([type])');
      await until(p, 'sheet closed', () => !document.querySelector('#wm-ch-form'));
    };
    const rowText = (kind) =>
      p.evaluate((k) => {
        const c = (window.A.S.members.get(window.A.S.me).challenges || []).find((x) => x.kind === k);
        const el = c && document.querySelector(`#wm-ch .wm-c[data-id="${c.id}"] .wm-c-n`);
        return el ? el.textContent : null;
      }, kind);

    await step('Challenges: each kind counts the right things', async () => {
      const days = { [MONTH1]: 100, [LASTPREV]: 999 };
      days[TODAY] = (days[TODAY] || 0) + 50;
      await p.evaluate((d) => window.A.D.updateMe((m) => ({ days: Object.assign({}, m.days, d) })), days);
      ctx.pages = Object.entries(days).filter(([k]) => k >= MONTH1).reduce((t, [, v]) => t + v, 0);
      ctx.days = Object.keys(days).filter((k) => k >= MONTH1).length;
      await p.evaluate(() => window.A.V.go('me'));
      await p.waitForSelector('#wm-ch');
      assert(/تحديات بتعملها لنفسك/.test(await p.textContent('#wm-ch')), 'empty card text');
      await closeSheets(p);
      for (const id of ['books12', 'authors12', 'pages1000', 'days30']) {
        await newChallenge(async () => {
          await p.click(`[data-preset="${id}"]`);
        });
      }
      await newChallenge(async () => {
        await p.selectOption('#wm-ch-kind', 'tag');
        await p.selectOption('#wm-ch-tag', 'novel');
        await p.fill('#wm-ch-n', '5');
        await p.selectOption('#wm-ch-per', 'year');
      });
      const cs = await p.evaluate(() => window.A.S.members.get(window.A.S.me).challenges);
      assert(cs.length === 5, 'saved: ' + JSON.stringify(cs));
      const b12 = cs.find((c) => c.kind === 'books');
      assert(b12.n === 12 && b12.from === YEAR + '-01-01' && b12.to === YEAR + '-12-31' && b12.pre === 'books12' && !b12.t, 'preset: ' + JSON.stringify(b12));
      const pg = cs.find((c) => c.kind === 'pages');
      assert(pg.from === MONTH1 && pg.n === 1000, 'month preset: ' + JSON.stringify(pg));
      const want = {
        books: '٤ من ١٢ كتاب',
        authors: '٣ من ١٢ كاتب', // عاشور, حسين, Clear are new this year; Harari was read last year
        pages: `${ctx.pages.toLocaleString('ar-EG')} من ${(1000).toLocaleString('ar-EG')} صفحة`,
        days: `${ctx.days.toLocaleString('ar-EG')} من ٣٠ يوم`,
        tag: '١ من ٥ كتب',
      };
      const got = {};
      for (const k of Object.keys(want)) got[k] = await rowText(k);
      for (const k of Object.keys(want)) assert(got[k] === want[k], `${k}: ${got[k]} ≠ ${want[k]}`);
      assert((await p.evaluate(() => window.__conf)) === 0, 'celebrated too early');
      ctx.ch = true;
      return JSON.stringify(got);
    }, ['joined']);

    await step('Reaching a challenge celebrates once and is remembered', async () => {
      await newChallenge(async () => {
        await p.fill('#wm-ch-t', 'أعيد كتاب');
        await p.selectOption('#wm-ch-kind', 'list');
        await p.fill('#wm-ch-list', 'أعيده');
        await p.fill('#wm-ch-n', '1');
        await p.selectOption('#wm-ch-per', 'year');
      });
      await until(p, 'celebrated', () => window.__conf === 1);
      await until(p, 'done saved', () => (window.A.S.members.get(window.A.S.me).challenges || []).some((c) => c.kind === 'list' && c.done));
      assert(/خلّصت تحدي «أعيد كتاب»/.test(await toastText(p)), 'toast: ' + (await toastText(p)));
      assert((await rowText('list')) === '١ من كتاب واحد', 'list row: ' + (await rowText('list')));
      await p.waitForSelector('#wm-ch .wm-c.done');
      await shotAt(p, '#wm-ch', 'worm-challenges');
      // more reading, a re-render: no second party
      await p.evaluate(() => window.A.D.updateMe((m) => ({ days: Object.assign({}, m.days, { [window.A.U.today()]: ((m.days || {})[window.A.U.today()] || 0) + 5 }) })));
      await p.evaluate(() => window.A.V.go('shelf'));
      await p.evaluate(() => window.A.V.go('me'));
      await T(1200);
      assert((await p.evaluate(() => window.__conf)) === 1, 'celebrated again: ' + (await p.evaluate(() => window.__conf)));
    }, ['ch']);

    await step('Edit a challenge (lower target → done), delete one', async () => {
      const id = await p.evaluate(() => window.A.S.members.get(window.A.S.me).challenges.find((c) => c.kind === 'books').id);
      await p.click(`#wm-ch [data-act="wm-ch"][data-id="${id}"]`);
      await p.click('.mi:has-text("عدّل")');
      await p.waitForSelector('#wm-ch-form');
      assert((await p.inputValue('#wm-ch-n')) === '12' && (await p.inputValue('#wm-ch-per')) === 'year', 'form not filled');
      await p.fill('#wm-ch-n', '4');
      await p.click('#wm-ch-form button:not([type])');
      await until(p, 'second celebration', () => window.__conf === 2);
      await until(p, 'done saved', (i) => window.A.S.members.get(window.A.S.me).challenges.find((x) => x.id === i).done, id);
      const c = await p.evaluate((i) => window.A.S.members.get(window.A.S.me).challenges.find((x) => x.id === i), id);
      assert(c.n === 4 && c.done && !c.t && !c.pre, 'edited: ' + JSON.stringify(c)); // no longer «١٢ كتاب…»
      assert((await p.textContent(`#wm-ch [data-id="${id}"] .wm-c-b > b`)) === '٤ كتب', 'title after the edit');
      const did = await p.evaluate(() => window.A.S.members.get(window.A.S.me).challenges.find((c2) => c2.kind === 'days').id);
      await p.click(`#wm-ch [data-act="wm-ch"][data-id="${did}"]`);
      await p.click('.mi:has-text("امسح التحدي")');
      await p.click('.sheet [data-yes]');
      await until(p, 'deleted', (i) => !window.A.S.members.get(window.A.S.me).challenges.some((x) => x.id === i), did);
      await until(p, 'row gone', (i) => !document.querySelector(`#wm-ch [data-id="${i}"]`), did);
    }, ['ch']);

    await step('Another member sees my active challenges, read-only', async () => {
      await q.evaluate((u) => window.A.V.go('me', { uid: u }), ctx.Auid);
      await until(q, 'challenges arrived', () => document.querySelectorAll('#wm-ch .wm-c').length === 5);
      assert(/تحديات منى/.test(await q.textContent('#wm-ch h2')), 'title: ' + (await q.textContent('#wm-ch h2')));
      assert(!(await q.$('#wm-ch [data-act]')), 'editable on someone else’s profile');
      const t = await q.textContent('#wm-taste .wm-pct-t');
      assert(t.includes('٨١٪'), 'سارة sees a different score: ' + t);
      assert((await q.evaluate(() => window.__conf)) === 0, 'my challenge celebrated on سارة’s phone');
    }, ['ch']);

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
      await p.evaluate(() => window.A.V.go('me'));
      await p.waitForSelector('#wm-ch');
      const ch = await p.textContent('#wm-ch');
      assert(/My challenges/.test(ch) && /New challenge/.test(ch), 'card: ' + ch.slice(0, 120));
      assert((await rowText('authors')) === '3 of 12 new authors' && (await rowText('tag')) === '1 of 5 books', 'rows: ' + (await rowText('authors')) + ' / ' + (await rowText('tag')));
      assert(/Closest taste to yours/.test(await p.textContent('#wm-taste')), 'ranking title');
      const titles = await p.$$eval('#wm-ch .wm-c-b > b', (x) => x.map((e) => e.textContent));
      assert(titles.includes('A new author every month') && titles.includes('1,000 pages this month') && titles.includes('أعيد كتاب'), 'titles: ' + titles);
      await shotAt(p, '#wm-ch', 'worm-challenges-en');
      await p.click('#wm-ch [data-act="wm-ch-new"]');
      await p.waitForSelector('#wm-ch-form');
      const presets = await p.$$eval('[data-preset]', (x) => x.map((e) => e.textContent));
      assert(presets.includes('A new author every month') && presets.includes('1,000 pages this month'), 'presets: ' + presets);
      await closeSheets(p);
      await p.click('[data-go="shelf"]');
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("Pick a book for me")');
      await p.waitForSelector('.wm-pick-sheet #wm-pick');
      assert(/Length/.test(await p.textContent('.wm-filters')) && /Another/.test(await p.textContent('.wm-out')), 'pick sheet in English');
      await T(700);
      await H.shot(p, 'worm-pick-en');
      await closeSheets(p);
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
    }, ['ch']);

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
