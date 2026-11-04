/* Mock-ups of headings («عنوان») on the book's pages: three looks for the four levels فصل / مبحث / مطلب / فرع,
   the breadcrumb strip under the reader's top bar, the add sheet, the contents list and «خلاصة الورد» with what
   the portion covered (not part of the app). Data: HeadMock.setup({bookId, heads, lines}) from mocks/heads-book.js. */
(function () {
  'use strict';
  const { U, L, D, V, R } = window.A;
  const esc = U.esc, icon = U.icon;
  const NAMES = { 1: 'فصل', 2: 'مبحث', 3: 'مطلب', 4: 'فرع' };
  const css = `
  .hm { position: absolute; pointer-events: none; z-index: 3; }
  /* أ — a label at the heading's start */
  .hmA { width: max-content; transform: translateY(-50%); font: 700 9.5px/16px var(--f-ui); height: 18px; padding: 0 7px; border-radius: 6px; white-space: nowrap; box-shadow: 0 1px 3px rgb(0 0 0 / .12); }
  .hmA.l1 { background: #7a3615; color: #fff; font-size: 10.5px; height: 20px; line-height: 19px; padding: 0 9px; }
  .hmA.l2 { background: var(--lapis); color: #fff; }
  .hmA.l3 { background: var(--lapis-s); color: var(--lapis); box-shadow: inset 0 0 0 1.2px var(--lapis); }
  .hmA.l4 { background: transparent; color: #7a705e; box-shadow: inset 0 0 0 1px #b9ae98; font-weight: 600; }
  /* ب — a line above the heading */
  .hmB { height: 0; }
  .hmB.l1 { border-top: 3.5px double #b07a1a; }
  .hmB.l2 { border-top: 1.6px solid var(--lapis); }
  .hmB.l3 { border-top: 1.5px dashed var(--lapis); }
  .hmB.l4 { border-top: 1.3px dotted #9a8f7a; }
  .hmB i { width: max-content; position: absolute; top: 0; transform: translateY(-55%); font: 700 9px/15px var(--f-ui); font-style: normal; padding: 0 7px; border-radius: 99px; background: var(--rd-page, #fff); white-space: nowrap; }
  .hmB.l1 i { left: 50%; transform: translate(-50%, -55%); color: #8a5a10; box-shadow: inset 0 0 0 1.2px #b07a1a; font-size: 10px; }
  .hmB.l2 i { right: 0; color: var(--lapis); box-shadow: inset 0 0 0 1.2px var(--lapis); }
  .hmB.l3 i { right: 0; color: var(--lapis); }
  .hmB.l4 i { right: 0; color: #8a806c; font-weight: 600; }
  /* ج — rails in the margin */
  .hmR { width: 0; }
  .hmR.l1 { border-right: 3px solid #b07a1a; }
  .hmR.l2 { border-right: 2.2px solid var(--lapis); }
  .hmR.l3 { border-right: 1.6px solid color-mix(in srgb, var(--lapis) 60%, transparent); }
  .hmR.l4 { border-right: 1.3px dotted #9a8f7a; }
  .hmN { transform: translate(50%, -50%); border-radius: 50%; }
  .hmN.l1 { width: 12px; height: 12px; background: #b07a1a; box-shadow: 0 0 0 2px var(--rd-page, #fff); }
  .hmN.l2 { width: 10px; height: 10px; background: var(--lapis); box-shadow: 0 0 0 2px var(--rd-page, #fff); }
  .hmN.l3 { width: 8px; height: 8px; background: var(--card); border: 2px solid var(--lapis); }
  .hmN.l4 { width: 7px; height: 7px; background: var(--card); border: 1.5px solid #9a8f7a; }
  .hmC { height: 0; border-top: 1px dotted #a99f8b; transform: translateY(-50%); }
  /* small marks in the right margin (round 2): أ shapes, ب ruler ticks, ج the contents icon */
  .hs { position: absolute; z-index: 3; transform: translate(-50%, -50%); pointer-events: auto; }
  .hsA.l1 { width: 12px; height: 12px; background: #9a4a1c; transform: translate(-50%, -50%) rotate(45deg); border-radius: 2px; box-shadow: 0 0 0 2px var(--rd-page, #fff); }
  .hsA.l2 { width: 10px; height: 10px; border-radius: 50%; background: var(--lapis); box-shadow: 0 0 0 2px var(--rd-page, #fff); }
  .hsA.l3 { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--lapis); background: var(--rd-page, #fff); }
  .hsA.l4 { width: 6px; height: 6px; border-radius: 50%; background: #9a8f7a; }
  .hsB { transform: translateY(-50%); height: 3px; border-radius: 2px; }
  .hsB.l1 { width: 20px; height: 4px; background: #9a4a1c; }
  .hsB.l2 { width: 14px; background: var(--lapis); }
  .hsB.l3 { width: 9px; height: 2.5px; background: color-mix(in srgb, var(--lapis) 65%, transparent); }
  .hsB.l4 { width: 5px; height: 2px; background: #9a8f7a; }
  .hsC { display: grid; place-items: center; border-radius: 50%; }
  .hsC .ic { width: 62%; height: 62%; }
  .hsC.l1 { width: 19px; height: 19px; background: #9a4a1c; color: #fff; }
  .hsC.l2 { width: 17px; height: 17px; background: var(--lapis); color: #fff; }
  .hsC.l3 { width: 15px; height: 15px; background: var(--lapis-s); color: var(--lapis); box-shadow: inset 0 0 0 1.3px var(--lapis); }
  .hsC.l4 { width: 13px; height: 13px; background: var(--rd-page, #fff); color: #8a806c; box-shadow: inset 0 0 0 1.2px #a99f8b; }
  .hs.ghost { opacity: .9; outline: 2px dashed var(--gold); outline-offset: 4px; }
  .hs-pop { position: absolute; z-index: 70; width: 238px; background: var(--card); color: var(--ink); border-radius: 16px; box-shadow: 0 10px 30px rgb(0 0 0 / .22); padding: 12px; display: grid; gap: 6px; font: 400 .86rem var(--f-ui); }
  .hs-pop::after { content: ""; position: absolute; right: -6px; top: var(--ay, 24px); width: 12px; height: 12px; background: var(--card); transform: rotate(45deg); border-radius: 2px; }
  .hs-pop .lv { display: inline-flex; gap: 6px; align-items: center; font-size: .74rem; font-weight: 700; color: var(--ink3); }
  .hs-pop .lv .hs { position: static; transform: none; }
  .hs-pop .lv .hsA.l1 { transform: rotate(45deg); }
  .hs-pop b { font-size: .98rem; line-height: 1.5; }
  .hs-pop small { color: var(--ink3); }
  .hs-pop .row { display: flex; gap: 6px; margin-top: 4px; }
  .hs-pop .row .btn { flex: 1; min-height: 36px; font-size: .82rem; padding: 0 8px; justify-content: center; }
  .hm-lv button .hs { position: static; transform: none; margin-bottom: 4px; }
  .hm-lv button .hsA.l1 { transform: rotate(45deg); }
  .hm-line { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #fff; position: relative; }
  .hm-line img { display: block; width: 100%; }
  .hm-line .hs { right: 9%; left: auto; transform: translate(50%, -50%); top: 50%; }
  .hm-line .hsA.l3 { transform: translate(50%, -50%); }
  /* the strip under the top bar */
  .hm-strip { position: absolute; inset-inline: 0; z-index: 60; display: flex; align-items: center; gap: 6px; padding: 6px 14px; border: 0; border-bottom: 1px solid var(--rd-line); background: var(--rd-bar); backdrop-filter: blur(8px); color: var(--rd-ink); font: 600 .8rem var(--f-ui); }
  .hm-strip .ic { color: var(--lapis); }
  .rd[data-theme="night"] .hm-strip .ic { color: #8fa6ff; }
  .hm-strip .ic { width: 15px; height: 15px; flex: none; }
  .hm-strip .par { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rd-ink3); font-size: .74rem; }
  .hm-strip b { flex: 0 1 auto; min-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  /* the add sheet */
  .hm-crop { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
  .hm-crop img { display: block; width: 100%; }
  .hm-lbl { font-weight: 700; font-size: .85rem; color: var(--ink2); margin: 10px 0 4px; }
  .hm-lv { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .hm-lv button { min-height: 44px; border-radius: 12px; border: 2px solid var(--line); background: var(--card); font: 700 .9rem var(--f-ui); color: var(--ink2); display: grid; place-items: center; gap: 0; padding: 4px 0; }
  .hm-lv button small { font-weight: 500; font-size: .66rem; color: var(--ink3); }
  .hm-lv button.on { border-color: var(--lapis); background: var(--lapis-s); color: var(--lapis); }
  .hm-in { width: 100%; min-height: 46px; border-radius: 12px; border: 2px solid var(--line); padding: 8px 12px; font: 600 1rem var(--f-ui); background: var(--card); color: var(--ink); }
  .hm-path { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; color: var(--ink3); font-size: .8rem; margin: 8px 0 0; }
  .hm-path b { color: var(--ink2); font-weight: 600; }
  .hm-hint { display: flex; gap: 6px; align-items: flex-start; color: var(--ink3); font-size: .78rem; margin: 6px 0 0; line-height: 1.6; }
  .hm-hint .ic { width: 14px; height: 14px; flex: none; margin-top: 3px; }
  .seg-pick .sp.hm-new { position: relative; }
  .seg-pick .sp.hm-new::after { content: "جديد"; position: absolute; top: -9px; inset-inline-end: -6px; background: var(--rubric); color: #fff; font-size: .62rem; padding: 1px 6px; border-radius: 99px; }
  /* the contents (look أ) */
  .hm-toc { display: grid; }
  .hm-toc .r { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  .hm-toc .r .t { flex: 1; min-width: 0; }
  .hm-toc .r .p { color: var(--ink3); font-weight: 700; font-size: .82rem; }
  .hm-toc .l1 .t { font-weight: 800; font-size: 1.02rem; color: #8a4a1c; }
  .hm-toc .l2 .t { font-weight: 700; }
  .hm-toc .l3 { padding-inline-start: 26px; }
  .hm-toc .l3 .t { font-weight: 600; font-size: .93rem; color: var(--ink2); }
  .hm-toc .l4 { padding-inline-start: 46px; min-height: 36px; }
  .hm-toc .l4 .t { font-weight: 500; font-size: .86rem; color: var(--ink3); }
  .hm-toc .r.on { background: var(--lapis-s); border-radius: 12px; border-bottom-color: transparent; }
  .hm-toc .r.on .t { color: var(--lapis); }
  .hm-here { font-size: .68rem; font-weight: 800; color: #fff; background: var(--lapis); border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .hm-tabs { display: flex; gap: 6px; margin: 0 0 10px; }
  .hm-tabs button { flex: 1; min-height: 38px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--card); font-weight: 700; color: var(--ink2); white-space: nowrap; font-size: .84rem; display: inline-flex; gap: 6px; align-items: center; justify-content: center; }
  .hm-tabs button.on { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .hm-tabs .ic { width: 16px; height: 16px; }
  .hm-add { display: flex; justify-content: center; margin-top: 12px; }
  /* «خلاصة الورد»: what the portion covered */
  .hm-cov { border: 1.5px solid var(--line); border-radius: 16px; background: var(--card); padding: 10px 12px; margin: 0 0 10px; display: grid; gap: 2px; }
  .hm-cov > b { font-size: .84rem; color: var(--ink3); margin-bottom: 4px; display: flex; gap: 6px; align-items: center; }
  .hm-cov > b .ic { width: 15px; height: 15px; }
  .hm-cov .r { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; }
  .hm-cov .r .t { flex: 1; min-width: 0; }
  .hm-cov .r .p { color: var(--ink3); font-size: .76rem; font-weight: 700; }
  .hm-cov .l1 .t { font-weight: 800; color: #8a4a1c; }
  .hm-cov .l2 .t { font-weight: 700; }
  .hm-cov .l3 { padding-inline-start: 16px; }
  .hm-cov .l3 .t { font-weight: 600; font-size: .92rem; color: var(--ink2); }
  .hm-cov .l4 { padding-inline-start: 32px; }
  .hm-cov .l4 .t { font-size: .86rem; color: var(--ink3); }
  .hm-cov .r .t::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; background: var(--line); }
  .hm-cov .l1 .t::before { background: #b07a1a; }
  .hm-cov .l2 .t::before { background: var(--lapis); }
  .hm-cov .l3 .t::before { background: color-mix(in srgb, var(--lapis) 50%, transparent); }
  .hm-cov .cont { font-size: .7rem; color: var(--ink3); font-weight: 600; background: var(--bg2); border-radius: 99px; padding: 1px 7px; margin-inline-start: 4px; }
  .hm-cov .next { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--line); font-size: .78rem; color: var(--ink3); }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  const T = {};
  const shortName = (t) => (t.includes(':') ? t.split(':')[0].trim() : t);
  const pct = (v) => (v * 100).toFixed(2) + '%';

  /* each heading runs until the next one at its level or above */
  function spans() {
    const hs = T.heads;
    return hs.map((h, i) => {
      const j = hs.findIndex((x, k) => k > i && x.l <= h.l);
      const end = j < 0 ? { p: T.pages, y: 0.93 } : { p: hs[j].p, y: hs[j].y + hs[j].h / 2 };
      return Object.assign({}, h, { end });
    });
  }
  function clear() {
    document.querySelectorAll('.hm').forEach((e) => e.remove());
  }
  const X = 0.935; // the marks' place: the right margin, between the words and the «وقفت هنا» dots
  const mark = (style, l, extra = '') => (style === 'b' ? `<span class="hs hsB l${l}${extra}"></span>` : style === 'c' ? `<span class="hs hsC l${l}${extra}">${icon('list')}</span>` : `<span class="hs hsA l${l}${extra}"></span>`);
  function draw(style) {
    clear();
    T.style = style;
    for (const h of T.heads) {
      const ov = document.querySelector(`.pg-ov[data-p="${h.p}"]`);
      if (!ov) continue;
      const yc = h.y + h.h / 2;
      const pos = style === 'b' ? `right:${pct(1 - 0.962)};top:${pct(yc)}` : `left:${pct(X)};top:${pct(yc)}`;
      ov.insertAdjacentHTML('beforeend', mark(style, h.l).replace('class="hs ', `data-hid="${T.heads.indexOf(h)}" style="${pos}" class="hm hs `));
    }
  }
  /* a tap on a mark: a small card beside it */
  function pop(i) {
    document.querySelectorAll('.hs-pop').forEach((e) => e.remove());
    const h = T.heads[i];
    const m = document.querySelector(`[data-hid="${i}"]`).getBoundingClientRect();
    const rd = document.querySelector('.rd');
    const R0 = rd.getBoundingClientRect();
    const subs = T.heads.filter((x, k) => k > i && x.l > h.l && T.heads.slice(i + 1, k).every((y) => y.l > h.l)).length;
    const top = Math.max(70, m.top - R0.top - 24);
    rd.insertAdjacentHTML('beforeend', `<div class="hs-pop" style="right:${R0.right - m.left + 12}px;top:${top}px;--ay:${m.top - R0.top - top + m.height / 2 - 6}px">
      <span class="lv">${mark(T.style, h.l)}${NAMES[h.l]}</span><b dir="auto">${esc(h.t)}</b><small>ص ${L.num(h.p)} • من محمود${subs ? ` • جوّاه ${L.num(subs)}` : ''}</small>
      <div class="row"><button class="btn ghost">${icon('edit')}عدّل</button><button class="btn ghost">${icon('list')}الفهرس</button></div></div>`);
  }
  /* placing one: the tool «عنوان», the hint, a ghost mark where the finger went down */
  function placing(i) {
    const tools = document.querySelector('.rd-tools');
    tools.querySelectorAll('.tool').forEach((b) => b.classList.remove('on'));
    tools.querySelector('.tool-eye').insertAdjacentHTML('beforebegin', `<button class="tool on hm-tool">${icon('list')}<span>عنوان</span></button>`);
    document.querySelectorAll('.hm-strip').forEach((e) => e.remove());
    const hint = document.querySelector('#rd-hint');
    hint.hidden = false;
    hint.innerHTML = `${icon('list')}<span>دوس جنب العنوان عشان تحط علامته</span><button class="lnk">إلغاء</button>`;
    if (i != null) {
      const h = T.heads[i];
      const ov = document.querySelector(`.pg-ov[data-p="${h.p}"]`);
      ov.insertAdjacentHTML('beforeend', mark(T.style, h.l, ' ghost').replace('class="hs ', `style="left:${pct(X)};top:${pct(h.y + h.h / 2)}" class="hm hs `));
    }
  }
  function unplacing() {
    document.querySelectorAll('.hm-tool').forEach((e) => e.remove());
    const hint = document.querySelector('#rd-hint');
    hint.hidden = true;
  }
  async function placeHtml(i) {
    const h = T.heads[i];
    const x0 = Math.max(0.03, h.x - 0.1);
    const img = await crop({ p: h.p, x: x0, y: h.y - 0.015, w: 0.97 - x0, h: h.h + 0.03 }, 0);
    const path = pathAt(h.p, h.y - 0.001);
    return `<div class="hm-line"><img src="${img}" alt="">${mark(T.style, h.l)}</div>
      <p class="hm-lbl">ده إيه في الكتاب؟</p>
      <div class="hm-lv">${[1, 2, 3, 4].map((l) => `<button class="${l === h.l ? 'on' : ''}">${mark(T.style, l)}${NAMES[l]}</button>`).join('')}</div>
      <p class="hm-path">${icon('list')}<span>هيبقى جوّه:</span>${path.map((x) => `<b>${esc(shortName(x.t))}</b>`).join(' › ')}</p>
      <p class="hm-lbl">اسمه</p>
      <input class="hm-in" dir="auto" value="${esc(h.t)}">
      <p class="hm-hint">${icon('info')}<span>الاسم اتكتب لوحده من السطر ده. تقدر تسيبه فاضي وتكتبه بعدين لما تدوس على العلامة.</span></p>
      <div class="row-btns end" style="margin-top:12px"><button class="btn ghost">إلغاء</button><button class="btn">${icon('check')}حطّها <small class="xp-hint">+${L.num(3)} XP</small></button></div>`;
  }
  /* where I am: the headings in effect at (page, y) */
  function pathAt(p, y) {
    const out = [];
    for (const h of T.heads) {
      if (h.p > p || (h.p === p && h.y > y)) break;
      while (out.length && out[out.length - 1].l >= h.l) out.pop();
      out.push(h);
    }
    return out;
  }
  function strip(p, y) {
    document.querySelectorAll('.hm-strip').forEach((e) => e.remove());
    for (const id of ['#rd-orient', '#rd-foffer', '#rd-browse', '#rd-hint']) {
      const o = document.querySelector(id);
      if (o) o.hidden = true;
    }
    const path = pathAt(p, y);
    const cur = path.pop();
    const top = document.querySelector('.rd-top').getBoundingClientRect();
    const rd = document.querySelector('.rd');
    rd.insertAdjacentHTML('beforeend', `<div class="hm-strip" style="top:${top.bottom - rd.getBoundingClientRect().top}px">${icon('list')}${path.length ? `<span class="par">${path.map((h) => esc(shortName(h.t))).join(' › ')} ›</span>` : ''}<b>${esc(cur.t)}</b></div>`);
  }

  let pdf = null;
  async function crop(h, pad = 0.012) {
    if (!pdf) {
      const b = D.book(T.bookId);
      pdf = await R.openPdf(new Uint8Array((await R.partBytes(b.parts[0])).slice(0)));
    }
    const page = await pdf.getPage(h.p);
    const vp = page.getViewport({ scale: 2.6 });
    const cv = document.createElement('canvas');
    cv.width = vp.width;
    cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const bx = pad === 0 ? { x: h.x, y: Math.max(0, h.y), w: h.w, h: h.h } : { x: Math.max(0, h.x - 0.03), y: Math.max(0, h.y - pad), w: Math.min(1, h.w + 0.06), h: h.h + pad * 2 };
    const c2 = document.createElement('canvas');
    c2.width = Math.round(bx.w * cv.width);
    c2.height = Math.round(bx.h * cv.height);
    c2.getContext('2d').drawImage(cv, -bx.x * cv.width, -bx.y * cv.height);
    return c2.toDataURL('image/jpeg', 0.9);
  }
  async function addHtml() {
    const h = T.heads.find((x) => x.l === 3);
    const img = await crop(h);
    const path = pathAt(h.p, h.y - 0.001);
    const kinds = [['hl', 'hl', 'تظليل'], ['note', 'note', 'ملاحظة'], ['q', 'question', 'سؤال'], ['quote', 'quote', 'اقتباس'], ['head', 'list', 'عنوان']];
    return `<div class="hm-crop"><img src="${img}" alt=""></div>
      <div class="seg-pick">${kinds.map(([k, ic, t]) => `<button type="button" class="sp${k === 'head' ? ' on hm-new' : ''}">${icon(ic)}<span>${t}</span></button>`).join('')}</div>
      <p class="hm-lbl">ده إيه في الكتاب؟</p>
      <div class="hm-lv">${[1, 2, 3, 4].map((l) => `<button class="${l === 3 ? 'on' : ''}">${NAMES[l]}<small>${['الأكبر', 'جوّه الفصل', 'جوّه المبحث', 'جوّه المطلب'][l - 1]}</small></button>`).join('')}</div>
      <p class="hm-path">${icon('list')}<span>هيبقى جوّه:</span>${path.map((x) => `<b>${esc(shortName(x.t))}</b>`).join(' › ')}</p>
      <p class="hm-lbl">اسمه في الفهرس</p>
      <input class="hm-in" dir="auto" value="${esc(h.t)}">
      <p class="hm-hint">${icon('info')}<span>اخترنا «مطلب» لوحدها لأن اللي قبله مبحث. الاسم اتكتب لوحده من الصفحة، عدّله لو حابب.</span></p>
      <div class="row-btns end" style="margin-top:12px"><button class="btn ghost">إلغاء</button><button class="btn">${icon('check')}ضيفه للفهرس <small class="xp-hint">+${L.num(3)} XP</small></button></div>`;
  }
  function tocHtml() {
    const here = pathAt(1, 0.9).pop();
    return `<div class="hm-tabs"><button class="on">${icon('list')}الفهرس</button><button>${icon('bookmark')}علاماتي</button><button>${icon('note')}ملاحظاتي</button></div>
      <div class="hm-toc">${T.heads.map((h) => `<div class="r l${h.l}${h === here ? ' on' : ''}"><span class="t" dir="auto">${esc(h.t)}</span>${h === here ? '<span class="hm-here">إنت هنا</span>' : ''}<span class="p">${L.num(h.p)}</span></div>`).join('')}</div>
      <div class="hm-add"><button class="btn ghost">${icon('plus')}حط عنوان في الصفحة دي</button></div>`;
  }
  /* what portion w covered: the headings in effect at its first page, then the ones that start inside it */
  function coverHtml(w) {
    const at = pathAt(w.from, 0).map((h) => Object.assign({ cont: true }, h));
    const inside = T.heads.filter((h) => h.p >= w.from && h.p <= w.to && !(h.p === w.from && at.some((x) => x.t === h.t)));
    const rows = [...at, ...inside];
    const next = T.heads.find((h) => h.p > w.to);
    return `<div class="hm-cov"><b>${icon('list')}في الورد ده قريت:</b>${rows.map((h) => `<div class="r l${h.l}"><span class="t" dir="auto">${esc(h.t)}${h.cont && h.p < w.from ? '<span class="cont">تكملة</span>' : ''}</span><span class="p">ص ${L.num(h.p)}</span></div>`).join('')}
      ${next ? `<div class="next">والورد الجاي يبدأ بـ«${esc(next.t)}»</div>` : ''}</div>`;
  }

  window.HeadMock = {
    setup(o) {
      Object.assign(T, o);
    },
    draw,
    clear,
    pop,
    placing,
    unplacing,
    async place(i) {
      return V.sheet({ title: `عنوان في صفحة ${L.num(T.heads[i].p)}`, html: await placeHtml(i) });
    },
    strip,
    async add() {
      return V.sheet({ title: `صفحة ${L.num(1)}`, html: await addHtml() });
    },
    toc() {
      return V.sheet({ title: `${icon('list')} الفهرس`, html: tocHtml() });
    },
    take(w) {
      V.writeTake(T.bookId, w.id);
      const box = document.querySelector('.sheet #take-text');
      box.insertAdjacentHTML('beforebegin', coverHtml(w));
      box.blur();
      box.rows = 3;
    },
  };
})();
