/* «أنا»: reading stats (bars for the last 30 days, 12 weeks or this year, plus a few numbers) on every member's
   profile, and «دفتر اقتباساتي»: everything I wrote in the books (shared and private), searchable, in one place. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;

  /* ================= reading stats ================= */

  const PERIODS = ['d30', 'w12', 'yr'];
  const METRICS = { d30: ['pages', 'time'], w12: ['pages', 'time'], yr: ['books', 'pages'] };
  let period = U.store.get('meStatsP', 'd30');
  if (!PERIODS.includes(period)) period = 'd30';
  let metric = U.store.get('meStatsM', 'pages');
  let sel = -1; // the bar tapped (its readout shows instead of the total)
  let selUid = null;

  const lf = {};
  const dfmt = (opts) => {
    const k = L.lang() + L.digits() + JSON.stringify(opts);
    lf[k] = lf[k] || new Intl.DateTimeFormat(L.lang() === 'en' ? 'en-GB' : L.digits() === 'latn' ? 'ar-EG-u-nu-latn' : 'ar-EG', opts);
    return lf[k];
  };
  const monthShort = (ym) => dfmt({ month: 'short' }).format(U.parseD(ym + '-01'));
  const weekdayLong = (wd) => dfmt({ weekday: 'long' }).format(new Date(2026, 0, 4 + wd)); // 4 Jan 2026 is a Sunday
  const clampPages = (n) => Math.max(0, Math.min(2000, +n || 0));
  const clampSecs = (n) => Math.max(0, Math.min(86400, +n || 0));

  /* Finishes in a year by month (re-reads count too); 'YYYY' finishes have no month. */
  function booksByMonth(uid, year) {
    const months = new Array(12).fill(0);
    let noMonth = 0;
    const add = (f) => {
      f = String(f || '');
      if (!f.startsWith(year)) return;
      const m = +f.slice(5, 7);
      if (m >= 1 && m <= 12) months[m - 1]++;
      else noMonth++;
    };
    for (const it of V.shelfItems(uid)) {
      if (it.status !== 'read') continue;
      add(it.finished);
      if (Array.isArray(it.reads)) for (const r of it.reads) r && add(r.finished);
    }
    return { months, noMonth };
  }

  /* All the numbers for one member (pure: also used by the tests). */
  V.readingStats = (uid) => {
    const m = S.members.get(uid) || {};
    const days = {}, secs = {};
    for (const [k, n] of Object.entries(m.days || {})) if (clampPages(n)) days[k] = clampPages(n);
    for (const [k, n] of Object.entries(m.secs || {})) if (clampSecs(n)) secs[k] = clampSecs(n);
    const s = G.of(uid);
    const today = U.today();
    const keys = Object.keys(days);
    const pages = keys.reduce((t, k) => t + days[k], 0);
    // speed: only days with both pages and time recorded, and at least half an hour of them
    let tp = 0, ts = 0;
    for (const k of keys) if (secs[k]) (tp += days[k]), (ts += secs[k]);
    const speed = ts >= 1800 && tp ? Math.round(tp / (ts / 3600)) : 0;
    let bestDay = null;
    for (const k of keys) if (!bestDay || days[k] > bestDay.n || (days[k] === bestDay.n && k > bestDay.k)) bestDay = { k, n: days[k] };
    const wd = new Array(7).fill(0);
    for (const k of keys) wd[U.parseD(k).getDay()] += days[k];
    const top = Math.max(...wd);
    const busiest = top ? wd.indexOf(top) : -1;
    const d30 = [];
    for (let i = 29; i >= 0; i--) {
      const k = U.addDays(today, -i);
      d30.push({ k, pages: days[k] || 0, secs: secs[k] || 0 });
    }
    const w12 = [];
    const wk = U.weekStart(today);
    for (let i = 11; i >= 0; i--) {
      const k = U.addDays(wk, -7 * i);
      let p = 0, t = 0;
      for (let d = 0; d < 7; d++) {
        const dk = U.addDays(k, d);
        p += days[dk] || 0;
        t += secs[dk] || 0;
      }
      w12.push({ k, pages: p, secs: t });
    }
    const year = today.slice(0, 4);
    const bm = booksByMonth(uid, year);
    const yr = [];
    for (let i = 0; i < 12; i++) {
      const k = year + '-' + String(i + 1).padStart(2, '0');
      let p = 0;
      for (const d of keys) if (d.startsWith(k)) p += days[d];
      yr.push({ k, pages: p, books: bm.months[i], future: k > today.slice(0, 7) });
    }
    return {
      pages, daysRead: keys.length, avg: keys.length ? Math.round(pages / keys.length) : 0, speed, bestDay,
      streakBest: s.best || 0, busiest, d30, w12, yr, year, noMonth: bm.noMonth, booksYear: bm.months.reduce((a, b) => a + b, 0) + bm.noMonth,
    };
  };

  const valOf = (row, met) => (met === 'time' ? Math.round(row.secs / 60) : met === 'books' ? row.books : row.pages);
  const fmtVal = (row, met) => (met === 'time' ? L.duration(row.secs) : met === 'books' ? L.count(row.books, 'book') : L.count(row.pages, 'page'));
  const rowLabel = (row, per) =>
    per === 'd30' ? (row.k === U.today() ? L('النهارده', 'Today', 'اليوم') + ' • ' + L.dayShort(row.k) : L.day(row.k))
      : per === 'w12' ? (row.k === U.weekStart() ? L('الأسبوع ده', 'This week', 'هذا الأسبوع') : L(`أسبوع ${L.dayShort(row.k)}`, `Week of ${L.dayShort(row.k)}`, `أسبوع ${L.dayShort(row.k)}`))
        : L.monthYear(row.k);

  function totalLine(st, per, met) {
    const rows = st[per];
    if (met === 'books') {
      return L(`${L.count(st.booksYear, 'book')} في ${L.num(+st.year, { useGrouping: false })}`, `${L.count(st.booksYear, 'book')} in ${st.year}`, `${L.count(st.booksYear, 'book')} في ${L.num(+st.year, { useGrouping: false })}`) +
        (st.noMonth ? ' • ' + L(`${L.num(st.noMonth)} من غير شهر`, `${st.noMonth} without a month`, `${L.num(st.noMonth)} دون شهر`) : '');
    }
    const span = per === 'd30' ? L('آخر ٣٠ يوم', 'Last 30 days', 'آخر ٣٠ يومًا') : per === 'w12' ? L('آخر ١٢ أسبوع', 'Last 12 weeks', 'آخر ١٢ أسبوعًا') : L(`سنة ${L.num(+st.year, { useGrouping: false })}`, String(st.year), `عام ${L.num(+st.year, { useGrouping: false })}`);
    if (met === 'time') {
      const t = rows.reduce((a, r) => a + r.secs, 0);
      return `${span}: ${esc(L.duration(t))}`;
    }
    const p = rows.reduce((a, r) => a + r.pages, 0);
    let extra = '';
    if (per === 'd30') {
      const n = rows.filter((r) => r.pages).length;
      if (n) extra = ' • ' + L(`${L.count(n, 'day')} قراية`, `${n} reading ${n === 1 ? 'day' : 'days'}`, `${L.count(n, 'day')} قراءة`);
    }
    return `${span}: ${L.count(p, 'page')}${extra}`;
  }

  function chart(st, per, met) {
    const rows = st[per];
    const vals = rows.map((r) => valOf(r, met));
    const max = Math.max(0, ...vals);
    const color = met === 'time' ? 'jade' : met === 'books' ? 'gold' : 'lapis';
    const now = per === 'd30' ? U.today() : per === 'w12' ? U.weekStart() : U.today().slice(0, 7);
    const bars = rows
      .map((r, i) => {
        const v = vals[i];
        const h = max ? Math.max(v ? 4 : 0, Math.round((v / max) * 100)) : 0;
        const tip = `${rowLabel(r, per)}: ${fmtVal(r, met)}`;
        return `<button type="button" class="mst-bar${v ? '' : ' zero'}${r.future ? ' future' : ''}${r.k === now ? ' now' : ''}${i === sel ? ' on' : ''}" data-act="mst-bar" data-i="${i}" data-v="${v}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${r.future ? 'disabled' : ''}><i style="height:${h}%"></i>${met === 'books' && v ? `<small>${L.num(v)}</small>` : ''}</button>`;
      })
      .join('');
    let axis;
    if (per === 'd30') axis = [L.dayShort(rows[0].k), L.dayShort(rows[15].k), L('النهارده', 'Today', 'اليوم')];
    else if (per === 'w12') axis = [L.dayShort(rows[0].k), L.dayShort(rows[6].k), L('الأسبوع ده', 'This week', 'هذا الأسبوع')];
    else axis = rows.map((r, i) => (i % 3 === 0 ? monthShort(r.k) : ''));
    const total = totalLine(st, per, met);
    const read = sel >= 0 && rows[sel] && !rows[sel].future ? esc(`${rowLabel(rows[sel], per)}: ${fmtVal(rows[sel], met)}`) : total;
    const maxLabel = max ? (met === 'time' ? L.duration(max * 60) : met === 'books' ? L.count(max, 'book') : L.count(max, 'page')) : '';
    return `<p class="mst-read" id="mst-read" aria-live="polite" data-total="${esc(total)}">${read}</p>
      <div class="mst-chart ${color}${per === 'yr' ? ' yr' : ''}" data-per="${per}">
        ${max ? `<span class="mst-max">${esc(maxLabel)}</span>` : `<span class="mst-none">${L('مفيش حاجة في الفترة دي', 'Nothing in this period', 'لا شيء في هذه الفترة')}</span>`}
        <div class="mst-bars" role="group" aria-label="${L('الأعمدة', 'Bars')}">${bars}</div>
      </div>
      <div class="mst-axis${per === 'yr' ? ' yr' : ''}">${axis.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
  }

  function statsCard(ctx) {
    const uid = ctx.uid;
    if (uid !== selUid) (selUid = uid), (sel = -1);
    const st = V.readingStats(uid);
    const mets = METRICS[period];
    const met = mets.includes(metric) ? metric : mets[0];
    const metName = { pages: L('صفحات', 'Pages'), time: L('وقت', 'Time'), books: L('كتب', 'Books') };
    const perName = { d30: L('٣٠ يوم', '30 days', '٣٠ يومًا'), w12: L('١٢ أسبوع', '12 weeks', '١٢ أسبوعًا'), yr: L('السنة دي', 'This year', 'هذا العام') };
    const seg = (act, cur, opts, label) => `<div class="seg sm" role="group" aria-label="${label}">${opts.map(([k, t]) => `<button type="button" class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${t}</button>`).join('')}</div>`;
    const nums = [];
    nums.push(['avg', L.num(st.avg), L('صفحة في يوم القراية (متوسط)', 'pages per reading day (avg)', 'صفحة في يوم القراءة (متوسط)')]);
    if (st.speed) nums.push(['speed', L.num(st.speed), L('صفحة في الساعة', 'pages an hour', 'صفحة في الساعة')]);
    if (st.bestDay) nums.push(['best', L.num(st.bestDay.n), L(`أحسن يوم • ${L.dayShort(st.bestDay.k)}`, `best day • ${L.dayShort(st.bestDay.k)}`, `أفضل يوم • ${L.dayShort(st.bestDay.k)}`)]);
    nums.push(['streak', L.num(st.streakBest), L('أطول سلسلة (يوم)', 'longest streak (days)', 'أطول سلسلة (أيام)')]);
    if (st.busiest >= 0) nums.push(['wday', esc(weekdayLong(st.busiest)), L('أنشط يوم في الأسبوع', 'busiest weekday', 'أنشط أيام الأسبوع')]);
    return `<section class="card mst" id="me-stats" data-uid="${esc(uid)}">
      <header class="sec-h"><h2>${icon('target')}${L('إحصائيات القراية', 'Reading stats', 'إحصاءات القراءة')}</h2>
        ${seg('mst-period', period, PERIODS.map((k) => [k, perName[k]]), L('الفترة', 'Period'))}</header>
      <div class="mst-sub">${seg('mst-metric', met, mets.map((k) => [k, metName[k]]), L('المقياس', 'Measure'))}</div>
      ${chart(st, period, met)}
      <div class="mst-nums">${nums.map(([k, n, t]) => `<div class="mst-n" data-k="${k}"><b>${n}</b><small>${t}</small></div>`).join('')}</div>
    </section>`;
  }

  V.addSection('me', { order: 20, render: statsCard });

  V.actions['mst-period'] = (a) => {
    if (period === a.dataset.v) return;
    period = a.dataset.v;
    metric = METRICS[period][0]; // a new period starts on its main measure: pages, or books for the year
    sel = -1;
    U.store.set('meStatsP', period);
    U.store.set('meStatsM', metric);
    V.render();
  };
  V.actions['mst-metric'] = (a) => {
    metric = a.dataset.v;
    sel = -1;
    U.store.set('meStatsM', metric);
    V.render();
  };
  function showBar(b) {
    const card = b && b.closest('.mst');
    if (!card || b.disabled) return;
    const i = +b.dataset.i;
    const again = i === sel && b.classList.contains('on');
    sel = again ? -1 : i;
    card.querySelectorAll('.mst-bar.on').forEach((x) => x.classList.remove('on'));
    if (!again) b.classList.add('on');
    const r = card.querySelector('#mst-read');
    if (r) r.textContent = again ? r.dataset.total : b.dataset.tip;
  }
  V.actions['mst-bar'] = (b) => showBar(b);
  // a mouse hovering, or a finger sliding along the bars, shows each value in passing (a tap keeps it)
  const peek = (b) => {
    const r = b && !b.disabled && b.closest('.mst') && b.closest('.mst').querySelector('#mst-read');
    if (r) r.textContent = b.dataset.tip;
  };
  const unpeek = (card) => {
    const r = card && card.querySelector('#mst-read');
    const on = card && card.querySelector('.mst-bar.on');
    if (r) r.textContent = on ? on.dataset.tip : r.dataset.total;
  };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !e.target.closest) return;
    const b = e.target.closest('.mst-bar');
    if (b) peek(b);
    else if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.mst-bar')) unpeek(e.relatedTarget.closest('.mst'));
  });
  let scrub = null;
  document.addEventListener('pointerdown', (e) => (scrub = e.pointerType !== 'mouse' && e.target.closest ? e.target.closest('.mst') : null));
  const endScrub = () => {
    if (scrub) unpeek(scrub);
    scrub = null;
  };
  document.addEventListener('pointerup', endScrub);
  document.addEventListener('pointercancel', endScrub);
  document.addEventListener('pointermove', (e) => {
    if (!scrub) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const b = el && el.closest('.mst-bar');
    if (b && scrub.contains(b)) peek(b);
  });

  /* ================= «دفتر اقتباساتي» ================= */

  const KINDS = ['quote', 'hl', 'note', 'q', 'take'];
  const KIND_IC = { hl: 'hl', note: 'note', q: 'question', quote: 'quote', take: 'sparkle' };
  const PAGE = 60;
  let shown = PAGE;
  const open = new Set(); // long texts unfolded
  const norm = (t) => A.Imp.key(String(t || ''), '').replace(/\|$/, '');
  const bookOf = (id) => (D.book ? D.book(id) : S.books.get(id)) || (S.gone && S.gone.get(id)) || null;

  /* Everything I wrote, newest first. */
  V.myQuotes = () => {
    const out = [];
    for (const n of S.notes.values()) if (n && n.by === S.me && n.b) out.push(Object.assign({}, n, { priv: false }));
    const pn = (S.priv && S.priv.notes) || {};
    for (const [id, n] of Object.entries(pn)) if (n && n.b) out.push(Object.assign({ id, by: S.me }, n, { priv: true }));
    out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return out;
  };

  V.addRoute('quotes', 'me');
  V.screens.quotes = (opts = {}) => {
    const all = V.myQuotes();
    const q = String(opts.q || '');
    const qn = norm(q.trim());
    const kind = KINDS.includes(opts.k) ? opts.k : '';
    const bk = opts.bk || '';
    const kc = {}, bc = new Map();
    for (const n of all) {
      kc[n.kind || 'note'] = (kc[n.kind || 'note'] || 0) + 1;
      bc.set(n.b, (bc.get(n.b) || 0) + 1);
    }
    const list = all.filter((n) => {
      if (kind && (n.kind || 'note') !== kind) return false;
      if (bk && n.b !== bk) return false;
      if (!qn) return true;
      const b = bookOf(n.b);
      return norm((n.text || '') + ' ' + ((b && b.title) || '') + ' ' + ((b && b.author) || '')).includes(qn);
    });
    const head = `<button class="back" data-act="qn-back">${icon('back', 'flip')}<span>${L('أنا', 'Me')}</span></button>
      <header class="page-head"><h1>${L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي')}</h1><small class="muted">${L.count(all.length, 'note')}</small></header>`;
    if (!all.length) {
      return `<div class="quotes-page">${head}${V.empty(
        L('الدفتر لسه فاضي', 'Your notebook is empty', 'الدفتر فارغ بعد'),
        L('وإنت بتقرأ، دوس مطوّل على جملة عجبتك واختار «اقتباس» أو «ظلّل»، أو حط «ملاحظة» أو «سؤال». كل اللي بتكتبه في الكتب — حتى الخاص بيك لوحدك — هيتجمع هنا.', 'While reading, long-press a sentence you like and choose “Quote” or “Highlight”, or add a “Note” or “Question”. Everything you write in the books — even the private ones — gathers here.', 'أثناء القراءة، اضغط مطولًا على جملة أعجبتك واختر «اقتباس» أو «ظلّل»، أو أضف «ملاحظة» أو «سؤال». كل ما تكتبه في الكتب — حتى الخاص بك وحدك — يُجمع هنا.'),
        S.books.size ? `<div class="row-btns center"><button class="btn gold" data-go="books">${icon('books')}${L('روح لكتبنا', 'Go to Our books', 'اذهب إلى كتبنا')}</button></div>` : '',
      )}</div>`;
    }
    const chip = (act, v, cur, t, n) => `<button type="button" class="chip${cur === v ? ' on' : ''}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${cur === v}">${t}${n != null ? ` <small>${L.num(n)}</small>` : ''}</button>`;
    const kinds = KINDS.filter((k) => kc[k]);
    const books = [...bc.entries()].sort((a, b) => b[1] - a[1]);
    const items = list.slice(0, shown);
    return `<div class="quotes-page">${head}
      <div class="qn-tools">
        <label class="sh-search qn-search">${icon('search')}<input id="qn-q" type="search" dir="auto" value="${esc(q)}" placeholder="${L('دوّر في الكلام أو اسم الكتاب…', 'Search the text or a book title…', 'ابحث في النص أو عنوان الكتاب…')}" aria-label="${L('دوّر في الدفتر', 'Search the notebook', 'ابحث في الدفتر')}"></label>
        <div class="chips scroll qn-kinds" role="group" aria-label="${L('النوع', 'Kind')}">${chip('qn-kind', '', kind, L('الكل', 'All'), all.length)}${kinds.map((k) => chip('qn-kind', k, kind, V.kindLabel(k), kc[k])).join('')}</div>
        ${books.length > 1 ? `<div class="chips scroll qn-books" role="group" aria-label="${L('الكتاب', 'Book')}">${chip('qn-book', '', bk, L('كل الكتب', 'All books'))}${books.map(([b, n]) => chip('qn-book', b, bk, `<span dir="auto">${esc(((bookOf(b) || {}).title) || L('كتاب اتشال', 'Removed book', 'كتاب محذوف'))}</span>`, n)).join('')}</div>` : ''}
      </div>
      ${list.length ? `<p class="muted sm qn-count">${L.count(list.length, 'note')}</p>
      <div class="qn-list">${items.map(card).join('')}</div>
      ${list.length > shown ? `<div class="qn-sent" id="qn-sent" aria-hidden="true"></div>` : ''}` : V.empty(L('مفيش حاجة كده', 'Nothing matches', 'لا يوجد ما يطابق'), L('جرّب كلمة تانية أو شيل الفلتر.', 'Try another word or clear the filter.', 'جرّب كلمة أخرى أو أزل التصفية.'), `<div class="row-btns center"><button class="btn ghost" data-act="qn-clear">${L('شيل الفلتر', 'Clear filters', 'أزل التصفية')}</button></div>`)}
    </div>`;
  };

  function card(n) {
    const b = bookOf(n.b);
    const text = String(n.text || '');
    const long = text.length > 260 || text.split('\n').length > 6;
    const unfolded = open.has(n.id);
    const k = n.kind || 'note';
    return `<article class="qn k-${esc(k)}${n.priv ? ' priv' : ''}" data-key="qn-${esc(n.id)}">
      <button type="button" class="qn-main" data-act="qn-open" data-nid="${esc(n.id)}" data-priv="${n.priv ? '1' : ''}">
        <span class="qn-top"><span class="kind k-${esc(k)}">${icon(KIND_IC[k] || 'note')}${V.kindLabel(k)}</span>${n.priv ? `<span class="kind">${icon('lock')}${L('خاصة', 'Private')}</span>` : ''}<small class="qn-ago">${esc(L.ago(n.at))}</small></span>
        ${text ? `<span class="qn-text${long && !unfolded ? ' fold' : ''}" dir="auto">${esc(text)}</span>` : n.crop ? `<img class="qn-crop" src="${esc(n.crop)}" alt="">` : `<span class="qn-text muted">${L('تظليل من غير كلام', 'A highlight without words', 'تظليل دون نص')}</span>`}
        <span class="qn-src">${icon('books')}<b dir="auto">${esc((b && b.title) || L('كتاب اتشال', 'Removed book', 'كتاب محذوف'))}</b>${n.page ? `<span>• ${L('ص', 'p.')} ${L.num(n.page)}</span>` : ''}</span>
      </button>
      ${long ? `<button type="button" class="qn-more" data-act="qn-more" data-nid="${esc(n.id)}" aria-expanded="${unfolded}">${unfolded ? L('اقفل', 'Show less', 'أغلق') : L('اقرأ الباقي', 'Read the rest', 'اقرأ الباقي')}</button>` : ''}
    </article>`;
  }

  const setOpts = (patch) => {
    V.state.opts = Object.assign({}, V.state.opts, patch);
    shown = PAGE;
    V.render();
  };
  V.actions['qn-back'] = () => (V.trail.length ? V.back() : V.go('me', {}, true));
  V.actions['qn-kind'] = (a) => setOpts({ k: a.dataset.v });
  V.actions['qn-book'] = (a) => setOpts({ bk: a.dataset.v });
  V.actions['qn-clear'] = () => setOpts({ k: '', bk: '', q: '' });
  V.actions['qn-more'] = (a) => {
    const id = a.dataset.nid;
    if (open.has(id)) open.delete(id);
    else open.add(id);
    V.render();
  };
  V.actions['qn-open'] = (a) => {
    const id = a.dataset.nid;
    const priv = !!a.dataset.priv;
    const n = priv ? S.priv && S.priv.notes && S.priv.notes[id] : S.notes.get(id);
    if (!n) return U.toast(L('الملاحظة دي اتمسحت', 'That note was deleted', 'تم حذف هذه الملاحظة'), 'warn');
    if (!S.books.has(n.b)) return U.toast(L('الكتاب ده اتشال من الحلقة', 'That book was removed from the circle', 'أُزيل هذا الكتاب من الحلقة'), 'warn');
    if (!n.page) return V.openNote(id, { priv });
    A.R.open(n.b, { page: n.page, flash: id });
  };
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
    io = new IntersectionObserver((ents) => {
      if (!ents.some((x) => x.isIntersecting)) return;
      io.disconnect();
      shown += PAGE;
      V.render();
    }, { rootMargin: '400px 0px' });
    io.observe(s);
  });

  /* The way in: a small card on my «أنا» and an entry in the shelf's ⋯ menu. */
  V.addSection('me', {
    order: 30,
    render: (ctx) => {
      if (!ctx.mine) return '';
      const all = V.myQuotes();
      const latest = all.find((n) => n.text && (n.kind === 'quote' || n.kind === 'hl')) || all.find((n) => n.text);
      const b = latest && bookOf(latest.b);
      return `<button type="button" class="card qn-entry" data-act="go-quotes">
        <span class="qn-e-ic">${icon('quote')}</span>
        <span class="qn-e-t"><b>${L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي')}<small>${L.count(all.length, 'note')}</small></b>
        ${latest ? `<q dir="auto">${esc(latest.text)}</q>${b ? `<small dir="auto">${esc(b.title)}</small>` : ''}` : `<small>${L('كل اللي بتظلّله وتكتبه في الكتب، في مكان واحد', 'Everything you highlight and write in the books, in one place', 'كل ما تظلّله وتكتبه في الكتب، في مكان واحد')}</small>`}</span>
        ${icon('fwd', 'flip-rtl')}
      </button>`;
    },
  });
  V.addMenu('shelf', () => ({ ic: 'quote', t: L('دفتر اقتباساتي', 'My quotes notebook', 'دفتر اقتباساتي'), fn: () => V.actions['go-quotes']() }));
})();
