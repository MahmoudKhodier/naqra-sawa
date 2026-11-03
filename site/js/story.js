/* A note as pictures to share: a phone story (1080×1920) or a square (1080×1080), on warm paper, at night, or in
   the colours of the book's cover. The words fill the picture as large as they fit; a long note goes on to a
   second picture and more (six at most, «١/٣» on each). A highlight with words shows the highlighted passage
   on top and the words under it. A few switches (the highlight, the words, my name, the book and page, the
   cover) and «اختار جزء» to keep only part of the words; the choices are remembered on this phone.
   From a note's sheet or its card: «شارك كصورة». */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, D, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const SIZES = { story: [1080, 1920], square: [1080, 1080] };
  const MAX_PAGES = 6;

  const PAPER = { bg: '#f7f1e3', ink: '#1d1a14', ink2: '#6b6352', gold: '#d9a22b', frame: 'rgba(29,26,20,.12)', faint: 'rgba(217,162,43,.07)', glow: ['rgba(217,162,43,.30)', 'rgba(36,64,160,.16)'], pillInk: '#2a1a00', card: '#fffdf8' };
  const NIGHT = { bg: '#141a33', ink: '#f4ecda', ink2: '#a9a4c0', gold: '#e8b84a', frame: 'rgba(255,255,255,.12)', faint: 'rgba(232,184,74,.08)', glow: ['rgba(232,184,74,.18)', 'rgba(90,120,255,.22)'], pillInk: '#2a1a00', card: '#fffdf8' };
  /* The cover's average colour (null when the picture can't be read). */
  const coverCache = new Map();
  async function coverColour(src) {
    if (!src) return null;
    if (coverCache.has(src)) return coverCache.get(src);
    const img = await V.cardKit.loadImg(src);
    let rgb = null;
    if (img)
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 12;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 12, 12);
        const d = x.getImageData(0, 0, 12, 12).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]);
        const k = d.length / 4;
        rgb = [r / k, g / k, b / k];
      } catch (e) {} // a picture from elsewhere that the browser won't let us read
    coverCache.set(src, rgb);
    return rgb;
  }
  async function themeOf(name, book) {
    if (name === 'night') return NIGHT;
    if (name !== 'cover') return PAPER;
    const rgb = (await coverColour(book.cover)) || [35, 52, 122];
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    // deepen a light cover so the words stay readable on it, or lighten the ink on a dark one
    const k = lum > 0.62 ? 0.82 : 1;
    const bg = `rgb(${rgb.map((v) => Math.round(v * k)).join(',')})`;
    const light = lum * k > 0.55;
    return Object.assign({}, light ? PAPER : NIGHT, { bg, glow: ['rgba(255,255,255,.18)', 'rgba(0,0,0,.18)'], faint: light ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)' });
  }

  /* Lines of at most maxW pixels, the note's own line breaks kept (an empty line stays as a gap). */
  function lines(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split(/\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (out.length && out[out.length - 1] !== '') out.push('');
        continue;
      }
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW || !cur) cur = t;
        else {
          out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }

  V.storyDefaults = () => Object.assign({ size: 'story', theme: 'paper', name: true, meta: true, cover: false }, U.store.get('storyOpts', {}));

  /* The pictures for a note (one or more PNG blobs). o: size, theme, name, meta, cover, crop, words, text. */
  V.storyCards = async (n, o = {}) => {
    o = Object.assign(V.storyDefaults(), { crop: true, words: true }, o);
    if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
    const { roundRect, star, loadImg } = V.cardKit;
    const book = D.book(n.b) || {};
    const [W, H] = SIZES[o.size] || SIZES.story;
    const sq = o.size === 'square';
    const T = await themeOf(o.theme, book);
    const text = o.words ? String(o.text != null ? o.text : n.text || '').trim() : '';
    const cropImg = o.crop && n.crop ? await loadImg(n.crop) : null;
    const coverImg = o.cover && book.cover ? await loadImg(book.cover) : null;
    const disp = (px, w = 700) => `${w} ${px}px "Readex Pro", "Amiri", system-ui, sans-serif`;
    const bookFont = (px, w = 400) => `${w} ${px}px "Amiri", "Noto Naskh Arabic", serif`;
    const rtl = /[؀-ۿ]/.test(text || book.title || '') || L.isAr();
    // where things go
    const Y = sq
      ? { star: 92, name: 160, top: 210, bottom: H - (o.meta ? 300 : 170), title: H - 250, sub: H - 196, chosen: H - 156, pill: H - 122, pillH: 70 }
      : { star: 190, name: 290, top: 400, bottom: H - (o.meta ? 520 : 300), title: H - 420, sub: H - 290, chosen: H - 236, pill: H - 190, pillH: 92 };
    if (!sq && coverImg && o.meta) Y.bottom -= 170;
    const textW = W - (sq ? 200 : 240);
    const probe = document.createElement('canvas').getContext('2d');

    // the passage on the first picture, and how tall it is
    let cropBox = null;
    if (cropImg) {
      const maxH = text ? (Y.bottom - Y.top) * (sq ? 0.42 : 0.45) : Y.bottom - Y.top;
      const k = Math.min((W - 200) / cropImg.width, maxH / cropImg.height, 3);
      cropBox = { w: cropImg.width * k, h: cropImg.height * k };
    }
    // the words: as big as they fit on one picture, else at a readable size over several
    const room1 = Y.bottom - Y.top - 120 - (cropBox ? cropBox.h + 70 : 0);
    const roomN = Y.bottom - Y.top - 60;
    let size = sq ? 64 : 84, ls = [];
    const minOne = sq ? 38 : 46; // smaller than this goes on to another picture instead
    if (text) {
      for (; size >= minOne; size -= 4) {
        probe.font = bookFont(size);
        ls = lines(probe, text, textW);
        if (ls.length * size * 1.55 <= room1) break;
      }
      if (size < minOne) {
        size = minOne;
        probe.font = bookFont(size);
        ls = lines(probe, text, textW);
      }
    }
    const lh = size * 1.55;
    const pages = [];
    if (text) {
      let i = 0;
      const per1 = Math.max(1, Math.floor(room1 / lh)), perN = Math.max(1, Math.floor(roomN / lh));
      while (i < ls.length && pages.length < MAX_PAGES) {
        const take = pages.length ? perN : per1;
        let chunk = ls.slice(i, i + take);
        i += take;
        while (chunk.length && chunk[0] === '') chunk.shift();
        if (pages.length === MAX_PAGES - 1 && i < ls.length) chunk[chunk.length - 1] = chunk[chunk.length - 1].replace(/\s*\S*$/, '') + '…';
        if (chunk.length || !pages.length) pages.push(chunk);
      }
    }
    if (!pages.length) pages.push([]);

    const blobs = [];
    for (let pi = 0; pi < pages.length; pi++) {
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, c] of [[W * 0.85, H * 0.08, T.glow[0]], [W * 0.1, H * 0.92, T.glow[1]]]) {
        const g = ctx.createRadialGradient(x, y, 40, x, y, W * 0.9);
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      star(ctx, W / 2, H * 0.45, sq ? 300 : 430, T.faint);
      ctx.strokeStyle = T.frame;
      ctx.lineWidth = 3;
      roundRect(ctx, 44, 44, W - 88, H - 88, sq ? 44 : 56);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.direction = rtl ? 'rtl' : 'ltr';
      // the app at the top
      star(ctx, W / 2, Y.star, sq ? 32 : 44, T.gold);
      ctx.fillStyle = T.ink;
      ctx.font = disp(sq ? 32 : 40);
      ctx.fillText(L('نقرأ سوا', 'Read Together'), W / 2, Y.name);
      if (pages.length > 1) {
        // «١/٣» in a corner
        const tag = `${L.num(pi + 1)}/${L.num(pages.length)}`;
        ctx.font = disp(sq ? 28 : 34, 700);
        const tw = ctx.measureText(tag).width + 40;
        const tx = rtl ? 90 : W - 90 - tw;
        ctx.fillStyle = T.gold;
        roundRect(ctx, tx, sq ? 70 : 90, tw, sq ? 48 : 58, 29);
        ctx.fill();
        ctx.fillStyle = T.pillInk;
        ctx.fillText(tag, tx + tw / 2, (sq ? 70 : 90) + (sq ? 34 : 41));
      }
      let y = Y.top;
      const chunk = pages[pi];
      const blockH = chunk.reduce((h, ln) => h + (ln === '' ? lh * 0.5 : lh), 0);
      const lead = pi === 0 && chunk.length ? 60 : 0; // the big «
      const cropH = pi === 0 && cropBox ? cropBox.h + (chunk.length ? 70 : 0) : 0;
      const all = cropH + lead + blockH;
      y = Y.top + Math.max(0, (Y.bottom - Y.top - all) / 2);
      if (pi === 0 && cropBox) {
        const x = (W - cropBox.w) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.18)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 14;
        roundRect(ctx, x - 24, y - 24, cropBox.w + 48, cropBox.h + 48, 28);
        ctx.fillStyle = T.card;
        ctx.fill();
        ctx.restore();
        ctx.drawImage(cropImg, x, y, cropBox.w, cropBox.h);
        ctx.fillStyle = U.col(n.color, T.gold);
        ctx.fillRect(rtl ? x + cropBox.w + 12 : x - 20, y - 8, 8, cropBox.h + 16);
        y += cropH;
      }
      if (chunk.length) {
        if (lead) {
          ctx.fillStyle = T.gold;
          ctx.font = disp(sq ? 110 : 150, 700);
          ctx.fillText('«', W / 2, y + 40);
          y += lead;
        }
        ctx.fillStyle = T.ink;
        ctx.font = bookFont(size);
        for (const ln of chunk) {
          if (ln === '') {
            y += lh * 0.5;
            continue;
          }
          ctx.fillText(ln, W / 2, y + size * 0.95);
          y += lh;
        }
      }
      // the book, the page, who chose it
      if (o.meta) {
        if (coverImg) {
          const cw = sq ? 64 : 100, ch = cw * 1.45;
          const cx = sq ? (rtl ? W - 80 - cw : 80) : (W - cw) / 2;
          const cy = sq ? Y.title - 60 : Y.title - ch - 70;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.25)';
          ctx.shadowBlur = 18;
          ctx.drawImage(coverImg, cx, cy, cw, ch);
          ctx.restore();
        }
        ctx.fillStyle = T.ink;
        ctx.font = disp(sq ? 42 : 52);
        V.cardKit.wrap(ctx, book.title || '', W - (sq ? 320 : 220), sq ? 1 : 2).forEach((ln, i) => ctx.fillText(ln, W / 2, Y.title + i * 64));
        ctx.fillStyle = T.ink2;
        ctx.font = disp(sq ? 30 : 36, 500);
        const sub = [book.author, n.page ? L(`ص ${L.num(n.page)}`, `p. ${n.page}`) : ''].filter(Boolean).join(' • ');
        if (sub) ctx.fillText(sub, W / 2, Y.sub);
      }
      if (o.name) {
        ctx.fillStyle = T.ink2;
        ctx.font = disp(sq ? 26 : 32, 500);
        ctx.fillText(L(`اختيار ${D.name(n.by)}`, `Chosen by ${D.name(n.by)}`, `اختيار ${D.name(n.by)}`), W / 2, o.meta ? Y.chosen : Y.pill - 30);
      }
      // the invitation at the bottom
      ctx.fillStyle = T.gold;
      roundRect(ctx, W / 2 - (sq ? 250 : 300), Y.pill, sq ? 500 : 600, Y.pillH, Y.pillH / 2);
      ctx.fill();
      ctx.fillStyle = T.pillInk;
      ctx.font = disp(sq ? 30 : 36);
      ctx.fillText(L('بنقراه سوا 📚', "We're reading it together 📚", 'نقرؤه معًا 📚'), W / 2, Y.pill + Y.pillH * 0.65);
      blobs.push(await new Promise((res) => cv.toBlob((b) => res(b), 'image/png')));
    }
    return blobs;
  };
  /* One picture (the first), as before. */
  V.storyCard = async (n, o) => (await V.storyCards(n, o))[0];

  /* The sheet: the pictures (slide across when there are several), the size and the look right under them, and
     the rest folded away under «خيارات تانية». */
  V.storySheet = (n) => {
    let urls = [];
    let gen = 0;
    const book = D.book(n.b) || {};
    const o = Object.assign(V.storyDefaults(), { crop: true, words: true, text: null });
    const hasCrop = !!n.crop, hasText = !!(n.text && String(n.text).trim());
    // the words as sentences (a paragraph break remembered), to keep only some of them
    const parts = [];
    String(n.text || '').split(/\n/).forEach((para, pi) => {
      const ss = para.match(/[^.!؟?…]+[.!؟?…]*\s*/g) || [];
      ss.map((x) => x.trim()).filter(Boolean).forEach((t, k) => parts.push({ t, br: pi > 0 && k === 0 }));
    });
    const keep = new Set(parts.map((_, i) => i));
    const partsText = () => parts.filter((_, i) => keep.has(i)).map((pt, i) => (i && pt.br ? '\n' : i ? ' ' : '') + pt.t).join('');
    const sw = (k, on, t) => `<label class="st-sw"><input type="checkbox" data-o="${k}" ${on ? 'checked' : ''}><span>${t}</span></label>`;
    const api = V.sheet({
      title: L('شارك كصورة', 'Share as a picture', 'شارك كصورة'),
      html: `<div class="story-prev no-swipe" id="story-prev"><div class="inv-ph"></div></div>
        <p class="st-n muted sm" id="st-n" hidden></p>
        <div class="st-quick">
          <div class="seg sm" role="group" aria-label="${L('المقاس', 'Size', 'المقاس')}"><button data-size="story" class="${o.size === 'story' ? 'on' : ''}">${L('ستوري', 'Story', 'قصة')}</button><button data-size="square" class="${o.size === 'square' ? 'on' : ''}">${L('مربعة', 'Square', 'مربعة')}</button></div>
          <div class="st-themes" role="group" aria-label="${L('الشكل', 'Look', 'الشكل')}">${[['paper', '#f7f1e3', L('ورق', 'Paper', 'ورق')], ['night', '#141a33', L('ليلي', 'Night', 'ليلي')], ['cover', 'linear-gradient(135deg,#d9a22b,#23347a)', L('ألوان الغلاف', 'Cover colours', 'ألوان الغلاف')]].map(([k, c, t]) => `<button class="st-th${o.theme === k ? ' on' : ''}" data-st-theme="${k}" style="--c:${c}" aria-label="${t}" title="${t}"></button>`).join('')}</div>
        </div>
        <details class="st-more"><summary>${icon('gear')}${L('خيارات تانية', 'More options', 'خيارات أخرى')}</summary>
          <div class="st-sws">${hasCrop && hasText ? sw('crop', o.crop, L('الجزء المظلّل', 'The highlight', 'الجزء المظلّل')) + sw('words', o.words, L('كلامي', 'My words', 'كلماتي')) : ''}${sw('name', o.name, L('اسمي', 'My name', 'اسمي'))}${sw('meta', o.meta, L('الكتاب والصفحة', 'Book and page', 'الكتاب والصفحة'))}${book.cover ? sw('cover', o.cover, L('صورة الغلاف', 'The cover', 'صورة الغلاف')) : ''}</div>
          ${parts.length > 1 ? `<button type="button" class="lnk sm" data-trim aria-expanded="false">${icon('edit')}${L('اختار جزء من الكلام', 'Use only part of the words', 'اختر جزءًا من الكلام')}</button>
          <div class="st-trim" hidden><small class="muted">${L('دوس على الجمل اللي مش عايزها تتشال من الصورة — ودوس تاني ترجع.', 'Tap the sentences you don’t want to leave them out — tap again to bring them back.', 'المس الجمل التي لا تريدها لتُستبعد — والمس مجددًا لإعادتها.')}</small>
            <div class="st-parts">${parts.map((pt, i) => `<button type="button" class="st-part on" data-part="${i}" aria-pressed="true" dir="auto">${esc(pt.t)}</button>`).join('')}</div>
            <div class="row-btns"><button type="button" class="btn ghost sm" data-parts="all">${L('الكلام كله', 'All of it', 'النص كله')}</button></div></div>` : ''}
        </details>
        <div class="row-btns center"><button class="btn gold" data-story-share>${icon('share')}<span>${L('شارك', 'Share')}</span></button></div>`,
      onMount: (body) => {
        const remember = () => U.store.set('storyOpts', { size: o.size, theme: o.theme, name: o.name, meta: o.meta, cover: o.cover });
        const draw = async () => {
          const g = ++gen;
          const box = body.querySelector('#story-prev');
          box.classList.add('busy');
          const blobs = await V.storyCards(n, o);
          if (g !== gen || api.closed) return;
          urls.forEach((u) => URL.revokeObjectURL(u));
          urls = blobs.map((b) => URL.createObjectURL(b));
          box.classList.remove('busy');
          box.classList.toggle('sq', o.size === 'square');
          box.innerHTML = urls.map((u, i) => `<img src="${u}" alt="${esc(L(`صورة ${L.num(i + 1)}`, `Picture ${i + 1}`, `صورة ${L.num(i + 1)}`))}">`).join('');
          const cnt = body.querySelector('#st-n');
          cnt.hidden = urls.length < 2;
          cnt.textContent = L(`${L.count(urls.length, 'picture')} — اسحب عشان تشوفهم`, `${urls.length} pictures — swipe to see them`, `${L.count(urls.length, 'picture')} — اسحب لتراها`);
          api.blobs = blobs;
        };
        draw();
        const redraw = U.debounce(draw, 350);
        body.addEventListener('click', async (e) => {
          const s = e.target.closest('[data-size]');
          if (s) {
            o.size = s.dataset.size;
            body.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b === s));
            remember();
            return draw();
          }
          const t = e.target.closest('[data-st-theme]');
          if (t) {
            o.theme = t.dataset.stTheme;
            body.querySelectorAll('[data-st-theme]').forEach((b) => b.classList.toggle('on', b === t));
            remember();
            return draw();
          }
          if (e.target.closest('[data-trim]')) {
            const tr = body.querySelector('.st-trim');
            tr.hidden = !tr.hidden;
            e.target.closest('[data-trim]').setAttribute('aria-expanded', String(!tr.hidden));
            return;
          }
          const part = e.target.closest('[data-part]');
          if (part) {
            const i = +part.dataset.part;
            if (keep.has(i) && keep.size === 1) return U.toast(L('لازم تفضل جملة واحدة على الأقل', 'Keep at least one sentence', 'أبقِ جملة واحدة على الأقل'));
            keep.has(i) ? keep.delete(i) : keep.add(i);
            part.classList.toggle('on', keep.has(i));
            part.setAttribute('aria-pressed', String(keep.has(i)));
            o.text = keep.size === parts.length ? null : partsText();
            return redraw();
          }
          if (e.target.closest('[data-parts="all"]')) {
            parts.forEach((_, i) => keep.add(i));
            body.querySelectorAll('[data-part]').forEach((b) => (b.classList.add('on'), b.setAttribute('aria-pressed', 'true')));
            o.text = null;
            return draw();
          }
          if (!e.target.closest('[data-story-share]')) return;
          try {
            const blobs = api.blobs || (await V.storyCards(n, o));
            await V.sharePicture(blobs, 'naqra-sawa-quote.png', L(`من «${book.title || ''}» — بنقراه سوا 📚`, `From “${book.title || ''}” — we're reading it together 📚`, `من «${book.title || ''}» — نقرؤه معًا 📚`), L('شارك الاقتباس', 'Share the quote', 'شارك الاقتباس'));
          } catch (er) {
            if (er && er.name !== 'AbortError') console.warn('story', er);
          }
        });
        body.addEventListener('change', (e) => {
          const k = e.target.dataset && e.target.dataset.o;
          if (!k) return;
          o[k] = e.target.checked;
          if (!o.crop && !o.words) {
            // one of the two stays
            o[k === 'crop' ? 'words' : 'crop'] = true;
            const other = body.querySelector(`[data-o="${k === 'crop' ? 'words' : 'crop'}"]`);
            if (other) other.checked = true;
          }
          if (['name', 'meta', 'cover'].includes(k)) remember();
          draw();
        });
      },
    });
    api.onClose = () => urls.forEach((u) => URL.revokeObjectURL(u));
  };
})();
