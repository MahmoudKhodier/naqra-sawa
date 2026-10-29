/* Inviting someone: the link plus a picture card (the circle's name, the book we're reading, how many we are)
   that WhatsApp and the like show with the message. Replaces the plain invite sheet in auth.js. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, P } = A;
  const esc = U.esc;
  const icon = U.icon;

  const W = 1080, H = 1080;
  const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
  const loadImg = (src) =>
    new Promise((res) => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
      setTimeout(() => res(null), 4000);
    });
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function star(ctx, cx, cy, r, fill) {
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8 - Math.PI / 2;
      const rr = k % 2 ? r * 0.72 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  /* Lines of at most maxW pixels (words kept whole), at most n lines, the last one with … if cut. */
  function wrap(ctx, text, maxW, n) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > n) {
      lines.length = n;
      lines[n - 1] = lines[n - 1].replace(/\s*\S*$/, '') + '…';
    }
    return lines;
  }
  const currentBook = () => {
    const reading = [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading').sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    return reading[0] || null;
  };

  /* The card as a PNG blob. */
  V.inviteCard = async (c) => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
    const book = currentBook();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const rtl = L.isAr();
    const ink = '#1d1a14', ink2 = '#6b6352', gold = '#d9a22b', lapis = '#2440a0', paper = '#f7f1e3';
    // paper with a soft frame
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.8, H * 0.1, 50, W * 0.8, H * 0.1, W);
    g.addColorStop(0, 'rgba(217,162,43,.28)');
    g.addColorStop(1, 'rgba(217,162,43,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(29,26,20,.12)';
    ctx.lineWidth = 3;
    roundRect(ctx, 36, 36, W - 72, H - 72, 48);
    ctx.stroke();
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    const disp = (px, w = 700) => `${w} ${px}px "Readex Pro", "Amiri", system-ui, sans-serif`;
    // the app's star and name
    star(ctx, W / 2, 150, 54, gold);
    ctx.fillStyle = ink;
    ctx.font = disp(46);
    ctx.fillText(L('نقرأ سوا', 'Read Together'), W / 2, 260);
    // invitation
    ctx.font = disp(64);
    ctx.fillStyle = ink;
    ctx.fillText(L('تعالى نقرأ سوا!', 'Come read with us!', 'تعالَ نقرأ معًا!'), W / 2, 380);
    ctx.font = disp(52, 600);
    ctx.fillStyle = lapis;
    wrap(ctx, `«${c.name || L('حلقة القراءة', 'Reading Circle')}»`, W - 200, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 460 + i * 64));
    // the book we're reading: its cover (or a drawn one) and title
    const y0 = 590;
    const cw = 190, ch = 270, cx = W / 2 - cw / 2;
    if (book) {
      const img = await loadImg(book.cover);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      roundRect(ctx, cx, y0, cw, ch, 10);
      if (img) {
        ctx.clip();
        ctx.drawImage(img, cx, y0, cw, ch);
      } else {
        const [bg, fg] = U.spineOf(book.title + (book.author || ''));
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = fg;
        ctx.font = disp(26);
        wrap(ctx, book.title, cw - 30, 4).forEach((ln, i) => ctx.fillText(ln, W / 2, y0 + 70 + i * 36));
      }
      ctx.restore();
      ctx.fillStyle = ink2;
      ctx.font = disp(30, 500);
      ctx.fillText(L('بنقرأ دلوقتي', 'Reading now', 'نقرأ الآن'), W / 2, y0 + ch + 56);
      ctx.fillStyle = ink;
      ctx.font = disp(36);
      wrap(ctx, book.title, W - 240, 1).forEach((ln) => ctx.fillText(ln, W / 2, y0 + ch + 104));
    } else {
      ctx.fillStyle = ink2;
      ctx.font = disp(46, 500);
      wrap(ctx, L('كتاب واحد، ورد كل يوم، ونقاش على الصفحات', 'One book, a portion a day, and talk on the pages', 'كتاب واحد، وِرد كل يوم، ونقاش على الصفحات'), W - 240, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, y0 + 110 + i * 66));
    }
    // how many we are, and the code
    const n = D.memberIds().length;
    ctx.fillStyle = gold;
    roundRect(ctx, W / 2 - 330, H - 170, 660, 96, 48);
    ctx.fill();
    ctx.fillStyle = '#2a1a00';
    ctx.font = disp(38);
    ctx.fillText(L(`إحنا ${L.count(n, 'member')} • الكود ${c.invite_code}`, `${n} of us • code ${c.invite_code}`, `نحن ${L.count(n, 'member', 'nom')} • الرمز ${c.invite_code}`), W / 2, H - 108);
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  };

  async function shareCard(c, msg) {
    const blob = await V.inviteCard(c);
    const name = 'naqra-sawa-invite.png';
    if (P.native) {
      const FS = P.plugin('Filesystem');
      const Share = P.plugin('Share');
      if (FS && Share) {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = () => rej(r.error);
          r.readAsDataURL(blob);
        });
        const w = await FS.writeFile({ path: name, data: b64, directory: 'CACHE' });
        await Share.share({ title: L('نقرأ سوا', 'Read Together'), text: msg, files: [w.uri], dialogTitle: L('اعزم صحابك', 'Invite friends', 'ادعُ أصدقاءك') });
        return true;
      }
    }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: L('نقرأ سوا', 'Read Together'), text: msg, files: [file] });
      return true;
    }
    return false;
  }

  V.actions.invite = () => {
    const c = P.circle ? P.circle() : A.CIRCLE;
    const link = P.inviteLink(c.invite_code);
    const canAdmin = ['owner', 'admin'].includes(P.role());
    const msg = L(`تعالى نقرأ سوا في «${c.name}» 📚\n${link}`, `Come read with us in “${c.name}” 📚\n${link}`, `تعال نقرأ معًا في «${c.name}» 📚\n${link}`);
    let previewUrl = null;
    const api = V.sheet({
      title: L('اعزم صحابك وعيلتك', 'Invite friends and family', 'ادعُ أصدقاءك وعائلتك'),
      html: `<div class="inv-card" id="inv-card"><div class="inv-ph"></div></div>
        <p class="muted">${L('ابعت الكارت واللينك. اللي يفتحه يدخل بإيميله وينضم للحلقة على طول.', 'Send the card and the link. Whoever opens it signs in with their email and joins straight away.', 'أرسل البطاقة والرابط. من يفتحه يدخل ببريده وينضم إلى الحلقة مباشرة.')}</p>
        <div class="copy-row"><code id="inv-url">${esc(link)}</code></div>
        <div class="row-btns"><button class="btn gold" data-share-card>${icon('share')}${L('ابعت الكارت واللينك', 'Send card and link', 'أرسل البطاقة والرابط')}</button>${navigator.share ? `<button class="btn" data-share>${L('اللينك بس', 'Link only', 'الرابط فقط')}</button>` : ''}<button class="btn ghost" data-copy>${L('انسخ اللينك', 'Copy link', 'انسخ الرابط')}</button></div>
        <p class="muted sm">${L('أو الكود:', 'Or the code:', 'أو الرمز:')} <b class="code" dir="ltr">${esc(c.invite_code)}</b></p>
        ${canAdmin ? `<button class="lnk sm" data-reset>${L('اعمل لينك جديد (القديم يبطل)', 'Make a new link (the old one stops working)', 'أنشئ رابطًا جديدًا (يتوقف القديم)')}</button>` : ''}`,
      onMount: (body) => {
        V.inviteCard(c).then((blob) => {
          if (!blob || api.closed) return;
          previewUrl = URL.createObjectURL(blob);
          const box = body.querySelector('#inv-card');
          if (box) box.innerHTML = `<img src="${previewUrl}" alt="${esc(L('كارت العزومة', 'Invitation card', 'بطاقة الدعوة'))}">`;
        });
        body.addEventListener('click', async (e) => {
          if (e.target.closest('[data-share-card]')) {
            try {
              if (!(await shareCard(c, msg))) {
                // no sharing of pictures here (a desktop browser): save it, and copy the message
                const blob = await V.inviteCard(c);
                await A.S.downloads.save({ filename: 'naqra-sawa-invite.png', data: blob });
                const ok = await U.copy(msg);
                U.toast(ok ? L('الكارت اتحفظ والرسالة اتنسخت — ابعتهم', 'Card saved and message copied — send them', 'حُفظت البطاقة ونُسخت الرسالة — أرسلهما') : L('الكارت اتحفظ', 'Card saved', 'حُفظت البطاقة'));
              }
            } catch (er) {
              if (er && er.name !== 'AbortError') console.warn('share', er);
            }
          }
          if (e.target.closest('[data-share]')) {
            try {
              await navigator.share({ title: L('نقرأ سوا', 'Read Together'), text: msg });
            } catch (er) {}
          }
          if (e.target.closest('[data-copy]')) {
            const ok = await U.copy(link, body.querySelector('#inv-url'));
            U.toast(ok ? L('اتنسخ اللينك', 'Link copied', 'تم نسخ الرابط') : L('اختار اللينك وانسخه', 'Select the link to copy', 'حدّد الرابط وانسخه'));
          }
          if (e.target.closest('[data-reset]')) {
            if (!(await V.confirm(L('اللينك القديم هيبطل. اللي في الحلقة هيفضلوا فيها.', 'The old link stops working. Current members stay.', 'سيتوقف الرابط القديم، ويبقى أعضاء الحلقة فيها.'), L('اعمل لينك جديد', 'New link', 'أنشئ رابطًا جديدًا')))) return;
            try {
              await P.resetInvite(c.id);
              await P.resync();
              api.close();
              V.actions.invite();
            } catch (er) {
              U.toast(L('مقدرتش أغيّر اللينك', "Couldn't change the link", 'تعذّر تغيير الرابط'), 'warn');
            }
          }
        });
      },
    });
    api.onClose = () => previewUrl && URL.revokeObjectURL(previewUrl);
  };
})();
