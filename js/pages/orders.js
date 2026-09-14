/* Done Right — Booking, payment, orders, cart & following, messages */
(function (DR) {
  'use strict';
  const { esc, dateKey, addDays, parseKey, relDay, fmtDate, fmtTs } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  // ---------------------------------------------------------------- Address sheet (shared)
  DR.addressSheet = function (existing, onSave) {
    const u = DR.store.user();
    const cc = u.country || S().country;
    const C = DR.COUNTRIES[cc];
    const a = Object.assign({ id: DR.u.uid('a'), label: 'Home', line: '', unit: '', postal: '', area: S().area, notes: '' }, existing || {});
    const sh = DR.ui.sheet({
      title: existing ? 'Edit address' : 'Add service address', full: true,
      html: `<form id="af" class="form">
        ${DR.ui.seg([['Home', 'Home'], ['Office', 'Office'], ['Other', 'Other']], a.label, 'label')}
        ${DR.ui.field('Street / block address', `<input class="input" name="line" required value="${esc(a.line)}" placeholder="${cc === 'SG' ? 'e.g. Blk 123 Tampines Street 11' : 'e.g. 12, Jalan SS 2/24'}" autocomplete="street-address">`, '', true)}
        ${DR.ui.field('Unit / floor', `<input class="input" name="unit" value="${esc(a.unit)}" placeholder="${cc === 'SG' ? '#08-123' : 'Unit 3A-05'}">`)}
        <div class="row gap10">
          ${DR.ui.field('Postal code', `<input class="input" name="postal" required inputmode="numeric" value="${esc(a.postal)}" maxlength="${cc === 'SG' ? 6 : 5}">`, C.postalHint, true)}
          ${DR.ui.field('Area', `<select class="input" name="area">${DR.AREAS[cc].map((x) => `<option ${x.n === a.area ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}</select>`)}
        </div>
        ${DR.ui.field('Access notes', `<input class="input" name="notes" value="${esc(a.notes)}" placeholder="Gate code, parking, pets…">`)}
        <button class="btn btn-primary btn-block mt12">Save address</button>
      </form>`,
      mount(s) {
        s.addEventListener('click', (e) => { const b = e.target.closest('[data-label]'); if (b) { a.label = b.dataset.label; s.querySelectorAll('[data-label]').forEach((x) => x.classList.toggle('on', x === b)); } });
        s.querySelector('#af').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = Object.fromEntries(new FormData(e.target));
          if (!C.postal.test(fd.postal)) return DR.ui.toast(`Enter a valid ${C.postalHint}`);
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
    const today = new Date();
    const days = Array.from({ length: 14 }, (_, i) => dateKey(addDays(today, i)));
    const counts = days.map((k) => ({ k, n: DR.avail.count(p, k, svc.duration), off: !DR.avail.ranges(p, k).length }));
    if (!d.date || !days.includes(d.date)) d.date = (counts.find((c) => c.n > 0) || counts[0]).k;
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
    return {
      title: 'Book', bar: true,
      html: `${DR.ui.navbar({ title: 'Book appointment' })}
      <a class="card pro-mini" href="#/provider/${p.id}">${DR.cards.pimg(p, 0, 'av-lg')}<div class="grow minw0"><div class="row gap6"><b class="ellipsis">${esc(p.name)}</b>${DR.cards.rating(p)}</div><div class="muted small ellipsis">${esc(p.role)} · ${DR.data.distLabel(p)}</div><div class="chips-xs mt4">${p.verified.identity ? `<span class="chip-xs chip-ok">${icon('shield', 11)}ID verified</span>` : ''}${p.verified.certs ? `<span class="chip-xs chip-ok">${icon('award', 11)}Certified</span>` : ''}</div></div>${icon('right', 16)}</a>

      <section class="card"><div class="card-h"><h2>1 · Service</h2></div>
        <div class="radio-list">${p.services.map((s) => `<button class="radio-card ${s.subId === d.sub ? 'on' : ''}" data-sub="${s.subId}"><span class="radio-dot"></span><div class="grow minw0 left"><b class="ellipsis">${esc(s.name)}</b><div class="muted xs">${s.duration} min · per ${esc(s.unit)}</div></div><span class="price">${DR.cards.priceHTML(s.price, s.unit, cc)}</span></button>`).join('')}</div>
      </section>

      <section class="card"><div class="card-h"><h2>2 · Where</h2></div>
        ${both ? `<div class="mb12">${DR.ui.seg([['onsite', `${icon('home2', 16)} At my place`], ['online', `${icon('video', 16)} Online`]], d.mode, 'mode')}</div>` : ''}
        ${d.mode === 'online' ? `<p class="notice">${icon('video', 16)} A secure video link will be shared in chat 15 minutes before your session.</p>` : `
          <div class="radio-list">${addrs.map((a) => `<div class="radio-card ${a.id === d.addr ? 'on' : ''}" data-addr="${a.id}" role="button" tabindex="0"><span class="radio-dot"></span><div class="grow minw0 left"><b>${esc(a.label)}</b> <span class="muted xs">${esc(a.area)}</span><div class="small ellipsis">${esc(a.line)} ${esc(a.unit)}, ${esc(a.postal)}</div></div><button class="icon-btn sm" data-edit-addr="${a.id}" aria-label="Edit address">${icon('edit', 16)}</button></div>`).join('')}</div>
          <button class="btn btn-ghost btn-block mt8" id="addAddr">${icon('plus', 16)} Add address</button>`}
      </section>

      <section class="card"><div class="card-h"><h2>3 · Date</h2><span class="muted small">${fmtDate(d.date)}</span></div>
        <div class="date-strip">${counts.map((c) => { const dt = parseKey(c.k); return `<button class="date-pill ${c.k === d.date ? 'on' : ''} ${c.n ? '' : 'dim'}" data-date="${c.k}"><small>${c.k === days[0] ? 'Today' : DR.u.DAYS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${c.off ? 'Off' : c.n ? `${c.n} free` : 'Full'}</small></button>`; }).join('')}</div>
      </section>

      <section class="card"><div class="card-h"><h2>4 · Time</h2><span class="muted small">${svc.duration} min session</span></div>
        ${slots.length ? `<div class="slot-grid">${slots.map((s) => `<button class="slot ${s.time === d.time ? 'on' : ''}" data-time="${s.time}" ${s.ok ? '' : 'disabled'}>${s.time}${s.why === 'booked' ? '<small>Booked</small>' : ''}</button>`).join('')}</div>
          <div class="legend"><span><i class="lg-free"></i>Available</span><span><i class="lg-sel"></i>Selected</span><span><i class="lg-off"></i>Unavailable</span></div>`
        : `<p class="muted small">${esc(p.name.split(' ')[0])} is not working on this day. Pick another date.</p>`}
      </section>

      <section class="card"><div class="card-h"><h2>Notes for your provider</h2></div>
        <textarea class="input" id="notes" rows="3" maxlength="500" placeholder="${DR.GROUP[p.groupId].id === 'tuition' ? 'Student level, subjects, topics to focus on…' : 'Anything they should know — parking, pets, specific requests…'}">${esc(d.notes)}</textarea>
      </section>

      <section class="card"><div class="card-h"><h2>Payment summary</h2></div>
        <div class="kv"><span>${esc(svc.name)}</span><b>${money(svc.price, cc)}</b></div>
        <div class="kv"><span>Travel fee <small class="muted">(${d.mode === 'online' ? 'online' : DR.data.distLabel(p)})</small></span><b>${fee ? money(fee, cc) : 'Free'}</b></div>
        <div class="kv"><span>Vouchers</span><span class="muted">None available</span></div>
        <div class="kv total"><span>Total</span><b class="brand">${money(total, cc)}</b></div>
        <p class="muted xs mt8">${icon('shield', 12)} Free cancellation up to 24 hrs before. Payment is held securely and only released after you confirm the job is done.</p>
      </section>

      <div class="bottom-bar">
        <div class="bb-total"><small class="muted">Total</small><b class="brand">${money(total, cc)}</b></div>
        <button class="btn btn-primary grow" id="place" ${ready ? '' : 'disabled'}>${ready ? `Place order · ${relDay(d.date)} ${d.time}` : d.time ? 'Add an address' : 'Choose a time'}</button>
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
        el.querySelector('#place').addEventListener('click', () => {
          if (!ready) return;
          const addr = addrs.find((a) => a.id === d.addr);
          const order = {
            id: DR.u.uid('o'), no: 'DR' + String(Date.now()).slice(-10), userId: u.id, customerName: u.name, providerId: p.id, providerName: p.name,
            subId: svc.subId, serviceName: svc.name, unit: svc.unit, date: d.date, time: d.time, duration: svc.duration, mode: d.mode,
            address: d.mode === 'online' ? null : Object.assign({}, addr), notes: d.notes.trim(), price: svc.price, fee, total, country: cc,
            status: 'to_pay', createdAt: Date.now(), log: [{ s: 'created', ts: Date.now() }],
          };
          DR.store.update((s) => { s.orders.unshift(order); s.cart = s.cart.filter((c) => !(c.subId === svc.subId && (!c.providerId || c.providerId === p.id))); }, { render: false });
          delete drafts[p.id];
          DR.router.go('/pay/' + order.id, { replace: true });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Payment (demo)
  let payMethod = null;
  const PAY_WINDOW = 15 * 60 * 1000;
  DR.page('/pay/:oid', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const o = S().orders.find((x) => x.id === params.oid);
    if (!o) return DR.notFound('Order not found');
    if (o.status !== 'to_pay') { DR.router.go('/order/' + o.id, { replace: true }); return null; }
    const C = DR.COUNTRIES[o.country];
    if (!payMethod || !C.payments.some((m) => m[0] === payMethod)) payMethod = C.payments[0][0];
    const left = o.createdAt + PAY_WINDOW - Date.now();
    if (left <= 0) {
      DR.store.update((s) => { const x = s.orders.find((y) => y.id === o.id); x.status = 'cancelled'; x.cancelReason = 'Payment window expired'; }, { render: false });
      DR.router.go('/order/' + o.id, { replace: true });
      return null;
    }
    const sub = DR.SUB[o.subId];
    return {
      title: 'Payment', bar: true,
      html: `${DR.ui.navbar({ title: 'Payment' })}
        <section class="card center pay-head"><small class="muted">Amount due</small><div class="pay-amount">${money(o.total, o.country)}</div><div class="brand small">${icon('clock', 14)} Pay within <b id="cd">15:00</b> to keep your slot</div></section>
        <section class="card"><div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><b class="ellipsis">${esc(o.serviceName)}</b><div class="muted small">${esc(o.providerName)} · ${relDay(o.date)} ${o.time}</div></div></div></section>
        <section class="card"><div class="card-h"><h2>Payment method</h2></div>
          <div class="radio-list">${C.payments.map(([k, l, d]) => `<button class="radio-card ${k === payMethod ? 'on' : ''}" data-pm="${k}"><span class="pm-icon pm-${k}">${{ paynow: 'PN', duitnow: 'DN', fpx: 'FPX', tng: 'TnG', grabpay: 'G', card: icon('card', 18), applepay: icon('phone', 18) }[k]}</span><div class="grow left"><b>${l}</b><div class="muted xs">${d}</div></div><span class="radio-dot"></span></button>`).join('')}</div>
        </section>
        <p class="notice mx">${icon('info', 16)} Demo mode — no real payment is taken and no card details are collected.</p>
        <div class="bottom-bar"><button class="btn btn-primary grow" id="pay">Pay ${money(o.total, o.country)}</button></div>`,
      mount(el) {
        const cd = el.querySelector('#cd');
        const tick = () => { const ms = Math.max(0, o.createdAt + PAY_WINDOW - Date.now()); cd.textContent = `${DR.u.pad(Math.floor(ms / 60000))}:${DR.u.pad(Math.floor(ms / 1000) % 60)}`; if (!ms) DR.router.refresh(); };
        tick();
        const timer = setInterval(tick, 1000);
        DR.onLeave(() => clearInterval(timer));
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-pm]'); if (b) { payMethod = b.dataset.pm; el.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('on', x === b)); } });
        el.querySelector('#pay').onclick = () => {
          const sh = DR.ui.sheet({ cls: 'sheet-dialog', html: `<div class="dialog center"><div class="spinner"></div><h3 class="mt12">Processing payment…</h3><p class="muted small">Please don't close this page</p></div>` });
          setTimeout(() => {
            const label = C.payments.find((m) => m[0] === payMethod)[1];
            DR.store.update((s) => {
              const x = s.orders.find((y) => y.id === o.id);
              x.status = 'upcoming'; x.paidAt = Date.now(); x.payMethod = label; x.log.push({ s: 'paid', ts: Date.now() });
              const th = s.threads[o.providerId] || (s.threads[o.providerId] = { msgs: [], unread: 0 });
              th.msgs.push({ from: 'them', text: `Hi! Thanks for booking ${o.serviceName} on ${relDay(o.date)} at ${o.time}. ${o.mode === 'online' ? "I'll send the video link before we start." : "I'll message you when I'm on the way."} 😊`, ts: Date.now() });
              th.unread = (th.unread || 0) + 1; th.updated = Date.now();
            }, { render: false });
            sh.close();
            DR.ui.toast('Payment successful — booking confirmed');
            DR.router.go('/order/' + o.id, { replace: true });
          }, 1300);
        };
      },
    };
  });

  // ---------------------------------------------------------------- Order actions
  function setStatus(id, status, extra = {}) {
    DR.store.update((s) => { const o = s.orders.find((x) => x.id === id); Object.assign(o, extra, { status }); o.log.push({ s: status, ts: Date.now() }); });
  }
  DR.orderAct = async function (act, o) {
    const u = DR.store.user();
    if (act === 'pay') return DR.router.go('/pay/' + o.id);
    if (act === 'chat') return DR.router.go('/chat/' + (u && u.id === o.providerId ? 'c-' + o.userId : o.providerId));
    if (act === 'rebook') return DR.router.go(`/book/${o.providerId}?sub=${o.subId}`);
    if (act === 'review') return DR.reviewSheet(o);
    if (act === 'cancel') {
      const hrs = (parseKey(o.date).getTime() + DR.u.toMin(o.time) * 60000 - Date.now()) / 3600000;
      const late = o.status === 'upcoming' && hrs < 24;
      if (await DR.ui.confirm({ title: 'Cancel this order?', text: o.status === 'to_pay' ? 'Your time slot will be released.' : late ? `Less than 24 hrs to your appointment — a 50% fee (${money(Math.round(o.total / 2), o.country)}) applies. The rest is refunded to your original payment method.` : 'You will receive a full refund to your original payment method within 3–5 working days.', ok: 'Cancel order', cancel: 'Keep order', danger: true })) {
        setStatus(o.id, 'cancelled', { cancelReason: 'Cancelled by customer', refund: o.status === 'upcoming' ? (late ? Math.round(o.total / 2) : o.total) : 0 });
        DR.ui.toast('Order cancelled');
      }
    }
    if (act === 'simulate') { setStatus(o.id, 'to_confirm', { doneAt: Date.now() }); DR.ui.toast(`${o.providerName} marked the job as done`); }
    if (act === 'confirm') {
      if (await DR.ui.confirm({ title: 'Confirm job completed?', text: `Payment of ${money(o.total, o.country)} will be released to ${esc(o.providerName)}.`, ok: 'Confirm' })) { setStatus(o.id, 'to_review', { confirmedAt: Date.now() }); DR.reviewSheet(DR.store.s.orders.find((x) => x.id === o.id)); }
    }
    if (act === 'issue') {
      const sh = DR.ui.sheet({ title: 'Report an issue', html: `<div class="list">${['Provider did not show up', 'Service not completed', 'Quality not as expected', 'Charged extra outside the app', 'Safety concern'].map((r) => `<label class="list-item"><span>${r}</span><input type="radio" name="i"></label>`).join('')}</div><textarea class="input mt12" rows="3" placeholder="Describe what happened"></textarea><button class="btn btn-danger btn-block mt12" id="go">Submit to Done Right Guarantee</button>`, mount(s) { s.querySelector('#go').onclick = () => { sh.close(); DR.ui.toast('Case opened — our team will contact you within 2 hours'); }; } });
    }
    if (act === 'pro-done') { setStatus(o.id, 'to_confirm', { doneAt: Date.now() }); DR.ui.toast('Marked as completed — waiting for customer confirmation'); }
    if (act === 'pro-decline') {
      if (await DR.ui.confirm({ title: 'Decline this booking?', text: 'The customer will be fully refunded. Frequent declines lower your ranking.', ok: 'Decline', danger: true })) { setStatus(o.id, 'cancelled', { cancelReason: 'Declined by provider', refund: o.total }); }
    }
  };

  DR.reviewSheet = function (o) {
    const TAGS = ['Punctual', 'Professional', 'Friendly', 'Skilled', 'Great value', 'Tidy', 'Good communication', 'Would rebook'];
    const st = { stars: 5, tags: [], anon: false };
    const sh = DR.ui.sheet({
      title: 'Rate your experience', full: true,
      html: `<div class="center"><img class="av-lg round" src="${DR.ui.avatar(o.providerId, (DR.data.provider(o.providerId) || {}).gender)}" alt=""><h3 class="mt8">${esc(o.providerName)}</h3><p class="muted small">${esc(o.serviceName)} · ${relDay(o.date)}</p>
        <div class="star-pick" id="sp">${[1, 2, 3, 4, 5].map((i) => `<button data-star="${i}" class="on" aria-label="${i} stars">${icon('star', 34)}</button>`).join('')}</div><p class="brand small" id="slabel">Excellent</p></div>
        <div class="chips mt12" id="tags">${TAGS.map((t) => `<button class="chip" data-tag="${t}">${t}</button>`).join('')}</div>
        <textarea class="input mt12" id="rtext" rows="4" maxlength="600" placeholder="Share details to help other customers"></textarea>
        <label class="check mt12"><input type="checkbox" id="anon"><span>Post anonymously</span></label>
        <button class="btn btn-primary btn-block mt16" id="submit">Submit review</button>`,
      mount(s) {
        const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
        s.querySelector('#sp').addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (!b) return; st.stars = +b.dataset.star; s.querySelectorAll('[data-star]').forEach((x) => x.classList.toggle('on', +x.dataset.star <= st.stars)); s.querySelector('#slabel').textContent = labels[st.stars]; });
        s.querySelector('#tags').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (!b) return; b.classList.toggle('on'); st.tags = [...s.querySelectorAll('[data-tag].on')].map((x) => x.dataset.tag); });
        s.querySelector('#submit').onclick = () => {
          const u = DR.store.user();
          const text = s.querySelector('#rtext').value.trim() || st.tags.join(', ') || labels[st.stars];
          const anon = s.querySelector('#anon').checked;
          DR.store.update((state) => {
            state.reviews.unshift({ id: DR.u.uid('r'), providerId: o.providerId, orderId: o.id, userId: u.id, name: anon ? 'Anonymous user' : u.name, anon, stars: st.stars, text, tags: st.tags, date: Date.now(), area: o.address ? o.address.area : state.area, sub: o.serviceName, useful: 0, vip: false, repeat: state.orders.filter((x) => x.userId === u.id && x.providerId === o.providerId && x.status !== 'cancelled').length > 1 });
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
      return { upcoming: B('pro-decline', 'Decline') + B('chat', 'Message') + B('pro-done', 'Mark completed', 'btn-primary'), to_confirm: B('chat', 'Message') }[o.status] || B('chat', 'Message');
    }
    return {
      to_pay: B('cancel', 'Cancel') + B('pay', 'Pay now', 'btn-primary'),
      upcoming: B('cancel', 'Cancel') + B('chat', 'Message') ,
      to_confirm: B('issue', 'Report issue') + B('confirm', 'Confirm done', 'btn-primary'),
      to_review: B('rebook', 'Book again') + B('review', 'Write review', 'btn-primary'),
      completed: B('rebook', 'Book again', 'btn-primary'),
      cancelled: B('rebook', 'Book again'),
    }[o.status] || '';
  }
  DR.orderButtons = orderButtons;

  function orderCard(o, asProvider = false) {
    const sub = DR.SUB[o.subId];
    return `<div class="ocard" data-go="/order/${o.id}" role="link" tabindex="0">
      <div class="row between"><span class="row gap6 minw0">${icon(asProvider ? 'user' : 'store', 15)}<b class="ellipsis">${esc(asProvider ? o.customerName || 'Customer' : o.providerName)}</b>${icon('right', 13)}</span>${DR.ui.statusPill(o.status)}</div>
      <div class="row gap10 mt8">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><b class="ellipsis">${esc(o.serviceName)}</b><div class="muted small">${relDay(o.date)} · ${o.time} · ${o.mode === 'online' ? 'Online' : esc((o.address && o.address.area) || 'On-site')}</div><div class="muted xs">${o.no}</div></div><b>${money(o.total, o.country)}</b></div>
      <div class="ocard-actions">${orderButtons(o, asProvider)}</div>
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
  const TABS = [['all', 'All'], ['to_pay', 'To pay'], ['upcoming', 'Upcoming'], ['to_confirm', 'To confirm'], ['to_review', 'To review']];
  DR.page('/orders', ({ query }) => {
    const u = DR.store.user();
    const tab = query.tab || 'all';
    const q = (query.q || '').toLowerCase();
    if (!u) return { tab: 'orders', title: 'Orders', html: `<div class="topbar"><h1 class="h1">${DR.t('Orders')}</h1></div>${DR.ui.empty('clipboard', 'Sign in to see your bookings', '<a class="btn btn-primary" href="#/auth?next=%2Forders">Sign in / Register</a>')}` };
    const mine = S().orders.filter((o) => o.userId === u.id);
    let list = tab === 'all' ? mine : mine.filter((o) => o.status === tab);
    if (q) list = list.filter((o) => `${o.serviceName} ${o.providerName} ${o.no}`.toLowerCase().includes(q));
    return {
      tab: 'orders', title: 'Orders',
      html: `<div class="topbar"><form class="searchbar grow" id="oq">${icon('search', 18)}<input name="q" type="search" placeholder="Search my orders" value="${esc(query.q || '')}"></form><a class="icon-btn" href="#/cart" aria-label="Cart">${icon('cart')}</a></div>
        <nav class="tabs tabs-scroll">${TABS.map(([k, l]) => { const n = k === 'all' ? 0 : mine.filter((o) => o.status === k).length; return `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/orders?tab=${k}">${DR.t(l)}${n ? `<i class="count">${n}</i>` : ''}</a>`; }).join('')}</nav>
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
    const stage = { to_pay: 0, upcoming: 1, to_confirm: 2, to_review: 3, completed: 4, cancelled: -1 }[o.status];
    const [title, desc] = STATUS_TEXT[o.status];
    const sub = DR.SUB[o.subId];
    return {
      title: 'Order details', bar: true,
      html: `${DR.ui.navbar({ title: 'Order details', right: `<a class="icon-btn" href="#/chat/support" aria-label="Support">${icon('headset')}</a>` })}
        <section class="status-hero ${o.status}"><h2>${title}</h2><p>${o.status === 'cancelled' ? esc(o.cancelReason || '') + (o.refund ? ` · Refund ${money(o.refund, o.country)}` : '') : desc}</p>
          ${stage >= 0 ? `<div class="stepper">${steps.map((s, i) => `<div class="step ${i <= stage ? 'done' : ''}"><i>${i <= stage ? icon('check', 12) : ''}</i><small>${s}</small></div>`).join('')}</div>` : ''}</section>
        ${asProvider ? `<section class="card"><div class="card-h"><h2>Customer</h2></div><div class="row gap10"><img class="av-md round" src="${DR.ui.avatar(o.userId, 'M', 1)}" alt=""><div class="grow"><b>${esc(o.customerName || 'Customer')}</b><div class="muted xs">Verified phone number</div></div><button class="btn btn-ghost btn-sm" data-act="chat" data-oid="${o.id}">${icon('chat', 16)} Message</button></div></section>`
        : p ? `<section class="card"><div class="row gap10"><a href="#/provider/${p.id}">${DR.cards.pimg(p, 0, 'av-md round')}</a><a class="grow minw0" href="#/provider/${p.id}"><b>${esc(p.name)}</b><div class="muted xs ellipsis">${esc(p.role)}${p.shop ? ` · ${esc(p.shop)}` : ''}</div></a><button class="icon-btn" data-act="chat" data-oid="${o.id}" aria-label="Message">${icon('chat')}</button><button class="icon-btn" id="call" aria-label="Call">${icon('call')}</button></div></section>` : ''}
        <section class="card"><div class="card-h"><h2>Appointment</h2></div>
          <div class="row gap10">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div><b>${esc(o.serviceName)}</b><div class="muted small">${o.duration} min · per ${esc(o.unit)}</div></div></div>
          <div class="kv mt12"><span>${icon('calendar', 15)} Date & time</span><b>${fmtDate(o.date)}, ${o.time}</b></div>
          <div class="kv"><span>${icon(o.mode === 'online' ? 'video' : 'pin', 15)} ${o.mode === 'online' ? 'Online session' : 'Address'}</span><b class="right">${o.mode === 'online' ? 'Video link via chat' : `${esc(o.address.line)} ${esc(o.address.unit)}<br><small class="muted">${esc(o.address.area)} ${esc(o.address.postal)}</small>`}</b></div>
          ${o.notes ? `<div class="kv"><span>${icon('doc', 15)} Notes</span><b class="right">${esc(o.notes)}</b></div>` : ''}
        </section>
        <section class="card"><div class="card-h"><h2>Payment</h2></div>
          <div class="kv"><span>Service</span><b>${money(o.price, o.country)}</b></div>
          <div class="kv"><span>Travel fee</span><b>${o.fee ? money(o.fee, o.country) : 'Free'}</b></div>
          <div class="kv total"><span>${o.paidAt ? 'Total paid' : 'Total'}</span><b class="brand">${money(o.total, o.country)}</b></div>
          ${o.payMethod ? `<div class="kv"><span>Method</span><span>${esc(o.payMethod)}</span></div>` : ''}
        </section>
        <section class="card small"><div class="kv"><span class="muted">Order no.</span><button class="link" id="copy">${o.no} ${icon('doc', 13)}</button></div><div class="kv"><span class="muted">Created</span><span>${fmtTs(o.createdAt)}</span></div>${o.paidAt ? `<div class="kv"><span class="muted">Paid</span><span>${fmtTs(o.paidAt)}</span></div>` : ''}</section>
        ${o.status === 'upcoming' && !asProvider ? `<div class="demo-box mx"><b>${icon('sparkle', 14)} Demo</b><p class="small muted">Skip ahead and simulate ${esc(o.providerName)} finishing the job.</p><button class="btn btn-ghost btn-sm mt8" data-act="simulate" data-oid="${o.id}">Simulate job completed</button></div>` : ''}
        <div class="bottom-bar end">${orderButtons(o, asProvider) || '<span class="muted small">No actions available</span>'}</div>`,
      mount(el) {
        DR.bindOrderActions(el);
        el.querySelector('#copy').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(o.no); DR.ui.toast('Order number copied'); };
        const call = el.querySelector('#call');
        if (call) call.onclick = () => DR.ui.toast('Calls are connected via a masked number to protect your privacy (demo)');
      },
    };
  });

  // ---------------------------------------------------------------- Cart & following
  let followSort = 'recent';
  DR.page('/cart', ({ query }) => {
    const tab = query.tab || 'cart';
    const f = query.f || 'providers';
    const s = S();
    let body = '';
    if (tab === 'cart') {
      body = s.cart.length ? `<div class="card">${s.cart.map((c) => {
        const sub = DR.SUB[c.subId]; if (!sub) return '';
        const p = c.providerId && DR.data.provider(c.providerId);
        return `<div class="cart-row">${DR.ui.thumb(sub, { cls: 'thumb-sm' })}<a class="grow minw0" href="#/service/${sub.id}"><b class="ellipsis">${esc(sub.name)}</b><div class="muted xs">${p ? esc(p.name) : 'Best match provider'}</div><div class="price">${DR.cards.priceHTML(DR.data.catalogPrice(sub), sub.unit)}</div></a><div class="col gap6"><a class="btn btn-primary btn-xs" href="#${p ? `/book/${p.id}?sub=${sub.id}` : `/service/${sub.id}`}">Book</a><button class="link muted xs" data-rm="${c.id}">Remove</button></div></div>`;
      }).join('')}</div>` : DR.ui.empty('cart', 'Your cart is empty<br><small class="muted">Save services here to book later</small>', '<a class="btn btn-outline" href="#/">Browse services</a>');
    } else {
      const sub = `<nav class="tabs">${[['providers', 'Providers'], ['services', 'Services'], ['shops', 'Shops']].map(([k, l]) => `<a class="tab-link ${f === k ? 'on' : ''}" href="#/cart?tab=following&f=${k}">${l}</a>`).join('')}</nav>`;
      if (f === 'providers') {
        let list = s.follows.providers.map((id) => DR.data.provider(id)).filter(Boolean);
        if (followSort === 'followers') list.sort((a, b) => b.followers - a.followers);
        if (followSort === 'avail') list.sort((a, b) => { const na = DR.avail.next(a), nb = DR.avail.next(b); return (na ? na.day * 1440 + DR.u.toMin(na.time) : 1e9) - (nb ? nb.day * 1440 + DR.u.toMin(nb.time) : 1e9); });
        if (followSort === 'distance') list.sort((a, b) => DR.data.dist(a) - DR.data.dist(b));
        body = `${sub}<div class="filterbar">${[['recent', 'Followed'], ['followers', 'Followers'], ['avail', 'Available'], ['distance', 'Distance']].map(([k, l]) => `<button class="fb-chip ${followSort === k ? 'on' : ''}" data-fs="${k}">${l} ${icon('down', 11)}</button>`).join('')}</div>
          <div class="plist">${list.map((p) => DR.cards.provider(p)).join('') || DR.ui.empty('heart', 'No followed providers yet', '<a class="btn btn-outline" href="#/nearby">Find providers</a>')}</div>`;
      } else if (f === 'services') {
        body = `${sub}${s.follows.services.length ? `<div class="svc-rows">${s.follows.services.map((id) => DR.SUB[id] && DR.cards.svcRow(DR.SUB[id])).join('')}</div>` : DR.ui.empty('heart', 'Great services are waiting to be discovered')}`;
      } else {
        body = `${sub}${s.follows.shops.length ? `<div class="card">${s.follows.shops.map((name) => { const n = DR.data.providers().filter((p) => p.shop === name).length; return `<a class="list-item" href="#/search?q=${encodeURIComponent(name)}"><span class="row gap10">${icon('store', 20)}<span><b>${esc(name)}</b><br><small class="muted">${n} provider${n === 1 ? '' : 's'}</small></span></span>${icon('right', 16)}</a>`; }).join('')}</div>` : DR.ui.empty('heart', 'Follow shops from a provider\'s profile')}`;
      }
    }
    return {
      title: tab === 'cart' ? 'Cart' : 'Following',
      html: `<header class="navbar"><button class="icon-btn nav-back" data-back aria-label="Back">${icon('back', 24)}</button><div class="nav-title">${DR.ui.seg([['cart', DR.t('Cart')], ['following', DR.t('Following')]], tab, 'ctab')}</div><div class="nav-right">${tab === 'cart' && s.cart.length ? `<button class="icon-btn" id="clear" aria-label="Clear cart">${icon('broom')}</button>` : tab === 'following' ? `<button class="icon-btn" id="bell" aria-label="Nearby alerts">${icon('bell')}</button>` : ''}</div></header>
        ${tab === 'following' && !s.tips.nearby ? `<div class="notice mx mt8">${icon('bell', 16)} <span class="grow"><b>Nearby alerts:</b> get notified when providers you follow are close to you.</span><button class="icon-btn sm" id="tipx" aria-label="Dismiss">${icon('x', 14)}</button></div>` : ''}
        ${body}`,
      mount(el) {
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-ctab]'); if (t) return DR.router.go('/cart?tab=' + t.dataset.ctab, { replace: true });
          const rm = e.target.closest('[data-rm]'); if (rm) return DR.store.update((st) => { st.cart = st.cart.filter((c) => c.id !== rm.dataset.rm); });
          const fs = e.target.closest('[data-fs]'); if (fs) { followSort = fs.dataset.fs; return DR.router.refresh(); }
          if (e.target.closest('#clear') && await DR.ui.confirm({ title: 'Clear cart?', ok: 'Clear', danger: true })) DR.store.update((st) => { st.cart = []; });
          if (e.target.closest('#tipx')) DR.store.update((st) => { st.tips.nearby = true; });
          if (e.target.closest('#bell')) { DR.store.update((st) => { st.notif.nearby = !st.notif.nearby; st.tips.nearby = true; }, { render: false }); DR.ui.toast(S().notif.nearby ? 'Nearby alerts on' : 'Nearby alerts off'); }
        });
      },
    };
  });

  // ---------------------------------------------------------------- Messages
  const SUPPORT = { id: 'support', name: 'Done Right Support' };
  function threadName(id) {
    if (id === 'support') return SUPPORT.name;
    if (id.startsWith('c-')) { const cu = S().users[id.slice(2)]; return cu ? cu.name : 'Customer'; }
    const p = DR.data.provider(id); return p ? p.name : 'Provider';
  }
  function threadAvatar(id, cls) {
    if (id === 'support') return `<span class="${cls} support-av">${icon('headset', 22)}</span>`;
    if (id.startsWith('c-')) return `<img class="${cls}" src="${DR.ui.avatar(id, 'M', 1)}" alt="">`;
    const p = DR.data.provider(id); return p ? DR.cards.pimg(p, 0, cls) : '';
  }
  DR.page('/messages', () => {
    if (!DR.requireAuth()) return null;
    const threads = Object.entries(S().threads).filter(([id]) => id !== 'support').sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
    const sup = S().threads.support;
    const row = (id, th) => { const last = th && th.msgs[th.msgs.length - 1]; return `<a class="thread" href="#/chat/${id}">${threadAvatar(id, 'av-md round')}<div class="grow minw0"><div class="row between"><b class="ellipsis">${esc(threadName(id))}</b><small class="muted">${last ? DR.u.timeAgo(last.ts) : ''}</small></div><div class="muted small ellipsis">${last ? esc(last.text) : 'Hi! How can we help you today?'}</div></div>${th && th.unread ? `<i class="dot-badge static">${th.unread}</i>` : ''}</a>`; };
    return {
      title: 'Messages',
      html: `${DR.ui.navbar({ title: DR.t('Messages'), cls: 'navbar-brand', right: `<a class="icon-btn col" href="#/chat/support" aria-label="Support">${icon('headset', 22)}</a>` })}
        <div class="card flush">${row('support', sup)}${threads.map(([id, th]) => row(id, th)).join('')}</div>
        ${threads.length ? '' : DR.ui.empty('chat', 'No messages yet')}`,
    };
  });

  const REPLIES = {
    provider: ["Hi! Thanks for reaching out 😊 Yes, I'm available — you can pick a slot on my profile.", "Sure, that's included in the service.", "Noted! I'll bring everything that's needed.", 'Let me check my schedule and get back to you shortly.', 'Thank you! Looking forward to it.'],
    support: ['Thanks for contacting Done Right Support. An agent will join this chat within 5 minutes.', 'For urgent booking issues, you can also call our 24/7 hotline listed in the Help Centre.'],
  };
  DR.page('/chat/:tid', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const id = params.tid;
    const name = threadName(id);
    const th = S().threads[id] || { msgs: [] };
    if (th.unread) DR.store.update((s) => { s.threads[id].unread = 0; }, { render: false });
    const quick = id === 'support' ? ['I need help with a booking', 'Refund status', 'Report a safety issue'] : ['Are you available this weekend?', "What's included?", 'Do you bring your own tools?', 'Can you do online sessions?'];
    const bubble = (m) => `<div class="bubble ${m.from === 'me' ? 'me' : 'them'}"><p>${esc(m.text)}</p><small>${DR.u.pad(new Date(m.ts).getHours())}:${DR.u.pad(new Date(m.ts).getMinutes())}</small></div>`;
    return {
      title: name, bar: true, cls: 'chat-page',
      html: `${DR.ui.navbar({ title: esc(name), right: id !== 'support' && !id.startsWith('c-') ? `<a class="icon-btn" href="#/provider/${id}" aria-label="View profile">${icon('user')}</a>` : '' })}
        <p class="safety">${icon('shield', 14)} For your safety, keep payments and chats on Done Right. We will never ask for your OTP or bank password.</p>
        <div class="chat-body" id="cb">${th.msgs.map(bubble).join('') || `<div class="center muted small pad-v">${threadAvatar(id, 'av-lg round')}<p class="mt8">Start a conversation with ${esc(name)}</p></div>`}</div>
        <div class="bottom-bar chat-bar">
          <div class="quick">${quick.map((q) => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          <form class="row gap8 grow" id="cf"><input class="input grow" id="ci" placeholder="Type a message" autocomplete="off" maxlength="1000"><button class="btn btn-primary" aria-label="Send">${icon('send', 18)}</button></form>
        </div>`,
      mount(el) {
        const cb = el.querySelector('#cb');
        const scroll = () => window.scrollTo(0, document.body.scrollHeight);
        scroll();
        let alive = true;
        DR.onLeave(() => { alive = false; });
        const push = (from, text) => {
          const m = { from, text, ts: Date.now() };
          DR.store.update((s) => { const t = s.threads[id] || (s.threads[id] = { msgs: [], unread: 0 }); t.msgs.push(m); t.updated = m.ts; if (from === 'them' && !alive) t.unread = (t.unread || 0) + 1; }, { render: false });
          if (!alive) return;
          if (!cb.querySelector('.bubble')) cb.innerHTML = '';
          cb.insertAdjacentHTML('beforeend', bubble(m));
          scroll();
        };
        const send = (text) => {
          if (!text.trim()) return;
          push('me', text.trim());
          if (!id.startsWith('c-')) {
            const pool = id === 'support' ? REPLIES.support : REPLIES.provider;
            setTimeout(() => push('them', pool[Math.floor(Math.random() * pool.length)]), 1200);
          }
        };
        el.querySelector('#cf').addEventListener('submit', (e) => { e.preventDefault(); const i = el.querySelector('#ci'); send(i.value); i.value = ''; });
        el.addEventListener('click', (e) => { const q = e.target.closest('[data-quick]'); if (q) send(q.dataset.quick); });
      },
    };
  });
})(window.DR);
