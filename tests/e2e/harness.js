/*
 * E2E harness: real Postgres 16 + project migration (RLS) + fake Supabase
 * server + a static server for site/ that points the app at the fake.
 *
 *   const H = require('./harness');
 *   const env = await H.start();            // {siteUrl, fakeUrl, fake, stop()}
 *   const { chromium } = require('playwright');
 *   const browser = await chromium.launch();
 *   const a = await H.newUser(browser, 'a@test.local', { viewport: { width: 390, height: 844 } });
 *   // (or H.newUser(browser, env, email, opts); opts.url opens e.g. an invite link instead of the site)
 *   // a.page, a.context, a.page.__errors
 *
 * Static server: site/ as-is, except
 *   /config.js          real config + supabaseUrl/supabaseAnonKey of the fake
 *   /vendor/supabase.js tests/fake-supabase/client.js
 * Every browser context created by newContext() answers requests to other
 * hosts (fonts, googleapis, openlibrary, …) with an empty 404.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
let F;
try {
  F = require('../fake-supabase/server');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND' && /'(pg|ws)'/.test(e.message)) {
    console.error('Missing dependencies of the fake Supabase. Run once:  npm ci --prefix tests/fake-supabase');
    process.exit(2);
  }
  throw e;
}

const ROOT = path.resolve(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const CLIENT = path.join(ROOT, 'tests', 'fake-supabase', 'client.js');
const SHOTS = path.join(__dirname, 'shots');
const FIXTURES = path.join(__dirname, 'fixtures');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

function staticServer(fakeUrl, anonKey) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const send = (status, body, type) => {
      const b = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : b);
    };
    if (p === '/') p = '/index.html';
    if (p === '/config.js') {
      const orig = fs.readFileSync(path.join(SITE, 'config.js'), 'utf8');
      return send(200, `${orig}\n/* e2e harness: point at the fake Supabase */\nwindow.QS_CONFIG.supabaseUrl = ${JSON.stringify(fakeUrl)};\nwindow.QS_CONFIG.supabaseAnonKey = ${JSON.stringify(anonKey)};\n`, TYPES['.js']);
    }
    if (p === '/vendor/supabase.js') return send(200, fs.readFileSync(CLIENT), TYPES['.js']);
    const file = path.resolve(SITE, '.' + path.posix.normalize(p));
    if (!file.startsWith(SITE + path.sep)) return send(404, 'not found');
    fs.stat(file, (e, st) => {
      if (e || !st.isFile()) return send(404, 'not found: ' + p);
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
      if (m && (m[1] || m[2])) {
        const a = m[1] === '' ? Math.max(0, st.size - +m[2]) : +m[1];
        const z = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(+m[2], st.size - 1);
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${z}/${st.size}`, 'Content-Length': z - a + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start: a, end: z }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        stop: () => new Promise((r) => {
          for (const s of sockets) s.destroy();
          server.close(() => r());
        }),
      })
    )
  );
}

/** Boot Postgres + fake Supabase + static site. */
async function start(opts = {}) {
  const fake = await F.start(Object.assign({ quiet: true }, opts));
  let site;
  try {
    site = await staticServer(fake.url, fake.anonKey);
  } catch (e) {
    await fake.stop();
    throw e;
  }
  return (lastEnv = {
    siteUrl: site.url,
    fakeUrl: fake.url,
    fake,
    stop: async () => {
      await site.stop();
      await fake.stop();
    },
  });
}

function attachErrors(page) {
  if (page.__errors) return page;
  page.__errors = [];
  page.__aborted = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const loc = m.location();
      page.__errors.push('console: ' + m.text() + (loc && loc.url ? ` (${loc.url.replace(/^https?:\/\/[^/]+/, '')}:${loc.lineNumber})` : ''));
    }
  });
  page.on('pageerror', (e) => page.__errors.push('pageerror: ' + ((e && (e.stack || e.message)) || String(e))));
  page.on('requestfailed', (r) => {
    const f = r.failure();
    const line = `requestfailed: ${r.method()} ${r.url()} — ${f ? f.errorText : '?'}`;
    (f && f.errorText === 'net::ERR_ABORTED' ? page.__aborted : page.__errors).push(line);
  });
  return page;
}

/** A browser context whose requests to non-local hosts get an empty 404. */
async function newContext(browser, opts = {}) {
  const { viewport, colorScheme, locale, ...rest } = opts;
  const ctx = await browser.newContext(Object.assign({ viewport: viewport || { width: 390, height: 844 }, colorScheme: colorScheme || 'light', locale: locale || 'ar-EG', acceptDownloads: true }, rest));
  await ctx.route(
    (u) => !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname) && /^(https?|wss?):$/.test(u.protocol),
    (route) => route.fulfill({ status: 404, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: '' })
  );
  // Capture plain-object rejections, which Playwright only reports as "Object".
  await ctx.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      if (r && typeof r === 'object' && !(r instanceof Error)) {
        let s;
        try {
          s = JSON.stringify(r);
        } catch (x) {
          s = String(r);
        }
        console.error('Unhandled rejection (plain object): ' + s);
      }
    });
  });
  return ctx;
}

/** Wait until the app settled after sign-in: circles screen, onboarding form or the main shell. */
async function settled(page, timeout = 20000) {
  await page.waitForFunction(() => !!(document.querySelector('#cn-name') || document.querySelector('#join-name') || document.querySelector('.shell') || document.querySelector('.ro-note')), null, { timeout });
}

/**
 * Open the site (or opts.url, e.g. an invite link) in a fresh context and
 * sign in through the real UI with the fake OTP code 123456.
 * Resolves {context, page, email}.
 */
let lastEnv = null;
async function newUser(browser, env, email, opts) {
  if (typeof env === 'string') {
    opts = email;
    email = env;
    env = (opts && opts.env) || lastEnv;
  }
  opts = opts || {};
  const context = opts.context || (await newContext(browser, opts));
  const page = attachErrors(await context.newPage());
  page.__email = email;
  await page.goto(opts.url || env.siteUrl, { waitUntil: 'load' });
  await page.waitForSelector('#auth-mail', { timeout: 15000 });
  await page.fill('#auth-mail', email);
  await page.click('#auth-email button[type=submit]');
  await page.waitForSelector('#auth-otp', { timeout: 15000 });
  await page.fill('#auth-otp', opts.code || '123456');
  await page.click('#auth-code button[type=submit]');
  if (opts.code && opts.code !== '123456') return { context, page, email };
  await settled(page);
  return { context, page, email };
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, String(name).replace(/[^\w.-]+/g, '_') + '.png');
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

module.exports = { start, newContext, newUser, attachErrors, settled, shot, SHOTS, FIXTURES, SITE };
