/* Views: shell, routing, HUD, sheets, menus, celebrations and shared widgets. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const V = (A.V = { screens: {}, state: { route: 'home', opts: {} }, sheets: [] });
  const esc = U.esc;
  const icon = U.icon;

  /* ---------- small widgets ---------- */
  V.star = (content = '', cls = '') => `<span class="star8 ${cls}">${content ? `<b>${content}</b>` : ''}</span>`;
  V.bar = (f, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.round(U.clamp(f, 0, 1) * 100)}%"></i></span>`;
  V.ring = (f, inner = '', cls = '', size = 64) => {
    const r = 42, c = 2 * Math.PI * r;
    const off = c * (1 - U.clamp(f, 0, 1));
    return `<span class="ring ${cls}" style="--s:${size}px"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rg-bg" cx="50" cy="50" r="${r}"/><circle class="rg-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><span class="rg-in">${inner}</span></span>`;
  };
  V.stars = (n, editable = false, id = '') => {
    let h = `<span class="stars${editable ? ' edit' : ''}" ${id ? `id="${id}"` : ''} data-v="${n || 0}" role="${editable ? 'radiogroup' : 'img'}" aria-label="${L.num(n || 0)} / ${L.num(5)}">`;
    for (let i = 1; i <= 5; i++) h += editable ? `<button type="button" class="st${i <= n ? ' on' : ''}" data-star="${i}" aria-label="${L.num(i)}">★</button>` : `<i class="st${i <= n ? ' on' : ''}">★</i>`;
    return h + '</span>';
  };
  V.cover = (book, cls = '') => {
    if (book.cover) return `<span class="cover ${cls}"><img src="${esc(book.cover)}" alt=""></span>`;
    return V.genCover(book.title, book.author, cls);
  };
  V.genCover = (title, author, cls = '') => {
    const [bg, fg] = U.spineOf(title);
    return `<span class="cover gen ${cls}" style="--bg:${bg};--fg:${fg}"><span class="gc-star"></span><b dir="auto">${esc(title)}</b>${author ? `<small dir="auto">${esc(author)}</small>` : ''}</span>`;
  };
  V.kindLabel = (k) =>
    ({ hl: L('تظليل', 'Highlight'), note: L('ملاحظة', 'Note'), q: L('سؤال', 'Question'), quote: L('اقتباس', 'Quote'), take: L('خلاصة', 'Takeaway') })[k] || L('ملاحظة', 'Note');
  V.empty = (title, text, action = '') =>
    `<div class="empty"><span class="star8 faint"></span><b>${title}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;

  /* ---------- routing ---------- */
  const ROUTES = ['home', 'books', 'shelf', 'circle', 'me'];
  V.go = (route, opts = {}) => {
    V.state = { route, opts };
    const h = '#' + route;
    if (location.hash !== h) {
      V._silentHash = true;
      location.hash = h;
    }
    V.render(true);
    const sc = document.getElementById('screen');
    if (sc) sc.scrollTop = 0;
    window.scrollTo(0, 0);
  };
  V.fromHash = () => {
    const h = (location.hash || '').slice(1);
    if (!h) return;
    if (ROUTES.includes(h) || /^book-[a-z0-9]+$/.test(h)) V.state = { route: h, opts: V.state.route === h ? V.state.opts : {} };
  };

  /* ---------- rendering with input preservation ---------- */
  function keepInputs(root) {
    const vals = {};
    for (const el of root.querySelectorAll('input[id],textarea[id],select[id]')) {
      if (el.type === 'file') continue;
      vals[el.id] = { v: el.type === 'checkbox' ? el.checked : el.value, s: el.selectionStart, e: el.selectionEnd };
    }
    const scrolls = {};
    for (const el of root.querySelectorAll('[data-keep-scroll][id]')) scrolls[el.id] = { t: el.scrollTop, atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 30 };
    const f = document.activeElement;
    return { vals, scrolls, focus: f && root.contains(f) && f.id ? f.id : null };
  }
  /* Minimal DOM morph: update only what changed, so focus, scroll, images and animations survive live updates. */
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') || n.id || '' : '');
  const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && keyOf(a) === keyOf(b)));
  function morphAttrs(a, b) {
    for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name) && !at.name.startsWith('data-rt')) a.removeAttribute(at.name);
    for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    if (a.tagName === 'INPUT' && document.activeElement !== a) {
      if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
      else if (b.hasAttribute('value') && a.value !== b.getAttribute('value')) a.value = b.getAttribute('value');
    }
  }
  function morphKids(a, b) {
    const kids = Array.from(b.childNodes);
    let cur = a.firstChild;
    for (const k of kids) {
      if (cur && same(cur, k)) {
        morphNode(cur, k);
        cur = cur.nextSibling;
        continue;
      }
      const key = keyOf(k);
      let found = null;
      if (key) for (let n = cur; n; n = n.nextSibling) if (same(n, k)) { found = n; break; }
      if (found) {
        a.insertBefore(found, cur);
        morphNode(found, k);
      } else a.insertBefore(k, cur);
    }
    while (cur) {
      const nx = cur.nextSibling;
      a.removeChild(cur);
      cur = nx;
    }
  }
  function morphNode(a, b) {
    if (a.nodeType !== 1) {
      if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
      return;
    }
    morphAttrs(a, b);
    if (a.tagName === 'TEXTAREA') return;
    if (a.hasAttribute('data-rt-skip')) return;
    morphKids(a, b);
  }
  V.patch = (root, html) => {
    const k = keepInputs(root);
    if (!root.firstChild) {
      root.innerHTML = html;
      return;
    }
    const t = document.createElement('template');
    t.innerHTML = html;
    morphKids(root, t.content);
    for (const [id, x] of Object.entries(k.scrolls)) {
      const el = root.querySelector('#' + CSS.escape(id));
      if (el && x.atBottom) el.scrollTop = el.scrollHeight;
    }
  };

  V.render = (force) => {
    const app = document.getElementById('app');
    if (!app) return;
    if (S.phase === 'loading') return;
    if (S.phase === 'nodb') {
      app.innerHTML = V.screens.nodb();
      return;
    }
    const ready = S.loaded.members && S.loaded.books;
    if (!ready) return;
    if (!D.joined() && !V.viewOnly) {
      if (!app.querySelector('.onboard')) app.innerHTML = V.screens.onboard();
      else V.screens.onboardUpdate && V.screens.onboardUpdate();
      return;
    }
    if (!app.querySelector('.shell')) app.innerHTML = shell();
    if (A.R.isOpen() && !force) {
      A.R.onData();
      hud();
      refreshSheets();
      V.celebrate();
      return;
    }
    hud();
    nav();
    const r = V.state.route;
    const scr = document.getElementById('screen');
    let html = '';
    if (r.startsWith('book-')) html = V.screens.book(r.slice(5), V.state.opts);
    else html = (V.screens[r] || V.screens.home)(V.state.opts);
    scr.dataset.route = r.startsWith('book-') ? 'book' : r;
    V.patch(scr, html);
    V.after && V.after.forEach((fn) => fn(scr));
    refreshSheets();
    V.celebrate();
  };

  function shell() {
    return `<div class="shell">
      <nav class="nav" id="nav" aria-label="${L('التنقل', 'Navigation')}"></nav>
      <div class="main">
        <header class="hud" id="hud"></header>
        <main class="screen" id="screen"></main>
      </div>
    </div>`;
  }

  function nav() {
    const el = document.getElementById('nav');
    const r = V.state.route.startsWith('book-') ? 'books' : V.state.route;
    const pokes = V.myPokes().length;
    const unreadCircle = V.unread('_c', 'gen');
    const item = (id, ic, label, badge = 0) =>
      `<a href="#${id}" class="nv${r === id ? ' on' : ''}" data-go="${id}" ${r === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge ? `<i class="nv-b">${L.num(Math.min(badge, 99))}</i>` : ''}</a>`;
    el.innerHTML = `<div class="brand">${V.star('', 'gold sm')}<b>${L('نقرأ سوا', 'Read Together')}</b></div>
      ${item('home', 'home', L('اليوم', 'Today'), pokes)}
      ${item('books', 'books', L('كتبنا', 'Our books'))}
      ${item('shelf', 'shelf', L('مكتبتي', 'My shelf'))}
      ${item('circle', 'users', L('الحلقة', 'Circle'), unreadCircle)}
      ${item('me', 'user', L('أنا', 'Me'))}`;
  }

  function hud() {
    const el = document.getElementById('hud');
    if (!el) return;
    const s = G.of(S.me);
    const flame = s.streak ? (s.atRisk ? 'risk' : 'hot') : 'cold';
    const pct = s.span ? s.cur / s.span : 0;
    const html = `<button class="hud-me" data-go="me" aria-label="${L('ملفي', 'My profile')}">${D.avatar(S.me, 'sm')}${V.star(L.num(s.lv), 'gold lvl')}</button>
      <div class="hud-xp" title="${L(`فاضل ${L.num(s.toNext)} XP للمستوى الجاي`, `${s.toNext} XP to next level`)}"><span class="hud-t">${esc(G.title(s.lv))}</span>${V.bar(pct, 'gold')}<small>${L.num(s.cur)} / ${L.num(s.span)} XP</small></div>
      ${V.inboxUnread ? `<button class="ib hud-bell" data-act="inbox" aria-label="${L('الجديد ليك', 'For you')}">${icon('bell')}${V.inboxUnread() ? `<i class="nv-b">${L.num(Math.min(V.inboxUnread(), 99))}</i>` : ''}</button>` : ''}
      <span class="chip-flame ${flame}" title="${s.atRisk ? L('اقرأ النهارده عشان السلسلة متقطعش', 'Read today to keep your streak') : L('أيام القراءة المتتالية', 'Reading streak')}">${icon('flame')}<b>${L.num(s.streak)}</b>${s.freezes ? `<i class="fz" title="${L('حماية للسلسلة', 'Streak freeze')}">${icon('snow')}${s.freezes > 1 ? L.num(s.freezes) : ''}</i>` : ''}</span>
      ${V.themeBtn ? V.themeBtn('data-act="theme-toggle"') : ''}<button class="ib lang" data-act="lang" aria-label="${L('English', 'العربية')}">${L('EN', 'ع')}</button>`;
    if (el.dataset.rtH !== html) {
      el.innerHTML = html;
      el.dataset.rtH = html;
    }
    if (S.readOnly && !document.getElementById('ro-banner')) {
      const b = document.createElement('div');
      b.id = 'ro-banner';
      b.className = 'ro-banner';
      b.innerHTML = `${icon('eye')}<span>${L('التغييرات مش بتتحفظ دلوقتي. اتأكد من النت، ولو اتشلت من الحلقة اطلب لينك دعوة جديد.', 'Changes are not saving right now. Check your connection; if you were removed from the circle, ask for a new invite link.')}</span>`;
      el.after(b);
    }
  }

  /* ---------- sheets (dialogs), menus, confirm ---------- */
  V.sheet = ({ title = '', html = '', cls = '', onMount, onData, wide = false }) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-bg" data-close></div><section class="sheet ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}">
      <header class="sh-head"><b>${title}</b><button class="ib" data-close aria-label="${L('قفل', 'Close')}">${icon('close')}</button></header>
      <div class="sh-body">${html}</div></section>`;
    document.getElementById('layers').appendChild(wrap);
    const prevFocus = document.activeElement;
    const api = { el: wrap.querySelector('.sheet'), body: wrap.querySelector('.sh-body'), onData, closed: false };
    api.close = () => {
      if (api.closed) return;
      api.closed = true;
      wrap.classList.remove('in');
      V.sheets = V.sheets.filter((x) => x !== api);
      setTimeout(() => wrap.remove(), 220);
      api.onClose && api.onClose();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
    };
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) api.close();
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        api.close();
      }
    });
    V.sheets.push(api);
    requestAnimationFrame(() => wrap.classList.add('in'));
    onMount && onMount(api.body, api);
    setTimeout(() => {
      const f = api.body.querySelector('[autofocus]') || api.el.querySelector('.sh-head .ib');
      f && f.focus({ preventScroll: true });
    }, 60);
    return api;
  };
  function refreshSheets() {
    for (const s of V.sheets) if (s.onData) try { s.onData(s.body, s); } catch (e) { console.error(e); }
  }
  V.refreshSheets = refreshSheets;

  V.menu = (items) => {
    const html = `<div class="menu">${items
      .map((it, i) => `<button class="mi ${it.cls || ''} ${it.danger ? 'danger' : ''}" data-i="${i}">${icon(it.ic || 'fwd')}<span>${it.t}</span></button>`)
      .join('')}</div>`;
    V.sheet({
      title: L('اختيارات', 'Options'),
      html,
      cls: 'menu-sheet',
      onMount: (body, api) =>
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (!b) return;
          api.close();
          items[+b.dataset.i].fn();
        }),
    });
  };

  V.confirm = (text, ok = L('تمام', 'OK'), danger = false) =>
    new Promise((res) => {
      let done = false;
      const api = V.sheet({
        title: L('متأكد؟', 'Are you sure?'),
        html: `<p class="lead">${text}</p><div class="row-btns end"><button class="btn ghost" data-no>${L('لأ', 'No')}</button><button class="btn ${danger ? 'rubric' : ''}" data-yes autofocus>${ok}</button></div>`,
        onMount: (body, a) =>
          body.addEventListener('click', (e) => {
            if (e.target.closest('[data-yes]')) {
              done = true;
              res(true);
              a.close();
            }
            if (e.target.closest('[data-no]')) a.close();
          }),
      });
      api.onClose = () => !done && res(false);
    });

  /* ---------- unread tracking (local per device) ---------- */
  V.unread = (b, ch) => {
    const seen = U.store.get('seen:' + b + ':' + ch, null);
    if (!seen) return 0;
    return S.msgs.filter((m) => m.b === b && (m.ch || 'gen') === ch && m.by !== S.me && m.at > seen).length;
  };
  V.markRead = (b, ch) => {
    const last = S.msgs.filter((m) => m.b === b && (m.ch || 'gen') === ch).slice(-1)[0];
    U.store.set('seen:' + b + ':' + ch, last ? last.at : U.nowIso());
  };

  V.myPokes = () => {
    const dis = U.store.get('dismissed:' + S.me, []);
    const week = U.addDays(U.today(), -7);
    return [...S.pokes.values()].filter((p) => p.to === S.me && U.isoKey(p.at) >= week && !dis.includes(p.id)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  };
  V.dismissPoke = (id) => {
    const dis = U.store.get('dismissed:' + S.me, []);
    dis.push(id);
    U.store.set('dismissed:' + S.me, dis.slice(-300));
    V.render();
  };
  V.poke = async (to, kind, ctx = {}) => {
    if (!D.canWrite()) return;
    const today = U.today();
    const dup = [...S.pokes.values()].some((p) => p.from === S.me && p.to === to && p.kind === kind && U.isoKey(p.at) === today && (p.b || '') === (ctx.b || ''));
    if (dup) {
      U.toast(L('اتبعت النهارده خلاص 🙂', 'Already sent today 🙂'));
      return;
    }
    const id = D.newId();
    await D.set(`pokes/${id}`, { to, from: S.me, kind, at: U.nowIso(), b: ctx.b || '', wid: ctx.wid || '' });
    U.chime('soft');
    U.toast(kind === 'cheer' ? L(`التشجيع وصل لـ${esc(D.name(to))} 👏`, `You cheered ${esc(D.name(to))} 👏`) : L(`التذكير وصل لـ${esc(D.name(to))} 👋`, `You nudged ${esc(D.name(to))} 👋`));
  };

  /* ---------- celebrations derived from data changes ---------- */
  let celebBase = null;
  V.celebrate = () => {
    const keys = ['members', 'books', 'prog', 'notes', 'shelf', 'pokes'];
    if (!keys.every((k) => S.loaded[k]) || !D.joined()) return;
    V.inboxInit && V.inboxInit();
    const s = G.of(S.me);
    const q = G.myQuests();
    const now = { lv: s.lv, badges: s.badges.filter((b) => b.got).map((b) => b.b.id), qday: U.today(), qdone: q.every((x) => x.done), fz: s.freezes, frozen: s.frozen || [] };
    if (!V._recapChecked && V.checkRecap) {
      V._recapChecked = true;
      V.checkRecap();
    }
    const key = 'celeb:' + S.me;
    const prev = celebBase || U.store.get(key, null);
    celebBase = now;
    U.store.set(key, now);
    if (!prev) return;
    if (V.freezeNotices) V.freezeNotices(prev, now);
    if (now.lv > prev.lv) setTimeout(() => V.levelUp(now.lv), 400);
    const newB = now.badges.filter((id) => !prev.badges.includes(id));
    newB.forEach((id, i) => {
      const b = G.BADGES.find((x) => x.id === id);
      setTimeout(() => {
        U.chime('ok');
        U.toast(`${V.badgeIcon(b, true, 'xs')}<span><b>${L('وسام جديد!', 'New badge!')}</b> ${esc(L(b.t[0], b.t[1]))}</span>`, 'badge');
      }, 900 + i * 1200);
    });
    if (now.qdone && !(prev.qday === now.qday && prev.qdone)) {
      setTimeout(() => {
        U.chime('big');
        U.toast(`${icon('chest')}<span><b>${L('خلّصت مهام النهارده!', 'Daily quests complete!')}</b> ${L('افتح الصندوق في صفحة اليوم', 'Open your chest on Today')}</span>`, 'gold');
      }, 600);
    }
  };

  V.levelUp = (lv) => {
    U.confetti(1.2);
    U.chime('big');
    V.sheet({
      title: L('مستوى جديد!', 'Level up!'),
      cls: 'celebrate',
      html: `<div class="celeb">${V.star(L.num(lv), 'gold huge spin-in')}<h2>${esc(G.title(lv))}</h2><p>${L(`وصلت للمستوى ${L.num(lv)}. كمّل كده!`, `You reached level ${lv}. Keep going!`)}</p><button class="btn gold" data-close autofocus>${L('يلا بينا', "Let's go")}</button></div>`,
    });
  };

  V.badgeIcon = (b, got, size = '') => `<span class="badge8 ${got ? 'got' : ''} ${size}" style="--h:${(U.hash(b.id) % 6)}">${icon(b.ic)}</span>`;

  /* ---------- shared actions ---------- */
  V.markWird = async (bookId, wid) => {
    if (!D.canWrite()) return;
    const book = S.books.get(bookId);
    const w = G.wirds(book).find((x) => x.id === wid);
    if (!w) return;
    const someoneFirst = G.firstFinisher(bookId, wid);
    const t = U.nowIso();
    await D.saveProg(bookId, (c) => ({ done: Object.assign({}, c.done, { [wid]: t }) }));
    const onTime = U.today() <= w.due;
    const xp = G.XP.wird + (onTime ? G.XP.onTime : 0) + (someoneFirst ? 0 : G.XP.first);
    U.confetti(someoneFirst ? 0.8 : 1.3);
    U.chime('big');
    const others = D.bookProgs(bookId).filter((p) => p.u !== S.me).length;
    V.sheet({
      title: L(`الورد ${L.num(w.n)} ✓`, `Portion ${w.n} ✓`),
      cls: 'celebrate',
      html: `<div class="celeb">${V.star(L.num(w.n), 'jade huge spin-in')}
        <h2>${L('برافو! خلّصت الورد', 'Well done — portion complete!')}</h2>
        <div class="xp-lines">
          <span>${L('الورد', 'Portion')} <b>+${L.num(G.XP.wird)} XP</b></span>
          ${onTime ? `<span>${L('في الميعاد', 'On time')} <b>+${L.num(G.XP.onTime)} XP</b></span>` : ''}
          ${!someoneFirst ? `<span class="gold-t">${L('أول واحد يخلّص!', 'First to finish!')} <b>+${L.num(G.XP.first)} XP</b></span>` : ''}
        </div>
        <p>${L('اكتب خلاصتك في سطرين عشان أصحابك يستفيدوا', 'Share your takeaway in a couple of lines so friends can learn from it')} (+${L.num(G.XP.take)} XP)</p>
        <div class="row-btns center"><button class="btn gold" data-take autofocus>${icon('sparkle')}${L('اكتب خلاصتي', 'Write my takeaway')}</button><button class="btn ghost" data-close>${L('بعدين', 'Later')}</button></div>
        ${others ? `<small class="muted">${L('شوف مين لسه، وشجّعهم من صفحة الكتاب', 'See who is still reading and cheer them on from the book page')}</small>` : ''}
      </div>`,
      onMount: (body, api) =>
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-take]')) {
            api.close();
            V.writeTake(bookId, wid);
          }
        }),
    });
    void xp;
  };

  V.unmarkWird = async (bookId, wid) => {
    if (!(await V.confirm(L('هتشيل علامة «خلّصت» من الورد ده.', 'This removes the done mark from this portion.'), L('شيل العلامة', 'Remove mark'), true))) return;
    await D.saveProg(bookId, (c) => {
      const done = Object.assign({}, c.done);
      delete done[wid];
      return { done };
    });
  };

  V.writeTake = (bookId, wid, existing) => {
    const book = S.books.get(bookId);
    const w = G.wirds(book).find((x) => x.id === wid);
    V.sheet({
      title: L(`خلاصتي في الورد ${L.num(w ? w.n : '')}`, `My takeaway • portion ${w ? w.n : ''}`),
      html: `<p class="muted">${L('إيه أكتر فكرة عجبتك أو فرقت معاك في الورد ده؟', 'What idea stood out or stayed with you in this portion?')}</p>
        <textarea id="take-text" rows="5" dir="auto" maxlength="1500" autofocus placeholder="${L('اكتب هنا…', 'Write here…')}">${esc(existing ? existing.text : '')}</textarea>
        <div class="row-btns end"><button class="btn gold" data-save>${icon('sparkle')}${L('انشر الخلاصة', 'Share takeaway')}</button></div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-save]')) return;
          const text = body.querySelector('#take-text').value.trim();
          if (text.length < 3) return U.toast(L('اكتب كلمتين على الأقل', 'Write a few words first'), 'warn');
          api.close();
          const id = existing ? existing.id : D.newId();
          await D.set(`notes/${id}`, V.clean(Object.assign({}, existing || {}, { b: bookId, wid, kind: 'take', text, page: w ? w.to : null, rect: null, by: S.me, at: existing ? existing.at : U.nowIso(), likes: existing ? existing.likes || {} : {}, replies: existing ? existing.replies || {} : {} })));
          if (!existing) U.xpPop(G.XP.take, L('خلاصة', 'Takeaway'));
        }),
    });
  };

  V.finishBook = async (bookId) => {
    if (!D.canWrite()) return;
    const book = S.books.get(bookId);
    await D.saveProg(bookId, () => ({ finished: U.nowIso(), last: book.pages }));
    U.confetti(1.6);
    U.chime('big');
    V.sheet({
      title: L('خلّصت الكتاب!', 'Book finished!'),
      cls: 'celebrate',
      html: `<div class="celeb">${V.cover(book, 'lg spin-in')}<h2 dir="auto">${esc(book.title)}</h2>
        <div class="xp-lines"><span class="gold-t">${L('خاتم الكتاب', 'Book finisher')} <b>+${L.num(G.XP.book)} XP</b></span></div>
        <p>${L('قيّم الكتاب واكتب رأيك — هيتحط في مكتبتك تحت «قرأناه سوا»', "Rate it and add a review — it goes on your shelf under 'Read together'")}</p>
        ${V.stars(0, true, 'fin-stars')}
        <textarea id="fin-review" rows="3" dir="auto" placeholder="${L('رأيك في سطرين (اختياري)', 'Your review (optional)')}"></textarea>
        <div class="row-btns center"><button class="btn gold" data-save autofocus>${L('احفظ في مكتبتي', 'Save to my shelf')}</button></div></div>`,
      onMount: (body, api) => {
        V.bindStars(body);
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-save]')) return;
          const rating = +body.querySelector('#fin-stars').dataset.v || 0;
          const review = body.querySelector('#fin-review').value.trim();
          api.close();
          await V.saveShelfItem(null, { title: book.title, author: book.author || '', status: 'read', rating, review, finished: U.today().slice(0, 7), pages: book.pages, together: bookId, tags: [] });
        });
      },
    });
  };

  V.bindStars = (root) => {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-star]');
      if (!b) return;
      const wrap = b.closest('.stars');
      const v = +b.dataset.star === +wrap.dataset.v ? 0 : +b.dataset.star;
      wrap.dataset.v = v;
      wrap.querySelectorAll('.st').forEach((s, i) => s.classList.toggle('on', i < v));
    });
  };

  V.toggleMark = async (bookId, page) => {
    if (!D.canWrite()) return;
    await D.mutate(`data/users/${S.me}/priv`, () => {
      const cur = S.priv || {};
      const marks = Object.assign({}, cur.marks || {});
      const bm = Object.assign({}, marks[bookId] || {});
      if (bm[page]) delete bm[page];
      else bm[page] = U.nowIso();
      marks[bookId] = bm;
      return Object.assign({}, cur, { marks });
    });
    U.toast(L('اتحفظت', 'Saved'));
  };

  /* ---------- global click handling for data-go / data-act shared actions ---------- */
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g && !e.defaultPrevented) {
      e.preventDefault();
      const to = g.dataset.go;
      const opts = {};
      if (g.dataset.uid) opts.uid = g.dataset.uid;
      if (g.dataset.tab) opts.tab = g.dataset.tab;
      if (g.dataset.ch) opts.ch = g.dataset.ch;
      V.go(to, opts);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a || a.closest('#reader')) return;
    const act = a.dataset.act;
    if (act === 'lang') {
      L.set(L.isAr() ? 'en' : 'ar');
      const app = document.getElementById('app');
      app.innerHTML = '';
      if (A.R.isOpen()) {
        const c = A.R.current();
        A.R.close(true);
        V.render(true);
        A.R.open(c.bookId, { page: c.page });
      } else V.render(true);
    } else if (act === 'read') {
      A.R.open(a.dataset.b, a.dataset.p ? { page: +a.dataset.p } : {});
    } else if (act === 'mark-wird') V.markWird(a.dataset.b, a.dataset.w);
    else if (act === 'unmark-wird') V.unmarkWird(a.dataset.b, a.dataset.w);
    else if (act === 'poke') V.poke(a.dataset.to, a.dataset.kind || 'poke', { b: a.dataset.b, wid: a.dataset.w });
    else if (act === 'dismiss-poke') V.dismissPoke(a.dataset.id);
    else if (act === 'open-note') V.openNote(a.dataset.nid);
    else if (act === 'like') V.like(a.dataset.nid);
    else if (act === 'member') V.go('me', { uid: a.dataset.uid });
    else if (V.actions && V.actions[act]) V.actions[act](a, e);
  });
  V.actions = {};

  window.addEventListener('hashchange', () => {
    if (V._silentHash) {
      V._silentHash = false;
      return;
    }
    if (A.R.isOpen()) A.R.close(true);
    V.fromHash();
    V.render(true);
  });
})();
