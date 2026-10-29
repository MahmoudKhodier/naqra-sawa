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

  /* «الحلقة»: news (who is reading, the weekly challenge, activity), the circle chat, the leaderboard and members. */
  V.screens.circle = (opts = {}) => {
    const c = S.circle || {};
    const seg = ['news', 'chat', 'board', 'members'].includes(opts.seg) ? opts.seg : 'news';
    const online = D.onlineIds();
    const canAdmin = S.isOwner || S.canEdit;
    const ids = D.memberIds();
    const chatUnread = V.unread('_c', 'gen');
    const segs = [
      ['news', L('الأخبار', 'News')],
      ['chat', L('النقاش', 'Chat'), chatUnread],
      ['board', L('الترتيب', 'Ranking')],
      ['members', L('الأعضاء', 'Members')],
    ];
    let body = '';
    if (seg === 'news') body = newsSeg();
    else if (seg === 'chat') body = `<section class="card chat">${V.thread('_c', 'gen', { cls: 'tall', placeholder: L('اكتب للحلقة…', 'Write to the circle…') })}</section>`;
    else if (seg === 'board') body = boardSeg(opts.board || 'week', online);
    else body = membersSeg(online);
    return `<div class="circle">
      <header class="circle-head">
        <div class="ch-t"><h1 dir="auto">${esc(c.name || L('حلقة القراءة', 'Reading Circle'))}</h1>
          <p>${L.count(S.members.size, 'member')}${online.size ? ` • <span class="live-t">${L(`${L.num(online.size)} أونلاين`, `${online.size} online`)}</span>` : ''}${c.motto ? ` • <span dir="auto">${esc(c.motto)}</span>` : ''}</p></div>
        <div class="ch-avs" aria-hidden="true">${ids.slice(0, 4).map((u) => D.avatar(u, 'sm')).join('')}</div>
        <button class="btn sm gold" data-act="invite">${icon('share')}${L('ادعُ', 'Invite')}</button>
        ${canAdmin && D.canWrite() ? `<button class="ib round" data-act="edit-circle" aria-label="${L('بيانات الحلقة والهدف الأسبوعي', 'Circle details & weekly goal')}">${icon('edit')}</button>` : ''}
        <button class="ib round" data-act="circle-more" aria-label="${L('اختيارات الحلقة', 'Circle options')}">${icon('more')}</button>
      </header>
      <nav class="segs" role="tablist" aria-label="${L('أقسام الحلقة', 'Circle sections')}">${segs
        .map(([k, t, n]) => `<button role="tab" aria-selected="${k === seg}" class="${k === seg ? 'on' : ''}" data-act="circle-seg" data-seg="${k}">${t}${n ? `<i class="nv-b">${L.num(Math.min(n, 99))}</i>` : ''}</button>`)
        .join('')}</nav>
      <div class="circle-body seg-${seg}">${body}</div>
    </div>`;
  };
  V.actions['circle-seg'] = (a) => V.go('circle', { seg: a.dataset.seg });
  V.actions['circle-more'] = () => {
    const canAdmin = (S.isOwner || S.canEdit) && D.canWrite();
    const items = [];
    if (canAdmin) items.push({ ic: 'edit', t: L('بيانات الحلقة والهدف الأسبوعي', 'Circle details & weekly goal'), fn: () => V.actions['edit-circle']() });
    items.push({ ic: 'share', t: L('ادعُ أصحابك', 'Invite friends'), fn: () => V.actions.invite && V.actions.invite() });
    if (V.circleMenu) items.push({ ic: 'users', t: L('حلقاتي (بدّل أو اعمل جديدة)', 'My circles (switch or create)'), fn: () => V.actions['circle-menu']() });
    items.push({ ic: 'bolt', t: L('إزاي أكسب XP؟', 'How do I earn XP?'), fn: () => V.actions['xp-help']() });
    V.menu(items);
  };

  function newsSeg() {
    const { pages, goal } = G.groupWeek();
    const board = G.board('week');
    const daysLeft = Math.max(1, U.diffDays(U.today(), U.addDays(U.weekStart(), 6)) + 1);
    const feed = V.feedBlock ? V.feedBlock() : '';
    return `${V.liveBlock ? V.liveBlock() : ''}
      <section class="card cchal">
        <header><h3>${L('تحدي الحلقة الأسبوع ده', "This week's circle challenge")}</h3><small class="muted">${pages >= goal ? L('خلص! 🎉', 'Done! 🎉') : L(`فاضل ${L.count(daysLeft, 'day')}`, `${daysLeft} days left`)}</small></header>
        ${V.bar(pages / goal, pages >= goal ? 'jade big' : 'gold big')}
        <p class="muted sm">${L(`${L.num(pages)} من ${L.count(goal, 'page')} مع بعض`, `${pages} of ${goal} pages together`)}</p>
        ${!board.some((s) => s.pagesWeek) ? '' : `<div class="contrib">${board.filter((s) => s.pagesWeek).sort((a, b) => b.pagesWeek - a.pagesWeek).map((s) => `<span style="flex:${s.pagesWeek};--c:${esc(D.color(s.uid))}" title="${esc(D.name(s.uid))}: ${L.num(s.pagesWeek)}"></span>`).join('')}</div>`}
      </section>
      ${feed || V.empty(L('مفيش أخبار لسه', 'No news yet'), L('لما حد يخلّص ورد أو يكتب ملاحظة هتلاقيه هنا.', 'Finished portions and notes will show up here.'))}`;
  }

  function boardSeg(mode, online) {
    const board = G.board(mode);
    const medal = ['gold', 'silver', 'bronze'];
    return `<section class="card board">
      <header><h2>${icon('trophy')}${L('الصدارة', 'Leaderboard')}</h2><div class="seg sm"><button class="${mode === 'week' ? 'on' : ''}" data-act="board" data-m="week">${L('الأسبوع ده', 'This week')}</button><button class="${mode === 'all' ? 'on' : ''}" data-act="board" data-m="all">${L('كل الوقت', 'All time')}</button></div></header>
      ${board.length >= 3 ? podium(board.slice(0, 3), mode) : ''}
      <ol class="lb">${board
        .map((s, i) => `<li class="${s.uid === S.me ? 'me' : ''}"><button data-act="member" data-uid="${esc(s.uid)}"><span class="rank ${medal[i] || ''}">${L.num(i + 1)}</span>${D.avatar(s.uid, 'md')}${online.has(s.uid) ? '<i class="on-dot"></i>' : ''}
          <span class="lb-n"><b>${esc(D.name(s.uid))}</b><small>${V.star(L.num(s.lv), 'xs gold')} ${esc(G.title(s.lv))}${s.streak ? ` • <span class="flame-t">${icon('flame')}${L.num(s.streak)}</span>` : ''}</small></span>
          <span class="lb-xp"><b>${L.num(mode === 'week' ? s.week : s.xp)}</b><small>XP</small></span></button></li>`)
        .join('')}</ol>
      <p class="muted sm">${L('الأسبوع بيبدأ السبت. الـXP بييجي من الصفحات، الأوراد، الملاحظات، الردود والإعجابات.', 'Weeks start on Saturday. XP comes from pages, portions, notes, replies and likes.')} <button class="lnk" data-act="xp-help">${L('إزاي أكسب XP؟', 'How do I earn XP?')}</button></p>
    </section>`;
  }

  function membersSeg(online) {
    return `<section class="card members">
      <ul>${D.memberIds()
        .map((u) => {
          const s = G.of(u);
          const reading = D.readingNow().find((x) => x.uid === u);
          const b = reading && S.books.get(reading.b);
          return `<li><button data-act="${V.memberMenu ? 'member-menu' : 'member'}" data-uid="${esc(u)}">${D.avatar(u, 'md')}${online.has(u) ? '<i class="on-dot"></i>' : ''}<span><b>${esc(D.name(u))}${A.P && A.P.role && A.P.role(u) !== 'member' ? ` <i class="role-tag">${A.P.role(u) === 'owner' ? L('صاحب الحلقة', 'owner') : L('مشرف', 'admin')}</i>` : ''}</b><small>${reading ? `<span class="live-t">${L('في القراية:', 'Reading')}</span> <span dir="auto">${b ? esc(b.title) : ''}</span>` : `${L('مستوى', 'Level')} ${L.num(s.lv)} • ${s.streak ? `${icon('flame')}${L.num(s.streak)} • ` : ''}${L.count(s.badgeCount || 0, 'badge')}`}</small></span>${icon('more')}</button></li>`;
        })
        .join('')}</ul>
      <button class="btn gold full" data-act="invite">${icon('share')}${L('ادعُ أصحابك أو عيلتك', 'Invite friends or family')}</button>
    </section>`;
  }

  function podium(top, mode) {
    const order = [top[1], top[0], top[2]];
    const cls = ['silver', 'gold', 'bronze'];
    return `<div class="podium">${order
      .map((s, i) => `<button class="pd ${cls[i]}" data-act="member" data-uid="${esc(s.uid)}">${D.avatar(s.uid, i === 1 ? 'lg' : 'md')}<b>${esc(D.name(s.uid))}</b><small>${L.num(mode === 'week' ? s.week : s.xp)} XP</small><span class="pd-base"><span class="star8 ${cls[i]}"><b>${L.num(i === 1 ? 1 : i === 0 ? 2 : 3)}</b></span></span></button>`)
      .join('')}</div>`;
  }

  V.actions.board = (a) => V.go('circle', { seg: 'board', board: a.dataset.m });
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
          ${mine && A.Share ? `<button class="lnk sm" data-act="share-level">${icon('share')}${L('شارك مستواك', 'Share your level')}</button>` : ''}
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
        <div class="stile">${icon('target')}<b>${L.num(s.goalDays)}</b><small>${L('يوم حقق فيه الهدف', 'goal days')}</small></div>
        <div class="stile">${icon('hourglass')}<b>${L.num(s.focusN)}</b><small>${L('جلسة تركيز', 'focus sessions')}</small></div>
      </section>
      ${mine ? monthBlock() : ''}
      ${mine ? rewardsBlock(s) : ''}
      <section class="card">
        <header class="sec-h"><h2>${L('الأوسمة', 'Badges')}</h2><small class="muted">${L.num(s.badgeCount)} / ${L.num(G.BADGES.length)}</small></header>
        <div class="badges">${G.badgeGroups(s).filter((g) => !g.secret).map((grp) => V.badgeCard(grp, uid)).join('')}</div>
        <h3 class="set-h">${icon('lock')}${L('أوسمة سرية', 'Secret badges')} <small class="muted">${L.num(G.secretsGot(s))} / ${L.num(G.BADGES.filter((b) => b.secret).length)}</small></h3>
        <div class="badges secrets">${G.badgeGroups(s).filter((g) => g.secret).map((grp) => V.badgeCard(grp, uid)).join('')}</div>
      </section>
      <section class="card">
        <header class="sec-h"><h2>${L('خريطة القراية', 'Reading map')}</h2><small class="muted">${L('آخر ١٨ أسبوع', 'Last 18 weeks')}</small></header>
        ${heatmap(s)}
      </section>
    </div>`;
  };

  /* The month in reading: this month so far, and last month. */
  function monthBlock() {
    if (!A.Wrapped) return '';
    const W = A.Wrapped;
    const now = U.today().slice(0, 7);
    const prev = W.prevMonth();
    return `<section class="card month-card">
      <div><b>${icon('sparkle')}${L('شهرك في القراية', 'Your month in reading')}</b><small class="muted">${L('ملخص زي القصة، تقدر تشاركه', 'A story-style recap you can share')}</small></div>
      <div class="row-btns"><button class="btn gold sm" data-act="wrapped" data-m="${now}">${esc(W.monthName(now))}</button><button class="btn ghost sm" data-act="wrapped" data-m="${prev}">${esc(W.monthName(prev))}</button></div>
    </section>`;
  }
  /* What unlocks next: the closest locked frames, emoji and paper colours. */
  function rewardsBlock(s) {
    const all = [
      ...G.FRAMES.map((f) => ({ kind: 'frame', f, need: f.need, t: L(`إطار «${f.t[0]}»`, `“${f.t[1]}” frame`) })),
      ...G.EMOJI_PACKS.map((p) => ({ kind: 'emoji', p, need: p.need, t: p.e.join(' ') })),
      ...G.PAPERS.filter((p) => p.need).map((p) => ({ kind: 'paper', p, need: p.need, t: L(`ورق «${p.t[0]}»`, `“${p.t[1]}” paper`) })),
    ];
    const got = all.filter((x) => G.unlocked(x.need, s)).length;
    const next = all
      .filter((x) => !G.unlocked(x.need, s))
      .map((x) => Object.assign(x, { pr: G.needProgress(x.need, s) }))
      .sort((a, b) => b.pr - a.pr)
      .slice(0, 3);
    const col = D.color(S.me);
    const m = S.members.get(S.me) || {};
    const face = m.emoji ? `<span class="av-emo">${esc(m.emoji)}</span>` : `<span class="av-ch">${esc(Array.from(D.name(S.me).trim())[0] || '؟')}</span>`;
    const art = (x) =>
      x.kind === 'frame' ? `<span class="av av-sm fr fr-${x.f.id}" style="--c:${esc(col)}">${face}</span>` : x.kind === 'paper' ? `<i class="pp sm" data-pp="${x.p.id}"></i>` : `<span class="rw-emo">${x.p.e[0]}</span>`;
    return `<section class="card rewards">
      <header class="sec-h"><h2>${icon('gift')}${L('الجوايز', 'Rewards')}</h2><small class="muted">${L(`اتفتح ${L.num(got)} من ${L.num(all.length)}`, `${got} of ${all.length} unlocked`)}</small></header>
      ${next.length ? `<ul class="rw-next">${next.map((x) => `<li>${art(x)}<div><b>${esc(x.t)}</b><small>${esc(G.needText(x.need))}</small>${V.bar(x.pr, 'gold')}</div></li>`).join('')}</ul>` : `<p class="muted">${L('فتحت كل الجوايز! 👑', 'Everything unlocked! 👑')}</p>`}
      <div class="row-btns"><button class="btn ghost sm" data-go="settings">${icon('frame')}${L('غيّر إطارك وعلامتك', 'Change frame and mark')}</button></div>
    </section>`;
  }

  /* ---------- settings (its own tab) ---------- */
  V.screens.settings = () => `<div class="settings-page">${settings()}</div>`;

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
      ${D.canWrite() && S.members.has(S.me) ? `<div class="set-me">
        <button class="set-me-av" data-go="me" aria-label="${L('ملفي', 'My profile')}">${D.avatar(S.me, 'xl')}</button>
        <form id="me-form" class="form inline"><label for="me-nick">${L('اسمك في الحلقة', 'Your name in the circle')}</label><div class="row"><input id="me-nick" maxlength="40" dir="auto" value="${esc(m.nick || '')}"><button class="btn sm">${L('احفظ', 'Save')}</button></div></form>
      </div>
      <span class="lbl set-lbl">${L('علامتك (الصورة اللي بتظهر جنب اسمك)', 'Your mark (shown next to your name)')}</span>
      <div class="emo emo-all" role="radiogroup" aria-label="${L('علامتك', 'Your mark')}">
        <button type="button" class="emo-b letter${m.emoji ? '' : ' on'}" data-act="set-emoji" data-emo="" role="radio" aria-checked="${!m.emoji}" aria-label="${L('أول حرف من اسمي', 'First letter of my name')}">${esc(Array.from(D.name(S.me).trim())[0] || '؟')}</button>
        ${V.EMOJI.map((e) => `<button type="button" class="emo-b${m.emoji === e ? ' on' : ''}" data-act="set-emoji" data-emo="${e}" role="radio" aria-checked="${m.emoji === e}" aria-label="${e}">${e}</button>`).join('')}
        ${packsHtml(m)}
      </div>
      <span class="lbl set-lbl">${icon('frame')}${L('إطار الصورة', 'Frame')} <small class="muted">${L('بيتفتح مع المستويات والأوسمة', 'unlocks with levels and badges')}</small></span>
      <div class="frames" role="radiogroup" aria-label="${L('إطار الصورة', 'Frame')}">${framesHtml(m)}</div>` : ''}
      <div class="set-row"><span>${icon('lang')}${L('اللغة', 'Language')}</span><div class="seg sm"><button class="${L.isAr() ? 'on' : ''}" data-act="${L.isAr() ? '' : 'lang'}">العربية</button><button class="${L.isAr() ? '' : 'on'}" data-act="${L.isAr() ? 'lang' : ''}">English</button></div></div>
      <div class="set-row"><span>${icon('moon')}${L('المظهر', 'Appearance')}</span><div class="seg sm">${[['system', L('تلقائي', 'Auto')], ['light', L('فاتح', 'Light')], ['dark', L('غامق', 'Dark')]].map(([k, t]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-t="${k}">${t}</button>`).join('')}</div></div>
      <div class="set-row"><span>${icon('calendar')}${L('التاريخ الهجري', 'Hijri date')}</span><label class="switch"><input type="checkbox" id="set-hijri" ${U.store.get('hijri', true) ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('sparkle')}${L('أصوات الاحتفال', 'Celebration sounds')}</span><label class="switch"><input type="checkbox" id="set-sound" ${U.store.get('sound', true) ? 'checked' : ''}><i></i></label></div>
      ${readingSettings()}
      ${V.extraSettings ? V.extraSettings() : ''}
    </section>`;
  }
  /* Emoji that unlock with levels and badges (locked ones show how to get them). */
  function packsHtml(m) {
    const s = G.of(S.me);
    return G.EMOJI_PACKS.map((pk) => {
      const ok = G.unlocked(pk.need, s);
      return pk.e
        .map((e) => `<button type="button" class="emo-b${ok ? '' : ' locked'}${m.emoji === e ? ' on' : ''}" data-act="set-emoji" data-emo="${e}" role="radio" aria-checked="${m.emoji === e}" aria-label="${ok ? e : esc(L(`مقفولة: ${G.needText(pk.need)}`, `Locked: ${G.needText(pk.need)}`))}" title="${ok ? '' : esc(G.needText(pk.need))}">${e}${ok ? '' : `<i class="lk">${icon('lock')}</i>`}</button>`)
        .join('');
    }).join('');
  }
  function framesHtml(m) {
    const s = G.of(S.me);
    const col = D.color(S.me);
    const face = m.emoji ? `<span class="av-emo">${esc(m.emoji)}</span>` : `<span class="av-ch">${esc(Array.from(D.name(S.me).trim())[0] || '؟')}</span>`;
    const cur = G.frameOf(S.me);
    const none = `<button type="button" class="frm${cur ? '' : ' on'}" data-act="set-frame" data-fr="" role="radio" aria-checked="${!cur}"><span class="av av-md" style="--c:${esc(col)}">${face}</span><small>${L('من غير', 'None')}</small></button>`;
    return none + G.FRAMES.map((f) => {
      const ok = G.unlocked(f.need, s);
      const pr = G.needProgress(f.need, s);
      return `<button type="button" class="frm${cur === f.id ? ' on' : ''}${ok ? '' : ' locked'}" data-act="set-frame" data-fr="${f.id}" role="radio" aria-checked="${cur === f.id}">
        <span class="av av-md fr fr-${f.id}" style="--c:${esc(col)}">${face}</span><small>${esc(L(f.t[0], f.t[1]))}</small>
        ${ok ? '' : `<small class="frm-need">${icon('lock')}${esc(G.needText(f.need))}</small>${V.bar(pr, 'gold')}`}</button>`;
    }).join('');
  }
  V.actions['set-frame'] = async (a) => {
    const id = a.dataset.fr || '';
    const f = G.FRAMES.find((x) => x.id === id);
    if (f && !G.unlocked(f.need, G.of(S.me))) return U.toast(L(`الإطار ده بيتفتح بـ${G.needText(f.need)}`, `This frame unlocks with ${G.needText(f.need)}`));
    await D.updateMe(() => ({ frame: id }));
    U.toast(id ? L(`إطارك بقى «${f.t[0]}»`, `Frame: ${f.t[1]}`) : L('من غير إطار', 'No frame'));
  };
  /* The daily goal outside the reader. */
  V.goalEdit = () => {
    const g = G.dailyGoal();
    const opts = g.k === 'mins' ? [10, 15, 20, 30, 45, 60] : [5, 10, 15, 20, 30, 50];
    if (!opts.includes(g.n)) opts.push(g.n), opts.sort((x, y) => x - y);
    V.sheet({
      title: L('هدفك اليومي', 'Your daily goal'),
      html: `<div class="goal-sheet"><p class="muted">${L('الدايرة اللي فوق في القارئ بتتملي لحد ما توصل هدفك. كل يوم بتحققه بيديك XP ويقربك من أوسمة «في الهدف».', 'The ring at the top of the reader fills up as you go. Each day you reach it gives XP and counts towards the “On target” badges.')}</p>
        <div class="seg sm gs-kind"><button class="${g.k === 'pages' ? 'on' : ''}" data-gk="pages">${L('صفحات', 'Pages')}</button><button class="${g.k === 'mins' ? 'on' : ''}" data-gk="mins">${L('دقايق', 'Minutes')}</button></div>
        <div class="chips gs-n">${opts.map((n) => `<button class="chip${n === g.n ? ' on' : ''}" data-gn="${n}">${L.num(n)}</button>`).join('')}</div></div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          const k = e.target.closest('[data-gk]');
          const n = e.target.closest('[data-gn]');
          if (k && k.dataset.gk !== g.k) {
            api.close();
            await D.setDailyGoal(k.dataset.gk, k.dataset.gk === 'mins' ? 15 : 10);
            V.goalEdit();
          } else if (n) {
            api.close();
            await D.setDailyGoal(g.k, +n.dataset.gn);
            V.render();
          }
        }),
    });
  };
  V.actions['goal-edit'] = () => V.goalEdit();

  /* Reader preferences (this device): tools side when sideways, whose marks show, page turning. */
  function readingSettings() {
    const R = A.R;
    if (!R || !R.marksPref) return '';
    const seg = (act, cur, opts) => `<div class="seg sm">${opts.map(([k, t]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${t}</button>`).join('')}</div>`;
    const paged = !!U.store.get('readerPrefs', {}).paged;
    const native = !!(A.Sys && A.Sys.canOrient && A.Sys.canOrient());
    const g = G.dailyGoal();
    return `<h3 class="set-h">${icon('book')}${L('القراءة', 'Reading')}</h3>
      ${D.canWrite() && D.joined() ? `<div class="set-row"><span>${icon('target')}<span>${L('هدفك اليومي', 'Your daily goal')}<small class="muted">${L('الدايرة اللي فوق في القارئ', 'The ring at the top of the reader')}</small></span></span><button class="btn ghost sm" data-act="goal-edit">${g.k === 'mins' ? L.count(g.n, 'minute') : L.count(g.n, 'page')}</button></div>` : ''}
      <div class="set-row"><span>${icon('sparkle')}<span>${L('التشجيع وقت القراية', 'Encouragement while reading')}<small class="muted">${L('كلمة صغيرة فوق، مرة كل كام دقيقة بالكتير', 'A small line at the top, every few minutes at most')}</small></span></span>${seg('rd-cheer', R.cheerPref(), [['all', L('كله', 'All')], ['key', L('المهم بس', 'Big moments')], ['off', L('مقفول', 'Off')]])}</div>
      <div class="set-row"><span>${icon('bolt')}<span>${L('«+١» وهزة خفيفة لكل صفحة', '«+1» and a light buzz per page')}</span></span><label class="switch"><input type="checkbox" id="set-rdpop" ${R.popPref() ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('book')}<span>${L('حركة تقليب الصفحة', 'Page-turn animation')}<small class="muted">${L('في وضع صفحة صفحة', 'In page-by-page mode')}</small></span></span><label class="switch"><input type="checkbox" id="set-rdturn" ${R.turnAnimPref() ? 'checked' : ''}><i></i></label></div>
      <div class="set-row sub"><span>${L('صوت ورق وإنت بتقلّب', 'Paper sound when turning')}</span><label class="switch"><input type="checkbox" id="set-rdsound" ${R.turnSoundPref() ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('book')}<span>${L('شكل الكتاب', 'Book look')}<small class="muted">${L('في وضع صفحة صفحة: غلاف وحافة ورق زي الكتاب', 'In page-by-page mode: a cover board and page edges, like a book')}</small></span></span><label class="switch"><input type="checkbox" id="set-rdbook" ${R.bookPref() ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('bookmark')}<span>${L('نقط «وقفت هنا» على الحافة', '«Stopped here» dots on the edge')}<small class="muted">${L('دوس على أي نقطة تعلّم السطر اللي وقفت عنده', 'Tap a dot to mark the line where you stopped')}</small></span></span>${seg('rd-pillshow', R.pillShow(), [['always', L('دايماً', 'Always')], ['bars', L('مع الأزرار', 'With the bars')], ['off', L('مخفية', 'Off')]])}</div>
      ${R.pillShow() !== 'off' ? `<div class="set-row sub"><span>${L('عدد النقط', 'How many dots')}</span>${seg('rd-pillcount', String(R.pillCount()), [['8', L.num(8)], ['12', L.num(12)], ['20', L.num(20)]])}</div>
      <div class="set-row sub"><span>${L('لون خط «وقفت هنا»', 'Colour of the «stopped here» line')}</span><div class="seg sm swatches">${[['green', 'var(--jade)', L('أخضر', 'Green')], ['gold', 'var(--gold)', L('دهبي', 'Gold')], ['red', 'var(--rubric)', L('أحمر', 'Red')], ['blue', 'var(--lapis)', L('أزرق', 'Blue')]].map(([k, c, t]) => `<button class="${R.lineColor() === k ? 'on' : ''}" data-act="rd-linecolor" data-v="${k}" aria-pressed="${R.lineColor() === k}" aria-label="${t}" title="${t}"><i style="--c:${c}"></i></button>`).join('')}</div></div>` : ''}
      ${native ? `<div class="set-row"><span>${icon('swap')}${L('اتجاه القراية', 'Reading orientation')}</span>${seg('rd-orient', R.orientPref(), [['auto', L('حسب الموبايل', 'Follow phone')], ['portrait', L('بالطول', 'Upright')], ['landscape', L('بالعرض', 'Sideways')]])}</div>` : ''}
      <div class="set-row"><span>${icon('swap')}<span>${L('اقترح القراية بالعرض', 'Suggest reading sideways')}<small class="muted">${L('تلميح صغير لما تفتح الكتاب والموبايل بالطول', 'A small hint when you open a book upright')}</small></span></span><label class="switch"><input type="checkbox" id="set-rdask" ${R.orientAsk() ? 'checked' : ''}><i></i></label></div>
      <div class="set-row"><span>${icon('swap')}<span>${L('مكان الأدوات لما الموبايل بالعرض', 'Tools side when the phone is sideways')}<small class="muted">${L('القلم والملاحظة وشريط الصفحات', 'Highlight, note and the page slider')}</small></span></span>${seg('rd-tools', R.toolsSide(), [['right', L('يمين', 'Right')], ['left', L('شمال', 'Left')]])}</div>
      <div class="set-row"><span>${icon('eye')}<span>${L('الإضافات على الصفحات', 'Highlights and notes on pages')}<small class="muted">${L('تقدر تغيّرها كمان من زرار العين في القارئ', 'Also from the eye button in the reader')}</small></span></span>${seg('rd-marks', R.marksPref(), [['all', L('الكل', 'Everyone')], ['mine', L('بتاعتي', 'Mine')], ['none', L('ولا حاجة', 'None')]])}</div>
      <div class="set-row"><span>${icon('scroll')}${L('التقليب', 'Page turning')}</span>${seg('rd-paged', paged ? 'page' : 'scroll', [['page', L('صفحة صفحة', 'Page by page')], ['scroll', L('متواصل', 'Continuous')]])}</div>
      ${A.P && A.P.native ? `<div class="set-row"><span>${icon('fit')}<span>${L('اخفي شريط الساعة وقت القراية', 'Hide the clock bar while reading')}<small class="muted">${L('شريط التنقل بتاع الموبايل بيفضل ظاهر. اسحب من فوق تشوف الساعة.', "Your phone's navigation bar stays. Swipe down from the top to see the clock.")}</small></span></span><label class="switch"><input type="checkbox" id="set-rdfull" ${R.fullPref() ? 'checked' : ''}><i></i></label></div>` : ''}`;
  }
  V.actions['set-emoji'] = async (a) => {
    const emoji = a.dataset.emo || '';
    const pk = G.EMOJI_PACKS.find((x) => x.e.includes(emoji));
    if (pk && !G.unlocked(pk.need, G.of(S.me))) return U.toast(L(`${emoji} بتتفتح بـ${G.needText(pk.need)}`, `${emoji} unlocks with ${G.needText(pk.need)}`));
    const m = S.members.get(S.me) || {};
    if ((m.emoji || '') === emoji) return;
    await D.updateMe(() => ({ emoji }));
    U.toast(emoji ? L(`علامتك بقت ${emoji}`, `Your mark is now ${emoji}`) : L('هيظهر أول حرف من اسمك', 'Showing the first letter of your name'));
  };
  V.actions['rd-tools'] = (a) => {
    A.R.setToolsSide(a.dataset.v);
    V.render();
  };
  V.actions['rd-pillshow'] = (a) => {
    A.R.setEdge('rdPillShow', a.dataset.v);
    V.render();
  };
  V.actions['rd-pillcount'] = (a) => {
    A.R.setEdge('rdPillCount', +a.dataset.v);
    V.render();
  };
  V.actions['rd-linecolor'] = (a) => {
    A.R.setEdge('rdLineColor', a.dataset.v);
    V.render();
  };
  V.actions['rd-orient'] = (a) => {
    U.store.set('rdOrient', a.dataset.v);
    V.render();
  };
  V.actions['rd-cheer'] = (a) => {
    U.store.set('rdCheer', a.dataset.v);
    V.render();
  };
  V.actions['rd-marks'] = (a) => {
    A.R.setMarks(a.dataset.v, true);
    V.render();
  };
  V.actions['rd-paged'] = (a) => {
    const p = Object.assign({ zoom: 1, theme: 'day' }, U.store.get('readerPrefs', {}));
    p.paged = a.dataset.v === 'page';
    if (p.paged) p.zoom = 1;
    U.store.set('readerPrefs', p);
    V.render();
  };
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
    for (const m of document.querySelectorAll('meta[name=theme-color]')) m.content = dark ? '#0f1115' : '#f6f4ef';
    if (A.Sys) A.Sys.refresh();
  };
  V.isDark = () => {
    const t = U.store.get('theme', 'light');
    return t === 'dark' || (t === 'system' && !!(darkQ && darkQ.matches));
  };
  V.toggleTheme = () => {
    U.store.set('theme', V.isDark() ? 'light' : 'dark');
    V.applyTheme();
  };
  V.themeBtn = (attr) => `<button class="ib round theme-t" ${attr} aria-label="${V.isDark() ? L('الوضع الفاتح', 'Light mode') : L('الوضع الغامق', 'Dark mode')}">${icon(V.isDark() ? 'sun' : 'moon')}</button>`;
  V.actions['theme-toggle'] = () => {
    V.toggleTheme();
    V.render();
  };
  if (darkQ && darkQ.addEventListener) darkQ.addEventListener('change', () => U.store.get('theme', 'light') === 'system' && V.applyTheme());
  document.addEventListener('change', (e) => {
    if (e.target.id === 'set-hijri') {
      U.store.set('hijri', e.target.checked);
      V.render();
    }
    if (e.target.id === 'set-rdfull') U.store.set('rdFull', e.target.checked);
    if (e.target.id === 'set-rdbook') A.R.setBookLook(e.target.checked);
    if (e.target.id === 'set-rdask') U.store.set('rdOrientAsk', e.target.checked);
    if (e.target.id === 'set-rdpop') U.store.set('rdPop', e.target.checked);
    if (e.target.id === 'set-rdturn') U.store.set('rdTurnAnim', e.target.checked);
    if (e.target.id === 'set-rdsound') {
      U.store.set('rdTurnSound', e.target.checked);
      if (e.target.checked && A.R._rustle) A.R._rustle();
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
