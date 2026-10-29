#!/usr/bin/env node
/*
 * The app's frame on a phone: back steps (sheets, the book, the screen before), one message at a time,
 * pull down to refresh, the shelf's ⋯ menu, the folded mark picker, the sign-out warning for unsaved reading.
 *
 *   node tests/e2e/ui.js
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
async function until(p, what, fn, arg, timeout = 8000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
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

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p;
  try {
    await step('Sign in on a phone and make a circle', async () => {
      const u = await H.newUser(browser, env, 'ui@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      p = u.page;
      await p.fill('#cn-name', 'حلقة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await T(3500); // let the welcome messages go by
    });

    await step('The phone’s back closes a sheet first, then goes to the screen before', async () => {
      await p.click('[data-go="circle"]');
      await p.click('[data-go="shelf"]');
      await p.click('[data-act="shelf-more"]');
      await p.waitForSelector('.menu-sheet');
      await p.goBack();
      await until(p, 'menu closed', () => !document.querySelector('.sheet-wrap'));
      assert((await p.evaluate(() => window.A.V.state.route)) === 'shelf', 'back left the shelf instead of closing the menu');
      await p.evaluate(() => window.A.V.back());
      assert((await p.evaluate(() => window.A.V.state.route)) === 'circle', 'back did not return to the circle');
      await p.evaluate(() => window.A.V.back());
      assert((await p.evaluate(() => window.A.V.state.route)) === 'home', 'back did not return to Today');
      // a menu item that navigates still lands where it should, although the sheet steps back in history
      await p.click('[data-go="shelf"]');
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("ضيف كذا كتاب")');
      await p.waitForSelector('.sheet-wrap');
      await T(400);
      assert((await p.evaluate(() => location.hash)) === '#shelf', 'hash moved: ' + (await p.evaluate(() => location.hash)));
      await p.keyboard.press('Escape');
      await T(300);
    });

    await step('Messages show one at a time; the answer to a tap shows at once', async () => {
      await T(1400); // not right after a tap
      await p.evaluate(() => {
        window.__seen = [];
        new MutationObserver(() => window.__seen.push(document.querySelectorAll('#toasts .toast.in, #toasts .toast:not(.in)').length)).observe(document.getElementById('toasts'), { childList: true });
        ['١', '٢', '٣'].forEach((n) => window.A.U.toast('رسالة ' + n));
      });
      await T(300);
      const shown = await p.$$eval('#toasts .toast', (x) => x.map((t) => t.textContent));
      assert(shown.length === 1 && shown[0] === 'رسالة ١', 'more than one at a time: ' + JSON.stringify(shown));
      await until(p, 'all three went by', () => !document.querySelector('#toasts .toast') && window.__seen.length >= 5, null, 9000);
      const most = await p.evaluate(() => Math.max(...window.__seen));
      assert(most <= 2, 'up to ' + most + ' on screen at once'); // one leaving while the next comes in
      await p.evaluate(() => window.A.U.toast('تلقائي'));
      await p.click('[data-go="home"]');
      await p.evaluate(() => window.A.U.toast('رد على الضغطة'));
      await T(150);
      const now = await p.$$eval('#toasts .toast', (x) => x.map((t) => t.textContent));
      assert(now.includes('رد على الضغطة'), 'the answer to a tap waited: ' + JSON.stringify(now));
    });

    await step('Pull down at the top of Today fetches what’s new', async () => {
      const cdp = await p.context().newCDPSession(p);
      await p.evaluate(() => {
        window.__resynced = 0;
        const r = window.A.P.resync;
        window.A.P.resync = () => (window.__resynced++, r());
      });
      await touchDrag(cdp, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [{ x: 195, y: 160 + i * 30 }]), 20);
      await until(p, 'resync ran', () => window.__resynced === 1);
      await until(p, 'indicator gone', () => !document.querySelector('.ptr.on'));
      await touchDrag(cdp, [0, 1, 2].map((i) => [{ x: 195, y: 160 + i * 15 }]), 20); // a short pull does nothing
      await T(700);
      assert((await p.evaluate(() => window.__resynced)) === 1, 'a short pull refreshed too');
      await cdp.detach();
    });

    await step('Shelf: books first; the challenge is one small line; more in ⋯', async () => {
      await p.click('[data-go="shelf"]');
      const top = await p.$eval('.shelf-sum', (e) => e.getBoundingClientRect().bottom);
      assert(top < 260, 'the summary line ends at ' + top + 'px');
      assert(!(await p.$('.shelf-head [data-act="import-shelf"]')), 'Goodreads is still a big button');
    });

    await step('Settings: the 40 marks wait behind one row', async () => {
      await p.click('[data-go="settings"]');
      assert(!(await p.isVisible('.emo-all')), 'the marks are open');
      await p.click('.emo-pick summary');
      assert(await p.isVisible('.emo-all'), 'the marks did not open');
      assert(!(await p.$('.hud .theme-t')), 'light/dark is still in the header');
    });

    await step('Sign-out warns about reading not saved yet, and can stay', async () => {
      await p.context().route(/\/rest\/v1\//, (r) => r.abort('internetdisconnected'));
      try {
        await p.evaluate(() => window.A.D.outboxAdd({ b: 'x', seen: [5, 6], last: 6, n: 2, secs: 0 }));
        await p.click('[data-auth="signout"]');
        await p.waitForSelector('.sheet [data-yes]', { timeout: 8000 });
        const txt = await p.textContent('.sheet');
        assert(/ما اتحفظتش/.test(txt), 'no warning: ' + txt.slice(0, 120));
        await p.keyboard.press('Escape');
        await T(400);
        assert(await p.$('.shell'), 'signed out anyway');
      } finally {
        await p.context().unroute(/\/rest\/v1\//);
      }
    });

    await step('No errors in the console', async () => {
      const errs = (p.__errors || []).filter((e) => !/favicon|fonts|404|INTERNET_DISCONNECTED|Failed to fetch/.test(e));
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
