/* «الفهرس»: a book's contents. Headings members put in while reading — a small mark in the page's margin by the
   heading's line, at four levels فصل ← مبحث ← مطلب ← فرع — together with the PDF's own outline (book.toc).
   Circle books: col 'heads' {b, page, y, l, t, by, at, edited} (anyone adds in their own name; the author and
   the owner/admins fix or delete: 20261104000000_heads_guard.sql). Private books: data/users/<me>/my/heads.
   Used by the reader (marks, the tool «عنوان», the strip «إنت فين», the contents tab), «خلاصة الورد» and a
   portion's sheet (what it covered), Today, the news, the notebook and export. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G, V } = A;
  const esc = U.esc, icon = U.icon;
  const Hd = (A.Hd = {});

  Hd.MAX = 140; // a heading's name
  Hd.XP = 3; // a heading I add
  Hd.XP_DAY = 10; // headings a day that earn XP
  Hd.name = (l) => [null, L('فصل', 'Chapter', 'فصل'), L('مبحث', 'Section', 'مبحث'), L('مطلب', 'Subsection', 'مطلب'), L('فرع', 'Point', 'فرع')][l] || '';
  Hd.under = (l) => [null, L('الأكبر', 'The biggest', 'الأكبر'), L('جوّه الفصل', 'In a chapter', 'داخل الفصل'), L('جوّه المبحث', 'In a section', 'داخل المبحث'), L('جوّه المطلب', 'In a subsection', 'داخل المطلب')][l] || '';
  const lv = (l) => U.clamp(+l || 1, 1, 4);
  /* The small mark of a level: ◆ فصل, ● مبحث, ○ مطلب, • فرع (the same in lists and buttons). */
  Hd.icon = (l, cls = '') => `<i class="hd-i l${lv(l)}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>`;
  Hd.col = (b) => (D.isPrivate(b) ? `data/users/${S.me}/my/heads` : 'heads');
  /* Putting headings in is off until turned on in Settings (this phone): many readers don't need it. Headings
     others put in still show (marks, contents, «إنت فين»). */
  Hd.on = () => U.store.get('hdOn', false) === true;
  Hd.canAdd = (b) => Hd.on() && D.canWrite() && (D.isPrivate(b) || D.joined());
  Hd.canFix = (h) => Hd.on() && !!h && h.src === 'hand' && D.canWrite() && (h.by === S.me || D.isPrivate(h.b) || S.isOwner || S.canEdit);
  /* What an empty contents says: how to add one, or where to turn it on. */
  Hd.emptyText = (where) =>
    !Hd.on()
      ? L('لسه مفيش عناوين في الكتاب ده. لو عايز تعمل فهرس ليه، شغّل «الفهرس» من الإعدادات ← القراءة.', 'No headings in this book yet. To make its contents, turn on «Contents» in Settings → Reading.', 'لا عناوين في هذا الكتاب بعد. لتصنع فهرسه، فعّل «الفهرس» من الإعدادات ← القراءة.')
      : where === 'chapters'
        ? L('لسه مفيش فصول في فهرس الكتاب ده. وإنت بتقرا دوس «عنوان» جنب أول فصل واختار «فصل»، وهيظهر هنا بأوراده.', 'No chapters in this book’s contents yet. While reading, tap «Heading» beside a chapter and pick «Chapter»; it shows here with its portions.', 'لا فصول في فهرس هذا الكتاب بعد. أثناء القراءة اضغط «عنوان» بجانب أول فصل واختر «فصل»، وسيظهر هنا بأوراده.')
        : L('لسه مفيش عناوين في الكتاب ده. وإنت بتقرا استخدم «عنوان» تحت ودوس جنب أول عنوان تقابله، وهيظهر هنا للحلقة كلها.', 'No headings in this book yet. While reading, use «Heading» below and tap beside the first one you meet; it shows here for the whole circle.', 'لا عناوين في هذا الكتاب بعد. أثناء القراءة استخدم «عنوان» في الأسفل واضغط بجانب أول عنوان تقابله، وسيظهر هنا للحلقة كلها.');
  const short = (t) => {
    const s = String(t || '').trim();
    const i = s.indexOf(':');
    return i > 2 && i < 40 ? s.slice(0, i).trim() : s;
  };
  Hd.short = short;
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);

  /* The PDF's own outline as headings. A single top entry that holds all the others is the book itself (its
     title on page 1): it is left out and the rest move up a level. Entries the owner/admins took out of the
     contents are in book.tocOff (["page|title"]). */
  const localToc = new Map(); // a file only on this phone: its outline, read by the reader
  Hd.setLocalToc = (b, list) => {
    localToc.set(b, list || []);
    memo.delete(b);
  };
  function fromPdf(book) {
    const toc = (book && Array.isArray(book.toc) && book.toc.length ? book.toc : localToc.get(book && book.id)) || [];
    if (!toc.length) return [];
    const tops = toc.filter((x) => (x.d || 0) === 0);
    const lift = tops.length === 1 && toc.length > 1 && toc[0] === tops[0] && toc.slice(1).every((x) => (x.d || 0) > 0);
    const off = new Set(book.tocOff || []);
    const out = [];
    toc.forEach((x, i) => {
      if (lift && i === 0) return;
      if (!x || !x.p || !x.t) return;
      if (off.has(x.p + '|' + x.t)) return;
      out.push({ id: 'pdf' + i, src: 'pdf', b: book.id, p: x.p, y: 0, l: lv((x.d || 0) + (lift ? 0 : 1)), t: x.t, key: x.p + '|' + x.t });
    });
    return out;
  }
  const memo = new Map();
  /* My/the circle's headings in a book, as they are stored. */
  Hd.hand = (b) => {
    const m = D.isPrivate(b) ? S.myHeads : S.heads;
    const out = [];
    if (m) for (const h of m.values()) if (h && h.b === b && h.page) out.push(h);
    return out;
  };
  /* The contents of a book, in reading order: {id, src: 'hand' | 'pdf', b, p, y, l, t, by, at}. */
  Hd.list = (b) => {
    const book = D.book(b);
    if (!book) return [];
    const m = memo.get(b);
    if (m && m.ver === S.ver && m.book === book) return m.list;
    const hand = Hd.hand(b).map((h) => ({ id: h.id, src: 'hand', b, p: h.page, y: U.clamp(+h.y || 0, 0, 1), l: lv(h.l), t: String(h.t || ''), by: h.by, at: h.at }));
    const list = [...fromPdf(book), ...hand].sort((x, y) => x.p - y.p || x.y - y.y || (x.src === 'pdf' ? -1 : 1));
    memo.set(b, { ver: S.ver, book, list });
    return list;
  };
  Hd.get = (b, id) => Hd.list(b).find((h) => h.id === id) || null;
  /* The headings in effect at (page, y): the path from the chapter down. y < 0: before anything on that page. */
  Hd.pathAt = (b, p, y = 1) => {
    const path = [];
    for (const h of Hd.list(b)) {
      if (h.p > p || (h.p === p && h.y > y)) break;
      while (path.length && path[path.length - 1].l >= h.l) path.pop();
      path.push(h);
    }
    return path;
  };
  /* What a portion covered: the headings it continues (in effect where it starts, «تكملة») and the ones that
     start inside it; and the first one after it. */
  Hd.cover = (b, w) => {
    if (!w) return { cont: [], inside: [], next: null };
    const all = Hd.list(b);
    const inside = all.filter((h) => h.p >= w.from && h.p <= w.to);
    const cont = Hd.pathAt(b, w.from, -1).filter((h) => !(inside[0] && inside[0].p === w.from && inside[0].y <= 0.04 && inside[0].l <= h.l));
    const next = all.find((h) => h.p > w.to) || null;
    return { cont, inside, next };
  };
  /* «من غير حرق»: someone else's long, sentence-like heading on pages I haven't reached waits for me. */
  Hd.hidden = (h) => !!(h && h.src === 'hand' && h.by !== S.me && h.t.length > 50 && V.noSpoil && V.noSpoil() && h.p > D.reach(h.b));
  Hd.title = (h) => (!h ? '' : Hd.hidden(h) ? L('عنوان هتعرفه لما توصل 👀', 'You will see it when you get there 👀', 'ستعرفه عندما تصل 👀') : h.t || L(`${Hd.name(h.l)} من غير اسم`, `Unnamed ${Hd.name(h.l).toLowerCase()}`, `${Hd.name(h.l)} بلا اسم`));

  /* One line for Today / a portion: «في الورد ده: …» — the headings starting in it, else the one it continues. */
  Hd.portionLine = (b, w) => {
    const c = Hd.cover(b, w);
    if (c.inside.length) {
      const top = c.inside.reduce((m, h) => Math.min(m, h.l), 4);
      const names = c.inside.filter((h) => h.l === top && !Hd.hidden(h)).map((h) => clip(h.t, 44)).filter(Boolean);
      if (!names.length) return '';
      const more = names.length > 2 ? names.length - 2 : 0;
      return names.slice(0, 2).join(' • ') + (more ? ` ${L(`و${L.num(more)} كمان`, `+${more} more`, `و${L.num(more)} أخرى`)}` : '');
    }
    const last = c.cont[c.cont.length - 1];
    return last && !Hd.hidden(last) && last.t ? L(`تكملة ${short(last.t)}`, `${short(last.t)}, continued`, `تتمة ${short(last.t)}`) : '';
  };
  /* The list of what a portion covered (in «خلاصة الورد» and the portion's sheet). Rows open the reader there. */
  Hd.coverHtml = (b, w, o = {}) => {
    const c = Hd.cover(b, w);
    if (!c.cont.length && !c.inside.length) return '';
    const row = (h, cont) => `<button type="button" class="hd-cr l${h.l}" data-act="hd-go" data-b="${esc(b)}" data-p="${h.p}" data-y="${h.y}">${Hd.icon(h.l)}<span class="t" dir="auto">${esc(Hd.title(h))}${cont ? `<small class="hd-cont">${L('تكملة', 'continued', 'تتمة')}</small>` : ''}</span><span class="p">${L('ص', 'p.')} ${L.num(h.p)}</span></button>`;
    const head = o.title === false ? '' : o.ahead ? L('الورد ده فيه:', 'This portion has:', 'هذا الورد فيه:') : L('في الورد ده قريت:', 'In this portion you read:', 'في هذا الورد قرأت:');
    return `<div class="hd-cov">${head ? `<b class="hd-cov-h">${icon('list')}${head}</b>` : ''}
      ${c.cont.map((h) => row(h, true)).join('')}${c.inside.map((h) => row(h, false)).join('')}
      ${c.next && !Hd.hidden(c.next) ? (() => {
        const n = esc(clip(c.next.t, 60) || Hd.name(c.next.l));
        return `<p class="hd-next">${L(`والورد الجاي يبدأ بـ«${n}»`, `The next portion starts with “${n}”`, `والورد التالي يبدأ بـ«${n}»`)}</p>`;
      })() : ''}</div>`;
  };
  /* The contents as rows (the reader's tab, the book's sheet). cur = {p, y}: «إنت هنا». */
  const norm = (t) => (V._arNorm ? V._arNorm(t) : String(t || '').toLowerCase());
  /* A box over a long contents: typing a few letters of a name keeps only the headings that have them. */
  Hd.findBox = () => `<label class="sh-search hd-find">${icon('search')}<input type="search" class="hd-find-in" dir="auto" autocomplete="off" placeholder="${L('دوّر على عنوان…', 'Find a heading…', 'ابحث عن عنوان…')}" aria-label="${L('دوّر في الفهرس', 'Search the contents', 'ابحث في الفهرس')}"></label>`;
  document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('.hd-find-in')) return;
    const box = e.target.closest('.rd-panel, .sh-body') || document;
    const q = norm(e.target.value);
    box.querySelectorAll('.hd-row').forEach((r) => (r.hidden = !!q && !String(r.dataset.q || '').includes(q)));
  });
  Hd.rowsHtml = (b, cur) => {
    const list = Hd.list(b);
    const here = cur ? Hd.pathAt(b, cur.p, cur.y).pop() : null;
    return list
      .map(
        (h) => `<button type="button" class="hd-row l${h.l}${here && h.id === here.id ? ' on' : ''}" data-act="hd-go" data-b="${esc(b)}" data-p="${h.p}" data-y="${h.y}" data-hid="${esc(h.id)}" data-q="${esc(norm(Hd.title(h)))}">${Hd.icon(h.l)}<span class="t" dir="auto">${esc(Hd.title(h))}</span>${here && h.id === here.id ? `<span class="hd-here">${L('إنت هنا', 'You are here', 'أنت هنا')}</span>` : ''}<span class="p">${L.num(h.p)}</span></button>`,
      )
      .join('');
  };

  /* ---------- adding and fixing ---------- */
  /* The sheet for a new heading (o = {bookId, page, y, crop, text}) or to fix one (o.head). */
  Hd.edit = (o) => {
    const b = o.bookId || (o.head && o.head.b);
    const h0 = o.head || null;
    const page = h0 ? h0.p : o.page;
    const y = h0 ? h0.y : o.y;
    const before = Hd.pathAt(b, page, y - 0.0001).filter((x) => !h0 || x.id !== h0.id);
    const prev = Hd.list(b).filter((x) => (x.p < page || (x.p === page && x.y < y)) && (!h0 || x.id !== h0.id)).pop();
    let l = h0 ? h0.l : prev ? Math.min(4, prev.l + 1) : 1;
    const pathHtml = () => {
      const p = before.filter((x) => x.l < l);
      return p.length ? `${icon('list')}<span>${L('هيبقى جوّه:', 'Goes under:', 'سيكون داخل:')}</span>${p.map((x) => `<b dir="auto">${esc(short(Hd.title(x)))}</b>`).join(' › ')}` : `${icon('list')}<span>${L('في أول الفهرس', 'At the top of the contents', 'في أعلى الفهرس')}</span>`;
    };
    const fixOther = h0 && h0.by !== S.me;
    // The reader held sideways: a panel down the side away from the marks, the page stays in view with the line
    // marked on it (so no picture of the line).
    const ovOf = () => document.querySelector(`#reader .pg-ov[data-p="${page}"]`);
    const side = A.R && A.R.isOpen() && document.querySelector('#reader .rd.land') && ovOf() ? (((D.book(b) || {}).lang || 'ar') === 'en' ? 'r' : 'l') : '';
    const api = V.sheet({
      side,
      title: h0 ? `${Hd.icon(h0.l)} ${L(`${Hd.name(h0.l)} • ص ${L.num(page)}`, `${Hd.name(h0.l)} • p. ${page}`)}` : L(`عنوان في صفحة ${L.num(page)}`, `A heading on page ${page}`, `عنوان في صفحة ${L.num(page)}`),
      cls: 'hd-sheet' + (side ? ' hd-side' : ''),
      html: `${o.crop && !side ? `<div class="hd-line"><img src="${esc(o.crop)}" alt="">${Hd.icon(l, 'hd-line-i')}</div>` : ''}
        <p class="hd-lbl">${L('ده إيه في الكتاب؟', 'What is it in the book?', 'ما هو في الكتاب؟')}</p>
        <div class="hd-lv" role="radiogroup">${[1, 2, 3, 4].map((k) => `<button type="button" role="radio" aria-checked="${k === l}" class="${k === l ? 'on' : ''}" data-l="${k}">${Hd.icon(k)}<b>${Hd.name(k)}</b><small>${Hd.under(k)}</small></button>`).join('')}</div>
        <p class="hd-path" id="hd-path">${pathHtml()}</p>
        <label class="hd-lbl" for="hd-name">${L('اسمه', 'Its name', 'اسمه')}</label>
        <input id="hd-name" class="hd-in" dir="auto" maxlength="${Hd.MAX}" autocomplete="off" value="${esc(h0 ? h0.t : o.text || '')}" placeholder="${L('مثلًا: الفصل الأول: …', 'e.g. Chapter 1: …', 'مثلًا: الفصل الأول: …')}">
        <p class="hd-hint">${icon('info')}<span>${h0 ? (fixOther ? L(`حطّه ${D.name(h0.by)}. إنت مشرف فتقدر تصلّحه.`, `Added by ${D.name(h0.by)}. You're an admin, so you can fix it.`, `أضافه ${D.name(h0.by)}. أنت مشرف فيمكنك تصحيحه.`) : L('الاسم ده بيظهر في الفهرس وفي خلاصة الورد.', 'This name shows in the contents and in portion takeaways.', 'يظهر هذا الاسم في الفهرس وفي خلاصة الورد.')) : o.text ? L('الاسم اتكتب لوحده من السطر ده. تقدر تعدّله، أو تسيبه فاضي وتكتبه بعدين لما تدوس على العلامة.', 'The name was read from this line. Change it, or leave it empty and write it later by tapping the mark.', 'كُتب الاسم من هذا السطر. يمكنك تعديله، أو تركه فارغًا وكتابته لاحقًا بالضغط على العلامة.') : L('تقدر تسيب الاسم فاضي وتكتبه بعدين لما تدوس على العلامة.', 'You can leave the name empty and write it later by tapping the mark.', 'يمكنك ترك الاسم فارغًا وكتابته لاحقًا بالضغط على العلامة.')}</span></p>
        <div class="row-btns end hd-btns">${h0 && Hd.canFix(h0) ? `<button type="button" class="btn ghost danger" data-del>${icon('trash')}${L('امسحه', 'Delete', 'احذفه')}</button>` : `<button type="button" class="btn ghost" data-close>${L('إلغاء', 'Cancel')}</button>`}<button type="button" class="btn" data-save>${icon('check')}${h0 ? L('احفظ', 'Save') : L('حطّه', 'Add it', 'أضفه')}${h0 || D.isPrivate(b) ? '' : ` <small class="xp-hint">+${L.num(Hd.XP)} XP</small>`}</button></div>`,
      onMount: (body, sh) => {
        const inp = body.querySelector('#hd-name');
        if (!h0 && !o.text) setTimeout(() => inp.focus(), 80);
        if (side) {
          const box = document.createElement('div');
          box.className = 'hd-side-line';
          box.innerHTML = `<span class="hd-side-m" style="left:${side === 'l' ? 95.6 : 4.4}%">${Hd.icon(l, 'hd-side-i')}</span>`;
          sh.el.parentElement.appendChild(box);
          const place = () => {
            const ov = ovOf();
            const r = ov && ov.getBoundingClientRect();
            box.hidden = !r || !r.height;
            if (box.hidden) return;
            const lh = Math.max(0.022, Math.min(0.06, (+o.lh || 0.026) * 1.5));
            box.style.cssText = `left:${r.left + r.width * 0.02}px;top:${r.top + r.height * (y - lh / 2)}px;width:${r.width * 0.96}px;height:${r.height * lh}px`;
          };
          place();
          const sc = document.getElementById('rd-scroll');
          window.addEventListener('resize', place);
          sc && sc.addEventListener('scroll', place, { passive: true });
          sh.onClose = () => {
            window.removeEventListener('resize', place);
            sc && sc.removeEventListener('scroll', place);
          };
        }
        body.addEventListener('click', async (e) => {
          const k = e.target.closest('[data-l]');
          if (k) {
            l = +k.dataset.l;
            body.querySelectorAll('[data-l]').forEach((x) => {
              x.classList.toggle('on', x === k);
              x.setAttribute('aria-checked', String(x === k));
            });
            const li = api.el.parentElement.querySelector('.hd-line-i, .hd-side-i');
            if (li) li.className = `hd-i l${l} ${li.classList.contains('hd-side-i') ? 'hd-side-i' : 'hd-line-i'}`;
            body.querySelector('#hd-path').innerHTML = pathHtml();
            return;
          }
          if (e.target.closest('[data-del]')) {
            if (!(await V.confirm(L('تمسح العنوان ده من الفهرس؟', 'Delete this heading from the contents?', 'تحذف هذا العنوان من الفهرس؟'), L('امسحه', 'Delete', 'احذفه'), true))) return;
            api.close();
            await D.del(`${Hd.col(b)}/${h0.id}`);
            U.toast(L('العنوان اتمسح', 'Heading deleted', 'حُذف العنوان'));
            return;
          }
          if (!e.target.closest('[data-save]')) return;
          const t = inp.value.replace(/\s+/g, ' ').trim().slice(0, Hd.MAX);
          api.close();
          if (h0) {
            await D.update(`${Hd.col(b)}/${h0.id}`, { l, t, edited: U.nowIso() });
            return;
          }
          const id = D.newId();
          await D.set(`${Hd.col(b)}/${id}`, { b, page, y: Math.round(y * 10000) / 10000, l, t, by: S.me, at: U.nowIso() });
          U.chime && U.chime('ok');
          if (!D.isPrivate(b) && Hd.xpToday() <= Hd.XP_DAY) U.xpPop(Hd.XP, L('عنوان', 'Heading', 'عنوان'));
          else U.toast(L('العنوان اتحط في الفهرس', 'Added to the contents', 'أُضيف إلى الفهرس'));
          if (o.onDone) o.onDone();
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') body.querySelector('[data-save]').click();
        });
      },
    });
    return api;
  };
  /* My headings today, in the circle (the first Hd.XP_DAY earn XP). */
  Hd.xpToday = () => {
    const d = U.today();
    let n = 0;
    for (const h of S.heads.values()) if (h && h.by === S.me && U.isoKey(h.at || '') === d) n++;
    return n;
  };

  /* ---------- a tap on a mark: a small card beside it ---------- */
  let pop = null;
  Hd.closeCard = () => {
    if (pop) pop.remove();
    pop = null;
  };
  Hd.card = (el, b, id) => {
    Hd.closeCard();
    const h = Hd.get(b, id);
    if (!h) return;
    const list = Hd.list(b);
    const i = list.indexOf(h);
    let subs = 0;
    for (let k = i + 1; k < list.length && list[k].l > h.l; k++) subs++;
    const r = el.getBoundingClientRect();
    pop = document.createElement('div');
    pop.className = 'hd-pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<span class="hd-pop-l">${Hd.icon(h.l)}${Hd.name(h.l)}</span>
      <b dir="auto">${esc(Hd.title(h))}</b>
      <small>${[L(`ص ${L.num(h.p)}`, `p. ${h.p}`), h.src === 'pdf' ? L('من فهرس الملف', 'From the file’s contents', 'من فهرس الملف') : D.isPrivate(b) ? '' : L(`من ${D.name(h.by)}`, `by ${D.name(h.by)}`), subs ? L(`جوّاه ${L.num(subs)}`, `${subs} inside`, `بداخله ${L.num(subs)}`) : ''].filter(Boolean).join(' • ')}</small>
      <div class="hd-pop-b">${Hd.canFix(h) ? `<button type="button" class="btn ghost sm" data-hp="edit">${icon('edit')}${h.t ? L('عدّل', 'Edit') : L('اكتب اسمه', 'Name it', 'اكتب اسمه')}</button>` : ''}<button type="button" class="btn ghost sm" data-hp="toc">${icon('list')}${L('الفهرس', 'Contents')}</button></div>`;
    document.body.appendChild(pop);
    const W = pop.offsetWidth, H = pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    // beside the mark, on the side with room (the marks sit by the page's edge)
    let left = r.left - W - 10;
    let side = 'r';
    if (left < 8) {
      left = Math.min(vw - W - 8, r.right + 10);
      side = 'l';
    }
    const top = U.clamp(r.top + r.height / 2 - 28, 8, vh - H - 8);
    Object.assign(pop.style, { left: left + 'px', top: top + 'px' });
    pop.dataset.side = side;
    pop.style.setProperty('--ay', U.clamp(r.top + r.height / 2 - top - 6, 10, H - 20) + 'px');
    pop.addEventListener('click', (e) => {
      const t = e.target.closest('[data-hp]');
      if (!t) return;
      Hd.closeCard();
      if (t.dataset.hp === 'edit') Hd.edit({ head: h });
      else if (A.R && A.R.isOpen && A.R.isOpen()) A.R.showContents();
      else Hd.sheet(b);
    });
    const away = (e) => {
      if (pop && !pop.contains(e.target)) {
        Hd.closeCard();
        document.removeEventListener('pointerdown', away, true);
        // the tap that closes the card does only that (it would hide the reader's bars, or open what is under it)
        const eat = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          document.removeEventListener('click', eat, true);
        };
        document.addEventListener('click', eat, true);
        setTimeout(() => document.removeEventListener('click', eat, true), 500);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  };

  /* The contents outside the reader (a book's ⋯): rows open the reader there. */
  Hd.sheet = (b) => {
    const book = D.book(b);
    if (!book) return;
    const prog = D.prog(b);
    const cur = { p: (prog && prog.last) || 1, y: 0.5 };
    const list = Hd.list(b);
    V.sheet({
      title: `${icon('list')} ${L('الفهرس', 'Contents')}`,
      html: list.length
        ? `${list.length > 12 ? Hd.findBox() : ''}<div class="hd-rows">${Hd.rowsHtml(b, cur)}</div>`
        : `<div class="empty sm"><span class="star8 faint"></span><p>${Hd.emptyText('sheet')}</p></div>`,
    });
  };
  V.actions['hd-go'] = (a) => {
    const b = a.dataset.b, p = +a.dataset.p, y = +a.dataset.y || 0;
    V.sheets.slice().forEach((s) => s.close());
    if (A.R && A.R.isOpen && A.R.isOpen() && A.R.bookId() === b) A.R.goToY(p, y);
    else if (A.R) A.R.open(b, { page: p, y });
  };
  V.actions['hd-contents'] = (a) => Hd.sheet(a.dataset.b);
})();
