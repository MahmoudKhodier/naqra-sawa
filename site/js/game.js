/* Game layer: XP, levels, streaks, daily quests and badges.
   Everything is DERIVED from shared data (no counters are stored), so every viewer computes the same numbers. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const G = (A.G = {});

  G.XP = { page: 1, wird: 20, onTime: 10, first: 10, note: 5, take: 8, reply: 2, liked: 2, shelf: 10, review: 5, book: 100, cheer: 1, quests: 30, goal: 15, milestone: 15, focus: 1 };

  /* Hours of the day a page was read in, kept per day as a 24-bit mask (bit h = some page counted in hour h). */
  const HOURS = (...hs) => hs.reduce((m, h) => m | (1 << h), 0);
  const NIGHT = HOURS(22, 23, 0, 1, 2, 3);
  const EARLY = HOURS(5, 6, 7);
  const MORNING = HOURS(5, 6, 7, 8, 9, 10, 11);
  const AFTERNOON = HOURS(12, 13, 14, 15, 16);
  const EVENING = HOURS(17, 18, 19, 20, 21);
  G.HOUR_BUCKETS = { MORNING, AFTERNOON, EVENING, NIGHT };

  /* Hijri year / month / day of a day key (Umm al-Qura), cached: Ramadan and Eid badges. */
  const hijriCache = new Map();
  let hijriFmt = null;
  G.hijriParts = (k) => {
    if (hijriCache.has(k)) return hijriCache.get(k);
    let v = null;
    try {
      hijriFmt = hijriFmt || new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
      const parts = hijriFmt.formatToParts(U.parseD(k));
      const get = (t) => parseInt((parts.find((x) => x.type === t) || {}).value, 10) || 0;
      v = { y: get('year'), m: get('month'), d: get('day') };
      if (!v.m) v = null;
    } catch (e) {}
    hijriCache.set(k, v);
    return v;
  };

  /* The daily goal: pages or minutes a day (kept in the member's profile so it follows them between devices). */
  G.dailyGoal = (uid = S.me) => {
    const m = S.members.get(uid);
    const g = m && m.dg;
    const k = g && g.k === 'mins' ? 'mins' : 'pages';
    const n = Math.round(+(g && g.n) || 0);
    return { k, n: U.clamp(n || (k === 'mins' ? 15 : 10), 1, 600), set: !!(g && g.n) };
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
    ['قارئ جديد', 'New reader', 'قارئ جديد'],
    ['فاتح الكتاب', 'Page turner', 'فاتح الكتاب'],
    ['رفيق الورق', 'Paper companion', 'رفيق الورق'],
    ['صاحب الورد', 'Keeper of the wird', 'صاحب الورد'],
    ['قارئ نهم', 'Avid reader', 'قارئ نهم'],
    ['دودة كتب', 'Bookworm', 'دودة كتب'],
    ['خير جليس', 'Finest companion', 'خير جليس'],
    ['حارس المكتبة', 'Library keeper', 'حارس المكتبة'],
    ['حكيم الحلقة', 'Circle sage', 'حكيم الحلقة'],
    ['بحر المعرفة', 'Sea of knowledge', 'بحر المعرفة'],
  ];
  G.title = (lv) => {
    const t = TITLES[Math.min(lv, TITLES.length) - 1];
    const extra = lv > TITLES.length ? ' ' + L.num(lv - TITLES.length + 1) : '';
    return L(t[0], t[1], t[2]) + extra;
  };

  /* Badges come in groups with up to four levels (bronze, silver, gold, diamond). The first level keeps the
     original ids so badges already earned stay earned. `v` reads a number from the person's stats. */
  G.BADGE_GROUPS = [
    { g: 'pages', ic: 'scroll', tip: ['كل صفحة بتقراها في البرنامج بتتحسب — حتى لو بتقلّب بسرعة لازم تقف على الصفحة شوية.', 'Every page you read in the app counts — pause on a page for it to count.', 'كل صفحة تقرؤها في التطبيق تُحتسب — وإن كنت تقلّب بسرعة فتوقّف عند الصفحة قليلًا.'] },
    { g: 'streak', ic: 'flame', tip: ['اقرأ ولو صفحة كل يوم. كل ٧ أيام ورا بعض بتكسبك «حماية» بتنقذ السلسلة لو فوّت يوم.', 'Read at least a page every day. Every 7 days in a row earns a freeze that saves your streak once.', 'اقرأ ولو صفحة كل يوم. كل ٧ أيام متتالية تمنحك «حماية» تنقذ السلسلة إن فاتك يوم.'] },
    { g: 'days', ic: 'calendar', tip: ['الأيام اللي قريت فيها، مش لازم ورا بعض.', 'Days you read on — they do not have to be in a row.', 'الأيام التي قرأت فيها، ولا يلزم أن تكون متتالية.'] },
    { g: 'marathon', ic: 'bolt', tip: ['عدد الصفحات في يوم واحد.', 'Pages read in a single day.', 'عدد الصفحات في يوم واحد.'] },
    { g: 'hours', ic: 'clock', tip: ['وقت القراية الفعلي جوه القارئ (بيقف لما تسيب الموبايل).', 'Time actually spent reading in the reader (it pauses when you put the phone down).', 'وقت القراءة الفعلي داخل القارئ (يتوقف حين تترك الهاتف).'] },
    { g: 'goal', ic: 'target', tip: ['حط لنفسك هدف يومي (صفحات أو دقايق) من الدايرة اللي في القارئ، وحققه.', 'Set a daily goal (pages or minutes) from the ring in the reader, and reach it.', 'ضع لنفسك هدفًا يوميًا (صفحات أو دقائق) من الدائرة في القارئ، وحقّقه.'] },
    { g: 'focus', ic: 'hourglass', tip: ['ابدأ «جلسة تركيز» من القارئ (١٠ أو ٢٠ أو ٣٠ دقيقة) وكمّلها من غير ما تقفل الكتاب.', 'Start a focus session in the reader (10, 20 or 30 minutes) and finish it without closing the book.', 'ابدأ «جلسة تركيز» من القارئ (١٠ أو ٢٠ أو ٣٠ دقيقة) وأكملها دون أن تغلق الكتاب.'] },
    { g: 'deep', ic: 'timer', tip: ['أطول مرة قريت فيها من غير ما تقفل الكتاب.', 'Your longest stretch of reading without closing the book.', 'أطول مدة قرأت فيها دون أن تغلق الكتاب.'] },
    { g: 'night', ic: 'moon', tip: ['اقرأ بالليل: من ١٠ بالليل لـ٤ الفجر.', 'Read at night: between 10 pm and 4 am.', 'اقرأ ليلًا: من ١٠ مساءً حتى ٤ فجرًا.'] },
    { g: 'early', ic: 'sunrise', tip: ['اقرأ بدري: من ٥ لـ٨ الصبح.', 'Read early: between 5 and 8 am.', 'اقرأ باكرًا: من ٥ حتى ٨ صباحًا.'] },
    { g: 'weekend', ic: 'calendar', tip: ['اقرأ يومين الإجازة الاتنين: الجمعة والسبت.', 'Read on both days of the weekend: Friday and Saturday.', 'اقرأ في يومَي العطلة كليهما: الجمعة والسبت.'] },
    { g: 'friday', ic: 'mosque', tip: ['اقرأ ولو صفحة يوم الجمعة.', 'Read at least a page on a Friday.', 'اقرأ ولو صفحة واحدة يوم الجمعة.'] },
    { g: 'ramadan', ic: 'crescent', tip: ['اقرأ في أيام رمضان. المستوى الأخير: كل يوم في الشهر.', 'Read during Ramadan. The last level: every day of the month.', 'اقرأ في أيام رمضان. المستوى الأخير: كل أيام الشهر.'] },
    { g: 'comeback', ic: 'refresh', tip: ['لو غبت أسبوع أو أكتر ورجعت تقرأ — وحشتنا!', 'Away for a week or more and back to reading — welcome back!', 'إن غبت أسبوعًا أو أكثر ثم عدت إلى القراءة — مرحبًا بعودتك!'] },
    { g: 'wirds', ic: 'check', tip: ['علّم الورد إنه خلص لما تخلّص صفحاته.', 'Mark a portion done when you finish its pages.', 'حدِّد الورد على أنه مكتمل حين تُنهي صفحاته.'] },
    { g: 'ontime', ic: 'clock', tip: ['خلّص الورد قبل أو في يوم ميعاده.', 'Finish a portion on or before its due day.', 'أنهِ الورد في موعده أو قبله.'] },
    { g: 'pioneer', ic: 'bolt', tip: ['كن أول واحد في الحلقة يخلّص الورد.', 'Be the first in the circle to finish a portion.', 'كن أول من يُنهي الورد في الحلقة.'] },
    { g: 'books', ic: 'trophy', tip: ['خلّص كتاب كامل مع الحلقة ودوس «خلّصت الكتاب».', 'Finish a whole book with the circle and tap “I finished it”.', 'أنهِ كتابًا كاملًا مع الحلقة واضغط «أنهيت الكتاب».'] },
    { g: 'perfect', ic: 'star', tip: ['خلّص كتاب مع الحلقة وكل أوراده في ميعادها.', 'Finish a book with the circle with every portion on time.', 'أنهِ كتابًا مع الحلقة وكل أوراده في مواعيدها.'] },
    { g: 'devoted', ic: 'book', tip: ['اقرأ في نفس الكتاب أيام ورا بعض.', 'Read the same book on days in a row.', 'اقرأ في الكتاب نفسه أيامًا متتالية.'] },
    { g: 'notes', ic: 'note', tip: ['ظلّل جملة أو حط ملاحظة على الصفحة وإنت بتقرأ.', 'Highlight a sentence or pin a note while reading.', 'ظلِّل جملة أو ضع ملاحظة على الصفحة أثناء القراءة.'] },
    { g: 'quotes', ic: 'quote', tip: ['لما تظلّل، اختار «اقتباس».', 'When highlighting, choose “Quote”.', 'عند التظليل، اختر «اقتباس».'] },
    { g: 'questions', ic: 'question', tip: ['لما تحط ملاحظة، اختار «سؤال» عشان أصحابك يردّوا.', 'When adding a note, choose “Question” so friends can answer.', 'عند إضافة ملاحظة، اختر «سؤال» لتصلك إجابات أصدقائك.'] },
    { g: 'helper', ic: 'hand', tip: ['رد على أسئلة أصحابك اللي في هوامش الكتاب.', "Answer your friends' questions in the margins.", 'أجِب عن أسئلة أصدقائك في هوامش الكتاب.'] },
    { g: 'spark', ic: 'idea', tip: ['اسأل سؤال على الكتاب يرد عليه ٣ من أصحابك أو أكتر.', 'Ask a question in the margins that 3 or more friends answer.', 'اطرح سؤالًا عن الكتاب يحصد إجابات ٣ من أصدقائك أو أكثر.'] },
    { g: 'takes', ic: 'sparkle', tip: ['بعد ما تخلّص الورد، اكتب أهم فكرة خرجت بيها من «خلاصات الورد».', 'After a portion, write the main idea you took away under “Takeaways”.', 'بعد أن تُنهي الورد، اكتب أهم فكرة خرجت بها في «خلاصات الورد».'] },
    { g: 'talk', ic: 'chat', tip: ['ردود على الملاحظات ورسايل في النقاش.', 'Replies to notes and messages in discussions.', 'ردود على الملاحظات ورسائل في النقاش.'] },
    { g: 'loved', ic: 'heart', tip: ['الإعجابات اللي بتجيلك على ملاحظاتك.', 'Likes your notes receive.', 'الإعجابات التي تتلقاها ملاحظاتك.'] },
    { g: 'generous', ic: 'heart', tip: ['اعمل إعجاب لملاحظات أصحابك.', "Like your friends' notes.", 'أبدِ إعجابك بملاحظات أصدقائك.'] },
    { g: 'cheer', ic: 'clap', tip: ['شجّع أو فكّر أصحابك من صفحة الحلقة أو التقدّم.', 'Cheer on or nudge friends from the circle or progress pages.', 'شجِّع أصدقاءك أو ذكِّرهم من صفحة الحلقة أو التقدّم.'] },
    { g: 'voter', ic: 'vote', tip: ['صوّت على الكتب المقترحة للحلقة.', 'Vote on the books suggested to the circle.', 'صوِّت على الكتب المقترحة للحلقة.'] },
    { g: 'shelf', ic: 'shelf', tip: ['ضيف الكتب اللي قريتها قبل كده لمكتبتك (أو استوردها من Goodreads).', 'Add books you have read to your shelf (or import them from Goodreads).', 'أضِف الكتب التي قرأتها من قبل إلى مكتبتك (أو استوردها من Goodreads).'] },
    { g: 'critic', ic: 'edit', tip: ['اكتب رأيك (أكتر من سطر) في كتب مكتبتك.', 'Write a review (more than a line) for books on your shelf.', 'اكتب رأيك (أكثر من سطر) في كتب مكتبتك.'] },
    { g: 'quests', ic: 'chest', tip: ['خلّص مهام اليوم التلاتة وافتح الصندوق.', 'Finish all three daily quests and open the chest.', 'أنجِز مهام اليوم الثلاث وافتح الصندوق.'] },
    { g: 'level', ic: 'sparkle', tip: ['كل XP بتكسبه بيقرّبك للمستوى الجاي.', 'Every XP you earn brings the next level closer.', 'كل XP تكسبه يقرّبك من المستوى التالي.'] },
    // Secret badges: shown as «؟؟؟» with a vague hint until earned.
    { g: 'x_midnight', ic: 'clock', secret: true, tip: ['في ساعة ما بين يومين…', 'In the hour between two days…', 'في الساعة الفاصلة بين يومين…'] },
    { g: 'x_dawn', ic: 'sunrise', secret: true, tip: ['قبل ما الشمس تصحى…', 'Before the sun wakes up…', 'قبل أن تستيقظ الشمس…'] },
    { g: 'x_allday', ic: 'sun', secret: true, tip: ['اليوم كله ليك: صبح وضهر وعصر وليل.', 'The whole day is yours: morning, noon, evening and night.', 'اليوم كله لك: صباح وظهر وعصر وليل.'] },
    { g: 'x_lastcall', ic: 'flag', secret: true, tip: ['الورد مش لازم يخلص بدري…', "A portion doesn't have to end early…", 'ليس على الورد أن ينتهي باكرًا…'] },
    { g: 'x_triple', ic: 'books', secret: true, tip: ['في يوم واحد، أكتر من حكاية.', 'One day, more than one story.', 'في يوم واحد، أكثر من حكاية.'] },
    { g: 'x_firstpage', ic: 'pin', secret: true, tip: ['البدايات ليها طعم تاني.', 'Beginnings taste different.', 'للبدايات طعم مختلف.'] },
    { g: 'x_eid', ic: 'crescent', secret: true, tip: ['حتى يوم الفرحة الكبيرة…', 'Even on the day of the big celebration…', 'حتى في يوم الفرحة الكبيرة…'] },
    { g: 'x_year', ic: 'users', secret: true, tip: ['الوقت بيعدّي حلو مع الصحاب.', 'Time flies with good friends.', 'يمضي الوقت جميلًا مع الأصحاب.'] },
  ];
  const B = (g, tier, id, n, v, t, d) => {
    const grp = G.BADGE_GROUPS.find((x) => x.g === g) || {};
    return { g, tier, id, n, v, t, d, ic: grp.ic || 'sparkle', secret: !!grp.secret };
  };
  G.BADGES = [
    B('pages', 1, 'p100', 100, (s) => s.pages, ['مية صفحة', '100 pages', 'مئة صفحة'], ['اقرأ ١٠٠ صفحة', 'Read 100 pages', 'اقرأ ١٠٠ صفحة']),
    B('pages', 2, 'p1000', 1000, (s) => s.pages, ['ألف صفحة', '1,000 pages', 'ألف صفحة'], ['اقرأ ١٠٠٠ صفحة', 'Read 1,000 pages', 'اقرأ ١٠٠٠ صفحة']),
    B('pages', 3, 'p5000', 5000, (s) => s.pages, ['خمس تلاف صفحة', '5,000 pages', 'خمسة آلاف صفحة'], ['اقرأ ٥٠٠٠ صفحة', 'Read 5,000 pages', 'اقرأ ٥٠٠٠ صفحة']),
    B('pages', 4, 'p10000', 10000, (s) => s.pages, ['عشر تلاف صفحة', '10,000 pages', 'عشرة آلاف صفحة'], ['اقرأ ١٠٬٠٠٠ صفحة', 'Read 10,000 pages', 'اقرأ ١٠٬٠٠٠ صفحة']),
    B('streak', 1, 'streak7', 7, (s) => s.best, ['أسبوع نار', 'Week on fire', 'أسبوع مشتعل'], ['اقرأ ٧ أيام ورا بعض', 'Read 7 days in a row', 'اقرأ ٧ أيام متتالية']),
    B('streak', 2, 'streak30', 30, (s) => s.best, ['شهر من غير ما تقطع', 'Unbroken month', 'شهر بلا انقطاع'], ['اقرأ ٣٠ يوم ورا بعض', 'Read 30 days in a row', 'اقرأ ٣٠ يومًا متتالية']),
    B('streak', 3, 'streak100', 100, (s) => s.best, ['مية يوم', '100-day streak', 'مئة يوم'], ['اقرأ ١٠٠ يوم ورا بعض', 'Read 100 days in a row', 'اقرأ ١٠٠ يوم متتالية']),
    B('streak', 4, 'streak365', 365, (s) => s.best, ['سنة بحالها', 'A whole year', 'سنة كاملة'], ['اقرأ ٣٦٥ يوم ورا بعض', 'Read 365 days in a row', 'اقرأ ٣٦٥ يومًا متتالية']),
    B('days', 1, 'days30', 30, (s) => s.daysRead, ['قارئ مخلص', 'Faithful reader', 'قارئ مخلص'], ['اقرأ في ٣٠ يوم مختلف', 'Read on 30 different days', 'اقرأ في ٣٠ يومًا مختلفة']),
    B('days', 2, 'days100', 100, (s) => s.daysRead, ['عادة يومية', 'Daily habit', 'عادة يومية'], ['اقرأ في ١٠٠ يوم مختلف', 'Read on 100 different days', 'اقرأ في ١٠٠ يوم مختلف']),
    B('days', 3, 'days365', 365, (s) => s.daysRead, ['رفيق الكتاب', 'Book companion', 'رفيق الكتاب'], ['اقرأ في ٣٦٥ يوم مختلف', 'Read on 365 different days', 'اقرأ في ٣٦٥ يومًا مختلفًا']),
    B('marathon', 1, 'day50', 50, (s) => s.maxDay, ['ماراثون', 'Marathon', 'ماراثون'], ['اقرأ ٥٠ صفحة في يوم واحد', 'Read 50 pages in one day', 'اقرأ ٥٠ صفحة في يوم واحد']),
    B('marathon', 2, 'day100', 100, (s) => s.maxDay, ['ماراثون كبير', 'Ultra marathon', 'ماراثون طويل'], ['اقرأ ١٠٠ صفحة في يوم واحد', 'Read 100 pages in one day', 'اقرأ ١٠٠ صفحة في يوم واحد']),
    B('marathon', 3, 'day200', 200, (s) => s.maxDay, ['لازق في الكتاب', "Couldn't put it down", 'أسير الكتاب'], ['اقرأ ٢٠٠ صفحة في يوم واحد', 'Read 200 pages in one day', 'اقرأ ٢٠٠ صفحة في يوم واحد']),
    B('hours', 1, 'hours10', 10, (s) => Math.floor(s.secs / 3600), ['عشر ساعات', '10 hours', 'عشر ساعات'], ['اقرأ ١٠ ساعات', 'Read for 10 hours', 'اقرأ ١٠ ساعات']),
    B('hours', 2, 'hours50', 50, (s) => Math.floor(s.secs / 3600), ['خمسين ساعة', '50 hours', 'خمسون ساعة'], ['اقرأ ٥٠ ساعة', 'Read for 50 hours', 'اقرأ ٥٠ ساعة']),
    B('hours', 3, 'hours100', 100, (s) => Math.floor(s.secs / 3600), ['مية ساعة', '100 hours', 'مئة ساعة'], ['اقرأ ١٠٠ ساعة', 'Read for 100 hours', 'اقرأ ١٠٠ ساعة']),
    B('goal', 1, 'goal7', 7, (s) => s.goalDays, ['في الجون', 'On target', 'في الهدف'], ['حقق هدفك اليومي ٧ أيام', 'Reach your daily goal on 7 days', 'حقّق هدفك اليومي في ٧ أيام']),
    B('goal', 2, 'goal30', 30, (s) => s.goalDays, ['ملتزم', 'Committed', 'ملتزم'], ['حقق هدفك اليومي ٣٠ يوم', 'Reach your daily goal on 30 days', 'حقّق هدفك اليومي في ٣٠ يومًا']),
    B('goal', 3, 'goal100', 100, (s) => s.goalDays, ['هدّاف', 'Sharpshooter', 'هدّاف'], ['حقق هدفك اليومي ١٠٠ يوم', 'Reach your daily goal on 100 days', 'حقّق هدفك اليومي في ١٠٠ يوم']),
    B('goal', 4, 'goal365', 365, (s) => s.goalDays, ['ولا يوم فاتك', 'Never miss', 'لم يفُتك يوم'], ['حقق هدفك اليومي ٣٦٥ يوم', 'Reach your daily goal on 365 days', 'حقّق هدفك اليومي في ٣٦٥ يومًا']),
    B('focus', 1, 'focus5', 5, (s) => s.focusN, ['مركّز', 'Focused', 'مركّز'], ['كمّل ٥ جلسات تركيز', 'Finish 5 focus sessions', 'أتمّ ٥ جلسات تركيز']),
    B('focus', 2, 'focus25', 25, (s) => s.focusN, ['دماغ رايقة', 'Clear mind', 'ذهن صافٍ'], ['كمّل ٢٥ جلسة تركيز', 'Finish 25 focus sessions', 'أتمّ ٢٥ جلسة تركيز']),
    B('focus', 3, 'focus100', 100, (s) => s.focusN, ['راهب الكتب', 'Book monk', 'راهب الكتب'], ['كمّل ١٠٠ جلسة تركيز', 'Finish 100 focus sessions', 'أتمّ ١٠٠ جلسة تركيز']),
    B('deep', 1, 'deep30', 30, (s) => s.longest, ['قارئ عميق', 'Deep reader', 'قارئ عميق'], ['اقرأ ٣٠ دقيقة من غير ما تقفل الكتاب', 'Read 30 minutes without closing the book', 'اقرأ ٣٠ دقيقة دون أن تغلق الكتاب']),
    B('deep', 2, 'deep60', 60, (s) => s.longest, ['غطسة طويلة', 'Deep dive', 'غوص عميق'], ['اقرأ ساعة من غير ما تقفل الكتاب', 'Read an hour without closing the book', 'اقرأ ساعة دون أن تغلق الكتاب']),
    B('deep', 3, 'deep120', 120, (s) => s.longest, ['تايه في الكتاب', 'Lost in the book', 'غارق في الكتاب'], ['اقرأ ساعتين من غير ما تقفل الكتاب', 'Read two hours without closing the book', 'اقرأ ساعتين دون أن تغلق الكتاب']),
    B('night', 1, 'night5', 5, (s) => s.nightDays, ['بومة الليل', 'Night owl', 'بومة الليل'], ['اقرأ بالليل في ٥ أيام', 'Read late at night on 5 days', 'اقرأ ليلًا في ٥ أيام']),
    B('night', 2, 'night25', 25, (s) => s.nightDays, ['سهران مع كتاب', 'Up with a book', 'ساهر مع كتاب'], ['اقرأ بالليل في ٢٥ يوم', 'Read late at night on 25 days', 'اقرأ ليلًا في ٢٥ يومًا']),
    B('night', 3, 'night100', 100, (s) => s.nightDays, ['نجم الليل', 'Star of the night', 'نجم الليل'], ['اقرأ بالليل في ١٠٠ يوم', 'Read late at night on 100 days', 'اقرأ ليلًا في ١٠٠ يوم']),
    B('early', 1, 'early5', 5, (s) => s.earlyDays, ['صباح الخير', 'Good morning', 'صباح الخير'], ['اقرأ بدري الصبح في ٥ أيام', 'Read early in the morning on 5 days', 'اقرأ في الصباح الباكر في ٥ أيام']),
    B('early', 2, 'early25', 25, (s) => s.earlyDays, ['العصفورة', 'Early bird', 'عصفور الصباح'], ['اقرأ بدري الصبح في ٢٥ يوم', 'Read early in the morning on 25 days', 'اقرأ في الصباح الباكر في ٢٥ يومًا']),
    B('early', 3, 'early100', 100, (s) => s.earlyDays, ['صاحب الفجر', 'Friend of the dawn', 'رفيق الفجر'], ['اقرأ بدري الصبح في ١٠٠ يوم', 'Read early in the morning on 100 days', 'اقرأ في الصباح الباكر في ١٠٠ يوم']),
    B('weekend', 1, 'weekend4', 4, (s) => s.weekends, ['إجازة مع كتاب', 'Weekend with a book', 'عطلة مع كتاب'], ['اقرأ الجمعة والسبت في ٤ أسابيع', 'Read on Friday and Saturday in 4 weeks', 'اقرأ يومَي الجمعة والسبت في ٤ أسابيع']),
    B('weekend', 2, 'weekend12', 12, (s) => s.weekends, ['قارئ الإجازات', 'Weekend reader', 'قارئ العطلات'], ['اقرأ الجمعة والسبت في ١٢ أسبوع', 'Read on Friday and Saturday in 12 weeks', 'اقرأ يومَي الجمعة والسبت في ١٢ أسبوعًا']),
    B('weekend', 3, 'weekend52', 52, (s) => s.weekends, ['سنة إجازات', 'A year of weekends', 'عام من العطلات'], ['اقرأ الجمعة والسبت في ٥٢ أسبوع', 'Read on Friday and Saturday in 52 weeks', 'اقرأ يومَي الجمعة والسبت في ٥٢ أسبوعًا']),
    B('friday', 1, 'friday5', 5, (s) => s.fridays, ['جمعة مباركة', 'Blessed Friday', 'جمعة مباركة'], ['اقرأ في ٥ أيام جمعة', 'Read on 5 Fridays', 'اقرأ في ٥ أيام جمعة']),
    B('friday', 2, 'friday20', 20, (s) => s.fridays, ['قارئ الجمعة', 'Friday reader', 'قارئ الجمعة'], ['اقرأ في ٢٠ يوم جمعة', 'Read on 20 Fridays', 'اقرأ في ٢٠ يوم جمعة']),
    B('friday', 3, 'friday52', 52, (s) => s.fridays, ['سنة جُمَع', 'A year of Fridays', 'عام من الجُمَع'], ['اقرأ في ٥٢ يوم جمعة', 'Read on 52 Fridays', 'اقرأ في ٥٢ يوم جمعة']),
    B('ramadan', 1, 'ramadan10', 10, (s) => s.ramadan, ['رمضان كريم', 'Ramadan Kareem', 'رمضان كريم'], ['اقرأ ١٠ أيام في رمضان', 'Read on 10 days of Ramadan', 'اقرأ في ١٠ أيام من رمضان']),
    B('ramadan', 2, 'ramadan20', 20, (s) => s.ramadan, ['ليالي رمضان', 'Ramadan nights', 'ليالي رمضان'], ['اقرأ ٢٠ يوم في رمضان', 'Read on 20 days of Ramadan', 'اقرأ في ٢٠ يومًا من رمضان']),
    B('ramadan', 3, 'ramadan30', 30, (s) => s.ramadan, ['رمضان كامل', 'All of Ramadan', 'رمضان كاملًا'], ['اقرأ كل يوم في رمضان', 'Read every day of Ramadan', 'اقرأ كل يوم من رمضان']),
    B('comeback', 1, 'comeback', 1, (s) => s.comebacks, ['نوّرت تاني', 'Welcome back', 'عودة حميدة'], ['ارجع تقرأ بعد أسبوع أو أكتر', 'Come back to reading after a week or more', 'عُد إلى القراءة بعد أسبوع أو أكثر']),
    B('wirds', 1, 'first_wird', 1, (s) => s.wirdsDone, ['أول ورد', 'First portion', 'أول ورد'], ['خلّص أول ورد مع الحلقة', 'Finish your first portion', 'أنهِ أول ورد مع الحلقة']),
    B('wirds', 2, 'wirds10', 10, (s) => s.wirdsDone, ['عشر أوراد', '10 portions', 'عشرة أوراد'], ['خلّص ١٠ أوراد', 'Finish 10 portions', 'أنهِ ١٠ أوراد']),
    B('wirds', 3, 'wirds50', 50, (s) => s.wirdsDone, ['خمسين ورد', '50 portions', 'خمسون وردًا'], ['خلّص ٥٠ ورد', 'Finish 50 portions', 'أنهِ ٥٠ وردًا']),
    B('wirds', 4, 'wirds100', 100, (s) => s.wirdsDone, ['مية ورد', '100 portions', 'مئة ورد'], ['خلّص ١٠٠ ورد', 'Finish 100 portions', 'أنهِ ١٠٠ ورد']),
    B('ontime', 1, 'on_time', 5, (s) => s.onTime, ['في الميعاد', 'Right on time', 'في الموعد'], ['خلّص ٥ أوراد قبل ميعادها', 'Finish 5 portions before they are due', 'أنهِ ٥ أوراد قبل موعدها']),
    B('ontime', 2, 'on_time25', 25, (s) => s.onTime, ['منضبط', 'Punctual', 'منضبط'], ['خلّص ٢٥ ورد في ميعادهم', 'Finish 25 portions on time', 'أنهِ ٢٥ وردًا في موعدها']),
    B('ontime', 3, 'on_time100', 100, (s) => s.onTime, ['زي الساعة', 'Like clockwork', 'كالساعة'], ['خلّص ١٠٠ ورد في ميعادهم', 'Finish 100 portions on time', 'أنهِ ١٠٠ ورد في موعدها']),
    B('pioneer', 1, 'pioneer', 3, (s) => s.firsts, ['السبّاق', 'Trailblazer', 'السبّاق'], ['كن أول واحد يخلّص الورد ٣ مرات', 'Be first to finish a portion 3 times', 'كن أول من يُنهي الورد ٣ مرات']),
    B('pioneer', 2, 'pioneer10', 10, (s) => s.firsts, ['دايما الأول', 'Always first', 'الأول دائمًا'], ['كن الأول ١٠ مرات', 'Be first 10 times', 'كن الأول ١٠ مرات']),
    B('pioneer', 3, 'pioneer30', 30, (s) => s.firsts, ['قائد الحلقة', 'Circle leader', 'قائد الحلقة'], ['كن الأول ٣٠ مرة', 'Be first 30 times', 'كن الأول ٣٠ مرة']),
    B('books', 1, 'finisher', 1, (s) => s.booksDone, ['خاتم الكتاب', 'Book finisher', 'خاتم الكتاب'], ['خلّص كتاب كامل مع الحلقة', 'Finish a whole book with the circle', 'أنهِ كتابًا كاملًا مع الحلقة']),
    B('books', 2, 'books3', 3, (s) => s.booksDone, ['تلات كتب', 'Three books', 'ثلاثة كتب'], ['خلّص ٣ كتب مع الحلقة', 'Finish 3 books with the circle', 'أنهِ ٣ كتب مع الحلقة']),
    B('books', 3, 'books10', 10, (s) => s.booksDone, ['عشر كتب', 'Ten books', 'عشرة كتب'], ['خلّص ١٠ كتب مع الحلقة', 'Finish 10 books with the circle', 'أنهِ ١٠ كتب مع الحلقة']),
    B('books', 4, 'books25', 25, (s) => s.booksDone, ['مكتبة ماشية على الأرض', 'Walking library', 'مكتبة متنقلة'], ['خلّص ٢٥ كتاب مع الحلقة', 'Finish 25 books with the circle', 'أنهِ ٢٥ كتابًا مع الحلقة']),
    B('perfect', 1, 'perfect1', 1, (s) => s.perfect, ['الكتاب المثالي', 'The perfect book', 'الكتاب المثالي'], ['خلّص كتاب وكل أوراده في ميعادها', 'Finish a book with every portion on time', 'أنهِ كتابًا وكل أوراده في موعدها']),
    B('perfect', 2, 'perfect3', 3, (s) => s.perfect, ['تلاتة مثاليين', 'Three perfect books', 'ثلاثية مثالية'], ['خلّص ٣ كتب وكل أوراده في ميعادها', 'Finish 3 books with every portion on time', 'أنهِ ٣ كتب وكل أورادها في موعدها']),
    B('perfect', 3, 'perfect10', 10, (s) => s.perfect, ['مظبوط بالمللي', 'Precision itself', 'الدقة بعينها'], ['خلّص ١٠ كتب وكل أوراده في ميعادها', 'Finish 10 books with every portion on time', 'أنهِ ١٠ كتب وكل أورادها في موعدها']),
    B('devoted', 1, 'devoted7', 7, (s) => s.devoted, ['وفي للكتاب', 'Devoted', 'وفيّ للكتاب'], ['اقرأ في نفس الكتاب ٧ أيام ورا بعض', 'Read the same book 7 days in a row', 'اقرأ في الكتاب نفسه ٧ أيام متتالية']),
    B('devoted', 2, 'devoted14', 14, (s) => s.devoted, ['صاحبه الجدع', 'True companion', 'الصديق الصدوق'], ['اقرأ في نفس الكتاب ١٤ يوم ورا بعض', 'Read the same book 14 days in a row', 'اقرأ في الكتاب نفسه ١٤ يومًا متتالية']),
    B('devoted', 3, 'devoted30', 30, (s) => s.devoted, ['عشرة عمر', 'Lifelong bond', 'رفقة عمر'], ['اقرأ في نفس الكتاب ٣٠ يوم ورا بعض', 'Read the same book 30 days in a row', 'اقرأ في الكتاب نفسه ٣٠ يومًا متتالية']),
    B('notes', 1, 'pen', 10, (s) => s.notes, ['صاحب قلم', 'Margin writer', 'صاحب قلم'], ['اكتب ١٠ ملاحظات أو تظليلات', 'Leave 10 notes or highlights', 'أضِف ١٠ ملاحظات أو تظليلات']),
    B('notes', 2, 'pen50', 50, (s) => s.notes, ['قلم رصاص', 'Pencil in hand', 'قلم رصاص'], ['اكتب ٥٠ ملاحظة أو تظليل', 'Leave 50 notes or highlights', 'أضِف ٥٠ ملاحظة أو تظليلًا']),
    B('notes', 3, 'pen200', 200, (s) => s.notes, ['شارح المتون', 'The annotator', 'شارح المتون'], ['اكتب ٢٠٠ ملاحظة أو تظليل', 'Leave 200 notes or highlights', 'أضِف ٢٠٠ ملاحظة أو تظليل']),
    B('quotes', 1, 'quotes', 5, (s) => s.quotes, ['صياد الاقتباسات', 'Quote hunter', 'صيّاد الاقتباسات'], ['احفظ ٥ اقتباسات', 'Save 5 quotes', 'احفظ ٥ اقتباسات']),
    B('quotes', 2, 'quotes25', 25, (s) => s.quotes, ['دفتر الاقتباسات', 'Commonplace book', 'دفتر الاقتباسات'], ['احفظ ٢٥ اقتباس', 'Save 25 quotes', 'احفظ ٢٥ اقتباسًا']),
    B('quotes', 3, 'quotes100', 100, (s) => s.quotes, ['خزانة الحكم', 'Treasury of wisdom', 'خزانة الحِكَم'], ['احفظ ١٠٠ اقتباس', 'Save 100 quotes', 'احفظ ١٠٠ اقتباس']),
    B('questions', 1, 'curious', 5, (s) => s.questions, ['الفضولي', 'Curious mind', 'الفضولي'], ['اسأل ٥ أسئلة على الكتاب', 'Ask 5 questions in the margins', 'اطرح ٥ أسئلة في هوامش الكتاب']),
    B('questions', 2, 'curious25', 25, (s) => s.questions, ['الباحث', 'The researcher', 'الباحث'], ['اسأل ٢٥ سؤال', 'Ask 25 questions', 'اطرح ٢٥ سؤالًا']),
    B('helper', 1, 'helper5', 5, (s) => s.helped, ['إيد بتساعد', 'Helping hand', 'يد العون'], ['رد على ٥ أسئلة لأصحابك', "Answer 5 of your friends' questions", 'أجِب عن ٥ أسئلة من أصحابك']),
    B('helper', 2, 'helper25', 25, (s) => s.helped, ['المرجع', 'The go-to', 'المرجع'], ['رد على ٢٥ سؤال لأصحابك', "Answer 25 of your friends' questions", 'أجِب عن ٢٥ سؤالًا من أصحابك']),
    B('helper', 3, 'helper100', 100, (s) => s.helped, ['الأستاذ', 'The professor', 'الأستاذ'], ['رد على ١٠٠ سؤال لأصحابك', "Answer 100 of your friends' questions", 'أجِب عن ١٠٠ سؤال من أصحابك']),
    B('spark', 1, 'spark1', 1, (s) => s.sparks, ['سؤال في الصميم', 'Good question', 'سؤال في الصميم'], ['اسأل سؤال يرد عليه ٣ من أصحابك', 'Ask a question that 3 friends answer', 'اطرح سؤالًا يجيب عنه ٣ من أصحابك']),
    B('spark', 2, 'spark5', 5, (s) => s.sparks, ['بيحرّك النقاش', 'Conversation starter', 'مفتاح النقاش'], ['اسأل ٥ أسئلة يرد على كل واحد ٣ من أصحابك', 'Ask 5 questions that 3 friends answer', 'اطرح ٥ أسئلة يجيب عن كلٍّ منها ٣ من أصحابك']),
    B('spark', 3, 'spark20', 20, (s) => s.sparks, ['شرارة الحلقة', 'Spark of the circle', 'شرارة الحلقة'], ['اسأل ٢٠ سؤال يرد على كل واحد ٣ من أصحابك', 'Ask 20 questions that 3 friends answer', 'اطرح ٢٠ سؤالًا يجيب عن كلٍّ منها ٣ من أصحابك']),
    B('takes', 1, 'take', 3, (s) => s.takes, ['من الآخر', 'The distiller', 'الخلاصة'], ['اكتب خلاصتك لـ٣ أوراد', 'Write your takeaway for 3 portions', 'اكتب خلاصتك لـ٣ أوراد']),
    B('takes', 2, 'take15', 15, (s) => s.takes, ['المُلخِّص', 'The summariser', 'المُلخِّص'], ['اكتب ١٥ خلاصة', 'Write 15 takeaways', 'اكتب ١٥ خلاصة']),
    B('takes', 3, 'take50', 50, (s) => s.takes, ['عصارة الكتب', 'Essence of books', 'عصارة الكتب'], ['اكتب ٥٠ خلاصة', 'Write 50 takeaways', 'اكتب ٥٠ خلاصة']),
    B('talk', 1, 'talk', 25, (s) => s.replies + s.msgs, ['المحاور', 'Conversationalist', 'المُحاوِر'], ['شارك ٢٥ مرة في النقاش', 'Post 25 replies or messages', 'شارك ٢٥ مرة في النقاش']),
    B('talk', 2, 'talk100', 100, (s) => s.replies + s.msgs, ['روح النقاش', 'Life of the discussion', 'روح النقاش'], ['شارك ١٠٠ مرة في النقاش', 'Post 100 replies or messages', 'شارك ١٠٠ مرة في النقاش']),
    B('talk', 3, 'talk500', 500, (s) => s.replies + s.msgs, ['صالون أدبي', 'Literary salon', 'صالون أدبي'], ['شارك ٥٠٠ مرة في النقاش', 'Post 500 replies or messages', 'شارك ٥٠٠ مرة في النقاش']),
    B('loved', 1, 'loved', 25, (s) => s.likesRecv, ['حبيب الحلقة', 'Circle favourite', 'محبوب الحلقة'], ['اجمع ٢٥ إعجاب على ملاحظاتك', 'Collect 25 likes on your notes', 'اجمع ٢٥ إعجابًا على ملاحظاتك']),
    B('loved', 2, 'loved100', 100, (s) => s.likesRecv, ['قلمه مسموع', 'A voice people follow', 'قلم له صدى'], ['اجمع ١٠٠ إعجاب', 'Collect 100 likes', 'اجمع ١٠٠ إعجاب']),
    B('loved', 3, 'loved500', 500, (s) => s.likesRecv, ['نجم الحلقة', 'Circle star', 'نجم الحلقة'], ['اجمع ٥٠٠ إعجاب', 'Collect 500 likes', 'اجمع ٥٠٠ إعجاب']),
    B('generous', 1, 'generous10', 10, (s) => s.likesGiven, ['كريم', 'Generous', 'كريم'], ['اعمل إعجاب لـ١٠ ملاحظات من أصحابك', "Like 10 of your friends' notes", 'أبدِ إعجابك بـ١٠ ملاحظات من أصحابك']),
    B('generous', 2, 'generous50', 50, (s) => s.likesGiven, ['قلبه كبير', 'Big-hearted', 'قلب كبير'], ['اعمل إعجاب لـ٥٠ ملاحظة', 'Like 50 notes', 'أبدِ إعجابك بـ٥٠ ملاحظة']),
    B('generous', 3, 'generous200', 200, (s) => s.likesGiven, ['سند الحلقة', 'Circle supporter', 'داعم الحلقة'], ['اعمل إعجاب لـ٢٠٠ ملاحظة', 'Like 200 notes', 'أبدِ إعجابك بـ٢٠٠ ملاحظة']),
    B('cheer', 1, 'cheer', 10, (s) => s.cheers, ['المشجّع', 'Cheerleader', 'المشجّع'], ['شجّع أصحابك ١٠ مرات', 'Cheer or nudge friends 10 times', 'شجّع أصحابك ١٠ مرات']),
    B('cheer', 2, 'cheer50', 50, (s) => s.cheers, ['الدينامو', 'The motivator', 'المحفّز'], ['شجّع أصحابك ٥٠ مرة', 'Cheer or nudge friends 50 times', 'شجّع أصحابك ٥٠ مرة']),
    B('voter', 1, 'voter5', 5, (s) => s.votes, ['صوتك مسموع', 'Your vote counts', 'صوتك مسموع'], ['صوّت على ٥ كتب مقترحة', 'Vote on 5 suggested books', 'صوّت على ٥ كتب مقترحة']),
    B('voter', 2, 'voter20', 20, (s) => s.votes, ['ضمير الحلقة', 'Voice of the circle', 'ضمير الحلقة'], ['صوّت على ٢٠ كتاب مقترح', 'Vote on 20 suggested books', 'صوّت على ٢٠ كتابًا مقترحًا']),
    B('shelf', 1, 'shelf10', 10, (s) => s.shelfRead, ['مكتبة عامرة', 'Full shelf', 'مكتبة عامرة'], ['ضيف ١٠ كتب قرأتها لمكتبتك', 'Add 10 books you have read', 'أضِف إلى مكتبتك ١٠ كتب قرأتها']),
    B('shelf', 2, 'shelf50', 50, (s) => s.shelfRead, ['أمين المكتبة', 'The librarian', 'أمين المكتبة'], ['ضيف ٥٠ كتاب قرأته', 'Add 50 books you have read', 'أضِف ٥٠ كتابًا قرأتها']),
    B('shelf', 3, 'shelf100', 100, (s) => s.shelfRead, ['دار الكتب', 'House of books', 'دار الكتب'], ['ضيف ١٠٠ كتاب قرأته', 'Add 100 books you have read', 'أضِف ١٠٠ كتاب قرأتها']),
    B('critic', 1, 'critic', 5, (s) => s.reviews, ['الناقد', 'The critic', 'الناقد'], ['اكتب رأيك في ٥ كتب', 'Review 5 books', 'اكتب رأيك في ٥ كتب']),
    B('critic', 2, 'critic20', 20, (s) => s.reviews, ['الناقد الأدبي', 'Literary critic', 'الناقد الأدبي'], ['اكتب رأيك في ٢٠ كتاب', 'Review 20 books', 'اكتب رأيك في ٢٠ كتابًا']),
    B('quests', 1, 'quests', 7, (s) => s.questDays, ['صائد الكنوز', 'Treasure hunter', 'صائد الكنوز'], ['افتح صندوق مهام اليوم ٧ مرات', 'Complete the daily quests 7 times', 'افتح صندوق مهام اليوم ٧ مرات']),
    B('quests', 2, 'quests30', 30, (s) => s.questDays, ['جامع الكنوز', 'Treasure collector', 'جامع الكنوز'], ['افتح الصندوق ٣٠ مرة', 'Open the chest 30 times', 'افتح الصندوق ٣٠ مرة']),
    B('quests', 3, 'quests100', 100, (s) => s.questDays, ['ملك الكنوز', 'Treasure king', 'ملك الكنوز'], ['افتح الصندوق ١٠٠ مرة', 'Open the chest 100 times', 'افتح الصندوق ١٠٠ مرة']),
    B('level', 1, 'lv5', 5, (s) => s.lv, ['المستوى ٥', 'Level 5', 'المستوى ٥'], ['وصّل للمستوى ٥', 'Reach level 5', 'صِل إلى المستوى ٥']),
    B('level', 2, 'lv10', 10, (s) => s.lv, ['المستوى ١٠', 'Level 10', 'المستوى ١٠'], ['وصّل للمستوى ١٠', 'Reach level 10', 'صِل إلى المستوى ١٠']),
    B('level', 3, 'lv20', 20, (s) => s.lv, ['المستوى ٢٠', 'Level 20', 'المستوى ٢٠'], ['وصّل للمستوى ٢٠', 'Reach level 20', 'صِل إلى المستوى ٢٠']),
    B('x_midnight', 5, 'x_midnight', 1, (s) => +!!s.secret.midnight, ['منتصف الليل', 'Midnight reader', 'منتصف الليل'], ['اقرأ صفحة بين ١٢ و١ بالليل', 'Read a page between midnight and 1 am', 'اقرأ صفحة بين ١٢ و١ ليلًا']),
    B('x_dawn', 5, 'x_dawn', 1, (s) => +!!s.secret.dawn, ['قبل الفجر', 'Before dawn', 'قبل الفجر'], ['اقرأ صفحة بين ٤ و٥ الفجر', 'Read a page between 4 and 5 am', 'اقرأ صفحة بين ٤ و٥ فجرًا']),
    B('x_allday', 5, 'x_allday', 1, (s) => +!!s.secret.allday, ['من الصبح لليل', 'Dawn to dusk', 'من الصباح إلى الليل'], ['اقرأ الصبح والضهر والمغرب وبالليل في نفس اليوم', 'Read in the morning, afternoon, evening and night of one day', 'اقرأ صباحًا وظهرًا ومساءً وليلًا في اليوم نفسه']),
    B('x_lastcall', 5, 'x_lastcall', 1, (s) => +!!s.secret.lastcall, ['على آخر لحظة', 'Just in time', 'في اللحظة الأخيرة'], ['خلّص ورد في آخر يوم من ميعاده', 'Finish a portion on its very last day', 'أنهِ وردًا في آخر يوم من موعده']),
    B('x_triple', 5, 'x_triple', 1, (s) => +!!s.secret.triple, ['تلات حكايات', 'Three stories', 'ثلاث حكايات'], ['اقرأ في ٣ كتب مختلفة في يوم واحد', 'Read three different books in one day', 'اقرأ في ٣ كتب مختلفة في يوم واحد']),
    B('x_firstpage', 5, 'x_firstpage', 1, (s) => +!!s.secret.firstpage, ['أول سطر', 'First line', 'أول سطر'], ['اكتب ملاحظة على أول صفحة في كتاب', 'Leave a note on the first page of a book', 'اكتب ملاحظة على الصفحة الأولى من كتاب']),
    B('x_eid', 5, 'x_eid', 1, (s) => +!!s.secret.eid, ['عيدية', 'Eid gift', 'عيدية'], ['اقرأ يوم العيد', 'Read on Eid day', 'اقرأ في يوم العيد']),
    B('x_year', 5, 'x_year', 1, (s) => +!!s.secret.year, ['سنة مع الحلقة', 'A year together', 'عام مع الحلقة'], ['كمّل سنة في الحلقة', 'Spend a year in the circle', 'أكمِل عامًا في الحلقة']),
  ];
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
      goalDays: 0, focusN: 0, focusMins: 0, longest: 0, nightDays: 0, earlyDays: 0, weekends: 0, fridays: 0, ramadan: 0, comebacks: 0,
      perfect: 0, devoted: 0, helped: 0, sparks: 0, milestones: 0, secret: {},
      days: {}, byDay: {}, active: new Set(), events: [], hrs: {}, bookDays: {},
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
    const readN = [5, 10, 15, 20][Math.floor(r() * 4)];
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
      case 'read': return L(`اقرأ ${L.count(q.need, 'page')}`, `Read ${q.need} pages`, `اقرأ ${L.count(q.need, 'page')}`);
      case 'note': return L('ظلّل أو اكتب ملاحظة في كتاب', 'Highlight or note something in a book', 'ظلِّل نصًّا أو اكتب ملاحظة في كتاب');
      case 'talk': return L('شارك مرتين في النقاش أو الردود', 'Reply or post twice in a discussion', 'شارك مرتين في النقاش أو الردود');
      case 'like': return L('اعمل إعجاب لـ٣ ملاحظات من أصحابك', "Like 3 of your friends' notes", 'سجّل إعجابك بـ٣ ملاحظات لأصدقائك');
      case 'shelf': return L('ضيف كتاب لمكتبتك أو قيّم كتاب', 'Add or rate a book on your shelf', 'أضِف كتابًا إلى مكتبتك أو قيّم كتابًا');
      case 'cheer': return L('شجّع أو فكّر واحد من أصحابك', 'Cheer on or nudge a friend', 'شجِّع أحد أصدقائك أو ذكّره');
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
    return Math.ceil(pages / days);
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
      // the hours pages were read in (night owl, early bird, secrets)
      for (const [day, bits] of Object.entries(m.hrs || {})) {
        const b = (+bits || 0) & 0xffffff;
        if (!b) continue;
        s.hrs[day] = b;
        if (b & NIGHT) s.nightDays++;
        if (b & EARLY) s.earlyDays++;
        if (b & 1) s.secret.midnight = true;
        if (b & (1 << 4)) s.secret.dawn = true;
        if (b & MORNING && b & AFTERNOON && b & EVENING && b & NIGHT) s.secret.allday = true;
      }
      // the longest single sitting (minutes), focus sessions, days the daily goal was reached
      for (const v of Object.values(m.long || {})) s.longest = Math.max(s.longest, Math.min(600, Math.round(+v || 0)));
      for (const [day, f] of Object.entries(m.focus || {})) {
        if (!f) continue;
        const n = U.clamp(Math.round(+f.n || 0), 0, 48);
        const mins = U.clamp(Math.round(+f.m || 0), 0, 720);
        s.focusN += n;
        s.focusMins += mins;
        if (mins) ev(s, day, Math.min(60, mins) * G.XP.focus, 'focus');
      }
      for (const [day, v] of Object.entries(m.gd || {})) {
        if (!v) continue;
        s.goalDays++;
        ev(s, day, G.XP.goal, 'goal');
      }
      if (m.joinedAt && U.diffDays(U.isoKey(m.joinedAt), U.today()) >= 365) s.secret.year = true;
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
      const book = S.books.get(p.b);
      if (!s || !book) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t) continue;
        const w = G.wirds(book).find((x) => x.id === wid);
        if (!w) continue;
        const day = U.isoKey(t);
        if (w.start < w.due && day === w.due) s.secret.lastcall = true;
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
        const ws = G.wirds(book);
        if (ws.length && ws.every((w) => p.done && p.done[w.id] && U.isoKey(p.done[w.id]) <= w.due)) s.perfect++;
      }
      // pages of this book per day: same book on days in a row, three books in a day, ¼ ½ ¾ of the book
      const pd = p.days || {};
      const dks = Object.keys(pd).filter((d) => +pd[d] > 0).sort();
      let run = 0, prevD = null;
      for (const d of dks) {
        (s.bookDays[d] = s.bookDays[d] || new Set()).add(p.b);
        run = prevD && U.diffDays(prevD, d) === 1 ? run + 1 : 1;
        prevD = d;
        if (run > s.devoted) s.devoted = run;
      }
      const N = book.pages || 0;
      if (N >= 20) {
        const seenN = U.rangesCount(p.seen);
        const marks = G.MILESTONES.filter((f) => seenN >= Math.ceil(f * N));
        let cum = Math.max(0, seenN - dks.reduce((a, d) => a + (+pd[d] || 0), 0)); // pages read before days were kept
        let mi = 0;
        const award = (day) => {
          ev(s, day, G.XP.milestone, 'milestone');
          s.milestones++;
          mi++;
        };
        const first = U.isoKey(p.joined) || dks[0] || U.isoKey(p.updatedAt);
        while (mi < marks.length && cum >= Math.ceil(marks[mi] * N)) award(first);
        for (const d of dks) {
          cum += +pd[d] || 0;
          while (mi < marks.length && cum >= Math.ceil(marks[mi] * N)) award(d);
        }
        while (mi < marks.length) award(dks[dks.length - 1] || first);
      }
    }
    for (const s of out.values()) for (const set of Object.values(s.bookDays)) if (set.size >= 3) s.secret.triple = true;

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
        if (n.page === 1) s.secret.firstpage = true;
        if (n.kind === 'q') {
          // answers from friends: one per person per question
          const who = new Set();
          for (const r of Object.values(n.replies || {})) if (r && r.by && r.text && r.by !== n.by) who.add(r.by);
          for (const u of who) if (get(u)) get(u).helped++;
          if (who.size >= 3) s.sparks++;
        }
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

    // quest bonus + totals + streaks
    const today = U.today();
    const wk = U.weekStart(today);
    const horizon = U.addDays(today, -120);
    for (const s of out.values()) {
      const days = new Set([...Object.keys(s.byDay), ...Object.keys(s.days)]);
      for (const day of days) {
        if (day < horizon || day > today) continue;
        const q = G.questsFor(s.uid, day, s);
        if (q.every((x) => x.done)) {
          s.questDays++;
          ev(s, day, G.XP.quests, 'quests');
        }
      }
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
      habits(s);
      // streak
      // Streak with protection: every 7 reading days in a row earn one "freeze" (max 2),
      // which automatically covers a missed day so the streak survives.
      const act = (d) => s.active.has(d);
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
          } else if (run > 0 && fz > 0) {
            fz--;
            s.frozen.push(d);
          } else run = 0;
          best = Math.max(best, run);
        }
      }
      s.streak = run;
      s.freezes = fz;
      s.atRisk = run > 0 && !act(today);
      s.best = best;
      Object.assign(s, G.levelOf(s.xp));
      s.badges = G.BADGES.map((b) => {
        const v = b.v(s);
        return { b, v: Math.min(v, b.n), got: v >= b.n };
      });
      s.badgeCount = s.badges.filter((x) => x.got).length;
    }
    return out;
  }

  /* Reading days: Fridays, whole weekends (Friday + Saturday), coming back after a week away, Ramadan, Eid. */
  function habits(s) {
    const rdays = Object.keys(s.days).sort();
    let prev = null;
    const ram = {};
    for (const d of rdays) {
      if (U.parseD(d).getDay() === 5) {
        s.fridays++;
        if (s.days[U.addDays(d, 1)]) s.weekends++;
      }
      if (prev && U.diffDays(prev, d) >= 8) s.comebacks++;
      prev = d;
      const h = G.hijriParts(d);
      if (!h) continue;
      if (h.m === 9) (ram[h.y] = ram[h.y] || { n: 0, d }).n++;
      if ((h.m === 10 && h.d === 1) || (h.m === 12 && h.d === 10)) s.secret.eid = true;
    }
    for (const r of Object.values(ram)) {
      // every day of that Ramadan (29 or 30 days) counts as 30
      const h = G.hijriParts(r.d);
      const start = U.addDays(r.d, -(h.d - 1));
      const end = G.hijriParts(U.addDays(start, 29));
      const len = end && end.m === 9 ? 30 : 29;
      const v = r.n >= len && U.addDays(start, len - 1) <= U.today() ? 30 : Math.min(r.n, 29);
      if (v > s.ramadan) s.ramadan = v;
    }
  }
  G.MILESTONES = [0.25, 0.5, 0.75];

  /* ---------- rewards unlocked by levels and badges ---------- */
  // need: { lv } a level, { badge } a badge id, or { secrets } a number of secret badges.
  G.FRAMES = [
    { id: 'bronze', t: ['برونزي', 'Bronze', 'برونزي'], need: { lv: 3 } },
    { id: 'silver', t: ['فضي', 'Silver', 'فضي'], need: { lv: 6 } },
    { id: 'gold', t: ['دهبي', 'Gold', 'ذهبي'], need: { lv: 10 } },
    { id: 'laurel', t: ['إكليل الغار', 'Laurel wreath', 'إكليل الغار'], need: { badge: 'finisher' } },
    { id: 'flame', t: ['نار', 'Flame', 'لهب'], need: { badge: 'streak30' } },
    { id: 'moon', t: ['هلال الليل', 'Night crescent', 'هلال الليل'], need: { badge: 'night5' } },
    { id: 'garden', t: ['جنينة', 'Garden', 'حديقة'], need: { badge: 'goal30' } },
    { id: 'star', t: ['نجمة الحلقة', 'Circle star', 'نجمة الحلقة'], need: { lv: 15 } },
    { id: 'mystery', t: ['الأسرار', 'Mysteries', 'الأسرار'], need: { secrets: 4 } },
    { id: 'diamond', t: ['ماسي', 'Diamond', 'ماسي'], need: { lv: 20 } },
  ];
  G.EMOJI_PACKS = [
    { e: ['📜', '🪶', '🔖'], need: { lv: 2 } },
    { e: ['🕌', '🕯️', '🧭'], need: { lv: 4 } },
    { e: ['🌴', '🏺', '🐫'], need: { lv: 7 } },
    { e: ['👑', '💎', '🦅'], need: { lv: 12 } },
    { e: ['🐉', '🪐'], need: { lv: 18 } },
    { e: ['⚡', '🌋'], need: { badge: 'streak7' } },
    { e: ['🏆', '🎓'], need: { badge: 'finisher' } },
    { e: ['🦇', '🌃'], need: { badge: 'night5' } },
    { e: ['🌅', '🐓'], need: { badge: 'early5' } },
    { e: ['💬', '✒️'], need: { badge: 'quotes' } },
    { e: ['💖', '🌹'], need: { badge: 'loved' } },
    { e: ['🤝', '🧠'], need: { badge: 'helper5' } },
    { e: ['🏮', '🌜'], need: { badge: 'ramadan10' } },
    { e: ['🗝️', '🔮'], need: { secrets: 4 } },
  ];
  G.PAPERS = [
    { id: 'day', t: ['أبيض', 'White', 'أبيض'] },
    { id: 'sepia', t: ['ورق قديم', 'Sepia', 'ورق عتيق'] },
    { id: 'night', t: ['ليل', 'Night', 'ليل'] },
    { id: 'cream', t: ['كريمي', 'Cream', 'كريمي'], need: { lv: 2 } },
    { id: 'mint', t: ['نعناعي', 'Mint', 'نعناعي'], need: { lv: 4 } },
    { id: 'sky', t: ['سماوي', 'Sky', 'سماوي'], need: { lv: 7 } },
    { id: 'rose', t: ['وردي', 'Rose', 'وردي'], need: { badge: 'loved' } },
    { id: 'parchment', t: ['رَقّ', 'Parchment', 'رَقّ'], need: { badge: 'books3' } },
    { id: 'ink', t: ['ليل كحلي', 'Navy night', 'ليل كحلي'], need: { badge: 'night5' } },
    { id: 'coffee', t: ['قهوة', 'Coffee', 'قهوة'], need: { badge: 'focus5' } },
    { id: 'oled', t: ['أسود', 'Black', 'أسود'], need: { lv: 12 } },
  ];
  G.secretsGot = (s) => (s.badges || []).filter((x) => x.got && x.b.secret).length;
  G.unlocked = (need, s) => {
    if (!need) return true;
    if (need.lv) return s.lv >= need.lv;
    if (need.badge) return (s.badges || []).some((x) => x.got && x.b.id === need.badge);
    if (need.secrets) return G.secretsGot(s) >= need.secrets;
    return true;
  };
  /* How far along (0–1) towards a reward, for its progress bar. */
  G.needProgress = (need, s) => {
    if (!need) return 1;
    if (need.lv) return s.lv >= need.lv ? 1 : U.clamp(s.xp / G.need(need.lv), 0, 0.99);
    if (need.badge) {
      const x = (s.badges || []).find((y) => y.b.id === need.badge);
      return x ? (x.got ? 1 : U.clamp(x.v / x.b.n, 0, 0.99)) : 0;
    }
    if (need.secrets) return U.clamp(G.secretsGot(s) / need.secrets, 0, 1);
    return 1;
  };
  G.needText = (need) => {
    if (!need) return '';
    if (need.lv) return L(`المستوى ${L.num(need.lv)}`, `Level ${need.lv}`, `المستوى ${L.num(need.lv)}`);
    if (need.badge) {
      const b = G.BADGES.find((x) => x.id === need.badge);
      return b ? L(`وسام «${b.t[0]}»`, `“${b.t[1]}” badge`, `وسام «${b.t[0]}»`) : '';
    }
    if (need.secrets) return L(`${L.num(need.secrets)} أوسمة سرية`, `${need.secrets} secret badges`, `${L.num(need.secrets)} أوسمة سرية`);
    return '';
  };
  /* What a member may show: an unlocked frame, the free emoji plus unlocked packs. */
  G.frameOf = (uid) => {
    const m = S.members.get(uid);
    const id = m && m.frame;
    if (!id) return '';
    const f = G.FRAMES.find((x) => x.id === id);
    return f && G.unlocked(f.need, G.of(uid)) ? id : '';
  };
  G.paperOk = (id, uid = S.me) => {
    const p = G.PAPERS.find((x) => x.id === id);
    return !!p && G.unlocked(p.need, G.of(uid));
  };

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
  G.groupWeek = () => {
    let pages = 0;
    for (const s of G.all().values()) if (S.members.has(s.uid)) pages += s.pagesWeek;
    const goal = (S.circle && +S.circle.weeklyGoal) || 300;
    return { pages, goal };
  };
})();
