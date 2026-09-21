/* Done Right — Provider centre: onboarding wizard, services & licences, availability, day schedule
 * (block / unblock slots, extra hours, move bookings), booking rules, jobs */
(function (DR) {
  'use strict';
  const { esc, fromMin, toMin, DAYS, dateKey, addDays, parseKey, fmtDate, relDay, hoursLabel } = DR.u;
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
  const pvOf = () => DR.store.user().provider;

  // ---------------------------------------------------------------- Weekly availability editor
  DR.availEditor = function (root, u) {
    const av = () => pvOf().availability;
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
          return `<div class="day-row"><label class="switch"><input type="checkbox" data-on="${d}" ${ranges.length ? 'checked' : ''} aria-label="${DAYS[d]}"><i></i></label><b class="day-name">${DAYS[d]}</b>
            <div class="ranges">${ranges.length ? ranges.map((r, i) => `<span class="range-chip">${timeSel(`data-r="${d}:${i}:0" aria-label="Start"`, r[0])}<span>–</span>${timeSel(`data-r="${d}:${i}:1" aria-label="End"`, r[1])}<button type="button" class="icon-btn sm" data-rm="${d}:${i}" aria-label="Remove">${icon('x', 14)}</button></span>`).join('') + `<button type="button" class="link small" data-add="${d}">${icon('plus', 13)} Add hours</button>` : '<span class="muted small">Unavailable</span>'}</div></div>`;
        }).join('')}`;
    }
    function commit(fn) { saveProvider(u, (pv) => { fn(pv.availability); }); render(); DR.emit('avail'); }
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

  // ---------------------------------------------------------------- Booking rules editor
  DR.policyEditor = function (root, u, { compact = false } = {}) {
    const sel = (name, opts, val, fmt) => `<select class="input" data-pol="${name}">${opts.map((o) => `<option value="${o}" ${+o === +val ? 'selected' : ''}>${fmt(o)}</option>`).join('')}</select>`;
    const minsLabel = (m) => (m >= 60 ? hoursLabel(m / 60) : `${m} min`);
    function render() {
      const pol = Object.assign(DR.defaultPolicy(), pvOf().policy || {});
      root.innerHTML = `
        <div class="card-h"><h2>How customers book you</h2></div>
        <div class="role-cards">
          <button type="button" class="role-card ${pol.mode === 'instant' ? 'on' : ''}" data-mode="instant"><span class="role-emoji">⚡</span><b>Instant book</b><small>Confirmed as soon as the customer pays. More bookings.</small>${icon('checkCircle', 20, 'role-check')}</button>
          <button type="button" class="role-card ${pol.mode === 'request' ? 'on' : ''}" data-mode="request"><span class="role-emoji">✋</span><b>Request to book</b><small>You approve each booking. Payment is held until you accept.</small>${icon('checkCircle', 20, 'role-check')}</button>
        </div>
        ${pol.mode === 'request' ? `<div class="mt12">${DR.ui.field('Respond to requests within', sel('approvalHours', [2, 6, 12, 24, 48], pol.approvalHours, hoursLabel), 'Unanswered requests are cancelled and refunded automatically')}</div>` : ''}
        <div class="card-h mt16"><h2>Rescheduling & cancellation</h2></div>
        <div class="form">
          ${DR.ui.field('Reschedule lock period', sel('rescheduleLockHours', [2, 6, 12, 24, 48, 72], pol.rescheduleLockHours, (h) => `${hoursLabel(h)} before start`), 'Customers can move a booking themselves until this point')}
          ${DR.ui.field('Reschedules allowed per booking', sel('maxReschedules', [0, 1, 2, 3, 5], pol.maxReschedules, (n) => (n === 0 ? 'Not allowed' : `${n}×`)))}
          ${DR.ui.field('Free cancellation until', sel('freeCancelHours', [6, 12, 24, 48, 72], pol.freeCancelHours, (h) => `${hoursLabel(h)} before start`), 'Later cancellations pay you 50%')}
          ${compact ? '' : `
          ${DR.ui.field('Minimum notice', sel('leadMinutes', [30, 60, 120, 240, 720, 1440], pol.leadMinutes, minsLabel), 'How far ahead customers must book')}
          ${DR.ui.field('Booking window', sel('advanceDays', [7, 14, 30, 60, 90], pol.advanceDays, (d) => `${d} days ahead`))}
          ${DR.ui.field('Buffer between bookings', sel('bufferMinutes', [0, 15, 30, 45, 60], pol.bufferMinutes, (m) => (m ? `${m} min` : 'No buffer')), 'Travel / reset time added around every booking')}`}
        </div>`;
    }
    const commit = (fn) => { saveProvider(u, (pv) => { pv.policy = Object.assign(DR.defaultPolicy(), pv.policy || {}); fn(pv.policy); }); render(); };
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) commit((p) => { p.mode = b.dataset.mode; }); });
    root.addEventListener('change', (e) => { const k = e.target.dataset.pol; if (k) commit((p) => { p[k] = +e.target.value; }); });
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
            <li>${icon('calendar', 22, 'brand')}<div><b>Your schedule, your rules</b><p class="muted small">Weekly hours, blocked slots, instant or request-to-book, and your own reschedule lock period.</p></div></li>
            <li>${icon('quote', 22, 'brand')}<div><b>Quote for custom jobs</b><p class="muted small">Receive quote requests from nearby customers and win jobs with your price.</p></div></li>
            <li>${icon('verified', 22, 'brand')}<div><b>A verified, LinkedIn-style profile</b><p class="muted small">Showcase ID verification, licences, education, certificates and work experience.</p></div></li>
            <li>${icon('shield', 22, 'brand')}<div><b>Get paid securely</b><p class="muted small">Payments are held by Done Right and paid out weekly via PayNow or DuitNow.</p></div></li>
          </ul></section>
          <section class="card"><div class="card-h"><h2>How it works</h2></div><ol class="steps">${[['Create your profile', 'Pick services, write a bio, add a photo.'], ['Verify yourself', 'ID + liveness, licences, education & experience.'], ['Set prices, hours & rules', 'Weekly hours, slot length, booking rules.'], ['Go live & get booked', 'Accept jobs, send quotes, get paid.']].map(([t, d], i) => `<li><span class="step-n">${i + 1}</span><div><b>${t}</b><p class="muted small">${d}</p></div></li>`).join('')}</ol></section>
          <section class="card"><div class="card-h"><h2>In demand now</h2></div><div class="chips">${hiring.map((g) => `<span class="chip">${DR.GROUP[g].emoji} ${esc(DR.GROUP[g].short)}</span>`).join('')}</div></section>
          <div class="bottom-bar"><button class="btn btn-primary grow" id="start">Start provider registration</button></div>`,
        mount(el) {
          el.querySelector('#start').onclick = () => {
            const cur = DR.store.user();
            if (!cur) return DR.router.go('/auth?next=' + encodeURIComponent('/pro/setup'));
            DR.store.update((s) => DR.ensureProvider(s.users[cur.id]), { render: false });
            DR.router.go('/pro/setup');
          };
        },
      };
    }
    const checks = checklist(u);
    const ready = checks.every((c) => c.ok || !c.req);
    const jobs = S().orders.filter((o) => o.providerId === u.id);
    const requests = jobs.filter((o) => o.status === 'requested' || o.rescheduleRequest);
    const upcoming = jobs.filter((o) => o.status === 'upcoming').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const month = new Date().getMonth();
    const earned = jobs.filter((o) => ['to_review', 'completed'].includes(o.status) && new Date(o.paidAt || o.createdAt).getMonth() === month).reduce((a, o) => a + o.price, 0);
    const p = DR.data.fromUser(u);
    const cc = u.country || 'SG';
    const newQuotes = DR.quotes.forProvider(u.id).filter((q) => q.status === 'open' && !q.declinedBy.includes(u.id) && !q.offers.some((o) => o.providerId === u.id)).length;
    const expiring = DR.verify.expiring(u);
    const pol = DR.policy(p);
    return {
      title: 'Provider centre', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: ('Provider centre'), right: `<a class="icon-btn" href="#/provider/${u.id}" aria-label="Preview public profile">${icon('eye')}</a>` })}
        <section class="card dash-head">${DR.userAvatar(u, 'av-lg round')}<div class="grow minw0"><b class="ellipsis" data-no-i18n>${esc(u.name || 'Your name')}</b><div class="muted small ellipsis">${esc(p.role)} · ${pol.mode === 'instant' ? `⚡ Instant book` : `✋ Request to book`}</div><div class="mt4">${pv.status === 'live' ? (pv.paused ? '<span class="tag tag-gold">Paused</span>' : '<span class="tag tag-verified">● Live</span>') : '<span class="tag tag-grey">Draft</span>'} ${DR.cards.rating(p)}</div></div>
          ${pv.status === 'live' ? `<label class="switch-col"><span class="switch"><input type="checkbox" id="accepting" ${pv.paused ? '' : 'checked'}><i></i></span><small class="muted">Accepting</small></label>` : ''}</section>
        ${requests.length ? `<a class="card alert-card" href="#/pro/jobs?tab=requests">${icon('bell', 18, 'brand')} <b>${requests.length} ${(requests.length === 1 ? 'request needs your response' : 'requests need your response')}</b>${icon('right', 14)}</a>` : ''}
        ${p.lockedServices && p.lockedServices.length ? `<a class="card alert-card" href="#/pro/services">${icon('lock', 18, 'gold')} <span class="grow"><b>${p.lockedServices.length} service(s) hidden from customers</b><br><small class="muted">Add and verify the required licence or background check to list them.</small></span>${icon('right', 14)}</a>` : ''}
        ${expiring.length ? `<a class="card alert-card" href="#${expiring[0].href}">${icon('clock', 18, 'gold')} <span class="grow"><b>Expiring soon:</b> <span data-no-i18n>${esc(expiring.map((x) => x.label).join(', '))}</span></span>${icon('right', 14)}</a>` : ''}
        ${pv.status !== 'live' ? `<section class="card"><div class="card-h"><h2>Finish setting up</h2><span class="muted small">${checks.filter((c) => c.ok).length}/${checks.length}</span></div>
          ${checks.map((c) => `<a class="check-row" href="#${c.href}">${icon(c.ok ? 'checkCircle' : 'info', 20, c.ok ? 'green' : c.req ? 'brand' : 'muted')}<span class="grow">${c.label}${c.req && !c.ok ? ' <small class="brand">required</small>' : ''}</span>${icon('right', 14, 'muted')}</a>`).join('')}
          <button class="btn btn-primary btn-block mt12" id="golive" ${ready ? '' : 'disabled'}>Go live</button></section>` : ''}
        <div class="stat-cards mx"><a class="stat-card" href="#/pro/jobs"><b>${upcoming.length}</b><small>Upcoming</small></a><a class="stat-card" href="#/pro/quotes"><b>${newQuotes}</b><small>New quote requests</small></a><a class="stat-card" href="#/pro/jobs?tab=completed"><b>${money(earned, cc)}</b><small>This month</small></a></div>
        <section class="card"><div class="tile-grid">
          ${[['/pro/schedule', 'calendar', 'Schedule'], ['/pro/jobs', 'orders', 'Jobs', requests.length], ['/pro/quotes', 'quote', 'Quotes', newQuotes], ['/pro/services', 'wallet', 'Services & licences'], ['/pro/availability', 'clock', 'Weekly hours'], ['/pro/policies', 'rules', 'Booking rules'], ['/pro/profile', 'edit', 'Profile'], ['/verify', 'verified', 'Verification'], [`/provider/${u.id}`, 'eye', 'Public profile'], [`/provider/${u.id}/reviews`, 'star', 'Reviews'], ['/messages', 'chat', 'Messages', DR.chat.unreadTotal(u.id)], ['#payout', 'card', 'Payouts']].map(([h, ic, l, n]) => `<a class="tile" href="${h.startsWith('#') ? '#/pro' : '#' + h}" ${h === '#payout' ? 'data-payout' : ''}>${n ? `<i class="dot-badge">${n}</i>` : ''}${icon(ic, 24)}<small>${l}</small></a>`).join('')}
        </div></section>
        <section class="card"><div class="card-h"><h2>Upcoming jobs</h2><a class="more" href="#/pro/schedule">Schedule ${icon('right', 13)}</a></div>
          ${upcoming.slice(0, 3).map((o) => `<div class="flush-card">${DR.orderCard(o, true)}</div>`).join('') || '<p class="muted small">No upcoming jobs yet.</p>'}
        </section>
        ${pv.status === 'live' ? `<div class="demo-box mx mb16"><b>${icon('sparkle', 14)} Demo</b><p class="small muted">See how bookings arrive: create a paid booking from a sample customer in your next open slot (respects your booking rules).</p><button class="btn btn-ghost btn-sm mt8" id="simulate">Simulate incoming booking</button></div>` : ''}`,
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
    const cc = u.country || 'SG';
    const lic = DR.lic.relevant(pv.subs, cc);
    const certs = (u.verification && u.verification.certifications) || [];
    const bgNeeded = pv.subs.some((id) => DR.lic.bgRequired(id));
    const bg = u.verification && u.verification.background;
    return [
      { label: 'Choose the services you offer', ok: pv.subs.length > 0, req: true, href: '/pro/setup?step=1' },
      { label: 'Profile photo, headline & bio', ok: !!(u.avatar && pv.headline && pv.bio && pv.bio.length >= 30), req: true, href: '/pro/setup?step=2' },
      { label: 'Set prices', ok: pv.services.length > 0 && pv.services.every((s) => s.price !== '' && +s.price >= 0), req: true, href: '/pro/setup?step=3' },
      { label: 'Weekly hours & booking rules', ok: Object.values(pv.availability.weekly).some((r) => r.length), req: true, href: '/pro/setup?step=4' },
      { label: 'Identity verification submitted', ok: !!(iv && ['pending', 'verified'].includes(iv.status)), req: true, href: '/verify/identity' },
      ...(lic.length ? [{ label: `Licences for regulated services (${lic.length})`, ok: lic.every((id) => certs.some((c) => c.licenceId === id && ['pending', 'verified'].includes(c.status))), req: false, href: '/verify/certifications' }] : []),
      ...(bgNeeded ? [{ label: 'Background check (required for some of your services)', ok: !!(bg && ['pending', 'verified'].includes(bg.status)), req: false, href: '/verify/background' }] : []),
      { label: 'Education & work experience', ok: !!(u.verification && ((u.verification.education || []).length || (u.verification.experience || []).length)), req: false, href: '/verify/experience' },
    ];
  }

  function goLive(u) {
    const sh = DR.ui.sheet({
      title: 'Service commitment', full: true,
      html: `<p class="muted small">Before going live, please read and sign the Done Right service commitment.</p>
        <ol class="pledge mt12"><li>I will provide services lawfully, honestly and courteously, and protect customers' rights.</li><li>I hold all licences required by law for the services I list, and keep them valid.</li><li>I will not offer or promote any illegal, unsafe, fraudulent or indecent services.</li><li>I will keep all bookings, communication and payments on Done Right.</li><li>I will respect customer privacy and personal data.</li><li>I understand violations lead to removal from the platform.</li></ol>
        <p class="notice mt12">${icon('info', 16)} <span>Regulated services (e.g. electrical, plumbing, massage, nursing) stay hidden until your licence is verified.</span></p>
        <label class="check mt16"><input type="checkbox" id="sign"><span>I, <b data-no-i18n>${esc(u.name || '')}</b>, agree to the service commitment.</span></label>
        <button class="btn btn-primary btn-block mt16" id="ok">Sign & go live</button>`,
      mount(s) {
        s.querySelector('#ok').onclick = () => {
          if (!s.querySelector('#sign').checked) return DR.ui.toast('Please tick to sign the commitment');
          saveProvider(u, (pv) => { pv.status = 'live'; pv.liveAt = Date.now(); pv.signedAt = Date.now(); pv.paused = false; });
          DR.store.audit({ actor: u.id, userId: u.id, item: 'Service commitment', action: 'signed' });
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
    if (!svc) return DR.ui.toast('No bookable service yet — check licence requirements in Services & licences');
    const n = DR.avail.next(p, svc.duration);
    if (!n) return DR.ui.toast('No open slots in your booking window — add availability first');
    const names = ['Rachel Tan', 'Ahmad Faizal', 'Priya Nair', 'Jason Lim', 'Nurul Aisyah', 'Marcus Wong'];
    const name = names[Math.floor(Math.random() * names.length)];
    const online = DR.data.mode(p) === 'both' && Math.random() < 0.4;
    const cc = u.country || 'SG';
    const customer = { id: 'demo-' + name.split(' ')[0].toLowerCase(), name };
    const address = online ? null : { label: 'Home', line: cc === 'SG' ? 'Blk 123 Sample Street 11' : '12, Jalan Contoh 3/4', unit: cc === 'SG' ? '#05-12' : 'Unit 5-12', postal: cc === 'SG' ? '520123' : '47300', area: p.area.n };
    try {
      const o = DR.booking.create({ user: customer, provider: p, service: svc, date: n.key, time: n.time, mode: online ? 'online' : 'onsite', address, notes: 'Sample booking created in demo mode.', fee: 0 });
      DR.booking.pay(o.id, cc === 'SG' ? 'PayNow' : 'DuitNow QR');
      DR.ui.toast(`${DR.policy(p).mode === 'request' ? 'New booking request' : 'New booking'} from ${name} · ${relDay(n.key)} ${n.time}`);
      DR.router.refresh();
    } catch (err) { DR.ui.toast(err.message); }
  }

  // ---------------------------------------------------------------- Setup wizard
  const STEPS = ['Services', 'About you', 'Pricing', 'Hours & rules', 'Verify & go live'];

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
      ${DR.ui.field('Main service area', `<select class="input" name="area">${DR.AREAS[cc].map((a) => `<option value="${esc(a.n)}" ${a.n === pv.area ? 'selected' : ''}>${esc(a.n)}</option>`).join('')}</select>`)}
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

  function licenceBadge(u, subId) {
    const chk = DR.lic.check(u, subId);
    if (!chk.regulated && !chk.bgRequired) return '';
    if (chk.ok) return `<span class="chip-xs chip-ok">${icon('shield', 11)}Licensed & listed</span>`;
    const needs = chk.groups.filter((g) => g.status !== 'verified').map((g) => DR.lic.label(g.options));
    if (chk.bgRequired && chk.bgStatus !== 'verified') needs.push(('Background check'));
    return `<a class="lic-need ${chk.pending ? 'pending' : ''}" href="#${chk.groups.some((g) => g.status !== 'verified') ? '/verify/certifications' : '/verify/background'}">${icon(chk.pending ? 'clock' : 'lock', 12)} ${chk.pending ? ('Awaiting verification') : ('Hidden until verified')}: <span>${needs.map(esc).join(' + ')}</span></a>`;
  }
  function serviceEditor(sv, i, u) {
    const cc = u.country || 'SG';
    const C = DR.COUNTRIES[cc];
    const sub = DR.SUB[sv.subId];
    return `<div class="svc-edit" data-i="${i}">
      <div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><input class="input input-plain" name="name-${i}" value="${esc(sv.name)}" aria-label="Service name"><div class="muted xs">Typical in ${esc(C.name)}: from ${money(DR.data.catalogPrice(sub, cc), cc)}/${esc(sub.unit)}</div></div>
        <label class="switch" title="Active"><input type="checkbox" name="active-${i}" ${sv.active !== false ? 'checked' : ''} aria-label="Active"><i></i></label></div>
      ${licenceBadge(u, sv.subId)}
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
      const flag = (s) => (DR.lic.regulated(s.id, cc) ? ' 🔒' : DR.lic.bgRequired(s.id) ? ' 🛡' : '');
      body = `<p class="muted small">Pick up to 12 services. 🔒 = licence required · 🛡 = background check required. These services are listed once verified.</p>
        <div class="searchbar searchbar-outline mt8">${icon('search', 18)}<input id="sq" type="search" placeholder="Search e.g. swimming, piano, ML engineer, aircon"></div>
        <div class="sel-bar mt8"><b id="selCount">${pv.subs.length} selected</b><div class="chips-xs" id="selChips">${pv.subs.map((id) => `<span class="chip-xs chip-ok">${esc(DR.SUB[id].name)}</span>`).join('')}</div></div>
        <div id="groups">${DR.GROUPS.map((g) => `<details class="acc" ${g.subs.some((s) => pv.subs.includes(s.id)) ? 'open' : ''} data-group><summary>${g.emoji} ${esc(g.name)} <span class="muted xs">${g.subs.length}</span>${icon('down', 16)}</summary><div class="chips">${g.subs.map((s) => `<button type="button" class="chip ${pv.subs.includes(s.id) ? 'on' : ''}" data-sub="${s.id}" data-name="${esc((s.name + ' ' + g.name).toLowerCase())}">${s.emoji} ${esc(s.name)}${flag(s)}</button>`).join('')}</div></details>`).join('')}</div>`;
    } else if (step === 2) body = profileForm(u);
    else if (step === 3) body = `<p class="muted small">Set a starting price for each service. Customers see this on your profile and in search.</p><div id="svcs">${pv.services.map((sv, i) => serviceEditor(sv, i, u)).join('')}</div>`;
    else if (step === 4) body = '<p class="muted small">Set your regular weekly hours and booking rules. You can block specific slots or days anytime in Schedule.</p><div id="avail" class="mt8"></div><div class="divider"></div><div id="pol"></div>';
    else {
      const checks = checklist(u);
      body = `<p class="muted small">Verification builds trust. Identity verification is required before going live.</p>
        <div class="mt8">${checks.map((c) => `<a class="check-row" href="#${c.href}">${icon(c.ok ? 'checkCircle' : 'info', 20, c.ok ? 'green' : c.req ? 'brand' : 'muted')}<span class="grow">${c.label}${c.req && !c.ok ? ' <small class="brand">required</small>' : c.req ? '' : ' <small class="muted">recommended</small>'}</span>${icon('right', 14, 'muted')}</a>`).join('')}</div>
        ${pv.services.some((s) => DR.lic.regulated(s.subId, cc) || DR.lic.bgRequired(s.subId)) ? `<div class="mt12">${pv.services.map((s) => { const b = licenceBadge(u, s.subId); return b ? `<div class="small mt8"><b>${esc(s.name)}</b>${b}</div>` : ''; }).join('')}</div>` : ''}
        ${DR.CERT_SUGGESTIONS(pv.subs, cc).length ? `<div class="notice mt12">${icon('award', 16)}<span>Customers look for: ${DR.CERT_SUGGESTIONS(pv.subs, cc).slice(0, 4).map((c) => esc(c[0])).join(', ')}</span></div>` : ''}`;
    }
    const allOk = step === 5 && checklist(u).every((c) => c.ok || !c.req);
    return {
      title: 'Provider setup', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Provider setup', right: `<a class="link small" href="#/pro">Save & exit</a>` })}
        <div class="stepper-top">${STEPS.map((s, i) => `<button class="step-dot ${i + 1 === step ? 'on' : ''} ${i + 1 < step ? 'done' : ''}" data-step="${i + 1}"><i>${i + 1 < step ? icon('check', 12) : i + 1}</i><small>${s}</small></button>`).join('')}</div>
        <section class="card"><h2 class="h2 mb8">${step}. ${STEPS[step - 1]}</h2>${body}</section>
        <div class="bottom-bar">${step > 1 ? `<button class="btn btn-ghost" id="prev">${icon('back', 16)} Back</button>` : ''}<button class="btn btn-primary grow" id="next" ${step === 5 && !allOk ? 'disabled' : ''}>${step === 5 ? 'Sign commitment & go live' : 'Continue'}</button></div>`,
      mount(el) {
        let save = () => true;
        if (step === 1) {
          const renderSel = () => { const cur = pvOf().subs; el.querySelector('#selCount').textContent = `${cur.length} selected`; el.querySelector('#selChips').innerHTML = cur.map((id) => `<span class="chip-xs chip-ok">${esc(DR.SUB[id].name)}</span>`).join(''); };
          el.querySelector('#groups').addEventListener('click', (e) => {
            const b = e.target.closest('[data-sub]'); if (!b) return;
            const id = b.dataset.sub;
            const cur = pvOf().subs;
            if (!cur.includes(id) && cur.length >= 12) return DR.ui.toast('You can choose up to 12 services');
            saveProvider(u, (x) => { x.subs = x.subs.includes(id) ? x.subs.filter((y) => y !== id) : [...x.subs, id]; });
            b.classList.toggle('on');
            renderSel();
          });
          el.querySelector('#sq').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            el.querySelectorAll('[data-group]').forEach((g) => { let any = false; g.querySelectorAll('[data-sub]').forEach((c) => { c.hidden = q && !c.dataset.name.includes(q); if (!c.hidden) any = true; }); g.hidden = !any; if (q) g.open = true; });
          });
          save = () => { if (!pvOf().subs.length) { DR.ui.toast('Choose at least one service'); return false; } syncServicesFromSubs(u); return true; };
        }
        if (step === 2) save = bindProfileForm(el, u);
        if (step === 3) save = () => readServices(el, DR.store.user());
        if (step === 4) {
          DR.availEditor(el.querySelector('#avail'), u);
          DR.policyEditor(el.querySelector('#pol'), u, { compact: true });
          save = () => { if (!Object.values(pvOf().availability.weekly).some((r) => r.length)) { DR.ui.toast('Open at least one day'); return false; } return true; };
        }
        el.querySelector('#next').onclick = () => { if (!save()) return; if (step < 5) go(step + 1); else goLive(DR.store.user()); };
        const prev = el.querySelector('#prev'); if (prev) prev.onclick = () => go(step - 1);
        el.querySelector('.stepper-top').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b && +b.dataset.step < step) go(+b.dataset.step); else if (b && +b.dataset.step > step && save()) go(+b.dataset.step); });
      },
    };
  });

  const requireProvider = () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    if (!u.provider) { DR.router.go('/pro', { replace: true }); return null; }
    return u;
  };

  // ---------------------------------------------------------------- Profile, services & licences, policies
  DR.page('/pro/profile', () => {
    const u = requireProvider(); if (!u) return null;
    return {
      title: 'Provider profile', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Provider profile' })}<section class="card">${profileForm(u)}</section>
        <section class="card"><div class="card-h"><h2>Credentials</h2></div><p class="muted small">Education, licences, certifications and work experience are managed in the Verification centre so they can carry a verified badge.</p><a class="btn btn-ghost btn-block mt8" href="#/verify">Open verification centre</a></section>
        <div class="bottom-bar"><a class="btn btn-ghost" href="#/provider/${u.id}">Preview</a><button class="btn btn-primary grow" id="save">Save</button></div>`,
      mount(el) { const save = bindProfileForm(el, u); el.querySelector('#save').onclick = () => { if (save()) { DR.ui.toast('Profile saved'); DR.router.back('/pro'); } }; },
    };
  });

  DR.page('/pro/policies', () => {
    const u = requireProvider(); if (!u) return null;
    return {
      title: 'Booking rules', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Booking rules' })}<section class="card" id="pol"></section>
        <p class="notice mx">${icon('info', 16)} <span>Changes apply to new bookings. Existing bookings keep the rules they were made under.</span></p>`,
      mount(el) { DR.policyEditor(el.querySelector('#pol'), u); },
    };
  });

  DR.page('/pro/services', () => {
    const u = requireProvider(); if (!u) return null;
    return {
      title: 'Services & licences', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Services & licences' })}
        <section class="card"><div id="svcs">${u.provider.services.map((sv, i) => serviceEditor(sv, i, u) + `<div class="row end"><button class="link small muted" data-remove="${sv.subId}">${icon('trash', 13)} Remove</button></div>`).join('') || '<p class="muted small">No services yet.</p>'}</div>
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
          const cc = u.country || 'SG';
          const sh = DR.ui.sheet({
            title: 'Add a service', full: true,
            html: `<div class="searchbar searchbar-outline">${icon('search', 18)}<input id="aq" type="search" placeholder="Search ${DR.ALL_SUBS.length} services"></div><div class="list mt8" id="al">${DR.ALL_SUBS.filter((s) => !u.provider.subs.includes(s.id)).map((s) => `<button class="list-item" data-pick="${s.id}" data-name="${esc((s.name + ' ' + DR.GROUP[s.groupId].name).toLowerCase())}"><span>${s.emoji} ${esc(s.name)}${DR.lic.regulated(s.id, cc) ? ' 🔒' : ''}</span><small class="muted">${esc(DR.GROUP[s.groupId].short)}</small></button>`).join('')}</div>`,
            mount(s) {
              s.querySelector('#aq').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); s.querySelectorAll('[data-pick]').forEach((b) => { b.hidden = q && !b.dataset.name.includes(q); }); });
              s.addEventListener('click', (e) => {
                const b = e.target.closest('[data-pick]'); if (!b) return;
                if (pvOf().subs.length >= 12) return DR.ui.toast('You can offer up to 12 services');
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

  // ---------------------------------------------------------------- Weekly hours + calendar
  DR.page('/pro/availability', () => {
    const u = requireProvider(); if (!u) return null;
    const p = DR.data.fromUser(u);
    const av = u.provider.availability;
    const today = new Date();
    const start = addDays(today, -((today.getDay() + 6) % 7));
    const cells = Array.from({ length: 56 }, (_, i) => addDays(start, i));
    const orders = S().orders.filter((o) => o.providerId === u.id && o.status !== 'cancelled');
    return {
      title: 'Weekly hours', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Weekly hours', right: `<a class="icon-btn" href="#/pro/policies" aria-label="Booking rules">${icon('rules')}</a>` })}
        <section class="card"><div id="avail"></div></section>
        <section class="card"><div class="card-h"><h2>Calendar</h2><span class="muted xs">Tap a date to manage slots</span></div>
          <div class="cal-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="cal-h">${d}</div>`).join('')}
          ${cells.map((d) => { const k = dateKey(d); const past = k < dateKey(today); const ov = av.overrides && av.overrides[k]; const blocks = av.blocks && av.blocks[k] && av.blocks[k].length; const open = DR.avail.ranges(p, k).length; const n = orders.filter((o) => o.date === k).length; return `<a class="cal-cell ${past ? 'past' : ''} ${open ? 'open' : 'off'} ${ov || blocks ? 'override' : ''} ${k === dateKey(today) ? 'today' : ''}" ${past ? '' : `href="#/pro/schedule?date=${k}"`}><b>${d.getDate()}</b>${n ? `<i class="cal-dot">${n}</i>` : ''}</a>`; }).join('')}</div>
          <div class="legend mt8"><span><i class="lg-free"></i>Open</span><span><i class="lg-off"></i>Off</span><span><i class="lg-ov"></i>Custom / blocked</span><span><i class="lg-book"></i>Bookings</span></div>
        </section>`,
      mount(el) {
        DR.availEditor(el.querySelector('#avail'), u);
        const off = DR.on('avail', DR.u.debounce(() => DR.router.refresh(), 200));
        DR.onLeave(off);
      },
    };
  });

  // ---------------------------------------------------------------- Day schedule: manage individual slots & bookings
  function hoursSheet(u, key) {
    const pv = pvOf();
    const ov = (pv.availability.overrides || {})[key];
    const weeklyRanges = pv.availability.weekly[parseKey(key).getDay()] || [];
    const st = { ranges: clone(ov && ov.ranges ? ov.ranges : weeklyRanges.length ? weeklyRanges : [['09:00', '18:00']]) };
    const body = () => `<div class="ranges col">${st.ranges.map((r, i) => `<span class="range-chip">${timeSel(`data-cr="${i}:0"`, r[0])}<span>–</span>${timeSel(`data-cr="${i}:1"`, r[1])}<button type="button" class="icon-btn sm" data-crm="${i}" aria-label="Remove">${icon('x', 14)}</button></span>`).join('')}<button type="button" class="link small" data-cadd>${icon('plus', 13)} Add hours</button></div>
      <button class="btn btn-primary btn-block mt16" id="dsave">Save hours for this day</button>`;
    const sh = DR.ui.sheet({
      title: `Hours on ${fmtDate(key)}`, html: `<p class="muted small mb12">Overrides your weekly hours for this date only.</p><div id="db">${body()}</div>`,
      mount(s) {
        s.addEventListener('click', (e) => {
          const t = e.target.closest('button'); if (!t) return;
          if ('cadd' in t.dataset) { const last = st.ranges[st.ranges.length - 1]; const a = last ? Math.min(toMin(last[1]) + 60, 1380) : 540; st.ranges.push([fromMin(a), fromMin(Math.min(a + 180, 1440))]); s.querySelector('#db').innerHTML = body(); }
          if (t.dataset.crm) { st.ranges.splice(+t.dataset.crm, 1); s.querySelector('#db').innerHTML = body(); }
          if (t.id === 'dsave') {
            if (st.ranges.some((r) => toMin(r[1]) <= toMin(r[0]))) return DR.ui.toast('End time must be after start time');
            saveProvider(u, (x) => { x.availability.overrides = x.availability.overrides || {}; x.availability.overrides[key] = st.ranges.length ? { ranges: st.ranges.slice().sort((a, b) => a[0].localeCompare(b[0])) } : { off: true }; });
            sh.close(); DR.ui.toast('Hours updated'); DR.router.refresh();
          }
        });
        s.addEventListener('change', (e) => { const c = e.target.dataset.cr; if (c) { const [i, j] = c.split(':').map(Number); st.ranges[i][j] = e.target.value; } });
      },
    });
  }

  DR.page('/pro/schedule', ({ query }) => {
    const u = requireProvider(); if (!u) return null;
    const p = DR.data.fromUser(u);
    const pv = u.provider;
    const today = new Date();
    const key = query.date && query.date >= dateKey(today) ? query.date : dateKey(today);
    const orders = S().orders.filter((o) => o.providerId === u.id && o.status !== 'cancelled');
    const days = Array.from({ length: 30 }, (_, i) => { const k = dateKey(addDays(today, i)); return { k, n: orders.filter((o) => o.date === k).length, open: DR.avail.ranges(p, k).length > 0 }; });
    const ov = (pv.availability.overrides || {})[key];
    const blocks = (pv.availability.blocks || {})[key] || [];
    const slots = DR.avail.slots(p, key, pv.availability.slotMinutes, { ignoreLead: true });
    const dayOrders = orders.filter((o) => o.date === key).sort((a, b) => a.time.localeCompare(b.time));
    const seen = new Set();
    const row = (s) => {
      const o = s.orderId && orders.find((x) => x.id === s.orderId);
      let label; let action = '';
      if (o) {
        const cont = seen.has(o.id); seen.add(o.id);
        label = `<span class="slot-state booked">${cont ? ('continues') : `<b data-no-i18n>${esc(o.customerName || 'Customer')}</b> · ${esc(o.serviceName)}`}</span>`;
        action = cont ? '' : `<a class="btn btn-ghost btn-xs" href="#/order/${o.id}">${(o.status === 'requested' ? 'Respond' : 'View')}</a>`;
      } else if (s.why === 'blocked') { label = `<span class="slot-state blocked">${icon('block', 13)} Blocked</span>`; action = `<button class="btn btn-ghost btn-xs" data-unblock="${s.time}">Unblock</button>`; }
      else if (s.why === 'past') { label = `<span class="slot-state past">Past</span>`; }
      else if (s.why === 'booked') { label = `<span class="slot-state booked">Buffer / unavailable</span>`; }
      else { label = `<span class="slot-state open">Open</span>`; action = `<button class="btn btn-ghost btn-xs" data-block="${s.time}">Block</button>`; }
      return `<div class="sched-row"><b class="sched-time">${s.time}</b>${label}<span class="grow"></span>${action}</div>`;
    };
    return {
      title: 'Schedule', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Schedule', right: `<a class="icon-btn" href="#/pro/availability" aria-label="Weekly hours">${icon('clock')}</a>` })}
        <div class="pad mt8"><div class="date-strip">${days.map((d) => { const dt = parseKey(d.k); return `<a class="date-pill ${d.k === key ? 'on' : ''} ${d.open ? '' : 'dim'}" href="#/pro/schedule?date=${d.k}"><small>${d.k === days[0].k ? ('Today') : DAYS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${d.n ? `${d.n} ${(d.n === 1 ? 'job' : 'jobs')}` : d.open ? ('Open') : ('Off')}</small></a>`; }).join('')}</div></div>
        <section class="card"><div class="card-h"><h2>${fmtDate(key)}</h2>${ov ? `<span class="tag tag-gold">${ov.off ? ('Day off') : ('Custom hours')}</span>` : blocks.length ? `<span class="tag tag-gold">${blocks.length} blocked</span>` : ''}</div>
          <div class="chips">
            ${ov && ov.off ? `<button class="chip" data-day="reopen">${icon('refresh', 14)} Reopen (weekly hours)</button>` : `<button class="chip" data-day="off">${icon('block', 14)} Block whole day</button>`}
            <button class="chip" data-day="hours">${icon('clock', 14)} Edit hours for this day</button>
            ${ov && !ov.off ? `<button class="chip" data-day="reset">${icon('refresh', 14)} Use weekly hours</button>` : ''}
            ${blocks.length ? `<button class="chip" data-day="unblockall">${icon('check', 14)} Unblock all</button>` : ''}
          </div>
          ${dayOrders.some((o) => ov && ov.off) ? `<p class="notice notice-gold">${icon('alert', 16)} <span>You have bookings on a blocked day. Propose a new time or cancel them below.</span></p>` : ''}
          <div class="sched mt12">${slots.map(row).join('') || `<p class="muted small">Not working this day.</p>`}</div>
        </section>
        ${dayOrders.length ? `<section class="card"><div class="card-h"><h2>Bookings</h2><span class="muted small">${dayOrders.length}</span></div>${dayOrders.map((o) => `<div class="flush-card">${DR.orderCard(o, true)}</div>`).join('')}</section>` : ''}
        <p class="muted xs center mb16">Blocking a slot never cancels an existing booking. Use “Change time” on a booking to propose a new slot to the customer.</p>`,
      mount(el) {
        DR.bindOrderActions(el);
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-block]');
          if (b) { saveProvider(u, (x) => { const bl = x.availability.blocks = x.availability.blocks || {}; bl[key] = [...new Set([...(bl[key] || []), b.dataset.block])]; }, true); return; }
          const ub = e.target.closest('[data-unblock]');
          if (ub) { saveProvider(u, (x) => { const bl = x.availability.blocks || {}; bl[key] = (bl[key] || []).filter((t) => t !== ub.dataset.unblock); }, true); return; }
          const d = e.target.closest('[data-day]'); if (!d) return;
          const a = d.dataset.day;
          if (a === 'off') saveProvider(u, (x) => { x.availability.overrides = x.availability.overrides || {}; x.availability.overrides[key] = { off: true }; }, true);
          if (a === 'reopen' || a === 'reset') saveProvider(u, (x) => { delete (x.availability.overrides || {})[key]; }, true);
          if (a === 'unblockall') saveProvider(u, (x) => { delete (x.availability.blocks || {})[key]; }, true);
          if (a === 'hours') hoursSheet(u, key);
        });
      },
    };
  });

  DR.page('/pro/jobs', ({ query }) => {
    const u = requireProvider(); if (!u) return null;
    const tab = query.tab || 'upcoming';
    const jobs = S().orders.filter((o) => o.providerId === u.id);
    const tabs = [['requests', 'Requests', (o) => o.status === 'requested' || !!o.rescheduleRequest], ['upcoming', 'Upcoming', (o) => o.status === 'upcoming' && !o.rescheduleRequest], ['to_confirm', 'Awaiting confirmation', (o) => o.status === 'to_confirm'], ['completed', 'Completed', (o) => ['to_review', 'completed'].includes(o.status)], ['cancelled', 'Cancelled', (o) => o.status === 'cancelled']];
    const cur = tabs.find((t) => t[0] === tab) || tabs[1];
    const list = jobs.filter(cur[2]).sort((a, b) => (['upcoming', 'requests'].includes(tab) ? 1 : -1) * (a.date + a.time).localeCompare(b.date + b.time));
    return {
      title: 'Jobs', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Jobs' })}
        <nav class="tabs tabs-scroll">${tabs.map(([k, l, fn]) => { const n = jobs.filter(fn).length; return `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/pro/jobs?tab=${k}">${l}${n ? `<i class="count">${n}</i>` : ''}</a>`; }).join('')}</nav>
        <div class="olist">${list.map((o) => DR.orderCard(o, true)).join('') || DR.ui.empty('clipboard', 'No jobs here yet', u.provider.status === 'live' ? '<a class="btn btn-ghost" href="#/pro">Back to dashboard</a>' : '<a class="btn btn-primary" href="#/pro/setup">Finish setup to get booked</a>')}</div>`,
      mount(el) { DR.bindOrderActions(el); },
    };
  });
})(window.DR);
