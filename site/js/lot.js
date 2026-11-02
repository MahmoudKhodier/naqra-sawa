/* Animated emoji (Google's Noto Animated Emoji, CC BY 4.0, in site/anim/<code>.json) played with lottie-web
   (vendor/lottie_light.min.js, loaded the first time one is needed).

   Screens are re-rendered often, so animations are not tied to the HTML: a placeholder
     <i class="lot" data-lot="1f981" data-key="me-mascot"></i>
   is filled by Lot.mount(root) after each render; the same key gets back the same running animation (moved, not
   rebuilt), animations off screen pause, ones gone for a while are destroyed, and with reduced motion they show a
   still frame. Lot.play(el, code, opts) plays one right away (effects that run once). */
(function () {
  'use strict';
  const A = window.A;
  const Lot = (A.Lot = {});
  const jsons = new Map(); // code → Promise<string> (parsed fresh for each player: lottie changes the data it gets)
  let lib = null;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Lot.has = (code) => !!code;
  /* The emoji's code as the files are named: code points in hex joined by «_» (2764_fe0f). */
  Lot.code = (emoji) =>
    Array.from(String(emoji || ''))
      .map((c) => c.codePointAt(0).toString(16))
      .join('_');
  function load() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lib) return lib;
    lib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/lottie_light.min.js';
      s.onload = () => res(window.lottie);
      s.onerror = rej;
      document.head.appendChild(s);
    });
    return lib;
  }
  const data = (code) => {
    if (!jsons.has(code)) jsons.set(code, fetch('anim/' + code + '.json').then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))));
    return jsons.get(code);
  };
  Lot.preload = (codes) => codes.forEach((c) => data(c).catch(() => {}));
  /* Play into el (emptied first). opts: loop (default true), autoplay, speed, once(anim) at the end, frame. */
  Lot.play = (el, code, o = {}) =>
    Promise.all([load(), data(code)])
      .then(([lottie, txt]) => {
        if (!el.isConnected && !o.detached) return null;
        el.textContent = '';
        const a = lottie.loadAnimation({ container: el, renderer: 'svg', loop: o.loop !== false, autoplay: false, animationData: JSON.parse(txt), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
        if (o.speed) a.setSpeed(o.speed);
        if (reduced() && o.loop !== false) a.goToAndStop(Math.floor(a.totalFrames / 2), true);
        else if (o.frame != null) a.goToAndStop(o.frame, true);
        else if (o.autoplay !== false) a.play();
        if (o.once) a.addEventListener('complete', () => o.once(a));
        if (!o.keep) live.add({ a, el }); // one-off players: destroyed as soon as their element is gone
        return a;
      })
      .catch(() => {
        // offline before it was ever fetched, or no such animation: the plain emoji instead
        if (o.fallback) el.textContent = o.fallback;
        return null;
      });

  /* ---------- placeholders that survive re-renders ---------- */
  const live = new Set(); // players not kept by a key
  // a player whose element left the page stops for good (no animation runs on after its screen is gone)
  setInterval(() => {
    for (const r of live) {
      if (r.el.isConnected) continue;
      try { r.a.destroy(); } catch (e) {}
      live.delete(r);
    }
  }, 2500);
  const pool = new Map(); // key → {anim, svg, code, gone}
  let io = null;
  const watch = (el, rec) => {
    if (!('IntersectionObserver' in window)) return;
    io = io || new IntersectionObserver((entries) => {
      for (const e of entries) {
        const r = e.target._lot;
        if (!r || !r.anim || r.still) continue;
        if (e.isIntersecting && !document.hidden) r.anim.play();
        else r.anim.pause();
      }
    });
    el._lot = rec;
    io.observe(el);
  };
  Lot.mount = (root) => {
    if (!root || !root.querySelectorAll) return;
    for (const el of root.querySelectorAll('[data-lot]')) {
      if (el.firstChild) continue;
      const code = el.dataset.lot;
      const key = (el.dataset.key || '') + '|' + code;
      const still = el.dataset.still != null;
      const rec = pool.get(key);
      if (rec && rec.svg && !rec.svg.isConnected) {
        el.appendChild(rec.svg); // the same animation, moved into the new screen
        rec.gone = 0;
        watch(el, rec);
        continue;
      }
      const r = { code, still, gone: 0, anim: null, svg: null };
      if (el.dataset.key) pool.set(key, r);
      Lot.play(el, code, { fallback: el.dataset.fb || '', frame: still ? +el.dataset.still || 30 : null, keep: !!el.dataset.key }).then((a) => {
        if (!a) return;
        r.anim = a;
        r.svg = el.querySelector('svg');
        watch(el, r);
      });
    }
  };
  // animations whose screen is gone: destroyed after ~20 s (coming back sooner reuses them)
  setInterval(() => {
    for (const [k, r] of pool) {
      if (r.svg && !r.svg.isConnected) {
        if (++r.gone > 2) {
          try { r.anim && r.anim.destroy(); } catch (e) {}
          pool.delete(k);
        }
      }
    }
  }, 8000);
  document.addEventListener('visibilitychange', () => {
    for (const r of pool.values()) if (r.anim && !r.still) document.hidden ? r.anim.pause() : r.svg && r.svg.isConnected && r.anim.play();
  });
  /* after every render, and in sheets */
  if (A.V) {
    A.V.after = A.V.after || [];
    A.V.after.push((scr) => Lot.mount(scr));
  }
})();
