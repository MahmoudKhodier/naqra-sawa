/* Today (home), onboarding and the signed-out screen. */
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

  const WISDOM = [
    ['وخيرُ جليسٍ في الزمانِ كتابُ', 'المتنبي', 'And the best companion in any age is a book', 'al-Mutanabbi'],
    ['اقرأ', 'سورة العلق', 'Read', 'Surat al-ʿAlaq'],
    ['القراءة تمنحني أكثر من حياة واحدة', 'عباس محمود العقاد', 'Reading gives me more than one life', 'Abbas al-Aqqad'],
    ['من لم يقرأ إلا كتابًا واحدًا فاحذره', 'مثل', 'Beware the reader of a single book', 'Proverb'],
    ['الكتاب وعاءٌ مُلئ علمًا', 'الجاحظ', 'A book is a vessel filled with knowledge', 'al-Jahiz'],
    ['العلم صيدٌ والكتابة قيده', 'الإمام الشافعي', 'Knowledge is the catch; writing is its tether', 'al-Shafiʿi'],
    ['بيتٌ بلا كتب كجسدٍ بلا روح', 'شيشرون', 'A room without books is like a body without a soul', 'Cicero'],
    ['الكتب حدائق العلماء', 'مثل عربي', 'Books are the gardens of the learned', 'Arabic proverb'],
  ];

  function greet() {
    const h = new Date().getHours();
    if (h >= 4 && h < 12) return L('صباح الخير', 'Good morning');
    if (h >= 12 && h < 17) return L('يومك سعيد', 'Good afternoon');
    return L('مساء الخير', 'Good evening');
  }

  V.screens.home = () => {
    const s = G.of(S.me);
    const reading = [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading').sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    const streakLine = !s.streak
      ? L('ابدأ سلسلة قراءة النهارده — كل يوم تقرأ فيه بيزوّد النار', 'Start a reading streak today — every day you read feeds the flame')
      : s.atRisk
        ? L(`سلسلتك ${L.count(s.streak, 'day')} — اقرأ صفحة النهارده عشان متقطعهاش`, `Your streak is ${L.count(s.streak, 'day')} — read a page today to keep it`)
        : s.streak === 1
          ? L('أول يوم في سلسلتك. ارجع بكرة عشان تكبر!', 'Day one of your streak. Come back tomorrow to grow it!')
          : L(`${L.count(s.streak, 'day')} قراية ورا بعض. عاش!`, `${L.count(s.streak, 'day')} in a row. Brilliant!`);
    return `<div class="home">
      <section class="greet">
        <div><h1>${greet()}، <span dir="auto">${esc(D.name(S.me))}</span></h1><p class="${s.atRisk ? 'risk' : ''}">${icon('flame')}${streakLine}</p></div>
      </section>
      ${pokesBlock()}
      <div class="home-grid">
        <div class="col-main">
          ${reading.length ? reading.map(wirdCard).join('') : noBooks()}
          ${liveBlock()}
          ${feedBlock()}
        </div>
        <div class="col-side">
          ${D.canWrite() ? questsBlock() : ''}
          ${groupBlock()}
        </div>
      </div>
    </div>`;
  };

  function noBooks() {
    const canUp = D.canWrite();
    return `<section class="card hero-empty">
      <div class="he-art" aria-hidden="true">${[0, 1, 2].map((i) => `<span class="star8 ${['gold', 'lapis', 'jade'][i]}"></span>`).join('')}</div>
      <h2>${L('يلا نختار أول كتاب', "Let's pick our first book")}</h2>
      <p>${L('ارفع كتاب PDF، قسّموه أوراد، وابدأوا تقرأوا سوا. ولحد ما الكتاب ييجي، ضيف الكتب اللي قريتها قبل كده لمكتبتك واكسب XP.', 'Upload a PDF, split it into daily portions and start reading together. Meanwhile, add books you have already read to your shelf and earn XP.')}</p>
      <div class="row-btns center">${canUp ? `<button class="btn gold" data-act="add-book">${icon('upload')}${L('ضيف كتاب', 'Add a book')}</button>` : ''}<button class="btn ghost" data-act="bulk-shelf">${icon('shelf')}${L('ضيف كتب قريتها', 'Add books I have read')}</button></div>
    </section>`;
  }

  function wirdCard(b) {
    const ws = G.wirds(b);
    const prog = D.prog(b.id);
    const w = G.myCurrent(b);
    const last = (prog && prog.last) || 1;
    const live = D.readingNow(b.id);
    const members = D.memberIds();
    let body;
    if (!ws.length) {
      body = `<p class="muted">${L('لسه مفيش خطة قراءة للكتاب ده. قسّموه أوراد عشان كل واحد يعرف هيقرأ إيه وإمتى.', 'No reading plan yet. Split it into portions so everyone knows what to read and when.')}</p>
        <div class="row-btns">${D.canWrite() ? `<button class="btn gold" data-act="plan" data-b="${esc(b.id)}">${icon('calendar')}${L('اعمل خطة', 'Make a plan')}</button>` : ''}<button class="btn" data-act="read" data-b="${esc(b.id)}">${icon('play', 'flip-rtl')}${last > 1 ? L(`كمّل من ص ${L.num(last)}`, `Continue from p. ${last}`) : L('ابدأ القراية', 'Start reading')}</button></div>`;
    } else if (!w) {
      const fin = prog && prog.finished;
      body = `<div class="alldone">${V.star('', 'jade')}<div><b>${L('خلّصت كل الأوراد!', 'All portions done!')}</b><p class="muted">${fin ? L('وخلّصت الكتاب كمان. شجّع الباقيين 👏', 'And you finished the book. Cheer the others on 👏') : L('فاضل تعلّم إنك خلّصت الكتاب', 'Mark the book as finished')}</p></div></div>
        <div class="row-btns">${!fin && D.canWrite() ? `<button class="btn gold" data-act="finish-book" data-b="${esc(b.id)}">${icon('trophy')}${L('خلّصت الكتاب', 'I finished the book')}</button>` : ''}<button class="btn ghost" data-go="book-${esc(b.id)}">${L('صفحة الكتاب', 'Book page')}</button></div>`;
    } else {
      const total = w.to - w.from + 1;
      const seen = U.rangesCountIn(prog && prog.seen, w.from, w.to);
      const startAt = last >= w.from && last <= w.to ? last : w.from;
      const st = G.wirdStatus(b, w);
      const done = [];
      const notDone = [];
      for (const uid of members) {
        const p = D.prog(b.id, uid);
        if (p && p.done && p.done[w.id]) done.push({ uid, t: p.done[w.id] });
        else notDone.push(uid);
      }
      done.sort((a, b2) => String(a.t).localeCompare(String(b2.t)));
      const liveIds = new Set(live.map((x) => x.uid));
      const avs =
        done.map((d, i) => `<button class="mav done${i === 0 ? ' first' : ''}" data-act="who" data-uid="${esc(d.uid)}" data-b="${esc(b.id)}" data-w="${esc(w.id)}" title="${esc(D.name(d.uid))}">${D.avatar(d.uid, 'sm')}<i>${icon('check')}</i></button>`).join('') +
        notDone.map((uid) => `<button class="mav${liveIds.has(uid) ? ' live' : ''}${uid === S.me ? ' me' : ''}" data-act="who" data-uid="${esc(uid)}" data-b="${esc(b.id)}" data-w="${esc(w.id)}" title="${esc(D.name(uid))}">${D.avatar(uid, 'sm')}</button>`).join('');
      body = `<div class="wird-line">
          ${V.star(L.num(w.n), st === 'late' ? 'rubric' : 'gold')}
          <div class="wl-t"><b>${L(`الورد ${L.num(w.n)} من ${L.num(ws.length)}`, `Portion ${w.n} of ${ws.length}`)}</b>
          <span>${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)} · <span class="due ${st}">${L.due(w.due)}</span></span></div>
        </div>
        <div class="wl-prog">${V.bar(seen / total, st === 'late' ? 'rubric' : 'lapis')}<small>${L(`قريت ${L.num(seen)} من ${L.count(total, 'page')}`, `${seen} of ${total} pages read`)}</small></div>
        <div class="row-btns">
          <button class="btn big" data-act="read" data-b="${esc(b.id)}" data-p="${startAt}">${icon('play', 'flip-rtl')}${startAt > w.from ? L(`كمّل من ص ${L.num(startAt)}`, `Continue from p. ${startAt}`) : L('يلا نقرأ', 'Start reading')}</button>
          ${D.canWrite() ? `<button class="btn jade" data-act="mark-wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}">${icon('check')}${L('خلّصته', 'Done')}</button>` : ''}
        </div>
        <div class="group-row"><div class="mavs">${avs}</div><small>${L(`${L.num(done.length)} من ${L.num(members.length)} خلّصوا`, `${done.length} of ${members.length} finished`)}${live.length ? ` · <span class="live-t">${L(`${L.num(live.length)} بيقرأوا دلوقتي`, `${live.length} reading now`)}</span>` : ''}</small></div>`;
    }
    return `<section class="card wcard">
      <header class="wc-head" data-go="book-${esc(b.id)}">${V.cover(b, 'sm')}<div><small class="eyebrow">${L('بنقرأ دلوقتي', 'Reading now')}</small><h2 dir="auto">${esc(b.title)}</h2>${b.author ? `<span class="muted" dir="auto">${esc(b.author)}</span>` : ''}</div>${icon('fwd', 'flip go')}</header>
      ${body}
    </section>`;
  }

  V.actions.who = (a) => {
    const uid = a.dataset.uid;
    const items = [{ ic: 'user', t: L(`ملف ${esc(D.name(uid))}`, `${esc(D.name(uid))}'s profile`), fn: () => V.go('me', { uid }) }];
    if (uid !== S.me && D.canWrite()) {
      items.unshift({ ic: 'clap', t: L('ابعت تشجيع 👏', 'Send a cheer 👏'), fn: () => V.poke(uid, 'cheer', { b: a.dataset.b, wid: a.dataset.w }) });
      const p = D.prog(a.dataset.b, uid);
      if (!(p && p.done && p.done[a.dataset.w])) items.splice(1, 0, { ic: 'hand', t: L('ابعت تذكير بالورد 👋', 'Send a reminder 👋'), fn: () => V.poke(uid, 'poke', { b: a.dataset.b, wid: a.dataset.w }) });
    }
    V.menu(items);
  };
  V.actions['finish-book'] = (a) => V.finishBook(a.dataset.b);

  function pokesBlock() {
    const ps = V.myPokes().slice(0, 4);
    if (!ps.length) return '';
    return `<section class="pokes">${ps
      .map((p) => {
        const b = S.books.get(p.b);
        const w = b && p.wid ? G.wirds(b).find((x) => x.id === p.wid) : null;
        const txt =
          p.kind === 'cheer'
            ? L(`تشجيع من ${esc(D.name(p.from))} 👏`, `${esc(D.name(p.from))} is cheering you on 👏`)
            : L(`تذكير من ${esc(D.name(p.from))} ${w ? `بالورد ${L.num(w.n)}` : 'بالقراية'} 👋`, `${esc(D.name(p.from))} nudged you${w ? ` about portion ${w.n}` : ''} 👋`);
        return `<div class="poke ${p.kind}">${D.avatar(p.from, 'sm')}<span>${txt}<small>${L.ago(p.at)}</small></span>
          ${p.kind === 'poke' && b ? `<button class="btn sm" data-act="read" data-b="${esc(b.id)}">${L('اقرأ', 'Read')}</button>` : D.canWrite() ? `<button class="btn sm ghost" data-act="poke" data-to="${esc(p.from)}" data-kind="cheer">${L('رد التشجيع', 'Cheer back')}</button>` : ''}
          <button class="ib sm" data-act="dismiss-poke" data-id="${esc(p.id)}" aria-label="${L('إخفاء', 'Dismiss')}">${icon('close')}</button></div>`;
      })
      .join('')}</section>`;
  }

  function questsBlock() {
    const q = G.myQuests();
    const n = q.filter((x) => x.done).length;
    const all = n === q.length;
    const opened = U.store.get('chest:' + S.me, '') === U.today();
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const hrs = Math.max(1, Math.ceil((mid - now) / 36e5));
    return `<section class="card quests${all ? ' complete' : ''}">
      <header><h3>${L('مهام النهارده', "Today's quests")}</h3><span class="muted sm">${L(`بتتجدد بعد ${L.count(hrs, 'hour')}`, `Resets in ${L.count(hrs, 'hour')}`)}</span></header>
      <ul class="qlist">${q
        .map(
          (x) => `<li class="${x.done ? 'done' : ''}"><span class="q-ic">${icon(x.done ? 'check' : x.ic)}</span><div><span>${G.questText(x)}</span>${V.bar(x.have / x.need, x.done ? 'jade' : 'gold')}</div><small>${L.num(Math.min(x.have, x.need))}/${L.num(x.need)}</small></li>`
        )
        .join('')}</ul>
      <button class="chest${all ? ' ready' : ''}${opened ? ' opened' : ''}" data-act="chest" ${all && !opened ? '' : 'disabled'} aria-label="${L('صندوق المكافأة', 'Reward chest')}">
        <span class="chest-ic">${icon('chest')}</span>
        <span>${opened ? L(`اتفتح النهارده · +${L.num(G.XP.quests)} XP`, `Opened today · +${G.XP.quests} XP`) : all ? L('افتح الصندوق!', 'Open the chest!') : L(`خلّص التلاتة وافتح الصندوق (+${L.num(G.XP.quests)} XP)`, `Finish all three to open the chest (+${G.XP.quests} XP)`)}</span>
      </button>
    </section>`;
  }

  V.actions.chest = () => {
    U.store.set('chest:' + S.me, U.today());
    const w = WISDOM[U.hash(S.me + U.today()) % WISDOM.length];
    U.confetti(1);
    U.chime('big');
    V.sheet({
      title: L('صندوق النهارده', "Today's chest"),
      cls: 'celebrate',
      html: `<div class="celeb"><div class="chest-open">${icon('chest')}</div>
        <div class="xp-lines"><span class="gold-t">${L('مهام اليوم', 'Daily quests')} <b>+${L.num(G.XP.quests)} XP</b></span></div>
        <blockquote class="wisdom"><p dir="auto">${esc(L(w[0], w[2]))}</p><cite>${esc(L(w[1], w[3]))}</cite></blockquote>
        <button class="btn gold" data-close autofocus>${L('حلو!', 'Nice!')}</button></div>`,
    });
    V.render();
  };

  function liveBlock() {
    const live = D.readingNow();
    if (!live.length) return '';
    return `<section class="card live">
      <h3><span class="pulse"></span>${L('بيقرأوا دلوقتي', 'Reading right now')}</h3>
      <div class="live-list">${live
        .map((x) => {
          const b = S.books.get(x.b);
          return `<button class="live-it" data-act="read" data-b="${esc(x.b)}" ${x.p ? `data-p="${x.p}"` : ''}>${D.avatar(x.uid, 'sm')}<span><b>${esc(D.name(x.uid))}</b><small dir="auto">${b ? esc(b.title) : ''}${x.p ? ` · ${L('ص', 'p.')} ${L.num(x.p)}` : ''}</small></span><span class="join">${L('انضم', 'Join in')}</span></button>`;
        })
        .join('')}</div>
    </section>`;
  }

  function groupBlock() {
    const { pages, goal } = G.groupWeek();
    const board = G.board('week').slice(0, 5);
    const medal = ['gold', 'silver', 'bronze'];
    return `<section class="card group">
      <h3>${L('هدف الحلقة الأسبوع ده', "This week's circle goal")}</h3>
      <div class="goal">${V.ring(pages / goal, `<b>${L.num(Math.round(Math.min(1, pages / goal) * 100))}${L.isAr() ? '٪' : '%'}</b>`, pages >= goal ? 'jade' : 'lapis', 76)}<div><b>${L(`${L.num(pages)} من ${L.count(goal, 'page')}`, `${pages} of ${goal} pages`)}</b><p class="muted sm">${pages >= goal ? L('الحلقة كسرت الهدف! 🎉', 'The circle smashed the goal! 🎉') : L('كل صفحة بتقراها بتقرّبنا كلنا', 'Every page you read moves everyone closer')}</p></div></div>
      <h4>${L('الصدارة الأسبوع ده', 'Leaders this week')}</h4>
      <ol class="mini-board">${board
        .map(
          (s, i) => `<li class="${s.uid === S.me ? 'me' : ''}" data-act="member" data-uid="${esc(s.uid)}"><span class="rank ${medal[i] || ''}">${L.num(i + 1)}</span>${D.avatar(s.uid, 'sm')}<b>${esc(D.name(s.uid))}</b><span class="xp">${L.num(s.week)} XP</span></li>`
        )
        .join('')}</ol>
      <button class="btn ghost sm full" data-go="circle">${L('شوف الحلقة', 'Open the circle')}</button>
    </section>`;
  }

  function feedBlock() {
    const items = [];
    for (const n of S.notes.values()) items.push({ t: n.at, kind: 'note', n });
    for (const p of S.prog.values()) {
      const b = S.books.get(p.b);
      if (!b) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        const w = G.wirds(b).find((x) => x.id === wid);
        if (w && t) items.push({ t, kind: 'wird', u: p.u, b, w });
      }
      if (p.finished) items.push({ t: p.finished, kind: 'book', u: p.u, b });
    }
    for (const sh of S.shelf.values()) {
      const groups = new Map();
      for (const it of Object.values(sh.items || {})) {
        if (!it || it.status !== 'read' || it.together || !it.at) continue;
        const k = String(it.at).slice(0, 13);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }
      for (const list of groups.values()) items.push({ t: list[0].at, kind: 'shelf', u: sh.id, list });
    }
    for (const b of S.books.values()) if (b.addedAt) items.push({ t: b.addedAt, kind: 'newbook', u: b.addedBy, b });
    items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    const top = items.slice(0, 14);
    if (!top.length) return '';
    return `<section class="feed"><h3>${L('آخر الأخبار في الحلقة', 'Latest in the circle')}</h3>${top.map(feedItem).join('')}</section>`;
  }

  function feedItem(x) {
    if (x.kind === 'note') return V.noteCard(x.n, { showBook: true });
    let txt = '', ic = 'sparkle', cls = '';
    if (x.kind === 'wird') {
      const first = G.firstFinisher(x.b.id, x.w.id) === x.u;
      txt = L(`· الورد ${L.num(x.w.n)} من «${esc(x.b.title)}» خلص ✓${first ? ' — أول من خلّصه!' : ''}`, `finished portion ${x.w.n} of “${esc(x.b.title)}”${first ? ' — first!' : ''}`);
      ic = 'check';
      cls = first ? 'gold' : 'jade';
    } else if (x.kind === 'book') {
      txt = L(`· كتاب «${esc(x.b.title)}» خلص 🏆`, `finished “${esc(x.b.title)}” 🏆`);
      ic = 'trophy';
      cls = 'gold';
    } else if (x.kind === 'shelf') {
      const names = x.list.slice(0, 3).map((it) => `«${esc(it.title)}»`).join(L('، ', ', '));
      const more = x.list.length - 3;
      txt = x.list.length === 1
        ? L(`· كتاب جديد في المكتبة: ${names}`, `added ${names} to their shelf`) + (x.list[0].rating ? ' ' + V.stars(x.list[0].rating) : '')
        : L(`· ${L.count(x.list.length, 'book')} جداد في المكتبة: ${names}${more > 0 ? ` و${L.num(more)} كمان` : ''}`, `added ${x.list.length} books to their shelf: ${names}${more > 0 ? ` and ${more} more` : ''}`);
      ic = 'shelf';
    } else if (x.kind === 'newbook') {
      txt = L(`· كتاب جديد للحلقة: «${esc(x.b.title)}»`, `added a new book: “${esc(x.b.title)}”`);
      ic = 'books';
      cls = 'lapis';
    }
    const canCheer = x.u && x.u !== S.me && D.canWrite() && (x.kind === 'wird' || x.kind === 'book');
    return `<div class="ev ${cls}"><span class="ev-ic">${icon(ic)}</span>${D.avatar(x.u, 'sm')}<p><b data-act="member" data-uid="${esc(x.u || '')}">${esc(D.name(x.u))}</b> <span dir="auto">${txt}</span><small>${L.ago(x.t)}</small></p>${canCheer ? `<button class="pill" data-act="poke" data-to="${esc(x.u)}" data-kind="cheer" data-b="${esc(x.b.id)}" ${x.w ? `data-w="${esc(x.w.id)}"` : ''}>${icon('clap')}</button>` : ''}</div>`;
  }

  /* ---------- onboarding ---------- */
  const EMOJI = ['📚', '🦉', '🌙', '🌿', '☕', '🐢', '🦊', '⭐'];
  V.screens.onboard = () => {
    const pname = (S.meInfo && S.meInfo.name) || '';
    const canJoin = D.canWrite();
    const circle = S.circle && S.circle.name;
    const n = S.members.size;
    return `<div class="onboard">
      <div class="ob-art" aria-hidden="true"><span class="star8 gold big"></span><span class="star8 lapis"></span><span class="star8 jade sm"></span><span class="star8 rubric xs"></span></div>
      <div class="ob-card">
        <small class="eyebrow">${circle ? esc(circle) : L('حلقة قراءة', 'A reading circle')}${n ? ' · ' + L.count(n, 'member') : ''}</small>
        <h1>${L('نقرأ سوا', 'Read Together')}</h1>
        <p class="lead">${L('كتاب واحد، أوراد متقسمة، تعليقات على الصفحات، ونقاش مع أصحابك وعيلتك. وكل صفحة بتقراها بتكسبك XP.', 'One book, daily portions, notes in the margins and conversations with friends and family. Every page you read earns XP.')}</p>
        <ul class="ob-feats">
          <li>${icon('books')}<span>${L('اقرأ الـPDF جوه البرنامج من أي جهاز', 'Read the PDF right here on any device')}</span></li>
          <li>${icon('hl')}<span>${L('ظلّل وعلّق وشوف تعليقات أصحابك على نفس الصفحة', "Highlight, comment and see friends' notes on the same page")}</span></li>
          <li>${icon('flame')}<span>${L('حافظ على سلسلتك، خلّص مهام اليوم، واطلع في الصدارة', 'Keep your streak, finish daily quests, climb the board')}</span></li>
        </ul>
        ${canJoin
          ? `<form id="join-form" class="ob-form">
          <label for="join-name">${L('اسمك اللي أصحابك هيشوفوه', 'The name your friends will see')}</label>
          <input id="join-name" maxlength="40" required autocomplete="nickname" dir="auto" value="${esc(pname)}" placeholder="${L('مثلا: محمود', 'e.g. Sam')}">
          <span class="lbl">${L('اختار علامة (اختياري)', 'Pick a mark (optional)')}</span>
          <div class="emo" role="radiogroup">${EMOJI.map((e) => `<button type="button" class="emo-b" data-emo="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
          <button class="btn gold big full" type="submit">${L('انضم للحلقة', 'Join the circle')}</button>
        </form>`
          : `<div class="ro-note">${icon('eye')}<p>${L('مش قادر تكتب في الحلقة دي دلوقتي. اطلب لينك دعوة جديد من صاحب الحلقة.', 'You cannot write in this circle right now. Ask the owner for a new invite link.')}</p><button class="btn ghost" data-act="view-only">${L('اتفرّج بس', 'Just look around')}</button></div>`}
      </div>
    </div>`;
  };
  let pickedEmoji = '';
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.emo-b');
    if (!b) return;
    pickedEmoji = pickedEmoji === b.dataset.emo ? '' : b.dataset.emo;
    document.querySelectorAll('.emo-b').forEach((x) => x.classList.toggle('on', x.dataset.emo === pickedEmoji));
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'join-form') return;
    e.preventDefault();
    const name = e.target.querySelector('#join-name').value.trim();
    if (!name) return;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await D.join(name, pickedEmoji);
      U.confetti(1);
      U.chime('big');
      document.getElementById('app').innerHTML = '';
      V.go('home');
    } catch (err) {
      btn.disabled = false;
    }
  });
  V.actions['view-only'] = () => {
    V.viewOnly = true;
    document.getElementById('app').innerHTML = '';
    V.render(true);
  };

  V.screens.nodb = () => `<div class="onboard"><div class="ob-art" aria-hidden="true"><span class="star8 gold big"></span><span class="star8 lapis"></span></div>
    <div class="ob-card"><h1>${L('نقرأ سوا', 'Read Together')}</h1>
    <p class="lead">${L('التطبيق لسه مش متوصّل بالسيرفر. صاحب التطبيق محتاج يكمّل الإعداد (Supabase) في ملف config.js.', 'The app is not connected to its server yet. The owner needs to finish the Supabase setup in config.js.')}</p></div></div>`;
})();
