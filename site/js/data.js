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
    gone: new Map(), // removed books: just their portions, so the XP earned on them stays
    myBooks: new Map(), // «مكتبتي الخاصة»: books only I can see (data/users/<me>/my/books)
    myProg: new Map(), // my progress in them (data/users/<me>/my/prog), never in the circle's prog
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
    // Everything is synced to the device anyway; the limits only keep memory bounded. XP, streaks and badges are
    // worked out from these, so they must hold the whole history of a circle, not just recent weeks.
    listen(db.collection('msgs').orderBy('at', 'desc').limit(20000), 'msgs', (s) => {
      S.msgs = s.docs.map((d) => Object.assign({ id: d.id }, d.data())).reverse();
    });
    listen(db.collection('shelf'), 'shelf', (s) => (S.shelf = toMap(s)));
    listen(db.collection('proposals'), 'proposals', (s) => (S.proposals = toMap(s)));
    listen(db.collection('gone'), 'gone', (s) => (S.gone = toMap(s)));
    listen(db.collection('pokes').orderBy('at', 'desc').limit(20000), 'pokes', (s) => (S.pokes = toMap(s)));
    listen(db.doc(`data/users/${S.me}/priv`), 'priv', (s) => (S.priv = s.exists ? s.data() : null));
    listen(db.collection(`data/users/${S.me}/my/books`), 'myBooks', (s) => (S.myBooks = toMap(s)));
    listen(db.collection(`data/users/${S.me}/my/prog`), 'myProg', (s) => (S.myProg = toMap(s)));
  }

  /* ---------- writes (one at a time per document) ---------- */
  const chains = new Map();
  let warnedRO = false;
  function queue(path, fn) {
    const prev = chains.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    chains.set(path, next);
    next
      .finally(() => {
        if (chains.get(path) === next) chains.delete(path);
      })
      .catch(() => {}); // the caller gets the error below; this copy must not be an unhandled rejection
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
        U.toast(L('مقدرتش أحفظ. يمكن اتشلت من الحلقة — جرّب تفتح التطبيق تاني.', "Couldn't save. You may have been removed from the circle — try reopening the app.", 'تعذّر الحفظ. ربما لم تعد عضوًا في الحلقة — جرّب فتح التطبيق من جديد.'), 'warn');
      }
    } else if (code === 'invalid_argument') {
      U.toast(L('مقدرتش أحفظ — يمكن التعديل ده مش مسموح لك.', "Couldn't save — you may not be allowed to make this change.", 'تعذّر الحفظ — ربما هذا التعديل غير مسموح لك.'), 'warn');
    } else if (code === 'too_large') {
      U.toast(L('الكلام ده أطول من اللي ينفع يتحفظ في مكان واحد. قسّمه على جزئين — اللي كتبته محفوظ كمسودة.', "That's too long to save in one place. Split it in two — what you wrote is kept as a draft.", 'هذا النص أطول مما يمكن حفظه في مكان واحد. قسّمه إلى جزأين — ما كتبته محفوظ كمسودة.'), 'warn');
    } else if (code === 'quota_exceeded') {
      U.toast(L('المساحة المتاحة للحلقة خلصت. امسحوا حاجات قديمة وجرّبوا تاني', 'The circle is out of space. Delete some old items and try again', 'نفدت المساحة المتاحة للحلقة. احذفوا بعض العناصر القديمة وحاولوا مجددًا'), 'warn');
    } else if (code === 'resource_exhausted') {
      U.toast(L('براحة شوية… جرّب تاني بعد ثواني', 'Too fast — try again in a few seconds', 'مهلًا… حاول مجددًا بعد بضع ثوان'), 'warn');
    } else if (Date.now() - (handleWriteError.last || 0) > 60000) {
      handleWriteError.last = Date.now();
      U.toast(L('ماتحفظش. اتأكد من النت وجرّب تاني', 'Not saved. Check your connection and try again', 'لم يتم الحفظ. تأكد من اتصالك بالإنترنت وحاول مجددًا'), 'warn');
    }
  }
  // Safety net: nothing about a private book goes into the circle's shared notes or messages.
  const leaks = (path, body) => /^(notes|msgs)\//.test(path) && body && D.isPrivate(body.b);
  D.set = (path, body) => (leaks(path, body) ? Promise.reject(Object.assign(new Error('private book'), { code: 'invalid_argument' })) : queue(path, () => S.db.doc(path).set(body)));
  D.update = (path, patch) => queue(path, () => S.db.doc(path).update(patch));
  D.del = (path) => queue(path, () => S.db.doc(path).delete());
  D.canWrite = () => !!S.db && !S.readOnly;

  /* ---------- lookups ---------- */
  D.progKey = (b, u) => `${b}~${u}`;
  /* Private books («مكتبتي الخاصة») have ids starting with "my-"; their details and my progress in them live in
     my private document tree, so the circle never sees the book, its file, its notes or how far I got. */
  D.isPrivate = (b) => typeof b === 'string' && b.startsWith('my-');
  D.myBookPath = (b) => `data/users/${S.me}/my/books/${b}`;
  const myProgPath = (b) => `data/users/${S.me}/my/prog/${b}`;
  /* A book by id: the circle's, or one of mine. */
  D.book = (id) => (id && (S.books.get(id) || S.myBooks.get(id))) || null;
  D.prog = (b, u = S.me) => (D.isPrivate(b) ? (u === S.me && S.myProg.get(b)) || null : S.prog.get(D.progKey(b, u)) || null);
  D.bookProgs = (b) => [...S.prog.values()].filter((p) => p.b === b);
  D.joined = () => !!(S.me && S.members.has(S.me));
  D.memberIds = () =>
    [...S.members.values()].sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt))).map((m) => m.id);

  D.name = (uid) => {
    if (!uid) return L('حد', 'Someone', 'شخص ما');
    const m = S.members.get(uid);
    const p = S.profiles[uid];
    return (m && m.nick) || (p && p.name) || L('قارئ', 'Reader');
  };
  D.color = (uid) => {
    const p = S.profiles[uid];
    if (p && p.color) return p.color;
    return U.SPINES[U.hash(uid || '') % U.SPINES.length][0];
  };
  D.avatar = (uid, size = 'md') => {
    const p = S.profiles[uid];
    const n = D.name(uid);
    const col = D.color(uid);
    const m = S.members.get(uid);
    if (m && m.emoji) return `<span class="av av-${size}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><span class="av-emo">${U.esc(m.emoji)}</span></span>`;
    if (p && p.avatarUrl && !(m && m.nick && !p.name)) {
      return `<span class="av av-${size}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><img src="${U.esc(p.avatarUrl)}" alt=""></span>`;
    }
    const ch = Array.from(n.trim())[0] || '؟';
    return `<span class="av av-${size}" style="--c:${U.esc(col)}" title="${U.esc(n)}"><span class="av-ch">${U.esc(ch)}</span></span>`;
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
    if (patch && D.isPrivate(patch.b)) patch = Object.assign({}, patch, { b: null, p: null }); // a private book is never announced
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
      if (!uid || !p.presence || !p.presence.b || D.isPrivate(p.presence.b)) continue;
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
      await D.set('meta/circle', { name: L('حلقة القراءة', 'Reading Circle'), motto: '', weeklyGoal: 300, createdAt: t, by: S.me });
    }
  };

  /* Read-modify-write computed inside the per-document queue, so it always starts from our latest write. */
  D.mutate = (path, fn) =>
    queue(path, () => {
      const body = fn();
      if (!body) return null;
      return S.db.doc(path).set(body);
    });

  /* New pages read today, and seconds spent reading. */
  D.addPagesToday = async (n, secs = 0, day) => {
    if ((!n && !secs) || !S.members.has(S.me) || !D.canWrite()) return;
    const path = `members/${S.me}`;
    await D.mutate(path, () => {
      const m = S.members.get(S.me);
      if (!m) return null;
      const k = day || U.today(); // the day the pages were read, also when saved later
      const body = Object.assign({}, m, { lastActive: m.lastActive && m.lastActive > k ? m.lastActive : k });
      if (n) body.days = Object.assign({}, m.days, { [k]: Math.max(0, ((m.days && m.days[k]) || 0) + n) }); // n < 0: pages un-counted
      if (secs) body.secs = Object.assign({}, m.secs, { [k]: ((m.secs && m.secs[k]) || 0) + Math.round(secs) });
      delete body.id;
      return body;
    });
  };

  /* patch may be a function (cur) => patch */
  D.saveProg = async (bookId, patch) => {
    if (!D.canWrite()) return;
    await D.mutate(D.isPrivate(bookId) ? myProgPath(bookId) : `prog/${D.progKey(bookId, S.me)}`, () => {
      const cur = D.prog(bookId) || { b: bookId, u: S.me, seen: [], done: {}, last: 1, joined: U.nowIso() };
      const p = typeof patch === 'function' ? patch(cur) : patch;
      if (!p) return null;
      const body = Object.assign({}, cur, p, { b: bookId, u: S.me, updatedAt: U.nowIso() });
      delete body.id;
      return body;
    });
  };

  /* Reading that could not be saved (offline, a failed request) waits on this device until a save works, even
     after the book is closed: {b, seen: pages for the book's progress, last, n: pages for today's count, secs, day}. */
  const obxKey = () => 'outbox:' + ((A.P && A.P.circle && A.P.circle() && A.P.circle().id) || '');
  D.outboxAdd = (e) => {
    if (!e || (!(e.seen && e.seen.length) && !e.n && !e.secs && !e.last)) return;
    const list = U.store.get(obxKey(), []);
    list.push(Object.assign({ day: U.today() }, e));
    U.store.set(obxKey(), list.slice(-300));
  };
  D.outboxCount = () => U.store.get(obxKey(), []).reduce((t, e) => t + Math.max(e.n || 0, (e.seen && e.seen.length) || 0), 0);
  D.outboxHas = (b, p) => U.store.get(obxKey(), []).some((e) => e.b === b && e.seen && e.seen.includes(p));
  let obxRun = null;
  async function sendOutbox() {
    let list = U.store.get(obxKey(), []);
    while (list.length && D.canWrite() && D.joined()) {
      const e = list[0];
      if (e.seen && e.seen.length) {
        await D.saveProg(e.b, (c) => ({ seen: U.rangesAdd(c.seen, e.seen), last: Math.max(c.last || 1, e.last || 0) }));
        e.seen = [];
        U.store.set(obxKey(), list);
      }
      if (e.n || e.secs) await D.addPagesToday(e.n || 0, e.secs || 0, e.day);
      list = U.store.get(obxKey(), []).slice(1);
      U.store.set(obxKey(), list);
    }
  }
  D.flushOutbox = () => {
    if (!obxRun) {
      obxRun = sendOutbox()
        .catch((err) => console.warn('outbox: will try again', err)) // still offline
        .finally(() => (obxRun = null));
    }
    return obxRun;
  };
  const obxSoon = () => setTimeout(() => U.store.get(obxKey(), []).length && D.flushOutbox(), 2500);
  window.addEventListener('online', obxSoon);
  document.addEventListener('visibilitychange', () => !document.hidden && obxSoon());
  setInterval(() => navigator.onLine !== false && U.store.get(obxKey(), []).length && D.flushOutbox(), 60000);

  /* ---------- «مكتبتي الخاصة»: files only I can read ---------- */
  /* Stored at '<circle>/private/<me>/<random>.pdf' in the books bucket; the storage policies
     (migrations/…_private_books.sql) let only me read or delete them. Reading and deleting go through the
     usual S.assets / A.P.fetchAsset (they take any path); only the upload needs its own folder. */
  const sbOf = () => (A.P && A.P.sb && A.P.circle && A.P.circle() ? A.P.sb() : null);
  D.canUploadPrivate = () => !!(sbOf() && S.me && D.canWrite());
  D.uploadPrivate = async (blob) => {
    const sb = sbOf();
    if (!sb) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    if (!(blob instanceof Blob) || !blob.size) throw Object.assign(new Error('invalid_request'), { code: 'invalid_request' });
    if (blob.size > 50 * 1024 * 1024) throw Object.assign(new Error('too_large'), { code: 'too_large' });
    const id = `${A.P.circle().id}/private/${S.me}/${U.rid(24)}.pdf`;
    const { error } = await sb.storage.from('books').upload(id, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '31536000' });
    if (error) {
      const m = String(error.message || '') + ' ' + String(error.statusCode || '');
      const code = /413|too large|exceeded the maximum/i.test(m) ? 'too_large' : /quota|storage.*limit/i.test(m) ? 'quota_or_state' : 'upstream_error';
      throw Object.assign(new Error(error.message || code), { code });
    }
    return { id, sizeBytes: blob.size };
  };
  /* Forget cached copies on this device (U.cache has no delete). */
  D.cacheDel = (keys) =>
    new Promise((res) => {
      try {
        const ix = U.store.get('cacheIndex', {});
        for (const k of keys) delete ix[k];
        U.store.set('cacheIndex', ix);
        const r = indexedDB.open('qs-books', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('blobs');
        r.onerror = () => res();
        r.onsuccess = () => {
          try {
            const t = r.result.transaction('blobs', 'readwrite');
            for (const k of keys) t.objectStore('blobs').delete(k);
            t.oncomplete = t.onerror = t.onabort = () => (r.result.close(), res());
          } catch (e) {
            res();
          }
        };
      } catch (e) {
        res();
      }
    });
  /* Remove one of my private books: its files first (so nothing is left behind if that fails), then its
     details, my progress, and my notes, bookmarks and «وقفت هنا» on it. */
  D.deletePrivateBook = async (id) => {
    const b = S.myBooks.get(id);
    if (!D.isPrivate(id) || !b) return;
    if ((b.parts || []).length && !S.assets) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    for (const p of b.parts || []) await S.assets.delete(p.id);
    await D.del(D.myBookPath(id));
    if (S.myProg.has(id)) await D.del(myProgPath(id)).catch(() => {});
    const p = S.priv || {};
    const hasNotes = Object.values(p.notes || {}).some((n) => n && n.b === id);
    if (hasNotes || (p.marks && p.marks[id]) || (p.place && p.place[id]))
      await D.privUpdate((cur) => {
        const notes = {};
        for (const [k, n] of Object.entries(cur.notes || {})) if (!(n && n.b === id)) notes[k] = n;
        const marks = Object.assign({}, cur.marks);
        const place = Object.assign({}, cur.place);
        delete marks[id];
        delete place[id];
        return Object.assign(cur, { notes, marks, place });
      }).catch(() => {});
    await D.cacheDel(['lb:' + id, ...(b.parts || []).map((x) => 'a:' + x.id)]);
    U.store.del('last:' + id);
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
