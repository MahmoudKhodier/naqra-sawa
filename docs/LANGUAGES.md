# Languages: مصري, العربية (فصحى), English

The app speaks three languages, picked in «إعدادات» → اللغة:

| code | name in the picker | what it is |
|------|--------------------|------------|
| `eg` | مصري | Egyptian Arabic, the default. Friendly and current, the way young Egyptians text each other. |
| `ar` | العربية | Simple Modern Standard Arabic (فصحى), the way a good Arabic app or a modern book speaks. |
| `en` | English | Plain, friendly English. |

Every user-facing string is written inline as

```js
L('مصري', 'English', 'فصحى')
```

The third argument is optional: leave it out when the مصري text is already correct فصحى (`L('الحلقة', 'Circle')`), and it falls back to the first.
Plural nouns go through `L.count(n, 'page')`; in فصحى a dual is genitive/accusative by default («منذ يومين»), pass `L.count(n, 'day', 'nom')` where it is the subject («بقي يومان»).
`Whats-New:` lines in commit messages take the same order: `Whats-New: مصري || English || فصحى` (the last part is optional).

## Tone

**مصري**: short, warm, everyday Egyptian. Sounds like a friend, not a government form and not a TV ad.
- Yes: «يلا»، «تمام»، «خلاص»، «أوي»، «كده»، «دلوقتي»، «مستنيك»، «جامد» (rarely).
- No: «برجاء»، «يرجى»، «عفوًا»، «حضرتك»، Franco/English words in Arabic letters when an Arabic word works, slang that is crude or will sound old next year, extra emojis.
- Keep it as short as it is now: these are phone buttons and toasts.

**فصحى**: clear modern MSA, never stiff or classical.
- Short sentences, everyday words: «ابدأ»، «تابِع»، «أنهيت»، «لاحقًا»، «الآن»، «أصدقاؤك».
- No full tashkeel. Write tanween alif where it is required («يومًا»، «أولًا») and a shadda only where it avoids a misreading.
- Speak to the reader with the generic imperative / إنت-equivalent the مصري text uses («اقرأ»، «اكتب»), or a verbal noun for labels («القراءة»، «إضافة كتاب»).

**Both Arabics**
- Never a gendered third-person verb about another member: use nouns («تشجيع من سارة»، «ملاحظة من سارة»), not «سارة شجّعتك».
- Keep every `${…}` expression, HTML tag, `esc()` call and punctuation style («», …, ؟) exactly as in the other languages.
- When a string quotes a button or tab in «», quote that label in the same language.

## Fixed names

These are referred to from other strings, so they keep exactly this wording.

| مصري | فصحى | English |
|------|------|---------|
| نقرأ سوا (app name) | نقرأ سوا | Read Together |
| اليوم · كتبنا · مكتبتي · الحلقة · أنا · إعدادات (tabs) | same | Today · Our books · My shelf · Circle · Me · Settings |
| الورد / أوراد | الورد / أوراد | portion(s) |
| وقفت هنا | وقفت هنا | Stopped here |
| ظلّل · ملاحظة · سؤال · اقتباس · خلاصة · تظليل | same | Highlight · Note · Question · Quote · Takeaway |
| خلاصات الورد | خلاصات الورد | Takeaways |
| حماية (streak freeze) · سلسلة (streak) | same | freeze · streak |
| خلّصت الكتاب | أنهيت الكتاب | I finished it |
| خلّصت | أنهيت | Done |
| اقرأ الورد | اقرأ الورد | Read the portion |
| ارجع لمكانك | عُد إلى مكانك | Back to … |
| كمّل من هنا | تابِع من هنا | Read from here |
| علّم الصفحة دي | علّم هذه الصفحة | Bookmark this page |
| حدّث · حدّث دلوقتي | حدّث · حدّث الآن | Update · Update now |
| بعدين | لاحقًا | Later |
| دوّر على تحديث | ابحث عن تحديث | Check for updates |
| هات مراجعاتي | اجلب مراجعاتي | Get my reviews |
| قرأناه سوا | قرأناه معًا | Read together |
| اخفي شريط الساعة وقت القراية | أخفِ شريط الساعة أثناء القراءة | Hide the clock bar while reading |
| صحابك | أصدقاؤك | your friends |
| اعزم | ادعُ | Invite |
| ادّي قلب (a like) | سجّل إعجابك | Like |
