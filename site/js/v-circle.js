/* The circle (leaderboard, members, chat, invite) and profiles (level, badges, heatmap, settings). */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const V = A.V;
  const esc = U.esc;
  const icon = U.icon;

  V.screens.circle = (opts = {}) => {
    const c = S.circle || {};
    const mode = opts.board || 'week';
    const board = G.board(mode);
    const online = D.onlineIds();
    const { pages, goal } = G.groupWeek();
    const canAdmin = S.isOwner || S.canEdit;
    const medal = ['gold', 'silver', 'bronze'];
    return `<div class="circle">
      <header class="circle-hero">
        <div class="ch-art" aria-hidden="true"><span class="star8 gold"></span><span class="star8 lapis"></span><span class="star8 jade"></span></div>
        <div><small class="eyebrow">${L.count(S.members.size, 'member')}${online.size ? ` • <span class="live-t">${L(`${L.num(online.size)} أونلاين`, `${online.size} online`)}</span>` : ''}</small>
          <h1 dir="auto">${esc(c.name || L('حلقة القراءة', 'Reading Circle'))}</h1>${c.motto ? `<p dir="auto">${esc(c.motto)}</p>` : ''}</div>
        <div class="row-btns">${canAdmin && D.canWrite() ? `<button class="btn ghost sm" data-act="edit-circle">${icon('edit')}${L('عدّل', 'Edit')}</button>` : ''}${V.circleMenu ? `<button class="btn ghost sm" data-act="circle-menu">${icon('users')}${L('الحلقات', 'Circles')}</button>` : ''}<button class="btn sm gold" data-act="invite">${icon('share')}${L('ادعُ أصحابك', 'Invite friends')}</button></div>
      </header>
      <div class="circle-grid">
        <div class="col-main">
          <section class="card board">
            <header><h2>${icon('trophy')}${L('الصدارة', 'Leaderboard')}</h2><div class="seg sm"><button class="${mode === 'week' ? 'on' : ''}" data-act="board" data-m="week">${L('الأسبوع ده', 'This week')}</button><button class="${mode === 'all' ? 'on' : ''}" data-act="board" data-m="all">${L('كل الوقت', 'All time')}</button></div></header>
            ${board.length >= 3 ? podium(board.slice(0, 3), mode) : ''}
            <ol class="lb">${board
              .map((s, i) => `<li class="${s.uid === S.me ? 'me' : ''}"><button data-act="member" data-uid="${esc(s.uid)}"><span class="rank ${medal[i] || ''}">${L.num(i + 1)}</span>${D.avatar(s.uid, 'md')}${online.has(s.uid) ? '<i class="on-dot"></i>' : ''}
                <span class="lb-n"><b>${esc(D.name(s.uid))}</b><small>${V.star(L.num(s.lv), 'xs gold')} ${esc(G.title(s.lv))}${s.streak ? ` • <span class="flame-t">${icon('flame')}${L.num(s.streak)}</span>` : ''}</small></span>
                <span class="lb-xp"><b>${L.num(mode === 'week' ? s.week : s.xp)}</b><small>XP</small></span></button></li>`)
              .join('')}</ol>
            <p class="muted sm">${L('الأسبوع بيبدأ السبت. الـXP بييجي من الصفحات، الأوراد، الملاحظات، الردود والإعجابات.', 'Weeks start on Saturday. XP comes from pages, portions, notes, replies and likes.')} <button class="lnk" data-act="xp-help">${L('إزاي أكسب XP؟', 'How do I earn XP?')}</button></p>
          </section>
          <section class="card chat">
            <header><h2>${icon('chat')}${L('دردشة الحلقة', 'Circle chat')}</h2></header>
            ${V.thread('_c', 'gen', { cls: 'tall', placeholder: L('اكتب للحلقة…', 'Write to the circle…') })}
          </section>
        </div>
        <div class="col-side">
          <section class="card group">
            <h3>${L('هدف الأسبوع', 'Weekly goal')}</h3>
            <div class="goal">${V.ring(pages / goal, `<b>${L.num(pages)}</b><small>/ ${L.num(goal)}</small>`, pages >= goal ? 'jade' : 'lapis', 84)}<p class="muted sm">${L('صفحات قرأتها الحلقة كلها من السبت', 'Pages read by the whole circle since Saturday')}</p></div>
            <div class="contrib">${board.filter((s) => s.pagesWeek).sort((a, b) => b.pagesWeek - a.pagesWeek).map((s) => `<span style="flex:${s.pagesWeek};--c:${esc(D.color(s.uid))}" title="${esc(D.name(s.uid))}: ${L.num(s.pagesWeek)}"></span>`).join('')}</div>
          </section>
          <section class="card members">
            <h3>${L('الأعضاء', 'Members')}</h3>
            <ul>${D.memberIds()
              .map((u) => {
                const s = G.of(u);
                const reading = D.readingNow().find((x) => x.uid === u);
                const b = reading && S.books.get(reading.b);
                return `<li><button data-act="${V.memberMenu ? 'member-menu' : 'member'}" data-uid="${esc(u)}">${D.avatar(u, 'sm')}${online.has(u) ? '<i class="on-dot"></i>' : ''}<span><b>${esc(D.name(u))}${A.P && A.P.role && A.P.role(u) !== 'member' ? ` <i class="role-tag">${A.P.role(u) === 'owner' ? L('صاحب الحلقة', 'owner') : L('مشرف', 'admin')}</i>` : ''}</b><small>${reading ? `<span class="live-t">${L('في القراية:', 'Reading')}</span> <span dir="auto">${b ? esc(b.title) : ''}</span>` : `${L('مستوى', 'Level')} ${L.num(s.lv)} • ${L.count(s.badgeCount || 0, 'badge')}`}</small></span></button></li>`;
              })
              .join('')}</ul>
          </section>
        </div>
      </div>
    </div>`;
  };

  function podium(top, mode) {
    const order = [top[1], top[0], top[2]];
    const cls = ['silver', 'gold', 'bronze'];
    return `<div class="podium">${order
      .map((s, i) => `<button class="pd ${cls[i]}" data-act="member" data-uid="${esc(s.uid)}">${D.avatar(s.uid, i === 1 ? 'lg' : 'md')}<b>${esc(D.name(s.uid))}</b><small>${L.num(mode === 'week' ? s.week : s.xp)} XP</small><span class="pd-base"><span class="star8 ${cls[i]}"><b>${L.num(i === 1 ? 1 : i === 0 ? 2 : 3)}</b></span></span></button>`)
      .join('')}</div>`;
  }

  V.actions.board = (a) => V.go('circle', { board: a.dataset.m });
  V.actions['member-menu'] = (a) => (V.memberMenu ? V.memberMenu(a.dataset.uid) : V.go('me', { uid: a.dataset.uid }));
  V.actions['xp-help'] = () => {
    const X = G.XP;
    const rows = [
      ['scroll', L('كل صفحة جديدة تقراها (تفضل عليها ٣ ثواني)', 'Each new page you read (stay ~3 seconds)'), X.page],
      ['check', L('تخلّص ورد', 'Finish a portion'), X.wird],
      ['clock', L('تخلّصه في الميعاد', 'Finish it on time'), X.onTime],
      ['bolt', L('تكون أول واحد يخلّصه', 'Be the first to finish it'), X.first],
      ['hl', L('ملاحظة أو تظليل للحلقة', 'A shared note or highlight'), X.note],
      ['sparkle', L('خلاصة الورد', 'A portion takeaway'), X.take],
      ['chat', L('رد على ملاحظة', 'Reply to a note'), X.reply],
      ['heart', L('حد يعمل إعجاب لملاحظتك', 'Someone likes your note'), X.liked],
      ['shelf', L('كتاب قريته تضيفه لمكتبتك', 'A book you have read, added to your shelf'), X.shelf],
      ['edit', L('رأيك في كتاب', 'A book review'), X.review],
      ['trophy', L('تخلّص الكتاب', 'Finish the book'), X.book],
      ['chest', L('تخلّص مهام اليوم التلاتة', 'Complete all three daily quests'), X.quests],
    ];
    V.sheet({
      title: L('إزاي أكسب XP؟', 'How to earn XP'),
      html: `<ul class="xp-help">${rows.map(([ic, t, n]) => `<li>${icon(ic)}<span>${t}</span><b>+${L.num(n)}</b></li>`).join('')}</ul>
        <p class="muted sm">${L('المستويات بتعلى كل ما تجمع XP. والسلسلة بتزيد كل يوم تقرأ فيه أو تشارك.', 'Levels rise as XP adds up. Your streak grows every day you read or take part.')}</p>`,
    });
  };

  V.actions['edit-circle'] = () => {
    const c = S.circle || {};
    V.sheet({
      title: L('بيانات الحلقة', 'Circle details'),
      html: `<form id="ec-form" class="form">
        <label for="ec-name">${L('اسم الحلقة', 'Circle name')}</label><input id="ec-name" maxlength="60" dir="auto" value="${esc(c.name || L('حلقة القراءة', 'Reading Circle'))}" required>
        <label for="ec-motto">${L('شعار أو جملة تعريف', 'Motto')}</label><input id="ec-motto" maxlength="120" dir="auto" value="${esc(c.motto || '')}" placeholder="${L('مثلا: كل يوم ورد، وكل شهر كتاب', 'e.g. A portion a day, a book a month')}">
        <label for="ec-goal">${L('هدف الصفحات الأسبوعي للحلقة', 'Weekly page goal for the circle')}</label><input id="ec-goal" type="number" min="10" max="100000" value="${esc(c.weeklyGoal || 300)}">
        <div class="row-btns end"><button class="btn">${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) =>
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          api.close();
          await D.set('meta/circle', Object.assign({}, V.clean(c), { name: body.querySelector('#ec-name').value.trim(), motto: body.querySelector('#ec-motto').value.trim(), weeklyGoal: +body.querySelector('#ec-goal').value || 300, by: c.by || S.me, createdAt: c.createdAt || U.nowIso() })).catch(() => {});
        }),
    });
  };

  /* ---------- profile ---------- */
  V.screens.me = (opts = {}) => {
    const uid = opts.uid && (S.members.has(opts.uid) || opts.uid === S.me) ? opts.uid : S.me;
    const mine = uid === S.me;
    const s = G.of(uid);
    const shelf = V.shelfItems(uid).filter((x) => x.status === 'read');
    const live = D.readingNow().find((x) => x.uid === uid);
    const rank = G.board('all').findIndex((x) => x.uid === uid) + 1;
    return `<div class="profile">
      ${!mine ? `<button class="back" data-go="circle">${icon('back', 'flip')}<span>${L('الحلقة', 'Circle')}</span></button>` : ''}
      <header class="pf-hero">
        <div class="pf-av">${D.avatar(uid, 'xl')}${V.star(L.num(s.lv), 'gold lvl-big')}</div>
        <div class="pf-t"><h1 dir="auto">${esc(D.name(uid))}</h1><p class="pf-title">${esc(G.title(s.lv))}${rank ? ` • ${L(`المركز ${L.num(rank)} في الحلقة`, `#${rank} in the circle`)}` : ''}</p>
          <div class="pf-xp">${V.bar(s.span ? s.cur / s.span : 0, 'gold big')}<small>${L.num(s.cur)} / ${L.num(s.span)} XP • ${L(`فاضل ${L.num(s.toNext)} للمستوى ${L.num(s.lv + 1)}`, `${s.toNext} to level ${s.lv + 1}`)}</small></div>
          ${live ? `<p class="live-t"><span class="pulse"></span>${L('في القراية دلوقتي', 'Reading right now')}</p>` : ''}
          ${!mine && D.canWrite() ? `<div class="row-btns"><button class="btn sm" data-act="poke" data-to="${esc(uid)}" data-kind="cheer">${icon('clap')}${L('ابعت تشجيع', 'Cheer')}</button><button class="btn ghost sm" data-go="shelf" data-uid="${esc(uid)}">${icon('shelf')}${L('المكتبة', 'Shelf')}</button></div>` : ''}
        </div>
      </header>
      <section class="stat-tiles">
        <div class="stile flame ${s.streak ? (s.atRisk ? 'risk' : 'hot') : ''}">${icon('flame')}<b>${L.num(s.streak)}</b><small>${L('أيام ورا بعض', 'day streak')} • ${L('الأحسن', 'best')} ${L.num(s.best)}${s.freezes ? ` • ${L(`حماية ×${L.num(s.freezes)}`, `${s.freezes} freeze`)}` : ''}</small></div>
        <div class="stile">${icon('clock')}<b>${L.duration ? esc(L.duration(s.secs)) : ''}</b><small>${L('وقت القراية', 'time reading')}${s.secsWeek ? ` • ${L('الأسبوع ده', 'this week')} ${esc(L.duration(s.secsWeek))}` : ''}</small></div>
        <div class="stile">${icon('bolt')}<b>${L.num(s.xp)}</b><small>XP • ${L('الأسبوع ده', 'this week')} ${L.num(s.week)}</small></div>
        <div class="stile">${icon('scroll')}<b>${L.num(s.pages)}</b><small>${L('صفحة', 'pages')}</small></div>
        <div class="stile">${icon('shelf')}<b>${L.num(shelf.length)}</b><small>${L('كتب في المكتبة', 'books on shelf')}</small></div>
        <div class="stile">${icon('check')}<b>${L.num(s.wirdsDone)}</b><small>${L('ورد خلّصه', 'portions done')}</small></div>
        <div class="stile">${icon('heart')}<b>${L.num(s.likesRecv)}</b><small>${L('إعجاب', 'likes received')}</small></div>
      </section>
      <section class="card">
        <header class="sec-h"><h2>${L('الأوسمة', 'Badges')}</h2><small class="muted">${L.num(s.badgeCount)} / ${L.num(G.BADGES.length)}</small></header>
        <div class="badges">${s.badges
          .map((x) => `<div class="bdg${x.got ? ' got' : ''}" title="${esc(L(x.b.d[0], x.b.d[1]))}">${V.badgeIcon(x.b, x.got)}<b>${esc(L(x.b.t[0], x.b.t[1]))}</b><small>${x.got ? esc(L(x.b.d[0], x.b.d[1])) : `${L.num(x.v)} / ${L.num(x.b.n)}`}</small>${x.got ? '' : V.bar(x.v / x.b.n, 'gold')}</div>`)
          .join('')}</div>
      </section>
      <section class="card">
        <header class="sec-h"><h2>${L('خريطة القراية', 'Reading map')}</h2><small class="muted">${L('آخر ١٨ أسبوع', 'Last 18 weeks')}</small></header>
        ${heatmap(s)}
      </section>
      ${mine ? settings() : ''}
    </div>`;
  };

  function heatmap(s) {
    const weeks = 18;
    const today = U.today();
    const start = U.addDays(U.weekStart(today), -7 * (weeks - 1));
    let cols = '';
    for (let w = 0; w < weeks; w++) {
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const k = U.addDays(start, w * 7 + d);
        if (k > today) {
          cells += '<i class="hm f"></i>';
          continue;
        }
        const n = s.days[k] || 0;
        const act = s.active.has(k);
        const lv = n >= 40 ? 4 : n >= 20 ? 3 : n >= 8 ? 2 : n > 0 || act ? 1 : 0;
        cells += `<i class="hm l${lv}" title="${esc(L.day(k))}: ${L.count(n, 'page')}"></i>`;
      }
      cols += `<span class="hm-col">${cells}</span>`;
    }
    return `<div class="heat" dir="ltr">${cols}</div><div class="hm-legend"><span>${L('أقل', 'Less')}</span><i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i><span>${L('أكتر', 'More')}</span></div>`;
  }

  function settings() {
    const m = S.members.get(S.me) || {};
    const theme = U.store.get('theme', 'light');
    return `<section class="card settings">
      <header class="sec-h"><h2>${icon('gear')}${L('الإعدادات', 'Settings')}</h2></header>
      ${D.canWrite() ? `<form id="me-form" class="form inline"><label for="me-nick">${L('اسمك في الحلقة', 'Your name in the circle')}</label><div class="row"><input id="me-nick" maxlength="40" dir="auto" value="${esc(m.nick || '')}"><button class="btn sm">${L('احفظ', 'Save')}</button></div></form>` : ''}
      <div class="set-row"><span>${icon('lang')}${L('اللغة', 'Language')}</span><div class="seg sm"><button class="${L.isAr() ? 'on' : ''}" data-act="${L.isAr() ? '' : 'lang'}">العربية</button><button class="${L.isAr() ? '' : 'on'}" data-act="${L.isAr() ? 'lang' : ''}">English</button></div></div>
      <div class="set-row"><span>${icon('moon')}${L('المظهر', 'Appearance')}</span><div class="seg sm">${[['system', L('تلقائي', 'Auto')], ['light', L('فاتح', 'Light')], ['dark', L('غامق', 'Dark')]].map(([k, t]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-t="${k}">${t}</button>`).join('')}</div></div>
      <div class="set-row"><span>${icon('calendar')}${L('التاريخ الهجري', 'Hijri date')}</span><label class="switch"><input type="checkbox" id="set-hijri" ${U.store.get('hijri', true) ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('sparkle')}${L('أصوات الاحتفال', 'Celebration sounds')}</span><label class="switch"><input type="checkbox" id="set-sound" ${U.store.get('sound', true) ? 'checked' : ''}><i></i></label></div>
      ${V.extraSettings ? V.extraSettings() : ''}
    </section>`;
  }
  V.actions.theme = (a) => {
    U.store.set('theme', a.dataset.t);
    V.applyTheme();
    V.render();
  };
  const darkQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  V.applyTheme = () => {
    const t = U.store.get('theme', 'light');
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'system' && !!(darkQ && darkQ.matches));
    for (const m of document.querySelectorAll('meta[name=theme-color]')) m.content = dark ? '#0a0e1c' : '#2441a3';
  };
  if (darkQ && darkQ.addEventListener) darkQ.addEventListener('change', () => U.store.get('theme', 'light') === 'system' && V.applyTheme());
  document.addEventListener('change', (e) => {
    if (e.target.id === 'set-hijri') {
      U.store.set('hijri', e.target.checked);
      V.render();
    }
    if (e.target.id === 'set-sound') {
      U.store.set('sound', e.target.checked);
      if (e.target.checked) U.chime('ok');
    }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'me-form') return;
    e.preventDefault();
    const nick = e.target.querySelector('#me-nick').value.trim();
    if (!nick) return;
    await D.updateMe(() => ({ nick: nick.slice(0, 40) }));
    U.toast(L('اتحفظ', 'Saved'));
  });
})();
