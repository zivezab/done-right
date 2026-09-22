/* Done Right — Me, Auth, Onboarding, Settings, static pages */
(function (DR) {
  'use strict';
  const { esc } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  DR.userAvatar = (u, cls = '') => {
    const fallback = DR.ui.avatar(u ? u.id : 'guest', u && u.gender === 'F' ? 'F' : 'M', 1);
    return u && u.avatar ? `<img class="${cls}" data-file="${u.avatar.id}" src="${fallback}" alt="">` : `<img class="${cls}" src="${fallback}" alt="">`;
  };
  DR.LOGO = '<svg viewBox="0 0 512 512" class="logo" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#d9412b"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#lg)"/><path d="M150 268l72 72 150-160" fill="none" stroke="#fff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  DR.ensureProvider = (u) => {
    if (!u.provider) {
      u.provider = { status: 'draft', createdAt: Date.now(), subs: [], services: [], headline: '', bio: '', years: 1, languages: ['English'], area: S().area, serves: 'all', travelFee: 0, skills: [], availability: DR.defaultAvailability(), paused: false };
    }
    u.roles = Object.assign({ consumer: true }, u.roles, { provider: true });
  };

  // ---------------------------------------------------------------- Me
  DR.page('/me', () => {
    const u = DR.store.user();
    const s = S();
    if (u) DR.verify.tickAll();
    const orders = u ? s.orders.filter((o) => o.userId === u.id) : [];
    const cnt = (k) => orders.filter((o) => o.status === k).length;
    const pv = u && u.provider;
    const jobs = u ? s.orders.filter((o) => o.providerId === u.id) : [];
    const m = new Date().getMonth();
    const earnings = jobs.filter((o) => ['to_review', 'completed'].includes(o.status) && new Date(o.paidAt || o.createdAt).getMonth() === m).reduce((a, o) => a + o.price, 0);
    const trust = u ? DR.verify.score(u) : null;
    const unread = DR.chat.unreadTotal(DR.store.sessionId());
    const upcomingJobs = jobs.filter((o) => o.status === 'upcoming').length;
    const services = [
      ['/verify', 'verified', 'Verification centre'], ['#invite', 'gift', 'Invite friends', 'Get S$10'], ['/quotes', 'quote', 'My quote requests'], ['/chat/support', 'headset', 'Customer support'],
      ['#vouchers', 'ticket', 'Vouchers'], ['/my-reviews', 'star', 'My reviews'], ['/verify/business', 'store', 'Business onboarding'], ['/pro', 'briefcase', 'Provider recruitment'],
    ];
    return {
      tab: 'me', title: 'Me',
      html: `<div class="me-hero">
          <div class="me-top"><span class="grow"></span><a class="icon-btn" href="#/settings" aria-label="Settings">${icon('settings')}</a><a class="icon-btn" href="#/messages" aria-label="Messages">${icon('chat')}${unread ? `<i class="dot-badge">${unread}</i>` : ''}</a></div>
          ${u ? `<a class="me-user" href="#/settings/profile">${DR.userAvatar(u, 'me-av')}<div class="grow minw0"><div class="me-name ellipsis" ${u.name ? 'data-no-i18n' : ''}>${esc(u.name || 'Set your name')}</div><div class="small muted">Edit / view profile ${icon('right', 12)}</div>
              <div class="chips-xs mt4"><span class="chip-xs ${trust.level === 'Basic' ? '' : 'chip-ok'}">${icon('shield', 11)} ${trust.level}</span>${pv ? `<span class="chip-xs">${pv.status === 'live' ? (pv.paused ? 'Provider · Paused' : 'Provider · Live') : 'Provider · Draft'}</span>` : ''}<span class="chip-xs">${DR.COUNTRIES[u.country || s.country].flag} ${esc(DR.COUNTRIES[u.country || s.country].name)}</span></div></div></a>`
          : `<div class="me-user">${DR.userAvatar(null, 'me-av')}<div class="grow"><div class="me-name">Welcome to Done Right</div><div class="small muted">Book faster, track orders and earn with your skills</div><a class="btn btn-primary btn-sm mt8" href="#/auth?next=%2Fme">Sign in / Register</a></div></div>`}
        </div>
        <button class="card vip-bar" id="vip"><b>Done Right Plus</b><span class="grow"></span><span class="small muted">5% off Select services</span><span class="btn btn-light btn-xs">${s.vip ? 'Member' : 'Join now'}</span></button>
        <section class="card wallet">
          <div class="wallet-main">
            <div class="wallet-grid"><button class="wallet-stat" data-sheet="vouchers"><b>0</b><small>Vouchers</small></button><div class="wallet-stat"><b>0<small>.00</small></b><small>Wallet</small></div><a class="wallet-stat" href="#/pro/jobs?tab=completed"><b>${Math.floor(earnings)}<small>.00</small></b><small>Earnings</small></a></div>
            <div class="shortcuts"><a href="#/cart">${icon('cart', 24)}<small>Cart</small></a><a href="#/history">${icon('history', 24)}<small>History</small></a><a href="#/cart?tab=following&f=shops">${icon('store', 24)}<small>Shops</small></a></div>
          </div>
          <div class="follow-tiles">
            <a class="ftile" href="#/cart?tab=following"><span class="ftile-ic">${s.follows.providers.length || icon('plus', 20)}</span><small>Followed pros</small></a>
            <a class="ftile" href="#/cart?tab=following&f=services"><span class="ftile-ic">${s.follows.services.length || icon('plus', 20)}</span><small>Saved services</small></a>
          </div>
        </section>
        <section class="card"><div class="card-h"><h2>My orders</h2><a class="more" href="#/orders">All ${icon('right', 13)}</a></div>
          <div class="order-icons">${[['to_pay', 'wallet', 'To pay'], ['upcoming', 'calendar', 'Upcoming'], ['to_confirm', 'checkCircle', 'To confirm'], ['to_review', 'smile', 'To review']].map(([k, ic, l]) => `<a class="oi" href="#/orders?tab=${k}">${icon(ic, 28)}${cnt(k) ? `<i class="dot-badge">${cnt(k)}</i>` : ''}<small>${l}</small></a>`).join('')}</div>
        </section>
        ${pv ? `<section class="card"><div class="card-h"><h2>Provider centre</h2><a class="more" href="#/pro">Dashboard ${icon('right', 13)}</a></div>
            <div class="stat-cards"><a class="stat-card" href="#/pro/jobs"><b>${upcomingJobs}</b><small>Upcoming jobs</small></a><a class="stat-card" href="#/pro/services"><b>${pv.services.length}</b><small>Services</small></a><a class="stat-card" href="#/pro/availability"><b>${Object.values(pv.availability.weekly).filter((x) => x.length).length}/7</b><small>Days open</small></a></div>
            ${pv.status !== 'live' ? `<a class="btn btn-primary btn-block mt12" href="#/pro/setup">Finish setup & go live</a>` : ''}</section>`
        : `<a class="card pro-cta" href="#/pro"><div><b>Earn with your skills</b><p class="small muted">Tutors, coaches, engineers, cleaners & more — set your own prices and hours.</p><span class="btn btn-primary btn-sm mt8">Become a provider</span></div><span class="pro-cta-art" aria-hidden="true">🧑‍🏫🧑‍💻🏊</span></a>`}
        ${u ? `<a class="card v-card" href="#/verify"><div class="row between"><b>${icon('verified', 18, 'green')} Trust level: ${trust.level}</b><span class="muted small">${trust.done}/${trust.total} ${icon('right', 12)}</span></div><div class="progress mt8"><i style="width:${trust.score}%"></i></div><p class="muted xs mt4">Add ID, education, certificates and work history — like a verified LinkedIn for services.</p></a>` : ''}
        <section class="card"><div class="card-h"><h2>My services</h2></div>
          <div class="svc-icons">${services.map(([href, ic, l, badge]) => `<a class="si" ${href.startsWith('#') ? `href="#/me" data-sheet="${href.slice(1)}"` : `href="#${href}"`}>${badge ? `<i class="si-badge">${badge.replace('S$', DR.COUNTRIES[s.country].currency)}</i>` : ''}${icon(ic, 26)}<small>${l}</small></a>`).join('')}</div>
        </section>
        <p class="foot-note"><a href="#/page/help">Help centre</a> · <a href="#/page/about">About</a> · <a href="#/page/privacy">Privacy</a></p>`,
      mount(el) {
        el.querySelector('#vip').onclick = () => {
          DR.ui.sheet({ title: 'Done Right Plus', html: `<div class="center"><div class="plus-badge">PLUS</div><p class="mt12">5% off all Select services, priority matching, free rescheduling and a dedicated support line.</p><p class="price price-lg mt12"><b>${money(S().country === 'SG' ? 9.9 : 19.9)}</b><small>/month</small></p><p class="muted xs mt8">Demo — no charge will be made.</p><button class="btn btn-primary btn-block mt16" data-close id="join">${S().vip ? 'Cancel membership' : 'Start 30-day free trial'}</button></div>`, mount(sh) { sh.querySelector('#join').addEventListener('click', () => { if (!DR.store.user()) return DR.router.go('/auth?next=%2Fme'); DR.store.update((st) => { st.vip = !st.vip; }); DR.ui.toast(S().vip ? 'Welcome to Done Right Plus!' : 'Membership cancelled'); }); } });
        };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sheet]'); if (!b) return;
          e.preventDefault();
          if (b.dataset.sheet === 'vouchers') {
            DR.ui.sheet({ title: 'Vouchers', html: `${DR.ui.empty('box', 'No vouchers yet')}<form class="row gap8" id="vf"><input class="input grow" placeholder="Enter voucher code" name="code"><button class="btn btn-primary">Redeem</button></form>`, mount(sh) { sh.querySelector('#vf').onsubmit = (ev) => { ev.preventDefault(); DR.ui.toast('This voucher code is invalid or has expired'); }; } });
          }
          if (b.dataset.sheet === 'invite') {
            const u = DR.store.user();
            if (!u) return DR.router.go('/auth?next=%2Fme');
            const code = 'DR' + u.id.replace(/\D/g, '').slice(-6);
            const c = DR.COUNTRIES[S().country].currency;
            DR.ui.sheet({ title: 'Invite friends', html: `<div class="center"><div class="invite-art">🎁</div><h3>Give ${c}10, get ${c}10</h3><p class="muted small">Your friend gets ${c}10 off their first booking. You get ${c}10 when they complete it.</p><div class="code-box mt12">${code}</div><button class="btn btn-primary btn-block mt12" id="shr">Share invite link</button></div>`, mount(sh) { sh.querySelector('#shr').onclick = () => DR.share('Done Right', `Use my code ${code} for ${c}10 off your first Done Right booking!`); } });
          }
        });
      },
    };
  });

  DR.page('/history', () => {
    const list = S().history.map((h) => DR.data.provider(h.id)).filter(Boolean);
    return {
      title: 'Browsing history',
      html: `${DR.ui.navbar({ title: 'Browsing history', right: list.length ? `<button class="icon-btn" id="clr" aria-label="Clear">${icon('trash')}</button>` : '' })}<div class="plist mt8">${list.map((p) => DR.cards.provider(p)).join('') || DR.ui.empty('box', 'No browsing history')}</div>`,
      mount(el) { const c = el.querySelector('#clr'); if (c) c.onclick = () => DR.store.update((s) => { s.history = []; }); },
    };
  });

  DR.page('/my-reviews', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const list = S().reviews.filter((r) => r.userId === u.id);
    return { title: 'My reviews', html: `${DR.ui.navbar({ title: 'My reviews' })}<div class="card">${list.map((r) => { const p = DR.data.provider(r.providerId); return `${p ? `<a class="small brand" href="#/provider/${p.id}">${esc(p.name)} ${icon('right', 12)}</a>` : ''}${DR.reviewItem(r)}`; }).join('') || '<p class="muted center pad-v">You haven\'t written any reviews yet.</p>'}</div>` };
  });

  // ---------------------------------------------------------------- Auth (phone / email OTP — demo)
  const auth = { method: 'phone', cc: null, phone: '', email: '', sent: false, code: '', demo: '', agree: false, until: 0 };
  DR.page('/auth', ({ query }) => {
    if (DR.store.user()) { DR.router.go(query.next || '/me', { replace: true }); return null; }
    if (!auth.cc) auth.cc = S().country;
    const C = DR.COUNTRIES[auth.cc];
    const next = query.next || '/me';
    return {
      title: 'Sign in',
      html: `${DR.ui.navbar({ title: '' })}
      <div class="auth pad">
        <div class="center">${DR.LOGO}<h1 class="h1 mt12">Welcome to Done Right</h1><p class="muted small">Trusted, verified services across Singapore & Malaysia</p></div>
        <div class="mt16">${DR.ui.seg([['phone', `${icon('phone', 16)} Mobile`], ['email', `${icon('mail', 16)} Email`]], auth.method, 'method')}</div>
        <form id="af" class="form mt16" novalidate>
          ${auth.method === 'phone' ? DR.ui.field('Mobile number', `<div class="row gap8"><select class="input w-auto" name="cc">${Object.values(DR.COUNTRIES).map((c) => `<option value="${c.code}" ${c.code === auth.cc ? 'selected' : ''}>${c.flag} ${c.dial}</option>`).join('')}</select><input class="input grow" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="${C.phoneHint}" value="${esc(auth.phone)}" ${auth.sent ? 'readonly' : ''}></div>`)
          : DR.ui.field('Email address', `<input class="input" name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(auth.email)}" ${auth.sent ? 'readonly' : ''}>`)}
          ${auth.sent ? `${DR.ui.field('Verification code', `<input class="input otp" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••">`, `Sent to ${esc(auth.method === 'phone' ? `${C.dial} ${auth.phone}` : auth.email)} · <button type="button" class="link" id="resend">${auth.until > Date.now() ? `Resend in <span id="rs">${Math.ceil((auth.until - Date.now()) / 1000)}</span>s` : 'Resend code'}</button> · <button type="button" class="link" id="change">Change</button>`)}
            ${DR.backend.enabled && auth.method === 'email' ? `<p class="notice mt8">${icon('mail', 16)}<span>We emailed you a sign-in link. Open it in this browser window (copy and paste it into the address bar if your email app opens another window) — or enter the code if your email shows one.</span></p>` : ''}
            ${auth.demo ? `<div class="demo-box">${icon('sparkle', 14)} Demo mode: your code is <b>${auth.demo}</b></div>` : ''}` : ''}
          <label class="check"><input type="checkbox" id="agree" ${auth.agree ? 'checked' : ''}><span class="small">I agree to the <a href="#/page/terms">Terms of Service</a> and <a href="#/page/privacy">Privacy Policy</a>, and consent to the processing of my personal data under the ${esc(C.privacyLaw)}.</span></label>
          <button class="btn btn-primary btn-block">${auth.sent ? 'Verify & continue' : 'Send verification code'}</button>
        </form>
        <div class="or"><span>or</span></div>
        <button class="btn btn-ghost btn-block" id="digital">${icon('id', 18)} Continue with ${esc(C.digitalId)}</button>
        <button class="link muted center-block mt16" data-back>Browse as guest</button>
      </div>`,
      mount(el) {
        const f = el.querySelector('#af');
        el.addEventListener('click', (e) => {
          const m = e.target.closest('[data-method]');
          if (m) { auth.method = m.dataset.method; auth.sent = false; DR.router.refresh(); }
          if (e.target.closest('#change')) { auth.sent = false; DR.router.refresh(); }
          if (e.target.closest('#resend') && auth.until <= Date.now()) { sendCode(); }
          if (e.target.closest('#digital')) DR.ui.toast(`${C.digitalId} sign-in will be enabled at launch — please use mobile or email for now`);
        });
        el.querySelector('#agree').addEventListener('change', (e) => { auth.agree = e.target.checked; });
        const sel = f.querySelector('[name=cc]');
        if (sel) sel.addEventListener('change', () => { auth.cc = sel.value; auth.phone = f.phone.value; DR.router.refresh(); });
        f.addEventListener('input', (e) => { if (e.target.name === 'phone') auth.phone = e.target.value.replace(/\D/g, ''); if (e.target.name === 'email') auth.email = e.target.value.trim(); });
        const rs = el.querySelector('#rs');
        if (rs) { const t = setInterval(() => { const left = Math.ceil((auth.until - Date.now()) / 1000); if (left <= 0) { clearInterval(t); DR.router.refresh(); } else rs.textContent = left; }, 1000); DR.onLeave(() => clearInterval(t)); }
        const codeInput = f.querySelector('[name=code]');
        if (codeInput) codeInput.focus();
        const keyOf = () => (auth.method === 'phone' ? { phone: `${DR.COUNTRIES[auth.cc].dial}${auth.phone}` } : { email: auth.email.toLowerCase() });
        async function sendCode() {
          if (DR.backend.enabled) {
            try { await DR.backend.sendOtp(Object.assign(keyOf(), { country: auth.cc, next })); } catch (err) { return DR.ui.toast(err.message); }
            auth.demo = '';
            auth.sent = true; auth.until = Date.now() + 60000;
            DR.ui.toast(auth.method === 'email' ? 'Check your email for the sign-in link' : 'Verification code sent');
            return DR.router.refresh();
          }
          auth.demo = String(Math.floor(100000 + Math.random() * 900000));
          auth.sent = true; auth.until = Date.now() + 30000;
          DR.ui.toast(`Verification code sent (demo code ${auth.demo})`);
          DR.router.refresh();
        }
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!auth.agree) return DR.ui.toast('Please accept the Terms and Privacy Policy');
          if (!auth.sent) {
            if (auth.method === 'phone' && !DR.COUNTRIES[auth.cc].phone.test(auth.phone)) return DR.ui.toast(`Enter a valid ${DR.COUNTRIES[auth.cc].name} mobile number`);
            if (auth.method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(auth.email)) return DR.ui.toast('Enter a valid email address');
            return sendCode();
          }
          const key = keyOf();
          if (DR.backend.enabled) {
            let res;
            try { res = await DR.backend.verifyOtp(key, codeInput.value.trim()); } catch (err) { return DR.ui.toast('Incorrect code — please try again'); }
            if (!res.user) return DR.ui.toast('Could not sign in — please try again');
            Object.assign(auth, { sent: false, code: '', demo: '', phone: '', email: '' });
            DR.ui.toast(res.isNew ? 'Account created' : 'Welcome back!');
            return DR.router.go(res.isNew ? `/welcome?next=${encodeURIComponent(next)}` : next, { replace: true });
          }
          if (codeInput.value.trim() !== auth.demo) return DR.ui.toast('Incorrect code — please try again');
          let user = Object.values(S().users).find((x) => (key.phone && x.phone === key.phone) || (key.email && x.email === key.email));
          const isNew = !user;
          DR.store.update((s) => {
            if (!user) {
              user = { id: 'u' + String(Math.floor(100000 + Math.random() * 900000)), createdAt: Date.now(), name: '', gender: '', dob: '', country: auth.cc, phone: key.phone || '', email: key.email || '', roles: { consumer: true }, addresses: [], verification: {} };
              s.users[user.id] = user;
            }
            if (s.country !== user.country) { s.country = user.country; s.area = DR.POPULAR_AREAS[user.country][0]; }
          }, { render: false });
          DR.store.setSession(user.id);
          Object.assign(auth, { sent: false, code: '', demo: '', phone: '', email: '' });
          DR.ui.toast(isNew ? 'Account created' : 'Welcome back!');
          DR.router.go(isNew ? `/welcome?next=${encodeURIComponent(next)}` : next, { replace: true });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Welcome / onboarding
  DR.page('/welcome', ({ query }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const roles = { hire: true, offer: !!(u.roles && u.roles.provider) };
    return {
      title: 'Welcome',
      html: `${DR.ui.navbar({ title: 'Set up your account', back: false })}
      <form class="pad form" id="wf">
        <p class="muted">Tell us a little about you. You can change this anytime.</p>
        ${DR.ui.field('Full name', `<input class="input" name="name" required value="${esc(u.name)}" autocomplete="name" placeholder="As you'd like it shown">`, '', true)}
        ${DR.ui.field('Gender', DR.ui.seg([['F', 'Female'], ['M', 'Male'], ['X', 'Prefer not to say']], u.gender || 'X', 'gender'))}
        <h3 class="h3 mt12">How will you use Done Right?</h3>
        <div class="role-cards">
          <button type="button" class="role-card ${roles.hire ? 'on' : ''}" data-role="hire"><span class="role-emoji">🛎️</span><b>Book services</b><small>Find verified pros for home, lessons, tech & more</small>${icon('checkCircle', 20, 'role-check')}</button>
          <button type="button" class="role-card ${roles.offer ? 'on' : ''}" data-role="offer"><span class="role-emoji">💼</span><b>Offer my services</b><small>Tutor, coach, engineer, cleaner — get booked and paid</small>${icon('checkCircle', 20, 'role-check')}</button>
        </div>
        <p class="muted xs">Anyone can do both — the same account works as a customer and a provider.</p>
        <button class="btn btn-primary btn-block mt16">Continue</button>
      </form>`,
      mount(el) {
        let gender = u.gender || 'X';
        el.addEventListener('click', (e) => {
          const g = e.target.closest('[data-gender]'); if (g) { gender = g.dataset.gender; el.querySelectorAll('[data-gender]').forEach((x) => x.classList.toggle('on', x === g)); }
          const r = e.target.closest('[data-role]'); if (r) { roles[r.dataset.role] = !roles[r.dataset.role]; r.classList.toggle('on', roles[r.dataset.role]); }
        });
        el.querySelector('#wf').addEventListener('submit', (e) => {
          e.preventDefault();
          const name = e.target.name.value.trim();
          if (name.length < 2) return DR.ui.toast('Please enter your name');
          DR.store.update((s) => { const us = s.users[u.id]; us.name = name; us.gender = gender === 'X' ? '' : gender; us.roles = { consumer: roles.hire || !roles.offer, provider: roles.offer }; if (roles.offer) DR.ensureProvider(us); }, { render: false });
          DR.router.go(roles.offer ? '/pro/setup' : query.next || '/', { replace: true });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Settings
  const li = (href, label, value = '', cls = '') => `<a class="list-item ${cls}" href="#${href}"><span>${label}</span><span class="row gap6">${value}${icon('right', 16, 'muted')}</span></a>`;
  const btn = (id, label, value = '', cls = '') => `<button class="list-item ${cls}" id="${id}"><span>${label}</span><span class="row gap6">${value}${icon('right', 16, 'muted')}</span></button>`;
  DR.page('/settings', () => {
    const u = DR.store.user();
    const s = S();
    const iv = u && u.verification && u.verification.identity;
    const idLabel = !iv ? '<span class="brand small">Not verified</span>' : iv.status === 'verified' ? '<span class="green small">Verified</span>' : '<span class="gold small">In review</span>';
    return {
      title: 'Settings',
      html: `${DR.ui.navbar({ title: ('Settings') })}
      ${u ? `<div class="list card flush">${li('/settings/profile', 'Profile')}${li('/verify/identity', 'Identity verification', idLabel)}${li('/verify', 'Verification centre')}${li('/settings/addresses', 'Service addresses', `<span class="muted small">${(u.addresses || []).length}</span>`)}${btn('phone', 'Change mobile number', `<span class="muted small">${esc(u.phone || 'Not set')}</span>`)}${li('/settings/blocked', 'Blocked providers', `<span class="muted small">${s.blocked.length || ''}</span>`)}${li('/settings/notifications', 'Notifications')}${btn('delete', 'Delete account')}</div>` : ''}
      <div class="list card flush">${li('/city', 'Country / region', `<span class="muted small">${DR.COUNTRIES[s.country].flag} ${esc(DR.COUNTRIES[s.country].name)}</span>`)}${btn('lang', 'Language', `<span class="muted small">${esc(DR.LANGS.find((l) => l[0] === s.lang)[1])}</span>`)}${btn('theme', 'Appearance', `<span class="muted small">${{ system: 'System', dark: 'Dark', light: 'Light' }[s.theme]}</span>`)}${btn('cache', 'Clear cached images', '<span class="muted small">2.1 MB</span>')}</div>
      <div class="list card flush">${btn('feedback', 'Feedback')}${li('/page/help', 'Help centre')}${btn('rate', 'Rate Done Right')}${li('/page/guidelines', 'Community guidelines')}${li('/page/terms', 'Terms of service')}${li('/page/privacy', 'Privacy policy')}${li('/page/data', 'Personal data we collect')}${li('/page/third-party', 'Third-party data sharing')}${li('/page/about', 'About Done Right')}${li('/admin', 'Trust & Safety console (demo)')}${btn('reset', 'Reset demo data')}</div>
      ${u ? '<div class="pad mb16"><button class="btn btn-ghost btn-block" id="logout">Log out</button></div>' : '<div class="pad mb16"><a class="btn btn-primary btn-block" href="#/auth?next=%2Fsettings">Sign in / Register</a></div>'}`,
      mount(el) {
        const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
        const pickSheet = (title, opts, cur, apply) => {
          const sh = DR.ui.sheet({ title, html: `<div class="list">${opts.map(([k, l]) => `<button class="list-item" data-v="${k}"><span>${l}</span>${k === cur ? icon('check', 18, 'brand') : ''}</button>`).join('')}</div>`, mount(x) { x.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { sh.close(); apply(b.dataset.v); } }); } });
        };
        on('lang', () => pickSheet('Language', DR.LANGS, s.lang, (v) => DR.i18n.setLang(v)));
        on('theme', () => pickSheet('Appearance', [['system', 'Follow system'], ['dark', 'Dark'], ['light', 'Light']], s.theme, (v) => { DR.store.update((st) => { st.theme = v; }, { render: false }); DR.applyTheme(); DR.router.refresh(); }));
        on('cache', () => DR.ui.toast('Cache cleared'));
        on('rate', () => DR.ui.toast('Thanks! App store ratings open at launch.'));
        on('feedback', () => { const sh = DR.ui.sheet({ title: 'Feedback', html: '<textarea class="input" rows="5" placeholder="What can we do better?"></textarea><button class="btn btn-primary btn-block mt12" id="fs">Send</button>', mount(x) { x.querySelector('#fs').onclick = () => { sh.close(); DR.ui.toast('Thanks for your feedback!'); }; } }); });
        on('phone', () => DR.ui.toast('For security, changing your number requires OTP on both numbers — available at launch'));
        on('logout', async () => {
          if (!(await DR.ui.confirm({ title: 'Log out?', ok: 'Log out' }))) return;
          if (DR.backend.enabled) await DR.backend.signOut(); else DR.store.setSession(null);
          DR.router.go('/me', { replace: true });
        });
        on('delete', async () => {
          if (DR.backend.enabled) {
            // Server-side deletion needs the service role (Edge Function); until then support handles it.
            DR.ui.toast('Deletion requests are handled by support within 30 days');
            return DR.router.go('/chat/support');
          }
          if (await DR.ui.confirm({ title: 'Delete your account?', text: 'Your profile, provider listing, verification documents and history on this device will be permanently removed. This cannot be undone.', ok: 'Delete account', danger: true })) {
            const id = DR.store.sessionId();
            DR.files.collect(DR.store.s.users[id]).forEach((f) => DR.files.del(f));
            DR.store.update((st) => {
              delete st.users[id];
              Object.keys(st.idRegistry).forEach((h) => { if (st.idRegistry[h] === id) delete st.idRegistry[h]; });
              DR.store.audit({ actor: id, userId: id, item: 'Account', action: 'deleted (documents wiped)' });
            }, { render: false });
            DR.store.setSession(null);
            DR.ui.toast('Account deleted'); DR.router.go('/', { replace: true });
          }
        });
        on('reset', async () => { if (await DR.ui.confirm({ title: 'Reset all demo data?', text: 'Clears accounts, orders, follows and messages stored in this browser.', ok: 'Reset', danger: true })) { DR.store.reset(); location.hash = '#/'; location.reload(); } });
      },
    };
  });

  DR.page('/settings/profile', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const draft = { avatar: u.avatar || null };
    return {
      title: 'Profile',
      html: `${DR.ui.navbar({ title: 'Profile' })}
      <form class="pad form" id="pf">
        <div class="center"><label class="avatar-edit">${DR.userAvatar(u, 'av-xl round')}<input type="file" accept="image/*" name="avatar" hidden><span>${icon('camera', 16)}</span></label><p class="muted xs mt4">Use a clear, recent photo of your face — providers' photos are matched to their ID.</p></div>
        ${DR.ui.field('Full name', `<input class="input" name="name" required value="${esc(u.name)}">`, '', true)}
        ${DR.ui.field('Gender', `<select class="input" name="gender"><option value="">Prefer not to say</option><option value="F" ${u.gender === 'F' ? 'selected' : ''}>Female</option><option value="M" ${u.gender === 'M' ? 'selected' : ''}>Male</option></select>`)}
        ${DR.ui.field('Date of birth', `<input class="input" type="date" name="dob" value="${esc(u.dob || '')}" max="${DR.u.dateKey(new Date())}">`)}
        ${DR.ui.field('Email', `<input class="input" type="email" name="email" value="${esc(u.email || '')}">`)}
        ${DR.ui.field('Mobile', `<input class="input" value="${esc(u.phone || '—')}" disabled>`)}
        ${DR.ui.field('Country', `<select class="input" name="country">${Object.values(DR.COUNTRIES).map((c) => `<option value="${c.code}" ${c.code === (u.country || 'SG') ? 'selected' : ''}>${c.flag} ${c.name}</option>`).join('')}</select>`)}
        <button class="btn btn-primary btn-block mt12">Save</button>
      </form>`,
      mount(el) {
        const inp = el.querySelector('[name=avatar]');
        inp.addEventListener('change', async () => {
          try { draft.avatar = await DR.files.fromInput(inp.files[0], 600); el.querySelector('.avatar-edit img').src = await DR.files.get(draft.avatar.id); } catch (e) { DR.ui.toast(e.message); }
        });
        el.querySelector('#pf').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = Object.fromEntries(new FormData(e.target));
          if (fd.name.trim().length < 2) return DR.ui.toast('Please enter your name');
          DR.store.update((s) => { const us = s.users[u.id]; Object.assign(us, { name: fd.name.trim(), gender: fd.gender, dob: fd.dob, email: fd.email.trim(), country: fd.country, avatar: draft.avatar }); }, { render: false });
          DR.ui.toast('Profile saved'); DR.router.back('/me');
        });
      },
    };
  });

  DR.page('/settings/addresses', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const list = u.addresses || [];
    return {
      title: 'Addresses', bar: true,
      html: `${DR.ui.navbar({ title: 'Service addresses' })}
        <div class="card flush">${list.map((a) => `<div class="list-item"><span class="minw0"><b>${esc(a.label)}</b> <span class="muted xs">${esc(a.area)}</span><br><small class="muted ellipsis">${esc(a.line)} ${esc(a.unit)}, ${esc(a.postal)}</small></span><span class="row gap6"><button class="icon-btn sm" data-edit="${a.id}" aria-label="Edit">${icon('edit', 16)}</button><button class="icon-btn sm" data-del="${a.id}" aria-label="Delete">${icon('trash', 16)}</button></span></div>`).join('') || '<p class="muted center pad-v">No saved addresses</p>'}</div>
        <div class="bottom-bar"><button class="btn btn-primary grow" id="add">${icon('plus', 16)} Add address</button></div>`,
      mount(el) {
        el.querySelector('#add').onclick = () => DR.addressSheet(null, () => DR.router.refresh());
        el.addEventListener('click', async (e) => {
          const ed = e.target.closest('[data-edit]'); if (ed) DR.addressSheet(list.find((a) => a.id === ed.dataset.edit), () => DR.router.refresh());
          const del = e.target.closest('[data-del]');
          if (del && await DR.ui.confirm({ title: 'Delete this address?', ok: 'Delete', danger: true })) DR.store.update((s) => { s.users[u.id].addresses = s.users[u.id].addresses.filter((a) => a.id !== del.dataset.del); });
        });
      },
    };
  });

  DR.page('/settings/blocked', () => {
    const list = S().blocked.map((id) => DR.data.provider(id)).filter(Boolean);
    return {
      title: 'Blocked providers',
      html: `${DR.ui.navbar({ title: 'Blocked providers' })}<div class="card flush">${list.map((p) => `<div class="list-item"><span class="row gap10">${DR.cards.pimg(p, 0, 'av-sm round')}<b>${esc(p.name)}</b></span><button class="btn btn-ghost btn-xs" data-unblock="${p.id}">Unblock</button></div>`).join('') || '<p class="muted center pad-v">You haven\'t hidden any providers.</p>'}</div>`,
      mount(el) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-unblock]'); if (b) DR.store.update((s) => { s.blocked = s.blocked.filter((x) => x !== b.dataset.unblock); }); }); },
    };
  });

  DR.page('/settings/notifications', () => {
    const n = S().notif;
    const row = (k, l, d) => `<label class="list-item"><span><b>${l}</b><br><small class="muted">${d}</small></span><span class="switch"><input type="checkbox" data-n="${k}" ${n[k] ? 'checked' : ''}><i></i></span></label>`;
    return {
      title: 'Notifications',
      html: `${DR.ui.navbar({ title: 'Notifications' })}<div class="card flush">${row('bookings', 'Booking updates', 'Confirmations, reminders and arrival alerts')}${row('chat', 'Messages', 'Chats from providers and support')}${row('nearby', 'Nearby alerts', 'When providers you follow are near you')}${row('promos', 'Offers & promotions', 'Deals, vouchers and new services')}</div>`,
      mount(el) { el.addEventListener('change', (e) => { const k = e.target.dataset.n; if (k) DR.store.update((s) => { s.notif[k] = e.target.checked; }, { render: false }); }); },
    };
  });

  // ---------------------------------------------------------------- Static pages
  const PAGES = {
    help: ['Help centre', () => [['How do I book a service?', 'Choose a service or provider, pick an available time slot, add your address and pay securely. Your payment is held until you confirm the job is complete.'], ['How are providers verified?', 'Providers verify their identity with a government ID and selfie, and can submit education, licences, certifications, work experience, background checks and business registration. Each item is reviewed before a badge is shown.'], ['Cancellations & refunds', 'Cancel free of charge up to 24 hours before the appointment. Within 24 hours, a 50% fee may apply. Refunds go back to your original payment method in 3–5 working days.'], ['What is the Done Right Guarantee?', 'If a provider is late, doesn\'t show up, or the work isn\'t as described, report it before confirming completion. We\'ll arrange a redo, compensation or refund.'], ['How do I become a provider?', 'Go to Me › Become a provider. Pick your services, set prices and availability, verify your identity and go live — it takes about 10 minutes.'], ['How do payouts work?', 'Earnings are released when customers confirm completion and are paid out weekly to your PayNow (SG) or DuitNow / bank account (MY).']].map(([q, a]) => `<details class="faq"><summary>${q}${icon('down', 16)}</summary><p class="muted small">${a}</p></details>`).join('')],
    terms: ['Terms of service', () => `<p>These demo terms describe how Done Right connects customers with independent service providers in Singapore and Malaysia.</p><h3>1. The platform</h3><p>Done Right is a marketplace. Providers are independent professionals responsible for the services they deliver and for holding any licences required by law (for example EMA, PUB, HDB, CIDB, Suruhanjaya Tenaga or SPAN registrations).</p><h3>2. Bookings & payments</h3><p>Payments are collected by Done Right and held until the customer confirms completion. Off-platform payments are not protected and are prohibited.</p><h3>3. Conduct</h3><p>Harassment, discrimination, unsafe work and illegal or indecent services are strictly prohibited and result in permanent removal.</p><h3>4. Reviews</h3><p>Only customers with completed bookings may leave reviews. Fake or incentivised reviews are removed.</p>`],
    privacy: ['Privacy policy', () => `<p>We process personal data in accordance with the <b>Personal Data Protection Act 2012 (Singapore)</b> and the <b>Personal Data Protection Act 2010 (Malaysia)</b>.</p><h3>Verification documents</h3><p>Identity documents, certificates and background checks are used only to verify providers and customers. We store masked ID numbers, restrict document access to our Trust & Safety team, and watermark any document shown on a profile.</p><h3>Your rights</h3><p>You may access, correct or withdraw consent for your personal data, and delete your account at any time in Settings. Contact our Data Protection Officer at privacy@doneright.example.</p><p class="muted small">In this demo, all data stays in your browser's local storage.</p>`],
    guidelines: ['Community guidelines', () => '<ul class="checks"><li>Be respectful, punctual and honest.</li><li>Keep all communication and payments on Done Right.</li><li>Only list services you are qualified and licensed to perform.</li><li>Wellness and massage services must be strictly professional and non-sexual.</li><li>Report unsafe behaviour immediately via the app.</li></ul>'],
    data: ['Personal data we collect', () => '<ul class="checks"><li>Account: name, mobile number, email, country</li><li>Profile: photo, gender, date of birth, languages, skills</li><li>Verification: ID document images (masked number), selfie, education, certificates, work history, background check, business registration</li><li>Bookings: addresses, appointment times, notes, reviews</li><li>Device: approximate location (with permission) to show nearby providers</li></ul>'],
    'third-party': ['Third-party data sharing', () => '<ul class="checks"><li>Payment processors (PayNow / DuitNow / card networks / e-wallets) — to process payments</li><li>Identity verification partners (e.g. Singpass MyInfo, MyDigital ID) — only with your consent</li><li>Map providers — to display maps and distances</li><li>Insurers — when a Done Right Guarantee claim is made</li><li>Authorities — where required by Singapore or Malaysian law</li></ul>'],
    about: ['About Done Right', () => `<div class="center">${DR.LOGO}<h2 class="h1 mt12">Done Right</h2><p class="muted">Version 1.0 (demo)</p></div><p class="mt16">Done Right is an English-first marketplace for home, lifestyle and professional services in Singapore and Malaysia — from aircon servicing and home massage to tuition, swimming and singing lessons, and software, ML and AI experts.</p><p class="mt8">Every provider can build a verified, LinkedIn-style profile with identity, education, certifications and work experience, and publish real-time availability so customers can book instantly.</p>`],
  };
  DR.page('/page/:slug', ({ params }) => {
    const pg = PAGES[params.slug];
    if (!pg) return DR.notFound();
    return { title: pg[0], html: `${DR.ui.navbar({ title: pg[0] })}<article class="card prose">${pg[1]()}</article>` };
  });
})(window.DR);
