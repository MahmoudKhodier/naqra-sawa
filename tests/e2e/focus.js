#!/usr/bin/env node
/*
 * «قعدة تركيز» (focus session) in the PDF reader, on a phone (390×844, touch, 2× screen), through the real UI
 * against the fake Supabase.
 *
 *   node tests/e2e/focus.js        # PASS/FAIL per step, exit 1 on any FAIL
 *
 * Book: fixtures/arabic-40.pdf. The reader's clock is sped up with the test-only A.R._focusSpeed(k)
 * (k ticks a second), so a 10-minute session takes a few seconds.
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
    console.log(`FAIL  ${name}  (${Date.now() - t0} ms)\n      ${String((e && e.message) || e).split('\n').slice(0, process.env.LONGERR ? 25 : 5).join('\n      ')}`);
  }
}
async function until(page, what, fn, arg, timeout = 15000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const focus = (p) => p.evaluate(() => window.A.R._focus());
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await T(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function showBars(p) {
  if (await p.$('.rd.ui-off')) {
    const cdp = await p.context().newCDPSession(p);
    const vp = p.viewportSize();
    await tap(cdp, vp.width / 2, vp.height / 2);
    await T(450);
    await cdp.detach();
  }
}
async function menu(p, text) {
  await showBars(p);
  await p.click('.rd [data-act="more"]');
  await p.click(`.mi:has-text("${text}")`);
  await T(400);
}
const toastTexts = (p) => p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent));
const setHidden = (p, on) =>
  p.evaluate((on) => {
    if (on) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    } else {
      delete document.hidden;
      delete document.visibilityState;
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, on);
const today = (p) => p.evaluate(() => window.A.U.today());
const stat = (p) => p.evaluate(() => (window.A.S.priv && window.A.S.priv.focus && window.A.S.priv.focus[window.A.U.today()]) || null);

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p;
  try {
    await step('Sign in on a phone, create a circle, upload the 40-page Arabic book, open the reader', async () => {
      const u = await H.newUser(browser, env, 'focus@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      p = u.page;
      ctx.p = p;
      await p.fill('#cn-name', 'حلقة التركيز');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'قارئ');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.click('#pl-form button.btn.gold');
      await until(p, 'book with plan', () => [...window.A.S.books.values()].some((b) => (b.wirds || []).length > 0), null, 20000);
      ctx.book = await p.evaluate(() => [...window.A.S.books.values()][0]);
      // The applied one-line change in U.toast (util.js): if A.R.hold(html, kind) takes the message, stop there.
      ctx.patched = await p.evaluate(() => {
        const U = window.A.U;
        if (/A\.R\.hold|R\.hold/.test(String(U.toast))) return false;
        const orig = U.toast;
        U.toast = (html, kind) => {
          if (window.A.R && window.A.R.hold && window.A.R.hold(html, kind)) return;
          return orig(html, kind);
        };
        return true;
      });
      await p.evaluate(() => window.A.U.store.set('rdOrientAsk', false)); // keep the sideways hint out of the way
      await T(800);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      await p.locator('[data-act="read"]:visible').first().click({ timeout: 8000 });
      await until(p, 'page painted', () => [...document.querySelectorAll('.pg canvas')].some((c) => c.width > 100), null, 30000);
      ctx.open = true;
      return `${ctx.book.pages} pages, ${ctx.book.wirds.length} portions${ctx.patched ? '; U.toast hook applied by the test (util.js not changed yet)' : ''}`;
    });

    await step('The chip is offered once a day when a book opens; ✕ hides it, and it is not offered again today', async () => {
      await until(p, 'offer chip', () => !!document.querySelector('#rd-foffer.in'), null, 8000);
      await H.shot(p, 'focus-01-offer');
      const offered = await p.evaluate(() => window.A.U.store.get('rdFocusOffered', ''));
      assert(offered === (await today(p)), 'not remembered as offered today: ' + offered);
      await p.click('#rd-foffer [data-act="foffer-x"]');
      await T(400);
      assert(await p.$eval('#rd-foffer', (e) => e.hidden), 'chip still showing after ✕');
      await p.evaluate((id) => (window.A.R.close(true), window.A.R.open(id)), ctx.book.id);
      await T(3500);
      assert(!(await p.$('#rd-foffer.in')), 'offered twice in one day');
    }, ['open']);

    await step('Never offered during a tool mode; offered once the tool is put away, «يلا» opens the length sheet', async () => {
      await p.evaluate(() => window.A.U.store.set('rdFocusOffered', ''));
      await p.evaluate((id) => (window.A.R.close(true), window.A.R.open(id)), ctx.book.id);
      await T(500);
      await showBars(p);
      await p.click('.rd [data-tool="hl"]');
      await T(3200);
      assert(!(await p.$('#rd-foffer.in')), 'offered over the highlight tool');
      await p.click('#rd-hint [data-act="mode-off"]');
      await until(p, 'offer after the tool', () => !!document.querySelector('#rd-foffer.in'), null, 9000);
      await p.click('#rd-foffer [data-act="foffer-go"]');
      await p.waitForSelector('#rf-form', { timeout: 4000 });
      ctx.sheet = true;
    }, ['open']);

    await step('Pick 10 minutes and a 3-page goal: the bars hide, the ring shows in the corner, the app goes quiet', async () => {
      await p.click('#rf-form [data-min="10"]');
      await p.fill('#rf-goal', '٣'); // Arabic digits, as typed on an Arabic keyboard
      await H.shot(p, 'focus-02-sheet');
      await p.click('#rf-form button[type=submit]');
      await T(600);
      const s = await p.evaluate(() => {
        const ring = document.querySelector('#rd-focus .rf-ring');
        const r = ring && ring.getBoundingClientRect();
        return { off: !!document.querySelector('.rd.ui-off'), ring: !!ring && !document.querySelector('#rd-focus').hidden, x: r && r.x, quiet: window.A.R.isQuiet(), f: window.A.R._focus(), awake: window.A.R._awake() };
      });
      assert(s.off, 'bars still showing');
      assert(s.ring, 'no ring');
      assert(s.x < 120, 'ring not in the inline-end (left, RTL) corner: x=' + s.x);
      assert(s.quiet && s.f.target === 600 && s.f.goal === 3, 'session: ' + JSON.stringify(s.f));
      assert(s.awake, 'screen not kept awake');
      ctx.session = true;
      return `target ${s.f.target}s, goal ${s.f.goal}`;
    }, ['sheet']);

    await step('A toast and a portion cheer during the session wait (not shown)', async () => {
      await T(1400); // past the "answer to a tap" window
      await p.evaluate(() => window.A.U.toast('رسالة تجربة من الحلقة'));
      // read three pages: counted, but the portion cheers stay quiet
      await p.evaluate(() => {
        const c = window.A.R.current().page;
        for (let k = 1; k <= 3; k++) window.A.R._markSeen(c + k);
      });
      await T(700);
      const t = await toastTexts(p);
      const cheer = await p.$eval('#rd-cheer', (e) => !e.hidden && e.classList.contains('in'));
      const f = await focus(p);
      assert(!t.some((x) => x.includes('رسالة تجربة')), 'toast shown during the session: ' + t.join(' | '));
      assert(!cheer, 'cheer bubble shown during the session');
      assert(f.held >= 1, 'nothing held: ' + JSON.stringify(f));
      return `${f.held} message(s) held, ${f.pages} pages counted, goal hit: ${f.goalHit}`;
    }, ['session']);

    await step('Tap the ring: time left, pause stops the clock, resume runs it again', async () => {
      await p.click('#rd-focus .rf-ring');
      await T(300);
      assert(!(await p.$eval('#rf-pop', (e) => e.hidden)), 'card did not open');
      await H.shot(p, 'focus-03-ring');
      await p.click('#rf-pop [data-act="focus-pause"]');
      await p.evaluate(() => window.A.R._focusSpeed(50));
      const a = (await focus(p)).secs;
      await T(1000);
      const b = (await focus(p)).secs;
      assert((await focus(p)).paused && b === a, `clock ran while paused: ${a} → ${b}`);
      const ringPaused = await p.$eval('#rd-focus .rf-ring', (e) => e.classList.contains('paused'));
      assert(ringPaused, 'ring not shown as paused');
      await p.click('#rf-pop [data-act="focus-pause"]');
      await T(600);
      const c = (await focus(p)).secs;
      assert(c > b + 5, `clock did not run after resume: ${b} → ${c}`);
      return `paused at ${a}s; resumed ${b}→${c}s`;
    }, ['session']);

    await step('Time does not run while the app is hidden', async () => {
      await setHidden(p, true);
      await T(50);
      const a = (await focus(p)).secs;
      await T(1000);
      const b = (await focus(p)).secs;
      await setHidden(p, false);
      await T(500);
      const c = (await focus(p)).secs;
      assert(b === a, `clock ran while hidden: ${a} → ${b}`);
      assert(c > b, `clock did not run again when back: ${b} → ${c}`);
      return `hidden ${a}→${b}s, back →${c}s`;
    }, ['session']);

    await step('Time up: chime, summary with minutes, pages, pages a minute and the portion; toasts still wait', async () => {
      await until(p, 'session ended', () => window.A.R._focus() && window.A.R._focus().ended, null, 30000);
      await p.evaluate(() => window.A.R._focusSpeed(1));
      await p.waitForSelector('#rf-sum', { timeout: 4000 });
      await T(400);
      await H.shot(p, 'focus-04-summary');
      const f = await focus(p);
      const got = await p.evaluate(() => {
        const v = (k) => document.querySelector(`#rf-sum [data-k="${k}"]`).textContent;
        return { mins: v('mins'), pages: v('pages'), ppm: v('ppm'), wird: !!document.querySelector('#rf-sum .ss-wird .bar'), goal: (document.querySelector('#rf-sum .rf-goal.hit') || {}).textContent || '' };
      });
      const want = await p.evaluate((f) => {
        const L = window.A.L;
        return { mins: L.num(Math.round(f.secs / 60)), pages: L.num(f.pages), ppm: L.num(f.pages / (f.secs / 60), { maximumFractionDigits: 1 }) };
      }, f);
      assert(f.secs === 600, 'secs ' + f.secs);
      assert(got.mins === want.mins && got.pages === want.pages && got.ppm === want.ppm, `summary ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      assert(f.pages >= 3 && got.goal, 'goal not shown as reached: ' + JSON.stringify(got));
      assert(got.wird, 'no portion progress');
      const t = await toastTexts(p);
      assert(!t.some((x) => x.includes('رسالة تجربة')), 'toast shown before the session was closed');
      ctx.ended = true;
      return `${got.mins} min, ${got.pages} pages, ${got.ppm} pages/min; ${got.goal}`;
    }, ['session']);

    await step('«خلاص»: the held toast shows now; the session is saved in my private doc', async () => {
      await p.click('#rf-sum [data-close]');
      await until(p, 'held toast shown', () => [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('رسالة تجربة')), null, 5000);
      const q = await p.evaluate(() => window.A.R.isQuiet());
      assert(!q, 'still quiet');
      assert(await p.$eval('#rd-focus', (e) => e.hidden), 'ring still showing');
      await until(p, 'stat saved', () => window.A.S.priv && window.A.S.priv.focus && window.A.S.priv.focus[window.A.U.today()], null, 5000);
      const s = await stat(p);
      assert(s.n === 1 && s.secs === 600, 'stat ' + JSON.stringify(s));
      return 'focus[today] = ' + JSON.stringify(s);
    }, ['ended']);

    await step('From the ⋯ menu, a custom 2 minutes; «كمّل ٥ دقايق كمان» stretches it, ending early counts the extra time once', async () => {
      await T(3500); // let the toasts go
      await menu(p, 'قعدة تركيز');
      await p.waitForSelector('#rf-form', { timeout: 4000 });
      await p.click('#rf-form [data-min="custom"]');
      await p.fill('#rf-mins', '٢');
      await p.click('#rf-form button[type=submit]');
      await T(300);
      assert((await focus(p)).target === 120, 'custom length: ' + JSON.stringify(await focus(p)));
      await p.evaluate(() => window.A.R._focusSpeed(100));
      await until(p, 'short session ended', () => window.A.R._focus() && window.A.R._focus().ended, null, 15000);
      await p.evaluate(() => window.A.R._focusSpeed(1));
      await p.waitForSelector('#rf-sum', { timeout: 4000 });
      await p.click('#rf-sum [data-act="rf-more"]');
      await T(400);
      const f = await focus(p);
      assert(f && !f.ended && f.target === f.secs + 300, 'not stretched: ' + JSON.stringify(f));
      assert(await p.$('.rd.ui-off'), 'bars back after stretching');
      await p.evaluate(() => window.A.R._focusSpeed(50));
      await T(1200);
      await p.evaluate(() => window.A.R._focusSpeed(1));
      await p.click('#rd-focus .rf-ring');
      await p.click('#rf-pop [data-act="focus-end"]');
      await p.waitForSelector('#rf-sum', { timeout: 4000 });
      const early = await p.$eval('#rf-sum', (e) => e.textContent.includes('بدري'));
      const secs = (await focus(p)).secs;
      await H.shot(p, 'focus-05-early');
      await p.click('#rf-sum [data-close]');
      await T(800);
      const s = await stat(p);
      assert(early, 'no "ended early" line');
      assert(s.n === 2 && s.secs === 600 + secs, `stat ${JSON.stringify(s)} (session ${secs}s)`);
      return `session ${secs}s; focus[today] = ${JSON.stringify(s)}`;
    }, ['ended']);

    await step('Dark: night pages, the ring and its card (screenshot); closing the book mid-session counts it', async () => {
      await p.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await p.evaluate(() => {
        const U = window.A.U;
        const pr = U.store.get('readerPrefs', {});
        U.store.set('readerPrefs', Object.assign({}, pr, { theme: 'night' }));
        U.store.set('rdFocusLen', 20);
      });
      await p.evaluate((id) => (window.A.R.close(true), window.A.R.open(id)), ctx.book.id);
      await T(1200);
      await menu(p, 'قعدة تركيز');
      await p.waitForSelector('#rf-form [data-min="20"].on', { timeout: 4000 });
      await p.click('#rf-form button[type=submit]');
      await p.evaluate(() => window.A.R._focusSpeed(50));
      await T(2000);
      await p.evaluate(() => window.A.R._focusSpeed(1));
      await p.click('#rd-focus .rf-ring');
      await T(300);
      const dur = await p.$eval('#rd-focus .rf-arc', (e) => getComputedStyle(e).transitionDuration);
      await H.shot(p, 'focus-06-night');
      const secs = (await focus(p)).secs;
      await p.evaluate(() => window.A.R.close());
      await T(1200);
      const s = await stat(p);
      await p.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
      assert(parseFloat(dur) < 0.01, 'ring animates with reduced motion: ' + dur);
      assert(s.n === 3 && s.secs > 600 + secs - 1, 'not counted on close: ' + JSON.stringify(s));
      ctx.saved = s;
      return `${secs}s counted on close; focus[today] = ${JSON.stringify(s)}`;
    }, ['ended']);

    await step('English: the length sheet is all English, left to right', async () => {
      await p.evaluate(() => window.A.L.set('en'));
      await T(500);
      for (let i = 0; i < 3 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
      await p.evaluate((id) => window.A.R.open(id), ctx.book.id);
      await T(1000);
      await menu(p, 'Focus session');
      await p.waitForSelector('#rf-form', { timeout: 4000 });
      const txt = await p.$eval('#rf-form', (e) => e.textContent);
      await H.shot(p, 'focus-07-english');
      await p.keyboard.press('Escape');
      await T(300);
      await p.evaluate(() => window.A.R.close(true));
      await p.evaluate(() => window.A.L.set('eg'));
      await T(400);
      assert(/10 minutes/.test(txt) && /Page goal/.test(txt) && !/[؀-ۿ]/.test(txt), 'English sheet: ' + txt.slice(0, 200));
    }, ['ended']);

    await step('Saved for real: after a reload the private doc still has today’s focus sessions', async () => {
      await p.reload();
      await H.settled(p);
      await until(p, 'private doc back', () => window.A.S.priv && window.A.S.priv.focus, null, 15000);
      const s = await stat(p);
      assert(s && s.n === ctx.saved.n && s.secs === ctx.saved.secs, `after reload ${JSON.stringify(s)} vs ${JSON.stringify(ctx.saved)}`);
      return JSON.stringify(s);
    }, ['saved']);

    await step('No errors in the console', async () => {
      const errs = p.__errors.filter((e) => !/favicon|fonts|404/.test(e));
      assert(!errs.length, errs.slice(0, 4).join('\n'));
    }, ['p']);
  } catch (e) {
    console.error('crash', e);
  } finally {
    await browser.close();
    await env.stop();
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n==== ${results.filter((r) => r.status === 'PASS').length} passed, ${fail} failed, ${results.filter((r) => r.status === 'SKIP').length} skipped — screenshots in tests/e2e/shots`);
    process.exit(fail ? 1 : 0);
  }
})();
