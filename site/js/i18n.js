/* Language: مصري (default) and العربية (فصحى), both RTL, and English (LTR).
   Strings live inline as L('مصري', 'English', 'فصحى'); without the third, فصحى falls back to the first. */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  const U = A.U;

  const LANGS = ['eg', 'ar', 'en'];
  /* Until there were two Arabics, 'lang' held 'ar' for the Egyptian text: keep those people on مصري. */
  let lang = U.store.get('uiLang', null) || (U.store.get('lang', null) === 'en' ? 'en' : 'eg');
  if (!LANGS.includes(lang)) lang = 'eg';

  const L = (eg, en, ar) => (lang === 'en' ? en : lang === 'ar' && ar != null ? ar : eg);
  A.L = L;
  L.langs = LANGS;
  L.names = { eg: 'مصري', ar: 'العربية', en: 'English' };
  L.lang = () => lang;
  L.isAr = () => lang !== 'en';
  L.apply = () => {
    const h = document.documentElement;
    h.lang = lang === 'eg' ? 'ar-EG' : lang;
    h.dir = lang === 'en' ? 'ltr' : 'rtl';
  };
  L.set = (l) => {
    if (!LANGS.includes(l)) return;
    lang = l;
    U.store.set('uiLang', l);
    if (l !== 'en') U.store.set('uiLangAr', l);
    L.apply();
  };
  /* The quick ع / EN button: English, or back to whichever Arabic was last used. */
  L.toggle = () => L.set(lang === 'en' ? U.store.get('uiLangAr', 'eg') : 'en');

  const nf = {};
  L.num = (n, opts) => {
    const key = lang + JSON.stringify(opts || {});
    nf[key] = nf[key] || new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ar-EG', opts);
    return nf[key].format(n || 0);
  };

  const pr = { ar: new Intl.PluralRules('ar'), en: new Intl.PluralRules('en') };
  /* forms: {one, two, two_nom, few (3–10), many (11–99), other} with {n} placeholder. فصحى duals are genitive/accusative
     («منذ يومين», «قرأت صفحتين») unless L.count(n, noun, 'nom') asks for the subject form («بقي يومان»). */
  const NOUNS = {
    page: {
      eg: { one: 'صفحة واحدة', two: 'صفحتين', few: '{n} صفحات', other: '{n} صفحة' },
      ar: { one: 'صفحة واحدة', two: 'صفحتين', two_nom: 'صفحتان', few: '{n} صفحات', other: '{n} صفحة' },
      en: { one: '1 page', other: '{n} pages' },
    },
    day: {
      eg: { one: 'يوم واحد', two: 'يومين', few: '{n} أيام', other: '{n} يوم' },
      ar: { one: 'يوم واحد', two: 'يومين', two_nom: 'يومان', few: '{n} أيام', many: '{n} يومًا', other: '{n} يوم' },
      en: { one: '1 day', other: '{n} days' },
    },
    book: {
      eg: { one: 'كتاب واحد', two: 'كتابين', few: '{n} كتب', other: '{n} كتاب' },
      ar: { one: 'كتاب واحد', two: 'كتابين', two_nom: 'كتابان', few: '{n} كتب', many: '{n} كتابًا', other: '{n} كتاب' },
      en: { one: '1 book', other: '{n} books' },
    },
    wird: {
      eg: { one: 'ورد واحد', two: 'وردين', few: '{n} أوراد', other: '{n} ورد' },
      ar: { one: 'ورد واحد', two: 'وردين', two_nom: 'وردان', few: '{n} أوراد', many: '{n} وردًا', other: '{n} ورد' },
      en: { one: '1 portion', other: '{n} portions' },
    },
    note: {
      eg: { one: 'ملاحظة واحدة', two: 'ملاحظتين', few: '{n} ملاحظات', other: '{n} ملاحظة' },
      ar: { one: 'ملاحظة واحدة', two: 'ملاحظتين', two_nom: 'ملاحظتان', few: '{n} ملاحظات', other: '{n} ملاحظة' },
      en: { one: '1 note', other: '{n} notes' },
    },
    member: {
      eg: { one: 'عضو واحد', two: 'عضوين', few: '{n} أعضاء', other: '{n} عضو' },
      ar: { one: 'عضو واحد', two: 'عضوين', two_nom: 'عضوان', few: '{n} أعضاء', many: '{n} عضوًا', other: '{n} عضو' },
      en: { one: '1 member', other: '{n} members' },
    },
    like: {
      eg: { one: 'إعجاب واحد', two: 'إعجابين', few: '{n} إعجابات', other: '{n} إعجاب' },
      ar: { one: 'إعجاب واحد', two: 'إعجابين', two_nom: 'إعجابان', few: '{n} إعجابات', many: '{n} إعجابًا', other: '{n} إعجاب' },
      en: { one: '1 like', other: '{n} likes' },
    },
    reply: {
      eg: { one: 'رد واحد', two: 'ردّين', few: '{n} ردود', other: '{n} رد' },
      ar: { one: 'رد واحد', two: 'ردّين', two_nom: 'ردّان', few: '{n} ردود', many: '{n} ردًّا', other: '{n} ردّ' },
      en: { one: '1 reply', other: '{n} replies' },
    },
    vote: {
      eg: { one: 'صوت واحد', two: 'صوتين', few: '{n} أصوات', other: '{n} صوت' },
      ar: { one: 'صوت واحد', two: 'صوتين', two_nom: 'صوتان', few: '{n} أصوات', many: '{n} صوتًا', other: '{n} صوت' },
      en: { one: '1 vote', other: '{n} votes' },
    },
    hour: {
      eg: { one: 'ساعة', two: 'ساعتين', few: '{n} ساعات', other: '{n} ساعة' },
      ar: { one: 'ساعة', two: 'ساعتين', two_nom: 'ساعتان', few: '{n} ساعات', other: '{n} ساعة' },
      en: { one: '1 hour', other: '{n} hours' },
    },
    badge: {
      eg: { one: 'وسام واحد', two: 'وسامين', few: '{n} أوسمة', other: '{n} وسام' },
      ar: { one: 'وسام واحد', two: 'وسامين', two_nom: 'وسامان', few: '{n} أوسمة', many: '{n} وسامًا', other: '{n} وسام' },
      en: { one: '1 badge', other: '{n} badges' },
    },
    minute: {
      eg: { one: 'دقيقة', two: 'دقيقتين', few: '{n} دقايق', other: '{n} دقيقة' },
      ar: { one: 'دقيقة', two: 'دقيقتين', two_nom: 'دقيقتان', few: '{n} دقائق', other: '{n} دقيقة' },
      en: { one: '1 minute', other: '{n} minutes' },
    },
  };
  L.count = (n, noun, kase) => {
    const forms = NOUNS[noun][lang];
    let cat = pr[lang === 'en' ? 'en' : 'ar'].select(n);
    if (lang !== 'en' && n === 0) cat = 'other';
    if (cat === 'two' && kase === 'nom' && forms.two_nom) cat = 'two_nom';
    const f = forms[cat] || forms.other;
    return f.replace('{n}', L.num(n));
  };

  const dtf = {};
  const fmt = (opts) => {
    const key = lang + JSON.stringify(opts);
    dtf[key] = dtf[key] || new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-EG', opts);
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
    if (d > 1) return L(`فاضل ${L.count(d, 'day')}`, `${L.count(d, 'day')} left`, `بقي ${L.count(d, 'day', 'nom')}`);
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
