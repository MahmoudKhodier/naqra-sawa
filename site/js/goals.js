/* Personal motivation: the daily goal that grows (and its settings), the daily / weekly streak setting,
   and one-time celebrations of firsts. The numbers come from game.js (G.goalOf, G.goalNext, G.streakView). */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const V = A.V;
  const icon = U.icon;
  const Goals = (A.Goals = {});

  const ready = () =>
    D.joined() && D.canWrite() && ['members', 'books', 'prog', 'notes', 'shelf', 'pokes', 'priv', 'myProg'].every((k) => S.loaded[k]);

  /* ---------- settings rows (in «إعدادات» → القراءة) ---------- */
  const seg = (act, cur, opts) => `<div class="seg sm">${opts.map(([k, t]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${t}</button>`).join('')}</div>`;
  V.goalSettings = () => {
    if (!D.joined() || !D.canWrite()) return '';
    const g = G.goalOf(S.me);
    const mode = !g.on ? 'off' : g.auto ? 'auto' : 'num';
    const sp = G.streakPref(S.me);
    const goalSub = mode === 'auto'
      ? L(`دلوقتي ${L.count(g.pages, 'page')} — بيكبر لما تحققه ٥ أيام من ٧`, `Now ${g.pages} pages — grows when you hit it 5 days out of 7`, `حاليًا ${L.count(g.pages, 'page')} — يزيد عندما تحققه ٥ أيام من ٧`)
      : mode === 'num'
        ? L('عدد صفحات ثابت كل يوم', 'The same number of pages every day', 'عدد صفحات ثابت كل يوم')
        : L('مش هيظهر في «اليوم»', 'Not shown on «Today»', 'لن يظهر في «اليوم»');
    const streakSub = sp.mode === 'week'
      ? L(`أسابيع ورا بعض فيها ${L.count(sp.n, 'day')} قراية على الأقل`, `Weeks in a row with at least ${sp.n} reading day${sp.n === 1 ? '' : 's'}`, `أسابيع متتالية فيها ${L.count(sp.n, 'day')} قراءة على الأقل`)
      : L('كل يوم تقرأ فيه ولو صفحة', 'Every day you read at least a page', 'كل يوم تقرأ فيه ولو صفحة');
    return `<div class="set-row" id="set-goal-row"><span>${icon('target')}<span>${L('هدف يومي', 'Daily goal')}<small class="muted">${goalSub}</small></span></span>${seg('goal-mode', mode, [['off', L('مقفول', 'Off', 'متوقف')], ['auto', L('تلقائي', 'Auto')], ['num', L('رقم', 'Number', 'عدد')]])}</div>
      ${mode === 'num' ? `<div class="set-row sub"><label for="set-goal-n">${L('صفحات في اليوم', 'Pages a day')}</label><input id="set-goal-n" class="set-num" type="number" min="1" max="500" inputmode="numeric" value="${g.pages}"></div>` : ''}
      <div class="set-row" id="set-streak-row"><span>${icon('flame')}<span>${L('السلسلة', 'Streak')}<small class="muted">${streakSub}</small></span></span>${seg('streak-mode', sp.mode, [['day', L('يومية', 'Daily')], ['week', L('أسبوعية', 'Weekly')]])}</div>
      ${sp.mode === 'week' ? `<div class="set-row sub"><label for="set-streak-n">${L('أيام القراية في الأسبوع', 'Reading days a week', 'أيام القراءة في الأسبوع')}</label><select id="set-streak-n" class="set-num">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === sp.n ? 'selected' : ''}>${L.num(n)}</option>`).join('')}</select></div>` : ''}`;
  };
  V.actions['goal-mode'] = async (a) => {
    const v = a.dataset.v;
    const g = G.goalOf(S.me);
    const today = U.today();
    const body = v === 'off' ? { auto: false, pages: 0, at: today } : v === 'auto' ? { auto: true, pages: g.on && g.auto ? g.pages : G.goalStart(S.me), at: today } : { auto: false, pages: g.on ? g.pages : G.goalStart(S.me), at: today };
    await D.updateMe(() => ({ goalDaily: body }));
  };
  V.actions['streak-mode'] = async (a) => {
    const sp = G.streakPref(S.me);
    await D.updateMe(() => ({ streakPref: { mode: a.dataset.v === 'week' ? 'week' : 'day', n: sp.n } }));
  };
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'set-goal-n') {
      const n = U.clamp(Math.round(+e.target.value || 0), 1, 500);
      e.target.value = n;
      await D.updateMe(() => ({ goalDaily: { auto: false, pages: n, at: U.today() } }));
      U.toast(L(`هدفك بقى ${L.count(n, 'page')} في اليوم`, `Your goal is now ${n} pages a day`, `أصبح هدفك ${L.count(n, 'page')} في اليوم`));
    }
    if (e.target.id === 'set-streak-n') {
      const n = U.clamp(Math.round(+e.target.value || 3), 1, 7);
      await D.updateMe(() => ({ streakPref: { mode: 'week', n } }));
    }
  });

  /* ---------- the goal: grow / ease once a day, celebrate when hit ---------- */
  let evalDay = '';
  Goals.evalGoal = async (force) => {
    if (!ready()) return null;
    const today = U.today();
    if (evalDay === today && !force) return null;
    evalDay = today;
    const m = S.members.get(S.me) || {};
    const g = G.goalOf(S.me);
    const next = G.goalNext(g, m.days || {}, today);
    if (!next) return null;
    const body = { auto: true, pages: next.pages, at: next.at };
    await D.updateMe(() => ({ goalDaily: body }));
    if (next.dir === 'up') {
      U.chime('ok');
      U.toast(`${icon('target')}<span><b>${L('هدفك اليومي كبر!', 'Your daily goal grew!', 'كبر هدفك اليومي!')}</b> ${L(`حققته ${L.num(next.hits)} أيام من ٧، فبقى ${L.count(next.pages, 'page')}`, `You hit it ${next.hits} days out of 7, so it's now ${next.pages} pages`, `حققته ${L.num(next.hits)} أيام من ٧، فأصبح ${L.count(next.pages, 'page')}`)}</span>`, 'gold');
    } else if (next.dir === 'down') {
      U.toast(`${icon('target')}<span>${L(`خففنا هدفك لـ${L.count(next.pages, 'page')} — على راحتك، وهيكبر تاني معاك`, `We eased your goal to ${next.pages} pages — no rush, it will grow again with you`, `خففنا هدفك إلى ${L.count(next.pages, 'page')} — على مهلك، وسيكبر معك من جديد`)}</span>`);
    }
    return next;
  };

  let goalSeen = false;
  function goalCheck() {
    const g = G.goalOf(S.me);
    const key = 'goalHit:' + S.me;
    const today = U.today();
    if (!g.on || !g.done) {
      goalSeen = true;
      return;
    }
    if (U.store.get(key, '') === today) return;
    U.store.set(key, today);
    if (!goalSeen) {
      goalSeen = true; // already hit when the app opened (maybe on another device): no fuss
      return;
    }
    Goals.hits = (Goals.hits || 0) + 1;
    U.confetti(0.6);
    U.chime('ok');
    U.toast(`${icon('target')}<span><b>${L('هدف النهارده اتحقق!', "Today's goal done!", 'تحقق هدف اليوم!')}</b> ${L(`${L.count(g.pages, 'page')} 🎯 تسلم إيدك`, `${g.pages} pages 🎯 nicely done`, `${L.count(g.pages, 'page')} 🎯 أحسنت`)}</span>`, 'gold');
  }

  /* ---------- firsts: celebrated once, across devices (my private doc: firsts {key: day}) ---------- */
  /* Each first knows the day it happened (''= not yet), so something that happened before the feature first ran
     on this account (or arrives late from another device) is marked seen quietly instead of celebrated. */
  const privNotes = () => Object.values((S.priv && S.priv.notes) || {}).filter(Boolean);
  const myProgs = () => [...S.prog.values()].filter((p) => p.u === S.me).concat([...S.myProg.values()]);
  const earliest = (list) => list.filter((t) => typeof t === 'string' && t).map((t) => (t.length === 10 ? t : U.isoKey(t))).sort()[0] || '';
  const myDays = () => {
    const d = (S.members.get(S.me) || {}).days || {};
    return Object.keys(d).filter((k) => +d[k] > 0 && k <= U.today()).sort().map((k) => [k, +d[k]]);
  };
  const FIRSTS = [
    { k: 'pages10', ic: 'scroll',
      at: () => {
        let n = 0;
        for (const [k, v] of myDays()) if ((n += v) >= 10) return k;
        return '';
      },
      t: ['أول ١٠ صفحات!', 'Your first 10 pages!'],
      p: ['دي أول ١٠ صفحات تقراها هنا. البداية دايمًا أصعب حاجة، وإنت عدّيتها.', "The first ten pages are the hardest part. You're past them.", 'هذه أول ١٠ صفحات تقرؤها هنا. البداية أصعب ما في الأمر، وقد تجاوزتها.'] },
    { k: 'wird', ic: 'check', at: () => earliest(myProgs().flatMap((p) => Object.values(p.done || {}))),
      t: ['أول ورد خلّصته!', 'Your first portion done!', 'أول ورد أنهيته!'],
      p: ['ورد كامل من أوله لآخره. كده العادة بتتبني.', "A whole portion, start to finish. That's how a habit is built.", 'ورد كامل من أوله إلى آخره. هكذا تُبنى العادة.'] },
    { k: 'book', ic: 'trophy',
      at: () => {
        const month = U.today().slice(0, 7);
        const shelf = Object.values(((S.shelf.get(S.me) || {}).items) || {}).filter((it) => it && it.status === 'read' && !it.src && !it.together && String(it.finished || '') === month);
        return earliest([...myProgs().map((p) => p.finished), ...shelf.map((it) => it.updatedAt || it.at)]);
      },
      t: ['أول كتاب تخلّصه هنا!', 'Your first finished book!', 'أول كتاب تنهيه هنا!'],
      p: ['كتاب كامل! ده إنجاز بجد.', "A whole book! That's a real achievement.", 'كتاب كامل! هذا إنجاز حقيقي.'] },
    { k: 'streak7', ic: 'flame',
      // the first 7 days in a row can't lean on a freeze (the first freeze comes with them)
      at: () => {
        const act = [...G.of(S.me).active].filter((d) => d <= U.today()).sort();
        let run = 0, prev = '';
        for (const d of act) {
          run = prev && U.addDays(prev, 1) === d ? run + 1 : 1;
          prev = d;
          if (run >= 7) return d;
        }
        return '';
      },
      t: ['أول ٧ أيام ورا بعض!', 'Your first 7-day streak!', 'أول ٧ أيام متتالية!'],
      p: ['أسبوع كامل من غير ما تقطع — وكسبت «حماية» للسلسلة كمان.', 'A whole week without a break — and you earned a streak freeze too.', 'أسبوع كامل بلا انقطاع — وكسبت «حماية» للسلسلة أيضًا.'] },
    { k: 'quote', ic: 'quote',
      at: () => earliest([...[...S.notes.values()].filter((n) => n.by === S.me && n.kind === 'quote'), ...privNotes().filter((n) => n.kind === 'quote')].map((n) => n.at || U.nowIso())),
      t: ['أول اقتباس!', 'Your first quote!'],
      p: ['جملة عجبتك وحفظتها. هترجعلها وقت ما تحب.', 'A line you loved, saved for whenever you want it again.', 'جملة أعجبتك وحفظتها. ستعود إليها متى شئت.'] },
    { k: 'cheer', ic: 'clap', at: () => earliest([...S.pokes.values()].filter((x) => x.from === S.me).map((x) => x.at)),
      t: ['أول تشجيع منك!', 'Your first cheer!'],
      p: ['كلمة حلوة بتفرق مع صحابك أكتر ما تتخيل.', 'A kind word means more to friends than you would think.', 'الكلمة الطيبة تصنع فرقًا لدى أصدقائك أكثر مما تتخيل.'] },
  ];
  Goals.FIRSTS = FIRSTS.map((f) => f.k);
  const shown = new Set(); // this session, before the private doc comes back
  let initDone = false;
  let showing = false;
  const queue = [];

  function firstsCheck() {
    const have = S.priv && S.priv.firsts;
    const today = U.today();
    if (!have) {
      // First run since this shipped: whatever is already achieved counts as seen, without a party.
      if (initDone) return;
      initDone = true;
      const seen = { _since: today };
      for (const f of FIRSTS) if (f.at()) seen[f.k] = today;
      D.privUpdate((cur) => Object.assign(cur, { firsts: Object.assign(seen, cur.firsts || {}) })).catch(() => (initDone = false));
      for (const k of Object.keys(seen)) shown.add(k);
      return;
    }
    const since = have._since || today;
    const quiet = {};
    for (const f of FIRSTS) {
      if (have[f.k] || shown.has(f.k)) continue;
      const at = f.at();
      if (!at) continue;
      shown.add(f.k);
      if (at < since) quiet[f.k] = today; // history that showed up late
      else queue.push(Object.assign({ seenAt: Date.now() }, f));
    }
    if (Object.keys(quiet).length) D.privUpdate((cur) => Object.assign(cur, { firsts: Object.assign({}, quiet, cur.firsts) })).catch(() => {});
    showNext();
  }
  function showNext() {
    if (showing || !queue.length) return;
    if ((A.R && A.R.isOpen()) || (V.sheets && V.sheets.length)) return; // after the reader / the open sheet
    if (Date.now() - queue[0].seenAt < 1500) return; // let the app's own sheet (e.g. «خلّصت الكتاب!») open first
    const f = queue.shift();
    showing = true;
    const today = U.today();
    D.privUpdate((cur) => Object.assign(cur, { firsts: Object.assign({}, cur.firsts, { [f.k]: today }) })).catch(() => {});
    U.confetti(1.2);
    U.chime('big');
    const api = V.sheet({
      title: L('أول مرة!', 'A first!'),
      cls: 'celebrate',
      html: `<div class="celeb first-celeb" data-first="${f.k}"><span class="first-ic">${icon(f.ic)}</span><h2>${L(...f.t)}</h2><p>${L(...f.p)}</p><button class="btn gold" data-close autofocus>${L('يلا نكمّل', 'Keep going', 'لنواصل')}</button></div>`,
    });
    api.onClose = () => {
      showing = false;
      setTimeout(showNext, 600);
    };
  }
  Goals.pending = () => queue.map((f) => f.k);

  /* ---------- run after every render (wraps V.celebrate) and every few seconds for queued firsts ---------- */
  function tick() {
    if (Goals.off || !ready()) return; // tests of other things switch these celebrations off
    try {
      Goals.evalGoal().catch((e) => console.warn('goal', e));
      goalCheck();
      firstsCheck();
    } catch (e) {
      console.warn('goals', e);
    }
  }
  Goals.tick = tick;
  const celebrate = V.celebrate;
  V.celebrate = function () {
    const r = celebrate.apply(this, arguments);
    tick();
    return r;
  };
  setInterval(() => queue.length && showNext(), 1000);
})();
