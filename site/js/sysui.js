/* Android app: the strips around the page (status bar, navigation bar, camera cut-out) take the colour of what
   they border — the app background (light or dark), or the reader's bars and page — and the clock bar can hide while
   reading (the phone's navigation bar never hides).
   Nothing happens on the web. */
(function () {
  'use strict';
  const A = window.A;
  const { P } = A;
  const Sys = (A.Sys = {});
  const plug = () => (P.native ? P.plugin('SystemUi') : null);

  let last = '';
  Sys.paint = (c) => {
    const p = plug();
    if (!p || !p.paint) return;
    const key = JSON.stringify(c);
    if (key === last) return;
    last = key;
    p.paint(c).catch(() => (last = ''));
  };
  /* Colours for whatever is on screen now. */
  Sys.refresh = () => {
    const R = A.R;
    if (R && R.isOpen && R.isOpen() && R.sysColours) return Sys.paint(R.sysColours());
    const dark = A.V && A.V.isDark ? A.V.isDark() : false;
    const bg = dark ? '#0f1115' : '#f6f4ef';
    Sys.paint({ top: bg, bottom: bg, side: bg, light: !dark });
  };

  /* Reader orientation (Android app): 'landscape', 'portrait' or 'auto'. Returns false where it can't be set. */
  Sys.canOrient = () => !!(plug() && plug().orientation);
  Sys.orient = (mode) => {
    const p = plug();
    if (!p || !p.orientation) return false;
    p.orientation({ mode }).catch(() => {});
    return true;
  };

  let full = null;
  Sys.fullscreen = (on) => {
    const p = plug();
    if (!p || !p.fullscreen || full === on) return;
    full = on;
    p.fullscreen({ on }).catch(() => (full = null));
  };

  if (P.native) document.addEventListener('visibilitychange', () => !document.hidden && ((last = ''), Sys.refresh()));
})();
