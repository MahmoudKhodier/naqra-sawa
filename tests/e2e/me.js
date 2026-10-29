#!/usr/bin/env node
/*
 * «أنا»: the reading stats card (bars for 30 days / 12 weeks / this year, the numbers under them, on my profile and
 * on a friend's) and «دفتر اقتباساتي» (search, kind and book filters, «اقرأ الباقي», more as you scroll, opening the
 * book at the page), in مصري and English, light and dark.
 *
 *   node tests/e2e/me.js
 *
 * Screenshots: tests/e2e/shots/me-*.png
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
async function until(p, what, fn, arg, timeout = 8000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    throw new Error('timed out waiting for: ' + what);
  }
}
const theme = (p, t) =>
  p.evaluate((t) => {
    window.A.U.store.set('theme', t);
    window.A.V.applyTheme();
    window.A.V.render(true);
  }, t);
const lang = async (p, l) => {
  await p.evaluate((l) => {
    window.A.L.set(l);
    document.getElementById('app').innerHTML = '';
    window.A.V.render(true);
  }, l);
  await p.mouse.move(2, 2); // a mouse resting over a bar would show that bar's value instead of the total
  await T(100);
};
async function closeAll(p) {
  for (let i = 0; i < 6 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(300));
}
/* A picture: no toasts on top, the mouse off the bars, `at` ('stats' or 'top') in view. */
async function shot(p, name, at) {
  await p.mouse.move(2, 2);
  await p.addStyleTag({ content: '#toasts { visibility: hidden !important; }' });
  if (at === 'stats') await p.$eval('#me-stats', (e) => e.scrollIntoView({ block: 'center' }));
  if (at === 'top') await p.evaluate(() => (window.scrollTo(0, 0), (document.getElementById('screen').scrollTop = 0)));
  await T(350);
  return H.shot(p, name);
}
const num = (p, k) => p.$eval(`#me-stats .mst-n[data-k="${k}"] b`, (e) => e.textContent.trim()).catch(() => null);
const cards = (p) => p.$$eval('.qn-list .qn', (x) => x.length);

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let p, b, me, book, gone;
  const long = 'الكتاب ' + 'صديق لا يخون ولا يمل، يفتح لك أبوابًا لم تكن تعرفها، '.repeat(8) + 'آخر الجملة الطويلة.';
  try {
    await step('Sign in, make a circle, add a book', async () => {
      const u = await H.newUser(browser, env, 'me@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      p = u.page;
      await p.fill('#cn-name', 'حلقة');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.fill('#pl-per', '8');
      await p.click('#pl-form button.btn.gold');
      await p.waitForFunction(() => [...window.A.S.books.values()].some((b) => (b.wirds || []).length), null, { timeout: 20000 });
      for (let i = 0; i < 4 && (await p.$('.sheet-wrap')); i++) await p.keyboard.press('Escape').then(() => T(250));
    });

    await step('Seed reading days, time, a shelf and notes', async () => {
      const r = await p.evaluate(async (long) => {
        const { D, S, U } = window.A;
        const b = [...S.books.values()][0];
        const Y = U.today().slice(0, 4);
        const ago = (i) => U.addDays(U.today(), -i);
        const iso = (i, h = 12) => new Date(U.parseD(ago(i)).getTime() + h * 3600e3).toISOString();
        const days = { [ago(1)]: 10, [ago(2)]: 20, [ago(3)]: 30, [ago(10)]: 40, [ago(40)]: 50 };
        const secs = { [ago(1)]: 600, [ago(2)]: 1200, [ago(3)]: 1800, [ago(10)]: 2400, [ago(40)]: 3000 };
        await D.updateMe(() => ({ days, secs }));
        const items = {
          s1: { title: 'ثلاثية غرناطة', author: 'رضوى عاشور', status: 'read', finished: Y + '-01', at: U.nowIso() },
          s2: { title: 'الأيام', author: 'طه حسين', status: 'read', finished: Y + '-01', at: U.nowIso() },
          s3: { title: 'الحرافيش', author: 'نجيب محفوظ', status: 'read', finished: Y + '-03', reads: [{ finished: +Y - 1 + '-06' }], at: U.nowIso() },
          s4: { title: 'عبقرية عمر', author: 'العقاد', status: 'read', finished: Y, at: U.nowIso() },
          s5: { title: 'رجال في الشمس', author: 'غسان كنفاني', status: 'read', finished: +Y - 1 + '-05', at: U.nowIso() },
          s6: { title: 'عزازيل', author: 'يوسف زيدان', status: 'want', at: U.nowIso() },
          s7: { title: 'موسم الهجرة إلى الشمال', author: 'الطيب صالح', status: 'read', finished: Y + '-04', reads: [{ finished: Y + '-02' }], at: U.nowIso() },
        };
        await D.mutate(`shelf/${S.me}`, () => ({ items }));
        await D.saveProg(b.id, () => ({ finished: U.nowIso() })); // finished with the circle: this month
        const goneId = D.newId();
        await D.set(`gone/${goneId}`, { title: 'كتاب قديم', wirds: [], at: U.nowIso() });
        const note = (kind, page, text, i, bk = b.id) => D.set(`notes/${D.newId()}`, { b: bk, page, kind, text, rect: kind === 'take' ? null : { x: 0.1, y: 0.2, w: 0.6, h: 0.05 }, color: 'gold', by: S.me, at: iso(i), wid: '', likes: {}, replies: {} });
        await note('quote', 3, 'القراءة سفر بلا حقائب، ورفقة لا تخذلك.', 1);
        await note('note', 5, 'ملاحظة عن الفصل الأول', 2);
        await note('q', 7, 'ليه البطل مشي من البيت؟', 3);
        await note('hl', 9, 'جملة مظللة جميلة', 4);
        await note('take', 8, 'الخلاصة: الصبر مفتاح', 5);
        await note('quote', 2, long, 6);
        await note('quote', 4, 'اقتباس من كتاب اتشال', 7, goneId);
        const pn = { pv1: { b: b.id, page: 4, kind: 'note', text: 'سر صغير عن الإسكندرية', rect: { x: 0.1, y: 0.4, w: 0.01, h: 0.01 }, color: 'gold', at: iso(0, 1) } };
        for (let i = 0; i < 65; i++) pn['old' + i] = { b: b.id, page: 10 + (i % 20), kind: 'hl', text: 'تظليل قديم رقم ' + i, rect: { x: 0.1, y: 0.5, w: 0.5, h: 0.04 }, color: 'gold', at: iso(60 + i) };
        await D.mutate(`data/users/${S.me}/priv`, () => Object.assign({}, S.priv || {}, { notes: Object.assign({}, (S.priv && S.priv.notes) || {}, pn) }));
        return { me: S.me, book: b.id, title: b.title, gone: goneId };
      }, long);
      me = r.me;
      book = r;
      gone = r.gone;
      await until(p, 'everything synced', () => {
        const { S, G, V } = window.A;
        return G.of(S.me).pages === 150 && V.myQuotes().length === 73 && V.shelfItems(S.me).length === 8;
      }, null, 15000);
      await T(2500); // the level-up and badge celebrations come and go
      await closeAll(p);
    });

    await step('Stats card on «أنا»: numbers', async () => {
      await p.click('[data-go="me"]');
      await p.waitForSelector('#me-stats');
      await p.evaluate(() => {
        const b = document.querySelector('#me-stats [data-act="mst-period"][data-v="d30"]');
        b.click();
        const m = document.querySelector('#me-stats [data-act="mst-metric"][data-v="pages"]');
        m && m.click();
      });
      const want = await p.evaluate(() => {
        const { L, G, S, U } = window.A;
        // busiest weekday from the seeded days, computed independently
        const sums = {};
        [[1, 10], [2, 20], [3, 30], [10, 40], [40, 50]].forEach(([i, n]) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          sums[d.getDay()] = (sums[d.getDay()] || 0) + n;
        });
        const top = Object.entries(sums).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        return {
          avg: L.num(30), speed: L.num(60), best: L.num(50), streak: L.num(G.of(S.me).best),
          wday: new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(new Date(2026, 0, 4 + +top)),
          bestLabel: L.dayShort(U.addDays(U.today(), -40)),
        };
      });
      const got = { avg: await num(p, 'avg'), speed: await num(p, 'speed'), best: await num(p, 'best'), streak: await num(p, 'streak'), wday: await num(p, 'wday') };
      for (const k of Object.keys(got)) assert(got[k] === want[k], `${k}: ${got[k]} ≠ ${want[k]}`);
      const bestTxt = await p.$eval('#me-stats .mst-n[data-k="best"] small', (e) => e.textContent);
      assert(bestTxt.includes(want.bestLabel), 'best day label: ' + bestTxt);
      return JSON.stringify(got);
    });

    await step('30 days: 30 bars, right to left, tallest is the 40-page day; tap shows its value', async () => {
      const bars = await p.$$eval('#me-stats .mst-bar', (x) => x.map((b) => ({ v: +b.dataset.v, h: b.querySelector('i').style.height, x: b.getBoundingClientRect().x, zero: b.classList.contains('zero') })));
      assert(bars.length === 30, bars.length + ' bars');
      assert(bars.filter((b) => !b.zero).length === 4, 'bars with pages: ' + bars.filter((b) => !b.zero).length);
      assert(bars[29].v === 0 && bars[28].v === 10 && bars[27].v === 20 && bars[26].v === 30 && bars[19].v === 40, 'values: ' + bars.map((b) => b.v).join(','));
      assert(bars[19].h === '100%' && bars[28].h === '25%', `heights ${bars[19].h} ${bars[28].h}`);
      assert(bars[0].x > bars[29].x, 'in Arabic the oldest day should be on the right');
      const total = await p.textContent('#mst-read');
      assert(total.includes('١٠٠ صفحة') && total.includes('٤ أيام'), 'total line: ' + total);
      await p.locator('#me-stats .mst-bar').nth(19).tap();
      const read = await p.textContent('#mst-read');
      assert(read.includes('٤٠ صفحة'), 'readout after tap: ' + read);
      assert(await p.$eval('#me-stats .mst-bar:nth-child(20)', (e) => e.classList.contains('on')), 'tapped bar not marked');
      await p.locator('#me-stats .mst-bar').nth(19).tap(); // again: back to the total
      assert((await p.textContent('#mst-read')).includes('١٠٠ صفحة'), 'second tap did not go back to the total');
      await shot(p, 'me-stats-light', 'stats');
    });

    await step('Time per day, 12 weeks and this year switch the bars', async () => {
      await p.click('#me-stats [data-act="mst-metric"][data-v="time"]');
      let read = await p.textContent('#mst-read');
      assert(read.includes('ساعة و٤٠ دقيقة'), '30-day time total: ' + read);
      assert(await p.$('#me-stats .mst-chart.jade'), 'time bars are not green');
      await p.click('#me-stats [data-act="mst-period"][data-v="w12"]');
      assert((await p.$$('#me-stats .mst-bar')).length === 12, '12 weeks: wrong bar count');
      read = await p.textContent('#mst-read');
      assert(read.includes('١٥٠ صفحة'), '12-week pages total (a new period starts on pages): ' + read);
      await p.click('#me-stats [data-act="mst-metric"][data-v="time"]');
      read = await p.textContent('#mst-read');
      assert(read.includes('ساعتين و٣٠ دقيقة'), '12-week time total: ' + read);
      await p.click('#me-stats [data-act="mst-period"][data-v="yr"]');
      const yr = await p.$$eval('#me-stats .mst-bar', (x) => x.map((b) => +b.dataset.v));
      assert(yr.length === 12, '12 months: ' + yr.length);
      const month = await p.evaluate(() => +window.A.U.today().slice(5, 7));
      const want = [2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
      want[month - 1] += 1; // the book finished with the circle
      assert(JSON.stringify(yr) === JSON.stringify(want), 'books per month: ' + yr.join(',') + ' want ' + want.join(','));
      read = await p.textContent('#mst-read');
      assert(read.includes('٧ كتب') && read.includes('١ من غير شهر'), 'year total: ' + read);
      await shot(p, 'me-stats-year-light', 'stats');
      await p.click('#me-stats [data-act="mst-period"][data-v="d30"]');
    });

    await step('The notebook card on «أنا» and in the shelf ⋯ menu', async () => {
      await p.waitForSelector('.qn-entry');
      const t = await p.textContent('.qn-entry');
      assert(t.includes('٧٣ ملاحظة') && t.includes('القراءة سفر بلا حقائب'), 'entry card: ' + t.replace(/\s+/g, ' '));
      await p.click('[data-go="shelf"]');
      await p.click('[data-act="shelf-more"]');
      await p.click('.mi:has-text("دفتر اقتباساتي")');
      await until(p, 'notebook opened', () => window.A.V.state.route === 'quotes' && !!document.querySelector('.qn-list'));
      const nav = await p.$eval('.nav .nv.on', (e) => e.dataset.go);
      assert(nav === 'me', 'tab lit: ' + nav);
    });

    await step('Notebook: newest first, 60 at a time, more as you scroll', async () => {
      const first = await p.$eval('.qn-list .qn .qn-text', (e) => e.textContent);
      assert(first.includes('الإسكندرية'), 'newest first: ' + first);
      assert((await cards(p)) === 60, 'first batch: ' + (await cards(p)));
      await p.$eval('#qn-sent', (e) => e.scrollIntoView());
      await until(p, 'more cards', () => document.querySelectorAll('.qn-list .qn').length === 73);
      assert(!(await p.$('#qn-sent')), 'sentinel stayed after the last batch');
    });

    await step('Notebook: search ignores hamza/ta marbuta; kind and book filters', async () => {
      await p.fill('#qn-q', 'الاسكندريه');
      await until(p, 'search narrowed', () => document.querySelectorAll('.qn-list .qn').length === 1);
      assert(await p.$('.qn-list .qn.priv'), 'the private note was not the match');
      await p.fill('#qn-q', 'كتاب قديم'); // a book title
      await until(p, 'title search', () => document.querySelectorAll('.qn-list .qn').length === 1);
      await p.fill('#qn-q', 'zzzz');
      await p.waitForSelector('.quotes-page .empty');
      await p.click('[data-act="qn-clear"]');
      await until(p, 'cleared', () => document.querySelectorAll('.qn-list .qn').length === 60 && document.getElementById('qn-q').value === '');
      await p.click('.qn-kinds [data-v="q"]');
      await until(p, 'questions only', () => document.querySelectorAll('.qn-list .qn').length === 1 && !!document.querySelector('.qn.k-q'));
      await p.click('.qn-kinds [data-v="quote"]');
      await until(p, 'quotes only', () => document.querySelectorAll('.qn-list .qn').length === 3);
      await p.click(`.qn-books [data-v="${gone}"]`);
      await until(p, 'quotes in the removed book', () => document.querySelectorAll('.qn-list .qn').length === 1);
      await p.click('.qn-books [data-v=""]');
      await until(p, 'all books', () => document.querySelectorAll('.qn-list .qn').length === 3);
    });

    await step('Notebook: long text folds with «اقرأ الباقي»', async () => {
      const h0 = await p.$eval('.qn-text.fold', (e) => e.getBoundingClientRect().height);
      await p.click('.qn-more');
      await until(p, 'unfolded', () => !document.querySelector('.qn-text.fold'));
      const h1 = await p.$eval('.qn:has(.qn-more) .qn-text', (e) => e.getBoundingClientRect().height);
      assert(h1 > h0 * 1.5, `did not grow: ${h0} → ${h1}`);
      assert((await p.textContent('.qn-more')).includes('اقفل'), 'button text');
      await p.click('.qn-more');
      await p.waitForSelector('.qn-text.fold');
      await p.click('.qn-kinds [data-v=""]');
      await T(300);
      await shot(p, 'me-quotes-light', 'top');
    });

    await step('Tapping a quote opens the book at its page', async () => {
      await p.click('.qn-kinds [data-v="quote"]');
      const card = p.locator('.qn:has-text("القراءة سفر بلا حقائب") .qn-main');
      await card.click();
      await until(p, 'reader open on page 3', () => window.A.R.isOpen() && window.A.R.current().page === 3, null, 15000);
      await p.evaluate(() => window.A.R.close(true));
      await p.evaluate(() => window.A.V.render(true));
      await p.click(`.qn-books [data-v="${gone}"]`);
      await p.click('.qn-list .qn-main');
      await p.waitForSelector('#toasts .toast', { timeout: 5000, state: 'attached' });
      assert(!(await p.evaluate(() => window.A.R.isOpen())), 'a removed book opened');
    });

    await step('Dark theme pictures', async () => {
      await theme(p, 'dark');
      await p.click('.qn-books [data-v=""]');
      await p.click('.qn-kinds [data-v=""]');
      await T(300);
      await shot(p, 'me-quotes-dark', 'top');
      await p.evaluate(() => window.A.V.go('me'));
      await p.waitForSelector('#me-stats');
      await shot(p, 'me-stats-dark', 'stats');
      await theme(p, 'light');
    });

    await step('English: left to right, same numbers', async () => {
      await lang(p, 'en');
      await p.waitForSelector('#me-stats');
      const h = await p.textContent('#me-stats h2');
      assert(h.includes('Reading stats'), 'title: ' + h);
      assert((await num(p, 'avg')) === '30' && (await num(p, 'speed')) === '60' && (await num(p, 'best')) === '50', 'numbers in English');
      const xs = await p.$$eval('#me-stats .mst-bar', (x) => x.map((b) => b.getBoundingClientRect().x));
      assert(xs[0] < xs[29], 'in English the oldest day should be on the left');
      const total = await p.textContent('#mst-read');
      assert(total.includes('100 pages') && total.includes('4 reading days'), 'total: ' + total);
      await p.click('#me-stats [data-act="mst-period"][data-v="w12"]');
      await p.click('#me-stats [data-act="mst-metric"][data-v="time"]');
      assert((await p.textContent('#mst-read')).includes('2 h 30 min'), 'English duration: ' + (await p.textContent('#mst-read')));
      await p.click('#me-stats [data-act="mst-period"][data-v="d30"]');
      await p.click('#me-stats [data-act="mst-metric"][data-v="pages"]');
      await shot(p, 'me-stats-en', 'stats');
      await p.click('.qn-entry');
      await p.waitForSelector('.qn-list');
      assert((await p.textContent('.quotes-page h1')).includes('My quotes notebook'), 'notebook title');
      await p.fill('#qn-q', 'old book'); // nothing matches in English text
      await p.waitForSelector('.quotes-page .empty');
      assert((await p.textContent('.quotes-page .empty')).includes('Nothing matches'), 'English empty text');
      await p.click('[data-act="qn-clear"]');
      await lang(p, 'eg');
    });

    await step("A friend's profile shows the stats, not the notebook", async () => {
      const cid = await p.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const site = env.siteUrl.replace(/\/?$/, '/');
      const u = await H.newUser(browser, env, 'friend@test.local', { url: site + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = u.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await until(b, 'friend sees the pages and the shelf', (uid) => window.A.G.of(uid).pages === 150 && window.A.V.shelfItems(uid).length === 8, me, 15000);
      await b.evaluate((uid) => window.A.V.go('me', { uid }), me);
      await b.waitForSelector('#me-stats');
      assert((await num(b, 'avg')) === '٣٠' && (await num(b, 'best')) === '٥٠', 'numbers on the friend’s view');
      assert(!(await b.$('.qn-entry')), 'the notebook card shows on someone else’s profile');
      await b.click('#me-stats [data-act="mst-period"][data-v="yr"]');
      const yr = await b.$$eval('#me-stats .mst-bar', (x) => x.reduce((s, e) => s + +e.dataset.v, 0));
      assert(yr === 6, 'books in this year’s months as the friend sees them: ' + yr);
      // my own empty notebook
      await b.evaluate(() => window.A.V.go('quotes'));
      await b.waitForSelector('.quotes-page .empty');
      assert((await b.textContent('.quotes-page .empty')).includes('اقتباس'), 'empty state explains how to add quotes');
      await shot(b, 'me-quotes-empty', 'top');
    });

    await step('No errors in the console', async () => {
      const errs = [...(p.__errors || []), ...((b && b.__errors) || [])].filter((e) => !/favicon|fonts|404|INTERNET_DISCONNECTED|Failed to fetch/.test(e));
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
