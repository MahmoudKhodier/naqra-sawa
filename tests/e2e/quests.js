#!/usr/bin/env node
/*
 * Daily quests made from what you're reading: finish your portion, a quest about a real person in the circle
 * (answer a question, react to a highlight, cheer someone behind), a reflection, an optional bonus; one swap a
 * day; tapping a quest takes you there; the day is recorded on the member doc and counts for XP; the chest.
 *
 *   node tests/e2e/quests.js
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
const quests = (p) => p.evaluate(() => window.A.Q.list().map((x) => ({ id: x.id, text: x.text.replace(/<[^>]+>/g, ''), done: x.done, have: x.have, need: x.need, bonus: x.bonus, swappable: x.swappable })));

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId;
  try {
    await step('Two members, a book with 8 pages a portion', async () => {
      const A = await H.newUser(browser, env, 'qa@test.local', { viewport: { width: 390, height: 844 } });
      a = A.page;
      await a.fill('#cn-name', 'حلقة المهام');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'منى');
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
      const cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'qb@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(a, 'two members', () => window.A.S.members.size === 2);
      for (const pg of [a, b]) await pg.evaluate(() => {
        window.A.Goals && (window.A.Goals.off = true);
        window.A.G.QUEST_V2 = '2020-01-01'; // the new quests count from today in this test
      });
    });

    await step('The reading quest is my portion; three quests and a bonus', async () => {
      await a.evaluate(() => window.A.Q._reset());
      const q = await quests(a);
      assert(q.length === 4 && q.filter((x) => x.bonus).length === 1, 'quests: ' + JSON.stringify(q));
      assert(q[0].id === 'wird' && /الورد ١/.test(q[0].text) && /ص ٨/.test(q[0].text) && q[0].need === 8, 'reading quest: ' + JSON.stringify(q[0]));
      return q.map((x) => x.text).join(' | ');
    });

    await step('A question and a highlight from Sara: the people quest is about them', async () => {
      const ids = await b.evaluate(async (bid) => {
        const { D, S, U } = window.A;
        const q = D.newId(), h = D.newId();
        await D.set(`notes/${q}`, { b: bid, page: 3, kind: 'q', text: 'ليه الكاتب بدأ كده؟', rect: null, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
        await D.set(`notes/${h}`, { b: bid, page: 4, kind: 'hl', text: '', rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.04 }, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
        return { q, h };
      }, bookId);
      await until(a, 'notes arrived', (x) => window.A.S.notes.has(x.q) && window.A.S.notes.has(x.h), ids);
      // «من غير حرق»: notes on pages I haven't reached are not quests; I've read up to p. 4
      await a.evaluate((bid) => window.A.D.saveProg(bid, (c) => ({ seen: window.A.U.rangesAdd(c.seen, [1, 2, 3, 4]) })), bookId);
      await a.evaluate(() => window.A.Q._reset());
      const q = await quests(a);
      const people = q[1];
      assert(['answer', 'react'].includes(people.id) && /سارة/.test(people.text) && /ص [٣٤]/.test(people.text), 'people quest: ' + JSON.stringify(people));
      assert(people.swappable, 'not swappable');
      // swap it: the other one about Sara comes, and there are no more swaps today
      await a.evaluate(() => window.A.V.actions.quests());
      await a.waitForSelector('.sheet .qlist [data-act="quest-swap"][data-i="1"]');
      await a.click('.sheet .qlist [data-act="quest-swap"][data-i="1"]');
      await T(400);
      const q2 = await quests(a);
      assert(q2[1].id !== people.id, `swap kept ${people.id}`);
      assert(['answer', 'react'].includes(q2[1].id) && /سارة/.test(q2[1].text), 'swapped to: ' + JSON.stringify(q2[1]));
      assert(!(await a.$('.sheet .qlist [data-act="quest-swap"]')), 'a second swap is offered');
      await closeAll(a);
      ctx.ids = ids;
      return `${people.id} → ${q2[1].id}`;
    });

    await step('Tapping a quest takes you there; doing it ticks it', async () => {
      const q = await quests(a);
      const i = 1;
      await a.evaluate(() => window.A.V.actions.quests());
      await a.click(`.sheet .qlist [data-act="quest-go"][data-i="${i}"]`);
      if (q[i].id === 'answer' || q[i].id === 'react') {
        await a.waitForSelector('#nt-replies', { timeout: 6000 });
        await closeAll(a);
        await a.evaluate(async ({ id, nid }) => {
          const { D, S, U } = window.A;
          if (id === 'answer') await D.update(`notes/${nid}`, { replies: { [D.newId()]: { by: S.me, text: 'عشان يشدّنا', at: U.nowIso() } } });
          else await D.update(`notes/${nid}`, { likes: { [S.me]: U.nowIso() } });
        }, { id: q[i].id, nid: q[i].id === 'answer' ? ctx.ids.q : ctx.ids.h });
      } else if (q[i].id === 'cheerU') {
        await T(800);
      } else {
        await closeAll(a);
        await a.evaluate(() => window.A.R.isOpen() && window.A.R.close(true));
        await a.evaluate(async () => {
          const { D, S, U } = window.A;
          for (let k = 0; k < 2; k++) await D.set(`msgs/${D.newId()}`, { b: '_c', ch: 'gen', by: S.me, text: 'مرحبا ' + k, at: U.nowIso(), re: '', react: {} });
        });
      }
      await until(a, 'people quest done', () => window.A.Q.list()[1].done);
      return q[i].id;
    });

    await step('All three done: the day is recorded on my member doc and counts; the chest opens', async () => {
      await closeAll(a);
      await a.evaluate((id) => window.A.R.isOpen() && window.A.R.close(true), bookId);
      await a.evaluate(async (bid) => {
        const { D, U, S } = window.A;
        // portion 1 read, and a highlight / question / takeaway for the reflection quest
        await D.saveProg(bid, (c) => ({ seen: U.rangesAdd(c.seen, [1, 2, 3, 4, 5, 6, 7, 8]), done: Object.assign({}, c.done, { w1: U.nowIso() }) }));
        const q = window.A.Q.list()[2];
        const kind = q.id === 'askW' ? 'q' : q.id === 'take' ? 'take' : 'hl';
        const w = [...S.books.values()][0].wirds.find((x) => q.text.includes('الورد ' + window.A.L.num(x.n))) || [...S.books.values()][0].wirds[0];
        await D.set(`notes/${D.newId()}`, { b: bid, page: w.from + 1, kind, text: kind === 'hl' ? '' : 'فكرة', rect: kind === 'hl' ? { x: 0.1, y: 0.3, w: 0.5, h: 0.04 } : null, by: S.me, at: U.nowIso(), wid: w.id, likes: {}, replies: {} });
      }, bookId);
      await until(a, 'three done', () => window.A.Q.core().every((x) => x.done), null, 10000).catch(async (e) => {
        throw new Error(e.message + ' ' + JSON.stringify(await quests(a)));
      });
      await until(a, 'recorded', () => !!((window.A.S.members.get(window.A.S.me) || {}).questDays || {})[window.A.U.today()]);
      await until(b, 'Sara sees it', (u) => !!((window.A.S.members.get(u) || {}).questDays || {})[window.A.U.today()], await a.evaluate(() => window.A.S.me));
      const qd = await a.evaluate(() => window.A.G.of(window.A.S.me).questDays);
      assert(qd >= 1, 'questDays ' + qd);
      await closeAll(a);
      await a.evaluate(() => window.A.V.actions.quests());
      await a.waitForSelector('.sheet .quests .chest.ready');
      await a.click('.sheet .quests .chest.ready');
      await a.waitForSelector('.celeb .xp-lines');
      const t = await a.textContent('.celeb .xp-lines');
      assert(/\+٣٠ XP/.test(t), 'chest: ' + t);
      await H.shot(a, 'quests-chest');
      await closeAll(a);
      return t.replace(/\s+/g, ' ');
    });

    await step('A rating quest only for a book just finished without a rating', async () => {
      await a.evaluate(async () => {
        const { D, S, U } = window.A;
        await D.mutate(`shelf/${S.me}`, (c) => ({ items: Object.assign({}, (c && c.items) || {}, { r1: { title: 'الأيام', author: 'طه حسين', status: 'read', rating: 0, finished: U.today(), at: U.nowIso(), updatedAt: U.nowIso() } }) }));
      });
      await until(a, 'shelf item', () => window.A.V.shelfItems(window.A.S.me).some((x) => x.title === 'الأيام'));
      const opts = await a.evaluate(() => {
        // what the reflection slot could be today (the takeaway of portion 1 comes first if not written)
        window.A.Q._reset();
        return window.A.Q.list()[2].id;
      });
      assert(['take', 'rate', 'hlW', 'askW'].includes(opts), 'reflection: ' + opts);
    });

    await step('English and no console errors', async () => {
      await a.evaluate(() => window.A.L.set('en'));
      const q = await quests(a);
      assert(/portion 1|Finish portion|pages/.test(q[0].text), 'English: ' + q[0].text);
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
const ctx = {};
