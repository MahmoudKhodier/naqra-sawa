/* Standalone app: sign-in by email code, circles (create / join by invite / switch), members, settings extras. */
(function () {
  'use strict';
  const A = window.A;
  const { U, L, S, D, V, P } = A;
  const esc = U.esc;
  const icon = U.icon;
  const Auth = (A.Auth = {});
  const app = () => document.getElementById('app');

  const shell = (inner) => `<div class="onboard"><div class="ob-art" aria-hidden="true"><span class="star8 gold big"></span><span class="star8 lapis"></span><span class="star8 jade sm"></span><span class="star8 rubric xs"></span></div>
    <div class="ob-card">${inner}</div></div>`;
  const langBtn = `<button class="ib lang ob-lang" data-auth="lang" aria-label="${L('English', 'العربية')}">${L('EN', 'ع')}</button>`;

  /* Invite links look like …/#join-abc123def456 */
  Auth.readInvite = () => {
    const m = (location.hash || '').match(/^#join-([a-z0-9]{6,32})$/i);
    if (m) {
      U.store.set('pendingJoin', m[1].toLowerCase());
      history.replaceState(null, '', location.pathname + location.search);
    }
    return U.store.get('pendingJoin', null);
  };

  /* ---------- sign in ---------- */
  Auth.signIn = (state = {}) => {
    const invited = !!U.store.get('pendingJoin', null);
    app().innerHTML = shell(`${langBtn}
      <small class="eyebrow">${invited ? L('عندك دعوة لحلقة قراءة 🎉', 'You have an invitation to a reading circle 🎉') : L('حلقة قراءة لأصحابك وعيلتك', 'A reading circle for friends and family')}</small>
      <h1>${L('نقرأ سوا', 'Read Together')}</h1>
      <p class="lead">${L('ادخل بإيميلك. هنبعتلك كود من أرقام تكتبه هنا — من غير باسورد.', "Sign in with your email. We'll send you a short code to type here — no password.")}</p>
      ${state.sent
        ? `<form id="auth-code" class="ob-form">
            <label for="auth-otp">${L(`الكود اللي وصل على ${esc(state.email)}`, `The code sent to ${esc(state.email)}`)}</label>
            <input id="auth-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required dir="ltr" class="otp" placeholder="••••••">
            <button class="btn gold big full" type="submit">${L('ادخل', 'Sign in')}</button>
            <p class="muted sm">${L('ملقتش الإيميل؟ بص في الـSpam. وممكن تدوس على اللينك اللي في الإيميل بدل الكود.', "Can't find it? Check spam. You can also tap the link in the email instead.")}</p>
            <div class="row-btns"><button type="button" class="btn ghost sm" data-auth="back">${L('غيّر الإيميل', 'Change email')}</button><button type="button" class="btn ghost sm" data-auth="resend" id="auth-resend">${L('ابعت تاني', 'Resend')}</button></div>
          </form>`
        : `<form id="auth-email" class="ob-form">
            <label for="auth-mail">${L('الإيميل', 'Email')}</label>
            <input id="auth-mail" type="email" inputmode="email" autocomplete="email" required dir="ltr" value="${esc(state.email || '')}" placeholder="name@example.com">
            <button class="btn gold big full" type="submit">${L('ابعتلي الكود', 'Send me a code')}</button>
          </form>`}
      <p class="err-t" id="auth-err" hidden></p>`);
    const f = app().querySelector('form');
    setTimeout(() => f.querySelector('input').focus(), 50);
  };
  const authErr = (msg) => {
    const el = document.getElementById('auth-err');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  };
  let authState = {};
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'auth-email') {
      e.preventDefault();
      const email = e.target.querySelector('#auth-mail').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr(L('اكتب إيميل صحيح', 'Enter a valid email'));
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await P.sendCode(email);
        authState = { email, sent: true, at: Date.now() };
        Auth.signIn(authState);
      } catch (er) {
        btn.disabled = false;
        authErr(/rate|seconds|too many/i.test(er.message || '') ? L('استنى دقيقة قبل ما تطلب كود تاني', 'Wait a minute before asking for another code') : L('مقدرتش أبعت الكود. اتأكد من النت وجرّب تاني.', "Couldn't send the code. Check your connection and try again."));
      }
    }
    if (e.target.id === 'auth-code') {
      e.preventDefault();
      const code = e.target.querySelector('#auth-otp').value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
      if (code.length < 6) return authErr(L('الكود ناقص', 'That code is too short'));
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const session = await P.verifyCode(authState.email, code);
        Auth.enter(session);
      } catch (er) {
        btn.disabled = false;
        authErr(L('الكود غلط أو خلص وقته. اطلب كود جديد.', 'Wrong or expired code. Ask for a new one.'));
      }
    }
    if (e.target.id === 'circle-new') {
      e.preventDefault();
      const name = e.target.querySelector('#cn-name').value.trim();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const c = await P.createCircle(name);
        U.store.set('circle', c.id);
        location.reload();
      } catch (er) {
        btn.disabled = false;
        U.toast(L('مقدرتش أعمل الحلقة. جرّب تاني.', "Couldn't create the circle. Try again."), 'warn');
      }
    }
    if (e.target.id === 'circle-join') {
      e.preventDefault();
      const raw = e.target.querySelector('#cj-code').value.trim();
      const m = raw.match(/join-([a-z0-9]{6,32})/i) || raw.match(/^([a-z0-9]{6,32})$/i);
      if (!m) return U.toast(L('الكود أو اللينك مش صح', "That code or link doesn't look right"), 'warn');
      await Auth.join(m[1].toLowerCase());
    }
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-auth]');
    if (!b) return;
    const a = b.dataset.auth;
    if (a === 'lang') {
      L.set(L.isAr() ? 'en' : 'ar');
      if (document.getElementById('auth-email') || document.getElementById('auth-code')) Auth.signIn(authState);
      else if (document.querySelector('.circles-pick')) Auth.circlesScreen(Auth._circles || []);
    } else if (a === 'back') {
      authState = { email: authState.email };
      Auth.signIn(authState);
    } else if (a === 'resend') {
      if (Date.now() - (authState.at || 0) < 60000) return U.toast(L('استنى دقيقة قبل ما تطلب تاني', 'Wait a minute before resending'));
      try {
        await P.sendCode(authState.email);
        authState.at = Date.now();
        U.toast(L('بعتنا كود جديد', 'New code sent'));
      } catch (er) {
        U.toast(L('مقدرتش أبعت', "Couldn't send"), 'warn');
      }
    } else if (a === 'signout') P.signOut();
    else if (a === 'pick') {
      U.store.set('circle', b.dataset.id);
      location.reload();
    }
  });

  Auth.join = async (code) => {
    try {
      const c = await P.joinCircle(code);
      U.store.set('pendingJoin', null);
      U.store.set('circle', c.id);
      U.store.set('justJoined', c.name);
      location.reload();
    } catch (er) {
      U.store.set('pendingJoin', null);
      U.toast(L('كود الدعوة ده مش شغال. اطلب لينك جديد من صاحب الحلقة.', "That invite code doesn't work. Ask the circle owner for a new link."), 'warn');
      return false;
    }
  };

  /* ---------- circles ---------- */
  Auth.circlesScreen = (circles) => {
    Auth._circles = circles;
    app().innerHTML = shell(`${langBtn}
      <div class="circles-pick">
      <small class="eyebrow">${L('أهلا بيك 👋', 'Welcome 👋')}</small>
      <h1>${L('الحلقات', 'Circles')}</h1>
      <p class="lead">${L('الحلقة هي المجموعة اللي بتقرأ معاها: أصحابك، عيلتك، أو زمايلك. ممكن تكون في أكتر من حلقة.', 'A circle is the group you read with: friends, family or colleagues. You can be in more than one.')}</p>
      ${circles.length ? `<div class="clist">${circles.map((c) => `<button class="citem" data-auth="pick" data-id="${esc(c.id)}"><span class="star8 sm ${c.role === 'owner' ? 'gold' : 'lapis'}"></span><b dir="auto">${esc(c.name)}</b><small>${{ owner: L('صاحب الحلقة', 'Owner'), admin: L('مشرف', 'Admin'), member: L('عضو', 'Member') }[c.role] || ''}</small></button>`).join('')}</div>` : ''}
      <form id="circle-join" class="ob-form">
        <label for="cj-code">${L('عندك لينك أو كود دعوة؟', 'Have an invite link or code?')}</label>
        <div class="row"><input id="cj-code" dir="ltr" autocomplete="off" placeholder="${L('الصق اللينك أو الكود', 'Paste the link or code')}"><button class="btn">${L('ادخل', 'Join')}</button></div>
      </form>
      <form id="circle-new" class="ob-form">
        <label for="cn-name">${L('أو اعمل حلقة جديدة', 'Or start a new circle')}</label>
        <div class="row"><input id="cn-name" dir="auto" maxlength="60" placeholder="${L('مثلا: حلقة العيلة', 'e.g. Family circle')}" required><button class="btn gold">${L('اعمل', 'Create')}</button></div>
      </form>
      <div class="row-btns end"><button class="btn ghost sm" data-auth="signout">${icon('back', 'flip')}${L('خروج', 'Sign out')}</button></div>
      </div>`);
  };

  /* After sign-in: join pending invite, pick a circle, open it, start the app. */
  Auth.enter = async (session) => {
    const uid = session.user.id;
    Auth.uid = uid;
    Auth.email = session.user.email;
    const pending = Auth.readInvite();
    if (pending) {
      const ok = await Auth.join(pending);
      if (ok !== false) return;
    }
    let circles;
    try {
      circles = await P.myCircles(uid);
      U.store.set('circles:' + uid, circles);
    } catch (e) {
      circles = U.store.get('circles:' + uid, []);
    }
    A.CIRCLES = circles;
    if (!circles.length) return Auth.circlesScreen([]);
    const cur = circles.find((c) => c.id === U.store.get('circle', null)) || circles[0];
    U.store.set('circle', cur.id);
    A.CIRCLE = cur;
    app().innerHTML = `<div class="boot"><span class="star8 gold big spin"></span><b dir="auto">${esc(cur.name)}</b><small>${L('بنجهّز الحلقة…', 'Getting the circle ready…')}</small></div>`;
    try {
      await P.open(cur, uid);
    } catch (e) {
      console.warn(e);
      if (e && (e.code === 'revoked' || e.code === 'invalid_argument')) {
        U.store.set('circle', null);
        return Auth.circlesScreen(circles.filter((c) => c.id !== cur.id));
      }
      app().innerHTML = shell(`<h1>${L('مفيش نت', 'No connection')}</h1><p class="lead">${L('محتاجين نت أول مرة تفتح فيها الحلقة على الجهاز ده.', 'You need a connection the first time you open this circle on this device.')}</p><div class="row-btns"><button class="btn" onclick="location.reload()">${L('جرّب تاني', 'Try again')}</button></div>`);
      return;
    }
    P.onKicked = () => {
      U.toast(L('اتشلت من الحلقة دي', 'You were removed from this circle'), 'warn');
      U.store.set('circle', null);
      setTimeout(() => location.reload(), 1800);
    };
    const jj = U.store.get('justJoined', null);
    if (jj) {
      U.store.set('justJoined', null);
      setTimeout(() => U.toast(L(`انضميت لـ«${esc(jj)}» 🎉`, `You joined “${esc(jj)}” 🎉`), 'gold'), 1200);
    }
    await D.init();
  };

  /* ---------- circle switcher, invites and members ---------- */
  V.circleMenu = () => {
    const circles = A.CIRCLES || [];
    const items = circles.map((c) => ({ ic: c.id === (A.CIRCLE || {}).id ? 'check' : 'users', t: esc(c.name), fn: () => { if (c.id !== A.CIRCLE.id) { U.store.set('circle', c.id); location.reload(); } } }));
    items.push({ ic: 'plus', t: L('حلقة جديدة أو كود دعوة', 'New circle or invite code'), fn: () => Auth.circlesScreen(circles) });
    V.menu(items);
  };
  V.actions['circle-menu'] = () => V.circleMenu();

  V.actions.invite = () => {
    const c = P.circle ? P.circle() : A.CIRCLE;
    const link = P.inviteLink(c.invite_code);
    const canAdmin = ['owner', 'admin'].includes(P.role());
    const msg = L(`تعالى نقرأ سوا في «${c.name}» 📚\n${link}`, `Come read with us in “${c.name}” 📚\n${link}`);
    V.sheet({
      title: L('ادعُ أصحابك وعيلتك', 'Invite friends and family'),
      html: `<p class="muted">${L('ابعت اللينك ده. اللي يفتحه يدخل بإيميله وينضم للحلقة على طول.', 'Send this link. Whoever opens it signs in with their email and joins straight away.')}</p>
        <div class="copy-row"><code id="inv-url">${esc(link)}</code></div>
        <div class="row-btns">${navigator.share ? `<button class="btn gold" data-share>${icon('share')}${L('شارك', 'Share')}</button>` : ''}<button class="btn" data-copy>${L('انسخ اللينك', 'Copy link')}</button><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a></div>
        <p class="muted sm">${L('أو الكود:', 'Or the code:')} <b class="code" dir="ltr">${esc(c.invite_code)}</b></p>
        ${canAdmin ? `<button class="lnk sm" data-reset>${L('اعمل لينك جديد (القديم يبطل)', 'Make a new link (the old one stops working)')}</button>` : ''}`,
      onMount: (body, api) =>
        body.addEventListener('click', async (e) => {
          if (e.target.closest('[data-share]')) {
            try {
              await navigator.share({ title: L('نقرأ سوا', 'Read Together'), text: msg });
            } catch (er) {}
          }
          if (e.target.closest('[data-copy]')) {
            const ok = await U.copy(link, body.querySelector('#inv-url'));
            U.toast(ok ? L('اتنسخ اللينك', 'Link copied') : L('اختار اللينك وانسخه', 'Select the link to copy'));
          }
          if (e.target.closest('[data-reset]')) {
            if (!(await V.confirm(L('اللينك القديم هيبطل. اللي في الحلقة هيفضلوا فيها.', 'The old link stops working. Current members stay.'), L('اعمل لينك جديد', 'New link')))) return;
            try {
              await P.resetInvite(c.id);
              await P.resync();
              api.close();
              V.actions.invite();
            } catch (er) {
              U.toast(L('مقدرتش أغيّر اللينك', "Couldn't change the link"), 'warn');
            }
          }
        }),
    });
  };

  V.memberMenu = (uid) => {
    const myRole = P.role();
    const theirRole = P.role(uid);
    const items = [{ ic: 'user', t: L(`ملف ${esc(D.name(uid))}`, `${esc(D.name(uid))}'s profile`), fn: () => V.go('me', { uid }) }];
    if (uid !== S.me && myRole === 'owner' && theirRole !== 'owner')
      items.push(theirRole === 'admin'
        ? { ic: 'user', t: L('شيل الإشراف', 'Remove admin'), fn: async () => { await P.setRole(A.CIRCLE.id, uid, 'member').catch(() => U.toast(L('ماتعملش', 'Failed'), 'warn')); P.resync(); } }
        : { ic: 'bolt', t: L('خلّيه مشرف', 'Make admin'), fn: async () => { await P.setRole(A.CIRCLE.id, uid, 'admin').catch(() => U.toast(L('ماتعملش', 'Failed'), 'warn')); P.resync(); } });
    if (uid !== S.me && (myRole === 'owner' || (myRole === 'admin' && theirRole === 'member')))
      items.push({ ic: 'trash', danger: true, t: L('شيله من الحلقة', 'Remove from circle'), fn: async () => {
        if (!(await V.confirm(L(`هتشيل ${esc(D.name(uid))} من الحلقة.`, `Remove ${esc(D.name(uid))} from the circle?`), L('شيل', 'Remove'), true))) return;
        await P.removeMember(A.CIRCLE.id, uid).catch(() => U.toast(L('ماتعملش', 'Failed'), 'warn'));
        P.resync();
      } });
    V.menu(items);
  };

  /* Extra settings shown on my profile. */
  V.extraSettings = () => {
    const c = A.CIRCLE || {};
    const role = P.role ? P.role() : '';
    const installable = !!Auth.installPrompt;
    const apk = P.cfg.apkUrl;
    return `<div class="set-row"><span>${icon('users')}${L('الحلقة', 'Circle')}: <b dir="auto">${esc((P.circle && P.circle().name) || c.name || '')}</b></span><div class="row-btns" style="margin:0"><button class="btn ghost sm" data-act="circle-menu">${L('بدّل', 'Switch')}</button>${role && role !== 'owner' ? `<button class="btn ghost sm" data-act="leave-circle">${L('اخرج منها', 'Leave')}</button>` : ''}</div></div>
      ${V.reminderSettings ? V.reminderSettings() : ''}
      ${installable ? `<div class="set-row"><span>${icon('download')}${L('ثبّت التطبيق على موبايلك', 'Install the app on this device')}</span><button class="btn sm gold" data-act="install">${L('ثبّت', 'Install')}</button></div>` : ''}
      ${apk && !P.native ? `<div class="set-row"><span>${icon('download')}${L('تطبيق أندرويد (APK)', 'Android app (APK)')}</span><a class="btn ghost sm" href="${esc(apk)}" target="_blank" rel="noopener">${L('نزّل', 'Download')}</a></div>` : ''}
      <div class="set-row"><span>${icon('user')}<span dir="ltr">${esc(Auth.email || '')}</span></span><button class="btn ghost sm" data-auth="signout">${L('خروج', 'Sign out')}</button></div>`;
  };
  V.actions['leave-circle'] = async () => {
    if (!(await V.confirm(L('هتخرج من الحلقة دي. ممكن ترجع بلينك دعوة.', 'You will leave this circle. You can come back with an invite link.'), L('اخرج', 'Leave'), true))) return;
    try {
      await P.leaveCircle(A.CIRCLE.id);
      U.store.set('circle', null);
      location.reload();
    } catch (e) {
      U.toast(L('ماتعملش', 'Failed'), 'warn');
    }
  };

  /* PWA install prompt (Android Chrome / desktop). */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    Auth.installPrompt = e;
  });
  V.actions.install = async () => {
    const p = Auth.installPrompt;
    if (!p) return;
    p.prompt();
    try {
      await p.userChoice;
    } catch (e) {}
    Auth.installPrompt = null;
    V.render();
  };

  /* Android hardware back button. */
  Auth.nativeBack = () => {
    const App = P.plugin('App');
    if (!App || !App.addListener) return;
    App.addListener('backButton', () => {
      if (V.sheets.length) return V.sheets[V.sheets.length - 1].close();
      if (A.R.isOpen()) return A.R.close();
      if (V.state.route !== 'home') return V.go(V.state.route.startsWith('book-') ? 'books' : 'home');
      App.exitApp && App.exitApp();
    });
  };
})();
