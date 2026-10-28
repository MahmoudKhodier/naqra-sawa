/* نقرأ سوا — shared helpers */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  const U = (A.U = {});

  U.CDN = {
    pdfjs: 'vendor/pdf.min.js',
    pdflib: 'vendor/pdf-lib.min.js',
  };

  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  U.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  U.rid = (n = 14) => {
    const abc = 'abcdefghijkmnopqrstuvwxyz0123456789';
    const r = crypto.getRandomValues(new Uint8Array(n));
    let s = '';
    for (const x of r) s += abc[x % abc.length];
    return s;
  };

  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* ---------- dates (local calendar days as YYYY-MM-DD) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  U.dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  U.today = () => U.dkey(new Date());
  U.parseD = (k) => {
    const [y, m, d] = String(k).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  U.addDays = (k, n) => {
    const d = U.parseD(k);
    d.setDate(d.getDate() + n);
    return U.dkey(d);
  };
  U.diffDays = (a, b) => Math.round((U.parseD(b) - U.parseD(a)) / 864e5);
  /* Weeks start on Saturday (Egyptian week). */
  U.weekStart = (k = U.today()) => {
    const d = U.parseD(k);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    return U.dkey(d);
  };
  U.isoKey = (iso) => (iso ? U.dkey(new Date(iso)) : null);
  U.nowIso = () => new Date().toISOString();

  /* ---------- page ranges [[a,b],...] sorted & merged ---------- */
  U.rangesAdd = (ranges, pages) => {
    const all = (ranges || []).map((r) => [r[0], r[1]]);
    for (const p of pages) all.push([p, p]);
    all.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const r of all) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else out.push(r);
    }
    return out;
  };
  U.rangesCount = (ranges) => (ranges || []).reduce((s, r) => s + (r[1] - r[0] + 1), 0);
  U.rangesCountIn = (ranges, a, b) =>
    (ranges || []).reduce((s, r) => s + Math.max(0, Math.min(r[1], b) - Math.max(r[0], a) + 1), 0);
  U.rangesHas = (ranges, p) => (ranges || []).some((r) => p >= r[0] && p <= r[1]);

  U.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  U.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('qs:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      if (window.__qsSigningOut) return;
      try {
        localStorage.setItem('qs:' + k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  U.loadScript = (src) =>
    new Promise((res, rej) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded) return res();
        existing.addEventListener('load', () => res());
        existing.addEventListener('error', () => rej(new Error('script')));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.src = src;
      s.onload = () => {
        s.dataset.loaded = '1';
        res();
      };
      s.onerror = () => rej(new Error('script ' + src));
      document.head.appendChild(s);
    });

  /* ---------- blob cache in IndexedDB (books open instantly the second time) ---------- */
  U.cache = (() => {
    let dbp = null;
    const LIMIT = 450 * 1024 * 1024;
    function open() {
      if (!dbp)
        dbp = new Promise((res, rej) => {
          try {
            const r = indexedDB.open('qs-books', 1);
            r.onupgradeneeded = () => {
              r.result.createObjectStore('blobs');
            };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          } catch (e) {
            rej(e);
          }
        });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(
        (db) =>
          new Promise((res) => {
            let out = null;
            try {
              const t = db.transaction('blobs', mode);
              out = fn(t.objectStore('blobs'));
              t.oncomplete = () => res(out && 'result' in out ? out.result : null);
              t.onerror = () => res(null);
              t.onabort = () => res(null);
            } catch (e) {
              res(null);
            }
          })
      );
    }
    const index = () => U.store.get('cacheIndex', {});
    return {
      async get(key) {
        try {
          const v = await tx('readonly', (s) => s.get(key));
          if (v) {
            const ix = index();
            if (ix[key]) {
              ix[key].t = Date.now();
              U.store.set('cacheIndex', ix);
            }
          }
          return v || null;
        } catch (e) {
          return null;
        }
      },
      async put(key, buf) {
        try {
          const ix = index();
          ix[key] = { size: buf.byteLength || 0, t: Date.now() };
          let total = Object.values(ix).reduce((s, x) => s + x.size, 0);
          const old = Object.entries(ix).sort((a, b) => a[1].t - b[1].t);
          for (const [k, v] of old) {
            if (total <= LIMIT || k === key) continue;
            await tx('readwrite', (s) => s.delete(k));
            delete ix[k];
            total -= v.size;
          }
          U.store.set('cacheIndex', ix);
          await tx('readwrite', (s) => s.put(buf, key));
        } catch (e) {}
      },
    };
  })();

  U.fetchBuf = async (url, onProg) => {
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error('http ' + r.status);
      e.status = r.status;
      throw e;
    }
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !r.body.getReader || !total) {
      const b = await r.arrayBuffer();
      onProg && onProg(1);
      return b;
    }
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProg && onProg(Math.min(1, got / total));
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out.buffer;
  };

  /* ---------- colours for generated covers / spines ---------- */
  U.SPINES = [
    ['#23408f', '#f6d77a'],
    ['#0f7a5a', '#f3efe2'],
    ['#b23a1d', '#fbe3b6'],
    ['#6b2f80', '#f2d7ff'],
    ['#1d5d7a', '#d7f0ff'],
    ['#8a5a12', '#fff1cc'],
    ['#2c2f45', '#e9c46a'],
    ['#9c2b4e', '#ffd9e4'],
    ['#3c6b2a', '#e8f5c8'],
    ['#14576b', '#ffe3a3'],
  ];
  U.spineOf = (s) => U.SPINES[U.hash(String(s || '')) % U.SPINES.length];

  U.col = (c, d = '#f5c542') => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : d);
  U.isArabic = (s) => /[؀-ۿ]/.test(String(s || ''));

  /* ---------- icons (24px stroke) ---------- */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    books: '<path d="M4 4h4v16H4z"/><path d="M10 4h4v16h-4z"/><path d="m16.5 4.6 3.6-.9 3 15.6-3.6.8z" transform="translate(-2 0)"/>',
    shelf: '<path d="M3 20h18"/><path d="M5 20V8h3v12"/><path d="M9.5 20V5h3v15"/><path d="m14.5 20 2.2-13 3 .5-2.2 12.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.8 14.2c2.4-.3 4.3 1.2 4.8 4.3"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    fwd: '<path d="M9 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    flame: '<path d="M12 3c.6 3.2 4.8 5.2 4.8 10a4.8 4.8 0 1 1-9.6 0c0-2.3 1.2-3.8 2.4-4.8.2 1.6.9 2.6 2 3 0-3.2-.7-5.6.4-8.2z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
    hl: '<path d="m4 20 3.5-1 10-10-2.5-2.5-10 10z"/><path d="m14 6.5 2.5 2.5"/><path d="M13 20h7"/>',
    pin: '<path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    zin: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M11 8v6M8 11h6"/>',
    zout: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M8 11h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10"/><path d="M7 4a2 2 0 0 0-2 2v11"/><path d="M9 9h4M9 12.5h4"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 16V5"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8"/><path d="M12 13v3.5M8.5 20h7l-.8-3.5h-5.4z"/>',
    chest: '<path d="M4 10h16v9H4z"/><path d="M4 10c0-3 2-5 5-5h6c3 0 5 2 5 5"/><path d="M10 10v3h4v-3"/>',
    hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.6 0-4.1-1.3-5.3-3.5L4 13.6a1.5 1.5 0 0 1 2.5-1.6L8 14"/>',
    clap: '<path d="m7 12 4.5-4.5a1.4 1.4 0 0 1 2 2L10 13"/><path d="m9.5 9.5 3.8-3.8a1.4 1.4 0 0 1 2 2l-4 4"/><path d="m12.5 11 2.6-2.6a1.4 1.4 0 0 1 2 2l-5 5a5 5 0 0 1-7-7l1.4-1.4"/><path d="M17 3.5 18 2M20 6.5l1.6-.6M19.5 4l1.5-1.5"/>',
    sparkle: '<path d="M12 3c.8 4.2 2.8 6.2 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.8 6.2-2.8 7-7z"/><path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>',
    calendar: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
    edit: '<path d="m4 20 1-4L16.5 4.5l3 3L8 19z"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>',
    bookmark: '<path d="M6 3.5h12V21l-6-4.5L6 21z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.6"/><circle cx="12" cy="17" r=".6"/>',
    quote: '<path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12h4v5H5"/><path d="M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12h4v5h-4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    vote: '<path d="M4 13h16v7H4z"/><path d="m8.5 9.5 2.5 2.5 5-5.5"/>',
    lang: '<path d="M4 5h8M8 3.5V5M5.5 5c.6 3 2.6 5.6 5.5 7M10.5 5c-.6 3.4-2.8 6.4-6 8"/><path d="m12 20 4-9 4 9M13.4 17h5.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    claude: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.8 2.8M15.2 15.2 18 18M6 18l2.8-2.8M15.2 8.8 18 6"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.3 10.8 7-3.6M8.3 13.2l7 3.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  };
  U.icon = (name, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

  /* The eight-pointed star (rub el hizb), used for levels, badges and wird markers. */
  U.STAR_PTS =
    '50,0 64.64,14.64 85.36,14.64 85.36,35.36 100,50 85.36,64.64 85.36,85.36 64.64,85.36 50,100 35.36,85.36 14.64,85.36 14.64,64.64 0,50 14.64,35.36 14.64,14.64 35.36,14.64';

  /* ---------- feedback: toasts, confetti, chime ---------- */
  U.toast = (html, kind = '') => {
    const root = document.getElementById('toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.setAttribute('role', 'status');
    el.innerHTML = html;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 400);
    }, 3200);
  };

  U.xpPop = (n, label = '') => {
    if (!n) return;
    U.toast(`<span class="xp-chip">+${A.L.num(n)} XP</span><span>${U.esc(label)}</span>`, 'xp');
  };

  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  U.confetti = (power = 1) => {
    if (reduced()) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    document.body.appendChild(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (c.width = innerWidth * dpr),
      H = (c.height = innerHeight * dpr);
    const ctx = c.getContext('2d');
    const cols = ['#d9a22b', '#2440a0', '#14946c', '#e2512f', '#f0bf4c', '#6f8cff'];
    const n = Math.round(140 * power);
    const parts = Array.from({ length: n }, () => ({
      x: W * (0.2 + Math.random() * 0.6),
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 16 * dpr,
      vy: (-Math.random() * 15 - 6) * dpr,
      r: (3 + Math.random() * 5) * dpr,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 0.4,
      c: cols[(Math.random() * cols.length) | 0],
      s: Math.random() < 0.35,
    }));
    const t0 = performance.now();
    const step = (t) => {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.42 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.globalAlpha = Math.max(0, 1 - el / 2400);
        ctx.fillStyle = p.c;
        if (p.s) {
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const ang = (k * Math.PI) / 4;
            const rr = k % 2 ? p.r * 0.55 : p.r;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.fill();
        } else ctx.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25);
        ctx.restore();
      }
      if (el < 2400) requestAnimationFrame(step);
      else c.remove();
    };
    requestAnimationFrame(step);
  };

  let actx = null;
  U.chime = (kind = 'ok') => {
    if (!U.store.get('sound', true)) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'big' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'soft' ? [659.25] : [659.25, 987.77];
      notes.forEach((f, i) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = actx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + 0.5);
      });
    } catch (e) {}
  };

  U.copy = async (text, el) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
      return false;
    }
  };
})();
