/* Platform layer for the standalone app.
   It exposes the same small API the app was written against (window.claude.use('db' | 'user' | 'assets' | 'room' | 'downloads'))
   but backed by Supabase: Postgres tables with Row Level Security, Realtime for live updates and presence,
   and Storage for the PDF files. Documents are cached in IndexedDB and synced incrementally by updated_at,
   so the app opens instantly and keeps working through flaky connections. */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  const P = (A.P = {});
  const cfg = window.QS_CONFIG || {};

  P.cfg = cfg;
  P.configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  P.native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  P.plugin = (name) => {
    const C = window.Capacitor;
    if (!C) return null;
    if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    try {
      return C.registerPlugin ? C.registerPlugin(name) : null;
    } catch (e) {
      return null;
    }
  };

  let sb = null;
  P.sb = () => {
    if (!sb && P.configured) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'qs-auth' },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    }
    return sb;
  };

  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const mapErr = (e) => {
    if (!e) return err('unavailable');
    if (e.code && /^(invalid_argument|unavailable|quota_exceeded|too_large|declined)$/.test(e.code)) return e;
    const c = String(e.code || '');
    if (c === '23514' && /data_check/.test(e.message || '')) return err('too_large', e.message);
    if (c === '42501' || c === 'PGRST301' || c === '23514' || c === '22P02' || c === 'P0002' || c === '23503') return err('invalid_argument', e.message);
    if (c === '54000' || /too large|payload/i.test(e.message || '')) return err('invalid_argument', e.message);
    return err('unavailable', e.message);
  };
  P.mapErr = mapErr;

  /* ---------- auth ---------- */
  /* The stored session, for starting offline (supabase-js would wait ~30 s trying to refresh, then give up). */
  const storedSession = () => {
    try {
      const s = JSON.parse(localStorage.getItem('qs-auth') || 'null');
      return s && s.user && s.refresh_token ? s : null;
    } catch (e) {
      return null;
    }
  };
  P.session = async () => {
    if (!navigator.onLine) return storedSession();
    try {
      const { data, error } = await P.sb().auth.getSession();
      if (data && data.session) return data.session;
      if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0)) return storedSession();
      return null;
    } catch (e) {
      return storedSession();
    }
  };
  P.sendCode = async (email) => {
    const { error } = await P.sb().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.href.split('#')[0].split('?')[0] } });
    if (error) throw error;
  };
  P.verifyCode = async (email, token) => {
    const { data, error } = await P.sb().auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    return data.session;
  };
  P.signOut = async () => {
    window.__qsSigningOut = true; // stops late writes to localStorage (see U.store.set)
    try {
      await P.sb().auth.signOut();
    } catch (e) {}
    try {
      for (const k of Object.keys(localStorage)) if ((k.startsWith('qs:') && !/^qs:(lang|uiLang|uiLangAr|theme|sound)$/.test(k)) || k === 'qs-auth') localStorage.removeItem(k);
    } catch (e) {}
    try {
      indexedDB.deleteDatabase('qs-sync');
      indexedDB.deleteDatabase('qs-books');
    } catch (e) {}
    location.replace(location.pathname + location.search);
  };

  /* ---------- circles ---------- */
  P.myCircles = async (uid) => {
    const { data, error } = await P.sb().from('circle_members').select('role, joined_at, circles(id, name, settings, invite_code)').eq('user_id', uid);
    if (error) throw error;
    return (data || []).filter((r) => r.circles).map((r) => Object.assign({ role: r.role }, r.circles));
  };
  P.createCircle = async (name) => {
    const { data, error } = await P.sb().rpc('create_circle', { p_name: name });
    if (error) throw error;
    return data;
  };
  P.joinCircle = async (code) => {
    const { data, error } = await P.sb().rpc('join_circle', { p_code: code });
    if (error) throw error;
    return data;
  };
  P.resetInvite = async (circleId) => {
    const { data, error } = await P.sb().rpc('reset_invite_code', { p_circle: circleId });
    if (error) throw error;
    return data;
  };
  P.removeMember = async (circleId, uid) => {
    const { error } = await P.sb().rpc('remove_member', { p_circle: circleId, p_user: uid });
    if (error) throw error;
  };
  P.setRole = async (circleId, uid, role) => {
    const { error } = await P.sb().rpc('set_member_role', { p_circle: circleId, p_user: uid, p_role: role });
    if (error) throw error;
  };
  P.leaveCircle = async (circleId) => {
    const { error } = await P.sb().rpc('leave_circle', { p_circle: circleId });
    if (error) throw error;
  };
  P.inviteLink = (code) => `${location.href.split('#')[0].split('?')[0]}#join-${code}`;

  /* ---------- tiny IndexedDB cache for synced documents ---------- */
  const idb = (() => {
    let dbp = null;
    const open = () =>
      (dbp =
        dbp ||
        new Promise((res, rej) => {
          try {
            const r = indexedDB.open('qs-sync', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('kv');
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          } catch (e) {
            rej(e);
          }
        }));
    const run = (mode, fn) =>
      open().then(
        (db) =>
          new Promise((res) => {
            try {
              const t = db.transaction('kv', mode);
              const q = fn(t.objectStore('kv'));
              t.oncomplete = () => res(q && 'result' in q ? q.result : null);
              t.onerror = t.onabort = () => res(null);
            } catch (e) {
              res(null);
            }
          })
      );
    return {
      get: (k) => run('readonly', (s) => s.get(k)).catch(() => null),
      put: (k, v) => run('readwrite', (s) => s.put(v, k)).catch(() => null),
    };
  })();

  /* ---------- the circle-scoped document store ---------- */
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const deepMerge = (a, b) => {
    if (!isObj(a) || !isObj(b)) return clone(b);
    const out = Object.assign({}, a);
    for (const k of Object.keys(b)) out[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : clone(b[k]);
    return out;
  };
  const freeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o)) freeze(v);
    }
    return o;
  };
  const getField = (o, f) => f.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

  /* Shelf books: one row each in shelf_books (see migrations/…_shelf_books.sql). */
  const BOOK_ID = /^[A-Za-z0-9_.~:@+-]{1,64}$/;
  const BOOK_PAGE = 1000; // Supabase answers at most 1000 rows per request
  const BOOK_BATCH = 500; // rows per upsert request
  const BOOK_BATCH_CHARS = 1500000; // …and at most this much JSON
  const BOOK_MAX_BYTES = 32000; // per-row cap in the database is 32768 (pg_column_size)
  const noTable = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || (e.code === 'PGRST200' && /shelf_books/.test(e.message || '')));
  const itemTime = (x) => (x && Date.parse(x.updatedAt || x.at)) || 0;
  const utf8Len = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);
  const legacyOf = (leg) => {
    const { items, ...other } = (leg && leg.data) || {};
    return { other, items: isObj(items) ? items : {} };
  };
  const rowable = (id, v) => BOOK_ID.test(id) && isObj(v);

  P.open = async (circle, me) => {
    const client = P.sb();
    const C = circle.id;
    const cacheKey = 'sync:' + C;
    const st = {
      docs: new Map(), // "col|id" -> {col, id, data, at}
      roles: new Map(), // uid -> role
      profiles: new Map(), // uid -> {data, at}
      shelves: new Map(), // uid -> {data, at}: the shelves row (other keys, plus items an older app version wrote there)
      books: new Map(), // uid -> Map(id -> {data, at, deleted}): shelf_books rows (tombstones too: they hide legacy items)
      bookSince: '1970-01-01T00:00:00Z', // newest shelf_books updated_at fetched for the members in bookUsers
      bookUsers: new Set(), // members whose rows were fully fetched up to bookSince
      circle: Object.assign({}, circle),
      since: '1970-01-01T00:00:00Z',
    };
    const views = new Map(); // uid -> frozen shelf/<uid> view (legacy items ∪ rows), rebuilt after a change
    let booksReady = false; // my own rows were fetched in this session (gates moving legacy items into rows)
    let booksMissing = false; // the shelf_books table is not there yet: fall back to the one-row shelf
    let migrating = false; // moving my legacy shelf items into rows right now
    const listeners = new Set();
    let ready = false;

    /* ---------- writes are serialised per document (also the legacy shelf move) ---------- */
    const chains = new Map();
    const serial = (key, fn) => {
      const prev = chains.get(key) || Promise.resolve();
      const next = prev.catch(() => {}).then(fn);
      chains.set(key, next);
      next.finally(() => chains.get(key) === next && chains.delete(key)).catch(() => {});
      return next;
    };

    /* Path routing: some collections live in their own tables. */
    const route = (path) => {
      const segs = path.split('/');
      if (path === 'meta/circle') return { kind: 'circle' };
      if (segs.length === 2 && segs[0] === 'members') return { kind: 'profile', uid: segs[1] };
      if (segs.length === 2 && segs[0] === 'shelf') return { kind: 'shelf', uid: segs[1] };
      return { kind: 'doc', col: segs.slice(0, -1).join('/'), id: segs[segs.length - 1] };
    };
    const checkPath = (path, even) => {
      const segs = String(path).split('/');
      if (!segs.every((s) => /^[A-Za-z0-9_.~:@+-]{1,200}$/.test(s) && s !== '.' && s !== '..')) throw new TypeError('bad path segment: ' + path);
      if ((segs.length % 2 === 0) !== even) throw new TypeError(`path "${path}" has ${segs.length} segments`);
    };

    let circleView = null, circleSrc = null;
    const readDoc = (path) => {
      const r = route(path);
      if (r.kind === 'circle') {
        if (circleSrc !== st.circle) {
          circleSrc = st.circle;
          circleView = freeze(Object.assign({}, clone(st.circle.settings) || {}, { name: st.circle.name }));
        }
        return circleView;
      }
      if (r.kind === 'profile') return st.roles.has(r.uid) && st.profiles.has(r.uid) ? st.profiles.get(r.uid).data : undefined;
      if (r.kind === 'shelf') return st.roles.has(r.uid) ? shelfView(r.uid) : undefined;
      const d = st.docs.get(r.col + '|' + r.id);
      return d ? d.data : undefined;
    };
    /* shelf/<uid> = the shelves row's other keys + items: legacy shelves.data.items ∪ shelf_books rows
       (a row wins over a legacy item with the same id; a deleted row removes it). Built once per change. */
    function shelfView(uid) {
      if (views.has(uid)) return views.get(uid);
      const leg = st.shelves.get(uid);
      const rows = st.books.get(uid);
      let v;
      if (leg || (rows && rows.size)) {
        const { items: li, ...other } = (leg && leg.data) || {};
        const items = isObj(li) ? Object.assign({}, li) : {};
        if (rows) for (const [id, b] of rows) {
          if (b.deleted) delete items[id];
          else items[id] = b.data;
        }
        v = freeze(Object.assign(other, { items }));
      }
      views.set(uid, v);
      return v;
    }
    const readCol = (col) => {
      const out = [];
      if (col === 'members') {
        for (const uid of st.roles.keys()) if (st.profiles.has(uid)) out.push([uid, st.profiles.get(uid).data]);
      } else if (col === 'shelf') {
        for (const uid of st.roles.keys()) {
          const v = shelfView(uid);
          if (v) out.push([uid, v]);
        }
      } else {
        for (const d of st.docs.values()) if (d.col === col) out.push([d.id, d.data]);
      }
      return out;
    };

    /* ---------- listeners ---------- */
    let pending = false;
    const dirty = new Set();
    const touch = (col) => {
      dirty.add(col);
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        const cols = new Set(dirty);
        dirty.clear();
        for (const l of listeners) if (cols.has('*') || cols.has(l.col)) deliver(l);
        saveCache();
      });
    };
    // Stored bodies are frozen once when they enter the store, so snapshots hand them out without copying.
    const docSnap = (path, data) => ({ id: path.split('/').pop(), exists: data !== undefined, data: () => data, metadata: { fromCache: !ready, hasPendingWrites: false } });
    function deliver(l) {
      try {
        if (l.kind === 'doc') {
          const data = readDoc(l.path);
          if (l.seen && data === l.last) return;
          l.seen = true;
          l.last = data;
          l.cb(docSnap(l.path, data));
        } else {
          let rows = readCol(l.col);
          for (const [f, op, v] of l.q.where) rows = rows.filter(([, d]) => cmp(getField(d, f), op, v));
          if (l.q.order) {
            const [f, dir] = l.q.order;
            rows.sort((a, b) => {
              const x = getField(a[1], f), y = getField(b[1], f);
              if (x === undefined) return 1;
              if (y === undefined) return -1;
              return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
            });
          } else rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
          if (l.q.limit) rows = rows.slice(0, l.q.limit);
          // Delivered only when this collection changed; skip if the visible rows are the very same objects.
          if (l.lastRows && l.lastRows.length === rows.length && rows.every((r, i) => r[0] === l.lastRows[i][0] && r[1] === l.lastRows[i][1])) return;
          l.lastRows = rows;
          const docs = rows.map(([id, d]) => ({ id, exists: true, data: () => d, metadata: {} }));
          l.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !ready, hasPendingWrites: false } });
        }
      } catch (e) {
        console.error(e);
      }
    }
    function cmp(a, op, b) {
      switch (op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case 'in': return Array.isArray(b) && b.includes(a);
        case 'not-in': return Array.isArray(b) && !b.includes(a);
        case 'array-contains': return Array.isArray(a) && a.includes(b);
      }
      return false;
    }

    /* ---------- applying server rows ---------- */
    const applyDoc = (row) => {
      if (!row || row.circle_id !== C) return;
      const k = row.col + '|' + row.id;
      const cur = st.docs.get(k);
      if (cur && cur.at && row.updated_at && cur.at > row.updated_at) return; // older echo
      if (row.deleted) st.docs.delete(k);
      else st.docs.set(k, { col: row.col, id: row.id, data: freeze(row.data || {}), at: row.updated_at });
      if (row.updated_at && row.updated_at > st.since) st.since = row.updated_at;
      touch(row.col);
    };
    const applyProfile = (row, map, col) => {
      if (!row || !row.user_id) return;
      const cur = map.get(row.user_id);
      if (cur && cur.at && row.updated_at && cur.at > row.updated_at) return;
      if (map === st.shelves) views.delete(row.user_id);
      map.set(row.user_id, { data: freeze(row.data || {}), at: row.updated_at });
      touch(col);
    };
    const applyShelf = (row) => {
      applyProfile(row, st.shelves, 'shelf');
      if (row && row.user_id === me) maybeMigrate();
    };
    // One shelf_books row; true if it changed something. The caller touches 'shelf'.
    const putBook = (row) => {
      if (!row || !row.user_id || typeof row.id !== 'string') return false;
      let m = st.books.get(row.user_id);
      const cur = m && m.get(row.id);
      if (cur && cur.at && row.updated_at && cur.at >= row.updated_at) return false; // older or the same (an echo)
      if (!m) st.books.set(row.user_id, (m = new Map()));
      m.set(row.id, { data: row.deleted ? null : freeze(row.data || {}), at: row.updated_at || null, deleted: !!row.deleted });
      views.delete(row.user_id);
      return true;
    };
    // Live rows come one message each (an import is thousands): apply them together, a moment later.
    // They do not move bookSince (Realtime may drop events under load); after a burst, a delta fetch
    // a little later picks up anything missed and moves it.
    let rtBooks = [], rtBooksT = 0, burstT = 0;
    const queueBook = (row) => {
      rtBooks.push(row);
      if (!rtBooksT) rtBooksT = setTimeout(flushBooks, 80);
    };
    function flushBooks() {
      rtBooksT = 0;
      const rows = rtBooks;
      rtBooks = [];
      let changed = false;
      for (const r of rows) if (st.roles.has(r.user_id) || r.user_id === me) changed = putBook(r) || changed;
      if (changed) touch('shelf');
      if (rows.length >= 50 && ready) {
        clearTimeout(burstT);
        burstT = setTimeout(() => fetchBooks().catch(() => {}), 3000);
      }
    }

    /* ---------- cache ---------- */
    let saveT = 0;
    function saveCache() {
      if (!ready) return;
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        idb.put(cacheKey, {
          v: 1, me, since: st.since, docs: [...st.docs.values()], profiles: [...st.profiles], shelves: [...st.shelves], roles: [...st.roles], circle: st.circle,
          books: [...st.books].map(([u, m]) => [u, [...m]]), bookSince: st.bookSince, bookUsers: [...st.bookUsers],
        });
      }, 1500);
    }
    const cached = await idb.get(cacheKey);
    if (cached && cached.v === 1 && cached.me === me) {
      for (const d of cached.docs || []) st.docs.set(d.col + '|' + d.id, Object.assign(d, { data: freeze(d.data || {}) }));
      st.profiles = new Map(cached.profiles || []);
      st.shelves = new Map(cached.shelves || []);
      if (Array.isArray(cached.books)) {
        for (const [u, list] of cached.books) st.books.set(u, new Map(list.map(([id, b]) => [id, Object.assign(b, { data: b.data ? freeze(b.data) : null })])));
        st.bookSince = cached.bookSince || st.bookSince;
        st.bookUsers = new Set(cached.bookUsers || []);
      }
      st.roles = new Map(cached.roles || []);
      st.since = cached.since || st.since;
      if (cached.circle) st.circle = Object.assign({}, cached.circle, circle);
    }

    /* ---------- fetching ---------- */
    async function fetchPeople() {
      const { data: mem, error } = await client.from('circle_members').select('user_id, role').eq('circle_id', C);
      if (error) throw error;
      st.roles = new Map(mem.map((m) => [m.user_id, m.role]));
      // my role as the server has it now (made «مشرف» while the app was closed: the cached one is old)
      const mine = st.roles.get(me);
      if (mine && mine !== st.roleSent && P.onRoleChange) {
        st.roleSent = mine;
        P.onRoleChange(mine);
      }
      const ids = [...st.roles.keys()];
      if (ids.length) {
        const [p, s] = await Promise.all([client.from('profiles').select('user_id, data, updated_at').in('user_id', ids), client.from('shelves').select('user_id, data, updated_at').in('user_id', ids)]);
        if (p.error) throw p.error;
        if (s.error) throw s.error;
        for (const r of p.data) applyProfile(r, st.profiles, 'members');
        for (const r of s.data) applyShelf(r);
      }
      touch('members');
      touch('shelf');
    }
    /* Shelf rows of every current member: only what changed since the last fetch for members we already
       have, everything for members new to this device; pages of 1000 by (updated_at, user_id, id). */
    let bookSync = null, bookAgain = false;
    function fetchBooks() {
      if (bookSync) {
        bookAgain = true; // e.g. someone joined while a fetch runs: fetch again after it
        return bookSync;
      }
      bookSync = (async () => {
        for (const u of [...st.books.keys()]) if (!st.roles.has(u)) {
          st.books.delete(u);
          views.delete(u);
        }
        for (const u of [...st.bookUsers]) if (!st.roles.has(u)) st.bookUsers.delete(u);
        const ids = [...st.roles.keys()];
        const known = ids.filter((u) => st.bookUsers.has(u));
        const fresh = ids.filter((u) => !st.bookUsers.has(u));
        let newest = st.bookSince;
        const pull = async (uids, from) => {
          for (let k = 0; k < uids.length; k += 100) {
            const part = uids.slice(k, k + 100);
            let cursor = from, skip = 0;
            for (let guard = 0; guard < 5000; guard++) {
              const { data, error } = await client
                .from('shelf_books')
                .select('user_id, id, data, deleted, updated_at')
                .in('user_id', part)
                .gte('updated_at', cursor)
                .order('updated_at', { ascending: true })
                .order('user_id', { ascending: true })
                .order('id', { ascending: true })
                .range(skip, skip + BOOK_PAGE - 1);
              if (error) throw error;
              let changed = false;
              for (const r of data) {
                changed = putBook(r) || changed;
                if (r.updated_at > newest) newest = r.updated_at;
              }
              if (changed) touch('shelf');
              if (data.length < BOOK_PAGE) break;
              const last = data[data.length - 1].updated_at;
              // A full page on one timestamp: step through it by offset (keyset alone would not move).
              if (last === cursor) skip += BOOK_PAGE;
              else {
                cursor = last;
                skip = 0;
              }
            }
          }
        };
        try {
          // Re-read a small window before the newest row we have, to tolerate clock skew and slow commits.
          if (known.length) await pull(known, new Date(new Date(st.bookSince).getTime() - 5000).toISOString());
          if (fresh.length) await pull(fresh, '1970-01-01T00:00:00Z');
          booksMissing = false;
        } catch (e) {
          if (!noTable(e)) throw e;
          booksMissing = true; // the migration is not applied yet: shelves stay one row each, as before
          return;
        }
        for (const u of fresh) st.bookUsers.add(u);
        if (newest > st.bookSince) st.bookSince = newest;
        if (st.roles.has(me)) booksReady = true;
        touch('shelf');
        maybeMigrate();
      })().finally(() => {
        bookSync = null;
        if (bookAgain) {
          bookAgain = false;
          fetchBooks().catch(() => {});
        }
      });
      return bookSync;
    }
    const fetchPeopleAndBooks = () => fetchPeople().then(fetchBooks);
    async function fetchCircle() {
      const { data, error } = await client.from('circles').select('id, name, settings, invite_code').eq('id', C).maybeSingle();
      if (error) throw error;
      if (!data) throw err('revoked', 'not a member');
      st.circle = Object.assign({}, st.circle, data);
      touch('meta');
    }
    let syncing = null;
    async function deltaSync() {
      if (syncing) return syncing;
      syncing = (async () => {
        // Re-read a small window before the newest row we have, to tolerate clock skew between writers.
        // Keyset paging by updated_at (offset paging can skip a row that changes between pages).
        let cursor = new Date(new Date(st.since).getTime() - 5000).toISOString();
        let skip = 0;
        for (let guard = 0; guard < 400; guard++) {
          const { data, error } = await client.from('docs').select('circle_id, col, id, data, deleted, updated_at').eq('circle_id', C).gte('updated_at', cursor).order('updated_at', { ascending: true }).range(skip, skip + 499);
          if (error) throw error;
          for (const r of data) applyDoc(r);
          if (data.length < 500) break;
          const last = data[data.length - 1].updated_at;
          // Rows sharing one timestamp across a full page: step through them by offset.
          if (last === cursor) skip += 500;
          else {
            cursor = last;
            skip = 0;
          }
        }
      })().finally(() => (syncing = null));
      return syncing;
    }
    P.resync = () => Promise.all([fetchCircle(), fetchPeopleAndBooks(), deltaSync()]).catch((e) => console.warn('resync', e));

    /* ---------- realtime ---------- */
    let kicked = false;
    const rt = client
      .channel('db-' + C)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `circle_id=eq.${C}` }, (p) => p.new && applyDoc(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members', filter: `circle_id=eq.${C}` }, (p) => {
        if (p.new && p.new.circle_id && p.new.circle_id !== C) return;
        if (p.eventType === 'DELETE') {
          if (p.old && p.old.circle_id && p.old.circle_id !== C) return;
          const uid = p.old && p.old.user_id;
          if (uid === me && !kicked) {
            kicked = true;
            P.onKicked && P.onKicked();
            return;
          }
          if (uid) st.roles.delete(uid);
          touch('members');
          touch('shelf');
        } else if (p.new) {
          const isNew = !st.roles.has(p.new.user_id);
          const changedMine = p.new.user_id === me && st.roles.get(me) !== p.new.role;
          st.roles.set(p.new.user_id, p.new.role);
          if (changedMine && P.onRoleChange) P.onRoleChange((st.roleSent = p.new.role));
          if (isNew) fetchPeopleAndBooks().catch(() => {});
          touch('members');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => p.new && applyProfile(p.new, st.profiles, 'members'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelves' }, (p) => p.new && applyShelf(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelf_books' }, (p) => p.new && p.new.user_id && queueBook(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'circles', filter: `id=eq.${C}` }, (p) => {
        if (p.new) {
          st.circle = Object.assign({}, st.circle, p.new);
          touch('meta');
        }
      });
    let rtFirst = true;
    rt.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (!rtFirst) P.resync();
        rtFirst = false;
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ready) {
        deltaSync().catch(() => {});
        fetchBooks().catch(() => {});
      }
    });
    window.addEventListener('online', () => ready && P.resync());

    // First load: with a cache we show it at once and refresh in the background; without one we wait.
    const first = Promise.all([fetchCircle(), fetchPeopleAndBooks(), deltaSync()]);
    const hasCache = !!(cached && cached.v === 1 && cached.me === me);
    if (hasCache) {
      first
        .then(() => touch('*'))
        .catch((e) => {
          if (e && e.code === 'revoked' && P.onKicked) P.onKicked();
          else console.warn('background refresh', e);
        });
    } else {
      try {
        await first;
      } catch (e) {
        if (e && e.code === 'revoked') throw e;
        throw mapErr(e);
      }
    }
    ready = true;
    touch('*');
    maybeMigrate();

    /* ---------- writes (optimistic, one at a time per document) ---------- */
    const role = () => st.roles.get(me);

    /* ---------- my shelf: one row per book ---------- */

    /* Optimistic: rows show at once; sent in batches; a failed batch and the ones after it are put back
       (earlier batches are saved). ups = [{id, data (frozen) | null, deleted}] */
    async function pushRows(ups) {
      if (!ups.length) return;
      let m = st.books.get(me);
      if (!m) st.books.set(me, (m = new Map()));
      const prev = new Map(ups.map((u) => [u.id, m.get(u.id)]));
      for (const u of ups) {
        const p = prev.get(u.id);
        m.set(u.id, { data: u.deleted ? null : u.data, at: p ? p.at : null, deleted: u.deleted });
      }
      views.delete(me);
      touch('shelf');
      const batches = [];
      let cur = [], chars = 0;
      for (const u of ups) {
        const row = { user_id: me, id: u.id, data: u.deleted ? {} : u.data, deleted: u.deleted };
        const n = u.deleted ? 80 : JSON.stringify(row).length;
        if (cur.length && (cur.length >= BOOK_BATCH || chars + n > BOOK_BATCH_CHARS)) {
          batches.push(cur);
          cur = [];
          chars = 0;
        }
        cur.push(row);
        chars += n;
      }
      if (cur.length) batches.push(cur);
      for (let i = 0; i < batches.length; i++) {
        const { data: back, error } = await client.from('shelf_books').upsert(batches[i], { onConflict: 'user_id,id' }).select('id, updated_at');
        if (error) {
          for (const b of batches.slice(i)) for (const r of b) {
            const p = prev.get(r.id);
            if (p) m.set(r.id, p);
            else m.delete(r.id);
          }
          views.delete(me);
          touch('shelf');
          throw mapErr(error);
        }
        for (const r of back || []) {
          const e = m.get(r.id);
          if (e && (!e.at || e.at < r.updated_at)) e.at = r.updated_at;
        }
      }
    }
    /* The shelves row (everything but the books). With `ifAt`, only if nobody wrote it since we read it
       (an older app version may have just written items there): then it is left alone and read again. */
    async function saveShelfRow(data, ifAt) {
      const prev = st.shelves.get(me);
      views.delete(me);
      st.shelves.set(me, { data: freeze(data), at: prev && prev.at });
      touch('shelf');
      const q = ifAt
        ? client.from('shelves').update({ data }).eq('user_id', me).eq('updated_at', ifAt).select('user_id, data, updated_at')
        : client.from('shelves').upsert({ user_id: me, data }).select('user_id, data, updated_at');
      const { data: rows, error } = await q;
      if (error || !rows || !rows.length) {
        views.delete(me);
        if (prev) st.shelves.set(me, prev);
        else st.shelves.delete(me);
        touch('shelf');
        if (error) throw mapErr(error);
        fetchPeople().catch(() => {});
        return;
      }
      applyShelf(rows[0]);
    }

    async function writeShelf(body) {
      if (booksMissing) {
        // Not migrated yet: the whole shelf is one row, as before.
        const data = freeze(clone(body));
        const prev = st.shelves.get(me);
        views.delete(me);
        st.shelves.set(me, { data, at: prev && prev.at });
        touch('shelf');
        const { data: row, error } = await client.from('shelves').upsert({ user_id: me, data }).select('user_id, data, updated_at').single();
        if (error) {
          views.delete(me);
          if (prev) st.shelves.set(me, prev);
          else st.shelves.delete(me);
          touch('shelf');
          throw mapErr(error);
        }
        applyShelf(row);
        return;
      }
      const leg = st.shelves.get(me);
      const L0 = legacyOf(leg);
      const hasItems = Object.prototype.hasOwnProperty.call(body, 'items');
      // Keys other than items are merged into what is there (a write about books never drops e.g. the
      // Goodreads link); a key set to null is removed.
      const { items: nextItems, ...given } = body;
      const other = Object.assign({}, L0.other, given);
      for (const k of Object.keys(other)) if (other[k] === null) delete other[k];
      if (hasItems && !isObj(nextItems)) throw err('invalid_argument', 'items must be an object');
      const view = shelfView(me);
      const cur = (view && view.items) || {};
      const rows = st.books.get(me) || new Map();
      // Once my rows are known, legacy items are moved into rows by this write (never before: a stale
      // legacy copy must not overwrite a newer row).
      const migrate = booksReady;
      const ups = [];
      // The old one-row copy stays as it is for a while (KEEP_LEGACY): app versions from before rows read
      // only that, and should see a shelf, not an empty one. Rows win over it; a deleted row hides it.
      const keepLegacy = {}; // items that cannot be rows (odd ids) stay in shelves.data.items
      if (!migrate || KEEP_LEGACY) for (const id of Object.keys(L0.items)) if (rowable(id, L0.items[id])) keepLegacy[id] = L0.items[id];
      if (hasItems) {
        for (const id of Object.keys(nextItems)) {
          const v = nextItems[id];
          if (!rowable(id, v)) {
            keepLegacy[id] = v;
            continue;
          }
          const c = cur[id];
          const live = rows.get(id);
          const legacyOnly = !(live && !live.deleted) && Object.prototype.hasOwnProperty.call(L0.items, id);
          const same = c !== undefined && (v === c || JSON.stringify(v) === JSON.stringify(c));
          if (same && !(migrate && legacyOnly)) continue;
          const data = same ? c : freeze(clone(v));
          if (utf8Len(JSON.stringify(data)) > BOOK_MAX_BYTES) {
            if (!same) throw err('too_large', 'a shelf item is too large');
            keepLegacy[id] = v; // an old oversized item: it stays where it is
            continue;
          }
          ups.push({ id, data, deleted: false });
        }
        for (const id of Object.keys(cur)) if (!Object.prototype.hasOwnProperty.call(nextItems, id) && BOOK_ID.test(id)) ups.push({ id, data: null, deleted: true });
      } else for (const id of Object.keys(L0.items)) if (!rowable(id, L0.items[id])) keepLegacy[id] = L0.items[id];
      await pushRows(ups);
      const data = Object.assign({}, other, Object.keys(keepLegacy).length ? { items: keepLegacy } : {});
      const otherChanged = JSON.stringify(other) !== JSON.stringify(L0.other);
      const legacyChanged = JSON.stringify(keepLegacy) !== JSON.stringify(L0.items);
      if (!otherChanged && !legacyChanged) return;
      if (!leg && !Object.keys(data).length) return;
      await saveShelfRow(data, !otherChanged && leg && leg.at ? leg.at : null);
    }

    /* Move my legacy shelves.data.items into rows. Repeatable: an older app version on another phone may
       write items there again; the newer copy of a book wins (by its updatedAt / at), a book deleted after
       that copy was made stays deleted. Then items are cleared from the row, unless it changed meanwhile. */
    /* Until every phone has an app that reads rows, the old one-row shelf is kept next to them (read-only for
       this app, except when an older app writes it). Set to false later to let the move clear it. */
    const KEEP_LEGACY = true;
    function maybeMigrate() {
      if (!ready || !booksReady || booksMissing || migrating) return;
      const L0 = legacyOf(st.shelves.get(me));
      if (!Object.keys(L0.items).some((id) => rowable(id, L0.items[id]))) return;
      migrating = true;
      serial('shelf/' + me, migrateLegacy)
        .catch((e) => console.warn('shelf move', e))
        .finally(() => (migrating = false));
    }
    async function migrateLegacy() {
      const leg = st.shelves.get(me);
      if (!leg || !leg.at || booksMissing) return;
      const L0 = legacyOf(leg);
      const rows = st.books.get(me) || new Map();
      const ups = [];
      const keep = {};
      for (const id of Object.keys(L0.items)) {
        const v = L0.items[id];
        if (!rowable(id, v) || KEEP_LEGACY) keep[id] = v;
        if (!rowable(id, v)) continue;
        const row = rows.get(id);
        const take = !row ? true : row.deleted ? itemTime(v) > (Date.parse(row.at) || 0) : itemTime(v) > itemTime(row.data) && JSON.stringify(v) !== JSON.stringify(row.data);
        if (!take) continue;
        const data = freeze(clone(v));
        if (utf8Len(JSON.stringify(data)) > BOOK_MAX_BYTES) {
          keep[id] = v; // too big for a row: leave it where it is
          continue;
        }
        ups.push({ id, data, deleted: false });
      }
      if (!ups.length && JSON.stringify(keep) === JSON.stringify(L0.items)) return;
      await pushRows(ups);
      if (JSON.stringify(keep) === JSON.stringify(L0.items)) return; // the old copy stays (KEEP_LEGACY)
      await saveShelfRow(Object.assign({}, L0.other, Object.keys(keep).length ? { items: keep } : {}), leg.at);
    }

    async function writeSet(path, body) {
      if (!isObj(body)) throw err('invalid_argument', 'body must be an object');
      const r = route(path);
      if (r.kind === 'shelf') {
        if (r.uid !== me) throw err('invalid_argument', 'not yours');
        return writeShelf(body);
      }
      const data = freeze(clone(body));
      if (r.kind === 'circle') {
        if (!['owner', 'admin'].includes(role())) throw err('invalid_argument', 'only owners and admins');
        const { name, ...settings } = clone(data);
        const prev = Object.assign({}, st.circle);
        st.circle = Object.assign({}, st.circle, { name: name || st.circle.name, settings });
        touch('meta');
        const { data: upd, error: e0 } = await client.from('circles').update({ name: name || prev.name, settings }).eq('id', C).select('id');
        const error = e0 || (!upd || !upd.length ? { code: '42501', message: 'not allowed' } : null);
        if (error) {
          st.circle = prev;
          touch('meta');
          throw mapErr(error);
        }
        return;
      }
      if (r.kind === 'profile' || r.kind === 'shelf') {
        if (r.uid !== me) throw err('invalid_argument', 'not yours');
        const map = r.kind === 'profile' ? st.profiles : st.shelves;
        const col = r.kind === 'profile' ? 'members' : 'shelf';
        const prev = map.get(me);
        map.set(me, { data, at: prev && prev.at });
        touch(col);
        const { data: row, error } = await client.from(r.kind === 'profile' ? 'profiles' : 'shelves').upsert({ user_id: me, data }).select('user_id, data, updated_at').single();
        if (error) {
          if (prev) map.set(me, prev);
          else map.delete(me);
          touch(col);
          throw mapErr(error);
        }
        applyProfile(row, map, col);
        return;
      }
      const k = r.col + '|' + r.id;
      const prev = st.docs.get(k);
      st.docs.set(k, { col: r.col, id: r.id, data, at: prev && prev.at });
      touch(r.col);
      const { data: row, error } = await client.from('docs').upsert({ circle_id: C, col: r.col, id: r.id, data, deleted: false }).select('circle_id, col, id, data, deleted, updated_at').single();
      if (error) {
        if (prev) st.docs.set(k, prev);
        else st.docs.delete(k);
        touch(r.col);
        throw mapErr(error);
      }
      applyDoc(row);
    }
    async function writeUpdate(path, patch) {
      if (!isObj(patch)) throw err('invalid_argument', 'patch must be an object');
      const r = route(path);
      const cur = readDoc(path);
      if (cur === undefined) throw err('invalid_argument', 'document does not exist');
      if (r.kind !== 'doc') return writeSet(path, deepMerge(cur, patch));
      const k = r.col + '|' + r.id;
      const prev = st.docs.get(k);
      st.docs.set(k, { col: r.col, id: r.id, data: freeze(deepMerge(prev.data, patch)), at: prev.at });
      touch(r.col);
      const { data: row, error } = await client.rpc('doc_merge', { p_circle: C, p_col: r.col, p_id: r.id, p_patch: patch });
      if (error) {
        st.docs.set(k, prev);
        touch(r.col);
        throw mapErr(error);
      }
      applyDoc(Array.isArray(row) ? row[0] : row);
    }
    async function writeDelete(path) {
      const r = route(path);
      if (r.kind !== 'doc') throw err('invalid_argument', 'cannot delete this document');
      const k = r.col + '|' + r.id;
      const prev = st.docs.get(k);
      st.docs.delete(k);
      touch(r.col);
      const { data: row, error } = await client.from('docs').upsert({ circle_id: C, col: r.col, id: r.id, data: {}, deleted: true }).select('circle_id, col, id, data, deleted, updated_at').single();
      if (error) {
        if (prev) st.docs.set(k, prev);
        touch(r.col);
        throw mapErr(error);
      }
      applyDoc(row);
    }

    function docRef(path) {
      checkPath(path, true);
      return {
        id: path.split('/').pop(),
        path,
        get: async () => docSnap(path, readDoc(path)),
        set: (body) => serial(path, () => writeSet(path, body)),
        update: (patch) => serial(path, () => writeUpdate(path, patch)),
        delete: () => serial(path, () => writeDelete(path)),
        onSnapshot(next) {
          const l = { kind: 'doc', path, col: route(path).kind === 'circle' ? 'meta' : route(path).kind === 'doc' ? route(path).col : route(path).kind === 'profile' ? 'members' : 'shelf', cb: next, last: undefined };
          listeners.add(l);
          queueMicrotask(() => listeners.has(l) && deliver(l));
          return () => listeners.delete(l);
        },
        collection: (sub) => colRef(path + '/' + sub),
      };
    }
    function query(col, q) {
      const self = {
        where: (f, op, v) => query(col, Object.assign({}, q, { where: q.where.concat([[f, op, v]]) })),
        orderBy: (f, dir = 'asc') => query(col, Object.assign({}, q, { order: [f, dir] })),
        limit: (n) => query(col, Object.assign({}, q, { limit: n })),
        get: async () => {
          let out;
          const l = { kind: 'col', col, q, cb: (s) => (out = s) };
          deliver(l);
          return out;
        },
        onSnapshot(next) {
          const l = { kind: 'col', col, q, cb: next, last: undefined };
          listeners.add(l);
          queueMicrotask(() => listeners.has(l) && deliver(l));
          return () => listeners.delete(l);
        },
      };
      return self;
    }
    function colRef(col) {
      checkPath(col, false);
      return Object.assign(query(col, { where: [], order: null, limit: 0 }), {
        path: col,
        doc: (id) => docRef(col + '/' + (id || A.U.rid(20))),
        add: async (body) => {
          const ref = docRef(col + '/' + A.U.rid(20));
          await ref.set(body);
          return ref;
        },
      });
    }
    const db = Object.freeze({ doc: docRef, collection: colRef });

    /* ---------- people ---------- */
    const color = (uid) => A.U.SPINES[A.U.hash(uid || '') % A.U.SPINES.length][0];
    const nameOf = (uid) => {
      const p = st.profiles.get(uid);
      return (p && p.data && p.data.nick) || '';
    };
    const sess = await P.session();
    const email = sess && sess.user ? sess.user.email : null;
    const user = Object.freeze({
      isOwner: async () => role() === 'owner',
      canEdit: async () => ['owner', 'admin'].includes(role()),
      can: async (name) => (name === 'data.write' || name === 'assets.write' ? st.roles.has(me) : name === 'people.add' ? true : false),
      id: async () => me,
      me: async () => ({ id: me, name: nameOf(me), avatarUrl: '', color: color(me), email, isOwner: role() === 'owner', canEdit: ['owner', 'admin'].includes(role()) }),
      name: async () => nameOf(me),
      avatarUrl: async () => null,
      email: async () => email,
      profiles: async (ids) => {
        const out = {};
        for (const id of [].concat(ids)) out[id] = { id, name: nameOf(id), avatarUrl: '', color: color(id), email: null, isMe: id === me, guest: false };
        return out;
      },
      search: async () => [],
    });
    P.role = (uid) => st.roles.get(uid || me);
    P.circle = () => st.circle;

    /* ---------- files (PDF books) ---------- */
    const bucket = client.storage.from('books');
    const assets = Object.freeze({
      upload: async (blob, opts = {}) => {
        if (!(blob instanceof Blob) || !blob.size) throw err('invalid_request');
        if (blob.size > 50 * 1024 * 1024) throw err('too_large');
        const id = `${C}/${(crypto.randomUUID ? crypto.randomUUID() : A.U.rid(24)).replace(/-/g, '')}.pdf`;
        const { error } = await bucket.upload(id, blob, { contentType: opts.type || blob.type || 'application/pdf', upsert: false, cacheControl: '31536000' });
        if (error) {
          const m = String(error.message || '') + ' ' + String(error.statusCode || '');
          if (/413|too large|exceeded the maximum/i.test(m)) throw err('too_large', error.message);
          if (/quota|storage.*limit/i.test(m)) throw err('quota_or_state', error.message);
          throw err('upstream_error', error.message);
        }
        return { id, url: id, sizeBytes: blob.size, contentType: 'application/pdf' };
      },
      list: async () => {
        const { data } = await client.rpc('circle_storage_bytes', { p_circle: C });
        return { assets: [], usage: { files: 0, bytes: +data || 0, maxFiles: 0, maxBytes: (cfg.storageLimitMB || 1024) * 1048576 } };
      },
      delete: async (id) => {
        const { error } = await bucket.remove([id]);
        if (error) throw err('upstream_error', error.message);
        return { deleted: true };
      },
    });
    P.uploadCover = async (blob) => {
      const path = `${me}/${A.U.rid(16)}.jpg`;
      const covers = client.storage.from('covers');
      const { error } = await covers.upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (error) throw err('upstream_error', error.message);
      return covers.getPublicUrl(path).data.publicUrl;
    };
    P.fetchAsset = async (id, onProg) => {
      const { data, error } = await bucket.createSignedUrl(id, 3600);
      if (error || !data) throw Object.assign(new Error('signed url'), { status: 403 });
      return A.U.fetchBuf(data.signedUrl, onProg);
    };

    /* ---------- presence: who is reading right now ---------- */
    const tabKey = me + ':' + A.U.rid(6);
    let mine = { uid: me };
    let peers = [];
    const peerFns = new Set();
    let joined = false;
    // Private channel: Realtime Authorization (see migrations/…_presence_auth.sql) admits members only.
    const pr = client.channel(`room-${C}-${st.circle.invite_code || ''}`, { config: { private: true, presence: { key: tabKey } } });
    pr.on('presence', { event: 'sync' }, () => {
      const stt = pr.presenceState();
      const now = Date.now();
      peers = Object.entries(stt).map(([key, metas]) => {
        const m = metas[metas.length - 1] || {};
        const { presence_ref, ...presence } = m;
        void presence_ref;
        return Object.freeze({ peer: key, by: m.uid || null, isMe: m.uid === me, sameTab: key === tabKey, kind: 'viewer', guest: false, presence: Object.freeze(presence), updatedAt: now });
      });
      for (const fn of peerFns) fn({ peers, joined: [], left: [], updated: [] });
    });
    pr.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        joined = true;
        pr.track(mine).catch(() => {});
      }
    });
    let trackT = 0;
    const room = Object.freeze({
      presence: async (patch) => {
        const next = Object.assign({}, mine);
        for (const [k, v] of Object.entries(patch || {})) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        mine = next;
        clearTimeout(trackT);
        trackT = setTimeout(() => joined && pr.track(mine).catch(() => {}), 250);
      },
      peers: () => peers,
      onPeers: (fn) => {
        peerFns.add(fn);
        queueMicrotask(() => fn({ peers, joined: peers, left: [], updated: [] }));
        return () => peerFns.delete(fn);
      },
      connected: () => joined,
      onConnection: () => () => {},
      emit: async () => {},
      on: () => () => {},
    });

    /* ---------- downloads ---------- */
    const downloads = Object.freeze({
      save: async ({ filename, data }) => {
        const blob = data instanceof Blob ? data : new Blob([data]);
        if (P.native) {
          const FS = P.plugin('Filesystem');
          const Share = P.plugin('Share');
          if (FS && Share) {
            const b64 = await new Promise((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result).split(',')[1]);
              r.onerror = () => rej(r.error);
              r.readAsDataURL(blob);
            });
            const w = await FS.writeFile({ path: filename, data: b64, directory: 'CACHE' });
            await Share.share({ title: filename, url: w.uri, dialogTitle: filename });
            return { status: 'saved' };
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { status: 'saved' };
      },
    });

    const caps = { db, user, assets, room, downloads };
    window.claude = Object.freeze({ use: (name) => Promise.resolve(caps[name] || null) });
    return st.circle;
  };
})();
