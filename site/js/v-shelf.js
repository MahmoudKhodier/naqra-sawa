/* My shelf: books I've read before, am reading, want to read. Yearly challenge. Friends' shelves. */
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

  const TAGS = [
    ['novel', 'رواية', 'Novel'], ['history', 'تاريخ', 'History'], ['religion', 'دين', 'Religion'], ['self', 'تطوير ذات', 'Self-help'],
    ['science', 'علوم', 'Science'], ['philo', 'فلسفة', 'Philosophy'], ['poetry', 'شعر', 'Poetry'], ['bio', 'سيرة', 'Biography'],
    ['business', 'بيزنس', 'Business'], ['kids', 'أطفال', 'Children'], ['tech', 'تكنولوجيا', 'Technology'], ['other', 'تاني', 'Other'],
  ];
  const tagName = (k) => {
    const t = TAGS.find((x) => x[0] === k);
    return t ? L(t[1], t[2]) : k;
  };
  const STATUS = { read: ['قرأته', 'Read'], reading: ['بقرأه', 'Reading'], want: ['عايز أقرأه', 'Want to read'] };

  /* Shelf items of a member, plus books finished together in the circle. */
  V.shelfItems = (uid) => {
    const sh = S.shelf.get(uid);
    const items = Object.entries((sh && sh.items) || {}).filter(([, it]) => it && it.title).map(([id, it]) => Object.assign({ id }, it));
    const linked = new Set(items.filter((x) => x.together).map((x) => x.together));
    for (const p of S.prog.values()) {
      if (p.u !== uid || !p.finished || linked.has(p.b)) continue;
      const b = S.books.get(p.b);
      if (b) items.push({ id: 'tg-' + b.id, title: b.title, author: b.author, status: 'read', together: b.id, finished: U.isoKey(p.finished).slice(0, 7), at: p.finished, virtual: true, pages: b.pages });
    }
    return items;
  };

  V.screens.shelf = (opts = {}) => {
    const uid = opts.uid && S.members.has(opts.uid) ? opts.uid : S.me;
    const mine = uid === S.me;
    const tab = opts.st || 'read';
    const all = V.shelfItems(uid);
    const counts = { read: 0, reading: 0, want: 0 };
    for (const it of all) counts[it.status] = (counts[it.status] || 0) + 1;
    const year = String(new Date().getFullYear());
    const m = S.members.get(uid) || {};
    const goal = (m.goal && +m.goal[year]) || 0;
    const doneYear = all.filter((x) => x.status === 'read' && String(x.finished || '').startsWith(year)).length;
    const list = all.filter((x) => x.status === tab).sort((a, b) => String(b.finished || b.at).localeCompare(String(a.finished || a.at)));
    const pagesTotal = all.filter((x) => x.status === 'read').reduce((s, x) => s + (+x.pages || 0), 0);
    const owners = D.memberIds();
    return `<div class="shelfpage">
      <header class="page-head"><div><h1>${mine ? L('مكتبتي', 'My shelf') : L(`مكتبة ${esc(D.name(uid))}`, `${esc(D.name(uid))}'s shelf`)}</h1><p class="muted">${L('كل الكتب اللي قريتها، بتقرأها، أو ناوي تقرأها', 'Everything read, in progress, or on the wish list')}</p></div>
        ${mine && D.canWrite() ? `<div class="row-btns"><button class="btn gold" data-act="shelf-add">${icon('plus')}${L('ضيف كتاب', 'Add a book')}</button><button class="btn ghost" data-act="bulk-shelf">${icon('list')}<span class="hide-xs">${L('ضيف كذا كتاب', 'Add many')}</span></button></div>` : ''}</header>
      <div class="owners" role="tablist">${owners.map((u) => `<button class="owner${u === uid ? ' on' : ''}" data-act="shelf-of" data-uid="${esc(u)}" role="tab" aria-selected="${u === uid}">${D.avatar(u, 'sm')}<span>${u === S.me ? L('أنا', 'Me') : esc(D.name(u))}</span></button>`).join('')}</div>
      <div class="shelf-top">
        <section class="card challenge">
          ${V.ring(goal ? doneYear / goal : 0, `<b>${L.num(doneYear)}</b><small>${goal ? '/ ' + L.num(goal) : ''}</small>`, doneYear >= goal && goal ? 'jade' : 'gold', 92)}
          <div><h3>${L(`تحدي ${L.num(+year, { useGrouping: false })}`, `${year} challenge`)}</h3>
            <p>${goal ? (doneYear >= goal ? L('حققت الهدف! 🎉 زوّده؟', 'Goal reached! 🎉 Raise it?') : L(`فاضل ${L.count(goal - doneYear, 'book')} على هدفك`, `${goal - doneYear} books to go`)) : mine ? L('حط هدف لعدد الكتب اللي عايز تقرأها السنة دي', 'Set how many books you want to read this year') : L('مفيش هدف لسه', 'No goal set yet')}</p>
            ${mine && D.canWrite() ? `<button class="btn ghost sm" data-act="set-goal">${icon('target')}${goal ? L('غيّر الهدف', 'Change goal') : L('حط هدف', 'Set a goal')}</button>` : ''}</div>
        </section>
        <section class="card shelf-stats">
          <div><b>${L.num(counts.read)}</b><small>${L('كتب مقروءة', 'books read')}</small></div>
          <div><b>${L.num(pagesTotal)}</b><small>${L('صفحة', 'pages')}</small></div>
          <div><b>${L.num(all.filter((x) => x.together).length)}</b><small>${L('مع الحلقة', 'with the circle')}</small></div>
        </section>
      </div>
      <nav class="tabs" role="tablist">${Object.entries(STATUS).map(([k, t]) => `<button role="tab" class="tab${k === tab ? ' on' : ''}" aria-selected="${k === tab}" data-act="shelf-tab" data-st="${k}" data-uid="${esc(uid)}"><span>${L(t[0], t[1])}</span><small>${L.num(counts[k] || 0)}</small></button>`).join('')}</nav>
      ${list.length ? shelfRows(list) : V.empty(tab === 'read' ? L('الرف فاضي', 'This shelf is empty') : L('مفيش حاجة هنا لسه', 'Nothing here yet'), mine ? L('ضيف الكتب اللي قريتها قبل كده — كل كتاب بـ ١٠ XP، والرأي بـ ٥ زيادة.', 'Add books you have read before — 10 XP each, plus 5 for a review.') : '', mine && D.canWrite() ? `<button class="btn gold" data-act="bulk-shelf">${icon('list')}${L('ضيف كذا كتاب مرة واحدة', 'Add several at once')}</button>` : '')}
    </div>`;
  };

  /* Spines on wooden shelves: 8 per row on wide screens, fewer on phones (CSS wraps). */
  function shelfRows(list) {
    return `<div class="bookshelf">${list
      .map((it) => {
        const [bg, fg] = U.spineOf(it.title + (it.author || ''));
        const h = 70 + (U.hash(it.title) % 30);
        return `<button class="spine${it.together ? ' together' : ''}" data-act="shelf-item" data-id="${esc(it.id)}" style="--bg:${bg};--fg:${fg};--h:${h}%;--w:${30 + (U.hash(it.id) % 14)}px" title="${esc(it.title)}">
          <span class="sp-body"><span class="sp-t" dir="auto">${esc(it.title)}</span>
          ${it.rating ? `<span class="sp-r">${'★'.repeat(it.rating)}</span>` : ''}
          ${it.together ? `<span class="sp-tg" aria-label="${L('قرأناه سوا', 'Read together')}"></span>` : ''}</span>
        </button>`;
      })
      .join('')}</div>
      <ul class="shelf-list">${list
        .map(
          (it) => `<li><button data-act="shelf-item" data-id="${esc(it.id)}">${V.coverOf ? V.coverOf(it, 'xs') : V.genCover(it.title, it.author, 'xs')}<span class="sl-t"><b dir="auto">${esc(it.title)}</b><small>${it.author ? `<span dir="auto">${esc(it.author)}</span>` : ''}${it.finished ? ` · ${it.finished.length === 4 ? L.num(+it.finished, { useGrouping: false }) : L.monthYear(it.finished)}` : ''}${it.together ? ` · <span class="gold-t">${L('قرأناه سوا', 'Read together')}</span>` : ''}</small></span>${it.rating ? V.stars(it.rating) : ''}</button></li>`
        )
        .join('')}</ul>`;
  }

  V.actions['shelf-of'] = (a) => V.go('shelf', { uid: a.dataset.uid });
  V.actions['shelf-tab'] = (a) => V.go('shelf', { uid: a.dataset.uid, st: a.dataset.st });
  V.actions['shelf-add'] = () => V.shelfForm();
  V.actions['bulk-shelf'] = () => V.bulkShelf();
  V.actions['shelf-item'] = (a) => {
    const uid = (V.state.opts && V.state.opts.uid) || S.me;
    const it = V.shelfItems(uid).find((x) => x.id === a.dataset.id);
    if (it) V.shelfDetail(uid, it);
  };

  V.saveShelfItem = async (id, item) => {
    if (!D.canWrite()) return;
    const iid = id || D.newId();
    const isNew = !id || String(id).startsWith('tg-');
    const realId = String(iid).startsWith('tg-') ? D.newId() : iid;
    const prev = id && S.shelf.get(S.me) && S.shelf.get(S.me).items ? S.shelf.get(S.me).items[id] : null;
    await D.mutate(`shelf/${S.me}`, () => {
      const cur = S.shelf.get(S.me) || {};
      const items = Object.assign({}, cur.items || {});
      const base = items[realId] || {};
      items[realId] = V.clean(Object.assign({}, base, item, { at: base.at || U.nowIso(), updatedAt: U.nowIso() }));
      return { items };
    });
    const gain = (isNew && item.status === 'read' ? G.XP.shelf : 0) + (item.review && item.review.length >= 20 && !(prev && prev.review && prev.review.length >= 20) ? G.XP.review : 0);
    U.chime('soft');
    if (gain) U.xpPop(gain, L('مكتبتي', 'My shelf'));
    else U.toast(L('اتحفظ في مكتبتك', 'Saved to your shelf'));
  };

  V.shelfForm = (it = null) => {
    const v = it || { status: 'read', rating: 0, tags: [] };
    V.sheet({
      title: it ? L('عدّل الكتاب', 'Edit book') : L('ضيف كتاب لمكتبتك', 'Add a book to your shelf'),
      html: `${A.B ? A.B.box('sf-bs') : ''}<form id="sf-form" class="form">
        ${A.B ? A.B.coverField('sf-cover', v.cover, v.title) : ''}
        <label for="sf-title">${L('اسم الكتاب', 'Title')}</label><input id="sf-title" required maxlength="140" dir="auto" value="${esc(v.title || '')}" autofocus>
        <label for="sf-author">${L('المؤلف', 'Author')}</label><input id="sf-author" maxlength="100" dir="auto" value="${esc(v.author || '')}">
        <span class="lbl">${L('الحالة', 'Status')}</span>
        <div class="seg-pick">${Object.entries(STATUS).map(([k, t]) => `<label class="sp${v.status === k ? ' on' : ''}"><input type="radio" name="sf-status" value="${k}" ${v.status === k ? 'checked' : ''}><span>${L(t[0], t[1])}</span></label>`).join('')}</div>
        <div class="grid2"><div><label for="sf-fin">${L('خلّصته إمتى؟', 'Finished when?')}</label><input id="sf-fin" type="month" value="${esc(v.finished && v.finished.length === 7 ? v.finished : '')}"></div>
          <div><label for="sf-pages">${L('عدد الصفحات', 'Pages')}</label><input id="sf-pages" type="number" min="0" max="20000" value="${esc(v.pages || '')}"></div></div>
        <span class="lbl">${L('تقييمك', 'Your rating')}</span>${V.stars(v.rating || 0, true, 'sf-stars')}
        <label for="sf-review">${L('رأيك في الكتاب', 'Your review')} <small class="muted">(+${L.num(G.XP.review)} XP ${L('لو أكتر من سطر', 'if more than a line')})</small></label><textarea id="sf-review" rows="3" maxlength="1500" dir="auto">${esc(v.review || '')}</textarea>
        <span class="lbl">${L('تصنيف', 'Tags')}</span>
        <div class="chips wrap" id="sf-tags">${TAGS.map(([k]) => `<button type="button" class="chip${(v.tags || []).includes(k) ? ' on' : ''}" data-tag="${k}">${tagName(k)}</button>`).join('')}</div>
        <div class="row-btns end"><button class="btn gold">${icon('check')}${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) => {
        V.bindStars(body);
        if (A.B) {
          const title = () => body.querySelector('#sf-title').value;
          A.B.bindCover(body, 'sf-cover', title);
          A.B.bind(body, 'sf-bs', (b) => {
            body.querySelector('#sf-title').value = b.title;
            body.querySelector('#sf-author').value = b.author;
            if (b.pages) body.querySelector('#sf-pages').value = b.pages;
            if (b.cover) A.B.setCover(body, 'sf-cover', b.cover, b.title);
            body.querySelector('#sf-title').focus();
          });
        }
        body.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tag]');
          if (t) t.classList.toggle('on');
        });
        body.addEventListener('change', () => body.querySelectorAll('.seg-pick .sp').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)));
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = body.querySelector('#sf-title').value.trim();
          if (!title) return;
          const item = {
            title,
            author: body.querySelector('#sf-author').value.trim(),
            status: (body.querySelector('input[name=sf-status]:checked') || {}).value || 'read',
            finished: body.querySelector('#sf-fin').value || (it && it.finished) || '',
            pages: +body.querySelector('#sf-pages').value || 0,
            rating: +body.querySelector('#sf-stars').dataset.v || 0,
            review: body.querySelector('#sf-review').value.trim(),
            tags: [...body.querySelectorAll('#sf-tags .chip.on')].map((x) => x.dataset.tag),
          };
          if (A.B) item.cover = A.B.coverValue(body, 'sf-cover');
          if (it && it.together) item.together = it.together;
          api.close();
          await V.saveShelfItem(it ? it.id : null, item);
        });
      },
    });
  };

  V.bulkShelf = () => {
    V.sheet({
      title: L('ضيف الكتب اللي قريتها', 'Add books you have read'),
      html: `<p class="muted">${L('اكتب كل كتاب في سطر. لو عايز تكتب المؤلف حطه بعد شرطة: «العنوان - المؤلف».', 'One book per line. Add the author after a dash: “Title - Author”.')}</p>
        <textarea id="bulk-text" rows="8" dir="auto" autofocus placeholder="${L('ثلاثية غرناطة - رضوى عاشور\nعبقرية عمر - العقاد\nالأيام - طه حسين', 'Atomic Habits - James Clear\nSapiens - Yuval Noah Harari')}"></textarea>
        <div class="grid2"><div><label for="bulk-status">${L('الحالة', 'Status')}</label><select id="bulk-status"><option value="read">${L('قرأته', 'Read')}</option><option value="want">${L('عايز أقرأه', 'Want to read')}</option></select></div><div><label for="bulk-year">${L('سنة القراية (اختياري)', 'Year read (optional)')}</label><input id="bulk-year" type="number" min="1950" max="2100" placeholder="${new Date().getFullYear()}"></div></div>
        <p class="muted sm" id="bulk-count"></p>
        <div class="row-btns end"><button class="btn gold" data-bulk>${icon('check')}${L('ضيفهم', 'Add them')}</button></div>`,
      onMount: (body, api) => {
        const parse = () =>
          body
            .querySelector('#bulk-text')
            .value.split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 200)
            .map((l) => {
              const m = l.split(/\s+[-–—|]\s+/);
              return { title: m[0].trim().slice(0, 140), author: (m[1] || '').trim().slice(0, 100) };
            });
        body.addEventListener('input', () => {
          const n = parse().length;
          const st = body.querySelector('#bulk-status').value;
          body.querySelector('#bulk-count').textContent = n ? L(`${L.count(n, 'book')}${st === 'read' ? ` · +${L.num(n * G.XP.shelf)} XP` : ''}`, `${n} books${st === 'read' ? ` · +${n * G.XP.shelf} XP` : ''}`) : '';
        });
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-bulk]')) return;
          const rows = parse();
          if (!rows.length) return;
          const status = body.querySelector('#bulk-status').value;
          const y = body.querySelector('#bulk-year').value;
          api.close();
          const t = U.nowIso();
          await D.mutate(`shelf/${S.me}`, () => {
            const cur = S.shelf.get(S.me) || {};
            const items = Object.assign({}, cur.items || {});
            for (const r of rows) items[D.newId()] = { title: r.title, author: r.author, status, finished: y ? String(y) : '', rating: 0, review: '', tags: [], pages: 0, at: t, updatedAt: t };
            return { items };
          });
          U.confetti(0.7);
          U.chime('ok');
          if (status === 'read') U.xpPop(rows.length * G.XP.shelf, L.count(rows.length, 'book'));
          V.go('shelf', { st: status });
        });
      },
    });
  };

  V.shelfDetail = (uid, it) => {
    const mine = uid === S.me;
    const book = it.together ? S.books.get(it.together) : null;
    V.sheet({
      title: L(STATUS[it.status][0], STATUS[it.status][1]),
      html: `<div class="sd">${book ? V.cover(book, 'md') : V.coverOf ? V.coverOf(it, 'md') : V.genCover(it.title, it.author, 'md')}
        <div class="sd-info"><h2 dir="auto">${esc(it.title)}</h2>${it.author ? `<p class="muted" dir="auto">${esc(it.author)}</p>` : ''}
          ${it.rating ? V.stars(it.rating) : ''}
          <div class="meta-chips">${it.finished ? `<span>${icon('calendar')}${it.finished.length === 4 ? L.num(+it.finished, { useGrouping: false }) : L.monthYear(it.finished)}</span>` : ''}${it.pages ? `<span>${icon('scroll')}${L.count(+it.pages, 'page')}</span>` : ''}${it.together ? `<span class="gold-t">${icon('users')}${L('قرأناه سوا', 'Read together')}</span>` : ''}${(it.tags || []).map((t) => `<span>${tagName(t)}</span>`).join('')}</div>
        </div></div>
        ${it.review ? `<blockquote class="review" dir="auto">${esc(it.review)}</blockquote>` : ''}
        <div class="row-btns">
          ${mine && D.canWrite() ? `<button class="btn" data-edit>${icon('edit')}${it.virtual ? L('قيّم الكتاب', 'Rate it') : L('عدّل', 'Edit')}</button>${!it.virtual ? `<button class="btn ghost" data-del>${icon('trash')}${L('شيله', 'Remove')}</button>` : ''}` : ''}
          ${!mine && D.canWrite() ? `<button class="btn" data-want>${icon('bookmark')}${L('عايز أقرأه', 'I want to read it')}</button>` : ''}
          ${D.canWrite() && !it.together ? `<button class="btn ghost" data-prop>${icon('vote')}${L('اقترحه على الحلقة', 'Suggest to the circle')}</button>` : ''}
        </div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          if (e.target.closest('[data-edit]')) {
            api.close();
            V.shelfForm(it);
          }
          if (e.target.closest('[data-del]')) {
            if (!(await V.confirm(L(`هتشيل «${esc(it.title)}» من مكتبتك.`, `Remove “${esc(it.title)}” from your shelf?`), L('شيله', 'Remove'), true))) return;
            api.close();
            await D.mutate(`shelf/${S.me}`, () => {
              const cur = S.shelf.get(S.me) || {};
              const items = Object.assign({}, cur.items || {});
              delete items[it.id];
              return { items };
            });
          }
          if (e.target.closest('[data-want]')) {
            api.close();
            await V.saveShelfItem(null, { title: it.title, author: it.author || '', status: 'want', rating: 0, review: '', tags: it.tags || [], pages: +it.pages || 0, cover: it.cover || '', from: uid });
          }
          if (e.target.closest('[data-prop]')) {
            api.close();
            V.propose({ title: it.title, author: it.author, cover: it.cover || '' });
          }
        }),
    });
  };

  V.actions['set-goal'] = () => {
    const year = String(new Date().getFullYear());
    const m = S.members.get(S.me) || {};
    const cur = (m.goal && m.goal[year]) || 12;
    V.sheet({
      title: L(`هدف ${L.num(+year, { useGrouping: false })}`, `${year} goal`),
      html: `<form id="goal-form" class="form"><label for="goal-n">${L('عايز تقرأ كام كتاب السنة دي؟', 'How many books this year?')}</label>
        <div class="stepper"><button type="button" class="ib" data-d="-1" aria-label="-">−</button><input id="goal-n" type="number" min="1" max="365" value="${cur}"><button type="button" class="ib" data-d="1" aria-label="+">+</button></div>
        <div class="chips">${[6, 12, 24, 52].map((n) => `<button type="button" class="chip" data-n="${n}">${L.num(n)}</button>`).join('')}</div>
        <div class="row-btns end"><button class="btn gold">${icon('target')}${L('احفظ الهدف', 'Save goal')}</button></div></form>`,
      onMount: (body, api) => {
        const inp = body.querySelector('#goal-n');
        body.addEventListener('click', (e) => {
          const d = e.target.closest('[data-d]');
          if (d) inp.value = U.clamp((+inp.value || 0) + +d.dataset.d, 1, 365);
          const n = e.target.closest('[data-n]');
          if (n) inp.value = n.dataset.n;
        });
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const n = U.clamp(+inp.value || 12, 1, 365);
          api.close();
          await D.updateMe((m2) => ({ goal: Object.assign({}, m2.goal || {}, { [year]: n }) }));
          U.toast(L(`هدفك ${L.count(n, 'book')} السنة دي. يلا!`, `Goal set: ${n} books this year. Go!`));
        });
      },
    });
  };
})();
