/* «يوم إجازة»: days the circle doesn't read — a date (a feast, a trip) or a day every week (كل جمعة).
   Stored in meta/circle.off (see G.offCfg in game.js); the owner and admins set them from «أيام الإجازة» (the
   circle's ⋯ menu, the circle details) or by tapping a day in a plan's calendar. Setting one moves the portions
   after it by a day (G.redate), and a line goes to the circle's news and everyone's «الجديد ليك» (col 'offs':
   {by, add, date | wd, at}). On the day itself «اليوم» says so, nothing is expected and the streak waits. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Off = (A.Off = {});

  const canEdit = () => !!((S.isOwner || S.canEdit) && D.canWrite());
  /* Saturday first, like the app's weeks: the day-of-week numbers 6, 0, 1 … 5. */
  const WEEK = [6, 0, 1, 2, 3, 4, 5];
  const wdName = (d) => new Intl.DateTimeFormat(L.isAr() ? 'ar-EG' : 'en', { weekday: 'long' }).format(new Date(2026, 10, 1 + ((d - 0 + 7) % 7))); // 1 Nov 2026 is a Sunday
  Off.wdName = wdName;
  const dayName = (d) => L.day(d);

  /* The text of a change, for the news and «الجديد ليك». */
  Off.text = (o) => {
    if (o.date) return o.add ? L(`يوم ${dayName(o.date)} إجازة 🌴`, `${dayName(o.date)} is a day off 🌴`, `يوم ${dayName(o.date)} إجازة 🌴`) : L(`إجازة ${dayName(o.date)} اتلغت — يوم قراية عادي`, `${dayName(o.date)} is a reading day again`, `أُلغيت إجازة ${dayName(o.date)} — يوم قراءة عادي`);
    if (o.wd != null) return o.add ? L(`كل ${wdName(o.wd)} إجازة من دلوقتي 🌴`, `Every ${wdName(o.wd)} is a day off from now on 🌴`, `كل ${wdName(o.wd)} إجازة من الآن 🌴`) : L(`${wdName(o.wd)} رجع يوم قراية`, `${wdName(o.wd)} is a reading day again`, `عاد ${wdName(o.wd)} يوم قراءة`);
    return '';
  };

  /* Change the days off: write the circle, move the portions after them, tell everyone. */
  async function change(mut, news) {
    const c = S.circle || {};
    const cur = c.off || {};
    const next = { dates: [...(Array.isArray(cur.dates) ? cur.dates : [])], weekly: (Array.isArray(cur.weekly) ? cur.weekly : []).map((w) => Object.assign({}, w)) };
    if (mut(next) === false) return;
    next.dates = [...new Set(next.dates)].sort();
    const oldC = G.offCfg(c);
    const nc = Object.assign({}, V.clean(c), { off: next });
    const newC = G.offCfg(nc);
    try {
      await D.set('meta/circle', nc);
    } catch (e) {
      return U.toast(L('ماتحفظش. اتأكد من النت وجرّب تاني.', "Didn't save. Check your connection and try again.", 'لم يُحفظ. تأكد من الاتصال وحاول مجددًا.'), 'warn');
    }
    let moved = 0;
    for (const b of S.books.values()) {
      const r = G.redate(b, oldC, newC);
      if (!r) continue;
      moved++;
      await D.update(`books/${b.id}`, { wirds: r }).catch(() => {});
    }
    D.set(`offs/${D.newId()}`, Object.assign({ by: S.me, at: U.nowIso() }, news)).catch(() => {});
    if (A.Remind && A.Remind.reschedule) A.Remind.reschedule();
    U.toast(`${icon('calendar')}<span>${Off.text(news)}${moved ? L(' • الأوراد اتظبطت عليها', ' • the portions moved with it', ' • ضُبطت الأوراد عليها') : ''}</span>`);
  }
  Off.addDate = (d) =>
    change((n) => {
      if (d < U.today()) return false;
      n.dates.push(d);
    }, { add: true, date: d });
  Off.removeDate = (d) =>
    change((n) => {
      if (!n.dates.includes(d) || d < U.today()) return false;
      n.dates = n.dates.filter((x) => x !== d);
    }, { add: false, date: d });
  Off.setWeekly = (wd, on) => {
    const today = U.today();
    return change((n) => {
      const live = n.weekly.filter((w) => +w.d === wd && (!w.to || w.to >= today));
      if (on) {
        if (live.length) return false;
        n.weekly.push({ d: wd, from: today });
      } else {
        if (!live.length) return false;
        // from today on it's a reading day; the days off before stay as they were (streaks, goals)
        n.weekly = n.weekly.filter((w) => !(live.includes(w) && w.from >= today));
        for (const w of n.weekly) if (live.includes(w)) w.to = U.addDays(today, -1);
      }
    }, { add: on, wd });
  };

  /* «أيام الإجازة»: the days of the week and the dates to come; the owner and admins change them. */
  const sheetHtml = () => {
    const cfg = G.offCfg();
    const today = U.today();
    const weekly = new Set(G.offWeekdays(cfg));
    for (const w of cfg.weekly) if (w.from > today && !w.to) weekly.add(w.d);
    const dates = [...cfg.dates].filter((d) => d >= today).sort();
    const edit = canEdit();
    return `<div class="offs">
      <p class="muted">${L('في يوم الإجازة مفيش ورد، والسلسلة ما بتتقطعش.', 'On a day off there is no portion, and streaks wait.', 'في يوم الإجازة لا ورد، ولا تنقطع السلسلة.')} ${L('واللي يحب يقرا بتتحسبله عادي.', 'Anyone who reads still gets it counted.', 'ومن يقرأ تُحسب له قراءته كالمعتاد.')}</p>
      <h4>${icon('calendar')}${L('كل أسبوع', 'Every week', 'كل أسبوع')}</h4>
      <div class="off-wk" role="group" aria-label="${L('أيام الإجازة كل أسبوع', 'Weekly days off', 'أيام الإجازة الأسبوعية')}">${WEEK.map((d) => `<button type="button" class="off-d${weekly.has(d) ? ' on' : ''}" ${edit ? `data-wd="${d}"` : 'disabled'} aria-pressed="${weekly.has(d)}">${esc(wdName(d))}${weekly.has(d) ? ' 🌴' : ''}</button>`).join('')}</div>
      <h4>${icon('calendar')}${L('أيام معيّنة', 'Particular days', 'أيام محددة')}</h4>
      ${dates.length ? `<ul class="off-list">${dates.map((d) => `<li><span>🌴 ${esc(dayName(d))}</span>${edit ? `<button class="ib" data-rm="${d}" aria-label="${L('شيل الإجازة دي', 'Remove this day off', 'أزل هذه الإجازة')}">${icon('close')}</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted sm">${L('مفيش أيام إجازة جاية.', 'No days off coming up.', 'لا أيام إجازة قادمة.')}</p>`}
      ${edit ? `<form class="off-add row"><input type="date" id="off-date" min="${today}" value="${U.addDays(today, 1)}" required><button class="btn gold sm">${icon('plus')}${L('ضيف', 'Add', 'أضف')}</button></form>
      <p class="muted sm">${L('الأوراد اللي بعد يوم الإجازة بتتأخر يوم، والكتاب بيخلص بعد ميعاده بيوم.', 'Portions after a day off move a day later, and the book ends a day later.', 'تتأخر الأوراد التي بعد يوم الإجازة يومًا، وينتهي الكتاب بعد موعده بيوم.')}</p>` : `<p class="muted sm">${L('صاحب الحلقة والمشرفين بس يقدروا يغيّروها.', 'Only the owner and admins can change these.', 'يغيّرها صاحب الحلقة والمشرفون فقط.')}</p>`}
    </div>`;
  };
  V.offSheet = () =>
    V.sheet({
      title: `🌴 ${L('أيام الإجازة', 'Days off', 'أيام الإجازة')}`,
      html: sheetHtml(),
      onData: (body) => (body.innerHTML = sheetHtml()),
      onMount: (body) => {
        body.addEventListener('click', (e) => {
          const wd = e.target.closest('[data-wd]');
          if (wd) return Off.setWeekly(+wd.dataset.wd, !wd.classList.contains('on'));
          const rm = e.target.closest('[data-rm]');
          if (rm) return Off.removeDate(rm.dataset.rm);
        });
        body.addEventListener('submit', (e) => {
          if (!e.target.closest('.off-add')) return;
          e.preventDefault();
          const d = body.querySelector('#off-date').value;
          if (!d || d < U.today()) return;
          if (G.isOff(d)) return U.toast(L('اليوم ده إجازة أصلًا 🌴', 'That day is already off 🌴', 'هذا اليوم إجازة أصلًا 🌴'));
          Off.addDate(d);
        });
      },
    });
  V.actions['days-off'] = () => V.offSheet();

  /* A day in a plan's calendar (or from a portion's sheet). */
  V.actions['day-off'] = (a) => {
    const d = a.dataset.d;
    if (!d) return;
    const off = G.isOff(d);
    if (!canEdit() || d < U.today()) return U.toast(off ? L(`${dayName(d)} إجازة 🌴`, `${dayName(d)} is a day off 🌴`, `${dayName(d)} إجازة 🌴`) : esc(dayName(d)));
    const cfg = G.offCfg();
    const items = [];
    if (!off) items.push({ ic: 'calendar', t: L(`اعمل ${dayName(d)} إجازة 🌴`, `Make ${dayName(d)} a day off 🌴`, `اجعل ${dayName(d)} إجازة 🌴`), fn: () => Off.addDate(d) });
    else if (cfg.dates.has(d)) items.push({ ic: 'close', t: L(`شيل إجازة ${dayName(d)}`, `Remove the day off on ${dayName(d)}`, `أزل إجازة ${dayName(d)}`), fn: () => Off.removeDate(d) });
    items.push({ ic: 'list', t: L('كل أيام الإجازة', 'All days off', 'كل أيام الإجازة'), fn: () => V.offSheet() });
    V.menu(items);
  };
  // a portion's sheet opened from a day of the calendar: that day can be made a day off from there too
  const wird = V.actions.wird;
  V.actions.wird = (a) => {
    wird(a);
    const d = a.dataset && a.dataset.d;
    if (!d || !canEdit() || d < U.today() || G.isOff(d)) return;
    const api = V.sheets[V.sheets.length - 1];
    if (!api || !api.body) return;
    const row = document.createElement('div');
    row.className = 'off-row';
    row.innerHTML = `<button class="btn ghost sm" data-act="day-off-set" data-d="${d}" data-close>🌴 ${L(`اعمل ${dayName(d)} إجازة`, `Make ${dayName(d)} a day off`, `اجعل ${dayName(d)} إجازة`)}</button>`;
    api.body.appendChild(row);
  };
  V.actions['day-off-set'] = (a) => Off.addDate(a.dataset.d);

  /* «اليوم»: a day off today, or tomorrow. */
  V.offBanner = () => {
    const today = U.today();
    if (G.isOff(today))
      return `<section class="card off-banner"><span class="ob-ic" aria-hidden="true">🌴</span><div><b>${L('النهارده إجازة', 'Day off today', 'اليوم إجازة')}</b><p class="muted sm">${L('مفيش ورد مطلوب، وسلسلتك في أمان.', 'No portion today, and your streak is safe.', 'لا ورد مطلوب، وسلسلتك في أمان.')} ${L('ولو حبيت تقرا، بتتحسبلك عادي.', 'If you feel like reading, it still counts.', 'وإن قرأت تُحسب لك كالمعتاد.')}</p></div></section>`;
    const tom = U.addDays(today, 1);
    if (G.isOff(tom)) return `<p class="off-next" data-act="days-off">🌴 ${L('بكره إجازة', 'Tomorrow is a day off', 'غدًا إجازة')}</p>`;
    return '';
  };

  /* The news and «الجديد ليك». */
  Off.items = () => [...(S.offs || new Map()).values()].filter((o) => o && o.at && S.members.has(o.by));

  // the reminders follow the days off as they come in
  let seenOff = null;
  const onData = () => {
    const k = JSON.stringify((S.circle && S.circle.off) || null);
    if (seenOff !== null && k !== seenOff && A.Remind && A.Remind.reschedule) A.Remind.reschedule();
    seenOff = k;
  };
  V.after = V.after || [];
  V.after.push(onData);
})();
