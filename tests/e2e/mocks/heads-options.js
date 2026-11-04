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
  function draw(style) {
    clear();
    for (const h of spans()) {
      const ov = document.querySelector(`.pg-ov[data-p="${h.p}"]`);
      if (style === 'a' && ov) {
        ov.insertAdjacentHTML('beforeend', `<span class="hm hmA l${h.l}" style="right:calc(${pct(1 - h.x)} + 8px);top:${pct(h.y + h.h / 2)}">${NAMES[h.l]}</span>`);
      } else if (style === 'b' && ov) {
        const x1 = 0.885, x0 = h.l <= 2 ? 0.115 : h.l === 3 ? 0.42 : 0.62;
        ov.insertAdjacentHTML('beforeend', `<span class="hm hmB l${h.l}" style="left:${pct(x0)};width:${pct(x1 - x0)};top:calc(${pct(h.y)} - ${h.l === 1 ? 9 : 4}px)"><i>${NAMES[h.l]}</i></span>`);
      } else if (style === 'c') {
        const rx = { 1: 0.955, 2: 0.938, 3: 0.921, 4: 0.904 }[h.l];
        const yc = h.y + h.h / 2;
        for (let p = h.p; p <= h.end.p; p++) {
          const o = document.querySelector(`.pg-ov[data-p="${p}"]`);
          if (!o) continue;
          const y0 = p === h.p ? yc : 0.06;
          const y1 = p === h.end.p ? h.end.y : 0.95;
          if (y1 > y0) o.insertAdjacentHTML('beforeend', `<span class="hm hmR l${h.l}" style="left:${pct(rx)};top:${pct(y0)};height:${pct(y1 - y0)}"></span>`);
        }
        if (ov) {
          ov.insertAdjacentHTML('beforeend', `<span class="hm hmC" style="left:calc(${pct(h.x + h.w)} + 4px);width:calc(${pct(rx - h.x - h.w)} - 4px);top:${pct(yc)}"></span>`);
          ov.insertAdjacentHTML('beforeend', `<span class="hm hmN l${h.l}" style="left:${pct(rx)};top:${pct(yc)}"></span>`);
        }
      }
    }
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
    const bx = { x: Math.max(0, h.x - 0.03), y: Math.max(0, h.y - pad), w: Math.min(1, h.w + 0.06), h: h.h + pad * 2 };
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
