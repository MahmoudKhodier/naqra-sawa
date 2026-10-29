/* Game layer: XP, levels, streaks, daily quests and badges.
   Everything is DERIVED from shared data (no counters are stored), so every viewer computes the same numbers. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const G = (A.G = {});

  G.XP = { page: 1, wird: 20, onTime: 10, first: 10, note: 5, take: 8, reply: 2, liked: 2, shelf: 10, review: 5, book: 100, cheer: 1, quests: 30 };

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
    { g: 'questions', ic: 'question', tip: ['لما تحط ملاحظة، اختار «سؤال» عشان أصحابك يردّوا.', 'When adding a note, choose “Question” so friends can answer.', 'عندما تضع ملاحظة، اختر «سؤال» ليرد أصدقاؤك.'] },
    { g: 'takes', ic: 'sparkle', tip: ['بعد ما تخلّص الورد، اكتب أهم فكرة خرجت بيها في «خلاصات الورد».', 'After a portion, write the main idea you took away under “Takeaways”.', 'بعد أن تنهي الورد، اكتب أهم فكرة خرجت بها في «خلاصات الورد».'] },
    { g: 'talk', ic: 'chat', tip: ['ردود على الملاحظات ورسايل في النقاش.', 'Replies to notes and messages in discussions.', 'الردود على الملاحظات والرسائل في النقاش.'] },
    { g: 'loved', ic: 'heart', tip: ['الإعجابات اللي بتجيلك على ملاحظاتك.', 'Likes your notes receive.', 'الإعجابات التي تصلك على ملاحظاتك.'] },
    { g: 'generous', ic: 'heart', tip: ['اعمل إعجاب لملاحظات أصحابك.', "Like your friends' notes.", 'سجّل إعجابك بملاحظات أصدقائك.'] },
    { g: 'cheer', ic: 'clap', tip: ['شجّع أو فكّر أصحابك من صفحة الحلقة أو التقدّم.', 'Cheer on or nudge friends from the circle or progress pages.', 'شجّع أصدقاءك أو ذكّرهم من صفحة الحلقة أو التقدّم.'] },
    { g: 'voter', ic: 'vote', tip: ['صوّت على الكتب المقترحة للحلقة.', 'Vote on the books suggested to the circle.'] },
    { g: 'shelf', ic: 'shelf', tip: ['ضيف الكتب اللي قريتها قبل كده لمكتبتك (أو استوردها من Goodreads).', 'Add books you have read to your shelf (or import them from Goodreads).', 'أضف الكتب التي قرأتها من قبل إلى مكتبتك (أو استوردها من Goodreads).'] },
    { g: 'critic', ic: 'edit', tip: ['اكتب رأيك (أكتر من سطر) في كتب مكتبتك.', 'Write a review (more than a line) for books on your shelf.', 'اكتب رأيك (أكثر من سطر) في كتب مكتبتك.'] },
    { g: 'quests', ic: 'chest', tip: ['خلّص مهام اليوم التلاتة وافتح الصندوق.', 'Finish all three daily quests and open the chest.', 'أنهِ مهام اليوم الثلاث وافتح الصندوق.'] },
    { g: 'level', ic: 'sparkle', tip: ['كل XP بتكسبه بيقرّبك للمستوى الجاي.', 'Every XP you earn brings the next level closer.', 'كل XP تكسبه يقرّبك من المستوى التالي.'] },
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
    B('marathon', 2, 'day100', 100, (s) => s.maxDay, ['ماراثون كبير', 'Ultra marathon'], ['اقرأ ١٠٠ صفحة في يوم واحد', 'Read 100 pages in one day']),
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
    B('generous', 1, 'generous10', 10, (s) => s.likesGiven, ['كريم', 'Generous'], ['اعمل إعجاب لـ١٠ ملاحظات من أصحابك', "Like 10 of your friends' notes", 'سجّل إعجابك بـ١٠ ملاحظات لأصدقائك']),
    B('generous', 2, 'generous50', 50, (s) => s.likesGiven, ['قلبه كبير', 'Big-hearted', 'صاحب القلب الكبير'], ['اعمل إعجاب لـ٥٠ ملاحظة', 'Like 50 notes', 'سجّل إعجابك بـ٥٠ ملاحظة']),
    B('generous', 3, 'generous200', 200, (s) => s.likesGiven, ['داعم الحلقة', 'Circle supporter'], ['اعمل إعجاب لـ٢٠٠ ملاحظة', 'Like 200 notes', 'سجّل إعجابك بـ٢٠٠ ملاحظة']),
    B('cheer', 1, 'cheer', 10, (s) => s.cheers, ['المشجّع', 'Cheerleader'], ['شجّع أصحابك ١٠ مرات', 'Cheer or nudge friends 10 times', 'شجّع أصدقاءك ١٠ مرات']),
    B('cheer', 2, 'cheer50', 50, (s) => s.cheers, ['المحفّز', 'The motivator'], ['شجّع أصحابك ٥٠ مرة', 'Cheer or nudge friends 50 times', 'شجّع أصدقاءك ٥٠ مرة']),
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
      days: {}, byDay: {}, active: new Set(), events: [],
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
      case 'read': return L(`اقرأ ${L.count(q.need, 'page')}`, `Read ${q.need} pages`);
      case 'note': return L('ظلّل أو اكتب ملاحظة في كتاب', 'Highlight or note something in a book');
      case 'talk': return L('شارك مرتين في النقاش أو الردود', 'Reply or post twice in a discussion');
      case 'like': return L('اعمل إعجاب لـ٣ ملاحظات من أصحابك', "Like 3 of your friends' notes", 'سجّل إعجابك بـ٣ ملاحظات لأصدقائك');
      case 'shelf': return L('ضيف كتاب لمكتبتك أو قيّم كتاب', 'Add or rate a book on your shelf', 'أضف كتابًا إلى مكتبتك أو قيّم كتابًا');
      case 'cheer': return L('شجّع أو فكّر واحد من أصحابك', 'Cheer on or nudge a friend', 'شجّع أحد أصدقائك أو ذكّره');
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
