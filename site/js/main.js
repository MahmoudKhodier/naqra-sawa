/* Boot: service worker, sign-in, circle, then the app. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, P } = A;

  V.applyTheme();
  L.apply();
  V.fromHash();

  const app = document.getElementById('app');
  app.innerHTML = `<div class="boot"><span class="star8 gold big spin"></span><b>${L('نقرأ سوا', 'Read Together')}</b><small>${L('بنجهّز الحلقة…', 'Getting the circle ready…')}</small></div>`;

  // Offline support for the installed web app (the Android app bundles its files instead).
  if ('serviceWorker' in navigator && !P.native && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        // A new version took over: reload when it won't interrupt anything (now if idle, else when the app is backgrounded).
        let reloaded = false;
        const hadController = !!navigator.serviceWorker.controller; // first install also fires controllerchange
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController) return;
          const safe = () => !A.R.isOpen() && !document.querySelector('.sheet-wrap') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
          const go = () => !reloaded && (reloaded = true) && location.reload();
          if (safe()) return go();
          const onHide = () => {
            if (!document.hidden) return;
            document.removeEventListener('visibilitychange', onHide);
            go();
          };
          document.addEventListener('visibilitychange', onHide);
        });
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w && w.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && w.postMessage({ type: 'SKIP_WAITING' }));
        });
      })
      .catch(() => {});
  }

  if (P.native) A.Auth.nativeBack();

  D.onChange(() => V.render());

  (async () => {
    try {
      if (P.configured) {
        P.sb().auth.onAuthStateChange((ev) => {
          if (ev === 'SIGNED_OUT') location.reload();
        });
        const session = await P.session().catch(() => null);
        if (!session) {
          A.Auth.readInvite();
          return A.Auth.signIn();
        }
        await A.Auth.enter(session);
        A.Remind && A.Remind.boot();
      } else if (window.claude) {
        await D.init(); // local development with the mock runtime
      } else {
        S.phase = 'nodb';
        V.render();
      }
    } catch (e) {
      console.error(e);
      S.phase = 'nodb';
      V.render();
    }
  })();

  // Keep relative times and the day's quests fresh.
  let day = U.today();
  setInterval(() => {
    if (document.hidden) return;
    if (U.today() !== day) {
      day = U.today();
      D.bump();
    } else if (S.phase === 'ready' && !A.R.isOpen() && !document.querySelector('.sheet-wrap') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) V.render();
  }, 60000);

  window.addEventListener('pagehide', () => A.R.flush && A.R.flush());
  document.addEventListener('visibilitychange', () => document.hidden && A.R.flush && A.R.flush());
})();
