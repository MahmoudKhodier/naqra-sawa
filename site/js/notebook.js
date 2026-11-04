/* «دفتر اقتباساتي»: everything I wrote in the books, and what I brought in from Kindle or a backup (export.js).
   Three ways to look: by book (covers → the book's notes by page, in its portions), all of them newest first,
   and ⭐ my favourites (anyone's notes, priv.stars[id] = time). On top, «اقتباس من زمان»: an older quote of
   mine, a different one each day. Export and import start from the ⋯ here and from a book's ⋯. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const V = A.V;
  const esc = U.esc;
  const icon = U.icon;

  const KINDS = ['quote', 'hl', 'note', 'q', 'take'];
  const KIND_IC = { hl: 'hl', note: 'note', q: 'question', quote: 'quote', take: 'sparkle' };
  const VIEWS = ['books', 'all', 'stars'];
  const PAGE = 60;
  let shown = PAGE;
  const open = new Set(); // long texts unfolded
  const norm = (t) => A.Imp.key(String(t || ''), '').replace(/\|$/, '');
  const bookOf = (id) => (id && ((D.book ? D.book(id) : S.books.get(id)) || (S.gone && S.gone.get(id)))) || null;
  const removed = () => L('كتاب اتشال', 'Removed book', 'كتاب محذوف');

  /* ---------- the notes ---------- */
  /* src: 'c' the circle's notes, 'p' my private ones (priv.notes), 'm' brought in (S.myNotes). */
  const fromCircle = (n) => Object.assign({}, n, { src: 'c', priv: false });
  const fromPriv = (id, n) => Object.assign({ id, by: S.me }, n, { src: 'p', priv: true });
  const fromMine = (n) => Object.assign({ by: S.me }, n, { src: 'm', priv: true });
  /* A note anywhere, by id (the circle's, my private ones, the ones I brought in). */
  V.noteById = (id) => {
    if (!id) return null;
    const c = S.notes.get(id);
    if (c) return fromCircle(c);
    const p = S.priv && S.priv.notes && S.priv.notes[id];
    if (p) return fromPriv(id, p);
    const m = S.myNotes && S.myNotes.get(id);
    if (m && m.kind !== 'arch') return fromMine(m);
    return null;
  };
  /* Everything I wrote (and brought in), newest first. */
  V.myQuotes = () => {
    const out = [];
    for (const n of S.notes.values()) if (n && n.by === S.me && n.b) out.push(fromCircle(n));
    const pn = (S.priv && S.priv.notes) || {};
    for (const [id, n] of Object.entries(pn)) if (n && n.b) out.push(fromPriv(id, n));
    if (S.myNotes) for (const n of S.myNotes.values()) if (n && n.kind !== 'arch' && (n.b || n.xb)) out.push(fromMine(n));
    out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return out;
  };
  /* The group a note belongs to: its book, or a book from outside the app (a Kindle title). */
  const keyOf = (n) => (n.b ? n.b : 'x:' + n.xb);
  const infoOf = (key, n) => {
    if (key.startsWith('x:')) return { title: (n && n.xt) || L('كتاب', 'A book', 'كتاب'), author: (n && n.xa) || '', ext: true };
    const b = bookOf(key);
    return b ? { title: b.title, author: b.author, book: b, gone: !D.book(key) } : { title: removed(), author: '', gone: true };
  };
  const titleOf = (n) => infoOf(keyOf(n), n).title;

  /* ---------- favourites ---------- */
  const stars = () => (S.priv && S.priv.stars) || {};
  V.isStar = (id) => !!stars()[id];
  V.toggleStar = async (id) => {
    if (!id || !D.canWrite()) return;
    const on = V.isStar(id);
    try {
      await D.privUpdate((cur) => {
        const st = Object.assign({}, cur.stars);
        if (on) delete st[id];
        else st[id] = U.nowIso();
        return Object.assign(cur, { stars: st });
      });
      U.toast(on ? L('اتشالت من المفضلة', 'Removed from favourites', 'أُزيلت من المفضلة') : `⭐ ${L('اتضافت للمفضلة', 'Added to favourites', 'أُضيفت إلى المفضلة')}`);
    } catch (e) {}
  };
  const favs = () =>
    Object.entries(stars())
      .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
      .map(([id]) => V.noteById(id))
      .filter(Boolean);

  /* ---------- «اقتباس من زمان» ---------- */
  /* One of my older notes with words (a week old at least), the same one all day, another one tomorrow. */
  V.oldQuote = (all = V.myQuotes()) => {
    const edge = U.addDays(U.today(), -7);
    const pool = all.filter((n) => n.text && n.text.length >= 12 && n.kind !== 'q' && String(n.at || '').slice(0, 10) <= edge && !V.isSpoiler(n)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!pool.length) return null;
    return pool[U.hash(U.today() + '|' + S.me) % pool.length];
  };
  function oldCard(n) {
    const t = String(n.text);
    const info = infoOf(keyOf(n), n);
    return `<section class="qn-old" data-key="qn-old">
      <div class="qo-h"><span>🕰️ ${L('اقتباس من زمان', 'From your past reading', 'اقتباس من الماضي')}</span><small>${esc(L.agoLong(n.at))}</small></div>
      <button type="button" class="qo-text" data-act="qn-open" data-nid="${esc(n.id)}" data-src="${n.src}"><q dir="auto">${esc(t.length > 320 ? t.slice(0, 300).replace(/\s+\S*$/, '') + '…' : t)}</q></button>
      <div class="qo-f"><span class="qn-src">${icon('books')}<b dir="auto">${esc(info.title)}</b>${n.page ? `<span>• ${L('ص', 'p.')} ${L.num(n.page)}</span>` : ''}</span>
        <button type="button" class="ib qn-star${V.isStar(n.id) ? ' on' : ''}" data-act="qn-star" data-nid="${esc(n.id)}" aria-pressed="${V.isStar(n.id)}" aria-label="${L('المفضلة', 'Favourite', 'المفضلة')}">${icon('star')}</button>
        ${V.storySheet ? `<button type="button" class="ib" data-act="qn-share" data-nid="${esc(n.id)}" aria-label="${L('شارك كصورة', 'Share as picture', 'شارك كصورة')}">${icon('share')}</button>` : ''}</div>
    </section>`;
  }

  /* ---------- the screen ---------- */
  V.addRoute('quotes', 'me');
  const viewNow = (opts) => (VIEWS.includes(opts.v) ? opts.v : U.store.get('qnView', 'books'));
  V.screens.quotes = (opts = {}) => {
    const all = V.myQuotes();
    const v = viewNow(opts);
    const bk = opts.bk || '';
    const q = String(opts.q || '');
    const qn = norm(q.trim());
    const kind = KINDS.includes(opts.k) ? opts.k : '';
    const head = (title, back, sub) => `<button class="back" data-act="${back ? 'qn-books' : 'qn-back'}">${icon('back', 'flip')}<span>${back ? L('كل الكتب', 'All books', 'كل الكتب') : L('أنا', 'Me')}</span></button>
      <header class="page-head qn-head"><div class="qn-ht"><h1 dir="auto">${title}</h1>${sub ? `<small class="muted">${sub}</small>` : ''}</div><button class="ib" data-act="qn-menu" aria-label="${L('تصدير واستيراد', 'Export and import', 'تصدير واستيراد')}">${icon('more')}</button></header>`;
    const title0 = L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي');
    if (!all.length && !Object.keys(stars()).length) {
      return `<div class="quotes-page">${head(title0, false, '')}${V.empty(
        L('الدفتر لسه فاضي', 'Your notebook is empty', 'الدفتر فارغ بعد'),
        L('وإنت بتقرأ، دوس مطوّل على جملة عجبتك واختار «اقتباس» أو «ظلّل»، أو حط «ملاحظة» أو «سؤال». كل اللي بتكتبه في الكتب — حتى الخاص بيك لوحدك — هيتجمع هنا.', 'While reading, long-press a sentence you like and choose “Quote” or “Highlight”, or add a “Note” or “Question”. Everything you write in the books — even the private ones — gathers here.', 'أثناء القراءة، اضغط مطولًا على جملة أعجبتك واختر «اقتباس» أو «ظلّل»، أو أضف «ملاحظة» أو «سؤال». كل ما تكتبه في الكتب — حتى الخاص بك وحدك — يُجمع هنا.'),
        `<div class="row-btns center">${S.books.size ? `<button class="btn gold" data-go="books">${icon('books')}${L('روح لكتبنا', 'Go to Our books', 'اذهب إلى كتبنا')}</button>` : ''}<button class="btn ghost" data-act="qn-import">${icon('upload')}${L('استورد ملاحظات', 'Import notes', 'استورد ملاحظات')}</button></div>`,
      )}</div>`;
    }
    const match = (n) => {
      if (kind && (n.kind || 'note') !== kind) return false;
      if (!qn) return true;
      const info = infoOf(keyOf(n), n);
      return norm((n.text || '') + ' ' + info.title + ' ' + (info.author || '') + ' ' + (n.from || '')).includes(qn);
    };
    const search = `<label class="sh-search qn-search">${icon('search')}<input id="qn-q" type="search" dir="auto" value="${esc(q)}" placeholder="${bk ? L('دوّر في ملاحظات الكتاب ده…', 'Search this book’s notes…', 'ابحث في ملاحظات هذا الكتاب…') : L('دوّر في الكلام أو اسم الكتاب…', 'Search the text or a book title…', 'ابحث في النص أو عنوان الكتاب…')}" aria-label="${L('دوّر في الدفتر', 'Search the notebook', 'ابحث في الدفتر')}"></label>`;
    const chip = (act, val, cur, t, n) => `<button type="button" class="chip${cur === val ? ' on' : ''}" data-act="${act}" data-v="${esc(val)}" aria-pressed="${cur === val}">${t}${n != null ? ` <small>${L.num(n)}</small>` : ''}</button>`;
    const kindChips = (list) => {
      const kc = {};
      for (const n of list) kc[n.kind || 'note'] = (kc[n.kind || 'note'] || 0) + 1;
      const ks = KINDS.filter((k) => kc[k]);
      return ks.length > 1 ? `<div class="chips scroll qn-kinds" role="group" aria-label="${L('النوع', 'Kind')}">${chip('qn-kind', '', kind, L('الكل', 'All'), list.length)}${ks.map((k) => chip('qn-kind', k, kind, V.kindLabel(k), kc[k])).join('')}</div>` : '';
    };
    const listHtml = (list, grouped) => {
      if (!list.length)
        return V.empty(L('مفيش حاجة كده', 'Nothing matches', 'لا يوجد ما يطابق'), qn || kind ? L('جرّب كلمة تانية أو شيل الفلتر.', 'Try another word or clear the filter.', 'جرّب كلمة أخرى أو أزل التصفية.') : '', qn || kind ? `<div class="row-btns center"><button class="btn ghost" data-act="qn-clear">${L('شيل الفلتر', 'Clear filters', 'أزل التصفية')}</button></div>` : '');
      if (grouped) return grouped;
      const items = list.slice(0, shown);
      return `<p class="muted sm qn-count">${L.count(list.length, 'note')}</p><div class="qn-list">${items.map((n) => card(n, { book: true })).join('')}</div>${list.length > shown ? `<div class="qn-sent" id="qn-sent" aria-hidden="true"></div>` : ''}`;
    };

    // one book: its notes by page, in its portions
    if (bk) {
      const mine = all.filter((n) => keyOf(n) === bk);
      const any = mine[0] || favs().find((n) => keyOf(n) === bk);
      const info = infoOf(bk, any);
      const list = mine.filter(match);
      const cover = info.book ? V.cover(info.book, 'sm') : V.genCover(info.title, info.author, 'sm');
      return `<div class="quotes-page qn-bookpage">${head(esc(info.title), true, '')}
        <div class="qn-bhero">${cover}<div class="qn-bh-t">${info.author ? `<small dir="auto">${esc(info.author)}</small>` : ''}<b>${L.count(mine.length, 'note')}</b>${info.ext ? `<span class="kind">${icon('upload')}Kindle</span>` : info.gone ? `<span class="kind">${removed()}</span>` : ''}</div>
          <button class="btn ghost sm" data-act="qn-export" data-b="${esc(bk)}">${icon('download')}${L('صدّر', 'Export', 'صدّر')}</button></div>
        <div class="qn-tools">${search}${kindChips(mine)}</div>
        ${listHtml(list, list.length ? byPortion(bk, info, list) : '')}
      </div>`;
    }

    const segs = `<div class="segs qn-views" role="tablist">${[
      ['books', icon('books') + `<span>${L('حسب الكتاب', 'By book', 'حسب الكتاب')}</span>`],
      ['all', icon('list') + `<span>${L('الكل', 'All', 'الكل')}</span>`],
      ['stars', icon('star') + `<span>${L('المفضلة', 'Favourites', 'المفضلة')}</span>`],
    ]
      .map(([k, t]) => `<button type="button" role="tab" class="${v === k ? 'on' : ''}" aria-selected="${v === k}" data-act="qn-view" data-v="${k}">${t}</button>`)
      .join('')}</div>`;
    const old = v === 'books' && !qn && !kind ? V.oldQuote(all) : null;
    let bodyHtml;
    if (v === 'stars') {
      const list = favs().filter(match);
      bodyHtml = Object.keys(stars()).length
        ? `${kindChips(favs())}${listHtml(list)}`
        : V.empty(L('مفيش مفضلة لسه', 'No favourites yet', 'لا مفضلة بعد'), L('دوس على ⭐ جنب أي اقتباس عجبك — بتاعك أو بتاع حد في الحلقة — وهتلاقيه هنا.', 'Tap ⭐ next to any quote you love — yours or a friend’s — and it shows up here.', 'اضغط ⭐ بجانب أي اقتباس أعجبك — لك أو لأحد في الحلقة — وستجده هنا.'));
    } else if (v === 'all' || qn) {
      bodyHtml = `${kindChips(all)}${listHtml(all.filter(match))}`;
    } else {
      // the books, as covers, the one written in most lately first
      const groups = new Map();
      for (const n of all) {
        const k = keyOf(n);
        const g = groups.get(k) || { k, n: 0, at: '', any: n };
        g.n++;
        if (String(n.at || '') > g.at) g.at = String(n.at || '');
        groups.set(k, g);
      }
      const gs = [...groups.values()].filter((g) => !kind || all.some((n) => keyOf(n) === g.k && (n.kind || 'note') === kind)).sort((a, b) => b.at.localeCompare(a.at));
      bodyHtml = `<div class="qn-shelf">${gs
        .map((g) => {
          const info = infoOf(g.k, g.any);
          return `<button type="button" class="qn-bk${info.gone ? ' gone' : ''}" data-act="qn-book" data-v="${esc(g.k)}" data-key="qnb-${esc(g.k)}">
            <span class="qn-bk-cv">${info.book ? V.cover(info.book, 'md') : V.genCover(info.title, info.author, 'md')}<i class="qn-bk-n">${L.num(g.n)}</i>${info.ext ? '<i class="qn-bk-x">Kindle</i>' : ''}</span>
            <b dir="auto">${esc(info.title)}</b></button>`;
        })
        .join('')}</div>`;
    }
    return `<div class="quotes-page">${head(title0, false, L.count(all.length, 'note'))}
      ${old ? oldCard(old) : ''}
      <div class="qn-tools">${segs}${search}</div>
      ${bodyHtml}
    </div>`;
  };

  /* A book's notes in order: by portion when it has a plan, by page; Kindle ones by location. */
  function byPortion(bk, info, list) {
    const pos = (n) => (n.page || 0) * 10 + (n.rect ? n.rect.y || 0 : n.kind === 'take' ? 9.9 : 0);
    const loc = (n) => (n.loc ? parseInt(String(n.loc), 10) || 0 : 0);
    const sorted = list.slice().sort((a, b) => pos(a) - pos(b) || loc(a) - loc(b) || String(a.at || '').localeCompare(String(b.at || '')));
    const ws = info.book && info.book.wirds && info.book.wirds.length ? G.wirds(info.book) : [];
    // «الفهرس»: a line with the heading wherever the notes go under a new one
    let lastHd = '';
    const cards = (ns) =>
      ns
        .map((n) => {
          let pre = '';
          const h = A.Hd && n.page && D.book(bk) ? A.Hd.pathAt(bk, n.page, n.rect ? n.rect.y || 0 : 1).pop() : null;
          if (h && h.id !== lastHd) {
            lastHd = h.id;
            pre = `<p class="qn-hd l${h.l}">${A.Hd.icon(h.l)}<span dir="auto">${esc(A.Hd.title(h))}</span></p>`;
          }
          return pre + card(n);
        })
        .join('');
    if (!ws.length) return `<p class="muted sm qn-count">${L.count(list.length, 'note')}</p><div class="qn-list">${cards(sorted)}</div>`;
    const groups = new Map();
    for (const n of sorted) {
      const w = (n.wid && ws.find((x) => x.id === n.wid)) || (n.page ? ws.find((x) => n.page >= x.from && n.page <= x.to) : null);
      const k = w ? w.id : '';
      if (!groups.has(k)) groups.set(k, { w, list: [] });
      groups.get(k).list.push(n);
    }
    const order = [...groups.values()].sort((a, b) => (a.w ? a.w.n : 1e9) - (b.w ? b.w.n : 1e9));
    return order
      .map(
        (g) => `<section class="qn-wird">
        <h3>${g.w ? `<span class="qw-n">${L('الورد', 'Portion', 'الورد')} ${L.num(g.w.n)}</span><small>${L('ص', 'p.')} ${L.num(g.w.from)}–${L.num(g.w.to)}</small>` : `<span class="qw-n">${L('برّه الأوراد', 'Outside the portions', 'خارج الأوراد')}</span>`}<i>${L.num(g.list.length)}</i></h3>
        <div class="qn-list">${cards(g.list)}</div>
      </section>`,
      )
      .join('');
  }

  // this year: «امبارح», «٣ أبريل»; another year: «أبريل ٢٠٢٣»
  const when = (iso) => (!iso ? '' : String(iso).slice(0, 4) === U.today().slice(0, 4) ? L.ago(iso) : L.monthYear(U.isoKey(iso)));
  function card(n, o = {}) {
    const info = infoOf(keyOf(n), n);
    const text = String(n.text || '');
    const long = text.length > 260 || text.split('\n').length > 6;
    const unfolded = open.has(n.id);
    const k = n.kind || 'note';
    const other = n.from || n.by !== S.me;
    const star = V.isStar(n.id);
    return `<article class="qn k-${esc(k)}${n.priv ? ' priv' : ''}" data-key="qn-${esc(n.id)}">
      <button type="button" class="qn-main" data-act="qn-open" data-nid="${esc(n.id)}" data-src="${n.src}" data-priv="${n.src === 'p' ? '1' : ''}">
        <span class="qn-top">${other ? `<span class="qn-who">${D.authorAvatar(n, 'xs')}<b>${esc(D.authorName(n))}</b></span>` : ''}<span class="kind k-${esc(k)}">${icon(KIND_IC[k] || 'note')}${V.kindLabel(k)}</span>${n.src === 'p' ? `<span class="kind">${icon('lock')}${L('خاصة', 'Private')}</span>` : ''}${n.src === 'm' && n.via === 'kindle' ? '<span class="kind">Kindle</span>' : ''}<small class="qn-ago">${esc(when(n.at))}</small></span>
        ${text ? `<span class="qn-text${long && !unfolded ? ' fold' : ''}" dir="auto">${esc(text)}</span>` : n.crop ? `<img class="qn-crop" src="${esc(n.crop)}" alt="">` : `<span class="qn-text muted">${L('تظليل من غير كلام', 'A highlight without words', 'تظليل دون نص')}</span>`}
        <span class="qn-src">${o.book ? `${icon('books')}<b dir="auto">${esc(info.title)}</b>` : ''}${n.page && k !== 'take' ? `<span>${o.book ? '• ' : ''}${L('ص', 'p.')} ${L.num(n.page)}</span>` : n.kpage ? `<span>${o.book ? '• ' : ''}${L('ص', 'p.')} ${L.num(n.kpage)}</span>` : n.loc ? `<span>${o.book ? '• ' : ''}${L('مكان', 'Loc.', 'موضع')} ${esc(L.num(String(n.loc)))}</span>` : ''}</span>
      </button>
      <button type="button" class="qn-star${star ? ' on' : ''}" data-act="qn-star" data-nid="${esc(n.id)}" aria-pressed="${star}" aria-label="${L('المفضلة', 'Favourite', 'المفضلة')}">${icon('star')}</button>
      ${long ? `<button type="button" class="qn-more" data-act="qn-more" data-nid="${esc(n.id)}" aria-expanded="${unfolded}">${unfolded ? L('اقفل', 'Show less', 'أغلق') : L('اقرأ الباقي', 'Read the rest', 'اقرأ الباقي')}</button>` : ''}
    </article>`;
  }

  /* ---------- actions ---------- */
  const setOpts = (patch) => {
    V.state.opts = Object.assign({}, V.state.opts, patch);
    shown = PAGE;
    V.render();
  };
  V.actions['qn-back'] = () => (V.trail.length ? V.back() : V.go('me', {}, true));
  V.actions['qn-view'] = (a) => {
    U.store.set('qnView', a.dataset.v);
    setOpts({ v: a.dataset.v, k: '' });
  };
  V.actions['qn-kind'] = (a) => setOpts({ k: a.dataset.v });
  V.actions['qn-book'] = (a) => {
    shown = PAGE;
    V.go('quotes', { bk: a.dataset.v, v: viewNow(V.state.opts || {}) });
  };
  V.actions['qn-books'] = () => {
    const t = V.trail[V.trail.length - 1];
    if (t && t.route === 'quotes' && !(t.opts || {}).bk) return V.back();
    shown = PAGE;
    V.go('quotes', { v: 'books' }, true);
  };
  V.actions['qn-clear'] = () => setOpts({ k: '', q: '' });
  V.actions['qn-more'] = (a) => {
    const id = a.dataset.nid;
    if (open.has(id)) open.delete(id);
    else open.add(id);
    V.render();
  };
  V.actions['qn-star'] = (a) => V.toggleStar(a.dataset.nid);
  V.actions['qn-share'] = (a) => {
    const n = V.noteById(a.dataset.nid);
    if (n && V.storySheet) V.storySheet(n);
  };
  V.actions['qn-open'] = (a) => {
    const id = a.dataset.nid;
    const n = V.noteById(id);
    if (!n) return U.toast(L('الملاحظة دي اتمسحت', 'That note was deleted', 'تم حذف هذه الملاحظة'), 'warn');
    const opts = { priv: n.src === 'p', my: n.src === 'm' };
    if (!n.b || !D.book(n.b) || !n.page) {
      if (n.b && !D.book(n.b) && n.src === 'c') return U.toast(L('الكتاب ده اتشال من الحلقة', 'That book was removed from the circle', 'أُزيل هذا الكتاب من الحلقة'), 'warn');
      return V.openNote(id, opts);
    }
    if (n.kind === 'take') return V.openNote(id, opts);
    A.R.open(n.b, { page: n.page, flash: id });
  };
  V.actions['qn-menu'] = () => {
    const bk = (V.state.opts || {}).bk || '';
    V.menu(
      [
        { ic: 'download', t: bk ? L('صدّر ملاحظات الكتاب ده', 'Export this book’s notes', 'صدّر ملاحظات هذا الكتاب') : L('صدّر ملاحظاتي', 'Export my notes', 'صدّر ملاحظاتي'), fn: () => V.exportSheet && V.exportSheet({ b: bk }) },
        { ic: 'upload', t: L('استورد ملاحظات (نسخة احتياطية أو Kindle)', 'Import notes (a backup or Kindle)', 'استورد ملاحظات (نسخة احتياطية أو Kindle)'), fn: () => V.importPick && V.importPick({ b: bk && !bk.startsWith('x:') ? bk : '' }) },
      ],
      L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي'),
    );
  };
  V.actions['qn-export'] = (a) => V.exportSheet && V.exportSheet({ b: a.dataset.b || '' });
  V.actions['qn-import'] = () => V.importPick && V.importPick({});
  V.actions['go-quotes'] = () => {
    shown = PAGE;
    V.go('quotes');
  };
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'qn-q' || V.state.route !== 'quotes') return;
    V.state.opts = Object.assign({}, V.state.opts, { q: e.target.value });
    shown = PAGE;
    V.render();
  });

  // long lists: the next 60 come in as the end of the list scrolls into view
  let io = null;
  V.after = V.after || [];
  V.after.push((scr) => {
    if (io) io.disconnect();
    const s = V.state.route === 'quotes' && scr.querySelector('#qn-sent');
    if (!s || typeof IntersectionObserver === 'undefined') return;
    io = new IntersectionObserver(
      (ents) => {
        if (!ents.some((x) => x.isIntersecting)) return;
        io.disconnect();
        shown += PAGE;
        V.render();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(s);
  });

  /* The way in: a small card on my «أنا» and an entry in the shelf's ⋯ menu. */
  V.addSection('me', {
    order: 30,
    render: (ctx) => {
      if (!ctx.mine) return '';
      const all = V.myQuotes();
      const latest = all.find((n) => n.text && (n.kind === 'quote' || n.kind === 'hl')) || all.find((n) => n.text);
      return `<button type="button" class="card qn-entry" data-act="go-quotes">
        <span class="qn-e-ic">${icon('quote')}</span>
        <span class="qn-e-t"><b>${L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي')}<small>${L.count(all.length, 'note')}</small></b>
        ${latest ? `<q dir="auto">${esc(latest.text)}</q><small dir="auto">${esc(titleOf(latest))}</small>` : `<small>${L('كل اللي بتظلّله وتكتبه في الكتب، في مكان واحد', 'Everything you highlight and write in the books, in one place', 'كل ما تظلّله وتكتبه في الكتب، في مكان واحد')}</small>`}</span>
        ${icon('fwd', 'flip-rtl')}
      </button>`;
    },
  });
  V.addMenu('shelf', () => ({ ic: 'quote', t: L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي'), fn: () => V.actions['go-quotes']() }));
})();
