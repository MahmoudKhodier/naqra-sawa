/* My shelf: books I've read before, am reading, want to read. Yearly challenge. Friends' shelves. */
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

  const TAGS = [
    ['novel', 'رواية', 'Novel'], ['history', 'تاريخ', 'History'], ['religion', 'دين', 'Religion'], ['self', 'تطوير ذات', 'Self-help', 'تطوير الذات'],
    ['science', 'علوم', 'Science'], ['philo', 'فلسفة', 'Philosophy'], ['poetry', 'شعر', 'Poetry'], ['bio', 'سيرة', 'Biography'],
    ['business', 'بيزنس', 'Business', 'أعمال'], ['kids', 'أطفال', 'Children'], ['tech', 'تكنولوجيا', 'Technology'], ['other', 'تاني', 'Other', 'أخرى'],
  ];
  const tagName = (k) => {
    const t = TAGS.find((x) => x[0] === k);
    return t ? L(t[1], t[2], t[3]) : k;
  };
  const STATUS = {
    read: ['قرأته', 'Read'],
    reading: ['بقرأه', 'Reading', 'أقرؤه'],
    want: ['عايز أقرأه', 'Want to read', 'أريد قراءته'],
    dnf: ['سبته', 'Didn’t finish', 'لم أكمله'],
  };
  V.SHELF_STATUS = STATUS;
  V.SHELF_TAGS = TAGS;
  V.shelfTagName = (k) => tagName(k);
  const PAGE = 80; // rows drawn at first; more come as you scroll
  const SPINES = 24; // the wooden shelf shows the first few only

  /* Shelf items of a member, plus books finished together in the circle. */
  V.shelfItems = (uid) => {
    const sh = S.shelf.get(uid);
    const items = Object.entries((sh && sh.items) || {}).filter(([, it]) => it && it.title).map(([id, it]) => Object.assign({ id }, it));
    const linked = new Set(items.filter((x) => x.together).map((x) => x.together));
    for (const p of S.prog.values()) {
      if (p.u !== uid || !p.finished || linked.has(p.b)) continue;
      const b = S.books.get(p.b);
      if (b) items.push({ id: 'tg-' + b.id, title: b.title, author: b.author, status: 'read', together: b.id, finished: U.isoKey(p.finished).slice(0, 7), at: p.finished, virtual: true, pages: b.pages });
    }
    return items;
  };
  /* My own shelves («رفوف»): names with how many books are on each, biggest first. */
  V.shelfLists = (uid) => {
    const n = new Map();
    for (const it of V.shelfItems(uid)) for (const l of it.lists || []) n.set(l, (n.get(l) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const keyCache = new Map();
  const searchKey = (it) => {
    const raw = it.title + ' ' + (it.author || '');
    let k = keyCache.get(raw);
    if (k == null) {
      k = A.Imp.key(raw, '');
      if (keyCache.size > 20000) keyCache.clear();
      keyCache.set(raw, k);
    }
    return k;
  };
  /* The letter a title or author starts with, with Arabic hamza forms and «ال» folded so the index stays short. */
  const firstLetter = (s) => {
    let t = String(s || '').trim().replace(/^(ال|the\s+|a\s+)/i, '');
    const c = (t[0] || '#').toUpperCase().replace(/[أإآٱ]/, 'ا');
    return /[\p{L}]/u.test(c) ? c : '#';
  };
  const yearOf = (it) => (/^\d{4}/.test(it.finished || '') ? it.finished.slice(0, 4) : '');

  V.screens.shelf = (opts = {}) => {
    const uid = opts.uid && S.members.has(opts.uid) ? opts.uid : S.me;
    const mine = uid === S.me;
    const tab = STATUS[opts.st] ? opts.st : 'read';
    const all = V.shelfItems(uid);
    const counts = { read: 0, reading: 0, want: 0, dnf: 0 };
    for (const it of all) counts[it.status] = (counts[it.status] || 0) + 1;
    const year = String(new Date().getFullYear());
    const m = S.members.get(uid) || {};
    const goal = (m.goal && +m.goal[year]) || 0;
    const doneYear = all.filter((x) => x.status === 'read' && String(x.finished || '').startsWith(year)).length;
    const inTab = all.filter((x) => x.status === tab);
    const q = String(opts.q || '').trim();
    const sort = opts.sort || 'recent';
    const f = { rating: +opts.rating || 0, tag: opts.tag || '', list: opts.list || '' };
    const qn = q ? A.Imp.key(q, '').replace(/\|$/, '') : '';
    const loc = L.isAr() ? 'ar' : 'en';
    const list = inTab
      .filter((x) => (!qn || searchKey(x).includes(qn)) && (!f.rating || (x.rating || 0) >= f.rating) && (!f.tag || (x.tags || []).includes(f.tag)) && (!f.list || (x.lists || []).includes(f.list)))
      .sort((a, b) =>
        sort === 'title' ? String(a.title).localeCompare(String(b.title), loc)
          : sort === 'author' ? String(a.author || '~').localeCompare(String(b.author || '~'), loc) || String(a.title).localeCompare(String(b.title), loc)
            : sort === 'rating' ? (b.rating || 0) - (a.rating || 0) || String(b.finished || b.at).localeCompare(String(a.finished || a.at))
              : sort === 'pages' ? (+b.pages || 0) - (+a.pages || 0)
                : String(b.finished || b.at).localeCompare(String(a.finished || a.at)),
      );
    const nFilters = (f.rating ? 1 : 0) + (f.tag ? 1 : 0) + (f.list ? 1 : 0);
    const lists = V.shelfLists(uid);
    const tools = inTab.length > 6 || q || nFilters ? `<div class="shelf-tools"><label class="sh-search">${icon('search')}<input id="sh-q" type="search" dir="auto" placeholder="${L('دوّر بالاسم أو المؤلف…', 'Search title or author…', 'ابحث بالعنوان أو المؤلف…')}" value="${esc(q)}" aria-label="${L('دوّر في المكتبة', 'Search the shelf', 'ابحث في المكتبة')}"></label>
        <select id="sh-sort" aria-label="${L('الترتيب', 'Sort')}">${[['recent', L('الأحدث', 'Recent')], ['title', L('بالاسم', 'Title', 'بالعنوان')], ['author', L('بالمؤلف', 'Author')], ['rating', L('بالتقييم', 'Rating')], ['pages', L('بالطول', 'Length')]].map(([k, t]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button class="ib round sh-filter${nFilters ? ' on' : ''}" data-act="shelf-filter" aria-label="${L('فلتر', 'Filter', 'تصفية')}">${icon('filter')}${nFilters ? `<i class="nv-b">${L.num(nFilters)}</i>` : ''}</button></div>` : '';
    const chips = [
      f.rating ? [`★ ${L.num(f.rating)}+`, 'rating'] : null,
      f.tag ? [tagName(f.tag), 'tag'] : null,
      f.list ? [f.list, 'list'] : null,
    ].filter(Boolean);
    const active = chips.length ? `<div class="chips wrap sh-active">${chips.map(([t, k]) => `<button class="chip on" data-act="shelf-unfilter" data-k="${k}" aria-label="${L('شيل الفلتر', 'Remove filter', 'أزل التصفية')}"><span dir="auto">${esc(t)}</span>${icon('close')}</button>`).join('')}<span class="muted sm">${L.count(list.length, 'book')}</span></div>` : '';
    const listRow = lists.length && !f.list ? `<div class="chips sh-lists" role="list">${lists.slice(0, 12).map(([n, c]) => `<button class="chip" data-act="shelf-list-pick" data-list="${esc(n)}">${icon('layers')}<span dir="auto">${esc(n)}</span><small>${L.num(c)}</small></button>`).join('')}</div>` : '';
    const pagesTotal = all.filter((x) => x.status === 'read').reduce((s2, x) => s2 + (+x.pages || 0), 0);
    const owners = D.memberIds();
    const shown = Math.max(PAGE, +opts.n || 0);
    return `<div class="shelfpage">
      <header class="page-head shelf-head"><h1>${mine ? L('مكتبتي', 'My shelf') : L(`مكتبة ${esc(D.name(uid))}`, `${esc(D.name(uid))}'s shelf`)}</h1>
        ${mine && D.canWrite() ? `<div class="row-btns"><button class="btn gold sm" data-act="shelf-add">${icon('plus')}${L('ضيف كتاب', 'Add a book', 'أضف كتابًا')}</button><button class="ib round" data-act="shelf-more" aria-label="${L('المزيد', 'More')}">${icon('more')}</button></div>` : ''}</header>
      ${owners.length > 1 ? `<div class="owners" role="tablist">${owners.map((u) => `<button class="owner${u === uid ? ' on' : ''}" data-act="shelf-of" data-uid="${esc(u)}" role="tab" aria-selected="${u === uid}">${D.avatar(u, 'sm')}<span>${u === S.me ? L('أنا', 'Me') : esc(D.name(u))}</span></button>`).join('')}</div>` : ''}
      <button class="shelf-sum" ${mine && D.canWrite() ? 'data-act="set-goal"' : 'disabled'} aria-label="${L(`تحدي ${L.num(+year, { useGrouping: false })}`, `${year} challenge`)}">
        ${V.ring(goal ? doneYear / goal : 0, `<b>${L.num(doneYear)}</b>`, doneYear >= goal && goal ? 'jade' : 'gold', 40)}
        <span class="ss-goal"><b>${L(`تحدي ${L.num(+year, { useGrouping: false })}`, `${year} challenge`)}</b><small>${goal ? (doneYear >= goal ? L('حققت الهدف! 🎉', 'Goal reached! 🎉', 'حققت الهدف! 🎉') : L(`${L.num(doneYear)} من ${L.num(goal)}`, `${doneYear} of ${goal}`)) : mine ? L('حط هدف للسنة', 'Set a goal', 'حدد هدفًا للعام') : L('مفيش هدف لسه', 'No goal yet', 'لا يوجد هدف بعد')}</small></span>
        <span class="ss-n"><b>${L.num(counts.read)}</b><small>${L('كتاب', 'books', 'كتب')}</small></span>
        <span class="ss-n"><b>${L.num(pagesTotal)}</b><small>${L('صفحة', 'pages')}</small></span>
        <span class="ss-n"><b>${L.num(all.filter((x) => x.together).length)}</b><small>${L('مع الحلقة', 'together')}</small></span>
      </button>
      ${V.sections('shelf', { uid, mine, all })}
      <nav class="tabs" role="tablist">${Object.entries(STATUS).filter(([k]) => k !== 'dnf' || counts.dnf || tab === 'dnf').map(([k, t]) => `<button role="tab" class="tab${k === tab ? ' on' : ''}" aria-selected="${k === tab}" data-act="shelf-tab" data-st="${k}" data-uid="${esc(uid)}"><span>${L(...t)}</span><small>${L.num(counts[k] || 0)}</small></button>`).join('')}</nav>
      ${tools}${active}${listRow}
      ${list.length ? shelfRows(list, { shown, sort, tab }) : q || nFilters ? V.empty(L('مفيش كتاب كده', 'No book matches', 'لا يوجد كتاب مطابق'), L('جرّب كلمة تانية أو شيل فلتر.', 'Try another word or remove a filter.', 'جرّب كلمة أخرى أو أزل تصفية.')) : V.empty(tab === 'read' ? L('الرف فاضي', 'This shelf is empty', 'الرف فارغ') : L('مفيش حاجة هنا لسه', 'Nothing here yet', 'لا شيء هنا بعد'), mine ? L('ضيف الكتب اللي قريتها قبل كده — كل كتاب بـ ١٠ XP، والرأي بـ ٥ زيادة. عندك حساب Goodreads؟ هات مكتبتك كلها مرة واحدة.', 'Add books you have read before — 10 XP each, plus 5 for a review. On Goodreads? Bring your whole library at once.', 'أضف الكتب التي قرأتها من قبل — لكل كتاب ١٠ XP، وللرأي ٥ إضافية. لديك حساب Goodreads؟ اجلب مكتبتك كلها دفعة واحدة.') : '', mine && D.canWrite() && tab === 'read' ? `<div class="row-btns center"><button class="btn gold" data-act="bulk-shelf">${icon('list')}${L('ضيف كذا كتاب مرة واحدة', 'Add several at once', 'أضف عدة كتب دفعة واحدة')}</button><button class="btn ghost" data-act="import-shelf">${icon('download')}${L('استورد من Goodreads', 'Import from Goodreads')}</button></div>` : '')}
    </div>`;
  };

  const rowHtml = (it, i) =>
    `<li id="sl-${i}"><button data-act="shelf-item" data-id="${esc(it.id)}">${V.coverOf ? V.coverOf(it, 'xs') : V.genCover(it.title, it.author, 'xs')}<span class="sl-t"><b dir="auto">${esc(it.title)}</b><small>${it.author ? `<span dir="auto">${esc(it.author)}</span>` : ''}${it.finished ? ` • ${it.finished.length === 4 ? L.num(+it.finished, { useGrouping: false }) : L.monthYear(it.finished)}` : ''}${it.reads && it.reads.length ? ` • <span class="re-n">${icon('refresh')}${L.num(it.reads.length + 1)}×</span>` : ''}${it.together ? ` • <span class="gold-t">${L('قرأناه سوا', 'Read together', 'قرأناه معًا')}</span>` : ''}</small></span>${it.rating ? V.stars(it.rating) : ''}</button></li>`;

  /* Spines on a wooden shelf for the first few, then the list — in pages, by year when sorted by date, with a
     letter index when sorted by name. */
  function shelfRows(list, { shown, sort, tab }) {
    const spines = `<div class="bookshelf">${list
      .slice(0, SPINES)
      .map((it) => {
        const [bg, fg] = U.spineOf(it.title + (it.author || ''));
        const h = 70 + (U.hash(it.title) % 30);
        return `<button class="spine${it.together ? ' together' : ''}" data-act="shelf-item" data-id="${esc(it.id)}" style="--bg:${bg};--fg:${fg};--h:${h}%;--w:${30 + (U.hash(it.id) % 14)}px" title="${esc(it.title)}">
          <span class="sp-body"><span class="sp-t" dir="auto">${esc(it.title)}</span>
          ${it.rating ? `<span class="sp-r">${'★'.repeat(it.rating)}</span>` : ''}
          ${it.together ? `<span class="sp-tg" aria-label="${L('قرأناه سوا', 'Read together', 'قرأناه معًا')}"></span>` : ''}</span>
        </button>`;
      })
      .join('')}</div>`;
    const vis = list.slice(0, shown);
    let body = '';
    if (sort === 'recent' && (tab === 'read' || tab === 'dnf') && list.length > 12) {
      // one group per year read, with how many books that year
      const perYear = new Map();
      for (const it of list) perYear.set(yearOf(it), (perYear.get(yearOf(it)) || 0) + 1);
      let cur = null, rows = '';
      vis.forEach((it, i) => {
        const y = yearOf(it);
        if (y !== cur) {
          if (cur !== null) body += `<ul class="shelf-list">${rows}</ul>`;
          rows = '';
          cur = y;
          body += `<h3 class="sh-year"><span>${y ? L.num(+y, { useGrouping: false }) : L('من غير تاريخ', 'No date', 'بلا تاريخ')}</span><small>${L.count(perYear.get(y), 'book')}</small></h3>`;
        }
        rows += rowHtml(it, i);
      });
      body += `<ul class="shelf-list">${rows}</ul>`;
    } else {
      let index = '';
      if ((sort === 'title' || sort === 'author') && list.length > 30) {
        const first = new Map();
        list.forEach((it, i) => {
          const c = firstLetter(sort === 'author' ? it.author : it.title);
          if (!first.has(c)) first.set(c, i);
        });
        index = `<nav class="sh-az" aria-label="${L('اقفز لحرف', 'Jump to a letter', 'انتقل إلى حرف')}">${[...first.entries()].map(([c, i]) => `<button data-act="shelf-jump" data-i="${i}">${esc(c)}</button>`).join('')}</nav>`;
      }
      body = `${index}<ul class="shelf-list">${vis.map(rowHtml).join('')}</ul>`;
    }
    const left = list.length - vis.length;
    const more = left > 0 ? `<button class="btn ghost sh-more" data-act="shelf-more-rows" data-n="${shown}">${L(`اعرض كمان (فاضل ${L.count(left, 'book')})`, `Show more (${left} left)`, `اعرض المزيد (بقي ${L.count(left, 'book', 'nom')})`)}</button>` : '';
    return spines + body + more;
  }

  const setOpts = (patch) => {
    V.state.opts = Object.assign({}, V.state.opts, patch);
    V.render();
  };
  // More rows as the end of the list comes into view (the button stays for a tap, too).
  let moreObs = null;
  V.after = V.after || [];
  V.after.push((scr) => {
    if (V.state.route !== 'shelf' || !('IntersectionObserver' in window)) return;
    const btn = scr.querySelector('.sh-more');
    if (moreObs) moreObs.disconnect();
    if (!btn) return;
    moreObs = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && V.state.route === 'shelf') {
        moreObs.disconnect();
        setOpts({ n: (+btn.dataset.n || PAGE) + 160 });
      }
    }, { rootMargin: '600px' });
    moreObs.observe(btn);
  });
  V.actions['shelf-more-rows'] = (a) => setOpts({ n: (+a.dataset.n || PAGE) + 160 });
  V.actions['shelf-jump'] = (a) => {
    const i = +a.dataset.i;
    setOpts({ n: Math.max(+(V.state.opts || {}).n || 0, i + PAGE) });
    requestAnimationFrame(() => {
      const el = document.getElementById('sl-' + i);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  V.actions['shelf-unfilter'] = (a) => setOpts({ [a.dataset.k]: '', n: 0 });
  V.actions['shelf-list-pick'] = (a) => setOpts({ list: a.dataset.list, n: 0 });
  V.actions['shelf-filter'] = () => {
    const o = V.state.opts || {};
    const uid = o.uid && S.members.has(o.uid) ? o.uid : S.me;
    const items = V.shelfItems(uid);
    const tags = TAGS.filter(([k]) => items.some((x) => (x.tags || []).includes(k)));
    const lists = V.shelfLists(uid);
    const pick = { rating: +o.rating || 0, tag: o.tag || '', list: o.list || '' };
    const chip = (k, v, label, on) => `<button type="button" class="chip${on ? ' on' : ''}" data-k="${k}" data-v="${esc(v)}"><span dir="auto">${label}</span></button>`;
    V.sheet({
      title: L('فلتر', 'Filter', 'تصفية'),
      html: `<span class="lbl">${L('التقييم', 'Rating')}</span><div class="chips wrap" data-g="rating">${[0, 3, 4, 5].map((n) => chip('rating', n, n ? `★ ${L.num(n)}${n < 5 ? '+' : ''}` : L('أي تقييم', 'Any', 'أي تقييم'), pick.rating === n)).join('')}</div>
        ${tags.length ? `<span class="lbl">${L('التصنيف', 'Tag')}</span><div class="chips wrap" data-g="tag">${chip('tag', '', L('الكل', 'All'), !pick.tag)}${tags.map(([k]) => chip('tag', k, tagName(k), pick.tag === k)).join('')}</div>` : ''}
        ${lists.length ? `<span class="lbl">${L('الرف', 'Shelf')}</span><div class="chips wrap" data-g="list">${chip('list', '', L('الكل', 'All'), !pick.list)}${lists.map(([n, c]) => chip('list', n, `${esc(n)} (${L.num(c)})`, pick.list === n)).join('')}</div>` : ''}
        <div class="row-btns end"><button class="btn ghost" data-clear>${L('شيل الكل', 'Clear all', 'أزل الكل')}</button><button class="btn gold" data-apply>${icon('check')}${L('وريني', 'Show', 'اعرض')}</button></div>`,
      onMount: (body, api) =>
        body.addEventListener('click', (e) => {
          const c = e.target.closest('[data-k]');
          if (c) {
            pick[c.dataset.k] = c.dataset.k === 'rating' ? +c.dataset.v : c.dataset.v;
            body.querySelectorAll(`[data-k="${c.dataset.k}"]`).forEach((x) => x.classList.toggle('on', x === c));
          }
          if (e.target.closest('[data-clear]')) {
            api.close();
            setOpts({ rating: 0, tag: '', list: '', n: 0 });
          }
          if (e.target.closest('[data-apply]')) {
            api.close();
            setOpts(Object.assign({ n: 0 }, pick));
          }
        }),
    });
  };

  /* Rename or remove one of my shelves (on every book that's on it). */
  V.manageLists = () => {
    const lists = V.shelfLists(S.me);
    const rewrite = (fn) =>
      D.mutate(`shelf/${S.me}`, () => {
        const cur = S.shelf.get(S.me) || {};
        const items = {};
        for (const [id, it] of Object.entries(cur.items || {})) {
          const ls = it.lists || [];
          const next = fn(ls);
          items[id] = next === ls ? it : Object.assign({}, it, { lists: next, updatedAt: U.nowIso() });
        }
        return { items };
      });
    V.sheet({
      title: L('رفوفي', 'My shelves', 'رفوفي'),
      html: lists.length
        ? `<p class="muted">${L('الرفوف دي بتعملها بنفسك: «كلاسيكيات»، «عايز أعيده»، «سلسلة كذا»… تحط فيها أي كتاب من صفحته.', 'Shelves you make yourself — “Classics”, “Re-read some day”… Put any book on one from its page.', 'رفوف تصنعها بنفسك: «كلاسيكيات»، «أريد إعادته»… ضع أي كتاب عليها من صفحته.')}</p>
          <ul class="lists-edit">${lists.map(([n, c]) => `<li><span dir="auto">${esc(n)}</span><small>${L.count(c, 'book')}</small><button class="ib sm" data-ren="${esc(n)}" aria-label="${L('غيّر الاسم', 'Rename', 'أعد التسمية')}">${icon('edit')}</button><button class="ib sm" data-rm="${esc(n)}" aria-label="${L('امسح الرف', 'Delete shelf', 'احذف الرف')}">${icon('trash')}</button></li>`).join('')}</ul>`
        : V.empty(L('لسه معندكش رفوف', 'No shelves yet', 'لا رفوف بعد'), L('افتح أي كتاب في مكتبتك ودوس «عدّل»، وتحت «رفوفي» اكتب اسم رف جديد.', 'Open any book on your shelf, tap Edit, and type a new shelf name under “My shelves”.', 'افتح أي كتاب في مكتبتك واضغط «عدّل»، ثم اكتب اسم رف جديد تحت «رفوفي».')),
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          const r = e.target.closest('[data-ren]');
          const d = e.target.closest('[data-rm]');
          if (r) {
            const old = r.dataset.ren;
            const name = await V.ask(L('الاسم الجديد للرف', 'New name for the shelf', 'الاسم الجديد للرف'), old);
            if (!name || name === old) return;
            api.close();
            await rewrite((ls) => (ls.includes(old) ? [...new Set(ls.map((x) => (x === old ? name : x)))] : ls));
            U.toast(L('اتغيّر اسم الرف', 'Shelf renamed', 'تمت إعادة تسمية الرف'));
          }
          if (d) {
            const old = d.dataset.rm;
            if (!(await V.confirm(L(`هتمسح رف «${esc(old)}». الكتب نفسها هتفضل في مكتبتك.`, `Delete the “${esc(old)}” shelf? The books stay on your shelf.`, `ستحذف رف «${esc(old)}». تبقى الكتب نفسها في مكتبتك.`), L('امسحه', 'Delete', 'احذفه'), true))) return;
            api.close();
            await rewrite((ls) => (ls.includes(old) ? ls.filter((x) => x !== old) : ls));
          }
        }),
    });
  };
  /* A one-line question in a sheet; resolves to the text, or null. */
  V.ask = V.ask || ((label, value = '') =>
    new Promise((res) => {
      let done = false;
      const api = V.sheet({
        title: label,
        html: `<form class="form" id="ask-f"><input id="ask-v" maxlength="40" dir="auto" value="${esc(value)}" autofocus><div class="row-btns end"><button class="btn gold">${icon('check')}${L('تمام', 'OK', 'حسنًا')}</button></div></form>`,
        onMount: (body) =>
          body.addEventListener('submit', (e) => {
            e.preventDefault();
            done = true;
            const v = body.querySelector('#ask-v').value.trim();
            api.close();
            res(v || null);
          }),
      });
      api.onClose = () => !done && res(null);
    }));

  V.actions['shelf-of'] = (a) => V.go('shelf', { uid: a.dataset.uid });
  V.actions['shelf-tab'] = (a) => V.go('shelf', { uid: a.dataset.uid, st: a.dataset.st, sort: (V.state.opts || {}).sort });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'sh-q' || V.state.route !== 'shelf') return;
    V.state.opts = Object.assign({}, V.state.opts, { q: e.target.value, n: 0 });
    V.render();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'sh-sort' || V.state.route !== 'shelf') return;
    V.state.opts = Object.assign({}, V.state.opts, { sort: e.target.value, n: 0 });
    V.render();
  });
  V.actions['shelf-add'] = () => V.shelfForm();
  V.actions['bulk-shelf'] = () => V.bulkShelf();
  V.actions['shelf-more'] = () =>
    V.menu([
      { ic: 'list', t: L('ضيف كذا كتاب مرة واحدة', 'Add many at once', 'أضف عدة كتب دفعة واحدة'), fn: () => V.bulkShelf() },
      { ic: 'download', t: L('استورد من Goodreads', 'Import from Goodreads'), fn: () => V.importShelf() },
      { ic: 'layers', t: L('رفوفي', 'My shelves', 'رفوفي'), fn: () => V.manageLists() },
      ...V.menuItems('shelf', { uid: S.me }),
    ]);
  V.actions['shelf-item'] = (a) => {
    const uid = (V.state.opts && V.state.opts.uid) || S.me;
    const it = V.shelfItems(uid).find((x) => x.id === a.dataset.id);
    if (it) V.shelfDetail(uid, it);
  };

  V.saveShelfItem = async (id, item) => {
    if (!D.canWrite()) return;
    const iid = id || D.newId();
    const isNew = !id || String(id).startsWith('tg-');
    const realId = String(iid).startsWith('tg-') ? D.newId() : iid;
    const prev = id && S.shelf.get(S.me) && S.shelf.get(S.me).items ? S.shelf.get(S.me).items[id] : null;
    await D.mutate(`shelf/${S.me}`, () => {
      const cur = S.shelf.get(S.me) || {};
      const items = Object.assign({}, cur.items || {});
      const base = items[realId] || {};
      items[realId] = V.clean(Object.assign({}, base, item, { at: base.at || U.nowIso(), updatedAt: U.nowIso() }));
      return { items };
    });
    const gain = (isNew && item.status === 'read' ? G.XP.shelf : 0) + (item.review && item.review.length >= 20 && !(prev && prev.review && prev.review.length >= 20) ? G.XP.review : 0);
    U.chime('soft');
    if (gain) U.xpPop(gain, L('مكتبتي', 'My shelf'));
    else U.toast(L('اتحفظ في مكتبتك', 'Saved to your shelf', 'تم الحفظ في مكتبتك'));
  };

  V.shelfForm = (it = null) => {
    const v = it || { status: 'read', rating: 0, tags: [] };
    V.sheet({
      title: it ? L('عدّل الكتاب', 'Edit book') : L('ضيف كتاب لمكتبتك', 'Add a book to your shelf', 'أضف كتابًا إلى مكتبتك'),
      html: `${A.B ? A.B.box('sf-bs') : ''}<form id="sf-form" class="form">
        ${A.B ? A.B.coverField('sf-cover', v.cover, v.title) : ''}
        <label for="sf-title">${L('اسم الكتاب', 'Title')}</label><input id="sf-title" required maxlength="140" dir="auto" value="${esc(v.title || '')}" autofocus>
        <label for="sf-author">${L('المؤلف', 'Author')}</label><input id="sf-author" maxlength="100" dir="auto" value="${esc(v.author || '')}">
        <span class="lbl">${L('الحالة', 'Status')}</span>
        <div class="seg-pick">${Object.entries(STATUS).map(([k, t]) => `<label class="sp${v.status === k ? ' on' : ''}"><input type="radio" name="sf-status" value="${k}" ${v.status === k ? 'checked' : ''}><span>${L(...t)}</span></label>`).join('')}</div>
        <div class="grid2"><div><label for="sf-fin">${L('خلّصته إمتى؟', 'Finished when?', 'متى أنهيته؟')}</label><input id="sf-fin" type="month" value="${esc(v.finished && v.finished.length === 7 ? v.finished : '')}"></div>
          <div><label for="sf-pages">${L('عدد الصفحات', 'Pages')}</label><input id="sf-pages" type="number" min="0" max="20000" value="${esc(v.pages || '')}"></div></div>
        <span class="lbl">${L('تقييمك', 'Your rating')}</span>${V.stars(v.rating || 0, true, 'sf-stars')}
        <label for="sf-review">${L('رأيك في الكتاب', 'Your review')} <small class="muted">(+${L.num(G.XP.review)} XP ${L('لو أكتر من سطر', 'if more than a line', 'إن كان أكثر من سطر')})</small></label><textarea id="sf-review" rows="3" maxlength="${U.MAX.review}" dir="auto">${esc(v.review || '')}</textarea>
        <span class="lbl">${L('تصنيف', 'Tags')}</span>
        <div class="chips wrap" id="sf-tags">${TAGS.map(([k]) => `<button type="button" class="chip${(v.tags || []).includes(k) ? ' on' : ''}" data-tag="${k}">${tagName(k)}</button>`).join('')}</div>
        <span class="lbl">${L('رفوفي', 'My shelves', 'رفوفي')} <small class="muted">${L('(اختياري: «كلاسيكيات»، «أعيده»…)', '(optional: “Classics”, “Re-read”…)', '(اختياري: «كلاسيكيات»، «أعيده»…)')}</small></span>
        <div class="chips wrap" id="sf-lists">${[...new Set([...V.shelfLists(S.me).map(([n]) => n), ...(v.lists || [])])].map((n) => `<button type="button" class="chip${(v.lists || []).includes(n) ? ' on' : ''}" data-list="${esc(n)}"><span dir="auto">${esc(n)}</span></button>`).join('')}
          <span class="sf-newlist"><input id="sf-list-new" maxlength="40" dir="auto" placeholder="${L('رف جديد…', 'New shelf…', 'رف جديد…')}" aria-label="${L('اسم رف جديد', 'New shelf name', 'اسم رف جديد')}"><button type="button" class="chip" data-addlist aria-label="${L('ضيف الرف', 'Add shelf', 'أضف الرف')}">${icon('plus')}</button></span></div>
        <div class="row-btns end"><button class="btn gold">${icon('check')}${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) => {
        V.bindStars(body);
        if (A.B) {
          const title = () => body.querySelector('#sf-title').value;
          A.B.bindCover(body, 'sf-cover', title);
          A.B.bind(body, 'sf-bs', (b) => {
            body.querySelector('#sf-title').value = b.title;
            body.querySelector('#sf-author').value = b.author;
            if (b.pages) body.querySelector('#sf-pages').value = b.pages;
            if (b.cover) A.B.setCover(body, 'sf-cover', b.cover, b.title);
            body.querySelector('#sf-title').focus();
          });
        }
        const addList = () => {
          const inp = body.querySelector('#sf-list-new');
          const n = inp.value.trim().slice(0, 40);
          if (!n) return;
          let chip = [...body.querySelectorAll('#sf-lists [data-list]')].find((x) => x.dataset.list === n);
          if (!chip) {
            chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.dataset.list = n;
            chip.innerHTML = `<span dir="auto">${esc(n)}</span>`;
            body.querySelector('.sf-newlist').before(chip);
          }
          chip.classList.add('on');
          inp.value = '';
        };
        body.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tag]');
          if (t) t.classList.toggle('on');
          const l = e.target.closest('[data-list]');
          if (l) l.classList.toggle('on');
          if (e.target.closest('[data-addlist]')) addList();
        });
        body.addEventListener('keydown', (e) => {
          if (e.target.id === 'sf-list-new' && e.key === 'Enter') {
            e.preventDefault();
            addList();
          }
        });
        body.addEventListener('change', () => body.querySelectorAll('.seg-pick .sp').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)));
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = body.querySelector('#sf-title').value.trim();
          if (!title) return;
          const item = {
            title,
            author: body.querySelector('#sf-author').value.trim(),
            status: (body.querySelector('input[name=sf-status]:checked') || {}).value || 'read',
            finished: body.querySelector('#sf-fin').value || (it && it.finished) || '',
            pages: +body.querySelector('#sf-pages').value || 0,
            rating: +body.querySelector('#sf-stars').dataset.v || 0,
            review: body.querySelector('#sf-review').value.trim(),
            tags: [...body.querySelectorAll('#sf-tags .chip.on')].map((x) => x.dataset.tag),
            lists: [...new Set([...body.querySelectorAll('#sf-lists .chip.on')].map((x) => x.dataset.list).concat(body.querySelector('#sf-list-new').value.trim() ? [body.querySelector('#sf-list-new').value.trim().slice(0, 40)] : []))],
          };
          if (A.B) item.cover = A.B.coverValue(body, 'sf-cover');
          if (it && it.together) item.together = it.together;
          if (!it) {
            const k = A.Imp.key(item.title, item.author);
            const dup = V.shelfItems(S.me).find((x) => A.Imp.key(x.title, x.author) === k);
            if (dup && !(await V.confirm(L(`«${esc(dup.title)}» موجود في مكتبتك (${esc(L(...STATUS[dup.status]))}). تضيفه تاني؟`, `“${esc(dup.title)}” is already on your shelf (${esc(STATUS[dup.status][1])}). Add it again?`, `«${esc(dup.title)}» موجود في مكتبتك (${esc(L(...STATUS[dup.status]))}). هل تضيفه مرة أخرى؟`), L('ضيفه', 'Add it', 'أضفه')))) return;
          }
          api.close();
          await V.saveShelfItem(it ? it.id : null, item);
        });
      },
    });
  };

  V.bulkShelf = () => {
    V.sheet({
      title: L('ضيف الكتب اللي قريتها', 'Add books you have read', 'أضف الكتب التي قرأتها'),
      html: `<p class="muted">${L('اكتب كل كتاب في سطر. لو عايز تكتب المؤلف حطه بعد شرطة: «العنوان - المؤلف».', 'One book per line. Add the author after a dash: “Title - Author”.', 'اكتب كل كتاب في سطر. لإضافة المؤلف ضعه بعد شرطة: «العنوان - المؤلف».')}</p>
        <textarea id="bulk-text" rows="8" dir="auto" autofocus placeholder="${L('ثلاثية غرناطة - رضوى عاشور\nعبقرية عمر - العقاد\nالأيام - طه حسين', 'Atomic Habits - James Clear\nSapiens - Yuval Noah Harari')}"></textarea>
        <div class="grid2"><div><label for="bulk-status">${L('الحالة', 'Status')}</label><select id="bulk-status"><option value="read">${L('قرأته', 'Read')}</option><option value="want">${L('عايز أقرأه', 'Want to read', 'أريد قراءته')}</option></select></div><div><label for="bulk-year">${L('سنة القراية (اختياري)', 'Year read (optional)', 'سنة القراءة (اختياري)')}</label><input id="bulk-year" type="number" min="1950" max="2100" placeholder="${new Date().getFullYear()}"></div></div>
        <p class="muted sm" id="bulk-count"></p>
        <div class="row-btns end"><button class="btn gold" data-bulk>${icon('check')}${L('ضيفهم', 'Add them', 'أضفها')}</button></div>`,
      onMount: (body, api) => {
        const parse = () =>
          body
            .querySelector('#bulk-text')
            .value.split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 200)
            .map((l) => {
              const m = l.split(/\s+[-–—|]\s+/);
              return { title: m[0].trim().slice(0, 140), author: (m[1] || '').trim().slice(0, 100) };
            });
        body.addEventListener('input', () => {
          const n = parse().length;
          const st = body.querySelector('#bulk-status').value;
          body.querySelector('#bulk-count').textContent = n ? L(`${L.count(n, 'book')}${st === 'read' ? ` • +${L.num(n * G.XP.shelf)} XP` : ''}`, `${n} books${st === 'read' ? ` • +${n * G.XP.shelf} XP` : ''}`) : '';
        });
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-bulk]')) return;
          const rows = parse();
          if (!rows.length) return;
          const status = body.querySelector('#bulk-status').value;
          const y = body.querySelector('#bulk-year').value;
          api.close();
          const t = U.nowIso();
          await D.mutate(`shelf/${S.me}`, () => {
            const cur = S.shelf.get(S.me) || {};
            const items = Object.assign({}, cur.items || {});
            for (const r of rows) items[D.newId()] = { title: r.title, author: r.author, status, finished: y ? String(y) : '', rating: 0, review: '', tags: [], pages: 0, at: t, updatedAt: t };
            return { items };
          });
          U.chime('ok');
          if (status === 'read') U.xpPop(rows.length * G.XP.shelf, L.count(rows.length, 'book'));
          V.go('shelf', { st: status });
        });
      },
    });
  };

  V.shelfDetail = (uid, it) => {
    const mine = uid === S.me;
    const book = it.together ? S.books.get(it.together) : null;
    // Others in the circle with the same book on their shelf (or finished together).
    const k = A.Imp.key(it.title, it.author);
    const others = D.memberIds()
      .filter((u) => u !== uid)
      .map((u) => ({ u, x: V.shelfItems(u).find((y) => A.Imp.key(y.title, y.author) === k) }))
      .filter((o) => o.x);
    const month = U.today().slice(0, 7);
    V.sheet({
      title: L(...STATUS[it.status]),
      html: `<div class="sd">${book ? V.cover(book, 'md') : V.coverOf ? V.coverOf(it, 'md') : V.genCover(it.title, it.author, 'md')}
        <div class="sd-info"><h2 dir="auto">${esc(it.title)}</h2>${it.author ? `<p class="muted" dir="auto">${esc(it.author)}</p>` : ''}
          ${it.rating ? V.stars(it.rating) : ''}
          <div class="meta-chips">${it.finished ? `<span>${icon('calendar')}${it.finished.length === 4 ? L.num(+it.finished, { useGrouping: false }) : L.monthYear(it.finished)}</span>` : ''}${it.pages ? `<span>${icon('scroll')}${L.count(+it.pages, 'page')}</span>` : ''}${it.together ? `<span class="gold-t">${icon('users')}${L('قرأناه سوا', 'Read together', 'قرأناه معًا')}</span>` : ''}${(it.tags || []).map((t) => `<span>${tagName(t)}</span>`).join('')}${(it.lists || []).map((n) => `<span class="sd-list">${icon('layers')}<span dir="auto">${esc(n)}</span></span>`).join('')}</div>
          ${it.reads && it.reads.length ? `<p class="sd-reads">${icon('refresh')}${L(`قريته ${L.num(it.reads.length + 1)} مرات`, `Read ${it.reads.length + 1} times`, `قرأته ${L.num(it.reads.length + 1)} مرات`)}<small>${[...it.reads.map((r) => r.finished), it.finished].filter(Boolean).map((f2) => (f2.length === 4 ? L.num(+f2, { useGrouping: false }) : L.monthYear(f2))).join(' • ')}</small></p>` : ''}
        </div></div>
        ${it.review ? `<blockquote class="review" dir="auto">${esc(it.review)}</blockquote>` : ''}
        ${mine && D.canWrite() && !it.virtual ? `<div class="sd-move">${it.status === 'want' ? `<button class="btn" data-move="reading">${icon('play', 'flip-rtl')}${L('بدأت أقرأه', 'Started it', 'بدأت قراءته')}</button>` : ''}${it.status === 'dnf' ? `<button class="btn" data-move="reading">${icon('play', 'flip-rtl')}${L('رجعت أقرأه', 'Reading it again', 'عدت إلى قراءته')}</button>` : ''}${it.status === 'want' || it.status === 'reading' ? `<button class="btn gold" data-move="read">${icon('check')}${L('خلّصته', 'Finished it', 'أنهيته')}</button>` : ''}${it.status === 'reading' ? `<button class="btn ghost" data-move="dnf">${icon('close')}${L('سبته', 'Didn’t finish', 'لم أكمله')}</button>` : ''}${it.status === 'read' ? `<button class="btn ghost" data-reread>${icon('refresh')}${L('قريته تاني', 'Read it again', 'قرأته مرة أخرى')}</button>` : ''}</div>` : ''}
        ${others.length ? `<div class="sd-others"><h4>${L('في الحلقة', 'In the circle')}</h4>${others
          .map((o) => `<button class="sd-o" data-act="shelf-of" data-uid="${esc(o.u)}">${D.avatar(o.u, 'sm')}<span><b>${esc(D.name(o.u))}</b><small>${esc(L(...STATUS[o.x.status]))}${o.x.together ? ` • ${L('مع الحلقة', 'with the circle')}` : ''}</small></span>${o.x.rating ? V.stars(o.x.rating) : ''}</button>`)
          .join('')}</div>` : ''}
        <div class="row-btns">
          ${mine && D.canWrite() ? `<button class="btn" data-edit>${icon('edit')}${it.virtual ? L('قيّم الكتاب', 'Rate it') : L('عدّل', 'Edit')}</button>${!it.virtual ? `<button class="btn ghost" data-del>${icon('trash')}${L('شيله', 'Remove', 'احذفه')}</button>` : ''}` : ''}
          ${!mine && D.canWrite() ? `<button class="btn" data-want>${icon('bookmark')}${L('عايز أقرأه', 'I want to read it', 'أريد قراءته')}</button>` : ''}
          ${D.canWrite() && !it.together ? `<button class="btn ghost" data-prop>${icon('vote')}${L('اقترحه على الحلقة', 'Suggest to the circle')}</button>` : ''}
        </div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          const mv = e.target.closest('[data-move]');
          if (mv) {
            api.close();
            const status = mv.dataset.move;
            await V.saveShelfItem(it.id, status === 'read' ? { status, finished: it.finished || month } : status === 'reading' ? { status, started: it.started || U.today() } : { status });
            if (status === 'read') {
              setTimeout(() => V.shelfForm(Object.assign({}, it, { status: 'read', finished: it.finished || month })), 500); // rate and review while it is fresh
            }
            return;
          }
          if (e.target.closest('[data-reread]')) {
            api.close();
            V.reread(it);
            return;
          }
          if (e.target.closest('.sd-o')) api.close();
          if (e.target.closest('[data-edit]')) {
            api.close();
            V.shelfForm(it);
          }
          if (e.target.closest('[data-del]')) {
            if (!(await V.confirm(L(`هتشيل «${esc(it.title)}» من مكتبتك.`, `Remove “${esc(it.title)}” from your shelf?`, `ستحذف «${esc(it.title)}» من مكتبتك.`), L('شيله', 'Remove', 'احذفه'), true))) return;
            api.close();
            await D.mutate(`shelf/${S.me}`, () => {
              const cur = S.shelf.get(S.me) || {};
              const items = Object.assign({}, cur.items || {});
              delete items[it.id];
              return { items };
            });
          }
          if (e.target.closest('[data-want]')) {
            api.close();
            await V.saveShelfItem(null, { title: it.title, author: it.author || '', status: 'want', rating: 0, review: '', tags: it.tags || [], pages: +it.pages || 0, cover: it.cover || '', from: uid });
          }
          if (e.target.closest('[data-prop]')) {
            api.close();
            V.propose({ title: it.title, author: it.author, cover: it.cover || '' });
          }
        }),
    });
  };

  /* Read it again: the earlier finish goes into its history and the new one becomes the date shown. */
  V.reread = (it) => {
    const month = U.today().slice(0, 7);
    V.sheet({
      title: L('قريته تاني', 'Read it again', 'قرأته مرة أخرى'),
      html: `<form class="form" id="rr-f"><p class="muted" dir="auto">${esc(it.title)}</p><label for="rr-m">${L('خلّصته المرة دي إمتى؟', 'When did you finish it this time?', 'متى أنهيته هذه المرة؟')}</label><input id="rr-m" type="month" value="${month}" max="${month}">
        <div class="row-btns end"><button class="btn gold">${icon('check')}${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) =>
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const m2 = body.querySelector('#rr-m').value || month;
          api.close();
          const reads = [...(it.reads || [])];
          if (it.finished) reads.push({ finished: it.finished });
          await V.saveShelfItem(it.id, { status: 'read', finished: m2, reads });
          U.toast(L(`قريته ${L.num(reads.length + 1)} مرات 👏`, `Read ${reads.length + 1} times 👏`, `قرأته ${L.num(reads.length + 1)} مرات 👏`));
        }),
    });
  };

  V.actions['set-goal'] = () => {
    const year = String(new Date().getFullYear());
    const m = S.members.get(S.me) || {};
    const cur = (m.goal && m.goal[year]) || 12;
    V.sheet({
      title: L(`هدف ${L.num(+year, { useGrouping: false })}`, `${year} goal`),
      html: `<form id="goal-form" class="form"><label for="goal-n">${L('عايز تقرأ كام كتاب السنة دي؟', 'How many books this year?', 'كم كتابًا تريد أن تقرأ هذا العام؟')}</label>
        <div class="stepper"><button type="button" class="ib" data-d="-1" aria-label="-">−</button><input id="goal-n" type="number" min="1" max="365" value="${cur}"><button type="button" class="ib" data-d="1" aria-label="+">+</button></div>
        <div class="chips">${[6, 12, 24, 52].map((n) => `<button type="button" class="chip" data-n="${n}">${L.num(n)}</button>`).join('')}</div>
        <div class="row-btns end"><button class="btn gold">${icon('target')}${L('احفظ الهدف', 'Save goal')}</button></div></form>`,
      onMount: (body, api) => {
        const inp = body.querySelector('#goal-n');
        body.addEventListener('click', (e) => {
          const d = e.target.closest('[data-d]');
          if (d) inp.value = U.clamp((+inp.value || 0) + +d.dataset.d, 1, 365);
          const n = e.target.closest('[data-n]');
          if (n) inp.value = n.dataset.n;
        });
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const n = U.clamp(+inp.value || 12, 1, 365);
          api.close();
          await D.updateMe((m2) => ({ goal: Object.assign({}, m2.goal || {}, { [year]: n }) }));
          U.toast(L(`هدفك ${L.count(n, 'book')} السنة دي. يلا!`, `Goal set: ${n} books this year. Go!`, `هدفك ${L.count(n, 'book', 'nom')} هذا العام. هيا!`));
        });
      },
    });
  };
})();
