/* Mock-ups of the top of a book's page, to choose a look with the owner (not part of the app). All three show
   everything the page shows today: what we do with it (reading / next / finished), title (+ edit), author,
   pages, portions, who added it, how far I got, the time for the book and what's left, the forecast, continue /
   download / ⋯. BookMock.show('a' | 'b' | 'c'). */
(function () {
  'use strict';
  const { U, L, S, D, G, V } = window.A;
  const esc = U.esc, icon = U.icon;
  const css = `
  .bm-note { margin: 0 0 12px; padding: 8px 12px; border-radius: 12px; background: var(--lapis-s); color: var(--lapis); font-weight: 700; font-size: .85rem; }
  .bm-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 99px; background: var(--jade-s); color: var(--jade); font-size: .74rem; font-weight: 800; }
  .bm-edit { width: 30px; height: 30px; flex: none; }
  .bm-edit .ic { width: 15px; height: 15px; }
  .bm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .bm-chips span { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; background: var(--bg2); color: var(--ink2); font-size: .76rem; font-weight: 700; }
  .bm-chips .ic { width: 14px; height: 14px; }
  .bm-acts { display: flex; gap: 8px; margin: 14px 0 16px; }
  .bm-acts .btn.big { flex: 1; }
  /* أ compact */
  .bmA .bmx-top { display: flex; gap: 14px; align-items: flex-start; }
  .bmA .bmx-top .cover { width: 78px; flex: none; }
  .bmA .bmx-ti { flex: 1; min-width: 0; display: grid; gap: 4px; justify-items: start; }
  .bmA h1 { font: 700 1.5rem/1.3 var(--f-book); margin: 0; display: flex; gap: 6px; align-items: flex-start; }
  .bmA .bmx-au { color: var(--ink3); font-size: .9rem; }
  .bmA .card { margin-top: 14px; padding: 14px; border-radius: 18px; display: grid; gap: 8px; }
  .bmA .bmx-pr { display: flex; align-items: center; gap: 10px; }
  .bmA .bmx-pr b { white-space: nowrap; font-size: .9rem; }
  .bmA .bmx-ln { display: flex; gap: 6px; align-items: flex-start; color: var(--ink2); font-size: .82rem; line-height: 1.5; }
  .bmA .bmx-ln .ic { width: 15px; height: 15px; flex: none; margin-top: .2em; color: var(--ink3); }
  .bmA .bmx-ln.bmx-ok { color: var(--jade); font-weight: 700; }
  .bmA .bmx-ln.bmx-ok .ic { color: var(--jade); }
  /* ب tiles */
  .bmB .bmx-top { display: flex; gap: 14px; align-items: center; }
  .bmB .bmx-top .cover { width: 92px; flex: none; }
  .bmB .bmx-ti { flex: 1; min-width: 0; display: grid; gap: 4px; justify-items: start; }
  .bmB h1 { font: 700 1.45rem/1.3 var(--f-book); margin: 0; display: flex; gap: 6px; align-items: flex-start; }
  .bmB .bmx-au { color: var(--ink3); font-size: .88rem; }
  .bmB .bmx-by { color: var(--ink3); font-size: .76rem; }
  .bmB .bmx-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
  .bmB .bmx-tl { padding: 11px 12px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); display: grid; gap: 2px; align-content: start; }
  .bmB .bmx-tl small { color: var(--ink3); font-size: .74rem; font-weight: 700; }
  .bmB .bmx-tl b { font-size: 1.15rem; }
  .bmB .bmx-tl i { font-style: normal; font-size: .74rem; color: var(--ink3); }
  .bmB .bmx-tl.bmx-ok i { color: var(--jade); font-weight: 700; }
  .bmB .bmx-tl .bar { margin-top: 4px; }
  /* ج centred */
  .bmC { text-align: center; }
  .bmC .bmx-band { margin: -6px -16px 0; padding: 18px 16px 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--gold) 16%, var(--bg)), var(--bg)); display: grid; justify-items: center; gap: 6px; }
  .bmC .bmx-band .cover { width: 112px; box-shadow: 0 10px 24px rgb(0 0 0 / .18); }
  .bmC h1 { font: 700 1.55rem/1.3 var(--f-book); margin: 6px 0 0; display: inline-flex; gap: 6px; align-items: center; }
  .bmC .bmx-au { color: var(--ink3); font-size: .9rem; }
  .bmC .bm-chips { justify-content: center; }
  .bmC .bmx-pg { margin: 12px auto 0; max-width: 340px; display: grid; gap: 6px; }
  .bmC .bmx-pg .bmx-row { display: flex; justify-content: space-between; font-size: .8rem; color: var(--ink3); font-weight: 700; }
  .bmC .bmx-fc { margin: 8px auto 0; display: inline-flex; gap: 6px; align-items: center; padding: 5px 12px; border-radius: 99px; background: var(--jade-s); color: var(--jade); font-size: .8rem; font-weight: 700; }
  .bmC .bmx-fc .ic { width: 14px; height: 14px; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  const data = () => {
    const id = location.hash.replace('#book-', '');
    const b = S.books.get(id) || [...S.books.values()][0];
    const prog = D.prog(b.id);
    const pct = Math.min(1, U.rangesCountIn(prog && prog.seen, 1, b.pages || 1) / (b.pages || 1));
    const last = (prog && prog.last) || 1;
    const ws = G.wirds(b);
    const f = G.forecast(b);
    return {
      b, pct, last, ws,
      status: { reading: L('بنقرأه دلوقتي', 'Reading now'), planned: L('الجاي', 'Up next'), done: L('خلّصناه', 'Finished') }[b.status || 'reading'],
      total: G.timeText(G.minutesFor(b.pages)),
      left: G.timeText(G.minutesFor(Math.round(b.pages * (1 - pct)))),
      fDate: f ? L.dayShort(f.date) : '',
      fText: f ? G.forecastText(f) : '',
      fCmp: f ? G.forecastCompare(f) : '',
      fShort: !f || f.diff == null ? '' : f.diff > 0 ? L(`قبل الخطة ${G.byDays(f.diff)}`, `${G.byDays(f.diff)} early`) : f.diff === 0 ? L('في الميعاد', 'On time') : L(`متأخر ${G.byDays(f.diff)}`, `${G.byDays(f.diff)} late`),
      by: D.name(b.addedBy),
    };
  };
  const edit = (b) => `<button class="ib sm bm-edit" aria-label="edit">${icon('edit')}</button>`;
  const acts = (x) => `<div class="bm-acts"><button class="btn big">${icon('play', 'flip-rtl')}${L(`كمّل من ص ${L.num(x.last)}`, `Continue from p. ${x.last}`)}</button><button class="btn ghost icon-only">${icon('download')}</button><button class="btn ghost icon-only">${icon('more')}</button></div>`;

  function a() {
    const x = data();
    return `<p class="bm-note">أ — مضغوط: الغلاف صغير جنب الاسم، وكل اللي يخص قرايتك في كارت واحد تحته</p>
      <div class="bmA"><div class="bmx-top">${V.cover(x.b, '')}<div class="bmx-ti"><span class="bm-tag">${x.status}</span><h1 dir="auto">${esc(x.b.title)}${edit(x.b)}</h1><span class="bmx-au" dir="auto">${esc(x.b.author || '')}</span>
        <div class="bm-chips"><span>${icon('scroll')}${L.count(x.b.pages, 'page')}</span><span>${icon('calendar')}${L.count(x.ws.length, 'wird')}</span><span>${icon('user')}${esc(x.by)}</span></div></div></div>
        <div class="card"><div class="bmx-pr">${V.bar(x.pct, 'lapis')}<b>${L(`قريت ${L.num(Math.round(x.pct * 100))}٪`, `${Math.round(x.pct * 100)}% read`)}</b></div>
          <p class="bmx-ln">${icon('clock')}<span>${L(`فاضل حوالي ${x.left} من ${x.total}`, `About ${x.left} left of ${x.total}`)}</span></p>
          ${x.fText ? `<p class="bmx-ln bmx-ok">${icon('flag')}<span>${L(`هتخلّص ${x.fDate}`, `You'll finish ${x.fDate}`)} • ${x.fCmp}</span></p>` : ''}</div>
        ${acts(x)}</div>`;
  }
  function b() {
    const x = data();
    return `<p class="bm-note">ب — مربعات: الاسم والغلاف فوق، وتحتهم ٤ مربعات بالأرقام المهمة</p>
      <div class="bmB"><div class="bmx-top">${V.cover(x.b, '')}<div class="bmx-ti"><span class="bm-tag">${x.status}</span><h1 dir="auto">${esc(x.b.title)}${edit(x.b)}</h1><span class="bmx-au" dir="auto">${esc(x.b.author || '')}</span><span class="bmx-by">${L('إضافة', 'Added by')} ${esc(x.by)}</span></div></div>
        <div class="bmx-tiles">
          <div class="bmx-tl"><small>${L('قريت', 'Read')}</small><b>${L.num(Math.round(x.pct * 100))}٪</b>${V.bar(x.pct, 'lapis')}</div>
          <div class="bmx-tl"><small>${L('فاضل', 'Left')}</small><b>${x.left}</b><i>${L(`من ${x.total}`, `of ${x.total}`)}</i></div>
          <div class="bmx-tl bmx-ok"><small>${L('هتخلّص', 'Finish')}</small><b>${x.fDate}</b><i>${x.fShort}</i></div>
          <div class="bmx-tl"><small>${L('الكتاب', 'The book')}</small><b>${L.count(x.b.pages, 'page')}</b><i>${L.count(x.ws.length, 'wird')}</i></div>
        </div>
        ${acts(x)}</div>`;
  }
  function c() {
    const x = data();
    return `<p class="bm-note">ج — في النص: الغلاف كبير فوق، والاسم تحته، وبعدين شريط التقدّم والتوقع</p>
      <div class="bmC"><div class="bmx-band">${V.cover(x.b, '')}<span class="bm-tag">${x.status}</span><h1 dir="auto">${esc(x.b.title)}${edit(x.b)}</h1><span class="bmx-au" dir="auto">${esc(x.b.author || '')}</span>
        <div class="bm-chips"><span>${icon('scroll')}${L.count(x.b.pages, 'page')}</span><span>${icon('calendar')}${L.count(x.ws.length, 'wird')}</span><span>${icon('user')}${esc(x.by)}</span></div></div>
        <div class="bmx-pg"><div class="bmx-row"><span>${L(`قريت ${L.num(Math.round(x.pct * 100))}٪`, `${Math.round(x.pct * 100)}% read`)}</span><span>${L(`فاضل حوالي ${x.left}`, `About ${x.left} left`)}</span></div>${V.bar(x.pct, 'lapis')}<div class="bmx-row"><span></span><span>${L(`الكتاب كله ${x.total}`, `Whole book ${x.total}`)}</span></div></div>
        ${x.fText ? `<p class="bmx-fc">${icon('flag')}${L(`هتخلّص ${x.fDate}`, `Finish ${x.fDate}`)} • ${x.fCmp}</p>` : ''}
        ${acts(x)}</div>`;
  }

  window.BookMock = {
    show(style) {
      const page = document.querySelector('.bookpage');
      page.querySelectorAll('.bp-hero, .bp-actions').forEach((e) => e.remove());
      const d = document.createElement('div');
      d.innerHTML = { a, b, c }[style]();
      page.querySelector('.back').after(d);
      page.setAttribute('data-rt-skip', '1');
    },
  };
})();
