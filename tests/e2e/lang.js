#!/usr/bin/env node
/*
 * Languages on a phone (390×844): «مصري» (default), «العربية» (فصحى) and English. Switches to فصحى in
 * Settings, walks every screen, sheet and menu, and fails if Egyptian words show up; then checks that
 * the sign-in switch remembers the Arabic you chose, and that مصري comes back unchanged.
 *
 *   node tests/e2e/lang.js        # PASS/FAIL per step, exit 1 on any FAIL
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
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, 30).join('\n      ')}`);
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
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap, .menu-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
};
/* Words that only Egyptian Arabic uses (whole words). */
const EGY = ['دلوقتي', 'عايز', 'عايزة', 'مفيش', 'إزاي', 'ازاي', 'النهارده', 'امبارح', 'إمبارح', 'بكرة', 'بتاع', 'بتاعي', 'بتاعتي', 'لسه', 'كده', 'اللي', 'عشان', 'علشان', 'إيه', 'ليه', 'شوية', 'حاجة', 'زي', 'دي', 'ده', 'مش', 'قراية', 'القراية', 'خلّص', 'خلّصت', 'خلّصته', 'دوس', 'كمّل', 'هتلاقي', 'برّه', 'جوه', 'فاضل', 'تاني', 'بيتفتح', 'اتفتح', 'ابعت', 'إنت', 'انت', 'هنا؟'];
const WORD = new RegExp(`(^|[^\\u0600-\\u06FF])(${EGY.join('|')})(?=$|[^\\u0600-\\u06FF])`, 'g');
const seen = new Map();
async function scan(p, where) {
  const text = await p.evaluate(() => {
    const parts = [document.body.innerText];
    for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) parts.push(el.getAttribute('aria-label') || '', el.getAttribute('title') || '', el.getAttribute('placeholder') || '');
    return parts.join('\n');
  });
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(WORD)) {
      const k = m[2] + ' ← ' + line.trim().slice(0, 90);
      if (!seen.has(k)) seen.set(k, where);
    }
  }
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p;
  try {
    await step('Sign in, a circle with a book and a plan', async () => {
      const u = await H.newUser(browser, env, 'lang@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = u.page;
      await p.fill('#cn-name', 'حلقة اللغة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'ليلى');
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
      await closeSheets(p);
    });

    await step('Settings → Language offers مصري, العربية and English; العربية switches the whole app', async () => {
      await p.click('[data-go="settings"]');
      await T(400);
      const opts = await p.$$eval('.lang-row [data-act="lang"]', (x) => x.map((e) => e.textContent.trim()));
      await p.click('.lang-row [data-v="fu"]');
      await T(600);
      const st = await p.evaluate(() => ({ lang: window.A.L.lang(), html: document.documentElement.lang, dir: document.documentElement.dir, on: document.querySelector('.lang-row .on').dataset.v }));
      await H.shot(p, 'l01-settings-fusha');
      assert(opts.join() === 'مصري,العربية,English', opts.join());
      assert(st.lang === 'fu' && st.html === 'ar' && st.dir === 'rtl' && st.on === 'fu', JSON.stringify(st));
      ctx.fu = true;
    }, ['book']);

    await step('فصحى everywhere: every screen, tab, sheet and menu, with no Egyptian words', async () => {
      const go = async (r, shot) => {
        await closeSheets(p);
        await p.click(`[data-go="${r}"]`);
        await T(500);
        await scan(p, r);
        if (shot) await H.shot(p, shot);
      };
      await go('home', 'l02-home');
      await p.evaluate(() => document.querySelector('.hcards') && document.querySelector('.hcards').scrollIntoView({ block: 'center' }));
      await scan(p, 'home cards');
      await go('books');
      for (const tab of ['plan', 'talk', 'notes', 'people']) {
        await p.evaluate(([id, t]) => window.A.V.go('book-' + id, { tab: t }), [ctx.book.id, tab]);
        await T(500);
        await scan(p, 'book ' + tab);
        if (tab === 'plan') await H.shot(p, 'l03-book');
      }
      await go('circle', 'l04-circle');
      for (const seg of await p.$$eval('[data-act="circle-tab"], .seg [data-act^="circ"]', (x) => x.map((e) => e.dataset.tab || e.dataset.v || '')).catch(() => [])) {
        if (!seg) continue;
        await p.click(`[data-act="circle-tab"][data-tab="${seg}"]`).catch(() => {});
        await T(300);
        await scan(p, 'circle ' + seg);
      }
      await go('me', 'l05-me');
      await go('shelf');
      await go('settings');
      // sheets from Today
      for (const act of ['quests', 'goal-edit', 'invite']) {
        await closeSheets(p);
        await p.click('[data-go="home"]');
        await T(300);
        const b = await p.$(`[data-act="${act}"]`);
        if (!b) continue;
        await b.click();
        await T(500);
        await scan(p, 'sheet ' + act);
      }
      await closeSheets(p);
      // a badge sheet and a secret badge sheet
      await p.click('[data-go="me"]');
      await T(400);
      await p.click('.badges .bdg[data-g="pages"]');
      await T(400);
      await scan(p, 'badge sheet');
      await closeSheets(p);
      await p.click('.badges.secrets .bdg.secret');
      await T(400);
      await scan(p, 'secret badge');
      await closeSheets(p);
      // the reader, its menu, the goal sheet and the paper colours
      await p.click('[data-go="home"]');
      await T(300);
      await p.locator('[data-act="read"]:visible').first().click();
      await until(p, 'page painted', () => [...document.querySelectorAll('.pg canvas')].some((c) => c.width > 100), null, 30000);
      await T(600);
      await scan(p, 'reader');
      await H.shot(p, 'l06-reader');
      await p.click('.rd [data-act="more"]');
      await T(400);
      await scan(p, 'reader menu');
      await H.shot(p, 'l07-reader-menu');
      await p.keyboard.press('Escape');
      await T(300);
      await p.click('#rd-goal');
      await T(400);
      await scan(p, 'goal sheet');
      await closeSheets(p);
      for (let pg = 1; pg <= 6; pg++) {
        await p.evaluate(() => window.A.R._cheerReset());
        await p.evaluate((x) => window.A.R._markSeen(x), pg);
        await T(80);
        await scan(p, 'reader cheers');
      }
      const log = await p.evaluate(() => window.A.R._cheerState());
      await scan(p, 'reader cheers');
      await p.click('.rd [data-act="close"]');
      await T(800);
      await scan(p, 'session summary');
      await H.shot(p, 'l08-summary');
      await closeSheets(p);
      if (seen.size) throw new Error(`${seen.size} Egyptian words in فصحى:\n` + [...seen].map(([k, w]) => `[${w}] ${k}`).slice(0, 40).join('\n'));
      return 'cheer: ' + log.text;
    }, ['fu']);

    await step('The sign-in switch goes to English and back to the Arabic you chose', async () => {
      const r = await p.evaluate(() => {
        const L = window.A.L;
        L.toggle();
        const a = L.lang();
        L.toggle();
        return [a, L.lang()];
      });
      assert(r.join() === 'en,fu', r.join());
    }, ['fu']);

    await step('Back to مصري: the Egyptian text is as before', async () => {
      await p.click('[data-go="settings"]');
      await T(300);
      await p.click('.lang-row [data-v="ar"]');
      await T(500);
      await p.click('[data-go="home"]');
      await T(400);
      const t = await p.evaluate(() => document.body.innerText);
      const lang = await p.evaluate(() => [window.A.L.lang(), document.documentElement.lang]);
      assert(lang.join() === 'ar,ar-EG', lang.join());
      assert(/النهارده|يلا/.test(t), 'no Egyptian on Today: ' + t.slice(0, 200));
    }, ['fu']);

    await step('No errors in the console', async () => {
      const errs = p.__errors || [];
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
