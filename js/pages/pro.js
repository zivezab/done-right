/* Done Right — Provider centre: onboarding wizard, services & pricing, availability, jobs */
(function (DR) {
  'use strict';
  const { esc, fromMin, toMin, DAYS, DAYS_LONG, dateKey, addDays, parseKey, fmtDate } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  const TIMES = [];
  for (let m = 360; m <= 1440; m += 30) TIMES.push(fromMin(m));
  const timeSel = (attr, val) => `<select class="input input-sm" ${attr}>${TIMES.map((t) => `<option ${t === val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const DURATIONS = [30, 45, 60, 90, 120, 180, 240];
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function saveProvider(u, fn, render = false) {
    DR.store.update((s) => { const us = s.users[u.id]; DR.ensureProvider(us); fn(us.provider, us); }, { render });
  }

  // ---------------------------------------------------------------- Availability editor (weekly)
  DR.availEditor = function (root, u) {
    const av = () => DR.store.user().provider.availability;
    const PRESET_LABELS = [['weekday', 'Weekdays 9–6'], ['evening', 'Evenings & weekends'], ['fullweek', 'Every day 9–9'], ['split', 'Mon–Sat, lunch break'], ['clear', 'Clear all']];
    function render() {
      const a = av();
      root.innerHTML = `
        <div class="card-h"><h2>Booking slot length</h2></div>
        ${DR.ui.seg([[30, '30 min'], [60, '1 hr'], [90, '1.5 hr'], [120, '2 hr']], a.slotMinutes, 'slot')}
        <p class="muted xs mt4">Customers can start a booking at every slot. Longer services block the following slots automatically.</p>
        <div class="card-h mt16"><h2>Quick presets</h2></div>
        <div class="chips">${PRESET_LABELS.map(([k, l]) => `<button type="button" class="chip" data-preset="${k}">${l}</button>`).join('')}</div>
        <div class="card-h mt16"><h2>Weekly hours</h2><button type="button" class="link small" data-copy>Copy Monday to weekdays</button></div>
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const ranges = a.weekly[d] || [];
          return `<div class="day-row"><label class="switch"><input type="checkbox" data-on="${d}" ${ranges.length ? 'checked' : ''}><i></i></label><b class="day-name">${DAYS[d]}</b>
            <div class="ranges">${ranges.length ? ranges.map((r, i) => `<span class="range-chip">${timeSel(`data-r="${d}:${i}:0"`, r[0])}<span>–</span>${timeSel(`data-r="${d}:${i}:1"`, r[1])}<button type="button" class="icon-btn sm" data-rm="${d}:${i}" aria-label="Remove">${icon('x', 14)}</button></span>`).join('') + `<button type="button" class="link small" data-add="${d}">${icon('plus', 13)} Add hours</button>` : '<span class="muted small">Unavailable</span>'}</div></div>`;
        }).join('')}`;
    }
    function commit(fn) {
      saveProvider(u, (pv) => { fn(pv.availability); });
      render();
    }
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.slot) commit((a) => { a.slotMinutes = +d.slot; });
      if (d.preset) commit((a) => { a.weekly = d.preset === 'clear' ? { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } : DR.AVAIL_PRESETS[d.preset](); });
      if ('copy' in d) commit((a) => { [2, 3, 4, 5].forEach((k) => { a.weekly[k] = clone(a.weekly[1] || []); }); });
      if (d.add) commit((a) => { const r = a.weekly[d.add]; const last = r[r.length - 1]; const s = Math.min(toMin(last[1]) + 60, 1380); r.push([fromMin(s), fromMin(Math.min(s + 180, 1440))]); });
      if (d.rm) { const [day, i] = d.rm.split(':').map(Number); commit((a) => { a.weekly[day].splice(i, 1); }); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.on) commit((a) => { a.weekly[t.dataset.on] = t.checked ? [['09:00', '18:00']] : []; });
      if (t.dataset.r) {
        const [day, i, j] = t.dataset.r.split(':').map(Number);
        commit((a) => {
          const r = a.weekly[day][i]; r[j] = t.value;
          if (toMin(r[1]) <= toMin(r[0])) { if (j === 0) r[1] = fromMin(Math.min(toMin(r[0]) + 60, 1440)); else r[0] = fromMin(Math.max(toMin(r[1]) - 60, 360)); DR.ui.toast('End time must be after start time'); }
        });
      }
    });
    render();
  };

  // ---------------------------------------------------------------- Landing / dashboard
  DR.page('/pro', () => {
    const u = DR.store.user();
    const pv = u && u.provider;
    if (!pv) {
      const hiring = ['tuition', 'music', 'sports', 'tech', 'massage', 'cleaning', 'repair', 'beauty', 'care', 'creative', 'pets', 'business'];
      return {
        title: 'Become a provider', bar: true,
        html: `${DR.ui.navbar({ title: 'Provider centre' })}
          <section class="pro-hero"><h1>Turn your skills into income</h1><p>Join ${DR.ALL_SUBS.length}+ service categories across Singapore & Malaysia — from swimming coaches and singing teachers to ML engineers and home cleaners.</p><div class="pro-hero-art" aria-hidden="true">🏊🎤🤖🧹📚</div></section>
          <section class="card"><ul class="value-list">
            <li>${icon('wallet', 22, 'brand')}<div><b>Set your own prices & hours</b><p class="muted small">Publish weekly availability and time off — customers book open slots instantly.</p></div></li>
            <li>${icon('verified', 22, 'brand')}<div><b>A verified, LinkedIn-style profile</b><p class="muted small">Showcase ID verification, education, licences, certificates and work experience.</p></div></li>
            <li>${icon('shield', 22, 'brand')}<div><b>Get paid securely</b><p class="muted small">Payments are held by Done Right and paid out weekly via PayNow or DuitNow.</p></div></li>
            <li>${icon('users', 22, 'brand')}<div><b>Customers near you</b><p class="muted small">Appear on the Nearby map and in search across ${DR.GROUPS.length} industries.</p></div></li>
          </ul></section>
          <section class="card"><div class="card-h"><h2>How it works</h2></div><ol class="steps">${[['Create your profile', 'Pick services, write a bio, add a photo.'], ['Verify yourself', 'ID, certificates, education & experience.'], ['Set prices & availability', 'Weekly hours, slot length and days off.'], ['Go live & get booked', 'Accept jobs, chat with customers, get paid.']].map(([t, d], i) => `<li><span class="step-n">${i + 1}</span><div><b>${t}</b><p class="muted small">${d}</p></div></li>`).join('')}</ol></section>
          <section class="card"><div class="card-h"><h2>In demand now</h2></div><div class="chips">${hiring.map((g) => `<span class="chip">${DR.GROUP[g].emoji} ${esc(DR.GROUP[g].short)}</span>`).join('')}</div></section>
          <div class="bottom-bar"><button class="btn btn-primary grow" id="start">Start provider registration</button></div>`,
        mount(el) {
          el.querySelector('#start').onclick = () => {
            if (!DR.store.user()) return DR.router.go('/auth?next=' + encodeURIComponent('/pro/setup'));
            DR.store.update((s) => DR.ensureProvider(s.users[s.session]), { render: false });
            DR.router.go('/pro/setup');
          };
        },
      };
    }
    DR.verify.tick(u);
    const checks = checklist(u);
    const ready = checks.every((c) => c.ok || !c.req);
    const jobs = S().orders.filter((o) => o.providerId === u.id);
    const upcoming = jobs.filter((o) => o.status === 'upcoming').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const month = new Date().getMonth();
    const earned = jobs.filter((o) => ['to_review', 'completed'].includes(o.status) && new Date(o.paidAt || o.createdAt).getMonth() === month).reduce((a, o) => a + o.price, 0);
    const pending = jobs.filter((o) => o.status === 'to_confirm').reduce((a, o) => a + o.price, 0);
    const p = DR.data.fromUser(u);
    const cc = u.country || 'SG';
    return {
      title: 'Provider centre',
      html: `${DR.ui.navbar({ title: DR.t('Provider centre'), right: `<a class="icon-btn" href="#/provider/${u.id}" aria-label="Preview public profile">${icon('user')}</a>` })}
        <section class="card dash-head">${DR.userAvatar(u, 'av-lg round')}<div class="grow minw0"><b class="ellipsis">${esc(u.name || 'Your name')}</b><div class="muted small ellipsis">${esc(p.role)}</div><div class="mt4">${pv.status === 'live' ? (pv.paused ? '<span class="tag tag-gold">Paused</span>' : '<span class="tag tag-verified">● Live</span>') : '<span class="tag tag-grey">Draft</span>'} ${DR.cards.rating(p)}</div></div>
          ${pv.status === 'live' ? `<label class="switch-col"><span class="switch"><input type="checkbox" id="accepting" ${pv.paused ? '' : 'checked'}><i></i></span><small class="muted">Accepting</small></label>` : ''}</section>
        ${pv.status !== 'live' ? `<section class="card"><div class="card-h"><h2>Finish setting up</h2><span class="muted small">${checks.filter((c) => c.ok).length}/${checks.length}</span></div>
          ${checks.map((c) => `<a class="check-row" href="#${c.href}">${icon(c.ok ? 'checkCircle' : 'info', 20, c.ok ? 'green' : c.req ? 'brand' : 'muted')}<span class="grow">${c.label}${c.req && !c.ok ? ' <small class="brand">required</small>' : ''}</span>${icon('right', 14, 'muted')}</a>`).join('')}
          <button class="btn btn-primary btn-block mt12" id="golive" ${ready ? '' : 'disabled'}>Go live</button></section>` : ''}
        <div class="stat-cards mx"><a class="stat-card" href="#/pro/jobs"><b>${upcoming.length}</b><small>Upcoming</small></a><a class="stat-card" href="#/pro/jobs?tab=to_confirm"><b>${money(pending, cc)}</b><small>Pending</small></a><a class="stat-card" href="#/pro/jobs?tab=completed"><b>${money(earned, cc)}</b><small>This month</small></a></div>
        <section class="card"><div class="tile-grid">
          ${[['/pro/jobs', 'orders', 'Jobs'], ['/pro/services', 'wallet', 'Services & pricing'], ['/pro/availability', 'calendar', 'Availability'], ['/pro/profile', 'edit', 'Profile'], ['/verify', 'verified', 'Verification'], [`/provider/${u.id}`, 'user', 'Public profile'], [`/provider/${u.id}/reviews`, 'star', 'Reviews'], ['#payout', 'card', 'Payouts']].map(([h, ic, l]) => `<a class="tile" href="${h.startsWith('#') ? '#/pro' : '#' + h}" ${h === '#payout' ? 'data-payout' : ''}>${icon(ic, 24)}<small>${l}</small></a>`).join('')}
        </div></section>
        <section class="card"><div class="card-h"><h2>Upcoming jobs</h2><a class="more" href="#/pro/jobs">All ${icon('right', 13)}</a></div>
          ${upcoming.slice(0, 3).map((o) => `<div class="flush-card">${DR.orderCard(o, true)}</div>`).join('') || '<p class="muted small">No upcoming jobs yet.</p>'}
        </section>
        ${pv.status === 'live' ? `<div class="demo-box mx mb16"><b>${icon('sparkle', 14)} Demo</b><p class="small muted">See how bookings arrive: create a paid booking from a sample customer in your next open slot.</p><button class="btn btn-ghost btn-sm mt8" id="simulate">Simulate incoming booking</button></div>` : ''}`,
      mount(el) {
        DR.bindOrderActions(el);
        const acc = el.querySelector('#accepting');
        if (acc) acc.onchange = () => { saveProvider(u, (x) => { x.paused = !acc.checked; }, true); DR.ui.toast(acc.checked ? 'You are accepting bookings' : 'Bookings paused — you are hidden from search'); };
        const gl = el.querySelector('#golive');
        if (gl) gl.onclick = () => goLive(u);
        el.querySelector('[data-payout]').onclick = (e) => { e.preventDefault(); DR.ui.toast(`Payouts go to your ${cc === 'SG' ? 'PayNow' : 'DuitNow / bank'} account every Monday (demo)`); };
        const sim = el.querySelector('#simulate');
        if (sim) sim.onclick = () => simulateBooking(u);
      },
    };
  });

  function checklist(u) {
    const pv = u.provider;
    const iv = u.verification && u.verification.identity;
    const needsBg = pv.subs.some((id) => DR.SUB[id] && DR.GROUP[DR.SUB[id].groupId].bg);
    const bg = u.verification && u.verification.background;
    return [
      { label: 'Choose the services you offer', ok: pv.subs.length > 0, req: true, href: '/pro/setup?step=1' },
      { label: 'Profile photo, headline & bio', ok: !!(u.avatar && pv.headline && pv.bio && pv.bio.length >= 30), req: true, href: '/pro/setup?step=2' },
      { label: 'Set prices', ok: pv.services.length > 0 && pv.services.every((s) => s.price !== '' && +s.price >= 0), req: true, href: '/pro/setup?step=3' },
      { label: 'Weekly availability', ok: Object.values(pv.availability.weekly).some((r) => r.length), req: true, href: '/pro/setup?step=4' },
      { label: 'Identity verification submitted', ok: !!(iv && iv.status !== 'rejected'), req: true, href: '/verify/identity' },
      { label: needsBg ? 'Background check (required for your categories)' : 'Background check', ok: !!(bg && bg.status !== 'rejected'), req: needsBg, href: '/verify/background' },
      { label: 'Licences / certifications', ok: !!(u.verification && (u.verification.certifications || []).length), req: false, href: '/verify/certifications' },
      { label: 'Education & work experience', ok: !!(u.verification && ((u.verification.education || []).length || (u.verification.experience || []).length)), req: false, href: '/verify/experience' },
    ];
  }

  function goLive(u) {
    const sh = DR.ui.sheet({
      title: 'Service commitment', full: true,
      html: `<p class="muted small">Before going live, please read and sign the Done Right service commitment.</p>
        <ol class="pledge mt12"><li>I will provide services lawfully, honestly and courteously, and protect customers' rights.</li><li>I hold all licences required by law for the services I list.</li><li>I will not offer or promote any illegal, unsafe, fraudulent or indecent services.</li><li>I will keep all bookings, communication and payments on Done Right.</li><li>I will respect customer privacy and personal data.</li><li>I understand violations lead to removal from the platform.</li></ol>
        <label class="check mt16"><input type="checkbox" id="sign"><span>I, <b>${esc(u.name || 'the provider')}</b>, agree to the service commitment.</span></label>
        <button class="btn btn-primary btn-block mt16" id="ok">Sign & go live</button>`,
      mount(s) {
        s.querySelector('#ok').onclick = () => {
          if (!s.querySelector('#sign').checked) return DR.ui.toast('Please tick to sign the commitment');
          saveProvider(u, (pv) => { pv.status = 'live'; pv.liveAt = Date.now(); pv.signedAt = Date.now(); pv.paused = false; });
          sh.close();
          DR.ui.toast('🎉 You are live! Customers can now book you.');
          DR.router.go('/pro', { replace: true });
        };
      },
    });
  }

  function simulateBooking(u) {
    const p = DR.data.fromUser(DR.store.user());
    const svc = p.services[0];
    if (!svc) return DR.ui.toast('Add a service first');
    const n = DR.avail.next(p, svc.duration);
    if (!n) return DR.ui.toast('No open slots in the next 3 weeks — add availability first');
    const names = ['Rachel Tan', 'Ahmad Faizal', 'Priya Nair', 'Jason Lim', 'Nurul Aisyah', 'Marcus Wong'];
    const name = names[Math.floor(Math.random() * names.length)];
    const online = DR.data.mode(p) === 'both' && Math.random() < 0.4;
    const cc = u.country || 'SG';
    const order = {
      id: DR.u.uid('o'), no: 'DR' + String(Date.now()).slice(-10), userId: 'demo-' + name.split(' ')[0].toLowerCase(), customerName: name, providerId: u.id, providerName: u.name,
      subId: svc.subId, serviceName: svc.name, unit: svc.unit, date: n.key, time: n.time, duration: svc.duration, mode: online ? 'online' : 'onsite',
      address: online ? null : { label: 'Home', line: cc === 'SG' ? 'Blk 123 Sample Street 11' : '12, Jalan Contoh 3/4', unit: cc === 'SG' ? '#05-12' : 'Unit 5-12', postal: cc === 'SG' ? '520123' : '47300', area: p.area.n },
      notes: 'Sample booking created in demo mode.', price: svc.price, fee: 0, total: svc.price, country: cc, status: 'upcoming', createdAt: Date.now(), paidAt: Date.now(), payMethod: cc === 'SG' ? 'PayNow' : 'DuitNow QR', log: [{ s: 'created', ts: Date.now() }, { s: 'paid', ts: Date.now() }],
    };
    DR.store.update((s) => { s.orders.unshift(order); });
    DR.ui.toast(`New booking from ${name} · ${DR.u.relDay(n.key)} ${n.time}`);
  }

  // ---------------------------------------------------------------- Setup wizard
  const STEPS = ['Services', 'About you', 'Pricing', 'Availability', 'Verify & go live'];

  function profileForm(u) {
    const pv = u.provider;
    const cc = u.country || 'SG';
    const C = DR.COUNTRIES[cc];
    const role = pv.subs.length ? DR.data.fromUser(u).role : 'Swimming Instructor';
    return `<form class="form" id="pf" novalidate>
      <div class="row gap12"><label class="avatar-edit">${DR.userAvatar(u, 'av-xl round')}<input type="file" accept="image/*" name="avatar" hidden><span>${icon('camera', 16)}</span></label>
        <p class="muted xs grow">A clear, friendly photo of your face. It is compared with your ID photo during verification.</p></div>
      ${DR.ui.field('Display name', `<input class="input" name="name" value="${esc(u.name || '')}" autocomplete="name">`, '', true)}
      <div class="row gap10">${DR.ui.field('Gender', `<select class="input" name="gender"><option value="">—</option><option value="F" ${u.gender === 'F' ? 'selected' : ''}>Female</option><option value="M" ${u.gender === 'M' ? 'selected' : ''}>Male</option></select>`)}${DR.ui.field('Date of birth', `<input class="input" type="date" name="dob" value="${esc(u.dob || '')}">`)}</div>
      ${DR.ui.field('Headline', `<input class="input" name="headline" maxlength="80" value="${esc(pv.headline)}" placeholder="e.g. ${esc(role)} · SwimSafer certified · 8 yrs">`, 'Shown under your name in search results', true)}
      ${DR.ui.field('About you', `<textarea class="input" name="bio" rows="5" maxlength="800" placeholder="Your experience, teaching / working style, what customers can expect…">${esc(pv.bio)}</textarea>`, 'At least 30 characters', true)}
      <div class="row gap10">${DR.ui.field('Years of experience', `<input class="input" type="number" min="0" max="50" name="years" value="${esc(pv.years)}">`)}${DR.ui.field(`Travel fee beyond 3 km (${C.currency})`, `<input class="input" type="number" min="0" max="100" name="travelFee" value="${esc(pv.travelFee)}">`)}</div>
      ${DR.ui.field('Main service area', `<select class="input" name="area">${DR.AREAS[cc].map((a) => `<option ${a.n === pv.area ? 'selected' : ''}>${esc(a.n)}</option>`).join('')}</select>`)}
      <div><span class="field-label">Who do you serve?</span>${DR.ui.seg([['all', 'Everyone'], ['female', 'Women only'], ['male', 'Men only']], pv.serves, 'serves')}</div>
      <div><span class="field-label">Languages</span><div class="chips" id="langs">${DR.LANGUAGES.map((l) => `<button type="button" class="chip ${pv.languages.includes(l) ? 'on' : ''}" data-lang="${l}">${l}</button>`).join('')}</div></div>
      ${DR.ui.field('Skills', `<input class="input" name="skills" value="${esc((pv.skills || []).join(', '))}" placeholder="e.g. Freestyle, Butterfly, Water confidence, Python, PyTorch">`, 'Comma-separated, up to 12')}
    </form>`;
  }
  function bindProfileForm(el, u) {
    const f = el.querySelector('#pf');
    const st = { serves: u.provider.serves, langs: u.provider.languages.slice(), avatar: u.avatar || null };
    f.querySelector('[name=avatar]').addEventListener('change', async (e) => {
      try { st.avatar = await DR.files.fromInput(e.target.files[0], 700); f.querySelector('.avatar-edit img').src = await DR.files.get(st.avatar.id); } catch (err) { DR.ui.toast(err.message); }
    });
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-serves]'); if (s) { st.serves = s.dataset.serves; el.querySelectorAll('[data-serves]').forEach((x) => x.classList.toggle('on', x === s)); }
      const l = e.target.closest('[data-lang]'); if (l) { st.langs = st.langs.includes(l.dataset.lang) ? st.langs.filter((x) => x !== l.dataset.lang) : [...st.langs, l.dataset.lang]; l.classList.toggle('on'); }
    });
    return function save() {
      const v = Object.fromEntries(new FormData(f));
      if (!v.name.trim()) return DR.ui.toast('Enter your display name'), false;
      if (!st.avatar) return DR.ui.toast('Please add a profile photo'), false;
      if (!v.headline.trim()) return DR.ui.toast('Add a headline'), false;
      if (v.bio.trim().length < 30) return DR.ui.toast('Tell customers a bit more about you (30+ characters)'), false;
      if (!st.langs.length) return DR.ui.toast('Choose at least one language'), false;
      DR.store.update((s) => {
        const us = s.users[u.id];
        Object.assign(us, { name: v.name.trim(), gender: v.gender, dob: v.dob, avatar: st.avatar });
        Object.assign(us.provider, { headline: v.headline.trim(), bio: v.bio.trim(), years: +v.years || 0, travelFee: +v.travelFee || 0, area: v.area, serves: st.serves, languages: st.langs, skills: v.skills.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) });
      }, { render: false });
      return true;
    };
  }

  function serviceEditor(sv, i, cc) {
    const C = DR.COUNTRIES[cc];
    const sub = DR.SUB[sv.subId];
    return `<div class="svc-edit" data-i="${i}">
      <div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><input class="input input-plain" name="name-${i}" value="${esc(sv.name)}" aria-label="Service name"><div class="muted xs">Typical in ${esc(C.name)}: from ${money(DR.data.catalogPrice(sub, cc), cc)}/${esc(sub.unit)}</div></div>
        <label class="switch" title="Active"><input type="checkbox" name="active-${i}" ${sv.active !== false ? 'checked' : ''}><i></i></label></div>
      <div class="row gap8 mt8">
        <label class="field grow"><span class="field-label">Price</span><span class="input-prefix"><em>${C.currency}</em><input class="input" type="number" min="0" step="1" name="price-${i}" value="${esc(sv.price)}"></span></label>
        <label class="field grow"><span class="field-label">Per</span><input class="input" name="unit-${i}" value="${esc(sv.unit)}"></label>
        <label class="field grow"><span class="field-label">Duration</span><select class="input" name="dur-${i}">${DURATIONS.map((d) => `<option value="${d}" ${+sv.duration === d ? 'selected' : ''}>${d} min</option>`).join('')}</select></label>
      </div>
      <label class="field mt8"><span class="field-label">What's included (optional)</span><input class="input" name="desc-${i}" maxlength="140" value="${esc(sv.desc || '')}" placeholder="e.g. Trial lesson, materials, travel within 5 km"></label>
    </div>`;
  }
  function readServices(el, u) {
    const pv = u.provider;
    const out = pv.services.map((sv, i) => {
      const g = (n) => el.querySelector(`[name="${n}-${i}"]`);
      return Object.assign({}, sv, { name: g('name').value.trim() || sv.name, price: g('price').value === '' ? '' : Math.max(0, +g('price').value), unit: g('unit').value.trim() || sv.unit, duration: +g('dur').value, desc: g('desc').value.trim(), active: g('active').checked });
    });
    if (out.some((s) => s.price === '')) { DR.ui.toast('Enter a price for every service (0 for free quotes)'); return false; }
    if (!out.some((s) => s.active)) { DR.ui.toast('Keep at least one service active'); return false; }
    DR.store.update((s) => { s.users[u.id].provider.services = out; }, { render: false });
    return true;
  }
  function syncServicesFromSubs(u) {
    DR.store.update((s) => {
      const pv = s.users[u.id].provider;
      const cc = s.users[u.id].country || 'SG';
      pv.services = pv.services.filter((x) => pv.subs.includes(x.subId));
      pv.subs.forEach((id) => { if (!pv.services.some((x) => x.subId === id)) { const sub = DR.SUB[id]; pv.services.push({ subId: id, name: sub.name, price: DR.data.catalogPrice(sub, cc), unit: sub.unit, duration: Math.min(sub.duration, 240), desc: '', active: true }); } });
    }, { render: false });
  }

  DR.page('/pro/setup', ({ query }) => {
    if (!DR.requireAuth()) return null;
    let u = DR.store.user();
    if (!u.provider) { DR.store.update((s) => DR.ensureProvider(s.users[u.id]), { render: false }); u = DR.store.user(); }
    const step = Math.min(5, Math.max(1, +query.step || 1));
    const pv = u.provider;
    const cc = u.country || 'SG';
    const go = (n) => DR.router.go('/pro/setup?step=' + n, { replace: true });
    let body = '';
    if (step === 1) {
      body = `<p class="muted small">Pick up to 12 services from our directory. You can change these later.</p>
        <div class="searchbar searchbar-outline mt8">${icon('search', 18)}<input id="sq" type="search" placeholder="Search e.g. swimming, piano, ML engineer, aircon"></div>
        <div class="sel-bar mt8"><b id="selCount">${pv.subs.length} selected</b><div class="chips-xs" id="selChips">${pv.subs.map((id) => `<span class="chip-xs chip-ok">${esc(DR.SUB[id].name)}</span>`).join('')}</div></div>
        <div id="groups">${DR.GROUPS.map((g) => `<details class="acc" ${g.subs.some((s) => pv.subs.includes(s.id)) ? 'open' : ''} data-group><summary>${g.emoji} ${esc(g.name)} <span class="muted xs">${g.subs.length}</span>${icon('down', 16)}</summary><div class="chips">${g.subs.map((s) => `<button type="button" class="chip ${pv.subs.includes(s.id) ? 'on' : ''}" data-sub="${s.id}" data-name="${esc((s.name + ' ' + g.name).toLowerCase())}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></details>`).join('')}</div>`;
    } else if (step === 2) body = profileForm(u);
    else if (step === 3) body = `<p class="muted small">Set a starting price for each service. Customers see this on your profile and in search.</p><div id="svcs">${pv.services.map((sv, i) => serviceEditor(sv, i, cc)).join('')}</div>`;
    else if (step === 4) body = '<p class="muted small">Set your regular weekly hours. You can block specific days later in Availability.</p><div id="avail" class="mt8"></div>';
    else {
      const checks = checklist(u);
      body = `<p class="muted small">Verification builds trust. Identity verification is required before going live.</p>
        <div class="mt8">${checks.map((c) => `<a class="check-row" href="#${c.href}">${icon(c.ok ? 'checkCircle' : 'info', 20, c.ok ? 'green' : c.req ? 'brand' : 'muted')}<span class="grow">${c.label}${c.req && !c.ok ? ' <small class="brand">required</small>' : c.req ? '' : ' <small class="muted">recommended</small>'}</span>${icon('right', 14, 'muted')}</a>`).join('')}</div>
        ${DR.CERT_SUGGESTIONS(pv.subs, cc).length ? `<div class="notice mt12">${icon('award', 16)}<span>Customers look for: ${DR.CERT_SUGGESTIONS(pv.subs, cc).slice(0, 4).map((c) => esc(c[0])).join(', ')}</span></div>` : ''}`;
    }
    const allOk = step === 5 && checklist(u).every((c) => c.ok || !c.req);
    return {
      title: 'Provider setup', bar: true,
      html: `${DR.ui.navbar({ title: 'Provider setup', right: `<a class="link small" href="#/pro">Save & exit</a>` })}
        <div class="stepper-top">${STEPS.map((s, i) => `<button class="step-dot ${i + 1 === step ? 'on' : ''} ${i + 1 < step ? 'done' : ''}" data-step="${i + 1}"><i>${i + 1 < step ? icon('check', 12) : i + 1}</i><small>${s}</small></button>`).join('')}</div>
        <section class="card"><h2 class="h2 mb8">${step}. ${STEPS[step - 1]}</h2>${body}</section>
        <div class="bottom-bar">${step > 1 ? `<button class="btn btn-ghost" id="prev">${icon('back', 16)} Back</button>` : ''}<button class="btn btn-primary grow" id="next" ${step === 5 && !allOk ? 'disabled' : ''}>${step === 5 ? 'Sign commitment & go live' : 'Continue'}</button></div>`,
      mount(el) {
        let save = () => true;
        if (step === 1) {
          const renderSel = () => { const cur = DR.store.user().provider.subs; el.querySelector('#selCount').textContent = `${cur.length} selected`; el.querySelector('#selChips').innerHTML = cur.map((id) => `<span class="chip-xs chip-ok">${esc(DR.SUB[id].name)}</span>`).join(''); };
          el.querySelector('#groups').addEventListener('click', (e) => {
            const b = e.target.closest('[data-sub]'); if (!b) return;
            const id = b.dataset.sub;
            const cur = DR.store.user().provider.subs;
            if (!cur.includes(id) && cur.length >= 12) return DR.ui.toast('You can choose up to 12 services');
            saveProvider(u, (x) => { x.subs = x.subs.includes(id) ? x.subs.filter((y) => y !== id) : [...x.subs, id]; });
            b.classList.toggle('on');
            renderSel();
          });
          el.querySelector('#sq').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            el.querySelectorAll('[data-group]').forEach((g) => { let any = false; g.querySelectorAll('[data-sub]').forEach((c) => { c.hidden = q && !c.dataset.name.includes(q); if (!c.hidden) any = true; }); g.hidden = !any; if (q) g.open = true; });
          });
          save = () => { if (!DR.store.user().provider.subs.length) { DR.ui.toast('Choose at least one service'); return false; } syncServicesFromSubs(u); return true; };
        }
        if (step === 2) save = bindProfileForm(el, u);
        if (step === 3) save = () => readServices(el, DR.store.user());
        if (step === 4) { DR.availEditor(el.querySelector('#avail'), u); save = () => { if (!Object.values(DR.store.user().provider.availability.weekly).some((r) => r.length)) { DR.ui.toast('Open at least one day'); return false; } return true; }; }
        el.querySelector('#next').onclick = () => { if (!save()) return; if (step < 5) go(step + 1); else goLive(DR.store.user()); };
        const prev = el.querySelector('#prev'); if (prev) prev.onclick = () => go(step - 1);
        el.querySelector('.stepper-top').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b && +b.dataset.step < step) go(+b.dataset.step); else if (b && +b.dataset.step > step && save()) go(+b.dataset.step); });
      },
    };
  });

  // ---------------------------------------------------------------- Profile, services, availability, jobs
  DR.page('/pro/profile', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    if (!u.provider) { DR.router.go('/pro', { replace: true }); return null; }
    return {
      title: 'Provider profile', bar: true,
      html: `${DR.ui.navbar({ title: 'Provider profile' })}<section class="card">${profileForm(u)}</section>
        <section class="card"><div class="card-h"><h2>Credentials</h2></div><p class="muted small">Education, certifications and work experience are managed in the Verification centre so they can carry a verified badge.</p><a class="btn btn-ghost btn-block mt8" href="#/verify">Open verification centre</a></section>
        <div class="bottom-bar"><a class="btn btn-ghost" href="#/provider/${u.id}">Preview</a><button class="btn btn-primary grow" id="save">Save</button></div>`,
      mount(el) { const save = bindProfileForm(el, u); el.querySelector('#save').onclick = () => { if (save()) { DR.ui.toast('Profile saved'); DR.router.back('/pro'); } }; },
    };
  });

  DR.page('/pro/services', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    if (!u.provider) { DR.router.go('/pro', { replace: true }); return null; }
    const cc = u.country || 'SG';
    return {
      title: 'Services & pricing', bar: true,
      html: `${DR.ui.navbar({ title: 'Services & pricing' })}
        <section class="card"><div id="svcs">${u.provider.services.map((sv, i) => serviceEditor(sv, i, cc) + `<div class="row end"><button class="link small muted" data-remove="${sv.subId}">${icon('trash', 13)} Remove</button></div>`).join('') || '<p class="muted small">No services yet.</p>'}</div>
          <button class="btn btn-ghost btn-block mt12" id="add">${icon('plus', 16)} Add a service</button></section>
        <div class="bottom-bar"><button class="btn btn-primary grow" id="save">Save changes</button></div>`,
      mount(el) {
        el.querySelector('#save').onclick = () => { if (!u.provider.services.length || readServices(el, DR.store.user())) { DR.ui.toast('Services saved'); DR.router.refresh(); } };
        el.addEventListener('click', async (e) => {
          const r = e.target.closest('[data-remove]');
          if (r && await DR.ui.confirm({ title: 'Remove this service?', ok: 'Remove', danger: true })) {
            saveProvider(u, (pv) => { pv.subs = pv.subs.filter((x) => x !== r.dataset.remove); pv.services = pv.services.filter((x) => x.subId !== r.dataset.remove); }, true);
          }
        });
        el.querySelector('#add').onclick = () => {
          const sh = DR.ui.sheet({
            title: 'Add a service', full: true,
            html: `<div class="searchbar searchbar-outline">${icon('search', 18)}<input id="aq" type="search" placeholder="Search ${DR.ALL_SUBS.length} services"></div><div class="list mt8" id="al">${DR.ALL_SUBS.filter((s) => !u.provider.subs.includes(s.id)).map((s) => `<button class="list-item" data-pick="${s.id}" data-name="${esc((s.name + ' ' + DR.GROUP[s.groupId].name).toLowerCase())}"><span>${s.emoji} ${esc(s.name)}</span><small class="muted">${esc(DR.GROUP[s.groupId].short)}</small></button>`).join('')}</div>`,
            mount(s) {
              s.querySelector('#aq').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); s.querySelectorAll('[data-pick]').forEach((b) => { b.hidden = q && !b.dataset.name.includes(q); }); });
              s.addEventListener('click', (e) => {
                const b = e.target.closest('[data-pick]'); if (!b) return;
                if (DR.store.user().provider.subs.length >= 12) return DR.ui.toast('You can offer up to 12 services');
                saveProvider(u, (pv) => { pv.subs.push(b.dataset.pick); });
                syncServicesFromSubs(u);
                sh.close(); DR.router.refresh();
              });
            },
          });
        };
      },
    };
  });

  DR.page('/pro/availability', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    if (!u.provider) { DR.router.go('/pro', { replace: true }); return null; }
    const p = DR.data.fromUser(u);
    const av = u.provider.availability;
    const today = new Date();
    const start = addDays(today, -((today.getDay() + 6) % 7));
    const cells = Array.from({ length: 56 }, (_, i) => addDays(start, i));
    const orders = S().orders.filter((o) => o.providerId === u.id && o.status !== 'cancelled');
    const offs = Object.entries(av.overrides || {}).filter(([k]) => k >= dateKey(today)).sort();
    return {
      title: 'Availability',
      html: `${DR.ui.navbar({ title: 'Availability' })}
        <section class="card"><div id="avail"></div></section>
        <section class="card"><div class="card-h"><h2>Calendar & time off</h2><span class="muted xs">Tap a date</span></div>
          <div class="cal-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="cal-h">${d}</div>`).join('')}
          ${cells.map((d) => { const k = dateKey(d); const past = k < dateKey(today); const ov = av.overrides && av.overrides[k]; const open = DR.avail.ranges(p, k).length; const n = orders.filter((o) => o.date === k).length; return `<button class="cal-cell ${past ? 'past' : ''} ${open ? 'open' : 'off'} ${ov ? 'override' : ''} ${k === dateKey(today) ? 'today' : ''}" data-day="${k}" ${past ? 'disabled' : ''}><b>${d.getDate()}</b>${n ? `<i class="cal-dot">${n}</i>` : ''}</button>`; }).join('')}</div>
          <div class="legend mt8"><span><i class="lg-free"></i>Open</span><span><i class="lg-off"></i>Off</span><span><i class="lg-ov"></i>Custom</span><span><i class="lg-book"></i>Bookings</span></div>
        </section>
        ${offs.length ? `<section class="card"><div class="card-h"><h2>Upcoming exceptions</h2></div>${offs.map(([k, o]) => `<div class="list-item"><span><b>${fmtDate(k)}</b><br><small class="muted">${o.off ? 'Day off' : o.ranges.map((r) => r.join('–')).join(', ')}</small></span><button class="btn btn-ghost btn-xs" data-clear="${k}">Remove</button></div>`).join('')}</section>` : ''}`,
      mount(el) {
        DR.availEditor(el.querySelector('#avail'), u);
        el.addEventListener('change', () => setTimeout(() => refreshCalendar(el), 0));
        el.addEventListener('click', (e) => {
          const c = e.target.closest('[data-clear]');
          if (c) { saveProvider(u, (pv) => { delete pv.availability.overrides[c.dataset.clear]; }, true); return; }
          if (e.target.closest('[data-preset],[data-slot],[data-copy],[data-add],[data-rm]')) setTimeout(() => refreshCalendar(el), 0);
          const d = e.target.closest('[data-day]'); if (d) daySheet(u, d.dataset.day);
        });
      },
    };
  });
  function refreshCalendar(el) {
    const y = window.scrollY;
    const ed = el.querySelector('#avail');
    const keep = ed.innerHTML;
    DR.router.refresh();
    window.scrollTo(0, y);
    return keep;
  }

  function daySheet(u, key) {
    const pv = DR.store.user().provider;
    const ov = (pv.availability.overrides || {})[key];
    const weeklyRanges = pv.availability.weekly[parseKey(key).getDay()] || [];
    const st = { mode: ov ? (ov.off ? 'off' : 'custom') : 'weekly', ranges: clone(ov && ov.ranges ? ov.ranges : weeklyRanges.length ? weeklyRanges : [['09:00', '18:00']]) };
    const p = DR.data.fromUser(DR.store.user());
    const bookings = S().orders.filter((o) => o.providerId === u.id && o.date === key && o.status !== 'cancelled');
    const body = () => `${DR.ui.seg([['weekly', 'Weekly hours'], ['off', 'Day off'], ['custom', 'Custom hours']], st.mode, 'm')}
      ${st.mode === 'weekly' ? `<p class="muted small mt12">${weeklyRanges.length ? `Open ${weeklyRanges.map((r) => r.join('–')).join(', ')} (from your weekly schedule)` : 'Closed on this weekday'}</p>` : ''}
      ${st.mode === 'off' ? '<p class="muted small mt12">Customers won\'t be able to book you on this date.</p>' : ''}
      ${st.mode === 'custom' ? `<div class="ranges col mt12">${st.ranges.map((r, i) => `<span class="range-chip">${timeSel(`data-cr="${i}:0"`, r[0])}<span>–</span>${timeSel(`data-cr="${i}:1"`, r[1])}<button type="button" class="icon-btn sm" data-crm="${i}">${icon('x', 14)}</button></span>`).join('')}<button type="button" class="link small" data-cadd>${icon('plus', 13)} Add hours</button></div>` : ''}
      ${bookings.length ? `<div class="notice mt12">${icon('calendar', 16)}<span>${bookings.length} booking${bookings.length > 1 ? 's' : ''} on this day: ${bookings.map((o) => `${o.time} ${esc(o.serviceName)}`).join(', ')}. Existing bookings are not affected.</span></div>` : ''}
      <div class="slot-grid mt12">${DR.avail.slots(p, key).map((s) => `<span class="slot ${s.ok ? '' : 'dis'}">${s.time}</span>`).join('') || '<span class="muted small">No slots</span>'}</div>
      <button class="btn btn-primary btn-block mt16" id="dsave">Save</button>`;
    const sh = DR.ui.sheet({
      title: fmtDate(key), html: `<div id="db">${body()}</div>`,
      mount(s) {
        const rer = () => { s.querySelector('#db').innerHTML = body(); };
        s.addEventListener('click', (e) => {
          const t = e.target.closest('button'); if (!t) return;
          if (t.dataset.m) { st.mode = t.dataset.m; rer(); }
          if ('cadd' in t.dataset) { const last = st.ranges[st.ranges.length - 1]; const a = last ? Math.min(toMin(last[1]) + 60, 1380) : 540; st.ranges.push([fromMin(a), fromMin(Math.min(a + 180, 1440))]); rer(); }
          if (t.dataset.crm) { st.ranges.splice(+t.dataset.crm, 1); rer(); }
          if (t.id === 'dsave') {
            if (st.mode === 'custom' && st.ranges.some((r) => toMin(r[1]) <= toMin(r[0]))) return DR.ui.toast('End time must be after start time');
            saveProvider(u, (x) => { x.availability.overrides = x.availability.overrides || {}; if (st.mode === 'weekly') delete x.availability.overrides[key]; else x.availability.overrides[key] = st.mode === 'off' ? { off: true } : { ranges: st.ranges.slice().sort((a, b) => a[0].localeCompare(b[0])) }; });
            sh.close(); DR.ui.toast('Availability updated'); DR.router.refresh();
          }
        });
        s.addEventListener('change', (e) => { const c = e.target.dataset.cr; if (c) { const [i, j] = c.split(':').map(Number); st.ranges[i][j] = e.target.value; } });
      },
    });
  }

  DR.page('/pro/jobs', ({ query }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const tab = query.tab || 'upcoming';
    const jobs = S().orders.filter((o) => o.providerId === u.id);
    const tabs = [['upcoming', 'Upcoming', ['upcoming']], ['to_confirm', 'Awaiting confirmation', ['to_confirm']], ['completed', 'Completed', ['to_review', 'completed']], ['cancelled', 'Cancelled', ['cancelled']]];
    const cur = tabs.find((t) => t[0] === tab) || tabs[0];
    const list = jobs.filter((o) => cur[2].includes(o.status)).sort((a, b) => (tab === 'upcoming' ? 1 : -1) * (a.date + a.time).localeCompare(b.date + b.time));
    return {
      title: 'Jobs',
      html: `${DR.ui.navbar({ title: 'Jobs' })}
        <nav class="tabs tabs-scroll">${tabs.map(([k, l, st]) => { const n = jobs.filter((o) => st.includes(o.status)).length; return `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/pro/jobs?tab=${k}">${l}${n ? `<i class="count">${n}</i>` : ''}</a>`; }).join('')}</nav>
        <div class="olist">${list.map((o) => DR.orderCard(o, true)).join('') || DR.ui.empty('clipboard', 'No jobs here yet', u.provider && u.provider.status === 'live' ? '<a class="btn btn-ghost" href="#/pro">Back to dashboard</a>' : '<a class="btn btn-primary" href="#/pro/setup">Finish setup to get booked</a>')}</div>`,
      mount(el) { DR.bindOrderActions(el); },
    };
  });
})(window.DR);
