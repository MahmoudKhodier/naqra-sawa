/* Android app: the home-screen widget «وردك النهارده» (WidgetPlugin draws it).
   After the data changes (D.onChange, debounced), the app sends the widget its texts, ready in the app language:
   the main book (the one on «اليوم»), today's portion and how much of it is read, the streak and today's goal.
   Nothing happens on the web. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G, P } = A;
  const W = (A.Widget = {});
  const plug = () => (P.native ? P.plugin('Widget') : null);

  /* The main book, chosen like «اليوم» does: the reading book whose next portion of mine is due first. */
  W.primary = () => {
    const reading = [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading').sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    let primary = null;
    let best = '';
    for (const b of reading) {
      const w = G.myCurrent(b);
      const due = w ? w.due : '9999';
      if (!primary || due < best) {
        primary = b;
        best = due;
      }
    }
    return primary;
  };

  const goalText = (have, pages) =>
    have > pages
      ? L(`${L.count(have, 'page')} النهارده ✓ (الهدف ${L.num(pages)})`, `${have} pages today ✓ (goal ${pages})`, `${L.count(have, 'page')} اليوم ✓ (الهدف ${L.num(pages)})`)
      : L(`${L.num(have)} من ${L.count(pages, 'page')} النهارده`, `${have} of ${pages} pages today`, `${L.num(have)} من ${L.count(pages, 'page')} اليوم`);

  W.data = () => {
    const base = { v: 1, lang: L.lang(), rtl: L.isAr(), day: U.today() };
    if (!D.joined()) return Object.assign(base, { empty: L('افتح نقرأ سوا وادخل حلقتك', 'Open Read Together and join your circle', 'افتح نقرأ سوا وادخل حلقتك') });
    const b = W.primary();
    if (!b) return Object.assign(base, { empty: L('مفيش كتاب بنقراه دلوقتي — اختاروا كتاب سوا', 'No book being read right now — pick one together', 'لا يوجد كتاب نقرؤه الآن — اختاروا كتابًا معًا') });
    const out = Object.assign(base, { book: String(b.title || '').slice(0, 120), bookId: b.id });
    const prog = D.prog(b.id);
    const seen = prog && prog.seen;
    const last = (prog && prog.last) || 1;
    const ws = G.wirds(b);
    const w = G.myCurrent(b);
    if (w) {
      const total = w.to - w.from + 1;
      const got = Math.min(total, U.rangesCountIn(seen, w.from, w.to));
      const startAt = last >= w.from && last <= w.to ? last : w.from;
      Object.assign(out, {
        line: L(`الورد ${L.num(w.n)} • ص ${L.num(w.from)}–${L.num(w.to)}`, `Portion ${w.n} • p. ${w.from}–${w.to}`),
        short: L(`الورد ${L.num(w.n)} • ${L.num(got)} من ${L.num(total)}`, `Portion ${w.n} • ${got} of ${total}`),
        pct: Math.round((got / total) * 100),
        done: got >= total,
        progress: got >= total ? L('قريت صفحاته كلها — علّم إنك خلّصته', 'You read every page — mark it done', 'قرأت صفحاته كلها — علّم أنك أنهيته') : L(`${L.num(got)} من ${L.count(total, 'page')}`, `${got} of ${total} pages`),
        page: startAt,
        cta: startAt > w.from ? L('كمّل', 'Continue', 'تابِع') : L('يلا نقرأ', 'Start reading', 'لنقرأ'),
      });
    } else if (ws.length) {
      Object.assign(out, { line: L('خلّصت كل الأوراد!', 'All portions done!', 'أنهيت كل الأوراد!'), short: L('خلّصت كل الأوراد!', 'All portions done!', 'أنهيت كل الأوراد!'), pct: 100, done: true });
    } else {
      const pages = b.pages || 0;
      const got = pages ? Math.min(pages, U.rangesCountIn(seen, 1, pages)) : 0;
      Object.assign(out, {
        line: L('لسه مفيش خطة أوراد', 'No reading plan yet', 'لا توجد خطة أوراد بعد'),
        short: pages ? L(`ص ${L.num(last)} من ${L.num(pages)}`, `p. ${last} of ${pages}`) : L('لسه مفيش خطة', 'No plan yet', 'لا توجد خطة بعد'),
        page: last,
        cta: last > 1 ? L('كمّل', 'Continue', 'تابِع') : L('ابدأ', 'Start', 'ابدأ'),
      });
      if (pages) Object.assign(out, { pct: Math.round((got / pages) * 100), done: got >= pages, progress: L(`${L.num(got)} من ${L.count(pages, 'page')}`, `${got} of ${pages} pages`) });
    }
    const sv = G.streakView(S.me);
    if (sv.n > 0) Object.assign(out, { streak: L.num(sv.n), risk: !!sv.risk });
    if (G.goalOf) {
      const g = G.goalOf(S.me);
      if (g.on) Object.assign(out, { goal: goalText(g.have, g.pages) + (g.done ? ' 🎯' : ''), goalDone: !!g.done, goalNew: goalText(0, g.pages) });
    }
    return out;
  };

  let last = '';
  let timer = 0;
  W.push = () => {
    clearTimeout(timer);
    timer = 0;
    const p = plug();
    if (!p || !p.update || !S.me || !S.loaded.members || !S.loaded.books || !S.loaded.prog) return;
    let data;
    try {
      data = W.data();
    } catch (e) {
      return console.warn('widget', e);
    }
    const key = JSON.stringify(data);
    if (key === last) return;
    last = key;
    Promise.resolve(p.update({ data })).catch(() => (last = ''));
  };
  W.schedule = () => {
    if (!P.native || timer) return;
    timer = setTimeout(W.push, 1500);
  };
  W.clear = () => {
    const p = plug();
    last = '';
    clearTimeout(timer);
    timer = 0;
    return p && p.clear ? Promise.resolve(p.clear()).catch(() => {}) : Promise.resolve();
  };

  D.onChange(W.schedule);
  // leaving the app (home button, screen off): the widget is up to date right away
  document.addEventListener('visibilitychange', () => document.hidden && P.native && W.push());
  const setLang = L.set;
  L.set = function () {
    const r = setLang.apply(this, arguments);
    W.schedule();
    return r;
  };
})();
