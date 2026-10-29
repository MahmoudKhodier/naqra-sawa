#!/usr/bin/env node
/*
 * The game side on a phone (390×844, touch, 2× screen) against the fake Supabase: the daily goal ring, «+1»,
 * quiet cheers, ¼ ½ ¾ of the book, friends on the portion bar, focus sessions, the page turn, paper colours,
 * new and secret badges, rewards (frames, emoji, papers), the journey road, the reading garden, share cards
 * and the month in reading.
 *
 *   node tests/e2e/play.js        # PASS/FAIL per step, exit 1 on any FAIL
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
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, process.env.LONGERR ? 25 : 6).join('\n      ')}`);
  }
}
async function until(page, what, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const closeSheets = async (p) => {
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await T(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
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
async function showBars(p) {
  if (await p.$('.rd.ui-off')) {
    const cdp = await p.context().newCDPSession(p);
    const vp = p.viewportSize();
    await tap(cdp, vp.width / 2, vp.height / 2);
    await T(450);
    await cdp.detach();
  }
}
/** Save a share card drawn by the app as a PNG next to the screenshots. */
async function card(p, kind, data, name) {
  const url = await p.evaluate(async ([k, d]) => (await window.A.Share.render(k, d)).toDataURL('image/png'), [kind, data]);
  const file = path.join(H.SHOTS, name + '.png');
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return url.length;
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p, q;
  try {
    await step('Two members, a 120-page book with a plan', async () => {
      const a = await H.newUser(browser, env, 'play@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = a.page;
      await p.fill('#cn-name', 'حلقة اللعب');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.selectOption('#ab-lang', 'ar');
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.click('#pl-form button.btn.gold');
      await until(p, 'book with plan', () => [...window.A.S.books.values()].some((b) => (b.wirds || []).length > 0), null, 20000);
      ctx.book = await p.evaluate(() => [...window.A.S.books.values()][0]);
      const code = (await env.fake.sql('select invite_code from public.circles'))[0].invite_code;
      const b = await H.newUser(browser, env, 'friend@test.local', { url: env.siteUrl + '#join-' + code, viewport: { width: 390, height: 844 } });
      q = b.page;
      await q.waitForSelector('#join-name', { timeout: 20000 });
      await q.fill('#join-name', 'سارة');
      await q.click('#join-form button[type=submit]');
      await q.waitForSelector('.home');
      await closeSheets(q);
      await closeSheets(p);
      return `${ctx.book.pages} pages, ${ctx.book.wirds.length} portions`;
    });

    await step('Two weeks of reading history: night, mornings, a whole day, midnight, goals, focus, a long sitting', async () => {
      await p.evaluate(async () => {
        const { U, D } = window.A;
        const days = {}, hrs = {}, gd = {}, focus = {}, long = {}, secs = {};
        for (let i = 1; i <= 12; i++) {
          const d = U.addDays(U.today(), -i);
          days[d] = 25;
          secs[d] = 1500;
          hrs[d] = (1 << 22) | (i <= 6 ? 1 << 6 : 0);
          if (i <= 8) gd[d] = 10;
          if (i <= 6) focus[d] = { n: 1, m: 20 };
        }
        hrs[U.addDays(U.today(), -2)] |= 1 | (1 << 13) | (1 << 18); // midnight, afternoon, evening too
        long[U.addDays(U.today(), -3)] = 70;
        await D.updateMe(() => ({ days, hrs, gd, focus, long, secs, dg: { k: 'pages', n: 10 } }));
      });
      await T(600);
      const s = await p.evaluate(() => {
        const s = window.A.G.of(window.A.S.me);
        return { night: s.nightDays, early: s.earlyDays, goal: s.goalDays, focus: s.focusN, longest: s.longest, lv: s.lv, secrets: s.badges.filter((x) => x.got && x.b.secret).map((x) => x.b.id), got: s.badges.filter((x) => x.got).map((x) => x.b.id) };
      });
      assert(s.night === 12 && s.early === 6 && s.goal === 8 && s.focus === 6 && s.longest === 70, JSON.stringify(s));
      assert(s.secrets.includes('x_midnight') && s.secrets.includes('x_allday'), 'secrets: ' + s.secrets.join());
      for (const id of ['night5', 'early5', 'goal7', 'focus5', 'deep30', 'deep60']) assert(s.got.includes(id), 'missing badge ' + id);
      ctx.history = true;
      return `level ${s.lv}; ${s.got.length} badges incl. secrets ${s.secrets.join(', ')}`;
    }, ['book']);

    await step('Today: the goal ring card, my plant and the swipeable cards', async () => {
      await closeSheets(p);
      await p.click('[data-go="home"]');
      await T(500);
      await closeSheets(p);
      const h = await p.evaluate(() => ({ goal: !!document.querySelector('.hcard.goalc .ring'), plant: !!document.querySelector('.hcard.plantc svg.plant') }));
      await p.evaluate(() => document.querySelector('.hcards').scrollIntoView({ block: 'center' }));
      await T(300);
      await H.shot(p, 'p01-home-cards');
      assert(h.goal && h.plant, JSON.stringify(h));
    }, ['history']);

    await step('Reader: the ring fills with each page, «+1» pops, the goal cheer comes once', async () => {
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.locator('[data-act="read"]:visible').first().click();
      await until(p, 'page painted', () => [...document.querySelectorAll('.pg canvas')].some((c) => c.width > 100), null, 30000);
      await closeSheets(p);
      const w = ctx.book.wirds[0];
      const n0 = await p.$eval('#rd-goal-n', (e) => e.textContent);
      let pops = 0;
      for (let pg = w.from; pg < w.from + 10; pg++) {
        await p.evaluate(() => window.A.R._cheerReset());
        await p.evaluate((x) => window.A.R._markSeen(x), pg);
        pops += await p.$$eval('.plus1', (x) => x.length);
        await T(90);
      }
      // the goal cheer waits for the one showing (half-way came at the same page)
      await until(p, 'goal cheer', () => window.A.R._cheerState().log.includes('goal'), null, 8000).catch(() => {});
      const r = await p.evaluate(() => ({ n: document.querySelector('#rd-goal-n').textContent, met: document.querySelector('#rd-goal').classList.contains('met'), log: window.A.R._cheerState().log }));
      await H.shot(p, 'p02-reader-ring');
      assert(n0 === '٠' && r.n === '١٠' && r.met, 'ring: ' + n0 + ' → ' + r.n + ' met ' + r.met);
      assert(pops >= 5, '+1 pops: ' + pops);
      assert(r.log.filter((k) => k === 'goal').length === 1, 'goal cheer: ' + r.log.join());
      ctx.open = true;
      return `${n0} → ${r.n}; cheers ${r.log.join(', ')}`;
    }, ['history']);

    await step('Friends on the portion bar: a friend\'s avatar sits where they are; tapping the bar lists everyone', async () => {
      const w = ctx.book.wirds[0];
      await q.evaluate(([id, a, b]) => window.A.D.saveProg(id, () => ({ seen: [[a, b]], last: b })), [ctx.book.id, w.from, w.from + 13]);
      await until(p, 'friend on the bar', () => !!document.querySelector('#rd-wprog .rd-fr'), null, 10000);
      await showBars(p);
      const x = await p.$eval('#rd-wprog .rd-fr', (e) => e.style.getPropertyValue('--x'));
      await H.shot(p, 'p03-friends-bar');
      await p.click('#rd-wprog');
      await p.waitForSelector('.sheet-wrap.in .fr-list');
      const rows = await p.$$eval('.sheet-wrap.in .fr-list li', (x) => x.length);
      await H.shot(p, 'p03b-friends-sheet');
      await closeSheets(p);
      assert(rows === 2, 'rows ' + rows);
      return 'friend at ' + x;
    }, ['open']);

    await step('Catching up with a friend and a quarter of the book bring a cheer each', async () => {
      const w = ctx.book.wirds[0];
      for (let pg = w.from + 10; pg <= w.from + 31 && pg <= ctx.book.pages; pg++) {
        await p.evaluate(() => window.A.R._cheerReset());
        await p.evaluate((x) => window.A.R._markSeen(x), pg);
        await T(40);
      }
      await T(300);
      const log = (await p.evaluate(() => window.A.R._cheerState())).log;
      assert(log.includes('passed'), 'no catch-up cheer: ' + log.join());
      assert(log.includes('m0'), 'no quarter-of-the-book cheer: ' + log.join());
      return log.join(', ');
    }, ['open']);

    await step('Focus session: the ring counts down, cheers go quiet, finishing saves it with XP', async () => {
      await showBars(p);
      await p.click('#rd-goal');
      await p.waitForSelector('.sheet-wrap.in .goal-sheet');
      await H.shot(p, 'p04-goal-sheet');
      await p.click('.sheet-wrap.in [data-focus="10"]');
      await T(400);
      const on = await p.$eval('#rd-goal', (e) => e.classList.contains('focus'));
      await H.shot(p, 'p04b-focus-running');
      await p.evaluate(() => window.A.R._cheerReset());
      const before = (await p.evaluate(() => window.A.R._cheerState())).log.length;
      await p.evaluate(() => window.A.R._markSeen(90));
      await T(100);
      const quiet = (await p.evaluate(() => window.A.R._cheerState())).log.length === before;
      await p.evaluate(() => window.A.R._focusAt(598));
      await until(p, 'focus finished', () => !document.querySelector('#rd-goal').classList.contains('focus'), null, 6000);
      await until(p, 'focus saved', () => {
        const m = window.A.S.members.get(window.A.S.me);
        return m.focus && m.focus[window.A.U.today()] && m.focus[window.A.U.today()].n === 1;
      });
      const log = (await p.evaluate(() => window.A.R._cheerState())).log;
      assert(on && quiet && log.includes('focus'), JSON.stringify({ on, quiet, log }));
    }, ['open']);

    await step('Page by page: the page turns over its spine edge (with the paper sound on)', async () => {
      await p.evaluate(() => window.A.U.store.set('rdTurnSound', true));
      await showBars(p);
      await p.click('.rd [data-act="more"]');
      await p.click('.mi:has-text("صفحة صفحة")');
      await T(900);
      const cdp = await p.context().newCDPSession(p);
      const c0 = await p.evaluate(() => window.A.R.current().page);
      await swipe(cdp, 80, 320);
      await T(170);
      const leaf = await p.evaluate(() => {
        const l = document.querySelector('.turn-leaf');
        return l ? { origin: l.style.transformOrigin, t: getComputedStyle(l).transform } : null;
      });
      await H.shot(p, 'p05-page-turn');
      await T(700);
      const c1 = await p.evaluate(() => window.A.R.current().page);
      const gone = !(await p.$('.turn-leaf'));
      await cdp.detach();
      assert(leaf && /right/.test(leaf.origin) && leaf.t !== 'none', 'leaf: ' + JSON.stringify(leaf));
      assert(c1 === c0 + 1 && gone, `page ${c0} → ${c1}, leaf gone ${gone}`);
      return `p. ${c0} → ${c1}; leaf turns over its ${leaf.origin}`;
    }, ['open']);

    await step('Paper colours: unlocked ones apply (mint, navy night); still-locked ones explain how', async () => {
      const palette = async () => {
        await showBars(p);
        await p.click('.rd [data-act="more"]');
        await p.click('.mi:has-text("لون الورق")');
        await p.waitForSelector('.sheet-wrap.in .papers');
      };
      await palette();
      const st = await p.$$eval('.sheet-wrap.in .paper', (x) => x.map((e) => e.dataset.paper + (e.classList.contains('locked') ? ':L' : '')));
      await H.shot(p, 'p06-papers');
      await p.click('.sheet-wrap.in [data-paper="mint"]');
      await T(400);
      const mint = await p.$eval('.rd', (e) => e.dataset.theme);
      await H.shot(p, 'p06b-mint');
      await palette();
      await p.click('.sheet-wrap.in [data-paper="ink"]');
      await T(400);
      const ink = await p.$eval('.rd', (e) => e.dataset.theme);
      await H.shot(p, 'p06c-ink');
      await palette();
      await p.click('.sheet-wrap.in [data-paper="day"]');
      await T(300);
      assert(mint === 'mint' && ink === 'ink', mint + ' ' + ink);
      assert(st.includes('oled:L') && st.includes('mint') && st.includes('ink'), st.join());
      return st.join(' ');
    }, ['open']);

    await step('Closing: the session summary shows the goal and offers a picture to share', async () => {
      await showBars(p);
      await p.click('.rd [data-act="close"]');
      await p.waitForSelector('.sheet-wrap.in .ss-goal', { timeout: 8000 });
      await H.shot(p, 'p07-session');
      await p.click('.sheet-wrap.in [data-act="share-session"]');
      await p.waitForSelector('.sheet-wrap.in .sh-img', { timeout: 15000 });
      await until(p, 'card loaded', () => {
        const i = document.querySelector('.sheet-wrap.in .sh-img');
        return i && i.naturalWidth === 1080;
      });
      await T(400);
      await H.shot(p, 'p07b-share-session');
      await closeSheets(p);
    }, ['open']);

    await step('Profile: new badges, secret ones as «؟؟؟» until found, rewards and what unlocks next', async () => {
      await p.click('[data-go="me"]');
      await T(600);
      const b = await p.evaluate(() => ({
        secrets: document.querySelectorAll('.badges.secrets .bdg').length,
        mystery: document.querySelectorAll('.badges.secrets .bdg.secret').length,
        found: [...document.querySelectorAll('.badges.secrets .bdg.got b')].map((e) => e.textContent),
        next: document.querySelectorAll('.rewards .rw-next li').length,
      }));
      await p.evaluate(() => document.querySelector('.rewards').scrollIntoView({ block: 'start' }));
      await T(300);
      await H.shot(p, 'p08-profile-rewards');
      await p.evaluate(() => document.querySelector('.badges.secrets').scrollIntoView({ block: 'center' }));
      await T(300);
      await H.shot(p, 'p08b-secret-badges');
      await p.click('.badges.secrets .bdg.secret');
      await p.waitForSelector('.sheet-wrap.in .bd-sheet');
      const hint = await p.$eval('.sheet-wrap.in .bd-tip', (e) => e.textContent);
      await closeSheets(p);
      assert(b.secrets === 8 && b.mystery === 6 && b.found.length === 2, JSON.stringify(b));
      assert(/تلميح/.test(hint), hint);
      assert(b.next === 3, 'next rewards ' + b.next);
      return `found: ${b.found.join('، ')}`;
    }, ['history']);

    await step('Settings: choose an unlocked frame; a locked frame and locked emoji say how to unlock', async () => {
      await p.click('[data-go="settings"]');
      await T(500);
      await p.evaluate(() => document.querySelector('.frames').scrollIntoView({ block: 'center' }));
      await T(200);
      await H.shot(p, 'p09-frames');
      await p.click('.frm[data-fr="moon"]');
      await until(p, 'frame saved', () => (window.A.S.members.get(window.A.S.me) || {}).frame === 'moon');
      await T(300);
      const has = await p.evaluate(() => !!document.querySelector('.hud-me .av.fr-moon'));
      await p.click('.frm.locked');
      await T(300);
      const toast = await p.$eval('#toasts', (e) => e.textContent);
      await p.click('.emo-b.locked');
      await T(300);
      const locked = await p.evaluate(() => (window.A.S.members.get(window.A.S.me) || {}).emoji || '');
      await H.shot(p, 'p09b-frame-chosen');
      assert(has, 'frame not on my avatar');
      assert(/بيتفتح/.test(toast), toast);
      assert(!locked, 'a locked emoji was set: ' + locked);
    }, ['history']);

    await step('Journey: a road under the portions, everyone on it, scenery and a finish line', async () => {
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), ctx.book.id);
      await until(p, 'road drawn', () => !!document.querySelector('.wpv-road .r-base'));
      const j = await p.evaluate(() => ({ prog: !!document.querySelector('.wpv-road .r-prog'), me: !!document.querySelector('.wpv-avs .me'), deco: document.querySelectorAll('.wpv-deco').length, end: !!document.querySelector('.wpv-end') }));
      await p.evaluate(() => document.querySelector('.wpv-list').scrollIntoView({ block: 'start' }));
      await T(300);
      await H.shot(p, 'p10-journey');
      assert(j.me && j.deco >= 1 && j.end, JSON.stringify(j));
      return JSON.stringify(j);
    }, ['book']);

    await step('Garden: a plant for each member on the Progress tab', async () => {
      await p.evaluate((id) => window.A.V.go('book-' + id, { tab: 'people' }), ctx.book.id);
      await p.waitForSelector('.gd-bed .gd-plot svg.plant');
      const n = await p.$$eval('.gd-bed .gd-plot', (x) => x.length);
      await p.evaluate(() => document.querySelector('.garden').scrollIntoView({ block: 'start' }));
      await T(300);
      await H.shot(p, 'p11-garden');
      assert(n === 2, 'plants ' + n);
      // the plant stages, side by side, for the review
      await p.evaluate(() => {
        const G = window.A.Garden;
        const box = document.createElement('div');
        box.id = 'plant-demo';
        box.style.cssText = 'position:fixed;inset:0;z-index:99;background:#fff;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;padding:10px';
        const cases = [
          { stage: 0, flowers: 0, wilt: 0 }, { stage: 1, flowers: 0, wilt: 0 }, { stage: 2, flowers: 1, wilt: 0 }, { stage: 3, flowers: 3, wilt: 0 },
          { stage: 4, flowers: 5, wilt: 0 }, { stage: 5, flowers: 8, wilt: 0 }, { stage: 5, flowers: 8, wilt: 0, golden: true }, { stage: 4, flowers: 4, wilt: 1 }, { stage: 4, flowers: 4, wilt: 2 },
        ];
        box.innerHTML = cases.map((c, i) => `<div style="width:118px;text-align:center;font:12px sans-serif">${G.plant(c, 'demo' + i).replace('<svg ', '<svg style="width:110px;height:138px" ')}<br>${JSON.stringify(c).replace(/[{}"]/g, '')}</div>`).join('');
        document.body.appendChild(box);
      });
      await T(300);
      await H.shot(p, 'p11b-plant-stages');
      await p.evaluate(() => document.getElementById('plant-demo').remove());
    }, ['book']);

    await step('Month in reading: a story that moves on by itself, taps go back and forth, ends with sharing', async () => {
      await p.click('[data-go="me"]');
      await T(400);
      await p.click('.month-card [data-act="wrapped"]');
      await p.waitForSelector('.wrapped.in .wr-slide.on');
      await T(600);
      await H.shot(p, 'p12-wrapped-1');
      const n = await p.$$eval('.wrapped .wr-slide', (x) => x.length);
      const cdp = await p.context().newCDPSession(p);
      const shots = [];
      for (let i = 1; i < n; i++) {
        await p.mouse.click(60, 500); // RTL: the left side goes on
        await T(650);
        shots.push(await p.$eval('.wrapped .wr-slide.on', (e) => e.dataset.i));
        await H.shot(p, `p12-wrapped-${i + 1}`);
      }
      await cdp.detach();
      await p.click('.wrapped [data-wr="share"]');
      await p.waitForSelector('.sheet-wrap.in .sh-img', { timeout: 15000 });
      await until(p, 'month card', () => {
        const i = document.querySelector('.sheet-wrap.in .sh-img');
        return i && i.naturalWidth === 1080;
      });
      await T(300);
      await H.shot(p, 'p13-wrapped-share');
      await closeSheets(p);
      await p.click('.wrapped [data-wr="close"]');
      await T(500);
      assert(n >= 5 && shots[shots.length - 1] === String(n - 1), n + ' slides; went through ' + shots.join());
      return n + ' slides';
    }, ['history']);

    await step('Share cards: quote (with the highlighted lines), finished book, badge, level, month', async () => {
      const crop = await p.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 600;
        c.height = 140;
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, 600, 140);
        x.fillStyle = 'rgba(245,197,66,.45)';
        x.fillRect(10, 20, 580, 100);
        x.fillStyle = '#222';
        x.font = '28px Amiri';
        x.direction = 'rtl';
        x.textAlign = 'right';
        x.fillText('وخيرُ جليسٍ في الزمانِ كتابُ', 580, 62);
        x.fillText('ومن لم يقرأ إلا كتابًا واحدًا فاحذره', 580, 104);
        return c.toDataURL('image/jpeg', 0.9);
      });
      const sizes = [];
      sizes.push(await card(p, 'quote', { text: 'جملة تستاهل نقف عندها ونفكر فيها شوية', img: crop, book: 'رحلة في عالم الكتب', author: 'مؤلف تجريبي', by: 'منى' }, 'card-quote'));
      sizes.push(await card(p, 'quote', { text: 'القراءة تمنحني أكثر من حياة واحدة، وكل كتاب نافذة على عالم جديد لم أكن أعرفه من قبل.', book: 'عن القراءة', by: 'منى' }, 'card-quote-text'));
      sizes.push(await card(p, 'book', { book: Object.assign({}, ctx.book, { title: 'رحلة في عالم الكتب', author: 'مؤلف تجريبي' }), days: 21, notes: 14, circle: 'حلقة اللعب' }, 'card-book'));
      sizes.push(await p.evaluate(() => window.A.G.BADGES.find((b) => b.id === 'night5')).then((b) => card(p, 'badge', { badge: b, tier: 'برونزي' }, 'card-badge')));
      sizes.push(await p.evaluate(() => window.A.G.BADGES.find((b) => b.id === 'x_midnight')).then((b) => card(p, 'badge', { badge: b, tier: 'سري' }, 'card-badge-secret')));
      sizes.push(await card(p, 'level', { lv: 5, title: 'قارئ نهم', xp: 712, pages: 340 }, 'card-level'));
      sizes.push(await card(p, 'session', { book: 'رحلة في عالم الكتب', pages: 12, mins: 18, streak: 13, goalF: 1 }, 'card-session'));
      sizes.push(await card(p, 'month', { title: 'شهر أكتوبر ٢٠٢٦', who: 'منى', pages: 412, days: 19, time: '٩٫٥ ساعة', best: 12, top: ctx.book, type: 'إنت بومة الليل 🦉' }, 'card-month'));
      assert(sizes.every((x) => x > 20000), 'empty cards: ' + sizes.join());
      return sizes.length + ' cards';
    }, ['history']);

    await step('No errors in the console', async () => {
      const errs = (p.__errors || []).concat(q ? q.__errors || [] : []);
      assert(!errs.length, errs.slice(0, 5).join('\n'));
    });
  } finally {
    await browser.close();
    await env.stop();
  }
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n==== ${results.filter((r) => r.status === 'PASS').length} passed, ${failed} failed, ${results.filter((r) => r.status === 'SKIP').length} skipped — screenshots in tests/e2e/shots`);
  process.exit(failed ? 1 : 0);
})();
