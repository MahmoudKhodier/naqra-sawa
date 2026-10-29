/* A month of reading, as a story: full-screen slides that move on by themselves (tap the sides to go back
   and forth, hold to pause), ending with a picture to share. Offered on Today when a month ends, and any
   time from the profile. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Wr = (A.Wrapped = {});

  const ym = (k) => String(k).slice(0, 7);
  Wr.prevMonth = (k = U.today()) => {
    const d = U.parseD(k);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return U.dkey(d).slice(0, 7);
  };
  Wr.monthName = (m) => {
    try {
      return new Intl.DateTimeFormat(L.isAr() ? 'ar-EG' : 'en', { month: 'long', year: 'numeric' }).format(U.parseD(m + '-01'));
    } catch (e) {
      return m;
    }
  };

  /* Everything about one member's month, from the shared data. */
  Wr.stats = (uid, month) => {
    const s = G.of(uid);
    const m = S.members.get(uid) || {};
    const inM = (k) => k && ym(k) === month;
    const days = Object.keys(s.days).filter((k) => inM(k) && s.days[k] > 0).sort();
    const pages = days.reduce((a, k) => a + s.days[k], 0);
    let best = { k: '', n: 0 };
    for (const k of days) if (s.days[k] > best.n) best = { k, n: s.days[k] };
    const secs = Object.entries(m.secs || {}).filter(([k]) => inM(k)).reduce((a, [, v]) => a + (+v || 0), 0);
    // longest run of reading days inside the month
    let run = 0, longest = 0, prev = null;
    for (const k of [...s.active].filter(inM).sort()) {
      run = prev && U.diffDays(prev, k) === 1 ? run + 1 : 1;
      prev = k;
      longest = Math.max(longest, run);
    }
    // books by pages read this month
    const books = [];
    for (const p of S.prog.values()) {
      if (p.u !== uid) continue;
      const b = S.books.get(p.b);
      if (!b) continue;
      const n = Object.entries(p.days || {}).filter(([k]) => inM(k)).reduce((a, [, v]) => a + (+v || 0), 0);
      const done = Object.values(p.done || {}).filter((t) => t && inM(U.isoKey(t))).length;
      const finished = !!(p.finished && inM(U.isoKey(p.finished)));
      if (n || done || finished) books.push({ b, n, done, finished });
    }
    books.sort((a, b) => b.n - a.n || b.done - a.done);
    const notes = [...S.notes.values()].filter((n) => n.by === uid && inM(U.isoKey(n.at)));
    const liked = notes
      .filter((n) => n.kind !== 'take')
      .map((n) => ({ n, likes: Object.entries(n.likes || {}).filter(([u, v]) => v && u !== uid).length }))
      .sort((a, b) => b.likes - a.likes)[0];
    // when in the day: morning / afternoon / evening / night
    const B = G.HOUR_BUCKETS;
    const cnt = { MORNING: 0, AFTERNOON: 0, EVENING: 0, NIGHT: 0 };
    for (const [k, bits] of Object.entries(s.hrs || {})) if (inM(k)) for (const key of Object.keys(cnt)) if (bits & B[key]) cnt[key]++;
    const when = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    const xp = s.events.filter((e) => inM(e.day)).reduce((a, e) => a + e.xp, 0);
    const focus = Object.entries(m.focus || {}).filter(([k]) => inM(k)).reduce((a, [, f]) => a + ((f && +f.n) || 0), 0);
    const goals = Object.keys(m.gd || {}).filter((k) => inM(k) && m.gd[k]).length;
    // place in the circle by pages this month
    const others = D.memberIds().map((u) => ({ u, n: Object.entries(G.of(u).days || {}).filter(([k]) => inM(k)).reduce((a, [, v]) => a + v, 0) }));
    others.sort((a, b) => b.n - a.n);
    const rank = pages ? others.findIndex((x) => x.u === uid) + 1 : 0;
    return {
      month, pages, days: days.length, best, secs, longest, books, notes: notes.length, quotes: notes.filter((n) => n.kind === 'quote').length,
      liked: liked && liked.likes ? liked : null, when: when && when[1] ? when[0] : '', xp, focus, goals, rank, members: others.length,
      wirds: books.reduce((a, x) => a + x.done, 0), finished: books.filter((x) => x.finished).length, heat: days.map((k) => [k, s.days[k]]),
    };
  };
  const TYPE = {
    MORNING: ['قارئ الصبح ☀️', 'a morning reader ☀️', 'أغلب قرايتك كانت الصبح بدري، مع أول القهوة.', 'Most of your reading happened in the morning.', 'قارئ الصباح ☀️', 'كانت أغلب قراءتك في الصباح الباكر، مع أول فنجان قهوة.'],
    AFTERNOON: ['قارئ الضهرية 🌤️', 'an afternoon reader 🌤️', 'الضهر والعصر كانوا وقتك المفضل للقراية.', 'Afternoons were your favourite time to read.', 'قارئ الظهيرة 🌤️', 'كان الظهر والعصر وقتك المفضّل للقراءة.'],
    EVENING: ['قارئ المغرب 🌇', 'an evening reader 🌇', 'بعد المغرب كنت بتلاقي وقتك مع الكتاب.', 'Evenings were when you found time for your book.', 'قارئ المساء 🌇', 'بعد المغرب كنت تجد وقتك مع الكتاب.'],
    NIGHT: ['بومة الليل 🦉', 'a night owl 🦉', 'الليل كان صاحبك: أغلب صفحاتك اتقرت والناس نايمة.', 'Night was your friend: most pages were read while others slept.', 'بومة الليل 🦉', 'كان الليل رفيقك: قرأت أغلب صفحاتك والناس نيام.'],
  };
  const timeText = (secs) => {
    if (secs < 3600) return L.count(Math.max(1, Math.round(secs / 60)), 'minute');
    const h = Math.round(secs / 360) / 10;
    return h === Math.round(h) ? L.count(h, 'hour') : L(`${L.num(h)} ساعة`, `${h} hours`, `${L.num(h)} ساعة`);
  };

  /* The slides. */
  function slides(st) {
    const out = [];
    const name = Wr.monthName(st.month);
    out.push({ tone: 'night', html: `<div class="wr-big">${D.avatar(S.me, 'xl')}</div><h1>${L(`شهر ${esc(name)}`, esc(name))}</h1><p>${L('في القراية… يلا نشوف عملت إيه ✨', "in reading… let's see how it went ✨", 'في القراءة… لنرَ ماذا أنجزت ✨')}</p>` });
    out.push({
      tone: 'lapis',
      html: `<p>${L('الشهر ده قريت', 'This month you read', 'قرأتَ هذا الشهر')}</p><h1 class="wr-num">${L.num(st.pages)}</h1><p>${L(`صفحة في ${L.count(st.days, 'day')}`, `pages over ${st.days} days`, `صفحة في ${L.count(st.days, 'day')}`)}</p>
        <div class="wr-cal">${calendar(st)}</div>`,
    });
    out.push({
      tone: 'jade',
      html: `<p>${L('قضيت مع الكتب', 'You spent', 'أمضيتَ مع الكتب')}</p><h1 class="wr-num sm">${timeText(st.secs)}</h1>${st.best.n ? `<p>${L(`أحسن يوم: ${esc(L.day(st.best.k))} — ${L.count(st.best.n, 'page')}`, `Best day: ${esc(L.day(st.best.k))} — ${st.best.n} pages`, `أفضل يوم: ${esc(L.day(st.best.k))} — ${L.count(st.best.n, 'page')}`)}</p>` : ''}${st.goals ? `<p class="wr-chip">🎯 ${L(`حققت هدفك ${L.count(st.goals, 'day')}`, `Goal reached on ${st.goals} days`, `حقّقت هدفك في ${L.count(st.goals, 'day')}`)}</p>` : ''}${st.focus ? `<p class="wr-chip">⏳ ${L(`${L.num(st.focus)} جلسة تركيز`, `${st.focus} focus sessions`, `جلسات التركيز: ${L.num(st.focus)}`)}</p>` : ''}`,
    });
    if (st.books.length) {
      const top = st.books[0];
      out.push({
        tone: 'gold',
        html: `<p>${L('أكتر كتاب عشت معاه', 'The book you lived in', 'أكثر كتاب عشتَ معه')}</p><div class="wr-cover">${V.cover(top.b, 'lg')}</div><h2 dir="auto">${esc(top.b.title)}</h2>${top.n ? `<p>${L.count(top.n, 'page')}${top.done ? ` • ${L.count(top.done, 'wird')}` : ''}</p>` : ''}
          ${st.books.length > 1 ? `<p class="wr-small">${L('وكمان:', 'Also:', 'وأيضًا:')} ${st.books.slice(1, 4).map((x) => `<span dir="auto">${esc(x.b.title)}</span>`).join('، ')}</p>` : ''}${st.finished ? `<p class="wr-chip">🏆 ${L(`خلّصت ${L.count(st.finished, 'book')}`, `Finished ${st.finished} book${st.finished > 1 ? 's' : ''}`, `أنهيت ${L.count(st.finished, 'book')}`)}</p>` : ''}`,
      });
    }
    if (st.when || st.longest > 1) {
      const t = TYPE[st.when];
      out.push({
        tone: st.when === 'NIGHT' ? 'night' : 'rose',
        html: `${t ? `<p>${L('إنت', 'You are', 'أنت')}</p><h1 class="wr-type">${L(t[0], t[1], t[4])}</h1><p>${L(t[2], t[3], t[5])}</p>` : ''}${st.longest > 1 ? `<p class="wr-chip">🔥 ${L(`أطول سلسلة: ${L.count(st.longest, 'day')} ورا بعض`, `Longest streak: ${st.longest} days in a row`, `أطول سلسلة: ${L.count(st.longest, 'day')} على التوالي`)}</p>` : ''}`,
      });
    }
    if (st.members > 1 || st.notes || st.wirds) {
      out.push({
        tone: 'lapis',
        html: `<p>${L('مع الحلقة', 'With the circle', 'مع الحلقة')}</p>${st.rank ? `<h1 class="wr-num sm">#${L.num(st.rank)}</h1><p>${L(`في الصفحات من ${L.num(st.members)}`, `in pages, of ${st.members}`, `في عدد الصفحات من بين ${L.num(st.members)}`)}</p>` : ''}
          <div class="wr-row">${st.wirds ? `<span><b>${L.num(st.wirds)}</b>${L('ورد خلص', 'portions', 'أوراد مكتملة')}</span>` : ''}${st.notes ? `<span><b>${L.num(st.notes)}</b>${L('ملاحظة', 'notes', 'ملاحظة')}</span>` : ''}<span><b>${L.num(st.xp)}</b>XP</span></div>
          ${st.liked ? `<div class="wr-note"><small>${L(`أكتر ملاحظة عجبت الحلقة (${L.num(st.liked.likes)} ❤️)`, `Your most-liked note (${st.liked.likes} ❤️)`, `أكثر ملاحظة أعجبت الحلقة (${L.num(st.liked.likes)} ❤️)`)}</small><p dir="auto">${esc(String(st.liked.n.text || '').slice(0, 160))}</p></div>` : ''}`,
      });
    }
    out.push({
      tone: 'night',
      html: `<h2>${L('شهر جامد 👏', 'A good month 👏', 'شهر جميل 👏')}</h2><p>${L('شارك ملخص شهرك مع أصحابك', 'Share your month with friends', 'شارك ملخص شهرك مع أصدقائك')}</p>
        <div class="row-btns center"><button class="btn gold big" data-wr="share">${icon('share')}${L('شارك الملخص', 'Share the summary', 'شارك الملخص')}</button></div>
        <button class="btn ghost" data-wr="close">${L('تمام', 'Done', 'تمّ')}</button>`,
      last: true,
    });
    return out;
  }
  function calendar(st) {
    const first = U.parseD(st.month + '-01');
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const map = new Map(st.heat);
    let cells = '';
    for (let d = 1; d <= n; d++) {
      const k = `${st.month}-${String(d).padStart(2, '0')}`;
      const v = map.get(k) || 0;
      const lv = v >= 40 ? 4 : v >= 20 ? 3 : v >= 8 ? 2 : v > 0 ? 1 : 0;
      cells += `<i class="l${lv}"></i>`;
    }
    return cells;
  }

  /* Open the story for a month (default: the last finished month, or this one so far). */
  Wr.open = (month) => {
    const m = month || Wr.prevMonth();
    const st = Wr.stats(S.me, m);
    if (!st.pages && !st.notes && !st.wirds) return U.toast(L('مفيش قراية متسجلة في الشهر ده لسه', 'No reading recorded for that month yet', 'لا توجد قراءة مسجَّلة في هذا الشهر بعد'));
    U.store.set('wrapSeen:' + S.me, m);
    const list = slides(st);
    const el = document.createElement('div');
    el.className = 'wrapped';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', L('ملخص الشهر', 'Month in reading', 'ملخص الشهر'));
    el.innerHTML = `<div class="wr-bars">${list.map(() => '<i><b></b></i>').join('')}</div>
      <button class="ib wr-x" data-wr="close" aria-label="${L('اقفل', 'Close', 'أغلق')}">${icon('close')}</button>
      ${list.map((x, i) => `<section class="wr-slide t-${x.tone}" data-i="${i}" aria-hidden="true"><div class="wr-in">${x.html}</div></section>`).join('')}`;
    document.body.appendChild(el);
    let i = 0, t0 = 0, left = 0, timer = 0, held = false;
    const DUR = 5200;
    const show = (k) => {
      i = U.clamp(k, 0, list.length - 1);
      el.querySelectorAll('.wr-slide').forEach((s, j) => {
        s.classList.toggle('on', j === i);
        s.setAttribute('aria-hidden', String(j !== i));
      });
      el.querySelectorAll('.wr-bars i').forEach((b, j) => {
        b.classList.toggle('done', j < i);
        b.classList.toggle('cur', j === i);
        b.firstChild.style.animationDuration = DUR + 'ms';
        b.firstChild.style.animationPlayState = 'running';
      });
      clearTimeout(timer);
      if (!list[i].last) {
        t0 = Date.now();
        left = DUR;
        timer = setTimeout(() => show(i + 1), DUR);
      }
    };
    const close = () => {
      clearTimeout(timer);
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(i + (L.isAr() ? 1 : -1));
      else if (e.key === 'ArrowRight') show(i + (L.isAr() ? -1 : 1));
    };
    document.addEventListener('keydown', onKey);
    const pause = (on) => {
      const bar = el.querySelector('.wr-bars i.cur b');
      if (bar) bar.style.animationPlayState = on ? 'paused' : 'running';
      if (list[i].last) return;
      if (on) {
        clearTimeout(timer);
        left = Math.max(300, left - (Date.now() - t0));
      } else {
        t0 = Date.now();
        clearTimeout(timer);
        timer = setTimeout(() => show(i + 1), left);
      }
    };
    let downAt = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      downAt = Date.now();
      held = false;
      setTimeout(() => {
        if (downAt && Date.now() - downAt >= 240) {
          held = true;
          pause(true);
        }
      }, 250);
    });
    el.addEventListener('pointerup', (e) => {
      const was = held;
      downAt = 0;
      if (was) return pause(false);
      if (e.target.closest('button')) return;
      // tap: the side you read from goes back, the other side goes on
      const x = e.clientX / window.innerWidth;
      const fwd = L.isAr() ? x < 0.66 : x > 0.34;
      show(i + (fwd ? 1 : -1));
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-wr]');
      if (!b) return;
      if (b.dataset.wr === 'close') close();
      else if (b.dataset.wr === 'share' && A.Share) {
        const top = st.books[0] && st.books[0].b;
        const t = TYPE[st.when];
        A.Share.open('month', { title: L(`شهر ${Wr.monthName(m)}`, Wr.monthName(m)), who: D.name(S.me), pages: st.pages, days: st.days, time: timeText(st.secs), best: st.longest, top, type: t ? L(`إنت ${t[0]}`, `You're ${t[1]}`, `أنت ${t[4]}`) : '' });
      }
    });
    requestAnimationFrame(() => {
      el.classList.add('in');
      show(0);
    });
    return el;
  };

  /* On Today: the last month's story, offered once when a new month starts. */
  Wr.banner = () => {
    if (!D.joined()) return '';
    const m = Wr.prevMonth();
    if (U.store.get('wrapSeen:' + S.me, '') >= m) return '';
    if (U.today().slice(8) > '10') return ''; // only in the first days of the month
    const s = G.of(S.me);
    if (!Object.keys(s.days).some((k) => ym(k) === m && s.days[k] > 0)) return '';
    return `<button class="wr-banner" data-act="wrapped" data-m="${m}"><span class="wb-art">✨</span><span><b>${L(`ملخص شهر ${esc(Wr.monthName(m))} جاهز`, `Your ${esc(Wr.monthName(m))} in reading is ready`, `ملخص شهر ${esc(Wr.monthName(m))} جاهز`)}</b><small>${L('شوف شهرك في القراية في دقيقة', 'See your month in reading in a minute', 'شاهد شهرك في القراءة خلال دقيقة')}</small></span>${icon('fwd', 'flip')}</button>`;
  };
  V.actions.wrapped = (a) => Wr.open(a.dataset.m || '');
})();
