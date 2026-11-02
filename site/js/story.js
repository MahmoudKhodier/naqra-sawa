/* A highlight or quote as a picture the size of a phone story (1080×1920): the words (or the highlighted
   passage itself), the book and the page, and the app's name. From the note's sheet: «شارك كصورة». */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V } = A;
  const esc = U.esc;
  const icon = U.icon;
  const W = 1080, H = 1920;

  V.storyCard = async (n) => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
    const { roundRect, star, wrap, loadImg } = V.cardKit;
    const book = D.book(n.b) || {};
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const ink = '#1d1a14', ink2 = '#6b6352', gold = '#d9a22b', paper = '#f7f1e3';
    const disp = (px, w = 700) => `${w} ${px}px "Readex Pro", "Amiri", system-ui, sans-serif`;
    const bookFont = (px, w = 400) => `${w} ${px}px "Amiri", "Noto Naskh Arabic", serif`;
    // warm paper, a glow in two corners, a big faint star behind the words
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, c] of [[W * 0.85, H * 0.08, 'rgba(217,162,43,.30)'], [W * 0.1, H * 0.92, 'rgba(36,64,160,.16)']]) {
      const g = ctx.createRadialGradient(x, y, 40, x, y, W * 0.9);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    star(ctx, W / 2, H * 0.45, 430, 'rgba(217,162,43,.07)');
    ctx.strokeStyle = 'rgba(29,26,20,.12)';
    ctx.lineWidth = 3;
    roundRect(ctx, 44, 44, W - 88, H - 88, 56);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.direction = /[؀-ۿ]/.test(n.text || book.title || '') || L.isAr() ? 'rtl' : 'ltr';
    // the app at the top
    star(ctx, W / 2, 190, 44, gold);
    ctx.fillStyle = ink;
    ctx.font = disp(40);
    ctx.fillText(L('نقرأ سوا', 'Read Together'), W / 2, 290);
    // the words, as big as they fit; or the highlighted passage as a picture
    const top = 400, bottom = H - 520;
    let y;
    if (n.text && String(n.text).trim()) {
      const text = String(n.text).trim();
      let size = 84, lines;
      for (; size >= 44; size -= 4) {
        ctx.font = bookFont(size);
        lines = wrap(ctx, text, W - 240, 40);
        if (lines.length * size * 1.55 <= bottom - top - 160) break;
      }
      ctx.font = bookFont(size);
      lines = wrap(ctx, text, W - 240, Math.floor((bottom - top - 160) / (size * 1.55)));
      const lh = size * 1.55;
      const blockH = lines.length * lh;
      y = top + (bottom - top - blockH) / 2;
      ctx.fillStyle = gold;
      ctx.font = disp(150, 700);
      ctx.fillText('«', W / 2, y - 10);
      ctx.fillStyle = ink;
      ctx.font = bookFont(size);
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2, y + 60 + i * lh + size * 0.35));
      y += 60 + blockH;
    } else if (n.crop) {
      const img = await loadImg(n.crop);
      if (img) {
        const maxW = W - 200, maxH = bottom - top;
        const k = Math.min(maxW / img.width, maxH / img.height, 3);
        const iw = img.width * k, ih = img.height * k;
        const x = (W - iw) / 2;
        y = top + (maxH - ih) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.18)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 14;
        roundRect(ctx, x - 24, y - 24, iw + 48, ih + 48, 28);
        ctx.fillStyle = '#fffdf8';
        ctx.fill();
        ctx.restore();
        ctx.drawImage(img, x, y, iw, ih);
        ctx.fillStyle = U.col(n.color, gold);
        ctx.fillRect(ctx.direction === 'rtl' ? x + iw + 12 : x - 20, y - 8, 8, ih + 16);
        y += ih + 40;
      }
    }
    // the book, the page, who chose it
    ctx.fillStyle = ink;
    ctx.font = disp(52);
    wrap(ctx, book.title || '', W - 220, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, H - 420 + i * 64));
    ctx.fillStyle = ink2;
    ctx.font = disp(36, 500);
    const sub = [book.author, n.page ? L(`ص ${L.num(n.page)}`, `p. ${n.page}`) : ''].filter(Boolean).join(' • ');
    if (sub) ctx.fillText(sub, W / 2, H - 290);
    ctx.font = disp(32, 500);
    ctx.fillText(L(`اختيار ${D.name(n.by)}`, `Chosen by ${D.name(n.by)}`, `اختيار ${D.name(n.by)}`), W / 2, H - 236);
    // the invitation at the bottom
    ctx.fillStyle = gold;
    roundRect(ctx, W / 2 - 300, H - 190, 600, 92, 46);
    ctx.fill();
    ctx.fillStyle = '#2a1a00';
    ctx.font = disp(36);
    ctx.fillText(L('بنقراه سوا 📚', "We're reading it together 📚", 'نقرؤه معًا 📚'), W / 2, H - 130);
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  };

  /* The preview sheet with share / save. */
  V.storySheet = (n) => {
    let url = null;
    const book = D.book(n.b) || {};
    const api = V.sheet({
      title: L('شارك كصورة', 'Share as a picture', 'شارك كصورة'),
      html: `<div class="story-prev" id="story-prev"><div class="inv-ph"></div></div>
        <div class="row-btns center"><button class="btn gold" data-story-share>${icon('share')}${L('شارك', 'Share')}</button></div>`,
      onMount: (body) => {
        V.storyCard(n).then((blob) => {
          if (!blob || api.closed) return;
          url = URL.createObjectURL(blob);
          const box = body.querySelector('#story-prev');
          if (box) box.innerHTML = `<img src="${url}" alt="${esc(L('صورة الاقتباس', 'Quote picture', 'صورة الاقتباس'))}">`;
        });
        body.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-story-share]')) return;
          try {
            const blob = await V.storyCard(n);
            await V.sharePicture(blob, 'naqra-sawa-quote.png', L(`من «${book.title || ''}» — بنقراه سوا 📚`, `From “${book.title || ''}” — we're reading it together 📚`, `من «${book.title || ''}» — نقرؤه معًا 📚`), L('شارك الاقتباس', 'Share the quote', 'شارك الاقتباس'));
          } catch (er) {
            if (er && er.name !== 'AbortError') console.warn('story', er);
          }
        });
      },
    });
    api.onClose = () => url && URL.revokeObjectURL(url);
  };
})();
