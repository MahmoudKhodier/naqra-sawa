/* Shared state: capabilities, live subscriptions, writes, people. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;

  const S = (A.S = {
    phase: 'loading', // loading | nodb | ready
    db: null,
    user: null,
    assets: null,
    room: null,
    downloads: null,
    sample: null,
    me: null, // my id
    meInfo: null,
    canWrite: null, // true/false/null(unknown)
    canEdit: false,
    isOwner: false,
    readOnly: false,
    loaded: {}, // which collections delivered their first snapshot
    circle: null,
    members: new Map(),
    books: new Map(),
    prog: new Map(),
    notes: new Map(),
    msgs: [],
    shelf: new Map(),
    proposals: new Map(),
    pokes: new Map(),
    priv: null,
    peers: [],
    profiles: {},
    ver: 0,
  });

  const D = (A.D = {});
  const subs = new Set();
  let raf = 0;
  D.onChange = (fn) => subs.add(fn);
  D.bump = () => {
    S.ver++;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const fn of subs) {
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
      }
    });
  };

  /* ---------- boot ---------- */
  D.init = async () => {
    const C = window.claude;
    const use = (n) => (C && C.use ? C.use(n).catch(() => null) : Promise.resolve(null));
    const [db, user, assets, room, downloads, sample] = await Promise.all(
      ['db', 'user', 'assets', 'room', 'downloads', 'sample'].map(use)
    );
    Object.assign(S, { db, user, assets, room, downloads, sample });
    if (user) {
      try {
        S.meInfo = await user.me();
        S.me = S.meInfo.id;
        S.isOwner = !!S.meInfo.isOwner;
        S.canEdit = !!S.meInfo.canEdit;
        S.canWrite = await user.can('data.write');
      } catch (e) {}
    }
    if (!db || !S.me) {
      S.phase = 'nodb';
      D.bump();
      return;
    }
    if (S.canWrite === false) S.readOnly = true;
    subscribeAll();
    if (room) initRoom(room);
    S.phase = 'ready';
    D.bump();
  };

  function listen(query, key, onSnap) {
    try {
      query.onSnapshot(
        (snap) => {
          onSnap(snap);
          S.loaded[key] = true;
          D.bump();
          D.resolvePeople();
        },
        (err) => {
          console.warn('snapshot', key, err);
          S.loaded[key] = true;
          D.bump();
        }
      );
    } catch (e) {
      console.warn('listen', key, e);
      S.loaded[key] = true;
    }
  }
  const toMap = (snap) => {
    const m = new Map();
    for (const d of snap.docs) m.set(d.id, Object.assign({ id: d.id }, d.data()));
    return m;
  };

  function subscribeAll() {
    const db = S.db;
    listen(db.doc('meta/circle'), 'circle', (s) => (S.circle = s.exists ? s.data() : null));
    listen(db.collection('members'), 'members', (s) => (S.members = toMap(s)));
    listen(db.collection('books'), 'books', (s) => (S.books = toMap(s)));
    listen(db.collection('prog'), 'prog', (s) => (S.prog = toMap(s)));
    listen(db.collection('notes'), 'notes', (s) => (S.notes = toMap(s)));
    listen(db.collection('msgs').orderBy('at', 'desc').limit(500), 'msgs', (s) => {
      S.msgs = s.docs.map((d) => Object.assign({ id: d.id }, d.data())).reverse();
    });
    listen(db.collection('shelf'), 'shelf', (s) => (S.shelf = toMap(s)));
    listen(db.collection('proposals'), 'proposals', (s) => (S.proposals = toMap(s)));
    listen(db.collection('pokes').orderBy('at', 'desc').limit(200), 'pokes', (s) => (S.pokes = toMap(s)));
    listen(db.doc(`data/users/${S.me}/priv`), 'priv', (s) => (S.priv = s.exists ? s.data() : null));
  }

  /* ---------- writes (one at a time per document) ---------- */
  const chains = new Map();
  let warnedRO = false;
  function queue(path, fn) {
    const prev = chains.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    chains.set(path, next);
    next.finally(() => {
      if (chains.get(path) === next) chains.delete(path);
    });
    return next.catch((e) => {
      handleWriteError(e);
      throw e;
    });
  }
  function handleWriteError(e) {
    const code = e && e.code;
    console.warn('write failed', e);
    if (code === 'invalid_argument' && (S.canWrite === false || S.canWrite == null)) {
      S.readOnly = true;
      D.bump();
      if (!warnedRO) {
        warnedRO = true;
        U.toast(L('مقدرتش أحفظ. يمكن اتشلت من الحلقة — جرّب تفتح التطبيق تاني.', "Couldn't save. You may have been removed from the circle — try reopening the app.", 'تعذّر الحفظ. ربما أُزلتَ من الحلقة — جرّب فتح التطبيق من جديد.'), 'warn');
      }
    } else if (code === 'invalid_argument') {
      U.toast(L('مقدرتش أحفظ — يمكن التعديل ده مش مسموح لك.', "Couldn't save — you may not be allowed to make this change.", 'تعذّر الحفظ — ربما لا يُسمح لك بهذا التعديل.'), 'warn');
    } else if (code === 'too_large') {
      U.toast(L('الكلام ده أطول من اللي ينفع يتحفظ في مكان واحد. قسّمه على جزئين — اللي كتبته محفوظ كمسودة.', "That's too long to save in one place. Split it in two — what you wrote is kept as a draft.", 'هذا النص أطول مما يمكن حفظه في مكان واحد. قسّمه إلى جزأين — ما كتبته محفوظ كمسودة.'), 'warn');
    } else if (code === 'quota_exceeded') {
      U.toast(L('المساحة المتاحة للحلقة خلصت. امسحوا حاجات قديمة وجرّبوا تاني', 'The circle is out of space. Delete some old items and try again', 'نفدت المساحة المتاحة للحلقة. احذفوا بعض العناصر القديمة وحاولوا مجددًا'), 'warn');
    } else if (code === 'resource_exhausted') {
      U.toast(L('واحدة واحدة… جرّب تاني كمان كام ثانية', 'Too fast — try again in a few seconds', 'على مهلك… حاول مجددًا بعد ثوانٍ'), 'warn');
    } else if (Date.now() - (handleWriteError.last || 0) > 60000) {
      handleWriteError.last = Date.now();
      U.toast(L('ماتحفظش. اتأكد من النت وجرّب تاني', 'Not saved. Check your connection and try again', 'لم يُحفظ. تحقّق من اتصالك وحاول مجددًا'), 'warn');
    }
  }
  D.set = (path, body) => queue(path, () => S.db.doc(path).set(body));
  D.update = (path, patch) => queue(path, () => S.db.doc(path).update(patch));
  D.del = (path) => queue(path, () => S.db.doc(path).delete());
  D.canWrite = () => !!S.db && !S.readOnly;

  /* ---------- lookups ---------- */
  D.progKey = (b, u) => `${b}~${u}`;
  D.prog = (b, u = S.me) => S.prog.get(D.progKey(b, u)) || null;
  D.bookProgs = (b) => [...S.prog.values()].filter((p) => p.b === b);
  D.joined = () => !!(S.me && S.members.has(S.me));
  D.memberIds = () =>
    [...S.members.values()].sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt))).map((m) => m.id);

  D.name = (uid) => {
    if (!uid) return L('حد', 'Someone', 'شخص ما');
    const m = S.members.get(uid);
    const p = S.profiles[uid];
    return (m && m.nick) || (p && p.name) || L('قارئ', 'Reader', 'قارئ');
  };
  D.color = (uid) => {
    const p = S.profiles[uid];
    if (p && p.color) return p.color;
    return U.SPINES[U.hash(uid || '') % U.SPINES.length][0];
  };
  /* A member's mark: their emoji, photo or first letter, in their colour, with the frame they chose (frames
     are rewards; one that isn't unlocked doesn't show). */
  D.avatar = (uid, size = 'md') => {
    const p = S.profiles[uid];
    const n = D.name(uid);
    const col = D.color(uid);
    const m = S.members.get(uid);
    const fr = A.G && A.G.frameOf ? A.G.frameOf(uid) : '';
    const cls = `av av-${size}${fr ? ' fr fr-' + fr : ''}`;
    if (m && m.emoji) return `<span class="${cls}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><span class="av-emo">${U.esc(m.emoji)}</span></span>`;
    if (p && p.avatarUrl && !(m && m.nick && !p.name)) {
      return `<span class="${cls}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><img src="${U.esc(p.avatarUrl)}" alt=""></span>`;
    }
    const ch = Array.from(n.trim())[0] || '؟';
    return `<span class="${cls}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><span class="av-ch">${U.esc(ch)}</span></span>`;
  };

  let lastIds = '';
  D.resolvePeople = async () => {
    if (!S.user) return;
    const ids = new Set(S.members.keys());
    if (S.me) ids.add(S.me);
    for (const n of S.notes.values()) n.by && ids.add(n.by);
    for (const m of S.msgs) m.by && ids.add(m.by);
    for (const p of S.peers) p.by && ids.add(p.by);
    const list = [...ids].sort();
    const key = list.join(',');
    try {
      const res = await S.user.profiles(list);
      let changed = key !== lastIds;
      for (const id of list) {
        const a = S.profiles[id];
        const b = res[id];
        if (!a || !b || a.name !== b.name || a.avatarUrl !== b.avatarUrl) changed = true;
      }
      lastIds = key;
      if (changed) {
        S.profiles = Object.assign({}, S.profiles, res);
        D.bump();
      }
    } catch (e) {}
  };

  /* ---------- room presence: who is reading right now ---------- */
  function initRoom(room) {
    try {
      let t = 0, last = 0;
      room.onPeers(
        (ch) => {
          S.peers = ch.peers.slice();
          const wait = Math.max(0, 1500 - (Date.now() - last));
          clearTimeout(t);
          t = setTimeout(() => {
            last = Date.now();
            D.bump();
          }, wait);
        },
        () => {}
      );
      room.presence({ uid: S.me, at: 'home' }).catch(() => {});
    } catch (e) {}
  }
  let lastPresence = '';
  D.presence = (patch) => {
    if (!S.room) return;
    const k = JSON.stringify(patch);
    if (k === lastPresence) return;
    lastPresence = k;
    S.room.presence(Object.assign({ uid: S.me }, patch)).catch(() => {});
  };
  /* Unique people (not tabs) currently reading, optionally in one book. */
  D.readingNow = (bookId) => {
    const seen = new Map();
    for (const p of S.peers) {
      const uid = p.by || (p.presence && p.presence.uid);
      if (!uid || !p.presence || !p.presence.b) continue;
      if (bookId && p.presence.b !== bookId) continue;
      if (p.isMe) continue;
      seen.set(uid, { uid, b: p.presence.b, p: p.presence.p });
    }
    return [...seen.values()];
  };
  D.onlineIds = () => {
    const s = new Set();
    for (const p of S.peers) {
      const uid = p.by || (p.presence && p.presence.uid);
      if (uid && !p.isMe) s.add(uid);
    }
    return s;
  };

  /* ---------- domain writes ---------- */
  D.join = async (nick, emoji) => {
    const t = U.nowIso();
    const existing = S.members.get(S.me);
    const body = Object.assign({ days: {}, goal: {} }, existing || {}, { nick: nick.trim().slice(0, 40), joinedAt: (existing && existing.joinedAt) || t });
    if (emoji) body.emoji = emoji;
    delete body.id;
    await D.set(`members/${S.me}`, body);
    if (!S.circle && S.loaded.circle && (S.isOwner || S.canEdit)) {
      await D.set('meta/circle', { name: L('حلقة القراءة', 'Reading Circle', 'حلقة القراءة'), motto: '', weeklyGoal: 300, createdAt: t, by: S.me });
    }
  };

  /* Read-modify-write computed inside the per-document queue, so it always starts from our latest write. */
  D.mutate = (path, fn) =>
    queue(path, () => {
      const body = fn();
      if (!body) return null;
      return S.db.doc(path).set(body);
    });

  /* New pages read today, and seconds spent reading. Also kept: the hour of the day pages were read in
     (a bit per hour), the longest sitting today (`sitMins`, minutes without closing the book), and whether
     today's daily goal was reached. */
  D.addPagesToday = async (n, secs = 0, sitMins = 0) => {
    if ((!n && !secs && !sitMins) || !S.members.has(S.me) || !D.canWrite()) return;
    const path = `members/${S.me}`;
    await D.mutate(path, () => {
      const m = S.members.get(S.me);
      if (!m) return null;
      const k = U.today();
      const body = Object.assign({}, m, { lastActive: k });
      if (n) body.days = Object.assign({}, m.days, { [k]: Math.max(0, ((m.days && m.days[k]) || 0) + n) }); // n < 0: pages un-counted
      if (n > 0) body.hrs = Object.assign({}, m.hrs, { [k]: ((m.hrs && +m.hrs[k]) || 0) | (1 << new Date().getHours()) });
      if (secs) body.secs = Object.assign({}, m.secs, { [k]: ((m.secs && m.secs[k]) || 0) + Math.round(secs) });
      if (sitMins > ((m.long && +m.long[k]) || 0)) body.long = Object.assign({}, m.long, { [k]: Math.round(sitMins) });
      const g = A.G && A.G.dailyGoal ? A.G.dailyGoal() : null;
      if (g && !(m.gd && m.gd[k])) {
        const have = g.k === 'mins' ? ((body.secs && body.secs[k]) || 0) / 60 : (body.days && body.days[k]) || 0;
        if (have >= g.n) body.gd = Object.assign({}, m.gd, { [k]: g.n });
      }
      delete body.id;
      return body;
    });
  };
  /* A finished focus session of `mins` minutes. */
  D.addFocus = (mins) =>
    D.updateMe((m) => {
      const k = U.today();
      const cur = (m.focus && m.focus[k]) || { n: 0, m: 0 };
      return { focus: Object.assign({}, m.focus, { [k]: { n: (cur.n || 0) + 1, m: (cur.m || 0) + Math.round(mins) } }) };
    });
  D.setDailyGoal = (k, n) => D.updateMe(() => ({ dg: { k: k === 'mins' ? 'mins' : 'pages', n: Math.round(n) } }));

  /* patch may be a function (cur) => patch */
  D.saveProg = async (bookId, patch) => {
    if (!D.canWrite()) return;
    await D.mutate(`prog/${D.progKey(bookId, S.me)}`, () => {
      const cur = D.prog(bookId) || { b: bookId, u: S.me, seen: [], done: {}, last: 1, joined: U.nowIso() };
      const p = typeof patch === 'function' ? patch(cur) : patch;
      if (!p) return null;
      const body = Object.assign({}, cur, p, { b: bookId, u: S.me, updatedAt: U.nowIso() });
      delete body.id;
      return body;
    });
  };

  /* My private document (private notes, bookmarks, notes I moved or hid on my screen): fn gets a copy. */
  D.privUpdate = (fn) => D.mutate(`data/users/${S.me}/priv`, () => fn(Object.assign({}, S.priv || {})));
  D.updateMe = async (patchFn) => {
    if (!D.canWrite()) return;
    await D.mutate(`members/${S.me}`, () => {
      const m = S.members.get(S.me);
      if (!m) return null;
      const body = Object.assign({}, m, patchFn(m));
      delete body.id;
      return body;
    });
  };

  D.newId = () => U.rid(16);
})();
