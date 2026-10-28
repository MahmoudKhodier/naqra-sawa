/* Language: Arabic (default, RTL) and English (LTR). Strings live inline as L('عربي','English'). */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  const U = A.U;

  let lang = U.store.get('lang', null) || 'ar'; // Arabic unless the person switched to English
  if (lang !== 'ar' && lang !== 'en') lang = 'ar';

  const L = (ar, en) => (lang === 'ar' ? ar : en);
  A.L = L;
  L.lang = () => lang;
  L.isAr = () => lang === 'ar';
  L.apply = () => {
    const h = document.documentElement;
    h.lang = lang;
    h.dir = lang === 'ar' ? 'rtl' : 'ltr';
  };
  L.set = (l) => {
    lang = l;
    U.store.set('lang', l);
    L.apply();
  };

  const nf = {};
  L.num = (n, opts) => {
    const key = lang + JSON.stringify(opts || {});
    nf[key] = nf[key] || new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', opts);
    return nf[key].format(n || 0);
  };

  const pr = { ar: new Intl.PluralRules('ar'), en: new Intl.PluralRules('en') };
  /* forms: {one, two, few, many, other} with {n} placeholder. */
  const NOUNS = {
    page: { ar: { one: 'صفحة واحدة', two: 'صفحتين', few: '{n} صفحات', other: '{n} صفحة' }, en: { one: '1 page', other: '{n} pages' } },
    day: { ar: { one: 'يوم واحد', two: 'يومين', few: '{n} أيام', other: '{n} يوم' }, en: { one: '1 day', other: '{n} days' } },
    book: { ar: { one: 'كتاب واحد', two: 'كتابين', few: '{n} كتب', other: '{n} كتاب' }, en: { one: '1 book', other: '{n} books' } },
    wird: { ar: { one: 'ورد واحد', two: 'وردين', few: '{n} أوراد', other: '{n} ورد' }, en: { one: '1 portion', other: '{n} portions' } },
    note: { ar: { one: 'ملاحظة واحدة', two: 'ملاحظتين', few: '{n} ملاحظات', other: '{n} ملاحظة' }, en: { one: '1 note', other: '{n} notes' } },
    member: { ar: { one: 'عضو واحد', two: 'عضوين', few: '{n} أعضاء', other: '{n} عضو' }, en: { one: '1 member', other: '{n} members' } },
    like: { ar: { one: 'إعجاب واحد', two: 'إعجابين', few: '{n} إعجابات', other: '{n} إعجاب' }, en: { one: '1 like', other: '{n} likes' } },
    reply: { ar: { one: 'رد واحد', two: 'ردّين', few: '{n} ردود', other: '{n} رد' }, en: { one: '1 reply', other: '{n} replies' } },
    vote: { ar: { one: 'صوت واحد', two: 'صوتين', few: '{n} أصوات', other: '{n} صوت' }, en: { one: '1 vote', other: '{n} votes' } },
    hour: { ar: { one: 'ساعة', two: 'ساعتين', few: '{n} ساعات', other: '{n} ساعة' }, en: { one: '1 hour', other: '{n} hours' } },
    badge: { ar: { one: 'وسام واحد', two: 'وسامين', few: '{n} أوسمة', other: '{n} وسام' }, en: { one: '1 badge', other: '{n} badges' } },
    minute: { ar: { one: 'دقيقة', two: 'دقيقتين', few: '{n} دقايق', other: '{n} دقيقة' }, en: { one: '1 minute', other: '{n} minutes' } },
  };
  L.count = (n, noun) => {
    const forms = NOUNS[noun][lang];
    let cat = pr[lang].select(n);
    if (lang === 'ar' && n === 0) cat = 'other';
    const f = forms[cat] || forms.other;
    return f.replace('{n}', L.num(n));
  };

  const dtf = {};
  const fmt = (opts) => {
    const key = lang + JSON.stringify(opts);
    dtf[key] = dtf[key] || new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', opts);
    return dtf[key];
  };
  L.day = (k) => (k ? fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(U.parseD(k)) : '');
  L.dayShort = (k) => (k ? fmt({ day: 'numeric', month: 'short' }).format(U.parseD(k)) : '');
  L.monthYear = (k) => (k ? fmt({ month: 'long', year: 'numeric' }).format(U.parseD(k.length === 7 ? k + '-01' : k)) : '');
  L.weekday = (k) => fmt({ weekday: 'narrow' }).format(U.parseD(k));

  /* Due date relative to today. */
  L.due = (k) => {
    const d = U.diffDays(U.today(), k);
    if (d === 0) return L('آخر يوم النهارده', 'Due today');
    if (d === 1) return L('آخر يوم بكرة', 'Due tomorrow');
    if (d > 1) return L(`فاضل ${L.count(d, 'day')}`, `${L.count(d, 'day')} left`);
    return L(`متأخر ${L.count(-d, 'day')}`, `${L.count(-d, 'day')} late`);
  };

  L.ago = (iso) => {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return L('دلوقتي', 'just now');
    if (s < 3600) return L(`من ${L.count(Math.floor(s / 60), 'minute')}`, `${L.count(Math.floor(s / 60), 'minute')} ago`);
    if (s < 86400) return L(`من ${L.count(Math.floor(s / 3600), 'hour')}`, `${L.count(Math.floor(s / 3600), 'hour')} ago`);
    const k = U.isoKey(iso);
    const d = U.diffDays(k, U.today());
    if (d === 1) return L('امبارح', 'yesterday');
    if (d < 7) return L(`من ${L.count(d, 'day')}`, `${L.count(d, 'day')} ago`);
    return L.dayShort(k);
  };

  L.apply();
})();
