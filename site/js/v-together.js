/* The circle together: a book everyone finished moves to «خلّصناها», the whole circle reading today
   («الحلقة كاملة»), and the circle's week on Fridays. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;

  const members = () => D.memberIds().filter((u) => S.members.has(u));
  const pagesOn = (uid, day) => {
    const m = S.members.get(uid);
    return (m && m.days && +m.days[day]) || 0;
  };

  /* ---------- a book the whole circle finished ---------- */
  const finishedBy = (b) => members().filter((u) => {
    const p = D.prog(b.id, u);
    return p && p.finished;
  });
  function allDoneCard() {
    const ms = members();
    if (ms.length < 2) return '';
    const books = [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading');
    let out = '';
    for (const b of books) {
      const fin = finishedBy(b);
      if (fin.length === ms.length) {
        if (U.store.get('allDoneSeen:' + b.id, '') !== 'hide') {
          if (!U.store.get('allDoneSeen:' + b.id, '')) {
            U.store.set('allDoneSeen:' + b.id, U.today());
            setTimeout(() => {
              U.confetti(1.4);
              U.chime('big');
            }, 400);
          }
          out += `<section class="card together-done">${V.cover ? V.cover(b, 'sm') : ''}<div>
            <small class="eyebrow">${icon('trophy')}${L('الحلقة كلها خلّصته!', 'The whole circle finished it!', 'أنهته الحلقة كلها!')}</small>
            <h3 dir="auto">«${esc(b.title)}»</h3>
            <p class="muted">${L(`${L.count(ms.length, 'member')} وصلوا للآخر. برافو عليكم! 🎉`, `All ${ms.length} members reached the end. Well done! 🎉`, `وصل ${L.count(ms.length, 'member', 'nom')} إلى النهاية. أحسنتم! 🎉`)}</p>
            <div class="row-btns">${D.canWrite() ? `<button class="btn gold sm" data-act="to-done" data-b="${esc(b.id)}">${icon('check')}${L('انقلوه لـ«خلّصناها»', 'Move it to “Finished together”', 'انقلوه إلى «أنهيناها»')}</button>` : ''}<button class="btn ghost sm" data-act="to-done-later" data-b="${esc(b.id)}">${L('بعدين', 'Later', 'لاحقًا')}</button></div>
          </div></section>`;
        }
      } else if (fin.length && ms.length - fin.length <= 2 && fin.includes(S.me)) {
        // almost there: how many are left, never who
        out += `<section class="card together-almost">${icon('users')}<span>${L(`«${esc(b.title)}»: فاضل ${L.count(ms.length - fin.length, 'member')} ويخلّص الكل`, `“${esc(b.title)}”: ${ms.length - fin.length} more and everyone's done`, `«${esc(b.title)}»: بقي ${L.count(ms.length - fin.length, 'member', 'nom')} ويُنهيه الجميع`)}</span></section>`;
      }
    }
    return out;
  }
  V.actions['to-done'] = async (a) => {
    const b = S.books.get(a.dataset.b);
    if (!b) return;
    await D.update(`books/${b.id}`, { status: 'done', doneAt: U.nowIso() });
    U.confetti(1);
    U.chime('ok');
    U.toast(L(`«${esc(b.title)}» بقى في «خلّصناها» 🏆`, `“${esc(b.title)}” is now in “Finished together” 🏆`, `«${esc(b.title)}» صار في «أنهيناها» 🏆`));
  };
  V.actions['to-done-later'] = (a) => {
    U.store.set('allDoneSeen:' + a.dataset.b, 'hide');
    V.render();
  };
  V.addSection('home', { order: 5, render: () => allDoneCard() });

  /* ---------- the whole circle reading today ---------- */
  /* Days on which every current member read (game.js has it too, for the «الحلقة كاملة» badge). */
  const fullDays = () => {
    if (G.circleFullDays) return G.circleFullDays();
    const ms = members();
    if (ms.length < 2) return [];
    const days = new Set();
    for (const u of ms) for (const [d, n] of Object.entries((S.members.get(u) || {}).days || {})) if (+n > 0) days.add(d);
    return [...days].filter((d) => ms.every((u) => pagesOn(u, d) > 0)).sort();
  };
  V.circleFullRun = () => {
    const set = new Set(fullDays());
    let run = 0;
    let d = set.has(U.today()) ? U.today() : U.addDays(U.today(), -1);
    while (set.has(d)) {
      run++;
      d = U.addDays(d, -1);
    }
    return run;
  };
  function todayCard() {
    const ms = members();
    if (ms.length < 2) return '';
    const today = U.today();
    const done = ms.filter((u) => pagesOn(u, today) > 0);
    const all = done.length === ms.length;
    if (all && U.store.get('fullDay', '') !== today) {
      U.store.set('fullDay', today);
      setTimeout(() => {
        U.confetti(1);
        U.chime('big');
      }, 500);
    }
    const run = V.circleFullRun();
    return `<section class="card together-today${all ? ' full' : ''}">
      <header class="sec-h"><h3>${icon('users')}${all ? L('الحلقة كاملة النهارده! 🎉', 'The whole circle read today! 🎉', 'الحلقة كاملة اليوم! 🎉') : L('قراية الحلقة النهارده', "The circle's reading today", 'قراءة الحلقة اليوم')}</h3><small class="muted">${L(`${L.num(done.length)} من ${L.num(ms.length)}`, `${done.length} of ${ms.length}`)}</small></header>
      ${V.bar(done.length / ms.length, all ? 'jade big' : 'gold big')}
      ${done.length ? `<div class="tt-avs">${done.map((u) => `<span title="${esc(D.name(u))}">${D.avatar(u, 'sm')}</span>`).join('')}</div>` : ''}
      <p class="muted sm">${all ? (run > 1 ? L(`${L.count(run, 'day')} ورا بعض والحلقة كاملة 🔥`, `${run} days in a row with everyone reading 🔥`, `${L.count(run, 'day', 'nom')} متتالية والحلقة كاملة 🔥`) : L('كل واحد قرأ صفحة على الأقل. شارة «الحلقة كاملة» بتعدّ الأيام دي.', 'Everyone read at least a page. The “Whole circle” badge counts these days.', 'قرأ الجميع صفحة على الأقل. شارة «الحلقة كاملة» تَعُدّ هذه الأيام.')) : pagesOn(S.me, today) ? L('قريت النهارده ✓ — شجّع الباقيين من صفحة الحلقة.', 'You read today ✓ — cheer the others on from the circle page.', 'قرأت اليوم ✓ — شجّع الباقين من صفحة الحلقة.') : L('صفحة واحدة منك وتقرّب الحلقة إنها تبقى كاملة النهارده.', 'One page from you brings the circle closer to a full day.', 'صفحة واحدة منك تقرّب الحلقة من يوم كامل.')}</p>
    </section>`;
  }
  V.addSection('home-side', { order: 10, render: () => (D.canWrite() ? todayCard() : '') });
  V.addSection('circle-news', { order: 10, render: () => todayCard() + recapCard() });

  /* ---------- the circle's week, every Friday (the week runs Saturday → Friday) ---------- */
  const weekOf = (ws) => {
    const we = U.addDays(ws, 6);
    const inWeek = (iso) => {
      const k = U.isoKey(iso);
      return k >= ws && k <= we;
    };
    const ms = members();
    const rows = ms
      .map((u) => {
        let pages = 0, days = 0;
        for (let i = 0; i < 7; i++) {
          const n = pagesOn(u, U.addDays(ws, i));
          pages += n;
          if (n > 0) days++;
        }
        return { u, pages, days };
      })
      .sort((a, b) => b.pages - a.pages);
    const full = fullDays().filter((d) => d >= ws && d <= we).length;
    let portions = 0;
    for (const p of S.prog.values()) for (const t of Object.values(p.done || {})) if (t && inWeek(t)) portions++;
    let best = null;
    for (const n of S.notes.values()) {
      if (!n.text || !inWeek(n.at) || n.kind === 'take') continue;
      const likes = V.likeCount ? V.likeCount(n) : 0;
      if (!best || likes > best.likes || (likes === best.likes && n.kind === 'quote')) best = { n, likes };
    }
    const open = [...S.notes.values()].filter((n) => n.kind === 'q' && !Object.keys(n.replies || {}).length && D.book(n.b)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3);
    const finished = [...S.books.values()].filter((b) => b.doneAt && inWeek(b.doneAt));
    return { ws, we, rows, total: rows.reduce((t, r) => t + r.pages, 0), full, portions, best, open, finished };
  };
  V.circleRecap = (ws) => {
    const w = weekOf(ws);
    const max = Math.max(1, ...w.rows.map((r) => r.pages));
    const me = w.rows.findIndex((r) => r.u === S.me);
    V.sheet({
      title: L(`أسبوع الحلقة • ${L.dayShort(w.ws)} – ${L.dayShort(w.we)}`, `The circle's week • ${L.dayShort(w.ws)} – ${L.dayShort(w.we)}`, `أسبوع الحلقة • ${L.dayShort(w.ws)} – ${L.dayShort(w.we)}`),
      cls: 'celebrate',
      html: `<div class="recap circle-recap">
        <div class="ss-stats">
          <div><b>${L.num(w.total)}</b><small>${L('صفحة مع بعض', 'pages together', 'صفحة معًا')}</small></div>
          <div><b>${L.num(w.portions)}</b><small>${L('ورد خلص', 'portions done', 'وردًا منجزًا')}</small></div>
          <div class="${w.full ? 'jade-t' : ''}"><b>${L.num(w.full)}</b><small>${L('يوم الحلقة كاملة', 'full-circle days', 'يوم الحلقة كاملة')}</small></div>
        </div>
        <ol class="cr-rows">${w.rows
          .map((r, i) => `<li${r.u === S.me ? ' class="me"' : ''}><span class="cr-n">${L.num(i + 1)}</span>${D.avatar(r.u, 'sm')}<span class="cr-t"><b>${esc(D.name(r.u))}</b><small>${L(`${L.count(r.pages, 'page')} • قراية في ${L.count(r.days, 'day')}`, `${r.pages} pages • read on ${r.days} ${r.days === 1 ? 'day' : 'days'}`, `${L.count(r.pages, 'page')} • قراءة في ${L.count(r.days, 'day')}`)}</small></span><i class="cr-bar" style="--f:${r.pages / max}"></i></li>`)
          .join('')}</ol>
        ${me >= 0 ? `<p class="muted">${me === 0 && w.rows[0].pages ? L('كنت الأول الأسبوع ده! 🏆', 'You topped the circle this week! 🏆', 'كنت الأول هذا الأسبوع! 🏆') : L(`مكانك: ${L.num(me + 1)} من ${L.num(w.rows.length)}`, `You: #${me + 1} of ${w.rows.length}`, `مكانك: ${L.num(me + 1)} من ${L.num(w.rows.length)}`)}</p>` : ''}
        ${w.finished.length ? `<p class="gold-t">${icon('trophy')}${L('خلّصنا:', 'We finished:', 'أنهينا:')} ${w.finished.map((b) => `«${esc(b.title)}»`).join('، ')}</p>` : ''}
        ${w.best ? `<div class="recap-best"><small class="eyebrow">${L('أحلى حاجة اتكتبت الأسبوع ده', 'Best thing written this week', 'أجمل ما كُتب هذا الأسبوع')}</small>${V.noteCard(w.best.n, { showBook: true })}</div>` : ''}
        ${w.open.length ? `<div class="cr-open"><small class="eyebrow">${L('أسئلة لسه مستنية رد', 'Questions still waiting for an answer', 'أسئلة ما زالت تنتظر ردًا')}</small>${w.open.map((n) => V.noteCard(n, { showBook: true })).join('')}</div>` : ''}
        <button class="btn gold full" data-close autofocus>${L('يلا على الأسبوع الجاي', 'On to next week', 'هيا إلى الأسبوع القادم')}</button>
      </div>`,
    });
  };
  // Friday: this week's recap; later in the week: last week's, if it hasn't been seen.
  const recapWeek = () => {
    const ws = U.weekStart();
    return U.parseD(U.today()).getDay() === 5 ? ws : U.addDays(ws, -7);
  };
  function recapCard() {
    const ws = recapWeek();
    const w = weekOf(ws);
    if (!w.total) return '';
    return `<button class="card recap-card" data-act="circle-recap" data-ws="${ws}">${icon('sparkle')}<span><b>${ws === U.weekStart() ? L('ملخص الحلقة للأسبوع ده جاهز', "This week's circle recap is ready", 'ملخص الحلقة لهذا الأسبوع جاهز') : L('ملخص الحلقة للأسبوع اللي فات', "Last week's circle recap", 'ملخص الحلقة للأسبوع الماضي')}</b><small>${L(`${L.count(w.total, 'page')} مع بعض`, `${w.total} pages together`, `${L.count(w.total, 'page')} معًا`)}</small></span>${icon('fwd', 'flip-rtl')}</button>`;
  }
  V.actions['circle-recap'] = (a) => V.circleRecap(a.dataset.ws);
  // Shown by itself once per week (instead of the old Saturday recap of my own numbers).
  V.checkRecap = () => {
    const ws = recapWeek();
    const key = 'circleRecap:' + S.me;
    if (U.store.get(key, '') === ws) return;
    const w = weekOf(ws);
    if (!w.total) return;
    U.store.set(key, ws);
    setTimeout(() => !V.sheets.length && V.circleRecap(ws), 1500);
  };
})();
