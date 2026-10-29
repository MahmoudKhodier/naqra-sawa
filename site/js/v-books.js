/* Our books: library, book page (plan / discussion / notes / people), uploads, reading plans, downloads, Claude. */
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
  const MAXPART = 19900000;
  // PDF "Author" values that are really the name of a computer or a default, not a writer.
  /* "Book name - Copy (2).pdf", "book_compressed.pdf", "نسخة من كتاب.pdf" → a readable title. */
  function cleanFileName(name) {
    let t = String(name || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+-\s+/g, ' - ');
    for (let i = 0; i < 4; i++) {
      const before = t;
      t = t
        .replace(/[\s-]*(\(\d+\)|\[\d+\])\s*$/, '')
        .replace(/[\s-]*\b(copy|compressed|optimi[sz]ed|reduced|final|ocr|edited|scan(ned)?)\b\s*$/i, '')
        .replace(/[\s-]*(نسخة|نسخه|مضغوط)\s*$/, '')
        .replace(/^(copy of|نسخة من|نسخه من)\s+/i, '')
        .trim();
      if (t === before) break;
    }
    t = t.replace(/(^|\s)-+(\s|$)/g, ' ').replace(/-{2,}/g, ' ').replace(/\s+/g, ' ').trim();
    return t || String(name || '').replace(/\.pdf$/i, '');
  }
  /* Arabic-insensitive comparison key: no spaces, punctuation, diacritics or hamza/taa-marbuta spelling differences. */
  const arNorm = (s) =>
    String(s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0649/g, '\u064A')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase();
  V._cleanFileName = cleanFileName;
  V._arNorm = arNorm;
  const JUNK_AUTHOR = /^(anonymous|unknown|user|admin(istrator)?|owner|author|default|test|guest|[\w.-]*-?pc|microsoft.*|adobe.*|\d+)$/i;

  const bookPct = (b, uid = S.me) => {
    const p = D.prog(b.id, uid);
    if (!p) return 0;
    if (p.finished) return 1;
    return U.rangesCount(p.seen) / (b.pages || 1);
  };

  /* ---------- library ---------- */
  V.screens.books = () => {
    const all = [...S.books.values()].sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    const by = (st) => all.filter((b) => (b.status || 'reading') === st);
    const sec = (title, list, empty, rows) =>
      `<section class="lib-sec"><h2>${title} <small class="muted">${L.num(list.length)}</small></h2>${list.length ? (rows ? `<div class="rcards">${list.map(rcard).join('')}</div>` : `<div class="tiles">${list.map(tile).join('')}</div>`) : `<p class="muted sm">${empty}</p>`}</section>`;
    return `<div class="books">
      <header class="page-head"><div><h1>${L('كتبنا', 'Our books')}</h1><p class="muted">${L('الكتب اللي الحلقة بتقرأها أو هتقرأها', 'What the circle is reading and will read')}</p></div>
        ${D.canWrite() ? `<button class="btn gold" data-act="add-book">${icon('upload')}${L('ضيف كتاب', 'Add a book')}</button>` : ''}</header>
      ${sec(L('بنقرأ دلوقتي', 'Reading now'), by('reading'), L('مفيش كتاب شغال دلوقتي.', 'Nothing in progress right now.'), true)}
      ${sec(L('الجاي', 'Up next'), by('planned'), L('ضيف كتاب واختار «بعدين».', 'Add a book and choose “Later”.'))}
      ${by('done').length ? sec(L('خلّصناها', 'Finished together'), by('done'), '') : ''}
      ${proposalsBlock()}
    </div>`;
  };

  /* A book being read: cover, title, my current portion and progress. */
  function rcard(b) {
    const pct = bookPct(b);
    const w = G.myCurrent(b);
    const ws = G.wirds(b);
    const st = w ? G.wirdStatus(b, w) : '';
    const readers = D.readingNow(b.id).length;
    return `<button class="rcard" data-go="book-${esc(b.id)}">
      ${V.cover(b, 'sm')}
      <span class="rc-b"><b class="t-title" dir="auto">${esc(b.title)}</b>${b.author ? `<small dir="auto">${esc(b.author)}</small>` : ''}
        <small class="rc-w">${ws.length ? (w ? `${L(`الورد ${L.num(w.n)} من ${L.num(ws.length)}`, `Portion ${w.n} of ${ws.length}`)} • <span class="due ${st}">${L.due(w.due)}</span>` : L('خلّصت الأوراد', 'All portions done')) : L('من غير خطة لسه', 'No plan yet')}</small>
        <span class="rc-p">${V.bar(pct, pct >= 1 ? 'jade' : 'lapis')}<small>${L.num(Math.round(pct * 100))}${L.isAr() ? '٪' : '%'}</small></span></span>
      ${readers ? `<span class="t-live"><span class="pulse"></span>${L.num(readers)}</span>` : ''}
    </button>`;
  }

  function tile(b) {
    const pct = bookPct(b);
    const w = G.myCurrent(b);
    const ws = G.wirds(b);
    const readers = D.readingNow(b.id).length;
    return `<button class="tile" data-go="book-${esc(b.id)}">
      ${V.cover(b, 'md')}
      <span class="t-title" dir="auto">${esc(b.title)}</span>
      ${b.author ? `<span class="t-auth" dir="auto">${esc(b.author)}</span>` : ''}
      <span class="t-meta">${V.bar(pct, pct >= 1 ? 'jade' : 'lapis')}<small>${ws.length ? (w ? L(`الورد ${L.num(w.n)}/${L.num(ws.length)}`, `Portion ${w.n}/${ws.length}`) : L('خلّصت الأوراد', 'All portions done')) : L.count(b.pages || 0, 'page')}</small></span>
      ${readers ? `<span class="t-live"><span class="pulse"></span>${L.num(readers)}</span>` : ''}
    </button>`;
  }

  /* ---------- proposals & votes for the next book ---------- */
  function proposalsBlock() {
    const list = [...S.proposals.values()].filter((p) => !p.chosen).sort((a, b) => votes(b) - votes(a) || String(a.at).localeCompare(String(b.at)));
    return `<section class="card props">
      <header><div><h2>${L('نقرأ إيه بعد كده؟', 'What should we read next?')}</h2><p class="muted sm">${L('اقترح كتاب وصوّتوا. الأعلى صوت بيكسب.', 'Suggest a book and vote. Most votes wins.')}</p></div>${D.canWrite() ? `<button class="btn ghost sm" data-act="propose">${icon('plus')}${L('اقترح', 'Suggest')}</button>` : ''}</header>
      ${list.length ? `<ul class="plist">${list.map((p, i) => {
        const mine = p.votes && p.votes[S.me];
        const n = votes(p);
        return `<li>${V.coverOf ? V.coverOf(p, 'xs') : V.genCover(p.title, p.author, 'xs')}<div class="pl-t"><b dir="auto">${esc(p.title)}</b><small>${p.author ? `<span dir="auto">${esc(p.author)}</span> • ` : ''}${L('اقتراح', 'by')} ${esc(D.name(p.by))}</small>${p.note ? `<p dir="auto">${esc(p.note)}</p>` : ''}</div>
          <div class="pl-v">${i === 0 && n ? `<span class="lead-tag">${L('في المقدمة', 'Leading')}</span>` : ''}<button class="vote${mine ? ' on' : ''}" data-act="vote" data-id="${esc(p.id)}" ${D.canWrite() ? '' : 'disabled'}>${icon('vote')}<b>${L.num(n)}</b></button>
          ${S.canEdit || p.by === S.me ? `<button class="ib sm" data-act="prop-menu" data-id="${esc(p.id)}" aria-label="${L('اختيارات', 'Options')}">${icon('more')}</button>` : ''}</div></li>`;
      }).join('')}</ul>` : `<p class="muted sm">${L('مفيش اقتراحات لسه. ممكن تقترح من مكتبتك كمان.', 'No suggestions yet. You can also suggest from your shelf.')}</p>`}
    </section>`;
  }
  const votes = (p) => Object.values(p.votes || {}).filter(Boolean).length;

  V.propose = (pre = {}) => {
    V.sheet({
      title: L('اقترح كتاب للحلقة', 'Suggest a book'),
      html: `${A.B ? A.B.box('pr-bs') : ''}<form id="prop-form" class="form">
        ${A.B ? A.B.coverField('pr-cover', pre.cover, pre.title) : ''}
        <label for="pr-title">${L('اسم الكتاب', 'Title')}</label><input id="pr-title" required maxlength="140" dir="auto" value="${esc(pre.title || '')}" autofocus>
        <label for="pr-author">${L('المؤلف', 'Author')}</label><input id="pr-author" maxlength="100" dir="auto" value="${esc(pre.author || '')}">
        <label for="pr-note">${L('ليه الكتاب ده؟', 'Why this book?')}</label><textarea id="pr-note" rows="3" maxlength="${U.MAX.suggest}" dir="auto"></textarea>
        <div class="row-btns end"><button class="btn gold">${icon('vote')}${L('اقترح', 'Suggest')}</button></div></form>`,
      onMount: (body, api) => {
        if (A.B) {
          A.B.bindCover(body, 'pr-cover', () => body.querySelector('#pr-title').value);
          A.B.bind(body, 'pr-bs', (b) => {
            body.querySelector('#pr-title').value = b.title;
            body.querySelector('#pr-author').value = b.author;
            if (b.cover) A.B.setCover(body, 'pr-cover', b.cover, b.title);
          });
        }
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = body.querySelector('#pr-title').value.trim();
          if (!title) return;
          const cover = A.B ? A.B.coverValue(body, 'pr-cover') : '';
          api.close();
          const id = D.newId();
          await D.set(`proposals/${id}`, { title, author: body.querySelector('#pr-author').value.trim(), cover, note: body.querySelector('#pr-note').value.trim(), by: S.me, at: U.nowIso(), votes: { [S.me]: U.nowIso() } });
          U.toast(L('الاقتراح نزل! خلّي أصحابك يصوّتوا', 'Suggested! Get your friends to vote'));
        });
      },
    });
  };
  V.actions.propose = () => V.propose();
  V.actions.vote = async (a) => {
    const p = S.proposals.get(a.dataset.id);
    if (!p || !D.canWrite()) return;
    const on = p.votes && p.votes[S.me];
    await D.update(`proposals/${p.id}`, { votes: { [S.me]: on ? false : U.nowIso() } });
    if (!on) U.chime('soft');
  };
  V.actions['prop-menu'] = (a) => {
    const p = S.proposals.get(a.dataset.id);
    if (!p) return;
    const items = [];
    if (S.canEdit || S.isOwner)
      items.push({ ic: 'books', t: L('نبدأ الكتاب ده (ارفع الملف)', 'Start this book (upload the file)'), fn: () => V.addBook({ title: p.title, author: p.author, proposal: p.id }) });
    items.push({ ic: 'trash', danger: true, t: L('امسح الاقتراح', 'Delete suggestion'), fn: async () => (await V.confirm(L('هتمسح الاقتراح ده.', 'Delete this suggestion?'), L('امسح', 'Delete'), true)) && D.del(`proposals/${p.id}`) });
    V.menu(items);
  };

  /* ---------- book page ---------- */
  V.screens.book = (id, opts = {}) => {
    const b = S.books.get(id);
    if (!b) return V.empty(L('الكتاب ده مش موجود', 'Book not found'), L('يمكن اتمسح.', 'It may have been deleted.'), `<button class="btn" data-go="books">${L('كتبنا', 'Our books')}</button>`);
    const tab = opts.tab || 'plan';
    const prog = D.prog(b.id);
    const last = (prog && prog.last) || 1;
    const ws = G.wirds(b);
    const pct = bookPct(b);
    const tabs = [
      ['plan', 'calendar', L('الأوراد', 'Portions')],
      ['talk', 'chat', L('النقاش', 'Discussion')],
      ['notes', 'note', L('الملاحظات', 'Notes')],
      ['people', 'users', L('التقدّم', 'Progress')],
    ];
    const talkUnread = ['gen', ...ws.map((w) => w.id)].reduce((s, ch) => s + V.unread(b.id, ch), 0);
    const noteCount = [...S.notes.values()].filter((n) => n.b === b.id && n.kind !== 'take').length;
    return `<div class="bookpage">
      <button class="back" data-go="books">${icon('back', 'flip')}<span>${L('كتبنا', 'Our books')}</span></button>
      <header class="bp-hero">
        ${V.cover(b, 'lg')}
        <div class="bp-info">
          <small class="eyebrow">${{ reading: L('بنقرأه دلوقتي', 'Reading now'), planned: L('الجاي', 'Up next'), done: L('خلّصناه', 'Finished') }[b.status || 'reading']}</small>
          <h1 dir="auto">${esc(b.title)}${D.canWrite() ? ` <button class="ib sm bp-edit" data-act="edit-book" data-b="${esc(b.id)}" aria-label="${L('عدّل اسم الكتاب', 'Edit the title')}">${icon('edit')}</button>` : ''}</h1>
          ${b.author ? `<p class="muted" dir="auto">${esc(b.author)}</p>` : ''}
          <div class="meta-chips"><span>${icon('scroll')}${L.count(b.pages || 0, 'page')}</span>${ws.length ? `<span>${icon('calendar')}${L.count(ws.length, 'wird')}</span>` : ''}<span>${icon('user')}${L('بواسطة', 'Added by')} ${esc(D.name(b.addedBy))}</span>${(b.parts || []).length ? '' : `<span class="warn">${icon('info')}${L('كل واحد بيفتح نسخته', 'Everyone opens their own copy')}</span>`}</div>
          <div class="bp-prog">${V.bar(pct, pct >= 1 ? 'jade' : 'lapis')}<small>${L(`قريت ${L.num(Math.round(pct * 100))}٪`, `${Math.round(pct * 100)}% read`)}</small></div>
        </div>
      </header>
          <div class="row-btns bp-actions">
            <button class="btn big" data-act="read" data-b="${esc(b.id)}">${icon('play', 'flip-rtl')}${last > 1 ? L(`كمّل من ص ${L.num(last)}`, `Continue from p. ${last}`) : L('ابدأ القراية', 'Start reading')}</button>
            ${(b.parts || []).length ? `<button class="btn ghost" data-act="download" data-b="${esc(b.id)}">${icon('download')}<span class="hide-xs">${L('حمّل', 'Download')}</span></button>` : ''}
            <button class="btn ghost icon-only" data-act="book-menu" data-b="${esc(b.id)}" aria-label="${L('اختيارات', 'Options')}">${icon('more')}</button>
          </div>
      <nav class="tabs" role="tablist">${tabs
        .map(([k, ic, t]) => `<button role="tab" class="tab${k === tab ? ' on' : ''}" aria-selected="${k === tab}" data-act="book-tab" data-b="${esc(b.id)}" data-tab="${k}">${icon(ic)}<span>${t}</span>${k === 'talk' && talkUnread ? `<i class="nv-b">${L.num(talkUnread)}</i>` : ''}${k === 'notes' && noteCount ? `<small>${L.num(noteCount)}</small>` : ''}</button>`)
        .join('')}</nav>
      <section class="tabpane">${tab === 'plan' ? planTab(b) : tab === 'talk' ? talkTab(b, opts.ch) : tab === 'notes' ? notesTab(b, opts) : peopleTab(b)}</section>
    </div>`;
  };
  // Keep the chosen portion's chip in view in the scrolling row (once per choice, so it doesn't fight the finger).
  let shownChip = '';
  V.after = V.after || [];
  V.after.push((scr) => {
    const row = scr.querySelector('.talk-chips');
    const on = row && row.querySelector('.chip.on');
    if (!on) return;
    const key = location.hash + '|' + on.dataset.ch;
    if (key === shownChip) return;
    shownChip = key;
    const r = on.getBoundingClientRect();
    const c = row.getBoundingClientRect();
    row.scrollLeft += r.left + r.width / 2 - (c.left + c.width / 2);
  });
  V.actions['book-tab'] = (a) => V.go('book-' + a.dataset.b, a.dataset.ch ? { tab: a.dataset.tab, ch: a.dataset.ch } : { tab: a.dataset.tab });

  function planTab(b) {
    const ws = G.wirds(b);
    if (!ws.length)
      return V.empty(L('مفيش خطة لسه', 'No reading plan yet'), L('قسّموا الكتاب أوراد بعدد صفحات ومواعيد، وكل واحد يعلّم لما يخلّص.', 'Split the book into portions with page ranges and dates; everyone marks theirs when done.'), D.canWrite() ? `<button class="btn gold" data-act="plan" data-b="${esc(b.id)}">${icon('calendar')}${L('اعمل خطة', 'Make a plan')}</button>` : '');
    const members = D.memberIds();
    const per = ws[0].to - ws[0].from + 1;
    const every = U.diffDays(ws[0].start, ws[0].due) + 1;
    return `<div class="plan-head"><p>${L(`${L.count(per, 'page')} ${every === 1 ? 'كل يوم' : every === 7 ? 'كل أسبوع' : `كل ${L.count(every, 'day')}`} • من ${L.dayShort(ws[0].start)} لـ ${L.dayShort(ws[ws.length - 1].due)}`, `${per} pages ${every === 1 ? 'a day' : every === 7 ? 'a week' : `every ${every} days`} • ${L.dayShort(ws[0].start)} – ${L.dayShort(ws[ws.length - 1].due)}`)}</p>${D.canWrite() ? `<button class="btn ghost sm" data-act="plan" data-b="${esc(b.id)}">${icon('edit')}${L('عدّل الخطة', 'Edit plan')}</button>` : ''}</div>
      ${wirdPath(b, ws, members)}`;
  }

  /* The plan as a path: done ✓, the current one ★ with friends on it, a section header every 7 portions. */
  function wirdPath(b, ws, members) {
    const myCur = G.myCurrent(b);
    const at = new Map();
    for (const u of members) {
      if (u === S.me) continue;
      const cw = G.myCurrent(b, u);
      if (!cw) continue;
      if (!at.has(cw.id)) at.set(cw.id, []);
      at.get(cw.id).push(u);
    }
    const X = [0, 56, 84, 56, 0, -56, -84, -56];
    let html = '';
    ws.forEach((w, i) => {
      if (i % 7 === 0 && ws.length > 7) {
        const end = ws[Math.min(ws.length - 1, i + 6)];
        html += `<li class="wpv-sec"><b>${L(`الأوراد ${L.num(w.n)}–${L.num(end.n)}`, `Portions ${w.n}–${end.n}`)}</b><small>${L.dayShort(w.start)} – ${L.dayShort(end.due)}</small></li>`;
      }
      const st = G.wirdStatus(b, w);
      const done = st === 'done' || st === 'late-done';
      const cur = !!(myCur && myCur.id === w.id);
      const lastOne = i === ws.length - 1;
      const x = X[i % X.length];
      const side = x > 0 || (x === 0 && i % 8 === 0) ? 'lbl-l' : 'lbl-r';
      const fins = members.filter((u) => {
        const p = D.prog(b.id, u);
        return p && p.done && p.done[w.id];
      }).length;
      const others = (at.get(w.id) || []).slice(0, 3);
      const unread = V.unread(b.id, w.id);
      const state = done ? `✓ ${L(`${L.num(fins)} من ${L.num(members.length)}`, `${fins} of ${members.length}`)}` : st === 'soon' ? L.dayShort(w.start) : L.due(w.due);
      const node = done ? icon('check') : cur ? '<span class="star8 sm"></span>' : lastOne ? icon('trophy') : L.num(w.n);
      html += `<li class="wpv s-${st}${cur ? ' cur' : ''} ${side}" style="--x:${x}px"><div class="wpv-in">
        ${cur ? `<span class="wpv-bub">${st === 'late' ? L('متأخر', 'Late') : L('دلوقتي', 'Now')}</span>` : ''}
        <button class="wpv-n" data-act="wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}" aria-label="${L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`)}: ${state}">${node}</button>
        ${others.length ? `<span class="wpv-avs" aria-hidden="true">${others.map((u) => D.avatar(u, 'xs')).join('')}</span>` : ''}
        ${unread ? `<i class="wpv-dot" title="${L('رسايل جديدة في نقاش الورد', 'New messages in this portion')}"></i>` : ''}
        <span class="wpv-l"><b>${L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`)}</b><small>${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)}</small><small class="due ${done ? 'done' : st}">${state}</small></span>
      </div></li>`;
    });
    return `<ol class="wpv-list">${html}</ol>`;
  }

  /* One portion: progress, who finished, read / discuss / mark done. */
  V.actions.wird = (a) => {
    const b = S.books.get(a.dataset.b);
    const w = b && G.wirds(b).find((x) => x.id === a.dataset.w);
    if (!w) return;
    const st = G.wirdStatus(b, w);
    const done = st === 'done' || st === 'late-done';
    const members = D.memberIds();
    const fins = members
      .map((u) => ({ u, p: D.prog(b.id, u) }))
      .filter((x) => x.p && x.p.done && x.p.done[w.id])
      .sort((x, y) => String(x.p.done[w.id]).localeCompare(String(y.p.done[w.id])));
    const prog = D.prog(b.id);
    const total = w.to - w.from + 1;
    const seen = U.rangesCountIn(prog && prog.seen, w.from, w.to);
    const last = (prog && prog.last) || 0;
    const startAt = last >= w.from && last < w.to ? last : w.from;
    const takes = [...S.notes.values()].filter((n) => n.b === b.id && n.kind === 'take' && n.wid === w.id).length;
    const talk = takes + V.unread(b.id, w.id);
    V.sheet({
      title: L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`),
      html: `<div class="wsheet">
        <p class="ws-meta">${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)} • ${L.day(w.start)}${w.due !== w.start ? ' → ' + L.day(w.due) : ''} • <span class="due ${done ? 'done' : st}">${done ? L('خلّصته ✓', 'Done ✓') : st === 'soon' ? L('لسه', 'Upcoming') : L.due(w.due)}</span></p>
        <div class="ws-prog">${V.bar(seen / total, done ? 'jade' : 'lapis')}<small>${L(`قريت ${L.num(seen)} من ${L.count(total, 'page')}`, `${seen} of ${total} pages read`)}</small></div>
        <div class="ws-fins"><b>${L('خلّصوه', 'Finished')}</b>${fins.length ? `<span class="mavs">${fins.map((x, i) => `<span class="fin${i === 0 ? ' first' : ''}" title="${esc(D.name(x.u))}">${D.avatar(x.u, 'sm')}</span>`).join('')}</span><small>${L.num(fins.length)}/${L.num(members.length)}</small>` : `<small>${L('لسه محدش', 'Nobody yet')}</small>`}</div>
        <div class="row-btns">
          <button class="btn big" data-act="read" data-b="${esc(b.id)}" data-p="${startAt}" data-close>${icon('play', 'flip-rtl')}${startAt > w.from ? L(`كمّل من ص ${L.num(startAt)}`, `Continue from p. ${startAt}`) : L('اقرأ الورد', 'Read it')}</button>
          <button class="btn ghost" data-act="book-tab" data-b="${esc(b.id)}" data-tab="talk" data-ch="${esc(w.id)}" data-close>${icon('chat')}${L('نقاش الورد', 'Discussion')}${talk ? ` (${L.num(talk)})` : ''}</button>
          ${D.canWrite() ? (done ? `<button class="btn ghost" data-act="unmark-wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}" data-close>${icon('close')}${L('شيل علامة خلّصته', 'Unmark done')}</button>` : `<button class="btn jade" data-act="mark-wird" data-b="${esc(b.id)}" data-w="${esc(w.id)}" data-close>${icon('check')}${L('خلّصته', 'Done')}</button>`) : ''}
        </div></div>`,
    });
  };

  /* ---------- discussions (book channels and the circle chat) ---------- */
  const REACTS = { heart: '❤️', fire: '🔥', clap: '👏', idea: '💡', laugh: '😂' };
  V.thread = (b, ch, opts = {}) => {
    const list = S.msgs.filter((m) => m.b === b && (m.ch || 'gen') === ch);
    setTimeout(() => V.markRead(b, ch), 0);
    let lastBy = null, lastT = '';
    const rows = list.map((m) => {
      const cont = m.by === lastBy && new Date(m.at) - new Date(lastT) < 5 * 60e3;
      lastBy = m.by;
      lastT = m.at;
      const re = m.re ? S.msgs.find((x) => x.id === m.re) : null;
      const reacts = Object.entries(m.react || {}).map(([k, us]) => [k, Object.entries(us || {}).filter(([, v]) => v).map(([u]) => u)]).filter(([, us]) => us.length);
      return `<div class="msg${m.by === S.me ? ' mine' : ''}${cont ? ' cont' : ''}${m.kind === 'ai' ? ' ai' : ''}" data-mid="${esc(m.id)}">
        ${cont ? '<span class="av-sp"></span>' : D.avatar(m.by, 'sm')}
        <div class="bub">${cont ? '' : `<header><b data-act="member" data-uid="${esc(m.by)}">${esc(D.name(m.by))}</b>${m.kind === 'ai' ? `<span class="kind">${icon('claude')}Claude</span>` : ''}<small>${L.ago(m.at)}</small></header>`}
          ${re ? `<div class="re" dir="auto"><b>${esc(D.name(re.by))}</b> ${esc(String(re.text).slice(0, 90))}</div>` : ''}
          <p dir="auto">${esc(m.text)}</p>
          ${reacts.length ? `<div class="reacts">${reacts.map(([k, us]) => `<button class="rx${us.includes(S.me) ? ' on' : ''}" data-act="react" data-mid="${esc(m.id)}" data-r="${k}" title="${esc(us.map((u) => D.name(u)).join('، '))}">${REACTS[k] || ''}<span>${L.num(us.length)}</span></button>`).join('')}</div>` : ''}
        </div>
        ${D.canWrite() ? `<button class="ib sm msg-more" data-act="msg-menu" data-mid="${esc(m.id)}" aria-label="${L('اختيارات', 'Options')}">${icon('more')}</button>` : ''}
      </div>`;
    });
    const key = `${b}-${ch}`.replace(/[^a-z0-9_-]/gi, '');
    const replyTo = V.replyTo && V.replyTo.key === key ? S.msgs.find((x) => x.id === V.replyTo.mid) : null;
    return `<div class="thread ${opts.cls || ''}">
      <div class="msgs" id="msgs-${key}" data-keep-scroll>${rows.length ? rows.join('') : `<div class="empty sm"><span class="star8 faint"></span><p>${opts.empty || L('لسه محدش كتب. قول رأيك!', 'No messages yet. Say something!')}</p></div>`}</div>
      ${D.canWrite() ? `<form class="composer" data-send data-b="${esc(b)}" data-ch="${esc(ch)}" data-key="${key}">
        ${replyTo ? `<div class="replying">${icon('chat')}<span dir="auto">${L('رد على', 'Replying to')} <b>${esc(D.name(replyTo.by))}</b>: ${esc(String(replyTo.text).slice(0, 60))}</span><button type="button" class="ib sm" data-act="cancel-reply" aria-label="${L('إلغاء', 'Cancel')}">${icon('close')}</button></div>` : ''}
        <textarea id="in-${key}" rows="1" dir="auto" maxlength="${U.MAX.msg}" placeholder="${opts.placeholder || L('اكتب رسالة…', 'Write a message…')}"></textarea>
        <button class="btn icon-only" aria-label="${L('ابعت', 'Send')}">${icon('send', 'flip-rtl')}</button></form>` : ''}
    </div>`;
  };
  V.after = V.after || [];
  V.after.push((root) => {
    for (const m of root.querySelectorAll('.msgs')) if (!m.dataset.rtInit) {
      m.dataset.rtInit = '1';
      m.scrollTop = m.scrollHeight;
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-send]');
    if (!f) return;
    e.preventDefault();
    const ta = f.querySelector('textarea');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = '';
    const re = V.replyTo && V.replyTo.key === f.dataset.key ? V.replyTo.mid : '';
    V.replyTo = null;
    const id = D.newId();
    await D.set(`msgs/${id}`, { b: f.dataset.b, ch: f.dataset.ch, by: S.me, text, at: U.nowIso(), re, react: {} });
    const box = document.getElementById('msgs-' + f.dataset.key);
    if (box) box.scrollTop = box.scrollHeight;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.matches('[data-send] textarea') && window.innerWidth > 700) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.matches('.composer textarea')) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px';
    }
  });
  V.actions.react = async (a) => {
    const m = S.msgs.find((x) => x.id === a.dataset.mid);
    if (!m || !D.canWrite()) return;
    const on = m.react && m.react[a.dataset.r] && m.react[a.dataset.r][S.me];
    await D.update(`msgs/${m.id}`, { react: { [a.dataset.r]: { [S.me]: !on } } });
  };
  V.actions['msg-menu'] = (a) => {
    const m = S.msgs.find((x) => x.id === a.dataset.mid);
    if (!m) return;
    const key = `${m.b}-${m.ch || 'gen'}`.replace(/[^a-z0-9_-]/gi, '');
    const items = Object.entries(REACTS).map(([k, e]) => ({ ic: 'heart', t: `${e} ${L('تفاعل', 'React')}`, fn: () => V.actions.react({ dataset: { mid: m.id, r: k } }) }));
    items.unshift({ ic: 'chat', t: L('رد', 'Reply'), fn: () => { V.replyTo = { key, mid: m.id }; V.render(); setTimeout(() => { const t = document.getElementById('in-' + key); t && t.focus(); }, 50); } });
    if (m.by === S.me) items.push({ ic: 'trash', danger: true, t: L('امسح الرسالة', 'Delete message'), fn: async () => (await V.confirm(L('هتمسح الرسالة دي.', 'Delete this message?'), L('امسح', 'Delete'), true)) && D.del(`msgs/${m.id}`) });
    V.menu(items);
  };
  V.actions['cancel-reply'] = () => {
    V.replyTo = null;
    V.render();
  };

  function talkTab(b, ch) {
    const ws = G.wirds(b);
    const gcur = G.groupCurrent(b);
    ch = ch || (gcur ? gcur.id : 'gen');
    if (ch !== 'gen' && !ws.find((w) => w.id === ch)) ch = 'gen';
    const w = ws.find((x) => x.id === ch);
    const chips = [['gen', L('عام', 'General')], ...ws.map((x) => [x.id, L(`الورد ${L.num(x.n)}`, `Portion ${x.n}`)])];
    const takes = w ? [...S.notes.values()].filter((n) => n.b === b.id && n.kind === 'take' && n.wid === w.id).sort((x, y) => String(x.at).localeCompare(String(y.at))) : [];
    const myTake = takes.find((n) => n.by === S.me);
    return `<div class="chips scroll talk-chips" role="tablist">${chips
      .map(([k, t]) => {
        const u = V.unread(b.id, k);
        return `<button class="chip${k === ch ? ' on' : ''}${gcur && gcur.id === k ? ' cur' : ''}" data-act="book-tab" data-b="${esc(b.id)}" data-tab="talk" data-ch="${esc(k)}">${t}${u ? `<i class="nv-b">${L.num(u)}</i>` : ''}</button>`;
      })
      .join('')}</div>
      ${w ? `<section class="takes"><header><h3>${icon('sparkle')}${L(`خلاصات الورد ${L.num(w.n)}`, `Takeaways • portion ${w.n}`)}</h3><small class="muted">${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)}</small>${D.canWrite() ? `<button class="btn sm ${myTake ? 'ghost' : 'gold'}" data-act="write-take" data-b="${esc(b.id)}" data-w="${esc(w.id)}" ${myTake ? `data-nid="${esc(myTake.id)}"` : ''}>${myTake ? L('عدّل خلاصتي', 'Edit mine') : L('اكتب خلاصتك', 'Write yours')}</button>` : ''}</header>
        ${takes.length ? `<div class="take-list">${takes.map((n) => V.noteCard(n)).join('')}</div>` : `<p class="muted sm">${L('لما تخلّص الورد اكتب أهم فكرة خرجت بيها.', 'When you finish the portion, share the main idea you took away.')}</p>`}</section>` : ''}
      ${V.thread(b.id, ch, { placeholder: w ? L(`اكتب رأيك في الورد ${L.num(w.n)}…`, `Your thoughts on portion ${w.n}…`) : L('اكتب للحلقة عن الكتاب…', 'Write to the circle about this book…') })}`;
  }
  V.actions['write-take'] = (a) => V.writeTake(a.dataset.b, a.dataset.w, a.dataset.nid ? S.notes.get(a.dataset.nid) : null);

  function notesTab(b, opts) {
    const f = opts.nf || 'all';
    let list = [...S.notes.values()].filter((n) => n.b === b.id && n.kind !== 'take');
    if (f !== 'all') list = list.filter((n) => n.kind === f);
    const sort = opts.ns || 'page';
    list.sort((x, y) => (sort === 'page' ? x.page - y.page || String(x.at).localeCompare(String(y.at)) : String(y.at).localeCompare(String(x.at))));
    const chip = (k, t) => `<button class="chip${f === k ? ' on' : ''}" data-act="notes-f" data-b="${esc(b.id)}" data-f="${k}">${t}</button>`;
    return `<div class="notes-bar"><div class="chips">${chip('all', L('الكل', 'All'))}${chip('quote', L('اقتباسات', 'Quotes'))}${chip('q', L('أسئلة', 'Questions'))}${chip('note', L('ملاحظات', 'Notes'))}${chip('hl', L('تظليلات', 'Highlights'))}</div>
      <button class="pill ghost" data-act="notes-s" data-b="${esc(b.id)}">${icon(sort === 'page' ? 'list' : 'clock')}<span>${sort === 'page' ? L('بالصفحة', 'By page') : L('الأحدث', 'Newest')}</span></button></div>
      ${list.length ? `<div class="ngrid">${list.map((n) => V.noteCard(n)).join('')}</div>` : V.empty(L('مفيش ملاحظات هنا لسه', 'No notes here yet'), L('افتح الكتاب واستخدم «ظلّل» أو «ملاحظة» من تحت.', 'Open the book and use Highlight or Note at the bottom.'), `<button class="btn" data-act="read" data-b="${esc(b.id)}">${L('افتح الكتاب', 'Open the book')}</button>`)}`;
  }
  V.actions['notes-f'] = (a) => V.go('book-' + a.dataset.b, Object.assign({}, V.state.opts, { tab: 'notes', nf: a.dataset.f }));
  V.actions['notes-s'] = (a) => V.go('book-' + a.dataset.b, Object.assign({}, V.state.opts, { tab: 'notes', ns: (V.state.opts.ns || 'page') === 'page' ? 'new' : 'page' }));

  function peopleTab(b) {
    const ws = G.wirds(b);
    const members = D.memberIds();
    const live = new Set(D.readingNow(b.id).map((x) => x.uid));
    const rows = members.map((u) => {
      const p = D.prog(b.id, u);
      const seen = p ? U.rangesCount(p.seen) : 0;
      const cells = ws
        .map((w) => {
          const st = G.wirdStatus(b, w, u);
          const first = G.firstFinisher(b.id, w.id) === u;
          return `<td class="c-${st}${first ? ' first' : ''}" title="${L('الورد', 'Portion')} ${L.num(w.n)}">${st === 'done' || st === 'late-done' ? icon('check') : st === 'late' ? '<i></i>' : ''}</td>`;
        })
        .join('');
      const behind = ws.some((w) => G.wirdStatus(b, w, u) === 'late');
      return `<tr><th scope="row"><button class="who" data-act="member" data-uid="${esc(u)}">${D.avatar(u, 'sm')}<span><b>${esc(D.name(u))}</b><small>${p && p.finished ? '🏆 ' + L('الكتاب خلص', 'Finished') : `${L.num(Math.round((seen / (b.pages || 1)) * 100))}٪ • ${L('ص', 'p.')} ${L.num((p && p.last) || 1)}`}${live.has(u) ? ` • <span class="live-t">${L('في القراية دلوقتي', 'reading now')}</span>` : ''}</small></span></button>
        ${u !== S.me && D.canWrite() ? `<span class="who-acts">${behind ? `<button class="ib sm" data-act="poke" data-to="${esc(u)}" data-kind="poke" data-b="${esc(b.id)}" aria-label="${L('تذكير', 'Nudge')}">${icon('hand')}</button>` : ''}<button class="ib sm" data-act="poke" data-to="${esc(u)}" data-kind="cheer" data-b="${esc(b.id)}" aria-label="${L('تشجيع', 'Cheer')}">${icon('clap')}</button></span>` : ''}</th>${cells}</tr>`;
    });
    return `${ws.length ? '' : `<p class="muted">${L('لما تعملوا خطة هتشوفوا هنا مين خلّص أنهي ورد.', 'Once you have a plan you will see who finished which portion here.')}</p>`}
      <div class="matrix-wrap"><table class="matrix"><thead><tr><th></th>${ws.map((w) => `<th scope="col">${L.num(w.n)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <div class="legend"><span><i class="c-done"></i>${L('في الميعاد', 'On time')}</span><span><i class="c-late-done"></i>${L('بعد الميعاد', 'Late')}</span><span><i class="c-late"></i>${L('متأخر', 'Behind')}</span><span><i class="c-now"></i>${L('دلوقتي', 'Now')}</span><span><i class="first"></i>${L('الأول', 'First')}</span></div>`;
  }

  V.actions['book-menu'] = (a) => {
    const b = S.books.get(a.dataset.b);
    if (!b) return;
    const items = [];
    if (D.canWrite()) {
      items.push({ ic: 'calendar', t: L('خطة القراءة', 'Reading plan'), fn: () => V.planWizard(b.id) });
      items.push({ ic: 'edit', t: L('عدّل بيانات الكتاب', 'Edit book details'), fn: () => V.editBook(b.id) });
    }
    if (S.sample) items.push({ ic: 'claude', t: L('اسأل Claude يقترح أسئلة نقاش', 'Ask Claude for discussion questions'), fn: () => V.askBook(b.id) });
    if ((b.parts || []).length) items.push({ ic: 'download', t: L('حمّل الكتاب', 'Download the book'), fn: () => V.download(b.id) });
    if (b.addedBy === S.me || S.isOwner || S.canEdit) items.push({ ic: 'trash', danger: true, t: L('امسح الكتاب من الحلقة', 'Remove book from circle'), fn: () => V.deleteBook(b.id) });
    V.menu(items);
  };
  V.actions.download = (a) => V.download(a.dataset.b);
  V.actions.plan = (a) => V.planWizard(a.dataset.b);
  V.actions['add-book'] = () => V.addBook();

  V.editBook = (id) => {
    const b = S.books.get(id);
    if (!b) return;
    V.sheet({
      title: L('بيانات الكتاب', 'Book details'),
      html: `<form class="form" id="eb-form">
        <label for="eb-title">${L('اسم الكتاب', 'Title')}</label><input id="eb-title" required maxlength="140" dir="auto" enterkeyhint="done" value="${esc(b.title)}">
        <label for="eb-author">${L('المؤلف', 'Author')}</label><input id="eb-author" maxlength="100" dir="auto" enterkeyhint="done" value="${esc(b.author || '')}">
        <label for="eb-lang">${L('اتجاه الكتاب', 'Book direction')}</label><select id="eb-lang"><option value="ar" ${b.lang !== 'en' ? 'selected' : ''}>${L('عربي (يمين لشمال)', 'Arabic (right to left)')}</option><option value="en" ${b.lang === 'en' ? 'selected' : ''}>${L('إنجليزي (شمال ليمين)', 'English (left to right)')}</option></select>
        <label for="eb-status">${L('الحالة', 'Status')}</label><select id="eb-status">${['reading', 'planned', 'done'].map((s) => `<option value="${s}" ${(b.status || 'reading') === s ? 'selected' : ''}>${{ reading: L('بنقرأه دلوقتي', 'Reading now'), planned: L('الجاي', 'Up next'), done: L('خلّصناه', 'Finished') }[s]}</option>`).join('')}</select>
        <p class="err-t" id="eb-err" hidden></p>
        <div class="row-btns end"><button class="btn gold">${icon('check')}${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) => {
        const f = body.querySelector('#eb-form');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          // Read everything before anything closes, then close only once it is saved.
          const patch = {
            title: f.querySelector('#eb-title').value.replace(/\s+/g, ' ').trim() || b.title,
            author: f.querySelector('#eb-author').value.replace(/\s+/g, ' ').trim(),
            lang: f.querySelector('#eb-lang').value,
            status: f.querySelector('#eb-status').value,
          };
          const btn = f.querySelector('button.btn');
          const err = f.querySelector('#eb-err');
          btn.disabled = true;
          err.hidden = true;
          try {
            await D.update(`books/${id}`, patch);
            api.close();
            U.toast(L('اتحفظ ✓', 'Saved ✓'));
          } catch (x) {
            btn.disabled = false;
            err.textContent = L('ماتحفظش. اتأكد من النت وجرّب تاني.', "Not saved. Check your connection and try again.");
            err.hidden = false;
          }
        });
      },
    });
  };
  V.actions['edit-book'] = (a) => V.editBook(a.dataset.b);

  V.deleteBook = async (id) => {
    const b = S.books.get(id);
    if (!(await V.confirm(L(`هتشيل «${esc(b.title)}» من الحلقة. الملاحظات والنقاش هيختفوا معاه.`, `Remove “${esc(b.title)}” from the circle? Its notes and discussion will disappear with it.`), L('امسح', 'Remove'), true))) return;
    if (A.R.isOpen() && A.R.bookId() === id) A.R.close(true);
    await D.del(`books/${id}`);
    if (S.assets) for (const p of b.parts || []) S.assets.delete(p.id).catch(() => {});
    V.go('books');
  };

  /* ---------- add a book (upload, split, plan) ---------- */
  V.addBook = (pre = {}) => {
    let file = null, info = null;
    const canUpload = !!S.assets;
    const api = V.sheet({
      title: L('ضيف كتاب للحلقة', 'Add a book to the circle'),
      wide: true,
      html: `<div id="ab-step">${pickHtml()}</div>`,
      onMount: (body) => {
        if (S.assets && S.assets.list)
          S.assets.list().then((r) => {
            const u = r && r.usage;
            const el = body.querySelector('#ab-usage');
            if (!u || !u.maxBytes || !el) return;
            const mb = (x) => L.num(Math.round(x / 1048576));
            el.innerHTML = `${icon('layers')}<span>${L(`مساحة الحلقة: مستخدم ${mb(u.bytes)} من ${mb(u.maxBytes)} ميجا`, `Circle storage: ${mb(u.bytes)} of ${mb(u.maxBytes)} MB used`)}</span>${V.bar(u.bytes / u.maxBytes, u.bytes / u.maxBytes > 0.85 ? 'rubric' : 'lapis')}`;
          }).catch(() => {});
        body.addEventListener('change', async (e) => {
          if (e.target.id !== 'ab-file' || !e.target.files[0]) return;
          file = e.target.files[0];
          await analyze();
        });
        body.addEventListener('dragover', (e) => {
          if (e.target.closest('.drop')) {
            e.preventDefault();
            e.target.closest('.drop').classList.add('over');
          }
        });
        body.addEventListener('dragleave', (e) => e.target.closest('.drop') && e.target.closest('.drop').classList.remove('over'));
        body.addEventListener('drop', async (e) => {
          if (!e.target.closest('.drop')) return;
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) {
            file = f;
            await analyze();
          }
        });
        body.addEventListener('submit', async (e) => {
          if (e.target.id !== 'ab-form') return;
          e.preventDefault();
          await save();
        });
      },
    });
    function pickHtml() {
      return `<label class="drop" for="ab-file">${icon('upload')}<b>${L('اختار ملف PDF', 'Choose a PDF file')}</b><span>${L('أو اسحبه هنا', 'or drop it here')}</span><input type="file" id="ab-file" accept="application/pdf,.pdf" hidden></label>
        <ul class="hints">
          <li>${icon('info')}${canUpload ? L('الكتاب هيترفع للحلقة وأي حد فيها يقدر يفتحه أو يحمّله.', 'The file is uploaded so everyone in the circle can read or download it.') : L('الرفع مش متاح دلوقتي. تقدر تضيف الكتاب وكل واحد يفتح نسخته من جهازه.', 'Uploading is unavailable right now. You can still add the book and everyone opens their own copy.')}</li>
          <li>${icon('layers')}${L('الملفات الأكبر من ٢٠ ميجا بنقسّمها أجزاء أوتوماتيك. الكتب الكبيرة جدًا ارفعها من كمبيوتر.', 'Files over 20 MB are split into parts automatically. Upload very large books from a computer.')}</li>
          <li class="usage" id="ab-usage"></li>
        </ul>`;
    }
    const step = (h) => {
      const el = api.body.querySelector('#ab-step');
      if (el) el.innerHTML = h;
    };
    const progress = (title, f, sub = '') =>
      step(`<div class="ab-prog">${V.star('', 'gold spin')}<b>${title}</b>${V.bar(f, 'gold')}<small>${sub}</small></div>`);

    async function analyze() {
      if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return U.toast(L('اختار ملف PDF', 'Please choose a PDF'), 'warn');
      progress(L('بقرأ الملف…', 'Reading the file…'), 0.05);
      try {
        const buf = await file.arrayBuffer();
        const pdf = await A.R.openPdf(new Uint8Array(buf.slice(0)));
        const N = pdf.numPages;
        let meta = null;
        try { meta = await pdf.getMetadata(); } catch (e) {}
        const sizes = [];
        for (let p = 1; p <= N; p++) {
          const page = await pdf.getPage(p);
          const vp = page.getViewport({ scale: 1 });
          sizes.push([Math.round(vp.width), Math.round(vp.height)]);
          if (p === 1) info = { cover: await coverOf(page) };
          page.cleanup();
          if (p % 25 === 0) progress(L('بقيس الصفحات…', 'Measuring pages…'), p / N, `${L.num(p)} / ${L.num(N)}`);
        }
        const fp = (pdf.fingerprints && pdf.fingerprints[0]) || '';
        let toc = [];
        let script = null;
        try {
          toc = await A.R.outlineOf(pdf);
        } catch (e) {}
        try {
          script = await scriptOf(pdf, N);
        } catch (e) {}
        pdf.destroy().catch(() => {});
        const same = sizes.every((s) => s[0] === sizes[0][0] && s[1] === sizes[0][1]);
        const t = (meta && meta.info && meta.info.Title) || '';
        const au = (meta && meta.info && meta.info.Author) || '';
        const metaTitle = t && t.length > 2 && !/^untitled|microsoft|\.(docx?|indd)/i.test(t) ? t : '';
        let title = pre.title || metaTitle || cleanFileName(file.name);
        let guessAuthor = '';
        // A file named "<title> <author> Copy.pdf" whose outline starts with the title: take the outline's spelling,
        // and what follows it in the name as the author.
        if (!pre.title && !metaTitle && toc[0] && toc[0].p <= 3) {
          const k = toc[0].t.trim();
          const n = arNorm(k).length;
          if (n >= 4 && arNorm(title).startsWith(arNorm(k))) {
            let i = 0, seen = 0;
            while (i < title.length && seen < n) if (arNorm(title[i++])) seen++;
            const rest = title.slice(i).trim().replace(/^[أا]\s*\.?\s*د\s*\.?\s+/, 'أ.د. ').replace(/^د\s*\.\s*/, 'د. ');
            title = k;
            const words = rest.split(/\s+/).filter(Boolean);
            if (words.length >= 2 && words.length <= 7) guessAuthor = rest;
          }
        }
        // Direction: the PDF's own text decides; scanned books (no text) count as Arabic unless the real title is English.
        const lang = script || (U.isArabic(title) || !metaTitle || !/[a-z]/i.test(title) ? 'ar' : 'en');
        const author = pre.author || (JUNK_AUTHOR.test(au.trim()) ? '' : au) || guessAuthor;
        Object.assign(info, { buf, N, sizes: same ? null : sizes, size: sizes[0], fp, title: title.trim(), author: (author || '').trim(), lang, toc });
        step(formHtml());
        if (A.B)
          A.B.bind(api.body, 'ab-bs', (b) => {
            api.body.querySelector('#ab-title').value = b.title;
            api.body.querySelector('#ab-author').value = b.author;
          });
      } catch (e) {
        console.warn(e);
        step(`${pickHtml()}<p class="err-t">${e && e.name === 'PasswordException' ? L('الملف ده عليه باسورد. افتحه واحفظه من غير باسورد وجرّب تاني.', 'This PDF is password protected. Save a copy without a password and try again.') : L('مش قادر أقرأ الملف ده. اتأكد إنه PDF سليم.', "Couldn't read this file. Make sure it's a valid PDF.")}</p>`);
      }
    }
    /* 'ar' or 'en' from the text of the first pages; null for scanned books without a text layer. */
    async function scriptOf(pdf, N) {
      let ar = 0, la = 0;
      for (let p = 1; p <= Math.min(N, 8) && ar + la < 3000; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        for (const it of tc.items) {
          const str = it.str || '';
          ar += (str.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
          la += (str.match(/[A-Za-z]/g) || []).length;
        }
        page.cleanup();
      }
      if (ar + la < 80) return null;
      return la > ar * 3 ? 'en' : 'ar';
    }
    async function coverOf(page) {
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 300 / vp1.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      let url = c.toDataURL('image/jpeg', 0.75);
      if (url.length > 70000) url = c.toDataURL('image/jpeg', 0.5);
      c.width = 0;
      return url.length > 90000 ? null : url;
    }
    function formHtml() {
      const big = info.buf.byteLength > MAXPART;
      const ar = (info.lang || 'ar') === 'ar';
      return `<form id="ab-form" class="ab-form">
        <div class="ab-cover">${info.cover ? `<span class="cover lg"><img src="${esc(info.cover)}" alt=""></span>` : V.genCover(info.title, info.author, 'lg')}<small>${L.count(info.N, 'page')} • ${L.num(Math.round(info.buf.byteLength / 1048576))} MB${big && canUpload ? ' • ' + L('هيتقسّم أجزاء', 'will be split into parts') : ''}</small></div>
        <div class="form">
          ${A.B ? A.B.box('ab-bs') : ''}
          <label for="ab-title">${L('اسم الكتاب', 'Title')}</label><input id="ab-title" required maxlength="140" dir="auto" value="${esc(info.title)}">
          <label for="ab-author">${L('المؤلف', 'Author')}</label><input id="ab-author" maxlength="100" dir="auto" value="${esc(info.author)}">
          <label for="ab-lang">${L('اتجاه الكتاب', 'Book direction')}</label><select id="ab-lang"><option value="ar" ${ar ? 'selected' : ''}>${L('عربي (يمين لشمال)', 'Arabic (right to left)')}</option><option value="en" ${ar ? '' : 'selected'}>${L('إنجليزي (شمال ليمين)', 'English (left to right)')}</option></select>
          <span class="lbl">${L('هنبدأه إمتى؟', 'When do we start?')}</span>
          <div class="seg-pick"><label class="sp on"><input type="radio" name="ab-status" value="reading" checked>${icon('play', 'flip-rtl')}<span>${L('دلوقتي', 'Now')}</span></label><label class="sp"><input type="radio" name="ab-status" value="planned">${icon('calendar')}<span>${L('بعدين', 'Later')}</span></label></div>
          <label class="check"><input type="checkbox" id="ab-upload" ${canUpload ? 'checked' : 'disabled'}><span>${L('ارفع الملف للحلقة (مستحسن)', 'Upload the file to the circle (recommended)')}</span></label>
          <div class="row-btns end"><button class="btn gold big">${icon('check')}${L('ضيف الكتاب', 'Add the book')}</button></div>
        </div></form>`;
    }
    async function save() {
      const f = api.body;
      const title = f.querySelector('#ab-title').value.trim();
      if (!title) return;
      const author = f.querySelector('#ab-author').value.trim();
      const lang = f.querySelector('#ab-lang').value;
      const status = (f.querySelector('input[name=ab-status]:checked') || {}).value || 'reading';
      const upload = canUpload && f.querySelector('#ab-upload').checked;
      const id = U.rid(10);
      let parts = [];
      try {
        if (upload) parts = await uploadParts();
        else await U.cache.put('lb:' + id, info.buf);
      } catch (e) {
        console.warn(e);
        const code = e && e.code;
        const msg =
          code === 'quota_or_state' ? L('مساحة الحلقة خلصت. امسحوا كتاب قديم أو ضيف الكتاب من غير رفع.', 'The circle is out of storage. Remove an old book or add this one without uploading.')
            : code === 'too_large' ? L('صفحة واحدة في الملف أكبر من ٢٠ ميجا. صغّر الملف وجرّب تاني.', 'A single page is over 20 MB. Compress the PDF and try again.')
              : code === 'rate_limited' ? L('رفعنا كتير ورا بعض. استنى دقيقة وجرّب تاني.', 'Too many uploads at once. Wait a minute and try again.')
                : code === 'split' ? L('مقدرتش أقسّم الملف ده. صغّره لأقل من ٢٠ ميجا (مثلا بأداة ضغط PDF) أو ضيفه من غير رفع.', "Couldn't split this file. Compress it under 20 MB or add it without uploading.")
                  : L('الرفع وقف. اتأكد من النت وجرّب تاني.', 'The upload stopped. Check your connection and try again.');
        step(`${formHtml()}<p class="err-t">${msg}</p>`);
        return;
      }
      progress(L('بنحفظ الكتاب…', 'Saving the book…'), 1);
      const doc = { title, author, lang, pages: info.N, size: info.size, parts, bytes: info.buf.byteLength, cover: info.cover || null, addedBy: S.me, addedAt: U.nowIso(), status, wirds: [], fp: info.fp || '' };
      if (info.sizes) doc.sizes = info.sizes;
      if (info.toc && info.toc.length) doc.toc = info.toc;
      await D.set(`books/${id}`, doc);
      if (pre.proposal) D.update(`proposals/${pre.proposal}`, { chosen: id }).catch(() => {});
      api.close();
      U.confetti(0.8);
      U.chime('ok');
      V.go('book-' + id);
      if (status === 'reading') setTimeout(() => V.planWizard(id), 350);
    }
    async function uploadParts() {
      const buf = info.buf;
      const one = async (bytes, from, to, label) => {
        progress(L('برفع الكتاب…', 'Uploading…'), 0.5, label);
        const res = await S.assets.upload(new Blob([bytes], { type: 'application/pdf' }), { type: 'application/pdf' });
        await U.cache.put('a:' + res.id, bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        return { id: res.id, from, to, bytes: res.sizeBytes || bytes.byteLength };
      };
      if (buf.byteLength <= MAXPART) return [await one(buf, 1, info.N, '')];
      progress(L('بقسّم الكتاب أجزاء…', 'Splitting into parts…'), 0.1);
      let PDFLib;
      try {
        await U.loadScript(U.CDN.pdflib);
        PDFLib = window.PDFLib;
      } catch (e) {
        throw { code: 'split' };
      }
      let src;
      try {
        src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
      } catch (e) {
        throw { code: 'split' };
      }
      const N = src.getPageCount();
      if (N !== info.N) throw { code: 'split' };
      let per = Math.max(1, Math.floor(N * (16.5e6 / buf.byteLength)));
      const parts = [];
      let start = 0;
      while (start < N) {
        let cnt = Math.min(per, N - start);
        let bytes;
        for (;;) {
          const doc = await PDFLib.PDFDocument.create();
          const idx = Array.from({ length: cnt }, (_, i) => start + i);
          const pages = await doc.copyPages(src, idx);
          pages.forEach((p) => doc.addPage(p));
          bytes = await doc.save();
          if (bytes.byteLength <= MAXPART || cnt === 1) break;
          cnt = Math.max(1, Math.floor(cnt * (MAXPART / bytes.byteLength) * 0.92));
        }
        if (bytes.byteLength > MAXPART) throw { code: 'too_large' };
        const label = L(`الجزء ${L.num(parts.length + 1)} • ص ${L.num(start + 1)}–${L.num(start + cnt)}`, `Part ${parts.length + 1} • p. ${start + 1}–${start + cnt}`);
        parts.push(await one(bytes, start + 1, start + cnt, label));
        progress(L('برفع الكتاب…', 'Uploading…'), (start + cnt) / N, label);
        start += cnt;
        per = cnt;
      }
      return parts;
    }
  };

  /* ---------- reading plan wizard ---------- */
  V.planWizard = (id) => {
    const b = S.books.get(id);
    if (!b) return;
    const ws = G.wirds(b);
    const hadDone = D.bookProgs(id).some((p) => Object.keys(p.done || {}).length);
    const st = { from: ws.length ? ws[0].from : 1, to: ws.length ? ws[ws.length - 1].to : b.pages, start: ws.length ? ws[0].start : U.today(), every: ws.length ? U.diffDays(ws[0].start, ws[0].due) + 1 : 1, mode: 'per', per: ws.length ? ws[0].to - ws[0].from + 1 : Math.min(20, b.pages), end: U.addDays(U.today(), 30) };
    const gen = () => {
      const from = U.clamp(st.from | 0, 1, b.pages), to = U.clamp(st.to | 0, from, b.pages);
      const every = Math.max(1, st.every | 0);
      let per = Math.max(1, st.per | 0);
      if (st.mode === 'end') {
        const days = Math.max(1, U.diffDays(st.start, st.end) + 1);
        const count = Math.max(1, Math.floor(days / every));
        per = Math.ceil((to - from + 1) / count);
      }
      const out = [];
      let p = from, i = 0;
      while (p <= to && i < 400) {
        const a = p, z = Math.min(to, p + per - 1);
        const s = U.addDays(st.start, i * every);
        out.push({ id: 'w' + (i + 1), n: i + 1, from: a, to: z, start: s, due: U.addDays(s, every - 1) });
        p = z + 1;
        i++;
      }
      return { out, per };
    };
    const preview = () => {
      const { out, per } = gen();
      if (!out.length) return '';
      const show = out.length > 5 ? [...out.slice(0, 3), null, out[out.length - 1]] : out;
      return `<div class="pv-sum">${V.star(L.num(out.length), 'gold')}<div><b>${L.count(out.length, 'wird')} • ${L.count(per, 'page')} ${L('للورد', 'each')}</b><small>${L(`آخر ورد: ${L.day(out[out.length - 1].due)}`, `Last one due ${L.day(out[out.length - 1].due)}`)}${V.showHijri && V.showHijri() && L.hijri ? ` (${L.hijri(out[out.length - 1].due)})` : ''} • ${L(`حوالي ${L.count(Math.ceil(per / Math.max(1, st.every)), 'page')} في اليوم`, `about ${Math.ceil(per / Math.max(1, st.every))} pages a day`)}</small></div></div>
        <ol class="pv-list">${show.map((w) => (w ? `<li><span class="star8 xs faint"><b>${L.num(w.n)}</b></span><span>${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)}</span><small>${L.day(w.start)}${w.due !== w.start ? ' → ' + L.day(w.due) : ''}</small></li>` : '<li class="gap">⋯</li>')).join('')}</ol>`;
    };
    V.sheet({
      title: L('خطة القراءة', 'Reading plan'),
      wide: true,
      html: `<form id="pl-form" class="plan-form">
        ${V.planPresets ? `<div class="chips wrap pl-presets">${V.planPresets(b.pages).map((p) => `<button type="button" class="chip" data-preset="${p.id}">${p.t}</button>`).join('')}</div>` : ''}
        <div class="form grid2">
          <div><label for="pl-from">${L('من صفحة', 'From page')}</label><input id="pl-from" type="number" min="1" max="${b.pages}" value="${st.from}"></div>
          <div><label for="pl-to">${L('لحد صفحة', 'To page')}</label><input id="pl-to" type="number" min="1" max="${b.pages}" value="${st.to}"></div>
          <div><label for="pl-start">${L('نبدأ يوم', 'Start date')}</label><input id="pl-start" type="date" value="${st.start}"></div>
          <div><label for="pl-every">${L('كل ورد مدته', 'Each portion lasts')}</label><select id="pl-every">${[[1, L('يوم', '1 day')], [2, L('يومين', '2 days')], [3, L('٣ أيام', '3 days')], [7, L('أسبوع', '1 week')], [14, L('أسبوعين', '2 weeks')]].map(([v, t]) => `<option value="${v}" ${st.every === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="seg-pick" role="radiogroup"><label class="sp on"><input type="radio" name="pl-mode" value="per" checked><span>${L('بعدد الصفحات', 'By pages')}</span></label><label class="sp"><input type="radio" name="pl-mode" value="end"><span>${L('نخلّص في ميعاد', 'By finish date')}</span></label></div>
        <div class="form grid2"><div id="pl-per-w"><label for="pl-per">${L('صفحات كل ورد', 'Pages per portion')}</label><input id="pl-per" type="number" min="1" max="${b.pages}" value="${st.per}"></div>
          <div id="pl-end-w" hidden><label for="pl-end">${L('نخلّص يوم', 'Finish by')}</label><input id="pl-end" type="date" value="${st.end}"></div></div>
        <div class="pv" id="pl-pv">${preview()}</div>
        ${hadDone ? `<p class="warn-t">${icon('info')}${L('فيه ناس علّمت أوراد خلصانة. لو غيّرت الخطة، العلامات بتفضل على نفس رقم الورد.', 'Some portions are already marked done. Changing the plan keeps marks on the same portion numbers.')}</p>` : ''}
        <div class="row-btns end"><button class="btn gold big">${icon('check')}${L('اعتمد الخطة', 'Save plan')}</button></div></form>`,
      onMount: (body, api) => {
        const read = () => {
          st.from = +body.querySelector('#pl-from').value;
          st.to = +body.querySelector('#pl-to').value;
          st.start = body.querySelector('#pl-start').value || U.today();
          st.every = +body.querySelector('#pl-every').value;
          st.per = +body.querySelector('#pl-per').value;
          st.end = body.querySelector('#pl-end').value || st.end;
          st.mode = (body.querySelector('input[name=pl-mode]:checked') || {}).value || 'per';
          body.querySelector('#pl-per-w').hidden = st.mode !== 'per';
          body.querySelector('#pl-end-w').hidden = st.mode !== 'end';
          body.querySelectorAll('.seg-pick .sp').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
          body.querySelector('#pl-pv').innerHTML = preview();
        };
        body.addEventListener('input', read);
        body.addEventListener('change', read);
        body.addEventListener('click', (e) => {
          const pb = e.target.closest('[data-preset]');
          if (!pb) return;
          read();
          const preset = V.planPresets(b.pages).find((x) => x.id === pb.dataset.preset);
          preset.apply(st);
          body.querySelector('#pl-every').value = String(st.every);
          body.querySelector('#pl-per').value = st.per;
          body.querySelector('#pl-end').value = st.end;
          body.querySelectorAll('input[name=pl-mode]').forEach((r) => (r.checked = r.value === st.mode));
          body.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === pb));
          read();
        });
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          read();
          const { out } = gen();
          if (!out.length) return;
          api.close();
          await D.update(`books/${id}`, { wirds: out, status: b.status === 'planned' && st.start <= U.today() ? 'reading' : b.status || 'reading' });
          U.chime('ok');
          U.toast(L(`الخطة جاهزة: ${L.count(out.length, 'wird')}`, `Plan ready: ${out.length} portions`));
        });
      },
    });
  };

  /* ---------- download ---------- */
  V.download = async (id) => {
    const b = S.books.get(id);
    if (!b) return;
    if (!S.downloads) return U.toast(L('التحميل مش متاح في العرض ده', 'Downloads are not available in this view'), 'warn');
    const parts = b.parts || [];
    if (!parts.length) return U.toast(L('الكتاب ده مش مرفوع', 'This book has no uploaded file'), 'warn');
    const name = (b.title || 'book').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'book';
    const save = async (data, filename) => {
      try {
        await S.downloads.save({ filename, data });
      } catch (e) {
        if (e && e.code === 'declined') return;
        U.toast(L('التحميل ماكملش', 'Download did not complete'), 'warn');
      }
    };
    const getAll = async (onP) => {
      const bufs = [];
      for (let i = 0; i < parts.length; i++) bufs.push(await A.R.partBytes(parts[i], (f) => onP && onP((i + f) / parts.length)));
      return bufs;
    };
    if (parts.length === 1) {
      U.toast(L('بنجهّز الملف…', 'Preparing the file…'));
      try {
        const [buf] = await getAll();
        await save(new Blob([buf], { type: 'application/pdf' }), name + '.pdf');
      } catch (e) {
        U.toast(L('مقدرتش أجيب الملف. اتأكد من النت.', "Couldn't fetch the file. Check your connection."), 'warn');
      }
      return;
    }
    V.sheet({
      title: L('حمّل الكتاب', 'Download the book'),
      html: `<p class="muted">${L(`الكتاب مترفع ${L.num(parts.length)} أجزاء. ممكن نجمّعهم ملف واحد أو تحمّل كل جزء لوحده.`, `This book is stored in ${parts.length} parts. Merge them into one file, or download each part.`)}</p>
        <button class="btn gold full" data-merge>${icon('layers')}${L('ملف واحد كامل', 'One complete file')}</button><div id="dl-prog"></div>
        <ul class="dl-parts">${parts.map((p, i) => `<li><span>${L(`الجزء ${L.num(i + 1)} • ص ${L.num(p.from)}–${L.num(p.to)}`, `Part ${i + 1} • p. ${p.from}–${p.to}`)}</span><button class="btn ghost sm" data-part="${i}">${icon('download')}</button></li>`).join('')}</ul>`,
      onMount: (body) =>
        body.addEventListener('click', async (e) => {
          const pr = (f) => (body.querySelector('#dl-prog').innerHTML = V.bar(f, 'gold'));
          if (e.target.closest('[data-merge]')) {
            try {
              pr(0.02);
              const bufs = await getAll((f) => pr(f * 0.7));
              await U.loadScript(U.CDN.pdflib);
              const { PDFDocument } = window.PDFLib;
              const out = await PDFDocument.create();
              for (let i = 0; i < bufs.length; i++) {
                const src = await PDFDocument.load(bufs[i], { ignoreEncryption: true });
                const pages = await out.copyPages(src, src.getPageIndices());
                pages.forEach((p) => out.addPage(p));
                pr(0.7 + (0.25 * (i + 1)) / bufs.length);
              }
              const bytes = await out.save();
              pr(1);
              await save(new Blob([bytes], { type: 'application/pdf' }), name + '.pdf');
            } catch (er) {
              console.warn(er);
              U.toast(L('التجميع تقيل على الجهاز ده. حمّل الأجزاء واحد واحد.', 'Merging is too heavy for this device. Download the parts one by one.'), 'warn');
            }
          }
          const pb = e.target.closest('[data-part]');
          if (pb) {
            const i = +pb.dataset.part;
            try {
              const buf = await A.R.partBytes(parts[i]);
              await save(new Blob([buf], { type: 'application/pdf' }), `${name} (${i + 1}).pdf`);
            } catch (er) {
              U.toast(L('مقدرتش أجيب الجزء ده', "Couldn't fetch that part"), 'warn');
            }
          }
        }),
    });
  };

  /* ---------- ask Claude ---------- */
  V.askPage = async (bookId, page) => {
    const b = S.books.get(bookId);
    const presets = [
      [L('اشرحلي الصفحة دي ببساطة', 'Explain this page simply'), 'explain'],
      [L('لخّص الصفحة في نقط', 'Summarise the page in bullet points'), 'sum'],
      [L('اقترح ٣ أسئلة للنقاش', 'Suggest 3 discussion questions'), 'qs'],
      [L('عرّفني بالكلمات الصعبة', 'Define the difficult words'), 'words'],
    ];
    let busy = null;
    const api = V.sheet({
      title: `${icon('claude')} ${L(`اسأل Claude عن ص ${L.num(page)}`, `Ask Claude about p. ${page}`)}`,
      html: `<div class="chips wrap">${presets.map(([t]) => `<button class="chip" data-q="${esc(t)}">${t}</button>`).join('')}</div>
        <form id="ask-form" class="composer tall"><textarea id="ask-q" rows="2" dir="auto" placeholder="${L('أو اكتب سؤالك…', 'Or type your own question…')}"></textarea><button class="btn icon-only" aria-label="${L('اسأل', 'Ask')}">${icon('send', 'flip-rtl')}</button></form>
        <div class="ask-out" id="ask-out" dir="auto" hidden></div>
        <div class="row-btns" id="ask-acts" hidden><button class="btn ghost sm" data-copy>${L('انسخ', 'Copy')}</button>${D.canWrite() ? `<button class="btn sm" data-share>${icon('chat')}${L('شاركها في النقاش', 'Share in discussion')}</button>` : ''}</div>
        <small class="muted">${L('Claude بيشوف صورة الصفحة بس. الإجابات ممكن تغلط، فراجعها.', 'Claude sees only an image of this page. Answers can be wrong, so double-check.')}</small>`,
      onMount: (body) => {
        const run = async (q) => {
          if (busy) busy.abort();
          busy = new AbortController();
          const out = body.querySelector('#ask-out');
          out.hidden = false;
          out.textContent = L('بفكّر…', 'Thinking…');
          body.querySelector('#ask-acts').hidden = true;
          try {
            const limits = await S.sample.limits().catch(() => null);
            let img = limits && limits.images ? await A.R.pageImage() : null;
            const ask = (withImg) => {
              const prompt = `You are helping a small reading circle of friends and family. ${withImg ? `The attached image is page ${page} of the book "${b.title}"${b.author ? ` by ${b.author}` : ''}.` : `We are on page ${page} of "${b.title}"${b.author ? ` by ${b.author}` : ''} (no page image is available, so rely on what you know about the book and say so if unsure).`}\nRequest: ${q}\nAnswer in ${L.isAr() ? 'clear, friendly Arabic (simple Modern Standard Arabic, Egyptian-friendly)' : 'clear, friendly English'}. Keep it short: a few short paragraphs or bullet points. Plain text only, no markdown headings.`;
              const opts = { signal: busy.signal, cache: false, onText: ({ text }) => (out.textContent = text) };
              if (withImg) opts.images = [withImg];
              return S.sample(prompt, opts);
            };
            let res;
            try {
              res = await ask(img);
            } catch (er) {
              if (img && er && (er.code === 'images_unavailable' || er.code === 'image_rejected')) res = await ask(null);
              else throw er;
            }
            out.textContent = res.text;
            body.querySelector('#ask-acts').hidden = false;
            out.dataset.q = q;
          } catch (e) {
            if (e && e.name === 'AbortError') return;
            out.textContent = e && e.code === 'not_granted' ? L('محتاج توافق إن الصفحة تسأل Claude. جرّب تاني ووافق.', 'This page needs your permission to ask Claude. Try again and allow it.') : e && e.code === 'rate_limited' ? L('وصلت للحد بتاعك دلوقتي. جرّب بعد شوية.', 'You have hit your usage limit for now. Try again later.') : L('حصلت مشكلة. جرّب تاني.', 'Something went wrong. Try again.');
          }
        };
        body.addEventListener('click', async (e) => {
          const c = e.target.closest('[data-q]');
          if (c) run(c.dataset.q);
          if (e.target.closest('[data-copy]')) {
            const ok = await U.copy(body.querySelector('#ask-out').textContent, body.querySelector('#ask-out'));
            U.toast(ok ? L('اتنسخ', 'Copied') : L('اختار النص وانسخه', 'Select the text to copy'));
          }
          if (e.target.closest('[data-share]')) {
            const w = G.wirds(b).find((x) => page >= x.from && page <= x.to);
            const out = body.querySelector('#ask-out');
            await D.set(`msgs/${D.newId()}`, { b: bookId, ch: w ? w.id : 'gen', by: S.me, kind: 'ai', text: `${L('سألت Claude عن ص', 'Asked Claude about p.')} ${L.num(page)}: «${out.dataset.q}»\n\n${out.textContent}`.slice(0, 2000), at: U.nowIso(), re: '', react: {} });
            api.close();
            U.toast(L('اتشاركت في النقاش', 'Shared in the discussion'));
          }
        });
        body.addEventListener('submit', (e) => {
          e.preventDefault();
          const q = body.querySelector('#ask-q').value.trim();
          if (q) run(q);
        });
      },
    });
    api.onClose = () => busy && busy.abort();
  };

  V.askBook = (id) => {
    const b = S.books.get(id);
    const w = G.groupCurrent(b);
    V.sheet({
      title: `${icon('claude')} ${L('أسئلة للنقاش', 'Discussion questions')}`,
      html: `<p class="muted">${w ? L(`لـلورد ${L.num(w.n)} (ص ${L.num(w.from)}–${L.num(w.to)})`, `For portion ${w.n} (p. ${w.from}–${w.to})`) : ''}</p><div class="ask-out" id="ab-out" dir="auto">${L('بفكّر…', 'Thinking…')}</div>`,
      onMount: async (body) => {
        try {
          const takes = [...S.notes.values()].filter((n) => n.b === id && (!w || n.wid === w.id) && n.text).slice(-12).map((n) => `- ${n.text.slice(0, 200)}`).join('\n');
          const prompt = `A reading circle is reading "${b.title}"${b.author ? ` by ${b.author}` : ''}${w ? `, currently pages ${w.from}-${w.to}` : ''}. ${takes ? `Some of their notes so far:\n${takes}\n` : ''}Suggest 4 thoughtful, open discussion questions for the group${w ? ' about this portion' : ''}. If you do not know the book, base them on the notes and keep them general. Answer in ${L.isAr() ? 'friendly Arabic' : 'friendly English'}, numbered, plain text.`;
          const out = body.querySelector('#ab-out');
          const res = await S.sample(prompt, { cache: false, onText: ({ text }) => (out.textContent = text) });
          out.textContent = res.text;
        } catch (e) {
          body.querySelector('#ab-out').textContent = L('مقدرتش أجيب أسئلة دلوقتي.', "Couldn't get questions right now.");
        }
      },
    });
  };
})();
