/* Activity for me: replies to my notes, likes, cheers and nudges, replies to my messages, new books.
   Everything is derived from shared data; "seen" is remembered per device. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;

  const seenKey = () => 'inboxSeen:' + S.me + ':' + ((A.CIRCLE && A.CIRCLE.id) || 'c');

  V.inboxItems = () => {
    const me = S.me;
    if (!me) return [];
    const out = [];
    for (const n of S.notes.values()) {
      const book = S.books.get(n.b);
      if (!book) continue;
      const replies = V.noteReplies(n);
      const iReplied = replies.some((r) => r.by === me);
      for (const r of replies) {
        if (r.by === me) continue;
        if (n.by === me) out.push({ t: r.at, kind: 'reply', who: r.by, nid: n.id, text: r.text, book });
        else if (iReplied && replies.find((x) => x.by === me && x.at < r.at)) out.push({ t: r.at, kind: 'thread', who: r.by, nid: n.id, text: r.text, book });
      }
      if (n.by === me)
        for (const [uid, v] of Object.entries(n.likes || {})) if (v && uid !== me && typeof v === 'string') out.push({ t: v, kind: 'like', who: uid, nid: n.id, book, text: n.text || '' });
    }
    for (const p of S.pokes.values()) if (p.to === me && p.from !== me) out.push({ t: p.at, kind: p.kind === 'cheer' ? 'cheer' : 'poke', who: p.from, b: p.b, wid: p.wid });
    const mine = new Set(S.msgs.filter((m) => m.by === me).map((m) => m.id));
    for (const m of S.msgs) if (m.re && mine.has(m.re) && m.by !== me) out.push({ t: m.at, kind: 'msgreply', who: m.by, b: m.b, ch: m.ch || 'gen', text: m.text });
    for (const b of S.books.values()) if (b.addedBy && b.addedBy !== me && b.addedAt) out.push({ t: b.addedAt, kind: 'book', who: b.addedBy, b: b.id, book: b });
    out.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return out.slice(0, 60);
  };
  /* Seen up to when: this device or any of mine (kept in my private doc too). Never earlier than the newest
     item marked, so a phone whose clock runs behind does not keep the number up. */
  const seenAt = () => {
    const a = U.store.get(seenKey(), '') || '';
    const b = (S.priv && S.priv.inboxSeen) || '';
    return a > b ? a : b;
  };
  const markSeen = (items) => {
    const newest = items.length ? String(items[0].t) : '';
    const t = newest > U.nowIso() ? newest : U.nowIso();
    U.store.set(seenKey(), t);
    if (D.canWrite() && t > ((S.priv && S.priv.inboxSeen) || '')) D.privUpdate((cur) => Object.assign(cur, { inboxSeen: t })).catch(() => {});
  };
  V.inboxUnread = () => {
    const seen = seenAt();
    if (!seen) return 0;
    return V.inboxItems().filter((x) => x.t > seen).length;
  };
  /* First visit on this device: everything so far counts as seen. */
  V.inboxInit = () => {
    if (S.me && !U.store.get(seenKey(), null)) U.store.set(seenKey(), U.nowIso());
  };

  const line = (x) => {
    // <bdi> isolates a name or title written in the other script; the «» go inside with the title, so they open
    // and close it in its own direction even when it wraps onto a second line
    const who = `<b><bdi>${esc(D.name(x.who))}</bdi></b>`;
    const title = x.book ? `<bdi>«${esc(x.book.title)}»</bdi>` : '';
    switch (x.kind) {
      case 'reply': return L(`رد من ${who} على ملاحظتك في ${title}`, `${who} replied to your note in ${title}`);
      case 'thread': return L(`رد جديد من ${who} في نقاش شاركت فيه`, `${who} replied in a thread you're in`);
      case 'like': return L(`إعجاب من ${who} بملاحظتك في ${title}`, `${who} liked your note in ${title}`);
      case 'cheer': return L(`تشجيع من ${who} 👏`, `${who} cheered you on 👏`);
      case 'poke': {
        const b = S.books.get(x.b);
        const w = b && x.wid ? G.wirds(b).find((y) => y.id === x.wid) : null;
        return L(`تذكير من ${who} ${w ? `بالورد ${L.num(w.n)}` : 'بالقراية'} 👋`, `${who} nudged you${w ? ` about portion ${w.n}` : ''} 👋`, `تذكير من ${who} ${w ? `بالورد ${L.num(w.n)}` : 'بالقراءة'} 👋`);
      }
      case 'msgreply': return L(`رد من ${who} على رسالتك`, `${who} replied to your message`);
      case 'book': return L(`كتاب جديد في الحلقة من ${who}: ${title}`, `${who} added a new book: ${title}`);
    }
    return '';
  };
  const ICON = { reply: 'chat', thread: 'chat', like: 'heart', cheer: 'clap', poke: 'hand', msgreply: 'chat', book: 'books' };

  V.openInbox = () => {
    const seen = seenAt();
    const items = V.inboxItems();
    markSeen(items);
    V.seePokes();
    V.render();
    const fresh = items.filter((x) => x.t > seen).length;
    const onToday = V.myPokes().length;
    V.sheet({
      title: `${icon('bell')} ${L('الجديد ليك', 'For you', 'الجديد لك')}`,
      top: true,
      html: items.length
        ? `${fresh || onToday ? `<div class="ib-all"><small class="muted">${fresh ? L(`${L.num(fresh)} جديد`, `${fresh} new`, `${L.num(fresh)} جديد`) : ''}</small><button class="btn ghost sm" data-all>${icon('check')}${L('علّم الكل اتقرا', 'Mark all as read', 'علّم الكل كمقروء')}</button></div>` : ''}<ul class="inbox">${items
            .map(
              (x, i) => `<li class="${x.t > seen ? 'new' : ''}"><button data-i="${i}"><span class="ib-ic k-${x.kind}">${icon(ICON[x.kind])}</span>${D.avatar(x.who, 'sm')}<span class="ib-t"><span>${line(x)}</span>${x.text ? `<small class="ib-q" dir="auto">${esc(String(x.text).slice(0, 90))}</small>` : ''}<small>${L.ago(x.t)}</small></span></button></li>`
            )
            .join('')}</ul>`
        : V.empty(L('مفيش جديد لسه', 'Nothing new yet', 'لا جديد بعد'), L('لما حد يرد عليك أو يشجعك هتلاقيه هنا.', 'Replies, likes and cheers for you will show up here.', 'عندما يرد عليك أحد أو يشجعك ستجد ذلك هنا.')),
      onMount: (body, api) =>
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-all]')) {
            // everything read: the highlights here go, and the cheers and nudges waiting on «اليوم» too
            body.querySelectorAll('.inbox li.new').forEach((li) => li.classList.remove('new'));
            e.target.closest('.ib-all').remove();
            V.dismissAllPokes();
            U.toast(L('تمام، كله اتقرا ✓', 'All caught up ✓', 'تم، قُرئ كل شيء ✓'));
            return;
          }
          const b = e.target.closest('[data-i]');
          if (!b) return;
          const x = items[+b.dataset.i];
          api.close();
          if (x.nid) V.openNote(x.nid);
          else if (x.kind === 'msgreply') x.b === '_c' ? V.go('circle', { seg: 'chat' }) : V.go('book-' + x.b, { tab: 'talk', ch: x.ch });
          else if (x.kind === 'poke' && x.b && S.books.has(x.b)) A.R.open(x.b);
          else if (x.b && S.books.has(x.b)) V.go('book-' + x.b);
          else V.go('home');
        }),
    });
  };
  V.actions.inbox = () => V.openInbox();
})();
