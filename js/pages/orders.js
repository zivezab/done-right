/* Done Right — Booking, payment, orders (instant / request-to-book, reschedule, proposals),
 * cart & following, messages & chat (realtime + masked calls) */
(function (DR) {
  'use strict';
  const { esc, dateKey, addDays, parseKey, relDay, fmtDate, fmtTs, hoursLabel } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  // ---------------------------------------------------------------- shared date + slot picker
  DR.picker = {
    days(p, duration, selected, opts = {}) {
      const today = new Date();
      const n = Math.min(opts.days || 14, DR.policy(p).advanceDays + 1);
      return Array.from({ length: n }, (_, i) => {
        const k = dateKey(addDays(today, i));
        const slots = DR.avail.slots(p, k, duration, opts);
        return { k, n: slots.filter((s) => s.ok).length, off: !DR.avail.ranges(p, k).length };
      });
    },
    datesHTML(days, selected) {
      const first = days[0] && days[0].k;
      return `<div class="date-strip">${days.map((c) => { const dt = parseKey(c.k); return `<button type="button" class="date-pill ${c.k === selected ? 'on' : ''} ${c.n ? '' : 'dim'}" data-date="${c.k}"><small>${c.k === first ? ('Today') : DR.u.DAYS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${c.off ? 'Off' : c.n ? `${c.n} free` : 'Full'}</small></button>`; }).join('')}</div>`;
    },
    slotsHTML(p, key, duration, selected, opts = {}) {
      const slots = DR.avail.slots(p, key, duration, opts);
      if (!slots.length) return '<p class="muted small">Not working on this day. Pick another date.</p>';
      return `<div class="slot-grid">${slots.map((s) => `<button type="button" class="slot ${s.time === selected ? 'on' : ''}" data-time="${s.time}" ${s.ok ? '' : 'disabled'}>${s.time}${s.why === 'booked' ? '<small>Booked</small>' : s.why === 'blocked' ? '<small>Blocked</small>' : ''}</button>`).join('')}</div>`;
    },
  };

  function policyCard(p) {
    const pol = DR.policy(p);
    const instant = pol.mode === 'instant';
    return `<section class="card policy-card">
      <div class="row gap8">${icon(instant ? 'zap' : 'clock', 18, instant ? 'gold' : 'brand')}<b>${instant ? 'Instant booking' : 'Request to book'}</b></div>
      <p class="muted small mt4">${instant ? 'Confirmed as soon as you pay.' : `${esc(p.name.split(' ')[0])} reviews each request and responds within ${hoursLabel(pol.approvalHours)}. You are fully refunded if they decline or do not respond.`}</p>
      <ul class="policy-list">
        <li>${icon('check', 13)}Free cancellation until ${hoursLabel(pol.freeCancelHours)} before</li>
        <li>${icon('check', 13)}Reschedule up to ${pol.maxReschedules}× until ${hoursLabel(pol.rescheduleLockHours)} before</li>
        <li>${icon('check', 13)}Book at least ${pol.leadMinutes >= 60 ? hoursLabel(pol.leadMinutes / 60) : `${pol.leadMinutes} min`} ahead, up to ${pol.advanceDays} days ahead</li>
      </ul></section>`;
  }
  DR.policyCard = policyCard;

  // ---------------------------------------------------------------- Address sheet (shared, with OneMap autofill for SG)
  async function oneMapLookup(postal) {
    if (!DR.CONFIG.oneMapToken) return null;
    try {
      const res = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y&pageNum=1`, { headers: { Authorization: DR.CONFIG.oneMapToken } });
      const j = await res.json();
      const r = j.results && j.results[0];
      return r ? { line: [r.BLK_NO, r.ROAD_NAME, r.BUILDING !== 'NIL' ? r.BUILDING : ''].filter(Boolean).join(' '), lat: +r.LATITUDE, lng: +r.LONGITUDE } : null;
    } catch (e) { return null; }
  }
  DR.addressSheet = function (existing, onSave) {
    const u = DR.store.user();
    const cc = u.country || S().country;
    const C = DR.COUNTRIES[cc];
    const a = Object.assign({ id: DR.u.uid('a'), label: 'Home', line: '', unit: '', postal: '', area: S().area, notes: '' }, existing || {});
    const sh = DR.ui.sheet({
      title: existing ? 'Edit address' : 'Add service address', full: true,
      html: `<form id="af" class="form">
        ${DR.ui.seg([['Home', 'Home'], ['Office', 'Office'], ['Other', 'Other']], a.label, 'label')}
        <div class="row gap10">
          ${DR.ui.field('Postal code', `<input class="input" name="postal" required inputmode="numeric" value="${esc(a.postal)}" maxlength="${cc === 'SG' ? 6 : 5}">`, C.postalHint + (cc === 'SG' && DR.CONFIG.oneMapToken ? ' · auto-fills address' : ''), true)}
          ${DR.ui.field('Area', `<select class="input" name="area">${DR.AREAS[cc].map((x) => `<option value="${esc(x.n)}" ${x.n === a.area ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}</select>`)}
        </div>
        ${DR.ui.field('Street / block address', `<input class="input" name="line" required value="${esc(a.line)}" placeholder="${cc === 'SG' ? 'e.g. Blk 123 Tampines Street 11' : 'e.g. 12, Jalan SS 2/24'}" autocomplete="street-address">`, '', true)}
        ${DR.ui.field('Unit / floor', `<input class="input" name="unit" value="${esc(a.unit)}" placeholder="${cc === 'SG' ? '#08-123' : 'Unit 3A-05'}">`)}
        ${DR.ui.field('Access notes', `<input class="input" name="notes" value="${esc(a.notes)}" placeholder="Gate code, parking, pets…">`)}
        <button class="btn btn-primary btn-block mt12">Save address</button>
      </form>`,
      mount(s) {
        const f = s.querySelector('#af');
        s.addEventListener('click', (e) => { const b = e.target.closest('[data-label]'); if (b) { a.label = b.dataset.label; s.querySelectorAll('[data-label]').forEach((x) => x.classList.toggle('on', x === b)); } });
        f.postal.addEventListener('input', async () => {
          if (cc !== 'SG' || !C.postal.test(f.postal.value)) return;
          const r = await oneMapLookup(f.postal.value);
          if (!r) return;
          f.line.value = r.line; a.lat = r.lat; a.lng = r.lng;
          let best = DR.AREAS.SG[0], bd = Infinity;
          DR.AREAS.SG.forEach((x) => { const d = Math.hypot(x.lat - r.lat, x.lng - r.lng); if (d < bd) { bd = d; best = x; } });
          f.area.value = best.n;
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = Object.fromEntries(new FormData(f));
          if (!C.postal.test(fd.postal)) return DR.ui.toast(`Enter a valid ${C.postalHint}`);
          if (!fd.line.trim()) return DR.ui.toast('Enter the street address');
          Object.assign(a, fd);
          DR.store.update((st) => { const us = st.users[u.id]; us.addresses = us.addresses || []; const i = us.addresses.findIndex((x) => x.id === a.id); if (i >= 0) us.addresses[i] = a; else us.addresses.unshift(a); }, { render: false });
          sh.close();
          if (onSave) onSave(a);
        });
      },
    });
  };

  // ---------------------------------------------------------------- Booking
  const drafts = {};
  DR.page('/book/:pid', ({ params, query }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const p = DR.data.provider(params.pid);
    if (!p) return DR.notFound('Provider not found');
    if (p.id === u.id) return { title: 'Book', html: `${DR.ui.navbar({ title: 'Book' })}${DR.ui.empty('box', 'You can\'t book your own services.', '<a class="btn btn-primary" href="#/pro">Go to Provider centre</a>')}` };
    if (!p.services.length) return { title: 'Book', html: `${DR.ui.navbar({ title: 'Book' })}${DR.ui.empty('box', 'This provider has no bookable services yet.')}` };
    const d = drafts[p.id] || (drafts[p.id] = { sub: null, date: null, time: null, mode: 'onsite', addr: null, notes: '' });
    if (query.sub && d.qsub !== query.sub) { d.sub = query.sub; d.qsub = query.sub; d.time = null; }
    if (query.date && d.qdate !== query.date) { d.date = query.date; d.qdate = query.date; d.time = null; }
    if (!p.services.some((s) => s.subId === d.sub)) d.sub = p.services[0].subId;
    const svc = p.services.find((s) => s.subId === d.sub);
    const days = DR.picker.days(p, svc.duration);
    if (!d.date || !days.some((x) => x.k === d.date)) d.date = (days.find((c) => c.n > 0) || days[0]).k;
    const slots = DR.avail.slots(p, d.date, svc.duration);
    if (d.time && !slots.some((s) => s.time === d.time && s.ok)) d.time = null;
    const both = DR.data.mode(p) === 'both';
    if (!both) d.mode = 'onsite';
    const addrs = u.addresses || [];
    if (!addrs.some((a) => a.id === d.addr)) d.addr = addrs[0] ? addrs[0].id : null;
    const fee = DR.data.fee(p, d.mode);
    const total = svc.price + fee;
    const ready = d.time && (d.mode === 'online' || d.addr);
    const cc = p.country;
    const instant = DR.policy(p).mode === 'instant';
    return {
      title: 'Book', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Book appointment' })}
      <a class="card pro-mini" href="#/provider/${p.id}">${DR.cards.pimg(p, 0, 'av-lg')}<div class="grow minw0"><div class="row gap6"><b class="ellipsis" data-no-i18n>${esc(p.name)}</b>${DR.cards.rating(p)}</div><div class="muted small ellipsis">${esc(p.role)} · ${DR.data.distLabel(p)}</div><div class="chips-xs mt4">${p.verified.identity ? `<span class="chip-xs chip-ok">${icon('shield', 11)}ID verified</span>` : ''}${DR.cards.modeChip(p)}</div></div>${icon('right', 16)}</a>
      ${policyCard(p)}
      <section class="card"><div class="card-h"><h2>1 · Service</h2></div>
        <div class="radio-list">${p.services.map((s) => `<button class="radio-card ${s.subId === d.sub ? 'on' : ''}" data-sub="${s.subId}"><span class="radio-dot"></span><div class="grow minw0 left"><b class="ellipsis">${esc(s.name)}</b><div class="muted xs">${s.duration} min · per ${esc(s.unit)}</div></div><span class="price">${DR.cards.priceHTML(s.price, s.unit, cc)}</span></button>`).join('')}</div>
      </section>
      <section class="card"><div class="card-h"><h2>2 · Where</h2></div>
        ${both ? `<div class="mb12">${DR.ui.seg([['onsite', `${icon('home2', 16)} At my place`], ['online', `${icon('video', 16)} Online`]], d.mode, 'mode')}</div>` : ''}
        ${d.mode === 'online' ? `<p class="notice">${icon('video', 16)} A secure video link will be shared in chat 15 minutes before your session.</p>` : `
          <div class="radio-list">${addrs.map((a) => `<div class="radio-card ${a.id === d.addr ? 'on' : ''}" data-addr="${a.id}" role="button" tabindex="0"><span class="radio-dot"></span><div class="grow minw0 left" data-no-i18n><b>${esc(a.label)}</b> <span class="muted xs">${esc(a.area)}</span><div class="small ellipsis">${esc(a.line)} ${esc(a.unit)}, ${esc(a.postal)}</div></div><button class="icon-btn sm" data-edit-addr="${a.id}" aria-label="Edit address">${icon('edit', 16)}</button></div>`).join('')}</div>
          <button class="btn btn-ghost btn-block mt8" id="addAddr">${icon('plus', 16)} Add address</button>`}
      </section>
      <section class="card"><div class="card-h"><h2>3 · Date</h2><span class="muted small">${fmtDate(d.date)}</span></div>${DR.picker.datesHTML(days, d.date)}</section>
      <section class="card"><div class="card-h"><h2>4 · Time</h2><span class="muted small">${svc.duration} min session</span></div>
        ${DR.picker.slotsHTML(p, d.date, svc.duration, d.time)}
        <div class="legend"><span><i class="lg-free"></i>Available</span><span><i class="lg-sel"></i>Selected</span><span><i class="lg-off"></i>Unavailable</span></div>
      </section>
      <section class="card"><div class="card-h"><h2>Notes for your provider</h2></div>
        <textarea class="input" id="notes" rows="3" maxlength="500" placeholder="${DR.GROUP[p.groupId].id === 'tuition' ? 'Student level, subjects, topics to focus on…' : 'Anything they should know — parking, pets, specific requests…'}">${esc(d.notes)}</textarea>
      </section>
      <section class="card"><div class="card-h"><h2>Payment summary</h2></div>
        <div class="kv"><span>${esc(svc.name)}</span><b>${money(svc.price, cc)}</b></div>
        <div class="kv"><span>Travel fee <small class="muted">(${d.mode === 'online' ? 'online' : DR.data.distLabel(p)})</small></span><b>${fee ? money(fee, cc) : 'Free'}</b></div>
        <div class="kv"><span>Vouchers</span><span class="muted">None available</span></div>
        <div class="kv total"><span>Total</span><b class="brand">${money(total, cc)}</b></div>
        <p class="muted xs mt8">${icon('shield', 12)} Payment is held securely by Done Right and only released after you confirm the job is done.</p>
      </section>
      <div class="bottom-bar">
        <div class="bb-total"><small class="muted">Total</small><b class="brand">${money(total, cc)}</b></div>
        <button class="btn btn-primary grow" id="place" ${ready ? '' : 'disabled'}>${ready ? `${instant ? 'Book' : 'Request'} · ${relDay(d.date)} ${d.time}` : d.time ? 'Add an address' : 'Choose a time'}</button>
      </div>`,
      mount(el) {
        el.addEventListener('click', (e) => {
          const t = (sel) => e.target.closest(sel);
          let b;
          if ((b = t('[data-edit-addr]'))) { e.stopPropagation(); return DR.addressSheet(addrs.find((a) => a.id === b.dataset.editAddr), () => DR.router.refresh()); }
          if ((b = t('[data-sub]'))) { d.sub = b.dataset.sub; d.time = null; return DR.router.refresh(); }
          if ((b = t('[data-mode]'))) { d.mode = b.dataset.mode; return DR.router.refresh(); }
          if ((b = t('[data-addr]'))) { d.addr = b.dataset.addr; return DR.router.refresh(); }
          if ((b = t('[data-date]'))) { d.date = b.dataset.date; d.time = null; return DR.router.refresh(); }
          if ((b = t('[data-time]'))) { d.time = b.dataset.time; return DR.router.refresh(); }
          if (t('#addAddr')) return DR.addressSheet(null, (a) => { d.addr = a.id; DR.router.refresh(); });
        });
        el.querySelector('#notes').addEventListener('input', (e) => { d.notes = e.target.value; });
        el.querySelector('#place').addEventListener('click', async (e) => {
          if (!ready || e.currentTarget.disabled) return;
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const addr = addrs.find((a) => a.id === d.addr);
            const order = await DR.booking.create({ user: u, provider: p, service: svc, date: d.date, time: d.time, mode: d.mode, address: addr ? Object.assign({}, addr) : null, notes: d.notes });
            DR.store.update(() => { const l = DR.store.lists(); l.cart = l.cart.filter((c) => !(c.subId === svc.subId && (!c.providerId || c.providerId === p.id))); }, { render: false });
            delete drafts[p.id];
            DR.router.go('/pay/' + order.id, { replace: true });
          } catch (err) { btn.disabled = false; DR.ui.toast(err.message); DR.router.refresh(); }
        });
      },
    };
  });

  // ---------------------------------------------------------------- Payment (demo)
  let payMethod = null;
  DR.page('/pay/:oid', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const o = S().orders.find((x) => x.id === params.oid);
    if (!o) return DR.notFound('Order not found');
    if (o.status !== 'to_pay') { DR.router.go('/order/' + o.id, { replace: true }); return null; }
    const C = DR.COUNTRIES[o.country];
    if (!payMethod || !C.payments.some((m) => m[0] === payMethod)) payMethod = C.payments[0][0];
    // local demo expires orders here; with a backend the database does it (and pay_order enforces the window)
    if (!DR.backend.enabled && DR.booking.expire()) { DR.router.go('/order/' + o.id, { replace: true }); return null; }
    const sub = DR.SUB[o.subId];
    const p = DR.data.provider(o.providerId);
    const instant = o.quoteId || (o.policy || DR.policy(p)).mode === 'instant';
    return {
      title: 'Payment', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Payment' })}
        <section class="card center pay-head"><small class="muted">Amount due</small><div class="pay-amount">${money(o.total, o.country)}</div><div class="brand small">${icon('clock', 14)} Pay within <b id="cd">15:00</b> to keep your slot</div></section>
        <section class="card"><div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><b class="ellipsis">${esc(o.serviceName)}</b><div class="muted small"><span data-no-i18n>${esc(o.providerName)}</span> · ${relDay(o.date)} ${o.time}</div></div></div>
          ${instant ? '' : `<p class="notice">${icon('clock', 16)} This is a booking request. Your payment is held and fully refunded if the provider declines or does not respond.</p>`}</section>
        <section class="card"><div class="card-h"><h2>Payment method</h2></div>
          <div class="radio-list">${C.payments.map(([k, l, d]) => `<button class="radio-card ${k === payMethod ? 'on' : ''}" data-pm="${k}"><span class="pm-icon pm-${k}">${{ paynow: 'PN', duitnow: 'DN', fpx: 'FPX', tng: 'TnG', grabpay: 'G', card: icon('card', 18), applepay: icon('phone', 18) }[k]}</span><div class="grow left"><b>${l}</b><div class="muted xs">${d}</div></div><span class="radio-dot"></span></button>`).join('')}</div>
        </section>
        <p class="notice mx">${icon('info', 16)} Demo mode — no real payment is taken and no card details are collected.</p>
        <div class="bottom-bar"><button class="btn btn-primary grow" id="pay">Pay ${money(o.total, o.country)}</button></div>`,
      mount(el) {
        const cd = el.querySelector('#cd');
        const tick = () => { const ms = Math.max(0, o.createdAt + DR.booking.PAY_WINDOW_MS - Date.now()); cd.textContent = `${DR.u.pad(Math.floor(ms / 60000))}:${DR.u.pad(Math.floor(ms / 1000) % 60)}`; if (!ms) DR.router.refresh(); };
        tick();
        const timer = setInterval(tick, 1000);
        DR.onLeave(() => clearInterval(timer));
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-pm]'); if (b) { payMethod = b.dataset.pm; el.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('on', x === b)); } });
        el.querySelector('#pay').onclick = () => {
          const sh = DR.ui.sheet({ cls: 'sheet-dialog', html: `<div class="dialog center"><div class="spinner"></div><h3 class="mt12">Processing payment…</h3><p class="muted small">Please don't close this page</p></div>` });
          setTimeout(async () => {
            try {
              const done = await DR.booking.pay(o.id, C.payments.find((m) => m[0] === payMethod)[1]);
              sh.close();
              DR.ui.toast(done.status === 'requested' ? 'Payment held — request sent to provider' : 'Payment successful — booking confirmed');
              DR.router.go('/order/' + o.id, { replace: true });
            } catch (err) { sh.close(); DR.ui.toast(err.message); }
          }, 1100);
        };
      },
    };
  });

  // ---------------------------------------------------------------- Reschedule (customer)
  const rs = {};
  DR.page('/reschedule/:oid', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const o = S().orders.find((x) => x.id === params.oid);
    if (!o || o.userId !== u.id) return DR.notFound('Order not found');
    const p = DR.data.provider(o.providerId);
    const chk = DR.booking.canReschedule(o);
    const d = rs[o.id] || (rs[o.id] = { date: null, time: null });
    const opts = { excludeOrder: o.id };
    const days = DR.picker.days(p, o.duration, null, opts);
    if (!d.date || !days.some((x) => x.k === d.date)) d.date = (days.find((c) => c.n > 0) || days[0]).k;
    const pol = Object.assign(DR.defaultPolicy(), o.policy || DR.policy(p));  // rules this booking was made under
    return {
      title: 'Reschedule', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Reschedule' })}
        <section class="card"><div class="kv"><span>Current</span><b>${fmtDate(o.date)}, ${o.time}</b></div><div class="kv"><span>Changes used</span><b>${chk.used || 0} / ${pol.maxReschedules}</b></div><div class="kv"><span>Locking period</span><b>${hoursLabel(pol.rescheduleLockHours)} before start</b></div>
          ${pol.mode === 'request' && o.status === 'upcoming' ? `<p class="notice">${icon('clock', 16)} <span data-no-i18n>${esc(p.name)}</span> approves time changes. Your original slot is kept until they confirm.</p>` : ''}</section>
        ${chk.ok ? `<section class="card"><div class="card-h"><h2>New date</h2></div>${DR.picker.datesHTML(days, d.date)}</section>
        <section class="card"><div class="card-h"><h2>New time</h2></div>${DR.picker.slotsHTML(p, d.date, o.duration, d.time, opts)}</section>
        <div class="bottom-bar"><button class="btn btn-primary grow" id="go" ${d.time ? '' : 'disabled'}>${d.time ? `Move to ${relDay(d.date)} ${d.time}` : 'Choose a new time'}</button></div>`
        : `<div class="card center pad-v">${icon('lock', 36, 'muted')}<p class="mt8"><b>${esc(chk.reason)}</b></p><p class="muted small mt4">Message your provider — they can still propose a new time.</p><button class="btn btn-ghost btn-sm mt12" data-act="chat" data-oid="${o.id}">${icon('chat', 16)} Message provider</button></div>`}`,
      mount(el) {
        DR.bindOrderActions(el);
        el.addEventListener('click', (e) => {
          const dt = e.target.closest('[data-date]'); if (dt) { d.date = dt.dataset.date; d.time = null; DR.router.refresh(); }
          const tm = e.target.closest('[data-time]'); if (tm) { d.time = tm.dataset.time; DR.router.refresh(); }
        });
        const go = el.querySelector('#go');
        if (go) go.onclick = async () => {
          go.disabled = true;
          try {
            const r = await DR.booking.reschedule(o.id, d.date, d.time);
            delete rs[o.id];
            DR.ui.toast(r.pending ? 'Reschedule request sent to provider' : 'Booking moved');
            DR.router.go('/order/' + o.id, { replace: true });
          } catch (err) { DR.ui.toast(err.message); DR.router.refresh(); }
        };
      },
    };
  });

  // ---------------------------------------------------------------- Provider: propose a new time
  DR.proposeSheet = function (o) {
    const p = DR.data.provider(o.providerId);
    const st = { date: o.date, time: null };
    const opts = { excludeOrder: o.id, ignoreLead: true };
    const body = () => `${DR.picker.datesHTML(DR.picker.days(p, o.duration, null, opts), st.date)}<div class="mt12">${DR.picker.slotsHTML(p, st.date, o.duration, st.time, opts)}</div>
      <textarea class="input mt12" id="pnote" rows="2" placeholder="Reason (optional), e.g. running late from previous job"></textarea>
      <button class="btn btn-primary btn-block mt12" id="psend" ${st.time ? '' : 'disabled'}>Send proposal</button>`;
    const sh = DR.ui.sheet({
      title: 'Propose a new time', full: true, html: `<p class="muted small mb12">The customer must accept before the booking moves.</p><div id="pb">${body()}</div>`,
      mount(s) {
        s.addEventListener('click', async (e) => {
          const dt = e.target.closest('[data-date]'); if (dt) { st.date = dt.dataset.date; st.time = null; s.querySelector('#pb').innerHTML = body(); }
          const tm = e.target.closest('[data-time]'); if (tm) { st.time = tm.dataset.time; const note = (s.querySelector('#pnote') || {}).value || ''; s.querySelector('#pb').innerHTML = body(); s.querySelector('#pnote').value = note; }
          if (e.target.closest('#psend')) {
            try { await DR.booking.propose(o.id, st.date, st.time, s.querySelector('#pnote').value); sh.close(); DR.ui.toast('Proposal sent to customer'); DR.router.refresh(); } catch (err) { DR.ui.toast(err.message); }
          }
        });
      },
    });
  };

  // ---------------------------------------------------------------- Order actions
  function peerOf(o) { const u = DR.store.user(); return u && u.id === o.providerId ? o.userId : o.providerId; }
  DR.orderAct = async function (act, o) {
    const B = DR.booking;
    const done = (msg) => { if (msg) DR.ui.toast(msg); DR.router.refresh(); };
    try {
      if (act === 'pay') return DR.router.go('/pay/' + o.id);
      if (act === 'chat') return DR.router.go('/chat/' + peerOf(o));
      if (act === 'call') return DR.call.start(peerOf(o));
      if (act === 'rebook') return DR.router.go(`/book/${o.providerId}?sub=${o.subId}`);
      if (act === 'review') return DR.reviewSheet(o);
      if (act === 'reschedule') { const c = B.canReschedule(o); if (!c.ok) return DR.ui.toast(c.reason); return DR.router.go('/reschedule/' + o.id); }
      if (act === 'cancel') {
        const t = B.cancelTerms(o);
        const text = o.status === 'to_pay' ? 'Your time slot will be released.' : t.free ? `You will receive a full refund of ${money(t.refund, o.country)} within 3–5 working days.` : `Less than ${hoursLabel(t.hours)} to your appointment — a 50% fee (${money(t.fee, o.country)}) applies. ${money(t.refund, o.country)} will be refunded.`;
        if (await DR.ui.confirm({ title: o.status === 'requested' ? 'Cancel this request?' : 'Cancel this order?', text, ok: 'Cancel order', cancel: 'Keep order', danger: true })) done((await B.cancel(o.id, 'customer'), 'Order cancelled'));
      }
      if (act === 'simulate') done((await B.markDone(o.id), `${o.providerName} marked the job as done`));
      if (act === 'confirm') {
        if (await DR.ui.confirm({ title: 'Confirm job completed?', text: `Payment of ${money(o.total, o.country)} will be released to ${esc(o.providerName)}.`, ok: 'Confirm' })) { await B.confirmDone(o.id); DR.router.refresh(); DR.reviewSheet(S().orders.find((x) => x.id === o.id)); }
      }
      if (act === 'issue') {
        const sh = DR.ui.sheet({ title: 'Report an issue', html: `<div class="list">${['Provider did not show up', 'Service not completed', 'Quality not as expected', 'Charged extra outside the app', 'Safety concern'].map((r) => `<label class="list-item"><span>${r}</span><input type="radio" name="i"></label>`).join('')}</div><textarea class="input mt12" rows="3" placeholder="Describe what happened"></textarea><button class="btn btn-danger btn-block mt12" id="go">Submit to Done Right Guarantee</button>`, mount(s) { s.querySelector('#go').onclick = () => { sh.close(); DR.ui.toast('Case opened — our team will contact you within 2 hours'); }; } });
      }
      if (act === 'proposal-yes') done((await B.respondProposal(o.id, true), 'New time accepted'));
      if (act === 'proposal-no') done((await B.respondProposal(o.id, false), 'Kept the original time'));
      if (act === 'pro-accept') done((await B.accept(o.id), 'Booking accepted'));
      if (act === 'pro-decline') {
        if (await DR.ui.confirm({ title: o.status === 'requested' ? 'Decline this request?' : 'Cancel this booking?', text: 'The customer will be fully refunded. Frequent declines lower your ranking.', ok: 'Decline', danger: true })) done((await B.decline(o.id), 'Booking declined'));
      }
      if (act === 'pro-done') done((await B.markDone(o.id), 'Marked as completed — waiting for customer confirmation'));
      if (act === 'pro-propose') DR.proposeSheet(o);
      if (act === 'pro-resched-yes') done((await B.respondReschedule(o.id, true), 'Reschedule approved'));
      if (act === 'pro-resched-no') done((await B.respondReschedule(o.id, false), 'Reschedule declined'));
    } catch (err) { DR.ui.toast(err.message); DR.router.refresh(); }
  };

  DR.reviewSheet = function (o) {
    const TAGS = ['Punctual', 'Professional', 'Friendly', 'Skilled', 'Great value', 'Tidy', 'Good communication', 'Would rebook'];
    const st = { stars: 5, tags: [], photos: [] };
    const sh = DR.ui.sheet({
      title: 'Rate your experience', full: true,
      html: `<div class="center"><img class="av-lg round" src="${DR.ui.avatar(o.providerId, (DR.data.provider(o.providerId) || {}).gender)}" alt=""><h3 class="mt8" data-no-i18n>${esc(o.providerName)}</h3><p class="muted small">${esc(o.serviceName)} · ${relDay(o.date)}</p>
        <div class="star-pick" id="sp">${[1, 2, 3, 4, 5].map((i) => `<button data-star="${i}" class="on" aria-label="${i} stars">${icon('star', 34)}</button>`).join('')}</div><p class="brand small" id="slabel">Excellent</p></div>
        <div class="chips mt12" id="tags">${TAGS.map((t) => `<button class="chip" data-tag="${t}">${t}</button>`).join('')}</div>
        <textarea class="input mt12" id="rtext" rows="4" maxlength="600" placeholder="Share details to help other customers"></textarea>
        <div class="mt12"><span class="field-label">Photos (up to 4)</span><div class="review-photos" id="rph"><label class="rp-add">${icon('camera', 22)}<input type="file" accept="image/*" multiple hidden></label></div></div>
        <label class="check mt12"><input type="checkbox" id="anon"><span>Post anonymously</span></label>
        <p class="muted xs mt8">${icon('verified', 12)} Your review will show a “Verified booking” badge.</p>
        <button class="btn btn-primary btn-block mt16" id="submit">Submit review</button>`,
      mount(s) {
        const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
        s.querySelector('#sp').addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (!b) return; st.stars = +b.dataset.star; s.querySelectorAll('[data-star]').forEach((x) => x.classList.toggle('on', +x.dataset.star <= st.stars)); s.querySelector('#slabel').textContent = (labels[st.stars]); });
        s.querySelector('#tags').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (!b) return; b.classList.toggle('on'); st.tags = [...s.querySelectorAll('[data-tag].on')].map((x) => x.dataset.tag); });
        s.querySelector('#rph input').addEventListener('change', async (e) => {
          for (const f of [...e.target.files].slice(0, 4 - st.photos.length)) {
            const file = await DR.files.fromInput(f, 900);
            st.photos.push(file);
            s.querySelector('.rp-add').insertAdjacentHTML('beforebegin', `<img data-file="${file.id}" alt="">`);
          }
          DR.files.hydrate(s);
          if (st.photos.length >= 4) s.querySelector('.rp-add').hidden = true;
        });
        s.querySelector('#submit').onclick = async (e) => {
          const u = DR.store.user();
          const text = s.querySelector('#rtext').value.trim() || st.tags.join(', ') || labels[st.stars];
          const anon = s.querySelector('#anon').checked;
          if (DR.backend.enabled) {
            // saved on the server: photos go to the public review-photos bucket, the booking is completed there
            const btn = e.currentTarget;
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              await DR.backend.submitReview(o, { stars: st.stars, text, tags: st.tags, anon, photos: st.photos });
            } catch (err) { btn.disabled = false; return DR.ui.toast(err.message); }
            sh.close();
            DR.ui.toast('Thanks for your review!');
            return DR.router.refresh();
          }
          DR.store.update((state) => {
            state.reviews.unshift({ id: DR.u.uid('r'), providerId: o.providerId, orderId: o.id, userId: u.id, name: anon ? 'Anonymous user' : u.name, anon, stars: st.stars, text, tags: st.tags, photos: st.photos, verified: true, date: Date.now(), area: o.address ? o.address.area : state.area, sub: o.serviceName, subId: o.subId, useful: 0, vip: false, repeat: state.orders.filter((x) => x.userId === u.id && x.providerId === o.providerId && x.status !== 'cancelled').length > 1 });
            const x = state.orders.find((y) => y.id === o.id); x.status = 'completed'; x.reviewed = true; x.log.push({ s: 'completed', ts: Date.now() });
          });
          sh.close();
          DR.ui.toast('Thanks for your review!');
        };
      },
    });
  };

  function orderButtons(o, asProvider) {
    const B = (act, label, cls = 'btn-ghost') => `<button class="btn ${cls} btn-sm" data-act="${act}" data-oid="${o.id}">${label}</button>`;
    if (asProvider) {
      if (o.rescheduleRequest) return B('pro-resched-no', 'Decline change') + B('pro-resched-yes', 'Approve new time', 'btn-primary');
      return {
        requested: B('pro-decline', 'Decline') + B('chat', 'Message') + B('pro-accept', 'Accept', 'btn-primary'),
        upcoming: B('pro-decline', 'Cancel') + B('pro-propose', 'Change time') + B('pro-done', 'Mark completed', 'btn-primary'),
        to_confirm: B('chat', 'Message'),
      }[o.status] || B('chat', 'Message');
    }
    if (o.proposal) return B('proposal-no', 'Keep original') + B('proposal-yes', 'Accept new time', 'btn-primary');
    return {
      to_pay: B('cancel', 'Cancel') + B('pay', 'Pay now', 'btn-primary'),
      requested: B('cancel', 'Cancel request') + B('chat', 'Message'),
      upcoming: B('cancel', 'Cancel') + B('reschedule', 'Reschedule') + B('chat', 'Message', 'btn-primary'),
      to_confirm: B('issue', 'Report issue') + B('confirm', 'Confirm done', 'btn-primary'),
      to_review: B('rebook', 'Book again') + B('review', 'Write review', 'btn-primary'),
      completed: B('rebook', 'Book again', 'btn-primary'),
      cancelled: B('rebook', 'Book again'),
    }[o.status] || '';
  }
  DR.orderButtons = orderButtons;

  function orderCard(o, asProvider = false) {
    const sub = DR.SUB[o.subId];
    const flag = o.rescheduleRequest ? `<div class="order-flag">${icon('swap', 14)} Reschedule requested → ${relDay(o.rescheduleRequest.date)} ${o.rescheduleRequest.time}</div>` : o.proposal ? `<div class="order-flag">${icon('swap', 14)} New time proposed → ${relDay(o.proposal.date)} ${o.proposal.time}</div>` : '';
    return `<div class="ocard" data-go="/order/${o.id}" role="link" tabindex="0">
      <div class="row between"><span class="row gap6 minw0">${icon(asProvider ? 'user' : 'store', 15)}<b class="ellipsis" data-no-i18n>${esc(asProvider ? o.customerName || 'Customer' : o.providerName)}</b>${icon('right', 13)}</span>${DR.ui.statusPill(o.status)}</div>
      <div class="row gap10 mt8">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><b class="ellipsis">${esc(o.serviceName)}</b><div class="muted small">${relDay(o.date)} · ${o.time} · ${o.mode === 'online' ? ('Online') : esc((o.address && o.address.area) || 'On-site')}</div><div class="muted xs">${o.no}${o.quoteId ? ` · From quote` : ''}</div></div><b>${money(o.total, o.country)}</b></div>
      ${flag}<div class="ocard-actions">${orderButtons(o, asProvider)}</div>
    </div>`;
  }
  DR.orderCard = orderCard;
  DR.bindOrderActions = (el) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const o = S().orders.find((x) => x.id === b.dataset.oid);
    if (o) DR.orderAct(b.dataset.act, o);
  });

  // ---------------------------------------------------------------- Orders list
  const TABS = [['all', 'All', null], ['to_pay', 'To pay', ['to_pay']], ['upcoming', 'Upcoming', ['requested', 'upcoming']], ['to_confirm', 'To confirm', ['to_confirm']], ['to_review', 'To review', ['to_review']]];
  DR.page('/orders', ({ query }) => {
    const u = DR.store.user();
    const tab = query.tab || 'all';
    const q = (query.q || '').toLowerCase();
    if (!u) return { tab: 'orders', title: 'Orders', html: `<div class="topbar"><h1 class="h1">Orders</h1></div>${DR.ui.empty('clipboard', 'Sign in to see your bookings', '<a class="btn btn-primary" href="#/auth?next=%2Forders">Sign in / Register</a>')}` };
    const mine = S().orders.filter((o) => o.userId === u.id);
    const cur = TABS.find((t) => t[0] === tab) || TABS[0];
    let list = cur[2] ? mine.filter((o) => cur[2].includes(o.status)) : mine;
    if (q) list = list.filter((o) => `${o.serviceName} ${o.providerName} ${o.no}`.toLowerCase().includes(q));
    const quotes = S().quotes.filter((x) => x.userId === u.id && x.status === 'open');
    const newOffers = quotes.reduce((n, x) => n + x.offers.filter((of) => of.status === 'pending').length, 0);
    return {
      tab: 'orders', title: 'Orders', seo: { noindex: true },
      html: `<div class="topbar"><form class="searchbar grow" id="oq">${icon('search', 18)}<input name="q" type="search" placeholder="Search my orders" value="${esc(query.q || '')}"></form><a class="icon-btn" href="#/cart" aria-label="Cart">${icon('cart')}</a></div>
        <nav class="tabs tabs-scroll">${TABS.map(([k, l, st]) => { const n = st ? mine.filter((o) => st.includes(o.status)).length : 0; return `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/orders?tab=${k}">${l}${n ? `<i class="count">${n}</i>` : ''}</a>`; }).join('')}</nav>
        <a class="quote-banner mx mt8" href="#/quotes">${icon('quote', 20)}<span class="grow"><b>Quote requests</b><br><small class="muted">${quotes.length ? `${quotes.length} open · ${newOffers} offer${newOffers === 1 ? '' : 's'} to review` : 'Describe a custom job and get offers from pros'}</small></span>${icon('right', 16)}</a>
        <div class="olist">${list.map((o) => orderCard(o)).join('') || DR.ui.empty('clipboard', 'No orders yet<br><small class="muted">Find a service you\'ll love</small>', '<a class="btn btn-outline" href="#/">Explore services</a>')}</div>`,
      mount(el) {
        DR.bindOrderActions(el);
        el.querySelector('#oq').addEventListener('submit', (e) => { e.preventDefault(); DR.router.go(`/orders?tab=${tab}&q=${encodeURIComponent(new FormData(e.target).get('q'))}`, { replace: true }); });
      },
    };
  });

  // ---------------------------------------------------------------- Order detail
  const STATUS_TEXT = {
    to_pay: ['Waiting for payment', 'Complete payment within 15 minutes to secure your slot.'],
    requested: ['Waiting for provider approval', 'Your payment is held. You will be fully refunded if the provider declines.'],
    upcoming: ['Booking confirmed', 'Your provider will arrive on time. You can message them anytime.'],
    to_confirm: ['Job marked as done', 'Please check the work and confirm to release payment.'],
    to_review: ['Completed', 'How did it go? Your review helps other customers.'],
    completed: ['Completed', 'Thanks for booking with Done Right.'],
    cancelled: ['Cancelled', ''],
  };
  DR.page('/order/:oid', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const o = S().orders.find((x) => x.id === params.oid);
    if (!o || (o.userId !== u.id && o.providerId !== u.id)) return DR.notFound('Order not found');
    const asProvider = o.providerId === u.id;
    const p = DR.data.provider(o.providerId);
    const steps = ['Booked', 'Paid', 'Service', 'Confirmed', 'Reviewed'];
    const stage = { to_pay: 0, requested: 1, upcoming: 1, to_confirm: 2, to_review: 3, completed: 4, cancelled: -1 }[o.status];
    const [title, desc] = STATUS_TEXT[o.status];
    const sub = DR.SUB[o.subId];
    const peer = asProvider ? o.userId : o.providerId;
    const call = DR.canCall(u.id, peer);
    const chk = !asProvider && DR.booking.canReschedule(o);
    const pol = Object.assign(DR.defaultPolicy(), o.policy || DR.policy(p));  // rules this booking was made under
    const deadline = o.status === 'requested' && o.requestExpiresAt ? `<p class="xs mt4">${icon('clock', 12)} ${asProvider ? 'Respond by' : 'Provider responds by'} ${fmtTs(o.requestExpiresAt)}</p>` : '';
    return {
      title: 'Order details', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Order details', right: `<a class="icon-btn" href="#/chat/support" aria-label="Support">${icon('headset')}</a>` })}
        <section class="status-hero ${o.status}"><h2>${title}</h2><p>${o.status === 'cancelled' ? esc(o.cancelReason || '') + (o.refund ? ` · Refund ${money(o.refund, o.country)}` : '') : desc}</p>${deadline}
          ${stage >= 0 ? `<div class="stepper">${steps.map((s, i) => `<div class="step ${i <= stage ? 'done' : ''}"><i>${i <= stage ? icon('check', 12) : ''}</i><small>${s}</small></div>`).join('')}</div>` : ''}</section>
        ${o.proposal && !asProvider ? `<section class="card alert-card"><b>${icon('swap', 16)} New time proposed</b><p class="small mt4"><span data-no-i18n>${esc(o.providerName)}</span> → <b>${fmtDate(o.proposal.date)}, ${o.proposal.time}</b></p>${o.proposal.note ? `<p class="muted small" data-no-i18n>“${esc(o.proposal.note)}”</p>` : ''}</section>` : ''}
        ${o.rescheduleRequest ? `<section class="card alert-card"><b>${icon('swap', 16)} Reschedule requested</b><p class="small mt4">→ <b>${fmtDate(o.rescheduleRequest.date)}, ${o.rescheduleRequest.time}</b></p><p class="muted xs">${asProvider ? 'Approve or decline below.' : 'Waiting for provider approval — your original time is kept until then.'}</p></section>` : ''}
        <section class="card"><div class="row gap10">${DR.chat.avatar(peer, 'av-md round')}<div class="grow minw0"><b data-no-i18n>${esc(DR.chat.name(peer))}</b><div class="muted xs ellipsis">${asProvider ? ('Customer') : esc(p ? p.role : '')}</div></div>
          <button class="icon-btn" data-act="chat" data-oid="${o.id}" aria-label="Message">${icon('chat')}</button><button class="icon-btn ${call.ok ? '' : 'dim'}" data-act="call" data-oid="${o.id}" aria-label="Call">${icon('call')}</button></div>
          ${call.ok ? `<p class="muted xs mt8">${icon('lock', 11)} Calls use a masked number: <b>${DR.masked(u.id, peer, o.country)}</b></p>` : ''}</section>
        <section class="card"><div class="card-h"><h2>Appointment</h2>${!asProvider && chk ? (chk.ok ? `<button class="link small" data-act="reschedule" data-oid="${o.id}">${icon('swap', 13)} Reschedule</button>` : ['upcoming', 'requested'].includes(o.status) ? `<span class="muted xs">${icon('lock', 11)} ${esc(chk.reason)}</span>` : '') : ''}</div>
          <div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div><b>${esc(o.serviceName)}</b><div class="muted small">${o.duration} min · per ${esc(o.unit)}</div></div></div>
          <div class="kv mt12"><span>${icon('calendar', 15)} Date & time</span><b>${fmtDate(o.date)}, ${o.time}</b></div>
          ${o.prev ? `<div class="kv"><span>${icon('swap', 15)} Moved from</span><span class="muted">${fmtDate(o.prev.date)}, ${o.prev.time}</span></div>` : ''}
          <div class="kv"><span>${icon(o.mode === 'online' ? 'video' : 'pin', 15)} ${o.mode === 'online' ? 'Online session' : 'Address'}</span><b class="right" data-no-i18n>${o.mode === 'online' ? ('Video link via chat') : `${esc(o.address.line)} ${esc(o.address.unit)}<br><small class="muted">${esc(o.address.area)} ${esc(o.address.postal)}</small>`}</b></div>
          ${o.notes ? `<div class="kv"><span>${icon('doc', 15)} Notes</span><b class="right" data-no-i18n>${esc(o.notes)}</b></div>` : ''}
          <div class="kv"><span>${icon('rules', 15)} Policy</span><span class="right small muted">Free cancel ${hoursLabel(pol.freeCancelHours)} before · reschedule ${o.reschedules || 0}/${pol.maxReschedules}</span></div>
        </section>
        <section class="card"><div class="card-h"><h2>Payment</h2></div>
          <div class="kv"><span>Service</span><b>${money(o.price, o.country)}</b></div>
          <div class="kv"><span>Travel fee</span><b>${o.fee ? money(o.fee, o.country) : 'Free'}</b></div>
          <div class="kv total"><span>${o.paidAt ? 'Total paid' : 'Total'}</span><b class="brand">${money(o.total, o.country)}</b></div>
          ${o.payMethod ? `<div class="kv"><span>Method</span><span>${esc(o.payMethod)}</span></div>` : ''}
        </section>
        <section class="card small"><div class="kv"><span class="muted">Order no.</span><button class="link" id="copy">${o.no} ${icon('doc', 13)}</button></div><div class="kv"><span class="muted">Created</span><span>${fmtTs(o.createdAt)}</span></div>${o.paidAt ? `<div class="kv"><span class="muted">Paid</span><span>${fmtTs(o.paidAt)}</span></div>` : ''}</section>
        ${o.status === 'upcoming' && !asProvider && !DR.backend.enabled && !DR.chat.isReal(o.providerId) ? `<div class="demo-box mx"><b>${icon('sparkle', 14)} Demo</b><p class="small muted">Skip ahead and simulate the provider finishing the job.</p><button class="btn btn-ghost btn-sm mt8" data-act="simulate" data-oid="${o.id}">Simulate job completed</button></div>` : ''}
        <div class="bottom-bar end">${orderButtons(o, asProvider) || '<span class="muted small">No actions available</span>'}</div>`,
      mount(el) {
        DR.bindOrderActions(el);
        el.querySelector('#copy').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(o.no); DR.ui.toast('Order number copied'); };
      },
    };
  });

  // ---------------------------------------------------------------- Cart & following
  let followSort = 'recent';
  DR.page('/cart', ({ query }) => {
    const tab = query.tab || 'cart';
    const f = query.f || 'providers';
    const s = S();
    const mine = DR.store.lists();
    let body = '';
    if (tab === 'cart') {
      body = mine.cart.length ? `<div class="card">${mine.cart.map((c) => {
        const sub = DR.SUB[c.subId]; if (!sub) return '';
        const p = c.providerId && DR.data.provider(c.providerId);
        return `<div class="cart-row">${DR.ui.thumb(sub, { cls: 'thumb-sm' })}<a class="grow minw0" href="#/service/${sub.id}"><b class="ellipsis">${esc(sub.name)}</b><div class="muted xs">${p ? `<span data-no-i18n>${esc(p.name)}</span>` : ('Best match provider')}</div><div class="price">${DR.cards.priceHTML(DR.data.catalogPrice(sub), sub.unit)}</div></a><div class="col gap6"><a class="btn btn-primary btn-xs" href="#${p ? `/book/${p.id}?sub=${sub.id}` : `/service/${sub.id}`}">Book</a><button class="link muted xs" data-rm="${c.id}">Remove</button></div></div>`;
      }).join('')}</div>` : DR.ui.empty('cart', 'Your cart is empty<br><small class="muted">Save services here to book later</small>', '<a class="btn btn-outline" href="#/">Browse services</a>');
    } else {
      const sub = `<nav class="tabs">${[['providers', 'Providers'], ['services', 'Services'], ['shops', 'Shops']].map(([k, l]) => `<a class="tab-link ${f === k ? 'on' : ''}" href="#/cart?tab=following&f=${k}">${l}</a>`).join('')}</nav>`;
      if (f === 'providers') {
        const list = mine.follows.providers.map((id) => DR.data.provider(id)).filter(Boolean);
        if (followSort === 'followers') list.sort((a, b) => b.followers - a.followers);
        if (followSort === 'avail') list.sort((a, b) => { const na = DR.avail.next(a), nb = DR.avail.next(b); return (na ? na.day * 1440 + DR.u.toMin(na.time) : 1e9) - (nb ? nb.day * 1440 + DR.u.toMin(nb.time) : 1e9); });
        if (followSort === 'distance') list.sort((a, b) => DR.data.dist(a) - DR.data.dist(b));
        body = `${sub}<div class="filterbar">${[['recent', 'Followed'], ['followers', 'Followers'], ['avail', 'Available'], ['distance', 'Distance']].map(([k, l]) => `<button class="fb-chip ${followSort === k ? 'on' : ''}" data-fs="${k}">${l} ${icon('down', 11)}</button>`).join('')}</div>
          <div class="plist">${list.map((p) => DR.cards.provider(p)).join('') || DR.ui.empty('heart', 'No followed providers yet', '<a class="btn btn-outline" href="#/nearby">Find providers</a>')}</div>`;
      } else if (f === 'services') {
        body = `${sub}${mine.follows.services.length ? `<div class="svc-rows">${mine.follows.services.map((id) => DR.SUB[id] && DR.cards.svcRow(DR.SUB[id])).join('')}</div>` : DR.ui.empty('heart', 'Great services are waiting to be discovered')}`;
      } else {
        body = `${sub}${mine.follows.shops.length ? `<div class="card">${mine.follows.shops.map((name) => { const n = DR.data.providers().filter((p) => p.shop === name).length; return `<a class="list-item" href="#/search?q=${encodeURIComponent(name)}"><span class="row gap10">${icon('store', 20)}<span><b data-no-i18n>${esc(name)}</b><br><small class="muted">${n} provider${n === 1 ? '' : 's'}</small></span></span>${icon('right', 16)}</a>`; }).join('')}</div>` : DR.ui.empty('heart', 'Follow shops from a provider\'s profile')}`;
      }
    }
    return {
      title: tab === 'cart' ? 'Cart' : 'Following', seo: { noindex: true },
      html: `<header class="navbar"><button class="icon-btn nav-back" data-back aria-label="Back">${icon('back', 24)}</button><div class="nav-title">${DR.ui.seg([['cart', ('Cart')], ['following', ('Following')]], tab, 'ctab')}</div><div class="nav-right">${tab === 'cart' && mine.cart.length ? `<button class="icon-btn" id="clear" aria-label="Clear cart">${icon('broom')}</button>` : tab === 'following' ? `<button class="icon-btn" id="bell" aria-label="Nearby alerts">${icon('bell')}</button>` : ''}</div></header>
        ${tab === 'following' && !s.tips.nearby ? `<div class="notice mx mt8">${icon('bell', 16)} <span class="grow"><b>Nearby alerts:</b> get notified when providers you follow are close to you.</span><button class="icon-btn sm" id="tipx" aria-label="Dismiss">${icon('x', 14)}</button></div>` : ''}
        ${body}`,
      mount(el) {
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-ctab]'); if (t) return DR.router.go('/cart?tab=' + t.dataset.ctab, { replace: true });
          const rm = e.target.closest('[data-rm]'); if (rm) return DR.store.update(() => { const l = DR.store.lists(); l.cart = l.cart.filter((c) => c.id !== rm.dataset.rm); });
          const fs = e.target.closest('[data-fs]'); if (fs) { followSort = fs.dataset.fs; return DR.router.refresh(); }
          if (e.target.closest('#clear') && await DR.ui.confirm({ title: 'Clear cart?', ok: 'Clear', danger: true })) DR.store.update(() => { DR.store.lists().cart = []; });
          if (e.target.closest('#tipx')) DR.store.update((st) => { st.tips.nearby = true; });
          if (e.target.closest('#bell')) { DR.store.update((st) => { st.notif.nearby = !st.notif.nearby; st.tips.nearby = true; }, { render: false }); DR.ui.toast(S().notif.nearby ? 'Nearby alerts on' : 'Nearby alerts off'); }
        });
      },
    };
  });

  // ---------------------------------------------------------------- Messages
  DR.page('/messages', () => {
    if (!DR.requireAuth()) return null;
    const uid = DR.store.sessionId();
    const threads = DR.chat.list(uid).filter(([, t]) => DR.chat.peer(t, uid) !== 'support');
    const sup = DR.chat.get(uid, 'support');
    const row = (peer, th) => {
      const last = th && th.msgs[th.msgs.length - 1];
      const unread = th && th.unread ? th.unread[uid] || 0 : 0;
      return `<a class="thread" href="#/chat/${peer}">${DR.chat.avatar(peer, 'av-md round')}<div class="grow minw0"><div class="row between"><b class="ellipsis" data-no-i18n>${esc(DR.chat.name(peer))}</b><small class="muted">${last ? DR.u.timeAgo(last.ts) : ''}</small></div><div class="muted small ellipsis">${DR.rt.online(peer) && peer !== 'support' ? `<span class="online-dot"></span>` : ''}${last ? `<span ${last.system ? '' : 'data-no-i18n'}>${esc(last.text)}</span>` : ('Hi! How can we help you today?')}</div></div>${unread ? `<i class="dot-badge static">${unread}</i>` : ''}</a>`;
    };
    return {
      title: 'Messages', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: ('Messages'), cls: 'navbar-brand', right: `<a class="icon-btn col" href="#/chat/support" aria-label="Support">${icon('headset', 22)}</a>` })}
        <div class="card flush">${row('support', sup)}${threads.map(([, th]) => row(DR.chat.peer(th, uid), th)).join('')}</div>
        ${threads.length ? '' : DR.ui.empty('chat', 'No messages yet')}`,
    };
  });

  DR.page('/chat/:peer', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const uid = DR.store.sessionId();
    const peer = params.peer;
    const name = DR.chat.name(peer);
    const real = DR.chat.isReal(peer);
    const tid = DR.chat.tid(uid, peer);
    DR.chat.markRead(uid, peer);
    const call = DR.canCall(uid, peer);
    const quick = peer === 'support' ? ['I need help with a booking', 'Refund status', 'Report a safety issue'] : ['Are you available this weekend?', "What's included?", 'Do you bring your own tools?', 'Can you do online sessions?'];
    // ✓ sent · ✓✓ read (server conversations only)
    const tick = (m, th) => {
      const st = DR.chat.receipt(m, th, uid);
      if (!st) return '';
      const label = { sending: 'Sending message', sent: 'Message sent', read: 'Message read' }[st];
      return ` <span class="receipt receipt-${st}" title="${label}" aria-label="${label}">${st === 'sending' ? '…' : st === 'read' ? '✓✓' : '✓'}</span>`;
    };
    const bubble = (m, th) => m.system ? `<div class="bubble-sys">${esc(m.text)}</div>` : `<div class="bubble ${m.from === uid ? 'me' : 'them'}"><p data-no-i18n>${esc(m.text)}</p><small>${DR.u.pad(new Date(m.ts).getHours())}:${DR.u.pad(new Date(m.ts).getMinutes())}${tick(m, th)}</small></div>`;
    const bubbles = () => { const th = DR.chat.get(uid, peer); return th && th.msgs.length ? th.msgs.map((m) => bubble(m, th)).join('') : `<div class="center muted small pad-v">${DR.chat.avatar(peer, 'av-lg round')}<p class="mt8">Start a conversation with <span data-no-i18n>${esc(name)}</span></p></div>`; };
    // presence and typing travel between tabs on this device only, so with a backend "Offline" would be a guess
    const presence = () => (!real ? (peer === 'support' ? ('Typically replies in 5 min') : ('Demo account · auto-replies')) : DR.rt.isTyping(tid, peer) ? ('typing…') : DR.rt.online(peer) ? ('Online') : DR.backend.enabled ? '' : ('Offline'));
    let render = () => {};
    return {
      title: name, bar: true, cls: 'chat-page', seo: { noindex: true },
      onSync() { render(); },
      html: `<header class="navbar"><button class="icon-btn nav-back" data-back aria-label="Back">${icon('back', 24)}</button><div class="nav-title col chat-title"><span data-no-i18n>${esc(name)}</span><small class="muted" id="presence">${presence()}</small></div>
          <div class="nav-right"><button class="icon-btn ${call.ok ? '' : 'dim'}" id="callBtn" aria-label="Voice call">${icon('call')}</button>${peer !== 'support' && !String(peer).startsWith('demo-') && DR.data.provider(peer) ? `<a class="icon-btn" href="#/provider/${peer}" aria-label="View profile">${icon('user')}</a>` : ''}</div></header>
        <p class="safety">${icon('shield', 14)} For your safety, keep payments and chats on Done Right. We will never ask for your OTP or bank password.${call.ok ? ' <span>Calls use a masked number.</span>' : ''}</p>
        <div class="chat-body" id="cb">${bubbles()}</div>
        <div class="bottom-bar chat-bar">
          <div class="quick">${quick.map((q) => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          <form class="row gap8 grow" id="cf"><input class="input grow" id="ci" placeholder="Type a message" autocomplete="off" maxlength="1000"><button class="btn btn-primary" aria-label="Send">${icon('send', 18)}</button></form>
        </div>`,
      mount(el) {
        const cb = el.querySelector('#cb');
        const scroll = () => window.scrollTo(0, document.body.scrollHeight);
        render = () => { DR.chat.markRead(uid, peer); cb.innerHTML = bubbles(); el.querySelector('#presence').textContent = presence(); scroll(); };
        scroll();
        const offChat = DR.on('chat', (e) => { if (e.tid === tid) render(); });
        const offRt = DR.on('rt:typing', (m) => { if (m.tid === tid) { el.querySelector('#presence').textContent = presence(); setTimeout(() => { const pr = el.querySelector('#presence'); if (pr) pr.textContent = presence(); }, 3600); } });
        const offPres = DR.on('rt:presence', (m) => { if (m.uid === peer) { const pr = el.querySelector('#presence'); if (pr) pr.textContent = presence(); } });
        DR.onLeave(() => { offChat(); offRt(); offPres(); });
        const send = (text) => { if (text.trim()) { DR.chat.send(uid, peer, text); render(); } };
        const input = el.querySelector('#ci');
        let lastTyping = 0;
        input.addEventListener('input', () => { if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); DR.rt.post({ type: 'typing', tid, uid }); } });
        el.querySelector('#cf').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); input.value = ''; input.focus(); });
        el.addEventListener('click', (e) => { const q = e.target.closest('[data-quick]'); if (q) send(q.dataset.quick); });
        el.querySelector('#callBtn').onclick = () => DR.call.start(peer);
      },
    };
  });
})(window.DR);
