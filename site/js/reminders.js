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

  const text = () => ({
    title: L('وردك مستنيك 📖', 'Your reading is waiting 📖'),
    body: L('صفحات قليلة النهارده بتحافظ على سلسلتك 🔥 وبتقرّب الحلقة من هدفها.', 'A few pages today keep your streak alive 🔥 and move the circle closer to its goal.'),
  });

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
      if (on) U.toast(L(`هنفكّرك كل يوم الساعة ${L.num(hour)}:٠٠`, `We'll remind you every day at ${hour}:00`));
    } catch (e) {
      console.warn(e);
      U.toast(e && e.message === 'denied' ? L('لازم توافق على الإشعارات من إعدادات الموبايل', 'Allow notifications in your phone settings first') : L('مقدرتش أفعّل التذكير', "Couldn't turn on reminders"), 'warn');
    }
    V.render();
  };

  /* Re-schedule on start so a changed language or reinstall keeps the reminder alive. */
  R.boot = () => {
    const p = pref();
    if (p.on && P.native && P.plugin('LocalNotifications')) scheduleNative(p.hour).catch(() => {});
  };

  V.reminderSettings = () => {
    if (!R.available()) {
      if (!P.native && isIOS && !standalone() && P.cfg.vapidPublicKey)
        return `<div class="set-row"><span>${icon('clock')}${L('عشان التذكير يشتغل على آيفون: من Safari دوس مشاركة ← «إضافة إلى الشاشة الرئيسية» وافتح التطبيق من هناك.', 'For reminders on iPhone: in Safari tap Share → “Add to Home Screen”, then open the app from there.')}</span></div>`;
      return '';
    }
    const p = pref();
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${p.hour === h ? 'selected' : ''}>${L.num(h)}:${L.num(0, { minimumIntegerDigits: 2 })}</option>`).join('');
    return `<div class="set-row"><span>${icon('clock')}${L('تذكير يومي بالورد', 'Daily reading reminder')}</span>
      <span class="rm-ctl"><select id="set-remind-hour" aria-label="${L('الساعة', 'Time')}" ${p.on ? '' : 'disabled'}>${hours}</select><label class="switch"><input type="checkbox" id="set-remind" ${p.on ? 'checked' : ''}><i></i></label></span></div>`;
  };
  document.addEventListener('change', (e) => {
    if (e.target.id === 'set-remind') R.set(e.target.checked, +document.getElementById('set-remind-hour').value);
    if (e.target.id === 'set-remind-hour' && pref().on) R.set(true, +e.target.value);
  });
})();
