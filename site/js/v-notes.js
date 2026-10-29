/* Notes: compose, thread view, likes, replies, cards. */
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

  V.clean = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== 'id') out[k] = v;
    return out;
  };

  const KINDS = ['hl', 'note', 'q', 'quote'];
  const KIND_IC = { hl: 'hl', note: 'note', q: 'question', quote: 'quote' };

  V.composeNote = (ctx, onClose) => {
    const hasRect = ctx.rect && ctx.rect.w > 0;
    let kind = hasRect ? 'hl' : 'note';
    let color = U.store.get('hlColor', A.R.COLORS[0]);
    let priv = false;
    const book = S.books.get(ctx.bookId);
    const api = V.sheet({
      title: L(`صفحة ${L.num(ctx.page)}`, `Page ${ctx.page}`),
      html: `${ctx.crop ? `<div class="crop-prev"><img src="${esc(ctx.crop)}" alt=""></div>` : `<div class="pin-prev">${icon('pin')}<span>${L('ملاحظة مثبّتة على الصفحة', 'A note pinned to the page')}</span></div>`}
        <div class="seg-pick" role="radiogroup" id="nk-kinds">${KINDS.map((k) => `<button type="button" class="sp${k === kind ? ' on' : ''}" data-kind="${k}" role="radio" aria-checked="${k === kind}">${icon(KIND_IC[k])}<span>${V.kindLabel(k)}</span></button>`).join('')}</div>
        <div class="colors" id="nk-colors" ${hasRect ? '' : 'hidden'}>${A.R.COLORS.map((c) => `<button type="button" class="cdot${c === color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
        <textarea id="nk-text" rows="3" dir="auto" maxlength="${U.MAX.note}" placeholder="${L('اكتب تعليقك أو سؤالك… (اختياري للتظليل)', 'Write your comment or question… (optional for highlights)')}"></textarea>
        <div class="vis" role="radiogroup">
          <button type="button" class="sp on" data-vis="all">${icon('users')}<span>${L('للحلقة كلها', 'Whole circle')}</span></button>
          <button type="button" class="sp" data-vis="me">${icon('lock')}<span>${L('ليا بس', 'Only me')}</span></button>
        </div>
        <div class="row-btns end"><button class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button><button class="btn" data-save>${icon('check')}${L('احفظ', 'Save')} <small class="xp-hint">+${L.num(G.XP.note)} XP</small></button></div>`,
      onMount: (body) => {
        // A long note is kept as a draft until it is saved, so a failed save or an accidental close loses nothing.
        const draftKey = `draft:nk:${ctx.bookId}:${ctx.page}`;
        const ta = body.querySelector('#nk-text');
        const draft = U.store.get(draftKey, '');
        if (draft) ta.value = draft;
        let saving = false;
        ta.addEventListener('input', U.debounce(() => !saving && (ta.value.trim() ? U.store.set(draftKey, ta.value) : U.store.del(draftKey)), 400));
        setTimeout(() => !hasRect && body.querySelector('#nk-text').focus(), 80);
        body.addEventListener('click', async (e) => {
          const k = e.target.closest('[data-kind]');
          if (k) {
            kind = k.dataset.kind;
            body.querySelectorAll('[data-kind]').forEach((b) => {
              b.classList.toggle('on', b === k);
              b.setAttribute('aria-checked', b === k);
            });
            if (kind !== 'hl') body.querySelector('#nk-text').focus();
            return;
          }
          const c = e.target.closest('[data-color]');
          if (c) {
            color = c.dataset.color;
            U.store.set('hlColor', color);
            body.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === c));
            return;
          }
          const v = e.target.closest('[data-vis]');
          if (v) {
            priv = v.dataset.vis === 'me';
            body.querySelectorAll('[data-vis]').forEach((b) => b.classList.toggle('on', b === v));
            body.querySelector('.xp-hint').hidden = priv;
            return;
          }
          if (e.target.closest('[data-save]')) {
            const text = body.querySelector('#nk-text').value.trim();
            if (!text && (kind === 'note' || kind === 'q' || !hasRect)) {
              body.querySelector('#nk-text').focus();
              return U.toast(L('اكتب الملاحظة الأول', 'Write the note first'), 'warn');
            }
            saving = true; // a late draft write must not bring this note back after it is saved
            if (text) U.store.set(draftKey, text);
            api.close();
            const base = { b: ctx.bookId, page: ctx.page, rect: ctx.rect, kind, color, text, at: U.nowIso() };
            if (priv) {
              const id = D.newId();
              await D.mutate(`data/users/${S.me}/priv`, () => {
                const cur = S.priv || {};
                return Object.assign({}, cur, { notes: Object.assign({}, cur.notes || {}, { [id]: base }) });
              });
              U.store.del(draftKey);
              U.toast(L('اتحفظت ليك لوحدك 🔒', 'Saved privately 🔒'));
            } else {
              const id = D.newId();
              const w = G.wirds(book).find((x) => ctx.page >= x.from && ctx.page <= x.to);
              await D.set(`notes/${id}`, Object.assign(base, { by: S.me, crop: ctx.crop || null, wid: w ? w.id : '', likes: {}, replies: {} }));
              U.store.del(draftKey);
              U.chime('soft');
              U.xpPop(G.XP.note, V.kindLabel(kind));
            }
          }
        });
      },
    });
    api.onClose = onClose;
  };

  /* Edit my note or highlight: its text, its kind, and the colour of a highlight. */
  V.editNote = (n) => {
    if (!n || n.by !== S.me) return;
    const hasRect = n.rect && n.rect.w > 0;
    let kind = n.kind || 'note';
    let color = n.color || A.R.COLORS[0];
    V.sheet({
      title: L('عدّل الملاحظة', 'Edit note'),
      html: `${n.crop ? `<div class="crop-prev"><img src="${esc(n.crop)}" alt=""></div>` : ''}
        <div class="seg-pick" role="radiogroup">${KINDS.map((k) => `<button type="button" class="sp${k === kind ? ' on' : ''}" data-kind="${k}" role="radio" aria-checked="${k === kind}">${icon(KIND_IC[k])}<span>${V.kindLabel(k)}</span></button>`).join('')}</div>
        <div class="colors" ${hasRect ? '' : 'hidden'}>${A.R.COLORS.map((c) => `<button type="button" class="cdot${c === color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
        <textarea id="en-text" rows="5" dir="auto" maxlength="${U.MAX.note}">${esc(n.text || '')}</textarea>
        <p class="err-t" hidden></p>
        <div class="row-btns end"><button class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button><button class="btn gold" data-save>${icon('check')}${L('احفظ', 'Save')}</button></div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          const k = e.target.closest('[data-kind]');
          if (k) {
            kind = k.dataset.kind;
            body.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k));
            return;
          }
          const c = e.target.closest('[data-color]');
          if (c) {
            color = c.dataset.color;
            body.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === c));
            return;
          }
          if (!e.target.closest('[data-save]')) return;
          const text = body.querySelector('#en-text').value.trim();
          if (!text && (kind === 'note' || kind === 'q' || !hasRect)) return body.querySelector('#en-text').focus();
          const btn = e.target.closest('[data-save]');
          btn.disabled = true;
          const patch = { text, kind, color, edited: U.nowIso() };
          try {
            if (n.priv)
              await D.mutate(`data/users/${S.me}/priv`, () => {
                const cur = S.priv || {};
                const notes = Object.assign({}, cur.notes);
                if (!notes[n.id]) return null;
                notes[n.id] = Object.assign({}, notes[n.id], patch);
                return Object.assign({}, cur, { notes });
              });
            else await D.update(`notes/${n.id}`, patch);
            api.close();
            U.toast(L('اتعدّلت ✓', 'Updated ✓'));
          } catch (x) {
            btn.disabled = false;
            const er = body.querySelector('.err-t');
            er.textContent = L('ماتحفظش. اتأكد من النت وجرّب تاني.', 'Not saved. Check your connection and try again.');
            er.hidden = false;
          }
        }),
    });
  };

  V.like = async (nid) => {
    if (!D.canWrite()) return;
    const n = S.notes.get(nid);
    if (!n) return;
    const on = !!(n.likes && n.likes[S.me]);
    await D.update(`notes/${nid}`, { likes: { [S.me]: on ? false : U.nowIso() } });
    if (!on) U.chime('soft');
  };

  const likeCount = (n) => (n.likes ? Object.entries(n.likes).filter(([, v]) => v).length : 0);
  const replies = (n) =>
    Object.entries(n.replies || {})
      .filter(([, r]) => r && r.text)
      .map(([id, r]) => Object.assign({ id }, r))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  V.noteReplies = replies;
  V.likeCount = likeCount;

  V.openNote = (nid, opts = {}) => {
    const isPriv = opts.priv || (!S.notes.has(nid) && S.priv && S.priv.notes && S.priv.notes[nid]);
    const get = () => (isPriv ? (S.priv && S.priv.notes && S.priv.notes[nid] ? Object.assign({ id: nid, by: S.me, priv: true }, S.priv.notes[nid]) : null) : S.notes.get(nid));
    const n0 = get();
    if (!n0) return U.toast(L('الملاحظة دي اتمسحت', 'That note was deleted'), 'warn');
    const book = S.books.get(n0.b);
    const body = (n) => {
      if (!n) return V.empty(L('الملاحظة دي اتمسحت', 'This note was deleted'), '');
      const mine = n.by === S.me;
      const liked = n.likes && n.likes[S.me];
      const likers = Object.entries(n.likes || {}).filter(([, v]) => v).map(([u]) => u);
      const rs = replies(n);
      return `<div class="nt">
        <div class="nt-head">${D.avatar(n.by, 'md')}<div><b>${esc(D.name(n.by))}</b><small>${L.ago(n.at)} • ${n.page ? `${L('ص', 'p.')} ${L.num(n.page)}` : ''} ${V.editedTag(n)}</small></div><span class="kind k-${esc(n.kind)}">${V.kindLabel(n.kind)}</span>${n.priv ? `<span class="kind">${icon('lock')}${L('خاصة', 'Private')}</span>` : ''}</div>
        ${n.crop ? `<figure class="nt-crop" style="--c:${U.col(n.color)}"><img src="${esc(n.crop)}" alt=""></figure>` : ''}
        ${n.text ? `<p class="nt-text" dir="auto">${esc(n.text)}</p>` : ''}
        <div class="nt-acts">
          ${!n.priv ? `<button class="pill${liked ? ' on' : ''}" data-like>${icon('heart')}<span>${L.num(likers.length)}</span></button><span class="likers">${likers.slice(0, 6).map((u) => D.avatar(u, 'xs')).join('')}</span>` : ''}
          ${book && n.page && !(A.R.isOpen() && A.R.bookId() === n.b) ? `<button class="pill" data-gopage>${icon('books')}<span>${L('افتح الصفحة', 'Open page')}</span></button>` : ''}
          ${book && n.page && A.R.isOpen() && A.R.bookId() === n.b ? `<button class="pill" data-gopage>${icon('fwd', 'flip')}<span>${L('روح للمكان', 'Jump there')}</span></button>` : ''}
          ${mine && D.canWrite() ? `<button class="pill ghost" data-editnote>${icon('edit')}<span>${L('عدّل', 'Edit')}</span></button>` : ''}
          ${mine ? `<button class="pill ghost" data-del>${icon('trash')}<span>${L('امسح', 'Delete')}</span></button>` : ''}
        </div>
        ${!n.priv ? `<div class="replies" id="nt-replies" data-keep-scroll>${rs.length ? rs.map((r) => `<div class="rep">${D.avatar(r.by, 'sm')}<div class="rep-b"><b>${esc(D.name(r.by))}</b><small>${L.ago(r.at)} ${V.editedTag(r)}</small><p dir="auto">${esc(r.text)}</p></div>${r.by === S.me ? `<span class="rep-acts"><button class="ib sm" data-editrep="${esc(r.id)}" aria-label="${L('عدّل', 'Edit')}">${icon('edit')}</button><button class="ib sm" data-delrep="${esc(r.id)}" aria-label="${L('امسح', 'Delete')}">${icon('trash')}</button></span>` : ''}</div>`).join('') : `<p class="muted sm">${L('محدش رد لسه. ابدأ النقاش!', 'No replies yet. Start the conversation!')}</p>`}</div>
        ${D.canWrite() ? `<form class="composer" data-reply><textarea id="nt-reply-${esc(n.id)}" rows="1" dir="auto" maxlength="${U.MAX.reply}" placeholder="${L('اكتب ردك…', 'Write a reply…')}"></textarea><button class="btn icon-only" aria-label="${L('ابعت', 'Send')}">${icon('send', 'flip-rtl')}</button></form>` : ''}` : ''}
      </div>`;
    };
    V.sheet({
      title: `${icon(KIND_IC[n0.kind] || 'note')} ${book ? esc(book.title) : ''}`,
      html: body(n0),
      onData: (el) => V.patch(el, body(get())),
      onMount: (el, api) => {
        el.addEventListener('click', async (e) => {
          const n = get();
          if (!n) return;
          if (e.target.closest('[data-like]')) V.like(n.id);
          if (e.target.closest('[data-gopage]')) {
            api.close();
            if (A.R.isOpen() && A.R.bookId() === n.b) A.R.goTo(n.page, n.id);
            else A.R.open(n.b, { page: n.page, flash: n.id });
          }
          if (e.target.closest('[data-del]')) {
            if (!(await V.confirm(L('هتمسح الملاحظة دي وكل الردود عليها.', 'This deletes the note and its replies.'), L('امسح', 'Delete'), true))) return;
            api.close();
            if (n.priv) {
              await D.mutate(`data/users/${S.me}/priv`, () => {
                const cur = S.priv || {};
                const notes = Object.assign({}, cur.notes);
                delete notes[n.id];
                return Object.assign({}, cur, { notes });
              });
            } else await D.del(`notes/${n.id}`);
          }
          if (e.target.closest('[data-editnote]')) {
            api.close();
            V.editNote(n);
          }
          const er = e.target.closest('[data-editrep]');
          if (er) {
            const r = (n.replies || {})[er.dataset.editrep];
            if (r && r.by === S.me)
              V.editText({
                title: L('عدّل ردك', 'Edit your reply'),
                value: r.text,
                max: U.MAX.reply,
                onSave: (text) => D.update(`notes/${n.id}`, { replies: { [er.dataset.editrep]: { by: S.me, text, at: r.at, edited: U.nowIso() } } }),
              });
          }
          const dr = e.target.closest('[data-delrep]');
          if (dr) await D.update(`notes/${n.id}`, { replies: { [dr.dataset.delrep]: { by: S.me, text: '', at: U.nowIso() } } });
        });
        el.addEventListener('submit', async (e) => {
          if (!e.target.closest('[data-reply]')) return;
          e.preventDefault();
          const n = get();
          const ta = e.target.querySelector('textarea');
          const text = ta.value.trim();
          if (!text || !n) return;
          ta.value = '';
          ta.dataset.fresh = '1';
          setTimeout(() => delete ta.dataset.fresh, 400);
          await D.update(`notes/${n.id}`, { replies: { [D.newId()]: { by: S.me, text, at: U.nowIso() } } });
          U.xpPop(G.XP.reply, L('رد', 'Reply'));
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && e.target.matches('[data-reply] textarea')) {
            e.preventDefault();
            e.target.form.requestSubmit();
          }
        });
      },
    });
  };

  /* A compact card for feeds and the notes tab. */
  V.noteCard = (n, opts = {}) => {
    const book = S.books.get(n.b);
    const lc = likeCount(n);
    const rc = replies(n).length;
    const liked = n.likes && n.likes[S.me];
    const isTake = n.kind === 'take';
    const w = book && n.wid ? G.wirds(book).find((x) => x.id === n.wid) : null;
    return `<article class="ncard k-${esc(n.kind)}${isTake ? ' take' : ''}">
      <header>${D.avatar(n.by, 'sm')}<div class="nc-who"><b data-act="member" data-uid="${esc(n.by)}">${esc(D.name(n.by))}</b><small>${V.kindLabel(n.kind)}${opts.showBook && book ? ` • <span dir="auto">${esc(book.title)}</span>` : ''}${n.page && !isTake ? ` • ${L('ص', 'p.')} ${L.num(n.page)}` : ''}${isTake && w ? ` • ${L('الورد', 'Portion')} ${L.num(w.n)}` : ''} • ${L.ago(n.at)} ${V.editedTag(n)}</small></div></header>
      ${n.crop ? `<button class="nc-crop" data-act="open-note" data-nid="${esc(n.id)}" style="--c:${U.col(n.color)}"><img src="${esc(n.crop)}" alt="${esc(L('الجزء المظلّل', 'Highlighted passage'))}" loading="lazy"></button>` : ''}
      ${n.text ? `<p class="nc-text${n.kind === 'quote' ? ' quote' : ''}" dir="auto">${esc(n.text.length > 420 ? n.text.slice(0, 400).replace(/\s+\S*$/, '') + '…' : n.text)}</p>${n.text.length > 420 ? `<button class="lnk nc-more" data-act="open-note" data-nid="${esc(n.id)}">${L('اقرأ الباقي', 'Read more')}</button>` : ''}` : ''}
      <footer>
        <button class="pill${liked ? ' on' : ''}" data-act="like" data-nid="${esc(n.id)}" aria-label="${L('إعجاب', 'Like')}">${icon('heart')}<span>${L.num(lc)}</span></button>
        <button class="pill" data-act="open-note" data-nid="${esc(n.id)}">${icon('chat')}<span>${rc ? L.num(rc) : L('رد', 'Reply')}</span></button>
        ${n.page && book && !isTake ? `<button class="pill ghost" data-act="read" data-b="${esc(n.b)}" data-p="${n.page}">${icon('books')}<span>${L('الصفحة', 'Page')}</span></button>` : ''}
      </footer>
    </article>`;
  };
})();
