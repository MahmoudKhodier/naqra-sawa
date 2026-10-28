/* Android app updates: compare this build (versionCode = GitHub run number) with the android-latest
   release, show a banner when a newer one exists, then download it and open Android's installer.
   The web app updates itself through its service worker (main.js). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, V, P } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Upd = (A.Upd = { latest: null, current: 0, checking: false });

  const repo = () => {
    const m = /github\.com\/([^/]+)\/([^/]+)\/releases\//.exec((P.cfg && P.cfg.apkUrl) || '');
    return m ? `${m[1]}/${m[2]}` : null;
  };
  Upd.supported = () => !!(P.native && P.plugin('AppUpdate') && P.plugin('App') && repo());
  Upd.available = () => !!(Upd.latest && Upd.current && Upd.latest.build > Upd.current);

  /* Asks GitHub at most every 6 hours (or when forced from Settings). */
  Upd.check = async (force) => {
    if (!Upd.supported() || Upd.checking) return false;
    Upd.checking = true;
    try {
      const info = await P.plugin('App').getInfo();
      Upd.current = parseInt(info && info.build, 10) || 0;
      const cached = U.store.get('updLatest', null);
      if (!force && cached && Date.now() - U.store.get('updCheckedAt', 0) < 6 * 3600e3) Upd.latest = cached;
      else {
        const r = await fetch(`https://api.github.com/repos/${repo()}/releases/tags/android-latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        const m = /build\s*(\d+)/i.exec(j.name || '');
        const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
        Upd.latest = m && apk ? { build: +m[1], at: apk.updated_at || j.published_at, size: apk.size || 0 } : null;
        U.store.set('updLatest', Upd.latest);
        U.store.set('updCheckedAt', Date.now());
      }
      V.render();
      return Upd.available();
    } finally {
      Upd.checking = false;
    }
  };

  /* Banner on «اليوم» (dismissible per version). */
  Upd.banner = () => {
    if (!Upd.available() || U.store.get('updSkip', 0) === Upd.latest.build) return '';
    return `<section class="upd-bar">${icon('download')}<span><b>${L('في تحديث جديد للتطبيق', 'A new version of the app is ready')}</b><small>${L(`نسخة ${L.num(Upd.latest.build)} • إنت على ${L.num(Upd.current)}`, `Version ${Upd.latest.build} • you have ${Upd.current}`)}</small></span>
      <button class="btn sm gold" data-act="app-update">${L('حدّث', 'Update')}</button>
      <button class="ib sm" data-act="upd-skip" aria-label="${L('بعدين', 'Later')}">${icon('close')}</button></section>`;
  };
  V.actions['upd-skip'] = () => {
    U.store.set('updSkip', Upd.latest && Upd.latest.build);
    V.render();
  };

  /* Settings row: this version, and a check/update button. */
  Upd.settingsRow = () => {
    if (!Upd.supported()) return '';
    const status = Upd.available()
      ? `<button class="btn sm gold" data-act="app-update">${L(`حدّث لنسخة ${L.num(Upd.latest.build)}`, `Update to ${Upd.latest.build}`)}</button>`
      : `<button class="btn ghost sm" data-act="upd-check">${L('دوّر على تحديث', 'Check for updates')}</button>`;
    return `<div class="set-row"><span>${icon('download')}${L('نسخة التطبيق', 'App version')}: <b>${Upd.current ? L.num(Upd.current) : '…'}</b>${Upd.latest && !Upd.available() ? ` <small class="muted">${L('(أحدث نسخة)', '(latest)')}</small>` : ''}</span>${status}</div>`;
  };
  V.actions['upd-check'] = async () => {
    try {
      const yes = await Upd.check(true);
      if (!yes) U.toast(L('عندك أحدث نسخة ✓', "You're on the latest version ✓"));
    } catch (e) {
      U.toast(L('مقدرتش أوصل للسيرفر. جرّب تاني بعد شوية.', "Couldn't check right now. Try again later."), 'warn');
    }
  };

  /* Download with a progress bar, then Android shows its install screen. */
  V.actions['app-update'] = async () => {
    const AU = P.plugin('AppUpdate');
    if (!AU) return;
    const can = await AU.canInstall().catch(() => ({ allowed: true }));
    if (!can.allowed) {
      V.sheet({
        title: L('خطوة واحدة قبل التحديث', 'One step before updating'),
        html: `<p>${L('أندرويد محتاج تسمح لـ«نقرأ سوا» إنه يثبّت تحديثاته. دوس الزرار، فعّل «السماح من هذا المصدر»، وارجع دوس «حدّث» تاني.', 'Android needs you to let «نقرأ سوا» install its updates. Tap the button, turn on “Allow from this source”, then come back and tap Update again.')}</p>
          <div class="row-btns"><button class="btn gold" data-upd-perm data-close>${icon('gear')}${L('افتح الإعدادات', 'Open settings')}</button></div>`,
        onMount: (body) => body.querySelector('[data-upd-perm]').addEventListener('click', () => AU.openInstallSettings().catch(() => {})),
      });
      return;
    }
    const api = V.sheet({
      title: L('بنزّل التحديث…', 'Downloading the update…'),
      html: `<div class="upd-prog">${V.bar(0, 'gold big')}<small id="upd-pct">${L('بيبدأ…', 'Starting…')}</small><p class="muted sm">${L('بعد التحميل هتظهرلك شاشة التثبيت — دوس «تثبيت». كل حاجة بتاعتك محفوظة.', 'When it finishes, Android shows the install screen — tap Install. Everything of yours stays saved.')}</p></div>`,
    });
    const handle = await AU.addListener('progress', (p) => {
      const f = p.total > 0 ? p.loaded / p.total : 0;
      const bar = api.body.querySelector('.bar i');
      if (bar) bar.style.width = Math.round(f * 100) + '%';
      const t = api.body.querySelector('#upd-pct');
      if (t) t.textContent = p.total > 0 ? `${L.num(Math.round(f * 100))}${L.isAr() ? '٪' : '%'} • ${L.num(Math.round(p.total / 1048576))} MB` : `${L.num(Math.round(p.loaded / 1048576))} MB`;
    });
    try {
      await AU.install({ url: P.cfg.apkUrl });
      api.close();
    } catch (e) {
      api.close();
      U.toast(L('التحميل وقف. اتأكد من النت وجرّب تاني.', 'The download stopped. Check your connection and try again.'), 'warn');
    } finally {
      handle && handle.remove && handle.remove();
    }
  };

  // Check a few seconds after start, and again whenever the app comes back to the front.
  if (P.native) {
    setTimeout(() => Upd.check().catch(() => {}), 5000);
    document.addEventListener('visibilitychange', () => !document.hidden && Upd.check().catch(() => {}));
  }
  void esc;
})();
