/* Mock-ups of the plan tab, to choose a look with the owner (not part of the app). Each style draws the same
   real data (the book's portions, my progress, who finished what, days off) into the plan tab:
   PlanMock.show('calm' | 'list' | 'bar' | 'week'). */
(function () {
  'use strict';
  const { U, L, S, D, G, V } = window.A;
  const esc = U.esc, icon = U.icon;
  const css = `
  .pm-note { margin: 6px 0 12px; padding: 8px 12px; border-radius: 12px; background: var(--lapis-s); color: var(--lapis); font-weight: 700; font-size: .85rem; }
  /* أ calm calendar */
  .pmA { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
  .pmA .pm-h { text-align: center; font-size: .78rem; color: var(--ink3); font-weight: 700; padding-bottom: 2px; }
  .pmA .pm-mo { grid-column: 1 / -1; font-size: .8rem; font-weight: 800; color: var(--ink2); margin: 8px 2px 2px; }
  .pmA .pm-c { position: relative; height: 58px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--card); display: grid; place-items: center; align-content: center; gap: 0; padding: 2px; overflow: hidden; }
  .pmA .pm-c b { font-size: 1.05rem; line-height: 1.1; }
  .pmA .pm-c small { font-size: .66rem; color: var(--ink3); font-weight: 700; line-height: 1.2; }
  .pmA .pm-c .pm-d { position: absolute; top: 3px; inset-inline-start: 6px; font-size: .58rem; color: var(--ink3); font-weight: 600; }
  .pmA .pm-c i.pm-f { position: absolute; bottom: 0; inset-inline-start: 0; height: 4px; background: var(--jade); border-radius: 0 2px 2px 0; }
  .pmA .pm-c.done { background: var(--jade); border-color: var(--jade); color: #fff; }
  .pmA .pm-c.done small, .pmA .pm-c.done .pm-d { color: rgb(255 255 255 / .85); }
  .pmA .pm-c.done i.pm-f { background: rgb(255 255 255 / .7); }
  .pmA .pm-c.cur { background: var(--gold); border-color: var(--gold); color: #1d1a14; box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 30%, transparent); }
  .pmA .pm-c.cur small, .pmA .pm-c.cur .pm-d { color: rgb(29 26 20 / .75); }
  .pmA .pm-c.late { border-color: var(--rubric); }
  .pmA .pm-c.off { background: var(--bg2); border-style: dashed; }
  .pmA .pm-c.pm-empty { border: 0; background: transparent; }
  .pmA .pm-c.today { outline: 2px solid var(--lapis); outline-offset: 1px; }
  /* ب list */
  .pmB { display: grid; gap: 6px; }
  .pmB .pm-wk { font-size: .8rem; font-weight: 800; color: var(--ink3); margin: 10px 4px 2px; }
  .pmB .pm-r { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 14px; background: var(--card); border: 1px solid var(--line); }
  .pmB .pm-r .star8 { --sz: 34px; }
  .pmB .pm-r .pm-t { display: grid; gap: 1px; min-width: 0; }
  .pmB .pm-r .pm-t b { font-size: .95rem; }
  .pmB .pm-r .pm-t small { color: var(--ink3); font-size: .76rem; }
  .pmB .pm-r .pm-e { display: grid; justify-items: end; gap: 3px; }
  .pmB .pm-r .pm-e small { font-size: .74rem; color: var(--ink3); font-weight: 700; white-space: nowrap; }
  .pmB .pm-r .pm-avs { display: flex; } .pmB .pm-r .pm-avs .av { margin-inline-start: -6px; border: 2px solid var(--card); }
  .pmB .pm-r.cur { border: 2px solid var(--gold); background: color-mix(in srgb, var(--gold) 8%, var(--card)); }
  .pmB .pm-r.cur .pm-e small { color: var(--gold-t); }
  .pmB .pm-r.late .pm-e small { color: var(--rubric); }
  .pmB .pm-r.off { grid-template-columns: 40px 1fr; background: transparent; border-style: dashed; color: var(--ink3); font-size: .85rem; }
  .pmB .pm-fold { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--jade-s); color: var(--jade); font-weight: 700; font-size: .9rem; }
  .pmB .pm-fold .pm-avs { margin-inline-start: auto; }
  /* ج the book as a bar */
  .pmC .pm-bar { display: flex; gap: 2px; height: 30px; border-radius: 10px; overflow: hidden; margin: 6px 0 4px; }
  .pmC .pm-bar i { display: block; height: 100%; background: var(--line); position: relative; }
  .pmC .pm-bar i.done { background: var(--jade); } .pmC .pm-bar i.cur { background: var(--gold); } .pmC .pm-bar i.late { background: var(--rubric); } .pmC .pm-bar i.off { background: transparent; }
  .pmC .pm-ticks { position: relative; height: 18px; font-size: .68rem; color: var(--ink3); font-weight: 700; }
  .pmC .pm-ticks span { position: absolute; transform: translateX(50%); white-space: nowrap; }
  .pmC .pm-here { display: flex; justify-content: space-between; font-size: .8rem; color: var(--ink2); margin-bottom: 12px; }
  .pmC .pm-cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; scroll-snap-type: x mandatory; margin-inline: -16px; padding-inline: 16px; }
  .pmC .pm-cd { flex: none; width: 150px; scroll-snap-align: center; padding: 12px; border-radius: 16px; background: var(--card); border: 1.5px solid var(--line); display: grid; gap: 4px; }
  .pmC .pm-cd b { font-size: 1rem; } .pmC .pm-cd .pm-p { font-size: 1.15rem; font-weight: 800; } .pmC .pm-cd small { color: var(--ink3); font-size: .76rem; font-weight: 600; }
  .pmC .pm-cd.done { border-color: var(--jade); background: var(--jade-s); } .pmC .pm-cd.cur { border: 2px solid var(--gold); background: color-mix(in srgb, var(--gold) 10%, var(--card)); }
  .pmC .pm-cd .pm-avs { display: flex; min-height: 24px; } .pmC .pm-cd .pm-avs .av { margin-inline-start: -6px; border: 2px solid var(--card); }
  .pmC h4 { margin: 8px 0 6px; font-size: .9rem; }
  /* د week by week */
  .pmD .pm-wnav { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 8px; font-weight: 800; }
  .pmD .pm-wnav .ib { width: 34px; height: 34px; border: 1px solid var(--line); }
  .pmD .pm-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
  .pmD .pm-dy { display: grid; justify-items: center; gap: 2px; padding: 7px 0 8px; border-radius: 14px; background: var(--card); border: 1.5px solid var(--line); }
  .pmD .pm-dy small { font-size: .68rem; color: var(--ink3); font-weight: 700; }
  .pmD .pm-dy b { font-size: 1rem; }
  .pmD .pm-dy i { font-style: normal; font-size: .64rem; font-weight: 800; padding: 1px 6px; border-radius: 99px; background: var(--bg2); color: var(--ink2); }
  .pmD .pm-dy.done i { background: var(--jade); color: #fff; } .pmD .pm-dy.cur { border: 2px solid var(--gold); } .pmD .pm-dy.cur i { background: var(--gold); color: #1d1a14; } .pmD .pm-dy.late i { background: var(--rubric); color: #fff; }
  .pmD .pm-dy.off { border-style: dashed; background: transparent; }
  .pmD .pm-det { margin-top: 10px; padding: 14px; border-radius: 18px; background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow); display: grid; gap: 8px; }
  .pmD .pm-det .pm-top { display: flex; align-items: center; gap: 10px; } .pmD .pm-det .pm-top .star8 { --sz: 40px; }
  .pmD .pm-det .pm-top div { display: grid; } .pmD .pm-det .pm-top small { color: var(--ink3); }
  .pmD .pm-det .pm-facts { display: flex; gap: 6px; flex-wrap: wrap; } .pmD .pm-det .pm-facts span { padding: 3px 9px; border-radius: 99px; background: var(--bg2); font-size: .78rem; font-weight: 700; color: var(--ink2); }
  .pmD .pm-det .pm-fin { display: flex; align-items: center; gap: 8px; font-size: .8rem; color: var(--ink3); } .pmD .pm-det .pm-fin .pm-avs { display: flex; } .pmD .pm-det .pm-fin .pm-avs .av { margin-inline-start: -6px; border: 2px solid var(--card); }
  .pmD .pm-next { margin-top: 12px; display: grid; gap: 6px; }
  .pmD .pm-next div { display: grid; gap: 2px; padding: 9px 12px; border-radius: 12px; background: var(--bg2); font-size: .82rem; }
  .pmD .pm-next b { font-weight: 700; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  const ctx = () => {
    const b = [...S.books.values()].find((x) => (x.wirds || []).length > 20);
    const ws = G.wirds(b);
    const members = D.memberIds();
    const myCur = G.myCurrent(b);
    const fins = (w) => members.filter((u) => u !== S.me && (D.prog(b.id, u) || {}).done && D.prog(b.id, u).done[w.id]);
    const cls = (w) => {
      const s = G.wirdStatus(b, w);
      if (s === 'done' || s === 'late-done') return 'done';
      if (myCur && myCur.id === w.id) return 'cur';
      return s === 'late' ? 'late' : 'soon';
    };
    const pages = (w) => w.to - w.from + 1;
    const avs = (us, n = 3) => `<span class="pm-avs">${us.slice(0, n).map((u) => D.avatar(u, 'xs')).join('')}</span>${us.length > n ? `<small>+${L.num(us.length - n)}</small>` : ''}`;
    const when = (d) => (d === U.today() ? 'النهارده' : d === U.addDays(U.today(), 1) ? 'بكرة' : d === U.addDays(U.today(), -1) ? 'امبارح' : L.day(d));
    return { b, ws, members, myCur, fins, cls, pages, avs, when };
  };

  function calm() {
    const { ws, cls, pages, fins, members } = ctx();
    const byDay = new Map();
    for (const w of ws) for (let d = w.start; d <= w.due; d = U.addDays(d, 1)) if (!byDay.has(d)) byDay.set(d, w);
    const first = U.weekStart(ws[0].start), last = ws[ws.length - 1].due;
    let h = '';
    for (let i = 0; i < 7; i++) h += `<span class="pm-h">${L.weekday(U.addDays(first, i))}</span>`;
    let mo = '';
    for (let wk = first; wk <= last; wk = U.addDays(wk, 7)) {
      const m = U.addDays(wk, 6).slice(0, 7);
      if (m !== mo) {
        mo = m;
        h += `<span class="pm-mo">${L.monthYear(m)}</span>`;
      }
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(wk, i);
        const w = byDay.get(d);
        const off = G.isOff(d);
        const today = d === U.today() ? ' today' : '';
        if (!w) {
          h += off ? `<span class="pm-c off${today}"><span class="pm-d">${L.num(+d.slice(8))}</span>🌴</span>` : `<span class="pm-c pm-empty${today}"></span>`;
          continue;
        }
        const f = fins(w).length;
        h += `<span class="pm-c ${cls(w)}${today}"><span class="pm-d">${L.num(+d.slice(8))}</span><b>${L.num(w.n)}</b><small>${L.num(pages(w))} ص</small>${f ? `<i class="pm-f" style="width:${Math.round((f / (members.length - 1)) * 100)}%"></i>` : ''}</span>`;
      }
    }
    return `<p class="pm-note">أ — تقويم أهدى: رقم الورد وتحته عدد صفحاته، والوشوش بقت خط أخضر صغير تحت (طوله = قد إيه من الحلقة خلّصه)</p><div class="pmA">${h}</div>`;
  }

  function list() {
    const { ws, cls, pages, fins, avs, when, myCur } = ctx();
    const done = ws.filter((w) => cls(w) === 'done');
    let h = done.length ? `<div class="pm-fold">${icon('check')}<span>خلّصت ${L.count(done.length, 'wird')} (ص ${L.num(done[0].from)}–${L.num(done[done.length - 1].to)})</span><span class="lnk">اعرضهم</span></div>` : '';
    let wkLabel = '';
    const ws0 = U.weekStart();
    for (const w of ws) {
      if (cls(w) === 'done') continue;
      const wk = U.weekStart(w.start);
      const lbl = wk === ws0 ? 'الأسبوع ده' : wk === U.addDays(ws0, 7) ? 'الأسبوع الجاي' : `${L.dayShort(wk)} – ${L.dayShort(U.addDays(wk, 6))}`;
      if (lbl !== wkLabel) {
        wkLabel = lbl;
        h += `<div class="pm-wk">${lbl}</div>`;
      }
      // a day off right before this portion
      const prev = U.addDays(w.start, -1);
      if (G.isOff(prev) && prev >= U.today()) h += `<div class="pm-r off"><span>🌴</span><span>${L.day(prev)} — إجازة</span></div>`;
      const c = cls(w);
      const f = fins(w);
      h += `<div class="pm-r ${c}">${V.star(L.num(w.n), c === 'cur' ? 'gold' : c === 'late' ? 'rubric' : 'lapis')}<span class="pm-t"><b>ص ${L.num(w.from)}–${L.num(w.to)}</b><small>${L.count(pages(w), 'page')} • حوالي ${G.timeText(G.minutesFor(pages(w)))}</small></span><span class="pm-e"><small>${c === 'cur' ? 'النهارده' : when(w.start)}</small>${f.length ? avs(f) : ''}</span></div>`;
      if (U.diffDays(U.today(), w.start) > 16) break;
    }
    return `<p class="pm-note">ب — قايمة: كل ورد سطر فيه صفحاته وعددها والوقت واليوم، واللي خلّص مطوي فوق</p><div class="pmB">${h}</div>`;
  }

  function bar() {
    const { b, ws, cls, pages, fins, avs, when, myCur } = ctx();
    const total = ws[ws.length - 1].to - ws[0].from + 1;
    const segs = ws.map((w) => `<i class="${cls(w)}" style="flex:${pages(w)}" title="${w.n}"></i>`).join('');
    let ticks = '';
    for (const w of ws) if (w.n === 1 || w.n % 10 === 0) ticks += `<span style="right:${((w.from - ws[0].from) / total) * 100}%">${L.num(w.n)}</span>`;
    const cur = myCur || ws[ws.length - 1];
    const i0 = Math.max(0, ws.indexOf(cur) - 1);
    const cards = ws
      .slice(i0, i0 + 8)
      .map((w) => {
        const c = cls(w);
        const f = fins(w);
        return `<div class="pm-cd ${c}"><b>الورد ${L.num(w.n)}</b><span class="pm-p">ص ${L.num(w.from)}–${L.num(w.to)}</span><small>${L.count(pages(w), 'page')} • ${c === 'cur' ? 'النهارده' : when(w.start)}</small><span class="pm-avs">${f.slice(0, 4).map((u) => D.avatar(u, 'xs')).join('')}</span></div>`;
      })
      .join('');
    const doneP = ws.filter((w) => cls(w) === 'done').reduce((s, w) => s + pages(w), 0);
    return `<p class="pm-note">ج — الكتاب كشريط: كل ورد حتة بطول صفحاته (الأخضر خلص، الدهبي النهارده)، وتحته كروت الأوراد تتسحب يمين وشمال</p>
      <div class="pmC"><div class="pm-bar">${segs}</div><div class="pm-ticks">${ticks}</div>
      <div class="pm-here"><span>قريت ${L.num(doneP)} من ${L.count(total, 'page')}</span><span>${L.count(ws.length, 'wird')}</span></div>
      <h4>الأوراد</h4><div class="pm-cards">${cards}</div></div>`;
  }

  function week() {
    const { ws, cls, pages, fins, avs, myCur } = ctx();
    const byDay = new Map();
    for (const w of ws) for (let d = w.start; d <= w.due; d = U.addDays(d, 1)) if (!byDay.has(d)) byDay.set(d, w);
    const wk = U.weekStart();
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(wk, i);
      const w = byDay.get(d);
      const off = G.isOff(d);
      days += `<span class="pm-dy ${w ? cls(w) : ''}${off ? ' off' : ''}"><small>${L.weekday(d)}</small><b>${L.num(+d.slice(8))}</b><i>${off ? '🌴' : w ? L.num(w.n) : '—'}</i><small>${w && !off ? `${L.num(pages(w))} ص` : '&nbsp;'}</small></span>`;
    }
    const cur = myCur || ws[ws.length - 1];
    const f = fins(cur);
    let next = '';
    for (let k = 1; k <= 3; k++) {
      const a = U.addDays(wk, 7 * k), z = U.addDays(a, 6);
      const inW = ws.filter((w) => w.start >= a && w.start <= z);
      if (!inW.length) continue;
      next += `<div><b>${L.dayShort(a)} – ${L.dayShort(z)}</b><span>الأوراد ${L.num(inW[0].n)}–${L.num(inW[inW.length - 1].n)} • ص ${L.num(inW[0].from)}–${L.num(inW[inW.length - 1].to)} (${L.num(inW[inW.length - 1].to - inW[0].from + 1)} ص)</span></div>`;
    }
    return `<p class="pm-note">د — أسبوع بأسبوع: أيام الأسبوع ده فوق (رقم الورد وعدد صفحاته)، وتحتها تفاصيل اليوم اللي تختاره، والأسابيع الجاية في سطور</p>
      <div class="pmD"><div class="pm-wnav"><button class="ib">${icon('fwd', 'flip-rtl')}</button><span>${L.dayShort(wk)} – ${L.dayShort(U.addDays(wk, 6))}</span><button class="ib">${icon('back', 'flip-rtl')}</button></div>
      <div class="pm-days">${days}</div>
      <div class="pm-det"><div class="pm-top">${V.star(L.num(cur.n), 'gold')}<div><b>الورد ${L.num(cur.n)} • ص ${L.num(cur.from)}–${L.num(cur.to)}</b><small>آخر يوم النهارده</small></div></div>
        <div class="pm-facts"><span>${L.count(pages(cur), 'page')}</span><span>حوالي ${G.timeText(G.minutesFor(pages(cur)))}</span><span>${L.day(cur.start)}</span></div>
        <div class="pm-fin">${f.length ? `${avs(f, 5)}<span>خلّصوه</span>` : '<span>لسه محدش خلّصه</span>'}</div>
        <div class="row-btns"><button class="btn">${icon('play', 'flip-rtl')}اقرأ الورد</button><button class="btn ghost">${icon('chat')}النقاش</button></div></div>
      <h4 style="margin:14px 0 0">الأسابيع الجاية</h4><div class="pm-next">${next}</div></div>`;
  }

  window.PlanMock = {
    show(style) {
      const pane = document.querySelector('.tabpane');
      const keep = [...pane.children].filter((e) => e.matches('.plan-head, .plan-time, .wc-now'));
      const html = { calm, list, bar, week }[style]();
      pane.innerHTML = '';
      keep.forEach((e) => pane.appendChild(e));
      const d = document.createElement('div');
      d.innerHTML = html;
      pane.appendChild(d);
      pane.setAttribute('data-rt-skip', '1');
    },
  };
})();
