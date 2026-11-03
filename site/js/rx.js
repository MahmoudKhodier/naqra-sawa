/* Reactions everywhere, like Facebook's: a tap on the reaction button is a 👍 (a tap again takes it back); holding
   it brings up the bar of animated emoji (the same as on a line of the book) — slide the finger across and let go
   on one, or tap one; the bar also shows who reacted with what. One reaction per member per thing.
   Kinds register how to read and write their reactions: V.rxKind(name, { list(id) → [{u, e}], set(id, e) }), and
   V.rxPill(kind, id) draws the button. Notes, replies, chat messages and «خلّص الورد/الكتاب» in the news use it;
   the book's lines use the same emoji (reader.js). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V } = A;
  const esc = U.esc;

  V.RX = ['👍', '❤️', '😂', '😮', '💔', '🔥', '🤯'];
  V.rxName = () => ({ '👍': L('عجبني', 'Like', 'أعجبني'), '😂': L('ضحكني', 'Haha', 'أضحكني'), '😮': L('واو', 'Wow'), '💔': L('زعّلني', 'Sad', 'أحزنني'), '🔥': L('نار', 'Fire', 'رائع'), '🤯': L('دماغي طارت', 'Mind blown', 'أذهلني'), '❤️': L('حبيته', 'Love', 'أحببته') });
  V.RX_COL = { '👍': '#3b82f6', '😂': '#ffcc3d', '😮': '#ffcc3d', '💔': '#ff4d6d', '🔥': '#ff7a1a', '🤯': '#ffb02e', '❤️': '#ff3355' };
  const kinds = {};
  V.rxKind = (name, def) => (kinds[name] = def);
  /* Reactions made with no connection wait on this phone (and show as made) until they go through. */
  const QKEY = () => 'rxQueue:' + S.me;
  const queue = () => U.store.get(QKEY(), []) || [];
  const queued = (kind, id) => queue().find((q) => q.kind === kind && q.id === id);
  // (a reaction someone left on their own thing, from before that was stopped, doesn't count or show)
  const listOf = (kind, id) => {
    try {
      const own = kinds[kind] && kinds[kind].owner ? kinds[kind].owner(id) : '';
      let list = ((kinds[kind] && kinds[kind].list(id)) || []).filter((x) => !own || x.u !== own);
      const q = queued(kind, id);
      if (q) list = [...list.filter((x) => x.u !== S.me), ...(q.e ? [{ u: S.me, e: q.e }] : [])];
      return list;
    } catch (e) {
      return [];
    }
  };
  const offlineError = (er) => !er || !er.code || !['invalid_argument', 'too_large', 'quota_exceeded', 'resource_exhausted'].includes(er.code);
  let flushing = false;
  V.rxFlush = async () => {
    if (flushing || !S.me || !navigator.onLine) return;
    const q = queue();
    if (!q.length) return;
    flushing = true;
    try {
      for (const it of q) {
        try {
          await kinds[it.kind].set(it.id, it.e);
        } catch (er) {
          if (offlineError(er)) break; // still no connection: try again later
        }
        U.store.set(QKEY(), queue().filter((x) => !(x.kind === it.kind && x.id === it.id && x.at === it.at)));
      }
    } finally {
      flushing = false;
      V.render && V.render();
    }
  };
  window.addEventListener('online', () => setTimeout(V.rxFlush, 800));
  V.after = V.after || [];
  let booted = false;
  V.after.push(() => !booted && S.loaded && S.loaded.notes && ((booted = true), setTimeout(V.rxFlush, 1500))); // what waited from last time
  setInterval(() => queue().length && V.rxFlush(), 30000);

  /* Whose thing it is: nobody reacts to their own (they can still see who reacted). */
  const ownerOf = (kind, id) => {
    try {
      return (kinds[kind] && kinds[kind].owner && kinds[kind].owner(id)) || '';
    } catch (e) {
      return '';
    }
  };
  /* The button. Nothing yet: a grey 👍 (nothing at all on my own things). Some: the emoji used (mine first) and
     how many. On my own things it only shows who reacted. Its width doesn't jump when the count appears. */
  V.rxPill = (kind, id, opts = {}) => {
    const list = listOf(kind, id);
    const own = ownerOf(kind, id) === S.me;
    if (own && !list.length) return opts.keep ? '<span class="rxp-gap"></span>' : '';
    const mine = (list.find((x) => x.u === S.me) || {}).e || '';
    const counts = {};
    for (const x of list) counts[x.e] = (counts[x.e] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map((x) => x[0]).filter((e) => e !== mine);
    const shown = (mine ? [mine, ...top] : top).slice(0, 3);
    const names = V.rxName();
    const label = own ? L('مين اتفاعل', 'Who reacted', 'من تفاعل') : mine ? names[mine] || mine : L('تفاعل', 'React', 'تفاعل');
    return `<button type="button" class="pill rxp${mine ? ' on' : ''}${own ? ' own' : ''}${opts.cls ? ' ' + opts.cls : ''}" data-rx="${esc(kind)}" data-rx-id="${esc(id)}"${own ? ' data-rx-own="1"' : ''} aria-label="${esc(label)}${list.length ? ' • ' + L.num(list.length) : ''}"${D.canWrite() ? '' : ' disabled'}>
      ${shown.length ? `<span class="rxp-top">${shown.map((e) => `<i>${e}</i>`).join('')}</span><span class="rxp-n">${L.num(list.length)}</span>` : '<span class="rxp-me off">👍</span>'}</button>`;
  };

  async function pick(kind, id, e, from) {
    const k = kinds[kind];
    if (!k || !D.canWrite() || ownerOf(kind, id) === S.me) return;
    if (U.buzz) U.buzz('soft');
    else if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {}
    if (e && from) burst(e, from);
    const wait = (msg) => {
      U.store.set(QKEY(), [...queue().filter((x) => !(x.kind === kind && x.id === id)), { kind, id, e, at: Date.now() }]);
      V.render && V.render();
      if (msg) U.toast(L('مفيش نت دلوقتي — هيتبعت لوحده لما النت يرجع', 'No connection — it goes out by itself once you’re back online', 'لا اتصال الآن — سيُرسل تلقائيًا عند عودة الاتصال'));
    };
    if (!navigator.onLine) return wait(true);
    try {
      await k.set(id, e);
      if (e) U.chime && U.chime('soft');
      if (queued(kind, id)) U.store.set(QKEY(), queue().filter((x) => !(x.kind === kind && x.id === id)));
    } catch (er) {
      if (offlineError(er)) wait(true); // the data layer already said why when it's anything else
    }
  }
  /* The picked emoji pops up from where it was picked, with a few dots. */
  function burst(e, at) {
    const f = document.createElement('div');
    f.className = 'rx-fly';
    f.style.left = at.x + 'px';
    f.style.top = at.y + 'px';
    document.body.appendChild(f);
    if (A.Lot) A.Lot.play(f, A.Lot.code(e), { fallback: e, detached: true });
    else f.textContent = e;
    f.animate([{ transform: 'scale(.6)', opacity: 1 }, { transform: 'translateY(-50px) scale(1.5)', opacity: 1, offset: 0.6 }, { transform: 'translateY(-70px) scale(1.1)', opacity: 0 }], { duration: 700, easing: 'ease-out', fill: 'forwards' }).finished.then(() => f.remove());
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('i');
      d.className = 'rx-dot';
      d.style.background = V.RX_COL[e] || '#ffcc3d';
      d.style.left = at.x + 'px';
      d.style.top = at.y + 'px';
      document.body.appendChild(d);
      const ang = (i / 8) * Math.PI * 2, dist = 20 + Math.random() * 14;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(.3)`, opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' }).finished.then(() => d.remove());
    }
  }

  /* The bar above the button (below it when there's no room). dragging: the finger is still down. */
  let bar = null;
  function closeBar() {
    if (!bar) return;
    const b = bar;
    bar = null;
    if (b.stop) b.stop();
    b.el.classList.add('out');
    setTimeout(() => b.el.remove(), 180);
  }
  V.rxClose = closeBar;
  /* Open the bar for something from elsewhere (a message's ⋯ menu), anchored on el. */
  V.rxOpen = (el, kind, id) => openBar({ dataset: { rx: kind, rxId: id }, getBoundingClientRect: () => el.getBoundingClientRect() }, false);
  function openBar(btn, dragging, x0, y0) {
    closeBar();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    const kind = btn.dataset.rx, id = btn.dataset.rxId;
    const list = listOf(kind, id);
    const own = ownerOf(kind, id) === S.me; // my own: who reacted, nothing to pick
    const mine = (list.find((x) => x.u === S.me) || {}).e || '';
    const names = V.rxName();
    const el = document.createElement('div');
    el.className = 'rx-bar fix';
    el.id = 'rx-gbar';
    el.innerHTML = `${list.length ? `<div class="rx-who">${list.slice(0, 24).map((r) => `<span title="${esc(D.name(r.u))}">${D.avatar(r.u, 'xs')}<b>${esc(r.e)}</b></span>`).join('')}</div>` : ''}
      ${own ? (list.length ? '' : `<p class="rx-none muted sm">${L('لسه محدش اتفاعل', 'No reactions yet', 'لا تفاعلات بعد')}</p>`) : `<div class="rx-pick">${V.RX.map((e, i) => `<button class="rx-i${mine === e ? ' on' : ''}" style="animation-delay:${i * 34}ms" data-e="${e}" aria-label="${names[e]}"><i class="lot" data-lot="${A.Lot ? A.Lot.code(e) : ''}" data-fb="${e}"></i><span class="rx-l">${names[e]}</span></button>`).join('')}${mine ? `<button class="rx-off" data-e="" aria-label="${L('شيل تفاعلي', 'Remove mine', 'أزل تفاعلي')}">${U.icon('close')}</button>` : ''}</div>`}`;
    document.body.appendChild(el);
    if (A.Lot) A.Lot.mount(el);
    else el.querySelectorAll('.lot').forEach((i) => (i.textContent = i.dataset.fb));
    const r = btn.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = U.clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
    const above = r.top - h - 14;
    el.style.top = (above > 8 ? above : Math.min(innerHeight - h - 8, r.bottom + 14)) + 'px';
    bar = { el, kind, id, btn };
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-e]');
      if (!b) return;
      ev.stopPropagation();
      const rr = b.getBoundingClientRect();
      closeBar();
      pick(kind, id, b.dataset.e, { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 });
    });
    if (!dragging || own) return;
    // slide across while the finger is down; letting go on an emoji picks it, anywhere else leaves the bar open
    let moved = false, cur = null;
    const row = el.querySelector('.rx-pick');
    const hover = (cx, cy) => {
      if (!moved && Math.hypot(cx - x0, cy - y0) < 14) return null;
      moved = true;
      const rr = row.getBoundingClientRect();
      let on = null;
      if (cy >= rr.top - 70 && cy <= rr.bottom + 22 && cx >= rr.left - 16 && cx <= rr.right + 16) {
        let best = 1e9;
        for (const b of el.querySelectorAll('.rx-i')) {
          const br = b.getBoundingClientRect();
          const d = Math.abs(cx - (br.left + br.width / 2));
          if (d < best) (best = d), (on = b);
        }
      }
      for (const b of el.querySelectorAll('.rx-i')) b.classList.toggle('hov', b === on);
      el.classList.toggle('hovering', !!on);
      if (on && on !== cur && navigator.vibrate) try { navigator.vibrate(8); } catch (er) {}
      cur = on;
      return on;
    };
    const done = () => {
      document.removeEventListener('touchmove', tmv, { passive: false });
      document.removeEventListener('touchend', tend);
      document.removeEventListener('touchcancel', tend);
      document.removeEventListener('pointermove', pmv);
      document.removeEventListener('pointerup', pup);
      if (bar && bar.el === el) bar.stop = null;
    };
    const lift = (cx, cy) => {
      done();
      if (!bar || bar.el !== el) return;
      const on = cx == null ? null : hover(cx, cy);
      el.classList.remove('hovering');
      for (const b of el.querySelectorAll('.rx-i.hov')) b.classList.remove('hov');
      if (on) {
        const rr = on.getBoundingClientRect();
        closeBar();
        pick(kind, id, on.dataset.e, { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 });
      }
    };
    const tmv = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const t = ev.touches[0];
      if (t) hover(t.clientX, t.clientY);
    };
    const tend = (ev) => {
      const t = ev.changedTouches && ev.changedTouches[0];
      lift(ev.type === 'touchend' && t ? t.clientX : null, t ? t.clientY : null);
    };
    const pmv = (ev) => ev.pointerType !== 'touch' && hover(ev.clientX, ev.clientY);
    const pup = (ev) => ev.pointerType !== 'touch' && lift(ev.clientX, ev.clientY);
    document.addEventListener('touchmove', tmv, { passive: false });
    document.addEventListener('touchend', tend);
    document.addEventListener('touchcancel', tend);
    document.addEventListener('pointermove', pmv);
    document.addEventListener('pointerup', pup);
    bar.stop = done;
  }

  /* The button: a tap is 👍 (or takes mine back); holding opens the bar. */
  let lp = null, heldAt = 0;
  document.addEventListener('pointerdown', (e) => {
    if (bar && !e.target.closest('#rx-gbar')) closeBar();
    const btn = e.target.closest('[data-rx]');
    if (!btn || btn.disabled || !e.isPrimary) return;
    lp = { btn, x: e.clientX, y: e.clientY };
    document.documentElement.classList.add('rx-hold'); // no text selection while the finger is on it
    lp.t = setTimeout(() => {
      if (!lp) return;
      heldAt = Date.now();
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {}
      openBar(lp.btn, true, lp.x, lp.y);
      lp = null;
    }, 420);
  });
  const cancel = () => {
    if (lp) clearTimeout(lp.t);
    lp = null;
  };
  const unhold = () => setTimeout(() => !lp && !(bar && bar.stop) && document.documentElement.classList.remove('rx-hold'), 50);
  document.addEventListener('pointerup', unhold);
  document.addEventListener('touchend', unhold);
  document.addEventListener('selectstart', (e) => {
    if (lp || (bar && bar.stop)) e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10 && cancel());
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('scroll', cancel, true);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rx]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
    if (Date.now() - heldAt < 700) return; // the click that ends a hold
    if (btn.disabled) return;
    if (btn.dataset.rxOwn) return openBar(btn, false); // my own: who reacted
    const list = listOf(btn.dataset.rx, btn.dataset.rxId);
    const mine = (list.find((x) => x.u === S.me) || {}).e || '';
    const r = btn.getBoundingClientRect();
    pick(btn.dataset.rx, btn.dataset.rxId, mine ? '' : '👍', mine ? null : { x: r.left + r.width / 2, y: r.top });
  }, true);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-rx]') || Date.now() - heldAt < 900) e.preventDefault();
  });

  /* ---------- the kinds ---------- */
  // a note: rx (member → emoji); likes (member → time) is kept for older apps and counted as 👍
  V.rxKind('note', {
    owner: (id) => (S.notes.get(id) || {}).by,
    list: (id) => {
      const n = S.notes.get(id);
      if (!n) return [];
      const rx = n.rx || {}, likes = n.likes || {};
      const out = [];
      for (const u of new Set([...Object.keys(rx), ...Object.keys(likes)])) {
        if (!likes[u]) continue; // taken back (here, or by an older app)
        out.push({ u, e: rx[u] || '👍' });
      }
      return out;
    },
    set: (id, e) => D.update(`notes/${id}`, { likes: { [S.me]: e ? U.nowIso() : false }, rx: { [S.me]: e } }),
  });
  // a reply to a note: rrx (reply → member → emoji); id = noteId|replyId
  V.rxKind('rep', {
    owner: (id) => {
      const [nid, rid] = id.split('|');
      return (((S.notes.get(nid) || {}).replies || {})[rid] || {}).by;
    },
    list: (id) => {
      const [nid, rid] = id.split('|');
      const n = S.notes.get(nid);
      const m = (n && n.rrx && n.rrx[rid]) || {};
      return Object.entries(m).filter(([, e]) => e).map(([u, e]) => ({ u, e }));
    },
    set: (id, e) => {
      const [nid, rid] = id.split('|');
      return D.update(`notes/${nid}`, { rrx: { [rid]: { [S.me]: e } } });
    },
  });
  // a chat message: react (emoji → member → true); the older names (heart, fire…) read as their emoji
  const OLD = { heart: '❤️', fire: '🔥', clap: '👏', idea: '💡', laugh: '😂' };
  V.rxKind('msg', {
    owner: (id) => (S.msgs.find((x) => x.id === id) || {}).by,
    list: (id) => {
      const m = S.msgs.find((x) => x.id === id);
      const out = [], seen = new Set();
      for (const [k, us] of Object.entries((m && m.react) || {}))
        for (const [u, on] of Object.entries(us || {}))
          if (on && !seen.has(u)) {
            seen.add(u);
            out.push({ u, e: OLD[k] || k });
          }
      return out;
    },
    set: (id, e) => {
      const m = S.msgs.find((x) => x.id === id);
      const react = {};
      for (const [k, us] of Object.entries((m && m.react) || {})) if (us && us[S.me]) react[k] = { [S.me]: false };
      if (e) react[e] = { [S.me]: true };
      return D.update(`msgs/${id}`, { react });
    },
  });
  // «خلّص الورد» / «خلّص الكتاب» in the news: a doc per member and event (col 'evrx'); the first reaction to a
  // friend's also sends them a cheer, as the old «شجّع» button did
  const evId = (k) => `${U.hash(k).toString(36)}-${S.me}`;
  V.rxKind('ev', {
    owner: (k) => String(k).split('|')[1],
    list: (k) => [...(S.evrx || new Map()).values()].filter((r) => r.k === k && r.e && S.members.has(r.by)).map((r) => ({ u: r.by, e: r.e })),
    set: async (k, e) => {
      if (!e) return D.del(`evrx/${evId(k)}`);
      const had = [...(S.evrx || new Map()).values()].some((r) => r.k === k && r.by === S.me);
      await D.set(`evrx/${evId(k)}`, { k, e, by: S.me, at: U.nowIso() });
      const [, to, b, wid] = k.split('|');
      if (!had && to && to !== S.me && V.poke) V.poke(to, 'cheer', { b, wid: wid || '', quiet: true });
    },
  });
})();
