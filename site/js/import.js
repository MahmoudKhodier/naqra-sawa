/* My shelf from Goodreads: from the export file (My Books → Import and export → Export Library →
   goodreads_library_export.csv; StoryGraph's export CSV works too): shelves, ratings, reviews, dates read and page
   counts. Import it again any time for new books: what is already there is matched, not doubled.
   (A sync through the shelf's RSS feed ran here until Goodreads turned those feeds off in late October 2026.) */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Imp = (A.Imp = {});

  /* RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
  Imp.parseCsv = (text) => {
    text = String(text || '').replace(/^﻿/, '');
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        row.push(f);
        f = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f);
        rows.push(row);
        row = [];
        f = '';
      } else f += c;
    }
    if (f !== '' || row.length) {
      row.push(f);
      rows.push(row);
    }
    return rows.filter((r) => r.some((x) => String(x).trim()));
  };

  const COLS = {
    title: ['title'],
    author: ['author', 'authors'],
    isbn13: ['isbn13'],
    isbn: ['isbn', 'isbn/uid'],
    rating: ['my rating', 'star rating', 'rating'],
    pages: ['number of pages', 'pages', 'page count'],
    read: ['date read', 'last date read', 'read date', 'dates read'],
    shelf: ['exclusive shelf', 'read status', 'status', 'shelf'],
    review: ['my review', 'review'],
    id: ['book id'],
    shelves: ['bookshelves'],
  };
  const isbnOf = (v) => {
    const s = String(v || '').replace(/[^0-9Xx]/g, '');
    return s.length === 13 || s.length === 10 ? s : '';
  };
  // "The Fellowship of the Ring (The Lord of the Rings, #1)" → "The Fellowship of the Ring"
  const cleanTitle = (t) => String(t || '').replace(/\s*\([^()]*#\s*\d+(\.\d+)?[^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const cleanReview = (h) => {
    if (!h) return '';
    const s = String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '');
    const t = document.createElement('textarea');
    t.innerHTML = s; // decodes &amp; &quot; … (a textarea never runs or loads anything)
    return t.value.replace(/\n{3,}/g, '\n\n').trim();
  };
  const monthOf = (d) => {
    const m = /(\d{4})[/-](\d{1,2})/.exec(String(d || ''));
    return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
  };
  const statusOf = (s) => {
    const v = String(s || '').trim().toLowerCase();
    if (v === 'read') return 'read';
    if (v === 'currently-reading' || v === 'currently reading' || v === 'reading') return 'reading';
    if (v === 'to-read' || v === 'to read' || v === 'want' || v === 'want to read') return 'want';
    return null;
  };
  /* Goodreads' exclusive shelves (one per book) and the usual names of a "didn't finish" shelf; any other shelf
     name is one of the member's own lists. */
  const GR_EXCL = { read: 'read', 'currently-reading': 'reading', 'to-read': 'want' };
  const GR_DNF = new Set(['did-not-finish', 'dnf', 'abandoned', 'gave-up', 'given-up', 'dropped', 'not-finished', 'unfinished', 'stopped-reading', 'paused-indefinitely']);
  const listsOf = (names) =>
    [...new Set(names.map((x) => String(x).trim().slice(0, 40)).filter((x) => x && !GR_EXCL[x.toLowerCase()] && !GR_DNF.has(x.toLowerCase()) && x !== '#ALL#'))].slice(0, 20);
  /* Same book? Title and the author's last name, ignoring case, accents, hamza forms and punctuation. */
  const norm = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ًͯ-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  Imp.key = (title, author) => {
    const a = norm(String(author || '').split(/[,،&]| and | و /)[0]).split(' ').filter(Boolean);
    return norm(cleanTitle(title)) + '|' + (a.length ? a[a.length - 1] : '');
  };

  /* Rows → shelf items, with counts of what was left out and why. */
  Imp.readExport = (text) => {
    const rows = Imp.parseCsv(text);
    if (rows.length < 2) return { error: 'empty' };
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const col = {};
    for (const [k, names] of Object.entries(COLS)) col[k] = head.findIndex((h) => names.includes(h));
    if (col.title < 0) return { error: 'format' };
    const items = [];
    const otherShelves = {};
    let noShelf = 0;
    for (const r of rows.slice(1)) {
      const get = (k) => (col[k] >= 0 ? String(r[col[k]] || '').trim() : '');
      const title = cleanTitle(get('title')).slice(0, 140);
      if (!title) continue;
      const raw = get('shelf');
      const status = col.shelf >= 0 ? statusOf(raw) : 'read';
      if (!status) {
        if (raw) otherShelves[raw] = (otherShelves[raw] || 0) + 1;
        else noShelf++;
        continue;
      }
      const isbn = isbnOf(get('isbn13')) || isbnOf(get('isbn'));
      const rating = Math.max(0, Math.min(5, Math.round(parseFloat(get('rating')) || 0)));
      const lists = listsOf(get('shelves').split(',').filter((x) => x.trim().toLowerCase() !== raw.toLowerCase()));
      items.push({
        title,
        author: get('author').replace(/\s+/g, ' ').slice(0, 100),
        status,
        rating,
        review: cleanReview(get('review')),
        finished: status === 'read' ? monthOf(get('read')) : '',
        pages: Math.max(0, Math.min(20000, parseInt(get('pages'), 10) || 0)),
        cover: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : '',
        isbn,
        grId: get('id'),
        tags: [],
        src: col.id >= 0 ? 'goodreads' : 'import',
      });
      if (lists.length) items[items.length - 1].lists = lists;
    }
    return { items, otherShelves, noShelf };
  };

  /* Compare with what is already on my shelf: new books, books to complete (rating, review, date…), same. */
  Imp.plan = (items) => {
    const mine = V.shelfItems(S.me);
    const byKey = new Map(mine.map((x) => [Imp.key(x.title, x.author), x]));
    const byGr = new Map(mine.filter((x) => x.grId).map((x) => [x.grId, x]));
    const seen = new Set();
    const out = { add: [], fill: [], same: 0 };
    for (const it of items) {
      const k = Imp.key(it.title, it.author);
      if (seen.has(k)) continue;
      seen.add(k);
      const ex = (it.grId && byGr.get(it.grId)) || byKey.get(k);
      if (!ex) {
        out.add.push(it);
        continue;
      }
      if (ex.virtual) {
        out.same++;
        continue;
      }
      const patch = {};
      if (!ex.rating && it.rating) patch.rating = it.rating;
      if (!ex.review && it.review) patch.review = it.review;
      if (!ex.finished && it.finished) patch.finished = it.finished;
      if (!ex.pages && it.pages) patch.pages = it.pages;
      if (!ex.cover && it.cover) patch.cover = it.cover;
      if (!ex.grId && it.grId) patch.grId = it.grId;
      if (!(ex.lists && ex.lists.length) && it.lists && it.lists.length) patch.lists = it.lists;
      if (Object.keys(patch).length) out.fill.push({ id: ex.id, patch });
      else out.same++;
    }
    return out;
  };

  Imp.apply = async (plan, withReviews) => {
    const t = U.nowIso();
    let shortened = 0;
    const prep = (it) => {
      const x = Object.assign({}, it);
      if (!withReviews) x.review = '';
      else if (x.review.length > U.MAX.review) {
        x.review = x.review.slice(0, U.MAX.review - 1) + '…';
        shortened++;
      }
      return x;
    };
    await D.mutate(`shelf/${S.me}`, () => {
      const cur = S.shelf.get(S.me) || {};
      const items = Object.assign({}, cur.items || {});
      for (const it of plan.add) items[D.newId()] = V.clean(Object.assign(prep(it), { at: t, updatedAt: t }));
      for (const f of plan.fill) {
        if (!items[f.id]) continue;
        const p = Object.assign({}, f.patch);
        if (p.review !== undefined) {
          if (withReviews) p.review = prep({ review: p.review }).review;
          else delete p.review;
        }
        items[f.id] = Object.assign({}, items[f.id], p, { updatedAt: t });
      }
      return shelfBody(cur, { items });
    });
    return { shortened };
  };
  /* The whole shelf document with some keys replaced (keeps gr and anything else stored next to items). */
  const shelfBody = (cur, patch) => {
    const body = Object.assign({}, cur, patch);
    delete body.id; // S.shelf adds the member id to each document
    return body;
  };

  /* Goodreads sync is gone: Goodreads turned off the shelf RSS feeds it read (late October 2026). A member who
     had linked it sees a word about it in the import sheet; the export file brings new books instead (no doubles:
     books match by Goodreads id or title + author). shelf/<me>.gr and item.gr from the sync stay as they are. */
  const wasLinked = () => {
    if (!S.me) return false;
    const g = (S.shelf.get(S.me) || {}).gr;
    return !!((g && g.id && !g.off) || U.store.get('grLink:' + S.me, null));
  };

  V.importShelf = () => {
    let parsed = null, plan = null;
    const api = V.sheet({
      title: L('مكتبتك من Goodreads', 'Your Goodreads library', 'مكتبتك من Goodreads'),
      html: `<div id="imp-step">${pick()}</div>`,
      onMount: (body) => {
        const step = (html) => {
          body.querySelector('#imp-step').innerHTML = html;
        };
        body.addEventListener('change', async (e) => {
          if (e.target.id !== 'imp-file' || !e.target.files[0]) return;
          const file = e.target.files[0];
          if (file.size > 15 * 1048576) return showErr(L('الملف ده كبير أوي على إنه تصدير مكتبة.', 'That file is too big for a library export.', 'هذا الملف أكبر من أن يكون ملف تصدير مكتبة.'));
          let text = '';
          try {
            text = await file.text();
          } catch (x) {
            return showErr(L('مقدرتش أقرأ الملف.', "Couldn't read the file.", 'تعذرت قراءة الملف.'));
          }
          parsed = Imp.readExport(text);
          if (parsed.error) return showErr(parsed.error === 'format' ? L('ده مش ملف تصدير من Goodreads (مفيش عمود Title).', "That's not a Goodreads export (no Title column).", 'هذا ليس ملف تصدير من Goodreads (لا يوجد عمود Title).') : L('الملف فاضي.', 'The file is empty.', 'الملف فارغ.'));
          plan = Imp.plan(parsed.items);
          step(preview());
        });
        body.addEventListener('click', async (e) => {
          if (e.target.closest('[data-imp-back]')) step(pick());
          if (!e.target.closest('[data-imp-go]') || !plan) return;
          const withReviews = !!(body.querySelector('#imp-reviews') || {}).checked;
          const btn = e.target.closest('[data-imp-go]');
          btn.disabled = true;
          let res;
          try {
            res = await Imp.apply(plan, withReviews);
          } catch (x) {
            btn.disabled = false;
            return;
          }
          api.close();
          const n = plan.add.length;
          U.chime('ok');
          U.toast(L(`اتضاف ${L.count(n, 'book')}${plan.fill.length ? ` واتكمّلت بيانات ${L.count(plan.fill.length, 'book')}` : ''}${res.shortened ? ` • ${L.num(res.shortened)} مراجعة اتقصّرت لـ${L.num(U.MAX.review)} حرف` : ''}`, `Added ${n} books${plan.fill.length ? `, completed ${plan.fill.length}` : ''}${res.shortened ? ` • ${res.shortened} reviews shortened to ${U.MAX.review} characters` : ''}`, `تمت إضافة ${L.count(n, 'book')}${plan.fill.length ? ` واكتملت بيانات ${L.count(plan.fill.length, 'book')}` : ''}${res.shortened ? ` • تم تقصير ${L.num(res.shortened)} من المراجعات إلى ${L.num(U.MAX.review)} حرف` : ''}`));
          V.go('shelf', { st: plan.add.some((x) => x.status === 'read') || !plan.add.length ? 'read' : plan.add[0].status });
        });
        function showErr(msg) {
          step(pick());
          const e2 = body.querySelector('#imp-err');
          e2.textContent = msg;
          e2.hidden = false;
        }
      },
    });

    function pick() {
      return `${wasLinked() ? `<p class="my-note gr-gone">${icon('info')}<span>${L('Goodreads وقف مشاركة الرفوف مع التطبيقات التانية، فالمزامنة التلقائية وقفت. الكتب اللي جت منه لسه في مكتبتك. عشان تجيب الجديد: صدّر مكتبتك من Goodreads واختار الملف هنا — مفيش حاجة هتتكرر.', 'Goodreads stopped sharing shelves with other apps, so the automatic sync has stopped. The books it brought are still on your shelf. To bring new ones, export your library from Goodreads and choose the file here — nothing gets doubled.', 'أوقف Goodreads مشاركة الرفوف مع التطبيقات الأخرى، فتوقفت المزامنة التلقائية. الكتب التي جاءت منه ما زالت في مكتبتك. لجلب الجديد: صدّر مكتبتك من Goodreads واختر الملف هنا — لن يتكرر شيء.')}</span></p>` : ''}<ol class="imp-how">
          <li>${L('افتح <b>Goodreads</b> من المتصفح (مش من تطبيقه) وادخل حسابك.', 'Open <b>Goodreads</b> in a browser (not its app) and sign in.', 'افتح <b>Goodreads</b> من المتصفح (لا من تطبيقه) وسجّل الدخول إلى حسابك.')}</li>
          <li>${L('روح <b>My Books</b> ← تحت على الجنب <b>Import and export</b> ← دوس <b>Export Library</b>.', 'Go to <b>My Books</b> → in the side bar <b>Import and export</b> → tap <b>Export Library</b>.', 'اذهب إلى <b>My Books</b> ← من القائمة الجانبية <b>Import and export</b> ← اضغط <b>Export Library</b>.')}</li>
          <li>${L('استنى لحد ما يظهر رابط الملف، نزّله (goodreads_library_export.csv) واختاره هنا.', 'Wait for the file link, download it (goodreads_library_export.csv) and choose it here.', 'انتظر حتى يظهر رابط الملف، ثم حمّله (goodreads_library_export.csv) واختره هنا.')}</li>
        </ol>
        <a class="btn ghost" href="https://www.goodreads.com/review/import" target="_blank" rel="noopener">${icon('globe')}${L('افتح صفحة التصدير في Goodreads', 'Open the Goodreads export page')}</a>
        <label class="drop imp-drop">${icon('download')}<b>${L('اختار ملف التصدير (CSV)', 'Choose the export file (CSV)', 'اختر ملف التصدير (CSV)')}</b><small>${L('بيشتغل كمان مع ملف التصدير من StoryGraph', 'StoryGraph exports work too', 'يعمل أيضًا مع ملف التصدير من StoryGraph')}</small>
          <input type="file" id="imp-file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain"></label>
        <p class="err-t" id="imp-err" hidden></p>`;
    }
    function preview() {
      const by = { read: 0, reading: 0, want: 0 };
      for (const it of plan.add) by[it.status]++;
      const rated = plan.add.filter((x) => x.rating).length;
      const reviewed = plan.add.filter((x) => x.review).length + plan.fill.filter((x) => x.patch.review).length;
      const others = Object.entries(parsed.otherShelves);
      const xp = Math.min(by.read, Math.max(0, 60 - G.of(S.me).shelfRead)) * G.XP.shelf;
      return `<div class="imp-sum">
          <div><b>${L.num(by.read)}</b><small>${L('قرأته', 'Read')}</small></div>
          <div><b>${L.num(by.reading)}</b><small>${L('بقرأه', 'Reading', 'أقرؤه')}</small></div>
          <div><b>${L.num(by.want)}</b><small>${L('عايز أقرأه', 'Want to read', 'أريد قراءته')}</small></div>
        </div>
        <ul class="imp-notes">
          <li>${L(`${L.count(plan.add.length, 'book')} جديد${rated ? ` • ${L.num(rated)} بتقييمك` : ''}`, `${plan.add.length} new books${rated ? ` • ${rated} with your rating` : ''}`, `جديد: ${L.count(plan.add.length, 'book', 'nom')}${rated ? ` • ${L.num(rated)} مع تقييمك` : ''}`)}</li>
          ${plan.fill.length ? `<li>${L(`${L.count(plan.fill.length, 'book')} موجود عندك — هنكمّل الناقص (تقييم، رأي، تاريخ…)`, `${plan.fill.length} already on your shelf — missing details will be filled in`, `لديك من قبل ${L.count(plan.fill.length, 'book', 'nom')} — سنكمل البيانات الناقصة (التقييم، الرأي، التاريخ…)`)}</li>` : ''}
          ${plan.same ? `<li class="muted">${L(`${L.count(plan.same, 'book')} موجود بالفعل زي ما هو`, `${plan.same} already there as they are`, `لا تغيير في ${L.count(plan.same, 'book')}`)}</li>` : ''}
          ${others.length ? `<li class="muted">${L(`مش هنستورد رفوف تانية: ${others.map(([k, n]) => `${esc(k)} (${L.num(n)})`).join('، ')}`, `Not importing other shelves: ${others.map(([k, n]) => `${esc(k)} (${n})`).join(', ')}`, `لن نستورد الرفوف الأخرى: ${others.map(([k, n]) => `${esc(k)} (${L.num(n)})`).join('، ')}`)}</li>` : ''}
          ${xp ? `<li class="gold-t">+${L.num(xp)} XP</li>` : ''}
        </ul>
        ${plan.add.length ? `<div class="imp-list">${plan.add.slice(0, 6).map((x) => `<span>${V.coverOf(x, 'xs')}<b dir="auto">${esc(x.title)}</b></span>`).join('')}${plan.add.length > 6 ? `<small class="muted">${L(`و${L.num(plan.add.length - 6)} كمان…`, `and ${plan.add.length - 6} more…`, `و${L.num(plan.add.length - 6)} أخرى…`)}</small>` : ''}</div>` : ''}
        ${reviewed ? `<label class="check"><input type="checkbox" id="imp-reviews" checked><span>${L(`هات مراجعاتي (${L.num(reviewed)})`, `Bring my reviews (${reviewed})`, `اجلب مراجعاتي (${L.num(reviewed)})`)}</span></label>` : ''}
        <p class="err-t" id="imp-err" hidden></p>
        <div class="row-btns end"><button class="btn ghost" data-imp-back>${L('ملف تاني', 'Another file', 'ملف آخر')}</button>
          <button class="btn gold" data-imp-go ${plan.add.length + plan.fill.length ? '' : 'disabled'}>${icon('check')}${plan.add.length + plan.fill.length ? L(`استورد ${L.count(plan.add.length + plan.fill.length, 'book')}`, `Import ${plan.add.length + plan.fill.length} books`) : L('مفيش جديد', 'Nothing new', 'لا جديد')}</button></div>`;
    }
  };
  V.actions['import-shelf'] = () => V.importShelf();
})();
