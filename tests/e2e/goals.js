#!/usr/bin/env node
/*
 * Personal motivation on «اليوم»: the finish-date forecast and how it compares with the plan, time estimates
 * (portion, whole book, plan preview), the daily goal that grows and eases, the weekly streak, one-time
 * celebrations of firsts (once, and never for history) and the whole-circle badge — in مصري and English.
 *
 *   node tests/e2e/goals.js
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
    console.log(`FAIL  ${name}\n      ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function until(p, what, fn, arg, timeout = 8000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    let extra = '';
    try {
      extra = ' | screen: ' + (await p.evaluate(() => (document.querySelector('#screen') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300)));
    } catch (x) {}
    throw new Error('timed out waiting for: ' + what + extra);
  }
}
/* Close every sheet that pops up (level-ups, firsts…) until things are quiet; returns the firsts that showed. */
async function drain(p, quietMs = 2600, maxMs = 20000) {
  const firsts = [];
  const t0 = Date.now();
  let quietSince = Date.now();
  while (Date.now() - t0 < maxMs) {
    const k = await p.evaluate(() => {
      const w = document.querySelector('#layers .sheet-wrap.in .sheet');
      if (!w) return null;
      const f = w.querySelector('.first-celeb');
      return { first: f ? f.dataset.first : '', title: w.getAttribute('aria-label') };
    });
    if (k) {
      if (k.first) firsts.push(k.first);
      await p.evaluate(() => {
        const ws = document.querySelectorAll('#layers .sheet-wrap.in');
        const w = ws[ws.length - 1];
        const b = w && (w.querySelector('.sh-body [data-close]') || w.querySelector('.sh-head [data-close]'));
        b && b.click();
      });
      await T(450);
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince > quietMs) break;
    await T(200);
  }
  return firsts;
}
/* Close other sheets (a level-up…) until the given first shows. */
async function waitFirst(p, key, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await p.evaluate((key) => {
      const ws = document.querySelectorAll('#layers .sheet-wrap.in');
      const w = ws[ws.length - 1];
      if (!w) return 'none';
      if (w.querySelector(`.first-celeb[data-first="${key}"]`)) return 'ok';
      const b = w.querySelector('.sh-head [data-close]');
      b && b.click();
      return 'closed';
    }, key);
    if (st === 'ok') return;
    await T(st === 'closed' ? 450 : 200);
  }
  throw new Error('first not shown: ' + key);
}
const lang = async (p, l) => {
  await p.evaluate((l) => {
    window.A.L.set(l);
    document.getElementById('app').innerHTML = '';
    window.A.V.render(true);
  }, l);
  await T(200);
};
const go = (p, r, o) => p.evaluate(([r, o]) => window.A.V.go(r, o), [r, o || {}]).then(() => T(250));
const text = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '), sel);
/* Replace my reading days: {offset from today: pages}. */
const setDays = (p, map, extra) =>
  p.evaluate(
    async ([map, extra]) => {
      const { D, U } = window.A;
      const days = {};
      for (const [k, v] of Object.entries(map)) days[/^-?\d+$/.test(k) ? U.addDays(U.today(), +k) : k] = v;
      await D.updateMe(() => Object.assign({ days }, extra || {}));
    },
    [map, extra || null]
  );

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const vp = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  let p, q, bookId, site, code;
  try {
    await step('Sign in, make a circle; firsts start out quiet and the goal starts small', async () => {
      const u = await H.newUser(browser, env, 'goals@test.local', vp);
      p = u.page;
      await p.fill('#cn-name', 'حلقة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(p, 'firsts initialised', () => !!(window.A.S.priv && window.A.S.priv.firsts && window.A.S.priv.firsts._since));
      await until(p, 'goal stored', () => ((window.A.S.members.get(window.A.S.me) || {}).goalDaily || {}).pages === 5);
      const f = await drain(p);
      assert(!f.length, 'firsts fired for a new member: ' + f);
      const g = await text(p, '.dgoal');
      assert(g.includes('٠ من ٥ صفحات النهارده'), 'goal strip: ' + g);
      const fz = await p.evaluate(() => Object.keys(window.A.S.priv.firsts));
      assert(fz.length === 1, 'firsts already marked: ' + fz);
    });

    await step('Upload a book; the plan preview shows minutes per portion and for the whole book', async () => {
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.fill('#pl-per', '8');
      await T(200);
      const pv = await text(p, '#pl-pv .pv-time');
      assert(pv.includes('كل ورد حوالي ١٠ دقايق') && pv.includes('الكتاب كله حوالي ٥٠ دقيقة'), 'preview: ' + pv);
      await H.shot(p, 'goals-plan');
      await p.click('#pl-form button.btn.gold');
      await p.waitForFunction(() => [...window.A.S.books.values()].some((b) => (b.wirds || []).length === 5));
      bookId = await p.evaluate(() => [...window.A.S.books.values()][0].id);
      await drain(p);
      return pv;
    });

    await step('Estimates on «اليوم» and the book page (1.2 min a page until there is reading time)', async () => {
      await go(p, 'home');
      const sub = await text(p, '.hero .hi-sub');
      assert(sub.includes('٨ صفحات • الورد ده حوالي ١٠ دقايق'), 'hero: ' + sub);
      assert(!(await p.$('.fcast')), 'a forecast without enough data');
      await go(p, 'book-' + bookId);
      const bt = await text(p, '.bp-time');
      assert(bt.includes('الكتاب كله حوالي ٥٠ دقيقة'), 'book page: ' + bt);
      const pt = await text(p, '.plan-time');
      assert(pt.includes('الورد ده حوالي ١٠ دقايق') && pt.includes('الكتاب كله حوالي ٥٠ دقيقة'), 'plan tab: ' + pt);
      const n = await p.evaluate(() => [window.A.G.minutesFor(8), window.A.G.minutesFor(0), window.A.G.timeText(300), window.A.G.timeText(270), window.A.G.timeText(7)]);
      assert(JSON.stringify(n) === JSON.stringify([10, 0, '٥ ساعات', '٤ ساعات ونص', '٧ دقايق']), 'helpers: ' + JSON.stringify(n));
    });

    await step('Forecast: behind the plan, with the pages a day that catch up; the first 10 pages celebrate once', async () => {
      await setDays(p, { '-1': 3, '-3': 3, '-5': 3, '-7': 3, '-9': 3, '-11': 3, '-13': 3 });
      await until(p, 'days in', () => window.A.G.of(window.A.S.me).pages === 21);
      const f = await drain(p);
      assert(JSON.stringify(f) === '["pages10"]', 'firsts: ' + JSON.stringify(f));
      await go(p, 'home');
      const want = await p.evaluate(() => 'على السرعة دي هتخلّص الكتاب يوم ' + window.A.L.dayShort(window.A.U.addDays(window.A.U.today(), 24)));
      const fc = await text(p, '.hero .fcast');
      assert(fc.includes(want), 'forecast: ' + fc + ' / want ' + want);
      assert(fc.includes('متأخر عن الخطة بـ٢٠ يوم — ٨ صفحات في اليوم تلحقك'), 'compare: ' + fc);
      return fc;
    });

    await step('Forecast: ahead of the plan, on the main card and the book page', async () => {
      await p.evaluate(async (b) => {
        const { D, U } = window.A;
        await D.saveProg(b, (c) => ({ seen: U.rangesAdd(c.seen, [1, 2, 3, 4, 5, 6, 7, 8]), last: 8 }));
      }, bookId);
      await setDays(p, { '-1': 20, '-3': 20, '-5': 20, '-7': 20, '-9': 20, '-11': 20, '-13': 20 });
      await until(p, 'days in', () => window.A.G.of(window.A.S.me).pages === 140);
      await drain(p);
      await go(p, 'home');
      const want = await p.evaluate(() => window.A.L.dayShort(window.A.U.addDays(window.A.U.today(), 2)));
      const fc = await text(p, '.hero .fcast');
      assert(fc.includes(want) && fc.includes('قبل الخطة بيومين'), 'forecast: ' + fc);
      await H.shot(p, 'goals-home');
      await go(p, 'book-' + bookId);
      const bf = await text(p, '.bp-fc');
      assert(bf.includes('قبل الخطة بيومين'), 'book page: ' + bf);
      await H.shot(p, 'goals-book');
      await lang(p, 'en');
      const en = await text(p, '.bp-fc');
      assert(en.includes("At this pace you'll finish the book on") && en.includes('2 days ahead of the plan'), 'English: ' + en);
      const ent = await text(p, '.bp-time');
      assert(ent.includes('The whole book takes about 50 minutes'), 'English time: ' + ent);
      await lang(p, 'eg');
      return fc;
    });

    await step('With reading time, estimates follow my own speed', async () => {
      await p.evaluate(async () => {
        const { D, U } = window.A;
        await D.updateMe(() => ({ secs: { [U.addDays(U.today(), -1)]: 140 * 120 } }));
      });
      await until(p, 'speed', () => Math.round(window.A.G.secsPerPage()) === 120);
      await go(p, 'book-' + bookId);
      const pt = await text(p, '.plan-time');
      assert(pt.includes('الورد ده حوالي ١٥ دقيقة') && pt.includes('الكتاب كله حوالي ساعة ونص'), 'plan tab: ' + pt);
      await lang(p, 'en');
      const en = await text(p, '.plan-time');
      assert(en.includes('This portion takes about 15 minutes') && en.includes('the whole book about 1.5 hours'), 'English: ' + en);
      await lang(p, 'eg');
      return pt;
    });

    await step('Hitting the daily goal celebrates once', async () => {
      await go(p, 'home');
      await p.evaluate(() => window.A.D.addPagesToday(5, 0));
      await until(p, 'goal done', () => !!document.querySelector('.dgoal.done'));
      await until(p, 'celebrated', () => window.A.Goals.hits === 1);
      await until(p, 'toast', () => /هدف النهارده اتحقق/.test((document.getElementById('toasts') || {}).innerText || ''), null, 15000);
      const g = await text(p, '.dgoal');
      assert(g.includes('٥ من ٥ صفحات النهارده'), 'strip: ' + g);
      await p.evaluate(() => window.A.D.addPagesToday(1, 0));
      await T(1500);
      await drain(p);
      assert((await p.evaluate(() => window.A.Goals.hits)) === 1, 'celebrated twice');
    });

    await step('The goal grows after 5 of 7 days, waits a week, and eases after a bad week; 7 days in a row celebrate once', async () => {
      const ago = (n) => p.evaluate((n) => window.A.U.addDays(window.A.U.today(), n), n);
      await setDays(p, { 0: 6, '-1': 6, '-2': 6, '-3': 2, '-4': 6, '-5': 6, '-6': 6, '-7': 1 }, { goalDaily: { auto: true, pages: 5, at: await ago(-7) } });
      await until(p, 'days in', () => window.A.G.of(window.A.S.me).best >= 7);
      const up = await p.evaluate(() => window.A.Goals.evalGoal(true));
      assert(up && up.dir === 'up' && up.pages === 7 && up.hits === 5, 'up: ' + JSON.stringify(up));
      await until(p, 'stored 7', () => window.A.G.goalOf().pages === 7);
      const f = await drain(p);
      assert(JSON.stringify(f) === '["streak7"]', 'firsts: ' + JSON.stringify(f));
      const again = await p.evaluate(() => window.A.Goals.evalGoal(true));
      assert(again === null, 'changed again within a week: ' + JSON.stringify(again));
      await setDays(p, { 0: 6, '-1': 7, '-2': 1, '-3': 0, '-4': 2, '-5': 0, '-6': 1, '-7': 0 }, { goalDaily: { auto: true, pages: 7, at: await ago(-8) } });
      await until(p, 'days in', () => window.A.G.of(window.A.S.me).pagesToday === 6 && (window.A.S.members.get(window.A.S.me).days || {})[window.A.U.addDays(window.A.U.today(), -2)] === 1);
      const down = await p.evaluate(() => window.A.Goals.evalGoal(true));
      assert(down && down.dir === 'down' && down.pages === 5, 'down: ' + JSON.stringify(down));
      await until(p, 'stored 5', () => window.A.G.goalOf().pages === 5);
      const mid = await p.evaluate(() => window.A.G.goalNext({ on: true, auto: true, pages: 5, at: '2026-01-01' }, { '2026-03-09': 5, '2026-03-08': 9, '2026-03-05': 5, '2026-03-04': 3 }, '2026-03-10'));
      assert(mid === null, 'a so-so week changed the goal: ' + JSON.stringify(mid));
      await drain(p);
    });

    await step('Settings → Reading: daily goal off / number / auto', async () => {
      await go(p, 'settings');
      await p.click('[data-act="goal-mode"][data-v="num"]');
      await p.waitForSelector('#set-goal-n');
      await p.fill('#set-goal-n', '12');
      await p.dispatchEvent('#set-goal-n', 'change');
      await until(p, '12 stored', () => window.A.G.goalOf().pages === 12 && !window.A.G.goalOf().auto);
      await go(p, 'home');
      const g = await text(p, '.dgoal');
      assert(g.includes('٦ من ١٢ صفحة النهارده') && !g.includes('بيكبر'), 'fixed goal: ' + g);
      await go(p, 'settings');
      await p.click('[data-act="goal-mode"][data-v="off"]');
      await until(p, 'off', () => !window.A.G.goalOf().on);
      await go(p, 'home');
      assert(!(await p.$('.dgoal')), 'the strip is still there when off');
      await go(p, 'settings');
      await p.click('[data-act="goal-mode"][data-v="auto"]');
      await until(p, 'auto', () => window.A.G.goalOf().auto && window.A.G.goalOf().pages === window.A.G.goalStart());
      await p.evaluate(() => document.getElementById('set-goal-row').scrollIntoView({ block: 'center' }));
      await H.shot(p, 'goals-settings');
    });

    await step('Weekly streak: weeks with at least N reading days; HUD and hint', async () => {
      await p.click('[data-act="streak-mode"][data-v="week"]');
      await p.waitForSelector('#set-streak-n');
      const map = await p.evaluate(() => {
        const { U } = window.A;
        const ws = U.weekStart(U.today());
        const m = { [ws]: 4 };
        for (let k = 1; k <= 4; k++) for (const d of [0, 2, 4]) m[U.addDays(ws, -7 * k + d)] = 3;
        return m;
      });
      await setDays(p, map);
      await until(p, 'weeks', () => window.A.G.of(window.A.S.me).weekStreak === 4);
      const s = await p.evaluate(() => {
        const s = window.A.G.of(window.A.S.me);
        return { w: s.weekStreak, b: s.bestWeekStreak, left: s.weekLeft, risk: s.weekAtRisk, daily: s.streak >= 0 };
      });
      assert(s.w === 4 && s.b === 4 && s.left === 2 && s.risk && s.daily, JSON.stringify(s));
      await go(p, 'home');
      const chip = await p.evaluate(() => {
        const c = document.querySelector('.hud .hchip.flame');
        return { t: c.innerText.replace(/\s+/g, ' ').trim(), title: c.title, cls: c.className };
      });
      assert(chip.t === '٤ أسابيع' && chip.title === 'فاضل يومين قراية الأسبوع ده' && /risk/.test(chip.cls), 'HUD: ' + JSON.stringify(chip));
      const hint = await text(p, '.dg-wk');
      assert(hint.includes('فاضل يومين قراية الأسبوع ده'), 'hint: ' + hint);
      await H.shot(p, 'goals-weekly');
      await go(p, 'settings');
      await p.selectOption('#set-streak-n', '2');
      await until(p, 'n=2', () => window.A.G.streakPref().n === 2);
      await go(p, 'home');
      assert((await p.$eval('.hud .hchip.flame', (c) => c.title)) === 'فاضل يوم قراية واحد الأسبوع ده', 'n=2 hint');
      await go(p, 'settings');
      await p.selectOption('#set-streak-n', '1');
      await until(p, 'n=1', () => window.A.G.of(window.A.S.me).weekStreak === 5 && !window.A.G.of(window.A.S.me).weekAtRisk);
      await lang(p, 'en');
      await go(p, 'home');
      const en = await p.evaluate(() => {
        const c = document.querySelector('.hud .hchip.flame');
        return c.innerText.replace(/\s+/g, ' ').trim() + ' | ' + c.title;
      });
      assert(en.startsWith('5 weeks') && en.includes('5 weeks in a row with at least 1 reading day'), 'English: ' + en);
      await lang(p, 'eg');
      await go(p, 'settings');
      await p.selectOption('#set-streak-n', '3');
      await p.click('[data-act="streak-mode"][data-v="day"]');
      await until(p, 'daily again', () => window.A.G.streakPref().mode === 'day');
      await go(p, 'home');
      const d = await p.$eval('.hud .hchip.flame', (c) => c.innerText.replace(/\s+/g, ' ').trim());
      assert(/يوم$/.test(d), 'daily HUD: ' + d);
      return chip.t;
    });

    await step('Firsts: quote, portion, book (after the finish sheet) — each once', async () => {
      await p.evaluate(async (b) => {
        const { D, S, U } = window.A;
        await D.set(`notes/${D.newId()}`, { b, page: 2, kind: 'quote', text: 'القراءة سفر بلا حقائب.', rect: { x: 0.12, y: 0.3, w: 0.7, h: 0.06 }, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
      }, bookId);
      let f = await drain(p);
      assert(JSON.stringify(f) === '["quote"]', 'quote: ' + JSON.stringify(f));
      await p.evaluate((b) => window.A.D.saveProg(b, (c) => ({ done: Object.assign({}, c.done, { w1: new Date().toISOString() }) })), bookId);
      f = await drain(p);
      assert(JSON.stringify(f) === '["wird"]', 'portion: ' + JSON.stringify(f));
      await p.evaluate((b) => window.A.V.finishBook(b), bookId);
      await p.waitForSelector('.sheet.celebrate #fin-stars');
      await T(2600);
      assert(!(await p.$('.first-celeb')), 'the first came over the finish sheet');
      await p.evaluate(() => document.querySelector('#fin-stars').closest('.sheet').querySelector('.sh-head [data-close]').click());
      await waitFirst(p, 'book');
      await H.shot(p, 'goals-first');
      f = await drain(p);
      assert(f[0] === 'book' && f.filter((x) => x === 'book').length === 1, 'book: ' + JSON.stringify(f));
    });

    await step('A friend joins; their history does not celebrate on the first run', async () => {
      const cid = await p.evaluate(() => window.A.P.circle().id);
      code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      site = env.siteUrl.replace(/\/?$/, '/');
      const u = await H.newUser(browser, env, 'friend@test.local', Object.assign({ url: site + '#join-' + code }, vp));
      q = u.page;
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', 'سارة');
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(q, 'firsts initialised', () => !!(window.A.S.priv && window.A.S.priv.firsts));
      // As if this person used the app before firsts existed: pause, build history, forget the firsts, reopen.
      await q.evaluate(async () => {
        const { D, S, U } = window.A;
        S.loaded.myProg = false;
        await D.updateMe(() => ({ days: { [U.addDays(U.today(), -1)]: 12 } }));
        const to = [...S.members.keys()].find((x) => x !== S.me);
        await D.set(`pokes/${D.newId()}`, { to, from: S.me, kind: 'cheer', at: U.nowIso(), b: '', wid: '' });
        await D.privUpdate((cur) => {
          delete cur.firsts;
          return cur;
        });
      });
      await until(q, 'firsts gone', () => !!window.A.S.priv && !window.A.S.priv.firsts);
      await q.reload({ waitUntil: 'load' });
      await q.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(q, 'firsts marked', () => !!(window.A.S.priv && window.A.S.priv.firsts && window.A.S.priv.firsts.pages10 && window.A.S.priv.firsts.cheer));
      const f = await drain(q, 3500);
      assert(!f.length, 'history celebrated: ' + f);
      await drain(p);
    });

    await step('Whole-circle days: G.circleFullDays and the «الحلقة كاملة» badge', async () => {
      const days = await p.evaluate(() => Array.from({ length: 7 }, (_, i) => window.A.U.addDays(window.A.U.today(), -60 + i)));
      const mine = await p.evaluate(() => Object.assign({}, window.A.S.members.get(window.A.S.me).days));
      for (const d of days) mine[d] = 2;
      await setDays(p, mine);
      const theirs = { '-61': 3 };
      days.forEach((d, i) => (theirs[d] = i + 1));
      await setDays(q, theirs);
      await until(p, 'circle days', (n) => window.A.G.circleFullDays().length === n, days.length, 10000);
      const r = await p.evaluate(() => {
        const s = window.A.G.of(window.A.S.me);
        const got = s.badges.filter((x) => x.b.g === 'together' && x.got).map((x) => x.b.id);
        return { days: window.A.G.circleFullDays(), n: s.circleFull, got, group: window.A.G.badgeGroups(s).some((g) => g.g === 'together') };
      });
      assert(JSON.stringify(r.days) === JSON.stringify(days), 'days: ' + JSON.stringify(r.days));
      assert(r.n === 7 && JSON.stringify(r.got) === '["together1","together7"]' && r.group, JSON.stringify(r));
      const theirN = await q.evaluate(() => window.A.G.of(window.A.S.me).circleFull);
      assert(theirN === 7, 'friend sees ' + theirN);
      await drain(p);
      return days[0] + ' … ' + days[6];
    });

    await step('English: the first cheer celebrates; the goal strip reads well', async () => {
      await lang(p, 'en');
      await go(p, 'home');
      const g = await text(p, '.dgoal .dg-t');
      const want = await p.evaluate(() => `${window.A.G.goalOf().have} of ${window.A.G.goalOf().pages} pages today`);
      assert(g.includes(want) && g.includes('a goal that grows with you'), 'strip: ' + g + ' / want ' + want);
      const to = await q.evaluate(() => window.A.S.me);
      await p.evaluate((to) => window.A.V.poke(to, 'cheer', {}), to);
      await waitFirst(p, 'cheer');
      const t = await text(p, '.sheet.celebrate');
      assert(t.includes('Your first cheer!') && t.includes('A first!'), 'sheet: ' + t);
      await H.shot(p, 'goals-first-en');
      const f = await drain(p);
      assert(JSON.stringify(f) === '["cheer"]', JSON.stringify(f));
      await lang(p, 'eg');
    });

    await step('After a reload nothing celebrates again; every first is remembered', async () => {
      await p.reload({ waitUntil: 'load' });
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      const f = await drain(p, 4000);
      assert(!f.length, 'again: ' + f);
      const keys = await p.evaluate(() => Object.keys(window.A.S.priv.firsts).sort());
      assert(JSON.stringify(keys) === JSON.stringify(['_since', 'book', 'cheer', 'pages10', 'quote', 'streak7', 'wird']), 'remembered: ' + keys);
      return keys.join(', ');
    });

    await step('No errors in the console', async () => {
      const errs = [...(p.__errors || []), ...((q && q.__errors) || [])].filter((e) => !/favicon|fonts|404/.test(e));
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
