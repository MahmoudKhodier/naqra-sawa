#!/usr/bin/env node
/*
 * Screenshots of every main screen for a visual review (not a pass/fail test).
 *
 *   node tests/e2e/screens.js                    # phone, light + dark, مصري
 *   LANGS=eg,ar,en THEMES=light node tests/e2e/screens.js
 *   LAND=1 node tests/e2e/screens.js             # also landscape (844×390)
 *   OUT=tests/e2e/shots/mine node tests/e2e/screens.js   # into another folder (when someone else shoots too)
 *
 * Two members (أحمد owns the circle, بسمة joined) with a book, a plan, pages read, a note, a message, a cheer
 * and a shelf. Pictures go to tests/e2e/shots/screens/<lang>-<theme>-<orientation>-NN-name.png.
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
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(H.SHOTS, 'screens'); // OUT=dir: somewhere else
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const LANGS = (process.env.LANGS || 'eg').split(',');
const THEMES = (process.env.THEMES || 'light,dark').split(',');

async function snap(p, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await T(450);
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}
const esc = (p) => p.keyboard.press('Escape').then(() => T(250));
/* The book page's tabs at the top (just under the sticky header), so the chosen tab's content is in the picture. */
async function toTabs(p) {
  await T(300);
  await p.evaluate(() => {
    const t = document.querySelector('.bookpage .tabs');
    const hud = document.getElementById('hud');
    const top = hud && getComputedStyle(hud).position === 'sticky' ? hud.getBoundingClientRect().bottom : 0;
    if (t) window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - top - 8);
  });
}
async function closeAll(p) {
  for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await esc(p);
  if (await p.evaluate(() => window.A.R.isOpen())) await p.evaluate(() => window.A.R.close(true));
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  try {
    // ---- the circle: أحمد creates it, adds the book and a plan
    const A = await H.newUser(browser, env, 'ahmed@test.local', { viewport: { width: 390, height: 844 } });
    const a = A.page;
    await a.waitForSelector('#cn-name');
    await a.fill('#cn-name', 'حلقة الأصحاب');
    await a.click('#circle-new button');
    await a.waitForSelector('#join-name', { timeout: 20000 });
    await a.fill('#join-name', 'أحمد');
    await a.click('#join-form button[type=submit]');
    await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
    await a.locator('[data-act="add-book"]:visible').first().click();
    await a.setInputFiles('#ab-file', PDF);
    await a.waitForSelector('#ab-form', { timeout: 30000 });
    await a.click('#ab-form button.btn.gold');
    await a.waitForSelector('#pl-form', { timeout: 30000 });
    await a.fill('#pl-per', '8');
    await a.click('#pl-form button.btn.gold');
    await a.waitForFunction(() => [...window.A.S.books.values()].some((b) => (b.wirds || []).length));
    const cid = await a.evaluate(() => window.A.P.circle().id);
    const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
    const site = env.siteUrl.replace(/\/?$/, '/');

    // ---- بسمة joins, reads, writes a note and a message; a shelf with some books
    const B = await H.newUser(browser, env, 'basma@test.local', { url: site + '#join-' + code, viewport: { width: 390, height: 844 } });
    const p = B.page;
    await p.waitForSelector('#join-name', { timeout: 20000 });
    await p.fill('#join-name', 'بسمة');
    await p.click('#join-form button[type=submit]');
    await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
    const seed = await p.evaluate(async () => {
      const { D, S, U } = window.A;
      const b = [...S.books.values()][0];
      const days = {};
      for (let i = 1; i <= 9; i++) days[U.addDays(U.today(), -i)] = 3 + ((i * 7) % 11);
      await D.updateMe((m) => ({ days: Object.assign({}, m.days, days), lastActive: U.addDays(U.today(), -1) }));
      await D.saveProg(b.id, (c) => ({ seen: U.rangesAdd(c.seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), last: 11, done: { w1: U.nowIso() } }));
      await D.addPagesToday(11, 900);
      const nid = D.newId();
      await D.set(`notes/${nid}`, { b: b.id, page: 2, kind: 'quote', text: 'القراءة سفر بلا حقائب، ورفقة لا تخذلك.', rect: { x: 0.12, y: 0.3, w: 0.7, h: 0.06 }, by: S.me, at: U.nowIso(), wid: 'w1', likes: {}, replies: {} });
      await D.set(`msgs/${D.newId()}`, { b: b.id, ch: 'gen', by: S.me, text: 'الفصل الأول حلو أوي، مين وصل؟ 📖', at: U.nowIso(), re: '', react: {} });
      const items = {};
      const books = [['ثلاثية غرناطة', 'رضوى عاشور', 'read', 5], ['الأيام', 'طه حسين', 'read', 4], ['عبقرية عمر', 'العقاد', 'read', 4], ['موسم الهجرة إلى الشمال', 'الطيب صالح', 'read', 5], ['رجال في الشمس', 'غسان كنفاني', 'read', 4], ['Man’s Search for Meaning', 'Viktor Frankl', 'read', 5], ['الحرافيش', 'نجيب محفوظ', 'reading', 0], ['ساق البامبو', 'سعود السنعوسي', 'want', 0], ['عزازيل', 'يوسف زيدان', 'want', 0]];
      books.forEach(([title, author, status, rating], i) => (items['s' + i] = { title, author, status, rating, finished: status === 'read' ? '2026-0' + (1 + (i % 9)) : '', review: i === 0 ? 'من أجمل ما قرأت.' : '', at: U.nowIso() }));
      await D.mutate(`shelf/${S.me}`, () => ({ items }));
      return { book: b.id, me: S.me };
    });
    await a.evaluate(async (to) => {
      const { D, U } = window.A;
      await D.set(`pokes/${D.newId()}`, { to, from: window.A.S.me, kind: 'cheer', at: U.nowIso(), b: '', wid: '' });
    }, seed.me);
    await T(1500);
    await p.evaluate(() => window.A.Goals && (window.A.Goals.off = true));

    const views = [
      ['home', () => p.evaluate(() => (window.A.U.store.set('raceTab', 'now'), window.A.V.go('home')))],
      ['home-all', () => p.evaluate(() => window.A.V.go('home')).then(() => p.evaluate(() => document.querySelector('[data-act="race-tab"][data-t="all"]').click())).then(() => p.evaluate(() => document.querySelector('.race').scrollIntoView({ block: 'center' })))],
      ['home-book', () => p.evaluate(() => document.querySelector('[data-act="race-tab"][data-t="book"]').click()).then(() => p.evaluate(() => document.querySelector('.race').scrollIntoView({ block: 'center' })))],
      ['books', () => p.evaluate(() => window.A.V.go('books'))],
      ['book', () => p.evaluate((b) => window.A.V.go('book-' + b), seed.book)],
      ['book-plan', () => p.evaluate((b) => window.A.V.go('book-' + b, { tab: 'plan' }), seed.book).then(() => toTabs(p))],
      ['book-talk', () => p.evaluate((b) => window.A.V.go('book-' + b, { tab: 'talk' }), seed.book).then(() => toTabs(p))],
      ['shelf', () => p.evaluate(() => window.A.V.go('shelf'))],
      ['circle', () => p.evaluate(() => window.A.V.go('circle'))],
      ['circle-chat', () => p.evaluate(() => window.A.V.go('circle', { seg: 'chat' }))],
      ['circle-board', () => p.evaluate(() => window.A.V.go('circle', { seg: 'board' }))],
      ['circle-members', () => p.evaluate(() => window.A.V.go('circle', { seg: 'members' }))],
      ['me', () => p.evaluate(() => window.A.V.go('me'))],
      ['settings', () => p.evaluate(() => window.A.V.go('settings'))],
      ['inbox', () => p.evaluate(() => window.A.V.openInbox())],
      ['menu', () => p.evaluate(() => window.A.V.go('shelf')).then(() => p.click('[data-act="shelf-more"]'))],
      ['quotes', () => p.evaluate(() => window.A.V.go('quotes'))],
      ['invite', () => p.evaluate(() => window.A.V.go('circle')).then(() => p.click('[data-act="invite"]')).then(() => p.waitForSelector('#inv-card img', { timeout: 8000 }))],
      ['recap', () => p.evaluate(() => window.A.V.circleRecap(window.A.U.weekStart()))],
      ['pick', () => p.evaluate(() => window.A.V.go('shelf')).then(() => p.click('[data-act="shelf-more"]')).then(() => p.click('.mi:has-text("اختارلي"), .mi:has-text("Pick"), .mi:has-text("اختر لي")'))],
      ['reader', () => p.evaluate((b) => (window.A.U.store.set('raceTab', 'now'), window.A.R.open(b, { page: 2 })), seed.book).then(() => T(1800))],
      ['reader-marks', () => p.evaluate((b) => window.A.R.open(b, { page: 2 }), seed.book).then(() => T(1800)).then(() => p.evaluate(() => document.querySelector('#rd-eye').click()))],
    ];
    const orients = process.env.LAND ? [['p', 390, 844], ['l', 844, 390]] : [['p', 390, 844]];
    for (const lang of LANGS) {
      for (const theme of THEMES) {
        await p.evaluate(([l, t]) => {
          window.A.L.set(l);
          window.A.U.store.set('theme', t);
          window.A.V.applyTheme();
          window.A.V.render(true);
        }, [lang, theme]);
        for (const [o, w, h] of orients) {
          await p.setViewportSize({ width: w, height: h });
          let i = 0;
          for (const [name, open] of views) {
            await closeAll(p);
            try {
              await open();
              await snap(p, `${lang}-${theme}-${o}-${String(++i).padStart(2, '0')}-${name}`);
            } catch (e) {
              console.log('could not show', name, String(e.message || e).split('\n')[0]);
            }
          }
        }
      }
    }
    const errs = (p.__errors || []).filter((e) => !/favicon|fonts|404/.test(e));
    console.log(`${fs.readdirSync(OUT).length} screenshots in ${OUT}${errs.length ? '\nerrors:\n  ' + errs.slice(0, 6).join('\n  ') : ''}`);
  } finally {
    await browser.close();
    await env.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
