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
    /* The numbers under the chart, over some of the days (ks). */
    const numsOf = (ks) => {
      const p = ks.reduce((t, k) => t + days[k], 0);
      // speed: only days with both pages and time recorded, and at least half an hour of them
      let tp = 0, ts = 0;
      for (const k of ks) if (secs[k]) (tp += days[k]), (ts += secs[k]);
      let bestDay = null;
      for (const k of ks) if (!bestDay || days[k] > bestDay.n || (days[k] === bestDay.n && k > bestDay.k)) bestDay = { k, n: days[k] };
      const wd = new Array(7).fill(0);
      for (const k of ks) wd[U.parseD(k).getDay()] += days[k];
      const top = Math.max(...wd);
      return { avg: ks.length ? Math.round(p / ks.length) : 0, speed: ts >= 1800 && tp ? Math.round(tp / (ts / 3600)) : 0, bestDay, busiest: top ? wd.indexOf(top) : -1 };
    };
    const all = numsOf(keys);
    const { speed, bestDay, busiest } = all;
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
    // the same numbers for each period of the chart, so the tiles match the switch above them
    const per = {
      d30: numsOf(keys.filter((k) => k >= d30[0].k && k <= today)),
      w12: numsOf(keys.filter((k) => k >= w12[0].k && k <= today)),
      yr: numsOf(keys.filter((k) => k.startsWith(year) && k <= today)),
    };
    return {
      pages, daysRead: keys.length, avg: all.avg, speed, bestDay, per,
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
    const pn = st.per[period] || st.per.d30; // the period chosen above: 30 days, 12 weeks or this year
    nums.push(['avg', L.num(pn.avg), L('صفحة في يوم القراية (متوسط)', 'pages per reading day (avg)', 'صفحة في يوم القراءة (متوسط)')]);
    if (pn.speed) nums.push(['speed', L.num(pn.speed), L('صفحة في الساعة', 'pages an hour', 'صفحة في الساعة')]);
    if (pn.bestDay) nums.push(['best', L.num(pn.bestDay.n), L(`أحسن يوم • ${L.dayShort(pn.bestDay.k)}`, `best day • ${L.dayShort(pn.bestDay.k)}`, `أفضل يوم • ${L.dayShort(pn.bestDay.k)}`)]);
    nums.push(['streak', L.num(st.streakBest), L('أطول سلسلة من الأول (يوم)', 'longest streak ever (days)', 'أطول سلسلة منذ البداية (أيام)')]);
    if (pn.busiest >= 0) nums.push(['wday', esc(weekdayLong(pn.busiest)), L('أنشط يوم في الأسبوع', 'busiest weekday', 'أنشط أيام الأسبوع')]);
    return `<section class="card mst" id="me-stats" data-uid="${esc(uid)}">
      <header class="sec-h"><h2>${icon('target')}${L('إحصائيات القراية', 'Reading stats', 'إحصاءات القراءة')}</h2></header>
      <div class="mst-sub">${seg('mst-period', period, PERIODS.map((k) => [k, perName[k]]), L('الفترة', 'Period'))}${seg('mst-metric', met, mets.map((k) => [k, metName[k]]), L('المقياس', 'Measure'))}</div>
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

  /* «دفتر اقتباساتي» lives in notebook.js. */
})();
