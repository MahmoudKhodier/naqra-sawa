/* Mock-ups of the heading sheet («عنوان في صفحة …») that fit a phone held sideways without scrolling (not part
   of the app): أ two columns, ب one compact column, ج a side panel that leaves the page in view.
   HSheet.setup({bookId, head}); HSheet.show('a' | 'b' | 'c'). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, D, V, R } = A;
  const esc = U.esc, icon = U.icon;
  const NAMES = { 1: 'فصل', 2: 'مبحث', 3: 'مطلب', 4: 'فرع' };
  const UNDER = { 1: 'الأكبر', 2: 'جوّه الفصل', 3: 'جوّه المبحث', 4: 'جوّه المطلب' };
  const css = `
  .hsx .hd-lbl { margin: 0 0 6px; }
  .hsx .hd-in { min-height: 42px; }
  /* أ two columns */
  .hsA .sh-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px 18px; align-items: start; }
  .hsA .colA, .hsA .colB { display: grid; gap: 10px; align-content: start; min-width: 0; }
  .hsA .hd-lv { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hsA .hd-lv button { min-height: 50px; padding: 4px 2px; }
  .hsA .hd-lv small { display: none; }
  .hsA .hd-path { margin: 0; font-size: .76rem; }
  .hsA .row-btns { margin: 0; }
  /* ب one compact column */
  .hsB .sh-body { display: grid; gap: 8px; }
  .hsB .hd-line img { max-height: 46px; object-fit: cover; object-position: right center; }
  .hsB .lvrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .hsB .lvrow .chip { gap: 6px; min-height: 36px; }
  .hsB .lvrow .chip.on { background: var(--lapis-s); color: var(--lapis); border-color: var(--lapis); }
  .hsB .namerow { display: flex; gap: 8px; align-items: center; }
  .hsB .namerow .hd-in { flex: 1; min-width: 0; }
  .hsB .namerow .btn { flex: none; }
  .hsB .hd-path { margin: 0; font-size: .74rem; }
  /* ج a side panel */
  .hsC-wrap { position: fixed; inset: 0; z-index: 900; }
  .hsC-wrap .bg { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(0 0 0 / .32) 0 50%, transparent 50%); }
  .hsC { position: absolute; top: 8px; bottom: 8px; left: 8px; width: min(46%, 380px); background: var(--card); color: var(--ink); border-radius: 20px; box-shadow: var(--shadow-lg); padding: 12px 14px; display: grid; grid-template-rows: auto auto auto auto 1fr auto; gap: 8px; overflow: hidden; }
  .hsC header { display: flex; justify-content: space-between; align-items: center; font: 700 1rem var(--f-disp); }
  .hsC .hd-lv { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .hsC .hd-lv button { min-height: 40px; grid-auto-flow: column; justify-content: center; gap: 6px; padding: 2px 6px; }
  .hsC .hd-lv small { display: none; }
  .hsC .hd-path { margin: 0; font-size: .74rem; }
  .hsC .row-btns { margin: 0; align-self: end; }
  .hsC .arrow { position: absolute; }
  .hsC-line { position: fixed; z-index: 899; border: 2px dashed var(--gold); border-radius: 8px; background: color-mix(in srgb, var(--gold) 12%, transparent); pointer-events: none; }
  .hsx-note { position: fixed; z-index: 2000; left: 50%; top: 4px; transform: translateX(-50%); padding: 4px 12px; border-radius: 99px; background: var(--lapis); color: #fff; font: 700 .78rem var(--f-ui); white-space: nowrap; }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const T = {};
  let pdf = null;
  async function crop(h) {
    if (!pdf) {
      const b = D.book(T.bookId);
      pdf = await R.openPdf(new Uint8Array((await R.partBytes(b.parts[0])).slice(0)));
    }
    const page = await pdf.getPage(h.p);
    const vp = page.getViewport({ scale: 2.4 });
    const cv = document.createElement('canvas');
    cv.width = vp.width;
    cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const bx = { x: 0.03, y: Math.max(0, h.y - 0.02), w: 0.94, h: h.h + 0.04 };
    const c2 = document.createElement('canvas');
    c2.width = Math.round(bx.w * cv.width);
    c2.height = Math.round(bx.h * cv.height);
    c2.getContext('2d').drawImage(cv, -bx.x * cv.width, -bx.y * cv.height);
    return c2.toDataURL('image/jpeg', 0.9);
  }
  const lv = (l, cls = '') => `<div class="hd-lv">${[1, 2, 3, 4].map((k) => `<button type="button" class="${k === l ? 'on' : ''}">${A.Hd.icon(k)}<b>${NAMES[k]}</b><small>${UNDER[k]}</small></button>`).join('')}</div>`;
  const path = () => `<p class="hd-path">${icon('list')}<span>هيبقى جوّه:</span><b>${esc(T.path.join(' › '))}</b></p>`;
  const btns = () => `<div class="row-btns end"><button class="btn ghost">إلغاء</button><button class="btn">${icon('check')}حطّه <small class="xp-hint">+٣ XP</small></button></div>`;
  const note = (t) => {
    document.querySelectorAll('.hsx-note').forEach((e) => e.remove());
    document.body.insertAdjacentHTML('beforeend', `<div class="hsx-note">${t}</div>`);
  };
  window.HSheet = {
    setup(o) {
      Object.assign(T, o);
    },
    async show(style) {
      const h = T.head;
      const img = await crop(h);
      const title = `عنوان في صفحة ${L.num(h.p)}`;
      if (style === 'a') {
        note('أ — عمودين');
        return V.sheet({ title, cls: 'hsx hsA', html: `<div class="colA"><div class="hd-line"><img src="${img}" alt="">${A.Hd.icon(h.l, 'hd-line-i')}</div>${path()}</div>
          <div class="colB">${lv(h.l)}<input class="hd-in" dir="auto" value="${esc(h.t)}" placeholder="اسمه (ممكن تكتبه بعدين)">${btns()}</div>` });
      }
      if (style === 'b') {
        note('ب — عمود واحد مضغوط');
        return V.sheet({ title, cls: 'hsx hsB', html: `<div class="hd-line"><img src="${img}" alt="">${A.Hd.icon(h.l, 'hd-line-i')}</div>
          <div class="lvrow">${[1, 2, 3, 4].map((k) => `<button class="chip${k === h.l ? ' on' : ''}">${A.Hd.icon(k)}${NAMES[k]}</button>`).join('')}</div>
          <div class="namerow"><input class="hd-in" dir="auto" value="${esc(h.t)}" placeholder="اسمه (ممكن تكتبه بعدين)"><button class="btn">${icon('check')}حطّه</button></div>
          ${path()}` });
      }
      // ج: a panel on the side away from the line; the page stays in view (no picture of the line needed)
      note('ج — لوحة على جنب والصفحة باينة');
      const ov = document.querySelector(`.pg-ov[data-p="${h.p}"]`).getBoundingClientRect();
      document.body.insertAdjacentHTML('beforeend', `<div class="hsC-line" style="left:${ov.left + ov.width * 0.04}px;top:${ov.top + ov.height * (h.y - 0.012)}px;width:${ov.width * 0.92}px;height:${ov.height * (h.h + 0.024)}px"></div>
        <div class="hsC-wrap"><div class="bg"></div><div class="hsC"><header><span>${title}</span>${icon('close')}</header>
          ${lv(h.l)}<input class="hd-in" dir="auto" value="${esc(h.t)}" placeholder="اسمه (ممكن تكتبه بعدين)">${path()}<span></span>${btns()}</div></div>`);
    },
    clear() {
      document.querySelectorAll('.hsC-wrap, .hsC-line, .hsx-note').forEach((e) => e.remove());
    },
  };
})();
