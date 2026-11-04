#!/usr/bin/env node
/*
 * «دفتر اقتباساتي» by book, all, ⭐ favourites and «اقتباس من زمان»; export (text, backup, the PDF report, the book
 * with its notes) with who / what / replies; import: a backup in the same circle (only what is gone comes back) and
 * in another circle (friends' notes kept for me only, on the pages), and Kindle's «My Clippings.txt».
 * The PDFs made are opened with pdf.js and drawn to pictures to look at.
 *
 *   node tests/e2e/notebook.js
 *
 * Screenshots: tests/e2e/shots/nb-*.png
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
const CLIPS = path.join(H.FIXTURES, 'my-clippings.txt');
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
  await T(350);
};
async function shot(p, name) {
  await p.addStyleTag({ content: '#toasts { visibility: hidden !important; }' });
  await T(300);
  return H.shot(p, name);
}
/* The last exported file: its text, or its bytes saved next to the screenshots. */
const lastText = (p) => p.evaluate(() => window.A.V.lastExport.blob.text());
async function lastBytes(p) {
  const b64 = await p.evaluate(async () => {
    const buf = new Uint8Array(await window.A.V.lastExport.blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}
/* Pages of the last exported PDF, drawn with pdf.js (annotations too) into PNG files. */
async function drawPdf(p, pages, name, scale = 1.4) {
  const out = await p.evaluate(
    async ({ pages, scale }) => {
      const buf = new Uint8Array(await window.A.V.lastExport.blob.arrayBuffer());
      const doc = await window.A.R.openPdf(buf);
      const meta = await doc.getMetadata().catch(() => ({}));
      const res = { n: doc.numPages, title: (meta.info || {}).Title || '', pages: [] };
      for (const i of pages) {
        if (i > doc.numPages) continue;
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = vp.width;
        cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const anns = (await pg.getAnnotations()).map((a) => ({ sub: a.subtype, rect: a.rect, contents: (a.contentsObj && a.contentsObj.str) || a.contents || '', title: (a.titleObj && a.titleObj.str) || a.title || '', color: a.color ? Array.from(a.color) : null }));
        const view = pg.view;
        res.pages.push({ i, png: cv.toDataURL('image/png'), anns, view });
      }
      return res;
    },
    { pages, scale },
  );
  for (const pg of out.pages) {
    fs.mkdirSync(H.SHOTS, { recursive: true });
    fs.writeFileSync(path.join(H.SHOTS, `${name}-p${pg.i}.png`), Buffer.from(pg.png.split(',')[1], 'base64'));
    delete pg.png;
  }
  return out;
}
const pickFile = async (p, clickSel, file) => {
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), p.click(clickSel)]);
  await fc.setFiles(file);
};

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  let a, b, bookId, cid, ids = {}, backupFile;
  const tmp = path.join(H.SHOTS, 'notebook-files');
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await step('A circle of two, a book with a plan, notes from both (one far ahead), a reply, a private note', async () => {
      const A = await H.newUser(browser, env, 'nba@test.local', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      a = A.page;
      await a.fill('#cn-name', 'حلقة الدفتر');
      await a.click('#circle-new button');
      await a.waitForSelector('#join-name', { timeout: 20000 });
      await a.fill('#join-name', 'محمود');
      await a.click('#join-form button[type=submit]');
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.fill('#pl-per', '4');
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
      bookId = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      cid = await a.evaluate(() => window.A.P.circle().id);
      const code = (await env.fake.sql('select invite_code from public.circles where id = $1', [cid]))[0].invite_code;
      const B = await H.newUser(browser, env, 'nbb@test.local', { url: env.siteUrl.replace(/\/?$/, '/') + '#join-' + code, viewport: { width: 390, height: 844 } });
      b = B.page;
      await b.waitForSelector('#join-name', { timeout: 20000 });
      await b.fill('#join-name', 'سارة');
      await b.click('#join-form button[type=submit]');
      await b.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await b.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await until(a, 'two members', () => window.A.S.members.size === 2);
      ids = await a.evaluate(async (bookId) => {
        const { D, S, U, G } = window.A;
        const book = S.books.get(bookId);
        const ws = G.wirds(book);
        const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
        // a small picture of the highlighted passage, as the reader makes them
        const cv = document.createElement('canvas');
        cv.width = 420;
        cv.height = 60;
        const x = cv.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, 420, 60);
        x.fillStyle = '#222';
        x.font = '28px Amiri';
        x.direction = 'rtl';
        x.textAlign = 'right';
        x.fillText('الكتب نوافذ نطل منها على العالم', 410, 40);
        const crop = cv.toDataURL('image/jpeg', 0.8);
        const mk = async (o) => {
          const id = D.newId();
          const w = ws.find((w) => o.page >= w.from && o.page <= w.to);
          await D.set(`notes/${id}`, Object.assign({ b: bookId, color: '#f2c94c', by: S.me, wid: w ? w.id : '', likes: {}, replies: {}, crop: null }, o));
          return id;
        };
        const r = {};
        r.old = await mk({ page: 3, kind: 'quote', text: 'القراءة سفر بلا حقائب، ورفقة لا تخذلك أبدًا.', rect: { x: 0.12, y: 0.18, w: 0.7, h: 0.06 }, at: iso(40) });
        r.hl = await mk({ page: 6, kind: 'hl', text: '', rect: { x: 0.1, y: 0.42, w: 0.78, h: 0.05 }, crop, color: '#8fd3a8', at: iso(3) });
        r.pin = await mk({ page: 2, kind: 'note', text: 'ملاحظة على الصفحة: الفكرة دي محتاجة نقاش.', rect: { x: 0.8, y: 0.3, w: 0.004, h: 0.004 }, at: iso(2) });
        r.q = await mk({ page: 9, kind: 'q', text: 'ليه البطل مشي من البيت؟', rect: { x: 0.5, y: 0.6, w: 0.004, h: 0.004 }, at: iso(1) });
        const w1 = ws[0];
        r.take = D.newId();
        await D.set(`notes/${r.take}`, { b: bookId, wid: w1.id, kind: 'take', text: 'خلاصة الورد الأول: الصبر مفتاح.', page: w1.to, rect: null, by: S.me, at: iso(1), likes: {}, replies: {} });
        r.priv = 'pv' + D.newId();
        await D.mutate(`data/users/${S.me}/priv`, () => Object.assign({}, S.priv || {}, { notes: Object.assign({}, (S.priv && S.priv.notes) || {}, { [r.priv]: { b: bookId, page: 5, kind: 'note', text: 'سر صغير عن الإسكندرية', rect: { x: 0.2, y: 0.5, w: 0.004, h: 0.004 }, color: '#f2c94c', at: iso(0.2) } }) }));
        // read up to page 12, so a friend's note on page 30 is a spoiler
        await D.saveProg(bookId, () => ({ last: 12 }));
        return r;
      }, bookId);
      await until(b, 'B sees the notes', (id) => window.A.S.notes.has(id), ids.old);
      Object.assign(
        ids,
        await b.evaluate(
          async ({ bookId, old }) => {
            const { D, S, G } = window.A;
            const ws = G.wirds(S.books.get(bookId));
            const r = {};
            r.bq = D.newId();
            await D.set(`notes/${r.bq}`, { b: bookId, page: 4, kind: 'quote', text: 'اقتباس سارة: الكلمة الطيبة صدقة.', rect: { x: 0.15, y: 0.55, w: 0.6, h: 0.05 }, color: '#7fb3ff', by: S.me, wid: ws[0].id, at: new Date(Date.now() - 5 * 864e5).toISOString(), likes: {}, replies: {}, crop: null });
            r.far = D.newId();
            await D.set(`notes/${r.far}`, { b: bookId, page: 30, kind: 'note', text: 'حرق: البطل بيرجع في الآخر', rect: { x: 0.3, y: 0.3, w: 0.004, h: 0.004 }, color: '#f2c94c', by: S.me, wid: '', at: new Date().toISOString(), likes: {}, replies: {}, crop: null });
            await D.update(`notes/${old}`, { replies: { [D.newId()]: { by: S.me, text: 'رد سارة: جميلة جدًا ✨', at: new Date().toISOString() } } });
            return r;
          },
          { bookId, old: ids.old },
        ),
      );
      await until(a, 'A sees them', (ids) => window.A.S.notes.has(ids.bq) && window.A.S.notes.has(ids.far) && window.A.V.noteReplies(window.A.S.notes.get(ids.old)).length === 1, ids);
      const spoil = await a.evaluate((id) => window.A.V.isSpoiler(window.A.S.notes.get(id)), ids.far);
      assert(spoil, 'the note on page 30 is not a spoiler for A');
      await T(1500);
      await closeAll(a);
      return `${Object.keys(ids).length} notes`;
    });

    await step('Notebook: by book (covers with counts), «اقتباس من زمان» with the 40-day-old quote', async () => {
      await a.evaluate(() => window.A.V.go('quotes'));
      await a.waitForSelector('.qn-shelf .qn-bk');
      const tile = await a.$eval('.qn-shelf .qn-bk', (e) => ({ n: e.querySelector('.qn-bk-n').textContent, t: e.querySelector('b').textContent, on: document.querySelector('.qn-views .on').dataset.v }));
      assert(tile.n === '٦' && tile.on === 'books', 'tile: ' + JSON.stringify(tile));
      const old = await a.$eval('.qn-old', (e) => e.textContent);
      assert(old.includes('القراءة سفر بلا حقائب') && /شهر/.test(old), 'old quote: ' + old.replace(/\s+/g, ' '));
      // the same one on the next render
      await a.evaluate(() => window.A.V.render(true));
      assert((await a.$eval('.qn-old q', (e) => e.textContent)).includes('القراءة سفر'), 'old quote changed on a re-render');
      await shot(a, 'nb-books');
      return tile.t;
    });

    await step('A book: its notes by page, in its portions (the takeaway at the end of portion 1)', async () => {
      await a.click('.qn-shelf .qn-bk');
      await a.waitForSelector('.qn-bookpage .qn-wird');
      const groups = await a.$$eval('.qn-wird', (gs) => gs.map((g) => ({ h: g.querySelector('h3 .qw-n').textContent, pages: [...g.querySelectorAll('.qn')].map((c) => (c.querySelector('.qn-src') || {}).textContent.trim() + '|' + c.className.match(/k-(\w+)/)[1]) })));
      const flat = groups.map((g) => g.h + ': ' + g.pages.join(', ')).join(' / ');
      assert(groups.length === 3, 'portions: ' + flat);
      assert(groups[0].h.includes('١') && groups[1].h.includes('٢') && groups[2].h.includes('٣'), 'portion order: ' + flat);
      assert(groups[0].pages.join(',') === 'ص ٢|note,ص ٣|quote,|take', 'portion 1: ' + flat);
      assert(groups[1].pages.join(',') === 'ص ٥|note,ص ٦|hl', 'portion 2: ' + flat);
      assert(groups[2].pages.join(',') === 'ص ٩|q', 'portion 3: ' + flat);
      await shot(a, 'nb-book');
      return flat;
    });

    await step('⭐: star mine from a card and a friend\'s from its sheet; «المفضلة» lists both, with her name', async () => {
      await a.click(`.qn[data-key="qn-${ids.pin}"] .qn-star`);
      await until(a, 'starred', (id) => window.A.V.isStar(id), ids.pin);
      await a.waitForSelector(`.qn[data-key="qn-${ids.pin}"] .qn-star.on`);
      await a.evaluate((id) => window.A.V.openNote(id), ids.bq);
      await a.click('.nt-acts [data-star]');
      await until(a, 'friend starred', (id) => window.A.V.isStar(id), ids.bq);
      await a.waitForSelector('.nt-acts [data-star].on');
      await closeAll(a);
      await a.click('[data-act="qn-books"]');
      await a.click('.qn-views [data-v="stars"]');
      await until(a, 'two favourites', () => document.querySelectorAll('.qn-list .qn').length === 2);
      const who = await a.$$eval('.qn-list .qn-who', (x) => x.map((e) => e.textContent.trim()));
      assert(who.length === 1 && who[0].includes('سارة'), 'author shown: ' + who);
      await shot(a, 'nb-stars');
      await a.click(`.qn[data-key="qn-${ids.pin}"] .qn-star`);
      await until(a, 'one favourite', () => document.querySelectorAll('.qn-list .qn').length === 1);
    });

    await step('«الكل»: newest first, kinds, search; the view is remembered', async () => {
      await a.click('.qn-views [data-v="all"]');
      await until(a, 'six', () => document.querySelectorAll('.qn-list .qn').length === 6);
      const first = await a.$eval('.qn-list .qn .qn-text', (e) => e.textContent);
      assert(first.includes('الإسكندرية'), 'newest first: ' + first);
      await a.fill('#qn-q', 'الصبر');
      await until(a, 'search', () => document.querySelectorAll('.qn-list .qn').length === 1);
      await a.fill('#qn-q', '');
      await until(a, 'cleared', () => document.querySelectorAll('.qn-list .qn').length === 6);
      await a.evaluate(() => window.A.V.go('me'));
      await a.evaluate(() => window.A.V.go('quotes'));
      await a.waitForSelector('.qn-views [data-v="all"].on');
      await a.click('.qn-views [data-v="books"]');
    });

    await step('Export sheet: four shapes, «مين وإيه؟» folded; the whole circle / some people; a spoiler is left out', async () => {
      await a.click('.qn-shelf .qn-bk');
      await a.click('[data-act="qn-export"]');
      await a.waitForSelector('.ex .ex-fmts');
      const fmts = await a.$$eval('.ex-fmt', (x) => x.map((e) => e.dataset.fmt));
      assert(fmts.join() === 'pdf,book,text,backup', 'shapes: ' + fmts);
      const count = () => a.$eval('#ex-count', (e) => e.textContent.replace(/\s+/g, ' '));
      assert((await count()).includes('٦ ملاحظات'), 'mine: ' + (await count()));
      await shot(a, 'nb-export');
      await a.click('.ex-more summary');
      await a.click('[data-who="all"]');
      await until(a, 'circle count', () => /٧ ملاحظات/.test(document.getElementById('ex-count').textContent));
      assert((await count()).includes('مستخبية'), 'the spoiler line: ' + (await count()));
      await a.click('[data-who="some"]');
      await a.waitForSelector('.ex-people .chip.person');
      const people = await a.$$eval('.ex-people .chip.person', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
      await a.click('.ex-people .chip.person:has-text("سارة")');
      await until(a, 'her one note', () => /ملاحظة واحدة/.test(document.getElementById('ex-count').textContent));
      await shot(a, 'nb-export-options');
      await a.click('[data-who="me"]');
      await until(a, 'back to mine', () => /٦ ملاحظات/.test(document.getElementById('ex-count').textContent));
      return people.join(' | ');
    });

    await step('Text: the book, portions, words, replies with names; without replies; «انسخ»', async () => {
      await a.click('.ex-fmt[data-fmt="text"]');
      await a.waitForSelector('[data-copytext]');
      await a.click('[data-who="all"]');
      const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 8000 }), a.click('.ex [data-run]')]);
      const name = dl.suggestedFilename();
      const t = await lastText(a);
      fs.writeFileSync(path.join(tmp, 'notes.txt'), t);
      for (const want of ['📖', '━━ الورد ١', 'القراءة سفر بلا حقائب', '↩ سارة: رد سارة: جميلة جدًا', 'سر صغير عن الإسكندرية', 'اقتباس سارة', 'خلاصة الورد الأول', '— محمود']) assert(t.includes(want), `missing «${want}» in:\n` + t.slice(0, 900));
      assert(!t.includes('حرق'), 'the spoiler went out');
      await a.$eval('.ex-more', (d) => (d.open = true));
      await a.click('.ex-sw:has([data-replies]) .switch');
      await a.click('.ex [data-run]');
      await T(400);
      assert(!(await lastText(a)).includes('↩'), 'replies with the switch off');
      await a.click('.ex-sw:has([data-replies]) .switch');
      assert(await a.$eval('[data-replies]', (e) => e.checked), 'replies back on');
      await a.click('[data-copytext]');
      await T(300);
      return name;
    });

    await step('Backup: a JSON file with the books, notes, replies and stars', async () => {
      await a.click('.ex-fmt[data-fmt="backup"]');
      await a.click('.ex [data-run]');
      await T(500);
      const j = JSON.parse(await lastText(a));
      backupFile = path.join(tmp, 'backup.json');
      fs.writeFileSync(backupFile, JSON.stringify(j));
      assert(j.app === 'naqra-sawa' && j.type === 'notes' && j.v === 1, 'header');
      assert(j.books.length === 1 && j.books[0].fp && j.books[0].wirds.length >= 3, 'book: ' + JSON.stringify(j.books[0]).slice(0, 200));
      assert(j.notes.length === 7, 'notes: ' + j.notes.length);
      assert(!j.notes.some((n) => n.id === ids.far), 'the spoiler went into the backup');
      const old = j.notes.find((n) => n.id === ids.old);
      assert(old && old.replies.length === 1 && old.replies[0].name === 'سارة' && old.mine, 'reply kept: ' + JSON.stringify(old && old.replies));
      assert(j.notes.find((n) => n.id === ids.hl).crop.startsWith('data:image/'), 'crop kept');
      assert(j.notes.find((n) => n.id === ids.priv).priv, 'private flag');
      assert(j.stars.includes(ids.bq), 'stars: ' + j.stars);
      return `${j.notes.length} notes, ${Math.round(fs.statSync(backupFile).size / 1024)} KB`;
    });

    await step('PDF report: opens in pdf.js; first pages drawn to pictures', async () => {
      await a.click('.ex-fmt[data-fmt="pdf"]');
      await a.click('.ex [data-run]');
      await until(a, 'pdf made', () => window.A.V.lastExport && /\.pdf$/.test(window.A.V.lastExport.filename) && !document.querySelector('.ex.busy'), null, 30000);
      const r = await drawPdf(a, [1, 2], 'nb-report');
      assert(r.n >= 1, 'pages: ' + r.n);
      assert(/ملاحظات/.test(r.title), 'title: ' + r.title);
      fs.writeFileSync(path.join(tmp, 'report.pdf'), await lastBytes(a));
      return `${r.n} pages, «${r.title}»`;
    });

    await step('The book with its notes: highlights and pins as PDF annotations in their places (words below the pages off; the colour page first)', async () => {
      await a.click('.ex-fmt[data-fmt="book"]');
      await a.$eval('.ex-book [data-onpage]', (e) => e.checked && e.click());
      await a.click('.ex-book [data-colorby="mark"]');
      await a.click('[data-who="me"]');
      await a.click('.ex [data-run]');
      await until(a, 'annotated', () => window.A.V.lastExport && /بالملاحظات/.test(window.A.V.lastExport.filename) && !document.querySelector('.ex.busy'), null, 40000);
      // book page p is the file's page p + 1 (the colour page comes first)
      const r = await drawPdf(a, [1, 3, 4, 5, 7], 'nb-book-pdf', 1.2);
      assert(r.n === 41, 'pages: ' + r.n);
      r.pages.forEach((x) => (x.i -= 1));
      const p3 = r.pages.find((x) => x.i === 3);
      const hl = p3.anns.find((x) => x.sub === 'Highlight');
      assert(hl && hl.contents.includes('القراءة سفر') && hl.contents.includes('سارة') && hl.title === 'محمود', 'p3 highlight: ' + JSON.stringify(p3.anns));
      // where it is: the note's rect, in the page's own coordinates
      const [x0, y0, x1, y1] = p3.view;
      const W = x1 - x0, Hh = y1 - y0;
      const want = [x0 + 0.12 * W, y0 + Hh - (0.18 + 0.06) * Hh, x0 + 0.82 * W, y0 + Hh - 0.18 * Hh];
      const off = hl.rect.map((v, i) => Math.abs(v - want[i]));
      assert(Math.max(...off) < 1.5, 'place: ' + JSON.stringify({ got: hl.rect, want }));
      const p2 = r.pages.find((x) => x.i === 2);
      assert(p2.anns.some((x) => x.sub === 'Text' && x.contents.includes('محتاجة نقاش')), 'p2 pin: ' + JSON.stringify(p2.anns));
      const p4 = r.pages.find((x) => x.i === 4);
      assert(!p4.anns.some((x) => x.title === 'سارة') && p4.anns.some((x) => x.sub === 'Text' && x.contents.includes('خلاصة الورد الأول')), 'page 4 (her note out with «أنا بس», my takeaway in): ' + JSON.stringify(p4.anns));
      const p6 = r.pages.find((x) => x.i === 6);
      assert(p6.anns.some((x) => x.sub === 'Highlight'), 'p6 highlight without words');
      fs.writeFileSync(path.join(tmp, 'book-with-notes.pdf'), await lastBytes(a));
      await closeAll(a);
      return JSON.stringify(off.map((v) => +v.toFixed(2)));
    });

    await step('…and with the words below the pages: a number by each note, the page longer by a strip at its foot, the highlight colours by person', async () => {
      await a.evaluate((id) => window.A.V.exportSheet({ b: id, send: true }), bookId);
      await a.waitForSelector('.ex .ex-fmts');
      const fmts = await a.$$eval('.ex-fmt', (x) => x.map((e) => e.dataset.fmt));
      assert(fmts.join() === 'file,book,pdf,text', 'formats from the book: ' + fmts);
      await a.click('.ex-fmt[data-fmt="book"]');
      await a.$eval('.ex-book [data-onpage]', (e) => !e.checked && e.click());
      await a.click('.ex-book [data-colorby="person"]');
      await a.$eval('.ex-more', (d) => (d.open = true));
      await a.click('[data-who="all"]');
      await a.evaluate(() => (window.A.V.lastExport = null));
      await a.click('.ex [data-run]');
      await until(a, 'annotated', () => window.A.V.lastExport && /بالملاحظات/.test(window.A.V.lastExport.filename) && !document.querySelector('.ex.busy'), null, 40000);
      const r = await drawPdf(a, [1, 4, 5, 11], 'nb-book-onpage', 1.4);
      assert(r.n === 41, 'pages: ' + r.n);
      const p3 = r.pages.find((x) => x.i === 4), p10 = r.pages.find((x) => x.i === 11);
      const h = (v) => v[3] - v[1];
      assert(h(p3.view) > h(p10.view) * 1.05, `page 3 not longer: ${h(p3.view)} vs ${h(p10.view)}`);
      assert(p3.view[3] === p10.view[3], 'the top moved');
      const hl = p3.anns.find((x) => x.sub === 'Highlight');
      const col = await a.evaluate(() => window.A.D.color(window.A.S.me));
      const want = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
      assert(hl && hl.color && hl.color.every((v, i) => Math.abs(v - want[i]) <= 2), 'colour: ' + JSON.stringify({ got: hl && hl.color, want }));
      await closeAll(a);
      return `page 3: ${Math.round(h(p3.view))} pt (others ${Math.round(h(p10.view))})`;
    });

    await step('A line highlighted by hand in the reader lands on that same line in the exported book', async () => {
      // where a line of page 3 really is, from the PDF's own text
      const line = await a.evaluate(async (bookId) => {
        const { A } = window;
        const b = A.D.book(bookId);
        const buf = b.parts && b.parts.length ? await A.R.partBytes(b.parts[0]) : await A.U.cache.get('lb:' + bookId);
        const doc = await A.R.openPdf(new Uint8Array(buf.slice(0)));
        const pg = await doc.getPage(3);
        const [X0, Y0, X1, Y1] = pg.view;
        // the text comes in runs: put the runs on one baseline together, take the first full-width line
        const lines = new Map();
        for (const t of (await pg.getTextContent()).items) {
          if (!t.str || !t.str.trim()) continue;
          const k = Math.round(t.transform[5]);
          const l = lines.get(k) || { y: t.transform[5], x0: Infinity, x1: -Infinity, h: 0, str: '' };
          l.x0 = Math.min(l.x0, t.transform[4]);
          l.x1 = Math.max(l.x1, t.transform[4] + t.width);
          l.h = Math.max(l.h, t.height || Math.abs(t.transform[3]));
          l.str += t.str;
          lines.set(k, l);
        }
        const it = [...lines.values()].sort((a, b) => b.y - a.y).find((l) => l.x1 - l.x0 > (X1 - X0) * 0.6);
        const x = it.x0, y = it.y, w = it.x1 - it.x0, h = it.h;
        return { str: it.str, box: [x, y - h * 0.25, x + w, y + h], fx0: (x - X0) / (X1 - X0), fx1: (x + w - X0) / (X1 - X0), fy0: (Y1 - (y + h)) / (Y1 - Y0), fy1: (Y1 - (y - h * 0.25)) / (Y1 - Y0) };
      }, bookId);
      await a.evaluate((id) => window.A.R.open(id, { page: 3 }), bookId);
      await a.waitForSelector('.pg[data-p="3"] canvas', { timeout: 20000 });
      await T(800);
      await a.evaluate(() => document.querySelector('[data-tool="hl"]').click());
      const box = await (await a.$('.pg[data-p="3"] .pg-ov')).boundingBox();
      const X = (f) => box.x + f * box.width, Y = (f) => box.y + f * box.height;
      await a.mouse.move(X(line.fx1), Y(line.fy0));
      await a.mouse.down();
      for (let i = 1; i <= 8; i++) await a.mouse.move(X(line.fx1 + ((line.fx0 - line.fx1) * i) / 8), Y(line.fy0 + ((line.fy1 - line.fy0) * i) / 8));
      await a.mouse.up();
      await a.waitForSelector('#nk-text', { timeout: 6000 });
      await a.fill('#nk-text', 'سطر حقيقي متظلّل بالإيد');
      await a.click('.sheet [data-save]');
      await until(a, 'saved', () => [...window.A.S.notes.values()].some((n) => n.text === 'سطر حقيقي متظلّل بالإيد'));
      await a.$eval('.pg[data-p="3"] .hlb', (e) => e.scrollIntoView({ block: 'center' }));
      await T(500);
      await shot(a, 'nb-real-hl-reader');
      await a.evaluate(() => window.A.R.close(true));
      await closeAll(a);
      await a.evaluate((id) => window.A.V.exportSheet({ b: id }), bookId);
      await a.waitForSelector('.ex .ex-fmts');
      await a.click('.ex-fmt[data-fmt="book"]');
      await a.$eval('.ex-more', (d) => (d.open = true));
      await a.click('[data-who="me"]');
      await a.evaluate(() => (window.A.V.lastExport = null));
      await a.click('.ex [data-run]');
      await until(a, 'annotated', () => window.A.V.lastExport && /بالملاحظات/.test(window.A.V.lastExport.filename) && !document.querySelector('.ex.busy'), null, 40000);
      const r = await drawPdf(a, [4], 'nb-real-hl', 2);
      const hl = r.pages[0].anns.find((x) => x.sub === 'Highlight' && x.contents.includes('سطر حقيقي'));
      assert(hl, 'no such highlight: ' + JSON.stringify(r.pages[0].anns));
      // how much of the line's box the highlight covers
      const [lx0, ly0, lx1, ly1] = line.box;
      const [hx0, hy0, hx1, hy1] = hl.rect;
      const ix = Math.max(0, Math.min(lx1, hx1) - Math.max(lx0, hx0)), iy = Math.max(0, Math.min(ly1, hy1) - Math.max(ly0, hy0));
      const cover = (ix * iy) / ((lx1 - lx0) * (ly1 - ly0));
      assert(cover > 0.8, `covers ${Math.round(cover * 100)}% of the line «${line.str.slice(0, 30)}»: ${JSON.stringify({ line: line.box, hl: hl.rect })}`);
      await closeAll(a);
      return `${Math.round(cover * 100)}% of «${line.str.slice(0, 24)}…»`;
    });

    await step('Restore in the same circle: only what was deleted comes back (the reply kept with it); again → nothing', async () => {
      await a.evaluate(async (ids) => {
        const { D, S } = window.A;
        await D.del(`notes/${ids.old}`);
        await D.mutate(`data/users/${S.me}/priv`, () => {
          const n = Object.assign({}, S.priv.notes);
          delete n[ids.priv];
          return Object.assign({}, S.priv, { notes: n });
        });
      }, ids);
      await until(a, 'deleted', (ids) => !window.A.S.notes.has(ids.old) && !window.A.S.priv.notes[ids.priv], ids);
      await a.evaluate(() => window.A.V.go('quotes', { v: 'books' }));
      await a.click('[data-act="qn-menu"]');
      await pickFile(a, '.mi:has-text("استورد")', backupFile);
      await a.waitForSelector('.imp .imp-books li');
      const sum = await a.$eval('.imp .ex-count', (e) => e.textContent.replace(/\s+/g, ' '));
      assert(/ملاحظتين/.test(sum) && /٥ ملاحظات موجودين/.test(sum), 'summary: ' + sum);
      await shot(a, 'nb-import');
      await a.click('.imp [data-run]');
      await until(a, 'back', () => window.A.V.myQuotes().length === 7, null, 10000);
      const r = await a.evaluate(() => {
        const { S, V } = window.A;
        const c = [...S.notes.values()].find((n) => n.text && n.text.startsWith('القراءة سفر'));
        const m = [...S.myNotes.values()].find((n) => n.text === 'سر صغير عن الإسكندرية');
        const arch = [...S.myNotes.values()].find((n) => n.kind === 'arch' && n.of === (c && c.id));
        return { c: c && { by: c.by === S.me, rect: c.rect, wid: !!c.wid }, m: m && { via: m.via, from: m.from || '', rect: !!m.rect }, arch: arch && arch.arch, star: c ? V.isStar(c.id) : null };
      });
      assert(r.c && r.c.by && r.c.rect && r.c.rect.x === 0.12 && r.c.wid, 'circle note: ' + JSON.stringify(r));
      assert(r.m && r.m.via === 'backup' && !r.m.from && r.m.rect, 'private note: ' + JSON.stringify(r));
      assert(r.arch && r.arch.length === 1 && r.arch[0].n === 'سارة', 'reply kept: ' + JSON.stringify(r.arch));
      // the restored note shows the reply kept for me
      const nid = await a.evaluate(() => [...window.A.S.notes.values()].find((n) => n.text && n.text.startsWith('القراءة سفر')).id);
      await a.evaluate((id) => window.A.V.openNote(id), nid);
      await a.waitForSelector('.replies.arch .rep');
      await shot(a, 'nb-restored-note');
      await closeAll(a);
      // again: nothing new
      await a.evaluate(() => window.A.V.go('quotes', { v: 'books' }));
      await a.click('[data-act="qn-menu"]');
      await pickFile(a, '.mi:has-text("استورد")', backupFile);
      await a.waitForSelector('.imp .ex-count.none');
      assert(await a.$eval('.imp [data-run]', (e) => e.disabled), 'import button on with nothing new');
      await closeAll(a);
    });

    await step('Kindle: «My Clippings.txt» → two books (bookmark out, an edited highlight once); again → nothing', async () => {
      await a.evaluate(() => window.A.V.go('quotes', { v: 'books' }));
      await a.click('[data-act="qn-menu"]');
      await pickFile(a, '.mi:has-text("استورد")', CLIPS);
      await a.waitForSelector('.imp-books.kin li');
      const books = await a.$$eval('.imp-books.kin li', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
      assert(books.length === 2, 'books: ' + books);
      const sum = await a.$eval('.imp .ex-count', (e) => e.textContent);
      assert(/٥ ملاحظات/.test(sum), 'count: ' + sum);
      await shot(a, 'nb-kindle');
      await a.click('.imp [data-run]');
      await until(a, 'in', () => [...window.A.S.myNotes.values()].filter((n) => n.via === 'kindle').length === 5);
      const lp = await a.evaluate(() => [...window.A.S.myNotes.values()].filter((n) => n.via === 'kindle' && /Little/.test(n.xt)).map((n) => [n.kind, n.loc, n.kpage, n.text.slice(0, 20)]));
      assert(lp.length === 3 && lp.some((x) => x[1] === '520-523' && x[3].startsWith('You become')), 'Little Prince: ' + JSON.stringify(lp));
      await a.waitForSelector('.qn-bk .qn-bk-x');
      assert((await a.$$('.qn-shelf .qn-bk')).length === 3, 'three books on the shelf');
      await shot(a, 'nb-books-kindle');
      await a.click('.qn-bk:has-text("Little Prince")');
      await a.waitForSelector('.qn-bookpage .qn');
      const order = await a.$$eval('.qn-bookpage .qn .qn-src', (x) => x.map((e) => e.textContent.trim()));
      assert(order.join('|') === 'ص ٢١|ص ٢١|ص ٤٠', 'order: ' + order);
      await shot(a, 'nb-kindle-book');
      await a.click('.qn-bookpage .qn .qn-main');
      await a.waitForSelector('.nt .nt-text');
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('quotes', { v: 'books' }));
      await a.click('[data-act="qn-menu"]');
      await pickFile(a, '.mi:has-text("استورد")', CLIPS);
      await a.waitForSelector('.imp .ex-count.none');
      await closeAll(a);
      return books.join(' / ');
    });

    await step('«ابعت نسخة» on the book page (the ⋯ keeps plan, contents, edit, delete); backup and import in Settings', async () => {
      await closeAll(a);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.bp-actions [data-act="send-copy"]');
      assert(!(await a.$('.bp-actions [data-act="download"]')), 'the old download button');
      await a.click('.bp-actions [data-act="book-menu"]');
      await a.waitForSelector('.mi');
      const items = await a.$$eval('.mi', (x) => x.map((e) => e.textContent.trim()));
      assert(!items.some((t) => /حمّل الكتاب|صدّر الملاحظات|استورد/.test(t)), 'menu: ' + items.join(' | '));
      assert(items.some((t) => /الفهرس/.test(t)), 'no contents in the menu: ' + items.join(' | '));
      await closeAll(a);
      await a.click('.bp-actions [data-act="send-copy"]');
      await a.waitForSelector('.ex .ex-fmts');
      const title = await a.textContent('.sheet .sh-head');
      assert(/ابعت نسخة/.test(title), 'title: ' + title);
      await a.click('.ex-fmt[data-fmt="file"]');
      assert(!(await a.$('.ex .ex-more')), 'whose/what for the book alone');
      await shot(a, 'nb-send-copy');
      await closeAll(a);
      await a.evaluate(() => window.A.V.go('settings'));
      await a.waitForSelector('[data-act="set-backup"]');
      assert(await a.$('[data-act="qn-import"]'), 'no import in Settings');
      await a.click('[data-act="set-backup"]');
      await a.waitForSelector('.ex-fmt[data-fmt="backup"].on');
      await closeAll(a);
    });

    await step('«ذكرى الكتاب»: once the book is done, a keepsake PDF — cover, numbers, who read it, quotes, takeaways', async () => {
      await a.evaluate(async (id) => {
        const { D, U } = window.A;
        await D.saveProg(id, () => ({ finished: U.nowIso() }));
        await D.update(`books/${id}`, { status: 'done', doneAt: U.nowIso() });
      }, bookId);
      await a.evaluate((id) => window.A.V.go('book-' + id, { tab: 'plan' }), bookId);
      await a.waitForSelector('.bp-actions [data-act="memory-book"]');
      await T(1200);
      await closeAll(a); // the «خلّصت الكتاب» celebration
      await a.click('.bp-actions [data-act="memory-book"]');
      await a.waitForSelector('.sheet .mem [data-run]');
      await shot(a, 'nb-memory-sheet');
      await a.evaluate(() => (window.A.V.lastExport = null));
      await a.click('.sheet .mem [data-run]');
      await until(a, 'keepsake made', () => window.A.V.lastExport && /ذكرى/.test(window.A.V.lastExport.filename), null, 40000);
      const r = await drawPdf(a, [1, 2, 3], 'nb-memory', 1);
      assert(r.n >= 3, 'pages: ' + r.n);
      assert(/ذكرى/.test(r.title), 'title: ' + r.title);
      await closeAll(a);
      await a.evaluate((id) => window.A.D.update(`books/${id}`, { status: 'reading' }), bookId);
      return `${r.n} pages`;
    });

    await step('Restore in another circle: my notes go to its circle, hers stay mine only with her name — on the page too', async () => {
      await a.evaluate(async () => {
        const c = await window.A.P.createCircle('حلقة تانية');
        window.A.U.store.set('circle', c.id);
        location.reload();
      });
      // the same person in a second circle: straight in (the name is asked only the first time)
      await a.waitForFunction((cid) => window.A && window.A.P && window.A.P.circle && window.A.P.circle() && window.A.P.circle().id !== cid && (document.getElementById('join-name') || window.A.D.joined()), cid, { timeout: 20000 });
      if (await a.$('#join-name')) {
        await a.fill('#join-name', 'محمود');
        await a.click('#join-form button[type=submit]');
      }
      await a.evaluate(() => window.A.V.go('home'));
      await a.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await a.evaluate(() => window.A.Goals && (window.A.Goals.off = true));
      await a.locator('[data-act="add-book"]:visible').first().click();
      await a.setInputFiles('#ab-file', PDF);
      await a.waitForSelector('#ab-form', { timeout: 30000 });
      await a.click('#ab-form button.btn.gold');
      await a.waitForSelector('#pl-form', { timeout: 30000 });
      await a.fill('#pl-per', '5');
      await a.click('#pl-form button.btn.gold');
      await a.waitForFunction(() => [...window.A.S.books.values()].some((x) => (x.wirds || []).length), null, { timeout: 20000 });
      await T(1200);
      await closeAll(a);
      const nb = await a.evaluate(() => [...window.A.S.books.keys()][0]);
      await a.evaluate(() => window.A.V.go('quotes'));
      await a.click('[data-act="qn-menu"]');
      await pickFile(a, '.mi:has-text("استورد")', backupFile);
      await a.waitForSelector('.imp .imp-books li');
      const li = await a.$eval('.imp-books li', (e) => e.textContent);
      assert(li.includes('هتتحط على'), 'book matched: ' + li);
      const sum = await a.$eval('.imp .ex-count', (e) => e.textContent.replace(/\s+/g, ' '));
      assert(/٧ ملاحظات/.test(sum), 'summary: ' + sum);
      await shot(a, 'nb-import-other');
      await a.click('.imp [data-run]');
      await until(a, 'in', (nb) => [...window.A.S.notes.values()].filter((n) => n.b === nb).length === 5 && [...window.A.S.myNotes.values()].filter((n) => n.b === nb && n.kind !== 'arch').length === 2, nb, 12000);
      await until(a, 'the star back', (nb) => Object.keys((window.A.S.priv && window.A.S.priv.stars) || {}).some((id) => window.A.V.noteById(id) && window.A.V.noteById(id).b === nb), nb);
      const r = await a.evaluate((nb) => {
        const { S, V } = window.A;
        const hers = [...S.myNotes.values()].filter((n) => n.b === nb && n.from);
        return { hers: hers.map((n) => n.from + ':' + n.text.slice(0, 12)), stars: Object.keys(S.priv.stars || {}).filter((id) => V.noteById(id) && V.noteById(id).b === nb).length };
      }, nb);
      assert(r.hers.length === 1 && r.hers.every((x) => x.startsWith('سارة:')), 'hers: ' + JSON.stringify(r));
      assert(r.stars === 1, 'the star came back: ' + JSON.stringify(r));
      // nothing of hers is in the new circle's shared notes
      const shared = await env.fake.sql("select count(*)::int as n from public.docs where col = 'notes' and data->>'text' like 'اقتباس سارة%' and circle_id <> $1", [cid]);
      assert(shared[0].n === 0, 'her note went into the other circle');
      // her highlight on page 4, with a letter for her name
      await a.evaluate((nb) => window.A.R.open(nb, { page: 4 }), nb);
      await a.waitForSelector('.pg[data-p="4"] .hlb[data-priv="my"]', { timeout: 20000 });
      const lbl = await a.$eval('.pg[data-p="4"] .hlb[data-priv="my"]', (e) => e.getAttribute('aria-label'));
      assert(lbl.startsWith('سارة'), 'label: ' + lbl);
      await a.$eval('.pg[data-p="4"] .hlb[data-priv="my"]', (e) => e.scrollIntoView({ block: 'center' }));
      await T(600);
      await shot(a, 'nb-other-reader');
      await a.click('.pg[data-p="4"] .hlb[data-priv="my"]');
      await a.waitForSelector('.nt-head');
      const head = await a.$eval('.nt-head', (e) => e.textContent);
      assert(head.includes('سارة') && head.includes('مستورَدة'), 'sheet head: ' + head);
      await shot(a, 'nb-other-note');
      await closeAll(a);
      await a.evaluate(() => window.A.R.close(true));
      await a.evaluate(() => window.A.V.go('quotes', { v: 'all' }));
      await a.waitForSelector('.qn-list .qn-who');
      await shot(a, 'nb-other-all');
      return r.hers.join(' | ');
    });

    await step('English and dark: the notebook and the export sheet', async () => {
      await a.evaluate(() => {
        window.A.L.set('en');
        window.A.U.store.set('theme', 'dark');
        window.A.V.applyTheme();
        document.getElementById('app').innerHTML = '';
        window.A.V.go('quotes', { v: 'books' });
      });
      await a.waitForSelector('.qn-shelf');
      await shot(a, 'nb-books-en-dark');
      await a.click('.qn-shelf .qn-bk');
      await a.click('[data-act="qn-export"]');
      await a.waitForSelector('.ex .ex-fmts');
      await a.click('.ex-more summary');
      await shot(a, 'nb-export-en-dark');
      await closeAll(a);
      await a.evaluate(() => {
        window.A.L.set('eg');
        window.A.U.store.set('theme', 'light');
        window.A.V.applyTheme();
        document.getElementById('app').innerHTML = '';
        window.A.V.render(true);
      });
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
