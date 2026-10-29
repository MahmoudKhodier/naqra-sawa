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
    let priv = !!ctx.onlyMe; // a book only I can see: its notes are only mine too
    const book = D.book(ctx.bookId);
    const api = V.sheet({
      title: L(`صفحة ${L.num(ctx.page)}`, `Page ${ctx.page}`),
      html: `${ctx.crop ? `<div class="crop-prev"><img src="${esc(ctx.crop)}" alt=""></div>` : `<div class="pin-prev">${icon('pin')}<span>${L('ملاحظة مثبّتة على الصفحة', 'A note pinned to the page')}</span></div>`}
        <div class="seg-pick" role="radiogroup" id="nk-kinds">${KINDS.map((k) => `<button type="button" class="sp${k === kind ? ' on' : ''}" data-kind="${k}" role="radio" aria-checked="${k === kind}">${icon(KIND_IC[k])}<span>${V.kindLabel(k)}</span></button>`).join('')}</div>
        <div class="colors" id="nk-colors" ${hasRect ? '' : 'hidden'}>${A.R.COLORS.map((c) => `<button type="button" class="cdot${c === color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
        <textarea id="nk-text" rows="3" dir="auto" maxlength="${U.MAX.note}" placeholder="${L('اكتب تعليقك أو سؤالك… (اختياري للتظليل)', 'Write your comment or question… (optional for highlights)')}"></textarea>
        ${ctx.onlyMe ? `<p class="rd-onlyme">${icon('lock')}<span>${L('الكتاب ده ليك لوحدك، فالملاحظة كمان ليك لوحدك — محدش في الحلقة هيشوفها.', 'This book is only yours, so the note is only yours too — nobody in the circle will see it.', 'هذا الكتاب لك وحدك، فالملاحظة لك وحدك أيضًا — لن يراها أحد في الحلقة.')}</span></p>` : `<div class="vis" role="radiogroup">
          <button type="button" class="sp on" data-vis="all">${icon('users')}<span>${L('للحلقة كلها', 'Whole circle')}</span></button>
          <button type="button" class="sp" data-vis="me">${icon('lock')}<span>${L('ليا بس', 'Only me', 'لي فقط')}</span></button>
        </div>`}
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
              return U.toast(L('اكتب الملاحظة الأول', 'Write the note first', 'اكتب الملاحظة أولًا'), 'warn');
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
              U.toast(L('اتحفظت ليك لوحدك 🔒', 'Saved privately 🔒', 'تم الحفظ لك وحدك 🔒'));
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
            U.toast(L('اتعدّلت ✓', 'Updated ✓', 'تم التعديل ✓'));
          } catch (x) {
            btn.disabled = false;
            const er = body.querySelector('.err-t');
            er.textContent = L('ماتحفظش. اتأكد من النت وجرّب تاني.', 'Not saved. Check your connection and try again.', 'لم يتم الحفظ. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
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
    if (!n0) return U.toast(L('الملاحظة دي اتمسحت', 'That note was deleted', 'تم حذف هذه الملاحظة'), 'warn');
    const book = D.book(n0.b);
    const body = (n) => {
      if (!n) return V.empty(L('الملاحظة دي اتمسحت', 'This note was deleted', 'تم حذف هذه الملاحظة'), '');
      const mine = n.by === S.me;
      const liked = n.likes && n.likes[S.me];
      const likers = Object.entries(n.likes || {}).filter(([, v]) => v).map(([u]) => u);
      const rs = replies(n);
      return `<div class="nt">
        <div class="nt-head">${D.avatar(n.by, 'md')}<div><b>${esc(D.name(n.by))}</b><small>${L.ago(n.at)} • ${n.page ? `${L('ص', 'p.')} ${L.num(n.page)}` : ''} ${V.editedTag(n)}</small></div><span class="kind k-${esc(n.kind)}">${V.kindLabel(n.kind)}</span>${n.priv ? `<span class="kind">${icon('lock')}${L('خاصة', 'Private')}</span>` : ''}</div>
        ${n.crop ? `<figure class="nt-crop" style="--c:${U.col(n.color)}"><img src="${esc(n.crop)}" alt=""></figure>` : ''}
        ${n.text ? `<p class="nt-text" dir="auto">${esc(n.text)}</p>` : ''}
        ${n.rect && !(n.rect.w > 0.012) && D.canWrite() ? `<p class="nt-movehint">${icon('pin')}<span>${mine ? L('عشان تحرّكها: دوس عليها مطوّل في الصفحة واسحبها — هتتحرك عند الكل.', 'To move it: long-press it on the page and drag — it moves for everyone.', 'لتحريكها: اضغط عليها مطولًا في الصفحة واسحبها — ستتحرك عند الجميع.') : L('مغطّية على الكلام؟ دوس عليها مطوّل واسحبها — هتتحرك عندك بس.', 'Covering the text? Long-press and drag it — it moves on your screen only.', 'تغطي النص؟ اضغط عليها مطولًا واسحبها — ستتحرك عندك فقط.')}</span></p>` : ''}
        <div class="nt-acts">
          ${!n.priv ? `<button class="pill${liked ? ' on' : ''}" data-like>${icon('heart')}<span>${L.num(likers.length)}</span></button><span class="likers">${likers.slice(0, 6).map((u) => D.avatar(u, 'xs')).join('')}</span>` : ''}
          ${book && n.page && !(A.R.isOpen() && A.R.bookId() === n.b) ? `<button class="pill" data-gopage>${icon('books')}<span>${L('افتح الصفحة', 'Open page')}</span></button>` : ''}
          ${book && n.page && A.R.isOpen() && A.R.bookId() === n.b ? `<button class="pill" data-gopage>${icon('fwd', 'flip')}<span>${L('روح للمكان', 'Jump there', 'انتقل إلى المكان')}</span></button>` : ''}
          ${mine && D.canWrite() ? `<button class="pill ghost" data-editnote>${icon('edit')}<span>${L('عدّل', 'Edit')}</span></button>` : ''}
          ${!mine && n.rect && S.priv && S.priv.moved && S.priv.moved[n.id] ? `<button class="pill ghost" data-unmove>${icon('pin')}<span>${L('رجّعها مكانها', 'Put it back', 'أعدها إلى مكانها')}</span></button>` : ''}
          ${!mine && n.rect && D.canWrite() ? `<button class="pill ghost" data-hideme>${icon('eyeoff')}<span>${L('اخفيها عندي', 'Hide for me', 'أخفها عندي')}</span></button>` : ''}
          ${mine ? `<button class="pill ghost" data-del>${icon('trash')}<span>${L('امسح', 'Delete', 'احذف')}</span></button>` : ''}
        </div>
        ${!n.priv ? `<div class="replies" id="nt-replies" data-keep-scroll>${rs.length ? rs.map((r) => `<div class="rep">${D.avatar(r.by, 'sm')}<div class="rep-b"><b>${esc(D.name(r.by))}</b><small>${L.ago(r.at)} ${V.editedTag(r)}</small><p dir="auto">${esc(r.text)}</p></div>${r.by === S.me ? `<span class="rep-acts"><button class="ib sm" data-editrep="${esc(r.id)}" aria-label="${L('عدّل', 'Edit')}">${icon('edit')}</button><button class="ib sm" data-delrep="${esc(r.id)}" aria-label="${L('امسح', 'Delete', 'احذف')}">${icon('trash')}</button></span>` : ''}</div>`).join('') : `<p class="muted sm">${L('محدش رد لسه. ابدأ النقاش!', 'No replies yet. Start the conversation!', 'لا ردود بعد. ابدأ النقاش!')}</p>`}</div>
        ${D.canWrite() ? `<form class="composer" data-reply><textarea id="nt-reply-${esc(n.id)}" rows="1" dir="auto" maxlength="${U.MAX.reply}" placeholder="${L('اكتب ردك…', 'Write a reply…')}"></textarea><button class="btn icon-only" aria-label="${L('ابعت', 'Send', 'أرسل')}">${icon('send', 'flip-rtl')}</button></form>` : ''}` : ''}
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
          // Decide what was tapped before anything is saved: saving redraws this sheet, and the redraw can turn
          // the tapped button into a different one.
          const q = (sel) => e.target.closest(sel);
          const hit = { like: q('[data-like]'), gopage: q('[data-gopage]'), del: q('[data-del]'), unmove: q('[data-unmove]'), hideme: q('[data-hideme]'), editnote: q('[data-editnote]'), editrep: q('[data-editrep]'), delrep: q('[data-delrep]') };
          if (hit.like) return V.like(n.id);
          if (hit.gopage) {
            api.close();
            if (A.R.isOpen() && A.R.bookId() === n.b) A.R.goTo(n.page, n.id);
            else A.R.open(n.b, { page: n.page, flash: n.id });
            return;
          }
          if (hit.del) {
            if (!(await V.confirm(L('هتمسح الملاحظة دي وكل الردود عليها.', 'This deletes the note and its replies.', 'ستحذف هذه الملاحظة وكل الردود عليها.'), L('امسح', 'Delete', 'احذف'), true))) return;
            api.close();
            if (n.priv) {
              await D.mutate(`data/users/${S.me}/priv`, () => {
                const cur = S.priv || {};
                const notes = Object.assign({}, cur.notes);
                delete notes[n.id];
                return Object.assign({}, cur, { notes });
              });
            } else await D.del(`notes/${n.id}`);
            return;
          }
          if (hit.unmove) {
            await D.privUpdate((cur) => {
              const m = Object.assign({}, cur.moved);
              delete m[n.id];
              return Object.assign(cur, { moved: m });
            });
            return U.toast(L('رجعت مكانها ✓', 'Back in place ✓', 'عادت إلى مكانها ✓'));
          }
          if (hit.hideme) {
            api.close();
            await D.privUpdate((cur) => Object.assign(cur, { hidden: Object.assign({}, cur.hidden, { [n.id]: U.nowIso() }) }));
            return U.toast(L('اتخبّت عندك بس. ترجّعها من ⋯ في القارئ.', 'Hidden on your screen only. Bring it back from ⋯ in the reader.', 'تم إخفاؤها عندك فقط. يمكنك إعادتها من ⋯ في القارئ.'));
          }
          if (hit.editnote) {
            api.close();
            return V.editNote(n);
          }
          if (hit.editrep) {
            const rid = hit.editrep.dataset.editrep;
            const r = (n.replies || {})[rid];
            if (r && r.by === S.me)
              V.editText({
                title: L('عدّل ردك', 'Edit your reply'),
                value: r.text,
                max: U.MAX.reply,
                onSave: (text) => D.update(`notes/${n.id}`, { replies: { [rid]: { by: S.me, text, at: r.at, edited: U.nowIso() } } }),
              });
            return;
          }
          if (hit.delrep) await D.update(`notes/${n.id}`, { replies: { [hit.delrep.dataset.delrep]: { by: S.me, text: '', at: U.nowIso() } } });
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
    const book = D.book(n.b);
    const lc = likeCount(n);
    const rc = replies(n).length;
    const liked = n.likes && n.likes[S.me];
    const isTake = n.kind === 'take';
    const w = book && n.wid ? G.wirds(book).find((x) => x.id === n.wid) : null;
    return `<article class="ncard k-${esc(n.kind)}${isTake ? ' take' : ''}">
      <header>${D.avatar(n.by, 'sm')}<div class="nc-who"><b data-act="member" data-uid="${esc(n.by)}">${esc(D.name(n.by))}</b><small>${V.kindLabel(n.kind)}${opts.showBook && book ? ` • <span dir="auto">${esc(book.title)}</span>` : ''}${n.page && !isTake ? ` • ${L('ص', 'p.')} ${L.num(n.page)}` : ''}${isTake && w ? ` • ${L('الورد', 'Portion')} ${L.num(w.n)}` : ''} • ${L.ago(n.at)} ${V.editedTag(n)}</small></div></header>
      ${n.crop ? `<button class="nc-crop" data-act="open-note" data-nid="${esc(n.id)}" style="--c:${U.col(n.color)}"><img src="${esc(n.crop)}" alt="${esc(L('الجزء المظلّل', 'Highlighted passage'))}" loading="lazy"></button>` : ''}
      ${n.text ? `<p class="nc-text${n.kind === 'quote' ? ' quote' : ''}" dir="auto">${esc(n.text.length > 420 ? n.text.slice(0, 400).replace(/\s+\S*$/, '') + '…' : n.text)}</p>${n.text.length > 420 ? `<button class="lnk nc-more" data-act="open-note" data-nid="${esc(n.id)}">${L('اقرأ الباقي', 'Read more', 'اقرأ البقية')}</button>` : ''}` : ''}
      <footer>
        <button class="pill${liked ? ' on' : ''}" data-act="like" data-nid="${esc(n.id)}" aria-label="${L('إعجاب', 'Like')}">${icon('heart')}<span>${L.num(lc)}</span></button>
        <button class="pill" data-act="open-note" data-nid="${esc(n.id)}">${icon('chat')}<span>${rc ? L.num(rc) : L('رد', 'Reply')}</span></button>
        ${n.page && book && !isTake ? `<button class="pill ghost" data-act="read" data-b="${esc(n.b)}" data-p="${n.page}">${icon('books')}<span>${L('الصفحة', 'Page')}</span></button>` : ''}
      </footer>
    </article>`;
  };
})();
