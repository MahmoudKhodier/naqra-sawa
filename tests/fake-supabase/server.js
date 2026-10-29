#!/usr/bin/env node
/*
 * Fake Supabase for end-to-end tests — TEST ONLY, never deploy.
 *
 * A real, throwaway PostgreSQL 16 cluster with the Supabase stubs
 * (tests/sql/supabase_stubs.sql), the project's real migration(s)
 * (supabase/migrations/*.sql) and test-only NOTIFY triggers (realtime.sql),
 * plus an HTTP/WebSocket server that client.js (a stand-in for supabase-js
 * v2 in the browser) talks to:
 *
 *   POST /rest/v1/__query          PostgREST-like select/insert/upsert/update/delete (JSON plan);
 *                                  a select returns at most opts.maxRows rows (default 1000, like Supabase's max-rows)
 *   POST /rest/v1/rpc/<fn>         call public.<fn>(name => value, ...)
 *   POST /auth/v1/otp              "send" an email code (logged, see /__test/otp)
 *   POST /auth/v1/verify           code 123456 → session (creates auth.users row)
 *   POST /auth/v1/token?grant_type=refresh_token, POST /auth/v1/logout, GET /auth/v1/user
 *   POST|PUT /storage/v1/object/<bucket>/<path>     upload (RLS on storage.objects decides)
 *   DELETE   /storage/v1/object/<bucket>            remove {prefixes}
 *   POST     /storage/v1/object/sign/<bucket>/<path> signed URL; GET it with ?token=
 *   GET      /storage/v1/object/public/<bucket>/<path>, GET /storage/v1/object/authenticated/<bucket>/<path>
 *   WS       /realtime/v1/websocket  postgres_changes (RLS re-checked per subscriber), presence, broadcast;
 *            private channels ({config: {private: true}}) are authorised like Realtime Authorization:
 *            RLS on realtime.messages (select = receive, insert = track/send) with realtime.topic();
 *            public channels are open to any client with the anon key (opts.realtimePublicAccess, default true)
 *   GET /__test/otp, POST /__test/sql {sql, params} (superuser; assertions only)
 *
 * Every data request runs in its own transaction as the caller, exactly
 * like PostgREST: set_config('role', 'authenticated'|'anon', true) and the
 * request.jwt.claims / request.jwt.claim.sub GUCs, so RLS and auth.uid()
 * behave as on Supabase. Identifiers are whitelisted against the live
 * catalog; values are always bound parameters.
 *
 *   node tests/fake-supabase/server.js            # boots Postgres + server on :54321, Ctrl-C stops
 *   PORT=0 KEEP_PG=1 node tests/fake-supabase/server.js
 *
 *   const F = require('./server');
 *   const pgc = await F.startPostgres();          // {host, port, dir, stop()}
 *   const srv = await F.startServer({ pg: pgc }); // {url, anonKey, stop(), sql(q, params), otpLog}
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');
const pg = require('pg');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..', '..');
const PG_BIN = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
const STUBS = path.join(ROOT, 'tests', 'sql', 'supabase_stubs.sql');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const REALTIME_SQL = path.join(__dirname, 'realtime.sql');
const REALTIME_STUBS = path.join(__dirname, 'realtime-stubs.sql');

// Parse timestamps etc. as strings? No: we build JSON in SQL (to_jsonb), so
// values arrive inside jsonb and keep PostgREST's text formats.

/* =====================================================================
 * Postgres cluster
 * ===================================================================== */

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} ${args.join(' ')} exited ${code}\n${out}`))));
  });
}

function osUser(name) {
  try {
    const uid = +execFileSync('id', ['-u', name]).toString().trim();
    const gid = +execFileSync('id', ['-g', name]).toString().trim();
    return { uid, gid };
  } catch (e) {
    return null;
  }
}

function chownR(p, uid, gid) {
  fs.chownSync(p, uid, gid);
  if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) chownR(path.join(p, f), uid, gid);
}

/**
 * initdb a fresh cluster (as an unprivileged OS user when running as root),
 * start it on a private unix socket, apply stubs → migrations → realtime.sql.
 * Resolves {host (socket dir), port, dir, log, stop()}.
 */
async function startPostgres(opts = {}) {
  const base = fs.mkdtempSync(path.join(opts.tmpDir || process.env.TMPDIR || os.tmpdir(), 'naqra-fake-'));
  const data = path.join(base, 'data');
  const sock = path.join(base, 'sock');
  const log = path.join(base, 'server.log');
  fs.mkdirSync(sock);
  const port = opts.port || 5432; // unix socket only, in a private dir: never clashes
  const asRoot = process.getuid && process.getuid() === 0;
  let ids = {};
  if (asRoot) {
    let u = osUser(opts.osUser || process.env.PG_OS_USER || 'postgres');
    if (!u) {
      spawnSync('useradd', ['--system', '--no-create-home', '--shell', '/usr/sbin/nologin', 'pgtest']);
      u = osUser('pgtest');
    }
    if (!u) throw new Error('need an unprivileged OS user to run postgres (set PG_OS_USER)');
    ids = u;
    chownR(base, u.uid, u.gid);
  }
  fs.chmodSync(base, 0o755);
  const asPg = (bin, args) => run(path.join(PG_BIN, bin), args, asRoot ? { uid: ids.uid, gid: ids.gid, cwd: base } : { cwd: base });

  await asPg('initdb', ['-D', data, '-U', 'supabase_admin', '-A', 'trust', '-E', 'UTF8', '--locale=C', '-N']);
  fs.appendFileSync(
    path.join(data, 'postgresql.conf'),
    `\nlisten_addresses = ''\nunix_socket_directories = '${sock}'\nport = ${port}\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n` +
      `timezone = 'UTC'\nlog_timezone = 'UTC'\nmax_connections = 200\nlog_min_messages = warning\n`
  );
  await asPg('pg_ctl', ['-D', data, '-l', log, '-w', 'start']);

  let stopped = false;
  const stopSync = () => {
    if (stopped) return;
    stopped = true;
    if (!opts.keep) {
      spawnSync(path.join(PG_BIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], asRoot ? { uid: ids.uid, gid: ids.gid, stdio: 'ignore' } : { stdio: 'ignore' });
      fs.rmSync(base, { recursive: true, force: true });
    }
  };
  process.on('exit', stopSync);

  const psql = (user, file, extra = []) =>
    run(path.join(PG_BIN, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', sock, '-p', String(port), '-U', user, '-d', 'postgres', ...extra, '-f', file], {
      env: Object.assign({}, process.env, { PSQLRC: '/dev/null', PGOPTIONS: '--client-min-messages=warning' }),
    });
  try {
    await psql('supabase_admin', STUBS);
    await psql('supabase_admin', REALTIME_STUBS);
    const migs = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    if (!migs.length) throw new Error('no migrations in ' + MIGRATIONS);
    for (const m of migs) await psql('postgres', path.join(MIGRATIONS, m), ['--single-transaction']);
    await psql('supabase_admin', REALTIME_SQL);
  } catch (e) {
    stopSync();
    throw e;
  }
  return {
    host: sock,
    port,
    dir: base,
    log,
    stop: async () => stopSync(),
  };
}

/* =====================================================================
 * Small helpers
 * ===================================================================== */

const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const ql = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

class ApiError extends Error {
  constructor(status, body) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}
const pgrst = (status, code, message, details = null, hint = null) => new ApiError(status, { code, message, details, hint });

function pgErrStatus(code, authed) {
  if (!code) return 500;
  if (code === '42501') return authed ? 403 : 401;
  if (code === '23505' || code === '23503') return 409;
  if (code === '42883' || code === '42P01') return 404;
  if (code === 'P0001') return 400;
  if (/^(08|53)/.test(code)) return 503;
  if (/^54/.test(code)) return 413;
  if (/^(09|25|2D|38|39|3B|40|55|57|58|F0|HV|XX|P0)/.test(code)) return 500;
  if (/^(0L|0P|28)/.test(code)) return 403;
  return 400;
}
const fromPgErr = (e, authed) =>
  new ApiError(pgErrStatus(e.code, authed), { code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null });

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(pgrst(413, 'PGRST413', 'Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const b = await readBody(req);
  if (!b.length) return {};
  try {
    return JSON.parse(b.toString('utf8'));
  } catch (e) {
    throw pgrst(400, 'PGRST102', 'Empty or invalid json');
  }
}

/* =====================================================================
 * The server
 * ===================================================================== */

async function startServer(opts = {}) {
  const pgc = opts.pg;
  if (!pgc) throw new Error('startServer needs {pg} from startPostgres()');
  const anonKey = opts.anonKey || 'test-anon';
  const publicChannels = opts.realtimePublicAccess !== undefined ? !!opts.realtimePublicAccess : process.env.FAKE_RT_PUBLIC !== '0';
  const otpCode = opts.otpCode || '123456';
  const quiet = opts.quiet !== undefined ? opts.quiet : !process.env.FAKE_LOG;
  const storageDir = opts.storageDir || path.join(pgc.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'naqra-st-')), 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  const secret = crypto.randomBytes(32);
  const conn = { host: pgc.host, port: pgc.port, database: 'postgres' };
  const api = new pg.Pool(Object.assign({ user: 'authenticator', max: 30 }, conn));
  const admin = new pg.Pool(Object.assign({ user: 'supabase_admin', max: 6 }, conn));
  api.on('error', () => {});
  admin.on('error', () => {});
  const log = (...a) => !quiet && console.log('[fake-supabase]', ...a);
  const stats = { rest: 0, rpc: 0, storage: 0, realtimeSent: 0, realtimeDropped: 0 };
  const queries = []; // last 1000 REST/RPC calls, for assertions: {at, uid, kind, table|fn, method, filters, order, range}
  const remember = (q) => {
    queries.push(Object.assign({ at: new Date().toISOString() }, q));
    if (queries.length > 1000) queries.splice(0, queries.length - 1000);
  };

  /* ---------------- schema cache ---------------- */
  const schema = { tables: new Map(), fks: [], fns: new Map(), published: new Set(), authUserCols: new Set() };
  async function loadSchema() {
    const cols = await admin.query(`
      select c.relname as t, a.attname as c, format_type(a.atttypid, a.atttypmod) as type, a.attnum
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'p', 'm') and a.attnum > 0 and not a.attisdropped
       order by c.relname, a.attnum`);
    schema.tables.clear();
    for (const r of cols.rows) {
      if (!schema.tables.has(r.t)) schema.tables.set(r.t, { name: r.t, cols: new Map(), pk: [] });
      schema.tables.get(r.t).cols.set(r.c, r.type);
    }
    const cons = await admin.query(`
      select con.contype, con.conname, c.relname as t, f.relname as ft, fn.nspname as fschema,
             array(select a.attname from unnest(con.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o)::text[] as cols,
             array(select a.attname from unnest(con.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o)::text[] as fcols
        from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
        left join pg_class f on f.oid = con.confrelid left join pg_namespace fn on fn.oid = f.relnamespace
       where n.nspname = 'public' and con.contype in ('p', 'f')`);
    schema.fks = [];
    for (const r of cons.rows) {
      const t = schema.tables.get(r.t);
      if (!t) continue;
      if (r.contype === 'p') t.pk = r.cols;
      else if (r.fschema === 'public' && schema.tables.has(r.ft)) schema.fks.push({ name: r.conname, table: r.t, cols: r.cols, ref: r.ft, refCols: r.fcols });
    }
    const fns = await admin.query(`
      select p.proname as name, coalesce(p.proargnames, '{}') as argnames, p.proargmodes as modes,
             array(select format_type(x, null) from unnest(p.proargtypes::oid[]) x)::text[] as argtypes,
             p.pronargs as nargs, p.pronargdefaults as ndefaults, p.proretset as retset,
             format_type(p.prorettype, null) as rettype, t.typtype as rettyptype
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
       where n.nspname = 'public' and p.prokind = 'f'`);
    schema.fns.clear();
    for (const r of fns.rows) {
      if (r.rettype === 'trigger') continue;
      if (r.modes && r.modes.some((m) => m !== 'i')) continue; // OUT/INOUT/VARIADIC: not needed here
      const names = r.argnames.slice(0, r.nargs);
      if (names.some((n) => !n)) continue; // PostgREST needs named args
      const list = schema.fns.get(r.name) || [];
      list.push({ name: r.name, args: names.map((n, i) => ({ name: n, type: r.argtypes[i], optional: i >= r.nargs - r.ndefaults })), retset: r.retset, rettype: r.rettype, rettyptype: r.rettyptype });
      schema.fns.set(r.name, list);
    }
    const pub = await admin.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`);
    schema.published = new Set(pub.rows.map((r) => r.tablename));
    const au = await admin.query(`select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'`);
    schema.authUserCols = new Set(au.rows.map((r) => r.column_name));
  }
  await loadSchema();

  const tableOf = (name) => {
    const t = typeof name === 'string' && schema.tables.get(name);
    if (!t) throw pgrst(404, 'PGRST205', `Could not find the table 'public.${name}' in the schema cache`);
    return t;
  };
  const checkCol = (t, c) => {
    if (typeof c !== 'string' || !t.cols.has(c)) throw pgrst(400, '42703', `column ${t.name}.${c} does not exist`);
    return qi(c);
  };

  /* ---------------- auth: users, tokens ---------------- */
  const otpLog = []; // {email, at}
  const tokens = new Map(); // access token -> {uid, email, exp, rt}
  const refresh = new Map(); // refresh token -> {uid, email}
  const rand = (n = 24) => crypto.randomBytes(n).toString('base64url');

  async function ensureUser(email) {
    const found = await admin.query('select id::text as id, email from auth.users where lower(email) = lower($1) order by id limit 1', [email]);
    if (found.rows[0]) return { id: found.rows[0].id, email: found.rows[0].email, created: false };
    const id = crypto.randomUUID();
    const cols = ['id', 'email'];
    const vals = [id, email];
    const extra = { aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), raw_app_meta_data: { provider: 'email', providers: ['email'] }, raw_user_meta_data: {} };
    for (const [k, v] of Object.entries(extra)) if (schema.authUserCols.has(k)) cols.push(k) && vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
    await admin.query(`insert into auth.users (${cols.map(qi).join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
    return { id, email, created: true };
  }
  function userJson(u) {
    return { id: u.uid || u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-01-01T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: new Date().toISOString(), is_anonymous: false };
  }
  function newSession(uid, email) {
    const at = 'fake-at-' + rand();
    const rt = 'fake-rt-' + rand(16);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    tokens.set(at, { uid, email, exp, rt });
    refresh.set(rt, { uid, email });
    return { access_token: at, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson({ uid, email }) };
  }

  /** {role, uid, email, claims, authed} for a request; throws 401 for a bad key/token. */
  function contextOf(req, url) {
    const key = req.headers.apikey || (url && url.searchParams.get('apikey'));
    if (key !== anonKey) throw new ApiError(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    const auth = String(req.headers.authorization || '');
    const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return contextOfToken(tok);
  }
  function contextOfToken(tok) {
    if (!tok || tok === anonKey) return { role: 'anon', uid: null, email: null, claims: { role: 'anon', iss: 'supabase' }, authed: false };
    const s = tokens.get(tok);
    if (!s || s.exp * 1000 < Date.now()) throw pgrst(401, 'PGRST303', 'JWT expired');
    return { role: 'authenticated', uid: s.uid, email: s.email, claims: { sub: s.uid, email: s.email, role: 'authenticated', aud: 'authenticated', exp: s.exp }, authed: true, token: tok };
  }

  /** Run fn(client) in one transaction as the caller, PostgREST-style. */
  async function asCaller(ctx, fn) {
    const c = await api.connect();
    let broken = false;
    try {
      await c.query('begin');
      await c.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true), set_config('request.jwt.claim.role', $1, true), set_config('request.method', $4, true)`, [ctx.role, JSON.stringify(ctx.claims), ctx.uid || '', ctx.method || 'POST']);
      const out = await fn(c);
      await c.query(out && out.rollback ? 'rollback' : 'commit');
      return out;
    } catch (e) {
      try {
        await c.query('rollback');
      } catch (e2) {
        broken = true;
      }
      throw e;
    } finally {
      c.release(broken);
    }
  }

  /* ---------------- PostgREST-like translator ---------------- */
  function parseSelect(src) {
    let s = '';
    let quoted = false;
    for (const ch of String(src == null || src === '' ? '*' : src)) {
      if (ch === '"') quoted = !quoted;
      if (!/\s/.test(ch) || quoted) s += ch;
    }
    let i = 0;
    const bad = (m) => pgrst(400, 'PGRST100', `"failed to parse select parameter (${src})"`, m || `unexpected "${s[i] || 'end of input'}" at position ${i}`);
    const ident = () => {
      const m = /^(\*|[A-Za-z_][A-Za-z0-9_]*)/.exec(s.slice(i));
      if (!m) throw bad();
      i += m[0].length;
      return m[0];
    };
    function list(end) {
      const items = [];
      for (;;) {
        items.push(item());
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === end || (end === undefined && i >= s.length)) return items;
        throw bad();
      }
    }
    function item() {
      let name = ident();
      let alias = null;
      if (s[i] === ':' && s[i + 1] !== ':') {
        alias = name;
        i++;
        name = ident();
      }
      let hint = null;
      let inner = false;
      while (s[i] === '!') {
        i++;
        const h = ident();
        if (h === 'inner') inner = true;
        else if (h !== 'left') hint = h;
      }
      if (s[i] === '(') {
        i++;
        const children = s[i] === ')' ? [] : list(')');
        i++;
        return { type: 'embed', name, alias, hint, inner, children };
      }
      let cast = null;
      if (s[i] === ':' && s[i + 1] === ':') {
        i += 2;
        cast = ident();
      }
      if (name === '*') return { type: 'star' };
      return { type: 'col', name, alias, cast };
    }
    const out = list(undefined);
    if (i < s.length) throw bad();
    return out;
  }
  const CASTS = new Set(['text', 'int', 'integer', 'bigint', 'numeric', 'boolean', 'json', 'jsonb', 'uuid', 'date', 'timestamptz']);

  function relation(base, name, hint) {
    let cands = [];
    for (const fk of schema.fks) {
      if (fk.table === base.name && fk.ref === name) cands.push({ fk, many: false, target: fk.ref, on: fk.cols.map((c, k) => [fk.refCols[k], c]) });
      if (fk.ref === base.name && fk.table === name) cands.push({ fk, many: true, target: fk.table, on: fk.cols.map((c, k) => [c, fk.refCols[k]]) });
    }
    if (!cands.length) {
      // embedding by FK column or constraint name (e.g. circles!circle_members_circle_id_fkey)
      for (const fk of schema.fks) if (fk.table === base.name && (fk.name === name || (fk.cols.length === 1 && fk.cols[0] === name))) cands.push({ fk, many: false, target: fk.ref, on: fk.cols.map((c, k) => [fk.refCols[k], c]) });
    }
    if (hint) cands = cands.filter((c) => c.fk.name === hint || c.fk.cols.join(',') === hint);
    if (!cands.length) throw pgrst(400, 'PGRST200', `Could not find a relationship between '${base.name}' and '${name}' in the schema cache`, null, 'Perhaps you meant a different table or check the foreign keys.');
    if (cands.length > 1) throw pgrst(300, 'PGRST201', `Could not embed because more than one relationship was found for '${base.name}' and '${name}'`);
    return cands[0];
  }

  /** SQL jsonb expression for one row of `t` aliased `alias`. Pushes `inner` conditions. */
  function rowExpr(t, alias, items, st) {
    const parts = [];
    const pairs = [];
    for (const it of items) {
      if (it.type === 'star') parts.push(`to_jsonb(${alias})`);
      else if (it.type === 'col') {
        let e = `${alias}.${checkCol(t, it.name)}`;
        if (it.cast) {
          if (!CASTS.has(it.cast)) throw pgrst(400, 'PGRST100', `unsupported cast ${it.cast}`);
          e += '::' + it.cast;
        }
        const key = it.alias || it.name;
        if (!IDENT.test(key)) throw pgrst(400, 'PGRST100', 'bad alias ' + key);
        pairs.push([key, e]);
      } else {
        const rel = relation(t, it.name, it.hint);
        const tt = tableOf(rel.target);
        const a2 = 't' + ++st.n;
        const sub = rowExpr(tt, a2, it.children.length ? it.children : [{ type: 'star' }], st);
        const cond = rel.on.map(([tc, bc]) => `${a2}.${qi(tc)} = ${alias}.${qi(bc)}`).join(' and ');
        const from = `public.${qi(tt.name)} ${a2} where ${cond}`;
        const e = rel.many ? `(select coalesce(jsonb_agg(${sub}), '[]'::jsonb) from ${from})` : `(select ${sub} from ${from})`;
        if (it.inner) st.inner.push(`exists (select 1 from ${from})`);
        const key = it.alias || it.name;
        if (!IDENT.test(key)) throw pgrst(400, 'PGRST100', 'bad alias ' + key);
        pairs.push([key, e]);
      }
    }
    for (let k = 0; k < pairs.length; k += 50) parts.push(`jsonb_build_object(${pairs.slice(k, k + 50).map(([key, e]) => `${ql(key)}, ${e}`).join(', ')})`);
    return parts.length ? parts.join(' || ') : `'{}'::jsonb`;
  }

  const toParam = (v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike', match: '~', imatch: '~*' };

  function whereSql(t, alias, filters, params) {
    const out = [];
    for (const f of filters || []) {
      const col = `${alias}.${checkCol(t, f.column)}`;
      let sql;
      if (OPS[f.op]) {
        let v = toParam(f.value);
        if ((f.op === 'like' || f.op === 'ilike') && v != null) v = v.replace(/\*/g, '%');
        params.push(v);
        sql = `${col} ${OPS[f.op]} $${params.length}`;
      } else if (f.op === 'is') {
        const v = f.value === null ? 'null' : String(f.value).toLowerCase();
        if (!['null', 'true', 'false', 'unknown'].includes(v)) throw pgrst(400, 'PGRST100', `"failed to parse filter (is.${f.value})"`);
        sql = `${col} is ${v}`;
      } else if (f.op === 'in') {
        if (!Array.isArray(f.value)) throw pgrst(400, 'PGRST100', '"failed to parse filter (in)"');
        params.push(f.value.map(toParam));
        sql = `${col} = any($${params.length})`;
      } else if (f.op === 'cs' || f.op === 'cd') {
        params.push(JSON.stringify(f.value));
        sql = `${col} ${f.op === 'cs' ? '@>' : '<@'} $${params.length}::jsonb`;
      } else throw pgrst(400, 'PGRST100', `unsupported operator ${f.op}`);
      out.push(f.not ? `not (${sql})` : sql);
    }
    return out;
  }
  function orderSql(t, alias, order) {
    if (!order || !order.length) return '';
    return (
      ' order by ' +
      order
        .map((o) => {
          let s = `${alias}.${checkCol(t, o.column)} ${o.ascending === false ? 'desc' : 'asc'}`;
          if (o.nullsFirst === true) s += ' nulls first';
          else if (o.nullsFirst === false) s += ' nulls last';
          return s;
        })
        .join(', ')
    );
  }
  // PostgREST's max-rows (Supabase default 1000): a select never returns more rows than this, whatever it asks for.
  const maxRows = opts.maxRows !== undefined ? opts.maxRows : process.env.FAKE_MAX_ROWS ? +process.env.FAKE_MAX_ROWS : 1000;
  function limitSql(q) {
    let s = '';
    let lim = q.range ? q.range[1] - q.range[0] + 1 : q.limit;
    if (maxRows && (lim == null || (Number.isInteger(lim) && lim > maxRows))) lim = maxRows;
    if (lim != null) {
      if (!Number.isInteger(lim) || lim < 0) throw pgrst(400, 'PGRST103', 'Requested range not satisfiable');
      s += ' limit ' + lim;
    }
    if (q.range) {
      if (!Number.isInteger(q.range[0]) || q.range[0] < 0) throw pgrst(400, 'PGRST103', 'Requested range not satisfiable');
      s += ' offset ' + q.range[0];
    }
    return s;
  }

  /** Execute a query plan from client.js. Resolves {status, data, count}. */
  async function restQuery(ctx, q) {
    const t = tableOf(q.table);
    const method = q.method || 'select';
    const st = { n: 0, inner: [] };
    const params = [];
    const want = method === 'select' || q.returning;
    const items = want ? parseSelect(q.columns) : null;
    const expr = want ? rowExpr(t, 't0', items, st) : null;
    const single = q.single; // 'single' | 'maybe' | null
    return asCaller(Object.assign({ method: method === 'select' ? 'GET' : 'POST' }, ctx), async (c) => {
      let rows;
      let count = null;
      if (method === 'select') {
        const where = whereSql(t, 't0', q.filters, params).concat(st.inner);
        const w = where.length ? ' where ' + where.join(' and ') : '';
        if (q.count) {
          const r = await c.query(`select count(*)::bigint as n from public.${qi(t.name)} t0${w}`, params);
          count = +r.rows[0].n;
        }
        if (q.head) return { status: 200, data: null, count };
        const r = await c.query(`select ${expr} as j from public.${qi(t.name)} t0${w}${orderSql(t, 't0', q.order)}${limitSql(q)}`, params);
        rows = r.rows.map((x) => x.j);
      } else if (method === 'insert' || method === 'upsert') {
        const body = Array.isArray(q.body) ? q.body : [q.body];
        if (!body.length) return { status: 201, data: want ? [] : null };
        if (!body.every((r) => r && typeof r === 'object' && !Array.isArray(r))) throw pgrst(400, 'PGRST102', 'All object keys must match');
        const cols = [...new Set(body.flatMap((r) => Object.keys(r)))];
        for (const k of cols) if (!t.cols.has(k)) throw pgrst(400, 'PGRST204', `Could not find the '${k}' column of '${t.name}' in the schema cache`);
        params.push(JSON.stringify(body));
        const colList = cols.map(qi).join(', ');
        let sql = `insert into public.${qi(t.name)} as t0 (${colList}) select ${colList} from jsonb_populate_recordset(null::public.${qi(t.name)}, $1::jsonb)`;
        if (method === 'upsert') {
          const target = q.onConflict ? String(q.onConflict).split(',').map((x) => x.trim()) : t.pk;
          if (!target.length) throw pgrst(400, '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
          target.forEach((x) => checkCol(t, x));
          sql += ` on conflict (${target.map(qi).join(', ')}) do ` + (q.ignoreDuplicates ? 'nothing' : `update set ${cols.map((k) => `${qi(k)} = excluded.${qi(k)}`).join(', ')}`);
        }
        if (want) {
          const r = await c.query(`with t0 as (${sql} returning t0.*) select ${expr} as j from t0`, params);
          rows = r.rows.map((x) => x.j);
        } else {
          await c.query(sql, params);
          rows = null;
        }
      } else if (method === 'update') {
        const b = q.body;
        if (!b || typeof b !== 'object' || Array.isArray(b)) throw pgrst(400, 'PGRST102', 'Empty or invalid json');
        const cols = Object.keys(b);
        if (!cols.length) return { status: 204, data: want ? [] : null };
        for (const k of cols) if (!t.cols.has(k)) throw pgrst(400, 'PGRST204', `Could not find the '${k}' column of '${t.name}' in the schema cache`);
        params.push(JSON.stringify(b));
        const where = whereSql(t, 't0', q.filters, params);
        const sql = `update public.${qi(t.name)} as t0 set ${cols.map((k) => `${qi(k)} = s.${qi(k)}`).join(', ')} from jsonb_populate_record(null::public.${qi(t.name)}, $1::jsonb) s${where.length ? ' where ' + where.join(' and ') : ''}`;
        if (want) {
          const r = await c.query(`with t0 as (${sql} returning t0.*) select ${expr} as j from t0`, params);
          rows = r.rows.map((x) => x.j);
        } else {
          const r = await c.query(sql, params);
          rows = null;
          count = r.rowCount;
        }
      } else if (method === 'delete') {
        const where = whereSql(t, 't0', q.filters, params);
        const sql = `delete from public.${qi(t.name)} as t0${where.length ? ' where ' + where.join(' and ') : ''}`;
        if (want) {
          const r = await c.query(`with t0 as (${sql} returning t0.*) select ${expr} as j from t0`, params);
          rows = r.rows.map((x) => x.j);
        } else {
          await c.query(sql, params);
          rows = null;
        }
      } else throw pgrst(405, 'PGRST117', 'Unsupported HTTP method');

      if (single === 'single' && rows) {
        if (rows.length !== 1) {
          // PostgREST answers 406 and, for writes, rolls the transaction back.
          return { rollback: method !== 'select', status: 406, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', details: `The result contains ${rows.length} rows`, hint: null } };
        }
        return { status: 200, data: rows[0], count };
      }
      if (single === 'maybe' && rows) {
        if (rows.length > 1) return { rollback: method !== 'select', status: 406, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `Results contain ${rows.length} rows, application/vnd.pgrst.object+json requires 1 row`, hint: null } };
        return { status: 200, data: rows[0] || null, count };
      }
      return { status: method === 'select' ? 200 : method === 'insert' || method === 'upsert' ? 201 : rows ? 200 : 204, data: rows, count };
    });
  }

  async function rpc(ctx, name, args) {
    const list = schema.fns.get(name) || [];
    args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const keys = Object.keys(args);
    const fn = list.find((f) => keys.every((k) => f.args.some((a) => a.name === k)) && f.args.every((a) => a.optional || keys.includes(a.name)));
    if (!fn) throw pgrst(404, 'PGRST202', `Could not find the function public.${name}(${keys.sort().join(', ')}) in the schema cache`, `Searched for the function public.${name} with parameters ${keys.join(', ') || 'or with a single unnamed json/jsonb parameter'}, but no matches were found in the schema cache.`);
    const params = [];
    const argSql = fn.args
      .filter((a) => keys.includes(a.name))
      .map((a) => {
        const v = args[a.name];
        params.push(v === null || v === undefined ? null : /^jsonb?$/.test(a.type) ? JSON.stringify(v) : /\[\]$/.test(a.type) && Array.isArray(v) ? v.map(toParam) : toParam(v));
        return `${qi(a.name)} => $${params.length}::${a.type}`;
      })
      .join(', ');
    const call = `public.${qi(fn.name)}(${argSql})`;
    return asCaller(ctx, async (c) => {
      if (fn.rettype === 'void') {
        await c.query(`select ${call}`, params);
        return { status: 200, data: null };
      }
      const r = await c.query(`select to_jsonb(r) as j from ${call} r`, params);
      if (fn.retset) return { status: 200, data: r.rows.map((x) => x.j) };
      return { status: 200, data: r.rows.length ? r.rows[0].j : null };
    });
  }

  /* ---------------- storage ---------------- */
  const storageErr = (status, statusCode, error, message) => new ApiError(status, { statusCode: String(statusCode), error, message });
  function objPath(p) {
    const segs = String(p || '').split('/');
    if (!p || segs.some((s) => !s || s === '.' || s === '..' || /[\x00-\x1f]/.test(s))) throw storageErr(400, 400, 'InvalidKey', `Invalid key: ${p}`);
    return segs;
  }
  const fileOf = (bucket, segs) => path.join(storageDir, encodeURIComponent(bucket), ...segs.map((s) => encodeURIComponent(s)));
  async function bucketOf(id) {
    const r = await admin.query('select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', [id]);
    if (!r.rows[0]) throw storageErr(404, 404, 'Bucket not found', 'Bucket not found');
    return r.rows[0];
  }
  const mimeOk = (allowed, type) => !allowed || !allowed.length || allowed.some((a) => a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))));

  async function upload(req, res, ctx, bucketId, key, upsert) {
    const segs = objPath(key);
    const b = await bucketOf(bucketId);
    const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const limit = b.file_size_limit ? +b.file_size_limit : 5 * 1024 * 1024 * 1024;
    let body;
    try {
      body = await readBody(req, limit);
    } catch (e) {
      throw storageErr(413, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
    }
    if (!mimeOk(b.allowed_mime_types, type)) throw storageErr(415, 415, 'invalid_mime_type', `mime type ${type} is not supported`);
    const id = crypto.randomUUID();
    const cc = String(req.headers['cache-control'] || 'max-age=3600');
    const meta = { eTag: '"' + crypto.createHash('md5').update(body).digest('hex') + '"', size: body.length, mimetype: type, cacheControl: cc, lastModified: new Date().toUTCString(), contentLength: body.length, httpStatusCode: 200 };
    const file = fileOf(bucketId, segs);
    await asCaller(ctx, async (c) => {
      try {
        if (upsert) await c.query(`insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, $2, $3, $4, $5) on conflict (bucket_id, name) do update set metadata = excluded.metadata, owner = excluded.owner`, [id, bucketId, key, ctx.uid, meta]);
        else await c.query(`insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, $2, $3, $4, $5)`, [id, bucketId, key, ctx.uid, meta]);
      } catch (e) {
        if (e.code === '23505') throw storageErr(409, 409, 'Duplicate', 'The resource already exists');
        if (e.code === '42501') throw storageErr(403, 403, 'Unauthorized', 'new row violates row-level security policy');
        throw storageErr(400, 400, 'DatabaseError', e.message);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      fs.writeFileSync(file + '.__meta', JSON.stringify(meta));
    });
    stats.storage++;
    sendJson(res, 200, { Key: `${bucketId}/${key}`, Id: id });
  }

  function serveFile(req, res, file, type, cacheControl) {
    let size;
    try {
      size = fs.statSync(file).size;
    } catch (e) {
      throw storageErr(400, 404, 'not_found', 'Object not found');
    }
    const h = { 'Content-Type': type || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControl || 'no-cache' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (m && (m[1] || m[2])) {
      let a = m[1] === '' ? Math.max(0, size - +m[2]) : +m[1];
      let z = m[1] === '' ? size - 1 : m[2] === '' ? size - 1 : Math.min(+m[2], size - 1);
      if (a > z || a >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1 }));
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start: a, end: z }).pipe(res);
    }
    res.writeHead(200, Object.assign(h, { 'Content-Length': size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }
  const metaOf = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file + '.__meta', 'utf8'));
    } catch (e) {
      return {};
    }
  };
  const signToken = (bucket, key, exp) => {
    const body = Buffer.from(JSON.stringify({ url: `${bucket}/${key}`, exp })).toString('base64url');
    return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
  };
  const checkToken = (tok, bucket, key) => {
    const [body, sig] = String(tok || '').split('.');
    if (!body || !sig || crypto.createHmac('sha256', secret).update(body).digest('base64url') !== sig) throw storageErr(400, 400, 'InvalidJWT', 'invalid signature');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.url !== `${bucket}/${key}`) throw storageErr(400, 400, 'InvalidSignature', 'The url do not match the signature');
    if (p.exp * 1000 < Date.now()) throw storageErr(400, 400, 'InvalidJWT', '"exp" claim timestamp check failed');
  };

  /* ---------------- HTTP ---------------- */
  function sendJson(res, status, obj) {
    const b = Buffer.from(obj === undefined ? '' : JSON.stringify(obj));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
    res.end(b);
  }
  function cors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-upsert, x-client-info, cache-control, range');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Type, Accept-Ranges');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  const decodeKey = (s) => s.split('/').map(decodeURIComponent).join('/');

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const t0 = Date.now();
    if (!quiet) res.on('finish', () => log(req.method, p, res.statusCode, Date.now() - t0 + 'ms'));
    let ctx = null;
    try {
      /* ----- test helpers ----- */
      if (p === '/__test/health') return sendJson(res, 200, { ok: true });
      if (p === '/__test/otp') return sendJson(res, 200, otpLog);
      if (p === '/__test/stats') return sendJson(res, 200, stats);
      if (p === '/__test/queries') return sendJson(res, 200, queries);
      if (p === '/__test/sql' && req.method === 'POST') {
        const b = await readJson(req);
        const r = await admin.query(b.sql, b.params || []);
        return sendJson(res, 200, r.rows);
      }

      /* ----- storage: unauthenticated reads first ----- */
      let m;
      if ((m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
        const bucket = decodeURIComponent(m[1]);
        const key = decodeKey(m[2]);
        const b = await bucketOf(bucket);
        if (!b.public) throw storageErr(400, 404, 'not_found', 'Object not found');
        const r = await admin.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, key]);
        if (!r.rows[0]) throw storageErr(400, 404, 'not_found', 'Object not found');
        return serveFile(req, res, fileOf(bucket, objPath(key)), r.rows[0].metadata && r.rows[0].metadata.mimetype, r.rows[0].metadata && r.rows[0].metadata.cacheControl);
      }
      if ((m = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
        const bucket = decodeURIComponent(m[1]);
        const key = decodeKey(m[2]);
        checkToken(url.searchParams.get('token'), bucket, key);
        const file = fileOf(bucket, objPath(key));
        const meta = metaOf(file);
        return serveFile(req, res, file, meta.mimetype, meta.cacheControl);
      }

      /* ----- auth ----- */
      if (p.startsWith('/auth/v1/')) {
        if ((req.headers.apikey || url.searchParams.get('apikey')) !== anonKey) throw new ApiError(401, { message: 'Invalid API key' });
        const route = p.slice('/auth/v1/'.length);
        if (route === 'otp' && req.method === 'POST') {
          const b = await readJson(req);
          const email = String(b.email || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
          if (b.create_user === false) {
            const r = await admin.query('select 1 from auth.users where lower(email) = $1', [email]);
            if (!r.rows.length) return sendJson(res, 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
          }
          otpLog.push({ email, at: new Date().toISOString(), redirectTo: url.searchParams.get('redirect_to') || null });
          return sendJson(res, 200, {});
        }
        if (route === 'verify' && req.method === 'POST') {
          const b = await readJson(req);
          const email = String(b.email || '').trim().toLowerCase();
          const asked = otpLog.some((o) => o.email === email && Date.now() - Date.parse(o.at) < 3600e3);
          if (!asked || String(b.token) !== otpCode) return sendJson(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
          const u = await ensureUser(email);
          return sendJson(res, 200, newSession(u.id, u.email));
        }
        if (route === 'token' && req.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
          const b = await readJson(req);
          const r = refresh.get(b.refresh_token);
          if (!r) return sendJson(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
          refresh.delete(b.refresh_token);
          return sendJson(res, 200, newSession(r.uid, r.email));
        }
        if (route === 'logout' && req.method === 'POST') {
          const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
          const s = tokens.get(tok);
          if (s) {
            tokens.delete(tok);
            refresh.delete(s.rt);
          }
          res.writeHead(204);
          return res.end();
        }
        if (route === 'user' && req.method === 'GET') {
          ctx = contextOf(req, url);
          if (!ctx.uid) return sendJson(res, 401, { code: 401, error_code: 'no_authorization', msg: 'This endpoint requires a Bearer token' });
          return sendJson(res, 200, userJson(ctx));
        }
        return sendJson(res, 404, { code: 404, error_code: 'not_found', msg: 'Not found' });
      }

      ctx = contextOf(req, url);

      /* ----- rest ----- */
      if (p === '/rest/v1/__query' && req.method === 'POST') {
        const q = await readJson(req);
        stats.rest++;
        remember({ uid: ctx.uid, kind: 'rest', table: q.table, method: q.method || 'select', filters: q.filters, order: q.order, range: q.range });
        const out = await restQuery(ctx, q);
        if (out.error) return sendJson(res, out.status, { error: out.error });
        return sendJson(res, 200, { status: out.status, data: out.data, count: out.count });
      }
      if ((m = /^\/rest\/v1\/rpc\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(p)) && req.method === 'POST') {
        const args = await readJson(req);
        stats.rpc++;
        remember({ uid: ctx.uid, kind: 'rpc', fn: m[1], args });
        const out = await rpc(ctx, m[1], args);
        return sendJson(res, 200, { status: out.status, data: out.data });
      }

      /* ----- storage (authenticated) ----- */
      if ((m = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(p)) && req.method === 'POST') {
        const bucket = decodeURIComponent(m[1]);
        const key = decodeKey(m[2]);
        objPath(key);
        const b = await readJson(req);
        const exp = Math.floor(Date.now() / 1000) + Math.max(1, +b.expiresIn || 60);
        const found = await asCaller(ctx, (c) => c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, key]));
        if (!found.rows.length) throw storageErr(400, 404, 'not_found', 'Object not found');
        return sendJson(res, 200, { signedURL: `/object/sign/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}?token=${signToken(bucket, key, exp)}` });
      }
      if ((m = /^\/storage\/v1\/object\/([^/]+)$/.exec(p)) && req.method === 'DELETE') {
        const bucket = decodeURIComponent(m[1]);
        const b = await readJson(req);
        const keys = Array.isArray(b.prefixes) ? b.prefixes.map(String) : [];
        const gone = await asCaller(ctx, async (c) => {
          const r = await c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning id::text, name, bucket_id, owner::text, metadata, created_at', [bucket, keys]);
          for (const row of r.rows) {
            const f = fileOf(bucket, objPath(row.name));
            fs.rmSync(f, { force: true });
            fs.rmSync(f + '.__meta', { force: true });
          }
          return r.rows;
        });
        stats.storage++;
        return sendJson(res, 200, gone);
      }
      if ((m = /^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
        const bucket = decodeURIComponent(m[1]);
        const key = decodeKey(m[2]);
        const found = await asCaller(ctx, (c) => c.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, key]));
        if (!found.rows.length) throw storageErr(400, 404, 'not_found', 'Object not found');
        return serveFile(req, res, fileOf(bucket, objPath(key)), found.rows[0].metadata && found.rows[0].metadata.mimetype);
      }
      if ((m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'POST' || req.method === 'PUT')) {
        return await upload(req, res, ctx, decodeURIComponent(m[1]), decodeKey(m[2]), req.method === 'PUT' || String(req.headers['x-upsert']) === 'true');
      }
      return sendJson(res, 404, { code: 'PGRST000', message: `no route for ${req.method} ${p}` });
    } catch (e) {
      if (e instanceof ApiError) return sendJson(res, e.status, e.body.statusCode ? e.body : { error: e.body });
      if (e && e.code && typeof e.code === 'string' && e.severity) {
        const ae = fromPgErr(e, !!(ctx && ctx.authed));
        if (p.startsWith('/storage/')) return sendJson(res, 400, { statusCode: String(ae.status), error: e.code, message: e.message });
        return sendJson(res, ae.status, { error: ae.body });
      }
      console.error('[fake-supabase] internal error', req.method, p, e);
      return sendJson(res, 500, { error: { code: 'XX000', message: String((e && e.message) || e), details: null, hint: null } });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      try {
        sendJson(res, 500, { error: { code: 'XX000', message: String(e && e.message), details: null, hint: null } });
      } catch (e2) {}
    });
  });
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  /* =====================================================================
   * Realtime over WebSocket
   * ===================================================================== */
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Set();
  const presence = new Map(); // topic -> Map(instanceKey -> {key, meta})
  let connSeq = 0;

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/realtime/v1/websocket' || url.searchParams.get('apikey') !== anonKey) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConn(ws));
  });

  const FILTER = /^([A-Za-z_][A-Za-z0-9_]*)=(eq|neq|lt|lte|gt|gte|in)\.(.*)$/s;
  function parseFilter(t, f) {
    if (!f) return null;
    const m = FILTER.exec(f);
    if (!m || !t.cols.has(m[1])) throw new Error(`invalid filter ${f}`);
    let v = m[3];
    if (m[2] === 'in') v = v.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
    return { col: m[1], op: m[2], value: v };
  }
  function filterMatch(f, rec) {
    if (!f) return true;
    if (!rec || !(f.col in rec)) return false;
    const raw = rec[f.col];
    const a = raw === null ? null : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    const num = (x) => (x !== null && x !== '' && !isNaN(+x) ? +x : x);
    switch (f.op) {
      case 'eq': return a === f.value;
      case 'neq': return a !== f.value;
      case 'in': return f.value.includes(a);
      case 'lt': return num(a) < num(f.value);
      case 'lte': return num(a) <= num(f.value);
      case 'gt': return num(a) > num(f.value);
      case 'gte': return num(a) >= num(f.value);
    }
    return false;
  }

  function wsSend(c, msg) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }
  function presenceState(ns) {
    const m = presence.get(ns);
    const out = {};
    if (m) for (const { key, meta } of m.values()) (out[key] = out[key] || []).push(meta);
    return out;
  }
  function presenceBroadcast(ns) {
    const state = presenceState(ns);
    for (const c of conns) for (const ch of c.channels.values()) if (ch.ns === ns && ch.joined) wsSend(c, { type: 'presence_state', topic: ch.topic, ref: ch.ref, state });
  }
  function dropPresence(c, ref) {
    const touched = new Set();
    for (const [ns, m] of presence) {
      for (const k of [...m.keys()]) if (k.startsWith(c.id + '|') && (ref == null || k === c.id + '|' + ref)) {
        m.delete(k);
        touched.add(ns);
      }
    }
    for (const t of touched) presenceBroadcast(t);
  }

  /* Realtime Authorization for private channels: evaluate the RLS policies on realtime.messages as the
     user, with realtime.topic() = channel name, inside a rolled-back transaction. */
  async function rtAuthorize(ctx, name) {
    const c = await admin.connect();
    try {
      await c.query('begin');
      const ins = await c.query(`insert into realtime.messages (topic, extension, payload, event, private) values ($1, 'presence', '{}', 'auth_check', true) returning id`, [name]);
      await c.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true), set_config('realtime.topic', $4, true)`, [ctx.role, JSON.stringify(ctx.claims), ctx.uid || '', name]);
      const read = (await c.query('select 1 from realtime.messages where id = $1', [ins.rows[0].id])).rows.length > 0;
      let write = false;
      try {
        await c.query('savepoint w');
        await c.query(`insert into realtime.messages (topic, extension, payload, event, private) values ($1, 'presence', '{}', 'auth_check', true)`, [name]);
        write = true;
      } catch (e) {
        await c.query('rollback to savepoint w');
      }
      return { read, write };
    } catch (e) {
      return { read: false, write: false, error: e.message };
    } finally {
      await c.query('rollback').catch(() => {});
      c.release();
    }
  }

  function onConn(ws) {
    const c = { id: 'c' + ++connSeq, ws, ctx: contextOfToken(''), channels: new Map() }; // ref -> channel
    conns.add(c);
    let q = Promise.resolve(); // handle one message at a time, in order
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
      q = q.then(() => onMsg(c, msg)).catch((e) => wsSend(c, { type: 'error', topic: msg.topic, ref: msg.ref, message: String(e.message || e) }));
    });
    ws.on('close', () => {
      conns.delete(c);
      dropPresence(c, null);
    });
    ws.on('error', () => {});
  }

  async function onMsg(c, msg) {
    if (msg.type === 'auth') {
      try {
        c.ctx = contextOfToken(msg.token);
      } catch (e) {
        wsSend(c, { type: 'auth_error', message: e.message });
      }
      return;
    }
    if (msg.type === 'ping') return wsSend(c, { type: 'pong' });
    if (msg.type === 'join') {
      if (msg.token !== undefined) {
        try {
          c.ctx = contextOfToken(msg.token);
        } catch (e) {
          return wsSend(c, { type: 'join_error', topic: msg.topic, ref: msg.ref, message: e.message });
        }
      }
      const bindings = [];
      try {
        for (const b of msg.bindings || []) {
          if (b.schema && b.schema !== 'public' && b.schema !== '*') throw new Error(`unsupported schema ${b.schema}`);
          const t = tableOf(b.table);
          const ev = String(b.event || '*').toUpperCase();
          if (!['*', 'INSERT', 'UPDATE', 'DELETE'].includes(ev)) throw new Error(`invalid event ${b.event}`);
          bindings.push({ id: b.id, table: t.name, event: ev, filter: parseFilter(t, b.filter) });
        }
      } catch (e) {
        return wsSend(c, { type: 'join_error', topic: msg.topic, ref: msg.ref, message: e.message || String(e) });
      }
      const priv = !!msg.private;
      const name = String(msg.topic || '').replace(/^realtime:/, '');
      let canWrite = true;
      if (priv) {
        if (!c.ctx.authed) return wsSend(c, { type: 'join_error', topic: msg.topic, ref: msg.ref, message: 'Unauthorized: You do not have permissions to read from this Channel topic: ' + name });
        const a = await rtAuthorize(c.ctx, name);
        if (!a.read) return wsSend(c, { type: 'join_error', topic: msg.topic, ref: msg.ref, message: 'Unauthorized: You do not have permissions to read from this Channel topic: ' + name });
        canWrite = a.write;
      } else if (!publicChannels) {
        return wsSend(c, { type: 'join_error', topic: msg.topic, ref: msg.ref, message: 'Unauthorized: public channels are disabled for this project' });
      }
      // private and public channels with the same name are separate namespaces
      const ns = (priv ? 'private|' : 'public|') + msg.topic;
      c.channels.set(msg.ref, { ref: msg.ref, topic: msg.topic, ns, private: priv, canWrite, bindings, presenceKey: msg.presenceKey || crypto.randomUUID(), self: !!msg.broadcastSelf, joined: true });
      wsSend(c, { type: 'joined', topic: msg.topic, ref: msg.ref });
      wsSend(c, { type: 'presence_state', topic: msg.topic, ref: msg.ref, state: presenceState(ns) });
      return;
    }
    const ch = c.channels.get(msg.ref);
    if (!ch) return wsSend(c, { type: 'error', topic: msg.topic, ref: msg.ref, message: 'not joined' });
    if (msg.type === 'leave') {
      c.channels.delete(msg.ref);
      dropPresence(c, msg.ref);
      return;
    }
    if (msg.type === 'track') {
      if (!ch.canWrite) return wsSend(c, { type: 'track_error', topic: ch.topic, ref: ch.ref, id: msg.id, message: 'Unauthorized: You do not have permissions to write to this Channel topic' });
      if (!presence.has(ch.ns)) presence.set(ch.ns, new Map());
      const meta = Object.assign({}, msg.payload || {}, { presence_ref: crypto.randomBytes(8).toString('base64url') });
      presence.get(ch.ns).set(c.id + '|' + ch.ref, { key: ch.presenceKey, meta });
      wsSend(c, { type: 'track_ok', topic: ch.topic, ref: ch.ref, id: msg.id });
      presenceBroadcast(ch.ns);
      return;
    }
    if (msg.type === 'untrack') {
      dropPresence(c, ch.ref);
      wsSend(c, { type: 'track_ok', topic: ch.topic, ref: ch.ref, id: msg.id });
      return;
    }
    if (msg.type === 'broadcast') {
      if (!ch.canWrite) return wsSend(c, { type: 'track_error', topic: ch.topic, ref: ch.ref, id: msg.id, message: 'Unauthorized' });
      for (const o of conns)
        for (const och of o.channels.values())
          if (och.ns === ch.ns && (och !== ch || ch.self)) wsSend(o, { type: 'broadcast', topic: och.topic, ref: och.ref, event: msg.event, payload: msg.payload });
      wsSend(c, { type: 'broadcast_ok', topic: ch.topic, ref: ch.ref, id: msg.id });
    }
  }

  /* LISTEN for the test triggers and fan changes out, re-checking RLS as each subscriber. */
  const listener = new pg.Client(Object.assign({ user: 'supabase_admin' }, conn));
  await listener.connect();
  listener.on('error', () => {});
  let chain = Promise.resolve();
  listener.on('notification', (n) => {
    let ev;
    try {
      ev = JSON.parse(n.payload);
    } catch (e) {
      return;
    }
    chain = chain.then(() => dispatch(ev)).catch((e) => console.error('[fake-supabase] realtime dispatch', e));
  });
  await listener.query('listen fake_realtime');

  async function visibleRow(ctx, t, pk, needRow) {
    if (!ctx.authed && ctx.role !== 'anon') return null;
    const params = [];
    const where = t.pk.map((k) => {
      params.push(toParam(pk[k]));
      return `t0.${qi(k)} = $${params.length}`;
    });
    if (!where.length) return null;
    try {
      const r = await asCaller(ctx, (cl) => cl.query(`select ${needRow ? 'to_jsonb(t0)' : 'true'} as j from public.${qi(t.name)} t0 where ${where.join(' and ')}`, params));
      return r.rows.length ? r.rows[0].j : null;
    } catch (e) {
      return null; // e.g. permission denied for anon
    }
  }

  async function dispatch(ev) {
    if (ev.schema !== 'public') return;
    const t = schema.tables.get(ev.table);
    if (!t || !schema.published.has(ev.table)) return;
    const jobs = [];
    for (const c of conns) {
      const hits = [];
      for (const ch of c.channels.values())
        for (const b of ch.bindings) if (b.table === ev.table && (b.event === '*' || b.event === ev.type)) hits.push({ ch, b });
      if (!hits.length) continue;
      jobs.push(
        (async () => {
          const ctx = c.ctx;
          let rec = ev.record;
          if (ev.type !== 'DELETE') {
            // walrus checks the subscriber's SELECT policies against the table at decode time
            const vis = await visibleRow(ctx, t, ev.pk, !!ev.big);
            if (!vis) {
              stats.realtimeDropped++;
              return;
            }
            if (ev.big) rec = vis;
          }
          // DELETE events skip RLS on Supabase too (the row is gone); filters see the old key columns.
          const target = ev.type === 'DELETE' ? ev.old_record : rec;
          const byCh = new Map();
          for (const { ch, b } of hits) if (filterMatch(b.filter, target)) (byCh.get(ch) || byCh.set(ch, []).get(ch)).push(b.id);
          for (const [ch, ids] of byCh) {
            stats.realtimeSent++;
            wsSend(c, {
              type: 'postgres_changes',
              topic: ch.topic,
              ref: ch.ref,
              ids,
              data: { schema: 'public', table: ev.table, commit_timestamp: ev.commit_timestamp, eventType: ev.type, new: ev.type === 'DELETE' ? {} : rec, old: ev.type === 'INSERT' ? {} : ev.old_record || {}, errors: null },
            });
          }
        })()
      );
    }
    await Promise.all(jobs);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port === undefined ? 0 : opts.port, opts.host || '127.0.0.1', resolve);
  });
  const address = server.address();
  const urlBase = `http://${address.address}:${address.port}`;
  log('listening on', urlBase);

  return {
    url: urlBase,
    anonKey,
    otpCode,
    otpLog,
    stats,
    queries,
    schema,
    reloadSchema: loadSchema,
    /** Superuser SQL for test assertions. */
    sql: (q, params) => admin.query(q, params).then((r) => r.rows),
    /** Drop every realtime socket (simulates a network blip; clients reconnect). */
    kickRealtime: () => {
      for (const c of conns) c.ws.terminate();
    },
    stop: async () => {
      for (const c of conns) c.ws.terminate();
      wss.close();
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(() => r()));
      await listener.end().catch(() => {});
      await api.end().catch(() => {});
      await admin.end().catch(() => {});
    },
  };
}

/** Boot both: Postgres + server. */
async function start(opts = {}) {
  const pgc = await startPostgres(opts);
  try {
    const srv = await startServer(Object.assign({}, opts, { pg: pgc }));
    return Object.assign({}, srv, {
      pg: pgc,
      stop: async () => {
        await srv.stop();
        await pgc.stop();
      },
    });
  } catch (e) {
    await pgc.stop();
    throw e;
  }
}

module.exports = { startPostgres, startServer, start };

if (require.main === module) {
  (async () => {
    const t = Date.now();
    const s = await start({ port: process.env.PORT ? +process.env.PORT : 54321, quiet: !process.env.FAKE_LOG, keep: !!process.env.KEEP_PG });
    console.log(`fake supabase ready in ${Date.now() - t} ms: ${s.url}  (anon key: ${s.anonKey}, OTP code: ${s.otpCode})`);
    console.log(`postgres: psql -h ${s.pg.host} -p ${s.pg.port} -U supabase_admin postgres`);
    const bye = async () => {
      await s.stop();
      process.exit(0);
    };
    process.on('SIGINT', bye);
    process.on('SIGTERM', bye);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
