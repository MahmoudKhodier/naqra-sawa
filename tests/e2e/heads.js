#!/usr/bin/env node
/*
 * «الفهرس»: headings put in a book while reading, on a 4-page Arabic book made on the spot with headings at four
 * levels (mocks/heads-book.js). The tool «عنوان», a tap beside a heading's line: the sheet (the line, the level
 * suggested one below the previous heading, the path it goes under, the name read from the line), the mark in
 * the margin (◆ ● ○ •), no second mark on the same line, the card on a tap, «إنت فين» under the top bar, the
 * contents tab (and going to a heading), what a portion covered (in «خلاصة الورد», the portion's sheet, Today,
 * the news), a member: sees them, adds one, cannot fix someone else's (the app and the database), hides them with
 * the eye; made an admin, fixes one; the file's own outline merged in; XP.
 *
 *   node tests/e2e/heads.js      → tests/e2e/shots/hd2-*.png
 */
'use strict';
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');
const Book = require('./mocks/heads-book');

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
    console.log(`FAIL  ${name}\n      ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n      ')}`);
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
async function shot(p, name) {
  await p.addStyleTag({ content: '#toasts { visibility: hidden !important; }' });
  await T(300);
  return H.shot(p, name);
}
const heads = (p) => p.evaluate(() => [...window.A.S.heads.values()].map((h) => ({ id: h.id, page: h.page, y: h.y, l: h.l, t: h.t, by: h.by })).sort((a, b) => a.page - b.page || a.y - b.y));
/* Put the page on screen with that line a little below the top, then tap beside it in the margin. */
async function tapBeside(p, page, y) {
  await p.evaluate(([pg, y]) => window.A.R.goToY(pg, Math.max(0, y - 0.05)), [page, y]);
  await T(500);
  const box = await p.$eval(`.pg-ov[data-p="${page}"]`, (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await p.mouse.click(box.x + box.w * 0.93, box.y + box.h * y);
}
async function addHead(p, page, y) {
  await p.click('.rd-tools [data-tool="head"]');
  await p.waitForSelector('#rd-hint:not([hidden])');
  await tapBeside(p, page, y);
  await p.waitForSelector('.sheet .hd-lv', { timeout: 10000 });
  await T(300);
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const vp = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
  let a, b, bookId, cid, bUid, marks;
  try {
    await step('A circle of two, a 4-page book with headings at four levels, portions 1–3 and 4', async () => {
      const PDF = path.join(os.tmpdir(), 'naqra-heads-test.pdf');
      marks = await Book.make(browser, PDF);
      const A = await H.newUser(browser, env, 'hda@test.local', vp);
      a = A.page;
      await a.fill('#cn-name', 'حلقة الفهرس');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'محمود');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.fill('#ab-title', 'الخلافة الراشدة').catch(() => {});
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.fill('#pl-per', '3');
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      await a.evaluate(async (id) => {
        const { D, U } = window.A;
        const wirds = [
          { id: 'w1', n: 1, from: 1, to: 3, start: U.today(), due: U.today() },
          { id: 'w2', n: 2, from: 4, to: 4, start: U.addDays(U.today(), 1), due: U.addDays(U.today(), 1) },
        ];
        await D.update(`books/${id}`, { title: 'الخلافة الراشدة', wirds });
        U.store.set('rdFocusOffered', U.today());
      }, bookId);
      cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'hdb@test.local', Object.assign({ url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code }, vp));
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await b.evaluate(() => {
        window.A.Goals && (window.A.Goals.off = true);
        window.A.U.store.set('rdFocusOffered', window.A.U.today());
      });
      bUid = await b.evaluate(() => window.A.S.me);
      await until(a, 'two members', () => window.A.S.members.size === 2);
      await T(1200);
      await closeAll(a);
      await closeAll(b);
      return `${marks.heads.length} headings in the file`;
    });

    const H1 = () => marks.heads.find((h) => h.l === 1);
    const yc = (h) => h.y + h.h / 2;

    await step('The tool «عنوان»: a tap beside the chapter line opens the sheet with the line, «فصل» suggested and the name read from the page', async () => {
      await a.evaluate((id) => window.A.R.open(id, { page: 1 }), bookId);
      await a.waitForSelector('.pg[data-p="1"] canvas', { timeout: 20000 });
      await T(1500);
      assert(await a.$('.rd-tools [data-tool="head"]'), 'no tool');
      await addHead(a, 1, yc(H1()));
      const s = await a.evaluate(() => ({ on: document.querySelector('.hd-lv .on').dataset.l, name: document.querySelector('#hd-name').value, img: !!document.querySelector('.hd-line img'), path: document.querySelector('#hd-path').textContent }));
      assert(s.on === '1', 'suggested level ' + s.on);
      assert(/الخلافة الراشدة/.test(s.name) && /الفصل الثالث/.test(s.name), 'name: ' + s.name);
      assert(s.img, 'no picture of the line');
      await shot(a, 'hd2-1-sheet');
      await a.click('.sheet [data-save]');
      await until(a, 'saved', () => window.A.S.heads.size === 1);
      const h = (await heads(a))[0];
      assert(h.l === 1 && h.page === 1 && Math.abs(h.y - yc(H1())) < 0.03, 'stored: ' + JSON.stringify(h));
      await a.waitForSelector('.pg-ov[data-p="1"] .hdm.l1');
      assert(!(await a.$('.rd-tools [data-tool="head"].on')), 'the tool stayed on');
      return `«${h.t}» y ${h.y}`;
    });

    await step('Then a مبحث, a مطلب and a فرع: each suggested one below the one before, with the path it goes under', async () => {
      const want = [2, 3, 4];
      for (const l of want) {
        const hh = marks.heads.find((x) => x.l === l && x.p === 1);
        await addHead(a, 1, yc(hh));
        const s = await a.evaluate(() => ({ on: document.querySelector('.hd-lv .on').dataset.l, name: document.querySelector('#hd-name').value, path: document.querySelector('#hd-path').textContent }));
        assert(+s.on === l, `level for ${hh.t}: ${s.on}`);
        assert(s.name.replace(/\s/g, '') === hh.t.replace(/\s/g, ''), `name: «${s.name}» vs «${hh.t}»`);
        if (l === 3) assert(/الفصل الثالث/.test(s.path) && /المبحث الأول/.test(s.path), 'path: ' + s.path);
        await a.click('.sheet [data-save]');
        await until(a, 'saved ' + l, (n) => window.A.S.heads.size === n, l);
      }
      const hs = await heads(a);
      assert(hs.map((h) => h.l).join() === '1,2,3,4', 'levels ' + hs.map((h) => h.l));
      await a.waitForSelector('.pg-ov[data-p="1"] .hdm.l4');
      return hs.map((h) => h.t).join(' | ');
    });

    await step('The marks sit in the margin, clear of the words; a tap beside a line that has one opens it (no second mark)', async () => {
      const r = await a.evaluate(() => {
        const ov = document.querySelector('.pg-ov[data-p="1"]').getBoundingClientRect();
        return [...document.querySelectorAll('.pg-ov[data-p="1"] .hdm')].map((m) => (m.getBoundingClientRect().left + m.getBoundingClientRect().width / 2 - ov.left) / ov.width);
      });
      assert(r.length === 4 && r.every((x) => x > 0.89), 'marks at ' + r.map((x) => x.toFixed(2)));
      await a.click('.rd-tools [data-tool="head"]');
      await tapBeside(a, 1, yc(marks.heads.find((x) => x.l === 2)));
      await a.waitForSelector('.sheet [data-del]');
      assert((await a.$eval('.sheet .hd-lv .on', (e) => e.dataset.l)) === '2', 'not the مبحث');
      await closeAll(a);
      assert((await heads(a)).length === 4, 'a second mark');
      await a.evaluate(() => window.A.R.goToY(1, 0));
      await T(500);
      await shot(a, 'hd2-2-page');
    });

    await step('A tap on a mark: a card beside it (level, name, page, inside); «عدّل» opens the sheet', async () => {
      await a.click('.pg-ov[data-p="1"] .hdm.l2');
      await a.waitForSelector('.hd-pop');
      const t = await a.textContent('.hd-pop');
      assert(/مبحث/.test(t) && /خلافة أبي بكر/.test(t) && /جوّاه/.test(t), 'card: ' + t);
      await shot(a, 'hd2-3-card');
      await a.click('.hd-pop [data-hp="edit"]');
      await a.waitForSelector('.sheet #hd-name');
      await a.fill('#hd-name', 'المبحث الأول: خلافة الصدّيق');
      await a.click('.sheet [data-save]');
      await until(a, 'renamed', () => [...window.A.S.heads.values()].some((h) => h.t === 'المبحث الأول: خلافة الصدّيق'));
    });

    await step('«إنت فين» under the top bar: the path at the line a third down the screen', async () => {
      await a.evaluate(() => window.A.R.goToY(1, 0.85));
      await T(600);
      const t = await a.evaluate(() => {
        const e = document.querySelector('#rd-hstrip');
        return e && !e.hidden ? e.textContent : '';
      });
      assert(/الفرع الأول/.test(t) && /الفصل الثالث/.test(t), 'strip: ' + t);
      return t;
    });

    await step('The contents tab: four rows by level, «إنت هنا», a row goes to its line', async () => {
      await a.click('#rd-hstrip');
      await a.waitForSelector('#rd-panel .hd-row');
      const rows = await a.$$eval('#rd-panel .hd-row', (x) => x.map((e) => e.className.match(/l\d/)[0] + (e.classList.contains('on') ? '*' : '')));
      assert(rows.length === 4 && rows[0] === 'l1', 'rows ' + rows);
      assert(rows.some((r) => r.endsWith('*')), 'no «إنت هنا»');
      await shot(a, 'hd2-4-contents');
      await a.click('#rd-panel .hd-row.l1');
      await T(600);
      const cur = await a.evaluate(() => window.A.R.current().page);
      assert(cur === 1, 'page ' + cur);
    });

    await step('Her phone: the marks and the contents; her card has no «عدّل»; she adds a فرع on page 2', async () => {
      await b.evaluate((id) => window.A.R.open(id, { page: 1 }), bookId);
      await b.waitForSelector('.pg-ov[data-p="1"] .hdm.l1', { timeout: 20000 });
      await b.click('.pg-ov[data-p="1"] .hdm.l3');
      await b.waitForSelector('.hd-pop');
      assert(!(await b.$('.hd-pop [data-hp="edit"]')), 'a member can fix someone else\'s');
      assert(/من محمود/.test(await b.textContent('.hd-pop')), 'who');
      await b.mouse.click(30, 400);
      await T(300);
      const h = marks.heads.find((x) => x.l === 4 && x.p === 2);
      await addHead(b, 2, yc(h));
      assert((await b.$eval('.sheet .hd-lv .on', (e) => e.dataset.l)) === '4', 'level after a فرع');
      await b.click('.sheet [data-save]');
      await until(a, 'he sees it', () => window.A.S.heads.size === 5);
    });

    await step('The database keeps someone else\'s heading as it is (the member)', async () => {
      const id = (await heads(b)).find((h) => h.l === 1).id;
      const err = await b.evaluate((id) => window.A.S.db.doc('heads/' + id).update({ t: 'x' }).then(() => '', (e) => String(e.code || e.message || e)), id);
      assert(err, 'the member renamed it');
      await T(800);
      const t = await a.evaluate((id) => window.A.S.heads.get(id).t, id);
      assert(t !== 'x', 'changed');
      return err;
    });

    await step('The eye: her «عناوين» off hides his marks, hers stay', async () => {
      await b.evaluate(() => window.A.R.goToY(1, 0));
      await T(400);
      await b.click('#rd-eye');
      await b.waitForSelector('#rd-mk [data-act="mk-kind"][data-k="head"]');
      await b.click('#rd-mk [data-act="mk-kind"][data-k="head"]');
      await T(400);
      assert(!(await b.$('.pg-ov[data-p="1"] .hdm')), 'his marks still show');
      await b.evaluate(() => window.A.R.goToY(2, 0));
      await T(500);
      assert(await b.$('.pg-ov[data-p="2"] .hdm.mine'), 'hers is gone');
      await b.click('#rd-mk [data-act="mk-pre"][data-v="all"]');
      await b.click('#rd-mk [data-act="mk-close"]').catch(() => {});
    });

    await step('Made an admin, she fixes his heading (the app and the database)', async () => {
      const err = await a.evaluate(([c, u]) => window.A.P.setRole(c, u, 'admin').then(() => '', (e) => String(e.message || e)), [cid, bUid]);
      assert(!err, 'setRole: ' + err);
      await b.reload();
      await b.waitForSelector('.shell #screen', { timeout: 20000 });
      await until(b, 'admin', () => window.A.S.canEdit, null, 15000);
      await b.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await closeAll(b);
      await b.evaluate((id) => window.A.R.open(id, { page: 1 }), bookId);
      await b.waitForSelector('.pg-ov[data-p="1"] .hdm.l4', { timeout: 20000 });
      await b.click('.pg-ov[data-p="1"] .hdm.l4');
      await b.waitForSelector('.hd-pop');
      if (!(await b.$('.hd-pop [data-hp="edit"]')))
        throw new Error('no «عدّل»: ' + JSON.stringify(await b.evaluate(() => ({ canEdit: window.A.S.canEdit, owner: window.A.S.isOwner, w: window.A.D.canWrite(), pop: document.querySelector('.hd-pop').textContent }))));
      await b.click('.hd-pop [data-hp="edit"]');
      await b.waitForSelector('.sheet .hd-hint');
      assert(/مشرف/.test(await b.textContent('.sheet .hd-hint')), 'no admin line');
      await b.click('.sheet .hd-lv [data-l="3"]');
      await b.click('.sheet [data-save]');
      await until(a, 'his phone has the fix', () => [...window.A.S.heads.values()].some((h) => h.page === 1 && h.l === 3 && /موقف الأنصار/.test(h.t)));
      // put it back
      await b.evaluate(() => {
        const h = [...window.A.S.heads.values()].find((x) => /موقف الأنصار/.test(x.t));
        return window.A.D.update('heads/' + h.id, { l: 4 });
      });
      await closeAll(b);
      await b.evaluate(() => window.A.R.close());
    });

    await step('What portion 1 covered: «خلاصة الورد», the portion\'s sheet, Today and the news', async () => {
      // a heading in portion 2, for «the next portion starts with»
      const h = marks.heads.find((x) => x.p === 4 && x.l === 3);
      await a.evaluate(([id, h]) => window.A.D.set('heads/hx', { b: id, page: 4, y: h.y + h.h / 2, l: 3, t: h.t, by: window.A.S.me, at: new Date().toISOString() }), [bookId, h]);
      await until(a, 'six', () => window.A.S.heads.size === 6);
      await a.evaluate(() => window.A.R.close());
      await a.evaluate((id) => window.A.V.writeTake(id, 'w1'), bookId);
      await a.waitForSelector('.sheet .hd-cov');
      const rows = await a.$$eval('.sheet .hd-cov .hd-cr', (x) => x.map((e) => e.className.match(/l\d/)[0]));
      const next = await a.textContent('.sheet .hd-next');
      assert(rows.join() === 'l1,l2,l3,l4,l4', 'rows ' + rows);
      assert(/المطلب الثاني: معركة اليمامة/.test(next) || /المطلب الثاني/.test(next), 'next: ' + next);
      await shot(a, 'hd2-5-take');
      await closeAll(a);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.evaluate((id) => window.A.V.actions.wird({ dataset: { b: id, w: 'w2' } }), bookId);
      await a.waitForSelector('.sheet .wsheet .hd-cov');
      const t2 = await a.textContent('.sheet .hd-cov');
      assert(/الورد ده فيه/.test(t2) && /تكملة/.test(t2) && /معركة اليمامة/.test(t2), 'portion 2: ' + t2);
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('.hero .hi-hd');
      const t3 = await a.textContent('.hero .hi-hd');
      assert(/الفصل الثالث/.test(t3), 'Today: ' + t3);
      await shot(a, 'hd2-6-today');
      return t3.trim();
    });

    await step('The plan by chapter («فصول»); the book\'s tabs change in place (the page doesn\'t jump or draw again)', async () => {
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.plan-views [data-v="ch"]');
      await a.click('.plan-views [data-v="ch"]');
      await a.waitForSelector('.wchs .wch');
      const ch = await a.evaluate(() => [...document.querySelectorAll('.wch')].map((c) => ({ t: c.querySelector('.wch-h span').textContent, ws: [...c.querySelectorAll('.wch-w')].map((x) => x.textContent.trim()) })));
      assert(ch.length === 1 && /الفصل الثالث/.test(ch[0].t) && ch[0].ws.length === 2, 'chapters: ' + JSON.stringify(ch));
      await shot(a, 'hd2-9-chapters');
      // a tab: the same page (the hero is the same element), the same scroll
      const before = await a.evaluate(() => {
        const sc = document.scrollingElement;
        sc.scrollTop = 260;
        document.querySelector('.bp-hero')._kept = 'kept';
        return sc.scrollTop;
      });
      await a.click('.tabs [data-tab="notes"]');
      await a.waitForSelector('.tab.on[data-tab="notes"]');
      await T(300);
      const after = await a.evaluate(() => ({ top: document.scrollingElement.scrollTop, kept: (document.querySelector('.bp-hero') || {})._kept }));
      assert(after.kept === 'kept', 'the page was drawn again');
      assert(Math.abs(after.top - before) < 40, `scrolled: ${before} → ${after.top}`);
      await a.click('.tabs [data-tab="plan"]');
      await a.waitForSelector('.tab.on[data-tab="plan"]');
      await a.evaluate(() => window.A.U.store.set('planView', 'cal'));
    });

    await step('The file\'s own outline joins in (its single top entry, the book itself, left out)', async () => {
      const r = await a.evaluate(async (id) => {
        const { D, Hd } = window.A;
        await D.update(`books/${id}`, { toc: [{ d: 0, p: 1, t: 'الخلافة الراشدة' }, { d: 1, p: 1, t: 'تقديم' }, { d: 1, p: 4, t: 'الخاتمة' }] });
        await new Promise((r) => setTimeout(r, 600));
        return Hd.list(id).map((h) => `${h.src}:${h.l}:${h.t}`);
      }, bookId);
      assert(!r.some((x) => /pdf:.*الخلافة الراشدة/.test(x)), 'the book itself: ' + r);
      assert(r.includes('pdf:1:تقديم') && r.includes('pdf:1:الخاتمة'), 'outline: ' + r);
      await a.evaluate((id) => window.A.D.update(`books/${id}`, { toc: [] }), bookId);
      return r.length + ' entries';
    });

    await step('The notebook and export: heading lines between the notes, in the text and the report; the book with its notes has them as its contents', async () => {
      // two notes: under the مبحث and under the second فرع
      await a.evaluate(async (id) => {
        const { D, S, U } = window.A;
        await D.set('notes/n1', { b: id, page: 1, kind: 'quote', text: 'تولّى أبو بكر الخلافة سنة إحدى عشرة', rect: { x: 0.2, y: 0.36, w: 0.5, h: 0.03 }, color: '#f5c542', by: S.me, at: U.nowIso(), likes: {}, replies: {}, crop: null });
        await D.set('notes/n2', { b: id, page: 2, kind: 'note', text: 'حجة المهاجرين', rect: { x: 0.5, y: 0.2, w: 0, h: 0 }, color: '#f5c542', by: S.me, at: U.nowIso(), likes: {}, replies: {}, crop: null });
      }, bookId);
      await until(a, 'notes', () => window.A.S.notes.size >= 2);
      // her ❤️ on my quote (shows under it in the text)
      await until(b, 'the note on her phone', () => window.A.S.notes.has('n1'));
      await b.evaluate(() => window.A.D.update('notes/n1', { likes: { [window.A.S.me]: new Date().toISOString() }, rx: { [window.A.S.me]: '❤️' } }));
      await until(a, 'her reaction', () => Object.keys((window.A.S.notes.get('n1') || {}).rx || {}).length === 1);
      await a.evaluate((id) => window.A.V.go('quotes', { v: 'books', bk: id }), bookId);
      await a.waitForSelector('.qn-hd');
      const lines = await a.$$eval('.qn-hd', (x) => x.map((e) => e.textContent.trim()));
      assert(lines.length === 2 && /المبحث الأول/.test(lines[0]) && /الفرع الثاني/.test(lines[1]), 'notebook: ' + lines);
      await shot(a, 'hd2-7-notebook');
      const out = await a.evaluate(async (id) => {
        const { Export, Hd } = window.A;
        const o = { b: id, who: 'all', people: new Set(), kinds: new Set(['quote', 'hl', 'note', 'q', 'take']), replies: true, stars: false };
        const gs = Export.groups(Export.gather(o).notes, o);
        const text = Export.asText(gs, o);
        const bk = Export.asBackup(gs, o);
        const r = await Export.asAnnotated(gs[0]);
        const doc = await window.PDFLib.PDFDocument.load(await r.files[0].blob.arrayBuffer());
        const ol = doc.catalog.lookup(window.PDFLib.PDFName.of('Outlines'));
        let n = 0;
        const walk = (ref) => {
          for (let it = ref; it; ) {
            const d = doc.context.lookup(it);
            n++;
            walk(d.get(window.PDFLib.PDFName.of('First')));
            it = d.get(window.PDFLib.PDFName.of('Next'));
          }
        };
        if (ol) walk(ol.get(window.PDFLib.PDFName.of('First')));
        const rep = await Export.asReport(gs, o);
        const b64 = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.readAsDataURL(rep);
        });
        return { text, heads: bk.heads.length, n, want: Hd.list(id).length, report: b64 };
      }, bookId);
      const rf = path.join(H.SHOTS, 'hd2-report.pdf');
      require('fs').writeFileSync(rf, Buffer.from(out.report, 'base64'));
      try {
        execSync(`pdftoppm -png -r 60 -f 1 -l 1 "${rf}" "${path.join(H.SHOTS, 'hd2-8-report')}"`);
      } catch (e) {}
      assert(/◆ الفصل الثالث/.test(out.text) && /● المبحث الأول/.test(out.text) && /○ المطلب الأول/.test(out.text) && /• الفرع الثاني/.test(out.text), 'text: ' + out.text.slice(0, 400));
      assert(!/الفرع الأول/.test(out.text), 'a heading with no notes under it: ' + out.text);
      assert(/❤️ ١/.test(out.text), 'the reaction: ' + out.text);
      assert(out.heads === 6, 'backup heads ' + out.heads);
      assert(out.n === out.want && out.n === 6, `bookmarks ${out.n} of ${out.want}`);
      return `${out.n} bookmarks`;
    });

    await step('A backup brings my headings back where they were taken out', async () => {
      const r = await a.evaluate(async (id) => {
        const { Export, D, S, Hd } = window.A;
        const o = { b: id, who: 'me', people: new Set(), kinds: new Set(['quote', 'hl', 'note', 'q', 'take']), replies: true, stars: false };
        const data = Export.asBackup(Export.groups(Export.gather(o).notes, o), o);
        const mine = Hd.hand(id).filter((h) => h.by === S.me && h.l === 2)[0];
        await D.del('heads/' + mine.id);
        await new Promise((r) => setTimeout(r, 500));
        return { data: JSON.stringify(data), gone: !S.heads.has(mine.id) };
      }, bookId);
      assert(r.gone, 'not deleted');
      const file = path.join(os.tmpdir(), 'naqra-heads-backup.json');
      require('fs').writeFileSync(file, r.data);
      await a.evaluate(() => window.A.V.go('quotes', { v: 'books' }));
      await a.click('[data-act="qn-menu"]');
      const [fc] = await Promise.all([a.waitForEvent('filechooser', { timeout: 8000 }), a.click('.mi:has-text("استورد")')]);
      await fc.setFiles(file);
      await a.waitForSelector('.imp [data-run]');
      await a.click('.imp [data-run]');
      await until(a, 'the مبحث is back', () => [...window.A.S.heads.values()].some((h) => h.l === 2 && h.page === 1), null, 10000);
      const n = await a.evaluate(() => window.A.S.heads.size);
      assert(n === 6, 'headings now ' + n);
      await closeAll(a);
    });

    await step('XP: +3 a heading (today\'s first ten)', async () => {
      const n = await a.evaluate(() => window.A.Hd.xpToday());
      assert(n === 5, 'mine today: ' + n);
      const s = await a.evaluate(() => {
        const g = window.A.G.of(window.A.S.me);
        return { heads: g.heads, xp: g.events.filter((e) => e.kind === 'head').reduce((t, e) => t + e.xp, 0) };
      });
      assert(s.heads === 5 && s.xp === 15, 'game: ' + JSON.stringify(s));
    });

    await step('No console errors', async () => {
      const errs = [...(a.__errors || []), ...(b.__errors || [])].filter((e) => !/favicon|fonts|404|42501|only who added|doc_merge/.test(e));
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
