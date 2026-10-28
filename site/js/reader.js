/* The PDF reader: virtualised continuous scroll, lazy part loading, local cache,
   highlights & pinned notes, pinch / ctrl-wheel zoom, page dwell tracking for XP. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const R = (A.R = {});

  const GAP = 14;
  const TOP_PAD = 72;
  const BOT_PAD = 150;
  /* Phones held sideways: the bars become side rails so the page gets the whole height. */
  const isLand = () => window.innerWidth > window.innerHeight && window.innerHeight <= 560;
  /* Reader preferences kept on this device.
     rdTools: which physical side the tools rail (highlight, note, page slider) sits on when the phone is sideways.
     rdMarks: whose highlights and notes show on the pages — everyone's, only mine, or none (a clean page). */
  const MARKS = ['all', 'mine', 'none'];
  R.marksPref = () => {
    const v = U.store.get('rdMarks', 'all');
    return MARKS.includes(v) ? v : 'all';
  };
  R.toolsSide = () => {
    const v = U.store.get('rdTools', '');
    return v === 'left' || v === 'right' ? v : document.documentElement.dir === 'rtl' ? 'left' : 'right';
  };
  // The layout puts tools at the inline end by default (left in Arabic, right in English); "swap" mirrors the rails.
  const swapNow = () => (R.toolsSide() === 'right') === (document.documentElement.dir === 'rtl');
  R.setToolsSide = (side) => {
    U.store.set('rdTools', side === 'right' ? 'right' : 'left');
    if (st) st.root.querySelector('.rd').classList.toggle('swap', swapNow());
  };
  R.fullPref = () => U.store.get('rdFull', true) !== false;
  /* Colours for the strips around the page in the Android app (see sysui.js): the bars' colour while they
     show, the page background while they are hidden. */
  const SYS = {
    day: { bar: '#fcfcfd', bg: '#e6e8ef', light: true },
    sepia: { bar: '#f5ecdb', bg: '#e3d6bd', light: true },
    night: { bar: '#151821', bg: '#0d0f15', light: false },
  };
  R.sysColours = () => {
    const c = SYS[st && st.theme] || SYS.day;
    const col = st && st.uiHidden ? c.bg : c.bar;
    return { top: col, bottom: col, side: col, light: c.light };
  };
  const sysRefresh = () => A.Sys && A.Sys.refresh();
  R.setMarks = (v, quiet) => {
    if (!MARKS.includes(v)) return;
    U.store.set('rdMarks', v);
    if (!st) return;
    marksUi();
    redrawOverlays();
    if (!quiet)
      U.toast(
        v === 'all' ? L('إضافات الكل ظاهرة على الصفحات', "Everyone's highlights and notes are showing")
          : v === 'mine' ? L('خبّينا إضافات الباقيين — إضافاتك بس اللي ظاهرة', "Others' highlights and notes are hidden — only yours show")
            : L('صفحة نضيفة: كل الإضافات مخفية', 'Clean page: all highlights and notes are hidden'),
      );
  };
  const topPad = () => (st && st.land ? 12 : TOP_PAD);
  const botPad = () => (st && st.land ? 40 : BOT_PAD);
  const KEEP = 7; // pages kept rendered on each side of the current one
  const COLORS = ['#f5c542', '#4fc59a', '#6f9cff', '#ff7aa2', '#b98bff'];
  R.COLORS = COLORS;

  let st = null;

  /* ---------- pdf.js ---------- */
  R.pdfjs = async () => {
    if (!window.pdfjsLib) await U.loadScript(U.CDN.pdfjs);
    const lib = window.pdfjsLib;
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', location.href).href;
    return lib;
  };
  R.openPdf = async (data) => {
    const lib = await R.pdfjs();
    const task = lib.getDocument({ data, isEvalSupported: false, disableAutoFetch: true, disableStream: true });
    return task.promise;
  };

  /* Bytes of one uploaded part: device cache first, then the artifact's asset store. */
  R.partBytes = async (part, onProg) => {
    const key = 'a:' + part.id;
    let buf = await U.cache.get(key);
    if (!buf) {
      buf = A.P && A.P.fetchAsset ? await A.P.fetchAsset(part.id, onProg) : await U.fetchBuf('/_blob/' + part.id, onProg);
      await U.cache.put(key, buf);
    }
    return buf;
  };

  /* ---------- open / close ---------- */
  R.isOpen = () => !!st;
  R.bookId = () => st && st.bookId;

  R.open = async (bookId, opts = {}) => {
    const book = S.books.get(bookId);
    if (!book) return;
    if (st) R.close(true);
    const root = document.getElementById('reader');
    const prefs = U.store.get('readerPrefs', { zoom: 1, theme: 'day', paged: false });
    const prog = D.prog(bookId);
    let start = opts.page || (prog && prog.last) || U.store.get('last:' + bookId, 1) || 1;
    start = U.clamp(start | 0, 1, book.pages || 1);
    st = {
      bookId, book, N: book.pages || 1, zoom: prefs.zoom || 1, theme: prefs.theme || 'day', mode: 'none',
      parts: (book.parts || []).map((p) => Object.assign({}, p, { pdf: null, loading: null })),
      sizeFix: {}, els: new Map(), want: [], busy: false, gen: 0, cur: start, lastSaved: start,
      pending: new Set(), dwellP: 0, dwellN: 0, sessionPages: 0, flash: opts.flash || null, uiHidden: false,
      notesVer: -1, panel: null, filter: 'wird', lastTop: 0,
      pagedPref: !!prefs.paged, paged: !!prefs.paged && !((prefs.zoom || 1) > 1.01), startedAt: Date.now(), activeSecs: 0, secsPending: 0, userAt: 0, activeAt: Date.now(),
    };
    root.hidden = false;
    document.body.classList.add('reading');
    root.innerHTML = shell();
    root.querySelector('.rd').classList.toggle('paged', st.paged);
    st.land = isLand();
    root.querySelector('.rd').classList.toggle('land', st.land);
    root.querySelector('.rd').classList.toggle('swap', swapNow());
    st.root = root;
    st.sc = root.querySelector('#rd-scroll');
    st.pagesEl = root.querySelector('#rd-pages');
    bind();
    marksUi();
    geom();
    goTo(start, false);
    chrome();
    D.presence({ b: bookId, p: start });
    st.tick = setInterval(tick, 1000);
    st.flushT = setInterval(() => flush(), 12000);
    st.onVis = () => (document.hidden ? flush() : keepAwake(true));
    document.addEventListener('visibilitychange', st.onVis);
    st.onResize = U.debounce(() => {
      if (!st) return;
      const land = isLand();
      if (land !== st.land) {
        st.land = land;
        st.root.querySelector('.rd').classList.toggle('land', land);
      }
      relayout();
      chrome();
    }, 150);
    window.addEventListener('resize', st.onResize);
    keepAwake(true);
    sysRefresh();
    if (A.Sys && R.fullPref()) A.Sys.fullscreen(true);
    try {
      await prepareSource();
      if (!st) return;
      update();
    } catch (e) {
      console.warn(e);
      showError(e);
    }
  };

  R.close = (silent) => {
    if (!st) return;
    const summary = !silent && (st.sessionPages >= 3 || st.activeSecs >= 60) ? { bookId: st.bookId, pages: st.sessionPages, secs: st.activeSecs } : null;
    flush();
    clearInterval(st.tick);
    clearInterval(st.flushT);
    clearTimeout(st.tapT);
    keepAwake(false);
    document.removeEventListener('visibilitychange', st.onVis);
    window.removeEventListener('resize', st.onResize);
    document.removeEventListener('keydown', onKey);
    for (const el of st.els.values()) freeEl(el);
    for (const p of st.parts) if (p.pdf) p.pdf.destroy().catch(() => {});
    const root = st.root;
    root.innerHTML = '';
    root.hidden = true;
    document.body.classList.remove('reading');
    st = null;
    if (A.Sys) A.Sys.fullscreen(false);
    sysRefresh();
    D.presence({ b: null, p: null });
    if (!silent) A.V && A.V.render();
    if (summary && A.V && A.V.sessionSummary) setTimeout(() => A.V.sessionSummary(summary), 250);
  };

  /* Local copy previously opened from this device replaces the network parts. */
  async function prepareSource() {
    const local = await U.cache.get('lb:' + st.bookId);
    if (local) {
      st.parts = [{ id: 'local', from: 1, to: st.N, local, pdf: null, loading: null }];
      return;
    }
    if (!st.parts.length) throw Object.assign(new Error('noparts'), { code: 'noparts' });
  }

  function partOf(p) {
    return st.parts.find((x) => p >= x.from && p <= x.to) || st.parts[st.parts.length - 1];
  }

  function loadPart(part) {
    if (part.pdf) return Promise.resolve(part.pdf);
    if (part.failed) return Promise.reject(part.failed);
    if (part.loading) return part.loading;
    const s0 = st;
    part.loading = (async () => {
      showLoading(true, 0, part);
      let buf;
      if (part.local) buf = part.local;
      else buf = await R.partBytes(part, (f) => s0 === st && showLoading(true, f, part));
      const pdf = await R.openPdf(new Uint8Array(buf.slice(0)));
      if (s0 !== st) {
        pdf.destroy().catch(() => {});
        throw new Error('closed');
      }
      part.pdf = pdf;
      showLoading(false);
      return pdf;
    })();
    part.loading.catch((e) => {
      part.loading = null;
      if (e.message !== 'closed') part.failed = e;
      if (s0 === st && e.message !== 'closed') showError(e);
    });
    return part.loading;
  }

  /* ---------- geometry ---------- */
  function size(p) {
    if (st.sizeFix[p]) return st.sizeFix[p];
    const b = st.book;
    const s = b.sizes && b.sizes[p - 1];
    return s || b.size || [595, 842];
  }
  function geom() {
    const avail = st.sc.clientWidth || window.innerWidth;
    const gutter = avail < 640 ? 6 : 28;
    st.gutter = gutter;
    st.baseW = Math.max(220, Math.min(avail - gutter * 2, 940));
    const N = st.N;
    st.tops = new Float64Array(N + 2);
    st.ws = new Float64Array(N + 2);
    st.hs = new Float64Array(N + 2);
    let y = topPad();
    let maxW = 0;
    if (st.paged) {
      // One page per screen-high slot, centred, fitted to the screen like a printed page.
      const H = (st.slotH = st.sc.clientHeight || window.innerHeight);
      for (let p = 1; p <= N; p++) {
        const [w0, h0] = size(p);
        const w = Math.round(Math.min(st.baseW, ((H - 12) * w0) / h0));
        const h = Math.round((w * h0) / w0);
        st.tops[p] = (p - 1) * H + Math.round((H - h) / 2);
        st.ws[p] = w;
        st.hs[p] = h;
        if (w > maxW) maxW = w;
      }
      st.tops[N + 1] = N * H;
      st.totalH = N * H;
    } else {
      for (let p = 1; p <= N; p++) {
        const [w0, h0] = size(p);
        const w = Math.round(st.baseW * st.zoom * Math.min(1, Math.max(0.6, w0 / (size(1)[0] || w0))));
        const h = Math.round((w * h0) / w0);
        st.tops[p] = y;
        st.ws[p] = w;
        st.hs[p] = h;
        y += h + GAP;
        if (w > maxW) maxW = w;
      }
      st.tops[N + 1] = y;
      st.totalH = y + botPad();
    }
    st.innerW = Math.max(avail, maxW + gutter * 2);
    st.pagesEl.style.height = st.totalH + 'px';
    st.pagesEl.style.width = st.innerW + 'px';
    for (const [p, el] of st.els) placeEl(p, el);
  }
  function placeEl(p, el) {
    el.style.top = st.tops[p] + 'px';
    el.style.left = Math.round((st.innerW - st.ws[p]) / 2) + 'px';
    el.style.width = st.ws[p] + 'px';
    el.style.height = st.hs[p] + 'px';
  }
  function pageAt(y) {
    if (st.paged) return U.clamp(Math.floor(y / st.slotH) + 1, 1, st.N);
    let lo = 1, hi = st.N;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (st.tops[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  function anchorAt(ax, ay) {
    const sc = st.sc;
    const y = sc.scrollTop + ay;
    const p = pageAt(y);
    const fy = (y - st.tops[p]) / st.hs[p];
    const left = (st.innerW - st.ws[p]) / 2;
    const fx = (sc.scrollLeft + ax - left) / st.ws[p];
    return { p, fx, fy, ax, ay };
  }
  function restoreAnchor(a) {
    const sc = st.sc;
    const left = (st.innerW - st.ws[a.p]) / 2;
    sc.scrollTop = st.tops[a.p] + a.fy * st.hs[a.p] - a.ay;
    sc.scrollLeft = left + a.fx * st.ws[a.p] - a.ax;
  }
  function relayout(anchor) {
    if (st.paged) {
      const p = st.cur;
      geom();
      jumpTo((p - 1) * st.slotH);
      st.gen++;
      update();
      return;
    }
    const a = anchor || anchorAt(st.sc.clientWidth / 2, st.sc.clientHeight * 0.33);
    geom();
    restoreAnchor(a);
    st.gen++;
    update();
  }
  function setZoom(z, ax, ay) {
    z = U.clamp(Math.round(z * 100) / 100, 0.5, 4);
    if (Math.abs(z - st.zoom) < 0.01) return;
    const a = anchorAt(ax == null ? st.sc.clientWidth / 2 : ax, ay == null ? st.sc.clientHeight * 0.33 : ay);
    st.zoom = z;
    // Page-by-page mode shows whole pages; zooming in switches to free scrolling until the zoom is back to fit.
    const paged = st.pagedPref && z <= 1.01;
    if (paged !== st.paged) {
      st.paged = paged;
      st.root.querySelector('.rd').classList.toggle('paged', paged);
    }
    savePrefs();
    relayout(paged ? null : a);
    const zl = st.root.querySelector('#rd-zoom');
    if (zl) zl.textContent = L.num(Math.round(z * 100)) + (L.isAr() ? '٪' : '%');
  }
  function savePrefs() {
    U.store.set('readerPrefs', { zoom: st.zoom, theme: st.theme, paged: st.pagedPref });
  }
  function setPaged(on) {
    if (!st || (st.paged === on && st.pagedPref === on)) return;
    const p = st.cur;
    st.paged = st.pagedPref = on;
    if (on) st.zoom = 1;
    st.root.querySelector('.rd').classList.toggle('paged', on);
    savePrefs();
    geom();
    goTo(p, false);
    st.gen++;
    update();
  }
  /* +1 = next page in reading order. In page-by-page mode the new page slides in from the side, like a book. */
  function turn(dir) {
    if (!st) return;
    const to = U.clamp(st.cur + dir, 1, st.N);
    if (to === st.cur) return;
    if (!st.paged) return goTo(to, true);
    goTo(to, false);
    const el = st.els.get(to);
    if (el && el.animate && !reduced()) {
      const from = (dir > 0) === bookRTL() ? -1 : 1;
      el.animate([{ transform: `translateX(${from * 56}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  const bookRTL = () => st.book.lang !== 'en';

  /* ---------- virtualised pages ---------- */
  function makeEl(p) {
    const el = document.createElement('div');
    el.className = 'pg';
    el.dataset.p = p;
    el.innerHTML = `<div class="pg-blank"><span>${L.num(p)}</span></div><div class="pg-ov" data-p="${p}"></div>`;
    el.rw = 0;
    placeEl(p, el);
    st.pagesEl.appendChild(el);
    drawOverlay(p, el);
    return el;
  }
  function freeEl(el) {
    const c = el.querySelector('canvas');
    if (c) {
      c.width = 0;
      c.height = 0;
    }
    if (el.task) {
      try { el.task.cancel(); } catch (e) {}
    }
    el.remove();
  }

  function update() {
    if (!st) return;
    const sc = st.sc;
    const top = sc.scrollTop;
    const h = sc.clientHeight || window.innerHeight;
    const cur = pageAt(top + h * 0.33);
    const first = Math.max(1, pageAt(top - h * 0.6));
    const last = Math.min(st.N, pageAt(top + h * 1.6));
    const lo = Math.max(1, Math.min(first, cur - 1));
    const hi = Math.min(st.N, Math.max(last, cur + 2));
    for (let p = lo; p <= hi; p++) if (!st.els.has(p)) st.els.set(p, makeEl(p));
    const keep = st.zoom >= 2.5 ? 1 : st.zoom >= 1.6 ? 2 : st.zoom > 1.15 ? 4 : KEEP;
    for (const [p, el] of st.els) {
      if (p < cur - keep || p > cur + keep) {
        if (p < lo - 1 || p > hi + 1) {
          freeEl(el);
          st.els.delete(p);
        }
      }
    }
    const order = [];
    for (let p = lo; p <= hi; p++) order.push(p);
    order.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
    st.want = order;
    if (cur !== st.cur) pageChanged(cur);
    pump();
  }

  function targetPx(p) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.round(st.ws[p] * dpr);
  }

  async function pump() {
    if (!st || st.busy || !st.parts.length) return;
    const p = st.want.find((x) => {
      const el = st.els.get(x);
      return el && !el.failed && !partOf(x).failed && Math.abs((el.rw || 0) - targetPx(x)) > 2;
    });
    if (!p) return;
    st.busy = true;
    const s0 = st;
    try {
      await renderPage(p);
    } catch (e) {
      if (s0 === st && e && e.name !== 'RenderingCancelledException' && e.message !== 'closed') {
        console.warn('render', p, e);
        const el = st.els.get(p);
        if (el) el.failed = true;
      }
    }
    if (s0 !== st) return;
    st.busy = false;
    pump();
  }

  async function renderPage(p) {
    const part = partOf(p);
    const pdf = await loadPart(part);
    if (!st) throw new Error('closed');
    const page = await pdf.getPage(p - part.from + 1);
    const el = st.els.get(p);
    if (!el || !st) return;
    const vp1 = page.getViewport({ scale: 1 });
    const [w0, h0] = size(p);
    if (Math.abs(vp1.width / vp1.height - w0 / h0) > 0.03) {
      st.sizeFix[p] = [vp1.width, vp1.height];
      st.needRelayout = true;
    }
    const want = targetPx(p);
    let scale = want / vp1.width;
    const maxPx = 6.5e6;
    if (vp1.width * vp1.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (vp1.width * vp1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const task = page.render({ canvasContext: ctx, viewport: vp });
    el.task = task;
    await task.promise;
    el.task = null;
    if (!st || !el.isConnected) {
      c.width = 0;
      return;
    }
    const old = el.querySelector('canvas');
    const blank = el.querySelector('.pg-blank');
    if (blank) blank.remove();
    if (old) {
      old.replaceWith(c);
      old.width = 0;
      old.height = 0;
    } else el.insertBefore(c, el.firstChild);
    el.rw = want;
    page.cleanup();
    if (st.needRelayout) {
      st.needRelayout = false;
      relayout();
    }
  }

  /* ---------- navigation ---------- */
  function goTo(p, smooth = true, flashNid) {
    if (!st) return;
    p = U.clamp(p | 0, 1, st.N);
    if (st.paged) {
      jumpTo((p - 1) * st.slotH);
      smooth = false;
    } else st.sc.scrollTo({ top: st.tops[p] - topPad() + 8, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
    if (flashNid) setTimeout(() => flash(flashNid), smooth ? 500 : 80);
    if (!smooth) update();
  }
  /* Page-by-page mode snaps with scroll-snap-stop: always, which in Chrome also stops jumps made from code
     at the next page. Switch snapping off for the jump itself. */
  function jumpTo(y) {
    const sc = st.sc;
    sc.style.scrollSnapType = 'none';
    sc.scrollTop = y;
    requestAnimationFrame(() => (sc.style.scrollSnapType = ''));
  }
  R.goTo = (p, nid) => goTo(p, true, nid);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function flash(nid) {
    const el = st && st.root.querySelector(`[data-nid="${CSS.escape(nid)}"]`);
    if (el) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  let presT = 0;
  function pageChanged(p) {
    st.cur = p;
    const inp = st.root.querySelector('#rd-pgin');
    if (inp && document.activeElement !== inp) inp.value = L.num(p, { useGrouping: false });
    U.store.set('last:' + st.bookId, p);
    clearTimeout(presT);
    presT = setTimeout(() => st && D.presence({ b: st.bookId, p: st.cur }), 800);
    chrome();
  }

  /* A page counts as read after ~3 seconds as the current page. */
  function tick() {
    if (!st || document.hidden) return;
    if (Date.now() - st.activeAt > 300000) keepAwake(false);
    if (Date.now() - st.activeAt < 180000) {
      st.activeSecs++;
      st.secsPending++;
    }
    if (st.cur === st.dwellP) {
      st.dwellN++;
      if (st.dwellN === 3) markSeen(st.cur);
    } else {
      st.dwellP = st.cur;
      st.dwellN = 0;
    }
  }
  function markSeen(p) {
    const prog = D.prog(st.bookId);
    if ((prog && U.rangesHas(prog.seen, p)) || st.pending.has(p)) return;
    st.pending.add(p);
    st.sessionPages++;
    const chip = st.root.querySelector('#rd-today');
    if (chip) {
      chip.innerHTML = `${U.icon('scroll')}<b>+${L.num(st.sessionPages)}</b>`;
      chip.classList.remove('pop');
      void chip.offsetWidth;
      chip.classList.add('pop');
    }
  }
  async function flush() {
    if (!st || !D.canWrite() || !D.joined()) return;
    const bookId = st.bookId;
    const pages = [...st.pending];
    st.pending.clear();
    const cur = st.cur;
    const prog = D.prog(bookId);
    const fresh = pages.filter((p) => !(prog && U.rangesHas(prog.seen, p)));
    const secs = st.secsPending >= 30 ? st.secsPending : 0;
    if (secs) st.secsPending = 0;
    if (!fresh.length && !secs && prog && prog.last === cur) return;
    if (!fresh.length && !secs && Math.abs((st.lastSaved || 0) - cur) < 1) return;
    st.lastSaved = cur;
    try {
      if (fresh.length || !prog || prog.last !== cur) await D.saveProg(bookId, (c) => ({ seen: U.rangesAdd(c.seen, fresh), last: cur }));
      if (fresh.length || secs) await D.addPagesToday(fresh.length, secs);
    } catch (e) {
      // Offline or a failed save: keep the pages so the next flush retries them.
      if (st && st.bookId === bookId) for (const p of fresh) st.pending.add(p);
      if (st) {
        st.lastSaved = 0;
        st.secsPending += secs;
      }
    }
  }
  R.flush = flush;

  /* ---------- overlays: highlights, pins, bookmarks ---------- */
  function notesOn(p) {
    const out = [];
    for (const n of S.notes.values()) if (n.b === st.bookId && n.page === p && n.rect) out.push(n);
    const priv = S.priv && S.priv.notes;
    if (priv) for (const [id, n] of Object.entries(priv)) if (n && n.b === st.bookId && n.page === p && n.rect) out.push(Object.assign({ id, priv: true, by: S.me }, n));
    return out;
  }
  function drawOverlay(p, el) {
    const ov = el.querySelector('.pg-ov');
    if (!ov) return;
    const ns = notesOn(p);
    const marks = S.priv && S.priv.marks && S.priv.marks[st.bookId];
    let html = marks && marks[p] ? `<span class="pg-mark" title="${U.esc(L('علامة', 'Bookmark'))}">${U.icon('bookmark')}</span>` : '';
    const show = R.marksPref();
    for (const n of ns) {
      if (show === 'none' || (show === 'mine' && n.by !== S.me)) continue;
      const r = n.rect;
      const col = U.col(n.color, COLORS[0]);
      const rc = n.replies ? Object.values(n.replies).filter(Boolean).length : 0;
      const likes = n.likes ? Object.values(n.likes).filter(Boolean).length : 0;
      const label = U.esc(D.name(n.by) + (n.text ? ': ' + n.text.slice(0, 80) : ''));
      if (r.w < 0.012 && r.h < 0.012) {
        html += `<button class="pinb${n.priv ? ' priv' : ''}" data-nid="${U.esc(n.id)}" data-priv="${n.priv ? 1 : ''}" style="left:${r.x * 100}%;top:${r.y * 100}%;--c:${U.esc(col)}" aria-label="${label}">${D.avatar(n.by, 'xs')}${rc ? `<i>${L.num(rc)}</i>` : ''}</button>`;
      } else {
        html += `<button class="hlb k-${U.esc(n.kind || 'hl')}${n.priv ? ' priv' : ''}" data-nid="${U.esc(n.id)}" data-priv="${n.priv ? 1 : ''}" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%;--c:${U.esc(col)};--a:${U.esc(D.color(n.by))}" aria-label="${label}"><span class="hl-tag">${D.avatar(n.by, 'xs')}${n.kind === 'q' ? '<b>؟</b>' : ''}${rc + likes ? `<i>${L.num(rc + likes)}</i>` : ''}</span></button>`;
      }
    }
    const draft = ov.querySelector('.hl-draft');
    ov.innerHTML = html;
    if (draft) ov.appendChild(draft);
  }
  function redrawOverlays() {
    for (const [p, el] of st.els) drawOverlay(p, el);
  }

  /* ---------- annotation drawing ---------- */
  function setMode(m) {
    if (!st) return;
    st.mode = st.mode === m ? 'none' : m;
    if (st.mode !== 'none' && R.marksPref() === 'none') R.setMarks('mine', true);
    st.root.querySelector('.rd').dataset.mode = st.mode;
    const hint = st.root.querySelector('#rd-hint');
    hint.hidden = st.mode === 'none';
    hint.innerHTML =
      st.mode === 'hl'
        ? `${U.icon('hl')}<span>${L('اسحب على الجزء اللي عايز تظلّله', 'Drag over the passage you want to highlight')}</span><button class="lnk" data-act="mode-off">${L('إلغاء', 'Cancel')}</button>`
        : st.mode === 'pin'
          ? `${U.icon('pin')}<span>${L('دوس على المكان اللي عايز تحط فيه ملاحظة', 'Tap where you want to pin a note')}</span><button class="lnk" data-act="mode-off">${L('إلغاء', 'Cancel')}</button>`
          : '';
    for (const b of st.root.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === st.mode);
  }

  function bindDraw() {
    let drag = null;
    st.pagesEl.addEventListener('pointerdown', (e) => {
      if (st.mode === 'none') return;
      const ov = e.target.closest('.pg-ov');
      if (!ov) return;
      e.preventDefault();
      const r = ov.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      drag = { ov, r, x0: x, y0: y, x, y, p: +ov.dataset.p, id: e.pointerId };
      try { ov.setPointerCapture(e.pointerId); } catch (er) {}
      if (st.mode === 'hl') {
        drag.el = document.createElement('div');
        drag.el.className = 'hl-draft';
        ov.appendChild(drag.el);
      }
    });
    st.pagesEl.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.x = U.clamp((e.clientX - drag.r.left) / drag.r.width, 0, 1);
      drag.y = U.clamp((e.clientY - drag.r.top) / drag.r.height, 0, 1);
      if (drag.el) {
        const x = Math.min(drag.x0, drag.x), y = Math.min(drag.y0, drag.y);
        Object.assign(drag.el.style, { left: x * 100 + '%', top: y * 100 + '%', width: Math.abs(drag.x - drag.x0) * 100 + '%', height: Math.abs(drag.y - drag.y0) * 100 + '%' });
      }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      let rect;
      if (st.mode === 'pin') rect = { x: r4(d.x), y: r4(d.y), w: 0, h: 0 };
      else {
        const x = Math.min(d.x0, d.x), y = Math.min(d.y0, d.y);
        rect = { x: r4(x), y: r4(y), w: r4(Math.abs(d.x - d.x0)), h: r4(Math.abs(d.y - d.y0)) };
        if (rect.w < 0.02 || rect.h < 0.008) {
          if (d.el) d.el.remove();
          return;
        }
      }
      const crop = rect.w ? cropOf(d.p, rect) : null;
      if (st.mode === 'pin' && e.pointerType !== 'mouse') swallowGhostClick(e.clientX, e.clientY);
      A.V.composeNote({ bookId: st.bookId, page: d.p, rect, crop }, () => {
        if (d.el) d.el.remove();
        if (st && st.mode !== 'none') setMode(st.mode);
      });
    };
    st.pagesEl.addEventListener('pointerup', end);
    st.pagesEl.addEventListener('pointercancel', (e) => {
      if (drag && drag.el) drag.el.remove();
      drag = null;
    });
  }
  const r4 = (v) => Math.round(v * 10000) / 10000;
  /* After a tap opens the note sheet, the browser still sends a click to the same spot: drop that one click. */
  function swallowGhostClick(x, y) {
    const f = (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 30) return;
      ev.stopPropagation();
      ev.preventDefault();
      document.removeEventListener('click', f, true);
    };
    document.addEventListener('click', f, true);
    setTimeout(() => document.removeEventListener('click', f, true), 450);
  }

  function cropOf(p, r) {
    const el = st.els.get(p);
    const c = el && el.querySelector('canvas');
    if (!c || !c.width) return null;
    const sx = r.x * c.width, sy = r.y * c.height, sw = r.w * c.width, sh = r.h * c.height;
    if (sw < 6 || sh < 6) return null;
    const k = Math.min(1, 560 / sw, 700 / sh);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * k));
    out.height = Math.max(1, Math.round(sh * k));
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    let q = 0.68;
    let url = out.toDataURL('image/jpeg', q);
    while (url.length > 60000 && q > 0.3) {
      q -= 0.12;
      url = out.toDataURL('image/jpeg', q);
    }
    return url.length > 80000 ? null : url;
  }

  /* A JPEG of the current page, for asking Claude about it. */
  R.pageImage = async () => {
    if (!st) return null;
    const el = st.els.get(st.cur);
    const c = el && el.querySelector('canvas');
    if (!c || !c.width) return null;
    const k = Math.min(1, 1500 / Math.max(c.width, c.height));
    const out = document.createElement('canvas');
    out.width = Math.round(c.width * k);
    out.height = Math.round(c.height * k);
    out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
    return new Promise((res) => out.toBlob((b) => res(b), 'image/jpeg', 0.82));
  };
  R.current = () => (st ? { bookId: st.bookId, page: st.cur } : null);

  /* ---------- chrome (bars, scrubber, prompts) ---------- */
  function shell() {
    const b = st.book;
    const dirBook = b.lang === 'en' ? 'ltr' : 'rtl';
    return `<div class="rd" data-theme="${st.theme}" data-mode="none">
      <header class="rd-top">
        <button class="ib" data-act="close" aria-label="${L('رجوع', 'Back')}">${U.icon('back', 'flip')}</button>
        <div class="rd-title"><b dir="auto">${U.esc(b.title)}</b><span id="rd-wird"></span></div>
        <span class="rd-today" id="rd-today" title="${L('صفحات قريتها في الجلسة دي', 'Pages read this session')}">${U.icon('scroll')}<b>+${L.num(0)}</b></span>
        <label class="rd-pg"><input id="rd-pgin" inputmode="numeric" aria-label="${L('رقم الصفحة', 'Page number')}" value="${L.num(st.cur, { useGrouping: false })}"><span>/ ${L.num(st.N, { useGrouping: false })}</span></label>
        <div class="rd-acts">
          <button class="ib hide-sm" data-act="zout" aria-label="${L('تصغير', 'Zoom out')}">${U.icon('zout')}</button>
          <button class="ib hide-sm zl" data-act="fit" id="rd-zoom" aria-label="${L('ملء العرض', 'Fit width')}">${L.num(Math.round(st.zoom * 100))}${L.isAr() ? '٪' : '%'}</button>
          <button class="ib hide-sm" data-act="zin" aria-label="${L('تكبير', 'Zoom in')}">${U.icon('zin')}</button>
          <button class="ib" data-act="theme" aria-label="${L('لون الصفحة', 'Page colour')}">${U.icon(st.theme === 'night' ? 'moon' : st.theme === 'sepia' ? 'scroll' : 'sun')}</button>
          <button class="ib" data-act="panel" aria-label="${L('الملاحظات', 'Notes')}">${U.icon('list')}<i class="dot" id="rd-ncount" hidden></i></button>
          <button class="ib" data-act="more" aria-label="${L('المزيد', 'More')}">${U.icon('more')}</button>
        </div>
      </header>
      <div class="rd-scroll" id="rd-scroll" tabindex="-1"><div class="rd-pages" id="rd-pages"></div></div>
      <div class="rd-hint" id="rd-hint" hidden></div>
      <div class="rd-load" id="rd-load" hidden><div class="rd-load-card"><div class="spin8"></div><b id="rd-load-t">${L('بنجهّز الكتاب…', 'Preparing the book…')}</b><div class="bar"><i id="rd-load-bar"></i></div><small id="rd-load-s"></small></div></div>
      <footer class="rd-bot">
        <div class="rd-prompt" id="rd-prompt" hidden></div>
        <div class="rd-botrow">
          <div class="rd-tools">
            <button class="tool" data-tool="hl" data-act="tool">${U.icon('hl')}<span>${L('ظلّل', 'Highlight')}</span></button>
            <button class="tool" data-tool="pin" data-act="tool">${U.icon('pin')}<span>${L('ملاحظة', 'Note')}</span></button>
            <button class="tool tool-eye" data-act="marks" id="rd-eye"></button>
          </div>
          <div class="rd-scrub" id="rd-scrub" dir="${dirBook}" role="slider" tabindex="0" aria-label="${L('مكانك في الكتاب', 'Position in book')}" aria-valuemin="1" aria-valuemax="${st.N}"></div>
        </div>
      </footer>
      <aside class="rd-panel" id="rd-panel" hidden></aside>
    </div>`;
  }

  /* The eye button: shows whether other people's marks are on the pages. */
  function marksUi() {
    const b = st && st.root.querySelector('#rd-eye');
    if (!b) return;
    const v = R.marksPref();
    b.classList.toggle('on', v !== 'all');
    b.setAttribute('aria-pressed', String(v !== 'all'));
    const t = v === 'all' ? L('اخفي إضافات الباقيين', "Hide others' marks") : L('اظهر إضافات الكل', "Show everyone's marks");
    b.setAttribute('aria-label', t);
    b.title = t;
    // While some marks are hidden, show how many are on this page so nothing is missed.
    const hidden = v === 'all' ? 0 : notesOn(st.cur).filter((n) => v === 'none' || n.by !== S.me).length;
    if (b.dataset.v !== v || b.dataset.h !== String(hidden)) {
      b.dataset.v = v;
      b.dataset.h = String(hidden);
      b.innerHTML = U.icon(v === 'all' ? 'eye' : 'eyeoff') + (hidden ? `<i class="eye-n">${L.num(hidden)}</i>` : '');
    }
  }
  function chrome() {
    if (!st) return;
    marksUi();
    const b = st.book;
    const w = G.myCurrent(b);
    const wEl = st.root.querySelector('#rd-wird');
    const curW = G.wirds(b).find((x) => st.cur >= x.from && st.cur <= x.to);
    const prog = D.prog(st.bookId);
    if (wEl) {
      let left = 0;
      if (curW) for (let p = curW.from; p <= curW.to; p++) if (!st.pending.has(p) && !(prog && U.rangesHas(prog.seen, p))) left++;
      wEl.textContent = !curW
        ? L(`صفحة ${L.num(st.cur)} من ${L.num(st.N)}`, `Page ${st.cur} of ${st.N}`)
        : left
          ? L(`الورد ${L.num(curW.n)} • فاضل ${L.count(left, 'page')}`, `Portion ${curW.n} • ${left} pages left`)
          : L(`الورد ${L.num(curW.n)} • ص ${L.num(curW.from)}–${L.num(curW.to)} ✓`, `Portion ${curW.n} • p. ${curW.from}–${curW.to} ✓`);
    }
    // finish prompt
    const pr = st.root.querySelector('#rd-prompt');
    let html = '';
    if (D.canWrite() && D.joined()) {
      if (w && st.cur >= w.to && st.dismissed !== w.id) {
        html = `<span class="star8 sm gold"></span><span>${L(`وصلت لآخر الورد ${L.num(w.n)}!`, `You reached the end of portion ${w.n}!`)}</span><button class="btn gold sm" data-act="wird-done" data-wid="${U.esc(w.id)}">${U.icon('check')}${L('خلّصته', 'Mark done')}</button><button class="ib sm" data-act="dismiss" aria-label="${L('إخفاء', 'Hide')}">${U.icon('close')}</button>`;
      } else if (!w && st.cur >= st.N && !(prog && prog.finished) && st.dismissed !== 'book') {
        html = `<span class="star8 sm gold"></span><span>${L('آخر صفحة! خلّصت الكتاب؟', 'Last page! Finished the book?')}</span><button class="btn gold sm" data-act="book-done">${U.icon('trophy')}${L('خلّصت الكتاب', 'I finished it')}</button><button class="ib sm" data-act="dismiss" data-what="book" aria-label="${L('إخفاء', 'Hide')}">${U.icon('close')}</button>`;
      }
    }
    pr.hidden = !html;
    if (pr.dataset.h !== html) {
      pr.innerHTML = html;
      pr.dataset.h = html;
    }
    scrub();
    const cnt = [...S.notes.values()].filter((n) => n.b === st.bookId && n.kind !== 'take').length;
    const nc = st.root.querySelector('#rd-ncount');
    if (nc) nc.hidden = !cnt;
  }

  function scrub() {
    const el = st.root.querySelector('#rd-scrub');
    if (!el) return;
    const b = st.book;
    const N = st.N;
    const vert = st.land;
    const side = vert ? 'top' : el.dir === 'rtl' ? 'right' : 'left';
    const dim = vert ? 'height' : 'width';
    el.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    const pos = (p) => (N <= 1 ? 0 : ((p - 1) / (N - 1)) * 100);
    let segs = '';
    for (const w of G.wirds(b)) {
      const s = G.wirdStatus(b, w);
      segs += `<i class="seg s-${s}" style="${side}:${pos(w.from)}%;${dim}:${Math.max(0.6, pos(w.to) - pos(w.from))}%"></i>`;
    }
    const prog = D.prog(st.bookId);
    let seenBar = '';
    if (prog && prog.seen) for (const r of prog.seen) seenBar += `<i class="seen" style="${side}:${pos(r[0])}%;${dim}:${Math.max(0.4, pos(r[1]) - pos(r[0]))}%"></i>`;
    const live = new Map(D.readingNow(st.bookId).map((x) => [x.uid, x.p]));
    let others = '';
    let k = 0;
    for (const p of D.bookProgs(st.bookId)) {
      if (p.u === S.me || k > 10) continue;
      const at = live.has(p.u) ? live.get(p.u) : p.last || 1;
      others += `<span class="sm-av${live.has(p.u) ? ' live' : ''}" style="${side}:${pos(at)}%" title="${U.esc(D.name(p.u))} • ${L.num(at)}">${D.avatar(p.u, 'xs')}</span>`;
      live.delete(p.u);
      k++;
    }
    for (const [uid, at] of live) others += `<span class="sm-av live" style="${side}:${pos(at || 1)}%" title="${U.esc(D.name(uid))}">${D.avatar(uid, 'xs')}</span>`;
    el.setAttribute('aria-valuenow', st.cur);
    el.innerHTML = `<div class="trk">${segs}${seenBar}</div>${others}<span class="thumb" style="${side}:${pos(st.cur)}%"><b>${L.num(st.cur)}</b></span>`;
  }

  function showLoading(on, f = 0, part) {
    if (!st) return;
    const el = st.root.querySelector('#rd-load');
    if (!el) return;
    if (st.parts.some((x) => x.failed)) return;
    el.hidden = !on;
    if (!on) return;
    const bar = el.querySelector('#rd-load-bar');
    if (!bar) return;
    bar.style.width = Math.round(f * 100) + '%';
    const s = el.querySelector('#rd-load-s');
    const multi = st.parts.length > 1 && part && part.id !== 'local';
    s.textContent = multi
      ? L(`الجزء ص ${L.num(part.from)}–${L.num(part.to)} • ${L.num(Math.round(f * 100))}٪`, `Part p. ${part.from}–${part.to} • ${Math.round(f * 100)}%`)
      : f
        ? L(`${L.num(Math.round(f * 100))}٪ — بعد كده هيفتح على طول من جهازك`, `${Math.round(f * 100)}% — next time it opens instantly from this device`)
        : '';
  }

  function showError(e) {
    if (!st) return;
    const el = st.root.querySelector('#rd-load');
    el.hidden = false;
    const status = e && e.status;
    const msg =
      e && e.code === 'noparts'
        ? L('الكتاب ده مالوش ملف مرفوع. افتح نسختك من جهازك.', 'This book has no uploaded file. Open your own copy.')
        : status === 403 || status === 404 || status === 401
          ? L('مش قادر أجيب ملف الكتاب. يمكن اتمسح من الحلقة — جرّب تاني أو افتح نسختك من جهازك.', "Couldn't fetch the book file. It may have been removed — try again or open your own copy.")
          : L('حصلت مشكلة وإحنا بنفتح الكتاب. اتأكد من النت وجرّب تاني، أو افتح نسختك من جهازك.', 'Something went wrong opening the book. Check your connection and retry, or open your own copy.');
    el.innerHTML = `<div class="rd-load-card err"><span class="star8 rubric"></span><b>${msg}</b>
      <div class="row-btns"><button class="btn" data-act="retry">${L('جرّب تاني', 'Try again')}</button>
      <label class="btn ghost">${U.icon('upload')}${L('افتح نسخة من جهازي', 'Open my copy')}<input type="file" id="rd-localfile" accept="application/pdf,.pdf" hidden></label>
      <button class="btn ghost" data-act="close">${L('رجوع', 'Back')}</button></div>
      <small>${L('النسخة اللي هتفتحها لازم تكون نفس الكتاب بنفس عدد الصفحات عشان الملاحظات تيجي في مكانها.', 'Your copy must be the same edition (same page count) so notes land in the right place.')}</small></div>`;
  }

  async function useLocalFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const pdf = await R.openPdf(new Uint8Array(buf.slice(0)));
      const n = pdf.numPages;
      pdf.destroy().catch(() => {});
      if (n !== st.N) {
        U.toast(L(`الملف ده فيه ${L.count(n, 'page')} والكتاب في الحلقة ${L.count(st.N, 'page')}. اختار نفس النسخة.`, `That file has ${n} pages but the circle's book has ${st.N}. Pick the same edition.`), 'warn');
        return;
      }
      await U.cache.put('lb:' + st.bookId, buf);
      const id = st.bookId, p = st.cur;
      R.close(true);
      R.open(id, { page: p });
    } catch (e) {
      U.toast(L('الملف ده مش PDF سليم', "That file isn't a readable PDF"), 'warn');
    }
  }

  /* ---------- events ---------- */
  function bind() {
    // Listeners go on the per-open .rd element (rebuilt on every open), never on the persistent #reader root.
    const root = st.root.firstElementChild; // the .rd element
    const sc = st.sc;
    sc.addEventListener('scroll', () => {
      if (!st) return;
      if (!st.raf)
        st.raf = requestAnimationFrame(() => {
          if (!st) return;
          st.raf = 0;
          update();
          const t = sc.scrollTop;
          const dy = t - st.lastTop;
          if (Math.abs(dy) > 14) {
            const byUser = Date.now() - (st.userAt || 0) < 600;
            const hide = byUser && dy > 0 && t > 120 && st.mode === 'none';
            if (hide !== st.uiHidden) {
              st.uiHidden = hide;
              root.classList.toggle('ui-off', hide);
              sysRefresh();
            }
            st.lastTop = t;
          }
        });
    }, { passive: true });
    const touched = () => {
      if (!st) return;
      st.userAt = st.activeAt = Date.now();
      keepAwake(true);
    };
    sc.addEventListener('wheel', touched, { passive: true });
    sc.addEventListener('touchmove', touched, { passive: true });
    sc.addEventListener('pointerdown', touched, { passive: true });
    // Page-by-page mode: horizontal swipe turns the page in the book's direction.
    let sw = null;
    sc.addEventListener('touchstart', (e) => {
      sw = st && st.paged && st.mode === 'none' && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    }, { passive: true });
    sc.addEventListener('touchend', (e) => {
      if (!sw || !st) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      const quick = Date.now() - sw.t < 700;
      sw = null;
      if (quick && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        st.swiped = Date.now();
        turn((dx > 0) === bookRTL() ? 1 : -1);
      }
    }, { passive: true });

    root.addEventListener('click', (e) => {
      if (!st) return;
      const nb = e.target.closest('[data-nid]');
      if (nb && st.mode === 'none' && nb.closest('.pg-ov')) {
        A.V.openNote(nb.dataset.nid, { priv: !!nb.dataset.priv });
        return;
      }
      const t = e.target.closest('[data-act]');
      if (!t) {
        if (!e.target.closest('.rd-scroll') || st.mode !== 'none' || e.target.closest('button') || Date.now() - (st.swiped || 0) < 400) return;
        const r = st.sc.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        if (st.paged && (fx < 0.25 || fx > 0.75)) {
          // Tap the outer quarter of the screen to turn the page, like a book.
          turn((fx < 0.25) === bookRTL() ? 1 : -1);
          return;
        }
        const now = Date.now();
        const lt = st.lastTap;
        if (lt && now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40) {
          // Double tap: zoom in on that spot, or back to fit.
          clearTimeout(st.tapT);
          st.lastTap = null;
          setZoom(st.zoom > 1.05 ? 1 : 2, e.clientX - r.left, e.clientY - r.top);
          return;
        }
        st.lastTap = { t: now, x: e.clientX, y: e.clientY };
        clearTimeout(st.tapT);
        st.tapT = setTimeout(() => {
          if (!st) return;
          st.uiHidden = !st.uiHidden;
          root.classList.toggle('ui-off', st.uiHidden);
          sysRefresh();
        }, 300);
        return;
      }
      const act = t.dataset.act;
      if (act === 'close') R.close();
      else if (act === 'zin') setZoom(st.zoom * 1.2);
      else if (act === 'zout') setZoom(st.zoom / 1.2);
      else if (act === 'fit') setZoom(1);
      else if (act === 'theme') {
        st.theme = { day: 'sepia', sepia: 'night', night: 'day' }[st.theme] || 'day';
        root.dataset.theme = st.theme;
        t.innerHTML = U.icon(st.theme === 'night' ? 'moon' : st.theme === 'sepia' ? 'scroll' : 'sun');
        savePrefs();
        sysRefresh();
      } else if (act === 'tool') setMode(t.dataset.tool);
      else if (act === 'mode-off') setMode(st.mode);
      else if (act === 'panel') togglePanel();
      else if (act === 'more') moreMenu();
      else if (act === 'marks') R.setMarks(R.marksPref() === 'all' ? 'mine' : 'all');
      else if (act === 'retry') {
        const id = st.bookId, p = st.cur;
        R.close(true);
        R.open(id, { page: p });
      } else if (act === 'wird-done') A.V.markWird(st.bookId, t.dataset.wid);
      else if (act === 'book-done') A.V.finishBook(st.bookId);
      else if (act === 'dismiss') {
        st.dismissed = t.dataset.what === 'book' ? 'book' : (G.myCurrent(st.book) || {}).id;
        chrome();
      } else if (act === 'pfilter') {
        st.filter = t.dataset.f;
        renderPanel();
      } else if (act === 'pgo') {
        const p = +t.dataset.p;
        if (window.innerWidth < 900) togglePanel(false);
        goTo(p, true, t.dataset.nid);
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'rd-localfile' && e.target.files[0]) useLocalFile(e.target.files[0]);
    });
    const pin = root.querySelector('#rd-pgin');
    pin.addEventListener('focus', () => pin.select());
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = parseInt(String(pin.value).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);
        if (v) goTo(v);
        pin.blur();
      }
    });
    pin.addEventListener('blur', () => (pin.value = L.num(st ? st.cur : 1, { useGrouping: false })));

    // scrubber
    const scr = root.querySelector('#rd-scrub');
    let scrubbing = false;
    const pageAtPoint = (e) => {
      const r = scr.getBoundingClientRect();
      let f;
      if (st.land) f = (e.clientY - r.top) / r.height;
      else {
        f = (e.clientX - r.left) / r.width;
        if (scr.dir === 'rtl') f = 1 - f;
      }
      return U.clamp(Math.round(f * (st.N - 1)) + 1, 1, st.N);
    };
    scr.addEventListener('pointerdown', (e) => {
      scrubbing = true;
      try { scr.setPointerCapture(e.pointerId); } catch (er) {}
      goTo(pageAtPoint(e), false);
    });
    scr.addEventListener('pointermove', (e) => scrubbing && goTo(pageAtPoint(e), false));
    scr.addEventListener('pointerup', () => (scrubbing = false));
    scr.addEventListener('keydown', (e) => {
      const rtl = scr.dir === 'rtl';
      if (e.key === 'ArrowLeft') goTo(st.cur + (rtl ? 1 : -1), false);
      if (e.key === 'ArrowRight') goTo(st.cur + (rtl ? -1 : 1), false);
      if (st.land && e.key === 'ArrowDown') goTo(st.cur + 1, false);
      if (st.land && e.key === 'ArrowUp') goTo(st.cur - 1, false);
    });

    // zoom: ctrl/cmd + wheel, and two-finger pinch
    sc.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      setZoom(st.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    sc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && st.mode === 'none') {
        const r = sc.getBoundingClientRect();
        pinch = { d0: dist(e.touches), z0: st.zoom, ax: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, ay: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top, s: 1 };
        st.pagesEl.style.transformOrigin = `${pinch.ax + sc.scrollLeft}px ${pinch.ay + sc.scrollTop}px`;
      }
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      pinch.s = U.clamp(dist(e.touches) / pinch.d0, 0.5 / pinch.z0, 4 / pinch.z0);
      st.pagesEl.style.transform = `scale(${pinch.s})`;
    }, { passive: false });
    const pinchEnd = () => {
      if (!pinch) return;
      const p = pinch;
      pinch = null;
      st.pagesEl.style.transform = '';
      setZoom(p.z0 * p.s, p.ax, p.ay);
    };
    sc.addEventListener('touchend', (e) => e.touches.length < 2 && pinchEnd());
    sc.addEventListener('touchcancel', pinchEnd);

    document.addEventListener('keydown', onKey);
    bindDraw();
  }

  function onKey(e) {
    if (!st) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (document.querySelector('.sheet-wrap')) return;
    const sc = st.sc;
    const k = e.key;
    st.userAt = st.activeAt = Date.now();
    keepAwake(true);
    if (k === 'Escape') {
      if (st.mode !== 'none') setMode(st.mode);
      else if (st.panel) togglePanel(false);
      else R.close();
    } else if (st.paged && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'PageDown' || k === 'PageUp' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp')) {
      e.preventDefault();
      const fwd = k === 'PageDown' || k === ' ' || k === 'ArrowDown' || (k === 'ArrowLeft' ? bookRTL() : k === 'ArrowRight' ? !bookRTL() : false);
      turn(fwd ? 1 : -1);
    } else if (k === 'PageDown' || k === ' ' || k === 'ArrowDown') {
      e.preventDefault();
      sc.scrollBy({ top: k === 'ArrowDown' ? 60 : sc.clientHeight * 0.88, behavior: reduced() ? 'auto' : 'smooth' });
    } else if (k === 'PageUp' || k === 'ArrowUp') {
      e.preventDefault();
      sc.scrollBy({ top: k === 'ArrowUp' ? -60 : -sc.clientHeight * 0.88, behavior: reduced() ? 'auto' : 'smooth' });
    } else if (k === 'Home') goTo(1, false);
    else if (k === 'End') goTo(st.N, false);
    else if (k === '+' || k === '=') setZoom(st.zoom * 1.2);
    else if (k === '-') setZoom(st.zoom / 1.2);
    else if (k === 'h') setMode('hl');
    else if (k === 'n') setMode('pin');
  }

  /* ---------- notes panel ---------- */
  function togglePanel(force) {
    st.panel = force == null ? !st.panel : force;
    const p = st.root.querySelector('#rd-panel');
    p.hidden = !st.panel;
    st.root.querySelector('.rd').classList.toggle('has-panel', st.panel);
    if (st.panel) renderPanel();
  }
  function renderPanel() {
    const el = st.root.querySelector('#rd-panel');
    if (!el || el.hidden) return;
    const b = st.book;
    const w = G.wirds(b).find((x) => st.cur >= x.from && st.cur <= x.to) || G.myCurrent(b);
    let list = [...S.notes.values()].filter((n) => n.b === st.bookId && n.kind !== 'take');
    const priv = S.priv && S.priv.notes ? Object.entries(S.priv.notes).filter(([, n]) => n && n.b === st.bookId).map(([id, n]) => Object.assign({ id, priv: true, by: S.me }, n)) : [];
    list = list.concat(priv);
    const f = st.filter;
    if (f === 'wird' && w) list = list.filter((n) => n.page >= w.from && n.page <= w.to);
    if (f === 'mine') list = list.filter((n) => n.by === S.me);
    if (f === 'q') list = list.filter((n) => n.kind === 'q');
    list.sort((a, b2) => a.page - b2.page || String(a.at).localeCompare(String(b2.at)));
    const marks = Object.keys((S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {}).map(Number).sort((a, b2) => a - b2);
    const chip = (id, label) => `<button class="chip${f === id ? ' on' : ''}" data-act="pfilter" data-f="${id}">${label}</button>`;
    el.innerHTML = `<div class="rp-head"><b>${L('ملاحظات الكتاب', 'Notes in this book')}</b><button class="ib" data-act="panel" aria-label="${L('قفل', 'Close')}">${U.icon('close')}</button></div>
      <div class="chips">${w ? chip('wird', L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`)) : ''}${chip('all', L('الكل', 'All'))}${chip('mine', L('بتوعي', 'Mine'))}${chip('q', L('أسئلة', 'Questions'))}</div>
      ${marks.length ? `<div class="rp-marks">${U.icon('bookmark')}${marks.map((p) => `<button class="chip" data-act="pgo" data-p="${p}">${L('ص', 'p.')} ${L.num(p)}</button>`).join('')}</div>` : ''}
      <div class="rp-list">${list.length ? list.map(noteRow).join('') : `<div class="empty sm"><span class="star8 faint"></span><p>${L('مفيش ملاحظات هنا لسه. استخدم «ظلّل» أو «ملاحظة» تحت وابدأ أول واحدة.', 'No notes here yet. Use Highlight or Note below to add the first one.')}</p></div>`}</div>`;
  }
  function noteRow(n) {
    const likes = n.likes ? Object.values(n.likes).filter(Boolean).length : 0;
    const rc = n.replies ? Object.values(n.replies).filter(Boolean).length : 0;
    return `<button class="rp-item" data-act="pgo" data-p="${n.page}" data-nid="${U.esc(n.id)}">
      <span class="rp-meta">${D.avatar(n.by, 'xs')}<b>${U.esc(D.name(n.by))}</b><span class="kind k-${U.esc(n.kind)}">${A.V.kindLabel(n.kind)}</span>${n.priv ? `<span class="kind">${U.icon('lock')}</span>` : ''}<span class="pgn">${L('ص', 'p.')} ${L.num(n.page)}</span></span>
      ${n.crop ? `<img class="rp-crop" src="${U.esc(n.crop)}" alt="">` : ''}
      ${n.text ? `<span class="rp-text" dir="auto">${U.esc(n.text)}</span>` : ''}
      ${likes || rc ? `<span class="rp-stats">${likes ? U.icon('heart') + L.num(likes) : ''} ${rc ? U.icon('chat') + L.num(rc) : ''}</span>` : ''}
    </button>`;
  }

  function moreMenu() {
    const b = st.book;
    const marks = (S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {};
    const marked = !!marks[st.cur];
    A.V.menu([
      (b.toc && b.toc.length) || st.parts.length === 1 ? { ic: 'list', t: L('الفهرس', 'Contents'), fn: showToc } : null,
      { ic: 'bookmark', t: marked ? L('شيل العلامة من الصفحة دي', 'Remove bookmark here') : L('علّم الصفحة دي', 'Bookmark this page'), fn: () => A.V.toggleMark(st.bookId, st.cur) },
      st.pagedPref
        ? { ic: 'scroll', t: L('تمرير متواصل', 'Continuous scrolling'), fn: () => setPaged(false) }
        : { ic: 'book', t: L('صفحة صفحة (زي الكتاب)', 'Page by page (like a book)'), fn: () => setPaged(true) },
      S.sample ? { ic: 'claude', t: L('اسأل Claude عن الصفحة دي', 'Ask Claude about this page'), fn: () => A.V.askPage(st.bookId, st.cur) } : null,
      { ic: 'chat', t: L('نقاش الكتاب', 'Book discussion'), fn: () => { R.close(); A.V.go('book-' + b.id, { tab: 'talk' }); } },
      (b.parts || []).length ? { ic: 'download', t: L('حمّل الكتاب على جهازك', 'Download the book'), fn: () => A.V.download(b.id) } : null,
      ...(() => {
        const v = R.marksPref();
        const o = {
          all: { ic: 'eye', t: L('اظهر إضافات الكل', "Show everyone's highlights and notes"), fn: () => R.setMarks('all') },
          mine: { ic: v === 'all' ? 'eyeoff' : 'eye', t: v === 'all' ? L('اخفي إضافات الباقيين', "Hide others' highlights and notes") : L('اظهر إضافاتي بس', 'Show only mine'), fn: () => R.setMarks('mine') },
          none: { ic: 'eyeoff', t: L('صفحة نضيفة (اخفي كل الإضافات)', 'Clean page (hide all highlights and notes)'), fn: () => R.setMarks('none') },
        };
        return MARKS.filter((k) => k !== v).map((k) => o[k]);
      })(),
      st.land ? { ic: 'swap', t: R.toolsSide() === 'left' ? L('انقل الأدوات لليمين', 'Move the tools to the right') : L('انقل الأدوات للشمال', 'Move the tools to the left'), fn: () => R.setToolsSide(R.toolsSide() === 'left' ? 'right' : 'left') } : null,
      { ic: 'zin', t: L('تكبير', 'Zoom in'), fn: () => setZoom(st.zoom * 1.25), cls: 'show-sm' },
      { ic: 'zout', t: L('تصغير', 'Zoom out'), fn: () => setZoom(st.zoom / 1.25), cls: 'show-sm' },
      { ic: 'fit', t: L('ملء العرض', 'Fit width'), fn: () => setZoom(1), cls: 'show-sm' },
    ].filter(Boolean));
  }

  /* ---------- table of contents (the PDF's own outline) ---------- */
  R.outlineOf = async (pdf, offset = 0) => {
    const out = [];
    let items = null;
    try {
      items = await pdf.getOutline();
    } catch (e) {
      return out;
    }
    const walk = async (list, d) => {
      for (const it of list || []) {
        if (out.length >= 300) return;
        let p = null;
        try {
          let dest = it.dest;
          if (typeof dest === 'string') dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0] != null) p = typeof dest[0] === 'number' ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
        } catch (e) {}
        const t = String(it.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (t && p) out.push({ t, p: p + offset, d });
        if (d < 2 && it.items && it.items.length) await walk(it.items, d + 1);
      }
    };
    await walk(items, 0);
    return out;
  };
  async function tocList() {
    if (st.book.toc && st.book.toc.length) return st.book.toc;
    if (st.toc) return st.toc;
    if (st.parts.length !== 1) return [];
    const s0 = st;
    let list = [];
    try {
      list = await R.outlineOf(await loadPart(st.parts[0]), st.parts[0].from - 1);
    } catch (e) {}
    if (s0 !== st) return [];
    st.toc = list;
    if (list.length && st.parts[0].id !== 'local' && D.canWrite()) D.update(`books/${st.bookId}`, { toc: list }).catch(() => {});
    return list;
  }
  async function showToc() {
    const list = await tocList();
    if (!st) return;
    if (!list.length) return U.toast(L('الملف ده مالوش فهرس جواه. علّم الأماكن المهمة بـ«علّم الصفحة دي» من نفس القائمة.', 'This PDF has no table of contents. Bookmark important pages from this menu instead.'));
    let on = -1;
    list.forEach((x, i) => x.p <= st.cur && (on = i));
    A.V.sheet({
      title: L('الفهرس', 'Contents'),
      html: `<div class="toc-list">${list.map((x, i) => `<button class="toc-it d${x.d}${i === on ? ' on' : ''}" data-i="${i}"><span dir="auto">${U.esc(x.t)}</span><small>${L.num(x.p)}</small></button>`).join('')}</div>`,
      onMount: (body, api) => {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (!b || !st) return;
          api.close();
          goTo(list[+b.dataset.i].p, false);
        });
        const cur = body.querySelector('.toc-it.on');
        if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 50);
      },
    });
  }

  /* ---------- keep the screen on while reading (sleeps again after 5 idle minutes) ---------- */
  let wakeLock = null;
  let nativeAwake = false;
  async function keepAwake(on) {
    if (on && st) st.awakeTried = true;
    try {
      const KA = A.P && A.P.native ? A.P.plugin('KeepAwake') : null;
      if (KA) {
        if (on !== nativeAwake) {
          nativeAwake = on;
          await (on ? KA.keepAwake() : KA.allowSleep());
        }
        return;
      }
      if (on) {
        if (wakeLock || !navigator.wakeLock || document.hidden) return;
        wakeLock = 'pending';
        const l = await navigator.wakeLock.request('screen');
        if (wakeLock !== 'pending' || !st) {
          l.release().catch(() => {});
          if (wakeLock === 'pending') wakeLock = null;
          return;
        }
        wakeLock = l;
        l.addEventListener('release', () => wakeLock === l && (wakeLock = null));
      } else if (wakeLock) {
        const l = wakeLock;
        wakeLock = null;
        if (l !== 'pending') l.release().catch(() => {});
      }
    } catch (e) {
      if (wakeLock === 'pending') wakeLock = null;
    }
  }
  R._awake = () => !!st && (nativeAwake || (!!wakeLock && wakeLock !== 'pending') || !!st.awakeTried);

  /* ---------- live data ---------- */
  R.onData = () => {
    if (!st) return;
    const nb = S.books.get(st.bookId);
    if (!nb) return R.close();
    st.book = nb;
    if (st.notesRef !== S.notes || st.privRef !== S.priv || st.profVer !== S.profiles) {
      st.notesRef = S.notes;
      st.privRef = S.priv;
      st.profVer = S.profiles;
      redrawOverlays();
      if (st.panel) renderPanel();
    }
    chrome();
  };
})();
