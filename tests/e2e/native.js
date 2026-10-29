#!/usr/bin/env node
/*
 * The Android app's own native parts, with a stand-in native layer (window.Capacitor with stub plugins, set up
 * before the app loads, so the app boots as the APK would):
 *   - cheer/reply notifications: the one-time ask, register_device in the fake database, the anon-key
 *     device_inbox call the phone makes, re-registering on a language change, the Settings switch,
 *     permission refused, and sign-out turning it off and forgetting the phone;
 *   - the home-screen widget: sensible JSON after reading a page and after marking a portion done, and cleared on sign-out;
 *   - a tapped notification / widget opening «الجديد ليك» or the book.
 *
 *   node tests/e2e/native.js
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const { chromium } = loadPlaywright();
const PDF = path.join(H.FIXTURES, 'arabic-40.pdf');
const T = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function step(name, fn, needs) {
  const t0 = Date.now();
  if (needs && needs.some((n) => !done.has(n))) {
    results.push('SKIP');
    return console.log(`SKIP  ${name}  (needs ${needs.join(', ')})`);
  }
  try {
    const d = await fn();
    results.push('PASS');
    done.add(name);
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)${d ? '  — ' + d : ''}`);
  } catch (e) {
    results.push('FAIL');
    console.log(`FAIL  ${name}\n      ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
const done = new Set();
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function until(p, what, fn, arg, timeout = 10000) {
  try {
    await p.waitForFunction(fn, arg, { timeout, polling: 100 });
  } catch (e) {
    let extra = '';
    try {
      extra = ' | screen: ' + (await p.evaluate(() => (document.querySelector('#screen') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300)));
    } catch (x) {}
    throw new Error('timed out waiting for: ' + what + extra);
  }
}
async function untilNode(what, fn, timeout = 10000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timed out waiting for: ' + what);
    await T(150);
  }
}
const closeSheets = (p) =>
  p.evaluate(() => {
    const V = window.A.V;
    while (V.sheets && V.sheets.length) V.sheets[V.sheets.length - 1].close();
  });
const go = (p, r, o) => p.evaluate(([r, o]) => window.A.V.go(r, o), [r, o || {}]).then(() => T(250));

/* The stand-in for the APK's Java side: Capacitor says "native", and the app's own plugins log their calls. */
function nativeStub() {
  const log = (plugin, method, arg) => {
    window.__calls = window.__calls || [];
    window.__calls.push({ plugin, method, arg: arg === undefined ? null : JSON.parse(JSON.stringify(arg)) });
    try {
      window.__nat(plugin, method, arg === undefined ? null : arg);
    } catch (e) {}
  };
  const noop = (plugin) => new Proxy({}, { get: (t, m) => (m === 'then' ? undefined : async (a) => (log(plugin, String(m), a), {})) });
  window.__perm = 'granted';
  window.__launch = null;
  const Inbox = {
    enable: async (o) => (log('Inbox', 'enable', o), { enabled: true, display: 'granted' }),
    disable: async () => (log('Inbox', 'disable'), { enabled: false }),
    status: async () => ({ enabled: false, display: window.__perm }),
    requestPermission: async () => (log('Inbox', 'requestPermission'), { display: window.__perm }),
    checkNow: async () => ({ ok: true }),
    takeLaunch: async () => {
      const r = window.__launch;
      window.__launch = null;
      return r || {};
    },
    addListener: async (ev, fn) => {
      if (ev === 'launch') window.__launchFn = fn;
      return { remove() {} };
    },
  };
  const Widget = {
    update: async (o) => {
      log('Widget', 'update', o);
      window.__widget = o.data;
    },
    clear: async () => {
      log('Widget', 'clear');
      window.__widget = null;
    },
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: { Inbox, Widget, SystemUi: noop('SystemUi'), KeepAwake: noop('KeepAwake') },
  };
}

(async () => {
  const env = await H.start();
  const browser = await chromium.launch();
  const vp = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  const calls = []; // every plugin call, kept here so it survives the reload after sign-out
  const sql = (q, params) => env.fake.sql(q, params);
  let p, me, bookId, token;
  const ctx = await H.newContext(browser, vp);
  await ctx.exposeFunction('__nat', (plugin, method, arg) => calls.push({ plugin, method, arg }));
  await ctx.addInitScript(nativeStub);
  const count = (plugin, method) => calls.filter((c) => c.plugin === plugin && c.method === method).length;
  const lastCall = (plugin, method) => calls.filter((c) => c.plugin === plugin && c.method === method).pop();
  try {
    await step('Sign in on the "phone"; after joining a circle the app asks once about notifications', async () => {
      const u = await H.newUser(browser, env, 'phone@test.local', Object.assign({ context: ctx }, vp));
      p = u.page;
      assert(await p.evaluate(() => window.A.P.native === true), 'the app does not think it is native');
      await p.fill('#cn-name', 'حلقة الموبايل');
      await p.click('#circle-new button');
      await p.waitForSelector('#join-name', { timeout: 20000 });
      await p.fill('#join-name', 'منى');
      await p.click('#join-form button[type=submit]');
      await p.waitForSelector('.shell #screen .home', { timeout: 15000 });
      await p.evaluate(() => (window.A.Goals.off = true));
      me = await p.evaluate(() => window.A.S.me);
      await p.waitForSelector('[data-inbox-ask="yes"]', { timeout: 20000 });
      const t = await p.evaluate(() => document.querySelector('.inbox-ask').innerText);
      assert(/حتى لو التطبيق مقفول/.test(t), 'ask text: ' + t);
      await T(700); // the sheet's slide-in
      await H.shot(p, 'native-ask');
      return t.split('\n')[0].slice(0, 60);
    });

    await step('«أيوه، فعّلها»: asks Android for permission, registers this phone, and hands the plugin the token', async () => {
      await p.click('[data-inbox-ask="yes"]');
      await untilNode('Inbox.enable', () => count('Inbox', 'enable') >= 1);
      assert(count('Inbox', 'requestPermission') === 1, 'permission not asked');
      const en = lastCall('Inbox', 'enable').arg;
      token = en.token;
      assert(/^[0-9a-f]{64}$/.test(token), 'token: ' + token);
      assert(en.url === env.fakeUrl && en.anonKey && en.lang === 'eg', 'enable args: ' + JSON.stringify(en));
      const rows = await sql('select user_id::text as u, lang, token_hash from public.devices');
      assert(rows.length === 1 && rows[0].u === me && rows[0].lang === 'eg', 'devices: ' + JSON.stringify(rows));
      assert(rows[0].token_hash !== token && rows[0].token_hash.length === 64, 'stored the token itself');
      const stored = await p.evaluate(() => window.A.U.store.get('inboxNotif'));
      assert(stored && stored.on && stored.token === token, 'pref: ' + JSON.stringify(stored));
      return 'device row for me, lang eg';
    }, ['Sign in on the "phone"; after joining a circle the app asks once about notifications']);

    await step('The phone\'s own call (anon key + token): a cheer for me comes back, with no emails', async () => {
      // a circle-mate's cheer (written straight into the fake database, as the circle-mate's app would)
      const cid = (await sql('select circle_id::text as c from public.circle_members where user_id = $1', [me]))[0].c;
      const mate = '00000000-0000-4000-8000-0000000000ee';
      await sql(`insert into auth.users (id, email) values ($1, 'mate@test.local') on conflict do nothing`, [mate]);
      await sql(`insert into public.profiles (user_id, data) values ($1, '{"nick": "سارة"}') on conflict (user_id) do update set data = excluded.data`, [mate]);
      await sql(`insert into public.circle_members (circle_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [cid, mate]);
      await sql(`insert into public.docs (circle_id, col, id, data) values ($1, 'pokes', 'nat1', jsonb_build_object('from', $2::text, 'to', $3::text, 'kind', 'cheer', 'at', now()))`, [cid, mate, me]);
      const ask = (since) =>
        p.evaluate(
          async ([token, since]) => {
            const c = window.QS_CONFIG;
            const r = await fetch(c.supabaseUrl + '/rest/v1/rpc/device_inbox', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + c.supabaseAnonKey },
              body: JSON.stringify({ p_token: token, p_since: since }),
            });
            const j = await r.json();
            return j && 'status' in j && 'data' in j ? j.data : j; // the fake server wraps answers as {status, data}
          },
          [token, since]
        );
      const r = await ask(new Date(Date.now() - 3600e3).toISOString());
      const ev = (r.events || [])[0] || {};
      assert(r.events && r.events.length === 1 && ev.kind === 'cheer' && ev.from === 'سارة' && ev.circle === 'حلقة الموبايل', 'answer: ' + JSON.stringify(r));
      assert(!JSON.stringify(r).includes('@'), 'an email in the answer');
      const again = await ask(null);
      assert(again.limited === true && again.events.length === 0, 'second call within a minute: ' + JSON.stringify(again));
      const wrong = await p.evaluate(async () => {
        const c = window.QS_CONFIG;
        const r = await fetch(c.supabaseUrl + '/rest/v1/rpc/device_inbox', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + c.supabaseAnonKey }, body: JSON.stringify({ p_token: 'f'.repeat(64), p_since: null }) });
        const j = await r.json();
        return j && 'status' in j && 'data' in j ? j.data : j;
      });
      assert(JSON.stringify(wrong) === '{"events":[]}', 'wrong token: ' + JSON.stringify(wrong));
      return `${ev.kind} from ${ev.from}; rate-limited; wrong token → nothing`;
    }, ['«أيوه، فعّلها»: asks Android for permission, registers this phone, and hands the plugin the token']);

    await step('Changing the app language re-registers the phone in that language', async () => {
      const n = count('Inbox', 'enable');
      await p.evaluate(() => window.A.L.set('en'));
      await untilNode('enable again', () => count('Inbox', 'enable') > n);
      assert(lastCall('Inbox', 'enable').arg.lang === 'en', 'enable lang: ' + JSON.stringify(lastCall('Inbox', 'enable').arg));
      await untilNode('lang en in the database', async () => (await sql('select lang from public.devices'))[0].lang === 'en');
      await p.evaluate(() => window.A.L.set('eg'));
      await untilNode('lang eg in the database', async () => (await sql('select lang from public.devices'))[0].lang === 'eg');
      const rows = await sql('select count(*)::int as n from public.devices');
      assert(rows[0].n === 1, 'devices: ' + rows[0].n);
      await p.evaluate(() => window.A.V.render(true));
    }, ['«أيوه، فعّلها»: asks Android for permission, registers this phone, and hands the plugin the token']);

    await step('Settings: the switch turns it off (and forgets the phone); refused permission keeps it off; on again', async () => {
      await closeSheets(p);
      await go(p, 'settings');
      await p.waitForSelector('#set-inbox', { timeout: 5000 });
      assert(await p.isChecked('#set-inbox'), 'switch is off');
      const label = await p.evaluate(() => document.getElementById('set-inbox-row').innerText);
      assert(label.includes('إشعارات التشجيع والردود'), 'row: ' + label);
      await p.click('#set-inbox-row .switch');
      await untilNode('disable', () => count('Inbox', 'disable') >= 1);
      await untilNode('device gone', async () => (await sql('select count(*)::int as n from public.devices'))[0].n === 0);
      await p.evaluate(() => (window.__perm = 'denied'));
      await until(p, 'switch re-rendered off', () => !document.getElementById('set-inbox').checked);
      await p.click('#set-inbox-row .switch');
      await until(p, 'warning toast', () => /إعدادات الموبايل/.test((document.getElementById('toasts') || {}).innerText || ''));
      assert((await sql('select count(*)::int as n from public.devices'))[0].n === 0, 'registered without permission');
      await until(p, 'switch back off', () => !document.getElementById('set-inbox').checked);
      await p.evaluate(() => (window.__perm = 'granted'));
      const n = count('Inbox', 'enable');
      await p.click('#set-inbox-row .switch');
      await untilNode('enable', () => count('Inbox', 'enable') > n);
      await untilNode('device back', async () => (await sql('select count(*)::int as n from public.devices'))[0].n === 1);
      token = lastCall('Inbox', 'enable').arg.token;
      await until(p, 'switch on', () => document.getElementById('set-inbox').checked);
      await H.shot(p, 'native-settings');
    }, ['«أيوه، فعّلها»: asks Android for permission, registers this phone, and hands the plugin the token']);

    await step('Widget: «no book yet», then the book and today\'s portion after a plan', async () => {
      await until(p, 'widget data', () => !!window.__widget);
      const w0 = await p.evaluate(() => window.__widget);
      assert(w0.empty && /مفيش كتاب/.test(w0.empty) && w0.rtl === true && w0.lang === 'eg', 'empty widget: ' + JSON.stringify(w0));
      await closeSheets(p);
      await go(p, 'home');
      await p.locator('[data-act="add-book"]:visible').first().click();
      await p.setInputFiles('#ab-file', PDF);
      await p.waitForSelector('#ab-form', { timeout: 30000 });
      await p.click('#ab-form button.btn.gold');
      await p.waitForSelector('#pl-form', { timeout: 30000 });
      await p.fill('#pl-per', '8');
      await T(200);
      await p.click('#pl-form button.btn.gold');
      await p.waitForFunction(() => [...window.A.S.books.values()].some((b) => (b.wirds || []).length === 5), null, { timeout: 15000 });
      bookId = await p.evaluate(() => [...window.A.S.books.values()][0].id);
      await closeSheets(p);
      await until(p, 'widget with the portion', () => window.__widget && window.__widget.line === 'الورد ١ • ص ١–٨');
      const w = await p.evaluate(() => window.__widget);
      assert(w.bookId === bookId && w.book && !w.empty, 'book: ' + JSON.stringify(w));
      assert(w.pct === 0 && w.done === false && w.progress === '٠ من ٨ صفحات' && w.short === 'الورد ١ • ٠ من ٨', 'progress: ' + JSON.stringify(w));
      assert(w.page === 1 && w.cta === 'يلا نقرأ', 'cta: ' + JSON.stringify(w));
      assert(w.goal === '٠ من ٥ صفحات النهارده' && w.goalNew === '٠ من ٥ صفحات النهارده', 'goal: ' + JSON.stringify(w));
      assert(w.day === (await p.evaluate(() => window.A.U.today())), 'day: ' + w.day);
      return `${w.book} — ${w.line}`;
    }, ['Sign in on the "phone"; after joining a circle the app asks once about notifications']);

    await step('Widget after reading pages: progress, the flame and today\'s goal move', async () => {
      const n = count('Widget', 'update');
      await p.evaluate(async (b) => {
        const { D, U } = window.A;
        // what the reader saves when pages count (reader.js: saveProg + addPagesToday)
        await D.saveProg(b, (c) => ({ seen: U.rangesAdd(c.seen, [1, 2, 3]), last: 3 }));
        await D.addPagesToday(3, 90);
      }, bookId);
      await until(p, 'widget progress', () => window.__widget && window.__widget.pct === 38);
      const w = await p.evaluate(() => window.__widget);
      assert(w.progress === '٣ من ٨ صفحات' && w.short === 'الورد ١ • ٣ من ٨', 'progress: ' + JSON.stringify(w));
      assert(w.page === 3 && w.cta === 'كمّل', 'continue: ' + JSON.stringify(w));
      assert(w.streak === '١', 'streak: ' + JSON.stringify(w));
      assert(w.goal === '٣ من ٥ صفحات النهارده' && w.goalDone === false, 'goal: ' + JSON.stringify(w));
      assert(count('Widget', 'update') - n <= 3, 'widget updated too often: ' + (count('Widget', 'update') - n));
      return `${w.progress}, 🔥${w.streak}, ${w.goal}`;
    }, ['Widget: «no book yet», then the book and today\'s portion after a plan']);

    await step('Widget after marking the portion done: on to the next portion', async () => {
      await closeSheets(p);
      await go(p, 'home');
      await p.click('.hero [data-act="mark-wird"]');
      await until(p, 'next portion', () => window.__widget && window.__widget.line === 'الورد ٢ • ص ٩–١٦');
      const w = await p.evaluate(() => window.__widget);
      assert(w.pct === 0 && w.page === 9 && w.short === 'الورد ٢ • ٠ من ٨', 'next portion: ' + JSON.stringify(w));
      await p.evaluate(() => window.A.L.set('en'));
      await until(p, 'English widget', () => window.__widget && window.__widget.lang === 'en');
      const en = await p.evaluate(() => window.__widget);
      assert(en.rtl === false && en.line === 'Portion 2 • p. 9–16' && en.goal === '3 of 5 pages today' && en.cta === 'Start reading', 'English: ' + JSON.stringify(en));
      await p.evaluate(() => window.A.L.set('eg'));
      await until(p, 'back to مصري', () => window.__widget && window.__widget.lang === 'eg');
      return en.line;
    }, ['Widget after reading pages: progress, the flame and today\'s goal move']);

    await step('A tapped notification opens «الجديد ليك»; the widget\'s button opens the book', async () => {
      await closeSheets(p);
      await go(p, 'books');
      await p.evaluate(() => {
        window.__launch = { open: 'inbox' };
        window.__launchFn && window.__launchFn({ open: 'inbox' });
      });
      await until(p, 'inbox sheet', () => !!document.querySelector('#layers .sheet-wrap.in ul.inbox, #layers .sheet-wrap.in .empty'));
      assert((await p.evaluate(() => window.A.V.state.route)) === 'home', 'not on «اليوم»');
      await closeSheets(p);
      await p.evaluate((b) => {
        window.__launch = { open: 'book', book: b, page: 9 };
        window.__launchFn && window.__launchFn({});
      }, bookId);
      await until(p, 'reader open', (b) => window.A.R.isOpen() && window.A.R.current().bookId === b, bookId, 15000);
      await p.evaluate(() => window.A.R.close());
      await T(300);
    }, ['Widget: «no book yet», then the book and today\'s portion after a plan']);

    await step('Sign-out: notifications off, the phone forgotten on the server, the widget emptied', async () => {
      await closeSheets(p);
      const d0 = count('Inbox', 'disable');
      await go(p, 'settings');
      await p.click('[data-auth="signout"]');
      await untilNode('Inbox.disable', () => count('Inbox', 'disable') > d0);
      await untilNode('Widget.clear', () => count('Widget', 'clear') >= 1);
      await untilNode('device gone', async () => (await sql('select count(*)::int as n from public.devices'))[0].n === 0);
      await p.waitForSelector('#auth-mail', { timeout: 15000 });
      const pref = await p.evaluate(() => localStorage.getItem('qs:inboxNotif'));
      assert(pref === null, 'pref kept after sign-out: ' + pref);
      return 'disable + unregister_device + Widget.clear';
    }, ['«أيوه، فعّلها»: asks Android for permission, registers this phone, and hands the plugin the token']);

    const errs = (p && p.__errors ? p.__errors : []).filter((e) => !/404|Failed to load resource|ERR_ABORTED/.test(e));
    await step('No unexpected errors in the page', async () => {
      assert(!errs.length, errs.slice(0, 5).join('\n'));
    });
  } finally {
    await browser.close().catch(() => {});
    await env.stop().catch(() => {});
  }
  const pass = results.filter((r) => r === 'PASS').length;
  const fail = results.filter((r) => r === 'FAIL').length;
  const skip = results.filter((r) => r === 'SKIP').length;
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  process.exit(fail || skip ? 1 : 0);
})();
