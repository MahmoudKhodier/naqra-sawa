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
  const ROUTES = ['home', 'books', 'shelf', 'circle', 'me', 'settings'];
  /* Extension points, so a feature can live in a file of its own:
     V.addRoute('quotes', 'me')            a screen (V.screens.quotes) whose tab in the bottom bar is «أنا»;
     V.addSection('me', {order, render})   a block on a screen: render(ctx) returns HTML ('' to skip);
     V.addMenu('shelf', (ctx) => item)     an entry in a ⋯ menu ({ic, t, fn} or null). */
  V.routes = ROUTES;
  V.navParent = {};
  V.addRoute = (name, parent) => {
    if (!ROUTES.includes(name)) ROUTES.push(name);
    if (parent) V.navParent[name] = parent;
  };
  const sections = {};
  V.addSection = (where, sec) => (sections[where] = sections[where] || []).push(Object.assign({ order: 50 }, sec));
  V.sections = (where, ctx) =>
    (sections[where] || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        try {
          return s.render(ctx) || '';
        } catch (e) {
          console.error(where, e);
          return '';
        }
      })
      .join('');
  const menus = {};
  V.addMenu = (where, fn) => (menus[where] = menus[where] || []).push(fn);
  V.menuItems = (where, ctx) => (menus[where] || []).map((fn) => fn(ctx)).filter(Boolean);
  /* Avatar marks people can pick (onboarding shows the first 16; Settings shows all). */
  V.EMOJI = [
    '📚', '🦉', '🌙', '🌿', '☕', '🐢', '🦊', '⭐',
    '🐱', '🐶', '🐼', '🦁', '🐰', '🐧', '🦋', '🌸',
    '🐨', '🐯', '🐻', '🐝', '🐬', '🐳', '🦄', '🐪',
    '☀️', '🌻', '🌵', '🍀', '🌊', '🔥', '🌈', '🏔️',
    '📖', '✏️', '🍵', '🎨', '🎧', '🚀', '💡', '🧩',
  ];
  /* Where back goes: the screens you came through (not just «اليوم»). */
  V.trail = [];
  V.go = (route, opts = {}, back) => {
    const prev = V.state;
    if (!back && prev && prev.route && (prev.route !== route || JSON.stringify(prev.opts || {}) !== JSON.stringify(opts))) {
      V.trail.push(prev);
      if (V.trail.length > 30) V.trail.shift();
    }
    V.state = { route, opts };
    setHash('#' + route);
    V.render(true);
    const sc = document.getElementById('screen');
    if (sc) {
      sc.scrollTop = 0;
      // the new screen eases in (a little from below; going back, a little from above)
      sc.classList.remove('enter', 'enter-back');
      void sc.offsetWidth;
      sc.classList.add(back ? 'enter-back' : 'enter');
    }
    window.scrollTo(0, 0);
  };
  /* One step back: the top sheet, then inside the book, the book, then the screen before. false = nothing left. */
  V.back = () => {
    if (V.sheets.length) return V.sheets[V.sheets.length - 1].close(), true;
    if (A.R.isOpen()) return A.R.back() || A.R.close(), true;
    const prev = V.trail.pop();
    if (prev) return V.go(prev.route, prev.opts, true), true;
    if (V.state.route !== 'home') return V.go('home', {}, true), true;
    return false;
  };
  /* In the browser (not the app), the phone's back gesture moves through history: give each sheet and the open
     book a history step of its own, so back closes them instead of leaving the screen. */
  const native = () => !!(A.P && A.P.native);
  let popsToIgnore = 0;
  let hashAfterPop = null;
  // A sheet that just closed is still stepping back in history; a new hash set now would be undone by that
  // step, so it waits until the step is done.
  function setHash(h) {
    if (popsToIgnore) return void (hashAfterPop = h);
    if (location.hash !== h) {
      V._silentHash = true;
      location.hash = h;
    }
  }
  V.histPush = (kind) => {
    if (native()) return null;
    const id = kind + ':' + Date.now() + Math.random().toString(36).slice(2, 6);
    try {
      history.pushState({ qs: id }, '');
    } catch (e) {
      return null;
    }
    return id;
  };
  V.histDrop = (id) => {
    if (id && history.state && history.state.qs === id) {
      popsToIgnore++;
      history.back();
    }
  };
  window.addEventListener('popstate', () => {
    if (popsToIgnore) {
      popsToIgnore--;
      if (!popsToIgnore && hashAfterPop) {
        const h = hashAfterPop;
        hashAfterPop = null;
        setHash(h);
      }
      return;
    }
    const top = V.sheets[V.sheets.length - 1];
    if (top && top.hist) {
      top.hist = null; // this step is already gone
      return top.close();
    }
    if (A.R.isOpen() && A.R.hist) {
      if (A.R.back()) return void (A.R.hist = V.histPush('reader'));
      A.R.hist = null;
      A.R.close();
    }
  });
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

  V.nav = () => nav();
  function nav() {
    const el = document.getElementById('nav');
    const r = V.state.route.startsWith('book-') ? 'books' : V.navParent[V.state.route] || V.state.route;
    const pokes = V.newPokes();
    const unreadCircle = V.unread('_c', 'gen');
    const item = (id, ic, label, badge = 0) =>
      `<a href="#${id}" class="nv${r === id ? ' on' : ''}" data-go="${id}" ${r === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge ? `<i class="nv-b">${L.num(Math.min(badge, 99))}</i>` : ''}</a>`;
    el.innerHTML = `<div class="brand">${V.star('', 'gold sm')}<b>${L('نقرأ سوا', 'Read Together')}</b></div>
      ${item('home', 'home', L('اليوم', 'Today'), pokes)}
      ${item('books', 'books', L('كتبنا', 'Books'))}
      ${item('shelf', 'shelf', L('مكتبتي', 'My shelf'))}
      ${item('circle', 'users', L('الحلقة', 'Circle'), unreadCircle)}
      ${item('me', 'user', L('أنا', 'Me'))}
      ${item('settings', 'gear', L('إعدادات', 'Settings'), A.Upd && A.Upd.nag() ? 1 : 0)}`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h >= 4 && h < 12) return L('صباح الخير', 'Good morning');
    if (h >= 12 && h < 17) return L('يومك سعيد', 'Good afternoon');
    return L('مساء الخير', 'Good evening');
  }
  V.greeting = greeting;

  /* Top bar. On «اليوم» it is the greeting header with streak / level / freeze chips; elsewhere a compact bar. */
  function hud() {
    const el = document.getElementById('hud');
    if (!el) return;
    const s = G.of(S.me);
    const home = V.state.route === 'home';
    const sv = G.streakView(S.me); // daily or weekly, as chosen in Settings
    const flame = sv.n ? (sv.risk ? 'risk' : 'hot') : 'cold';
    const pct = s.span ? s.cur / s.span : 0;
    const unread = V.inboxUnread ? V.inboxUnread() : 0;
    const flameTitle = sv.hint;
    const me = `<button class="hud-me" data-go="me" aria-label="${L('ملفي', 'My profile')}">${D.avatar(S.me, 'md')}${V.star(L.num(s.lv), 'gold lvl')}</button>`;
    const btns = `${V.inboxUnread ? `<button class="ib round hud-bell" data-act="inbox" aria-label="${L('الجديد ليك', 'For you', 'الجديد لك')}">${icon('bell')}${unread ? `<i class="nv-b">${L.num(Math.min(unread, 99))}</i>` : ''}</button>` : ''}`;
    const flameChip = `<span class="hchip flame ${flame}${sv.weekly ? ' weekly' : ''}" title="${esc(flameTitle)}">${icon('flame')}<b>${L.num(sv.n)}</b>${home ? `<span>${sv.unit}</span>` : ''}</span>`;
    let html;
    if (home) {
      const date = `${esc(L.day(U.today()))}${V.showHijri && V.showHijri() && L.hijriShort ? ` • ${esc(L.hijriShort())}` : ''}`;
      html = `<div class="hud-row">${me}<div class="hud-hi"><h1 class="hud-greet">${greeting()}${L('، ', ', ')}<span dir="auto">${esc(D.name(S.me))}</span></h1><small class="hijri">${date}</small></div>${btns}</div>
        <div class="hud-chips">${flameChip}
          <span class="hchip lvl" title="${L(`فاضل ${L.num(s.toNext)} XP للمستوى الجاي`, `${s.toNext} XP to next level`, `بقي ${L.num(s.toNext)} XP للمستوى التالي`)}">${V.star('', 'gold xs')}<b>${L(`المستوى ${L.num(s.lv)}`, `Level ${s.lv}`)}</b>${V.bar(pct, 'gold')}</span>
          ${s.freezes ? `<span class="hchip fz" title="${L('حماية للسلسلة: لو فوّت يوم بتحميها', 'Streak freeze: protects a missed day', 'حماية للسلسلة: تحميها إن فاتك يوم')}">${icon('snow')}<b>×${L.num(s.freezes)}</b></span>` : ''}
        </div>`;
    } else {
      html = `<div class="hud-row">${me}<div class="hud-xp" title="${L(`فاضل ${L.num(s.toNext)} XP للمستوى الجاي`, `${s.toNext} XP to next level`, `بقي ${L.num(s.toNext)} XP للمستوى التالي`)}"><span class="hud-t">${esc(G.title(s.lv))}</span>${V.bar(pct, 'gold')}<small>${L.num(s.cur)} / ${L.num(s.span)} XP</small></div>${flameChip}${btns}</div>`;
    }
    el.classList.toggle('is-home', home);
    if (el.dataset.rtH !== html) {
      el.innerHTML = html;
      el.dataset.rtH = html;
    }
    if (S.readOnly && !document.getElementById('ro-banner')) {
      const b = document.createElement('div');
      b.id = 'ro-banner';
      b.className = 'ro-banner';
      b.innerHTML = `${icon('eye')}<span>${L('التغييرات مش بتتحفظ دلوقتي. اتأكد من النت، ولو اتشلت من الحلقة اطلب لينك دعوة جديد.', 'Changes are not saving right now. Check your connection; if you were removed from the circle, ask for a new invite link.', 'حفظ التغييرات متوقف الآن. تأكد من اتصالك بالإنترنت، وإن لم تعد عضوًا في الحلقة فاطلب رابط دعوة جديدًا.')}</span>`;
      el.after(b);
    }
  }

  /* ---------- sheets (dialogs), menus, confirm ---------- */
  /* Text boxes with a limit: a counter shows up near it, and pasting more than fits says so instead of cutting silently. */
  function lenNote(ta) {
    const max = +ta.getAttribute('maxlength') || 0;
    if (!max || max >= 100000) return;
    let c = ta.nextElementSibling && ta.nextElementSibling.classList.contains('tcount') ? ta.nextElementSibling : null;
    const n = ta.value.length;
    if (n < max * 0.85) {
      if (c) c.remove();
      return;
    }
    if (!c) {
      c = document.createElement('small');
      c.className = 'tcount';
      c.setAttribute('aria-live', 'polite');
      ta.after(c);
    }
    c.classList.toggle('full', n >= max);
    c.textContent = n >= max ? L(`وصلت للحد (${L.num(max)} حرف)`, `Limit reached (${max} characters)`, `بلغت الحد الأقصى (${L.num(max)} حرف)`) : L(`فاضل ${L.num(max - n)} حرف`, `${max - n} characters left`, `الأحرف المتبقية: ${L.num(max - n)}`);
  }
  document.addEventListener('input', (e) => e.target.matches && e.target.matches('textarea[maxlength]') && lenNote(e.target));
  document.addEventListener('paste', (e) => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('textarea[maxlength]')) return;
    const max = +ta.getAttribute('maxlength') || 0;
    const add = ((e.clipboardData && e.clipboardData.getData('text')) || '').length;
    const room = max - ta.value.length + ((ta.selectionEnd || 0) - (ta.selectionStart || 0));
    if (max && add > room) {
      U.toast(L(`النص اللي لزقته أطول من المسموح هنا (${L.num(max)} حرف) — اتقص آخره. قسّمه على جزئين.`, `What you pasted is longer than fits here (${max} characters) — the end was cut. Split it in two.`, `النص الذي لصقته أطول من المسموح هنا (${L.num(max)} حرف) — لم يدخل آخره. قسّمه إلى جزأين.`), 'warn');
      setTimeout(() => lenNote(ta), 0);
    }
  });

  V.sheet = ({ title = '', html = '', cls = '', onMount, onData, wide = false }) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-bg" data-close></div><section class="sheet ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}">
      <header class="sh-head"><b>${title}</b><button class="ib" data-close aria-label="${L('قفل', 'Close', 'إغلاق')}">${icon('close')}</button></header>
      <div class="sh-body">${html}</div></section>`;
    document.getElementById('layers').appendChild(wrap);
    const prevFocus = document.activeElement;
    const api = { el: wrap.querySelector('.sheet'), body: wrap.querySelector('.sh-body'), onData, closed: false };
    api.hist = V.histPush('sheet');
    api.close = () => {
      if (api.closed) return;
      api.closed = true;
      V.histDrop(api.hist);
      wrap.classList.remove('in');
      V.sheets = V.sheets.filter((x) => x !== api);
      setTimeout(() => wrap.remove(), 220);
      api.onClose && api.onClose();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
    };
    const openedAt = Date.now();
    wrap.addEventListener('click', (e) => {
      // A tap that opened this sheet can send a late "ghost" click onto the backdrop: ignore it.
      if (e.target.classList.contains('sheet-bg') && Date.now() - openedAt < 450) return;
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
      title: L('اختيارات', 'Options', 'خيارات'),
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

  V.confirm = (text, ok = L('تمام', 'OK', 'حسنًا'), danger = false) =>
    new Promise((res) => {
      let done = false;
      const api = V.sheet({
        title: L('متأكد؟', 'Are you sure?', 'هل أنت متأكد؟'),
        html: `<p class="lead">${text}</p><div class="row-btns end"><button class="btn ghost" data-no>${L('لأ', 'No', 'لا')}</button><button class="btn ${danger ? 'rubric' : ''}" data-yes autofocus>${ok}</button></div>`,
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

  /* Cheers and nudges to me from the last week. Gone once dismissed (on any of my devices), a nudge once its
     portion is done, and nothing from someone who left the circle. */
  V.myPokes = () => {
    const dis = new Set([...U.store.get('dismissed:' + S.me, []), ...((S.priv && S.priv.pokeX) || [])]);
    const week = U.addDays(U.today(), -7);
    const doneNow = (p) => {
      const pr = p.kind === 'poke' && p.b && p.wid && D.prog(p.b);
      return !!(pr && pr.done && pr.done[p.wid]);
    };
    return [...S.pokes.values()]
      .filter((p) => p.to === S.me && p.from !== S.me && S.members.has(p.from) && U.isoKey(p.at) >= week && !dis.has(p.id) && !doneNow(p))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  };
  /* The number on the «اليوم» tab: only the ones I haven't seen yet, on «اليوم» or in the bell. */
  const pokesSeenAt = () => {
    const a = U.store.get('pokesSeen:' + S.me, '');
    const b = (S.priv && S.priv.pokesSeen) || '';
    return a > b ? a : b;
  };
  V.newPokes = () => {
    const seen = pokesSeenAt();
    return V.myPokes().filter((p) => String(p.at) > seen).length;
  };
  V.seePokes = () => {
    const last = V.myPokes()[0];
    if (!last || String(last.at) <= pokesSeenAt()) return false;
    U.store.set('pokesSeen:' + S.me, last.at);
    if (D.canWrite()) D.privUpdate((cur) => Object.assign(cur, { pokesSeen: last.at })).catch(() => {});
    return true;
  };
  V.dismissPoke = (id) => {
    const dis = U.store.get('dismissed:' + S.me, []);
    dis.push(id);
    U.store.set('dismissed:' + S.me, dis.slice(-300));
    if (D.canWrite()) D.privUpdate((cur) => Object.assign(cur, { pokeX: [...(cur.pokeX || []), id].slice(-200) })).catch(() => {});
    V.render();
  };
  V.poke = async (to, kind, ctx = {}) => {
    if (!D.canWrite()) return;
    const today = U.today();
    const dup = [...S.pokes.values()].some((p) => p.from === S.me && p.to === to && p.kind === kind && U.isoKey(p.at) === today && (p.b || '') === (ctx.b || ''));
    if (dup) {
      U.toast(L('اتبعت النهارده خلاص 🙂', 'Already sent today 🙂', 'أرسلته اليوم بالفعل 🙂'));
      return;
    }
    const id = D.newId();
    await D.set(`pokes/${id}`, { to, from: S.me, kind, at: U.nowIso(), b: ctx.b || '', wid: ctx.wid || '' });
    U.chime('soft');
    U.toast(kind === 'cheer' ? L(`التشجيع وصل لـ${esc(D.name(to))} 👏`, `You cheered ${esc(D.name(to))} 👏`, `وصل التشجيع إلى ${esc(D.name(to))} 👏`) : L(`التذكير وصل لـ${esc(D.name(to))} 👋`, `You nudged ${esc(D.name(to))} 👋`, `وصل التذكير إلى ${esc(D.name(to))} 👋`));
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
    const newB = now.badges.filter((id) => !prev.badges.includes(id) && G.BADGES.some((x) => x.id === id));
    if (newB.length > 3) {
      setTimeout(() => {
        U.chime('ok');
        U.toast(`${icon('trophy')}<span><b>${L(`${L.num(newB.length)} أوسمة جديدة!`, `${newB.length} new badges!`, `أوسمة جديدة: ${L.num(newB.length)}!`)}</b> ${L('شوفهم في صفحة «أنا»', 'See them on your profile', 'شاهدها في صفحة «أنا»')}</span>`, 'badge');
      }, 900);
      return;
    }
    newB.forEach((id, i) => {
      const b = G.BADGES.find((x) => x.id === id);
      setTimeout(() => {
        U.chime('ok');
        U.toast(`${V.badgeIcon(b, true, 'xs')}<span><b>${L('وسام جديد!', 'New badge!')}</b> ${esc(L(...b.t))}</span>`, 'badge');
      }, 900 + i * 1200);
    });
    if (now.qdone && !(prev.qday === now.qday && prev.qdone)) {
      setTimeout(() => {
        U.chime('big');
        U.toast(`${icon('chest')}<span><b>${L('خلّصت مهام النهارده!', 'Daily quests complete!', 'أنهيت مهام اليوم!')}</b> ${L('افتح الصندوق في صفحة اليوم', 'Open your chest on Today')}</span>`, 'gold');
      }, 600);
    }
  };

  V.levelUp = (lv) => {
    U.confetti(1.2);
    U.chime('big');
    V.sheet({
      title: L('مستوى جديد!', 'Level up!'),
      cls: 'celebrate',
      html: `<div class="celeb">${V.star(L.num(lv), 'gold huge spin-in')}<h2>${esc(G.title(lv))}</h2><p>${L(`وصلت للمستوى ${L.num(lv)}. كمّل كده!`, `You reached level ${lv}. Keep going!`, `وصلت إلى المستوى ${L.num(lv)}. واصل!`)}</p><button class="btn gold" data-close autofocus>${L('يلا بينا', "Let's go", 'هيا بنا')}</button></div>`,
    });
  };

  /* Edit one text (a message, a reply…): saves before closing; a failed save keeps the sheet open. */
  V.editText = ({ title, value = '', max = 5000, rows = 5, onSave }) => {
    V.sheet({
      title,
      html: `<form class="form" data-edit-text><textarea id="et-text" rows="${rows}" dir="auto" maxlength="${max}" autofocus>${esc(value)}</textarea>
        <p class="err-t" hidden></p>
        <div class="row-btns end"><button type="button" class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button><button class="btn gold">${icon('check')}${L('احفظ', 'Save')}</button></div></form>`,
      onMount: (body, api) => {
        const f = body.querySelector('form');
        const ta = f.querySelector('textarea');
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }, 80);
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const text = ta.value.trim();
          if (!text) return ta.focus();
          if (text === String(value).trim()) return api.close();
          const btn = f.querySelector('button.gold');
          btn.disabled = true;
          try {
            await onSave(text);
            api.close();
            U.toast(L('اتعدّلت ✓', 'Updated ✓', 'تم التعديل ✓'));
          } catch (x) {
            btn.disabled = false;
            const er = f.querySelector('.err-t');
            er.textContent = L('ماتحفظش. اتأكد من النت وجرّب تاني.', 'Not saved. Check your connection and try again.', 'تعذّر الحفظ. تأكد من اتصالك وحاول مجددًا.');
            er.hidden = false;
          }
        });
      },
    });
  };
  V.editedTag = (x) => (x && x.edited ? `<small class="edited" title="${esc(L.ago(x.edited))}">${L('معدّلة', 'edited')}</small>` : '');

  /* Medal colour = level: 1 bronze, 2 silver, 3 gold, 4 diamond. */
  V.badgeIcon = (b, got, size = '') => `<span class="badge8 tier${b.tier || 1} ${got ? 'got' : ''} ${size}">${icon(b.ic)}</span>`;
  const TIER = [null, ['برونزي', 'Bronze'], ['فضي', 'Silver'], ['ذهبي', 'Gold'], ['ماسي', 'Diamond']];
  V.tierName = (n) => (TIER[n] ? L(TIER[n][0], TIER[n][1]) : '');

  /* A badge group on a profile: the highest level earned (or the first one, greyed), level dots, and
     progress to the next level. Tapping opens the details. */
  V.badgeCard = (grp, uid) => {
    const show = grp.top || grp.tiers[0];
    const nx = grp.next;
    return `<button class="bdg${grp.top ? ' got' : ''}" data-act="badge" data-g="${esc(grp.g)}" data-uid="${esc(uid)}">
      ${V.badgeIcon(show.b, !!grp.top)}
      <b>${esc(L(...show.b.t))}</b>
      <span class="bdg-dots" aria-label="${L(`${L.num(grp.tiers.filter((x) => x.got).length)} من ${L.num(grp.tiers.length)}`, `${grp.tiers.filter((x) => x.got).length} of ${grp.tiers.length}`)}">${grp.tiers.map((x) => `<i class="tier${x.b.tier}${x.got ? ' on' : ''}"></i>`).join('')}</span>
      ${nx ? `<small>${L.num(nx.v)} / ${L.num(nx.b.n)}</small>${V.bar(nx.v / nx.b.n, 'gold')}` : `<small class="gold-t">${L('خلّصت كل المستويات ✓', 'All levels done ✓', 'أنهيت كل المستويات ✓')}</small>`}
    </button>`;
  };

  /* ---------- shared actions ---------- */
  /* One mark at a time per book, and a moment after it: a quick second tap on «خلّصته» lands on the next
     portion's button once the card redraws, and must not mark that one too. */
  const marking = new Map();
  V.markWird = async (bookId, wid) => {
    if (!D.canWrite()) return;
    if (Date.now() - (marking.get(bookId) || 0) < 1500) return;
    const book = S.books.get(bookId);
    const w = G.wirds(book).find((x) => x.id === wid);
    if (!w) return;
    const mine = D.prog(bookId);
    if (mine && mine.done && mine.done[wid]) return;
    marking.set(bookId, Date.now());
    const someoneFirst = G.firstFinisher(bookId, wid);
    const t = U.nowIso();
    try {
      await D.saveProg(bookId, (c) => ({ done: Object.assign({}, c.done, { [wid]: t }) }));
    } finally {
      marking.set(bookId, Date.now());
    }
    const onTime = U.today() <= w.due;
    const xp = G.XP.wird + (onTime ? G.XP.onTime : 0) + (someoneFirst ? 0 : G.XP.first);
    U.confetti(someoneFirst ? 0.8 : 1.3);
    U.chime('big');
    const others = D.bookProgs(bookId).filter((p) => p.u !== S.me).length;
    V.sheet({
      title: L(`الورد ${L.num(w.n)} ✓`, `Portion ${w.n} ✓`),
      cls: 'celebrate',
      html: `<div class="celeb">${V.star(L.num(w.n), 'jade huge spin-in')}
        <h2>${L('عاش! خلّصت الورد', 'Well done — portion complete!', 'أحسنت! أنهيت الورد')}</h2>
        <div class="xp-lines">
          <span>${L('الورد', 'Portion')} <b>+${L.num(G.XP.wird)} XP</b></span>
          ${onTime ? `<span>${L('في الميعاد', 'On time', 'في الموعد')} <b>+${L.num(G.XP.onTime)} XP</b></span>` : ''}
          ${!someoneFirst ? `<span class="gold-t">${L('أول واحد يخلّص!', 'First to finish!', 'أول من أنهاه!')} <b>+${L.num(G.XP.first)} XP</b></span>` : ''}
        </div>
        <p>${L('اكتب خلاصتك في سطرين عشان صحابك يستفيدوا', 'Share your takeaway in a couple of lines so friends can learn from it', 'اكتب خلاصتك في سطرين ليستفيد منها أصدقاؤك')} (+${L.num(G.XP.take)} XP)</p>
        <div class="row-btns center"><button class="btn gold" data-take autofocus>${icon('sparkle')}${L('اكتب خلاصتي', 'Write my takeaway')}</button><button class="btn ghost" data-close>${L('بعدين', 'Later', 'لاحقًا')}</button></div>
        ${others ? `<small class="muted">${L('شوف مين لسه، وشجّعهم من صفحة الكتاب', 'See who is still reading and cheer them on from the book page', 'شاهد من ما زالوا يقرؤون، وشجّعهم من صفحة الكتاب')}</small>` : ''}
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

  /* Mark several portions done at once (catching up), with one celebration. */
  V.markWirds = async (bookId, wids) => {
    if (!D.canWrite() || !wids.length) return;
    if (wids.length === 1) return V.markWird(bookId, wids[0]);
    const book = S.books.get(bookId);
    const ws = G.wirds(book).filter((w) => wids.includes(w.id));
    const t = U.nowIso();
    await D.saveProg(bookId, (c) => {
      const done = Object.assign({}, c.done);
      for (const w of ws) done[w.id] = t;
      return { done };
    });
    U.confetti(1.3);
    U.chime('big');
    V.sheet({
      title: L('لحقت! ✓', 'Caught up! ✓', 'تداركت ما فاتك! ✓'),
      cls: 'celebrate',
      html: `<div class="celeb">${V.star(L.num(ws.length), 'jade huge spin-in')}
        <h2>${L(`خلّصت ${L.count(ws.length, 'wird')}`, `${ws.length} portions marked done`, `أنهيت ${L.count(ws.length, 'wird')}`)}</h2>
        <div class="xp-lines"><span>${L('الأوراد', 'Portions')} <b>+${L.num(G.XP.wird * ws.length)} XP</b></span></div>
        <button class="btn gold" data-close autofocus>${L('يلا نكمّل', 'Keep going', 'هيا نواصل')}</button></div>`,
    });
  };

  V.unmarkWird = async (bookId, wid) => {
    if (!(await V.confirm(L('هتشيل علامة «خلّصته» من الورد ده.', 'This removes the done mark from this portion.', 'ستزيل علامة «أنهيته» من هذا الورد.'), L('شيل العلامة', 'Remove mark', 'أزل العلامة'), true))) return;
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
      title: L(`خلاصتي في الورد ${L.num(w ? w.n : '')}`, `My takeaway • Portion ${w ? w.n : ''}`),
      html: `<p class="muted">${L('إيه أكتر فكرة عجبتك أو فرقت معاك في الورد ده؟', 'What idea stood out or stayed with you in this portion?', 'ما أكثر فكرة أعجبتك أو أثّرت فيك في هذا الورد؟')}</p>
        <textarea id="take-text" rows="5" dir="auto" maxlength="${U.MAX.take}" autofocus placeholder="${L('اكتب هنا…', 'Write here…')}">${esc(existing ? existing.text : U.store.get(`draft:take:${bookId}:${wid}`, ''))}</textarea>
        <div class="row-btns end"><button class="btn gold" data-save>${icon('sparkle')}${L('انشر الخلاصة', 'Share takeaway')}</button></div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-save]')) return;
          const text = body.querySelector('#take-text').value.trim();
          if (text.length < 3) return U.toast(L('اكتب كلمتين على الأقل', 'Write a few words first'), 'warn');
          const draftKey = `draft:take:${bookId}:${wid}`;
          U.store.set(draftKey, text);
          api.close();
          const id = existing ? existing.id : D.newId();
          await D.set(`notes/${id}`, V.clean(Object.assign({}, existing || {}, { b: bookId, wid, kind: 'take', text, page: w ? w.to : null, rect: null, by: S.me, at: existing ? existing.at : U.nowIso(), likes: existing ? existing.likes || {} : {}, replies: existing ? existing.replies || {} : {} })));
          U.store.del(draftKey);
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
      title: L('خلّصت الكتاب!', 'Book finished!', 'أنهيت الكتاب!'),
      cls: 'celebrate',
      html: `<div class="celeb">${V.cover(book, 'lg spin-in')}<h2 dir="auto">${esc(book.title)}</h2>
        <div class="xp-lines"><span class="gold-t">${L('خاتم الكتاب', 'Book finisher')} <b>+${L.num(G.XP.book)} XP</b></span></div>
        <p>${L('قيّم الكتاب واكتب رأيك — هيتحط في مكتبتك تحت «قرأناه سوا»', "Rate it and add a review — it goes on your shelf under 'Read together'", 'قيّم الكتاب واكتب رأيك — سنضعه في مكتبتك تحت «قرأناه معًا»')}</p>
        ${V.stars(0, true, 'fin-stars')}
        <textarea id="fin-review" rows="3" dir="auto" maxlength="${U.MAX.review}" placeholder="${L('رأيك في سطرين (اختياري)', 'Your review (optional)')}"></textarea>
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

  V.toggleMark = async (bookId, page, quiet) => {
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
    if (!quiet) U.toast(L('اتحفظت', 'Saved', 'تم الحفظ'));
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
      if (a.dataset.l) L.set(a.dataset.l);
      else L.toggle();
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
  V.actions.badge = (a) => V.badgeSheet(a.dataset.g, a.dataset.uid || S.me);
  V.badgeSheet = (g, uid0) => {
    const uid = uid0 || S.me;
    const s = G.of(uid);
    const grp = G.badgeGroups(s).find((x) => x.g === g);
    if (!grp) return;
    const mine = uid === S.me;
    const others = D.memberIds().filter((u) => u !== uid);
    const holders = (b) => others.filter((u) => (G.of(u).badges || []).some((x) => x.got && x.b.id === b.id));
    const show = grp.top || grp.tiers[0];
    V.sheet({
      title: L('وسام', 'Badge'),
      html: `<div class="bd-sheet">
        <div class="bd-hero">${V.badgeIcon(show.b, !!grp.top, 'lg')}<h2>${esc(L(...show.b.t))}</h2>
          <p class="muted">${grp.top ? L(`أعلى مستوى اتفتح: ${V.tierName(grp.top.b.tier)}`, `Highest level earned: ${V.tierName(grp.top.b.tier)}`, `أعلى مستوى مفتوح: ${V.tierName(grp.top.b.tier)}`) : mine ? L('لسه ما اتفتحش — شوف إزاي تاخده تحت', 'Not earned yet — see how below', 'مغلق حتى الآن — اعرف كيف تفتحه في الأسفل') : L('لسه ما اتفتحش', 'Not earned yet', 'مغلق حتى الآن')}</p></div>
        <p class="bd-tip">${icon('info')}<span>${esc(L(...grp.tip))}</span></p>
        <ol class="bd-tiers">${grp.tiers
          .map((x) => {
            const h = holders(x.b);
            return `<li class="${x.got ? 'got' : ''}">${V.badgeIcon(x.b, x.got, 'sm')}
              <div><b>${esc(L(...x.b.t))} <small class="muted">• ${V.tierName(x.b.tier)}</small></b><small>${esc(L(...x.b.d))}</small>
                ${x.got ? `<small class="jade-t">${icon('check')}${L('اتفتح', 'Earned', 'مفتوح')}</small>` : `<div class="bd-prog">${V.bar(x.v / x.b.n, 'gold')}<small>${L.num(x.v)} / ${L.num(x.b.n)}</small></div>`}
                ${h.length ? `<span class="bd-who">${h.slice(0, 6).map((u) => D.avatar(u, 'xs')).join('')}<small>${h.length === 1 ? esc(D.name(h[0])) : L(`${L.num(h.length)} من الحلقة`, `${h.length} in the circle`)}</small></span>` : ''}
              </div></li>`;
          })
          .join('')}</ol>
      </div>`,
    });
  };

  /* Pull down at the top of «اليوم» or «الحلقة» to fetch what's new (and send anything still waiting). */
  (function pullToRefresh() {
    let y0 = null, dy = 0, el = null, busy = false;
    const canPull = () => !busy && window.scrollY <= 0 && !V.sheets.length && !A.R.isOpen() && ['home', 'circle'].includes(V.state.route) && S.phase !== 'loading';
    const mark = () => {
      if (!el) {
        el = document.createElement('div');
        el.className = 'ptr';
        el.innerHTML = '<span class="star8 gold"></span>';
        document.body.appendChild(el);
      }
      return el;
    };
    document.addEventListener('touchstart', (e) => {
      y0 = e.touches.length === 1 && canPull() ? e.touches[0].clientY : null;
      dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) return void (el && el.style.setProperty('--pull', '0px'));
      const m = mark();
      m.classList.add('on');
      m.classList.toggle('ready', dy > 90);
      m.style.setProperty('--pull', Math.min(dy * 0.5, 72) + 'px');
    }, { passive: true });
    document.addEventListener('touchend', async () => {
      if (y0 == null || !el) return void (y0 = null);
      y0 = null;
      if (dy <= 90) {
        el.classList.remove('on', 'ready');
        el.style.setProperty('--pull', '0px');
        return;
      }
      busy = true;
      el.classList.add('spin');
      el.style.setProperty('--pull', '56px');
      U.buzz('soft');
      try {
        await Promise.all([A.P && A.P.resync ? A.P.resync() : null, D.flushOutbox ? D.flushOutbox() : null, new Promise((r) => setTimeout(r, 600))]);
      } finally {
        busy = false;
        V.render();
        el.classList.remove('on', 'ready', 'spin');
        el.style.setProperty('--pull', '0px');
      }
    }, { passive: true });
  })();

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
