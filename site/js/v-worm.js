/* For bookworms: «مين ذوقه شبهك» (taste match between members, with picks from their favourites), «اختارلي كتاب»
   (a random book from my want list) and personal challenges (stored on my member doc as `challenges`). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const W = (V.worm = {});

  /* ---------- shared bits ---------- */
  // The shelf's categories, from v-shelf.js (loaded before this file).
  const TAGS = V.SHELF_TAGS;
  const tagName = (k) => V.shelfTagName(k);
  const bkey = (it) => A.Imp.key(it.title, it.author);
  const akey = (author) => A.Imp.key('', author).split('|')[1] || '';
  const pct = (n) => L(`${L.num(n)}٪`, `${n}%`);
  const cover = (it, cls) => (V.coverOf ? V.coverOf(it, cls) : V.genCover(it.title, it.author, cls));
  const myLists = () => (V.shelfLists ? V.shelfLists(S.me).map((x) => x[0]) : [...new Set(V.shelfItems(S.me).flatMap((x) => x.lists || []))]);
  const ready = () => S.phase === 'ready' && S.loaded.members && S.loaded.shelf && D.joined();
  const inter = (a, b) => [...a].filter((x) => b.has(x)).length;

  /* ---------- taste match ---------- */
  const MIN_COMMON = 3;
  /* Books a member has read, one per title+author (the rated copy wins). */
  function readMap(uid) {
    const m = new Map();
    for (const it of V.shelfItems(uid)) {
      if (it.status !== 'read') continue;
      const k = bkey(it);
      const prev = m.get(k);
      if (!prev || (it.rating && !prev.rating)) m.set(k, it);
    }
    return m;
  }
  /* 0–100 from the books both have read: how close the ratings are (when both rated), how much the two shelves
     overlap, and shared authors and categories. null when fewer than MIN_COMMON books are in common. */
  W.taste = (a, b) => {
    const ma = readMap(a), mb = readMap(b);
    const common = [...ma.keys()].filter((k) => mb.has(k));
    const out = { score: null, common: common.length, loved: [] };
    if (common.length < MIN_COMMON) return out;
    let rs = 0, rn = 0;
    for (const k of common) {
      const ra = +ma.get(k).rating || 0, rb = +mb.get(k).rating || 0;
      if (ra && rb) {
        rs += 1 - Math.abs(ra - rb) / 4;
        rn++;
      }
      if (ra >= 4 && rb >= 4) out.loved.push(ma.get(k));
    }
    const sets = (mp, f) => new Set([...mp.values()].flatMap(f).filter(Boolean));
    const overlap = (x, y) => (x.size && y.size ? inter(x, y) / Math.min(x.size, y.size) : null);
    const authors = overlap(sets(ma, (x) => [akey(x.author)]), sets(mb, (x) => [akey(x.author)]));
    const tags = overlap(sets(ma, (x) => x.tags || []), sets(mb, (x) => x.tags || []));
    const parts = [[rn ? rs / rn : null, 0.5], [common.length / Math.min(ma.size, mb.size), 0.2], [authors, 0.2], [tags, 0.1]].filter((p) => p[0] != null);
    const wsum = parts.reduce((t, p) => t + p[1], 0);
    out.score = Math.round((100 * parts.reduce((t, p) => t + p[0] * p[1], 0)) / wsum);
    return out;
  };
  const added = new Set(); // recommendations I added to my want list on this visit: they stay, marked as added
  /* Up to 6 of a member's 4–5★ books that are not on my shelf. */
  W.recs = (uid) => {
    const mine = new Map(V.shelfItems(S.me).map((x) => [bkey(x), x]));
    return [...readMap(uid).values()]
      .filter((x) => (+x.rating || 0) >= 4 && (!mine.has(bkey(x)) || added.has(bkey(x))))
      .sort((x, y) => (y.rating || 0) - (x.rating || 0) || String(y.finished || y.at || '').localeCompare(String(x.finished || x.at || '')))
      .slice(0, 6);
  };

  function tasteOther(uid) {
    const t = W.taste(S.me, uid);
    const recs = W.recs(uid);
    if (!readMap(uid).size) return '';
    const name = esc(D.name(uid));
    const mineKeys = new Set(V.shelfItems(S.me).map(bkey));
    const head = t.score != null
      ? `<div class="wm-score">${V.ring(t.score / 100, `<b>${pct(t.score)}</b>`, t.score >= 70 ? 'jade' : 'gold', 64)}<div><b class="wm-pct-t">${L(`ذوقكم شبه بعض ${pct(t.score)}`, `Your tastes match ${pct(t.score)}`, `ذوقكما متشابه بنسبة ${pct(t.score)}`)}</b><small class="muted">${L(`من ${L.count(t.common, 'book')} قريتوها انتو الاتنين`, `from ${L.count(t.common, 'book')} you have both read`, `من ${L.count(t.common, 'book')} قرأتماها كلاكما`)}</small></div></div>`
      : `<p class="muted wm-few">${L(`لسه مفيش كتب مشتركة كفاية عشان نقارن — محتاجين ${L.count(MIN_COMMON, 'book')} على الأقل قريتوها انتو الاتنين${t.common ? ` (عندكم ${L.num(t.common)})` : ''}.`, `Not enough books in common to compare yet — at least ${MIN_COMMON} you have both read are needed${t.common ? ` (you have ${t.common})` : ''}.`, `لا توجد كتب مشتركة كافية للمقارنة بعد — نحتاج إلى ${L.count(MIN_COMMON, 'book')} على الأقل قرأتماها كلاكما${t.common ? ` (لديكما ${L.num(t.common)})` : ''}.`)}</p>`;
    const loved = t.loved.length
      ? `<h4 class="wm-h4">${icon('heart')}${L('كتب حبيتوها انتو الاتنين', 'Books you both loved', 'كتب أحببتماها كلاكما')}</h4><div class="wm-loved">${t.loved
        .slice(0, 8)
        .map((x) => `<span class="wm-lv">${cover(x, 'xs')}<span dir="auto">${esc(x.title)}</span></span>`)
        .join('')}</div>`
      : '';
    const recHtml = recs.length
      ? `<h4 class="wm-h4">${icon('sparkle')}${L(`من كتب ${name} المفضلة ومش عندك`, `${name}'s favourites you don't have`, `من كتب ${name} المفضلة وليست لديك`)}</h4><ul class="wm-recs">${recs
        .map((x) => {
          const on = mineKeys.has(bkey(x));
          return `<li>${cover(x, 'xs')}<span class="wm-rt"><b dir="auto">${esc(x.title)}</b>${x.author ? `<small dir="auto">${esc(x.author)}</small>` : ''}</span>${V.stars(x.rating)}${on ? `<span class="wm-added">${icon('check')}${L('في «عايز أقرأه»', 'In “Want to read”', 'في «أريد قراءته»')}</span>` : D.canWrite() ? `<button class="btn sm ghost" data-act="wm-want" data-uid="${esc(uid)}" data-id="${esc(x.id)}">${icon('bookmark')}${L('عايز أقرأه', 'Want to read', 'أريد قراءته')}</button>` : ''}</li>`;
        })
        .join('')}</ul>`
      : '';
    return `<section class="card wm-card wm-taste" id="wm-taste"><header class="sec-h"><h2>${icon('sparkle')}${L('ذوقكم في القراية', 'Your reading tastes', 'ذوقكما في القراءة')}</h2></header>${head}${loved}${recHtml}</section>`;
  }

  function tasteMine() {
    const others = D.memberIds().filter((u) => u !== S.me);
    if (!others.length) return '';
    const rows = others.map((u) => ({ u, t: W.taste(S.me, u) }));
    const scored = rows.filter((r) => r.t.score != null).sort((a, b) => b.t.score - a.t.score);
    const rest = rows.length - scored.length;
    const list = scored.length
      ? `<ol class="wm-rank">${scored
        .map((r, i) => `<li><button class="wm-row" data-go="me" data-uid="${esc(r.u)}"><span class="wm-n">${L.num(i + 1)}</span>${D.avatar(r.u, 'sm')}<span class="wm-rn"><b dir="auto">${esc(D.name(r.u))}</b>${V.bar(r.t.score / 100, r.t.score >= 70 ? 'jade' : 'gold')}</span><b class="wm-pct">${pct(r.t.score)}</b></button></li>`)
        .join('')}</ol>`
      : '';
    const note = rest
      ? `<p class="muted sm">${scored.length ? L(`و${L.count(rest, 'member')} لسه مفيش كتب مشتركة كفاية.`, `${L.count(rest, 'member')} without enough books in common yet.`, `و${L.count(rest, 'member')} بلا كتب مشتركة كافية بعد.`) : L(`لما تقرأ انت وحد من الحلقة ${L.count(MIN_COMMON, 'book')} نفس الكتب، هتعرف مين ذوقه أقرب ليك.`, `Once you and someone in the circle have read ${MIN_COMMON} of the same books, you'll see whose taste is closest to yours.`, `حين تقرأ أنت وأحد أعضاء الحلقة ${L.count(MIN_COMMON, 'book')} مشتركة، ستعرف من الأقرب إلى ذوقك.`)}</p>`
      : '';
    return `<section class="card wm-card wm-taste" id="wm-taste"><header class="sec-h"><h2>${icon('users')}${L('أقرب ذوق ليك', 'Closest taste to yours', 'الأقرب إلى ذوقك')}</h2></header>${list}${note}</section>`;
  }

  V.addSection('me', { order: 40, render: (ctx) => (!ready() ? '' : ctx.mine ? tasteMine() : S.members.has(ctx.uid) ? tasteOther(ctx.uid) : '') });

  V.actions['wm-want'] = async (a) => {
    const uid = a.dataset.uid;
    const it = V.shelfItems(uid).find((x) => x.id === a.dataset.id);
    if (!it || !D.canWrite()) return;
    const k = bkey(it);
    const dup = V.shelfItems(S.me).find((x) => bkey(x) === k);
    if (dup) {
      const st = V.SHELF_STATUS && V.SHELF_STATUS[dup.status];
      U.toast(L(`«${esc(dup.title)}» موجود في مكتبتك${st ? ` (${esc(L(...st))})` : ''}`, `“${esc(dup.title)}” is already on your shelf${st ? ` (${esc(st[1])})` : ''}`, `«${esc(dup.title)}» موجود في مكتبتك${st ? ` (${esc(L(...st))})` : ''}`));
      return;
    }
    added.add(k);
    await V.saveShelfItem(null, { title: it.title, author: it.author || '', status: 'want', rating: 0, review: '', tags: it.tags || [], pages: +it.pages || 0, cover: it.cover || '', from: uid });
  };

  /* ---------- «اختارلي كتاب»: a random pick from my want list ---------- */
  const LENS = () => [
    ['any', L('أي حاجة', 'Any', 'أي طول')],
    ['short', L('قصير', 'Short', 'قصير')],
    ['mid', L('متوسط', 'Medium', 'متوسط')],
    ['long', L('طويل', 'Long', 'طويل')],
  ];
  const lenOk = (it, len) => {
    const p = +it.pages || 0;
    if (len === 'any' || !p) return true; // books without a page count fit any length
    return len === 'short' ? p < 200 : len === 'long' ? p > 400 : p >= 200 && p <= 400;
  };
  W.pool = (f = {}) =>
    V.shelfItems(S.me).filter((x) => x.status === 'want' && !x.virtual && lenOk(x, f.len || 'any') && (!f.tag || (x.tags || []).includes(f.tag)) && (!f.list || (x.lists || []).includes(f.list)));
  W.pickFrom = (pool, avoid) => {
    const c = pool.length > 1 ? pool.filter((x) => x.id !== avoid) : pool;
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  };
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  W.pickSheet = () => {
    const want = W.pool({});
    const f = { len: 'any', tag: '', list: '' };
    let cur = null;
    const tagsIn = [...new Set(want.flatMap((x) => x.tags || []))];
    const listsIn = [...new Set(want.flatMap((x) => x.lists || []))];
    const chipRow = (name, label, opts, val) =>
      `<span class="lbl">${label}</span><div class="chips wrap" data-f="${name}">${opts.map(([k, t]) => `<button type="button" class="chip${val === k ? ' on' : ''}" data-v="${esc(k)}" aria-pressed="${val === k}"><span dir="auto">${t}</span></button>`).join('')}</div>`;
    const filters = () =>
      chipRow('len', L('الطول', 'Length'), LENS().map(([k, t]) => [k, k === 'short' ? `${t} <small>&lt; ${L.num(200)}</small>` : k === 'long' ? `${t} <small>&gt; ${L.num(400)}</small>` : t]), f.len) +
      (tagsIn.length ? chipRow('tag', L('التصنيف', 'Category'), [['', L('أي تصنيف', 'Any')], ...tagsIn.map((k) => [k, esc(tagName(k))])], f.tag) : '') +
      (listsIn.length ? chipRow('list', L('من رف', 'From a shelf', 'من رف'), [['', L('أي رف', 'Any')], ...listsIn.map((k) => [k, esc(k)])], f.list) : '');
    const card = (pool) => {
      if (!cur) {
        return `<div class="wm-pick none">${V.empty(L('مفيش كتاب بالمواصفات دي', 'No book fits these filters', 'لا يوجد كتاب بهذه المواصفات'), L('جرّب تشيل فلتر.', 'Try removing a filter.', 'جرّب إزالة تصفية.'))}</div>`;
      }
      const p = +cur.pages || 0;
      return `<div class="wm-pick" id="wm-pick" data-id="${esc(cur.id)}"><div class="wm-deck">${cover(cur, 'lg')}</div>
        <div class="wm-pi"><h2 dir="auto" class="wm-pt">${esc(cur.title)}</h2>${cur.author ? `<p class="muted" dir="auto">${esc(cur.author)}</p>` : ''}
          <div class="meta-chips">${p ? `<span>${icon('scroll')}${L.count(p, 'page')}</span><span class="wm-time">${icon('clock')}${L(`حوالي ${esc(L.duration(p * 60))}`, `about ${esc(L.duration(p * 60))}`, `نحو ${esc(L.duration(p * 60))}`)}</span>` : ''}${(cur.tags || []).map((t) => `<span>${esc(tagName(t))}</span>`).join('')}</div></div></div>
        <p class="muted sm wm-pc">${L(`واحد من ${L.count(pool.length, 'book')}`, `One of ${L.count(pool.length, 'book')}`, `واحد من ${L.count(pool.length, 'book')}`)}</p>
        <div class="row-btns center"><button class="btn ghost" data-again ${pool.length > 1 ? '' : 'disabled'}>${icon('swap')}${L('غيره', 'Another', 'غيره')}</button><button class="btn gold" data-start>${icon('play', 'flip-rtl')}${L('هبدأ فيه', "I'll start it", 'سأبدأ به')}</button></div>`;
    };
    if (!want.length) {
      V.sheet({
        title: L('اختارلي كتاب', 'Pick a book for me', 'اختر لي كتابًا'),
        html: V.empty(L('قايمة «عايز أقرأه» فاضية', 'Your “Want to read” list is empty', 'قائمة «أريد قراءته» فارغة'), L('ضيف الكتب اللي نفسك تقرأها في «عايز أقرأه»، وأنا أختارلك منهم لما تحتار.', 'Add the books you hope to read as “Want to read”, and I’ll pick one when you can’t decide.', 'أضف الكتب التي تريد قراءتها إلى «أريد قراءته»، وسأختار لك منها حين تحتار.'), D.canWrite() ? `<button class="btn gold" data-add>${icon('plus')}${L('ضيف كتاب', 'Add a book', 'أضف كتابًا')}</button>` : ''),
        onMount: (body, api) =>
          body.addEventListener('click', (e) => {
            if (!e.target.closest('[data-add]')) return;
            api.close();
            V.shelfForm();
          }),
      });
      return;
    }
    V.sheet({
      title: L('اختارلي كتاب', 'Pick a book for me', 'اختر لي كتابًا'),
      cls: 'wm-pick-sheet',
      html: `<div class="wm-filters">${filters()}</div><div class="wm-out" aria-live="polite"></div>`,
      onMount: (body, api) => {
        const out = body.querySelector('.wm-out');
        const draw = (shuffle) => {
          const pool = W.pool(f);
          if (!cur || !pool.some((x) => x.id === cur.id) || shuffle) cur = W.pickFrom(pool, cur && cur.id);
          out.innerHTML = card(pool);
          const pk = out.querySelector('.wm-pick');
          if (shuffle && pk && !reduced()) {
            pk.classList.add('shuf');
            setTimeout(() => pk.classList.remove('shuf'), 600);
          }
        };
        draw(true);
        body.addEventListener('click', async (e) => {
          const ch = e.target.closest('[data-f] [data-v]');
          if (ch) {
            const name = ch.closest('[data-f]').dataset.f;
            f[name] = ch.dataset.v;
            body.querySelector('.wm-filters').innerHTML = filters();
            const before = cur && cur.id;
            draw(false);
            if (cur && cur.id !== before) draw(true); // the filter ruled the last pick out: shuffle in a new one
            return;
          }
          if (e.target.closest('[data-again]')) return draw(true);
          if (e.target.closest('[data-start]') && cur) {
            const it = cur;
            api.close();
            await V.saveShelfItem(it.id, { status: 'reading', started: U.today() });
            V.go('shelf', { st: 'reading' });
          }
        });
      },
    });
  };
  V.addMenu('shelf', () => (D.canWrite() ? { ic: 'sparkle', t: L('اختارلي كتاب', 'Pick a book for me', 'اختر لي كتابًا'), fn: () => W.pickSheet() } : null));
  V.actions['wm-pick'] = () => W.pickSheet();

  /* ---------- personal challenges ---------- */
  // Arabic counts for «كاتب» (i18n.js has no such noun).
  const authorsN = (n) =>
    L(
      n === 1 ? 'كاتب واحد' : n === 2 ? 'كاتبين' : n >= 3 && n <= 10 ? `${L.num(n)} كتّاب` : `${L.num(n)} كاتب`,
      n === 1 ? '1 new author' : `${n} new authors`,
      n === 1 ? 'كاتب واحد' : n === 2 ? 'كاتبين' : n >= 3 && n <= 10 ? `${L.num(n)} كتّاب` : n % 100 >= 11 && n % 100 <= 99 ? `${L.num(n)} كاتبًا` : `${L.num(n)} كاتب`
    );
  const KINDS = {
    books: { ic: 'book', t: () => L('كتب تخلّصها', 'Books finished', 'كتب تنهيها'), unit: (n) => L.count(n, 'book') },
    pages: { ic: 'scroll', t: () => L('صفحات تقرأها', 'Pages read', 'صفحات تقرؤها'), unit: (n) => L.count(n, 'page') },
    authors: { ic: 'users', t: () => L('كتّاب جداد', 'New authors', 'كتّاب جدد'), unit: authorsN },
    tag: { ic: 'layers', t: () => L('كتب من تصنيف', 'Books in a category', 'كتب من تصنيف'), unit: (n) => L.count(n, 'book') },
    list: { ic: 'list', t: () => L('كتب من رف عملته', 'Books from one of my shelves', 'كتب من رف أنشأته'), unit: (n) => L.count(n, 'book') },
    days: { ic: 'flame', t: () => L('أيام قراية', 'Reading days', 'أيام قراءة'), unit: (n) => L.count(n, 'day') },
  };
  const monthEnd = (k) => {
    const d = U.parseD(k.slice(0, 7) + '-01');
    return U.dkey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };
  const period = (p) => {
    const t = U.today();
    if (p === 'month') return { from: t.slice(0, 7) + '-01', to: monthEnd(t) };
    return { from: t.slice(0, 4) + '-01-01', to: t.slice(0, 4) + '-12-31' };
  };
  const PRESETS = () => [
    { id: 'books12', t: L('١٢ كتاب السنة دي', '12 books this year', '١٢ كتابًا هذا العام'), kind: 'books', n: 12, per: 'year' },
    { id: 'authors12', t: L('كاتب جديد كل شهر', 'A new author every month', 'كاتب جديد كل شهر'), kind: 'authors', n: 12, per: 'year' },
    { id: 'pages1000', t: L('١٠٠٠ صفحة الشهر ده', '1,000 pages this month', '١٠٠٠ صفحة هذا الشهر'), kind: 'pages', n: 1000, per: 'month' },
    { id: 'days30', t: L('٣٠ يوم قراية الشهر ده', '30 reading days this month', '٣٠ يومًا من القراءة هذا الشهر'), kind: 'days', n: 30, per: 'month' },
  ];

  /* Finish dates of a shelf item: 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' (books finished together). */
  const finishes = (it) => {
    const out = (it.reads || []).map((r) => r && r.finished).filter(Boolean).map(String);
    if (it.virtual && it.at) out.push(U.isoKey(it.at));
    else if (it.finished && it.status !== 'want' && it.status !== 'dnf') out.push(String(it.finished));
    return out;
  };
  const inRange = (f, from, to) =>
    f.length === 4 ? from <= f + '-01-01' && to >= f + '-12-31' : f.length === 7 ? f >= from.slice(0, 7) && f <= to.slice(0, 7) : f >= from && f <= to;
  const before = (f, from) => (f.length === 4 ? f < from.slice(0, 4) : f.length === 7 ? f < from.slice(0, 7) : f < from);
  /* How far along a challenge is, for any member. */
  W.progress = (uid, c) => {
    const m = S.members.get(uid) || {};
    const { from, to } = c;
    if (!from || !to) return 0;
    if (c.kind === 'pages' || c.kind === 'days') {
      let n = 0;
      const days = m.days || {}, secs = m.secs || {};
      for (const k of new Set([...Object.keys(days), ...Object.keys(secs)])) {
        if (k < from || k > to) continue;
        n += c.kind === 'pages' ? Math.max(0, +days[k] || 0) : (+days[k] || 0) > 0 || (+secs[k] || 0) > 0 ? 1 : 0;
      }
      return n;
    }
    const items = V.shelfItems(uid);
    const done = new Map();
    for (const it of items) if (finishes(it).some((f) => inRange(f, from, to))) done.set(bkey(it), it);
    if (c.kind === 'authors') {
      const old = new Set();
      for (const it of items) {
        const fs = finishes(it);
        if (fs.some((f) => before(f, from)) || (it.status === 'read' && !fs.length)) old.add(akey(it.author));
      }
      const fresh = new Set([...done.values()].map((x) => akey(x.author)).filter((a) => a && !old.has(a)));
      return fresh.size;
    }
    const list = [...done.values()];
    if (c.kind === 'tag') return list.filter((x) => (x.tags || []).includes(c.tag)).length;
    if (c.kind === 'list') return list.filter((x) => (x.lists || []).includes(c.list)).length;
    return list.length;
  };
  const chList = (uid) => {
    const m = S.members.get(uid);
    return (m && Array.isArray(m.challenges) ? m.challenges : []).filter((c) => c && c.id && KINDS[c.kind] && c.from && c.to);
  };
  const autoTitle = (c) => {
    const u = KINDS[c.kind].unit(+c.n || 0);
    const what = c.kind === 'tag' && c.tag ? ` • ${tagName(c.tag)}` : c.kind === 'list' && c.list ? ` • ${c.list}` : '';
    return `${u}${what}`;
  };
  /* A ready-made challenge left as it was keeps its name in the reader's language (`pre`); otherwise `t` or a made-up one. */
  const titleOf = (c) => {
    const p = c.pre && PRESETS().find((x) => x.id === c.pre);
    return c.t || (p ? p.t : autoTitle(c));
  };
  const when = (c) => {
    const t = U.today();
    if (c.from > t) return L(`يبدأ ${L.dayShort(c.from)}`, `Starts ${L.dayShort(c.from)}`, `يبدأ ${L.dayShort(c.from)}`);
    if (c.to < t) return L(`خلصت مدته ${L.dayShort(c.to)}`, `Ended ${L.dayShort(c.to)}`, `انتهت مدته ${L.dayShort(c.to)}`);
    const d = U.diffDays(t, c.to);
    return d === 0 ? L('النهارده آخر يوم', 'Last day today', 'اليوم آخر يوم') : L(`فاضل ${L.count(d, 'day')}`, `${L.count(d, 'day')} left`, `بقي ${L.count(d, 'day', 'nom')}`);
  };
  function chRow(uid, c, mine) {
    const n = Math.max(1, +c.n || 1);
    const p = W.progress(uid, c);
    const ok = p >= n || !!c.done;
    const K = KINDS[c.kind];
    const inner = `<span class="wm-c-ic">${icon(ok ? 'check' : K.ic)}</span><span class="wm-c-b"><b dir="auto">${esc(titleOf(c))}</b>${V.bar(p / n, ok ? 'jade' : 'gold')}<small><span class="wm-c-n">${L(`${L.num(Math.min(p, 999999))} من ${K.unit(n)}`, `${p} of ${K.unit(n)}`, `${L.num(Math.min(p, 999999))} من ${K.unit(n)}`)}</span> • ${ok ? `<span class="jade-t">${L('خلّصته! 🎉', 'Done! 🎉', 'أنجزته! 🎉')}</span>` : esc(when(c))}</small></span>`;
    return mine && D.canWrite()
      ? `<button class="wm-c${ok ? ' done' : ''}" data-act="wm-ch" data-id="${esc(c.id)}">${inner}${icon('more')}</button>`
      : `<div class="wm-c${ok ? ' done' : ''}" data-id="${esc(c.id)}">${inner}</div>`;
  }
  function challengesCard(ctx) {
    const t = U.today();
    const all = chList(ctx.uid);
    const live = all.filter((c) => c.to >= t).sort((a, b) => String(a.to).localeCompare(String(b.to)));
    if (!ctx.mine) {
      const act = live.filter((c) => c.from <= t);
      if (!act.length) return '';
      return `<section class="card wm-card wm-ch" id="wm-ch"><header class="sec-h"><h2>${icon('target')}${L(`تحديات ${esc(D.name(ctx.uid))}`, `${esc(D.name(ctx.uid))}'s challenges`, `تحديات ${esc(D.name(ctx.uid))}`)}</h2></header><div class="wm-chs">${act.map((c) => chRow(ctx.uid, c, false)).join('')}</div></section>`;
    }
    const past = all.filter((c) => c.to < t).sort((a, b) => String(b.to).localeCompare(String(a.to)));
    const canW = D.canWrite();
    if (!all.length && !canW) return '';
    return `<section class="card wm-card wm-ch" id="wm-ch"><header class="sec-h"><h2>${icon('target')}${L('تحدياتي', 'My challenges', 'تحدياتي')}</h2>${canW ? `<button class="btn sm gold" data-act="wm-ch-new">${icon('plus')}${L('تحدي جديد', 'New challenge', 'تحدٍّ جديد')}</button>` : ''}</header>
      ${live.length ? `<div class="wm-chs">${live.map((c) => chRow(S.me, c, true)).join('')}</div>` : `<p class="muted wm-ch-empty">${L('تحديات بتعملها لنفسك: كام كتاب، كام صفحة، كتّاب جداد، أيام قراية… وإنت اللي تحدد المدة.', 'Challenges you set for yourself: books, pages, new authors, reading days… for the time you choose.', 'تحديات تضعها لنفسك: عدد الكتب، الصفحات، كتّاب جدد، أيام القراءة… للمدة التي تختارها.')}</p>`}
      ${past.length ? `<details class="wm-past"><summary>${L(`اللي خلصت مدتها (${L.num(past.length)})`, `Ended (${past.length})`, `المنتهية (${L.num(past.length)})`)}</summary><div class="wm-chs">${past.map((c) => chRow(S.me, c, true)).join('')}</div></details>` : ''}
    </section>`;
  }
  V.addSection('me', { order: 25, render: (ctx) => (ready() ? challengesCard(ctx) : '') });

  const saveChallenges = (fn) => D.updateMe((m) => ({ challenges: fn((Array.isArray(m.challenges) ? m.challenges : []).slice()).slice(-40) }));

  W.challengeForm = (c0 = null) => {
    const c = c0 || { kind: 'books', n: 12, ...period('year') };
    const per0 = c0 ? (c.from === period('month').from && c.to === period('month').to ? 'month' : c.from === period('year').from && c.to === period('year').to ? 'year' : 'custom') : 'year';
    const lists = myLists();
    V.sheet({
      title: c0 ? L('عدّل التحدي', 'Edit challenge', 'عدّل التحدي') : L('تحدي جديد', 'New challenge', 'تحدٍّ جديد'),
      html: `<form id="wm-ch-form" class="form">
        ${c0 ? '' : `<span class="lbl">${L('جاهزين', 'Ready-made', 'جاهزة')}</span><div class="chips wrap wm-presets">${PRESETS().map((p) => `<button type="button" class="chip" data-preset="${p.id}">${esc(p.t)}</button>`).join('')}</div>`}
        <label for="wm-ch-t">${L('اسم التحدي', 'Name')}</label><input id="wm-ch-t" maxlength="80" dir="auto" value="${esc(c.t || (c.pre ? titleOf(c) : ''))}" placeholder="${L('اختياري', 'Optional', 'اختياري')}">
        <div class="grid2"><div><label for="wm-ch-kind">${L('بيتحسب إيه؟', 'What counts?', 'ما الذي يُحسب؟')}</label><select id="wm-ch-kind">${Object.entries(KINDS).map(([k, K]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${K.t()}</option>`).join('')}</select></div>
          <div><label for="wm-ch-n">${L('الهدف', 'Target')}</label><input id="wm-ch-n" type="number" min="1" max="100000" value="${esc(c.n || 1)}" required></div></div>
        <div class="wm-x" data-for="tag"><label for="wm-ch-tag">${L('التصنيف', 'Category')}</label><select id="wm-ch-tag">${TAGS.map(([k]) => `<option value="${k}" ${c.tag === k ? 'selected' : ''}>${esc(tagName(k))}</option>`).join('')}</select></div>
        <div class="wm-x" data-for="list"><label for="wm-ch-list">${L('الرف', 'Shelf')}</label><input id="wm-ch-list" maxlength="60" dir="auto" list="wm-ch-lists" value="${esc(c.list || '')}" placeholder="${L('اسم رف من رفوفك', 'One of your shelves', 'اسم رف من رفوفك')}"><datalist id="wm-ch-lists">${lists.map((l) => `<option value="${esc(l)}"></option>`).join('')}</datalist></div>
        <label for="wm-ch-per">${L('المدة', 'Period')}</label><select id="wm-ch-per"><option value="month" ${per0 === 'month' ? 'selected' : ''}>${L('الشهر ده', 'This month', 'هذا الشهر')}</option><option value="year" ${per0 === 'year' ? 'selected' : ''}>${L('السنة دي', 'This year', 'هذا العام')}</option><option value="custom" ${per0 === 'custom' ? 'selected' : ''}>${L('من يوم لِيوم', 'Choose dates', 'اختر التواريخ')}</option></select>
        <div class="grid2 wm-dates"><div><label for="wm-ch-from">${L('من', 'From')}</label><input id="wm-ch-from" type="date" value="${esc(c.from)}"></div><div><label for="wm-ch-to">${L('لحد', 'To', 'إلى')}</label><input id="wm-ch-to" type="date" value="${esc(c.to)}"></div></div>
        <p class="muted sm wm-ch-hint"></p>
        <div class="row-btns end"><button class="btn gold">${icon('target')}${L('احفظ التحدي', 'Save challenge', 'احفظ التحدي')}</button></div></form>`,
      onMount: (body, api) => {
        const $ = (s) => body.querySelector(s);
        let pre = c.pre || '';
        const sync = () => {
          const kind = $('#wm-ch-kind').value;
          body.querySelectorAll('.wm-x').forEach((x) => (x.hidden = x.dataset.for !== kind));
          const per = $('#wm-ch-per').value;
          $('.wm-dates').hidden = per !== 'custom';
          if (per !== 'custom') {
            const r = period(per);
            $('#wm-ch-from').value = r.from;
            $('#wm-ch-to').value = r.to;
          }
          $('.wm-ch-hint').textContent =
            kind === 'authors' ? L('كاتب جديد = كاتب أول مرة تخلّصله كتاب في المدة دي.', 'A new author is one you finish a book by for the first time in this period.', 'الكاتب الجديد = كاتب تنهي له كتابًا لأول مرة في هذه المدة.')
              : kind === 'pages' || kind === 'days' ? L('بيتحسب من قرايتك في التطبيق.', 'Counted from your reading in the app.', 'يُحسب من قراءتك في التطبيق.')
                : L('بيتحسب من الكتب اللي خلّصتها في مكتبتك.', 'Counted from the books you finish on your shelf.', 'يُحسب من الكتب التي أنهيتها في مكتبتك.');
        };
        sync();
        body.addEventListener('change', sync);
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-preset]');
          if (!b) return;
          const p = PRESETS().find((x) => x.id === b.dataset.preset);
          pre = p.id;
          $('#wm-ch-t').value = p.t;
          $('#wm-ch-kind').value = p.kind;
          $('#wm-ch-n').value = p.n;
          $('#wm-ch-per').value = p.per;
          body.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
          sync();
        });
        body.addEventListener('submit', async (e) => {
          e.preventDefault();
          const kind = $('#wm-ch-kind').value;
          let from = $('#wm-ch-from').value, to = $('#wm-ch-to').value;
          if (!from || !to) return U.toast(L('اختار المدة', 'Choose the dates', 'اختر المدة'), 'warn');
          if (from > to) [from, to] = [to, from];
          const list = $('#wm-ch-list').value.trim();
          if (kind === 'list' && !list) return U.toast(L('اكتب اسم الرف', 'Type the shelf name', 'اكتب اسم الرف'), 'warn');
          const next = Object.assign({}, c0 || {}, { id: (c0 && c0.id) || D.newId(), t: $('#wm-ch-t').value.trim().slice(0, 80), kind, n: U.clamp(Math.round(+$('#wm-ch-n').value || 1), 1, 100000), from, to });
          delete next.tag;
          delete next.list;
          if (kind === 'tag') next.tag = $('#wm-ch-tag').value;
          if (kind === 'list') next.list = list.slice(0, 60);
          delete next.pre;
          const p = pre && PRESETS().find((x) => x.id === pre);
          if (p && next.t === p.t) {
            delete next.t; // untouched name of a ready-made challenge: stored by id, shown in each language
            if (kind === p.kind && next.n === p.n && from === period(p.per).from && to === period(p.per).to) next.pre = p.id;
          }
          if (!next.t) delete next.t;
          if (next.done && W.progress(S.me, next) < next.n) {
            delete next.done; // a bigger target: celebrate again when it's reached
            fired.delete(next.id);
          }
          api.close();
          await saveChallenges((arr) => (c0 ? arr.map((x) => (x.id === c0.id ? next : x)) : arr.concat([next])));
          U.chime('soft');
          U.toast(c0 ? L('اتعدّل التحدي', 'Challenge updated', 'تم تعديل التحدي') : L('يلا بينا! التحدي بدأ', 'Challenge on!', 'هيا! بدأ التحدي'));
        });
      },
    });
  };
  V.actions['wm-ch-new'] = () => W.challengeForm();
  V.actions['wm-ch'] = (a) => {
    const c = chList(S.me).find((x) => x.id === a.dataset.id);
    if (!c) return;
    V.menu([
      { ic: 'edit', t: L('عدّل', 'Edit'), fn: () => W.challengeForm(c) },
      {
        ic: 'trash',
        t: L('امسح التحدي', 'Delete challenge', 'احذف التحدي'),
        danger: true,
        fn: async () => {
          if (!(await V.confirm(L(`هتمسح «${esc(titleOf(c))}».`, `Delete “${esc(titleOf(c))}”?`, `ستحذف «${esc(titleOf(c))}».`), L('امسحه', 'Delete', 'احذفه'), true))) return;
          await saveChallenges((arr) => arr.filter((x) => x.id !== c.id));
        },
      },
    ]);
  };

  /* The first time a challenge is reached: confetti once, remembered as `done` on the challenge. */
  const fired = new Set();
  W.check = () => {
    if (!ready() || !S.loaded.prog || !D.canWrite()) return;
    const hit = chList(S.me).filter((c) => !c.done && !fired.has(c.id) && W.progress(S.me, c) >= Math.max(1, +c.n || 1));
    if (!hit.length) return;
    hit.forEach((c) => fired.add(c.id));
    const ids = new Set(hit.map((c) => c.id));
    const day = U.today();
    saveChallenges((arr) => arr.map((x) => (ids.has(x.id) && !x.done ? Object.assign({}, x, { done: day }) : x))).catch(() => {});
    U.confetti(1);
    U.chime('big');
    U.toast(`${icon('trophy')}<span>${hit.map((c) => L(`خلّصت تحدي «${esc(titleOf(c))}»! 🎉`, `Challenge done: “${esc(titleOf(c))}”! 🎉`, `أنجزت تحدي «${esc(titleOf(c))}»! 🎉`)).join('<br>')}</span>`);
  };
  D.onChange(() => W.check());
})();
