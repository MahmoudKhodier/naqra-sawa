/* My shelf from Goodreads, two ways:
   - once, from the export file (My Books → Import and export → Export Library → goodreads_library_export.csv;
     StoryGraph's export CSV works too): shelves, ratings, reviews, dates read and page counts;
   - kept in step: the member links their Goodreads profile and the shelf's public RSS feed is read every 12 hours
     (Goodreads has no API for new apps; browsers can't fetch goodreads.com, so the database fetches it for us:
     RPC goodreads_feed, supabase/migrations/…_goodreads_feed.sql). What the member changes here always wins. */
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

  /* =====================================================================
     Goodreads sync
     ---------------------------------------------------------------------
     Link: shelf/<me>.gr = {id, at, ids, reviews} (shared: the Goodreads user id, last sync, the Goodreads book ids
     the sync has seen, whether reviews come along). A private feed's RSS key stays on this device only
     (U.store 'grLink:<me>'), never in shared data. Unlinking leaves {ids, off}.
     Each book remembers what Goodreads said last time: item.gr = {status, rating, review (a hash), finished,
     pages, cover, lists, at}. A field follows Goodreads only while the member hasn't changed it since.
     ===================================================================== */
  const GR_AUTO_MS = 12 * 3600 * 1000;
  const GR_PAGES = 60; // the database allows pages 1–60 (≈ 6000 books)
  const GR_SNAP = ['status', 'rating', 'review', 'finished', 'pages', 'cover'];
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  /* "Sun, 14 Mar 2021 00:00:00 -0700" → "2021-03" (the calendar month as written, whatever the time zone). */
  const grMonth = (v) => {
    const s = String(v || '');
    let m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
    if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}`;
    m = /([A-Za-z]{3})[a-z]*\.?\s+\d{1,2},?\s+(\d{4})/.exec(s);
    if (m && MON[m[1].toLowerCase()]) return `${m[2]}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}`;
    return monthOf(s) || ((/^\s*(\d{4})\s*$/.exec(s) || [])[1] || '');
  };
  // Goodreads image URLs carry a size (…/34._SY75_.jpg); without it they give the full picture.
  const grCover = (get) => {
    for (const n of ['book_large_image_url', 'book_medium_image_url', 'book_image_url', 'book_small_image_url']) {
      const u = String(get(n) || '').trim().replace(/^http:\/\//, 'https://');
      if (/^https:\/\/[^\s"'<>]+$/.test(u) && !/nophoto/i.test(u) && u.length < 500) return u.replace(/\._[A-Z]{2}\d+_(?=\.[a-z]{3,4}$)/i, '');
    }
    return '';
  };
  const xmlText = (raw) => {
    const s = String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    const t = document.createElement('textarea');
    t.innerHTML = s; // decodes entities only (a textarea never runs or loads anything)
    return t.value;
  };

  /* An RSS page → shelf items like readExport's; null when it isn't a feed (an error or sign-in page). */
  Imp.readFeed = (xml) => {
    const text = String(xml || '').replace(/^﻿/, '');
    let rows = null;
    try {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (!doc.getElementsByTagName('parsererror').length && doc.getElementsByTagName('channel').length) {
        rows = [...doc.getElementsByTagName('item')].map((el) => ({
          get: (n) => {
            const e = el.getElementsByTagName(n)[0];
            return e ? e.textContent : '';
          },
          bookId: () => {
            const b = el.getElementsByTagName('book')[0];
            return (b && b.getAttribute('id')) || '';
          },
        }));
      }
    } catch (e) {}
    if (!rows) {
      // not well-formed XML (a stray &nbsp; or the like): read it tag by tag
      if (!/<channel[\s>]/i.test(text) || /<html[\s>]/i.test(text)) return null;
      rows = (text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((raw) => ({
        get: (n) => {
          const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(raw);
          return m ? xmlText(m[1]) : '';
        },
        bookId: () => (/<book\s[^>]*\bid="(\d+)"/i.exec(raw) || [])[1] || '',
      }));
    }
    const out = [];
    for (const r of rows) {
      const get = (n) => String(r.get(n) || '').trim();
      const title = cleanTitle(get('title')).slice(0, 140);
      if (!title) continue;
      const shelves = get('user_shelves').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      const low = shelves.map((x) => x.toLowerCase());
      const status = low.includes('currently-reading') ? 'reading' : low.includes('to-read') ? 'want' : low.includes('read') ? 'read' : low.some((x) => GR_DNF.has(x)) ? 'dnf' : 'read';
      const isbn = isbnOf(get('isbn13')) || isbnOf(get('isbn'));
      out.push({
        title,
        author: get('author_name').replace(/\s+/g, ' ').slice(0, 100),
        status,
        rating: Math.max(0, Math.min(5, Math.round(parseFloat(get('user_rating')) || 0))),
        review: cleanReview(get('user_review')),
        finished: status === 'read' ? grMonth(get('user_read_at')) : '',
        pages: Math.max(0, Math.min(20000, parseInt(get('num_pages'), 10) || 0)),
        cover: grCover(get) || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : ''),
        isbn,
        grId: (get('book_id') || r.bookId()).replace(/\D/g, '').slice(0, 20),
        lists: listsOf(shelves),
        tags: [],
        src: 'goodreads',
      });
    }
    return out;
  };

  /* A profile link (www./m.goodreads.com/user/show/12345-name), a shelf or RSS link (keeps its key), or the number. */
  Imp.parseGrLink = (v) => {
    const s = String(v || '').trim();
    let id = (/^(\d{1,12})$/.exec(s) || [])[1] || '';
    if (!id) {
      const m = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*goodreads\.com\/(?:user\/show|review\/list_rss|review\/list)\/(\d{1,12})(?![\d])/i.exec(s);
      if (m) id = m[1];
    }
    if (!id) return null;
    const k = /[?&]key=([A-Za-z0-9_-]{1,64})(?=$|[&#])/.exec(s);
    return { id, key: k ? k[1] : '' };
  };

  const rh = (s) => (s ? U.hash(String(s)).toString(36) + '.' + String(s).length.toString(36) : '');
  const sv = (f, v) => (f === 'rating' || f === 'pages' ? +v || 0 : f === 'review' ? rh(v) : String(v || ''));
  const blank = (f, v) => (f === 'rating' || f === 'pages' ? !(+v) : !v);
  const snapOf = (x) => {
    const o = {};
    for (const f of GR_SNAP) o[f] = sv(f, x[f]);
    o.lists = Array.isArray(x.lists) ? x.lists.slice() : [];
    return o;
  };
  const sameList = (a, b) => (a || []).length === (b || []).length && (a || []).every((x, i) => x === b[i]);
  const sameSnap = (a, b) => GR_SNAP.every((f) => sv(f === 'review' ? '' : f, a[f]) === sv(f === 'review' ? '' : f, b[f])) && sameList(a.lists, b.lists);
  const monthNo = (s) => {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(s || ''));
    return m ? +m[1] * 12 + (+(m[2] || 1) - 1) : NaN;
  };

  /* Merge a Goodreads feed into a shelf document. Pure apart from new ids; returns {items, gr, res}.
     For each book on Goodreads:
       - same book here? by Goodreads id, else by title + author (Imp.key). Rows from books read together
         (virtual) are left alone; a book the sync brought before and the member removed stays removed.
       - not here: added, with item.gr = what Goodreads says.
       - here: each of status, rating, review, finished, pages, cover takes Goodreads' new value only when the
         member hasn't changed it since the last sync (its value still equals item.gr[field]); empty fields are
         filled; Goodreads having nothing never blanks a field. Without item.gr yet: a book from the CSV import
         that was never edited counts its current values as the last word from Goodreads; any other book
         (added by hand, or edited since) only gets its empty fields filled — and is linked by grId.
       - re-reads: a later read date (≥ 6 months after a finish both sides agreed on) keeps the old one in reads.
       - lists (other Goodreads shelves): shelves added on Goodreads are added, ones removed there are removed,
         the member's own lists stay. */
  Imp.mergeGoodreads = (cur, feed, opts = {}) => {
    const t = opts.now || U.nowIso();
    const withReviews = opts.reviews !== false;
    const items = Object.assign({}, (cur && cur.items) || {});
    const prev = (cur && cur.gr) || {};
    const known = new Set((prev.ids || []).map(String));
    const ids = new Set(known);
    const byGr = new Map(), byKey = new Map();
    for (const [id, x] of Object.entries(items)) {
      if (!x || !x.title || x.virtual) continue;
      if (x.grId && !byGr.has(String(x.grId))) byGr.set(String(x.grId), id);
      const k = Imp.key(x.title, x.author);
      if (!byKey.has(k)) byKey.set(k, id);
    }
    const virtual = new Set((opts.virtual || []).map((x) => Imp.key(x.title, x.author)));
    const fit = (r) => (r.length > U.MAX.review ? r.slice(0, U.MAX.review - 1) + '…' : r);
    const claimed = new Set(), seen = new Set();
    const res = { added: 0, updated: 0, same: 0, kept: 0, changed: [] };
    for (const g0 of feed) {
      const k = Imp.key(g0.title, g0.author);
      const gid = String(g0.grId || '');
      if (seen.has(k) || (gid && seen.has('#' + gid))) continue; // another edition of a book already handled
      seen.add(k);
      if (gid) seen.add('#' + gid);
      const g = Object.assign({}, g0, { review: withReviews ? fit(g0.review || '') : '' });
      const id = (gid && byGr.get(gid)) || byKey.get(k);
      if (id && claimed.has(id)) {
        res.same++;
        continue;
      }
      if (!id) {
        if (virtual.has(k)) {
          res.same++;
          continue;
        }
        if (gid && known.has(gid)) {
          res.kept++; // synced before, then removed from the shelf here: stays removed
          continue;
        }
        const nid = opts.newId ? opts.newId() : D.newId();
        items[nid] = V.clean(Object.assign({}, g, { gr: Object.assign(snapOf(g), { at: t }), at: t, updatedAt: t }));
        if (!g.review) delete items[nid].review;
        if (!g.lists.length) delete items[nid].lists;
        claimed.add(nid);
        if (gid) ids.add(gid);
        res.added++;
        res.changed.push(nid);
        continue;
      }
      claimed.add(id);
      if (gid) ids.add(gid);
      const ex = items[id];
      const fromCsv = !ex.gr && (ex.src === 'goodreads' || ex.grId) && (!ex.updatedAt || ex.updatedAt === ex.at);
      const base = ex.gr || (fromCsv ? snapOf(ex) : null);
      const patch = {};
      const snap = {};
      for (const f of GR_SNAP) {
        if (f === 'review' && !withReviews) {
          snap.review = (ex.gr && ex.gr.review) || '';
          continue;
        }
        const nv = g[f], cv = ex[f];
        if (blank(f, nv)) {
          snap[f] = sv(f, cv); // Goodreads has nothing: keep ours, and follow Goodreads once it has something
          continue;
        }
        snap[f] = sv(f, nv);
        if (sv(f, nv) === sv(f, cv)) continue;
        const untouched = base && sv(f, cv) === base[f] && !(f === 'cover' && !ex.gr); // a cover is only filled before the first sync
        if (!blank(f, cv) && !untouched) continue; // the member's own value wins
        patch[f] = nv;
        if (f === 'finished' && cv && base && base.status === 'read' && g.status === 'read' && monthNo(nv) - monthNo(cv) >= 6) {
          const reads = Array.isArray(ex.reads) ? ex.reads.filter(Boolean) : [];
          if (!reads.some((r) => r.finished === cv)) {
            reads.push({ finished: cv });
            reads.sort((a, b) => String(a.finished).localeCompare(String(b.finished)));
            patch.reads = reads;
          }
        }
      }
      const bl = base ? base.lists || [] : [];
      const cl = Array.isArray(ex.lists) ? ex.lists : [];
      const gone = bl.filter((x) => !g.lists.includes(x));
      const nl = [...new Set(cl.filter((x) => !gone.includes(x)).concat(g.lists.filter((x) => !bl.includes(x))))];
      if (!sameList(nl, cl) && (nl.length || cl.length)) patch.lists = nl;
      snap.lists = g.lists.slice();
      if (gid && String(ex.grId || '') !== gid) patch.grId = gid;
      if (!ex.isbn && g.isbn) patch.isbn = g.isbn;
      const changed = Object.keys(patch).filter((f) => f !== 'grId' && f !== 'isbn').length > 0;
      const snapNew = !ex.gr || !sameSnap(ex.gr, snap);
      if (!Object.keys(patch).length && !snapNew) {
        res.same++;
        continue;
      }
      items[id] = Object.assign({}, ex, patch, { gr: snapNew ? Object.assign(snap, { at: t }) : ex.gr }, changed ? { updatedAt: t } : {});
      if (changed) {
        res.updated++;
        res.changed.push(id);
      } else res.same++;
    }
    const gr = Object.assign({}, prev, { id: String(opts.id || prev.id || ''), at: t, ids: [...ids], reviews: withReviews });
    delete gr.off;
    return { items, gr, res };
  };

  /* The link of this member: shared gr.id (+ this device's RSS key), or this device's copy if the shared one got lost. */
  Imp.grLink = () => {
    if (!S.me) return null;
    const sh = S.shelf.get(S.me);
    const g = sh && sh.gr;
    const loc = U.store.get('grLink:' + S.me, null);
    if (g && g.id) {
      const key = loc && String(loc.id) === String(g.id) ? loc.key || '' : '';
      return { id: String(g.id), at: g.at || '', key, reviews: g.reviews !== false };
    }
    if (g && g.off) {
      if (loc) U.store.del('grLink:' + S.me); // unlinked on another device
      return null;
    }
    return loc && loc.id ? { id: String(loc.id), at: loc.at || '', key: loc.key || '', reviews: loc.reviews !== false } : null;
  };

  const grErr = (code) => Object.assign(new Error('goodreads: ' + code), { code });
  async function feedPage(id, key, page) {
    const sb = A.P && A.P.configured && A.P.sb();
    if (!sb) throw grErr('unavailable');
    if (navigator.onLine === false) throw grErr('offline');
    let r;
    try {
      r = await sb.rpc('goodreads_feed', { p_user: id, p_key: key || null, p_shelf: '#ALL#', p_page: page });
    } catch (e) {
      throw grErr('network');
    }
    if (r.error) {
      const msg = String(r.error.message || '');
      const m = /goodreads_([a-z_]+)/.exec(msg);
      if (m) throw grErr(m[1]);
      if (r.error.code === 'PGRST202' || r.error.code === '42883' || /could not find the function/i.test(msg)) throw grErr('unavailable');
      throw grErr('network');
    }
    const body = String(r.data == null ? '' : r.data);
    const m = /^goodreads_error:(\S+)/.exec(body);
    if (m) throw grErr(m[1]);
    return body;
  }

  /* Fetch every page of the member's Goodreads shelf and merge it in (one write). Resolves {added, updated, same,
     kept, total, changed}. One sync at a time; a second call gets the running one. */
  let grRunning = null;
  Imp.syncGoodreads = (opts = {}) => {
    if (!grRunning) grRunning = runSync(opts).finally(() => (grRunning = null));
    return grRunning;
  };
  async function runSync(opts) {
    const link = Imp.grLink();
    const id = String(opts.id || (link && link.id) || '');
    const key = opts.key !== undefined ? opts.key : (link && link.key) || '';
    const reviews = opts.reviews !== undefined ? !!opts.reviews : link ? link.reviews : true;
    if (!/^\d{1,12}$/.test(id)) throw grErr('bad_user');
    if (!D.canWrite()) throw grErr('readonly');
    const feed = [];
    const seen = new Set();
    for (let page = 1; page <= GR_PAGES; page++) {
      if (opts.onPage) opts.onPage(page);
      const got = Imp.readFeed(await feedPage(id, key, page));
      if (!got) {
        if (page === 1) throw grErr('private');
        break;
      }
      let fresh = 0;
      for (const it of got) {
        const k = it.grId ? '#' + it.grId : Imp.key(it.title, it.author);
        if (seen.has(k)) continue;
        seen.add(k);
        feed.push(it);
        fresh++;
      }
      if (!fresh) break; // past the last page (an empty page, or the last one again)
    }
    if (!feed.length) throw grErr('empty');
    let out = null;
    await D.mutate(`shelf/${S.me}`, () => {
      const cur = S.shelf.get(S.me) || {};
      out = Imp.mergeGoodreads(cur, feed, { id, reviews, virtual: V.shelfItems(S.me).filter((x) => x.virtual) });
      return shelfBody(cur, { items: out.items, gr: out.gr });
    });
    U.store.set('grLink:' + S.me, { id, key: key || '', at: out.gr.at, reviews });
    U.store.del('grErr:' + S.me);
    return Object.assign({ total: feed.length }, out.res);
  }

  Imp.unlinkGoodreads = async () => {
    U.store.del('grLink:' + S.me);
    U.store.del('grErr:' + S.me);
    await D.mutate(`shelf/${S.me}`, () => {
      const cur = S.shelf.get(S.me) || {};
      const g = cur.gr || {};
      return shelfBody(cur, { gr: { ids: g.ids || [], off: U.nowIso() } }); // keep the ids: removed books stay removed if linked again
    });
  };

  const grErrText = (code) => {
    switch (code) {
      case 'bad_user':
      case 'bad_key':
        return L('اللينك ده مش لينك بروفايل Goodreads. افتح بروفايلك وانسخ اللينك اللي فيه رقم (goodreads.com/user/show/…).', "That isn't a Goodreads profile link. Open your profile and copy the link with a number in it (goodreads.com/user/show/…).", 'هذا ليس رابط ملف شخصي في Goodreads. افتح ملفك الشخصي وانسخ الرابط الذي فيه رقم (goodreads.com/user/show/…).');
      case 'http_404':
        return L('ملقيناش حساب Goodreads بالرقم ده.', 'No Goodreads account with that number.', 'لم نجد حسابًا في Goodreads بهذا الرقم.');
      case 'private':
      case 'empty':
      case 'http_401':
      case 'http_403':
        return L('مقدرناش نشوف رفوفك. خلّي البروفايل عام، أو من Goodreads افتح My Books ودوس RSS تحت الصفحة والصق اللينك ده هنا.', "Couldn't see your shelves. Make your profile public, or on Goodreads open My Books, tap RSS at the bottom and paste that link here.", 'تعذّر الاطلاع على رفوفك. اجعل ملفك الشخصي عامًا، أو افتح My Books في Goodreads واضغط RSS أسفل الصفحة والصق ذلك الرابط هنا.');
      case 'rate_limit':
        return L('زامنت كتير أوي في وقت قصير. جرّب تاني بعد ١٠ دقايق.', 'Too many syncs in a short time. Try again in 10 minutes.', 'مزامنات كثيرة في وقت قصير. حاول مجددًا بعد ١٠ دقائق.');
      case 'unavailable':
        return L('المزامنة مع Goodreads لسه مش متفعّلة على السيرفر.', "Goodreads sync isn't switched on on the server yet.", 'المزامنة مع Goodreads غير مفعّلة على الخادم بعد.');
      case 'offline':
        return L('مفيش نت دلوقتي.', "You're offline.", 'لا يوجد اتصال بالإنترنت.');
      case 'readonly':
        return L('مينفعش تعدّل المكتبة دلوقتي.', "You can't change your shelf right now.", 'لا يمكنك تعديل مكتبتك الآن.');
      default:
        return L('Goodreads مردّش. جرّب تاني كمان شوية.', "Goodreads didn't answer. Try again in a while.", 'لم يستجب Goodreads. حاول مجددًا بعد قليل.');
    }
  };
  const grSummary = (r) =>
    L(
      `Goodreads — جديد: ${L.count(r.added, 'book')}، اتحدّث: ${L.count(r.updated, 'book')}`,
      `Goodreads: ${r.added} new, ${r.updated} updated`,
      `Goodreads — جديد: ${L.count(r.added, 'book', 'nom')}، تحدّث: ${L.count(r.updated, 'book', 'nom')}`
    );

  /* Quietly in the background once the circle has loaded, when the last sync is over 12 hours old. */
  let autoT = 0, autoTried = 0;
  const autoCheck = () => {
    if (S.phase !== 'ready' || !S.loaded.shelf || !S.me || !D.joined() || !D.canWrite() || grRunning) return;
    if (document.hidden || navigator.onLine === false) return;
    const link = Imp.grLink();
    if (!link || (link.at && Date.now() - Date.parse(link.at) < GR_AUTO_MS)) return;
    const tried = Math.max(autoTried, +U.store.get('grTry:' + S.me, 0) || 0);
    if (Date.now() - tried < 30 * 60 * 1000) return; // after a failure: not again for half an hour
    autoTried = Date.now();
    U.store.set('grTry:' + S.me, autoTried);
    Imp.syncGoodreads()
      .then((r) => {
        if (r.added || r.updated) U.toast(grSummary(r));
      })
      .catch((e) => {
        U.store.set('grErr:' + S.me, { code: e.code || 'network', at: U.nowIso() });
        console.warn('Goodreads sync', e && e.code);
      });
  };
  const autoSoon = () => {
    if (!autoT) autoT = setTimeout(() => ((autoT = 0), autoCheck()), 3000);
  };
  D.onChange(autoSoon);
  document.addEventListener('visibilitychange', () => !document.hidden && autoSoon());

  V.importShelf = () => {
    let parsed = null, plan = null, lastRes = null;
    const api = V.sheet({
      title: L('مكتبتك من Goodreads', 'Your Goodreads library', 'مكتبتك من Goodreads'),
      html: `<div id="gr-wrap">${grBox()}</div><div id="imp-step">${pick()}</div>`,
      onMount: (body) => {
        const step = (html) => {
          body.querySelector('#imp-step').innerHTML = html;
          body.querySelector('#gr-wrap').hidden = html !== pick();
        };
        const grShow = () => (body.querySelector('#gr-wrap').innerHTML = grBox());
        const grSay = (msg) => {
          const el = body.querySelector('#gr-err');
          if (!el) return;
          el.textContent = msg;
          el.hidden = !msg;
        };
        async function grRun(btn, opts) {
          const label = btn.innerHTML;
          btn.disabled = true;
          grSay('');
          try {
            lastRes = await Imp.syncGoodreads(Object.assign({ onPage: (n) => (btn.textContent = L(`بنجيب كتبك… صفحة ${L.num(n)}`, `Fetching your books… page ${n}`, `نجلب كتبك… صفحة ${L.num(n)}`)) }, opts));
          } catch (e) {
            btn.disabled = false;
            btn.innerHTML = label;
            return grSay(grErrText(e.code));
          }
          if (lastRes.added || lastRes.updated) U.chime('ok');
          U.toast(lastRes.added || lastRes.updated ? grSummary(lastRes) : L('Goodreads: كله زي ما هو', 'Goodreads: all up to date', 'Goodreads: لا جديد'));
          grShow();
        }
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
          const lk = e.target.closest('[data-gr-link]');
          if (lk) {
            const input = body.querySelector('#gr-url');
            const got = Imp.parseGrLink(input && input.value);
            if (!got) return grSay(grErrText('bad_user'));
            const rev = body.querySelector('#gr-rev');
            return grRun(lk, { id: got.id, key: got.key, reviews: rev ? rev.checked : true });
          }
          const sy = e.target.closest('[data-gr-sync]');
          if (sy) return grRun(sy, {});
          if (e.target.closest('[data-gr-unlink]')) {
            if (!(await V.confirm(L('هنوقف المزامنة مع Goodreads. الكتب اللي جت منه هتفضل في مكتبتك.', 'Stop syncing with Goodreads? The books it brought stay on your shelf.', 'سنوقف المزامنة مع Goodreads. تبقى الكتب التي جاءت منه في مكتبتك.'), L('فك الربط', 'Unlink'), true))) return;
            lastRes = null;
            await Imp.unlinkGoodreads().catch(() => {});
            return grShow();
          }
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

    function grBox() {
      const link = Imp.grLink();
      const failed = U.store.get('grErr:' + S.me, null);
      const form = (open) => `<input id="gr-url" type="url" inputmode="url" dir="ltr" autocomplete="off" spellcheck="false" placeholder="https://www.goodreads.com/user/show/12345-name">
          <small class="muted">${L('لازم البروفايل يكون عام. لو مقفول على الأصحاب: من Goodreads افتح <b>My Books</b>، تحت الصفحة دوس <b>RSS</b>، وانسخ اللينك والصقه هنا (بيفضل على الجهاز ده بس).', 'Your profile must be public. If it is friends-only: on Goodreads open <b>My Books</b>, tap <b>RSS</b> at the bottom of the page, copy that link and paste it here (it stays on this device only).', 'يجب أن يكون ملفك الشخصي عامًا. إن كان للأصدقاء فقط: افتح <b>My Books</b> في Goodreads، واضغط <b>RSS</b> أسفل الصفحة، وانسخ الرابط والصقه هنا (يبقى على هذا الجهاز فقط).')}</small>
          <label class="check"><input type="checkbox" id="gr-rev" ${!link || link.reviews ? 'checked' : ''}><span>${L('هات مراجعاتي كمان', 'Bring my reviews too', 'اجلب مراجعاتي أيضًا')}</span></label>
          <div class="row-btns"><button class="btn ${open ? 'gold' : ''}" data-gr-link>${icon('swap')}${link ? L('اربط باللينك ده', 'Use this link', 'اربط بهذا الرابط') : L('اربط وزامن', 'Link and sync', 'اربط وزامن')}</button></div>`;
      if (!link) {
        return `<section class="gr-box">
          <h4>${icon('swap')}${L('خلّي مكتبتك ماشية مع Goodreads', 'Keep your shelf in step with Goodreads', 'اجعل مكتبتك متزامنة مع Goodreads')}</h4>
          <p class="muted">${L('الصق لينك بروفايلك على Goodreads، وكل ١٢ ساعة هنجيب لوحدنا الكتب الجديدة واللي خلّصتها وتقييماتك. أي حاجة بتعدّلها هنا مش هتتغيّر.', 'Paste your Goodreads profile link and every 12 hours new books, finished ones and your ratings come over on their own. Anything you change here stays as you left it.', 'الصق رابط ملفك الشخصي في Goodreads، وكل ١٢ ساعة نجلب تلقائيًا الكتب الجديدة وما أنهيته وتقييماتك. ما تعدّله هنا يبقى كما هو.')}</p>
          ${form(true)}
          <p class="err-t" id="gr-err" hidden></p>
        </section>
        <p class="gr-or"><span>${L('أو استورد مرة واحدة من ملف', 'or import once from a file', 'أو استورد مرة واحدة من ملف')}</span></p>`;
      }
      const r = lastRes;
      return `<section class="gr-box on">
          <h4>${icon('check')}${L('مربوطة بـ Goodreads', 'Linked to Goodreads', 'مرتبطة بـ Goodreads')}</h4>
          <p class="muted gr-at">${L('حساب', 'Account', 'الحساب')} <bdi dir="ltr">${esc(link.id)}</bdi>${link.key ? ' • RSS' : ''} • ${link.at ? L(`آخر مزامنة: ${L.ago(link.at)}`, `Last sync: ${L.ago(link.at)}`, `آخر مزامنة: ${L.ago(link.at)}`) : L('لسه ماتزامنتش', 'Not synced yet', 'لم تتم المزامنة بعد')}</p>
          ${r ? `<div class="imp-sum gr-res"><div><b>${L.num(r.added)}</b><small>${L('جديد', 'New')}</small></div><div><b>${L.num(r.updated)}</b><small>${L('اتحدّث', 'Updated', 'تحدّث')}</small></div><div><b>${L.num(r.same)}</b><small>${L('زي ما هو', 'Unchanged', 'دون تغيير')}</small></div></div>
            ${r.kept ? `<small class="muted">${L(`${L.count(r.kept, 'book')} شلته من مكتبتك قبل كده، فمش هنرجّعه`, `${r.kept} you removed from your shelf before stay removed`, `${L.count(r.kept, 'book')} حذفته من مكتبتك من قبل، فلن نعيده`)}</small>` : ''}` : ''}
          <div class="row-btns"><button class="btn gold" data-gr-sync>${icon('swap')}${L('زامن دلوقتي', 'Sync now', 'زامن الآن')}</button><button class="btn ghost" data-gr-unlink>${L('فك الربط', 'Unlink')}</button></div>
          <p class="err-t" id="gr-err" ${failed && !r ? '' : 'hidden'}>${failed && !r ? esc(grErrText(failed.code)) : ''}</p>
          <details class="gr-change"><summary>${L('غيّر اللينك', 'Change the link', 'غيّر الرابط')}</summary>${form(false)}</details>
        </section>
        <p class="gr-or"><span>${L('أو استورد من ملف تصدير', 'or import from an export file', 'أو استورد من ملف تصدير')}</span></p>`;
    }

    function pick() {
      return `<ol class="imp-how">
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
