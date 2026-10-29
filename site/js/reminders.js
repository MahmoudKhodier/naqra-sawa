/* Daily reading reminders.
   Android app: scheduled on the phone itself (no server needed).
   Installed web app: Web Push, sent by the `notify` Supabase function (needs vapidPublicKey in config.js). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, V, P } = A;
  const icon = U.icon;
  const R = (A.Remind = {});
  const NOTIF_ID = 4242;

  const pref = () => U.store.get('remind', { on: false, hour: 20 });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  R.webPushReady = () => !!(P.cfg.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  R.available = () => (P.native ? !!P.plugin('LocalNotifications') : R.webPushReady());

  const text = () => {
    // Behind on a book? Say so gently, with how much is left.
    let late = 0, pages = 0;
    try {
      for (const b of A.S.books.values()) {
        if ((b.status || 'reading') !== 'reading') continue;
        const bh = A.G.behind(b);
        late += bh.late.length;
        pages += bh.pages;
      }
    } catch (e) {}
    if (late)
      return {
        title: L('يلا نلحق الحلقة 📖', "Let's catch up with the circle 📖", 'هيا نلحق بالحلقة 📖'),
        body: L(`فاضلك ${L.count(late, 'wird')} (${L.count(pages, 'page')}). شوية كل يوم وهتلحقهم.`, `${late} portion${late > 1 ? 's' : ''} (${pages} pages) to go. A little every day and you'll catch up.`, `بقي لك ${L.count(late, 'wird', 'nom')} (${L.count(pages, 'page', 'nom')}). اقرأ قليلًا كل يوم وستلحق بها.`),
      };
    return {
      title: L('وردك مستنيك 📖', 'Your reading is waiting 📖', 'وردك بانتظارك 📖'),
      body: L('صفحات قليلة النهارده بتحافظ على سلسلتك 🔥 وبتقرّب الحلقة من هدفها.', 'A few pages today keep your streak alive 🔥 and move the circle closer to its goal.', 'صفحات قليلة اليوم تحافظ على سلسلتك 🔥 وتقرّب الحلقة من هدفها.'),
    };
  };

  async function scheduleNative(hour) {
    const LN = P.plugin('LocalNotifications');
    const perm = await LN.requestPermissions();
    if (perm.display !== 'granted') throw new Error('denied');
    await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
    const t = text();
    await LN.schedule({ notifications: [{ id: NOTIF_ID, title: t.title, body: t.body, isExactNotification: false, schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true } }] });
  }
  async function cancelNative() {
    const LN = P.plugin('LocalNotifications');
    if (LN) await LN.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  }

  const b64ToBytes = (b64) => {
    const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };
  async function subscribeWeb(hour) {
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(P.cfg.vapidPublicKey) });
    const j = sub.toJSON();
    const { error } = await P.sb().rpc('save_push_subscription', { p_endpoint: j.endpoint, p_keys: j.keys, p_remind_hour: hour, p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo', p_lang: L.lang() });
    if (error) throw error;
  }
  async function unsubscribeWeb() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await P.sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }

  R.set = async (on, hour) => {
    try {
      if (P.native) on ? await scheduleNative(hour) : await cancelNative();
      else on ? await subscribeWeb(hour) : await unsubscribeWeb();
      U.store.set('remind', { on, hour });
      if (on) U.toast(L(`هنفكّرك كل يوم الساعة ${L.num(hour)}:٠٠`, `We'll remind you every day at ${hour}:00`, `سنذكّرك كل يوم في الساعة ${L.num(hour)}:٠٠`));
    } catch (e) {
      console.warn(e);
      U.toast(e && e.message === 'denied' ? L('لازم توافق على الإشعارات من إعدادات الموبايل', 'Allow notifications in your phone settings first', 'اسمح بالإشعارات من إعدادات الهاتف أولًا') : L('مقدرتش أفعّل التذكير', "Couldn't turn on reminders", 'تعذّر تفعيل التذكير'), 'warn');
    }
    V.render();
  };

  /* Re-schedule on start so a changed language or reinstall keeps the reminder alive. */
  R.boot = () => {
    const p = pref();
    if (p.on && P.native && P.plugin('LocalNotifications')) scheduleNative(p.hour).catch(() => {});
  };

  const dailySettings = () => {
    if (!R.available()) {
      if (!P.native && isIOS && !standalone() && P.cfg.vapidPublicKey)
        return `<div class="set-row"><span>${icon('clock')}${L('عشان التذكير يشتغل على آيفون: من Safari دوس مشاركة ← «إضافة إلى الشاشة الرئيسية» وافتح التطبيق من هناك.', 'For reminders on iPhone: in Safari tap Share → “Add to Home Screen”, then open the app from there.', 'لتفعيل التذكير على آيفون: في Safari اضغط مشاركة ← «إضافة إلى الشاشة الرئيسية» ثم افتح التطبيق من هناك.')}</span></div>`;
      return '';
    }
    const p = pref();
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${p.hour === h ? 'selected' : ''}>${L.num(h)}:${L.num(0, { minimumIntegerDigits: 2 })}</option>`).join('');
    return `<div class="set-row"><span>${icon('clock')}${L('تذكير يومي بالورد', 'Daily reading reminder')}</span>
      <span class="rm-ctl"><select id="set-remind-hour" aria-label="${L('الساعة', 'Time')}" ${p.on ? '' : 'disabled'}>${hours}</select><label class="switch"><input type="checkbox" id="set-remind" ${p.on ? 'checked' : ''}><i></i></label></span></div>`;
  };
  V.reminderSettings = () => dailySettings() + inboxSettings();
  document.addEventListener('change', (e) => {
    if (e.target.id === 'set-remind') R.set(e.target.checked, +document.getElementById('set-remind-hour').value);
    if (e.target.id === 'set-remind-hour' && pref().on) R.set(true, +e.target.value);
    if (e.target.id === 'set-inbox') e.target.checked ? IN.enable(true) : IN.disable();
  });

  /* ---------- Android app: cheers, nudges and replies as notifications, even with the app closed ----------
     No push service: the app's InboxPlugin asks the database about every 15 minutes (RPC device_inbox) with a
     random token of this phone, registered for my account with register_device. Asked once in a small sheet;
     after that it lives in Settings. Signing out turns it off and forgets the phone (A.Remind.beforeSignOut). */
  const IN = (R.inbox = {});
  const inboxPlug = () => (P.native ? P.plugin('Inbox') : null);
  IN.available = () => {
    const p = inboxPlug();
    return !!(p && p.enable && P.configured && P.sb && P.sb());
  };
  const ipref = () => U.store.get('inboxNotif', null); // {on, token, lang} | {on: false, asked: true} | null (never asked)
  const newToken = () => {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  };
  async function register(token) {
    const { error } = await P.sb().rpc('register_device', { p_token: token, p_lang: L.lang() });
    if (error) throw error;
    await inboxPlug().enable({ url: P.cfg.supabaseUrl, anonKey: P.cfg.supabaseAnonKey, token, lang: L.lang() });
    U.store.set('inboxNotif', { on: true, token, lang: L.lang() });
  }
  let busy = false;
  IN.enable = async (loud) => {
    if (!IN.available() || busy) return false;
    busy = true;
    try {
      const perm = await inboxPlug().requestPermission().catch(() => ({ display: 'granted' }));
      if (!perm || perm.display !== 'granted') {
        U.store.set('inboxNotif', { on: false, asked: true });
        U.toast(L('لازم توافق على الإشعارات من إعدادات الموبايل', 'Allow notifications in your phone settings first', 'اسمح بالإشعارات من إعدادات الهاتف أولًا'), 'warn');
        return false;
      }
      await register((ipref() || {}).token || newToken());
      if (loud) U.toast(`${icon('bell')}<span>${L('تمام! هيوصلك التشجيع والردود حتى والتطبيق مقفول', "Done! Cheers and replies will reach you even when the app is closed", 'تم! سيصلك التشجيع والردود حتى والتطبيق مغلق')}</span>`);
      return true;
    } catch (e) {
      console.warn('inbox notifications', e);
      U.toast(L('مقدرتش أفعّل الإشعارات. جرّب تاني لما النت يبقى كويس', "Couldn't turn on notifications. Try again when you're online", 'تعذّر تفعيل الإشعارات. حاول مجددًا عند توفر الاتصال'), 'warn');
      return false;
    } finally {
      busy = false;
      V.render();
      syncSwitch();
    }
  };
  // the screen patch keeps a clicked checkbox's state: put the switch back to what is really stored
  const syncSwitch = () => {
    const el = document.getElementById('set-inbox');
    if (el) el.checked = !!(ipref() || {}).on;
  };
  /* forget: also tell the server to drop this phone (signed in only) */
  IN.disable = async () => {
    const p = ipref() || {};
    U.store.set('inboxNotif', { on: false, asked: true });
    const plug = inboxPlug();
    if (plug && plug.disable) await plug.disable().catch(() => {});
    if (p.token && P.sb && P.sb()) {
      try {
        await P.sb().rpc('unregister_device', { p_token: p.token }); // a thenable, not a Promise
      } catch (e) {}
    }
    V.render();
    syncSwitch();
  };
  /* On start: keep the phone's check scheduled, and re-register when the app language changed. */
  IN.boot = async () => {
    const p = ipref();
    if (!p || !p.on || !p.token || !IN.available() || busy) return;
    try {
      if (p.lang !== L.lang()) await register(p.token);
      else await inboxPlug().enable({ url: P.cfg.supabaseUrl, anonKey: P.cfg.supabaseAnonKey, token: p.token, lang: p.lang });
    } catch (e) {
      console.warn('inbox notifications', e);
    }
  };
  const setLang = L.set;
  L.set = function () {
    const r = setLang.apply(this, arguments);
    setTimeout(IN.boot, 0);
    return r;
  };

  function inboxSettings() {
    if (!IN.available()) return '';
    const on = !!(ipref() || {}).on;
    return `<div class="set-row" id="set-inbox-row"><span>${icon('bell')}<span>${L('إشعارات التشجيع والردود', 'Cheer and reply notifications', 'إشعارات التشجيع والردود')}<small class="muted">${L('بتوصلك حتى والتطبيق مقفول (كل ربع ساعة تقريبًا)', 'Even when the app is closed (about every 15 minutes)', 'تصلك حتى والتطبيق مغلق (كل ربع ساعة تقريبًا)')}</small></span></span><label class="switch"><input type="checkbox" id="set-inbox" ${on ? 'checked' : ''}><i></i></label></div>`;
  }

  /* Asked once, gently: a few seconds after the app is ready, when nothing else is on screen. */
  let askTries = 0;
  IN.maybeAsk = () => {
    if (ipref() || !IN.available()) return;
    // not in a circle yet (just signed up), reading, or another sheet open: try again a bit later
    const later = !A.D.joined() || (A.R && A.R.isOpen()) || (V.sheets && V.sheets.length) || A.S.phase !== 'ready';
    if (later) return ++askTries < 120 && setTimeout(IN.maybeAsk, 5000);
    if (!A.D.canWrite()) return;
    let answered = false;
    const api = V.sheet({
      title: `${icon('bell')} ${L('يوصلك التشجيع والردود؟', 'Get cheers and replies?', 'هل يصلك التشجيع والردود؟')}`,
      html: `<div class="inbox-ask">
        <p>${L('لما حد في الحلقة يشجعك، أو يفكّرك بالورد، أو يرد على ملاحظتك أو رسالتك — يوصلك إشعار حتى لو التطبيق مقفول.', 'When someone in your circle cheers you on, nudges you about your reading, or replies to your note or message, you get a notification even when the app is closed.', 'عندما يشجعك أحد في الحلقة، أو يذكّرك بالورد، أو يرد على ملاحظتك أو رسالتك، يصلك إشعار حتى لو كان التطبيق مغلقًا.')}</p>
        <p class="muted sm">${L('تقدر تقفلها في أي وقت من الإعدادات.', 'You can turn it off any time in Settings.', 'يمكنك إيقافها في أي وقت من الإعدادات.')}</p>
        <div class="row-btns end"><button class="btn ghost" data-inbox-ask="no">${L('مش دلوقتي', 'Not now', 'ليس الآن')}</button><button class="btn gold" data-inbox-ask="yes">${icon('bell')}${L('أيوه، فعّلها', 'Yes, turn on', 'نعم، فعّلها')}</button></div>
      </div>`,
      onMount(body) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-inbox-ask]');
          if (!b) return;
          const yes = b.dataset.inboxAsk === 'yes';
          answered = true;
          api.close();
          if (yes) IN.enable(true);
          else U.store.set('inboxNotif', { on: false, asked: true });
        });
      },
    });
    api.onClose = () => {
      // closed without an answer counts as «not now»: it stays in Settings, never asked again
      if (!answered && !ipref()) U.store.set('inboxNotif', { on: false, asked: true });
    };
  };

  /* A tapped notification or widget: open «الجديد ليك», «اليوم», or the book. */
  IN.launch = async () => {
    const p = inboxPlug();
    if (!p || !p.takeLaunch) return;
    let r = null;
    try {
      r = await p.takeLaunch();
    } catch (e) {}
    if (!r || !r.open) return;
    for (let i = 0; i < 60 && !(A.S.phase === 'ready' && A.S.loaded.books && A.D.joined()); i++) await new Promise((ok) => setTimeout(ok, 250));
    if (!A.D.joined()) return;
    if (r.open === 'book' && r.book && A.S.books.get(r.book)) {
      if (A.R.isOpen() && A.R.current && A.R.current().bookId === r.book) return;
      if (A.R.isOpen()) A.R.close();
      return A.R.open(r.book, r.page ? { page: +r.page } : {});
    }
    if (A.R.isOpen()) A.R.close();
    while (V.sheets && V.sheets.length) V.sheets[V.sheets.length - 1].close();
    V.go('home');
    if (r.open === 'inbox' && V.openInbox) V.openInbox();
  };
  let launchHooked = false;
  const hookLaunch = () => {
    const p = inboxPlug();
    if (launchHooked || !p) return;
    launchHooked = true;
    if (p.addListener) Promise.resolve(p.addListener('launch', () => IN.launch())).catch(() => {});
    document.addEventListener('visibilitychange', () => !document.hidden && IN.launch());
  };

  /* Called from main.js after sign-in (twice: right away and once the circle has synced). */
  let booted = false;
  const remindBoot = R.boot;
  R.boot = () => {
    remindBoot();
    hookLaunch();
    IN.launch();
    IN.boot();
    if (!booted) {
      booted = true;
      setTimeout(IN.maybeAsk, 4000);
    }
  };

  /* Sign-out (auth.js): stop the phone's checks, forget it on the server, empty the widget. Never waits > 4 s. */
  R.beforeSignOut = () =>
    Promise.race([
      Promise.all([IN.disable().catch(() => {}), A.Widget && A.Widget.clear ? A.Widget.clear() : null]),
      new Promise((ok) => setTimeout(ok, 4000)),
    ]);
})();
