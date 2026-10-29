/* The reading garden: for each book, every member has a plant. It grows a little on each day they read the
   book, puts out a flower for each portion they finish, droops gently after a few days without reading (it
   never dies, and perks up with the next page) and gets a golden flower when they finish the book. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, G } = A;
  const esc = U.esc;
  const Gd = (A.Garden = {});

  const STAGE_DAYS = [0, 1, 2, 4, 7, 12]; // days of reading this book for each stage
  const HEIGHT = [0, 16, 30, 46, 62, 78];
  const PETALS = ['#ff8fab', '#ffd166', '#f78c6b', '#c9a7ff', '#7bdff2', '#ff9f68'];

  /* How a member's plant for a book stands today. */
  Gd.stateOf = (book, uid) => {
    const p = D.prog(book.id, uid);
    const pd = (p && p.days) || {};
    let days = Object.keys(pd).filter((d) => +pd[d] > 0).length;
    const seen = U.rangesCount(p && p.seen);
    if (!days && seen) days = 1; // read before days were kept
    const flowers = Object.values((p && p.done) || {}).filter(Boolean).length;
    let stage = 0;
    for (let i = STAGE_DAYS.length - 1; i > 0; i--) if (days >= STAGE_DAYS[i]) { stage = i; break; }
    if (!stage && flowers) stage = 1;
    const s = G.of(uid);
    const today = U.today();
    const readDays = Object.keys(s.days || {}).filter((d) => s.days[d] > 0).sort();
    const last = readDays[readDays.length - 1];
    const away = last ? U.diffDays(last, today) : 0;
    const wilt = !stage || away <= 1 ? 0 : away <= 3 ? 1 : 2;
    return { stage, days, flowers, wilt, golden: !!(p && p.finished), watered: !!(s.days && s.days[today] > 0), away };
  };

  /* A point on a cubic Bézier curve. */
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };
  const f1 = (n) => Math.round(n * 10) / 10;

  function flower(x, y, r, i, st, big) {
    const n = st.wilt === 2 ? 3 : 5;
    const col = big && st.golden ? '#f5c542' : st.wilt === 2 ? '#cdbba4' : PETALS[i % PETALS.length];
    const droop = st.wilt === 2 ? 2.5 : 0;
    let out = `<g class="fl${big && st.golden ? ' gold' : ''}" transform="translate(${f1(x)} ${f1(y + droop)})">`;
    for (let k = 0; k < n; k++) out += `<ellipse cx="0" cy="${f1(-r * 0.62)}" rx="${f1(r * 0.42)}" ry="${f1(r * 0.62)}" fill="${col}" transform="rotate(${Math.round((360 / 5) * k + i * 17)})"/>`;
    out += `<circle r="${f1(r * 0.34)}" fill="${big && st.golden ? '#fff3c4' : '#ffcf33'}"/><circle r="${f1(r * 0.14)}" fill="#a86b00" opacity=".55"/></g>`;
    if (big && st.golden) out += `<g class="spk" fill="#f5c542"><path d="M${f1(x - r * 1.6)} ${f1(y - r)}l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2z"/><path d="M${f1(x + r * 1.5)} ${f1(y - r * 1.6)}l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z"/></g>`;
    return out;
  }

  /* The plant as SVG (120 × 150). */
  Gd.plant = (st, seed = 'x') => {
    const r = U.rng(U.hash(String(seed)));
    const sway = (r() - 0.5) * 12;
    const base = [60, 113];
    let body = '';
    if (!st.stage) {
      body = `<ellipse cx="60" cy="112" rx="7" ry="3.4" fill="#7a5233"/><ellipse cx="61" cy="110.5" rx="3.2" ry="2.1" fill="#c8a06a" transform="rotate(-20 61 110.5)"/>`;
    } else {
      const H = HEIGHT[st.stage];
      const top = [60 + sway * 0.6, 113 - H];
      const c1 = [60 - sway * 0.4, 113 - H * 0.35];
      const c2 = [60 + sway, 113 - H * 0.7];
      const stemCol = st.wilt === 2 ? '#8c8a4c' : st.wilt === 1 ? '#5f8f4e' : '#3e8a4f';
      const lw = f1(2 + st.stage * 0.55);
      body += `<path d="M${base} C${c1} ${c2} ${top.map(f1)}" fill="none" stroke="${stemCol}" stroke-width="${lw}" stroke-linecap="round"/>`;
      const nLeaves = Math.min(10, st.stage * 2);
      const leafCols = st.wilt === 2 ? ['#b59a5a', '#a08447'] : st.wilt === 1 ? ['#9cb35e', '#86a04f'] : ['#55b46c', '#3f9a58'];
      const droop = st.wilt === 2 ? 48 : st.wilt === 1 ? 22 : 0;
      for (let i = 0; i < nLeaves; i++) {
        const t = 0.18 + (0.72 * (i + 0.5)) / nLeaves;
        const [x, y] = bez(base, c1, c2, top, t);
        const right = i % 2 === 0;
        const sz = (0.55 + st.stage * 0.11) * (1.12 - t * 0.5);
        const ang = right ? -28 + droop + (r() - 0.5) * 14 : 208 - droop + (r() - 0.5) * 14;
        body += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${Math.round(ang)}) scale(${f1(sz)})"><path d="M0 0C6-7 16-7 23 0 16 7 6 7 0 0Z" fill="${leafCols[i % 2]}"/><path d="M1 0H20" stroke="rgb(0 0 0 / .18)" stroke-width="1"/></g>`;
      }
      // flowers: one at the top, the rest on short twigs along the stem
      const nF = Math.min(9, st.flowers + (st.golden ? 1 : 0));
      for (let i = 1; i < nF; i++) {
        const t = 0.35 + (0.55 * i) / nF;
        const [x, y] = bez(base, c1, c2, top, t);
        const side = i % 2 ? 1 : -1;
        const tx = x + side * (9 + r() * 5);
        const ty = y - 5 - r() * 4;
        body += `<path d="M${f1(x)} ${f1(y)}Q${f1((x + tx) / 2)} ${f1(ty + 4)} ${f1(tx)} ${f1(ty)}" fill="none" stroke="${stemCol}" stroke-width="1.4"/>` + flower(tx, ty, 4.6, i, st, false);
      }
      if (nF) body += flower(top[0], top[1] - 2, st.golden ? 8 : 6, 0, st, true);
      else body += `<ellipse cx="${f1(top[0])}" cy="${f1(top[1] - 1)}" rx="2.6" ry="3.6" fill="${leafCols[0]}"/>`;
    }
    const pot = `<path d="M36 120h48l-5 26H41z" fill="#c96f45"/><path d="M38 125h44" stroke="rgb(0 0 0 / .12)" stroke-width="2"/><rect x="33" y="113" width="54" height="8" rx="2.5" fill="#b45f39"/><path d="M44 123l-2 18" stroke="rgb(255 255 255 / .22)" stroke-width="3" stroke-linecap="round"/><ellipse cx="60" cy="113.5" rx="24" ry="3.5" fill="#5b3b26"/>`;
    const delay = (r() * -5).toFixed(2);
    return `<svg class="plant${st.wilt ? ' wilt' + st.wilt : ''}" viewBox="0 0 120 150" aria-hidden="true">${pot}<g class="pl-sway" style="animation-delay:${delay}s">${body}</g></svg>`;
  };

  const caption = (st) =>
    !st.stage
      ? L('بذرة — أول صفحة تزرعها', 'A seed — the first page plants it')
      : `${L.count(st.days, 'day')}${st.flowers ? ` • ${L(`${L.num(st.flowers)} وردة`, `${st.flowers} flower${st.flowers > 1 ? 's' : ''}`)}` : ''}`;

  /* All members' plants for one book: a little garden bed. */
  Gd.bed = (book) => {
    const ids = D.memberIds();
    if (!ids.length) return '';
    const plots = ids
      .map((u) => {
        const st = Gd.stateOf(book, u);
        const me = u === S.me;
        return `<button class="gd-plot${me ? ' me' : ''}" data-act="member" data-uid="${esc(u)}" title="${esc(D.name(u))}">
          ${Gd.plant(st, book.id + u)}
          <span class="gd-who">${D.avatar(u, 'xs')}<b dir="auto">${esc(me ? L('إنت', 'You') : D.name(u))}</b>${st.watered ? `<span class="gd-dropi" title="${esc(L('اتسقت النهارده', 'Watered today'))}">💧</span>` : ''}</span>
          <small>${caption(st)}</small>
        </button>`;
      })
      .join('');
    return `<section class="card garden">
      <header class="sec-h"><h2>${U.icon('leaf')}${L('جنينة الكتاب', 'Book garden')}</h2><button class="lnk sm" data-act="garden-help">${L('إزاي بتكبر؟', 'How it grows')}</button></header>
      <div class="gd-bed">${plots}</div>
    </section>`;
  };

  /* My plant for a book: a small card for Today. */
  Gd.mine = (book) => {
    const st = Gd.stateOf(book, S.me);
    const msg = !st.stage
      ? L('ازرعها بأول صفحة النهارده 🌱', 'Plant it with your first page today 🌱')
      : st.watered
        ? L('سقيتها النهارده 💧', 'Watered today 💧')
        : st.wilt === 2
          ? L('نبتتك عطشانة… صفحة واحدة تصحّيها', 'Your plant is thirsty… one page perks it up')
          : st.wilt === 1
            ? L('بدأت تدبل شوية — اسقيها بصفحة', 'Starting to droop — water it with a page')
            : L('اسقيها بصفحة النهارده 💧', 'Water it with a page today 💧');
    return `<button class="hcard plantc${st.wilt ? ' thirsty' : ''}" data-go="book-${esc(book.id)}" data-tab="people">
      <span class="hc-h"><b>${L('نبتتك', 'Your plant')}</b><small>${caption(st)}</small></span>
      <span class="pc-art">${Gd.plant(st, book.id + S.me)}</span>
      <small class="pc-msg">${msg}</small>
    </button>`;
  };

  if (A.V && A.V.actions)
    A.V.actions['garden-help'] = () =>
      A.V.sheet({
        title: L('جنينة الكتاب', 'Book garden'),
        html: `<div class="gd-help">
          <p>${L('لكل واحد في الحلقة نبتة في كل كتاب.', 'Everyone in the circle has a plant for each book.')}</p>
          <ul>
            <li>🌱 ${L('كل يوم بتقرأ فيه الكتاب، النبتة بتكبر شوية.', 'Each day you read the book, the plant grows a little.')}</li>
            <li>🌸 ${L('كل ورد بتخلّصه بيطلّع وردة.', 'Each portion you finish puts out a flower.')}</li>
            <li>💧 ${L('لو غبت كام يوم بتدبل شوية — ومش بتموت أبداً. أول صفحة بتصحّيها.', "Away a few days, it droops a little — it never dies. The next page perks it up.")}</li>
            <li>🌟 ${L('لما تخلّص الكتاب بتطلع وردة دهبي.', 'Finish the book and a golden flower blooms.')}</li>
          </ul></div>`,
      });
})();
