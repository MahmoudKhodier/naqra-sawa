#!/usr/bin/env node
/*
 * Play: animated characters opened by pages read in the app, «ورقات», throwing things at a friend (who sees it
 * once as a scene), the weekly boss card with its replay, the animated reaction bar in the reader.
 *
 *   node tests/e2e/play.js
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

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId, aUid, bUid;
  try {
    await step('Two members with animated characters', async () => {
      const A = await H.newUser(browser, env, 'pa@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة اللعب');
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
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length));
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      const cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'pb@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
      aUid = await a.evaluate(() => window.A.S.me);
      bUid = await b.evaluate(() => window.A.S.me);
      for (const [pg, e] of [[a, '🦁'], [b, '🐢']]) {
        await pg.evaluate((x) => { window.A.Goals && (window.A.Goals.off = true); return window.A.D.updateMe(() => ({ emoji: x })); }, e);
      }
      await until(a, 'marks', () => [...window.A.S.members.values()].every((m) => m.emoji));
    });

    await step('«ورقات»: one per page read in the app; the friend\'s character is animated', async () => {
      await a.evaluate(() => window.A.D.addPagesToday(10));
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('circle', { seg: 'members' }));
      await a.waitForSelector('.playc');
      await until(a, '10 sheets', () => /١٠/.test(document.querySelector('.playc .coins').textContent));
      await until(a, 'animated friend', (u) => !!document.querySelector(`.playc .tf[data-to="${u}"] .lot svg`), bUid, 15000);
    });

    await step('My «ورقات» in the top bar; a tap goes to the members', async () => {
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('#hud .coins-h');
      assert(/١٠/.test(await a.textContent('#hud .coins-h')), 'not 10 in the bar');
      await a.click('#hud .coins-h');
      await a.waitForSelector('.playc');
      await H.shot(a, 'play-hud');
    });

    await step('Throwing a tomato at Sara costs 2 sheets; Sara sees it once as a scene, sad', async () => {
      await b.evaluate(() => {
        window.__caps = [];
        window.__splat = false;
        new MutationObserver(() => {
          const c = document.querySelector('.pl-sc-cap');
          if (c && c.textContent && window.__caps[window.__caps.length - 1] !== c.textContent) window.__caps.push(c.textContent);
          if (document.querySelector('.pl-stage.pl-squish .pl-splat, .pl-stage.pl-sad .pl-splat')) window.__splat = true;
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      });
      await a.click('.playc [data-act="throw-pick"][data-it="tomato"]');
      await a.click(`.playc .tf[data-to="${bUid}"]`);
      await until(a, 'saved', () => [...window.A.S.throws.values()].some((t) => t.it === 'tomato'));
      // the list re-draws once the throw is saved: the splat stays on Sara's character, the one underneath hidden
      await T(400);
      assert(await a.$('.pl-stage.pl-squish .pl-splat, .pl-stage.pl-sad .pl-splat'), 'no splat on the character after the save');
      assert(await a.$eval(`.playc .tf[data-to="${bUid}"] .tf-st`, (e) => e.style.visibility === 'hidden'), 'the character under the effect is not hidden');
      await H.shot(a, 'play-splat');
      await until(a, 'effect over', () => !document.querySelector('.pl-stage'), null, 6000);
      await until(a, '8 sheets', () => window.A.Play.coins() === 8);
      await until(b, 'arrived', () => window.A.S.throws.size === 1);
      await closeAll(b);
      await b.evaluate(() => window.A.V.go('home'));
      await b.evaluate(() => window.A.V.celebrate());
      await b.waitForSelector('.pl-scene', { timeout: 8000 });
      await until(b, 'caption', () => window.__caps.some((c) => /طماطماية/.test(c)), null, 8000);
      await until(b, 'sad', () => window.__splat, null, 6000);
      await H.shot(b, 'play-scene');
      await b.waitForSelector('.pl-sc-acts:not([hidden]) [data-back]', { timeout: 8000 });
      await b.click('.pl-sc-acts [data-ok]');
      // once: not again
      await b.evaluate(() => window.A.V.celebrate());
      await T(1200);
      assert(!(await b.$('.pl-scene')), 'the scene came again');
      const inbox = await b.evaluate(() => window.A.V.inboxItems().some((x) => x.kind === 'throw'));
      assert(inbox, 'not in «الجديد ليك»');
    });

    await step('Throwing back is free of the opt-out; turning it off stops it', async () => {
      await b.evaluate(() => window.A.D.updateMe(() => ({ noThrows: true })));
      await until(a, 'flag', (u) => !!(window.A.S.members.get(u) || {}).noThrows, bUid);
      assert(!(await a.evaluate((u) => window.A.Play.canThrowAt(u), bUid)), 'still throwable');
      await b.evaluate(() => window.A.D.updateMe(() => ({ noThrows: false })));
    });

    await step('A character opens at 30 pages read in the app', async () => {
      assert(!(await a.evaluate(() => window.A.Play.unlocked('🐝'))), '🐝 open at 10 pages');
      await a.evaluate(() => { window.A.U.store.set('charsSeen:' + window.A.S.me, []); window.A.Goals.off = false; });
      await a.evaluate(() => window.A.D.addPagesToday(25));
      await until(a, 'open', () => window.A.Play.unlocked('🐝'));
      await closeAll(a);
      await a.evaluate(() => window.A.V.celebrate());
      await a.waitForSelector('.sheet .unlock-big', { timeout: 6000 });
      await closeAll(a);
      await a.evaluate(() => (window.A.Goals.off = true));
      // Goodreads or paper pages don't count: only members/<uid>.days
      const pages = await a.evaluate(() => window.A.Play.appPages());
      assert(pages === 35, 'pages ' + pages);
    });

    await step('The weekly boss: opening it replays the week — full health, then everyone hits once, smallest hit first', async () => {
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('home'));
      await b.evaluate(() => window.A.D.addPagesToday(20));
      await until(a, 'pages arrived', (u) => window.A.G.weekPagesOf(u).pages === 20, bUid);
      const hp = await a.evaluate(() => window.A.Play.boss().hp);
      assert(hp === 300 - 55, 'hp ' + hp);
      await a.evaluate(() => {
        window.__dmg = [];
        window.__hp0 = null;
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) {
            if (n.classList && n.classList.contains('ar-dmg')) window.__dmg.push(n.textContent);
            if (n.classList && n.classList.contains('ar-replay') && window.__hp0 == null) window.__hp0 = document.querySelector('.cweek.boss .ar-hp b').textContent;
          }
        }).observe(document.body, { childList: true, subtree: true });
      });
      await a.evaluate(() => window.A.V.go('circle'));
      await a.waitForSelector('.cweek.boss .arena');
      await a.waitForSelector('.ar-replay', { timeout: 8000 });
      await until(a, 'monster', () => !!document.querySelector('.cweek.boss .ar-mon .lot svg'), null, 15000);
      await T(900);
      await H.shot(a, 'play-boss');
      await until(a, 'replay done', () => !window.A.Play._replaying(), null, 10000);
      const r = await a.evaluate(() => ({ dmg: window.__dmg, hp0: window.__hp0 }));
      assert(/٣٠٠ \/ ٣٠٠/.test(r.hp0), 'did not start at full health: ' + r.hp0);
      assert(r.dmg.length === 2 && /٢٠/.test(r.dmg[0]) && /٣٥/.test(r.dmg[1]), 'order: ' + JSON.stringify(r.dmg));
      const t = await a.textContent('.cweek.boss .ar-hp b');
      assert(/٢٤٥/.test(t), 'health after: ' + t);
      // data coming in re-draws the screen: no second replay
      await b.evaluate(() => window.A.D.addPagesToday(1));
      await until(a, 'arrived', (u) => window.A.G.weekPagesOf(u).pages === 21, bUid);
      await T(600);
      assert(!(await a.$('.ar-replay')), 'replayed on a re-draw');
      return r.dmg.join(' → ');
    });

    await step('The reaction bar in the reader: animated emoji', async () => {
      await closeAll(b);
      await b.evaluate((id) => window.A.R.open(id, { page: 2 }), bookId);
      await until(b, 'reader', () => window.A.R.isOpen() && document.querySelector('.pg canvas'), null, 20000);
      await T(500);
      const box = await b.$eval('.pg[data-p="2"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top, 120) + 80 }; });
      await b.mouse.move(box.x, box.y);
      await b.mouse.down();
      await T(650);
      await b.waitForSelector('#rx-bar .rx-i .lot svg', { timeout: 8000 });
      // slide to 🔥 and let go
      const f = await b.$eval('#rx-bar .rx-i[data-e="🔥"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await b.mouse.move(f.x, f.y, { steps: 6 });
      await T(150);
      await b.mouse.up();
      await until(b, 'saved', () => [...window.A.S.reacts.values()].some((r) => r.e === '🔥'));
      await b.evaluate(() => window.A.R.close(true));
    });

    await step('No console errors', async () => {
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
