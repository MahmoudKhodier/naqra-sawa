/*
 * TEST ONLY — a stand-in for supabase-js v2 (window.supabase.createClient)
 * that talks to tests/fake-supabase/server.js. It implements the surface
 * the app uses, with supabase-js's result shapes: every call resolves
 * {data, error} (API errors never reject), PostgREST errors are plain
 * {code, message, details, hint} objects, auth/storage errors are Error
 * subclasses with status / statusCode. Query builders are thenables with
 * only `then` (like postgrest-js: no .catch/.finally on builders).
 * Plain script, no modules; served by the e2e harness in place of
 * site/vendor/supabase.js.
 */
(function () {
  'use strict';

  const uuid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });
  const later = (fn) => setTimeout(fn, 0);
  const EXPIRY_MARGIN_MS = 90 * 1000;
  const safe = (fn, ...args) => {
    try {
      fn(...args);
    } catch (e) {
      later(() => {
        throw e;
      });
    }
  };

  class AuthError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = status ? 'AuthApiError' : 'AuthRetryableFetchError';
      this.status = status;
      this.code = code;
      this.__isAuthError = true;
    }
  }
  class StorageError extends Error {
    constructor(message, status, statusCode, name) {
      super(message);
      this.name = name || 'StorageApiError';
      this.status = status;
      this.statusCode = statusCode;
      this.__isStorageError = true;
    }
  }
  const fetchErr = (e) => ({ message: `${(e && e.name) || 'FetchError'}: ${e && e.message}`, details: String((e && e.stack) || ''), hint: '', code: (e && e.code) || '' });

  class Client {
    constructor(url, key, options) {
      if (!url) throw new Error('supabaseUrl is required.');
      if (!key) throw new Error('supabaseKey is required.');
      this.url = String(url).replace(/\/+$/, '');
      this.key = key;
      this.options = options || {};
      const a = this.options.auth || {};
      this.storageKey = a.storageKey || 'sb-' + new URL(this.url).hostname.split('.')[0] + '-auth-token';
      this.persist = a.persistSession !== false;
      this.autoRefresh = a.autoRefreshToken !== false;
      this._listeners = new Map();
      this._session = this._load();
      this._refreshing = null;
      this.auth = this._makeAuth();
      this.realtime = new Realtime(this);
      // like _recoverAndRefresh(): an expiring stored session is refreshed during initialisation
      const s0 = this._session;
      this._init = s0 && this.autoRefresh && s0.expires_at && s0.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS ? this._refresh().then(() => {}, () => {}) : Promise.resolve();
      this.storage = { from: (bucket) => new Bucket(this, bucket) };
      this.__fake = true;
    }

    /* ---------- session ---------- */
    _load() {
      if (!this.persist) return null;
      try {
        const raw = localStorage.getItem(this.storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    _save(s) {
      this._session = s;
      if (!this.persist) return;
      try {
        if (s) localStorage.setItem(this.storageKey, JSON.stringify(s));
        else localStorage.removeItem(this.storageKey);
      } catch (e) {}
    }
    _emit(event, session) {
      this.realtime.setAuth(session ? session.access_token : null);
      for (const cb of this._listeners.values()) safe(cb, event, session);
    }
    _token() {
      return this._session ? this._session.access_token : this.key;
    }
    _headers(extra) {
      return Object.assign({ apikey: this.key, Authorization: 'Bearer ' + this._token(), 'X-Client-Info': 'fake-supabase-js/0' }, extra || {});
    }
    /* Like GoTrueClient.__loadSession: a session within 90 s of expiry is refreshed first; if that
       fails (offline: retried with backoff for up to 30 s) getSession() yields null unless the stored
       token is still valid. A failed refresh is cached for 60 s. Window override for tests only:
       window.__fakeSbRefreshWindowMs. */
    async _fresh() {
      await this._init;
      const s = this._load() || this._session;
      if (!s) return null;
      if (!(s.expires_at && s.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS)) return s;
      const r = await this._refresh();
      if (r.error) {
        const again = this._load();
        if (again && again.expires_at && again.expires_at * 1000 > Date.now()) return again;
        this._lastError = r.error;
        return null;
      }
      return r.session;
    }
    _refresh() {
      if (this._refreshing) return this._refreshing;
      const s = this._load() || this._session;
      if (!s) return Promise.resolve({ session: null, error: new AuthError('Auth session missing!', 400, 'session_missing') });
      const f = this._lastFailure;
      if (f && f.rt === s.refresh_token && Date.now() < f.until) return Promise.resolve(f.result);
      this._refreshing = (async () => {
        const window_ = (typeof window !== 'undefined' && window.__fakeSbRefreshWindowMs) || 30000;
        const started = Date.now();
        for (let n = 0; ; n++) {
          if (n > 0) await new Promise((res) => setTimeout(res, 200 * 2 ** (n - 1)));
          let r;
          try {
            r = await fetch(this.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
          } catch (e) {
            if (Date.now() + 200 * 2 ** n - started < window_) continue;
            const result = { session: null, error: new AuthError(e.message || 'Failed to fetch', 0) };
            this._lastFailure = { rt: s.refresh_token, result, until: Date.now() + 60000 };
            return result;
          }
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            const result = { session: null, error: new AuthError(j.msg || 'refresh failed', r.status, j.error_code) };
            const cur = this._load();
            if (!(cur && cur.expires_at && cur.expires_at * 1000 > Date.now())) {
              this._save(null);
              this._emit('SIGNED_OUT', null);
            }
            this._lastFailure = { rt: s.refresh_token, result, until: Date.now() + 60000 };
            return result;
          }
          this._save(j);
          this._emit('TOKEN_REFRESHED', j);
          return { session: j, error: null };
        }
      })().finally(() => (this._refreshing = null));
      return this._refreshing;
    }

    _makeAuth() {
      const self = this;
      const authFetch = async (pathq, body, method = 'POST', withToken = false) => {
        try {
          const headers = { apikey: self.key, 'Content-Type': 'application/json' };
          if (withToken) headers.Authorization = 'Bearer ' + self._token();
          const r = await fetch(self.url + '/auth/v1/' + pathq, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
          const text = await r.text();
          const j = text ? JSON.parse(text) : {};
          if (!r.ok) return { j: null, error: new AuthError(j.msg || j.message || j.error_description || 'auth error', r.status, j.error_code || j.code) };
          return { j, error: null };
        } catch (e) {
          return { j: null, error: new AuthError(e.message || String(e), 0) };
        }
      };
      return {
        getSession: async () => {
          self._lastError = null;
          const session = await self._fresh();
          return { data: { session }, error: session ? null : self._lastError || null };
        },
        getUser: async () => {
          const { j, error } = await authFetch('user', null, 'GET', true);
          return error ? { data: { user: null }, error } : { data: { user: j }, error: null };
        },
        refreshSession: async () => {
          await self._init;
          const r = await self._refresh();
          return { data: { session: r.session, user: r.session && r.session.user }, error: r.error };
        },
        signInWithOtp: async ({ email, options } = {}) => {
          const o = options || {};
          const q = o.emailRedirectTo ? 'otp?redirect_to=' + encodeURIComponent(o.emailRedirectTo) : 'otp';
          const { error } = await authFetch(q, { email, create_user: o.shouldCreateUser !== false, data: o.data || {} });
          return { data: { user: null, session: null }, error };
        },
        verifyOtp: async ({ email, token, type } = {}) => {
          const { j, error } = await authFetch('verify', { email, token, type: type || 'email' });
          if (error) return { data: { user: null, session: null }, error };
          self._save(j);
          self._emit('SIGNED_IN', j);
          return { data: { user: j.user, session: j }, error: null };
        },
        signOut: async () => {
          if (self._session) await authFetch('logout', {}, 'POST', true);
          self._save(null);
          self._emit('SIGNED_OUT', null);
          return { error: null };
        },
        onAuthStateChange: (cb) => {
          const id = uuid();
          self._listeners.set(id, cb);
          later(() => self._listeners.has(id) && safe(cb, 'INITIAL_SESSION', self._session));
          return { data: { subscription: { id, callback: cb, unsubscribe: () => self._listeners.delete(id) } } };
        },
      };
    }

    /* ---------- data ---------- */
    from(table) {
      return new Query(this, table);
    }
    schema() {
      return this;
    }
    rpc(fn, args, opts) {
      const self = this;
      let p = null;
      const run = async () => {
        await self._fresh();
        try {
          const r = await fetch(`${self.url}/rest/v1/rpc/${encodeURIComponent(fn)}`, { method: 'POST', headers: self._headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(args || {}) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return { data: null, error: j.error || { message: r.statusText, code: String(r.status), details: null, hint: null }, count: null, status: r.status, statusText: r.statusText };
          return { data: j.data === undefined ? null : j.data, error: null, count: null, status: j.status || 200, statusText: 'OK' };
        } catch (e) {
          return { data: null, error: fetchErr(e), count: null, status: 0, statusText: '' };
        }
      };
      void opts;
      return { then: (a, b) => (p = p || run()).then(a, b) };
    }

    /* ---------- realtime ---------- */
    channel(name, opts) {
      return new Channel(this.realtime, name, opts || { config: {} });
    }
    getChannels() {
      return [...this.realtime.channels];
    }
    removeChannel(ch) {
      return ch.unsubscribe();
    }
    removeAllChannels() {
      return Promise.all([...this.realtime.channels].map((c) => c.unsubscribe()));
    }
  }

  /* ===================================================================
   * PostgREST query builder (subset)
   * =================================================================== */
  class Query {
    constructor(client, table) {
      this.c = client;
      this.q = { table, method: 'select', columns: '*', filters: [], order: [], range: null, limit: null, single: null, returning: false };
      this._p = null;
    }
    select(columns, opts) {
      if (this.q.method === 'select') this.q.columns = columns == null ? '*' : columns;
      else {
        this.q.returning = true;
        this.q.columns = columns == null ? '*' : columns;
      }
      if (opts && opts.count) this.q.count = opts.count;
      if (opts && opts.head) this.q.head = true;
      return this;
    }
    insert(body, opts) {
      Object.assign(this.q, { method: 'insert', body, returning: false });
      if (opts && opts.count) this.q.count = opts.count;
      return this;
    }
    upsert(body, opts) {
      const o = opts || {};
      Object.assign(this.q, { method: 'upsert', body, onConflict: o.onConflict || null, ignoreDuplicates: !!o.ignoreDuplicates, returning: false });
      return this;
    }
    update(body) {
      Object.assign(this.q, { method: 'update', body, returning: false });
      return this;
    }
    delete() {
      Object.assign(this.q, { method: 'delete', returning: false });
      return this;
    }
    _f(column, op, value, not) {
      this.q.filters.push({ column, op, value, not: !!not });
      return this;
    }
    eq(c, v) { return this._f(c, 'eq', v); }
    neq(c, v) { return this._f(c, 'neq', v); }
    gt(c, v) { return this._f(c, 'gt', v); }
    gte(c, v) { return this._f(c, 'gte', v); }
    lt(c, v) { return this._f(c, 'lt', v); }
    lte(c, v) { return this._f(c, 'lte', v); }
    like(c, v) { return this._f(c, 'like', v); }
    ilike(c, v) { return this._f(c, 'ilike', v); }
    is(c, v) { return this._f(c, 'is', v); }
    in(c, arr) { return this._f(c, 'in', Array.from(arr || [])); }
    contains(c, v) { return this._f(c, 'cs', v); }
    containedBy(c, v) { return this._f(c, 'cd', v); }
    match(obj) {
      for (const [k, v] of Object.entries(obj || {})) this._f(k, 'eq', v);
      return this;
    }
    not(c, op, v) {
      if (op === 'in' && typeof v === 'string') v = v.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return this._f(c, op, v, true);
    }
    filter(c, op, v) {
      if (op === 'in' && typeof v === 'string') v = v.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return this._f(c, op, v);
    }
    order(column, opts) {
      const o = opts || {};
      this.q.order.push({ column, ascending: o.ascending !== false, nullsFirst: o.nullsFirst });
      return this;
    }
    limit(n) {
      this.q.limit = n;
      return this;
    }
    range(from, to) {
      this.q.range = [from, to];
      return this;
    }
    single() {
      this.q.single = 'single';
      return this;
    }
    maybeSingle() {
      this.q.single = 'maybe';
      return this;
    }
    abortSignal() {
      return this;
    }
    returns() {
      return this;
    }
    async _run() {
      const c = this.c;
      await c._fresh();
      try {
        const r = await fetch(c.url + '/rest/v1/__query', { method: 'POST', headers: c._headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(this.q) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { data: null, error: j.error || { message: j.message || r.statusText, code: String(r.status), details: null, hint: null }, count: null, status: r.status, statusText: r.statusText };
        return { data: j.data === undefined ? null : j.data, error: null, count: j.count == null ? null : j.count, status: j.status || r.status, statusText: 'OK' };
      } catch (e) {
        return { data: null, error: fetchErr(e), count: null, status: 0, statusText: '' };
      }
    }
    then(onOk, onErr) {
      this._p = this._p || this._run();
      return this._p.then(onOk, onErr);
    }
  }

  /* ===================================================================
   * Storage
   * =================================================================== */
  const encPath = (p) => String(p).split('/').map(encodeURIComponent).join('/');
  class Bucket {
    constructor(client, id) {
      this.c = client;
      this.id = id;
      this.base = client.url + '/storage/v1';
    }
    async _call(method, pathq, opts) {
      const c = this.c;
      await c._fresh();
      try {
        const r = await fetch(this.base + pathq, Object.assign({ method, headers: c._headers((opts && opts.headers) || {}) }, opts && opts.body !== undefined ? { body: opts.body } : {}));
        const text = await r.text();
        let j = null;
        try {
          j = text ? JSON.parse(text) : null;
        } catch (e) {}
        if (!r.ok) {
          const sc = (j && (j.statusCode || j.code)) || String(r.status);
          return { j: null, error: new StorageError((j && (j.message || j.error)) || r.statusText, r.status, String(sc)) };
        }
        return { j, error: null };
      } catch (e) {
        return { j: null, error: new StorageError(e.message || String(e), 0, '', 'StorageUnknownError') };
      }
    }
    async upload(path, body, opts) {
      const o = opts || {};
      const type = o.contentType || (body && body.type) || 'text/plain;charset=UTF-8';
      const headers = { 'Content-Type': type, 'x-upsert': String(!!o.upsert), 'cache-control': `max-age=${o.cacheControl || '3600'}` };
      const { j, error } = await this._call('POST', `/object/${encodeURIComponent(this.id)}/${encPath(path)}`, { headers, body });
      if (error) return { data: null, error };
      return { data: { path, id: j.Id, fullPath: j.Key }, error: null };
    }
    async update(path, body, opts) {
      const o = opts || {};
      const headers = { 'Content-Type': o.contentType || (body && body.type) || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': `max-age=${o.cacheControl || '3600'}` };
      const { j, error } = await this._call('PUT', `/object/${encodeURIComponent(this.id)}/${encPath(path)}`, { headers, body });
      if (error) return { data: null, error };
      return { data: { path, id: j.Id, fullPath: j.Key }, error: null };
    }
    async remove(paths) {
      const { j, error } = await this._call('DELETE', `/object/${encodeURIComponent(this.id)}`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths || [] }) });
      return error ? { data: null, error } : { data: j || [], error: null };
    }
    async createSignedUrl(path, expiresIn, opts) {
      const { j, error } = await this._call('POST', `/object/sign/${encodeURIComponent(this.id)}/${encPath(path)}`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn }) });
      if (error) return { data: null, error };
      let signedUrl = this.base + j.signedURL;
      if (opts && opts.download) signedUrl += '&download=' + (opts.download === true ? '' : encodeURIComponent(opts.download));
      return { data: { signedUrl }, error: null };
    }
    getPublicUrl(path) {
      return { data: { publicUrl: `${this.base}/object/public/${encodeURIComponent(this.id)}/${encPath(path)}` } };
    }
    async download(path) {
      const c = this.c;
      await c._fresh();
      try {
        const r = await fetch(`${this.base}/object/authenticated/${encodeURIComponent(this.id)}/${encPath(path)}`, { headers: c._headers() });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          return { data: null, error: new StorageError(j.message || r.statusText, r.status, String(j.statusCode || r.status)) };
        }
        return { data: await r.blob(), error: null };
      } catch (e) {
        return { data: null, error: new StorageError(e.message, 0, '', 'StorageUnknownError') };
      }
    }
  }

  /* ===================================================================
   * Realtime: one WebSocket per client, lazily opened, auto-reconnect.
   * =================================================================== */
  class Realtime {
    constructor(client) {
      this.c = client;
      this.ws = null;
      this.open = false;
      this.channels = new Set();
      this.tries = 0;
      this.timer = 0;
    }
    setAuth(token) {
      if (this.open) this.send({ type: 'auth', token: token || '' });
    }
    connect() {
      if (this.ws || this.timer) return;
      const u = this.c.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(this.c.key) + '&vsn=fake';
      let ws;
      try {
        ws = new WebSocket(u);
      } catch (e) {
        return this._retry();
      }
      this.ws = ws;
      ws.onopen = () => {
        this.open = true;
        this.tries = 0;
        for (const ch of this.channels) if (ch.state !== 'closed') this._join(ch);
      };
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        for (const ch of this.channels) if (ch.ref === m.ref) ch._onMsg(m);
      };
      ws.onclose = () => {
        const was = this.open;
        this.ws = null;
        this.open = false;
        for (const ch of this.channels) {
          if (ch.state === 'joined' || ch.state === 'joining') {
            ch.state = 'errored';
            if (was) ch._status('CHANNEL_ERROR', new Error('realtime socket closed'));
          }
        }
        if (this.channels.size) this._retry();
      };
      ws.onerror = () => {};
    }
    _retry() {
      const delay = [1000, 2000, 5000, 10000][Math.min(this.tries++, 3)];
      this.timer = setTimeout(() => {
        this.timer = 0;
        this.connect();
      }, delay);
    }
    send(m) {
      if (this.ws && this.open) this.ws.send(JSON.stringify(m));
    }
    _join(ch) {
      ch.state = 'joining';
      const bindings = ch.bindings.filter((b) => b.type === 'postgres_changes').map((b) => ({ id: b.id, event: b.filter.event || '*', schema: b.filter.schema || 'public', table: b.filter.table, filter: b.filter.filter || null }));
      const cfg = (ch.opts && ch.opts.config) || {};
      this.send({ type: 'join', topic: ch.topic, ref: ch.ref, token: this.c._session ? this.c._session.access_token : '', bindings, presenceKey: ch.presenceKey, broadcastSelf: !!(cfg.broadcast && cfg.broadcast.self), private: !!cfg.private });
    }
  }

  let bindingSeq = 0;
  class Channel {
    constructor(rt, name, opts) {
      this.rt = rt;
      this.subTopic = name;
      this.topic = 'realtime:' + name;
      this.opts = opts || { config: {} };
      const cfg = this.opts.config || {};
      this.presenceKey = (cfg.presence && cfg.presence.key) || uuid();
      this.bindings = [];
      this.state = 'closed';
      this.ref = uuid();
      this._presence = {};
      this._statusCb = null;
      this._pending = new Map();
      this._tracked = undefined;
      this._mid = 0;
    }
    on(type, filter, cb) {
      this.bindings.push({ id: ++bindingSeq, type: String(type).toLowerCase(), filter: filter || {}, cb });
      return this;
    }
    subscribe(cb) {
      if (this.state !== 'closed') throw new Error('tried to subscribe multiple times. \'subscribe\' can only be called a single time per channel instance');
      this._statusCb = cb || null;
      this.state = 'joining';
      this.rt.channels.add(this);
      if (this.rt.open) this.rt._join(this);
      else this.rt.connect();
      return this;
    }
    _status(s, err) {
      if (this._statusCb) safe(this._statusCb, s, err);
    }
    _onMsg(m) {
      if (m.type === 'joined') {
        this.state = 'joined';
        this._status('SUBSCRIBED');
      } else if (m.type === 'join_error') {
        this.state = 'errored';
        this._status('CHANNEL_ERROR', new Error(m.message));
      } else if (m.type === 'postgres_changes') {
        const ids = new Set(m.ids);
        for (const b of this.bindings) if (b.type === 'postgres_changes' && ids.has(b.id)) safe(b.cb, Object.assign({}, m.data));
      } else if (m.type === 'presence_state') {
        const prev = this._presence;
        const next = m.state || {};
        this._presence = next;
        const refs = (list) => new Set((list || []).map((x) => x.presence_ref));
        for (const key of Object.keys(next)) {
          const old = refs(prev[key]);
          const joined = next[key].filter((x) => !old.has(x.presence_ref));
          if (joined.length) for (const b of this.bindings) if (b.type === 'presence' && b.filter.event === 'join') safe(b.cb, { key, currentPresences: prev[key] || [], newPresences: joined });
        }
        for (const key of Object.keys(prev)) {
          const now = refs(next[key]);
          const left = prev[key].filter((x) => !now.has(x.presence_ref));
          if (left.length) for (const b of this.bindings) if (b.type === 'presence' && b.filter.event === 'leave') safe(b.cb, { key, currentPresences: next[key] || [], leftPresences: left });
        }
        for (const b of this.bindings) if (b.type === 'presence' && b.filter.event === 'sync') safe(b.cb);
      } else if (m.type === 'broadcast') {
        for (const b of this.bindings) if (b.type === 'broadcast' && (b.filter.event === m.event || b.filter.event === '*')) safe(b.cb, { type: 'broadcast', event: m.event, payload: m.payload });
      } else if (m.type === 'track_ok' || m.type === 'broadcast_ok' || m.type === 'track_error') {
        const r = this._pending.get(m.id);
        if (r) {
          this._pending.delete(m.id);
          r(m.type === 'track_error' ? 'error' : 'ok');
        }
      }
    }
    _push(m, timeout = 10000) {
      return new Promise((resolve) => {
        const send = () => {
          const id = ++this._mid;
          this._pending.set(id, resolve);
          this.rt.send(Object.assign({ topic: this.topic, ref: this.ref, id }, m));
          setTimeout(() => this._pending.has(id) && (this._pending.delete(id), resolve('timed out')), timeout);
        };
        if (this.state === 'joined' && this.rt.open) send();
        else {
          // buffered until joined, like supabase-js
          const t0 = Date.now();
          const wait = () => (this.state === 'joined' && this.rt.open ? send() : Date.now() - t0 > timeout || this.state === 'closed' ? resolve('timed out') : setTimeout(wait, 50));
          wait();
        }
      });
    }
    track(payload) {
      this._tracked = payload;
      return this._push({ type: 'track', payload });
    }
    untrack() {
      this._tracked = undefined;
      return this._push({ type: 'untrack' });
    }
    send(m) {
      if (!m || m.type !== 'broadcast') return Promise.resolve('error');
      return this._push({ type: 'broadcast', event: m.event, payload: m.payload });
    }
    presenceState() {
      return JSON.parse(JSON.stringify(this._presence));
    }
    unsubscribe() {
      if (this.state !== 'closed') {
        this.rt.send({ type: 'leave', topic: this.topic, ref: this.ref });
        this.state = 'closed';
        this._status('CLOSED');
      }
      this.rt.channels.delete(this);
      return Promise.resolve('ok');
    }
  }

  window.supabase = { createClient: (url, key, options) => new Client(url, key, options), __fake: true };
})();
