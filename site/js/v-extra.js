/* Extras: reading-session summary, weekly recap, streak protection notices, Hijri dates,
   a getting-started checklist and reading-plan presets. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;

  /* ---------- time ---------- */
  L.duration = (secs) => {
    const m = Math.round((secs || 0) / 60);
    if (m < 60) return L.count(Math.max(m, secs ? 1 : 0), 'minute');
    const h = Math.floor(m / 60), r = m % 60;
    return r ? L(`${L.count(h, 'hour')} و${L.count(r, 'minute')}`, `${h} h ${r} min`) : L.count(h, 'hour');
  };

  /* ---------- Hijri calendar ---------- */
  let hfmt = null;
  L.hijri = (k) => {
    try {
      hfmt = hfmt && hfmt.lang === L.lang() ? hfmt : Object.assign(new Intl.DateTimeFormat(L.isAr() ? 'ar-SA-u-ca-islamic-umalqura-nu-arab' : 'en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }), { lang: L.lang() });
      return hfmt.format(U.parseD(k || U.today()));
    } catch (e) {
      return '';
    }
  };
  V.showHijri = () => U.store.get('hijri', true);

  /* ---------- reading-session summary (after closing the reader) ---------- */
  V.sessionSummary = ({ bookId, pages, secs }) => {
    const b = S.books.get(bookId);
    if (!b || !D.joined()) return;
    const s = G.of(S.me);
    const w = G.myCurrent(b);
    const prog = D.prog(bookId);
    let wird = '';
    if (w) {
      const total = w.to - w.from + 1;
      const seen = U.rangesCountIn(prog && prog.seen, w.from, w.to);
      wird = `<div class="ss-wird">${V.star(L.num(w.n), 'gold sm')}<div><b>${L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`)}</b>${V.bar(seen / total, seen >= total ? 'jade' : 'gold')}<small>${L(`${L.num(seen)} من ${L.count(total, 'page')}`, `${seen} of ${total} pages`)} • ${L.due(w.due)}</small></div>
        ${seen >= Math.max(1, total - 1) && D.canWrite() ? `<button class="btn jade sm" data-act="mark-wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}" data-close>${icon('check')}${L('خلّصته', 'Done')}</button>` : ''}</div>`;
    }
    V.sheet({
      title: L('جلسة قراية ✓', 'Reading session ✓'),
      cls: 'celebrate',
      html: `<div class="ss">
        <p class="ss-book" dir="auto">${esc(b.title)}</p>
        <div class="ss-stats">
          <div><b>${L.num(pages)}</b><small>${L('صفحة جديدة', 'new pages')}</small></div>
          <div><b>${L.num(Math.max(1, Math.round(secs / 60)))}</b><small>${L('دقيقة', 'minutes')}</small></div>
          <div class="gold-t"><b>+${L.num(pages * G.XP.page)}</b><small>XP</small></div>
        </div>
        ${s.streak ? `<p class="ss-streak">${icon('flame')}${L(`سلسلتك ${L.count(s.streak, 'day')}`, `Streak: ${L.count(s.streak, 'day')}`)}${s.freezes ? ` • ${icon('snow')}${L(`حماية ×${L.num(s.freezes)}`, `${s.freezes} freeze${s.freezes > 1 ? 's' : ''}`)}` : ''}</p>` : ''}
        ${wird}
        <button class="btn full" data-close autofocus>${L('تمام', 'Nice')}</button>
      </div>`,
    });
  };

  /* ---------- weekly recap (first visit of a new week) ---------- */
  V.weeklyRecap = () => {
    const s = G.of(S.me);
    const rows = [...G.all().values()].filter((x) => S.members.has(x.uid)).sort((a, b) => b.prevWeek - a.prevWeek);
    const rank = rows.findIndex((x) => x.uid === S.me) + 1;
    const top = rows[0];
    const prevStart = U.addDays(U.weekStart(), -7);
    let best = null;
    for (const n of S.notes.values()) {
      const d = U.isoKey(n.at);
      if (d < prevStart || d >= U.weekStart() || !n.text) continue;
      const likes = V.likeCount(n);
      if (!best || likes > best.likes) best = { n, likes };
    }
    const groupPages = rows.reduce((t, x) => t + x.pagesPrevWeek, 0);
    U.confetti(0.6);
    V.sheet({
      title: L('ملخّص الأسبوع اللي فات', "Last week's recap"),
      cls: 'celebrate',
      html: `<div class="recap">
        ${rank ? V.star(L.num(rank), rank === 1 ? 'gold huge spin-in' : 'lapis big') : ''}
        <h2>${rank === 1 ? L('كنت الأول في الحلقة! 🏆', 'You topped the circle! 🏆') : rank ? L(`المركز ${L.num(rank)} من ${L.num(rows.length)}`, `#${rank} of ${rows.length}`) : ''}</h2>
        <div class="ss-stats">
          <div><b>${L.num(s.pagesPrevWeek)}</b><small>${L('صفحة قريتها', 'pages you read')}</small></div>
          <div class="gold-t"><b>${L.num(s.prevWeek)}</b><small>XP</small></div>
          <div><b>${L.num(groupPages)}</b><small>${L('صفحة للحلقة كلها', 'pages, whole circle')}</small></div>
        </div>
        ${top && top.uid !== S.me && top.prevWeek ? `<p class="muted">${L(`الأول الأسبوع اللي فات: <b>${esc(D.name(top.uid))}</b> بـ ${L.num(top.prevWeek)} XP`, `Top reader last week: <b>${esc(D.name(top.uid))}</b> with ${top.prevWeek} XP`)}</p>` : ''}
        ${best && best.likes ? `<div class="recap-best"><small class="eyebrow">${L('أكتر ملاحظة عجبت الحلقة', 'Most-liked note')}</small>${V.noteCard(best.n, { showBook: true })}</div>` : ''}
        <p>${L('أسبوع جديد بدأ — يلا نكسّر الهدف!', "A new week has started — let's beat the goal!")}</p>
        <button class="btn gold full" data-close autofocus>${L('يلا', "Let's go")}</button>
      </div>`,
    });
  };
  V.checkRecap = () => {
    const wk = U.weekStart();
    const key = 'recapWeek:' + S.me;
    const last = U.store.get(key, null);
    U.store.set(key, wk);
    if (!last || last === wk) return;
    const s = G.of(S.me);
    if (s.prevWeek > 0 || s.pagesPrevWeek > 0) setTimeout(V.weeklyRecap, 1500);
  };

  /* ---------- getting started ---------- */
  V.startChecklist = () => {
    if (U.store.get('startDone:' + S.me, false) || !D.canWrite()) return '';
    const shelf = S.shelf.get(S.me);
    const steps = [
      { id: 'invite', done: S.members.size > 1, t: L('ادعُ أصحابك أو عيلتك', 'Invite friends or family'), act: 'invite' },
      { id: 'book', done: S.books.size > 0, t: L('ضيف أول كتاب', 'Add the first book'), act: 'add-book' },
      { id: 'plan', done: [...S.books.values()].some((b) => G.wirds(b).length), t: L('قسّم الكتاب أوراد', 'Split it into portions'), act: 'first-plan' },
      { id: 'shelf', done: !!(shelf && Object.keys(shelf.items || {}).length), t: L('ضيف كتب قريتها قبل كده', 'Add books you have read'), act: 'bulk-shelf' },
      { id: 'remind', done: !!U.store.get('remind', { on: false }).on, t: L('فعّل التذكير اليومي', 'Turn on daily reminders'), act: 'go-settings', hide: !(A.Remind && A.Remind.available && A.Remind.available()) },
    ].filter((x) => !x.hide);
    const n = steps.filter((x) => x.done).length;
    if (n === steps.length) {
      U.store.set('startDone:' + S.me, true);
      return '';
    }
    return `<section class="card start">
      <header><h3>${icon('target')}${L('ابدأ صح', 'Get started')}</h3><span class="muted sm">${L.num(n)}/${L.num(steps.length)}</span><button class="ib sm" data-act="start-hide" aria-label="${L('إخفاء', 'Hide')}">${icon('close')}</button></header>
      ${V.bar(n / steps.length, 'jade')}
      <ul class="start-list">${steps.map((x) => `<li class="${x.done ? 'done' : ''}"><button data-act="${x.done ? '' : x.act}" ${x.done ? 'disabled' : ''}><span class="q-ic">${icon(x.done ? 'check' : 'fwd', x.done ? '' : 'flip')}</span><span>${x.t}</span></button></li>`).join('')}</ul>
    </section>`;
  };
  V.actions['start-hide'] = () => {
    U.store.set('startDone:' + S.me, true);
    V.render();
  };
  V.actions['first-plan'] = () => {
    const b = [...S.books.values()].find((x) => !G.wirds(x).length);
    if (b) V.planWizard(b.id);
  };
  V.actions['go-settings'] = () => {
    V.go('me');
    setTimeout(() => {
      const el = document.getElementById('set-remind');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 200);
  };

  /* ---------- reading-plan presets ---------- */
  V.planPresets = (pages) => [
    { id: 'khatma30', t: L('ختمة في ٣٠ يوم', 'Finish in 30 days'), apply: (st) => Object.assign(st, { mode: 'end', every: 1, end: U.addDays(st.start, 29) }) },
    { id: 'p10', t: L('١٠ صفحات كل يوم', '10 pages a day'), apply: (st) => Object.assign(st, { mode: 'per', every: 1, per: Math.min(10, pages) }) },
    { id: 'p20', t: L('٢٠ صفحة كل يوم', '20 pages a day'), apply: (st) => Object.assign(st, { mode: 'per', every: 1, per: Math.min(20, pages) }) },
    { id: 'w2', t: L('الكتاب في أسبوعين', 'The book in 2 weeks'), apply: (st) => Object.assign(st, { mode: 'end', every: 1, end: U.addDays(st.start, 13) }) },
    { id: 'weekly', t: L('ورد أسبوعي', 'A portion a week'), apply: (st) => Object.assign(st, { mode: 'end', every: 7, end: U.addDays(st.start, 7 * Math.max(1, Math.ceil(pages / 50)) - 1) }) },
  ];

  /* ---------- streak protection notices (called from V.celebrate) ---------- */
  V.freezeNotices = (prev, now) => {
    if (prev.fz != null && now.fz > prev.fz) {
      setTimeout(() => {
        U.chime('ok');
        U.toast(`${icon('snow')}<span><b>${L('كسبت حماية للسلسلة!', 'You earned a streak freeze!')}</b> ${L('لو فوّت يوم، هتحمي سلسلتك أوتوماتيك.', 'If you miss a day, it saves your streak automatically.')}</span>`, 'badge');
      }, 1600);
    }
    const newFrozen = (now.frozen || []).filter((d) => !(prev.frozen || []).includes(d));
    if (prev.frozen && newFrozen.length) {
      setTimeout(() => U.toast(`${icon('snow')}<span>${L('الحماية أنقذت سلسلتك 🔥 — اقرأ النهارده عشان تكمّل', 'A freeze saved your streak 🔥 — read today to keep going')}</span>`, 'gold'), 2200);
    }
  };
})();
