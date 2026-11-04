/* Game layer: XP, levels, streaks, daily quests and badges.
   Everything is DERIVED from shared data (no counters are stored), so every viewer computes the same numbers. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const G = (A.G = {});

  G.XP = { page: 1, wird: 20, onTime: 10, first: 10, note: 5, take: 8, reply: 2, liked: 2, shelf: 10, review: 5, book: 100, cheer: 1, quests: 30, bonus: 20, chestXp: 15, bigChest: 100, gold: 15, boss: 50, head: 3 };
  G.HEAD_Q = '2026-11-06'; // the daily quest «حط عنوان للورد ده» from this day (older apps can't show it)
  /* The golden page of a portion: a page of it (never the first), different for each member and portion. Found
     when read; recorded on the member doc (gold["book|portion"] = day). Portions of 4 pages or more. */
  G.goldenPage = (bookId, w, uid = S.me) => {
    const size = w.to - w.from + 1;
    if (size < 4) return 0;
    return w.from + 1 + (U.hash(uid + '|gold|' + bookId + '|' + w.id) % (size - 1));
  };
  /* Daily quests from this day on are made from what each member is reading (quests.js) and recorded on the
     member doc when done (questDays[day] = {b: bonus done}); days before keep the old picked-at-random quests. */
  G.QUEST_V2 = '2026-11-02'; // the day the new quests went out (keep it no earlier than that)
  /* What a day's chest holds besides its XP, the same on every phone: a streak freeze, extra XP, or just wisdom. */
  G.chestReward = (uid, day) => {
    const r = U.hash(uid + '|chest|' + day) % 10;
    return r < 2 ? 'fz' : r < 5 ? 'xp' : 'wisdom';
  };
  G.BIG_CHEST_DAYS = 5; // days with all quests in one week (Saturday to Friday) for the big chest

  /* ---------- days off («يوم إجازة») ----------
     meta/circle.off = { dates: ['2026-11-10', …], weekly: [{ d: 5, from: '2026-11-03', to?: '…' }, …] }
     (d = the day of the week as Date.getDay: 0 Sunday … 5 Friday, 6 Saturday). A weekly day off counts from the
     day it was set and, once taken off, only until the day before; dates are added for today or later. On a day
     off nothing is expected: portions skip it, streaks wait over it, goals and quests don't count it. Reading on
     it still counts as usual. Owner and admins set it (circle settings, or a day in the plan calendar). */
  G.offCfg = (c = S.circle) => {
    const o = (c && c.off) || {};
    const dates = new Set((Array.isArray(o.dates) ? o.dates : []).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)));
    const weekly = (Array.isArray(o.weekly) ? o.weekly : []).filter((w) => w && w.d >= 0 && w.d <= 6 && w.from).map((w) => ({ d: +w.d, from: w.from, to: w.to || '' }));
    return { dates, weekly, none: !dates.size && !weekly.length };
  };
  G.isOff = (d, cfg = G.offCfg()) => {
    if (cfg.none) return false;
    if (cfg.dates.has(d)) return true;
    if (!cfg.weekly.length) return false;
    const dow = U.parseD(d).getDay();
    return cfg.weekly.some((w) => w.d === dow && d >= w.from && (!w.to || d <= w.to));
  };
  G.offToday = () => G.isOff(U.today());
  /* Weekly days off in force now (for the settings and texts): [5] for «كل جمعة». */
  G.offWeekdays = (cfg = G.offCfg(), day = U.today()) => [...new Set(cfg.weekly.filter((w) => day >= w.from && (!w.to || day <= w.to)).map((w) => w.d))].sort();
  /* Reading days from a to b, both included. */
  G.workDays = (a, b, cfg = G.offCfg()) => {
    let n = 0;
    for (let d = a, i = 0; d <= b && i < 4000; d = U.addDays(d, 1), i++) if (!G.isOff(d, cfg)) n++;
    return n;
  };
  /* The first reading day on or after d. */
  G.nextOn = (d, cfg = G.offCfg()) => {
    for (let i = 0; i < 60 && G.isOff(d, cfg); i++) d = U.addDays(d, 1);
    return d;
  };
  /* The day the n-th reading day falls on, counting from d (d itself counts when it's a reading day). */
  G.endAfter = (d, n, cfg = G.offCfg()) => {
    let k = 0;
    for (let i = 0; i < 4000; i++, d = U.addDays(d, 1)) if (!G.isOff(d, cfg) && ++k >= n) return d;
    return d;
  };
  /* n reading days after d (0: d itself). */
  G.addWork = (d, n, cfg = G.offCfg()) => {
    for (let i = 0; n > 0 && i < 4000; i++) {
      d = U.addDays(d, 1);
      if (!G.isOff(d, cfg)) n--;
    }
    return d;
  };
  G.weeklyOnly = (cfg) => ({ dates: new Set(), weekly: cfg.weekly, none: !cfg.weekly.length });
  /* The day a portion that starts on s ends: `len` reading days for a short one; a week-long one (calendar
     days `cal`) stays that week, a holiday inside it adding a day. */
  G.wirdEnd = (s, len, cal, cfg = G.offCfg()) => (cal >= 7 ? G.endAfter(s, G.workDays(s, U.addDays(s, cal - 1), G.weeklyOnly(cfg)), cfg) : G.endAfter(s, len, cfg));
  /* A book's portions laid out again after the days off changed (old → new): the ones already past stay; one
     under way keeps its first day; each keeps its length in reading days (a week-long one its week). null when
     nothing moves. */
  G.redate = (book, oldC, newC, today = U.today()) => {
    const ws = G.wirds(book);
    if (!ws.length) return null;
    const out = [];
    let prevOld = null, prevNew = null, changed = false;
    for (const w of ws) {
      if (w.due < today) {
        out.push(w);
        prevOld = prevNew = w.due;
        continue;
      }
      const cal = U.diffDays(w.start, w.due) + 1;
      let held = 0;
      if (cal >= 7) for (const d of oldC.dates) if (d >= w.start && d <= w.due) held++;
      const len = cal >= 7 ? cal - held : Math.max(1, G.workDays(w.start, w.due, oldC));
      let start;
      if (w.start < today) start = w.start;
      else if (prevOld) {
        // right after the one before (in its new place), keeping any reading days left between them
        const gap = w.start > U.addDays(prevOld, 1) ? G.workDays(U.addDays(prevOld, 1), U.addDays(w.start, -1), oldC) : 0;
        start = G.addWork(G.nextOn(U.addDays(prevNew, 1), newC), gap, newC);
      }
      else start = G.nextOn(w.start, newC);
      const due = G.wirdEnd(start, len, len, newC);
      prevOld = w.due;
      prevNew = due;
      if (start !== w.start || due !== w.due) changed = true;
      out.push(Object.assign({}, w, { start, due }));
    }
    return changed ? out : null;
  };
  /* Portions from i on laid out again from `start`: each keeps its length in reading days (a week-long one its
     week) and any reading day left empty between two of them (a catch-up day) stays. */
  G.relay = (ws, i, start, cfg = G.offCfg()) => {
    const out = ws.map((w) => Object.assign({}, w));
    for (let j = i; j < out.length; j++) {
      const w0 = ws[j];
      const cal = U.diffDays(w0.start, w0.due) + 1;
      const len = G.wirdLen(w0, cfg);
      let s;
      if (j === i) s = G.nextOn(start, cfg);
      else {
        const gap = w0.start > U.addDays(ws[j - 1].due, 1) ? G.workDays(U.addDays(ws[j - 1].due, 1), U.addDays(w0.start, -1), cfg) : 0;
        s = gap ? G.addWork(G.nextOn(U.addDays(out[j - 1].due, 1), cfg), gap, cfg) : G.nextOn(U.addDays(out[j - 1].due, 1), cfg);
      }
      out[j].start = s;
      out[j].due = G.wirdEnd(s, len, cal >= 7 ? cal : len, cfg);
    }
    return out;
  };
  /* A catch-up day of a book: a reading day inside its plan with no portion on it (a day the plan left empty so
     the circle can catch up). */
  G.gapDay = (book, d = U.today(), cfg = G.offCfg()) => {
    const ws = G.wirds(book);
    if (!ws.length || d < ws[0].start || d > ws[ws.length - 1].due || G.isOff(d, cfg)) return false;
    return !ws.some((w) => d >= w.start && d <= w.due);
  };
  /* The plan's usual portion size (the middle one), and whether a portion is far from it. */
  G.typSize = (ws) => {
    const sz = ws.map((w) => w.to - w.from + 1).sort((a, b) => a - b);
    return sz.length ? sz[Math.floor(sz.length / 2)] : 0;
  };
  G.oddSize = (w, typ) => {
    const n = w.to - w.from + 1;
    return typ >= 4 && (n >= Math.ceil(typ * 1.6) || n <= Math.floor(typ / 2)) ? (n > typ ? 'long' : 'short') : '';
  };
  G.offInWeek = (ws, cfg = G.offCfg()) => 7 - G.workDays(ws, U.addDays(ws, 6), cfg);
  /* The circle's weekly goal for a week: smaller by a seventh for each day off in it. */
  G.weekGoal = (ws = U.weekStart(), cfg = G.offCfg()) => {
    const goal = (S.circle && +S.circle.weeklyGoal) || 300;
    const on = 7 - G.offInWeek(ws, cfg);
    return on >= 7 ? goal : Math.max(10, Math.round((goal * Math.max(1, on)) / 7));
  };
  /* Days with all quests that a week needs for the big chest: five, or fewer when the week has fewer reading days. */
  G.bigChestDays = (ws = U.weekStart(), cfg = G.offCfg()) => Math.max(1, Math.min(G.BIG_CHEST_DAYS, 7 - G.offInWeek(ws, cfg)));
  /* A portion's length in reading days, the way it was laid out: a week-long one stays a week whatever the weekly
     days off; shorter ones are counted in reading days. */
  G.wirdLen = (w, cfg = G.offCfg()) => {
    const span = U.diffDays(w.start, w.due) + 1;
    if (span < 7) return Math.max(1, G.workDays(w.start, w.due, cfg));
    let held = 0; // holidays (dated days off) that made it longer
    for (const d of cfg.dates) if (d >= w.start && d <= w.due) held++;
    return Math.max(1, span - held);
  };

  /* Level L needs 25·(L−1)·(L+2) XP in total: 0, 100, 250, 450, 700, 1000, 1350 … */
  G.need = (lv) => 25 * (lv - 1) * (lv + 2);
  G.levelOf = (xp) => {
    let lv = 1;
    while (G.need(lv + 1) <= xp) lv++;
    const base = G.need(lv);
    const next = G.need(lv + 1);
    return { lv, cur: xp - base, span: next - base, toNext: next - xp };
  };
  const TITLES = [
    ['قارئ جديد', 'New reader'],
    ['فاتح الكتاب', 'Page turner'],
    ['رفيق الورق', 'Paper companion'],
    ['صاحب الورد', 'Keeper of the wird'],
    ['قارئ نهم', 'Avid reader'],
    ['دودة كتب', 'Bookworm', 'عاشق الكتب'],
    ['خير جليس', 'Finest companion'],
    ['حارس المكتبة', 'Library keeper'],
    ['حكيم الحلقة', 'Circle sage'],
    ['بحر المعرفة', 'Sea of knowledge'],
  ];
  G.title = (lv) => {
    const t = TITLES[Math.min(lv, TITLES.length) - 1];
    const extra = lv > TITLES.length ? ' ' + L.num(lv - TITLES.length + 1) : '';
    return L(...t) + extra;
  };

  /* Badges come in groups with up to four levels (bronze, silver, gold, diamond). The first level keeps the
     original ids so badges already earned stay earned. `v` reads a number from the person's stats. */
  G.BADGE_GROUPS = [
    { g: 'pages', ic: 'scroll', tip: ['كل صفحة بتقراها في التطبيق بتتحسب — بس لازم تقف عليها شوية، مش تقلّب بسرعة.', 'Every page you read in the app counts — pause on a page for it to count.', 'كل صفحة تقرؤها في التطبيق محسوبة — لكن توقّف عندها قليلًا، ولا تقلّب بسرعة.'] },
    { g: 'streak', ic: 'flame', tip: ['اقرأ ولو صفحة كل يوم. كل ٧ أيام ورا بعض بتكسبك «حماية» بتنقذ السلسلة لو فوّت يوم.', 'Read at least a page every day. Every 7 days in a row earns a freeze that saves your streak once.', 'اقرأ ولو صفحة كل يوم. كل ٧ أيام متتالية تكسبك «حماية» تنقذ السلسلة إن فاتك يوم.'] },
    { g: 'days', ic: 'calendar', tip: ['الأيام اللي قريت فيها، مش لازم ورا بعض.', 'Days you read on — they do not have to be in a row.', 'الأيام التي قرأت فيها، ولا يلزم أن تكون متتالية.'] },
    { g: 'marathon', ic: 'bolt', tip: ['عدد الصفحات في يوم واحد.', 'Pages read in a single day.'] },
    { g: 'hours', ic: 'clock', tip: ['وقت القراية الفعلي جوه القارئ (بيقف لما تسيب الموبايل).', 'Time actually spent reading in the reader (it pauses when you put the phone down).', 'وقت القراءة الفعلي داخل القارئ (يتوقف عندما تترك الهاتف).'] },
    { g: 'wirds', ic: 'check', tip: ['علّم الورد إنه خلص لما تخلّص صفحاته.', 'Mark a portion done when you finish its pages.', 'عندما تنهي صفحات الورد، علّمه منتهيًا.'] },
    { g: 'ontime', ic: 'clock', tip: ['خلّص الورد في ميعاده أو قبله.', 'Finish a portion on or before its due day.', 'أنهِ الورد في موعده أو قبله.'] },
    { g: 'pioneer', ic: 'bolt', tip: ['خليك أول واحد في الحلقة يخلّص الورد.', 'Be the first in the circle to finish a portion.', 'كن أول من ينهي الورد في الحلقة.'] },
    { g: 'books', ic: 'trophy', tip: ['خلّص كتاب كامل مع الحلقة ودوس «خلّصت الكتاب».', 'Finish a whole book with the circle and tap “I finished it”.', 'أنهِ كتابًا كاملًا مع الحلقة واضغط «أنهيت الكتاب».'] },
    { g: 'notes', ic: 'note', tip: ['ظلّل جملة أو حط ملاحظة على الصفحة وإنت بتقرأ.', 'Highlight a sentence or pin a note while reading.', 'ظلّل جملة أو ضع ملاحظة على الصفحة أثناء القراءة.'] },
    { g: 'quotes', ic: 'quote', tip: ['لما تظلّل، اختار «اقتباس».', 'When highlighting, choose “Quote”.', 'عندما تظلّل، اختر «اقتباس».'] },
    { g: 'questions', ic: 'question', tip: ['لما تحط ملاحظة، اختار «سؤال» عشان صحابك يردّوا.', 'When adding a note, choose “Question” so friends can answer.', 'عندما تضع ملاحظة، اختر «سؤال» ليرد أصدقاؤك.'] },
    { g: 'takes', ic: 'sparkle', tip: ['بعد ما تخلّص الورد، اكتب أهم فكرة خرجت بيها في «خلاصات الورد».', 'After a portion, write the main idea you took away under “Takeaways”.', 'بعد أن تنهي الورد، اكتب أهم فكرة خرجت بها في «خلاصات الورد».'] },
    { g: 'talk', ic: 'chat', tip: ['ردود على الملاحظات ورسايل في النقاش.', 'Replies to notes and messages in discussions.', 'الردود على الملاحظات والرسائل في النقاش.'] },
    { g: 'loved', ic: 'heart', tip: ['الإعجابات اللي بتجيلك على ملاحظاتك.', 'Likes your notes receive.', 'الإعجابات التي تصلك على ملاحظاتك.'] },
    { g: 'generous', ic: 'heart', tip: ['ادّي قلب لملاحظات صحابك.', "Like your friends' notes.", 'سجّل إعجابك بملاحظات أصدقائك.'] },
    { g: 'cheer', ic: 'clap', tip: ['شجّع أو فكّر صحابك من صفحة الحلقة أو التقدّم.', 'Cheer on or nudge friends from the circle or progress pages.', 'شجّع أصدقاءك أو ذكّرهم من صفحة الحلقة أو التقدّم.'] },
    { g: 'voter', ic: 'vote', tip: ['صوّت على الكتب المقترحة للحلقة.', 'Vote on the books suggested to the circle.'] },
    { g: 'shelf', ic: 'shelf', tip: ['ضيف الكتب اللي قريتها قبل كده لمكتبتك (أو استوردها من Goodreads).', 'Add books you have read to your shelf (or import them from Goodreads).', 'أضف الكتب التي قرأتها من قبل إلى مكتبتك (أو استوردها من Goodreads).'] },
    { g: 'critic', ic: 'edit', tip: ['اكتب رأيك (أكتر من سطر) في كتب مكتبتك.', 'Write a review (more than a line) for books on your shelf.', 'اكتب رأيك (أكثر من سطر) في كتب مكتبتك.'] },
    { g: 'quests', ic: 'chest', tip: ['خلّص مهام اليوم التلاتة وافتح الصندوق.', 'Finish all three daily quests and open the chest.', 'أنهِ مهام اليوم الثلاث وافتح الصندوق.'] },
    { g: 'level', ic: 'sparkle', tip: ['كل XP بتكسبه بيقرّبك للمستوى الجاي.', 'Every XP you earn brings the next level closer.', 'كل XP تكسبه يقرّبك من المستوى التالي.'] },
    { g: 'gold', ic: 'sparkle', tip: ['في كل ورد صفحة دهبية مستخبية — اقرا الورد كله وهتلاقيها.', 'Every portion hides a golden page — read the whole portion to find it.', 'في كل ورد صفحة ذهبية مخبأة — اقرأ الورد كله لتجدها.'] },
    { g: 'boss', ic: 'bolt', tip: ['اقرا ولو صفحة في الأسبوع اللي الحلقة بتهزم فيه زعيم الأسبوع.', 'Read at least a page in a week the circle beats its weekly boss.', 'اقرأ ولو صفحة في الأسبوع الذي تهزم فيه الحلقة زعيم الأسبوع.'] },
    { g: 'bigchest', ic: 'chest', tip: ['خلّص مهام اليوم ٥ أيام في نفس الأسبوع.', 'Finish the daily quests on 5 days of the same week.', 'أنهِ مهام اليوم ٥ أيام في الأسبوع نفسه.'] },
    { g: 'gifts', ic: 'heart', tip: ['ارمي على صحابك بلونات وورد وتصقيف من «الحلقة ← الأعضاء».', 'Throw balloons, flowers and applause at friends from «Circle → Members».', 'ارمِ على أصدقائك بالونات وورودًا وتصفيقًا من «الحلقة ← الأعضاء».'] },
    { g: 'pranks', ic: 'sparkle', tip: ['طماطماية ولا كورة تلج على صاحبك… بهزار 😄', 'A tomato or a snowball at a friend… all in fun 😄', 'طماطم أو كرة ثلج على صديقك… مزاحًا 😄'] },
    { g: 'reacts', ic: 'heart', tip: ['دوس مطوّل على سطر في الكتاب واختار إيموجي.', 'Long-press a line in the book and pick an emoji.', 'اضغط مطولًا على سطر في الكتاب واختر رمزًا.'] },
    { g: 'chars', ic: 'user', tip: ['الشخصيات بتتفتح بالصفحات اللي بتقراها جوه التطبيق.', 'Characters open with the pages you read in the app.', 'تُفتح الشخصيات بالصفحات التي تقرؤها داخل التطبيق.'] },
    { g: 'offread', ic: 'calendar', tip: ['اقرا في يوم إجازة الحلقة — مش مطلوب، بس بيتحسب.', "Read on one of the circle's days off — not expected, but it counts.", 'اقرأ في يوم إجازة الحلقة — غير مطلوب، لكنه يُحسب.'] },
    { g: 'heads', ic: 'list', tip: ['وإنت بتقرا، استخدم «عنوان» ودوس جنب أي عنوان في الكتاب: الحلقة كلها بتلاقيه في الفهرس.', 'While reading, use «Heading» and tap beside any heading in the book: the whole circle finds it in the contents.', 'أثناء القراءة، استخدم «عنوان» واضغط بجانب أي عنوان في الكتاب: تجده الحلقة كلها في الفهرس.'] },
    { g: 'fullindex', ic: 'list', tip: ['كتاب متفهرس لآخره: مفيش ٣٠ صفحة ورا بعض من غير عنوان. وسام لكل اللي حطّوا عناوين فيه.', 'A book indexed to the end: no 30 pages in a row without a heading. A badge for everyone who added headings to it.', 'كتاب مفهرس حتى آخره: لا ٣٠ صفحة متتالية بلا عنوان. وسام لكل من أضاف فيه عناوين.'] },
    { g: 'together', ic: 'users', tip: ['أيام كل اللي في الحلقة قرأوا فيها ولو صفحة. وسام للحلقة كلها.', 'Days when everyone in the circle read at least a page. A badge for the whole circle.', 'أيام قرأ فيها كل أعضاء الحلقة ولو صفحة. وسام للحلقة كلها.'] },
  ];
  const B = (g, tier, id, n, v, t, d) => ({ g, tier, id, n, v, t, d, ic: (G.BADGE_GROUPS.find((x) => x.g === g) || {}).ic || 'sparkle' });
  G.BADGES = [
    B('pages', 1, 'p100', 100, (s) => s.pages, ['مية صفحة', '100 pages', 'مئة صفحة'], ['اقرأ ١٠٠ صفحة', 'Read 100 pages']),
    B('pages', 2, 'p1000', 1000, (s) => s.pages, ['ألف صفحة', '1,000 pages'], ['اقرأ ١٠٠٠ صفحة', 'Read 1,000 pages']),
    B('pages', 3, 'p5000', 5000, (s) => s.pages, ['خمس تلاف صفحة', '5,000 pages', 'خمسة آلاف صفحة'], ['اقرأ ٥٠٠٠ صفحة', 'Read 5,000 pages']),
    B('pages', 4, 'p10000', 10000, (s) => s.pages, ['عشر تلاف صفحة', '10,000 pages', 'عشرة آلاف صفحة'], ['اقرأ ١٠٬٠٠٠ صفحة', 'Read 10,000 pages']),
    B('streak', 1, 'streak7', 7, (s) => s.best, ['أسبوع نار', 'Week on fire', 'أسبوع مشتعل'], ['اقرأ ٧ أيام ورا بعض', 'Read 7 days in a row', 'اقرأ ٧ أيام على التوالي']),
    B('streak', 2, 'streak30', 30, (s) => s.best, ['شهر من غير ما تقطع', 'Unbroken month', 'شهر بلا انقطاع'], ['اقرأ ٣٠ يوم ورا بعض', 'Read 30 days in a row', 'اقرأ ٣٠ يومًا على التوالي']),
    B('streak', 3, 'streak100', 100, (s) => s.best, ['مية يوم', '100-day streak', 'مئة يوم'], ['اقرأ ١٠٠ يوم ورا بعض', 'Read 100 days in a row', 'اقرأ ١٠٠ يوم على التوالي']),
    B('streak', 4, 'streak365', 365, (s) => s.best, ['سنة كاملة', 'A whole year'], ['اقرأ ٣٦٥ يوم ورا بعض', 'Read 365 days in a row', 'اقرأ ٣٦٥ يومًا على التوالي']),
    B('days', 1, 'days30', 30, (s) => s.daysRead, ['قارئ مخلص', 'Faithful reader'], ['اقرأ في ٣٠ يوم مختلف', 'Read on 30 different days', 'اقرأ في ٣٠ يومًا مختلفًا']),
    B('days', 2, 'days100', 100, (s) => s.daysRead, ['عادة يومية', 'Daily habit'], ['اقرأ في ١٠٠ يوم مختلف', 'Read on 100 different days']),
    B('days', 3, 'days365', 365, (s) => s.daysRead, ['رفيق الكتاب', 'Book companion'], ['اقرأ في ٣٦٥ يوم مختلف', 'Read on 365 different days', 'اقرأ في ٣٦٥ يومًا مختلفًا']),
    B('marathon', 1, 'day50', 50, (s) => s.maxDay, ['ماراثون', 'Marathon'], ['اقرأ ٥٠ صفحة في يوم واحد', 'Read 50 pages in one day']),
    B('marathon', 2, 'day100', 100, (s) => s.maxDay, ['ماراثون جامد', 'Ultra marathon'], ['اقرأ ١٠٠ صفحة في يوم واحد', 'Read 100 pages in one day']),
    B('marathon', 3, 'day200', 200, (s) => s.maxDay, ['مقدرتش أسيب الكتاب', "Couldn't put it down", 'لم أستطع ترك الكتاب'], ['اقرأ ٢٠٠ صفحة في يوم واحد', 'Read 200 pages in one day']),
    B('hours', 1, 'hours10', 10, (s) => Math.floor(s.secs / 3600), ['عشر ساعات', '10 hours'], ['اقرأ ١٠ ساعات', 'Read for 10 hours']),
    B('hours', 2, 'hours50', 50, (s) => Math.floor(s.secs / 3600), ['خمسين ساعة', '50 hours', 'خمسون ساعة'], ['اقرأ ٥٠ ساعة', 'Read for 50 hours']),
    B('hours', 3, 'hours100', 100, (s) => Math.floor(s.secs / 3600), ['مية ساعة', '100 hours', 'مئة ساعة'], ['اقرأ ١٠٠ ساعة', 'Read for 100 hours']),
    B('wirds', 1, 'first_wird', 1, (s) => s.wirdsDone, ['أول ورد', 'First portion'], ['خلّص أول ورد مع الحلقة', 'Finish your first portion', 'أنهِ أول ورد مع الحلقة']),
    B('wirds', 2, 'wirds10', 10, (s) => s.wirdsDone, ['عشر أوراد', '10 portions', 'عشرة أوراد'], ['خلّص ١٠ أوراد', 'Finish 10 portions', 'أنهِ ١٠ أوراد']),
    B('wirds', 3, 'wirds50', 50, (s) => s.wirdsDone, ['خمسين ورد', '50 portions', 'خمسون وردًا'], ['خلّص ٥٠ ورد', 'Finish 50 portions', 'أنهِ ٥٠ وردًا']),
    B('wirds', 4, 'wirds100', 100, (s) => s.wirdsDone, ['مية ورد', '100 portions', 'مئة ورد'], ['خلّص ١٠٠ ورد', 'Finish 100 portions', 'أنهِ ١٠٠ ورد']),
    B('ontime', 1, 'on_time', 5, (s) => s.onTime, ['في الميعاد', 'Right on time', 'في الموعد'], ['خلّص ٥ أوراد قبل ميعادها', 'Finish 5 portions before they are due', 'أنهِ ٥ أوراد قبل موعدها']),
    B('ontime', 2, 'on_time25', 25, (s) => s.onTime, ['منضبط', 'Punctual'], ['خلّص ٢٥ ورد في ميعادهم', 'Finish 25 portions on time', 'أنهِ ٢٥ وردًا في موعدها']),
    B('ontime', 3, 'on_time100', 100, (s) => s.onTime, ['زي الساعة', 'Like clockwork', 'دقيق كالساعة'], ['خلّص ١٠٠ ورد في ميعادهم', 'Finish 100 portions on time', 'أنهِ ١٠٠ ورد في موعدها']),
    B('pioneer', 1, 'pioneer', 3, (s) => s.firsts, ['السبّاق', 'Trailblazer'], ['خليك أول واحد يخلّص الورد ٣ مرات', 'Be first to finish a portion 3 times', 'كن أول من ينهي الورد ٣ مرات']),
    B('pioneer', 2, 'pioneer10', 10, (s) => s.firsts, ['دايما الأول', 'Always first', 'دائمًا الأول'], ['خليك الأول ١٠ مرات', 'Be first 10 times', 'كن الأول ١٠ مرات']),
    B('pioneer', 3, 'pioneer30', 30, (s) => s.firsts, ['قائد الحلقة', 'Circle leader'], ['خليك الأول ٣٠ مرة', 'Be first 30 times', 'كن الأول ٣٠ مرة']),
    B('books', 1, 'finisher', 1, (s) => s.booksDone, ['خاتم الكتاب', 'Book finisher'], ['خلّص كتاب كامل مع الحلقة', 'Finish a whole book with the circle', 'أنهِ كتابًا كاملًا مع الحلقة']),
    B('books', 2, 'books3', 3, (s) => s.booksDone, ['تلات كتب', 'Three books', 'ثلاثة كتب'], ['خلّص ٣ كتب مع الحلقة', 'Finish 3 books with the circle', 'أنهِ ٣ كتب مع الحلقة']),
    B('books', 3, 'books10', 10, (s) => s.booksDone, ['عشر كتب', 'Ten books', 'عشرة كتب'], ['خلّص ١٠ كتب مع الحلقة', 'Finish 10 books with the circle', 'أنهِ ١٠ كتب مع الحلقة']),
    B('books', 4, 'books25', 25, (s) => s.booksDone, ['مكتبة متنقلة', 'Walking library'], ['خلّص ٢٥ كتاب مع الحلقة', 'Finish 25 books with the circle', 'أنهِ ٢٥ كتابًا مع الحلقة']),
    B('notes', 1, 'pen', 10, (s) => s.notes, ['صاحب قلم', 'Margin writer'], ['اكتب ١٠ ملاحظات أو تظليلات', 'Leave 10 notes or highlights']),
    B('notes', 2, 'pen50', 50, (s) => s.notes, ['قلم رصاص', 'Pencil in hand'], ['اكتب ٥٠ ملاحظة أو تظليل', 'Leave 50 notes or highlights', 'اكتب ٥٠ ملاحظة أو تظليلًا']),
    B('notes', 3, 'pen200', 200, (s) => s.notes, ['شارح المتون', 'The annotator'], ['اكتب ٢٠٠ ملاحظة أو تظليل', 'Leave 200 notes or highlights']),
    B('quotes', 1, 'quotes', 5, (s) => s.quotes, ['صياد الاقتباسات', 'Quote hunter'], ['احفظ ٥ اقتباسات', 'Save 5 quotes']),
    B('quotes', 2, 'quotes25', 25, (s) => s.quotes, ['دفتر الاقتباسات', 'Commonplace book'], ['احفظ ٢٥ اقتباس', 'Save 25 quotes', 'احفظ ٢٥ اقتباسًا']),
    B('quotes', 3, 'quotes100', 100, (s) => s.quotes, ['خزانة الحكم', 'Treasury of wisdom'], ['احفظ ١٠٠ اقتباس', 'Save 100 quotes']),
    B('questions', 1, 'curious', 5, (s) => s.questions, ['الفضولي', 'Curious mind'], ['اسأل ٥ أسئلة على الكتاب', 'Ask 5 questions in the margins', 'اطرح ٥ أسئلة عن الكتاب']),
    B('questions', 2, 'curious25', 25, (s) => s.questions, ['الباحث', 'The researcher'], ['اسأل ٢٥ سؤال', 'Ask 25 questions', 'اطرح ٢٥ سؤالًا']),
    B('takes', 1, 'take', 3, (s) => s.takes, ['الخلاصة', 'The distiller'], ['اكتب خلاصتك لـ٣ أوراد', 'Write your takeaway for 3 portions']),
    B('takes', 2, 'take15', 15, (s) => s.takes, ['المُلخِّص', 'The summariser'], ['اكتب ١٥ خلاصة', 'Write 15 takeaways']),
    B('takes', 3, 'take50', 50, (s) => s.takes, ['عصارة الكتب', 'Essence of books'], ['اكتب ٥٠ خلاصة', 'Write 50 takeaways']),
    B('talk', 1, 'talk', 25, (s) => s.replies + s.msgs, ['المحاور', 'Conversationalist'], ['شارك ٢٥ مرة في النقاش', 'Post 25 replies or messages']),
    B('talk', 2, 'talk100', 100, (s) => s.replies + s.msgs, ['روح النقاش', 'Life of the discussion'], ['شارك ١٠٠ مرة في النقاش', 'Post 100 replies or messages']),
    B('talk', 3, 'talk500', 500, (s) => s.replies + s.msgs, ['صالون أدبي', 'Literary salon'], ['شارك ٥٠٠ مرة في النقاش', 'Post 500 replies or messages']),
    B('loved', 1, 'loved', 25, (s) => s.likesRecv, ['محبوب الحلقة', 'Circle favourite'], ['اجمع ٢٥ إعجاب على ملاحظاتك', 'Collect 25 likes on your notes', 'اجمع ٢٥ إعجابًا على ملاحظاتك']),
    B('loved', 2, 'loved100', 100, (s) => s.likesRecv, ['قلمه مسموع', 'A voice people follow', 'قلم مسموع'], ['اجمع ١٠٠ إعجاب', 'Collect 100 likes']),
    B('loved', 3, 'loved500', 500, (s) => s.likesRecv, ['نجم الحلقة', 'Circle star'], ['اجمع ٥٠٠ إعجاب', 'Collect 500 likes']),
    B('generous', 1, 'generous10', 10, (s) => s.likesGiven, ['كريم', 'Generous'], ['ادّي قلب لـ١٠ ملاحظات من صحابك', "Like 10 of your friends' notes", 'سجّل إعجابك بـ١٠ ملاحظات لأصدقائك']),
    B('generous', 2, 'generous50', 50, (s) => s.likesGiven, ['قلبه كبير', 'Big-hearted', 'صاحب القلب الكبير'], ['ادّي قلب لـ٥٠ ملاحظة', 'Like 50 notes', 'سجّل إعجابك بـ٥٠ ملاحظة']),
    B('generous', 3, 'generous200', 200, (s) => s.likesGiven, ['داعم الحلقة', 'Circle supporter'], ['ادّي قلب لـ٢٠٠ ملاحظة', 'Like 200 notes', 'سجّل إعجابك بـ٢٠٠ ملاحظة']),
    B('cheer', 1, 'cheer', 10, (s) => s.cheers, ['المشجّع', 'Cheerleader'], ['شجّع صحابك ١٠ مرات', 'Cheer or nudge friends 10 times', 'شجّع أصدقاءك ١٠ مرات']),
    B('cheer', 2, 'cheer50', 50, (s) => s.cheers, ['المحفّز', 'The motivator'], ['شجّع صحابك ٥٠ مرة', 'Cheer or nudge friends 50 times', 'شجّع أصدقاءك ٥٠ مرة']),
    B('voter', 1, 'voter5', 5, (s) => s.votes, ['صوتك مسموع', 'Your vote counts'], ['صوّت على ٥ كتب مقترحة', 'Vote on 5 suggested books']),
    B('voter', 2, 'voter20', 20, (s) => s.votes, ['ضمير الحلقة', 'Voice of the circle'], ['صوّت على ٢٠ كتاب مقترح', 'Vote on 20 suggested books', 'صوّت على ٢٠ كتابًا مقترحًا']),
    B('shelf', 1, 'shelf10', 10, (s) => s.shelfRead, ['مكتبة عامرة', 'Full shelf'], ['ضيف ١٠ كتب قرأتها لمكتبتك', 'Add 10 books you have read', 'أضف ١٠ كتب قرأتها إلى مكتبتك']),
    B('shelf', 2, 'shelf50', 50, (s) => s.shelfRead, ['أمين المكتبة', 'The librarian'], ['ضيف ٥٠ كتاب قرأته', 'Add 50 books you have read', 'أضف ٥٠ كتابًا قرأته']),
    B('shelf', 3, 'shelf100', 100, (s) => s.shelfRead, ['دار الكتب', 'House of books'], ['ضيف ١٠٠ كتاب قرأته', 'Add 100 books you have read', 'أضف ١٠٠ كتاب قرأته']),
    B('critic', 1, 'critic', 5, (s) => s.reviews, ['الناقد', 'The critic'], ['اكتب رأيك في ٥ كتب', 'Review 5 books']),
    B('critic', 2, 'critic20', 20, (s) => s.reviews, ['الناقد الأدبي', 'Literary critic'], ['اكتب رأيك في ٢٠ كتاب', 'Review 20 books', 'اكتب رأيك في ٢٠ كتابًا']),
    B('quests', 1, 'quests', 7, (s) => s.questDays, ['صائد الكنوز', 'Treasure hunter'], ['افتح صندوق مهام اليوم ٧ مرات', 'Complete the daily quests 7 times']),
    B('quests', 2, 'quests30', 30, (s) => s.questDays, ['جامع الكنوز', 'Treasure collector'], ['افتح الصندوق ٣٠ مرة', 'Open the chest 30 times']),
    B('quests', 3, 'quests100', 100, (s) => s.questDays, ['ملك الكنوز', 'Treasure king'], ['افتح الصندوق ١٠٠ مرة', 'Open the chest 100 times']),
    B('level', 1, 'lv5', 5, (s) => s.lv, ['المستوى ٥', 'Level 5'], ['اوصل للمستوى ٥', 'Reach level 5', 'ابلغ المستوى ٥']),
    B('level', 2, 'lv10', 10, (s) => s.lv, ['المستوى ١٠', 'Level 10'], ['اوصل للمستوى ١٠', 'Reach level 10', 'ابلغ المستوى ١٠']),
    B('level', 3, 'lv20', 20, (s) => s.lv, ['المستوى ٢٠', 'Level 20'], ['اوصل للمستوى ٢٠', 'Reach level 20', 'ابلغ المستوى ٢٠']),
    B('gold', 1, 'gold1', 1, (s) => s.golds, ['أول دهب', 'First gold', 'أول ذهب'], ['لاقي صفحة دهبية', 'Find a golden page', 'اعثر على صفحة ذهبية']),
    B('gold', 2, 'gold5', 5, (s) => s.golds, ['صياد الدهب', 'Gold hunter', 'صائد الذهب'], ['لاقي ٥ صفحات دهبية', 'Find 5 golden pages', 'اعثر على ٥ صفحات ذهبية']),
    B('gold', 3, 'gold20', 20, (s) => s.golds, ['منجم دهب', 'Gold mine', 'منجم ذهب'], ['لاقي ٢٠ صفحة دهبية', 'Find 20 golden pages', 'اعثر على ٢٠ صفحة ذهبية']),
    B('boss', 1, 'boss1', 1, (s) => s.bossWins, ['أول زعيم', 'First boss down', 'أول زعيم'], ['اهزموا زعيم أسبوع وانت معاهم', 'Beat a weekly boss with the circle', 'اهزموا زعيم أسبوع وأنت معهم']),
    B('boss', 2, 'boss4', 4, (s) => s.bossWins, ['قاهر الزعماء', 'Boss slayer'], ['٤ زعماء', 'Beat 4 bosses', 'اهزم ٤ زعماء']),
    B('boss', 3, 'boss12', 12, (s) => s.bossWins, ['أسطورة الساحة', 'Arena legend'], ['١٢ زعيم', 'Beat 12 bosses', 'اهزم ١٢ زعيمًا']),
    B('boss', 4, 'boss52', 52, (s) => s.bossWins, ['سنة من الانتصارات', 'A year of victories', 'عام من الانتصارات'], ['٥٢ زعيم', 'Beat 52 bosses', 'اهزم ٥٢ زعيمًا']),
    B('bigchest', 1, 'bigchest1', 1, (s) => s.bigChests, ['الصندوق الكبير', 'The big chest'], ['افتح الصندوق الكبير', 'Open the big chest', 'افتح الصندوق الكبير']),
    B('bigchest', 2, 'bigchest4', 4, (s) => s.bigChests, ['شهر كنوز', 'A month of treasure', 'شهر من الكنوز'], ['افتحه ٤ مرات', 'Open it 4 times', 'افتحه ٤ مرات']),
    B('bigchest', 3, 'bigchest12', 12, (s) => s.bigChests, ['خزنة الكنوز', 'Treasure vault'], ['افتحه ١٢ مرة', 'Open it 12 times', 'افتحه ١٢ مرة']),
    B('gifts', 1, 'gifts10', 10, (s) => s.gifts, ['صاحب واجب', 'Good friend'], ['ارمي ١٠ حاجات حلوة على صحابك', 'Throw 10 nice things at friends', 'ارمِ ١٠ أشياء لطيفة على أصدقائك']),
    B('gifts', 2, 'gifts50', 50, (s) => s.gifts, ['قلب الحلقة', 'Heart of the circle'], ['ارمي ٥٠ حاجة حلوة', 'Throw 50 nice things', 'ارمِ ٥٠ شيئًا لطيفًا']),
    B('gifts', 3, 'gifts200', 200, (s) => s.gifts, ['بابا نويل الحلقة', "The circle's Santa", 'سانتا الحلقة'], ['ارمي ٢٠٠ حاجة حلوة', 'Throw 200 nice things', 'ارمِ ٢٠٠ شيء لطيف']),
    B('pranks', 1, 'pranks10', 10, (s) => s.pranks, ['المقلباتي', 'Prankster', 'صاحب المقالب'], ['ارمي ١٠ مقالب على صحابك', 'Throw 10 pranks at friends', 'ارمِ ١٠ مقالب على أصدقائك']),
    B('pranks', 2, 'pranks50', 50, (s) => s.pranks, ['ملك الطماطم', 'Tomato king'], ['ارمي ٥٠ مقلب', 'Throw 50 pranks', 'ارمِ ٥٠ مقلبًا']),
    B('pranks', 3, 'pranks200', 200, (s) => s.pranks, ['أسطورة الهزار', 'Legend of fun', 'أسطورة المزاح'], ['ارمي ٢٠٠ مقلب', 'Throw 200 pranks', 'ارمِ ٢٠٠ مقلب']),
    B('reacts', 1, 'reacts10', 10, (s) => s.reacts, ['متفاعل', 'Reactor'], ['اتفاعل بإيموجي على ١٠ سطور', 'React with an emoji on 10 lines', 'تفاعل برمز على ١٠ أسطر']),
    B('reacts', 2, 'reacts50', 50, (s) => s.reacts, ['حاسس بالكتاب', 'Feels every page', 'يشعر بالكتاب'], ['اتفاعل على ٥٠ سطر', 'React on 50 lines', 'تفاعل على ٥٠ سطرًا']),
    B('reacts', 3, 'reacts200', 200, (s) => s.reacts, ['قلب القارئ', "A reader's heart", 'قلب القارئ'], ['اتفاعل على ٢٠٠ سطر', 'React on 200 lines', 'تفاعل على ٢٠٠ سطر']),
    B('chars', 1, 'chars15', 15, (s) => s.chars, ['جامع الشخصيات', 'Collector'], ['افتح ١٥ شخصية', 'Have 15 characters', 'افتح ١٥ شخصية']), // 12 are open from the start
    B('chars', 2, 'chars20', 20, (s) => s.chars, ['حديقة حيوانات', 'Little zoo'], ['افتح ٢٠ شخصية', 'Have 20 characters', 'افتح ٢٠ شخصية']),
    B('chars', 3, 'chars26', 26, (s) => s.chars, ['حارس الغابة', 'Forest keeper'], ['افتح ٢٦ شخصية', 'Have 26 characters', 'افتح ٢٦ شخصية']),
    B('chars', 4, 'chars32', 32, (s) => s.chars, ['الكل معايا', 'Got them all', 'جمعتها كلها'], ['افتح الـ٣٢ شخصية كلهم', 'Have all 32 characters', 'افتح الشخصيات الـ٣٢ كلها']),
    B('offread', 1, 'offread1', 1, (s) => s.offReads, ['مبيعرفش إجازة', 'No days off', 'لا يعرف الإجازة'], ['اقرا في يوم إجازة', 'Read on a day off', 'اقرأ في يوم إجازة']),
    B('offread', 2, 'offread5', 5, (s) => s.offReads, ['الكتاب صاحبه', 'Book never off', 'الكتاب رفيقه'], ['اقرا في ٥ أيام إجازة', 'Read on 5 days off', 'اقرأ في ٥ أيام إجازة']),
    B('offread', 3, 'offread20', 20, (s) => s.offReads, ['الإجازة قراية', 'Days off are for reading', 'الإجازة للقراءة'], ['اقرا في ٢٠ يوم إجازة', 'Read on 20 days off', 'اقرأ في ٢٠ يوم إجازة']),
    B('together', 1, 'together1', 1, (s) => s.circleFull, ['الحلقة كاملة', 'The whole circle'], ['يوم كل اللي في الحلقة قرأوا فيه', 'A day when everyone in the circle read', 'يوم قرأ فيه كل أعضاء الحلقة']),
    B('heads', 1, 'heads5', 5, (s) => s.heads, ['المفهرس', 'The indexer', 'المفهرس'], ['حط ٥ عناوين في الفهرس', 'Add 5 headings to the contents', 'أضف ٥ عناوين إلى الفهرس']),
    B('heads', 2, 'heads20', 20, (s) => s.heads, ['أمين الفهرس', 'Keeper of the contents', 'أمين الفهرس'], ['حط ٢٠ عنوان', 'Add 20 headings', 'أضف ٢٠ عنوانًا']),
    B('heads', 3, 'heads50', 50, (s) => s.heads, ['صانع الفهارس', 'Contents maker', 'صانع الفهارس'], ['حط ٥٠ عنوان', 'Add 50 headings', 'أضف ٥٠ عنوانًا']),
    B('fullindex', 1, 'fullindex', 1, (s) => s.fullIndex, ['فهرس كامل', 'Fully indexed', 'فهرس كامل'], ['شارك في فهرسة كتاب لحد آخره', 'Help index a book to the end', 'شارك في فهرسة كتاب حتى آخره']),
    B('together', 2, 'together7', 7, (s) => s.circleFull, ['أسبوع الحلقة كاملة', 'Whole-circle week', 'أسبوع الحلقة الكاملة'], ['٧ أيام الحلقة كلها قرأت فيها', '7 days when the whole circle read', '٧ أيام قرأت فيها الحلقة كلها']),
    B('together', 3, 'together30', 30, (s) => s.circleFull, ['شهر الحلقة كاملة', 'Whole-circle month', 'شهر الحلقة الكاملة'], ['٣٠ يوم الحلقة كلها قرأت فيها', '30 days when the whole circle read', '٣٠ يومًا قرأت فيها الحلقة كلها']),
  ];
  /* A book indexed to the end: headings (with the file's own outline) leave no 30 pages in a row without one. */
  G.indexedToEnd = (book, hs) => {
    const ps = [...new Set([...(hs || []).map((h) => h.page), ...((book.toc || []).map((x) => x.p))])].filter((p) => p >= 1).sort((a, b) => a - b);
    if (!ps.length || !book.pages) return false;
    let prev = 1;
    for (const p of ps) {
      if (p - prev > 30) return false;
      prev = p;
    }
    return book.pages - prev <= 30;
  };
  /* One entry per group: its levels (with progress), the highest level earned and the next one to aim for. */
  G.badgeGroups = (s) =>
    G.BADGE_GROUPS.map((grp) => {
      const tiers = (s.badges || []).filter((x) => x.b.g === grp.g).sort((a, b) => a.b.tier - b.b.tier);
      const got = tiers.filter((x) => x.got);
      return Object.assign({}, grp, { tiers, top: got.length ? got[got.length - 1] : null, next: tiers.find((x) => !x.got) || null });
    }).filter((x) => x.tiers.length);

  function blank(uid) {
    return {
      uid, xp: 0, week: 0, prevWeek: 0, todayXp: 0, pages: 0, pagesWeek: 0, pagesPrevWeek: 0, pagesToday: 0, secs: 0, secsWeek: 0, freezes: 0, frozen: [],
      wirdsDone: 0, onTime: 0, firsts: 0, notes: 0, quotes: 0, questions: 0, takes: 0,
      replies: 0, msgs: 0, likesRecv: 0, likesGiven: 0, shelfRead: 0, reviews: 0,
      booksDone: 0, cheers: 0, votes: 0, questDays: 0, daysRead: 0, maxDay: 0,
      golds: 0, bossWins: 0, bigChests: 0, gifts: 0, pranks: 0, reacts: 0, chars: 0, offReads: 0, heads: 0, fullIndex: 0,
      weekStreak: 0, bestWeekStreak: 0, weekDays: 0, weekNeed: 3, weekLeft: 3, weekAtRisk: false, circleFull: 0,
      days: {}, byDay: {}, active: new Set(), events: [], questWeek: 0, freezeGifts: new Set(),
    };
  }
  const bump = (s, day, key, n = 1) => {
    if (!day) return;
    const d = (s.byDay[day] = s.byDay[day] || { pages: 0, notes: 0, talk: 0, likes: 0, shelf: 0, cheers: 0, wirds: 0 });
    d[key] += n;
  };
  const ev = (s, day, xp, kind) => {
    if (!day || !xp) return;
    s.events.push({ day, xp, kind });
  };

  /* Daily quests: reading is always one of them; two more are picked per person per day. */
  const POOL = ['note', 'talk', 'like', 'shelf', 'cheer'];
  G.questsFor = (uid, day, s) => {
    const r = U.rng(U.hash(uid + '|' + day));
    // The reading quest is my daily goal (as it was that day); without one, a size picked for the day.
    const random = [5, 10, 15, 20][Math.floor(r() * 4)];
    const goalN = G.goalPagesOn ? G.goalPagesOn(uid, day) : 0;
    const readN = goalN || random;
    const pool = POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const d = (s && s.byDay[day]) || { pages: 0, notes: 0, talk: 0, likes: 0, shelf: 0, cheers: 0 };
    const pages = (s && s.days[day]) || 0;
    const q = [{ id: 'read', ic: 'scroll', need: readN, have: pages }];
    for (const id of pool.slice(0, 2)) {
      if (id === 'note') q.push({ id, ic: 'hl', need: 1, have: d.notes });
      if (id === 'talk') q.push({ id, ic: 'chat', need: 2, have: d.talk });
      if (id === 'like') q.push({ id, ic: 'heart', need: 3, have: d.likes });
      if (id === 'shelf') q.push({ id, ic: 'shelf', need: 1, have: d.shelf });
      if (id === 'cheer') q.push({ id, ic: 'clap', need: 1, have: d.cheers });
    }
    for (const x of q) x.done = x.have >= x.need;
    return q;
  };
  G.questText = (q) => {
    switch (q.id) {
      case 'read': return L(`اقرأ ${L.count(q.need, 'page')}`, `Read ${q.need} pages`);
      case 'note': return L('ظلّل أو اكتب ملاحظة في كتاب', 'Highlight or note something in a book');
      case 'talk': return L('شارك مرتين في النقاش أو الردود', 'Reply or post twice in a discussion');
      case 'like': return L('ادّي قلب لـ٣ ملاحظات من صحابك', "Like 3 of your friends' notes", 'سجّل إعجابك بـ٣ ملاحظات لأصدقائك');
      case 'shelf': return L('ضيف كتاب لمكتبتك أو قيّم كتاب', 'Add or rate a book on your shelf', 'أضف كتابًا إلى مكتبتك أو قيّم كتابًا');
      case 'cheer': return L('شجّع أو فكّر واحد من صحابك', 'Cheer on or nudge a friend', 'شجّع أحد أصدقائك أو ذكّره');
    }
    return '';
  };

  /* Wird helpers */
  G.wirds = (book) => (book && Array.isArray(book.wirds) ? book.wirds : []);
  G.groupCurrent = (book) => {
    const ws = G.wirds(book);
    if (!ws.length) return null;
    const t = U.today();
    for (const w of ws) if (t <= w.due) return w;
    return ws[ws.length - 1];
  };
  G.myCurrent = (book, uid = S.me) => {
    const ws = G.wirds(book);
    const p = A.D.prog(book.id, uid);
    const done = (p && p.done) || {};
    return ws.find((w) => !done[w.id]) || null;
  };
  /* Behind on a book: late, unfinished portions (in order), their unread pages, and those already read
     (all but ~10% of their pages seen) that only need marking. */
  G.behind = (book, uid = S.me) => {
    const ws = G.wirds(book);
    const t = U.today();
    const p = A.D.prog(book.id, uid);
    const done = (p && p.done) || {};
    const seen = p && p.seen;
    const late = ws.filter((w) => !done[w.id] && w.due < t);
    let pages = 0;
    const readyToMark = [];
    for (const w of late) {
      const total = w.to - w.from + 1;
      const left = total - U.rangesCountIn(seen, w.from, w.to);
      pages += left;
      if (left <= Math.max(1, Math.round(total * 0.1))) readyToMark.push(w);
    }
    return { late, pages, readyToMark, group: G.groupCurrent(book) };
  };
  /* Pages a day to catch up within `days` days: the late pages plus portions falling due in that window. */
  G.catchUpPerDay = (book, days, uid = S.me) => {
    const b = G.behind(book, uid);
    const t = U.today();
    const end = U.addDays(t, days - 1);
    const p = A.D.prog(book.id, uid);
    let pages = b.pages;
    for (const w of G.wirds(book)) {
      if (w.due < t || w.due > end || (p && p.done && p.done[w.id])) continue;
      pages += w.to - w.from + 1 - U.rangesCountIn(p && p.seen, w.from, w.to);
    }
    return Math.ceil(pages / Math.max(1, G.workDays(t, end))); // spread over the reading days only
  };
  G.wirdStatus = (book, w, uid = S.me) => {
    const p = A.D.prog(book.id, uid);
    const t = U.today();
    if (p && p.done && p.done[w.id]) {
      const dk = U.isoKey(p.done[w.id]);
      return dk <= w.due ? 'done' : 'late-done';
    }
    if (w.due < t) return 'late';
    if (w.start <= t) return 'now';
    return 'soon';
  };
  G.firstFinisher = (bookId, wid) => {
    let best = null;
    for (const p of S.prog.values()) {
      if (p.b !== bookId || !p.done || !p.done[wid]) continue;
      if (!best || p.done[wid] < best.t) best = { u: p.u, t: p.done[wid] };
    }
    return best && best.u;
  };

  /* ---------- streak style: daily (default) or weekly (weeks in a row with reading on at least n days) ---------- */
  /* Stored on the member doc: streakPref = {mode: 'day' | 'week', n: 1..7}. */
  G.streakPref = (uid = S.me) => {
    const p = (S.members.get(uid) || {}).streakPref || {};
    return { mode: p.mode === 'week' ? 'week' : 'day', n: U.clamp(Math.round(+p.n || 3), 1, 7) };
  };
  function weekStreak(s, sortedDays, today) {
    const n0 = G.streakPref(s.uid).n;
    const offc = G.offCfg();
    const needOf = (w) => Math.max(1, Math.min(n0, 7 - G.offInWeek(w, offc))); // days off make the week shorter
    const n = needOf(U.weekStart(today));
    const cur = U.weekStart(today);
    const per = new Map();
    for (const d of sortedDays) if (d <= today) per.set(U.weekStart(d), (per.get(U.weekStart(d)) || 0) + 1);
    let run = 0, best = 0;
    if (sortedDays.length) {
      for (let w = U.weekStart(sortedDays[0]), i = 0; w <= cur && i < 600; w = U.addDays(w, 7), i++) {
        if ((per.get(w) || 0) >= needOf(w)) run++;
        else if (w !== cur) run = 0; // this week isn't over yet
        best = Math.max(best, run);
      }
    }
    s.weekNeed = n;
    s.weekDays = per.get(cur) || 0;
    s.weekLeft = Math.max(0, n - s.weekDays);
    s.weekStreak = run;
    s.bestWeekStreak = best;
    s.weekAtRisk = run > 0 && s.weekLeft > 0;
  }
  const WEEKS = {
    eg: { one: 'أسبوع', two: 'أسبوعين', few: '{n} أسابيع', other: '{n} أسبوع' },
    ar: { one: 'أسبوع واحد', two: 'أسبوعين', few: '{n} أسابيع', many: '{n} أسبوعًا', other: '{n} أسبوع' },
    en: { one: '1 week', other: '{n} weeks' },
  };
  const plural = { ar: new Intl.PluralRules('ar'), en: new Intl.PluralRules('en') };
  G.weeks = (n) => {
    const f = WEEKS[L.lang()] || WEEKS.eg;
    let cat = plural[L.lang() === 'en' ? 'en' : 'ar'].select(n);
    if (L.lang() !== 'en' && n === 0) cat = 'other';
    return (f[cat] || f.other).replace('{n}', L.num(n));
  };
  /* The unit after the number on the flame chip: «٣ أيام», «١١ يوم» (مصري), «١١ يومًا» (فصحى), «١ يوم». */
  const unitAfter = (n, one, few, many) => {
    const c = plural.ar.select(n);
    return L(c === 'few' ? few : one, '', c === 'few' ? few : c === 'many' ? many : one);
  };
  /* What the flame shows for this person: their daily or weekly streak, whether it is at risk, and the hint. */
  G.streakView = (uid = S.me) => {
    const s = G.of(uid);
    const pref = G.streakPref(uid);
    if (pref.mode !== 'week') {
      return {
        weekly: false, n: s.streak, risk: s.atRisk, best: s.best,
        unit: L.isAr() ? unitAfter(s.streak, 'يوم', 'أيام', 'يومًا') : s.streak === 1 ? 'day' : 'days',
        hint: s.atRisk ? L('اقرأ النهارده عشان السلسلة متقطعش', 'Read today to keep your streak', 'اقرأ اليوم كي لا تنقطع سلسلتك') : L('أيام القراءة المتتالية', 'Reading streak'),
      };
    }
    const k = s.weekLeft;
    const n = s.weekStreak;
    return {
      weekly: true, n, risk: s.weekAtRisk, best: s.bestWeekStreak, need: pref.n, left: k,
      unit: L.isAr() ? unitAfter(n, 'أسبوع', 'أسابيع', 'أسبوعًا') : n === 1 ? 'week' : 'weeks',
      hint: s.weekAtRisk
        ? L(`فاضل ${k === 1 ? 'يوم قراية واحد' : `${L.count(k, 'day')} قراية`} الأسبوع ده`, `${k} more reading day${k === 1 ? '' : 's'} this week`, `بقي ${L.count(k, 'day', 'nom')} للقراءة هذا الأسبوع`)
        : L(`${G.weeks(n)} ورا بعض فيها ${L.count(pref.n, 'day')} قراية على الأقل`, `${G.weeks(n)} in a row with at least ${pref.n} reading day${pref.n === 1 ? '' : 's'}`, `${G.weeks(n)} متتالية فيها ${L.count(pref.n, 'day')} قراءة على الأقل`),
    };
  };

  /* ---------- the whole circle read today ---------- */
  function circleFull() {
    const ms = [...S.members.values()];
    if (ms.length < 2) return [];
    const today = U.today();
    let set = null;
    for (const m of ms) {
      const mine = new Set(Object.keys(m.days || {}).filter((d) => d <= today && +m.days[d] > 0));
      set = set ? new Set([...set].filter((d) => mine.has(d))) : mine;
      if (!set.size) return [];
    }
    return [...set].sort();
  }
  /* Sorted list of days ('YYYY-MM-DD') when every current member read at least one page. */
  G.circleFullDays = () => (G.all().circleFull || []).slice();

  /* ---------- time estimates ---------- */
  /* Seconds per page for this reader (from their reading time once there is enough of it), else ~1.2 min. */
  G.secsPerPage = (uid = S.me) => {
    const s = G.of(uid);
    return s.pages >= 10 && s.secs > 0 ? U.clamp(s.secs / s.pages, 20, 240) : 72;
  };
  G.minutesFor = (pages, uid = S.me) => (pages > 0 ? Math.max(1, Math.round((pages * G.secsPerPage(uid)) / 60)) : 0);
  /* "20 minutes", "1 hour", "4 and a half hours": rounded the way people say it. */
  G.timeText = (mins) => {
    mins = Math.max(1, Math.round(mins || 0));
    if (mins < 60) return L.count(mins < 10 ? mins : Math.round(mins / 5) * 5, 'minute');
    const halves = Math.round(mins / 30);
    const h = Math.floor(halves / 2);
    if (halves % 2 === 0) return L.count(h, 'hour');
    return L(`${L.count(h, 'hour')} ونص`, `${h}.5 hours`, `${L.count(h, 'hour')} ونصف`);
  };

  /* ---------- pace and finish-date forecast ---------- */
  /* Pages a day over the last 14 days (counting from the first day read, if that is later), or null when there
     is too little to go on (fewer than 3 reading days or 10 pages). */
  G.pace = (uid = S.me) => {
    const m = S.members.get(uid);
    const days = (m && m.days) || {};
    const today = U.today();
    const readToday = +days[today] > 0;
    const end = readToday ? today : U.addDays(today, -1);
    const keys = Object.keys(days).filter((k) => +days[k] > 0 && k <= end).sort();
    if (!keys.length) return null;
    let start = U.addDays(end, -13);
    if (keys[0] > start) start = keys[0];
    const span = Math.max(1, G.workDays(start, end)); // days off don't slow the pace down
    let pages = 0, rdays = 0;
    for (const k of keys) {
      if (k < start) continue;
      pages += Math.min(2000, +days[k]);
      rdays++;
    }
    if (rdays < 3 || pages < 10) return null;
    return { perDay: pages / span, perReadingDay: pages / rdays, days: rdays, span, pages, readToday };
  };
  /* When I'd finish this book at my pace, and how that compares with the plan's last due day.
     null when the book is done or there isn't enough data. */
  G.forecast = (book, uid = S.me) => {
    if (!book || !book.pages) return null;
    const p = A.D.prog(book.id, uid);
    if (p && p.finished) return null;
    const ws = G.wirds(book);
    const from = ws.length ? ws[0].from : 1;
    const to = ws.length ? ws[ws.length - 1].to : book.pages;
    const left = Math.max(0, to - from + 1 - U.rangesCountIn(p && p.seen, from, to));
    if (!left) return null;
    const pace = G.pace(uid);
    if (!pace || pace.perDay <= 0) return null;
    const need = Math.ceil(left / pace.perDay);
    if (need > 730) return null;
    const today = U.today();
    const date = G.addWork(pace.readToday ? today : U.addDays(today, -1), need); // counting reading days only
    const out = { date, left, perDay: pace.perDay, perReadingDay: pace.perReadingDay, pace };
    const due = ws.length ? ws[ws.length - 1].due : null;
    if (due && due >= today) {
      out.due = due;
      out.diff = U.diffDays(date, due); // > 0: ahead of the plan
      out.catchUp = Math.ceil(left / (G.workDays(pace.readToday ? U.addDays(today, 1) : today, due) || 1));
    }
    return out;
  };
  /* "by 3 days", "by a week" — the gap between a forecast and the plan. */
  G.byDays = (d) => {
    d = Math.abs(d);
    if (d % 7 === 0 && d <= 28) {
      const w = d / 7;
      return w === 1 ? L('بأسبوع', 'a week') : w === 2 ? L('بأسبوعين', '2 weeks') : L(`بـ${L.num(w)} أسابيع`, `${w} weeks`);
    }
    return d === 1 ? L('بيوم', 'a day', 'بيوم واحد') : d === 2 ? L('بيومين', '2 days') : L(`بـ${L.count(d, 'day')}`, `${d} days`);
  };
  G.forecastText = (f) => {
    if (!f) return '';
    const today = U.today();
    const when = f.date === today ? L('النهارده', 'today', 'اليوم') : f.date === U.addDays(today, 1) ? L('بكرة', 'tomorrow', 'غدًا') : L(`يوم ${L.dayShort(f.date)}`, `on ${L.dayShort(f.date)}`, `يوم ${L.dayShort(f.date)}`);
    return L(`على السرعة دي هتخلّص الكتاب ${when}`, `At this pace you'll finish the book ${when}`, `بهذه السرعة ستنهي الكتاب ${when}`);
  };
  G.forecastShort = (f) => {
    if (!f) return '';
    const today = U.today();
    const when = f.date === today ? L('النهارده', 'today', 'اليوم') : f.date === U.addDays(today, 1) ? L('بكرة', 'tomorrow', 'غدًا') : L(`يوم ${L.dayShort(f.date)}`, `on ${L.dayShort(f.date)}`, `يوم ${L.dayShort(f.date)}`);
    return L(`هتخلّص الكتاب ${when}`, `You'll finish the book ${when}`, `ستنهي الكتاب ${when}`);
  };
  G.forecastCompare = (f) => {
    if (!f || f.diff == null) return '';
    if (f.diff > 0) return L(`قبل الخطة ${G.byDays(f.diff)}`, `${G.byDays(f.diff)} ahead of the plan`, `قبل الخطة ${G.byDays(f.diff)}`);
    if (f.diff === 0) return L('في ميعاد الخطة بالظبط', 'right on the plan', 'في موعد الخطة تمامًا');
    // far behind: just the way back, no count of days
    if (f.diff < -28) return L(`${L.count(f.catchUp, 'page')} في اليوم تلحقك بالخطة`, `${f.catchUp} pages a day gets you back on the plan`, `${L.count(f.catchUp, 'page')} في اليوم تكفي لتلحق بالخطة`);
    return L(`متأخر عن الخطة ${G.byDays(f.diff)} — ${L.count(f.catchUp, 'page')} في اليوم تلحقك`, `${G.byDays(f.diff)} behind the plan — ${f.catchUp} pages a day gets you there`, `متأخر عن الخطة ${G.byDays(f.diff)} — ${L.count(f.catchUp, 'page')} في اليوم تكفي لتلحق`);
  };

  /* ---------- a small daily goal that grows ---------- */
  /* Stored on the member doc: goalDaily = {pages, auto, at}. Off: auto false and pages 0. Missing: auto from a
     small start. In auto it steps up a rung after hitting it on 5 of the last 7 days and eases down after a bad
     week (2 or fewer), at most once a week (`at` is the day of the last change). */
  G.GOAL_STEPS = [3, 4, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  G.goalStart = (uid = S.me) => U.clamp(Math.round(600 / G.secsPerPage(uid)), 3, 5); // 5 pages, or 10 minutes if less
  G.goalOf = (uid = S.me) => {
    const g = (S.members.get(uid) || {}).goalDaily || null;
    const off = !!g && g.auto === false && !(+g.pages > 0);
    const have = G.of(uid).pagesToday;
    if (off) return { on: false, auto: false, pages: 0, have, done: false, at: g.at || '' };
    const auto = !g || g.auto !== false;
    const pages = g && +g.pages > 0 ? U.clamp(Math.round(+g.pages), 1, 500) : G.goalStart(uid);
    return { on: true, auto, pages, have, done: have >= pages, at: (g && g.at) || '' };
  };
  /* The daily goal in pages as it stood on a day (0: off, or no goal recorded yet for that day). */
  G.goalPagesOn = (uid, day) => {
    const g = (S.members.get(uid) || {}).goalDaily;
    let p = 0, found = false;
    for (const e of (g && g.hist) || []) if (e.d <= day) {
      p = +e.p || 0;
      found = true;
    }
    // A goal set before dates were kept: it counts from today on (never G.goalOf here: that would recompute
    // the very numbers being computed).
    if (!found && g && day === U.today() && !(g.auto === false && !(+g.pages > 0))) return +g.pages > 0 ? U.clamp(Math.round(+g.pages), 1, 500) : 0;
    return p;
  };
  /* The next stored goal for a day (null: nothing to change). Pure: (goal, member days, today). */
  G.goalNext = (g, days, today = U.today()) => {
    if (!g || !g.on || !g.auto) return null;
    if (!g.at) return { auto: true, pages: g.pages, at: today };
    if (U.diffDays(g.at, today) < 7) return null;
    // the last seven days, days off left out: up after hitting all but two of them, down after two or fewer
    const offc = G.offCfg();
    let hits = 0, on = 0;
    for (let i = 1; i <= 7; i++) {
      const d = U.addDays(today, -i);
      if (G.isOff(d, offc)) continue;
      on++;
      if ((+(days || {})[d] || 0) >= g.pages) hits++;
    }
    if (on < 3) return null;
    const st = G.GOAL_STEPS;
    let pages = g.pages;
    if (hits >= on - 2) pages = st.find((x) => x > g.pages) || g.pages + 20;
    else if (hits <= 2) pages = [...st].reverse().find((x) => x < g.pages) || st[0];
    if (pages === g.pages) return null;
    return { auto: true, pages, at: today, prev: g.pages, dir: pages > g.pages ? 'up' : 'down', hits };
  };

  function compute() {
    const out = new Map();
    const get = (uid) => {
      if (!uid) return null;
      if (!out.has(uid)) out.set(uid, blank(uid));
      return out.get(uid);
    };
    for (const id of S.members.keys()) get(id);

    // pages per day (+ reading time)
    for (const m of S.members.values()) {
      const s = get(m.id);
      const wk0 = U.weekStart(U.today());
      for (const [day, n] of Object.entries(m.secs || {})) {
        const v = Math.max(0, Math.min(86400, +n || 0));
        s.secs += v;
        if (day >= wk0) s.secsWeek += v;
      }
      for (const [day, n] of Object.entries(m.days || {})) {
        const v = Math.max(0, Math.min(2000, +n || 0));
        if (!v) continue;
        s.daysRead++;
        if (v > s.maxDay) s.maxDay = v;
        s.days[day] = v;
        s.pages += v;
        bump(s, day, 'pages', v);
        s.active.add(day);
        ev(s, day, v * G.XP.page, 'pages');
      }
    }

    // portions finished, books finished
    const firsts = new Map();
    for (const p of S.prog.values()) {
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t) continue;
        const k = p.b + '|' + wid;
        const f = firsts.get(k);
        if (!f || t < f.t) firsts.set(k, { u: p.u, t });
      }
    }
    for (const p of S.prog.values()) {
      const s = get(p.u);
      const book = S.books.get(p.b) || S.gone.get(p.b); // a removed book still counts for what was earned on it
      if (!s || !book) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t) continue;
        const w = G.wirds(book).find((x) => x.id === wid);
        if (!w) continue;
        const day = U.isoKey(t);
        s.wirdsDone++;
        bump(s, day, 'wirds');
        s.active.add(day);
        ev(s, day, G.XP.wird, 'wird');
        if (day <= w.due) {
          s.onTime++;
          ev(s, day, G.XP.onTime, 'onTime');
        }
        const f = firsts.get(p.b + '|' + wid);
        if (f && f.u === p.u) {
          s.firsts++;
          ev(s, day, G.XP.first, 'first');
        }
      }
      if (p.finished) {
        s.booksDone++;
        ev(s, U.isoKey(p.finished), G.XP.book, 'book');
      }
    }

    // notes, likes, replies, takeaways
    for (const n of S.notes.values()) {
      const s = get(n.by);
      if (!s) continue;
      const day = U.isoKey(n.at);
      if (n.kind === 'take') {
        s.takes++;
        bump(s, day, 'talk');
        ev(s, day, G.XP.take, 'take');
      } else {
        s.notes++;
        if (n.kind === 'quote') s.quotes++;
        if (n.kind === 'q') s.questions++;
        bump(s, day, 'notes');
        ev(s, day, G.XP.note, 'note');
      }
      s.active.add(day);
      for (const [uid, v] of Object.entries(n.likes || {})) {
        if (!v || uid === n.by) continue;
        const ld = typeof v === 'string' ? U.isoKey(v) : day;
        s.likesRecv++;
        ev(s, ld, G.XP.liked, 'liked');
        const g = get(uid);
        if (g) {
          g.likesGiven++;
          bump(g, ld, 'likes');
        }
      }
      for (const r of Object.values(n.replies || {})) {
        if (!r || !r.by || !r.text) continue;
        const g = get(r.by);
        if (!g) continue;
        const rd = U.isoKey(r.at);
        g.replies++;
        bump(g, rd, 'talk');
        g.active.add(rd);
        ev(g, rd, G.XP.reply, 'reply');
      }
    }
    // «الفهرس»: +3 a heading, the first ten of a day; a book indexed to the end counts for everyone in it
    const hdDay = new Map();
    const byBook = new Map();
    for (const h of [...S.heads.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      if (!h || !h.b || !h.page) continue;
      if (!byBook.has(h.b)) byBook.set(h.b, []);
      byBook.get(h.b).push(h);
      const s = get(h.by);
      if (!s) continue;
      s.heads++;
      const day = U.isoKey(h.at);
      const k = h.by + '|' + day;
      const n = (hdDay.get(k) || 0) + 1;
      hdDay.set(k, n);
      if (n <= 10) ev(s, day, G.XP.head, 'head');
    }
    for (const [bid, hs] of byBook) {
      const book = S.books.get(bid);
      if (!book || !book.pages || !G.indexedToEnd(book, hs)) continue;
      for (const u of new Set(hs.map((h) => h.by))) {
        const s = get(u);
        if (s) s.fullIndex++;
      }
    }
    for (const m of S.msgs) {
      const s = get(m.by);
      if (!s) continue;
      const day = U.isoKey(m.at);
      s.msgs++;
      bump(s, day, 'talk');
    }

    // shelf
    for (const sh of S.shelf.values()) {
      const s = get(sh.id);
      if (!s) continue;
      const items = Object.values(sh.items || {}).filter(Boolean);
      items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      for (const it of items) {
        const day = U.isoKey(it.at);
        bump(s, U.isoKey(it.updatedAt || it.at), 'shelf');
        if (it.status === 'read') {
          s.shelfRead++;
          if (s.shelfRead <= 60) ev(s, day, G.XP.shelf, 'shelf');
        }
        if (it.review && String(it.review).trim().length >= 20) {
          s.reviews++;
          ev(s, U.isoKey(it.updatedAt || it.at), G.XP.review, 'review');
        }
      }
    }

    // cheers & nudges
    const cheerPerDay = new Map();
    for (const p of S.pokes.values()) {
      const s = get(p.from);
      if (!s) continue;
      const day = U.isoKey(p.at);
      s.cheers++;
      bump(s, day, 'cheers');
      const k = p.from + day;
      const c = (cheerPerDay.get(k) || 0) + 1;
      cheerPerDay.set(k, c);
      if (c <= 5) ev(s, day, G.XP.cheer, 'cheer');
    }
    for (const pr of S.proposals.values()) for (const [uid, v] of Object.entries(pr.votes || {})) if (v && get(uid)) get(uid).votes++;

    // days when every current member read at least a page (a circle of two or more)
    out.circleFull = circleFull();
    for (const s of out.values()) s.circleFull = S.members.has(s.uid) ? out.circleFull.length : 0;

    // quest bonus + totals + streaks
    const today = U.today();
    const wk = U.weekStart(today);
    const horizon = U.addDays(today, -3660); // all of it: a bonus once earned never runs out
    const wins = bossWins();
    const offc0 = G.offCfg();
    for (const s of out.values()) {
      const qd = ((S.members.get(s.uid) || {}).questDays) || {};
      const gold = ((S.members.get(s.uid) || {}).gold) || {};
      for (const day of Object.values(gold)) {
        if (!day || day > today) continue;
        s.golds++;
        ev(s, day, G.XP.gold, 'gold');
      }
      const days = new Set([...Object.keys(s.byDay), ...Object.keys(s.days), ...Object.keys(qd)]);
      const perWeek = new Map();
      s.freezeGifts = new Set();
      for (const day of [...days].sort()) {
        if (day < horizon || day > today) continue;
        const rec = qd[day];
        const done = day >= G.QUEST_V2 ? !!rec : !!rec || G.questsFor(s.uid, day, s).every((x) => x.done);
        if (!done) continue;
        s.questDays++;
        ev(s, day, G.XP.quests, 'quests');
        if (rec && rec.b) ev(s, day, G.XP.bonus, 'bonus');
        if (day >= G.QUEST_V2) {
          const r = G.chestReward(s.uid, day);
          if (r === 'xp') ev(s, day, G.XP.chestXp, 'chest');
          if (r === 'fz') s.freezeGifts.add(day);
          // the big chest: the fifth full day of a week
          const wk0 = U.weekStart(day);
          const n = (perWeek.get(wk0) || 0) + 1;
          perWeek.set(wk0, n);
          if (n === G.bigChestDays(wk0)) {
            ev(s, day, G.XP.bigChest, 'bigchest');
            s.bigChests++;
          }
        }
      }
      s.questWeek = perWeek.get(wk) || 0;
      // the weekly boss (play.js): beaten when the circle's pages reached the goal; XP to whoever hit it
      for (const [w0, day] of wins)
        if (G.weekPagesOf(s.uid, w0).pages > 0) {
          ev(s, day, G.XP.boss, 'boss');
          s.bossWins++;
        }
      // the newer badges: what was thrown (friendly or a prank), reactions on lines, characters opened, days off read on
      for (const t of (S.throws || new Map()).values()) {
        if (t.by !== s.uid || !t.it) continue;
        const it = A.Play ? A.Play.item(t.it) : null;
        if (it && it[4] === 'happy') s.gifts++;
        else if (it) s.pranks++;
      }
      for (const r of (S.reacts || new Map()).values()) if (r.by === s.uid && r.e) s.reacts++;
      if (A.Play) s.chars = A.Play.CHARS.filter((c) => A.Play.unlocked(c[0], s.uid)).length;
      for (const [d, n] of Object.entries(s.days)) if (+n > 0 && d <= today && G.isOff(d, offc0)) s.offReads++;
      const pwk = U.addDays(wk, -7);
      for (const e of s.events) {
        s.xp += e.xp;
        if (e.day >= wk) s.week += e.xp;
        else if (e.day >= pwk) s.prevWeek += e.xp;
        if (e.day === today) s.todayXp += e.xp;
      }
      for (const [d, n] of Object.entries(s.days)) {
        if (d >= wk) s.pagesWeek += n;
        else if (d >= pwk) s.pagesPrevWeek += n;
        if (d === today) s.pagesToday += n;
      }
      for (const [d, v] of Object.entries(s.byDay)) if (v.notes || v.talk || v.wirds) s.active.add(d);
      // streak
      // Streak with protection: every 7 reading days in a row earn one "freeze" (max 2),
      // which automatically covers a missed day so the streak survives.
      const act = (d) => s.active.has(d);
      const offc = G.offCfg();
      const sorted = [...s.active].sort();
      let run = 0, fz = 0, best = 0;
      s.frozen = [];
      if (sorted.length) {
        for (let d = sorted[0], i = 0; d <= today && i < 4000; d = U.addDays(d, 1), i++) {
          if (act(d)) {
            run++;
            if (run % 7 === 0) fz = Math.min(2, fz + 1);
          } else if (d === today) {
            // today isn't over yet
          } else if (G.isOff(d, offc)) {
            // a day off: the streak waits over it
          } else if (run > 0 && fz > 0) {
            fz--;
            s.frozen.push(d);
          } else run = 0;
          if (s.freezeGifts.has(d)) fz = Math.min(2, fz + 1); // a freeze from the day's chest
          best = Math.max(best, run);
        }
      }
      s.streak = run;
      s.freezes = fz;
      s.atRisk = run > 0 && !act(today) && !G.isOff(today, offc);
      s.best = best;
      weekStreak(s, sorted, today);
      Object.assign(s, G.levelOf(s.xp));
      s.badges = G.BADGES.map((b) => {
        const v = b.v(s);
        return { b, v: Math.min(v, b.n), got: v >= b.n };
      });
      s.badgeCount = s.badges.filter((x) => x.got).length;
    }
    return out;
  }

  /* Weeks the circle beat its boss (since QUEST_V2): [week start, the day the pages reached the goal]. */
  G.bossWinList = () => bossWins(); // [[week start, the day it went down], …] («ذكرى الكتاب» in export.js)
  function bossWins() {
    const today = U.today();
    const out = [];
    for (let w0 = U.weekStart(G.QUEST_V2); w0 <= today; w0 = U.addDays(w0, 7)) {
      const goal = G.weekGoal(w0);
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(w0, i);
        if (d > today) break;
        for (const uid of S.members.keys()) {
          const m = S.members.get(uid) || {};
          sum += +((m.days && m.days[d]) || 0);
        }
        sum += paperOn(d);
        if (sum >= goal) {
          out.push([w0, d]);
          break;
        }
      }
    }
    return out;
  }
  /* Pages of portions marked done on a day without being read in the app (as G.weekPagesOf counts them). */
  function paperOn(day) {
    let n = 0;
    for (const p of S.prog.values()) {
      const book = S.books.get(p.b) || (S.gone && S.gone.get(p.b));
      if (!book) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t || U.isoKey(t) !== day) continue;
        const w = G.wirds(book).find((x) => x.id === wid);
        if (w) n += Math.max(0, w.to - w.from + 1 - U.rangesCountIn(p.seen, w.from, w.to));
      }
    }
    return n;
  }
  let cache = { ver: -1, out: new Map() };
  G.all = () => {
    if (cache.ver !== S.ver) cache = { ver: S.ver, out: compute() };
    return cache.out;
  };
  G.of = (uid) => G.all().get(uid) || Object.assign(blank(uid), G.levelOf(0), { streak: 0, best: 0, badges: [], badgeCount: 0 });
  G.myQuests = () => G.questsFor(S.me, U.today(), G.of(S.me));

  G.board = (mode = 'week') => {
    const rows = [...G.all().values()].filter((s) => S.members.has(s.uid));
    rows.sort((a, b) => (mode === 'week' ? b.week - a.week : b.xp - a.xp) || b.xp - a.xp);
    return rows;
  };
  /* Pages of a member in the week starting ws (Saturday): read in the app, plus the pages of portions marked
     done that week that weren't read in the app (read on paper, say). days: days with either. */
  G.weekPagesOf = (uid, ws = U.weekStart()) => {
    const we = U.addDays(ws, 6);
    const m = S.members.get(uid) || {};
    let app = 0;
    const days = new Set();
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(ws, i);
      const n = +((m.days && m.days[d]) || 0);
      if (n > 0) {
        app += n;
        days.add(d);
      }
    }
    let paper = 0;
    for (const p of S.prog.values()) {
      if (p.u !== uid) continue;
      const book = S.books.get(p.b) || (S.gone && S.gone.get(p.b));
      if (!book) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        const d = t && U.isoKey(t);
        if (!d || d < ws || d > we) continue;
        const w = G.wirds(book).find((x) => x.id === wid);
        if (!w) continue;
        let seen = 0;
        for (let pg = w.from; pg <= w.to; pg++) if (U.rangesHas(p.seen, pg)) seen++;
        const off = Math.max(0, w.to - w.from + 1 - seen);
        if (off) {
          paper += off;
          days.add(d);
        }
      }
    }
    return { pages: app + paper, app, paper, days: days.size };
  };
  G.groupWeek = () => {
    let pages = 0;
    for (const uid of S.members.keys()) pages += G.weekPagesOf(uid).pages;
    const goal = G.weekGoal(); // smaller in a week with days off
    return { pages, goal };
  };
})();
