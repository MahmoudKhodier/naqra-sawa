/* Daily quests made from what I'm actually reading (from G.QUEST_V2 on):
   - reading: finish my portion (or catch up a late one); a page count when the portion is long or there's no plan
   - people: answer an open question in the book, cheer someone who is behind, react to a friend's highlight
   - reflection: a highlight or a question in today's portion, my takeaway of a portion I just finished, a rating
     for a book I just finished (only when there is one)
   - an optional bonus (a focus session, or a portion and a half) for extra XP
   The day's set is picked once and kept in my private doc (the same on all my phones); one quest can be swapped
   a day. When the three are done the day is recorded on my member doc (questDays), which is what everyone's XP
   counts (game.js). Tapping a quest takes you to it. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const Q = (A.Q = {});
  const SLOTS = ['read', 'people', 'think'];

  /* ---------- what there is to pick from ---------- */
  const readingBooks = () => [...S.books.values()].filter((b) => (b.status || 'reading') === 'reading');
  /* My portion for today: the earliest due of my current portions. */
  function mainPortion() {
    let best = null;
    for (const b of readingBooks()) {
      const w = G.myCurrent(b);
      if (w && (!best || w.due < best.w.due)) best = { b, w };
    }
    return best;
  }
  const dayGoal = () => {
    const g = G.goalOf(S.me);
    return g.on ? g.pages : 10;
  };
  const daysAgo = (iso, n) => !!iso && U.isoKey(iso) >= U.addDays(U.today(), -n);
  const repliedBy = (n, u) => V.noteReplies(n).some((r) => r.by === u);
  const likedBy = (n, u) => !!(n.likes && n.likes[u]);
  const inPortion = (n, mp) => !!mp && n.b === mp.b.id && n.page >= mp.w.from && n.page <= mp.w.to;

  function readQuest() {
    const mp = mainPortion();
    const gp = dayGoal();
    if (mp) {
      const size = mp.w.to - mp.w.from + 1;
      if (size <= Math.max(25, gp * 2.5)) return { k: mp.w.due < U.today() ? 'catch' : 'wird', b: mp.b.id, w: mp.w.id };
      return { k: 'read', n: gp, b: mp.b.id, w: mp.w.id };
    }
    return { k: 'read', n: gp };
  }
  function peopleOptions() {
    const me = S.me;
    const out = [];
    const mp = mainPortion();
    const books = new Set(readingBooks().map((b) => b.id));
    const notes = [...S.notes.values()].filter((n) => books.has(n.b) && n.by !== me && S.members.has(n.by) && n.kind !== 'take' && !(V.isSpoiler && V.isSpoiler(n)));
    // an open question: nobody has answered it yet, or at least not me; the ones in my portion first
    const qs = notes.filter((n) => n.kind === 'q' && daysAgo(n.at, 21) && !repliedBy(n, me));
    qs.sort((a, b) => (inPortion(b, mp) - inPortion(a, mp)) || V.noteReplies(a).length - V.noteReplies(b).length || String(b.at).localeCompare(String(a.at)));
    if (qs[0]) out.push({ k: 'answer', nid: qs[0].id });
    // someone behind on a portion I haven't cheered today
    const today = U.today();
    let behind = null;
    for (const u of S.members.keys()) {
      if (u === me) continue;
      if ([...S.pokes.values()].some((p) => p.from === me && p.to === u && U.isoKey(p.at) === today)) continue;
      let late = 0;
      for (const b of readingBooks()) late += G.behind(b, u).late.length;
      if (late && (!behind || late > behind.late)) behind = { u, late };
    }
    if (behind) out.push({ k: 'cheerU', u: behind.u });
    // a friend's new highlight or note I haven't reacted to
    const fresh = notes.filter((n) => n.kind !== 'q' && daysAgo(n.at, 4) && !likedBy(n, me) && !repliedBy(n, me));
    fresh.sort((a, b) => (inPortion(b, mp) - inPortion(a, mp)) || String(b.at).localeCompare(String(a.at)));
    if (fresh[0]) out.push({ k: 'react', nid: fresh[0].id });
    return out;
  }
  function thinkOptions() {
    const me = S.me;
    const out = [];
    // my takeaway of a portion I finished today or yesterday
    for (const b of readingBooks()) {
      const p = D.prog(b.id);
      for (const w of G.wirds(b)) {
        const t = p && p.done && p.done[w.id];
        if (!t || !daysAgo(t, 1)) continue;
        if ([...S.notes.values()].some((n) => n.b === b.id && n.kind === 'take' && n.wid === w.id && n.by === me)) continue;
        out.push({ k: 'take', b: b.id, w: w.id });
      }
    }
    // a book I finished lately without a rating
    if (V.shelfItems) {
      const it = V.shelfItems(me).find((x) => x.status === 'read' && !(+x.rating > 0) && daysAgo(x.finished && x.finished.length > 7 ? x.finished : x.updatedAt || x.at, 30));
      if (it) out.push({ k: 'rate', id: it.id });
    }
    const mp = mainPortion();
    const where = mp ? { b: mp.b.id, w: mp.w.id } : {};
    out.push(Object.assign({ k: 'hlW' }, where), Object.assign({ k: 'askW' }, where));
    // «الفهرس»: today's portion has no heading of its own yet (from the day this shipped: older apps can't show it)
    if (mp && A.Hd && today() >= G.HEAD_Q && !A.Hd.cover(mp.b.id, mp.w).inside.length) out.push(Object.assign({ k: 'headW' }, where));
    return out;
  }
  function bonusQuest(r) {
    const mp = mainPortion();
    const base = mp ? mp.w.to - mp.w.from + 1 : dayGoal();
    return r() < 0.5 ? { k: 'focus', m: 15 } : { k: 'more', n: Math.max(5, Math.ceil(base * 1.5)) };
  }
  const keyOf = (x) => [x.k, x.nid || x.u || x.id || x.w || ''].join(':');
  /* People and reflection: the special ones (a takeaway, a rating) first when there are some, else at random. */
  function pick(opts, r, not = []) {
    const free = opts.filter((x) => !not.includes(keyOf(x)));
    if (!free.length) return null;
    const special = free.filter((x) => x.k === 'take' || (x.k === 'rate' && r() < 0.6));
    return special[0] || free[Math.floor(r() * free.length)];
  }
  function generate(day) {
    const r = U.rng(U.hash(S.me + '|q2|' + day));
    return {
      d: day,
      swap: 0,
      list: [readQuest(), pick(peopleOptions(), r) || { k: 'talk' }, pick(thinkOptions(), r) || { k: 'hlW' }, Object.assign(bonusQuest(r), { bonus: 1 })],
    };
  }

  /* ---------- the day's set: picked once, kept in my private doc ---------- */
  const ready = () => ['members', 'books', 'prog', 'notes', 'shelf', 'pokes', 'priv', 'heads'].every((k) => S.loaded[k]);
  let local = null; // until the private doc has it
  Q.state = () => {
    const day = U.today();
    const kept = S.priv && S.priv.quests && S.priv.quests.d === day && Array.isArray(S.priv.quests.list) ? S.priv.quests : null;
    // a swap made here shows at once, before my private doc comes back with it
    if (local && local.d === day && (!kept || (local.swap || 0) > (kept.swap || 0))) return local;
    if (kept) return kept;
    const st = generate(day);
    if (!ready()) return st; // not everything is here yet: pick for real once it is
    local = st;
    if (D.canWrite()) D.privUpdate((cur) => (cur.quests && cur.quests.d === day ? cur : Object.assign(cur, { quests: st }))).catch(() => {});
    return st;
  };
  /* For tests: pick today's quests again from what there is now. */
  Q._reset = async () => {
    local = null;
    if (D.canWrite()) await D.privUpdate((c) => Object.assign(c, { quests: null })).catch(() => {});
  };
  /* Swap a people or reflection quest for another (once a day). */
  Q.swap = async (i) => {
    const st = Q.state();
    if (st.swap || !st.list[i] || i === 0 || st.list[i].bonus) return;
    const r = U.rng(U.hash(S.me + '|swap|' + st.d));
    const cur = st.list[i];
    // another kind first (a different person or thing to do), the generic one only when there's nothing else
    const opts = i === 1 ? peopleOptions() : thinkOptions();
    const next = pick(opts.filter((x) => x.k !== cur.k), r) || pick(opts, r, [keyOf(cur)]) || (i === 1 && cur.k !== 'talk' ? { k: 'talk' } : null);
    if (!next) return U.toast(L('مفيش مهمة تانية النهارده', 'No other quest today', 'لا مهمة أخرى اليوم'));
    const list = st.list.slice();
    list[i] = next;
    local = Object.assign({}, st, { list, swap: 1 });
    V.render();
    if (D.canWrite()) await D.privUpdate((c) => Object.assign(c, { quests: local })).catch(() => {});
  };

  /* ---------- how far each one is ---------- */
  const today = () => U.today();
  const pagesToday = () => G.of(S.me).days[today()] || 0;
  const byDay = () => G.of(S.me).byDay[today()] || { talk: 0 };
  const madeToday = (fn) => [...S.notes.values()].some((n) => n.by === S.me && U.isoKey(n.at) === today() && fn(n));
  const portionOf = (x) => {
    const b = x.b && D.book(x.b);
    const w = b && x.w ? G.wirds(b).find((y) => y.id === x.w) : null;
    return { b, w };
  };
  const resumeIn = (b, w) => {
    const p = D.prog(b.id);
    const last = (p && p.last) || 1;
    return w && last >= w.from && last < w.to ? last : w ? w.from : last;
  };
  const wn = (w) => L.num(w.n);

  function evalQuest(x, i) {
    const o = { id: x.k, slot: SLOTS[i] || 'bonus', bonus: !!x.bonus, ic: 'target', need: 1, have: 0, text: '', act: null, i };
    switch (x.k) {
      case 'wird':
      case 'catch': {
        const { b, w } = portionOf(x);
        if (!b || !w) return evalQuest({ k: 'read', n: dayGoal() }, i);
        const p = D.prog(b.id);
        o.ic = x.k === 'catch' ? 'bolt' : 'scroll';
        o.need = w.to - w.from + 1;
        o.have = p && p.done && p.done[w.id] ? o.need : U.rangesCountIn(p && p.seen, w.from, w.to);
        o.text = x.k === 'catch'
          ? L(`الحق الورد ${wn(w)} اللي فاتك (لحد ص ${L.num(w.to)})`, `Catch up on portion ${w.n} (to p. ${w.to})`, `الحق بالورد ${wn(w)} الذي فاتك (حتى ص ${L.num(w.to)})`)
          : L(`خلّص الورد ${wn(w)} (لحد ص ${L.num(w.to)})`, `Finish portion ${w.n} (to p. ${w.to})`, `أنهِ الورد ${wn(w)} (حتى ص ${L.num(w.to)})`);
        o.act = { read: b.id, p: resumeIn(b, w) };
        break;
      }
      case 'read':
      case 'more': {
        const { b, w } = portionOf(x);
        o.ic = x.k === 'more' ? 'flame' : 'scroll';
        o.need = x.n || dayGoal();
        o.have = pagesToday();
        o.text = x.k === 'more'
          ? L(`ورد ونص: اقرأ ${L.count(o.need, 'page')} النهارده`, `A portion and a half: read ${o.need} pages today`, `ورد ونصف: اقرأ ${L.count(o.need, 'page')} اليوم`)
          : w ? L(`اقرأ ${L.count(o.need, 'page')} من الورد ${wn(w)}`, `Read ${o.need} pages of portion ${w.n}`, `اقرأ ${L.count(o.need, 'page')} من الورد ${wn(w)}`) : L(`اقرأ ${L.count(o.need, 'page')}`, `Read ${o.need} pages`);
        const mp = mainPortion();
        const bb = b || (mp && mp.b);
        o.act = bb ? { read: bb.id, p: resumeIn(bb, w || (mp && mp.w)) } : { go: 'books' };
        break;
      }
      case 'answer': {
        const n = S.notes.get(x.nid);
        o.ic = 'question';
        o.have = !n || repliedBy(n, S.me) ? 1 : 0;
        o.text = n ? L(`ردّ على سؤال ${esc(D.name(n.by))} في ص ${L.num(n.page)}`, `Answer ${esc(D.name(n.by))}'s question on p. ${n.page}`, `أجب عن سؤال ${esc(D.name(n.by))} في ص ${L.num(n.page)}`) : L('ردّ على سؤال في الكتاب', 'Answer a question in the book', 'أجب عن سؤال في الكتاب');
        o.act = n ? { note: n.id } : null;
        break;
      }
      case 'react': {
        const n = S.notes.get(x.nid);
        o.ic = 'heart';
        o.have = !n || likedBy(n, S.me) || repliedBy(n, S.me) ? 1 : 0;
        const what = n && n.kind === 'note' ? L('ملاحظة', 'note') : n && n.kind === 'quote' ? L('اقتباس', 'quote') : L('تظليل', 'highlight');
        o.text = n ? L(`علّق أو ادّي قلب لـ${what} ${esc(D.name(n.by))} في ص ${L.num(n.page)}`, `Like or reply to ${esc(D.name(n.by))}'s ${what} on p. ${n.page}`, `علّق أو سجّل إعجابك بـ${what} ${esc(D.name(n.by))} في ص ${L.num(n.page)}`) : L('تفاعل مع إضافة من صحابك', "React to a friend's highlight", 'تفاعل مع إضافة لأصدقائك');
        o.act = n ? { note: n.id } : null;
        break;
      }
      case 'cheerU': {
        o.ic = 'clap';
        o.have = [...S.pokes.values()].some((p) => p.from === S.me && p.to === x.u && U.isoKey(p.at) === today()) ? 1 : 0;
        o.text = L(`ابعت تشجيع لـ${esc(D.name(x.u))} — عنده ورد متأخر`, `Cheer on ${esc(D.name(x.u))}, a portion behind`, `أرسل تشجيعًا إلى ${esc(D.name(x.u))} — لديه ورد متأخر`);
        o.act = { cheer: x.u };
        break;
      }
      case 'talk':
        o.ic = 'chat';
        o.need = 2;
        o.have = byDay().talk || 0;
        o.text = L('شارك مرتين في النقاش أو الردود', 'Reply or post twice in a discussion');
        o.act = { go: 'circle', seg: 'chat' };
        break;
      case 'take': {
        const { b, w } = portionOf(x);
        o.ic = 'sparkle';
        o.have = !b || !w || [...S.notes.values()].some((n) => n.b === b.id && n.kind === 'take' && n.wid === w.id && n.by === S.me) ? 1 : 0;
        o.text = w ? L(`اكتب خلاصتك للورد ${wn(w)}`, `Write your takeaway of portion ${w.n}`, `اكتب خلاصتك للورد ${wn(w)}`) : L('اكتب خلاصة ورد خلّصته', 'Write a takeaway', 'اكتب خلاصة ورد أنهيته');
        o.act = b && w ? { take: b.id, w: w.id } : null;
        break;
      }
      case 'rate': {
        const it = V.shelfItems ? V.shelfItems(S.me).find((y) => y.id === x.id) : null;
        o.ic = 'shelf';
        o.have = !it || +it.rating > 0 ? 1 : 0;
        o.text = it ? L(`قيّم «${esc(it.title)}» اللي خلّصته`, `Rate “${esc(it.title)}”, which you finished`, `قيّم «${esc(it.title)}» الذي أنهيته`) : L('قيّم كتاب خلّصته', 'Rate a book you finished', 'قيّم كتابًا أنهيته');
        o.act = it ? { shelf: it.id } : null;
        break;
      }
      case 'hlW':
      case 'askW': {
        const { b, w } = portionOf(x);
        const inW = (n) => !w || (n.b === b.id && n.page >= w.from && n.page <= w.to);
        o.ic = x.k === 'askW' ? 'question' : 'hl';
        o.have = madeToday((n) => inW(n) && (x.k === 'askW' ? n.kind === 'q' : !n.kind || n.kind === 'hl' || n.kind === 'quote')) ? 1 : 0;
        o.text = x.k === 'askW'
          ? w ? L(`اكتب سؤال للنقاش عن الورد ${wn(w)}`, `Ask the circle a question about portion ${w.n}`, `اكتب سؤالًا للنقاش عن الورد ${wn(w)}`) : L('اكتب سؤال للنقاش عن اللي بتقراه', 'Ask the circle a question about your reading', 'اكتب سؤالًا للنقاش عمّا تقرؤه')
          : w ? L(`ظلّل جملة عجبتك في الورد ${wn(w)}`, `Highlight a line you liked in portion ${w.n}`, `ظلّل جملة أعجبتك في الورد ${wn(w)}`) : L('ظلّل جملة عجبتك النهارده', 'Highlight a line you liked today', 'ظلّل جملة أعجبتك اليوم');
        const mp = mainPortion();
        const bb = b || (mp && mp.b);
        o.act = bb ? { read: bb.id, p: resumeIn(bb, w || (mp && mp.w)) } : { go: 'books' };
        break;
      }
      case 'headW': {
        const { b, w } = portionOf(x);
        o.ic = 'list';
        o.have = [...S.heads.values()].some((h) => h.by === S.me && U.isoKey(h.at) === today() && (!b || h.b === b.id) && (!w || (h.page >= w.from && h.page <= w.to))) ? 1 : 0;
        o.text = w ? L(`حط عنوان للفهرس في الورد ${wn(w)}`, `Add a heading to the contents in portion ${w.n}`, `أضف عنوانًا للفهرس في الورد ${wn(w)}`) : L('حط عنوان للفهرس في الكتاب اللي بتقراه', 'Add a heading to the contents of your book', 'أضف عنوانًا لفهرس الكتاب الذي تقرؤه');
        o.act = b ? { read: b.id, p: resumeIn(b, w) } : { go: 'books' };
        break;
      }
      case 'focus': {
        const f = (S.priv && S.priv.focus && S.priv.focus[today()]) || {};
        o.ic = 'clock';
        o.need = x.m || 15;
        o.have = Math.floor((f.secs || 0) / 60);
        o.text = L(`قعدة تركيز ${L.count(o.need, 'minute')}`, `A ${o.need}-minute focus session`, `جلسة تركيز ${L.count(o.need, 'minute')}`);
        const mp = mainPortion();
        o.act = mp ? { read: mp.b.id, p: resumeIn(mp.b, mp.w), focus: 1 } : { go: 'books' };
        break;
      }
    }
    o.done = o.have >= o.need;
    o.swappable = (i === 1 || i === 2) && !o.done;
    return o;
  }

  /* ---------- the API the screens use ---------- */
  Q.list = () => {
    const st = Q.state();
    return st.list.map(evalQuest);
  };
  Q.canSwap = () => !Q.state().swap;
  Q.core = () => Q.list().filter((x) => !x.bonus);
  Q.bonus = () => Q.list().find((x) => x.bonus) || null;
  const recorded = (day = today()) => ((S.members.get(S.me) || {}).questDays || {})[day];
  /* The three done: record the day (and the bonus) on my member doc, which is what counts for XP. */
  Q.sync = () => {
    if (!D.canWrite() || !ready() || today() < G.QUEST_V2) return;
    const core = Q.core();
    const bonus = Q.bonus();
    if (!core.every((x) => x.done)) return;
    const rec = recorded();
    const b = bonus && bonus.done ? 1 : 0;
    if (rec && (rec.b || !b)) return;
    const day = today();
    D.updateMe((m) => {
      const all = Object.assign({}, m.questDays || {});
      all[day] = { b: b || (all[day] && all[day].b) || 0 };
      // keep about a year of days
      const keys = Object.keys(all).sort();
      while (keys.length > 400) delete all[keys.shift()];
      return { questDays: all };
    }).catch(() => {});
  };
  /* What today's chest holds (shown when it opens). */
  Q.chest = () => {
    const day = today();
    const s = G.of(S.me);
    const bonus = Q.bonus();
    return {
      reward: day >= G.QUEST_V2 ? G.chestReward(S.me, day) : 'wisdom',
      bonus: !!(bonus && bonus.done),
      week: s.questWeek,
      big: !!recorded() && s.questWeek === G.bigChestDays(), // today was the fifth full day this week
    };
  };

  /* Tapping a quest takes you to it. */
  V.actions['quest-go'] = async (a) => {
    const x = Q.list()[+a.dataset.i];
    if (!x || !x.act) return;
    const t = x.act;
    if (t.read) {
      await A.R.open(t.read, { page: t.p });
      if (t.focus && A.R.focusOpen) setTimeout(() => A.R.focusOpen(), 900);
    } else if (t.note) V.openNote(t.note);
    else if (t.cheer) V.poke(t.cheer, 'cheer');
    else if (t.take) V.writeTake(t.take, t.w);
    else if (t.shelf) {
      const it = V.shelfItems(S.me).find((y) => y.id === t.shelf);
      if (it) V.shelfDetail(S.me, it);
    } else if (t.go) V.go(t.go, t.seg ? { seg: t.seg } : {});
  };
  V.actions['quest-swap'] = (a) => Q.swap(+a.dataset.i);

  G.myQuests = () => Q.core();
  const oldText = G.questText;
  G.questText = (q) => q.text || oldText(q);
})();
