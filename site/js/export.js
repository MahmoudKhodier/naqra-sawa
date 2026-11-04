/* Export and import of notes: from the notebook's ⋯, its book view and a book's ⋯.
   Export — who (me / the whole circle / some people), which kinds, with replies or not, only ⭐ or all — as:
     ١ «PDF مرتّب»: pages drawn on a canvas (so Arabic is shaped right) put in a PDF with pdf-lib;
     ٢ «نسخة احتياطية»: a JSON file that «استورد» brings back with nothing lost;
     ٣ «نص»: a text file, or copied for WhatsApp / Notion;
     ٤ «الكتاب بملاحظاته»: the book's own PDF with the highlights and notes in their places (PDF annotations).
   Import — a backup file, or Kindle's «My Clippings.txt». My notes that were the circle's go back to the circle;
   everything else (private ones, friends' notes from a backup, Kindle) goes to my own notes
   (data/users/<me>/my/notes, S.myNotes), never to the circle. Nothing already there comes in twice. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const D = A.D;
  const G = A.G;
  const V = A.V;
  const esc = U.esc;
  const icon = U.icon;

  const KINDS = ['quote', 'hl', 'note', 'q', 'take'];
  const KIND_COL = { quote: '#d2691e', hl: '#c9900f', note: '#2f6fd6', q: '#8a4fd0', take: '#1f9a68' }; // the app's --k-* (light)
  const keyOf = (n) => (n.b ? n.b : 'x:' + n.xb);
  const bookOf = (id) => (id && (D.book(id) || (S.gone && S.gone.get(id)))) || null;
  const safeName = (t) => String(t || 'notes').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'notes';
  const norm = (t) => A.Imp.key(String(t || ''), '').replace(/\|$/, '');
  const r2 = (x) => Math.round((+x || 0) * 100) / 100;
  /* The same note twice: same book, page, kind, words and place (to two decimals). */
  const sig = (key, n) => [key, n.page || 0, n.kind || 'note', norm(n.text), n.rect ? [r2(n.rect.x), r2(n.rect.y), r2(n.rect.w), r2(n.rect.h)].join(',') : '', n.loc || ''].join('|');
  const infoOf = (key, n) => {
    if (key.startsWith('x:')) return { key, title: (n && n.xt) || '', author: (n && n.xa) || '', ext: true };
    const b = bookOf(key);
    return b ? { key, id: key, title: b.title || '', author: b.author || '', pages: b.pages || 0, fp: b.fp || '', cover: b.cover || '', book: b, priv: D.isPrivate(key) } : { key, id: key, title: L('كتاب اتشال', 'Removed book', 'كتاب محذوف'), author: '' };
  };
  const portions = (b) => (b && b.wirds && b.wirds.length ? G.wirds(b) : []);
  const portionOf = (ws, n) => (n.wid && ws.find((x) => x.id === n.wid)) || (n.page ? ws.find((x) => n.page >= x.from && n.page <= x.to) : null) || null;
  const pos = (n) => (n.page || 0) * 10 + (n.rect ? n.rect.y || 0 : n.kind === 'take' ? 9.9 : 0) + (n.loc ? (parseInt(String(n.loc), 10) || 0) / 1e6 : 0);
  const pdfDate = (iso) => {
    const d = new Date(iso || Date.now());
    const p = (x) => String(x).padStart(2, '0');
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };

  /* ================= what goes out ================= */
  /* o = {b: book key or '' (every book), who: 'me' | 'all' | 'some', people: Set, kinds: Set, replies, stars} */
  function gather(o) {
    const out = [];
    let hidden = 0;
    const inScope = (n) => (!o.b || keyOf(n) === o.b) && o.kinds.has(n.kind || 'note') && (!o.stars || V.isStar(n.id));
    const whoOk = (uid) => o.who === 'all' || (o.who === 'me' ? uid === S.me : o.people.has(uid));
    for (const n of S.notes.values()) {
      if (!n || !n.b || !whoOk(n.by) || !inScope(n)) continue;
      if (V.isSpoiler(n)) {
        hidden++;
        continue;
      }
      out.push(Object.assign({}, n, { src: 'c' }));
    }
    if (whoOk(S.me)) {
      const pn = (S.priv && S.priv.notes) || {};
      for (const [id, n] of Object.entries(pn)) if (n && n.b && inScope(Object.assign({ id }, n))) out.push(Object.assign({ id, by: S.me }, n, { src: 'p' }));
      for (const n of S.myNotes.values()) if (n && n.kind !== 'arch' && (n.b || n.xb) && inScope(n)) out.push(Object.assign({ by: S.me }, n, { src: 'm' }));
    }
    return { notes: out, hidden };
  }
  const archOf = (n) => {
    if (n.arch && n.arch.length) return n.arch;
    for (const x of S.myNotes.values()) if (x.kind === 'arch' && x.of === n.id) return x.arch || [];
    return [];
  };
  /* A note as it goes into a file. */
  function record(n, o) {
    const reps = [];
    if (o.replies) {
      for (const r of V.noteReplies(n)) reps.push({ by: r.by, name: D.name(r.by), text: r.text, at: r.at });
      for (const r of archOf(n)) reps.push({ by: '', name: r.n || '', text: r.t || '', at: r.at || '' });
    }
    const x = {
      id: n.id, key: keyOf(n), b: n.b || '', page: n.page || 0, rect: n.rect || null, kind: n.kind || 'note', color: n.color || '', text: n.text || '', at: n.at || '', edited: n.edited || '',
      by: n.from ? '' : n.by, name: D.authorName(n), mine: !n.from && n.by === S.me, priv: n.src !== 'c', wid: n.wid || '', crop: n.crop || '', replies: reps,
    };
    for (const k of ['loc', 'kpage', 'via', 'xt', 'xa']) if (n[k]) x[k] = n[k];
    // who: their colour and character (a friend's from another circle: a letter)
    const m = !n.from && S.members.get(n.by);
    x.col = n.from ? '#8a806c' : D.color(n.by);
    if (m && m.emoji) x.emo = m.emoji;
    // reactions: emoji → how many (a like without an emoji is 👍), the author's own left out
    const rx = {};
    if (n.src === 'c') {
      const r = n.rx || {}, likes = n.likes || {};
      for (const u of new Set([...Object.keys(r), ...Object.keys(likes)])) {
        if (!likes[u] || u === n.by) continue;
        const e = r[u] || '👍';
        rx[e] = (rx[e] || 0) + 1;
      }
    }
    const rl = Object.entries(rx).sort((a, b) => b[1] - a[1]);
    if (rl.length) x.rx = rl;
    return x;
  }
  /* Books (newest note first), each with its notes in reading order, cut into its portions. */
  function groups(list, o) {
    const by = new Map();
    for (const n of list) {
      const k = keyOf(n);
      if (!by.has(k)) by.set(k, { info: infoOf(k, n), notes: [], at: '' });
      const g = by.get(k);
      g.notes.push(record(n, o));
      if (String(n.at || '') > g.at) g.at = String(n.at || '');
    }
    const gs = [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
    for (const g of gs) {
      g.notes.sort((a, b) => pos(a) - pos(b) || String(a.at).localeCompare(String(b.at)));
      // «الفهرس»: the heading each note is under (its deepest one)
      if (A.Hd && g.info.book)
        for (const n of g.notes) {
          const path = n.page ? A.Hd.pathAt(g.info.key, n.page, n.rect ? n.rect.y || 0 : 1) : [];
          if (path.length) n.hd = path.map((h) => ({ id: h.id, l: h.l, t: A.Hd.title(h) }));
        }
      const ws = portions(g.info.book);
      g.ws = ws;
      const parts = new Map();
      for (const n of g.notes) {
        const w = ws.length ? portionOf(ws, n) : null;
        const k = w ? w.id : '';
        if (!parts.has(k)) parts.set(k, { w, notes: [] });
        parts.get(k).notes.push(n);
      }
      g.parts = [...parts.values()].sort((a, b) => (a.w ? a.w.n : 1e9) - (b.w ? b.w.n : 1e9));
    }
    return gs;
  }
  const rxLine = (rx) => rx.map(([e, c]) => `${e} ${L.num(c)}`).join('   ');
  const whoLine = (o) =>
    o.who === 'me'
      ? L('ملاحظاتي', 'My notes', 'ملاحظاتي')
      : o.who === 'all'
        ? L('ملاحظات الحلقة كلها', 'The whole circle’s notes', 'ملاحظات الحلقة كلها')
        : [...o.people].map((u) => D.name(u)).join('، ');
  const whereOf = (n) => (n.page && n.kind !== 'take' ? `${L('ص', 'p.')} ${L.num(n.page)}` : n.kpage ? `${L('ص', 'p.')} ${L.num(n.kpage)} (Kindle)` : n.loc ? `${L('مكان', 'Loc.', 'موضع')} ${L.num(String(n.loc))}` : '');
  const portionTitle = (w) => (w ? `${L('الورد', 'Portion', 'الورد')} ${L.num(w.n)} • ${L('ص', 'p.')} ${L.num(w.from)}–${L.num(w.to)}` : L('برّه الأوراد', 'Outside the portions', 'خارج الأوراد'));

  /* ================= ٣ plain text ================= */
  function asText(gs, o) {
    const out = [];
    for (const g of gs) {
      out.push(`📖 ${g.info.title}${g.info.author ? ' — ' + g.info.author : ''}`);
      out.push(`${whoLine(o)} • ${L.count(g.notes.length, 'note')} • ${L.day(U.today())}`);
      out.push('');
      const printed = new Set();
      for (const part of g.parts) {
        if (g.ws.length) out.push(`━━ ${portionTitle(part.w)} ━━`, '');
        for (const n of part.notes) {
          for (const h of n.hd || []) {
            if (printed.has(h.id)) continue;
            printed.add(h.id);
            out.push(`${'  '.repeat(h.l - 1)}${['', '◆', '●', '○', '•'][h.l] || '•'} ${h.t}`, '');
          }
          out.push(`• ${[whereOf(n), V.kindLabel(n.kind), n.name].filter(Boolean).join(' — ')}`);
          if (n.text) out.push(n.kind === 'quote' || n.kind === 'hl' ? `«${n.text}»` : n.text);
          else out.push(L('(تظليل من غير كلام)', '(a highlight without words)', '(تظليل دون نص)'));
          if (n.rx) out.push(`    ${rxLine(n.rx)}`);
          for (const r of n.replies) out.push(`    ↩ ${r.name}: ${r.text}`);
          out.push('');
        }
      }
      out.push('');
    }
    out.push(L('— من «نقرأ سوا»', '— from Read Together', '— من «نقرأ سوا»'));
    return out.join('\n');
  }

  /* ================= ٢ backup ================= */
  function asBackup(gs, o) {
    const c = (A.P.circle && A.P.circle()) || {};
    return {
      app: 'naqra-sawa',
      type: 'notes',
      v: 1,
      at: U.nowIso(),
      circle: { id: c.id || '', name: (S.circle && S.circle.name) || c.name || '' },
      me: S.me,
      who: o.who,
      books: gs.map((g) => {
        const i = g.info;
        return i.ext
          ? { key: i.key, title: i.title, author: i.author, ext: true }
          : { key: i.key, id: i.id, title: i.title, author: i.author, pages: i.pages || 0, fp: i.fp || '', priv: !!i.priv, wirds: g.ws.map((w) => ({ id: w.id, n: w.n, from: w.from, to: w.to })) };
      }),
      notes: gs.flatMap((g) => g.notes.map((n) => {
        const x = Object.assign({}, n);
        for (const k of ['hd', 'col', 'emo', 'rx']) delete x[k];
        return x;
      })),
      stars: gs.flatMap((g) => g.notes.filter((n) => V.isStar(n.id)).map((n) => n.id)),
      // «الفهرس»: the headings in these books (everyone's; mine come back on restore)
      heads: A.Hd ? gs.filter((g) => g.info.book).flatMap((g) => A.Hd.hand(g.info.key).map((h) => ({ key: g.info.key, page: h.page, y: h.y, l: h.l, t: h.t || '', by: h.by, name: D.name(h.by), at: h.at || '', mine: h.by === S.me }))) : [],
    };
  }

  /* ================= ١ the PDF report ================= */
  const PW = 1240, PH = 1754, M = 100, FOOT = 70; // A4 at 150 dpi
  const UI = '"Readex Pro", system-ui, sans-serif';
  const BOOK = '"Amiri", "Noto Naskh Arabic", serif';
  const firstStrong = (t) => {
    const m = String(t || '').match(/[A-Za-zÀ-ɏ֐-ࣿיִ-ﻼ]/);
    return m ? (/[֐-ࣿיִ-ﻼ]/.test(m[0]) ? 'rtl' : 'ltr') : L.isAr() ? 'rtl' : 'ltr';
  };
  const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  /* A member's mark on a canvas: a disc in their colour with their character (or the first letter). */
  function drawAv(ctx, cx, cy, r, n) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = n.col || '#8a806c';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    if (n.emo) {
      ctx.font = `${Math.round(r * 1.25)}px ${EMOJI}`;
      ctx.fillText(n.emo, cx, cy + r * 0.08);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r * 1.05)}px ${UI}`;
      ctx.fillText(Array.from(String(n.name || '؟').trim())[0] || '؟', cx, cy + r * 0.05);
    }
    ctx.restore();
  }
  /* A member's colour, darker, for their name on paper. */
  const darker = (hex) => {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return '#3a3428';
    const v = parseInt(m[1], 16);
    const f = (c) => Math.round(c * 0.72).toString(16).padStart(2, '0');
    return '#' + f((v >> 16) & 255) + f((v >> 8) & 255) + f(v & 255);
  };
  async function loadFonts() {
    if (!document.fonts) return;
    await Promise.all(['400 30px "Readex Pro"', '600 30px "Readex Pro"', '700 30px "Readex Pro"', '400 30px "Amiri"', '700 30px "Amiri"'].map((f) => document.fonts.load(f, 'ابت abc').catch(() => {})));
  }
  /* A picture that can be drawn on a canvas that is read back (null if it can't). */
  async function safeImg(src) {
    const im = await V.cardKit.loadImg(src);
    if (!im) return null;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0, 2, 2);
      x.getImageData(0, 0, 1, 1);
      return im;
    } catch (e) {
      return null;
    }
  }
  /* Lines of at most w pixels in the current font (long words broken), paragraphs kept. */
  function lines(ctx, text, w) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = '';
      for (let wd of words) {
        while (ctx.measureText(wd).width > w) {
          let i = wd.length - 1;
          while (i > 1 && ctx.measureText(wd.slice(0, i)).width > w) i--;
          if (cur) out.push(cur), (cur = '');
          out.push(wd.slice(0, i));
          wd = wd.slice(i);
        }
        const t = cur ? cur + ' ' + wd : wd;
        if (!cur || ctx.measureText(t).width <= w) cur = t;
        else {
          out.push(cur);
          cur = wd;
        }
      }
      out.push(cur);
    }
    while (out.length > 1 && !out[out.length - 1]) out.pop();
    return out;
  }
  async function asReport(gs, o, onProg) {
    await U.loadScript(U.CDN.pdflib);
    await loadFonts();
    const { PDFDocument } = window.PDFLib;
    const pdf = await PDFDocument.create();
    const title = gs.length === 1 ? gs[0].info.title : L('ملاحظاتي', 'My notes', 'ملاحظاتي');
    pdf.setTitle(`${title} — ${L('ملاحظات', 'Notes', 'ملاحظات')}`);
    pdf.setCreator('نقرأ سوا');
    pdf.setProducer('naqra-sawa');
    pdf.setCreationDate(new Date());
    const rtl = L.isAr();
    const S0 = rtl ? PW - M : M; // where a line starts
    const dir = rtl ? -1 : 1;
    const BOTTOM = PH - M - FOOT;
    const total = gs.reduce((s, g) => s + g.notes.length, 0) || 1;
    let done = 0, cv = null, ctx = null, y = 0, pageNo = 0, curTitle = '';
    const covers = new Map();
    const flush = async () => {
      if (!cv) return;
      // footer: the page number and the book
      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9a917e';
      ctx.font = `400 20px ${UI}`;
      ctx.fillText(`${L('نقرأ سوا', 'Read Together')} • ${curTitle} • ${L.num(pageNo)}`, PW / 2, PH - M + 20);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.86));
      const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pg = pdf.addPage([595.28, 841.89]);
      pg.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
      cv.width = cv.height = 0;
      cv = null;
    };
    const newPage = async () => {
      await flush();
      cv = document.createElement('canvas');
      cv.width = PW;
      cv.height = PH;
      ctx = cv.getContext('2d');
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, PW, PH);
      y = M;
      pageNo++;
    };
    const ensure = async (h) => {
      if (!cv || (y + h > BOTTOM && y > M + 4)) await newPage();
    };
    const text = (t, x, yy, font, color, d) => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.direction = d || firstStrong(t);
      ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
      ctx.fillText(t, x, yy);
    };
    // a paragraph, line by line, going on to the next page when needed; x0..x1 is its box
    const para = async (t, font, size, lh, color, x0, x1, bar) => {
      ctx.font = font;
      const d = firstStrong(t);
      const ls = lines(ctx, t, x1 - x0);
      for (const ln of ls) {
        await ensure(lh);
        if (bar) {
          ctx.fillStyle = bar;
          ctx.fillRect(rtl ? x1 + 18 : x0 - 24, y - 4, 6, lh);
        }
        text(ln, d === 'rtl' ? x1 : x0, y + size, font, color, d);
        y += lh;
      }
    };
    for (const g of gs) {
      await newPage();
      curTitle = g.info.title;
      // the book: cover, title, author, what this is
      let cover = null;
      if (g.info.cover) {
        if (!covers.has(g.info.cover)) covers.set(g.info.cover, await safeImg(g.info.cover));
        cover = covers.get(g.info.cover);
      }
      const cw = 190, ch = 285;
      const tx0 = cover ? (rtl ? M : M + cw + 40) : M, tx1 = cover ? (rtl ? PW - M - cw - 40 : PW - M) : PW - M;
      if (cover) {
        const cx = rtl ? PW - M - cw : M;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.18)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(cover, cx, y, cw, ch);
        ctx.restore();
      }
      const y0 = y;
      const printed = new Set();
      ctx.font = `700 52px ${BOOK}`;
      for (const ln of lines(ctx, g.info.title, tx1 - tx0).slice(0, 3)) {
        text(ln, firstStrong(ln) === 'rtl' ? tx1 : tx0, y + 56, `700 52px ${BOOK}`, '#1d1a14');
        y += 72;
      }
      if (g.info.author) {
        text(g.info.author, firstStrong(g.info.author) === 'rtl' ? tx1 : tx0, y + 34, `400 32px ${BOOK}`, '#6b6352');
        y += 52;
      }
      y += 12;
      const sub = `${whoLine(o)} • ${L.count(g.notes.length, 'note')}`;
      text(sub, rtl ? tx1 : tx0, y + 26, `600 26px ${UI}`, '#2440a0', rtl ? 'rtl' : 'ltr');
      y += 42;
      text(`${L('اتصدّرت من «نقرأ سوا»', 'Exported from Read Together', 'صُدّرت من «نقرأ سوا»')} • ${L.day(U.today())}`, rtl ? tx1 : tx0, y + 22, `400 22px ${UI}`, '#9a917e', rtl ? 'rtl' : 'ltr');
      y += 36;
      y = Math.max(y, cover ? y0 + ch : y) + 36;
      ctx.fillStyle = '#d9a22b';
      ctx.fillRect(M, y, PW - 2 * M, 3);
      y += 40;
      for (const part of g.parts) {
        if (g.ws.length) {
          await ensure(150);
          ctx.fillStyle = 'rgba(217,162,43,.14)';
          V.cardKit.roundRect(ctx, M, y, PW - 2 * M, 62, 14);
          ctx.fill();
          text(portionTitle(part.w), S0 + dir * 24, y + 42, `700 28px ${UI}`, '#8a5d07', rtl ? 'rtl' : 'ltr');
          text(L.count(part.notes.length, 'note'), PW - S0 - dir * 24, y + 41, `500 22px ${UI}`, '#9a7a3a', rtl ? 'ltr' : 'rtl');
          y += 92;
        }
        for (const n of part.notes) {
          for (const hd of n.hd || []) {
            // the headings the next notes are under, where each starts: its mark and name
            if (printed.has(hd.id)) continue;
            printed.add(hd.id);
            const hs = [0, 30, 27, 25, 24][hd.l] || 24;
            await ensure(hs * 2.4 + 60);
            const ind = (hd.l - 1) * 26;
            const hc = ['', '#9a4a1c', '#2440a0', '#2440a0', '#8a806c'][hd.l];
            const mx = rtl ? S0 - 8 - ind : S0 + 8 + ind, my = y + hs * 0.75;
            ctx.save();
            ctx.translate(mx, my);
            if (hd.l === 1) ctx.rotate(Math.PI / 4);
            ctx.fillStyle = hc;
            ctx.strokeStyle = hc;
            ctx.lineWidth = 4;
            if (hd.l === 1) ctx.fillRect(-8, -8, 16, 16);
            else {
              ctx.beginPath();
              ctx.arc(0, 0, hd.l === 4 ? 5 : 9, 0, Math.PI * 2);
              if (hd.l === 3) ctx.stroke();
              else ctx.fill();
            }
            ctx.restore();
            ctx.font = `700 ${hs}px ${UI}`;
            const tl = lines(ctx, hd.t, PW - 2 * M - 60 - ind)[0] || '';
            text(tl, rtl ? S0 - 34 - ind : S0 + 34 + ind, y + hs, `700 ${hs}px ${UI}`, hd.l === 1 ? '#7a3a16' : '#2b2a33', rtl ? 'rtl' : 'ltr');
            y += hs * 1.7 + 10;
          }
          const col = KIND_COL[n.kind] || '#5a6b8c';
          const isBook = n.kind === 'quote' || n.kind === 'hl' || n.kind === 'take';
          const size = isBook ? 32 : 27;
          const lh = Math.round(size * (isBook ? 1.75 : 1.6));
          await ensure(60 + lh * 2);
          // the line on top: kind, where, who, when
          ctx.font = `600 22px ${UI}`;
          const kl = V.kindLabel(n.kind);
          const kw = ctx.measureText(kl).width + 30;
          ctx.fillStyle = col + '22';
          V.cardKit.roundRect(ctx, rtl ? S0 - kw : S0, y, kw, 38, 19);
          ctx.fill();
          text(kl, rtl ? S0 - 15 : S0 + 15, y + 27, `600 22px ${UI}`, col, rtl ? 'rtl' : 'ltr');
          // who: their mark in their colour and their name, then where and when
          let mx = rtl ? S0 - kw - 16 : S0 + kw + 16;
          if (n.name) {
            drawAv(ctx, rtl ? mx - 17 : mx + 17, y + 19, 17, n);
            mx += rtl ? -42 : 42;
            ctx.font = `700 22px ${UI}`;
            const nw = ctx.measureText(n.name).width;
            text(n.name, mx, y + 27, `700 22px ${UI}`, darker(n.col), rtl ? 'rtl' : 'ltr');
            mx += rtl ? -(nw + 12) : nw + 12;
          }
          const meta = [whereOf(n), L.dayShort(String(n.at || '').slice(0, 10))].filter(Boolean).join(' • ');
          text((n.name ? '• ' : '') + meta, mx, y + 27, `400 22px ${UI}`, '#8b8372', rtl ? 'rtl' : 'ltr');
          y += 58;
          if (n.crop) {
            const im = await safeImg(n.crop);
            if (im) {
              const k = Math.min(1, 760 / im.width, 420 / im.height) * 1.0;
              const w = Math.round(im.width * k), h = Math.round(im.height * k);
              await ensure(h + 20);
              const x = rtl ? S0 - w : S0;
              ctx.fillStyle = U.col(n.color, '#f2c94c');
              ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
              ctx.drawImage(im, x, y, w, h);
              y += h + 22;
            }
          }
          if (n.text) await para(n.text, `${isBook ? 400 : 400} ${size}px ${isBook ? BOOK : UI}`, size, lh, '#1d1a14', M + 30, PW - M - 30, col);
          else if (!n.crop) await para(L('تظليل من غير كلام', 'A highlight without words', 'تظليل دون نص'), `400 24px ${UI}`, 24, 38, '#9a917e', M + 30, PW - M - 30);
          if (n.rx) {
            await ensure(40);
            text(rxLine(n.rx), rtl ? S0 - 30 : S0 + 30, y + 30, `500 24px ${UI}, ${EMOJI}`, '#6b6352', rtl ? 'rtl' : 'ltr');
            y += 42;
          }
          for (const r of n.replies) {
            y += 6;
            await para(`↩ ${r.name}: ${r.text}`, `400 23px ${UI}`, 23, 36, '#5f584a', rtl ? M + 30 : M + 80, rtl ? PW - M - 80 : PW - M - 30);
          }
          y += 22;
          if (y < BOTTOM - 10) {
            ctx.fillStyle = '#ece4d2';
            ctx.fillRect(M + 120, y, PW - 2 * M - 240, 2);
          }
          y += 30;
          done++;
          if (onProg) onProg((done / total) * 0.95);
        }
      }
    }
    await flush();
    const bytes = await pdf.save();
    if (onProg) onProg(1);
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /* ================= ٤ the book with its notes ================= */
  const hexRgb = (h) => {
    const m = String(h || '').match(/^#?([0-9a-f]{6})$/i);
    const v = m ? parseInt(m[1], 16) : 0xf2c94c;
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  };
  /* The book's PDF bytes, one per part: from the server, this phone's own copy, or a file picked now. */
  async function bookFiles(b, onProg) {
    const parts = b.parts || [];
    if (parts.length) {
      const out = [];
      for (let i = 0; i < parts.length; i++) out.push({ from: parts[i].from || 1, to: parts[i].to || b.pages, buf: await A.R.partBytes(parts[i], (f) => onProg && onProg(((i + f) / parts.length) * 0.5)) });
      return out;
    }
    const local = await U.cache.get('lb:' + b.id);
    if (local) return [{ from: 1, to: b.pages, buf: local }];
    const f = await pickFile('application/pdf,.pdf');
    if (!f) return null;
    return [{ from: 1, to: b.pages, buf: await f.arrayBuffer() }];
  }
  /* A note's place on its page, in the page's own coordinates (its crop box, turned like the reader shows it). */
  function boxOf(page, r) {
    const cb = page.getCropBox ? page.getCropBox() : page.getMediaBox();
    const rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
    const { x: X0, y: Y0, width: W, height: H } = cb;
    const map = (u, v) =>
      rot === 90 ? [X0 + v * W, Y0 + u * H] : rot === 180 ? [X0 + W - u * W, Y0 + v * H] : rot === 270 ? [X0 + W - v * W, Y0 + H - u * H] : [X0 + u * W, Y0 + H - v * H];
    const pts = [map(r.x, r.y), map(r.x + r.w, r.y), map(r.x, r.y + r.h), map(r.x + r.w, r.y + r.h)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
  /* A note's colour in the book: its person's, its kind's, or the one it was marked with. */
  const colOf = (n, by) => (by === 'person' ? n.col || '#8a806c' : by === 'kind' ? KIND_COL[n.kind] || KIND_COL.hl : U.col(n.color, '#f2c94c'));
  function annotate(doc, page, n, col) {
    const { PDFHexString, PDFString } = window.PDFLib;
    const ctx = doc.context;
    const [cr, cg, cb] = hexRgb(col || U.col(n.color, '#f2c94c'));
    const body = [n.text || '', n.rx ? rxLine(n.rx) : '', ...n.replies.map((r) => `↩ ${r.name}: ${r.text}`)].filter(Boolean).join('\n\n') || V.kindLabel(n.kind);
    const common = { Type: 'Annot', F: 4, C: [cr, cg, cb], T: PDFHexString.fromText(n.name || ''), Contents: PDFHexString.fromText(`${V.kindLabel(n.kind)} — ${body}`), M: PDFString.of(pdfDate(n.edited || n.at)), NM: PDFString.of('naqra-' + n.id), P: page.ref };
    const r = n.rect;
    let dict;
    if (r && r.w > 0.012) {
      const b = boxOf(page, r);
      const ap = ctx.register(
        ctx.stream(`/GS0 gs ${cr.toFixed(3)} ${cg.toFixed(3)} ${cb.toFixed(3)} rg ${b.x1.toFixed(2)} ${b.y1.toFixed(2)} ${(b.x2 - b.x1).toFixed(2)} ${(b.y2 - b.y1).toFixed(2)} re f`, {
          Type: 'XObject', Subtype: 'Form', BBox: [b.x1, b.y1, b.x2, b.y2], Resources: { ExtGState: { GS0: { Type: 'ExtGState', CA: 0.4, ca: 0.4, BM: 'Multiply' } } },
        }),
      );
      dict = Object.assign(common, { Subtype: 'Highlight', Rect: [b.x1, b.y1, b.x2, b.y2], QuadPoints: [b.x1, b.y2, b.x2, b.y2, b.x1, b.y1, b.x2, b.y1], CA: 0.4, AP: { N: ap } });
    } else {
      // a note pinned on the page (or a takeaway: at the top corner of its page)
      const at = r ? boxOf(page, { x: r.x, y: r.y, w: 0, h: 0 }) : boxOf(page, { x: 0.92, y: 0.05, w: 0, h: 0 });
      const s = 22, x = at.x1 - s / 2, y = at.y1 - s / 2;
      const ap = ctx.register(
        ctx.stream(`${cr.toFixed(3)} ${cg.toFixed(3)} ${cb.toFixed(3)} rg 0.2 0.18 0.14 RG 1.2 w 1 5 20 16 re B 1 1 1 rg 5 15 m 17 15 l 5 11 m 15 11 l S 1 1 1 RG 1.6 w 5 15 m 17 15 l 5 11 m 15 11 l S 0.2 0.18 0.14 rg 5 5 m 5 1 l 10 5 l f`, {
          Type: 'XObject', Subtype: 'Form', BBox: [0, 0, s, s], Matrix: [1, 0, 0, 1, x, y],
        }),
      );
      dict = Object.assign(common, { Subtype: 'Text', Name: 'Comment', Open: false, Rect: [x, y, x + s, y + s], AP: { N: ap } });
    }
    page.node.addAnnot(ctx.register(ctx.obj(dict)));
  }
  const canvasBytes = async (c, type = 'image/jpeg', q = 0.88) => new Uint8Array(await (await new Promise((r) => c.toBlob(r, type, q))).arrayBuffer());
  /* A note's number on the page: a small disc in its colour (cached per number and colour). */
  async function badgeImg(doc, cache, num, col) {
    const k = num + '|' + col;
    if (cache.has(k)) return cache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.beginPath();
    x.arc(32, 32, 28, 0, Math.PI * 2);
    x.fillStyle = col;
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#ffffff';
    x.stroke();
    x.fillStyle = '#ffffff';
    x.font = `700 ${num > 9 ? 28 : 34}px ${UI}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.direction = 'ltr';
    x.fillText(L.num(num), 32, 35);
    const img = await doc.embedPng(await canvasBytes(c, 'image/png'));
    cache.set(k, img);
    return img;
  }
  /* Where a note's number goes: by its highlight's start, by its pin, or (a takeaway) the page's top corner. */
  function badgeAt(page, n, rtl) {
    const r = n.rect;
    if (r && r.w > 0.012) {
      const b = boxOf(page, r);
      return rtl ? { x: b.x2 + 7, y: b.y2 } : { x: b.x1 - 7, y: b.y2 };
    }
    const b = r ? boxOf(page, { x: r.x, y: r.y, w: 0, h: 0 }) : boxOf(page, { x: rtl ? 0.92 : 0.08, y: 0.05, w: 0, h: 0 });
    return { x: b.x1 + (rtl ? -14 : 14), y: b.y1 + 14 };
  }
  /* The words of a page's notes, numbered, as a picture for the strip added below the page (any PDF app shows
     it, and it prints). The page's own words stay as they are. */
  async function footerCanvas(list, widthPt, maxPt, rtl, by) {
    const W = 1100, k = W / widthPt, pad = 34;
    const mc = document.createElement('canvas').getContext('2d');
    const x0 = pad, x1 = W - pad;
    const rows = [];
    let h = pad * 0.7;
    const cap = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
    let shown = 0;
    for (const it of list) {
      const n = it.n;
      const block = [];
      block.push({ kind: 'head', n, num: it.num, h: 40 });
      mc.font = `400 25px ${n.kind === 'quote' || n.kind === 'hl' ? BOOK : UI}`;
      const words = n.text ? (n.kind === 'quote' || n.kind === 'hl' ? `«${cap(n.text, 420)}»` : cap(n.text, 420)) : L('(تظليل من غير كلام)', '(a highlight without words)', '(تظليل دون نص)');
      for (const ln of lines(mc, words, x1 - x0 - 46).slice(0, 5)) block.push({ kind: 'text', t: ln, book: n.kind === 'quote' || n.kind === 'hl', h: 36 });
      mc.font = `400 22px ${UI}`;
      for (const r of n.replies.slice(0, 2)) for (const ln of lines(mc, `↩ ${r.name}: ${cap(r.text, 160)}`, x1 - x0 - 80).slice(0, 2)) block.push({ kind: 'rep', t: ln, h: 32 });
      if (n.replies.length > 2) block.push({ kind: 'rep', t: L(`و${L.num(n.replies.length - 2)} ردود كمان`, `and ${n.replies.length - 2} more replies`, `و${L.num(n.replies.length - 2)} ردود أخرى`), h: 32 });
      const bh = block.reduce((t, b) => t + b.h, 0) + 14;
      if (shown && (h + bh) / k > maxPt) break;
      rows.push(...block, { kind: 'gap', h: 14 });
      h += bh;
      shown++;
    }
    const more = list.length - shown;
    if (more) rows.push({ kind: 'more', t: L(`و${L.count(more, 'note')} كمان — في ملاحظات الصفحة`, `and ${more} more — in the page’s notes`, `و${L.count(more, 'note')} أخرى — في ملاحظات الصفحة`), h: 34 });
    h += more ? 34 : 0;
    h += pad * 0.5;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Math.ceil(h);
    const x = c.getContext('2d');
    x.fillStyle = '#fffdf8';
    x.fillRect(0, 0, W, c.height);
    x.fillStyle = '#d9a22b';
    x.fillRect(pad, 6, W - 2 * pad, 3);
    let y = pad * 0.7;
    const S0 = rtl ? x1 : x0, dir = rtl ? -1 : 1;
    const put = (t, xx, yy, font, color) => {
      x.font = font;
      x.fillStyle = color;
      x.direction = firstStrong(t);
      x.textAlign = x.direction === 'rtl' ? 'right' : 'left';
      x.fillText(t, xx, yy);
    };
    for (const r of rows) {
      if (r.kind === 'head') {
        const n = r.n;
        const col = colOf(n, by);
        // the number in the note's colour, the person's mark and name, the kind, the reactions
        x.beginPath();
        x.arc(S0 + dir * 16, y + 18, 16, 0, Math.PI * 2);
        x.fillStyle = col;
        x.fill();
        x.save();
        x.fillStyle = '#fff';
        x.font = `700 19px ${UI}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.direction = 'ltr';
        x.fillText(L.num(r.num), S0 + dir * 16, y + 19);
        x.restore();
        let mx = S0 + dir * 44;
        if (n.name) {
          drawAv(x, mx + dir * 14, y + 18, 14, n);
          mx += dir * 36;
          x.font = `700 22px ${UI}`;
          put(n.name, mx, y + 26, `700 22px ${UI}`, darker(n.col));
          mx += dir * (x.measureText(n.name).width + 12);
        }
        const tail = [V.kindLabel(n.kind), n.rx ? rxLine(n.rx) : ''].filter(Boolean).join('  •  ');
        put(tail, mx, y + 26, `500 21px ${UI}, ${EMOJI}`, KIND_COL[n.kind] || '#6b6352');
      } else if (r.kind === 'text') put(r.t, rtl ? x1 - 46 : x0 + 46, y + 27, `400 25px ${r.book ? BOOK : UI}`, '#1d1a14');
      else if (r.kind === 'rep') put(r.t, rtl ? x1 - 76 : x0 + 76, y + 24, `400 21px ${UI}`, '#5f584a');
      else if (r.kind === 'more') put(r.t, rtl ? x1 - 46 : x0 + 46, y + 24, `600 21px ${UI}`, '#8b8372');
      y += r.h;
    }
    return { c, hPt: c.height / k };
  }
  /* The first page: who is which colour (or what each colour means), the headings' marks, the numbers. */
  async function legendCanvas(g, by, onPage, wPt, hPt, nHeads) {
    await loadFonts();
    const W = 1240, H = Math.round((W * hPt) / wPt);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#fffdf8';
    x.fillRect(0, 0, W, H);
    const rtl = L.isAr();
    const S0 = rtl ? W - 100 : 100, dir = rtl ? -1 : 1;
    const put = (t, xx, yy, font, color, d) => {
      x.font = font;
      x.fillStyle = color;
      x.direction = d || firstStrong(t);
      x.textAlign = x.direction === 'rtl' ? 'right' : 'left';
      x.fillText(t, xx, yy);
    };
    let y = 130;
    x.font = `700 54px ${BOOK}`;
    for (const ln of lines(x, g.info.title, W - 200).slice(0, 2)) {
      x.fillStyle = '#1d1a14';
      x.direction = firstStrong(ln);
      x.textAlign = 'center';
      x.fillText(ln, W / 2, y);
      y += 70;
    }
    y += 10;
    put(L('الكتاب بملاحظات الحلقة', 'The book with the circle’s notes', 'الكتاب بملاحظات الحلقة'), S0, y, `600 30px ${UI}`, '#2440a0', rtl ? 'rtl' : 'ltr');
    y += 46;
    put(`${L('اتعمل من «نقرأ سوا»', 'Made with Read Together', 'صُنع من «نقرأ سوا»')} • ${L.day(U.today())}`, S0, y, `400 24px ${UI}`, '#9a917e', rtl ? 'rtl' : 'ltr');
    y += 50;
    x.fillStyle = '#d9a22b';
    x.fillRect(100, y, W - 200, 3);
    y += 70;
    const head = (t) => {
      put(t, S0, y, `700 34px ${UI}`, '#1d1a14', rtl ? 'rtl' : 'ltr');
      y += 58;
    };
    if (by === 'person') {
      head(L('مين بلون إيه', 'Who is which colour', 'من بأي لون'));
      const ppl = new Map();
      for (const n of g.notes) {
        if (!n.name) continue;
        if (!ppl.has(n.name)) ppl.set(n.name, { n, c: 0 });
        ppl.get(n.name).c++;
      }
      for (const { n, c } of [...ppl.values()].sort((a, b) => b.c - a.c)) {
        x.fillStyle = n.col;
        x.globalAlpha = 0.45;
        x.fillRect(rtl ? S0 - 120 : S0, y - 28, 120, 36);
        x.globalAlpha = 1;
        drawAv(x, rtl ? S0 - 160 : S0 + 160, y - 10, 22, n);
        put(`${n.name}  •  ${L.count(c, 'note')}`, rtl ? S0 - 200 : S0 + 200, y, `600 28px ${UI}`, darker(n.col), rtl ? 'rtl' : 'ltr');
        y += 62;
      }
    } else {
      head(by === 'kind' ? L('كل لون معناه إيه', 'What each colour means', 'ما معنى كل لون') : L('أنواع الملاحظات', 'Kinds of notes', 'أنواع الملاحظات'));
      const cnt = {};
      for (const n of g.notes) cnt[n.kind] = (cnt[n.kind] || 0) + 1;
      for (const k of KINDS.filter((k) => cnt[k])) {
        x.fillStyle = KIND_COL[k];
        x.globalAlpha = by === 'kind' ? 0.45 : 1;
        if (by === 'kind') x.fillRect(rtl ? S0 - 120 : S0, y - 28, 120, 36);
        else {
          x.beginPath();
          x.arc(rtl ? S0 - 14 : S0 + 14, y - 10, 12, 0, Math.PI * 2);
          x.fill();
        }
        x.globalAlpha = 1;
        put(`${V.kindLabel(k)}  •  ${L.num(cnt[k])}`, rtl ? S0 - (by === 'kind' ? 150 : 44) : S0 + (by === 'kind' ? 150 : 44), y, `600 28px ${UI}`, '#2b2a33', rtl ? 'rtl' : 'ltr');
        y += 58;
      }
      if (by === 'mark') {
        put(L('التظليل بالألوان اللي اتعلّم بيها في البرنامج.', 'Highlights keep the colours they were marked with.', 'التظليل بالألوان التي عُلّم بها في البرنامج.'), S0, y, `400 24px ${UI}`, '#6b6352', rtl ? 'rtl' : 'ltr');
        y += 50;
      }
    }
    y += 30;
    if (onPage) {
      head(L('الأرقام', 'The numbers', 'الأرقام'));
      x.beginPath();
      x.arc(rtl ? S0 - 18 : S0 + 18, y - 10, 18, 0, Math.PI * 2);
      x.fillStyle = '#2440a0';
      x.fill();
      x.save();
      x.fillStyle = '#fff';
      x.font = `700 22px ${UI}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(L.num(1), rtl ? S0 - 18 : S0 + 18, y - 9);
      x.restore();
      put(L('رقم الملاحظة جنب مكانها، وكلامها تحت الصفحة', 'A note’s number by its place; its words below the page', 'رقم الملاحظة بجانب مكانها، وكلامها أسفل الصفحة'), rtl ? S0 - 56 : S0 + 56, y, `400 26px ${UI}`, '#2b2a33', rtl ? 'rtl' : 'ltr');
      y += 58;
      put(L('ودوس على أي تظليل في برنامج الـPDF تشوف الملاحظة كاملة.', 'Tap a highlight in your PDF app to see the whole note.', 'واضغط على أي تظليل في برنامج PDF لترى الملاحظة كاملة.'), S0, y, `400 24px ${UI}`, '#6b6352', rtl ? 'rtl' : 'ltr');
      y += 70;
    }
    if (nHeads) {
      head(L('الفهرس', 'Contents'));
      put(L(`فيه ${L.num(nHeads)} عنوان في فهرس الملف — افتح قايمة الفهرس في برنامج الـPDF.`, `${nHeads} headings in the file’s contents — open the bookmarks in your PDF app.`, `فيه ${L.num(nHeads)} عنوانًا في فهرس الملف — افتح قائمة الفهرس في برنامج PDF.`), S0, y, `400 25px ${UI}`, '#2b2a33', rtl ? 'rtl' : 'ltr');
    }
    x.font = `400 22px ${UI}`;
    x.fillStyle = '#9a917e';
    x.textAlign = 'center';
    x.fillText(L('نقرأ سوا', 'Read Together'), W / 2, H - 70);
    return c;
  }
  /* «الفهرس» as the PDF's own contents (bookmarks), at each heading's line: the file's outline is replaced by
     the book's contents in the app (which holds it). from = the book page of the file's first page. */
  function addOutline(doc, list, from) {
    const { PDFName, PDFHexString } = window.PDFLib;
    const ctx = doc.context;
    const pages = doc.getPages();
    const items = list.filter((h) => h.p - from >= 0 && h.p - from < pages.length);
    if (!items.length) return 0;
    const root = ctx.nextRef();
    const refs = items.map(() => ctx.nextRef());
    const kids = new Map();
    const top = [];
    const stack = [];
    items.forEach((h, i) => {
      while (stack.length && items[stack[stack.length - 1]].l >= h.l) stack.pop();
      const par = stack.length ? stack[stack.length - 1] : -1;
      if (par < 0) top.push(i);
      else {
        if (!kids.has(par)) kids.set(par, []);
        kids.get(par).push(i);
      }
      stack.push(i);
    });
    const countOf = (i) => (kids.get(i) || []).reduce((n, k) => n + 1 + countOf(k), 0);
    const link = (arr, parRef) =>
      arr.forEach((i, k) => {
        const h = items[i];
        const pg = pages[h.p - from];
        const bx = boxOf(pg, { x: 0, y: Math.max(0, h.y - 0.02), w: 0, h: 0 });
        const dict = { Title: PDFHexString.fromText(h.t || A.Hd.name(h.l)), Parent: parRef, Dest: [pg.ref, PDFName.of('XYZ'), null, Math.max(bx.y1, bx.y2), null] };
        if (k > 0) dict.Prev = refs[arr[k - 1]];
        if (k < arr.length - 1) dict.Next = refs[arr[k + 1]];
        const ch = kids.get(i);
        if (ch) {
          dict.First = refs[ch[0]];
          dict.Last = refs[ch[ch.length - 1]];
          dict.Count = h.l === 1 ? countOf(i) : -countOf(i); // chapters open, the rest folded
        }
        ctx.assign(refs[i], ctx.obj(dict));
        if (ch) link(ch, refs[i]);
      });
    link(top, root);
    ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[top[0]], Last: refs[top[top.length - 1]], Count: top.length }));
    doc.catalog.set(PDFName.of('Outlines'), root);
    return items.length;
  }
  async function asAnnotated(g, onProg, o = {}) {
    const by = ['person', 'kind', 'mark'].includes(o.colorBy) ? o.colorBy : 'person';
    const onPage = o.onPage !== false;
    const b = g.info.book;
    await U.loadScript(U.CDN.pdflib);
    const { PDFDocument } = window.PDFLib;
    const files = await bookFiles(b, onProg);
    if (!files) return null;
    const byPage = new Map();
    let skipped = 0;
    for (const n of g.notes) {
      if (!n.page) {
        skipped++;
        continue;
      }
      if (!byPage.has(n.page)) byPage.set(n.page, []);
      byPage.get(n.page).push(n);
    }
    const name = safeName(b.title);
    const out = [];
    const rtl = (b.lang || 'ar') !== 'en';
    if (onPage) await loadFonts();
    const one = async (doc, from, first) => {
      const pages = doc.getPages();
      const cache = new Map();
      const foot = [];
      for (const [p, ns] of byPage) {
        const pg = pages[p - from];
        if (!pg) continue;
        const list = ns.map((n, i) => ({ n, num: i + 1 }));
        for (const it of list) annotate(doc, pg, it.n, colOf(it.n, by));
        if (!onPage || ((pg.getRotation().angle || 0) % 360) !== 0) continue;
        for (const it of list) {
          const at = badgeAt(pg, it.n, rtl);
          pg.drawImage(await badgeImg(doc, cache, it.num, colOf(it.n, by)), { x: at.x - 6.5, y: at.y - 6.5, width: 13, height: 13 });
        }
        foot.push({ pg, list });
      }
      const nh = A.Hd ? addOutline(doc, A.Hd.list(b.id).filter((h) => !A.Hd.hidden(h)), from) : 0;
      // the words below each page: the page grows downwards by a strip (after everything placed by the page's box)
      for (const f of foot) {
        const cb = f.pg.getCropBox();
        const mb = f.pg.getMediaBox();
        const { c, hPt } = await footerCanvas(f.list, cb.width, cb.height * 0.6, rtl, by);
        const img = await doc.embedJpg(await canvasBytes(c));
        const y0 = cb.y - hPt;
        f.pg.setMediaBox(mb.x, Math.min(mb.y, y0), mb.width, Math.max(mb.y + mb.height, cb.y + cb.height) - Math.min(mb.y, y0));
        f.pg.setCropBox(cb.x, y0, cb.width, cb.height + hPt);
        f.pg.drawImage(img, { x: cb.x, y: y0, width: cb.width, height: hPt });
      }
      // who is which colour, first
      if (first) {
        const p0 = pages[0];
        const cb = p0.getCropBox();
        const rot = ((p0.getRotation().angle || 0) % 180) !== 0;
        const w = rot ? cb.height : cb.width, h = rot ? cb.width : cb.height;
        const c = await legendCanvas(g, by, onPage, w, h, nh);
        const img = await doc.embedJpg(await canvasBytes(c));
        const lp = doc.insertPage(0, [w, h]);
        lp.drawImage(img, { x: 0, y: 0, width: w, height: h });
      }
      return doc.save();
    };
    if (files.length === 1) {
      const doc = await PDFDocument.load(files[0].buf, { ignoreEncryption: true, updateMetadata: false });
      if (onProg) onProg(0.7);
      out.push({ name: `${name} — ${L('بالملاحظات', 'with notes', 'بالملاحظات')}.pdf`, data: await one(doc, files[0].from, true) });
    } else {
      try {
        const doc = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          const src = await PDFDocument.load(files[i].buf, { ignoreEncryption: true });
          (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
          if (onProg) onProg(0.5 + (0.3 * (i + 1)) / files.length);
        }
        out.push({ name: `${name} — ${L('بالملاحظات', 'with notes', 'بالملاحظات')}.pdf`, data: await one(doc, 1, true) });
      } catch (e) {
        // too heavy to put together on this phone: one file per part
        console.warn('merge', e);
        for (let i = 0; i < files.length; i++) {
          const doc = await PDFDocument.load(files[i].buf, { ignoreEncryption: true, updateMetadata: false });
          out.push({ name: `${name} (${i + 1}) — ${L('بالملاحظات', 'with notes', 'بالملاحظات')}.pdf`, data: await one(doc, files[i].from, i === 0) });
        }
      }
    }
    if (onProg) onProg(1);
    return { files: out.map((f) => ({ name: f.name, blob: new Blob([f.data], { type: 'application/pdf' }) })), skipped };
  }

  /* ================= «ذكرى الكتاب» ================= */
  /* When the circle finishes a book: a keepsake PDF — the cover, who read it and when, the numbers, the best
     quotes, the most reacted, questions and their answers, everyone's takeaways, the bosses beaten meanwhile, the
     chapters. Pages are drawn like the report (canvas → JPEG → pdf-lib). */
  async function asMemory(bookId, onProg) {
    const b = D.book(bookId);
    if (!b) return null;
    await U.loadScript(U.CDN.pdflib);
    await loadFonts();
    const { PDFDocument } = window.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${b.title} — ${L('ذكرى الكتاب', 'A keepsake', 'ذكرى الكتاب')}`);
    pdf.setCreator('نقرأ سوا');
    pdf.setProducer('naqra-sawa');
    pdf.setCreationDate(new Date());
    const rtl = L.isAr();
    const S0 = rtl ? PW - M : M, dir = rtl ? -1 : 1, D0 = rtl ? 'rtl' : 'ltr';
    const BOTTOM = PH - M - FOOT;
    let cv = null, ctx = null, y = 0, pageNo = 0;
    const flush = async () => {
      if (!cv) return;
      ctx.direction = D0;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9a917e';
      ctx.font = `400 20px ${UI}`;
      ctx.fillText(`${L('نقرأ سوا', 'Read Together')} • ${L('ذكرى', 'Keepsake', 'ذكرى')} «${b.title}» • ${L.num(pageNo)}`, PW / 2, PH - M + 20);
      const img = await pdf.embedJpg(await canvasBytes(cv, 'image/jpeg', 0.88));
      pdf.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
      cv.width = cv.height = 0;
      cv = null;
    };
    const newPage = async () => {
      await flush();
      cv = document.createElement('canvas');
      cv.width = PW;
      cv.height = PH;
      ctx = cv.getContext('2d');
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, PW, PH);
      y = M;
      pageNo++;
    };
    const ensure = async (h) => {
      if (!cv || (y + h > BOTTOM && y > M + 4)) await newPage();
    };
    const text = (t, x, yy, font, color, d) => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.direction = d || firstStrong(t);
      ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
      ctx.fillText(t, x, yy);
    };
    const centre = (t, yy, font, color) => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.direction = firstStrong(t);
      ctx.textAlign = 'center';
      ctx.fillText(t, PW / 2, yy);
    };
    const para = async (t, font, size, lh, color, x0, x1, bar) => {
      ctx.font = font;
      const d = firstStrong(t);
      for (const ln of lines(ctx, t, x1 - x0)) {
        await ensure(lh);
        if (bar) {
          ctx.fillStyle = bar;
          ctx.fillRect(rtl ? x1 + 18 : x0 - 24, y - 4, 6, lh);
        }
        text(ln, d === 'rtl' ? x1 : x0, y + size, font, color, d);
        y += lh;
      }
    };
    const section = async (title) => {
      await ensure(200);
      y += 24;
      text(title, S0, y + 46, `700 46px ${BOOK}`, '#7a3a16', D0);
      y += 70;
      ctx.fillStyle = '#d9a22b';
      ctx.fillRect(M, y, PW - 2 * M, 3);
      y += 40;
    };
    const who = async (n, size = 22) => {
      // a member's mark and name on one line
      drawAv(ctx, rtl ? S0 - 17 : S0 + 17, y + 19, 17, n);
      text(n.name || '', rtl ? S0 - 44 : S0 + 44, y + 27, `700 ${size}px ${UI}`, darker(n.col), D0);
    };

    // what there is to tell
    const ms = D.memberIds().filter((u) => S.members.has(u));
    const person = (u) => {
      const m = S.members.get(u) || {};
      return { name: D.name(u), col: D.color(u), emo: m.emoji || '' };
    };
    const recs = [...S.notes.values()].filter((n) => n.b === bookId && !V.isSpoiler(n)).map((n) => record(Object.assign({}, n, { src: 'c' }), { replies: true }));
    const rxN = (n) => (n.rx || []).reduce((t, x) => t + x[1], 0);
    const ws = portions(b);
    const starts = ws.map((w) => w.start).filter(Boolean).sort();
    const start = starts[0] || U.isoKey(b.addedAt || '') || U.today();
    const fins = ms.map((u) => (D.prog(bookId, u) || {}).finished).filter(Boolean).map((t) => U.isoKey(t)).sort();
    const end = U.isoKey(b.doneAt || '') || fins[fins.length - 1] || U.today();
    const days = Math.max(1, U.diffDays(start, end) + 1);
    const quotes = recs.filter((n) => (n.kind === 'quote' || n.kind === 'hl') && n.text && n.text.length >= 12).sort((a, c) => rxN(c) - rxN(a) || Math.abs(a.text.length - 140) - Math.abs(c.text.length - 140)).slice(0, 6);
    const qIds = new Set(quotes.map((n) => n.id));
    const loved = recs.filter((n) => rxN(n) > 0 && !qIds.has(n.id) && n.kind !== 'take').sort((a, c) => rxN(c) - rxN(a)).slice(0, 3);
    const asks = recs.filter((n) => n.kind === 'q' && n.replies.length).sort((a, c) => c.replies.length - a.replies.length).slice(0, 5);
    const takes = recs.filter((n) => n.kind === 'take');
    const bosses = G.bossWinList ? G.bossWinList().filter(([w0, d]) => d >= start && w0 <= end) : [];
    const chapters = A.Hd ? A.Hd.list(bookId).filter((h) => h.l === 1 && !A.Hd.hidden(h)) : [];
    const prog = (f) => onProg && onProg(f);

    // 1. the cover
    await newPage();
    const cover = b.cover ? await safeImg(b.cover) : null;
    y = 170;
    centre(L('ذكرى الكتاب', 'A keepsake', 'ذكرى الكتاب'), y, `700 34px ${UI}`, '#c8901c');
    y += 50;
    if (cover) {
      const cw = 420, ch = Math.round((cover.height / cover.width) * cw) || 630;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.2)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(cover, (PW - cw) / 2, y, cw, Math.min(ch, 680));
      ctx.restore();
      y += Math.min(ch, 680) + 80;
    } else y += 120;
    ctx.font = `700 64px ${BOOK}`;
    for (const ln of lines(ctx, b.title, PW - 2 * M).slice(0, 3)) {
      centre(ln, y + 60, `700 64px ${BOOK}`, '#1d1a14');
      y += 84;
    }
    if (b.author) {
      centre(b.author, y + 40, `400 36px ${BOOK}`, '#6b6352');
      y += 64;
    }
    y += 20;
    const cname = (S.circle && S.circle.name) || '';
    const span = start === end ? L.day(start) : L(`من ${L.day(start)} لـ${L.day(end)}`, `${L.day(start)} to ${L.day(end)}`, `من ${L.day(start)} إلى ${L.day(end)}`);
    if (cname) {
      centre(`${L('حلقة', 'Circle', 'حلقة')} «${cname}»`, y + 30, `600 30px ${UI}`, '#2440a0');
      y += 48;
    }
    centre(span, y + 30, `500 26px ${UI}`, '#6b6352');
    y += 70;
    // everyone's mark in a row
    const row = ms.slice(0, 12);
    const gap = 96, x0 = PW / 2 - ((row.length - 1) * gap) / 2;
    row.forEach((u, i) => {
      const n = person(u);
      drawAv(ctx, x0 + i * gap, y + 30, 32, n);
      ctx.font = `600 20px ${UI}`;
      ctx.fillStyle = darker(n.col);
      ctx.textAlign = 'center';
      ctx.direction = firstStrong(n.name);
      ctx.fillText(n.name.length > 9 ? n.name.slice(0, 8) + '…' : n.name, x0 + i * gap, y + 92);
    });
    prog(0.15);

    // 2. the numbers
    await newPage();
    await section(L('إحنا بالأرقام', 'By the numbers', 'نحن بالأرقام'));
    const stats = [
      [L.count(b.pages || 0, 'page'), L('في الكتاب', 'in the book', 'في الكتاب')],
      [L.count(days, 'day'), L('قراية سوا', 'of reading together', 'من القراءة معًا')],
      [L.count(ws.length, 'wird'), L('قريناها سوا', 'read together', 'قرأناها معًا')],
      [L.count(recs.filter((n) => n.kind !== 'take').length, 'note'), L('على الصفحات', 'on the pages', 'على الصفحات')],
      [L.num(recs.filter((n) => n.kind === 'quote').length), L('اقتباس', 'quotes', 'اقتباسًا')],
      [L.num(recs.filter((n) => n.kind === 'q').length), L('سؤال', 'questions', 'سؤالًا')],
      [L.num(takes.length), L('خلاصة', 'takeaways', 'خلاصة')],
      [L.num(recs.reduce((t, n) => t + rxN(n), 0)), L('تفاعل', 'reactions', 'تفاعلًا')],
      ...(chapters.length ? [[L.num(A.Hd.hand(bookId).length), L('عنوان في الفهرس', 'headings in the contents', 'عنوانًا في الفهرس')]] : []),
      ...(bosses.length ? [[L.num(bosses.length), L('زعيم غلبناه', 'bosses beaten', 'زعيمًا هزمناه')]] : []),
    ];
    const colW = (PW - 2 * M) / 2;
    stats.forEach(([big, small], i) => {
      const cx = rtl ? PW - M - (i % 2) * colW : M + (i % 2) * colW;
      const yy = y + Math.floor(i / 2) * 130;
      text(big, cx, yy + 56, `700 54px ${UI}`, '#2440a0', D0);
      text(small, cx, yy + 98, `400 26px ${UI}`, '#6b6352', D0);
    });
    y += Math.ceil(stats.length / 2) * 130 + 20;

    // 3. who read it
    await section(L('مين قرا', 'Who read it', 'من قرأ'));
    for (const u of ms) {
      await ensure(90);
      const n = person(u);
      const p = D.prog(bookId, u) || {};
      await who(n, 26);
      const mine = recs.filter((x) => x.by === u);
      const bits = [p.finished ? L(`خلّص ${L.day(U.isoKey(p.finished))}`, `finished ${L.day(U.isoKey(p.finished))}`, `أنهاه ${L.day(U.isoKey(p.finished))}`) : L('لسه ماخلّصش', 'not finished yet', 'لم ينهه بعد'), mine.filter((x) => x.kind !== 'take').length ? L.count(mine.filter((x) => x.kind !== 'take').length, 'note') : '', mine.filter((x) => x.kind === 'take').length ? `${L.num(mine.filter((x) => x.kind === 'take').length)} ${L('خلاصة', 'takeaways', 'خلاصة')}` : ''].filter(Boolean);
      text(bits.join('  •  '), rtl ? S0 - 44 : S0 + 44, y + 64, `400 22px ${UI}`, '#6b6352', D0);
      y += 92;
    }
    prog(0.35);

    // 4. the best quotes, 5. the most loved
    const noteBlock = async (n, big) => {
      const size = big ? 32 : 27;
      const lh = Math.round(size * 1.7);
      await ensure(70 + lh * 2);
      await who(n);
      const meta = [n.page ? `${L('ص', 'p.')} ${L.num(n.page)}` : '', n.rx ? rxLine(n.rx) : ''].filter(Boolean).join('   ');
      ctx.font = `700 22px ${UI}`;
      const nw = ctx.measureText(n.name || '').width;
      text(meta, rtl ? S0 - 60 - nw : S0 + 60 + nw, y + 27, `400 22px ${UI}, ${EMOJI}`, '#8b8372', D0);
      y += 56;
      const words = n.kind === 'quote' || n.kind === 'hl' ? `«${n.text}»` : n.text;
      await para(words, `400 ${size}px ${n.kind === 'quote' || n.kind === 'hl' ? BOOK : UI}`, size, lh, '#1d1a14', M + 30, PW - M - 30, KIND_COL[n.kind]);
      y += 34;
    };
    if (quotes.length) {
      await section(L('أحلى الاقتباسات', 'The best quotes', 'أجمل الاقتباسات'));
      for (const n of quotes) await noteBlock(n, true);
    }
    if (loved.length) {
      await section(L('الأكتر تفاعل', 'Most loved', 'الأكثر تفاعلًا'));
      for (const n of loved) await noteBlock(n, false);
    }
    prog(0.55);

    // 6. questions and their answers
    if (asks.length) {
      await section(L('أسئلة وإجاباتها', 'Questions and answers', 'أسئلة وإجاباتها'));
      for (const n of asks) {
        await noteBlock(n, false);
        y -= 20;
        for (const r of n.replies.slice(0, 3)) await para(`↩ ${r.name}: ${r.text}`, `400 24px ${UI}`, 24, 38, '#5f584a', rtl ? M + 30 : M + 80, rtl ? PW - M - 80 : PW - M - 30);
        y += 30;
      }
    }

    // 7. everyone's takeaways
    if (takes.length) {
      await section(L('خلاصاتكم', 'Your takeaways', 'خلاصاتكم'));
      for (const u of ms) {
        const mine = takes.filter((n) => n.by === u).sort((a, c) => (a.page || 0) - (c.page || 0)).slice(0, 8);
        if (!mine.length) continue;
        await ensure(120);
        await who(person(u), 26);
        y += 54;
        for (const n of mine) {
          const w = n.wid && ws.find((x) => x.id === n.wid);
          await para(`${w ? `${L('الورد', 'Portion', 'الورد')} ${L.num(w.n)}: ` : ''}${n.text}`, `400 26px ${UI}`, 26, 42, '#1d1a14', M + 30, PW - M - 30, KIND_COL.take);
          y += 16;
        }
        y += 24;
      }
    }
    prog(0.75);

    // 8. the bosses beaten meanwhile
    if (bosses.length && A.P && A.P.monster) {
      await section(L('الوحوش اللي غلبناها', 'The bosses we beat', 'الوحوش التي هزمناها'));
      for (const [w0, d] of bosses) {
        await ensure(70);
        const [code, name] = A.P.monster(w0);
        let emo = '';
        try {
          emo = String.fromCodePoint(...String(code).split('_').map((h) => parseInt(h, 16)));
        } catch (e) {}
        text(emo, S0, y + 42, `44px ${EMOJI}`, '#000', D0);
        text(`${name} — ${L(`اتهزم ${L.day(d)}`, `beaten ${L.day(d)}`, `هُزم ${L.day(d)}`)}`, rtl ? S0 - 70 : S0 + 70, y + 38, `600 28px ${UI}`, '#2b2a33', D0);
        y += 70;
      }
    }

    // 9. the chapters
    if (chapters.length) {
      await section(L('الفصول', 'The chapters', 'الفصول'));
      for (const h of chapters) {
        await ensure(50);
        text(`◆  ${h.t}`, S0, y + 32, `600 28px ${UI}`, '#2b2a33', D0);
        text(L.num(h.p), PW - S0, y + 32, `400 24px ${UI}`, '#8b8372', rtl ? 'ltr' : 'rtl');
        y += 50;
      }
    }

    // the end
    await ensure(160);
    y += 50;
    centre(L('شكرًا إنكم قريتوه سوا 💛', 'Thank you for reading it together 💛', 'شكرًا لأنكم قرأتموه معًا 💛'), y + 40, `600 34px ${UI}, ${EMOJI}`, '#c8901c');
    await flush();
    prog(1);
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  }
  /* The sheet offering it: what's inside, then the file. */
  V.memoryBook = (bookId) => {
    const b = D.book(bookId);
    if (!b) return;
    let busy = false;
    V.sheet({
      title: `${icon('trophy')} ${L('ذكرى الكتاب', 'A keepsake of the book', 'ذكرى الكتاب')}`,
      html: `<div class="ex mem">
        <p class="lead" dir="auto">«${esc(b.title)}»</p>
        <p class="muted">${L('ملف PDF تحتفظوا بيه: مين قرا وإمتى، الأرقام، أحلى الاقتباسات، الأكتر تفاعل، الأسئلة وإجاباتها، خلاصات كل واحد، والوحوش اللي غلبتوها.', 'A PDF to keep: who read it and when, the numbers, the best quotes, the most loved, questions and answers, everyone’s takeaways, and the bosses you beat.', 'ملف PDF تحتفظون به: من قرأ ومتى، الأرقام، أجمل الاقتباسات، الأكثر تفاعلًا، الأسئلة وإجاباتها، خلاصات كل واحد، والوحوش التي هزمتموها.')}</p>
        <div class="ex-prog" id="ex-prog"></div>
        <div class="row-btns ex-go"><button type="button" class="btn gold" data-run>${icon(A.P && A.P.native ? 'share' : 'download')}${A.P && A.P.native ? L('اعمله وابعته', 'Make and send it', 'اصنعه وأرسله') : L('اعمله', 'Make it', 'اصنعه')}</button></div>
      </div>`,
      onMount: (el) =>
        el.addEventListener('click', async (e) => {
          if (busy || !e.target.closest('[data-run]')) return;
          busy = true;
          el.querySelector('.ex').classList.add('busy');
          const pr = (f) => {
            const x = el.querySelector('#ex-prog');
            if (x) x.innerHTML = V.bar(f, 'gold');
          };
          try {
            pr(0.03);
            const blob = await asMemory(bookId, pr);
            if (blob) await saveFile(blob, `${safeName(b.title)} — ${L('ذكرى الكتاب', 'keepsake', 'ذكرى الكتاب')}.pdf`);
          } catch (er) {
            console.warn('memory', er);
            U.toast(L('الملف ماكملش. جرّب تاني.', 'The file did not finish. Try again.', 'لم يكتمل الملف. حاول مجددًا.'), 'warn');
          }
          pr(1);
          busy = false;
          el.querySelector('.ex').classList.remove('busy');
        }),
    });
  };
  V.actions['memory-book'] = (a) => V.memoryBook(a.dataset.b);

  /* ================= files ================= */
  function pickFile(accept) {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept;
      inp.style.display = 'none';
      inp.id = 'ex-file';
      document.body.appendChild(inp);
      let done = false;
      inp.addEventListener('change', () => {
        done = true;
        res(inp.files && inp.files[0] ? inp.files[0] : null);
        inp.remove();
      });
      // cancelled: the page gets focus back without a file
      window.addEventListener('focus', () => setTimeout(() => !done && !inp.files.length && (res(null), inp.remove()), 1500), { once: true });
      inp.click();
    });
  }
  async function saveFile(blob, filename) {
    V.lastExport = { blob, filename }; // for the tests, and «حمّله تاني»
    if (!S.downloads) return U.toast(L('الحفظ مش متاح هنا', 'Saving is not available here', 'الحفظ غير متاح هنا'), 'warn');
    try {
      await S.downloads.save({ filename, data: blob });
      U.toast(`✓ ${L('الملف جاهز', 'The file is ready', 'الملف جاهز')}`);
    } catch (e) {
      if (e && e.code === 'declined') return;
      U.toast(L('الملف ماتحفظش', 'The file was not saved', 'لم يُحفظ الملف'), 'warn');
    }
  }

  /* ================= the export sheet ================= */
  const FORMATS = [
    { k: 'file', ic: 'book', t: () => L('الكتاب لوحده', 'The book alone', 'الكتاب وحده'), d: () => L('الملف زي ما هو', 'The file as it is', 'الملف كما هو') },
    { k: 'pdf', ic: 'file', t: () => L('الملاحظات PDF', 'Notes as a PDF', 'الملاحظات PDF'), d: () => L('مرتّبة للقراية والطباعة', 'Tidy, to read and print', 'مرتّبة للقراءة والطباعة') },
    { k: 'book', ic: 'books', t: () => L('الكتاب بملاحظاتنا', 'The book with our notes', 'الكتاب بملاحظاتنا'), d: () => L('الملاحظات جوه الكتاب نفسه', 'The notes inside the book itself', 'الملاحظات داخل الكتاب نفسه') },
    { k: 'text', ic: 'note', t: () => L('نص', 'Text', 'نص'), d: () => L('لواتساب أو Notion', 'For WhatsApp or Notion', 'لواتساب أو Notion') },
    { k: 'backup', ic: 'download', t: () => L('نسخة احتياطية', 'Backup', 'نسخة احتياطية'), d: () => L('ترجّع بيها كل حاجة بعدين', 'Brings everything back later', 'تستعيد بها كل شيء لاحقًا') },
  ];
  V.exportSheet = (opts = {}) => {
    const key = opts.b || '';
    const info0 = key ? infoOf(key, [...S.myNotes.values()].find((n) => keyOf(n) === key)) : null;
    const privOnly = !!(info0 && (info0.priv || info0.ext));
    const pref = U.store.get('exportOpts', {});
    const o = {
      b: key,
      who: privOnly ? 'me' : ['me', 'all', 'some'].includes(pref.who) ? pref.who : 'me',
      people: new Set(),
      kinds: new Set(Array.isArray(pref.kinds) && pref.kinds.length ? pref.kinds.filter((k) => KINDS.includes(k)) : KINDS),
      replies: pref.replies !== false,
      stars: false,
      fmt: opts.fmt || (FORMATS.some((f) => f.k === pref.fmt) ? pref.fmt : 'pdf'),
      colorBy: ['person', 'kind', 'mark'].includes(pref.colorBy) ? pref.colorBy : 'person',
      onPage: pref.onPage !== false,
    };
    if (privOnly) o.who = 'me';
    const canBook = () => !!(info0 && info0.book && !info0.ext && D.book(key));
    const canFile = () => !!(canBook() && (info0.book.parts || []).length);
    // from the book («ابعت نسخة»): the book alone, with our notes, the notes as a PDF, text; elsewhere a backup too
    const fmtsOf = () =>
      (opts.send ? ['file', 'book', 'pdf', 'text'] : ['pdf', 'book', 'text', 'backup'])
        .map((k) => FORMATS.find((f) => f.k === k))
        .filter((f) => (f.k === 'file' ? canFile() : f.k === 'book' ? canBook() : true));
    if (!fmtsOf().some((f) => f.k === o.fmt)) o.fmt = opts.send && canBook() ? 'book' : 'pdf';
    let busy = false;
    const people = () => {
      const m = new Map();
      for (const n of S.notes.values()) if (n.b && (!key || n.b === key) && !V.isSpoiler(n)) m.set(n.by, (m.get(n.by) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const summary = () => {
      const kinds = o.kinds.size === KINDS.length ? L('كل الأنواع', 'All kinds', 'كل الأنواع') : [...o.kinds].map((k) => V.kindLabel(k)).join('، ');
      return [o.who === 'me' ? L('ملاحظاتي', 'Mine', 'ملاحظاتي') : o.who === 'all' ? L('الحلقة كلها', 'Whole circle', 'الحلقة كلها') : L(`${L.num(o.people.size)} من الناس`, `${o.people.size} people`, `${L.num(o.people.size)} من الأعضاء`), kinds, o.replies ? L('بالردود', 'With replies', 'بالردود') : L('من غير ردود', 'No replies', 'دون ردود'), o.stars ? '⭐' : ''].filter(Boolean).join(' • ');
    };
    const html = () => {
      const { notes, hidden } = gather(o);
      const books = new Set(notes.map(keyOf)).size;
      const fmts = fmtsOf();
      const chip = (attr, v, on, t) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}="${esc(v)}" aria-pressed="${on}">${t}</button>`;
      const native = !!(A.P && A.P.native);
      const go = opts.send ? (native ? [icon('share'), L('ابعت', 'Send', 'أرسل')] : [icon('download'), L('نزّل', 'Download', 'نزّل')]) : [icon('download'), L('صدّر', 'Export', 'صدّر')];
      if (o.fmt === 'file') {
        const parts = (info0.book.parts || []).length;
        return `<div class="ex">
          <div class="ex-fmts" role="radiogroup">${fmts.map((f) => `<button type="button" class="ex-fmt${o.fmt === f.k ? ' on' : ''}" data-fmt="${f.k}" role="radio" aria-checked="${o.fmt === f.k}">${icon(f.ic)}<b>${f.t()}</b><small>${f.d()}</small></button>`).join('')}</div>
          <p class="muted sm ex-hint">${icon('info')}<span>${parts > 1 ? L(`الكتاب مترفع ${L.num(parts)} أجزاء: تقدر تجمّعهم في ملف واحد.`, `The book is stored in ${parts} parts: you can put them together in one file.`, `الكتاب مرفوع في ${L.num(parts)} أجزاء: يمكنك جمعها في ملف واحد.`) : L('من غير ملاحظات. البرنامج نفسه محتفظ بالكتاب وبيفتحه من غير نت.', 'Without notes. The app keeps the book itself and opens it offline.', 'دون ملاحظات. البرنامج يحتفظ بالكتاب ويفتحه دون إنترنت.')}</span></p>
          <div class="row-btns ex-go"><button type="button" class="btn gold" data-run>${go[0]}${go[1]}</button></div>
        </div>`;
      }
      return `<div class="ex">
        <div class="ex-fmts" role="radiogroup">${fmts.map((f) => `<button type="button" class="ex-fmt${o.fmt === f.k ? ' on' : ''}" data-fmt="${f.k}" role="radio" aria-checked="${o.fmt === f.k}">${icon(f.ic)}<b>${f.t()}</b><small>${f.d()}</small></button>`).join('')}</div>
        ${o.fmt === 'book' ? `<div class="ex-book">
          <div class="ex-row"><span>${L('لون التظليل', 'Highlight colour', 'لون التظليل')}</span><div class="chips">${chip('data-colorby', 'person', o.colorBy === 'person', L('لون الشخص', 'Each person’s', 'لون الشخص'))}${chip('data-colorby', 'kind', o.colorBy === 'kind', L('لون النوع', 'By kind', 'لون النوع'))}${chip('data-colorby', 'mark', o.colorBy === 'mark', L('زي ما اتعلّم', 'As marked', 'كما عُلّم'))}</div></div>
          <label class="ex-sw"><span>${L('الكلام يبان تحت كل صفحة', 'The words show below each page', 'الكلام يظهر أسفل كل صفحة')}<small>${L('رقم جنب كل ملاحظة وكلامها تحت الصفحة — يتقري في أي برنامج وفي الطباعة', 'A number by each note and its words below the page — readable in any app and in print', 'رقم بجانب كل ملاحظة وكلامها أسفل الصفحة — يُقرأ في أي برنامج وفي الطباعة')}</small></span><span class="switch"><input type="checkbox" data-onpage ${o.onPage ? 'checked' : ''}><i></i></span></label>
        </div>` : ''}
        <details class="ex-more"${opts.open ? ' open' : ''}><summary><span>${L('مين وإيه؟', 'Whose and what?', 'لمن وماذا؟')}</span><small>${esc(summary())}</small></summary>
          ${privOnly ? '' : `<div class="ex-row"><span>${L('مين', 'Whose', 'لمن')}</span><div class="chips">${chip('data-who', 'me', o.who === 'me', L('أنا بس', 'Only me', 'أنا فقط'))}${chip('data-who', 'all', o.who === 'all', L('الحلقة كلها', 'Whole circle', 'الحلقة كلها'))}${chip('data-who', 'some', o.who === 'some', L('ناس معيّنين', 'Some people', 'أشخاص معيّنون'))}</div></div>
          ${o.who === 'some' ? `<div class="chips ex-people">${people().map(([u, c]) => `<button type="button" class="chip person${o.people.has(u) ? ' on' : ''}" data-person="${esc(u)}" aria-pressed="${o.people.has(u)}">${D.avatar(u, 'xs')}<span>${esc(D.name(u))}</span><small>${L.num(c)}</small></button>`).join('')}</div>` : ''}`}
          <div class="ex-row"><span>${L('إيه', 'What', 'ماذا')}</span><div class="chips">${KINDS.map((k) => chip('data-kind', k, o.kinds.has(k), V.kindLabel(k))).join('')}</div></div>
          <label class="ex-sw"><span>${L('الردود معاها', 'With the replies', 'مع الردود')}</span><span class="switch"><input type="checkbox" data-replies ${o.replies ? 'checked' : ''}><i></i></span></label>
          <label class="ex-sw"><span>⭐ ${L('المفضلة بس', 'Favourites only', 'المفضلة فقط')}</span><span class="switch"><input type="checkbox" data-stars ${o.stars ? 'checked' : ''}><i></i></span></label>
        </details>
        <p class="ex-count${notes.length ? '' : ' none'}" id="ex-count">${notes.length ? L(`هيتصدّر ${L.count(notes.length, 'note')}${books > 1 ? ` من ${L.count(books, 'book')}` : ''}`, `${L.count(notes.length, 'note')}${books > 1 ? ` from ${L.count(books, 'book')}` : ''} to export`, `ستُصدَّر ${L.count(notes.length, 'note')}${books > 1 ? ` من ${L.count(books, 'book')}` : ''}`) : L('مفيش ملاحظات بالاختيارات دي', 'No notes with these choices', 'لا ملاحظات بهذه الاختيارات')}${hidden ? `<small>${L(`و${L.count(hidden, 'note')} مستخبية لحد ما توصل لصفحتها 👀`, `and ${L.count(hidden, 'note')} hidden until you reach their page 👀`, `و${L.count(hidden, 'note')} مخفية حتى تصل إلى صفحتها 👀`)}</small>` : ''}</p>
        ${o.fmt === 'book' ? `<p class="muted sm ex-hint">${icon('info')}<span>${L('بيتفتح في أي برنامج PDF. الكتب الكبيرة بتاخد شوية وقت على الموبايل.', 'Opens in any PDF app. Big books take a little while on a phone.', 'يُفتح في أي برنامج PDF. الكتب الكبيرة تستغرق وقتًا على الهاتف.')}</span></p>` : ''}
        ${o.fmt === 'backup' ? `<p class="muted sm ex-hint">${icon('info')}<span>${L('احتفظ بالملف ده. من «استورد» في الدفتر بترجّع كل حاجة، في الحلقة دي أو في حلقة تانية.', 'Keep this file. «Import» in the notebook brings everything back, in this circle or another.', 'احتفظ بهذا الملف. من «استورد» في الدفتر تستعيد كل شيء، في هذه الحلقة أو في حلقة أخرى.')}</span></p>` : ''}
        <div class="ex-prog" id="ex-prog"></div>
        <div class="row-btns ex-go">${o.fmt === 'text' ? `<button type="button" class="btn ghost" data-copytext ${notes.length ? '' : 'disabled'}>${icon('copy')}${L('انسخ', 'Copy', 'انسخ')}</button>` : ''}<button type="button" class="btn gold" data-run ${notes.length ? '' : 'disabled'}>${go[0]}${go[1]}</button></div>
      </div>`;
    };
    const remember = () => U.store.set('exportOpts', { who: o.who === 'some' ? 'me' : o.who, kinds: [...o.kinds], replies: o.replies, fmt: o.fmt === 'file' ? pref.fmt : o.fmt, colorBy: o.colorBy, onPage: o.onPage });
    const api = V.sheet({
      title: opts.send ? `${icon('share')} ${L('ابعت نسخة', 'Send a copy', 'أرسل نسخة')}` : `${icon('download')} ${key ? esc(info0.title) : L('صدّر ملاحظاتي', 'Export my notes', 'صدّر ملاحظاتي')}`,
      html: html(),
      onMount: (el) => {
        const redraw = () => {
          const det = el.querySelector('.ex-more');
          opts.open = !!(det && det.open);
          V.patch(el, html());
        };
        el.addEventListener('toggle', (e) => e.target.classList && e.target.classList.contains('ex-more') && (opts.open = e.target.open), true);
        el.addEventListener('change', (e) => {
          if (e.target.matches('[data-replies]')) o.replies = e.target.checked;
          else if (e.target.matches('[data-stars]')) o.stars = e.target.checked;
          else if (e.target.matches('[data-onpage]')) o.onPage = e.target.checked;
          else return;
          remember();
          redraw();
        });
        el.addEventListener('click', async (e) => {
          const q = (s) => e.target.closest(s);
          if (busy) return;
          let t;
          if ((t = q('[data-fmt]'))) o.fmt = t.dataset.fmt;
          else if ((t = q('[data-colorby]'))) o.colorBy = t.dataset.colorby;
          else if ((t = q('[data-who]'))) o.who = t.dataset.who;
          else if ((t = q('[data-person]'))) {
            const u = t.dataset.person;
            if (o.people.has(u)) o.people.delete(u);
            else o.people.add(u);
          } else if ((t = q('[data-kind]'))) {
            const k = t.dataset.kind;
            if (o.kinds.has(k)) o.kinds.size > 1 && o.kinds.delete(k);
            else o.kinds.add(k);
          } else if (q('[data-copytext]')) {
            const ok = await U.copy(asText(groups(gather(o).notes, o), o));
            return U.toast(ok ? L('اتنسخ ✓ — الصقه في أي مكان', 'Copied ✓ — paste it anywhere', 'نُسخ ✓ — الصقه في أي مكان') : L('مقدرتش أنسخ', "Couldn't copy", 'تعذّر النسخ'), ok ? '' : 'warn');
          } else if (q('[data-run]')) return run();
          else return;
          remember();
          redraw();
        });
        const prog = (f, msg) => {
          const p = el.querySelector('#ex-prog');
          if (p) p.innerHTML = f == null ? '' : `${V.bar(f, 'gold')}${msg ? `<small>${msg}</small>` : ''}`;
        };
        const run = async () => {
          if (o.fmt === 'file') {
            api.close();
            return V.download(key);
          }
          const list = gather(o).notes;
          if (!list.length) return;
          busy = true;
          el.classList.add('busy');
          const gs = groups(list, o);
          const base = safeName(key ? info0.title : L('ملاحظاتي', 'my-notes', 'ملاحظاتي'));
          const day = U.today();
          try {
            if (o.fmt === 'text') await saveFile(new Blob([asText(gs, o)], { type: 'text/plain;charset=utf-8' }), `${base} — ${L('ملاحظات', 'notes', 'ملاحظات')} ${day}.txt`);
            else if (o.fmt === 'backup') await saveFile(new Blob([JSON.stringify(asBackup(gs, o))], { type: 'application/json' }), `naqra-sawa — ${base} — ${day}.json`);
            else if (o.fmt === 'pdf') {
              prog(0.02, L('بجهّز الصفحات…', 'Laying out the pages…', 'أجهّز الصفحات…'));
              const blob = await asReport(gs, o, (f) => prog(f, L('بجهّز الصفحات…', 'Laying out the pages…', 'أجهّز الصفحات…')));
              await saveFile(blob, `${base} — ${L('ملاحظات', 'notes', 'ملاحظات')} ${day}.pdf`);
            } else if (o.fmt === 'book') {
              prog(0.02, L('بجيب الكتاب…', 'Fetching the book…', 'أجلب الكتاب…'));
              const r = await asAnnotated(gs[0], (f) => prog(f, f < 0.5 ? L('بجيب الكتاب…', 'Fetching the book…', 'أجلب الكتاب…') : L('بحط الملاحظات في أماكنها…', 'Putting the notes in place…', 'أضع الملاحظات في أماكنها…')), o);
              if (r) {
                for (const f of r.files) await saveFile(f.blob, f.name);
                if (r.skipped) U.toast(L(`${L.count(r.skipped, 'note')} من غير صفحة (زي Kindle) مادخلتش في الكتاب`, `${L.count(r.skipped, 'note')} without a page (like Kindle ones) were left out of the book`, `${L.count(r.skipped, 'note')} دون صفحة (مثل Kindle) لم تدخل في الكتاب`));
              }
            }
            prog(null);
          } catch (er) {
            console.warn('export', er);
            prog(null);
            U.toast(o.fmt === 'book' ? L('مقدرتش أجهّز الكتاب. اتأكد من النت، أو جرّب «PDF مرتّب».', "Couldn't prepare the book. Check your connection, or try «Tidy PDF».", 'تعذّر تجهيز الكتاب. تأكد من الاتصال، أو جرّب «PDF مرتّب».') : L('التصدير ماكملش. جرّب تاني.', 'The export did not finish. Try again.', 'لم يكتمل التصدير. حاول مجددًا.'), 'warn');
          }
          busy = false;
          el.classList.remove('busy');
        };
      },
    });
    return api;
  };

  V.actions['set-backup'] = () => V.exportSheet({ fmt: 'backup' });

  /* ================= import ================= */
  /* Pick a file and see what it is: a backup of ours, or Kindle's clippings. */
  V.importPick = async (opts = {}) => {
    if (!D.canWrite()) return U.toast(L('مش متاح دلوقتي', 'Not available right now', 'غير متاح الآن'), 'warn');
    const f = await pickFile('.json,.txt,application/json,text/plain');
    if (!f) return;
    return V.importFile(f, opts);
  };
  V.importFile = async (f, opts = {}) => {
    let txt = '';
    try {
      txt = await f.text();
    } catch (e) {}
    txt = txt.replace(/^﻿/, '');
    let data = null;
    if (/^\s*\{/.test(txt)) {
      try {
        data = JSON.parse(txt);
      } catch (e) {}
    }
    if (data && data.app === 'naqra-sawa' && data.type === 'notes' && Array.isArray(data.notes)) return backupSheet(data, opts);
    const clips = V.parseKindle(txt);
    if (clips.length) return kindleSheet(clips, opts);
    U.toast(L('الملف ده مش نسخة احتياطية من «نقرأ سوا» ولا ملف اقتباسات Kindle (My Clippings.txt).', 'This file is neither a Read Together backup nor a Kindle clippings file (My Clippings.txt).', 'هذا الملف ليس نسخة احتياطية من «نقرأ سوا» ولا ملف اقتباسات Kindle (My Clippings.txt).'), 'warn');
  };

  /* Signatures of everything already here, per book. */
  function haveSigs() {
    const s = new Set();
    for (const n of S.notes.values()) if (n && n.b) s.add(sig(n.b, n));
    for (const [, n] of Object.entries((S.priv && S.priv.notes) || {})) if (n && n.b) s.add(sig(n.b, n));
    for (const n of S.myNotes.values()) if (n && n.kind !== 'arch') s.add(sig(keyOf(n), n));
    return s;
  }
  /* A book here for a book in a file: same id, same file (fingerprint), else the same title and author. */
  function matchBook(bk, all) {
    if (bk.ext) return null;
    if (bk.id && D.book(bk.id)) return bk.id;
    if (bk.fp) for (const b of all) if (b.fp && b.fp === bk.fp) return b.id;
    const k = A.Imp.key(bk.title, bk.author);
    for (const b of all) if (A.Imp.key(b.title, b.author) === k) return b.id;
    const t = norm(bk.title);
    for (const b of all) if (t && norm(b.title) === t) return b.id;
    return null;
  }
  const allBooks = () => [...S.books.values(), ...S.myBooks.values()];
  const extKey = (title, author) => 'k' + U.hash(A.Imp.key(title, author)).toString(36);

  function backupSheet(data, opts) {
    const books = Array.isArray(data.books) ? data.books : [];
    const all = allBooks();
    const target = new Map(); // backup book key → book id here, or '' (kept as a book from outside)
    for (const bk of books) {
      let id = matchBook(bk, all);
      if (!id && opts.b && books.length === 1 && D.book(opts.b)) id = opts.b; // brought in from that book's ⋯
      target.set(bk.key, id || '');
    }
    if (opts.b && books.length === 1 && D.book(opts.b)) target.set(books[0].key, opts.b);
    const sameCircle = data.circle && A.P.circle && A.P.circle() && data.circle.id === A.P.circle().id;
    // mine: written by me (the same account); a backup someone else made brings everything in as theirs
    const o = { toCircle: true, others: true };
    const plan = () => {
      const have = haveSigs();
      const seen = new Set();
      const out = { circle: [], mine: [], others: [], dup: 0, skipOthers: 0, canCircle: 0 };
      for (const n of data.notes) {
        if (!n || typeof n !== 'object') continue;
        const bk = books.find((x) => x.key === n.key) || { key: n.key, title: n.xt || '', author: n.xa || '', ext: true };
        const to = target.get(bk.key) || '';
        const key = to || 'x:' + (bk.ext && String(bk.key).startsWith('x:') ? String(bk.key).slice(2) : extKey(bk.title, bk.author));
        const s = sig(key, n);
        if (have.has(s) || seen.has(s) || (sameCircle && n.id && S.notes.has(n.id))) {
          out.dup++;
          continue;
        }
        seen.add(s);
        const item = { n, bk, to, key };
        if (ownRec(data, n)) {
          const circleOk = !n.priv && to && !D.isPrivate(to) && S.books.has(to);
          if (circleOk) out.canCircle++;
          if (circleOk && o.toCircle) out.circle.push(item);
          else out.mine.push(item);
        } else if (o.others) out.others.push(item);
        else out.skipOthers++;
      }
      // my headings in these books that aren't here (a line with one already keeps it)
      out.heads = [];
      if (A.Hd && Array.isArray(data.heads) && data.me === S.me)
        for (const h of data.heads) {
          const to = h && h.mine && h.by === data.me ? target.get(h.key) : '';
          if (!to || !D.book(to) || !h.page) continue;
          if (A.Hd.hand(to).some((x) => x.page === h.page && Math.abs((+x.y || 0) - (+h.y || 0)) < 0.02)) continue;
          out.heads.push(Object.assign({ to }, h));
        }
      return out;
    };
    // the switches show only when they change something
    const anyCircle = () => plan().canCircle > 0;
    const anyOthers = () => {
      const p = plan();
      return p.others.length + p.skipOthers > 0;
    };
    const html = () => {
      const p = plan();
      const count = p.circle.length + p.mine.length + p.others.length;
      const nh = p.heads.length;
      return `<div class="imp">
        <p class="imp-from">${icon('download')}<span>${L('نسخة احتياطية', 'A backup', 'نسخة احتياطية')}${data.circle && data.circle.name ? ` ${L('من حلقة', 'from the circle', 'من حلقة')} «${esc(data.circle.name)}»` : ''} • ${esc(L.day(String(data.at || '').slice(0, 10)))}</span></p>
        <ul class="imp-books">${books
          .map((bk) => {
            const to = target.get(bk.key);
            const tb = to ? D.book(to) : null;
            const c = data.notes.filter((n) => n && n.key === bk.key).length;
            const warn = tb && bk.pages && tb.pages && bk.pages !== tb.pages;
            return `<li>${tb ? V.cover(tb, 'xs') : V.genCover(bk.title, bk.author, 'xs')}<div><b dir="auto">${esc(bk.title)}</b><small>${L.count(c, 'note')} • ${tb ? `${L('هتتحط على', 'Goes on', 'ستوضع على')} «${esc(tb.title)}»` : L('مش موجود هنا — هيتحط في دفترك لوحده', 'Not here — it goes into your notebook on its own', 'غير موجود هنا — سيوضع في دفترك وحده')}</small>${warn ? `<small class="warn">${L(`عدد الصفحات مختلف (${L.num(bk.pages)} و${L.num(tb.pages)}) — ممكن الأماكن تتزحزح شوية`, `Different page counts (${bk.pages} and ${tb.pages}) — places may shift a little`, `عدد الصفحات مختلف (${L.num(bk.pages)} و${L.num(tb.pages)}) — قد تنزاح الأماكن قليلًا`)}</small>` : ''}</div></li>`;
          })
          .join('')}</ul>
        ${anyCircle() ? `<label class="ex-sw"><span>${L('ملاحظاتي اللي كانت للحلقة ترجع للحلقة', 'My notes that were the circle’s go back to the circle', 'ملاحظاتي التي كانت للحلقة تعود إلى الحلقة')}<small>${L('لو قفلتها، هتتحفظ ليك بس', 'If off, they are kept just for you', 'إن أغلقته، تُحفظ لك وحدك')}</small></span><span class="switch"><input type="checkbox" data-tocircle ${o.toCircle ? 'checked' : ''}><i></i></span></label>` : ''}
        ${anyOthers() ? `<label class="ex-sw"><span>${L('ملاحظات الناس التانيين كمان', 'Other people’s notes too', 'ملاحظات الآخرين أيضًا')}<small>${L('بأساميهم، ليك بس — محدش في الحلقة هيشوفها', 'With their names, just for you — nobody in the circle sees them', 'بأسمائهم، لك وحدك — لن يراها أحد في الحلقة')}</small></span><span class="switch"><input type="checkbox" data-others ${o.others ? 'checked' : ''}><i></i></span></label>` : ''}
        <p class="ex-count${count || nh ? '' : ' none'}">${count ? L(`هيتضاف ${L.count(count, 'note')}`, `${L.count(count, 'note')} to add`, `ستُضاف ${L.count(count, 'note')}`) : nh ? '' : L('مفيش حاجة جديدة', 'Nothing new', 'لا جديد')}${nh ? `${count ? ' • ' : ''}${L(`${L.num(nh)} ${nh === 1 ? 'عنوان' : 'عناوين'} للفهرس ترجع`, `${nh} heading${nh > 1 ? 's' : ''} back in the contents`, `${L.num(nh)} ${nh === 1 ? 'عنوان' : 'عناوين'} تعود إلى الفهرس`)}` : ''}${p.dup ? `<small>${L(`${L.count(p.dup, 'note')} موجودين أصلًا ومش هيتكرروا`, `${L.count(p.dup, 'note')} already here, not added twice`, `${L.count(p.dup, 'note')} موجودة أصلًا ولن تتكرر`)}</small>` : ''}</p>
        <div class="ex-prog" id="ex-prog"></div>
        <div class="row-btns end"><button type="button" class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button><button type="button" class="btn gold" data-run ${count || nh ? '' : 'disabled'}>${icon('upload')}${L('استورد', 'Import', 'استورد')}</button></div>
      </div>`;
    };
    V.sheet({
      title: `${icon('upload')} ${L('استورد ملاحظات', 'Import notes', 'استورد ملاحظات')}`,
      html: html(),
      onMount: (el, api) => {
        let busy = false;
        el.addEventListener('change', (e) => {
          if (e.target.matches('[data-tocircle]')) o.toCircle = e.target.checked;
          else if (e.target.matches('[data-others]')) o.others = e.target.checked;
          else return;
          V.patch(el, html());
        });
        el.addEventListener('click', async (e) => {
          if (busy || !e.target.closest('[data-run]')) return;
          busy = true;
          const p = plan();
          const prog = (f) => {
            const x = el.querySelector('#ex-prog');
            if (x) x.innerHTML = V.bar(f, 'gold');
          };
          prog(0.02);
          try {
            const n = await restore(data, p, sameCircle, prog);
            api.close();
            U.toast(`✓ ${L(`اتضاف ${L.count(n, 'note')} لدفترك`, `${L.count(n, 'note')} added to your notebook`, `أُضيفت ${L.count(n, 'note')} إلى دفترك`)}`);
            if (V.state.route === 'quotes') V.render();
          } catch (er) {
            console.warn('import', er);
            busy = false;
            prog(0);
            U.toast(L('الاستيراد ماكملش. اتأكد من النت وجرّب تاني — اللي اتضاف مش هيتكرر.', 'The import did not finish. Check your connection and try again — what was added won’t be added twice.', 'لم يكتمل الاستيراد. تأكد من الاتصال وحاول مجددًا — ما أُضيف لن يتكرر.'), 'warn');
          }
        });
      },
    });
  }
  const ownRec = (data, n) => !!(n.mine && n.by && n.by === data.me && data.me === S.me);
  /* Write what the plan says; returns how many notes came in. */
  async function restore(data, p, sameCircle, prog) {
    const entries = [];
    const ids = new Map(); // id in the file → id here
    const wirdOf = (to, n, bk) => {
      const b = D.book(to);
      const ws = portions(b);
      if (!ws.length) return '';
      const old = n.wid && bk.wirds ? bk.wirds.find((w) => w.id === n.wid) : null;
      const w = (old && ws.find((x) => x.n === old.n)) || (n.page ? ws.find((x) => n.page >= x.from && n.page <= x.to) : null);
      return w ? w.id : '';
    };
    const archOfRec = (n, keepMine) => (n.replies || []).filter((r) => r && r.text && (keepMine || r.by !== data.me)).map((r) => ({ n: r.name || '', t: r.text, at: r.at || '' }));
    for (const it of p.circle) {
      const n = it.n;
      const id = D.newId();
      ids.set(n.id, id);
      const doc = V.clean({ b: it.to, page: n.page || null, rect: n.rect || null, kind: n.kind || 'note', color: n.color || '', text: n.text || '', at: n.at || U.nowIso(), by: S.me, crop: n.crop || null, wid: wirdOf(it.to, n, it.bk), likes: {}, replies: {} });
      if (n.edited) doc.edited = n.edited;
      entries.push([`notes/${id}`, doc]);
      // the replies on it (anyone's, mine too) are kept with it, only for me
      const arch = archOfRec(n, true);
      if (arch.length) entries.push([D.myNotePath('a-' + id), { kind: 'arch', of: id, b: it.to, arch, at: U.nowIso() }]);
    }
    for (const it of [...p.mine, ...p.others]) {
      const n = it.n;
      const id = 'i' + D.newId();
      ids.set(n.id, id);
      const doc = { kind: n.kind || 'note', text: n.text || '', at: n.at || U.nowIso(), via: 'backup', by: S.me };
      if (it.to) doc.b = it.to;
      else Object.assign(doc, { xb: it.key.slice(2), xt: it.bk.title || n.xt || '', xa: it.bk.author || n.xa || '' });
      if (n.page) doc.page = n.page;
      if (n.rect) doc.rect = n.rect;
      if (n.color) doc.color = n.color;
      if (n.crop) doc.crop = n.crop;
      if (n.edited) doc.edited = n.edited;
      for (const k of ['loc', 'kpage']) if (n[k]) doc[k] = n[k];
      if (n.via === 'kindle') doc.via = 'kindle';
      if (it.to) doc.wid = wirdOf(it.to, n, it.bk);
      if (!ownRec(data, n)) doc.from = n.name || L('حد من الحلقة', 'Someone from the circle', 'أحد أعضاء الحلقة');
      const arch = archOfRec(n, true);
      if (arch.length) doc.arch = arch;
      entries.push([D.myNotePath(id), V.clean(doc)]);
    }
    // my headings in these books, where there isn't one on that line already
    for (const h of p.heads || []) entries.push([`${A.Hd.col(h.to)}/${D.newId()}`, { b: h.to, page: h.page, y: +h.y || 0, l: U.clamp(+h.l || 1, 1, 4), t: String(h.t || '').slice(0, A.Hd.MAX), by: S.me, at: h.at || U.nowIso() }]);
    await D.setMany(entries, (f) => prog && prog(0.05 + f * 0.9));
    // the stars come back on the notes they were on
    const st = (Array.isArray(data.stars) ? data.stars : []).map((x) => ids.get(x) || (sameCircle && S.notes.has(x) ? x : null)).filter(Boolean);
    if (st.length)
      await D.privUpdate((cur) => {
        const s = Object.assign({}, cur.stars);
        for (const x of st) s[x] = s[x] || U.nowIso();
        return Object.assign(cur, { stars: s });
      }).catch(() => {});
    if (prog) prog(1);
    return p.circle.length + p.mine.length + p.others.length;
  }

  /* ---------- Kindle «My Clippings.txt» ---------- */
  /* Entries are cut by a line of ten «=»: the title (author), a line «- Your Highlight on page 12 | Location
     120-123 | Added on …» (in the Kindle's language), an empty line, then the words. Bookmarks are left out;
     a highlight edited later shows up again at the same place: the longer one is kept. */
  V.parseKindle = (txt) => {
    const out = [];
    const ents = String(txt || '').replace(/\r/g, '').split(/\n?={8,}\s*\n?/);
    for (const e of ents) {
      const ls = e.replace(/^﻿/, '').split('\n');
      while (ls.length && !ls[0].trim()) ls.shift();
      if (ls.length < 2) continue;
      const head = ls[0].trim();
      const meta = ls[1].trim();
      if (!/^-\s/.test(meta)) continue;
      const text = ls.slice(2).join('\n').trim();
      if (/bookmark|lesezeichen|signet|marcador|segnalibro|bladwijzer|закладка|ブックマーク|书签|علامة/i.test(meta)) continue;
      const kind = /\bnote\b|notiz|remarque|\bnota\b|notitie|заметка|メモ|笔记|ملاحظة/i.test(meta) ? 'note' : 'quote';
      if (!text) continue;
      let title = head, author = '';
      const m = head.match(/^(.*)\(([^()]*)\)\s*$/);
      if (m && m[1].trim()) {
        title = m[1].trim();
        author = m[2].trim();
      }
      const parts = meta.replace(/^-\s*/, '').split('|').map((x) => x.trim());
      let kpage = 0, loc = '', at = '';
      for (const p of parts) {
        const num = p.match(/(\d+)(?:\s*-\s*(\d+))?/);
        if (/page|seite|página|pagina|pagine|страниц|ページ|页|صفحة/i.test(p) && num) kpage = +num[1];
        else if (/location|loc\.|position|emplacement|posición|posizione|positie|позиция|位置|موقع/i.test(p) && num) loc = num[2] ? `${num[1]}-${num[2]}` : num[1];
        else if (/added|hinzugefügt|ajouté|añadido|aggiunto|toegevoegd|добавлено|追加|添加|أضيف/i.test(p)) {
          const d = Date.parse(p.replace(/^[^,]*?(on|am|le|el|il|op)\s+/i, '').replace(/^[^,]+,\s*/, ''));
          if (!isNaN(d)) at = new Date(d).toISOString();
        }
      }
      if (!loc && !kpage) {
        const num = parts[0] && parts[0].match(/(\d+)(?:\s*-\s*(\d+))?/);
        if (num) loc = num[2] ? `${num[1]}-${num[2]}` : num[1];
      }
      out.push({ title, author, kind, text, kpage, loc, at });
    }
    // an edited highlight: same book and start, one text inside the other → keep the longer
    const keep = [];
    for (const c of out) {
      const start = parseInt(c.loc, 10) || 0;
      const i = keep.findIndex((k) => k.title === c.title && k.kind === c.kind && (parseInt(k.loc, 10) || 0) === start && start && (k.text.includes(c.text) || c.text.includes(k.text)));
      if (i < 0) keep.push(c);
      else if (c.text.length > keep[i].text.length) keep[i] = c;
    }
    return keep;
  };
  function kindleSheet(clips, opts) {
    const all = allBooks();
    const books = new Map();
    for (const c of clips) {
      const k = A.Imp.key(c.title, c.author);
      if (!books.has(k)) books.set(k, { k, title: c.title, author: c.author, items: [], on: true, match: null });
      books.get(k).items.push(c);
    }
    for (const b of books.values()) b.match = matchBook({ title: b.title, author: b.author }, all);
    if (opts.b && books.size === 1 && D.book(opts.b)) [...books.values()][0].match = opts.b;
    const plan = () => {
      const have = haveSigs();
      const out = [];
      let dup = 0;
      for (const b of books.values()) {
        if (!b.on) continue;
        const xb = extKey(b.title, b.author);
        for (const c of b.items) {
          const key = b.match || 'x:' + xb;
          const n = { kind: c.kind, text: c.text, loc: c.loc };
          if (have.has(sig(key, n))) {
            dup++;
            continue;
          }
          have.add(sig(key, n));
          out.push({ b, c, xb });
        }
      }
      return { out, dup };
    };
    const html = () => {
      const p = plan();
      return `<div class="imp">
        <p class="imp-from">${icon('books')}<span>${L(`ملف Kindle فيه ${L.count(clips.length, 'note')} من ${L.count(books.size, 'book')}`, `A Kindle file with ${L.count(clips.length, 'note')} from ${L.count(books.size, 'book')}`, `ملف Kindle فيه ${L.count(clips.length, 'note')} من ${L.count(books.size, 'book')}`)}</span></p>
        <ul class="imp-books kin">${[...books.values()]
          .map((b) => {
            const q = b.items.filter((c) => c.kind === 'quote').length, nn = b.items.length - q;
            const tb = b.match ? D.book(b.match) : null;
            return `<li><label class="imp-pick"><input type="checkbox" data-kb="${esc(b.k)}" ${b.on ? 'checked' : ''}>${tb ? V.cover(tb, 'xs') : V.genCover(b.title, b.author, 'xs')}<div><b dir="auto">${esc(b.title)}</b><small>${[q ? `${L.num(q)} ${L('اقتباس', 'quotes', 'اقتباس')}` : '', nn ? `${L.num(nn)} ${L('ملاحظة', 'notes', 'ملاحظة')}` : ''].filter(Boolean).join(' • ')}${b.author ? ` • <span dir="auto">${esc(b.author)}</span>` : ''}</small>${tb ? `<small class="ok">${icon('check')}${L('على كتاب عندنا', 'On a book we have', 'على كتاب لدينا')}: «${esc(tb.title)}»</small>` : ''}</div></label></li>`;
          })
          .join('')}</ul>
        <p class="ex-count${p.out.length ? '' : ' none'}">${p.out.length ? L(`هيتضاف ${L.count(p.out.length, 'note')} لدفترك (ليك بس)`, `${L.count(p.out.length, 'note')} go into your notebook (just for you)`, `ستُضاف ${L.count(p.out.length, 'note')} إلى دفترك (لك وحدك)`) : L('مفيش حاجة جديدة', 'Nothing new', 'لا جديد')}${p.dup ? `<small>${L(`${L.count(p.dup, 'note')} موجودين أصلًا`, `${L.count(p.dup, 'note')} already here`, `${L.count(p.dup, 'note')} موجودة أصلًا`)}</small>` : ''}</p>
        <div class="ex-prog" id="ex-prog"></div>
        <div class="row-btns end"><button type="button" class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button><button type="button" class="btn gold" data-run ${p.out.length ? '' : 'disabled'}>${icon('upload')}${L('ضيفهم', 'Add them', 'أضفها')}</button></div>
      </div>`;
    };
    V.sheet({
      title: `${icon('upload')} ${L('اقتباسات Kindle', 'Kindle highlights', 'اقتباسات Kindle')}`,
      html: html(),
      onMount: (el, api) => {
        let busy = false;
        el.addEventListener('change', (e) => {
          const k = e.target.dataset && e.target.dataset.kb;
          if (k == null || !books.has(k)) return;
          books.get(k).on = e.target.checked;
          V.patch(el, html());
        });
        el.addEventListener('click', async (e) => {
          if (busy || !e.target.closest('[data-run]')) return;
          busy = true;
          const { out } = plan();
          const now = U.nowIso();
          const entries = out.map(({ b, c, xb }) => {
            const doc = { kind: c.kind, text: c.text, at: c.at || now, via: 'kindle', by: S.me, xb, xt: b.title, xa: b.author };
            if (b.match) doc.b = b.match;
            if (c.loc) doc.loc = c.loc;
            if (c.kpage) doc.kpage = c.kpage;
            return [D.myNotePath('k' + D.newId()), doc];
          });
          try {
            await D.setMany(entries, (f) => {
              const x = el.querySelector('#ex-prog');
              if (x) x.innerHTML = V.bar(f, 'gold');
            });
            api.close();
            U.toast(`✓ ${L(`اتضاف ${L.count(entries.length, 'note')} لدفترك`, `${L.count(entries.length, 'note')} added to your notebook`, `أُضيفت ${L.count(entries.length, 'note')} إلى دفترك`)}`);
            if (V.state.route === 'quotes') V.render();
            else V.go('quotes', { v: 'books' });
          } catch (er) {
            console.warn('kindle', er);
            busy = false;
            U.toast(L('ماتضافوش. اتأكد من النت وجرّب تاني.', 'Not added. Check your connection and try again.', 'لم تُضف. تأكد من الاتصال وحاول مجددًا.'), 'warn');
          }
        });
      },
    });
  }

  // for the tests
  A.Export = { gather, groups, asText, asBackup, asReport, asAnnotated, asMemory, sig };
})();
