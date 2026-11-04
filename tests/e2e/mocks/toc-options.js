/* Mock-ups of «الفهرس» (a book's contents, from the file, the printed contents page or added by hand while
   reading), to choose a look with the owner (not part of the app). TocMock.* draw over the real app; the data
   below is the fixture book's printed contents (page 2 of arabic-40.pdf) plus a few headings added by hand. */
(function () {
  'use strict';
  const { U, L, S, D, G, V, R } = window.A;
  const esc = U.esc, icon = U.icon;
  const css = `
  .tm-note { margin: 0 0 10px; padding: 8px 12px; border-radius: 12px; background: var(--lapis-s); color: var(--lapis); font-weight: 700; font-size: .82rem; line-height: 1.5; }
  .tm-av { display: inline-flex; flex: none; }
  .tm-av .av { width: 20px; height: 20px; font-size: 11px; }
  .tm-faces { display: inline-flex; flex-direction: row; }
  .tm-faces .av { width: 22px; height: 22px; margin-inline-start: -6px; border: 2px solid var(--card); font-size: 11px; }
  .tm-faces .av:first-child { margin-inline-start: 0; }
  .tm-tabs { display: flex; gap: 6px; margin: 0 0 10px; }
  .tm-tabs button { flex: 1; min-height: 38px; white-space: nowrap; font-size: .84rem; padding: 0 6px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--card); font-weight: 700; color: var(--ink2); display: inline-flex; gap: 6px; align-items: center; justify-content: center; }
  .tm-tabs button.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .tm-tabs .ic { width: 16px; height: 16px; }
  /* أ — a plain list */
  .tmA { display: grid; }
  .tmA .r { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  .tmA .r .t { flex: 1; min-width: 0; font-weight: 600; }
  .tmA .r.l0 .t { font-weight: 800; font-size: 1.02rem; color: var(--gold-t); }
  .tmA .r.l1 .t { font-weight: 700; }
  .tmA .r.l2 { padding-inline-start: 30px; min-height: 40px; }
  .tmA .r.l2 .t { font-weight: 500; color: var(--ink2); font-size: .92rem; }
  .tmA .r .p { color: var(--ink3); font-weight: 700; font-size: .85rem; min-width: 24px; text-align: end; }
  .tmA .r .ok { color: var(--jade); width: 16px; height: 16px; flex: none; }
  .tmA .r .ok .ic { width: 16px; height: 16px; }
  .tmA .r.done .t { color: var(--ink3); }
  .tmA .r.on { background: var(--lapis-s); border-radius: 12px; border-bottom-color: transparent; }
  .tmA .r.on .t { color: var(--lapis); }
  .tm-here { font-size: .7rem; font-weight: 800; color: #fff; background: var(--lapis); border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .tm-foot { display: grid; gap: 8px; margin-top: 12px; }
  .tm-foot .btn { justify-content: center; }
  /* ب — a line through the book */
  .tmB { position: relative; display: grid; gap: 2px; padding-inline-start: 26px; }
  .tmB::before { content: ""; position: absolute; inset-inline-start: 9px; top: 10px; bottom: 10px; width: 4px; border-radius: 4px; background: var(--line); }
  .tmB .fill { position: absolute; inset-inline-start: 9px; top: 10px; width: 4px; border-radius: 4px; background: var(--jade); }
  .tmB .r { position: relative; padding: 8px 4px 10px; }
  .tmB .r::before { content: ""; position: absolute; inset-inline-start: -22px; top: 13px; width: 12px; height: 12px; border-radius: 50%; background: var(--card); border: 3px solid var(--line); }
  .tmB .r.done::before { background: var(--jade); border-color: var(--jade); }
  .tmB .r.on::before { background: var(--gold); border-color: var(--gold); width: 16px; height: 16px; inset-inline-start: -24px; top: 11px; box-shadow: 0 0 0 4px var(--gold-s); }
  .tmB .r.l0 { padding-top: 14px; }
  .tmB .r.l0::before { border-radius: 4px; }
  .tmB .r .t { display: flex; gap: 6px; align-items: baseline; font-weight: 700; }
  .tmB .r.l0 .t { font-size: 1.02rem; font-weight: 800; color: var(--gold-t); }
  .tmB .r.l2 .t { font-weight: 500; font-size: .9rem; color: var(--ink2); }
  .tmB .r.l2 { padding-block: 4px 6px; margin-inline-start: 10px; }
  .tmB .r.l2::before { width: 8px; height: 8px; border-width: 2px; inset-inline-start: -30px; top: 10px; }
  .tmB .r .t .p { margin-inline-start: auto; color: var(--ink3); font-size: .82rem; }
  .tmB .m { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; color: var(--ink3); font-size: .76rem; font-weight: 600; }
  .tmB .m .pill { padding: 1px 8px; border-radius: 99px; background: var(--bg2); }
  .tmB .m .pill.now { background: var(--gold-s); color: var(--gold-t); }
  .tmB .m .ic { width: 13px; height: 13px; }
  .tmB .r.on .t { color: var(--lapis); }
  /* ج — a card per chapter */
  .tmC { display: grid; gap: 10px; }
  .tmC .part { font-weight: 800; color: var(--gold-t); font-size: .95rem; margin: 6px 4px 0; display: flex; justify-content: space-between; }
  .tmC .part small { color: var(--ink3); font-weight: 700; }
  .tmC .c { border: 1.5px solid var(--line); border-radius: 16px; padding: 12px; display: grid; gap: 7px; background: var(--card); }
  .tmC .c.on { border-color: var(--lapis); box-shadow: 0 0 0 3px var(--lapis-s); }
  .tmC .c.done { opacity: .75; }
  .tmC .c .h { display: flex; gap: 8px; align-items: flex-start; font-weight: 800; }
  .tmC .c .h span { flex: 1; }
  .tmC .c .h small { color: var(--ink3); font-weight: 700; font-size: .8rem; white-space: nowrap; }
  .tmC .c .row { display: flex; align-items: center; gap: 8px; color: var(--ink3); font-size: .78rem; font-weight: 600; }
  .tmC .c .row .bar { flex: 1; }
  .tmC .c .subs { display: grid; gap: 4px; margin-top: 2px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .tmC .c .subs div { display: flex; gap: 8px; align-items: center; font-size: .86rem; color: var(--ink2); }
  .tmC .c .subs div b { flex: 1; font-weight: 600; }
  .tmC .c .subs small { color: var(--ink3); }
  .tmC .c .more { color: var(--lapis); font-weight: 700; font-size: .8rem; }
  /* the reader */
  .tm-rh { display: inline-flex; gap: 4px; align-items: center; color: var(--lapis) !important; font-weight: 700; }
  .tm-rh .ic { width: 13px; height: 13px; flex: none; }
  .tm-strip { position: fixed; inset-inline: 0; z-index: 60; display: flex; align-items: center; gap: 6px; padding: 6px 14px; border: 0; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--lapis-s) 92%, transparent); backdrop-filter: blur(6px); color: var(--lapis); font: 700 .84rem var(--f-ui); text-align: start; }
  .tm-strip span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tm-strip small { color: var(--ink3); font-weight: 600; }
  .tm-strip .ic { width: 15px; height: 15px; flex: none; }
  .rd-scrub .ch-tick { position: absolute; top: -5px; bottom: -5px; width: 2px; margin-inline-start: -1px; background: var(--rd-ink); opacity: .55; border-radius: 1px; }
  .hd-mark { position: absolute; transform: translate(50%, -50%); display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px 2px 4px; border-radius: 99px; background: var(--lapis); color: #fff; font: 700 11px var(--f-ui); box-shadow: 0 2px 8px rgb(0 0 0 / .25); white-space: nowrap; }
  .hd-mark .ic { width: 12px; height: 12px; }
  .hd-mark .av { width: 16px; height: 16px; font-size: 9px; }
  .hd-box { position: absolute; border: 2px dashed var(--lapis); border-radius: 6px; background: color-mix(in srgb, var(--lapis) 8%, transparent); }
  .hd-box b { position: absolute; inset-inline-start: -14px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; background: var(--lapis); color: #fff; display: grid; place-items: center; font-size: 18px; box-shadow: 0 2px 8px rgb(0 0 0 / .25); }
  /* adding a heading */
  .tm-crop { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
  .tm-crop img { display: block; width: 100%; }
  .tm-lvls { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; }
  .tm-lbl { font-weight: 700; font-size: .85rem; color: var(--ink2); margin: 8px 0 2px; }
  .tm-in { width: 100%; min-height: 46px; border-radius: 12px; border: 2px solid var(--lapis); padding: 8px 12px; font: 600 1rem var(--f-ui); background: var(--card); color: var(--ink); }
  .tm-hint { display: flex; gap: 6px; align-items: flex-start; color: var(--ink3); font-size: .78rem; margin: 6px 0 0; }
  .tm-hint .ic { width: 14px; height: 14px; flex: none; margin-top: 2px; }
  .seg-pick .sp.tm-new { position: relative; }
  .seg-pick .sp.tm-new::after { content: "جديد"; position: absolute; top: -9px; inset-inline-end: -6px; background: var(--rubric); color: #fff; font-size: .62rem; padding: 1px 6px; border-radius: 99px; }
  /* suggestions / printed contents / convert */
  .tm-list { display: grid; gap: 6px; }
  .tm-li { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--card); }
  .tm-li .cb { width: 22px; height: 22px; border-radius: 6px; background: var(--lapis); color: #fff; display: grid; place-items: center; flex: none; }
  .tm-li .cb .ic { width: 15px; height: 15px; }
  .tm-li .cb.off { background: var(--card); border: 2px solid var(--line); }
  .tm-li .t { flex: 1; min-width: 0; font-weight: 600; font-size: .9rem; }
  .tm-li .t small { display: block; color: var(--ink3); font-weight: 500; font-size: .74rem; }
  .tm-li .pn { min-width: 44px; text-align: center; padding: 4px 6px; border-radius: 8px; border: 1.5px solid var(--line); font-weight: 700; color: var(--ink2); font-size: .85rem; }
  .tm-li img { width: 120px; height: 34px; object-fit: cover; object-position: center; border-radius: 6px; border: 1px solid var(--line); flex: none; }
  .tm-off { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--jade-s); color: var(--jade); font-weight: 700; font-size: .84rem; margin: 10px 0; }
  .tm-off .ic { width: 16px; height: 16px; flex: none; }
  .tm-off a { margin-inline-start: auto; color: var(--lapis); text-decoration: underline; }
  .tm-page { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); max-height: 230px; background: #fff; }
  .tm-page img { display: block; width: 100%; }
  /* plan by chapters */
  .tmP { display: grid; gap: 10px; }
  .tmP .c { border: 1.5px solid var(--line); border-radius: 16px; padding: 10px 12px; background: var(--card); display: grid; gap: 8px; }
  .tmP .c.on { border-color: var(--gold); }
  .tmP .c .h { display: flex; gap: 8px; align-items: center; font-weight: 800; font-size: .95rem; }
  .tmP .c .h span { flex: 1; }
  .tmP .c .h small { color: var(--ink3); font-weight: 700; font-size: .78rem; }
  .tmP .ws { display: flex; gap: 6px; flex-wrap: wrap; }
  .tmP .ws i { font-style: normal; padding: 3px 10px; border-radius: 10px; font-size: .78rem; font-weight: 700; background: var(--bg2); color: var(--ink2); }
  .tmP .ws i.done { background: var(--jade-s); color: var(--jade); }
  .tmP .ws i.now { background: var(--gold-s); color: var(--gold-t); box-shadow: inset 0 0 0 1.5px var(--gold); }
  .tmP .ft { display: flex; justify-content: space-between; align-items: center; color: var(--ink3); font-size: .76rem; font-weight: 600; }
  .tm-hero-ch { display: flex; gap: 6px; align-items: center; color: var(--lapis); font-weight: 700; font-size: .86rem; margin: 4px 0 0; }
  .tm-hero-ch .ic { width: 15px; height: 15px; flex: none; }
  .tm-hero-fin { color: var(--jade); font-weight: 700; font-size: .8rem; margin: 2px 0 0; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  const T = {}; // filled by TocMock.setup
  // the contents: lvl 0 a part, 1 a chapter, 2 a heading inside it; src 'print' (from the printed page) or 'hand'
  const H = () => [
    { t: 'القسم الأول: القارئ', p: 3, l: 0, src: 'hand', by: T.me },
    { t: 'الفصل الأول: لماذا نقرأ؟', p: 3, l: 1, src: 'print' },
    { t: 'دفتر القارئ', p: 5, l: 2, src: 'hand', by: T.sara },
    { t: 'القراءة بصوت مرتفع', p: 7, l: 2, src: 'hand', by: T.me },
    { t: 'الفصل الثاني: نوادي القراءة والحوار', p: 10, l: 1, src: 'print' },
    { t: 'القراءة البطيئة', p: 12, l: 2, src: 'hand', by: T.omar },
    { t: 'بيت الحكمة والترجمة', p: 13, l: 2, src: 'hand', by: T.me },
    { t: 'القسم الثاني: الكتاب', p: 17, l: 0, src: 'hand', by: T.sara },
    { t: 'الفصل الثالث: هوامش القرّاء', p: 17, l: 1, src: 'print' },
    { t: 'الفصل الرابع: المكتبات والمخطوطات', p: 24, l: 1, src: 'print' },
    { t: 'الفصل الخامس: عادة القراءة اليومية', p: 31, l: 1, src: 'print' },
    { t: 'خاتمة: الرحلة مستمرة', p: 37, l: 1, src: 'print' },
  ];
  const CUR = 12; // where I am
  const chapters = () => {
    const all = H().filter((h) => h.l === 1);
    return all.map((h, i) => Object.assign({}, h, { to: (all[i + 1] ? all[i + 1].p : 41) - 1, subs: H().filter((x) => x.l === 2 && x.p >= h.p && (!all[i + 1] || x.p < all[i + 1].p)) }));
  };
  const av = (uid) => (uid ? `<span class="tm-av">${D.avatar(uid, 'xs')}</span>` : '');
  const faces = (uids) => (uids.length ? `<span class="tm-faces">${uids.map((u) => D.avatar(u, 'xs')).join('')}</span>` : '');
  const at = () => ({ [T.me]: CUR, [T.sara]: 18, [T.omar]: 8, [T.laila]: 13 });
  const inCh = (c) => Object.entries(at()).filter(([, p]) => p >= c.p && p <= c.to).map(([u]) => u);
  const NOTES = { 3: 4, 10: 6, 17: 1, 24: 0, 31: 0, 37: 0 };
  const curIdx = (list) => {
    let on = -1;
    list.forEach((x, i) => x.p <= CUR && (on = i));
    return on;
  };
  const tabs = (on) => `<div class="tm-tabs"><button class="${on === 'toc' ? 'on' : ''}">${icon('list')}الفهرس</button><button class="${on === 'bm' ? 'on' : ''}">${icon('bookmark')}علاماتي ٢</button><button>${icon('note')}ملاحظاتي</button></div>`;
  const foot = () => `<div class="tm-foot"><button class="btn gold">${icon('plus')}حط عنوان في الصفحة دي (ص ${L.num(CUR)})</button><button class="btn ghost">${icon('file')}انقل من فهرس الكتاب المطبوع</button></div>`;

  /* ---------- the index sheet, three looks ---------- */
  function sheetA() {
    const list = H();
    const on = curIdx(list);
    return `<p class="tm-note">أ — قايمة بسيطة: زي فهرس الكتاب المطبوع، اللي خلّصته عليه ✓، وإنت فين معلّم</p>${tabs('toc')}
      <div class="tmA">${list.map((h, i) => `<div class="r l${h.l}${i === on ? ' on' : ''}${h.p < 10 && h.l > 0 ? ' done' : ''}">${h.p < 10 && h.l > 0 ? `<span class="ok">${icon('check')}</span>` : ''}<span class="t" dir="auto">${esc(h.t)}</span>${i === on ? '<span class="tm-here">إنت هنا</span>' : ''}${h.src === 'hand' ? av(h.by) : ''}<span class="p">${L.num(h.p)}</span></div>`).join('')}</div>${foot()}`;
  }
  function sheetB() {
    const list = H();
    const on = curIdx(list);
    const cs = chapters();
    const wOf = (c) => G.wirds(T.book).filter((w) => w.to >= c.p && w.from <= c.to);
    const fillTo = 100 * ((on + 0.4) / list.length);
    return `<p class="tm-note">ب — خط الكتاب: الخط الأخضر لحد ما قريت، تحت كل فصل صفحاته وأوراده وملاحظاته ومين فيه دلوقتي</p>${tabs('toc')}
      <div class="tmB"><i class="fill" style="height:${fillTo}%"></i>${list
        .map((h, i) => {
          const c = h.l === 1 ? cs.find((x) => x.p === h.p) : null;
          const ws = c ? wOf(c) : [];
          const meta = c
            ? `<div class="m"><span>${L.count(c.to - c.p + 1, 'page')}</span>${ws.length ? `<span class="pill${ws.some((w) => CUR >= w.from && CUR <= w.to) ? ' now' : ''}">الورد ${L.num(ws[0].n)}${ws.length > 1 ? `–${L.num(ws[ws.length - 1].n)}` : ''}</span>` : ''}${NOTES[c.p] ? `<span>${icon('note')} ${L.num(NOTES[c.p])}</span>` : ''}${faces(inCh(c))}</div>`
            : '';
          return `<div class="r l${h.l}${i === on ? ' on' : ''}${i < on && h.l > 0 ? ' done' : ''}"><div class="t"><span dir="auto">${esc(h.t)}</span>${h.src === 'hand' ? av(h.by) : ''}<span class="p">${L.num(h.p)}</span></div>${meta}</div>`;
        })
        .join('')}</div>${foot()}`;
  }
  function sheetC() {
    const cs = chapters();
    const prog = (c) => Math.max(0, Math.min(1, (CUR - c.p + 1) / (c.to - c.p + 1)));
    const card = (c) => {
      const pr = prog(c);
      const on = CUR >= c.p && CUR <= c.to;
      return `<div class="c${on ? ' on' : ''}${pr >= 1 ? ' done' : ''}"><div class="h">${pr >= 1 ? `<span class="tm-av" style="color:var(--jade)">${icon('check')}</span>` : ''}<span dir="auto">${esc(c.t)}</span><small>ص ${L.num(c.p)}–${L.num(c.to)}</small></div>
        <div class="row">${V.bar(pr, pr >= 1 ? 'jade' : 'lapis')}<span>${pr >= 1 ? 'خلّصته' : pr > 0 ? `فاضل ${L.count(c.to - CUR, 'page')}` : `${L.count(c.to - c.p + 1, 'page')} • حوالي ${G.timeText(G.minutesFor(c.to - c.p + 1))}`}</span></div>
        <div class="row">${NOTES[c.p] ? `<span>${icon('note')} ${L.count(NOTES[c.p], 'note')}</span>` : '<span>لسه مفيش ملاحظات</span>'}<span style="margin-inline-start:auto">${faces(inCh(c))}</span></div>
        ${c.subs.length ? (on ? `<div class="subs">${c.subs.map((s) => `<div><b dir="auto">${esc(s.t)}</b>${av(s.by)}<small>${L.num(s.p)}</small></div>`).join('')}</div>` : `<span class="more">▾ ${L.num(c.subs.length)} عناوين جوّه</span>`) : ''}</div>`;
    };
    return `<p class="tm-note">ج — كروت: كارت لكل فصل فيه قريت قد إيه منه وفاضل كام صفحة، والعناوين الصغيرة مطوية جوّه</p>${tabs('toc')}
      <div class="tmC"><div class="part"><span>القسم الأول: القارئ</span><small>ص ${L.num(3)}–${L.num(16)}</small></div>${cs.slice(0, 2).map(card).join('')}
      <div class="part"><span>القسم الثاني: الكتاب</span><small>ص ${L.num(17)}–${L.num(40)}</small></div>${cs.slice(2, 4).map(card).join('')}</div>`;
  }

  /* ---------- the reader: the chapter's name on top, chapter ticks, a heading's mark on its page ---------- */
  function readerChrome(page) {
    for (const id of ['#rd-orient', '#rd-foffer', '#rd-browse', '#rd-hint']) {
      const o = document.querySelector(id);
      if (o) o.hidden = true;
    }
    const top = document.querySelector('.rd-top');
    if (top) {
      const r = top.getBoundingClientRect();
      document.body.insertAdjacentHTML('beforeend', `<button class="tm-strip" style="top:${r.bottom}px">${icon('list')}<span>الفصل الثاني: نوادي القراءة والحوار</span><small>ص ${L.num(10)}–${L.num(16)}</small><b>›</b></button>`);
    }
    const trk = document.querySelector('#rd-scrub .trk');
    const N = 40;
    const side = document.querySelector('#rd-scrub').dir === 'rtl' ? 'right' : 'left';
    if (trk) for (const c of chapters()) trk.insertAdjacentHTML('beforeend', `<i class="ch-tick" style="${side}:${((c.p - 1) / (N - 1)) * 100}%"></i>`);
    if (page) {
      const ov = document.querySelector(`.pg-ov[data-p="${page}"]`);
      if (ov) ov.insertAdjacentHTML('beforeend', `<span class="hd-mark" style="right:6%;top:15%">${icon('list')}فصل</span>`);
    }
  }
  /* What the app could find by itself in a book that has words (not pictures): lines in bigger letters. */
  function suggestBoxes(page) {
    const ov = document.querySelector(`.pg-ov[data-p="${page}"]`);
    if (ov) ov.insertAdjacentHTML('beforeend', `<span class="hd-box" style="left:23%;top:11.4%;width:54%;height:6.6%"><b>+</b></span>`);
  }

  /* ---------- crops of the fixture's pages ---------- */
  let pdf = null;
  async function pageImg(p, box, scale = 2.4) {
    if (!pdf) {
      const b = D.book(T.bookId);
      const buf = await R.partBytes(b.parts[0]);
      pdf = await R.openPdf(new Uint8Array(buf.slice(0)));
    }
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = vp.width;
    cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if (!box) return cv.toDataURL('image/jpeg', 0.85);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(box.w * cv.width);
    c2.height = Math.round(box.h * cv.height);
    c2.getContext('2d').drawImage(cv, -box.x * cv.width, -box.y * cv.height);
    return c2.toDataURL('image/jpeg', 0.9);
  }
  const HEAD_BOX = { 3: { x: 0.28, y: 0.105, w: 0.44, h: 0.085 }, 10: { x: 0.2, y: 0.105, w: 0.6, h: 0.085 }, 17: { x: 0.24, y: 0.105, w: 0.52, h: 0.085 }, 24: { x: 0.2, y: 0.105, w: 0.6, h: 0.085 } };

  async function addSheet() {
    const crop = await pageImg(10, HEAD_BOX[10]);
    const kinds = [['hl', 'hl', 'تظليل'], ['note', 'note', 'ملاحظة'], ['q', 'question', 'سؤال'], ['quote', 'quote', 'اقتباس'], ['head', 'list', 'عنوان']];
    return `<p class="tm-note">إضافة عنوان: زي التظليل بالظبط — تظلّل سطر العنوان، وتختار «عنوان». الاسم بيتكتب لوحده لو الكتاب فيه كلام (مش صور)</p>
      <div class="tm-crop"><img src="${crop}" alt=""></div>
      <div class="seg-pick">${kinds.map(([k, ic, t]) => `<button type="button" class="sp${k === 'head' ? ' on tm-new' : ''}">${icon(ic)}<span>${t}</span></button>`).join('')}</div>
      <p class="tm-lbl">ده إيه في الكتاب؟</p>
      <div class="tm-lvls"><button class="chip">قسم كبير</button><button class="chip on">فصل</button><button class="chip">عنوان صغير جوّه فصل</button></div>
      <p class="tm-lbl">اسمه في الفهرس</p>
      <input class="tm-in" dir="auto" value="الفصل الثاني: نوادي القراءة والحوار">
      <p class="tm-hint">${icon('info')}<span>اتكتب لوحده من الصفحة — عدّله لو حابب. بيظهر للحلقة كلها في الفهرس، ومحدش يقدر يعدّله غيرك وغير المشرفين.</span></p>
      <div class="row-btns end" style="margin-top:12px"><button class="btn ghost">إلغاء</button><button class="btn">${icon('check')}ضيفه للفهرس <small class="xp-hint">+${L.num(3)} XP</small></button></div>`;
  }
  async function printSheet() {
    const img = await pageImg(2, { x: 0, y: 0.04, w: 1, h: 0.5 }, 1.6);
    const rows = chapters().map((c) => [c.t, c.p]);
    return `<p class="tm-note">من فهرس الكتاب المطبوع: البرنامج يلاقي صفحة «الفهرس» ويقرا العناوين وأرقامها مرة واحدة</p>
      <div class="tm-page"><img src="${img}" alt=""></div>
      <div class="tm-off">${icon('check')}<span>رقم ٣ في الكتاب = صفحة ${L.num(3)} هنا</span><a>مش مظبوط؟</a></div>
      <p class="tm-lbl">لقيت ${L.num(rows.length)} عناوين:</p>
      <div class="tm-list">${rows.map(([t, p]) => `<div class="tm-li"><span class="cb">${icon('check')}</span><span class="t" dir="auto">${esc(t)}</span><span class="pn">${L.num(p)}</span></div>`).join('')}</div>
      <p class="tm-hint">${icon('info')}<span>لو صفحة الفهرس صورة (كتاب متصوّر): هتظهر فوق وإنت تكتب العناوين وأرقامها تحتها بسرعة.</span></p>
      <div class="row-btns end" style="margin-top:12px"><button class="btn gold">${icon('plus')}ضيف ${L.num(rows.length)} للفهرس</button></div>`;
  }
  async function suggestSheet() {
    const pages = [3, 10, 17, 24];
    const imgs = await Promise.all(pages.map((p) => pageImg(p, HEAD_BOX[p])));
    const names = { 3: 'الفصل الأول: لماذا نقرأ؟', 10: 'الفصل الثاني: نوادي القراءة والحوار', 17: 'الفصل الثالث: هوامش القرّاء', 24: 'الفصل الرابع: المكتبات والمخطوطات' };
    return `<p class="tm-note">اقتراحات: في كتاب فيه كلام، البرنامج يدوّر على السطور اللي بخط أكبر من الباقي — غالبًا عناوين</p>
      <p class="tm-lbl">لقيت ${L.num(6)} سطور شكلها عناوين:</p>
      <div class="tm-list">${pages.map((p, i) => `<div class="tm-li"><span class="cb">${icon('check')}</span><img src="${imgs[i]}" alt=""><span class="t" dir="auto">${esc(names[p])}<small>ص ${L.num(p)}</small></span></div>`).join('')}
        <div class="tm-li"><span class="cb off"></span><span class="t">رحلة في عالم الكتب — الفصل الأول<small>ص ${L.num(4)} • ده اسم الكتاب فوق كل صفحة، مش عنوان</small></span></div></div>
      <div class="row-btns end" style="margin-top:12px"><button class="btn ghost">بعدين</button><button class="btn gold">${icon('plus')}ضيف المختار (${L.num(5)})</button></div>`;
  }
  async function convertSheet() {
    const pages = [3, 10, 17, 24];
    const imgs = await Promise.all(pages.map((p) => pageImg(p, HEAD_BOX[p])));
    return `<p class="tm-note">لو كنت بتعلّم العناوين بالتظليل (زي البمبي في كتابكم): زرار واحد يحوّلهم عناوين في الفهرس ويشيل التظليل</p>
      <p class="tm-lbl">تظليلاتك القصيرة باللون ده <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ff7aa2;vertical-align:middle"></span> (${L.num(4)}):</p>
      <div class="tm-list">${pages.map((p, i) => `<div class="tm-li"><span class="cb">${icon('check')}</span><img src="${imgs[i]}" alt=""><span class="t">ص ${L.num(p)}<small>${['فصل', 'فصل', 'فصل', 'فصل'][i]}</small></span></div>`).join('')}</div>
      <div class="tm-lvls" style="margin-top:10px"><button class="chip">قسم كبير</button><button class="chip on">فصل</button><button class="chip">عنوان صغير</button></div>
      <div class="row-btns end" style="margin-top:8px"><button class="btn ghost">إلغاء</button><button class="btn gold">${icon('list')}حوّل ${L.num(4)} لعناوين</button></div>`;
  }
  function planChapters() {
    const cs = chapters();
    const ws = G.wirds(T.book);
    const prog = D.prog(T.bookId) || {};
    const done = prog.done || {};
    return `<div class="segs plan-views" role="tablist"><button>${icon('calendar')}<span>تقويم</span></button><button>${icon('list')}<span>قايمة</span></button><button class="on">${icon('book')}<span>فصول</span></button></div>
      <p class="tm-note" style="margin-top:10px">الخطة بالفصول: كل فصل وأوراده تحته، تعرف الفصل ده بيخلص إمتى</p>
      <div class="tmP">${cs
        .slice(0, 4)
        .map((c) => {
          const mine = ws.filter((w) => w.to >= c.p && w.from <= c.to);
          const on = CUR >= c.p && CUR <= c.to;
          const end = mine[mine.length - 1];
          return `<div class="c${on ? ' on' : ''}"><div class="h"><span dir="auto">${esc(c.t)}</span><small>ص ${L.num(c.p)}–${L.num(c.to)}</small></div>
            <div class="ws">${mine.map((w) => `<i class="${done[w.id] ? 'done' : CUR >= w.from && CUR <= w.to ? 'now' : ''}">${done[w.id] ? '✓ ' : ''}الورد ${L.num(w.n)}</i>`).join('')}</div>
            <div class="ft"><span>${end ? `يخلص ${L.dayShort(end.due)}` : ''}</span>${faces(inCh(c))}</div></div>`;
        })
        .join('')}</div>`;
  }

  window.TocMock = {
    setup(o) {
      Object.assign(T, o);
      T.book = D.book(o.bookId);
    },
    sheet(which) {
      const html = { a: sheetA, b: sheetB, c: sheetC }[which]();
      return V.sheet({ title: `${icon('list')} الفهرس`, html });
    },
    async add() {
      return V.sheet({ title: `صفحة ${L.num(10)}`, html: await addSheet() });
    },
    async print() {
      return V.sheet({ title: `${icon('file')} من فهرس الكتاب`, html: await printSheet() });
    },
    async suggest() {
      return V.sheet({ title: `${icon('sparkle')} عناوين لقيتها`, html: await suggestSheet() });
    },
    async convert() {
      return V.sheet({ title: `${icon('list')} حوّل تظليلاتك لعناوين`, html: await convertSheet() });
    },
    reader: readerChrome,
    suggestBoxes,
    plan() {
      const pane = document.querySelector('.tabpane');
      pane.innerHTML = planChapters();
      document.querySelector('.bookpage').setAttribute('data-rt-skip', '1');
    },
    hero() {
      const w = document.querySelector('.hero .hi-w');
      if (w) w.insertAdjacentHTML('afterend', `<p class="tm-hero-ch">${icon('list')}<span>آخر «لماذا نقرأ؟» وأول «نوادي القراءة والحوار»</span></p><p class="tm-hero-fin">🏁 الفصل الأول بيخلص في الورد ده</p>`);
      document.querySelector('#screen .home') && document.querySelector('#screen .home').setAttribute('data-rt-skip', '1');
    },
  };
})();
