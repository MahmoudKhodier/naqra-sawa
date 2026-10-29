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
  /* Book look in page-by-page mode, edge pills for «وقفت هنا», reader orientation and the landscape hint. */
  R.bookPref = () => U.store.get('rdBook', true) !== false;
  /* «وقفت هنا» marks on the edge: when they show (always / with the bars / off), how many, the line colour. */
  R.pillShow = () => {
    const v = U.store.get('rdPillShow', U.store.get('rdPills', true) === false ? 'off' : 'always');
    return v === 'bars' || v === 'off' ? v : 'always';
  };
  R.pillsPref = () => R.pillShow() !== 'off';
  R.pillCount = () => ({ 8: 8, 12: 12, 20: 20 })[U.store.get('rdPillCount', 12)] || 12;
  R.lineColor = () => {
    const v = U.store.get('rdLineColor', 'green');
    return ['green', 'gold', 'red', 'blue'].includes(v) ? v : 'green';
  };
  const edgeUi = (rd) => {
    rd.dataset.pills = R.pillShow();
    rd.dataset.line = R.lineColor();
  };
  R.setEdge = (k, v) => {
    U.store.set(k, v);
    if (!st) return;
    edgeUi(st.root.querySelector('.rd'));
    redrawOverlays();
  };
  R.orientPref = () => {
    const v = U.store.get('rdOrient', 'auto');
    return v === 'portrait' || v === 'landscape' ? v : 'auto';
  };
  R.orientAsk = () => U.store.get('rdOrientAsk', true) !== false;
  /* Encouragement while reading: everything / only the big moments / none; a «+1» and a light buzz for each
     page that counts; the page-turn animation and its paper sound. */
  R.cheerPref = () => {
    const v = U.store.get('rdCheer', 'all');
    return v === 'key' || v === 'off' ? v : 'all';
  };
  R.popPref = () => U.store.get('rdPop', true) !== false;
  R.turnAnimPref = () => U.store.get('rdTurnAnim', true) !== false;
  R.turnSoundPref = () => U.store.get('rdTurnSound', false) === true;
  R.setBookLook = (on) => {
    U.store.set('rdBook', !!on);
    if (!st) return;
    st.root.querySelector('.rd').classList.toggle('booky', !!on);
    relayout();
  };

  const placeOf = (bookId) => (S.priv && S.priv.place && S.priv.place[bookId]) || null;
  /* Colours for the strips around the page in the Android app (see sysui.js): the bars' colour while they
     show, the page background while they are hidden. */
  const SYS = {
    day: { bar: '#fcfcfd', bg: '#e6e8ef', light: true },
    sepia: { bar: '#f5ecdb', bg: '#e3d6bd', light: true },
    night: { bar: '#151821', bg: '#0d0f15', light: false },
    cream: { bar: '#fbf7ec', bg: '#ebe4d2', light: true },
    mint: { bar: '#f0f8f3', bg: '#d5e8dc', light: true },
    sky: { bar: '#f0f5fb', bg: '#d6e2f0', light: true },
    rose: { bar: '#fbf2f3', bg: '#ecd9dc', light: true },
    parchment: { bar: '#f1e3c4', bg: '#d6c096', light: true },
    ink: { bar: '#141a2b', bg: '#0b1020', light: false },
    coffee: { bar: '#2a2119', bg: '#1b1510', light: false },
    oled: { bar: '#000000', bg: '#000000', light: false },
  };
  /* A paper colour this reader may use (some are rewards); anything else falls back to white. */
  const paperOf = (t) => (SYS[t] && (!G.paperOk || G.paperOk(t)) ? t : 'day');
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
        v === 'all' ? L('إضافات الكل ظاهرة على الصفحات', "Everyone's highlights and notes are showing", 'إضافات الجميع ظاهرة على الصفحات')
          : v === 'mine' ? L('خبّينا إضافات الباقيين — إضافاتك بس اللي ظاهرة', "Others' highlights and notes are hidden — only yours show", 'أخفينا إضافات الآخرين — تظهر إضافاتك فقط')
            : L('صفحة نضيفة: كل الإضافات مخفية', 'Clean page: all highlights and notes are hidden', 'صفحة نظيفة: كل الإضافات مخفية'),
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
    const N0 = book.pages || 1;
    // Where reading goes on: «وقفت هنا» (unless you read further on another device), else the last page read.
    const place = placeOf(bookId);
    const last = (prog && prog.last) || U.store.get('last:' + bookId, 1) || 1;
    let front = U.clamp((place && place.p ? (last > place.p + 2 ? last : place.p) : last) | 0, 1, N0);
    let start = U.clamp((opts.page || front) | 0, 1, N0);
    // Opening a portion (or right next to where you are) is reading; any other page is a look around.
    const myW = G.myCurrent(book);
    if (opts.page && (opts.read || (myW && start >= myW.from && start <= myW.to) || Math.abs(start - front) <= 2)) front = start;
    st = {
      bookId, book, N: book.pages || 1, zoom: prefs.zoom || 1, theme: paperOf(prefs.theme || 'day'), mode: 'none',
      parts: (book.parts || []).map((p) => Object.assign({}, p, { pdf: null, loading: null })),
      sizeFix: {}, els: new Map(), want: [], busy: false, gen: 0, cur: start, lastSaved: start,
      pending: new Set(), dwellP: 0, dwellN: 0, sessionPages: 0, flash: opts.flash || null, uiHidden: false,
      notesVer: -1, panel: null, filter: 'wird', lastTop: 0,
      pagedPref: !!prefs.paged, paged: !!prefs.paged && !((prefs.zoom || 1) > 1.01), startedAt: Date.now(), activeSecs: 0, secsPending: 0, userAt: 0, activeAt: Date.now(),
      front, browsing: false, counted: new Set(),
      // encouragement: where today, the book and the portion stood when the book was opened
      base: openBase(book, prog), cheerAt: 0, scrollAt: 0, cheered: {}, focus: null, liveSeen: new Set(),
    };
    root.hidden = false;
    document.body.classList.add('reading');
    root.innerHTML = shell();
    root.querySelector('.rd').classList.toggle('paged', st.paged);
    st.land = isLand();
    root.querySelector('.rd').classList.toggle('land', st.land);
    root.querySelector('.rd').classList.toggle('swap', swapNow());
    root.querySelector('.rd').classList.toggle('booky', R.bookPref());
    edgeUi(root.querySelector('.rd'));
    st.root = root;
    st.sc = root.querySelector('#rd-scroll');
    st.pagesEl = root.querySelector('#rd-pages');
    bind();
    marksUi();
    geom();
    if (!opts.page && place && place.p === start && !st.paged && place.y > 0.02) {
      // put the «وقفت هنا» line a third of the way down the screen
      st.sc.scrollTop = Math.max(0, st.tops[start] + place.y * st.hs[start] - st.sc.clientHeight * 0.3);
      update();
    } else goTo(start, false);
    st.browsing = start > st.front + 2 || start < st.front - 1;
    browseUi();
    chrome();
    D.presence({ b: bookId, p: start });
    st.tick = setInterval(tick, 1000);
    st.flushT = setInterval(() => flush(), 12000);
    st.onVis = () => {
      if (document.hidden) {
        savePlace();
        flush();
      } else keepAwake(true);
    };
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
    if (R.orientPref() !== 'auto' && A.Sys && A.Sys.orient(R.orientPref())) st.oriented = true;
    else askLandscape();
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
    savePlace();
    flush();
    if (st.oriented && A.Sys) A.Sys.orient('auto');
    clearTimeout(st.orientT);
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
      const frame = R.bookPref() ? 22 : 0; // the cover board and the stack of page edges around each page
      for (let p = 1; p <= N; p++) {
        const [w0, h0] = size(p);
        const w = Math.round(Math.min(st.baseW - frame * 2, ((H - 12 - frame * 2) * w0) / h0));
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
  /* Book look: each page is one side of a leaf. In an Arabic book the even pages are right-hand pages (page
     edges on the right) and the odd ones left-hand pages; the other way round in an English book. The stack
     of edges grows on the side the pages pile up: read pages on the side you turn them to. */
  function sideOf(p) {
    const odd = p % 2 === 1;
    return bookRTL() ? (odd ? 'l' : 'r') : odd ? 'r' : 'l';
  }
  function stackOf(p, side) {
    const readSide = bookRTL() ? 'r' : 'l';
    const n = Math.max(1, st.N - 1);
    const f = side === readSide ? (p - 1) / n : (st.N - p) / n;
    return 2 + Math.round(f * 8);
  }
  function placeEl(p, el) {
    const side = st.paged && R.bookPref() ? sideOf(p) : bookRTL() ? 'r' : 'l';
    el.dataset.side = side;
    el.style.setProperty('--stack', stackOf(p, side) + 'px');
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
  /* +1 = next page in reading order. In page-by-page mode the page you leave lifts and turns over its spine
     edge like a leaf (or the new page slides in, with the animation off), with an optional paper sound. */
  function turn(dir) {
    if (!st) return;
    const to = U.clamp(st.cur + dir, 1, st.N);
    if (to === st.cur) return;
    if (!st.paged) return goTo(to, true);
    const leaf = R.turnAnimPref() && !reduced() ? leafOf(st.cur) : null;
    goTo(to, false);
    if (R.turnSoundPref()) rustle();
    if (leaf) return flipLeaf(leaf, dir);
    const el = st.els.get(to);
    if (el && el.animate && !reduced()) {
      const from = (dir > 0) === bookRTL() ? -1 : 1;
      el.animate([{ transform: `translateX(${from * 56}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  /* A copy of the page on screen, laid over it, to turn away. */
  function leafOf(p) {
    const el = st.els.get(p);
    const c = el && el.querySelector('canvas');
    if (!c || !c.width) return null;
    const r = el.getBoundingClientRect();
    const box = st.root.firstElementChild.getBoundingClientRect();
    const leaf = document.createElement('div');
    leaf.className = 'turn-leaf';
    leaf.setAttribute('aria-hidden', 'true');
    leaf.style.cssText = `left:${r.left - box.left}px;top:${r.top - box.top}px;width:${r.width}px;height:${r.height}px`;
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext('2d').drawImage(c, 0, 0);
    leaf.appendChild(copy);
    leaf.insertAdjacentHTML('beforeend', '<i class="tl-shade"></i>');
    return leaf;
  }
  function flipLeaf(leaf, dir) {
    // In an Arabic book a leaf turns over its right-hand edge (the spine) going on, and the other way back.
    const pivotRight = (dir > 0) === bookRTL();
    leaf.style.transformOrigin = pivotRight ? 'right center' : 'left center';
    leaf.classList.add(pivotRight ? 'pv-r' : 'pv-l');
    st.root.firstElementChild.appendChild(leaf);
    const ang = pivotRight ? 90 : -90;
    const opts = { duration: 480, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'forwards' };
    const a = leaf.animate([{ transform: 'perspective(1800px) rotateY(0deg)' }, { transform: `perspective(1800px) rotateY(${ang}deg)` }], opts);
    leaf.querySelector('.tl-shade').animate([{ opacity: 0 }, { opacity: 1 }], opts);
    const done = () => leaf.remove();
    a.onfinish = a.oncancel = done;
    setTimeout(done, 1000);
  }
  /* A soft paper sound: a short burst of filtered noise. */
  let actx = null, noise = null;
  function rustle() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (!noise) {
        const len = Math.floor(actx.sampleRate * 0.36);
        noise = actx.createBuffer(1, len, actx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
      }
      const t = actx.currentTime;
      const src = actx.createBufferSource();
      src.buffer = noise;
      const hp = actx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(1600, t);
      bp.frequency.linearRampToValueAtTime(3800, t + 0.3);
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      src.connect(hp).connect(bp).connect(g).connect(actx.destination);
      src.start(t);
      src.stop(t + 0.36);
    } catch (e) {}
  }
  R._rustle = rustle;
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
    const was = st.browsing;
    st.browsing = p > st.front + 2 || p < st.front - 1;
    if (was !== st.browsing) browseUi();
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
      if (st.focus) {
        st.focus.done++;
        if (st.focus.done >= st.focus.mins * 60) finishFocus();
        else if (st.focus.done % 10 === 0) goalUi();
      } else if (st.activeSecs % 20 === 0 && G.dailyGoal().k === 'mins') goalUi();
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
    if (st.browsing) return; // looking around doesn't count
    if (p > st.front) {
      st.front = p;
      U.store.set('last:' + st.bookId, p);
    }
    const prog = D.prog(st.bookId);
    if ((prog && U.rangesHas(prog.seen, p)) || st.pending.has(p)) return;
    st.pending.add(p);
    st.counted.add(p);
    st.sessionPages++;
    plusOne();
    chrome();
    bookMilestones();
  }
  async function flush() {
    if (!st || !D.canWrite() || !D.joined()) return;
    const bookId = st.bookId;
    const pages = [...st.pending];
    st.pending.clear();
    const cur = st.front; // resume where reading goes on, not where you looked around
    const prog = D.prog(bookId);
    const fresh = pages.filter((p) => !(prog && U.rangesHas(prog.seen, p)));
    const secs = st.secsPending >= 30 ? st.secsPending : 0;
    if (secs) st.secsPending = 0;
    const sitMins = Math.floor(st.activeSecs / 60); // this sitting so far (minutes without closing the book)
    if (!fresh.length && !secs && prog && prog.last === cur) return;
    if (!fresh.length && !secs && Math.abs((st.lastSaved || 0) - cur) < 1) return;
    st.lastSaved = cur;
    try {
      const k = U.today();
      if (fresh.length || !prog || prog.last !== cur)
        await D.saveProg(bookId, (c) => {
          const add = fresh.filter((p) => !U.rangesHas(c.seen, p)).length;
          const patch = { seen: U.rangesAdd(c.seen, fresh), last: cur };
          if (add) patch.days = Object.assign({}, c.days, { [k]: ((c.days && +c.days[k]) || 0) + add });
          return patch;
        });
      if (fresh.length || secs) await D.addPagesToday(fresh.length, secs, sitMins);
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
    let html = marks && marks[p] ? `<span class="pg-mark" title="${U.esc(L('علامة', 'Bookmark', 'علامة مرجعية'))}">${U.icon('bookmark')}</span>` : '';
    const show = R.marksPref();
    const moved = (S.priv && S.priv.moved) || {};
    const hidden = (S.priv && S.priv.hidden) || {};
    for (const n of ns) {
      if (show === 'none' || (show === 'mine' && n.by !== S.me)) continue;
      if (n.by !== S.me && hidden[n.id]) continue;
      const mv = n.by !== S.me && moved[n.id];
      const r = mv ? Object.assign({}, n.rect, { x: mv.x, y: mv.y }) : n.rect;
      const col = U.col(n.color, COLORS[0]);
      const rc = n.replies ? Object.values(n.replies).filter(Boolean).length : 0;
      const likes = n.likes ? Object.values(n.likes).filter(Boolean).length : 0;
      const label = U.esc(D.name(n.by) + (n.text ? ': ' + n.text.slice(0, 80) : ''));
      if (r.w < 0.012 && r.h < 0.012) {
        html += `<button class="pinb${n.priv ? ' priv' : ''}${mv ? ' moved' : ''}" data-nid="${U.esc(n.id)}" data-priv="${n.priv ? 1 : ''}" style="left:${r.x * 100}%;top:${r.y * 100}%;--c:${U.esc(col)}" aria-label="${label}">${D.avatar(n.by, 'xs')}${rc ? `<i>${L.num(rc)}</i>` : ''}</button>`;
      } else {
        html += `<button class="hlb k-${U.esc(n.kind || 'hl')}${n.priv ? ' priv' : ''}" data-nid="${U.esc(n.id)}" data-priv="${n.priv ? 1 : ''}" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%;--c:${U.esc(col)};--a:${U.esc(D.color(n.by))}" aria-label="${label}"><span class="hl-tag">${D.avatar(n.by, 'xs')}${n.kind === 'q' ? '<b>؟</b>' : ''}${rc + likes ? `<i>${L.num(rc + likes)}</i>` : ''}</span></button>`;
      }
    }
    // «وقفت هنا»: a line across the page, and pills along the edge to put it on any line with one tap.
    const pl = placeOf(st.bookId);
    if (pl && pl.p === p && (pl.manual || pl.y > 0.02))
      html += `<div class="place-line" style="top:${pl.y * 100}%"><button class="pl-tab" data-act="place-off" aria-label="${L('شيل علامة وقفت هنا', 'Remove the stopped-here line', 'أزِل علامة «توقفتُ هنا»')}">${U.icon('bookmark')}<span>${L('وقفت هنا', 'Stopped here', 'توقفتُ هنا')}</span></button></div>`;
    if (R.pillsPref() && D.canWrite()) {
      const n = R.pillCount();
      for (let i = 0; i < n; i++) {
        const y = (i + 0.5) / n;
        const on = pl && pl.p === p && Math.abs(pl.y - y) < 0.5 / n;
        html += `<button class="pill-edge${on ? ' on' : ''}" data-act="place" data-p="${p}" data-y="${r4(y)}" style="top:${y * 100}%" aria-label="${L(`وقفت هنا: ص ${L.num(p)}`, `I stopped here: p. ${p}`, `توقفتُ هنا: ص ${L.num(p)}`)}"></button>`;
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
        ? `${U.icon('hl')}<span>${L('اسحب على الجزء اللي عايز تظلّله', 'Drag over the passage you want to highlight', 'اسحب على الجزء الذي تريد تظليله')}</span><button class="lnk" data-act="mode-off">${L('إلغاء', 'Cancel', 'إلغاء')}</button>`
        : st.mode === 'pin'
          ? `${U.icon('pin')}<span>${L('دوس على المكان اللي عايز تحط فيه ملاحظة', 'Tap where you want to pin a note', 'اضغط على المكان الذي تريد وضع ملاحظة فيه')}</span><button class="lnk" data-act="mode-off">${L('إلغاء', 'Cancel', 'إلغاء')}</button>`
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
  /* Long-press a pin, then drag it. My note moves for everyone; someone else's moves only on my screen
     (saved in my private document), so nobody can move or change another person's note for others. */
  function bindMove() {
    let mv = null;
    const hint = (t) => {
      const h = st.root.querySelector('#rd-hint');
      h.hidden = !t;
      h.innerHTML = t ? `${U.icon('pin')}<span>${t}</span>` : '';
    };
    const cancel = () => {
      if (!mv) return;
      clearTimeout(mv.t);
      if (mv.on) {
        mv.pin.classList.remove('moving');
        hint('');
        redrawOverlays();
      }
      mv = null;
    };
    st.pagesEl.addEventListener('contextmenu', (e) => e.target.closest('.pinb') && e.preventDefault());
    st.pagesEl.addEventListener('pointerdown', (e) => {
      if (st.mode !== 'none' || !D.canWrite()) return;
      const pin = e.target.closest('.pinb');
      if (!pin) return;
      mv = { pin, ov: pin.closest('.pg-ov'), id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false };
      mv.t = setTimeout(() => {
        if (!mv) return;
        const nid = mv.pin.dataset.nid;
        const priv = !!mv.pin.dataset.priv;
        mv.n = priv ? Object.assign({ id: nid, by: S.me, priv: true }, (S.priv && S.priv.notes && S.priv.notes[nid]) || {}) : S.notes.get(nid);
        if (!mv.n) return cancel();
        mv.mine = mv.n.by === S.me;
        mv.on = true;
        try {
          mv.pin.setPointerCapture(mv.id);
        } catch (er) {}
        mv.pin.classList.add('moving');
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {}
        hint(mv.mine ? L('اسحبها لمكانها الجديد — هتتحرك عند الكل', 'Drag it to its new place — it moves for everyone', 'اسحبها إلى مكانها الجديد — ستنتقل لدى الجميع') : L('بتحرّكها عندك بس — عند الباقيين هتفضل مكانها', 'Moving it on your screen only — it stays put for everyone else', 'تحرّكها على شاشتك فقط — وتبقى في مكانها لدى الآخرين'));
      }, 420);
    });
    st.pagesEl.addEventListener('pointermove', (e) => {
      if (!mv || e.pointerId !== mv.id) return;
      if (!mv.on) {
        if (Math.hypot(e.clientX - mv.x0, e.clientY - mv.y0) > 8) cancel();
        return;
      }
      e.preventDefault();
      const r = mv.ov.getBoundingClientRect();
      mv.x = U.clamp((e.clientX - r.left) / r.width, 0.03, 0.97);
      mv.y = U.clamp((e.clientY - r.top) / r.height, 0.04, 0.99);
      mv.pin.style.left = mv.x * 100 + '%';
      mv.pin.style.top = mv.y * 100 + '%';
    });
    const end = async (e) => {
      if (!mv || e.pointerId !== mv.id) return;
      const m = mv;
      clearTimeout(m.t);
      mv = null;
      if (!m.on) return;
      st.movedAt = Date.now();
      m.pin.classList.remove('moving');
      hint('');
      if (m.x == null) return;
      const x = r4(m.x), y = r4(m.y);
      try {
        if (!m.mine) {
          await D.privUpdate((cur) => Object.assign(cur, { moved: Object.assign({}, cur.moved, { [m.n.id]: { x, y } }) }));
          U.toast(L('اتحرّكت عندك بس. ترجّعها من الملاحظة نفسها.', 'Moved on your screen only. Put it back from the note itself.', 'نُقلت على شاشتك فقط. يمكنك إعادتها من الملاحظة نفسها.'));
        } else if (m.n.priv) {
          await D.privUpdate((cur) => {
            const notes = Object.assign({}, cur.notes);
            if (!notes[m.n.id]) return null;
            notes[m.n.id] = Object.assign({}, notes[m.n.id], { rect: Object.assign({}, notes[m.n.id].rect, { x, y }) });
            return Object.assign(cur, { notes });
          });
        } else await D.update(`notes/${m.n.id}`, { rect: { x, y } });
      } catch (er) {
        redrawOverlays();
      }
    };
    st.pagesEl.addEventListener('pointerup', end);
    st.pagesEl.addEventListener('pointercancel', cancel);
  }
  R.hiddenHere = () => {
    const h = (S.priv && S.priv.hidden) || {};
    return Object.keys(h).filter((id) => h[id] && S.notes.has(id) && S.notes.get(id).b === (st && st.bookId));
  };

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
        <button class="ib" data-act="close" aria-label="${L('رجوع', 'Back', 'رجوع')}">${U.icon('back', 'flip')}</button>
        <div class="rd-title"><b dir="auto">${U.esc(b.title)}</b><span id="rd-wird"></span><span class="rd-wprog" id="rd-wprog" data-act="friends" hidden><i></i><span class="rd-wfr"></span></span></div>
        <button class="rd-goal" id="rd-goal" data-act="goal" aria-label="${L('هدف النهارده', "Today's goal", 'هدف اليوم')}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rg-bg" cx="18" cy="18" r="15.5"/><circle class="rg-fg" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="0 100"/></svg><b id="rd-goal-n">${L.num(0)}</b></button>
        <label class="rd-pg"><input id="rd-pgin" inputmode="numeric" aria-label="${L('رقم الصفحة', 'Page number', 'رقم الصفحة')}" value="${L.num(st.cur, { useGrouping: false })}"><span>/ ${L.num(st.N, { useGrouping: false })}</span></label>
        <div class="rd-acts">
          <button class="ib hide-sm" data-act="zout" aria-label="${L('تصغير', 'Zoom out', 'تصغير')}">${U.icon('zout')}</button>
          <button class="ib hide-sm zl" data-act="fit" id="rd-zoom" aria-label="${L('ملء العرض', 'Fit width', 'ملء العرض')}">${L.num(Math.round(st.zoom * 100))}${L.isAr() ? '٪' : '%'}</button>
          <button class="ib hide-sm" data-act="zin" aria-label="${L('تكبير', 'Zoom in', 'تكبير')}">${U.icon('zin')}</button>
          <button class="ib rd-bm" data-act="bmark" id="rd-bm" aria-label="${L('علّم الصفحة', 'Bookmark this page', 'ضع علامة على الصفحة')}">${U.icon('bookmark')}</button>
          <button class="ib rd-paper" data-act="theme" aria-label="${L('لون الصفحة', 'Page colour', 'لون الصفحة')}">${U.icon('palette')}</button>
          <button class="ib" data-act="panel" aria-label="${L('الملاحظات', 'Notes', 'الملاحظات')}">${U.icon('list')}<i class="dot" id="rd-ncount" hidden></i></button>
          <button class="ib" data-act="more" aria-label="${L('المزيد', 'More', 'المزيد')}">${U.icon('more')}</button>
        </div>
      </header>
      <div class="rd-scroll" id="rd-scroll" tabindex="-1"><div class="rd-pages" id="rd-pages"></div></div>
      <div class="rd-hint" id="rd-hint" hidden></div>
      <div class="rd-wline" id="rd-wline" hidden aria-hidden="true"><i></i><span class="rd-wfr"></span></div>
      <div class="rd-cheer" id="rd-cheer" role="status" aria-live="polite" hidden></div>
      <div class="rd-browse" id="rd-browse" role="status" hidden></div>
      <div class="rd-orient" id="rd-orient" hidden></div>
      <div class="rd-load" id="rd-load" hidden><div class="rd-load-card"><div class="spin8"></div><b id="rd-load-t">${L('بنجهّزلك الكتاب…', 'Preparing the book…', 'جارٍ تجهيز الكتاب…')}</b><div class="bar"><i id="rd-load-bar"></i></div><small id="rd-load-s"></small></div></div>
      <footer class="rd-bot">
        <div class="rd-prompt" id="rd-prompt" hidden></div>
        <div class="rd-botrow">
          <div class="rd-tools">
            <button class="tool" data-tool="hl" data-act="tool">${U.icon('hl')}<span>${L('ظلّل', 'Highlight', 'ظلِّل')}</span></button>
            <button class="tool" data-tool="pin" data-act="tool">${U.icon('pin')}<span>${L('ملاحظة', 'Note', 'ملاحظة')}</span></button>
            <button class="tool tool-eye" data-act="marks" id="rd-eye"></button>
          </div>
          <div class="rd-scrub" id="rd-scrub" dir="${dirBook}" role="slider" tabindex="0" aria-label="${L('مكانك في الكتاب', 'Position in book', 'موضعك في الكتاب')}" aria-valuemin="1" aria-valuemax="${st.N}"></div>
        </div>
      </footer>
      <aside class="rd-panel" id="rd-panel" hidden></aside>
    </div>`;
  }

  /* ---------- encouragement while reading ----------
     Quiet by design: one small chip at the top edge (never over the middle of the page, never takes a tap),
     shown only once the page has stopped moving, at most one every two minutes except for the big moments
     (a portion done, ¼ ½ ¾ of the book, today's goal, a focus session), changing words so it doesn't repeat,
     silent during a focus session, and adjustable in Settings (everything / big moments only / off). */
  const POOLS = {
    start: [['يلا بينا — الورد {n} • {pagesT}', 'Here we go — portion {n} • {pagesT}', 'هيا بنا — الورد {n} • {pagesT}'], ['بسم الله، الورد {n} بدأ', 'Portion {n} — off we go', 'بسم الله، بدأ الورد {n}'], ['الورد {n}: {pagesT} وبس', 'Portion {n}: just {pagesT}', 'الورد {n}: {pagesT} فقط']],
    half: [['نص الورد خلص — كمّل كده ✨', 'Half of the portion done — keep going ✨', 'انتهى نصف الورد — واصل هكذا ✨'], ['عدّيت نص المشوار، عاش 👌', "You're halfway there 👌", 'أنت في منتصف الطريق 👌'], ['نص الورد ورا ضهرك ✨', 'Half the portion behind you ✨', 'نصف الورد صار خلفك ✨']],
    last: [['فاضل {leftT} بس… شدّ حيلك 💪', 'Just {leftT} left 💪', 'لم يبقَ سوى {leftT} 💪'], ['خلاص هانت — {leftT} 🔥', 'Almost there — {leftT} 🔥', 'النهاية قريبة — {leftT} 🔥'], ['آخر {leftT} في الورد 💪', 'The last {leftT} of the portion 💪', 'آخر {leftT} في الورد 💪']],
    done: [['خلّصت صفحات الورد {n}! 🎉', 'You read every page of portion {n}! 🎉', 'أنهيت صفحات الورد {n}! 🎉'], ['الورد {n} خلص — برافو عليك 🎉', 'Portion {n} done — well done 🎉', 'اكتمل الورد {n} — أحسنت 🎉'], ['عاش! الورد {n} تم 🎉', 'Nice! Portion {n} complete 🎉', 'رائع! تمّ الورد {n} 🎉']],
    m0: [['ربع الكتاب ✓ +{xp} XP', 'A quarter of the book ✓ +{xp} XP', 'ربع الكتاب ✓ +{xp} XP'], ['جامد! قريت ربع الكتاب 📖 +{xp} XP', "You've read a quarter of the book 📖 +{xp} XP", 'قرأت ربع الكتاب 📖 +{xp} XP']],
    m1: [['يا سلام، نص الكتاب! 🎉 +{xp} XP', 'Half the book! 🎉 +{xp} XP', 'نصف الكتاب! 🎉 +{xp} XP'], ['جامد! وصلت لنص الكتاب ✨ +{xp} XP', "You're halfway through the book ✨ +{xp} XP", 'بلغت منتصف الكتاب ✨ +{xp} XP']],
    m2: [['عاش! تلت تربع الكتاب 🔥 +{xp} XP', 'Three quarters of the book 🔥 +{xp} XP', 'ثلاثة أرباع الكتاب 🔥 +{xp} XP'], ['فاضل ربع وتقفله 🔥 +{xp} XP', 'Only the last quarter left 🔥 +{xp} XP', 'بقي الربع الأخير فقط 🔥 +{xp} XP']],
    goal: [['هدف النهارده في الجون 🎯 سلسلتك في أمان', "Today's goal reached 🎯 your streak is safe", 'تحقق هدف اليوم 🎯 سلسلتك في أمان'], ['🎯 هدف النهارده تمام! +{xp} XP', "🎯 Today's goal done! +{xp} XP", '🎯 أنجزت هدف اليوم! +{xp} XP']],
    passed: [['لحقت {name} في الورد 👋', 'You caught up with {name} in this portion 👋', 'لحقت بـ{name} في الورد 👋'], ['بقيت جنب {name} في الورد 👋', "You're level with {name} in this portion 👋", 'أصبحت بجانب {name} في الورد 👋']],
    live: [['{name} معاك في الكتاب دلوقتي 👋', '{name} is in this book right now 👋', '{name} معك في الكتاب الآن 👋']],
    focus: [['جلسة تركيز {minsT} ✓ +{xp} XP', 'Focus session: {minsT} ✓ +{xp} XP', 'جلسة تركيز {minsT} ✓ +{xp} XP']],
  };
  function pick(kind, vars = {}) {
    const pool = POOLS[kind] || [];
    const [ar, en, fu] = pool[Math.floor(Math.random() * pool.length)] || ['', ''];
    const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : typeof vars[k] === 'number' ? L.num(vars[k]) : String(vars[k])));
    return L(fill(ar), fill(en), fu && fill(fu));
  }
  function cheer(msg, opts = {}) {
    if (!st || !msg) return;
    const pref = R.cheerPref();
    if (pref === 'off' || (!opts.key && (pref === 'key' || st.focus))) return;
    const now = Date.now();
    if (!opts.key && now - st.cheerAt < 120000) return;
    // one at a time: a big moment waits for the one showing, a small one is dropped
    if (now < (st.cheerBusy || 0)) {
      if (opts.key) (st.cheerQ = st.cheerQ || []).push([msg, opts]);
      return;
    }
    // wait for the page to stop moving, so nothing pops up mid-swipe
    if (now - st.scrollAt < 900 && (opts.tries || 0) < 8) {
      clearTimeout(st.cheerWait);
      st.cheerWait = setTimeout(() => cheer(msg, Object.assign({}, opts, { tries: (opts.tries || 0) + 1 })), 800);
      return;
    }
    const el = st.root.querySelector('#rd-cheer');
    if (!el) return;
    const dur = opts.key ? 3400 : 2600;
    st.cheerAt = now;
    st.cheerBusy = now + dur + 350;
    (st.cheerLog = st.cheerLog || []).push(opts.kind || '');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    for (const g of st.root.querySelectorAll('#rd-wprog, #rd-wline')) {
      g.classList.remove('glow');
      void g.offsetWidth;
      g.classList.add('glow');
    }
    clearTimeout(st.cheerT);
    st.cheerT = setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => {
        if (!st) return;
        el.hidden = true;
        st.cheerBusy = 0;
        const nx = (st.cheerQ || []).shift();
        if (nx) cheer(nx[0], nx[1]);
      }, 320);
    }, dur);
  }

  /* Where things stood when the book was opened: today's pages and minutes as saved, and how much of this
     book was read — so the ring and the cheers only celebrate what happens now. */
  function openBase(book, prog) {
    const me = S.members.get(S.me) || {};
    const k = U.today();
    return { day: k, goalDone: !!(me.gd && me.gd[k]), book: U.rangesCount(prog && prog.seen), wird: {} };
  }
  /* Today so far: saved pages and minutes plus what this session has not saved yet. */
  function todayNow() {
    const me = S.members.get(S.me) || {};
    const k = U.today();
    const prog = D.prog(st.bookId);
    let unsaved = 0;
    for (const p of st.pending) if (!(prog && U.rangesHas(prog.seen, p))) unsaved++;
    return { pages: ((me.days && +me.days[k]) || 0) + unsaved, mins: Math.floor((((me.secs && +me.secs[k]) || 0) + st.secsPending) / 60) };
  }

  /* The ring in the top bar: today's pages (or minutes) towards the daily goal; during a focus session it
     counts the minutes left instead. */
  function goalUi() {
    const el = st && st.root.querySelector('#rd-goal');
    if (!el) return;
    const fg = el.querySelector('.rg-fg');
    const n = el.querySelector('#rd-goal-n');
    let f, txt, label;
    if (st.focus) {
      const left = Math.max(0, st.focus.mins * 60 - st.focus.done);
      f = st.focus.done / (st.focus.mins * 60);
      txt = L.num(Math.ceil(left / 60));
      label = L(`جلسة تركيز: فاضل ${L.count(Math.ceil(left / 60), 'minute')}`, `Focus session: ${Math.ceil(left / 60)} min left`, `جلسة تركيز: بقي ${L.count(Math.ceil(left / 60), 'minute')}`);
      el.classList.remove('met');
    } else {
      const g = G.dailyGoal();
      const t = todayNow();
      const have = g.k === 'mins' ? t.mins : t.pages;
      f = have / g.n;
      txt = L.num(have);
      label = L(`هدف النهارده: ${L.num(have)} من ${g.k === 'mins' ? L.count(g.n, 'minute') : L.count(g.n, 'page')}`, `Today's goal: ${have} of ${g.n} ${g.k === 'mins' ? 'minutes' : 'pages'}`, `هدف اليوم: ${L.num(have)} من ${g.k === 'mins' ? L.count(g.n, 'minute') : L.count(g.n, 'page')}`);
      el.classList.toggle('met', have >= g.n);
      if (have >= g.n && !st.base.goalDone && !st.goalCheered && st.base.day === U.today()) {
        st.goalCheered = true;
        burst(el);
        U.chime('ok');
        cheer(pick('goal', { xp: G.XP.goal }), { key: true, kind: 'goal' });
      }
    }
    el.classList.toggle('focus', !!st.focus);
    fg.setAttribute('stroke-dasharray', `${(U.clamp(f, 0, 1) * 100).toFixed(1)} 100`);
    if (n.textContent !== txt) n.textContent = txt;
    el.setAttribute('aria-label', label);
    el.title = label;
  }
  function burst(el) {
    el.classList.remove('burst');
    void el.offsetWidth;
    el.classList.add('burst');
    if (navigator.vibrate && R.popPref()) try { navigator.vibrate([12, 60, 18]); } catch (e) {}
  }
  /* «+1» floating up from the ring, and a light buzz, for each page that counts. */
  function plusOne() {
    if (!R.popPref()) return;
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    if (reduced()) return;
    const rd = st.root.firstElementChild;
    const el = document.createElement('span');
    el.className = 'plus1';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '+' + L.num(1);
    const ring = st.root.querySelector('#rd-goal');
    const r = ring && !st.uiHidden ? ring.getBoundingClientRect() : null;
    if (r && r.width) {
      // beside the ring (towards the page number), rising
      const rtl = document.documentElement.dir === 'rtl';
      el.style.left = Math.round(rtl ? r.left - 4 : r.right + 4) + 'px';
      el.style.top = Math.round(r.top + r.height * 0.35) + 'px';
      el.classList.add(rtl ? 'to-l' : 'to-r');
      const n = ring.querySelector('b');
      n.classList.remove('bump');
      void n.offsetWidth;
      n.classList.add('bump');
    } else el.classList.add('corner');
    rd.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /* ¼, ½ and ¾ of the whole book, once each, only when crossed in this session. */
  function bookMilestones() {
    const N = st.N;
    if (N < 20) return;
    const prog = D.prog(st.bookId);
    let n = U.rangesCount(prog && prog.seen);
    for (const p of st.pending) if (!(prog && U.rangesHas(prog.seen, p))) n++;
    G.MILESTONES.forEach((f, i) => {
      const need = Math.ceil(f * N);
      if (st.base.book < need && n >= need && !st.cheered['m' + i]) {
        st.cheered['m' + i] = true;
        U.chime('soft');
        cheer(pick('m' + i, { xp: G.XP.milestone }), { key: true, kind: 'm' + i });
      }
    });
  }

  /* Friends in this portion: how many of its pages each has read (or done), and who is in the book now. */
  function friendsIn(w) {
    const total = w.to - w.from + 1;
    const live = new Set(D.readingNow(st.bookId).map((x) => x.uid));
    const out = [];
    for (const uid of D.memberIds()) {
      if (uid === S.me) continue;
      const p = D.prog(st.bookId, uid);
      const done = !!(p && p.done && p.done[w.id]);
      const read = done ? total : U.rangesCountIn(p && p.seen, w.from, w.to);
      if (!read && !live.has(uid)) continue;
      out.push({ uid, read, f: read / total, done, live: live.has(uid) });
    }
    return out.sort((a, b) => a.f - b.f);
  }

  /* Progress through the portion you are on: a bar under the title with friends on it, a thin line along the
     top edge while the bars are hidden, and a few words at the start, half-way, the last pages and the end. */
  function wirdProgress(w, prog) {
    const bar = st.root.querySelector('#rd-wprog');
    const line = st.root.querySelector('#rd-wline');
    if (!w) {
      bar.hidden = line.hidden = true;
      return;
    }
    const total = w.to - w.from + 1;
    let read = 0;
    for (let p = w.from; p <= w.to; p++) if (st.pending.has(p) || (prog && U.rangesHas(prog.seen, p))) read++;
    const f = total ? read / total : 0;
    const pct = Math.round(f * 100) + '%';
    bar.hidden = line.hidden = false;
    bar.querySelector('i').style.width = line.querySelector('i').style.width = pct;
    bar.classList.toggle('done', read >= total);
    line.classList.toggle('done', read >= total);
    // friends along the bar (avatars) and the line (dots)
    const fr = friendsIn(w);
    const key = w.id + '|' + fr.map((x) => `${x.uid}:${x.read}:${x.live ? 1 : 0}`).join(',');
    if (bar.dataset.fr !== key) {
      bar.dataset.fr = key;
      let k = 0, lastF = -1;
      const spots = fr.slice(-6).map((x) => {
        k = x.f - lastF < 0.09 ? k + 1 : 0; // people at the same place fan out a little
        lastF = x.f;
        return { x, k };
      });
      bar.querySelector('.rd-wfr').innerHTML = spots
        .map(({ x, k: kk }) => `<span class="rd-fr${x.live ? ' live' : ''}${x.done ? ' done' : ''}" style="--x:${(x.f * 100).toFixed(1)}%;--k:${kk}" title="${U.esc(D.name(x.uid))}">${D.avatar(x.uid, 'xs')}</span>`)
        .join('');
      line.querySelector('.rd-wfr').innerHTML = fr.map((x) => `<u class="${x.live ? 'live' : ''}" style="--x:${(x.f * 100).toFixed(1)}%;--c:${U.esc(D.color(x.uid))}"></u>`).join('');
    }
    // cheers: once per portion and moment, only for pages counted in this session
    const base = st.base.wird;
    if (base[w.id] === undefined) base[w.id] = { read };
    const before = base[w.id].read;
    const c = (st.cheered[w.id] = st.cheered[w.id] || {});
    const left = total - read;
    const v = { n: w.n, pagesT: L.count(total, 'page'), leftT: L.count(left, 'page') };
    if (read >= total) {
      if (!c.done && before < total) {
        c.done = true;
        cheer(pick('done', v), { key: true, kind: 'done' });
      }
    } else if (left <= 3 && total >= 6 && !c.last && read > before) {
      c.last = true;
      cheer(pick('last', v), { kind: 'last' });
    } else if (f >= 0.5 && before < total / 2 && !c.half) {
      c.half = true;
      cheer(pick('half', v), { kind: 'half' });
    } else if (read > 0 && before === 0 && !c.start && read === 1 && total >= 4) {
      c.start = true;
      cheer(pick('start', v), { kind: 'start' });
    }
    // caught up with a friend who was ahead of where you started this portion today
    if (read > before)
      for (const x of fr) {
        if (!x.done && x.read >= 3 && x.read > before && read >= x.read && !c['p' + x.uid]) {
          c['p' + x.uid] = true;
          cheer(pick('passed', { name: D.name(x.uid) }), { kind: 'passed' });
          break;
        }
      }
  }
  /* Friends who open this book while you read: one hello each. */
  function liveHello() {
    for (const x of D.readingNow(st.bookId)) {
      if (st.liveSeen.has(x.uid)) continue;
      st.liveSeen.add(x.uid);
      cheer(pick('live', { name: D.name(x.uid) }), { kind: 'live' });
    }
  }

  /* ---------- focus session: a calm timer of reading minutes ---------- */
  function startFocus(mins) {
    st.focus = { mins, done: 0 };
    goalUi();
    U.toast(L(`بدأت جلسة تركيز ${L.count(mins, 'minute')} • مش هنقاطعك لحد ما تخلص`, `${mins}-minute focus session started • cheers stay quiet until it ends`, `بدأت جلسة تركيز لمدة ${L.count(mins, 'minute')} • سيصمت التشجيع حتى تنتهي`));
  }
  function stopFocus() {
    st.focus = null;
    goalUi();
  }
  function finishFocus() {
    const mins = st.focus.mins;
    st.focus = null;
    goalUi();
    burst(st.root.querySelector('#rd-goal'));
    U.chime('big');
    if (D.canWrite() && D.joined()) D.addFocus(mins).catch(() => {});
    cheer(pick('focus', { minsT: L.count(mins, 'minute'), xp: Math.min(60, mins) * G.XP.focus }), { key: true, kind: 'focus' });
  }
  /* Closing the book in the middle of a focus session asks first. */
  R.closeAsk = async () => {
    if (!st) return;
    if (st.focus && st.focus.mins * 60 - st.focus.done > 20) {
      const left = Math.ceil((st.focus.mins * 60 - st.focus.done) / 60);
      const ok = await A.V.confirm(L(`فاضل ${L.count(left, 'minute')} في جلسة التركيز. لو قفلت الكتاب دلوقتي الجلسة هتتلغي.`, `${left} min left in your focus session. Closing the book now cancels it.`, `بقي ${L.count(left, 'minute')} في جلسة التركيز. إذا أغلقت الكتاب الآن فستُلغى الجلسة.`), L('اقفل', 'Close', 'أغلق'), true);
      if (!ok || !st) return;
    }
    R.close();
  };

  /* Tapping the ring: today's numbers, the daily goal, and focus sessions. */
  function goalSheet() {
    const g = G.dailyGoal();
    const t = todayNow();
    const have = g.k === 'mins' ? t.mins : t.pages;
    const sessMin = Math.round(st.activeSecs / 60);
    const opts = g.k === 'mins' ? [10, 15, 20, 30, 45, 60] : [5, 10, 15, 20, 30, 50];
    if (!opts.includes(g.n)) opts.push(g.n), opts.sort((a, b) => a - b);
    const unit = (n) => (g.k === 'mins' ? L.count(n, 'minute') : L.count(n, 'page'));
    const fLeft = st.focus ? Math.ceil((st.focus.mins * 60 - st.focus.done) / 60) : 0;
    A.V.sheet({
      title: L('هدف النهارده', "Today's goal", 'هدف اليوم'),
      html: `<div class="goal-sheet">
        <div class="gs-top">${A.V.ring(have / g.n, `<b>${L.num(have)}</b><small>/ ${L.num(g.n)}</small>`, have >= g.n ? 'jade' : 'gold', 84)}
          <div><b>${have >= g.n ? L('هدف النهارده اتحقق 🎯', 'Goal reached today 🎯', 'تحقق هدف اليوم 🎯') : L(`فاضل ${unit(g.n - have)}`, `${unit(g.n - have)} to go`, `بقي ${unit(g.n - have)}`)}</b>
            <small>${L(`الجلسة دي: ${L.count(st.sessionPages, 'page')} • ${L.count(sessMin, 'minute')}`, `This session: ${L.count(st.sessionPages, 'page')} • ${L.count(sessMin, 'minute')}`, `هذه الجلسة: ${L.count(st.sessionPages, 'page')} • ${L.count(sessMin, 'minute')}`)}</small>
            <small>${L(`النهارده كله: ${L.count(t.pages, 'page')} • ${L.count(t.mins, 'minute')}`, `All of today: ${L.count(t.pages, 'page')} • ${L.count(t.mins, 'minute')}`, `اليوم كله: ${L.count(t.pages, 'page')} • ${L.count(t.mins, 'minute')}`)}</small></div></div>
        ${D.canWrite() && D.joined() ? `<span class="lbl">${L('هدفك كل يوم', 'Your daily goal', 'هدفك اليومي')}</span>
        <div class="seg sm gs-kind"><button class="${g.k === 'pages' ? 'on' : ''}" data-gk="pages">${L('صفحات', 'Pages', 'صفحات')}</button><button class="${g.k === 'mins' ? 'on' : ''}" data-gk="mins">${L('دقايق', 'Minutes', 'دقائق')}</button></div>
        <div class="chips gs-n">${opts.map((n) => `<button class="chip${n === g.n ? ' on' : ''}" data-gn="${n}">${L.num(n)}</button>`).join('')}</div>
        <span class="lbl">${U.icon('hourglass')}${L('جلسة تركيز', 'Focus session', 'جلسة تركيز')}</span>
        <p class="muted sm">${L('تايمر هادي بيعد دقايق القراية بس، والتشجيع بيسكت لحد ما يخلص. كمّلها من غير ما تقفل الكتاب وخد XP زيادة.', 'A calm timer that counts only reading minutes; cheers stay quiet until it ends. Finish without closing the book for bonus XP.', 'مؤقّت هادئ يحسب دقائق القراءة فقط، ويصمت التشجيع حتى ينتهي. أكملها دون أن تغلق الكتاب واحصل على XP إضافي.')}</p>
        ${st.focus
          ? `<div class="gs-focus"><b>${L(`فاضل ${L.count(fLeft, 'minute')}`, `${fLeft} min left`, `بقي ${L.count(fLeft, 'minute')}`)}</b><button class="btn ghost sm" data-fstop>${U.icon('close')}${L('وقّف الجلسة', 'Stop the session', 'أوقف الجلسة')}</button></div>`
          : `<div class="row-btns">${[10, 20, 30].map((m) => `<button class="btn ghost" data-focus="${m}">${L.count(m, 'minute')}</button>`).join('')}</div>`}` : ''}
      </div>`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          const k = e.target.closest('[data-gk]');
          const n = e.target.closest('[data-gn]');
          const f = e.target.closest('[data-focus]');
          if (k && k.dataset.gk !== g.k) {
            api.close();
            await D.setDailyGoal(k.dataset.gk, k.dataset.gk === 'mins' ? 15 : 10);
            if (st) {
              goalUi();
              goalSheet();
            }
          } else if (n) {
            api.close();
            await D.setDailyGoal(g.k, +n.dataset.gn);
            if (st) goalUi();
            U.toast(L(`هدفك بقى ${unit(+n.dataset.gn)} في اليوم`, `Your goal is now ${unit(+n.dataset.gn)} a day`, `أصبح هدفك ${unit(+n.dataset.gn)} يوميًا`));
          } else if (f) {
            api.close();
            if (st) startFocus(+f.dataset.focus);
          } else if (e.target.closest('[data-fstop]')) {
            api.close();
            if (st) stopFocus();
          }
        }),
    });
  }

  /* Tapping the portion bar: who is where in this portion. */
  function friendsSheet() {
    const w = G.wirds(st.book).find((x) => st.cur >= x.from && st.cur <= x.to);
    if (!w) return;
    const total = w.to - w.from + 1;
    const prog = D.prog(st.bookId);
    let mine = 0;
    for (let p = w.from; p <= w.to; p++) if (st.pending.has(p) || (prog && U.rangesHas(prog.seen, p))) mine++;
    const rows = [{ uid: S.me, read: mine, f: mine / total, done: !!(prog && prog.done && prog.done[w.id]), live: true }, ...friendsIn(w)].sort((a, b) => b.f - a.f);
    const quiet = D.memberIds().filter((u) => u !== S.me && !rows.some((r) => r.uid === u));
    A.V.sheet({
      title: L(`مين وصل فين في الورد ${L.num(w.n)}`, `Who is where in portion ${w.n}`, `تقدّم الجميع في الورد ${L.num(w.n)}`),
      html: `<ul class="fr-list">${rows
        .map((r) => `<li${r.uid === S.me ? ' class="me"' : ''}>${D.avatar(r.uid, 'sm')}<div><b>${U.esc(r.uid === S.me ? L('إنت', 'You', 'أنت') : D.name(r.uid))}${r.live && r.uid !== S.me ? ` <span class="live-t"><span class="pulse"></span>${L('في الكتاب دلوقتي', 'in the book now', 'في الكتاب الآن')}</span>` : ''}</b>${A.V.bar(r.f, r.done || r.f >= 1 ? 'jade' : 'gold')}<small>${r.done ? L('خلّص الورد ✓', 'Portion done ✓', 'الورد مكتمل ✓') : L(`${L.num(r.read)} من ${L.count(total, 'page')}`, `${r.read} of ${total} pages`, `${L.num(r.read)} من ${L.count(total, 'page')}`)}</small></div></li>`)
        .join('')}</ul>${quiet.length ? `<p class="muted sm">${L(`لسه ما بدأوش: ${quiet.map((u) => U.esc(D.name(u))).join('، ')}`, `Not started yet: ${quiet.map((u) => U.esc(D.name(u))).join(', ')}`, `لم يبدؤوا بعد: ${quiet.map((u) => U.esc(D.name(u))).join('، ')}`)}</p>` : ''}`,
    });
  }

  /* Paper colours: the free ones and the ones unlocked by levels and badges. */
  function setTheme(t) {
    st.theme = paperOf(t);
    st.root.firstElementChild.dataset.theme = st.theme;
    savePrefs();
    sysRefresh();
  }
  function paperSheet() {
    const s = G.of(S.me);
    A.V.sheet({
      title: L('لون الورق', 'Paper colour', 'لون الورق'),
      html: `<div class="papers">${G.PAPERS.map((p) => {
        const ok = G.unlocked(p.need, s);
        return `<button class="paper${st.theme === p.id ? ' on' : ''}${ok ? '' : ' locked'}" data-paper="${p.id}" aria-pressed="${st.theme === p.id}"><i class="pp" data-pp="${p.id}" aria-hidden="true">${ok ? '' : U.icon('lock')}</i><b>${L(p.t[0], p.t[1], p.t[2])}</b>${ok ? '' : `<small>${U.esc(G.needText(p.need))}</small>`}</button>`;
      }).join('')}</div><p class="muted sm">${L('ألوان جديدة بتتفتح مع المستويات والأوسمة.', 'More colours unlock with levels and badges.', 'تُفتح ألوان جديدة مع المستويات والأوسمة.')}</p>`,
      onMount: (body, api) =>
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-paper]');
          if (!b || !st) return;
          const p = G.PAPERS.find((x) => x.id === b.dataset.paper);
          if (!G.unlocked(p.need, G.of(S.me))) return U.toast(L(`اللون ده بيتفتح بـ${G.needText(p.need)}`, `Unlocks with ${G.needText(p.need)}`, `يُفتح هذا اللون مع ${G.needText(p.need)}`));
          setTheme(p.id);
          api.close();
        }),
    });
  }
  R._focusAt = (secs) => st && st.focus && (st.focus.done = secs); // for tests: jump a focus session forward
  R._cheerReset = () => st && ((st.cheerAt = 0), (st.scrollAt = 0), (st.cheerBusy = 0)); // for tests: as if minutes had passed
  R._cheerState = () => st && { cooling: Date.now() - st.cheerAt < 120000, text: st.root.querySelector('#rd-cheer').textContent, log: (st.cheerLog || []).slice(), queued: (st.cheerQ || []).length };
  R._wird = () => {
    const w = G.wirds(st.book).find((x) => st.cur >= x.from && st.cur <= x.to);
    const bar = st.root.querySelector('#rd-wprog i');
    return { w: w && w.id, width: bar && bar.style.width, cheer: st.root.querySelector('#rd-cheer').textContent };
  };

  /* ---------- «وقفت هنا», reading vs looking around ---------- */
  function savePlaceDoc(v) {
    if (!D.canWrite()) return Promise.resolve();
    const id = st.bookId;
    return D.privUpdate((cur) => {
      const place = Object.assign({}, cur.place);
      if (v) place[id] = v;
      else delete place[id];
      return Object.assign(cur, { place });
    }).catch(() => {});
  }
  /* On leaving (close, app to the background): remember the line you were reading — unless you were only
     looking around, or you put the line yourself on this page. */
  function savePlace() {
    if (!st || st.browsing || !D.canWrite()) return;
    const old = placeOf(st.bookId);
    let p = st.front, y = 0;
    if (!st.paged && Math.abs(st.cur - st.front) <= 1) {
      const a = anchorAt(st.sc.clientWidth / 2, st.sc.clientHeight * 0.3);
      p = a.p;
      y = U.clamp(r4(a.fy), 0, 0.98);
    }
    if (old && old.manual && old.p === p) return;
    if (old && old.p === p && Math.abs((old.y || 0) - y) < 0.01) return;
    savePlaceDoc({ p, y, at: U.nowIso(), manual: false });
  }
  function setPlace(p, y) {
    const old = placeOf(st.bookId);
    if (old && old.manual && old.p === p && Math.abs(old.y - y) < 0.03) return clearPlace();
    st.front = p;
    U.store.set('last:' + st.bookId, p);
    if (st.browsing) {
      st.browsing = false;
      browseUi();
    }
    savePlaceDoc({ p, y, at: U.nowIso(), manual: true }).then(() => st && redrawOverlays());
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) {}
    cheer(L(`علّمت مكانك: ص ${L.num(p)}`, `Marked where you are: p. ${p}`, `حدّدت مكانك: ص ${L.num(p)}`));
    chrome();
  }
  function clearPlace() {
    savePlaceDoc(null).then(() => st && redrawOverlays());
  }
  function backToPlace() {
    const pl = placeOf(st.bookId);
    const p = st.front;
    if (pl && pl.p === p && !st.paged && pl.y > 0.02) {
      st.sc.scrollTo({ top: Math.max(0, st.tops[p] + pl.y * st.hs[p] - st.sc.clientHeight * 0.3), behavior: reduced() ? 'auto' : 'smooth' });
    } else goTo(p, !st.paged);
  }
  function readFromHere() {
    st.front = st.cur;
    U.store.set('last:' + st.bookId, st.cur);
    st.browsing = false;
    st.dwellN = 0;
    browseUi();
    savePlaceDoc({ p: st.cur, y: 0, at: U.nowIso(), manual: false });
    chrome();
  }
  function browseUi() {
    const el = st && st.root.querySelector('#rd-browse');
    if (!el) return;
    el.hidden = !st.browsing;
    st.root.querySelector('.rd').classList.toggle('browsing', st.browsing);
    if (st.browsing)
      el.innerHTML = `<span class="rb-t">${U.icon('eye')}<span>${L('بتتصفّح — الصفحات هنا مش بتتحسب', "Looking around — these pages don't count", 'تتصفّح الآن — هذه الصفحات لا تُحتسب')}</span></span>
        <span class="rb-acts"><button class="btn sm ghost" data-act="browse-back">${U.icon('back', 'flip')}${L(`ارجع لمكانك (ص ${L.num(st.front)})`, `Back to p. ${st.front}`, `عد إلى مكانك (ص ${L.num(st.front)})`)}</button>
        <button class="btn sm gold" data-act="browse-here">${U.icon('play', 'flip-rtl')}${L('كمّل من هنا', 'Read from here', 'تابع من هنا')}</button></span>`;
  }
  R._state = () => st && { front: st.front, browsing: st.browsing, cur: st.cur, place: placeOf(st.bookId) };

  /* ---------- bookmarks ---------- */
  function toggleBookmark() {
    const marks = (S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {};
    const had = !!marks[st.cur];
    A.V.toggleMark(st.bookId, st.cur, true).then(() => {
      if (!st) return;
      chrome();
      redrawOverlays();
      renderPanel();
    });
    cheer(had ? L('شلت العلامة', 'Bookmark removed', 'أُزيلت العلامة') : L(`علّمت ص ${L.num(st.cur)} — تسمّيها من قايمة الملاحظات`, `Bookmarked p. ${st.cur} — name it from the notes list`, `وضعت علامة على ص ${L.num(st.cur)} — سمّها من قائمة الملاحظات`));
  }
  function nameBookmark(p) {
    const m = ((S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {})[p];
    A.V.editText({
      title: L(`اسم علامة ص ${L.num(p)}`, `Name for the bookmark on p. ${p}`, `اسم علامة ص ${L.num(p)}`),
      value: (m && m.t) || '',
      max: 80,
      rows: 2,
      onSave: (t) =>
        D.privUpdate((cur) => {
          const marks = Object.assign({}, cur.marks);
          const bm = Object.assign({}, marks[st.bookId]);
          bm[p] = { at: (bm[p] && bm[p].at) || (typeof bm[p] === 'string' ? bm[p] : U.nowIso()), t };
          marks[st.bookId] = bm;
          return Object.assign(cur, { marks });
        }).then(() => st && renderPanel()),
    });
  }

  /* ---------- reading sideways ---------- */
  function askLandscape() {
    if (!R.orientAsk() || isLand() || window.innerWidth >= window.innerHeight) return;
    if (!(A.Sys && A.Sys.canOrient()) && !(screen.orientation && screen.orientation.lock)) return;
    if (U.store.get('rdOrientAsked', '') === U.today()) return; // once a day at most
    st.orientT = setTimeout(() => {
      if (!st || isLand()) return;
      U.store.set('rdOrientAsked', U.today());
      const el = st.root.querySelector('#rd-orient');
      el.innerHTML = `<span class="ro-t">${U.icon('swap')}<span>${L('القراية بالعرض أريح للعين', 'Reading sideways is easier on the eyes', 'القراءة الأفقية أريح للعين')}</span></span>
        <button class="btn sm gold" data-act="orient" data-v="landscape">${L('اقلب بالعرض', 'Turn sideways', 'اعرض أفقيًا')}</button>
        <button class="ib sm" data-act="orient-x" aria-label="${L('مش دلوقتي', 'Not now', 'ليس الآن')}">${U.icon('close')}</button>
        <button class="lnk ro-never" data-act="orient-never">${L('ماتسألنيش تاني', "Don't ask again", 'لا تسألني مجددًا')}</button>`;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('in'));
      st.orientT = setTimeout(hideOrient, 9000);
    }, 1500);
  }
  function hideOrient() {
    const el = st && st.root.querySelector('#rd-orient');
    if (!el) return;
    el.classList.remove('in');
    setTimeout(() => st && (el.hidden = true), 250);
  }
  async function orientTo(mode) {
    hideOrient();
    if (A.Sys && A.Sys.orient(mode)) {
      st.oriented = mode !== 'auto';
      return;
    }
    try {
      if (mode === 'auto') return screen.orientation.unlock();
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      await screen.orientation.lock(mode);
      st.oriented = true;
    } catch (e) {
      U.toast(L('لف الموبايل بالعرض', 'Turn your phone sideways', 'أدِر هاتفك أفقيًا'));
    }
  }

  /* ---------- pages counted by mistake ---------- */
  function uncountSheet() {
    const counted = [...st.counted].sort((a, b) => a - b);
    const from = counted.length ? counted[0] : st.cur;
    const to = counted.length ? counted[counted.length - 1] : st.cur;
    A.V.sheet({
      title: L('شيل صفحات من المقروء', 'Un-count pages', 'أزل صفحات من المقروء'),
      html: `<form class="form" id="uc-form"><p class="muted">${L('اتحسبت صفحات وإنت بس بتتفرّج؟ شيلها من اللي قريته — مش هتضيع حاجة تانية.', "Pages counted while you were only looking? Take them off what you've read — nothing else changes.", 'احتُسبت صفحات وأنت تتصفح فقط؟ أزلها مما قرأته — لن يتغير شيء آخر.')}</p>
        <div class="grid2"><div><label for="uc-from">${L('من صفحة', 'From page', 'من صفحة')}</label><input id="uc-from" type="number" min="1" max="${st.N}" value="${from}"></div>
        <div><label for="uc-to">${L('لحد صفحة', 'To page', 'إلى صفحة')}</label><input id="uc-to" type="number" min="1" max="${st.N}" value="${to}"></div></div>
        <div class="row-btns end"><button class="btn gold">${U.icon('check')}${L('شيلها', 'Un-count', 'أزلها')}</button></div></form>`,
      onMount: (body, api) =>
        body.querySelector('#uc-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const a = U.clamp(+body.querySelector('#uc-from').value || 1, 1, st.N);
          const b = U.clamp(+body.querySelector('#uc-to').value || a, a, st.N);
          api.close();
          await flush();
          let today = 0;
          for (let p = a; p <= b; p++) {
            st.pending.delete(p);
            if (st.counted.delete(p)) today++;
          }
          const k = U.today();
          await D.saveProg(st.bookId, (c) => {
            const patch = { seen: U.rangesRemove(c.seen, a, b) };
            if (today && c.days && c.days[k]) patch.days = Object.assign({}, c.days, { [k]: Math.max(0, +c.days[k] - today) });
            return patch;
          });
          if (today) await D.addPagesToday(-today);
          st.sessionPages = Math.max(0, st.sessionPages - today);
          if (st.front > b || st.front < a) {
            /* the place still stands */
          } else st.front = Math.max(1, a - 1);
          U.toast(L(`اتشالت ص ${L.num(a)}–${L.num(b)} من المقروء`, `Pages ${a}–${b} are no longer counted`, `أُزيلت ص ${L.num(a)}–${L.num(b)} من المقروء`));
          chrome();
          scrub();
        }),
    });
  }

  /* The eye button: shows whether other people's marks are on the pages. */
  function marksUi() {
    const b = st && st.root.querySelector('#rd-eye');
    if (!b) return;
    const v = R.marksPref();
    b.classList.toggle('on', v !== 'all');
    b.setAttribute('aria-pressed', String(v !== 'all'));
    const t = v === 'all' ? L('اخفي إضافات الباقيين', "Hide others' marks", 'أخفِ إضافات الآخرين') : L('اظهر إضافات الكل', "Show everyone's marks", 'أظهر إضافات الجميع');
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
    const bm = st.root.querySelector('#rd-bm');
    if (bm) {
      const on = !!((S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {})[st.cur];
      bm.classList.toggle('on', on);
      bm.setAttribute('aria-pressed', String(on));
    }
    const b = st.book;
    const w = G.myCurrent(b);
    const wEl = st.root.querySelector('#rd-wird');
    const curW = G.wirds(b).find((x) => st.cur >= x.from && st.cur <= x.to);
    const prog = D.prog(st.bookId);
    if (wEl) {
      let left = 0;
      if (curW) for (let p = curW.from; p <= curW.to; p++) if (!st.pending.has(p) && !(prog && U.rangesHas(prog.seen, p))) left++;
      wEl.textContent = !curW
        ? L(`صفحة ${L.num(st.cur)} من ${L.num(st.N)}`, `Page ${st.cur} of ${st.N}`, `صفحة ${L.num(st.cur)} من ${L.num(st.N)}`)
        : left
          ? L(`الورد ${L.num(curW.n)} • فاضل ${L.count(left, 'page')}`, `Portion ${curW.n} • ${left} pages left`, `الورد ${L.num(curW.n)} • بقي ${L.count(left, 'page')}`)
          : L(`الورد ${L.num(curW.n)} • ص ${L.num(curW.from)}–${L.num(curW.to)} ✓`, `Portion ${curW.n} • p. ${curW.from}–${curW.to} ✓`, `الورد ${L.num(curW.n)} • ص ${L.num(curW.from)}–${L.num(curW.to)} ✓`);
    }
    wirdProgress(curW, prog);
    goalUi();
    liveHello();
    // finish prompt
    const pr = st.root.querySelector('#rd-prompt');
    let html = '';
    if (D.canWrite() && D.joined() && !st.browsing) {
      if (w && st.cur >= w.to && st.dismissed !== w.id) {
        html = `<span class="star8 sm gold"></span><span>${L(`وصلت لآخر الورد ${L.num(w.n)}!`, `You reached the end of portion ${w.n}!`, `وصلت إلى نهاية الورد ${L.num(w.n)}!`)}</span><button class="btn gold sm" data-act="wird-done" data-wid="${U.esc(w.id)}">${U.icon('check')}${L('خلّصته', 'Mark done', 'أنهيته')}</button><button class="ib sm" data-act="dismiss" aria-label="${L('إخفاء', 'Hide', 'إخفاء')}">${U.icon('close')}</button>`;
      } else if (!w && st.cur >= st.N && !(prog && prog.finished) && st.dismissed !== 'book') {
        html = `<span class="star8 sm gold"></span><span>${L('آخر صفحة! خلّصت الكتاب؟', 'Last page! Finished the book?', 'آخر صفحة! هل أنهيت الكتاب؟')}</span><button class="btn gold sm" data-act="book-done">${U.icon('trophy')}${L('خلّصت الكتاب', 'I finished it', 'أنهيت الكتاب')}</button><button class="ib sm" data-act="dismiss" data-what="book" aria-label="${L('إخفاء', 'Hide', 'إخفاء')}">${U.icon('close')}</button>`;
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
    const mk = (S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {};
    let ticks = '';
    for (const k of Object.keys(mk)) if (mk[k]) ticks += `<i class="bm-tick" style="${side}:${pos(+k)}%"></i>`;
    if (st.front !== st.cur) ticks += `<i class="front-tick" style="${side}:${pos(st.front)}%"></i>`;
    el.setAttribute('aria-valuenow', st.cur);
    el.innerHTML = `<div class="trk">${segs}${seenBar}${ticks}</div>${others}<span class="thumb" style="${side}:${pos(st.cur)}%"><b>${L.num(st.cur)}</b></span>`;
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
      ? L(`الجزء ص ${L.num(part.from)}–${L.num(part.to)} • ${L.num(Math.round(f * 100))}٪`, `Part p. ${part.from}–${part.to} • ${Math.round(f * 100)}%`, `الجزء ص ${L.num(part.from)}–${L.num(part.to)} • ${L.num(Math.round(f * 100))}٪`)
      : f
        ? L(`${L.num(Math.round(f * 100))}٪ — بعد كده هيفتح على طول من جهازك`, `${Math.round(f * 100)}% — next time it opens instantly from this device`, `${L.num(Math.round(f * 100))}٪ — في المرة القادمة سيُفتح فورًا من جهازك`)
        : '';
  }

  function showError(e) {
    if (!st) return;
    const el = st.root.querySelector('#rd-load');
    el.hidden = false;
    const status = e && e.status;
    const msg =
      e && e.code === 'noparts'
        ? L('الكتاب ده مالوش ملف مرفوع. افتح نسختك من جهازك.', 'This book has no uploaded file. Open your own copy.', 'لا يوجد ملف مرفوع لهذا الكتاب. افتح نسختك من جهازك.')
        : status === 403 || status === 404 || status === 401
          ? L('مش قادر أجيب ملف الكتاب. يمكن اتمسح من الحلقة — جرّب تاني أو افتح نسختك من جهازك.', "Couldn't fetch the book file. It may have been removed — try again or open your own copy.", 'تعذّر جلب ملف الكتاب. ربما حُذف من الحلقة — حاول مجددًا أو افتح نسختك من جهازك.')
          : L('حصلت مشكلة وإحنا بنفتح الكتاب. اتأكد من النت وجرّب تاني، أو افتح نسختك من جهازك.', 'Something went wrong opening the book. Check your connection and retry, or open your own copy.', 'حدثت مشكلة أثناء فتح الكتاب. تأكد من اتصالك بالإنترنت وحاول مجددًا، أو افتح نسختك من جهازك.');
    el.innerHTML = `<div class="rd-load-card err"><span class="star8 rubric"></span><b>${msg}</b>
      <div class="row-btns"><button class="btn" data-act="retry">${L('جرّب تاني', 'Try again', 'حاول مجددًا')}</button>
      <label class="btn ghost">${U.icon('upload')}${L('افتح نسخة من جهازي', 'Open my copy', 'افتح نسخة من جهازي')}<input type="file" id="rd-localfile" accept="application/pdf,.pdf" hidden></label>
      <button class="btn ghost" data-act="close">${L('رجوع', 'Back', 'رجوع')}</button></div>
      <small>${L('النسخة اللي هتفتحها لازم تكون نفس الكتاب بنفس عدد الصفحات عشان الملاحظات تيجي في مكانها.', 'Your copy must be the same edition (same page count) so notes land in the right place.', 'يجب أن تكون النسخة التي ستفتحها هي الكتاب نفسه بعدد الصفحات نفسه، لتظهر الملاحظات في أماكنها.')}</small></div>`;
  }

  async function useLocalFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const pdf = await R.openPdf(new Uint8Array(buf.slice(0)));
      const n = pdf.numPages;
      pdf.destroy().catch(() => {});
      if (n !== st.N) {
        U.toast(L(`الملف ده فيه ${L.count(n, 'page')} والكتاب في الحلقة ${L.count(st.N, 'page')}. اختار نفس النسخة.`, `That file has ${n} pages but the circle's book has ${st.N}. Pick the same edition.`, `يحتوي هذا الملف على ${L.count(n, 'page')}، وكتاب الحلقة على ${L.count(st.N, 'page')}. اختر النسخة نفسها.`), 'warn');
        return;
      }
      await U.cache.put('lb:' + st.bookId, buf);
      const id = st.bookId, p = st.cur;
      R.close(true);
      R.open(id, { page: p });
    } catch (e) {
      U.toast(L('الملف ده مش PDF سليم', "That file isn't a readable PDF", 'هذا الملف ليس PDF صالحًا'), 'warn');
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
          st.scrollAt = Date.now();
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
      if (nb && Date.now() - (st.movedAt || 0) < 600) return;
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
      if (act === 'close') R.closeAsk();
      else if (act === 'zin') setZoom(st.zoom * 1.2);
      else if (act === 'zout') setZoom(st.zoom / 1.2);
      else if (act === 'fit') setZoom(1);
      else if (act === 'theme') paperSheet();
      else if (act === 'goal') goalSheet();
      else if (act === 'friends') friendsSheet();
      else if (act === 'tool') setMode(t.dataset.tool);
      else if (act === 'mode-off') setMode(st.mode);
      else if (act === 'panel') togglePanel();
      else if (act === 'more') moreMenu();
      else if (act === 'marks') R.setMarks(R.marksPref() === 'all' ? 'mine' : 'all');
      else if (act === 'place') setPlace(+t.dataset.p, +t.dataset.y);
      else if (act === 'place-off') clearPlace();
      else if (act === 'browse-back') backToPlace();
      else if (act === 'browse-here') readFromHere();
      else if (act === 'bmark') toggleBookmark();
      else if (act === 'bm-name') nameBookmark(+t.dataset.p);
      else if (act === 'bm-del') A.V.toggleMark(st.bookId, +t.dataset.p).then(() => renderPanel());
      else if (act === 'orient') orientTo(t.dataset.v);
      else if (act === 'orient-x') hideOrient();
      else if (act === 'orient-never') {
        U.store.set('rdOrientAsk', false);
        hideOrient();
        U.toast(L('تمام، مش هنسأل تاني. تقدر ترجّعه من الإعدادات.', "OK, we won't ask again. You can turn it back on in Settings.", 'حسنًا، لن نسأل مجددًا. يمكنك إعادة تفعيله من الإعدادات.'));
      }
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
    bindMove();
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
      else R.closeAsk();
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
    const mk = (S.priv && S.priv.marks && S.priv.marks[st.bookId]) || {};
    const marks = Object.keys(mk).filter((k) => mk[k]).map(Number).sort((a, b2) => a - b2);
    const chip = (id, label) => `<button class="chip${f === id ? ' on' : ''}" data-act="pfilter" data-f="${id}">${label}</button>`;
    el.innerHTML = `<div class="rp-head"><b>${L('ملاحظات الكتاب', 'Notes in this book', 'ملاحظات الكتاب')}</b><button class="ib" data-act="panel" aria-label="${L('قفل', 'Close', 'إغلاق')}">${U.icon('close')}</button></div>
      <div class="chips">${w ? chip('wird', L(`الورد ${L.num(w.n)}`, `Portion ${w.n}`, `الورد ${L.num(w.n)}`)) : ''}${chip('all', L('الكل', 'All', 'الكل'))}${chip('mine', L('بتوعي', 'Mine', 'ملاحظاتي'))}${chip('q', L('أسئلة', 'Questions', 'أسئلة'))}</div>
      ${marks.length ? `<div class="rp-bms"><h4>${U.icon('bookmark')}${L('العلامات', 'Bookmarks', 'العلامات')}</h4>${marks
        .map((p) => `<div class="rp-bm"><button class="rp-bm-go" data-act="pgo" data-p="${p}"><b>${L('ص', 'p.', 'ص')} ${L.num(p)}</b>${mk[p] && mk[p].t ? `<span dir="auto">${U.esc(mk[p].t)}</span>` : `<small>${L('من غير اسم', 'no name', 'بلا اسم')}</small>`}</button>
          <button class="ib sm" data-act="bm-name" data-p="${p}" aria-label="${L('سمّيها', 'Name it', 'سمّها')}">${U.icon('edit')}</button><button class="ib sm" data-act="bm-del" data-p="${p}" aria-label="${L('شيلها', 'Remove', 'أزلها')}">${U.icon('trash')}</button></div>`)
        .join('')}</div>` : ''}
      <div class="rp-list">${list.length ? list.map(noteRow).join('') : `<div class="empty sm"><span class="star8 faint"></span><p>${L('لسه مفيش ملاحظات هنا. دوس «ظلّل» أو «ملاحظة» تحت وخليك أول واحد.', 'No notes here yet. Use Highlight or Note below to add the first one.', 'لا توجد ملاحظات هنا بعد. استخدم «ظلّل» أو «ملاحظة» في الأسفل وأضف أول ملاحظة.')}</p></div>`}</div>`;
  }
  function noteRow(n) {
    const likes = n.likes ? Object.values(n.likes).filter(Boolean).length : 0;
    const rc = n.replies ? Object.values(n.replies).filter(Boolean).length : 0;
    return `<button class="rp-item" data-act="pgo" data-p="${n.page}" data-nid="${U.esc(n.id)}">
      <span class="rp-meta">${D.avatar(n.by, 'xs')}<b>${U.esc(D.name(n.by))}</b><span class="kind k-${U.esc(n.kind)}">${A.V.kindLabel(n.kind)}</span>${n.priv ? `<span class="kind">${U.icon('lock')}</span>` : ''}<span class="pgn">${L('ص', 'p.', 'ص')} ${L.num(n.page)}</span></span>
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
      (b.toc && b.toc.length) || st.parts.length === 1 ? { ic: 'list', t: L('الفهرس', 'Contents', 'الفهرس'), fn: showToc } : null,
      D.canWrite() && D.joined() ? { ic: 'hourglass', t: st.focus ? L('جلسة التركيز', 'Focus session', 'جلسة التركيز') : L('ابدأ جلسة تركيز', 'Start a focus session', 'ابدأ جلسة تركيز'), fn: goalSheet } : null,
      { ic: 'bookmark', t: marked ? L('شيل العلامة من الصفحة دي', 'Remove bookmark here', 'أزل العلامة من هذه الصفحة') : L('علّم الصفحة دي', 'Bookmark this page', 'ضع علامة على هذه الصفحة'), fn: () => A.V.toggleMark(st.bookId, st.cur) },
      st.pagedPref
        ? { ic: 'scroll', t: L('تمرير متواصل', 'Continuous scrolling', 'تمرير متواصل'), fn: () => setPaged(false) }
        : { ic: 'book', t: L('صفحة صفحة (زي الكتاب)', 'Page by page (like a book)', 'صفحة بصفحة (كالكتاب)'), fn: () => setPaged(true) },
      S.sample ? { ic: 'claude', t: L('اسأل Claude عن الصفحة دي', 'Ask Claude about this page', 'اسأل Claude عن هذه الصفحة'), fn: () => A.V.askPage(st.bookId, st.cur) } : null,
      { ic: 'chat', t: L('نقاش الكتاب', 'Book discussion', 'نقاش الكتاب'), fn: () => { R.close(); A.V.go('book-' + b.id, { tab: 'talk' }); } },
      (b.parts || []).length ? { ic: 'download', t: L('حمّل الكتاب على جهازك', 'Download the book', 'نزّل الكتاب على جهازك'), fn: () => A.V.download(b.id) } : null,
      ...(() => {
        const v = R.marksPref();
        const o = {
          all: { ic: 'eye', t: L('اظهر إضافات الكل', "Show everyone's highlights and notes", 'أظهر إضافات الجميع'), fn: () => R.setMarks('all') },
          mine: { ic: v === 'all' ? 'eyeoff' : 'eye', t: v === 'all' ? L('اخفي إضافات الباقيين', "Hide others' highlights and notes", 'أخفِ إضافات الآخرين') : L('اظهر إضافاتي بس', 'Show only mine', 'أظهر إضافاتي فقط'), fn: () => R.setMarks('mine') },
          none: { ic: 'eyeoff', t: L('صفحة نضيفة (اخفي كل الإضافات)', 'Clean page (hide all highlights and notes)', 'صفحة نظيفة (أخفِ كل الإضافات)'), fn: () => R.setMarks('none') },
        };
        return MARKS.filter((k) => k !== v).map((k) => o[k]);
      })(),
      st.paged ? { ic: 'book', t: R.bookPref() ? L('شكل عادي للصفحة', 'Plain page', 'شكل عادي للصفحة') : L('شكل الكتاب', 'Book look', 'شكل الكتاب'), fn: () => R.setBookLook(!R.bookPref()) } : null,
      A.Sys && A.Sys.canOrient() ? (isLand() ? { ic: 'swap', t: L('اقلب بالطول', 'Turn upright', 'اعرض عموديًا'), fn: () => orientTo('portrait') } : { ic: 'swap', t: L('اقلب بالعرض', 'Turn sideways', 'اعرض أفقيًا'), fn: () => orientTo('landscape') }) : null,
      st.oriented ? { ic: 'swap', t: L('لف مع الموبايل', 'Follow the phone', 'اتبع اتجاه الهاتف'), fn: () => orientTo('auto') } : null,
      st.counted.size || (D.prog(st.bookId) || {}).seen ? { ic: 'scroll', t: L('شيل صفحات من المقروء', 'Un-count pages', 'أزل صفحات من المقروء'), fn: uncountSheet } : null,
      R.hiddenHere().length ? { ic: 'eye', t: L(`رجّع الملاحظات اللي خبّيتها (${L.num(R.hiddenHere().length)})`, `Show the notes you hid (${R.hiddenHere().length})`, `أعد الملاحظات التي أخفيتها (${L.num(R.hiddenHere().length)})`), fn: () => { const ids = R.hiddenHere(); D.privUpdate((cur) => { const h = Object.assign({}, cur.hidden); for (const id of ids) delete h[id]; return Object.assign(cur, { hidden: h }); }); } } : null,
      st.land ? { ic: 'swap', t: R.toolsSide() === 'left' ? L('انقل الأدوات لليمين', 'Move the tools to the right', 'انقل الأدوات إلى اليمين') : L('انقل الأدوات للشمال', 'Move the tools to the left', 'انقل الأدوات إلى اليسار'), fn: () => R.setToolsSide(R.toolsSide() === 'left' ? 'right' : 'left') } : null,
      { ic: 'palette', t: L('لون الورق', 'Paper colour', 'لون الورق'), fn: paperSheet, cls: 'show-sm' },
      { ic: 'zin', t: L('تكبير', 'Zoom in', 'تكبير'), fn: () => setZoom(st.zoom * 1.25), cls: 'show-sm' },
      { ic: 'zout', t: L('تصغير', 'Zoom out', 'تصغير'), fn: () => setZoom(st.zoom / 1.25), cls: 'show-sm' },
      { ic: 'fit', t: L('ملء العرض', 'Fit width', 'ملء العرض'), fn: () => setZoom(1), cls: 'show-sm' },
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
    if (!list.length) return U.toast(L('الملف ده مالوش فهرس جواه. علّم الأماكن المهمة بـ«علّم الصفحة دي» من نفس القائمة.', 'This PDF has no table of contents. Bookmark important pages from this menu instead.', 'لا يحتوي هذا الملف على فهرس. حدّد الأماكن المهمة بـ«ضع علامة على هذه الصفحة» من القائمة نفسها.'));
    let on = -1;
    list.forEach((x, i) => x.p <= st.cur && (on = i));
    A.V.sheet({
      title: L('الفهرس', 'Contents', 'الفهرس'),
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
  R._markSeen = (p) => st && markSeen(p); // for tests: count a page as read now
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
