/* Play: characters, «ورقات», throwing things at friends, and the weekly boss.

   - Characters: a member's mark (members/<uid>.emoji) is their character; the animated ones (CHARS) open as you
     read in the app (pages read here, members/<uid>.days, never pages from Goodreads or marked on paper).
   - «ورقات»: one per page read in the app, minus what you threw (col 'throws': {by, to, it, at}, author-only).
   - Throwing: friendly things make the friend's character happy, pranks make it sad; a friend sees everything
     thrown at them once, as a short scene, the next time they open the app (then it stays in «الجديد ليك»).
   - The weekly boss: the circle's weekly goal as a monster's health; every page anyone reads this week hits it;
     opening the card after a while replays the hits since you last looked.
   Animations: Google's Noto Animated Emoji through A.Lot (lot.js). */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, G } = A;
  const esc = U.esc;
  const icon = U.icon;
  const P = (A.Play = {});
  const vib = (ms) => {
    try {
      if (U.store.get('buzz', true) !== false && navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  };

  /* ---------- characters ---------- */
  // [emoji, pages read in the app to open it]; the first ones are open from the start
  P.CHARS = [
    ['🦁', 0], ['🐢', 0], ['🐧', 0], ['🦊', 0], ['🦉', 0], ['🐼', 0], ['🐱', 0], ['🐻', 0],
    ['🐝', 30], ['🐬', 60], ['🦋', 100], ['🐸', 150], ['🐳', 200], ['🦄', 300], ['🦔', 400], ['🦚', 500],
    ['🐊', 650], ['🦈', 800], ['🦍', 1000], ['🦩', 1300], ['🦦', 1600], ['🦖', 2000], ['🦥', 2500],
  ];
  const ANIM = new Set(['1f981', '1f422', '1f427', '1f98a', '1f989', '1f43c', '1f431', '1f43b', '1f41d', '1f42c', '1f98b', '1f438', '1f433', '1f984', '1f994', '1f99a', '1f40a', '1f988', '1f98d', '1f9a9', '1f9a6', '1f996', '1f9a5']);
  const codeOf = (e) => (A.Lot ? A.Lot.code(e) : '');
  P.animated = (e) => !!e && ANIM.has(codeOf(e));
  /* Pages read in the app (the reader counts them into members/<uid>.days). */
  P.appPages = (uid = S.me) => {
    const d = (S.members.get(uid) || {}).days || {};
    let n = 0;
    for (const v of Object.values(d)) n += +v || 0;
    return n;
  };
  P.unlocked = (e, uid = S.me) => {
    const c = P.CHARS.find((x) => x[0] === e);
    return !c || P.appPages(uid) >= c[1];
  };
  /* A member's character: animated when their mark is one of ours, else the mark (or first letter) as it is. */
  P.mascot = (uid, key, cls = '') => {
    const m = S.members.get(uid) || {};
    const e = m.emoji || '';
    if (P.animated(e)) return `<i class="lot mascot ${cls}" data-lot="${codeOf(e)}" data-key="m-${esc(uid)}-${esc(key || '')}" data-fb="${esc(e)}"></i>`;
    return `<span class="mascot-st ${cls}">${e ? esc(e) : D.avatar(uid, 'lg')}</span>`;
  };
  /* The mark picker in Settings: animated characters (open or with the pages still to go), then the other marks. */
  V.markPicker = (m) => {
    const pages = P.appPages();
    const chars = P.CHARS.map(([e, need]) => {
      const open = pages >= need || m.emoji === e;
      return `<button type="button" class="emo-b char${m.emoji === e ? ' on' : ''}${open ? '' : ' locked'}" data-act="set-emoji" data-emo="${e}" role="radio" aria-checked="${m.emoji === e}" aria-label="${e}${open ? '' : ' ' + L(`يتفتح بعد ${L.count(need, 'page')}`, `opens at ${need} pages`)}"${open ? '' : ' aria-disabled="true"'}>${e}${open ? '' : `<small>${icon('lock')}${L.num(need)}</small>`}</button>`;
    }).join('');
    const others = V.EMOJI.filter((e) => !P.CHARS.some((c) => c[0] === e));
    return `<p class="emo-h">${L('شخصيات متحركة', 'Animated characters', 'شخصيات متحركة')}<small>${L(`بتتفتح بالقراية جوه التطبيق • قريت ${L.count(pages, 'page')}`, `They open as you read in the app • ${pages} pages read`, `تُفتح بالقراءة داخل التطبيق • قرأت ${L.count(pages, 'page')}`)}</small></p>
      <div class="emo emo-chars">${chars}</div>
      <p class="emo-h">${L('علامات تانية', 'Other marks', 'علامات أخرى')}</p>
      <div class="emo">${others.map((e) => `<button type="button" class="emo-b${m.emoji === e ? ' on' : ''}" data-act="set-emoji" data-emo="${e}" role="radio" aria-checked="${m.emoji === e}" aria-label="${e}">${e}</button>`).join('')}</div>`;
  };
  const setEmoji = V.actions['set-emoji'];
  V.actions['set-emoji'] = (a) => {
    const e = a.dataset.emo || '';
    if (e && !P.unlocked(e) && (S.members.get(S.me) || {}).emoji !== e) {
      const c = P.CHARS.find((x) => x[0] === e);
      return U.toast(`${icon('lock')}<span>${L(`${e} بيتفتح لما تقرا ${L.count(c[1], 'page')} جوه التطبيق — فاضلك ${L.count(c[1] - P.appPages(), 'page')}`, `${e} opens at ${c[1]} pages read in the app — ${c[1] - P.appPages()} to go`, `${e} يُفتح حين تقرأ ${L.count(c[1], 'page')} داخل التطبيق — بقي ${L.count(c[1] - P.appPages(), 'page', 'nom')}`)}</span>`);
    }
    return setEmoji(a);
  };
  /* A new character opened: a small celebration, once. */
  P.checkUnlocks = () => {
    const pages = P.appPages();
    const key = 'charsSeen:' + S.me;
    const seen = U.store.get(key, null);
    const open = P.CHARS.filter((c) => c[1] > 0 && pages >= c[1]).map((c) => c[0]);
    if (seen === null) return U.store.set(key, open); // the first time on this phone: no fuss
    const fresh = open.filter((e) => !seen.includes(e));
    if (!fresh.length) return;
    if (A.Goals && A.Goals.off) return U.store.set(key, open); // celebrations switched off (as for «أول مرة»)
    U.store.set(key, open);
    const e = fresh[fresh.length - 1];
    setTimeout(() => {
      if (V.sheets.length || (A.R && A.R.isOpen())) return U.store.set(key, seen); // later, when nothing is in the way
      U.chime && U.chime('big');
      U.confetti && U.confetti(0.8);
      V.sheet({
        title: L('شخصية جديدة اتفتحت!', 'A new character!', 'شخصية جديدة!'),
        cls: 'celebrate',
        html: `<div class="celeb"><i class="lot unlock-big" data-lot="${codeOf(e)}" data-fb="${e}"></i>
          <p>${L(`قريت ${L.count(pages, 'page')} جوه التطبيق — ${e} بقى بتاعك`, `You've read ${pages} pages in the app — ${e} is yours`, `قرأت ${L.count(pages, 'page')} داخل التطبيق — ${e} أصبح لك`)}</p>
          <div class="row-btns center"><button class="btn gold" data-act="set-emoji" data-emo="${e}" data-close>${L('خليه شخصيتي', 'Make it mine', 'اجعله شخصيتي')}</button><button class="btn ghost" data-close>${L('بعدين', 'Later', 'لاحقًا')}</button></div></div>`,
      });
    }, 900);
  };

  /* ---------- «ورقات» and things to throw ---------- */
  // [id, emoji, price, kind, mood]
  P.ITEMS = [
    ['balloon', '🎈', 1, 'pop', 'happy'], ['flowers', '💐', 1, 'love', 'happy'], ['clap', '👏', 1, 'clap', 'happy'], ['cheer', '💪', 1, 'cheer', 'happy'], ['cookie', '🍪', 1, 'yum', 'happy'],
    ['pizza', '🍕', 2, 'pizza', 'sad'], ['tomato', '🍅', 2, 'tomato', 'sad'], ['cake', '🎂', 2, 'cake', 'sad'], ['snow', '❄️', 2, 'ice', 'sad'], ['zap', '⚡', 2, 'zap', 'sad'],
    ['bee', '🐝', 2, 'bee', 'sad'], ['rain', '🌧️', 2, 'rain', 'sad'], ['spider', '🕷️', 3, 'spider', 'sad'], ['boo', '👻', 3, 'boo', 'sad'], ['bomb', '💣', 3, 'bomb', 'sad'],
  ];
  const ITEM_NAME = () => ({
    balloon: L('بلونة', 'balloon', 'بالونة'), flowers: L('ورد', 'flowers', 'ورود'), clap: L('تصقيف', 'applause', 'تصفيق'), cheer: L('شد حيلك', 'you got this', 'هِمّة'), cookie: L('بسكوتة', 'cookie', 'كعكة'),
    pizza: L('بيتزا في الوش', 'pizza in the face', 'بيتزا في الوجه'), tomato: L('طماطماية', 'tomato', 'طماطم'), cake: L('تورتة في الوش', 'cake in the face', 'كعكة في الوجه'), snow: L('كورة تلج', 'snowball', 'كرة ثلج'), zap: L('صاعقة', 'zap', 'صاعقة'),
    bee: L('نحلة', 'bee', 'نحلة'), rain: L('سحابة مطر', 'rain cloud', 'سحابة مطر'), spider: L('عنكبوت', 'spider', 'عنكبوت'), boo: L('بخ!', 'boo!', 'بخ!'), bomb: L('قنبلة ضحك', 'laugh bomb', 'قنبلة ضحك'),
  });
  P.item = (id) => P.ITEMS.find((x) => x[0] === id) || P.ITEMS[0];
  P.itemName = (id) => ITEM_NAME()[id] || id;
  P.spent = (uid = S.me) => {
    let n = 0;
    for (const t of (S.throws || new Map()).values()) if (t.by === uid) n += P.item(t.it)[2];
    return n;
  };
  P.coins = (uid = S.me) => Math.max(0, P.appPages(uid) - P.spent(uid));
  const MAX_DAY = 30, MAX_EACH = 10;
  const thrownToday = (to) => {
    const d = U.today();
    let all = 0, each = 0;
    for (const t of (S.throws || new Map()).values()) {
      if (t.by !== S.me || U.isoKey(t.at) !== d) continue;
      all++;
      if (t.to === to) each++;
    }
    return { all, each };
  };
  P.canThrowAt = (uid) => uid !== S.me && S.members.has(uid) && !(S.members.get(uid) || {}).noThrows && D.canWrite();
  let pick = U.store.get('throwPick', 'tomato');
  if (!P.ITEMS.some((x) => x[0] === pick)) pick = 'tomato';

  /* «العب مع صحابك» on top of the members list: my «ورقات», the things, the friends' characters. */
  function playCard() {
    if (!D.canWrite() || (S.members.get(S.me) || {}).noThrows) return '';
    const friends = D.memberIds().filter((u) => P.canThrowAt(u));
    if (!friends.length) return '';
    const coins = P.coins();
    const names = ITEM_NAME();
    return `<section class="card playc">
      <header class="sec-h"><h3>${icon('sparkle')}${L('العب مع صحابك', 'Play with friends', 'العب مع أصدقائك')}</h3><span class="coins" title="${L('ورقة لكل صفحة تقراها جوه التطبيق', 'One for every page you read in the app', 'ورقة لكل صفحة تقرؤها داخل التطبيق')}"><span class="coin">📄</span><b>${L.num(coins)}</b></span></header>
      <p class="muted sm">${L('كل صفحة تقراها جوه التطبيق = ورقة. اختار حاجة ودوس على حد من صحابك.', 'Every page you read in the app = one sheet. Pick something and tap a friend.', 'كل صفحة تقرؤها داخل التطبيق = ورقة. اختر شيئًا والمس أحد أصدقائك.')}</p>
      <div class="throw-items" role="radiogroup">${P.ITEMS.map(([id, e, price]) => `<button class="ti${id === pick ? ' on' : ''}${coins < price ? ' poor' : ''}" data-act="throw-pick" data-it="${id}" role="radio" aria-checked="${id === pick}" aria-label="${esc(names[id])}">${id === pick ? `<i class="lot" data-lot="${codeOf(e)}" data-key="ti-${id}" data-fb="${e}"></i>` : `<span class="ti-e">${e}</span>`}<small><span class="coin sm">📄</span>${L.num(price)}</small></button>`).join('')}</div>
      <div class="throw-friends">${friends.map((u) => `<button class="tf" data-act="throw" data-to="${esc(u)}"><span class="tf-st pl-st">${P.mascot(u, 'play')}</span><b dir="auto">${esc(D.name(u))}</b></button>`).join('')}</div>
    </section>`;
  }
  V.addSection('circle-members', { order: 5, render: () => playCard() });
  V.actions['throw-pick'] = (a) => {
    pick = a.dataset.it;
    U.store.set('throwPick', pick);
    V.render();
  };
  V.actions.throw = (a) => P.throwAt(a.dataset.to, pick, a.querySelector('.tf-st'));
  P.throwAt = async (to, it, targetEl) => {
    if (!P.canThrowAt(to)) return;
    const item = P.item(it);
    if (P.coins() < item[2]) return U.toast(L(`ورقاتك مش مكفّية — صفحة كمان وتقدر ترمي ${item[1]}`, `Not enough sheets — read a page and you can throw ${item[1]}`, `أوراقك لا تكفي — صفحة أخرى وتستطيع رمي ${item[1]}`));
    const lim = thrownToday(to);
    if (lim.all >= MAX_DAY || lim.each >= MAX_EACH) return U.toast(L('كفاية كده النهارده 😄 بكره ترمي تاني', "That's enough for today 😄 more tomorrow", 'يكفي هذا اليوم 😄 غدًا ترمي مجددًا'));
    vib(15);
    const from = document.querySelector('.playc .coins') || document.body;
    if (targetEl) await fly(item[1], from, targetEl).then((at) => P.effect(targetEl, it, at));
    await D.set(`throws/${D.newId()}`, { by: S.me, to, it, at: U.nowIso() }).catch(() => U.toast(L('ماوصلتش، جرّب تاني', "Didn't go through — try again", 'لم تصل، حاول مجددًا'), 'warn'));
  };

  /* ---------- effects ---------- */
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  /* Something flying along an arc from one element to another (fixed, above everything). */
  function fly(emoji, fromEl, toEl, ms) {
    const a = center(fromEl), b = center(toEl);
    const f = document.createElement('div');
    f.className = 'pl-fly';
    f.style.left = a.x + 'px';
    f.style.top = a.y + 'px';
    document.body.appendChild(f);
    if (A.Lot) A.Lot.play(f, codeOf(emoji), { fallback: emoji, detached: true });
    else f.textContent = emoji;
    const soft = ['🎈', '🌧️', '🐝', '👻', '🕷️'].includes(emoji);
    const spin = soft ? 0 : 720;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 110 };
    const kf = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      kf.push({ left: u * u * a.x + 2 * u * t * mid.x + t * t * b.x + 'px', top: u * u * a.y + 2 * u * t * mid.y + t * t * b.y + 'px', transform: `rotate(${spin * t}deg) scale(${1 + Math.sin(t * Math.PI) * 0.35})` });
    }
    return f.animate(kf, { duration: ms || (soft ? 720 : 540), easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'forwards' }).finished.then(() => {
      f.remove();
      return b;
    });
  }
  P.fly = fly;
  function floats(at, set) {
    for (let k = 0; k < 7; k++) {
      const h = document.createElement('span');
      h.className = 'pl-float';
      h.textContent = set[k % set.length];
      h.style.left = at.x + (Math.random() * 70 - 35) + 'px';
      h.style.top = at.y + (Math.random() * 20 - 10) + 'px';
      h.style.animationDelay = k * 70 + 'ms';
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 1800);
    }
  }
  const SPLAT = (col, hi, cake) => `<svg viewBox="0 0 100 100" class="pl-splat"><g fill="${col}"${cake ? ' stroke="#f2c9b8" stroke-width="1.5"' : ''}><path d="M50 18c9 0 13 9 21 8s14 9 9 18 4 15-4 21-8 15-18 13-14 6-21 0-15-5-15-15-10-12-4-21 6-17 15-17 9-7 17-7z" opacity=".94"/><circle cx="22" cy="22" r="5"/><circle cx="84" cy="30" r="4"/><circle cx="16" cy="70" r="4"/><circle cx="82" cy="78" r="6"/><rect class="drip" x="40" y="70" width="6" height="16" rx="3"/><rect class="drip" x="58" y="72" width="5" height="12" rx="2.5"/></g><g fill="${hi}" opacity=".8"><circle cx="40" cy="38" r="4"/><circle cx="58" cy="46" r="3"/>${cake ? '<circle cx="48" cy="30" r="3" fill="#e5352b"/>' : ''}</g></svg>`;
  /* What it does to the character in el: happy things make it bounce, pranks make it sad (and messy). */
  P.effect = (el, it, at) => {
    const [, e, , kind, mood] = P.item(it);
    at = at || center(el);
    vib(mood === 'sad' ? [20, 30, 20] : 20);
    const ov = (html, ms) => {
      const o = document.createElement('div');
      o.className = 'pl-ov';
      o.innerHTML = html;
      el.appendChild(o);
      setTimeout(() => o.remove(), ms);
      return o;
    };
    el.classList.remove('pl-happy', 'pl-sad', 'pl-squish', 'pl-shiver', 'pl-dizzy', 'pl-scared');
    void el.offsetWidth;
    const moodCls = {
      tomato: 'pl-squish', cake: 'pl-squish', pizza: 'pl-squish', ice: 'pl-shiver', rain: 'pl-shiver', zap: 'pl-dizzy', bomb: 'pl-dizzy', bee: 'pl-scared', spider: 'pl-scared', boo: 'pl-scared',
    }[kind];
    el.classList.add(mood === 'happy' ? 'pl-happy' : moodCls || 'pl-sad');
    if (mood === 'sad') setTimeout(() => { el.classList.add('pl-sad'); }, 650); // then it sulks for a moment
    setTimeout(() => el.classList.remove('pl-happy', 'pl-sad', 'pl-squish', 'pl-shiver', 'pl-dizzy', 'pl-scared'), 3200);
    const lot = (code, cls, ms) => {
      const o = ov(`<div class="${cls}"><i class="lot"></i></div>`, ms);
      if (A.Lot) A.Lot.play(o.querySelector('.lot'), code, { fallback: '' });
    };
    if (kind === 'tomato') { ov(SPLAT('#e5352b', '#ffd1c9'), 3200); floats(at, ['😭', '🍅', '😤']); }
    else if (kind === 'cake') { ov(SPLAT('#fff6ee', '#ff9ac2', true), 3200); floats(at, ['😭', '🎂', '😤']); }
    else if (kind === 'pizza') { ov(SPLAT('#f7c04a', '#e5352b'), 3000); floats(at, ['😩', '🍕', '😤']); }
    else if (kind === 'pop') { floats(at, ['🎉', '✨', '🎊']); U.confetti && U.confetti(0.4); }
    else if (kind === 'love') floats(at, ['❤️', '💕', '🌸', '💖']);
    else if (kind === 'clap') floats(at, ['👏', '✨', '👏']);
    else if (kind === 'cheer') floats(at, ['💪', '🔥', '⭐']);
    else if (kind === 'yum') { ov('<i class="pl-crumbs"></i>', 1600); floats(at, ['😋', '🤤', '✨']); }
    else if (kind === 'ice') { ov('<i class="pl-frost"></i>', 2800); floats(at, ['🥶', '❄️', '😖']); }
    else if (kind === 'zap') { ov('<i class="pl-zap"></i>', 700); floats(at, ['😵', '⚡', '💫']); }
    else if (kind === 'bee') { lot('1f41d', 'pl-orbit', 2800); floats(at, ['😖', '😣']); }
    else if (kind === 'rain') { lot('1f327_fe0f', 'pl-cloud', 3000); ov('<i class="pl-drops"></i>', 3000); floats(at, ['😢']); }
    else if (kind === 'spider') { lot('1f577_fe0f', 'pl-thread', 2600); floats(at, ['😱', '😨']); }
    else if (kind === 'boo') { lot('1f47b', 'pl-boo', 1500); floats(at, ['😱', '‼️']); }
    else if (kind === 'bomb') {
      const b = document.createElement('div');
      b.className = 'pl-boom';
      b.style.left = at.x + 'px';
      b.style.top = at.y + 'px';
      document.body.appendChild(b);
      if (A.Lot) A.Lot.play(b, '1f4a5', { loop: false, speed: 1.6, detached: true, once: () => b.remove() });
      setTimeout(() => b.remove(), 2000);
      ov('<i class="pl-soot"></i>', 2600);
      floats(at, ['😵', '💫', '⭐']);
    }
  };

  /* ---------- what was thrown at me: a scene, once, when I next open the app ---------- */
  const seenKey = () => 'throwsSeen:' + S.me;
  const seenAt = () => {
    const a = U.store.get(seenKey(), '') || '';
    const b = (S.priv && S.priv.throwsSeen) || '';
    return a > b ? a : b;
  };
  const markSeen = (t) => {
    U.store.set(seenKey(), t);
    if (D.canWrite() && t > ((S.priv && S.priv.throwsSeen) || '')) D.privUpdate((c) => Object.assign(c, { throwsSeen: t })).catch(() => {});
  };
  P.received = () => {
    const since = seenAt();
    return [...(S.throws || new Map()).values()].filter((t) => t.to === S.me && t.by !== S.me && S.members.has(t.by) && String(t.at) > since).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  };
  let scene = false;
  P.checkReceived = () => {
    if (scene || !S.loaded.throws || !S.loaded.priv || (S.members.get(S.me) || {}).noThrows) return;
    const list = P.received();
    // the first time here: what came before stays in «الجديد ليك», the scenes start from now
    if (!seenAt()) return markSeen(list.length ? list[list.length - 1].at : U.nowIso());
    if (!list.length) return;
    if (V.sheets.length || (A.R && A.R.isOpen())) return;
    scene = true;
    setTimeout(() => P.scene(list), 700);
  };
  P.scene = (list) => {
    const names = ITEM_NAME();
    const shown = list.slice(-6);
    const box = document.createElement('div');
    box.className = 'pl-scene';
    box.innerHTML = `<div class="pl-sc-in" role="dialog" aria-label="${L('اللي اترمى عليك', 'What was thrown at you', 'ما رُمي عليك')}">
      <b class="pl-sc-t">${L('وانت مش هنا…', 'While you were away…', 'وأنت غائب…')}</b>
      <div class="pl-sc-from" aria-hidden="true"></div>
      <div class="pl-sc-me"><div class="pl-st">${P.mascot(S.me, 'scene')}</div></div>
      <p class="pl-sc-cap" aria-live="polite"></p>
      <div class="pl-sc-acts" hidden></div>
      <button class="pl-sc-skip">${L('تخطّي', 'Skip', 'تخطَّ')}</button></div>`;
    document.body.appendChild(box);
    if (A.Lot) A.Lot.mount(box);
    const me = box.querySelector('.pl-st');
    const cap = box.querySelector('.pl-sc-cap');
    const fromBox = box.querySelector('.pl-sc-from');
    let i = 0, skip = false;
    const end = () => {
      markSeen(list[list.length - 1].at);
      const who = [...new Set(list.map((t) => t.by))].slice(0, 2);
      cap.textContent = list.length > shown.length ? L(`و${L.num(list.length - shown.length)} كمان — عايز ترد؟`, `and ${list.length - shown.length} more — throw something back?`, `و${L.num(list.length - shown.length)} غيرها — أتريد الرد؟`) : L('عايز ترد؟ 😏', 'Throw something back? 😏', 'أتريد الرد؟ 😏');
      const acts = box.querySelector('.pl-sc-acts');
      acts.hidden = false;
      acts.innerHTML = who.map((u) => `<button class="btn gold sm" data-back="${esc(u)}">${L(`ردّ على ${esc(D.name(u))}`, `Back at ${esc(D.name(u))}`, `ردّ على ${esc(D.name(u))}`)}</button>`).join('') + `<button class="btn sm" data-ok>${L('تمام', 'OK', 'حسنًا')}</button>`;
      box.querySelector('.pl-sc-skip').hidden = true;
    };
    const next = () => {
      if (skip || !box.isConnected) return;
      if (i >= shown.length) return end();
      const t = shown[i++];
      const item = P.item(t.it);
      fromBox.innerHTML = `<span class="pl-st sm">${P.mascot(t.by, 'scene-from')}</span><small>${esc(D.name(t.by))}</small>`;
      if (A.Lot) A.Lot.mount(fromBox);
      cap.textContent = L(`${names[t.it] || ''} ${item[1]} من ${D.name(t.by)}`, `${names[t.it] || ''} ${item[1]} from ${D.name(t.by)}`, `${names[t.it] || ''} ${item[1]} من ${D.name(t.by)}`);
      setTimeout(() => fly(item[1], fromBox, me).then((at) => {
        P.effect(me, t.it, at);
        setTimeout(next, 1500);
      }), 400);
    };
    box.addEventListener('click', (e) => {
      const back = e.target.closest('[data-back]');
      if (back) {
        box.remove();
        scene = false;
        return P.throwSheet(back.dataset.back);
      }
      if (e.target.closest('[data-ok]')) {
        box.remove();
        scene = false;
      }
      if (e.target.closest('.pl-sc-skip')) {
        skip = true;
        end();
      }
    });
    setTimeout(next, 500);
  };
  /* Throw at one person (from the scene's «ردّ», or a member's menu). */
  P.throwSheet = (to) => {
    const names = ITEM_NAME();
    const api = V.sheet({
      title: L(`ارمي حاجة على ${esc(D.name(to))}`, `Throw something at ${esc(D.name(to))}`, `ارمِ شيئًا على ${esc(D.name(to))}`),
      html: `<div class="ts"><div class="ts-to"><span class="pl-st">${P.mascot(to, 'sheet')}</span></div>
        <p class="muted sm"><span class="coin sm">📄</span> ${L(`معاك ${L.num(P.coins())} ورقة`, `You have ${P.coins()} sheets`, `لديك ${L.num(P.coins())} ورقة`)}</p>
        <div class="throw-items">${P.ITEMS.map(([id, e, price]) => `<button class="ti${P.coins() < price ? ' poor' : ''}" data-it="${id}" aria-label="${esc(names[id])}"><span class="ti-e">${e}</span><small><span class="coin sm">📄</span>${L.num(price)}</small></button>`).join('')}</div></div>`,
      onMount: (body) =>
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-it]');
          if (b) P.throwAt(to, b.dataset.it, body.querySelector('.ts-to .pl-st'));
        }),
    });
    return api;
  };

  /* ---------- the weekly boss ---------- */
  // [code, name, its line]: a new one every Saturday, in turn
  const MONSTERS = () => [
    ['1f40d', L('ثعبان التأجيل', 'The Procrastination Snake', 'ثعبان التسويف'), L('بيوشوشك «بكره أقرا»', 'whispers "I\'ll read tomorrow"', 'يهمس لك «سأقرأ غدًا»')],
    ['1f47e', L('فضائي التشتت', 'The Distraction Alien', 'فضائي التشتت'), L('كل شوية يفتحلك تطبيق تاني', 'keeps opening another app', 'يفتح لك تطبيقًا آخر كل حين')],
    ['1f479', L('غول الملل', 'The Boredom Ogre', 'غول الملل'), L('بيخلّي كل صفحة شبه اللي قبلها', 'makes every page feel the same', 'يجعل كل صفحة تشبه سابقتها')],
    ['1f47b', L('شبح السهر', 'The Late-Night Ghost', 'شبح السهر'), L('بينيّمك والكتاب على وشك', 'puts you to sleep with the book on your face', 'ينيمك والكتاب على وجهك')],
    ['1f996', L('ديناصور الكسل', 'The Lazy Dinosaur', 'ديناصور الكسل'), L('تقيل وبطيء وعايزك زيه', 'slow and heavy and wants you the same', 'ثقيل بطيء ويريدك مثله')],
    ['1f916', L('روبوت الإشعارات', 'The Notification Robot', 'روبوت الإشعارات'), L('تن تن تن… كل دقيقة', 'ding ding ding… every minute', 'تن تن تن… كل دقيقة')],
    ['1f419', L('أخطبوط الموبايل', 'The Phone Octopus', 'أخطبوط الهاتف'), L('بتمن إيدين ماسك تمن موبايلات', 'eight arms, eight phones', 'بثماني أذرع يمسك ثمانية هواتف')],
    ['1f480', L('جمجمة النسيان', 'The Forgetting Skull', 'جمجمة النسيان'), L('بتمسح اللي قريته امبارح', "erases what you read yesterday", 'تمحو ما قرأته أمس')],
  ];
  const WEAPONS = ['📚', '🔥', '🪄', '💣'];
  P.weekIndex = (ws) => Math.round((U.parseD(ws) - U.parseD('2026-01-03')) / (7 * 864e5)); // weeks since a Saturday
  P.monster = (ws) => {
    const m = MONSTERS();
    return m[((P.weekIndex(ws) % m.length) + m.length) % m.length];
  };
  /* The boss card's state: health = the circle's weekly goal; hits = pages this week (in the app or on paper). */
  P.boss = (ws = U.weekStart()) => {
    const goal = (S.circle && +S.circle.weeklyGoal) || 300;
    const hits = D.memberIds().map((u) => ({ u, n: G.weekPagesOf(u, ws).pages })).sort((a, b) => b.n - a.n);
    const total = hits.reduce((s, x) => s + x.n, 0);
    return { ws, goal, hits, total, hp: Math.max(0, goal - total), dead: total >= goal, mon: P.monster(ws) };
  };
  P.bossCard = (extra) => {
    const b = P.boss();
    const [code, name, line] = b.mon;
    const today = U.today();
    const daysLeft = Math.max(1, U.diffDays(today, U.addDays(b.ws, 6)) + 1);
    const max = Math.max(1, b.hits[0] ? b.hits[0].n : 1);
    const party = b.hits.slice(0, 6);
    return `<section class="card cweek boss${b.dead ? ' dead full' : ''}" data-ws="${b.ws}">
      <div class="arena" data-total="${b.total}" data-goal="${b.goal}">
        <div class="ar-stars"></div>
        <div class="ar-plate">
          <div class="ar-t"><span>${L('زعيم الأسبوع:', 'Boss of the week:', 'زعيم الأسبوع:')} <b>${esc(name)}</b></span><small>${b.dead ? L('اتهزم! 🎉', 'Defeated! 🎉', 'هُزم! 🎉') : L(`فاضل ${L.count(daysLeft, 'day')}`, `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`, `بقي ${L.count(daysLeft, 'day', 'nom')}`)}</small></div>
          <div class="ar-hp"><i class="lag" style="width:${(b.hp / b.goal) * 100}%"></i><i class="now" style="width:${(b.hp / b.goal) * 100}%"></i><span class="seg"></span><b>${L.num(b.hp)} / ${L.num(b.goal)}</b></div>
        </div>
        <div class="ar-floor"></div>
        ${b.dead ? `<div class="ar-win"><i class="lot" data-lot="1f381" data-key="boss-gift" data-fb="🎁"></i><b>${L(`هزمنا ${esc(name)}!`, `We beat ${esc(name)}!`, `هزمنا ${esc(name)}!`)}</b><span>${L(`+${L.num(G.XP.boss)} XP لكل اللي ضربه`, `+${G.XP.boss} XP for everyone who hit it`, `+${L.num(G.XP.boss)} XP لكل من ضربه`)}</span></div>` : `<div class="ar-mon"><i class="lot" data-lot="${code}" data-key="boss-${b.ws}"></i></div>`}
        <div class="ar-party">${party.map((x, i) => `<div class="ar-mate" data-uid="${esc(x.u)}" data-w="${WEAPONS[i % WEAPONS.length]}"><span class="pl-st sm">${P.mascot(x.u, 'boss')}</span><b dir="auto">${x.u === S.me ? L('إنت', 'You', 'أنت') : esc(D.name(x.u))}</b><small>${x.n ? '−' + L.num(x.n) : L('لسه', 'not yet', 'ليس بعد')}</small></div>`).join('')}</div>
      </div>
      <p class="ar-line muted sm">${esc(line)} • ${L('كل صفحة يقراها أي حد بتضربه', 'every page anyone reads hits it', 'كل صفحة يقرؤها أي عضو تضربه')}</p>
      <div class="ar-board">${b.hits.filter((x) => x.n).map((x, i) => `<div class="ar-row${i === 0 ? ' top' : ''}"><span class="rk">${i === 0 ? '👑' : L.num(i + 1)}</span>${D.avatar(x.u, 'xs')}<b dir="auto">${esc(D.name(x.u))}</b><span class="bb"><i style="width:${(x.n / max) * 100}%"></i></span><small>−${L.num(x.n)}</small></div>`).join('')}</div>
      ${extra || ''}
    </section>`;
  };

  /* Opening the boss card: the hits since I last looked, replayed fast; then it rests where it is now. */
  let replaying = false;
  V.after = V.after || [];
  V.after.push((scr) => {
    const card = scr.querySelector('.cweek.boss');
    if (!card || replaying) return;
    const ws = card.dataset.ws;
    const b = P.boss(ws);
    const key = 'bossSeen:' + (A.CIRCLE ? A.CIRCLE.id : '') + ':' + ws;
    const prev = U.store.get(key, null);
    const now = { total: b.total, hits: Object.fromEntries(b.hits.map((x) => [x.u, x.n])) };
    U.store.set(key, now);
    if (!prev || prev.total >= b.total) return;
    const deltas = b.hits.map((x) => ({ u: x.u, n: x.n - ((prev.hits || {})[x.u] || 0) })).filter((x) => x.n > 0);
    if (!deltas.length) return;
    replay(card, b, prev.total, deltas);
  });
  function replay(card, b, from, deltas) {
    const arena = card.querySelector('.arena');
    if (!arena) return;
    replaying = true;
    let hp = Math.max(0, b.goal - from);
    const setHp = () => {
      const w = (hp / b.goal) * 100 + '%';
      arena.querySelector('.ar-hp .now').style.width = w;
      arena.querySelector('.ar-hp .lag').style.width = w;
      arena.querySelector('.ar-hp b').textContent = `${L.num(hp)} / ${L.num(b.goal)}`;
    };
    setHp();
    const tag = document.createElement('div');
    tag.className = 'ar-replay';
    tag.textContent = L('اللي حصل وانت مش هنا ⏩', 'While you were away ⏩', 'ما حدث في غيابك ⏩');
    arena.appendChild(tag);
    // a few hits at most: big gaps are split, many people are grouped
    const hits = [];
    for (const d of deltas) {
      const parts = Math.min(3, Math.max(1, Math.round(d.n / 15)));
      for (let k = 0; k < parts; k++) hits.push({ u: d.u, n: Math.round(d.n / parts) });
    }
    const seq = hits.slice(0, 8);
    let i = 0;
    const step = () => {
      if (!arena.isConnected) return (replaying = false);
      if (i >= seq.length) {
        tag.remove();
        replaying = false;
        hp = b.hp;
        setHp();
        if (b.dead && !card.querySelector('.ar-win')) V.render();
        return;
      }
      const h = seq[i++];
      hit(arena, h.u, h.n, () => {
        hp = Math.max(0, hp - h.n);
        setHp();
      });
      setTimeout(step, 520);
    };
    setTimeout(step, 400);
  }
  function hit(arena, uid, n, done) {
    const mon = arena.querySelector('.ar-mon');
    const mate = arena.querySelector(`.ar-mate[data-uid="${CSS.escape(uid)}"]`) || arena.querySelector('.ar-mate');
    if (!mon || !mate) return done && done();
    const w = mate.dataset.w || '📚';
    mate.classList.remove('jump');
    void mate.offsetWidth;
    mate.classList.add('jump');
    fly(w, mate.querySelector('.pl-st'), mon.querySelector('.lot') || mon, 460).then((at) => {
      done && done();
      const boom = document.createElement('div');
      boom.className = 'pl-boom';
      boom.style.left = at.x + 'px';
      boom.style.top = at.y + 'px';
      document.body.appendChild(boom);
      if (A.Lot) A.Lot.play(boom, '1f4a5', { loop: false, speed: 1.8, detached: true, once: () => boom.remove() });
      setTimeout(() => boom.remove(), 1500);
      mon.classList.remove('hit');
      void mon.offsetWidth;
      mon.classList.add('hit');
      arena.classList.remove('shake');
      void arena.offsetWidth;
      arena.classList.add('shake');
      const d = document.createElement('div');
      d.className = 'ar-dmg';
      d.textContent = '−' + L.num(n);
      const r = arena.getBoundingClientRect();
      d.style.left = at.x - r.left + 'px';
      d.style.top = at.y - r.top - 30 + 'px';
      arena.appendChild(d);
      setTimeout(() => d.remove(), 1000);
      vib(18);
    });
  }

  /* ---------- hooks ---------- */
  const celebrate = V.celebrate;
  V.celebrate = () => {
    celebrate();
    if (!['members', 'throws', 'priv'].every((k) => S.loaded[k]) || !D.joined()) return;
    P.checkUnlocks();
    P.checkReceived();
  };
  // a member's menu: throw something at them
  if (V.addMemberMenu) V.addMemberMenu((uid) => (P.canThrowAt(uid) ? { ic: 'sparkle', t: L('ارمي عليه حاجة 😄', 'Throw something 😄', 'ارمِ عليه شيئًا 😄'), fn: () => P.throwSheet(uid) } : null));
})();
