/* Game layer: XP, levels, streaks, daily quests and badges.
   Everything is DERIVED from shared data (no counters are stored), so every viewer computes the same numbers. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const S = A.S;
  const G = (A.G = {});

  G.XP = { page: 1, wird: 20, onTime: 10, first: 10, note: 5, take: 8, reply: 2, liked: 2, shelf: 10, review: 5, book: 100, cheer: 1, quests: 30 };

  /* Level L needs 25·(L−1)·(L+2) XP in total: 0, 100, 250, 450, 700, 1000, 1350 … */
  G.need = (lv) => 25 * (lv - 1) * (lv + 2);
  G.levelOf = (xp) => {
    let lv = 1;
    while (G.need(lv + 1) <= xp) lv++;
    const base = G.need(lv);
    const next = G.need(lv + 1);
    return { lv, cur: xp - base, span: next - base, toNext: next - xp };
  };
  const TITLES = [
    ['قارئ جديد', 'New reader'],
    ['فاتح الكتاب', 'Page turner'],
    ['رفيق الورق', 'Paper companion'],
    ['صاحب الورد', 'Keeper of the wird'],
    ['قارئ نهم', 'Avid reader'],
    ['دودة كتب', 'Bookworm'],
    ['خير جليس', 'Finest companion'],
    ['حارس المكتبة', 'Library keeper'],
    ['حكيم الحلقة', 'Circle sage'],
    ['بحر المعرفة', 'Sea of knowledge'],
  ];
  G.title = (lv) => {
    const t = TITLES[Math.min(lv, TITLES.length) - 1];
    const extra = lv > TITLES.length ? ' ' + L.num(lv - TITLES.length + 1) : '';
    return L(t[0], t[1]) + extra;
  };

  G.BADGES = [
    { id: 'first_wird', ic: 'check', n: 1, v: (s) => s.wirdsDone, t: ['أول ورد', 'First portion'], d: ['خلّص أول ورد مع الحلقة', 'Finish your first portion'] },
    { id: 'on_time', ic: 'clock', n: 5, v: (s) => s.onTime, t: ['في الميعاد', 'Right on time'], d: ['خلّص ٥ أوراد قبل ميعادها', 'Finish 5 portions before they are due'] },
    { id: 'pioneer', ic: 'bolt', n: 3, v: (s) => s.firsts, t: ['السبّاق', 'Trailblazer'], d: ['كن أول واحد يخلّص الورد ٣ مرات', 'Be first to finish a portion 3 times'] },
    { id: 'p100', ic: 'scroll', n: 100, v: (s) => s.pages, t: ['مية صفحة', '100 pages'], d: ['اقرأ ١٠٠ صفحة', 'Read 100 pages'] },
    { id: 'p1000', ic: 'layers', n: 1000, v: (s) => s.pages, t: ['ألف صفحة', '1,000 pages'], d: ['اقرأ ١٠٠٠ صفحة', 'Read 1,000 pages'] },
    { id: 'streak7', ic: 'flame', n: 7, v: (s) => s.best, t: ['أسبوع نار', 'Week on fire'], d: ['اقرأ ٧ أيام ورا بعض', 'Read 7 days in a row'] },
    { id: 'streak30', ic: 'flame', n: 30, v: (s) => s.best, t: ['شهر من غير ما تقطع', 'Unbroken month'], d: ['اقرأ ٣٠ يوم ورا بعض', 'Read 30 days in a row'] },
    { id: 'pen', ic: 'note', n: 10, v: (s) => s.notes, t: ['صاحب قلم', 'Margin writer'], d: ['اكتب ١٠ ملاحظات أو تظليلات', 'Leave 10 notes or highlights'] },
    { id: 'quotes', ic: 'quote', n: 5, v: (s) => s.quotes, t: ['صياد الاقتباسات', 'Quote hunter'], d: ['احفظ ٥ اقتباسات', 'Save 5 quotes'] },
    { id: 'curious', ic: 'question', n: 5, v: (s) => s.questions, t: ['الفضولي', 'Curious mind'], d: ['اسأل ٥ أسئلة على الكتاب', 'Ask 5 questions in the margins'] },
    { id: 'talk', ic: 'chat', n: 25, v: (s) => s.replies + s.msgs, t: ['المحاور', 'Conversationalist'], d: ['شارك ٢٥ مرة في النقاش', 'Post 25 replies or messages'] },
    { id: 'loved', ic: 'heart', n: 25, v: (s) => s.likesRecv, t: ['محبوب الحلقة', 'Circle favourite'], d: ['اجمع ٢٥ إعجاب على ملاحظاتك', 'Collect 25 likes on your notes'] },
    { id: 'take', ic: 'sparkle', n: 3, v: (s) => s.takes, t: ['الخلاصة', 'The distiller'], d: ['اكتب خلاصتك لـ٣ أوراد', 'Write your takeaway for 3 portions'] },
    { id: 'shelf10', ic: 'shelf', n: 10, v: (s) => s.shelfRead, t: ['مكتبة عامرة', 'Full shelf'], d: ['ضيف ١٠ كتب قرأتها لمكتبتك', 'Add 10 books you have read'] },
    { id: 'critic', ic: 'edit', n: 5, v: (s) => s.reviews, t: ['الناقد', 'The critic'], d: ['اكتب رأيك في ٥ كتب', 'Review 5 books'] },
    { id: 'finisher', ic: 'trophy', n: 1, v: (s) => s.booksDone, t: ['خاتم الكتاب', 'Book finisher'], d: ['خلّص كتاب كامل مع الحلقة', 'Finish a whole book with the circle'] },
    { id: 'cheer', ic: 'clap', n: 10, v: (s) => s.cheers, t: ['المشجّع', 'Cheerleader'], d: ['شجّع أصحابك ١٠ مرات', 'Cheer or nudge friends 10 times'] },
    { id: 'quests', ic: 'chest', n: 7, v: (s) => s.questDays, t: ['صائد الكنوز', 'Treasure hunter'], d: ['افتح صندوق مهام اليوم ٧ مرات', 'Complete the daily quests 7 times'] },
  ];

  function blank(uid) {
    return {
      uid, xp: 0, week: 0, prevWeek: 0, todayXp: 0, pages: 0, pagesWeek: 0, pagesPrevWeek: 0, pagesToday: 0, secs: 0, secsWeek: 0, freezes: 0, frozen: [],
      wirdsDone: 0, onTime: 0, firsts: 0, notes: 0, quotes: 0, questions: 0, takes: 0,
      replies: 0, msgs: 0, likesRecv: 0, likesGiven: 0, shelfRead: 0, reviews: 0,
      booksDone: 0, cheers: 0, votes: 0, questDays: 0,
      days: {}, byDay: {}, active: new Set(), events: [],
    };
  }
  const bump = (s, day, key, n = 1) => {
    if (!day) return;
    const d = (s.byDay[day] = s.byDay[day] || { pages: 0, notes: 0, talk: 0, likes: 0, shelf: 0, cheers: 0, wirds: 0 });
    d[key] += n;
  };
  const ev = (s, day, xp, kind) => {
    if (!day || !xp) return;
    s.events.push({ day, xp, kind });
  };

  /* Daily quests: reading is always one of them; two more are picked per person per day. */
  const POOL = ['note', 'talk', 'like', 'shelf', 'cheer'];
  G.questsFor = (uid, day, s) => {
    const r = U.rng(U.hash(uid + '|' + day));
    const readN = [5, 10, 15, 20][Math.floor(r() * 4)];
    const pool = POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const d = (s && s.byDay[day]) || { pages: 0, notes: 0, talk: 0, likes: 0, shelf: 0, cheers: 0 };
    const pages = (s && s.days[day]) || 0;
    const q = [{ id: 'read', ic: 'scroll', need: readN, have: pages }];
    for (const id of pool.slice(0, 2)) {
      if (id === 'note') q.push({ id, ic: 'hl', need: 1, have: d.notes });
      if (id === 'talk') q.push({ id, ic: 'chat', need: 2, have: d.talk });
      if (id === 'like') q.push({ id, ic: 'heart', need: 3, have: d.likes });
      if (id === 'shelf') q.push({ id, ic: 'shelf', need: 1, have: d.shelf });
      if (id === 'cheer') q.push({ id, ic: 'clap', need: 1, have: d.cheers });
    }
    for (const x of q) x.done = x.have >= x.need;
    return q;
  };
  G.questText = (q) => {
    switch (q.id) {
      case 'read': return L(`اقرأ ${L.count(q.need, 'page')}`, `Read ${q.need} pages`);
      case 'note': return L('ظلّل أو اكتب ملاحظة في كتاب', 'Highlight or note something in a book');
      case 'talk': return L('شارك مرتين في النقاش أو الردود', 'Reply or post twice in a discussion');
      case 'like': return L('اعمل إعجاب لـ٣ ملاحظات من أصحابك', "Like 3 of your friends' notes");
      case 'shelf': return L('ضيف كتاب لمكتبتك أو قيّم كتاب', 'Add or rate a book on your shelf');
      case 'cheer': return L('شجّع أو فكّر واحد من أصحابك', 'Cheer on or nudge a friend');
    }
    return '';
  };

  /* Wird helpers */
  G.wirds = (book) => (book && Array.isArray(book.wirds) ? book.wirds : []);
  G.groupCurrent = (book) => {
    const ws = G.wirds(book);
    if (!ws.length) return null;
    const t = U.today();
    for (const w of ws) if (t <= w.due) return w;
    return ws[ws.length - 1];
  };
  G.myCurrent = (book, uid = S.me) => {
    const ws = G.wirds(book);
    const p = A.D.prog(book.id, uid);
    const done = (p && p.done) || {};
    return ws.find((w) => !done[w.id]) || null;
  };
  G.wirdStatus = (book, w, uid = S.me) => {
    const p = A.D.prog(book.id, uid);
    const t = U.today();
    if (p && p.done && p.done[w.id]) {
      const dk = U.isoKey(p.done[w.id]);
      return dk <= w.due ? 'done' : 'late-done';
    }
    if (w.due < t) return 'late';
    if (w.start <= t) return 'now';
    return 'soon';
  };
  G.firstFinisher = (bookId, wid) => {
    let best = null;
    for (const p of S.prog.values()) {
      if (p.b !== bookId || !p.done || !p.done[wid]) continue;
      if (!best || p.done[wid] < best.t) best = { u: p.u, t: p.done[wid] };
    }
    return best && best.u;
  };

  function compute() {
    const out = new Map();
    const get = (uid) => {
      if (!uid) return null;
      if (!out.has(uid)) out.set(uid, blank(uid));
      return out.get(uid);
    };
    for (const id of S.members.keys()) get(id);

    // pages per day (+ reading time)
    for (const m of S.members.values()) {
      const s = get(m.id);
      const wk0 = U.weekStart(U.today());
      for (const [day, n] of Object.entries(m.secs || {})) {
        const v = Math.max(0, Math.min(86400, +n || 0));
        s.secs += v;
        if (day >= wk0) s.secsWeek += v;
      }
      for (const [day, n] of Object.entries(m.days || {})) {
        const v = Math.max(0, Math.min(2000, +n || 0));
        if (!v) continue;
        s.days[day] = v;
        s.pages += v;
        bump(s, day, 'pages', v);
        s.active.add(day);
        ev(s, day, v * G.XP.page, 'pages');
      }
    }

    // portions finished, books finished
    const firsts = new Map();
    for (const p of S.prog.values()) {
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t) continue;
        const k = p.b + '|' + wid;
        const f = firsts.get(k);
        if (!f || t < f.t) firsts.set(k, { u: p.u, t });
      }
    }
    for (const p of S.prog.values()) {
      const s = get(p.u);
      const book = S.books.get(p.b);
      if (!s || !book) continue;
      for (const [wid, t] of Object.entries(p.done || {})) {
        if (!t) continue;
        const w = G.wirds(book).find((x) => x.id === wid);
        if (!w) continue;
        const day = U.isoKey(t);
        s.wirdsDone++;
        bump(s, day, 'wirds');
        s.active.add(day);
        ev(s, day, G.XP.wird, 'wird');
        if (day <= w.due) {
          s.onTime++;
          ev(s, day, G.XP.onTime, 'onTime');
        }
        const f = firsts.get(p.b + '|' + wid);
        if (f && f.u === p.u) {
          s.firsts++;
          ev(s, day, G.XP.first, 'first');
        }
      }
      if (p.finished) {
        s.booksDone++;
        ev(s, U.isoKey(p.finished), G.XP.book, 'book');
      }
    }

    // notes, likes, replies, takeaways
    for (const n of S.notes.values()) {
      const s = get(n.by);
      if (!s) continue;
      const day = U.isoKey(n.at);
      if (n.kind === 'take') {
        s.takes++;
        bump(s, day, 'talk');
        ev(s, day, G.XP.take, 'take');
      } else {
        s.notes++;
        if (n.kind === 'quote') s.quotes++;
        if (n.kind === 'q') s.questions++;
        bump(s, day, 'notes');
        ev(s, day, G.XP.note, 'note');
      }
      s.active.add(day);
      for (const [uid, v] of Object.entries(n.likes || {})) {
        if (!v || uid === n.by) continue;
        const ld = typeof v === 'string' ? U.isoKey(v) : day;
        s.likesRecv++;
        ev(s, ld, G.XP.liked, 'liked');
        const g = get(uid);
        if (g) {
          g.likesGiven++;
          bump(g, ld, 'likes');
        }
      }
      for (const r of Object.values(n.replies || {})) {
        if (!r || !r.by || !r.text) continue;
        const g = get(r.by);
        if (!g) continue;
        const rd = U.isoKey(r.at);
        g.replies++;
        bump(g, rd, 'talk');
        g.active.add(rd);
        ev(g, rd, G.XP.reply, 'reply');
      }
    }
    for (const m of S.msgs) {
      const s = get(m.by);
      if (!s) continue;
      const day = U.isoKey(m.at);
      s.msgs++;
      bump(s, day, 'talk');
    }

    // shelf
    for (const sh of S.shelf.values()) {
      const s = get(sh.id);
      if (!s) continue;
      const items = Object.values(sh.items || {}).filter(Boolean);
      items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      for (const it of items) {
        const day = U.isoKey(it.at);
        bump(s, U.isoKey(it.updatedAt || it.at), 'shelf');
        if (it.status === 'read') {
          s.shelfRead++;
          if (s.shelfRead <= 60) ev(s, day, G.XP.shelf, 'shelf');
        }
        if (it.review && String(it.review).trim().length >= 20) {
          s.reviews++;
          ev(s, U.isoKey(it.updatedAt || it.at), G.XP.review, 'review');
        }
      }
    }

    // cheers & nudges
    const cheerPerDay = new Map();
    for (const p of S.pokes.values()) {
      const s = get(p.from);
      if (!s) continue;
      const day = U.isoKey(p.at);
      s.cheers++;
      bump(s, day, 'cheers');
      const k = p.from + day;
      const c = (cheerPerDay.get(k) || 0) + 1;
      cheerPerDay.set(k, c);
      if (c <= 5) ev(s, day, G.XP.cheer, 'cheer');
    }
    for (const pr of S.proposals.values()) for (const [uid, v] of Object.entries(pr.votes || {})) if (v && get(uid)) get(uid).votes++;

    // quest bonus + totals + streaks
    const today = U.today();
    const wk = U.weekStart(today);
    const horizon = U.addDays(today, -120);
    for (const s of out.values()) {
      const days = new Set([...Object.keys(s.byDay), ...Object.keys(s.days)]);
      for (const day of days) {
        if (day < horizon || day > today) continue;
        const q = G.questsFor(s.uid, day, s);
        if (q.every((x) => x.done)) {
          s.questDays++;
          ev(s, day, G.XP.quests, 'quests');
        }
      }
      const pwk = U.addDays(wk, -7);
      for (const e of s.events) {
        s.xp += e.xp;
        if (e.day >= wk) s.week += e.xp;
        else if (e.day >= pwk) s.prevWeek += e.xp;
        if (e.day === today) s.todayXp += e.xp;
      }
      for (const [d, n] of Object.entries(s.days)) {
        if (d >= wk) s.pagesWeek += n;
        else if (d >= pwk) s.pagesPrevWeek += n;
        if (d === today) s.pagesToday += n;
      }
      for (const [d, v] of Object.entries(s.byDay)) if (v.notes || v.talk || v.wirds) s.active.add(d);
      // streak
      // Streak with protection: every 7 reading days in a row earn one "freeze" (max 2),
      // which automatically covers a missed day so the streak survives.
      const act = (d) => s.active.has(d);
      const sorted = [...s.active].sort();
      let run = 0, fz = 0, best = 0;
      s.frozen = [];
      if (sorted.length) {
        for (let d = sorted[0], i = 0; d <= today && i < 4000; d = U.addDays(d, 1), i++) {
          if (act(d)) {
            run++;
            if (run % 7 === 0) fz = Math.min(2, fz + 1);
          } else if (d === today) {
            // today isn't over yet
          } else if (run > 0 && fz > 0) {
            fz--;
            s.frozen.push(d);
          } else run = 0;
          best = Math.max(best, run);
        }
      }
      s.streak = run;
      s.freezes = fz;
      s.atRisk = run > 0 && !act(today);
      s.best = best;
      Object.assign(s, G.levelOf(s.xp));
      s.badges = G.BADGES.map((b) => {
        const v = b.v(s);
        return { b, v: Math.min(v, b.n), got: v >= b.n };
      });
      s.badgeCount = s.badges.filter((x) => x.got).length;
    }
    return out;
  }

  let cache = { ver: -1, out: new Map() };
  G.all = () => {
    if (cache.ver !== S.ver) cache = { ver: S.ver, out: compute() };
    return cache.out;
  };
  G.of = (uid) => G.all().get(uid) || Object.assign(blank(uid), G.levelOf(0), { streak: 0, best: 0, badges: [], badgeCount: 0 });
  G.myQuests = () => G.questsFor(S.me, U.today(), G.of(S.me));

  G.board = (mode = 'week') => {
    const rows = [...G.all().values()].filter((s) => S.members.has(s.uid));
    rows.sort((a, b) => (mode === 'week' ? b.week - a.week : b.xp - a.xp) || b.xp - a.xp);
    return rows;
  };
  G.groupWeek = () => {
    let pages = 0;
    for (const s of G.all().values()) if (S.members.has(s.uid)) pages += s.pagesWeek;
    const goal = (S.circle && +S.circle.weeklyGoal) || 300;
    return { pages, goal };
  };
})();
