/* Android app updates: compare this build (versionCode = GitHub run number) with the android-latest
   release; when a newer one exists, ask once per version (and again the next day if postponed), show a
   banner on «اليوم» and a dot on «إعدادات», then download the newest APK and open Android's installer.
   The download is always the newest build, so anyone who missed several updates installs one APK.
   The web app updates itself through its service worker (main.js). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, V, P } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Upd = (A.Upd = { latest: null, current: 0, checking: false });
  const RECHECK = 15 * 60e3; // ask GitHub again after 15 minutes (on start, on return to the app)

  const repo = () => {
    const m = /github\.com\/([^/]+)\/([^/]+)\/releases\//.exec((P.cfg && P.cfg.apkUrl) || '');
    return m ? `${m[1]}/${m[2]}` : null;
  };
  Upd.supported = () => !!(P.native && P.plugin('AppUpdate') && P.plugin('App') && repo());
  Upd.available = () => !!(Upd.latest && Upd.current && Upd.latest.build > Upd.current);
  /* Shown in the banner and as a dot on the Settings tab until updated or dismissed for this version. */
  Upd.nag = () => Upd.available() && U.store.get('updSkip', 0) !== Upd.latest.build;

  /* "What's new" lines published with each build (see android.yml): `build|مصري|English[|فصحى]`, newest first. */
  function parseNews(body) {
    const m = /<!--\s*whats-new\s*\n([\s\S]*?)-->/.exec(body || '');
    if (!m) return [];
    return m[1]
      .split('\n')
      .map((l) => l.trim().split('|'))
      .filter((p) => p.length >= 3 && /^\d+$/.test(p[0]))
      .map((p) => ({ b: +p[0], ar: p[1].trim(), en: (p[2] || p[1]).trim(), fu: (p[3] || p[1]).trim() }));
  }
  Upd.news = () => {
    if (!Upd.latest || !Upd.latest.news) return [];
    const seen = new Set();
    return Upd.latest.news.filter((n) => n.b > Upd.current && !seen.has(n.ar) && seen.add(n.ar)).slice(0, 14);
  };

  Upd.check = async (force) => {
    if (!Upd.supported() || Upd.checking) return false;
    Upd.checking = true;
    try {
      const info = await P.plugin('App').getInfo();
      Upd.current = parseInt(info && info.build, 10) || 0;
      const cached = U.store.get('updLatest', null);
      if (!force && cached && Date.now() - U.store.get('updCheckedAt', 0) < RECHECK) Upd.latest = cached;
      else {
        const r = await fetch(`https://api.github.com/repos/${repo()}/releases/tags/android-latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        const m = /build\s*(\d+)/i.exec(j.name || '');
        const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
        Upd.latest = m && apk ? { build: +m[1], at: apk.updated_at || j.published_at, size: apk.size || 0, news: parseNews(j.body) } : null;
        U.store.set('updLatest', Upd.latest);
        U.store.set('updCheckedAt', Date.now());
      }
      V.render();
      maybePrompt();
      return Upd.available();
    } finally {
      Upd.checking = false;
    }
  };

  const newsList = () => {
    const n = Upd.news();
    return n.length
      ? `<ul class="upd-news">${n.map((x) => `<li dir="auto">${esc(L(x.ar, x.en, x.fu))}</li>`).join('')}</ul>`
      : `<p class="muted">${L('تحسينات وإصلاحات.', 'Improvements and fixes.')}</p>`;
  };
  const sizeMb = () => (Upd.latest && Upd.latest.size ? ` • ${L.num(Math.max(1, Math.round(Upd.latest.size / 1048576)))} MB` : '');

  /* Ask once per version; "Later" asks again the next day. Never in the middle of reading or another sheet. */
  let promptedThisRun = 0;
  function maybePrompt() {
    if (!Upd.available()) return;
    const b = Upd.latest.build;
    if (promptedThisRun === b) return;
    const later = U.store.get('updLater', null);
    if (later && later.b === b && later.day === U.today()) return;
    if ((A.R && A.R.isOpen && A.R.isOpen()) || (V.sheets && V.sheets.length) || document.hidden) {
      setTimeout(maybePrompt, 20000);
      return;
    }
    promptedThisRun = b;
    const api = V.sheet({
      title: L('في نسخة جديدة من التطبيق 🎉', 'A new version is ready 🎉', 'نسخة جديدة من التطبيق جاهزة 🎉'),
      html: `<div class="upd-ask">
          <p class="upd-ver">${L(`نسخة ${L.num(b)}${sizeMb()} • إنت على ${L.num(Upd.current)}`, `Version ${b}${sizeMb()} • you have ${Upd.current}`, `نسخة ${L.num(b)}${sizeMb()} • نسختك ${L.num(Upd.current)}`)}</p>
          <h3>${L('الجديد', "What's new")}</h3>${newsList()}
          <p class="muted sm">${L('هتنزّل آخر نسخة على طول، حتى لو فاتك كذا تحديث. كل حاجة بتاعتك محفوظة.', "You get the newest version straight away, even if you missed a few. Everything of yours stays saved.", 'ستنزّل أحدث نسخة مباشرة، حتى لو فاتتك عدة تحديثات. كل بياناتك محفوظة.')}</p>
          <div class="row-btns"><button class="btn gold big" data-upd-now>${icon('download')}${L('حدّث دلوقتي', 'Update now', 'حدّث الآن')}</button><button class="btn ghost" data-upd-later>${L('بعدين', 'Later', 'لاحقًا')}</button></div>
        </div>`,
      onMount: (body, s) =>
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-upd-now]')) {
            s.close();
            V.actions['app-update']();
          } else if (e.target.closest('[data-upd-later]')) {
            U.store.set('updLater', { b, day: U.today() });
            s.close();
          }
        }),
    });
    api.onClose = () => !U.store.get('updLater', null) && U.store.set('updLater', { b, day: U.today() });
  }

  /* Banner on «اليوم» (dismissible per version). */
  Upd.banner = () => {
    if (!Upd.nag()) return '';
    return `<section class="upd-bar">${icon('download')}<span><b>${L('في تحديث جديد للتطبيق', 'A new version of the app is ready', 'يوجد تحديث جديد للتطبيق')}</b><small>${L(`نسخة ${L.num(Upd.latest.build)} • إنت على ${L.num(Upd.current)}`, `Version ${Upd.latest.build} • you have ${Upd.current}`, `نسخة ${L.num(Upd.latest.build)} • نسختك ${L.num(Upd.current)}`)}</small></span>
      <button class="btn sm gold" data-act="app-update">${L('حدّث', 'Update')}</button>
      <button class="ib sm" data-act="upd-skip" aria-label="${L('بعدين', 'Later', 'لاحقًا')}">${icon('close')}</button></section>`;
  };
  V.actions['upd-skip'] = () => {
    U.store.set('updSkip', Upd.latest && Upd.latest.build);
    V.render();
  };

  /* Settings row: this version, and a check/update button (plus what's new when there is an update). */
  Upd.settingsRow = () => {
    if (!Upd.supported()) return '';
    const status = Upd.available()
      ? `<button class="btn sm gold" data-act="app-update">${L(`حدّث لنسخة ${L.num(Upd.latest.build)}`, `Update to ${Upd.latest.build}`, `حدّث إلى النسخة ${L.num(Upd.latest.build)}`)}</button>`
      : `<button class="btn ghost sm" data-act="upd-check">${Upd.checking ? L('بيدوّر…', 'Checking…', 'جارٍ البحث…') : L('دوّر على تحديث', 'Check for updates', 'ابحث عن تحديث')}</button>`;
    return `<div class="set-row upd-row"><span>${icon('download')}${L('نسخة التطبيق', 'App version')}: <b>${Upd.current ? L.num(Upd.current) : '…'}</b>${Upd.latest && !Upd.available() ? ` <small class="muted">${L('(أحدث نسخة)', '(latest)')}</small>` : ''}</span>${status}
      ${Upd.available() ? `<div class="upd-row-news">${newsList()}</div>` : ''}</div>`;
  };
  V.actions['upd-check'] = async () => {
    try {
      const yes = await Upd.check(true);
      if (!yes) U.toast(L('عندك أحدث نسخة ✓', "You're on the latest version ✓", 'لديك أحدث نسخة ✓'));
    } catch (e) {
      U.toast(L('مقدرتش أوصل للسيرفر. جرّب تاني بعد شوية.', "Couldn't check right now. Try again later.", 'تعذّر الاتصال بالخادم. حاول مجددًا بعد قليل.'), 'warn');
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
        html: `<p>${L('أندرويد محتاج تسمح لـ«نقرأ سوا» إنه يثبّت تحديثاته. دوس الزرار، فعّل «السماح من هذا المصدر»، وارجع دوس «حدّث» تاني.', 'Android needs you to let «نقرأ سوا» install its updates. Tap the button, turn on “Allow from this source”, then come back and tap Update again.', 'يحتاج أندرويد إلى إذنك كي يثبّت «نقرأ سوا» تحديثاته. اضغط الزر، وفعّل «السماح من هذا المصدر»، ثم عد واضغط «حدّث» مجددًا.')}</p>
          <div class="row-btns"><button class="btn gold" data-upd-perm data-close>${icon('gear')}${L('افتح الإعدادات', 'Open settings')}</button></div>`,
        onMount: (body) => body.querySelector('[data-upd-perm]').addEventListener('click', () => AU.openInstallSettings().catch(() => {})),
      });
      return;
    }
    // Make sure we know the newest build before downloading (someone may have missed several).
    try {
      await Upd.check(true);
    } catch (e) {}
    const api = V.sheet({
      title: L('بنزّل التحديث…', 'Downloading the update…', 'جارٍ تنزيل التحديث…'),
      html: `<div class="upd-prog">${V.bar(0, 'gold big')}<small id="upd-pct">${L('بيبدأ…', 'Starting…', 'جارٍ البدء…')}</small><p class="muted sm">${L('بعد التحميل هتظهرلك شاشة التثبيت — دوس «تثبيت». كل حاجة بتاعتك محفوظة.', 'When it finishes, Android shows the install screen — tap Install. Everything of yours stays saved.', 'بعد التنزيل ستظهر شاشة التثبيت — اضغط «تثبيت». كل بياناتك محفوظة.')}</p></div>`,
    });
    const handle = await AU.addListener('progress', (p) => {
      const f = p.total > 0 ? p.loaded / p.total : 0;
      const bar = api.body.querySelector('.bar i');
      if (bar) bar.style.width = Math.round(f * 100) + '%';
      const t = api.body.querySelector('#upd-pct');
      if (t) t.textContent = p.total > 0 ? `${L.num(Math.round(f * 100))}${L.isAr() ? '٪' : '%'} • ${L.num(Math.round(p.total / 1048576))} MB` : `${L.num(Math.round(p.loaded / 1048576))} MB`;
    });
    try {
      await AU.install({ url: P.cfg.apkUrl, minBuild: (Upd.latest && Upd.latest.build) || 0 });
      api.close();
    } catch (e) {
      api.close();
      const stale = /stale/.test(String((e && e.message) || e));
      U.toast(
        stale
          ? L('النسخة الجديدة لسه بتتجهّز. جرّب كمان دقيقتين.', 'The new version is still being published. Try again in two minutes.', 'النسخة الجديدة قيد التجهيز. حاول مجددًا بعد دقيقتين.')
          : L('التحميل وقف. اتأكد من النت وجرّب تاني.', 'The download stopped. Check your connection and try again.', 'توقف التنزيل. تأكد من اتصالك وحاول مجددًا.'),
        'warn',
      );
    } finally {
      handle && handle.remove && handle.remove();
    }
  };

  // Check a few seconds after start, and whenever the app comes back to the front (at most every 15 minutes).
  if (P.native) {
    setTimeout(() => Upd.check().catch(() => {}), 4000);
    document.addEventListener('visibilitychange', () => !document.hidden && Upd.check().catch(() => {}));
  }
})();
