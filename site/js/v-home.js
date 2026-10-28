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

  /* «اليوم»: one phone screen — today's portion, who is where in it, and a swipeable row of small cards.
     The circle's news, notes and leaderboard live in the «الحلقة» tab. */
  V.screens.home = () => {
    const reading = [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading').sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    // The main book: the one whose next portion of mine is due first.
    let primary = null;
    let best = '';
    for (const b of reading) {
      const w = G.myCurrent(b);
      const due = w ? w.due : '9999';
      if (!primary || due < best) {
        primary = b;
        best = due;
      }
    }
    const others = reading.filter((b) => b !== primary);
    return `<div class="home">
      <div class="home-main">
        ${A.Upd ? A.Upd.banner() : ''}
        ${pokesBlock()}
        ${primary ? heroCard(primary) : noBooks()}
        ${primary ? raceCard(primary) : ''}
        ${others.length ? otherBooks(others) : ''}
      </div>
      <div class="home-side">
        ${V.startChecklist ? V.startChecklist() : ''}
        ${D.canWrite() ? homeCards() : ''}
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

  /* Seconds per page for this reader (from their own reading time), for "about N minutes" hints. */
  function secsPerPage() {
    const s = G.of(S.me);
    return s.pages >= 10 && s.secs > 0 ? U.clamp(s.secs / s.pages, 20, 240) : 75;
  }

  function heroCard(b) {
    const ws = G.wirds(b);
    const prog = D.prog(b.id);
    const w = G.myCurrent(b);
    const last = (prog && prog.last) || 1;
    const pct = Math.round(Math.min(1, U.rangesCountIn(prog && prog.seen, 1, b.pages || 1) / (b.pages || 1)) * 100);
    const head = (lines) => `<div class="hero-top">
        <button class="hero-cover" data-go="book-${esc(b.id)}" aria-label="${L('صفحة الكتاب', 'Book page')}">${V.cover(b, 'hero')}</button>
        <div class="hero-info">
          <span class="tag">${L('بنقراه سوا', 'Reading together')}${pct ? ` • ${L.num(pct)}${L.isAr() ? '٪' : '%'}` : ''}</span>
          <h2 class="book-t" dir="auto"><button data-go="book-${esc(b.id)}">${esc(b.title)}</button></h2>
          ${lines}
        </div>
      </div>`;
    if (!ws.length) {
      return `<section class="card wcard hero">${head(`${b.author ? `<p class="muted" dir="auto">${esc(b.author)}</p>` : ''}<p class="hi-sub">${L('لسه مفيش خطة. قسّموه أوراد عشان كل واحد يعرف هيقرأ إيه وإمتى.', 'No plan yet. Split it into portions so everyone knows what to read and when.')}</p>`)}
        <div class="hero-acts">${D.canWrite() ? `<button class="btn gold big" data-act="plan" data-b="${esc(b.id)}">${icon('calendar')}${L('اعمل خطة', 'Make a plan')}</button>` : ''}<button class="btn big${D.canWrite() ? ' ghost' : ''}" data-act="read" data-b="${esc(b.id)}">${icon('play', 'flip-rtl')}${last > 1 ? L(`كمّل من ص ${L.num(last)}`, `Continue from p. ${last}`) : L('ابدأ القراية', 'Start reading')}</button></div>
      </section>`;
    }
    if (!w) {
      const fin = prog && prog.finished;
      return `<section class="card wcard hero">${head(`<p class="hi-w">${L('خلّصت كل الأوراد!', 'All portions done!')}</p><p class="hi-sub">${fin ? L('وخلّصت الكتاب كمان. شجّع الباقيين 👏', 'And you finished the book. Cheer the others on 👏') : L('فاضل تعلّم إنك خلّصت الكتاب', 'Mark the book as finished')}</p>`)}
        ${pathStrip(b, ws, null)}
        <div class="hero-acts">${!fin && D.canWrite() ? `<button class="btn gold big" data-act="finish-book" data-b="${esc(b.id)}">${icon('trophy')}${L('خلّصت الكتاب', 'I finished the book')}</button>` : ''}<button class="btn ghost big" data-go="book-${esc(b.id)}">${L('صفحة الكتاب', 'Book page')}</button></div>
      </section>`;
    }
    const total = w.to - w.from + 1;
    const seen = U.rangesCountIn(prog && prog.seen, w.from, w.to);
    const left = Math.max(0, total - seen);
    const startAt = last >= w.from && last <= w.to ? last : w.from;
    const st = G.wirdStatus(b, w);
    const bh = G.behind(b);
    const behind = bh.late.length > 0;
    const mins = Math.max(1, Math.round(((behind ? bh.pages : left) * secsPerPage()) / 60));
    const sub = behind
      ? L(`فاضل ${L.count(bh.pages, 'page')} عشان تلحق الحلقة • حوالي ${L.duration(mins * 60)}`, `${bh.pages} pages to catch up • about ${L.duration(mins * 60)}`)
      : left
        ? L(`فاضل ${L.count(left, 'page')} • حوالي ${L.count(mins, 'minute')}`, `${left} pages left • about ${mins} min`)
        : L('قريت صفحاته كلها — علّم إنك خلّصته', 'You read every page — mark it done');
    const ready = bh.readyToMark;
    const catchRow = behind
      ? `<div class="catchup">
          ${ready.length > 1
            ? `<button class="btn jade sm" data-act="mark-wirds" data-b="${esc(b.id)}" data-ws="${esc(ready.map((x) => x.id).join(','))}">${icon('check')}${L(`علّم الأوراد ${L.num(ready[0].n)}–${L.num(ready[ready.length - 1].n)} خلصوا`, `Mark portions ${ready[0].n}–${ready[ready.length - 1].n} done`)}</button>`
            : `<span>${icon('bolt')}${L(`عشان تلحق في ٣ أيام: ~${L.count(G.catchUpPerDay(b, 3), 'page')} في اليوم`, `To catch up in 3 days: ~${G.catchUpPerDay(b, 3)} pages a day`)}</span>`}
          <button class="lnk" data-act="catch-up" data-b="${esc(b.id)}">${L('خطة اللحاق', 'Catch-up plan')}</button>
        </div>`
      : '';
    return `<section class="card wcard hero${behind ? ' behind' : ''}">
      ${head(`${behind ? `<span class="tag late">${L(`متأخر ${L.count(bh.late.length, 'wird')}`, `${bh.late.length} portion${bh.late.length > 1 ? 's' : ''} behind`)}</span>` : ''}<p class="hi-w">${L(`الورد ${L.num(w.n)} • ص ${L.num(w.from)}–${L.num(w.to)}`, `Portion ${w.n} • p. ${w.from}–${w.to}`)}</p>
        <p class="hi-sub">${sub}</p>
        <p class="due ${st}">${L.due(w.due)}</p>`)}
      ${catchRow}
      ${pathStrip(b, ws, w)}
      <div class="hero-acts">
        <button class="btn big cta" data-act="read" data-b="${esc(b.id)}" data-p="${startAt}">${startAt > w.from ? L(`كمّل من ص ${L.num(startAt)}`, `Continue from p. ${startAt}`) : L('يلا نقرأ', 'Start reading')}${icon('play', 'flip-rtl')}</button>
        ${D.canWrite() ? `<button class="btn jade big" data-act="mark-wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}" aria-label="${L('خلّصته', 'Done')}">${icon('check')}<span>${L('خلّصته', 'Done')}</span></button>` : ''}
      </div>
    </section>`;
  }

  /* A short path of portions around the current one: done ✓, today ★, the rest numbered, the last one a trophy. */
  function pathStrip(b, ws, w) {
    if (ws.length < 2) return '';
    const ci = w ? ws.indexOf(w) : ws.length - 1;
    const n = Math.min(7, ws.length);
    let from = Math.max(0, Math.min(ci - 2, ws.length - n));
    const slice = ws.slice(from, from + n);
    let doneN = 0;
    const nodes = slice
      .map((x) => {
        const st = G.wirdStatus(b, x);
        const done = st === 'done' || st === 'late-done';
        if (done) doneN++;
        const cur = w && x.id === w.id;
        const lastOne = x === ws[ws.length - 1];
        const cls = done ? 'done' : cur ? 'cur' : st === 'late' ? 'late' : '';
        const inner = done ? icon('check') : cur ? '<span class="star8 xs"></span>' : lastOne ? icon('trophy') : L.num(x.n);
        return `<span class="wp-n ${cls}" title="${L(`الورد ${L.num(x.n)}`, `Portion ${x.n}`)}">${inner}</span>`;
      })
      .join('');
    const fill = slice.length > 1 ? Math.min(1, Math.max(0, (doneN - 0.5) / (slice.length - 1))) : 0;
    return `<button class="wpath" data-go="book-${esc(b.id)}" aria-label="${L(`الأوراد: ${L.num(G.wirds(b).filter((x) => /done/.test(G.wirdStatus(b, x))).length)} من ${L.num(ws.length)} خلصوا`, `Portions: ${ws.filter((x) => /done/.test(G.wirdStatus(b, x))).length} of ${ws.length} done`)}">
      <i class="wp-line"><i style="width:${Math.round(fill * 100)}%"></i></i>${nodes}</button>`;
  }

  /* Where everyone is inside the current portion: a track from its first page to its last. */
  function raceCard(b) {
    const mine = G.myCurrent(b);
    const grp = G.groupCurrent(b);
    const iAmBehind = !!(mine && grp && mine.n < grp.n);
    const w = iAmBehind ? grp : mine || grp;
    if (!w) return '';
    const members = D.memberIds();
    if (members.length < 2) {
      return `<section class="card race solo">${icon('users')}<div><b>${L('القراية أحلى مع حد', 'Reading is better together')}</b><p class="muted sm">${L('ادعُ أصحابك أو عيلتك، وشوفوا مين وصل فين في الورد.', 'Invite friends or family and see who is where in each portion.')}</p></div><button class="btn sm gold" data-act="invite">${icon('share')}${L('ادعُ', 'Invite')}</button></section>`;
    }
    const total = w.to - w.from + 1;
    const live = new Map(D.readingNow(b.id).map((x) => [x.uid, x.p]));
    const rows = members.map((uid) => {
      const p = D.prog(b.id, uid);
      const done = !!(p && p.done && p.done[w.id]);
      const at = live.has(uid) ? live.get(uid) : (p && p.last) || 0;
      const f = done ? 1 : at < w.from ? 0 : U.clamp((at - w.from + 1) / total, 0, 0.94);
      return { uid, done, at, f, live: live.has(uid), t: done ? p.done[w.id] : '' };
    });
    rows.sort((a, b2) => a.f - b2.f);
    // People at (nearly) the same page fan out sideways instead of covering each other.
    let groupF = -1, k = 0;
    for (const r of rows) {
      if (r.f - groupF < 0.08) k++;
      else {
        groupF = r.f;
        k = 0;
      }
      r.shift = k * 22;
    }
    const me = rows.find((r) => r.uid === S.me);
    const doneRows = rows.filter((r) => r.done).sort((a, b2) => String(a.t).localeCompare(String(b2.t)));
    const first = doneRows[0];
    const liveOther = rows.find((r) => r.live && r.uid !== S.me);
    let action = '';
    if (D.canWrite() && first && first.uid !== S.me)
      action = `<button class="pill gold" data-act="poke" data-to="${esc(first.uid)}" data-kind="cheer" data-b="${esc(b.id)}" data-w="${esc(w.id)}">${icon('clap')}${L(`شجّع ${esc(D.name(first.uid))}`, `Cheer ${esc(D.name(first.uid))}`)}</button>`;
    else if (liveOther) action = `<button class="pill jade" data-act="read" data-b="${esc(b.id)}" ${liveOther.at ? `data-p="${liveOther.at}"` : ''}><span class="pulse"></span>${L(`اقرا مع ${esc(D.name(liveOther.uid))}`, `Read with ${esc(D.name(liveOther.uid))}`)}</button>`;
    const avs = rows
      .slice(0, 14)
      .map((r) => `<button class="rc-av${r.uid === S.me ? ' me' : ''}${r.live ? ' live' : ''}${r.done ? ' done' : ''}" style="inset-inline-start:clamp(0px, calc(${(r.f * 100).toFixed(1)}% - 17px + ${r.shift}px), calc(100% - 34px));top:4px" data-act="who" data-uid="${esc(r.uid)}" data-b="${esc(b.id)}" data-w="${esc(w.id)}" title="${esc(D.name(r.uid))} • ${r.done ? L('خلص', 'done') : r.at >= w.from ? `${L('ص', 'p.')} ${L.num(r.at)}` : L('لسه', 'not yet')}">${D.avatar(r.uid, 'sm')}</button>`)
      .join('');
    return `<section class="card race">
      <header><h3>${L(`مين وصل فين في الورد ${L.num(w.n)}`, `Who is where in portion ${w.n}`)}</h3>${action}</header>
      <div class="rc-track"><i class="rc-line"><i style="width:${me ? Math.round(me.f * 100) : 0}%"></i></i>${avs}</div>
      <div class="rc-labels"><span>${L('ص', 'p.')} ${L.num(w.from)}</span><span>${L(`${L.num(doneRows.length)} من ${L.num(members.length)} خلّصوا`, `${doneRows.length} of ${members.length} done`)}</span><span>${icon('flag')}${L('ص', 'p.')} ${L.num(w.to)}</span></div>
      ${iAmBehind ? `<p class="rc-behind">${L(`الحلقة في الورد ${L.num(grp.n)} وإنت لسه في الورد ${L.num(mine.n)} — شد حيلك وهتلحقهم`, `The circle is on portion ${grp.n}, you're on ${mine.n} — you can catch up`)}</p>` : ''}
    </section>`;
  }

  function otherBooks(list) {
    return `<section class="obooks"><h3>${L('كتب تانية بنقراها', 'Also reading')}</h3>${list
      .map((b) => {
        const w = G.myCurrent(b);
        const st = w ? G.wirdStatus(b, w) : '';
        return `<button class="obook" data-go="book-${esc(b.id)}">${V.cover(b, 'xs')}<span><b dir="auto">${esc(b.title)}</b><small>${w ? `${L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`)} • <span class="due ${st}">${L.due(w.due)}</span>` : G.wirds(b).length ? L('كل الأوراد خلصت', 'All portions done') : L('من غير خطة', 'No plan yet')}</small></span>${icon('fwd', 'flip')}</button>`;
      })
      .join('')}</section>`;
  }

  /* Small cards: today's quests, this week's reading days, the circle's weekly challenge. */
  function homeCards() {
    const q = G.myQuests();
    const nDone = q.filter((x) => x.done).length;
    const next = q.find((x) => !x.done);
    const opened = U.store.get('chest:' + S.me, '') === U.today();
    const chestReady = !next && !opened;
    const s = G.of(S.me);
    const ws = U.weekStart();
    const today = U.today();
    const DAYS = L.isAr() ? ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'] : ['S', 'S', 'M', 'T', 'W', 'T', 'F'];
    let readDays = 0;
    const days = DAYS.map((d, i) => {
      const k = U.addDays(ws, i);
      const on = s.active.has(k);
      if (on && k <= today) readDays++;
      const cls = on ? 'on' : k === today ? 'today' : k > today ? 'later' : 'miss';
      return `<li class="${cls}${k === today ? ' is-today' : ''}"><span>${d}</span><i></i></li>`;
    }).join('');
    const { pages, goal } = G.groupWeek();
    const daysLeft = Math.max(1, U.diffDays(today, U.addDays(ws, 6)) + 1);
    return `<div class="hcards" aria-label="${L('مهام وتحديات', 'Quests and challenges')}">
      <button class="hcard quest${chestReady ? ' ready' : ''}" data-act="${chestReady ? 'chest' : 'quests'}">
        <span class="hc-h"><span class="hc-ic">${icon(chestReady ? 'chest' : 'target')}</span><b>${L('مهام اليوم', "Today's quests")}</b><small>${L.num(nDone)}/${L.num(q.length)}</small></span>
        <span class="hc-t">${next ? G.questText(next) : opened ? L('خلّصت مهام النهارده ✓', 'All done for today ✓') : L('افتح الصندوق!', 'Open the chest!')}</span>
        ${V.bar(next ? next.have / next.need : 1, next ? 'gold' : 'jade')}
        <small>${next ? `${L.num(Math.min(next.have, next.need))} / ${L.num(next.need)}` : ''}${!opened ? ` • ${L('الصندوق', 'Chest')} +${L.num(G.XP.quests)} XP` : ''}</small>
      </button>
      <button class="hcard week" data-go="me">
        <span class="hc-h"><b>${L('الأسبوع ده', 'This week')}</b><small>${L.num(readDays)}/${L.num(7)}</small></span>
        <span class="hc-t">${s.streak ? L(`${L.count(s.streak, 'day')} ورا بعض`, `${s.streak}-day streak`) : L('ابدأ سلسلة النهارده', 'Start a streak today')}</span>
        <ol class="wk">${days}</ol>
      </button>
      <button class="hcard goal" data-go="circle">
        <span class="hc-h"><b>${L('تحدي الحلقة', 'Circle challenge')}</b></span>
        <span class="hc-t">${L(`${L.num(pages)} من ${L.count(goal, 'page')}`, `${pages} of ${goal} pages`)}</span>
        ${V.bar(pages / goal, pages >= goal ? 'jade' : 'gold')}
        <small>${pages >= goal ? L('الحلقة كسرت الهدف!', 'The circle hit the goal!') : L(`فاضل ${L.count(daysLeft, 'day')}`, `${daysLeft} days left`)}</small>
      </button>
    </div>`;
  }
  V.actions['mark-wirds'] = (a) => V.markWirds(a.dataset.b, a.dataset.ws.split(',').filter(Boolean));

  /* Catch-up plan: pages a day for a few choices of days, read the late portions in order, or mark the ones read elsewhere. */
  V.actions['catch-up'] = (a) => {
    const b = S.books.get(a.dataset.b);
    if (!b) return;
    const bh = G.behind(b);
    if (!bh.late.length) return;
    // Longer options only while they still lighten the load (stop once a day is already easy).
    const opts = [];
    for (const d of [2, 3, 5, 7, 14]) {
      const n = G.catchUpPerDay(b, d);
      opts.push({ d, n });
      if (n <= 12 && opts.length >= 2) break;
    }
    const first = bh.late[0];
    const prog = D.prog(b.id);
    const last = (prog && prog.last) || 0;
    const startAt = last >= first.from && last < first.to ? last : first.from;
    V.sheet({
      title: L('خطة اللحاق', 'Catch-up plan'),
      html: `<div class="cu">
        <p>${L(`إنت متأخر ${L.count(bh.late.length, 'wird')} (${L.count(bh.pages, 'page')})${bh.group ? ` والحلقة دلوقتي في الورد ${L.num(bh.group.n)}` : ''}. اختار هتلحق في قد إيه:`, `You are ${bh.late.length} portion${bh.late.length > 1 ? 's' : ''} (${bh.pages} pages) behind${bh.group ? ` and the circle is on portion ${bh.group.n}` : ''}. Pick how fast to catch up:`)}</p>
        <ul class="cu-opts">${opts.map((o) => `<li><b>${o.d === 7 ? L('أسبوع', 'A week') : o.d === 14 ? L('أسبوعين', 'Two weeks') : L.count(o.d, 'day')}</b><span>${L(`~${L.count(o.n, 'page')} في اليوم`, `~${o.n} pages a day`)}</span></li>`).join('')}</ul>
        <p class="muted sm">${L('ده بيحسب الصفحات اللي فاتتك + الأوراد الجاية في نفس المدة. اقرأ الأوراد بالترتيب، وكل ما تخلّص واحد علّمه.', 'This counts the pages you missed plus the portions due in that time. Read the portions in order and mark each one done.')}</p>
        <div class="row-btns"><button class="btn big" data-act="read" data-b="${esc(b.id)}" data-p="${startAt}" data-close>${icon('play', 'flip-rtl')}${L(`ابدأ من الورد ${L.num(first.n)}`, `Start with portion ${first.n}`)}</button></div>
        <details class="cu-mark"><summary>${L('قريتهم برّه البرنامج؟ علّمهم خلصوا', 'Read them elsewhere? Mark them done')}</summary>
          <form id="cu-form">${bh.late.map((w) => `<label class="check"><input type="checkbox" value="${esc(w.id)}" ${bh.readyToMark.includes(w) ? 'checked' : ''}><span>${L(`الورد ${L.num(w.n)} • ص ${L.num(w.from)}–${L.num(w.to)}`, `Portion ${w.n} • p. ${w.from}–${w.to}`)}</span></label>`).join('')}
          <button class="btn jade full">${icon('check')}${L('علّم اللي اخترته', 'Mark selected')}</button></form>
        </details></div>`,
      onMount: (body, api) =>
        body.addEventListener('submit', (e) => {
          e.preventDefault();
          const ids = [...body.querySelectorAll('#cu-form input:checked')].map((x) => x.value);
          if (!ids.length) return;
          api.close();
          V.markWirds(b.id, ids);
        }),
    });
  };

  V.actions.quests = () => V.sheet({ title: L('مهام النهارده', "Today's quests"), html: questsBlock(), onData: (body) => (body.innerHTML = questsBlock()) });

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
        <span>${opened ? L(`اتفتح النهارده • +${L.num(G.XP.quests)} XP`, `Opened today • +${G.XP.quests} XP`) : all ? L('افتح الصندوق!', 'Open the chest!') : L(`خلّص التلاتة وافتح الصندوق (+${L.num(G.XP.quests)} XP)`, `Finish all three to open the chest (+${G.XP.quests} XP)`)}</span>
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

  V.liveBlock = () => liveBlock();
  V.feedBlock = () => feedBlock();
  function liveBlock() {
    const live = D.readingNow();
    if (!live.length) return '';
    return `<section class="card live">
      <h3><span class="pulse"></span>${L('بيقرأوا دلوقتي', 'Reading right now')}</h3>
      <div class="live-list">${live
        .map((x) => {
          const b = S.books.get(x.b);
          return `<button class="live-it" data-act="read" data-b="${esc(x.b)}" ${x.p ? `data-p="${x.p}"` : ''}>${D.avatar(x.uid, 'sm')}<span><b>${esc(D.name(x.uid))}</b><small dir="auto">${b ? esc(b.title) : ''}${x.p ? ` • ${L('ص', 'p.')} ${L.num(x.p)}` : ''}</small></span><span class="join">${L('انضم', 'Join in')}</span></button>`;
        })
        .join('')}</div>
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
      txt = L(`• الورد ${L.num(x.w.n)} من «${esc(x.b.title)}» خلص ✓${first ? ' — أول من خلّصه!' : ''}`, `finished portion ${x.w.n} of “${esc(x.b.title)}”${first ? ' — first!' : ''}`);
      ic = 'check';
      cls = first ? 'gold' : 'jade';
    } else if (x.kind === 'book') {
      txt = L(`• كتاب «${esc(x.b.title)}» خلص 🏆`, `finished “${esc(x.b.title)}” 🏆`);
      ic = 'trophy';
      cls = 'gold';
    } else if (x.kind === 'shelf') {
      const names = x.list.slice(0, 3).map((it) => `«${esc(it.title)}»`).join(L('، ', ', '));
      const more = x.list.length - 3;
      txt = x.list.length === 1
        ? L(`• كتاب جديد في المكتبة: ${names}`, `added ${names} to their shelf`) + (x.list[0].rating ? ' ' + V.stars(x.list[0].rating) : '')
        : L(`• ${L.count(x.list.length, 'book')} جداد في المكتبة: ${names}${more > 0 ? ` و${L.num(more)} كمان` : ''}`, `added ${x.list.length} books to their shelf: ${names}${more > 0 ? ` and ${more} more` : ''}`);
      ic = 'shelf';
    } else if (x.kind === 'newbook') {
      txt = L(`• كتاب جديد للحلقة: «${esc(x.b.title)}»`, `added a new book: “${esc(x.b.title)}”`);
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
        <small class="eyebrow">${circle ? esc(circle) : L('حلقة قراءة', 'A reading circle')}${n ? ' • ' + L.count(n, 'member') : ''}</small>
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
