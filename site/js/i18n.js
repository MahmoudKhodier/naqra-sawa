/* Languages: «مصري» (Egyptian Arabic, code 'ar', the default and what the app always spoke), «العربية»
   (Modern Standard Arabic, code 'fu') and English ('en'). Strings live inline as L('مصري', 'English', 'فصحى');
   a text without a فصحى form falls back to the Egyptian one. */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  const U = A.U;

  const LANGS = ['ar', 'fu', 'en'];
  let lang = U.store.get('lang', null) || 'ar'; // Egyptian unless the person chose another
  if (!LANGS.includes(lang)) lang = 'ar';

  const L = (ar, en, fu) => (lang === 'en' ? en : lang === 'fu' && fu != null ? fu : ar);
  A.L = L;
  /* Arabic-only text (both Arabic forms), e.g. inside a sentence already chosen by language. */
  L.a = (ar, fu) => (lang === 'fu' && fu != null ? fu : ar);
  L.lang = () => lang;
  L.isAr = () => lang !== 'en';
  L.isFu = () => lang === 'fu';
  L.LANGS = LANGS;
  L.apply = () => {
    const h = document.documentElement;
    h.lang = lang === 'en' ? 'en' : lang === 'ar' ? 'ar-EG' : 'ar';
    h.dir = lang === 'en' ? 'ltr' : 'rtl';
  };
  L.set = (l) => {
    lang = LANGS.includes(l) ? l : 'ar';
    U.store.set('lang', lang);
    if (lang !== 'en') U.store.set('langAr', lang);
    L.apply();
  };
  /* Arabic ⇄ English (the quick switch on the sign-in screen): back to whichever Arabic was used last. */
  L.toggle = () => L.set(lang === 'en' ? U.store.get('langAr', 'ar') : 'en');

  const nf = {};
  L.num = (n, opts) => {
    const key = lang + JSON.stringify(opts || {});
    nf[key] = nf[key] || new Intl.NumberFormat(lang !== 'en' ? 'ar-EG' : 'en-US', opts);
    return nf[key].format(n || 0);
  };

  const pr = { ar: new Intl.PluralRules('ar'), fu: new Intl.PluralRules('ar'), en: new Intl.PluralRules('en') };
  /* forms: {one, two, few, many, other} with {n} placeholder. */
  const NOUNS = {
    page: { ar: { one: 'صفحة واحدة', two: 'صفحتين', few: '{n} صفحات', other: '{n} صفحة' }, fu: { one: 'صفحة واحدة', two: 'صفحتان', few: '{n} صفحات', other: '{n} صفحة' }, en: { one: '1 page', other: '{n} pages' } },
    day: { ar: { one: 'يوم واحد', two: 'يومين', few: '{n} أيام', other: '{n} يوم' }, fu: { one: 'يوم واحد', two: 'يومان', few: '{n} أيام', other: '{n} يومًا' }, en: { one: '1 day', other: '{n} days' } },
    book: { ar: { one: 'كتاب واحد', two: 'كتابين', few: '{n} كتب', other: '{n} كتاب' }, fu: { one: 'كتاب واحد', two: 'كتابان', few: '{n} كتب', other: '{n} كتابًا' }, en: { one: '1 book', other: '{n} books' } },
    wird: { ar: { one: 'ورد واحد', two: 'وردين', few: '{n} أوراد', other: '{n} ورد' }, fu: { one: 'ورد واحد', two: 'وردان', few: '{n} أوراد', other: '{n} وردًا' }, en: { one: '1 portion', other: '{n} portions' } },
    note: { ar: { one: 'ملاحظة واحدة', two: 'ملاحظتين', few: '{n} ملاحظات', other: '{n} ملاحظة' }, fu: { one: 'ملاحظة واحدة', two: 'ملاحظتان', few: '{n} ملاحظات', other: '{n} ملاحظة' }, en: { one: '1 note', other: '{n} notes' } },
    member: { ar: { one: 'عضو واحد', two: 'عضوين', few: '{n} أعضاء', other: '{n} عضو' }, fu: { one: 'عضو واحد', two: 'عضوان', few: '{n} أعضاء', other: '{n} عضوًا' }, en: { one: '1 member', other: '{n} members' } },
    like: { ar: { one: 'إعجاب واحد', two: 'إعجابين', few: '{n} إعجابات', other: '{n} إعجاب' }, fu: { one: 'إعجاب واحد', two: 'إعجابان', few: '{n} إعجابات', other: '{n} إعجابًا' }, en: { one: '1 like', other: '{n} likes' } },
    reply: { ar: { one: 'رد واحد', two: 'ردّين', few: '{n} ردود', other: '{n} رد' }, fu: { one: 'رد واحد', two: 'ردّان', few: '{n} ردود', other: '{n} ردًّا' }, en: { one: '1 reply', other: '{n} replies' } },
    vote: { ar: { one: 'صوت واحد', two: 'صوتين', few: '{n} أصوات', other: '{n} صوت' }, fu: { one: 'صوت واحد', two: 'صوتان', few: '{n} أصوات', other: '{n} صوتًا' }, en: { one: '1 vote', other: '{n} votes' } },
    hour: { ar: { one: 'ساعة', two: 'ساعتين', few: '{n} ساعات', other: '{n} ساعة' }, fu: { one: 'ساعة', two: 'ساعتان', few: '{n} ساعات', other: '{n} ساعة' }, en: { one: '1 hour', other: '{n} hours' } },
    badge: { ar: { one: 'وسام واحد', two: 'وسامين', few: '{n} أوسمة', other: '{n} وسام' }, fu: { one: 'وسام واحد', two: 'وسامان', few: '{n} أوسمة', other: '{n} وسامًا' }, en: { one: '1 badge', other: '{n} badges' } },
    minute: { ar: { one: 'دقيقة', two: 'دقيقتين', few: '{n} دقايق', other: '{n} دقيقة' }, fu: { one: 'دقيقة', two: 'دقيقتان', few: '{n} دقائق', other: '{n} دقيقة' }, en: { one: '1 minute', other: '{n} minutes' } },
  };
  L.count = (n, noun) => {
    const forms = NOUNS[noun][lang] || NOUNS[noun].ar;
    let cat = pr[lang].select(n);
    if (lang !== 'en' && n === 0) cat = 'other';
    const f = forms[cat] || forms.other;
    return f.replace('{n}', L.num(n));
  };

  const dtf = {};
  const fmt = (opts) => {
    const key = lang + JSON.stringify(opts);
    dtf[key] = dtf[key] || new Intl.DateTimeFormat(lang !== 'en' ? 'ar-EG' : 'en-GB', opts);
    return dtf[key];
  };
  L.day = (k) => (k ? fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(U.parseD(k)) : '');
  L.dayShort = (k) => (k ? fmt({ day: 'numeric', month: 'short' }).format(U.parseD(k)) : '');
  L.monthYear = (k) => (k ? fmt({ month: 'long', year: 'numeric' }).format(U.parseD(k.length === 7 ? k + '-01' : k)) : '');
  L.weekday = (k) => fmt({ weekday: 'narrow' }).format(U.parseD(k));

  /* Due date relative to today. */
  L.due = (k) => {
    const d = U.diffDays(U.today(), k);
    if (d === 0) return L('آخر يوم النهارده', 'Due today', 'آخر موعد اليوم');
    if (d === 1) return L('آخر يوم بكرة', 'Due tomorrow', 'آخر موعد غدًا');
    if (d > 1) return L(`فاضل ${L.count(d, 'day')}`, `${L.count(d, 'day')} left`, `بقي ${L.count(d, 'day')}`);
    return L(`متأخر ${L.count(-d, 'day')}`, `${L.count(-d, 'day')} late`, `متأخر ${L.count(-d, 'day')}`);
  };

  L.ago = (iso) => {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return L('دلوقتي', 'just now', 'الآن');
    if (s < 3600) return L(`من ${L.count(Math.floor(s / 60), 'minute')}`, `${L.count(Math.floor(s / 60), 'minute')} ago`, `منذ ${L.count(Math.floor(s / 60), 'minute')}`);
    if (s < 86400) return L(`من ${L.count(Math.floor(s / 3600), 'hour')}`, `${L.count(Math.floor(s / 3600), 'hour')} ago`, `منذ ${L.count(Math.floor(s / 3600), 'hour')}`);
    const k = U.isoKey(iso);
    const d = U.diffDays(k, U.today());
    if (d === 1) return L('امبارح', 'yesterday', 'أمس');
    if (d < 7) return L(`من ${L.count(d, 'day')}`, `${L.count(d, 'day')} ago`, `منذ ${L.count(d, 'day')}`);
    return L.dayShort(k);
  };

  L.apply();
})();
