/* Share cards: pictures of a quote, a reading session, a finished book, a badge, a level or a month of
   reading, to post on WhatsApp or Instagram. Drawn on a canvas in the app's colours and shared through the
   phone's share sheet (Capacitor Share), the browser's Web Share, or downloaded. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Sh = (A.Share = {});
  const W = 1080, H = 1350;
  const C = { bg1: '#101a45', bg2: '#22409a', gold: '#d9a22b', gold2: '#f3c75c', cream: '#fbf3df', ink: '#eef1fb', mute: '#aeb8de', jade: '#3fcf98' };
  const UI = '"Readex Pro", system-ui, sans-serif';
  const BOOK = 'Amiri, "Noto Naskh Arabic", serif';

  async function fonts() {
    if (!document.fonts || !document.fonts.load) return;
    const want = ['700 60px "Readex Pro"', '500 60px "Readex Pro"', '400 60px "Readex Pro"', '700 60px Amiri', '400 60px Amiri'];
    try {
      await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, 'نقرأ سوا Read'))), new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) {}
  }
  const rtlOf = (t) => U.isArabic(t) || (!/[A-Za-z]/.test(String(t || '')) && L.isAr());

  /* ---------- drawing helpers ---------- */
  function star(ctx, cx, cy, r, inner = 0.76) {
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI / 8) * k - Math.PI / 2;
      const rr = k % 2 ? r * inner : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function background(ctx, w, h, tone = 'night') {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    if (tone === 'gold') {
      g.addColorStop(0, '#3a2706');
      g.addColorStop(1, '#8a5a0c');
    } else if (tone === 'jade') {
      g.addColorStop(0, '#08372a');
      g.addColorStop(1, '#13775a');
    } else {
      g.addColorStop(0, C.bg1);
      g.addColorStop(1, C.bg2);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // a faint pattern of eight-pointed stars
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    for (let y = 60; y < h + 80; y += 150)
      for (let x = (y / 150) % 2 ? 0 : 75; x < w + 80; x += 150) {
        star(ctx, x, y, 34);
        ctx.stroke();
      }
    ctx.restore();
    const v = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.2, w / 2, h * 0.5, h * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
  function text(ctx, t, x, y, { size = 40, weight = 400, font = UI, color = C.ink, align = 'center', alpha = 1 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.direction = rtlOf(t) ? 'rtl' : 'ltr';
    ctx.fillText(String(t), x, y);
    ctx.restore();
  }
  /* Words into lines that fit maxW; the font size shrinks until the lines fit maxLines. */
  function fit(ctx, t, { maxW, maxLines, maxSize, minSize, font = UI, weight = 400 }) {
    const words = String(t || '').replace(/\s+/g, ' ').trim().split(' ');
    for (let size = maxSize; size >= minSize; size -= 2) {
      ctx.font = `${weight} ${size}px ${font}`;
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const next = cur ? cur + ' ' + wd : wd;
        if (ctx.measureText(next).width <= maxW || !cur) cur = next;
        else {
          lines.push(cur);
          cur = wd;
        }
      }
      if (cur) lines.push(cur);
      if (lines.length <= maxLines) return { size, lines };
      if (size - 2 < minSize) {
        const cut = lines.slice(0, maxLines);
        cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, '') + ' …';
        return { size, lines: cut };
      }
    }
    return { size: minSize, lines: [String(t)] };
  }
  function block(ctx, t, cx, top, opts) {
    const f = fit(ctx, t, opts);
    const lh = Math.round(f.size * (opts.lh || 1.55));
    f.lines.forEach((ln, i) => text(ctx, ln, cx, top + f.size + i * lh, { size: f.size, weight: opts.weight || 400, font: opts.font || UI, color: opts.color || C.ink }));
    return top + f.size + (f.lines.length - 1) * lh + Math.round(f.size * 0.5);
  }
  function brand(ctx, w, h) {
    const y = h - 74;
    ctx.save();
    ctx.fillStyle = C.gold;
    star(ctx, w / 2 + (L.isAr() ? 112 : -112), y - 14, 20);
    ctx.fill();
    ctx.restore();
    text(ctx, 'نقرأ سوا', w / 2 + (L.isAr() ? -6 : 6), y, { size: 42, weight: 700, color: C.cream });
    text(ctx, L('اقرأوا سوا — كل يوم ورد', 'Read together — a portion a day'), w / 2, y + 44, { size: 24, color: C.mute });
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const loadImg = (src, cors = true) =>
    new Promise((res) => {
      if (!src) return res(null);
      const img = new Image();
      if (cors && !/^data:/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
      setTimeout(() => res(null), 6000);
    });
  /* An app icon as an image (for drawing on the canvas). */
  const iconImg = (name, color, size = 96) =>
    loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon(name).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `).replace(/currentColor/g, color)), false);
  async function cover(ctx, book, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    const img = book && book.cover ? await loadImg(book.cover) : null;
    rrect(ctx, x, y, w, h, 14);
    ctx.fillStyle = (U.spineOf(book && book.title)[0]) || '#6b3a22';
    ctx.fill();
    ctx.restore();
    if (img) {
      ctx.save();
      rrect(ctx, x, y, w, h, 14);
      ctx.clip();
      // cover-fit
      const k = Math.max(w / img.width, h / img.height);
      const iw = img.width * k, ih = img.height * k;
      try {
        ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      } catch (e) {}
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(x + w * 0.08, y, 6, h);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 20, y + 20, w - 40, h - 40);
      ctx.clip();
      block(ctx, (book && book.title) || '', x + w / 2, y + h * 0.28, { maxW: w - 70, maxLines: 4, maxSize: Math.round(w / 7), minSize: 20, font: BOOK, weight: 700, color: '#fff' });
      ctx.restore();
    }
  }
  function medal(ctx, cx, cy, r, tier) {
    const cols = [null, ['#c98a4b', '#8a5428'], ['#e3e7ef', '#9aa3b5'], ['#f3c75c', '#b9851c'], ['#9fe8ff', '#4aa8d8'], ['#d6b4ff', '#7d55c7']][tier || 1] || ['#f3c75c', '#b9851c'];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 30;
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
    ctx.fillStyle = g;
    star(ctx, cx, cy, r, 0.8);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    star(ctx, cx, cy, r * 0.78, 0.8);
    ctx.fill();
    ctx.restore();
  }
  function stat(ctx, x, y, big, small, color = C.gold2) {
    text(ctx, big, x, y, { size: 92, weight: 700, color });
    text(ctx, small, x, y + 50, { size: 30, color: C.mute });
  }

  /* ---------- the cards ---------- */
  const CARDS = {
    async quote(ctx, d) {
      background(ctx, W, H);
      const img = d.img ? await loadImg(d.img, false) : null;
      // measure first, so the whole quote sits in the middle of the card
      let iw = 0, ih = 0;
      if (img) {
        const k = Math.min((W - 200) / img.width, (d.text ? 430 : 620) / img.height, 3);
        iw = Math.round(img.width * k);
        ih = Math.round(img.height * k);
      }
      const tOpts = { maxW: W - 200, maxLines: img ? 4 : 9, maxSize: img ? 44 : 66, minSize: 30, font: BOOK, weight: 700, color: C.cream, lh: 1.6 };
      const tf = d.text ? fit(ctx, d.text, tOpts) : null;
      const tH = tf ? tf.size + (tf.lines.length - 1) * Math.round(tf.size * 1.6) + Math.round(tf.size * 0.5) : 0;
      const total = 150 + (img ? ih + 56 + 40 : 0) + tH + 150;
      let y = Math.max(120, Math.round((H - 230 - total) / 2) + 40);
      text(ctx, '”', W / 2, y + 150, { size: 240, weight: 700, font: BOOK, color: C.gold, alpha: 0.9 });
      y += 170;
      if (img) {
        const x = Math.round((W - iw) / 2);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.4)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 16;
        rrect(ctx, x - 28, y, iw + 56, ih + 56, 18);
        ctx.fillStyle = '#fffaf0';
        ctx.fill();
        ctx.restore();
        ctx.drawImage(img, x, y + 28, iw, ih);
        y += ih + 56 + 40;
      }
      if (d.text) y = block(ctx, d.text, W / 2, y, tOpts);
      ctx.fillStyle = C.gold;
      ctx.fillRect(W / 2 - 60, y + 30, 120, 4);
      y += 110;
      if (d.book) y = block(ctx, d.book, W / 2, y - 40, { maxW: W - 220, maxLines: 2, maxSize: 40, minSize: 28, weight: 700, color: C.ink }) + 20;
      if (d.author) text(ctx, d.author, W / 2, y + 20, { size: 30, color: C.mute });
      if (d.by) text(ctx, L(`اختيار ${d.by}`, `Chosen by ${d.by}`), W / 2, H - 190, { size: 28, color: C.mute });
      brand(ctx, W, H);
    },
    async session(ctx, d) {
      background(ctx, W, H);
      text(ctx, L('جلسة قراية ✓', 'Reading session ✓'), W / 2, 200, { size: 54, weight: 700, color: C.cream });
      if (d.book) block(ctx, d.book, W / 2, 240, { maxW: W - 220, maxLines: 2, maxSize: 40, minSize: 28, font: BOOK, weight: 700, color: C.mute });
      // the goal ring
      const cx = W / 2, cy = 640, r = 190;
      ctx.save();
      ctx.lineWidth = 34;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const f = U.clamp(d.goalF || 0, 0, 1);
      if (f > 0) {
        ctx.strokeStyle = f >= 1 ? C.jade : C.gold2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, L.num(d.pages), cx, cy + 40, { size: 150, weight: 700, color: C.cream });
      text(ctx, L('صفحة', 'pages'), cx, cy + 100, { size: 34, color: C.mute });
      stat(ctx, W * 0.27, 1000, L.num(d.mins), L('دقيقة', 'minutes'));
      stat(ctx, W * 0.73, 1000, L.num(d.streak || 0), L('يوم ورا بعض 🔥', 'day streak 🔥'));
      if (f >= 1) text(ctx, L('هدف النهارده اتحقق 🎯', "Today's goal reached 🎯"), W / 2, 1150, { size: 34, weight: 700, color: C.jade });
      brand(ctx, W, H);
    },
    async book(ctx, d) {
      background(ctx, W, H, 'gold');
      text(ctx, L('خلّصت كتاب! 🎉', 'Finished a book! 🎉'), W / 2, 170, { size: 60, weight: 700, color: C.cream });
      await cover(ctx, d.book, W / 2 - 190, 230, 380, 540);
      let y = block(ctx, d.book.title, W / 2, 800, { maxW: W - 200, maxLines: 2, maxSize: 54, minSize: 32, font: BOOK, weight: 700, color: C.cream });
      if (d.book.author) text(ctx, d.book.author, W / 2, y + 30, { size: 32, color: '#f1d9a4' });
      stat(ctx, W * 0.2, 1055, L.num(d.book.pages || 0), L('صفحة', 'pages'), C.cream);
      stat(ctx, W * 0.5, 1055, L.num(d.days || 0), L('يوم', 'days'), C.cream);
      stat(ctx, W * 0.8, 1055, L.num(d.notes || 0), L('ملاحظة', 'notes'), C.cream);
      if (d.circle) text(ctx, L(`مع حلقة «${d.circle}»`, `with the “${d.circle}” circle`), W / 2, H - 175, { size: 28, color: '#f1d9a4' });
      brand(ctx, W, H);
    },
    async badge(ctx, d) {
      const b = d.badge;
      background(ctx, W, H, b.tier === 5 ? 'night' : 'jade');
      text(ctx, b.secret ? L('وسام سري اتكشف! 🗝️', 'A secret badge revealed! 🗝️') : L('وسام جديد!', 'New badge!'), W / 2, 210, { size: 56, weight: 700, color: C.cream });
      medal(ctx, W / 2, 560, 230, b.tier);
      const img = await iconImg(b.ic, '#2a1d00', 200);
      if (img) ctx.drawImage(img, W / 2 - 100, 460, 200, 200);
      block(ctx, L(b.t[0], b.t[1]), W / 2, 830, { maxW: W - 200, maxLines: 2, maxSize: 70, minSize: 40, weight: 700, color: C.cream });
      block(ctx, L(b.d[0], b.d[1]), W / 2, 960, { maxW: W - 240, maxLines: 3, maxSize: 38, minSize: 28, color: C.mute });
      if (d.tier) text(ctx, d.tier, W / 2, 1130, { size: 32, weight: 700, color: C.gold2 });
      brand(ctx, W, H);
    },
    async level(ctx, d) {
      background(ctx, W, H);
      text(ctx, L('مستوى جديد!', 'Level up!'), W / 2, 220, { size: 60, weight: 700, color: C.cream });
      ctx.save();
      ctx.shadowColor = 'rgba(243,199,92,.55)';
      ctx.shadowBlur = 80;
      ctx.fillStyle = C.gold;
      star(ctx, W / 2, 600, 260);
      ctx.fill();
      ctx.restore();
      text(ctx, L.num(d.lv), W / 2, 660, { size: 190, weight: 700, color: '#2a1d00' });
      block(ctx, d.title, W / 2, 900, { maxW: W - 200, maxLines: 2, maxSize: 72, minSize: 40, weight: 700, color: C.cream });
      text(ctx, L(`${L.num(d.xp)} XP • ${L.count(d.pages, 'page')}`, `${d.xp} XP • ${d.pages} pages`), W / 2, 1080, { size: 34, color: C.mute });
      brand(ctx, W, H);
    },
    async month(ctx, d) {
      background(ctx, W, H);
      text(ctx, d.title, W / 2, 190, { size: 56, weight: 700, color: C.cream });
      text(ctx, d.who, W / 2, 250, { size: 32, color: C.mute });
      stat(ctx, W * 0.3, 450, L.num(d.pages), L('صفحة', 'pages'));
      stat(ctx, W * 0.7, 450, L.num(d.days), L('يوم قراية', 'reading days'));
      stat(ctx, W * 0.3, 680, d.time, L('مع الكتب', 'with books'));
      stat(ctx, W * 0.7, 680, L.num(d.best || 0), L('أطول سلسلة', 'longest streak'));
      if (d.top) {
        await cover(ctx, d.top, W / 2 - 95, 790, 190, 260);
        text(ctx, L('أكتر كتاب', 'Top book'), W / 2, 1094, { size: 26, color: C.mute });
      }
      if (d.type) text(ctx, d.type, W / 2, d.top ? 1158 : 900, { size: 36, weight: 700, color: C.gold2 });
      brand(ctx, W, H);
    },
  };

  Sh.render = async (kind, data) => {
    await fonts();
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    await CARDS[kind](ctx, data || {});
    return c;
  };

  const toBlob = (c) => new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
  const b64Of = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  /* Phone share sheet (Android app), Web Share with the file (phone browsers), else a download. */
  Sh.send = async (canvas, name, caption = '') => {
    const blob = await toBlob(canvas);
    const P = A.P;
    if (P && P.native) {
      const FS = P.plugin('Filesystem');
      const Share = P.plugin('Share');
      if (FS && Share) {
        const w = await FS.writeFile({ path: name, data: await b64Of(blob), directory: 'CACHE' });
        await Share.share({ files: [w.uri], text: caption || undefined, dialogTitle: L('شارك', 'Share') }).catch((e) => {
          if (!/cancel/i.test(String(e && e.message))) throw e;
        });
        return 'shared';
      }
    }
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption || undefined });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    Sh.download(blob, name);
    return 'saved';
  };
  Sh.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /* The preview sheet: the picture, then share (and save, in a browser). */
  Sh.open = async (kind, data, caption = '') => {
    let canvas;
    try {
      canvas = await Sh.render(kind, data);
    } catch (e) {
      console.warn(e);
      return U.toast(L('معرفناش نعمل الصورة', "Couldn't make the picture"));
    }
    const url = canvas.toDataURL('image/png');
    const name = `naqra-sawa-${kind}-${U.today()}.png`;
    const native = !!(A.P && A.P.native);
    V.sheet({
      title: L('شارك الصورة', 'Share the picture'),
      cls: 'share-sheet',
      html: `<img class="sh-img" src="${url}" alt="${esc(L('صورة للمشاركة', 'Picture to share'))}">
        <div class="row-btns center"><button class="btn gold big" data-sh="share">${icon('share')}${L('شارك', 'Share')}</button>${native ? '' : `<button class="btn ghost big" data-sh="save">${icon('download')}${L('احفظ الصورة', 'Save picture')}</button>`}</div>`,
      onMount: (body) =>
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-sh]');
          if (!b) return;
          b.disabled = true;
          try {
            if (b.dataset.sh === 'save') Sh.download(await toBlob(canvas), name);
            else await Sh.send(canvas, name, caption);
          } catch (er) {
            console.warn(er);
            U.toast(L('المشاركة ما نفعتش — جرّب «احفظ الصورة»', "Sharing didn't work — try saving the picture"));
          }
          b.disabled = false;
        }),
    });
  };

  /* Ready-made cards from app data. */
  Sh.quote = (n) => {
    const b = S.books.get(n.b);
    Sh.open('quote', { text: n.text || '', img: n.crop || '', book: b && b.title, author: b && b.author, by: D.name(n.by) });
  };
  Sh.session = ({ bookId, pages, secs }) => {
    const b = S.books.get(bookId);
    const s = G.of(S.me);
    const g = G.dailyGoal();
    const m = S.members.get(S.me) || {};
    const k = U.today();
    const have = g.k === 'mins' ? Math.floor(((m.secs && m.secs[k]) || 0) / 60) : (m.days && m.days[k]) || 0;
    Sh.open('session', { book: b && b.title, pages, mins: Math.max(1, Math.round(secs / 60)), streak: s.streak, goalF: have / g.n });
  };
  Sh.book = (bookId) => {
    const b = S.books.get(bookId);
    if (!b) return;
    const p = D.prog(bookId) || {};
    const days = Object.keys(p.days || {}).filter((d) => p.days[d] > 0).length || (p.joined && p.finished ? Math.max(1, U.diffDays(U.isoKey(p.joined), U.isoKey(p.finished)) + 1) : 0);
    const notes = [...S.notes.values()].filter((n) => n.b === bookId && n.by === S.me).length;
    Sh.open('book', { book: b, days, notes, circle: S.circle && S.circle.name });
  };
  Sh.badge = (id) => {
    const b = G.BADGES.find((x) => x.id === id);
    if (b) Sh.open('badge', { badge: b, tier: b.tier === 5 ? L('سري', 'Secret') : V.tierName(b.tier) });
  };
  Sh.level = () => {
    const s = G.of(S.me);
    Sh.open('level', { lv: s.lv, title: G.title(s.lv), xp: s.xp, pages: s.pages });
  };
})();
