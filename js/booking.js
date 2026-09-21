/* Done Right — booking & quote domain logic (no DOM). All functions mutate DR.store.s and save;
 * callers refresh the UI. Exposed for tests. */
(function (DR) {
  'use strict';
  const { slotTs, hoursLabel, uid } = DR.u;
  const S = () => DR.store.s;
  const PAY_WINDOW_MS = 15 * 60 * 1000;
  const find = (id) => S().orders.find((o) => o.id === id);
  const save = () => DR.store.save();
  const log = (o, s, extra) => { o.log = o.log || []; o.log.push(Object.assign({ s, ts: Date.now() }, extra || {})); };

  // ------------------------------------------------------------ bookings
  DR.booking = {
    PAY_WINDOW_MS,
    create({ user, provider, service, date, time, mode = 'onsite', address = null, notes = '', price, fee, quoteId = null, offerId = null }) {
      const slot = DR.avail.slots(provider, date, service.duration).find((x) => x.time === time);
      if (!slot || !slot.ok) throw new Error('That time slot is no longer available');
      const p = price == null ? service.price : price;
      const f = fee == null ? DR.data.fee(provider, mode) : fee;
      const order = {
        id: uid('o'), no: 'DR' + String(Date.now()).slice(-10), userId: user.id, customerName: user.name, providerId: provider.id, providerName: provider.name,
        subId: service.subId, serviceName: service.name, unit: service.unit, date, time, duration: service.duration, mode,
        address: mode === 'online' ? null : address, notes: (notes || '').trim(), price: p, fee: f, total: p + f, country: provider.country,
        status: 'to_pay', createdAt: Date.now(), reschedules: 0, quoteId, offerId, log: [{ s: 'created', ts: Date.now() }],
      };
      S().orders.unshift(order);
      save();
      return order;
    },
    // payment captured into escrow → instant bookings confirm, request-to-book waits for provider approval
    pay(id, method) {
      const o = find(id);
      if (!o || o.status !== 'to_pay') throw new Error('Order is not awaiting payment');
      const p = DR.data.provider(o.providerId);
      const pol = DR.policy(p);
      o.paidAt = Date.now(); o.payMethod = method; log(o, 'paid');
      if (o.quoteId || pol.mode === 'instant') {
        o.status = 'upcoming'; log(o, 'confirmed');
        DR.chat.notify(o.providerId, o.userId, `✅ Booking confirmed: ${o.serviceName} on ${o.date} at ${o.time}.`);
      } else {
        o.status = 'requested';
        const deadline = Date.now() + pol.approvalHours * 3600000;
        o.requestExpiresAt = Math.min(deadline, slotTs(o.date, o.time) - 30 * 60000);
        DR.chat.notify(o.userId, o.providerId, `📅 New booking request: ${o.serviceName} on ${o.date} at ${o.time}. Please accept or decline.`);
      }
      save();
      return o;
    },
    accept(id) {
      const o = find(id);
      if (!o || o.status !== 'requested') throw new Error('Nothing to accept');
      o.status = 'upcoming'; o.acceptedAt = Date.now(); log(o, 'accepted');
      DR.chat.notify(o.providerId, o.userId, `✅ ${o.providerName} accepted your booking for ${o.date} at ${o.time}.`);
      save(); return o;
    },
    decline(id, reason = 'Declined by provider') {
      const o = find(id);
      if (!o || !['requested', 'upcoming'].includes(o.status)) throw new Error('Cannot decline this booking');
      o.status = 'cancelled'; o.cancelReason = reason; o.refund = o.paidAt ? o.total : 0; log(o, 'cancelled', { by: 'provider' });
      DR.chat.notify(o.providerId, o.userId, `❌ Booking for ${o.date} ${o.time} was declined. You have been fully refunded.`);
      save(); return o;
    },
    cancelTerms(o, now = Date.now()) {
      if (['to_pay', 'requested'].includes(o.status)) return { free: true, fee: 0, refund: o.paidAt ? o.total : 0 };
      const pol = DR.policy(DR.data.provider(o.providerId));
      const hrs = (slotTs(o.date, o.time) - now) / 3600000;
      if (hrs >= pol.freeCancelHours) return { free: true, fee: 0, refund: o.total, hours: pol.freeCancelHours };
      const fee = Math.round(o.total / 2);
      return { free: false, fee, refund: o.total - fee, hours: pol.freeCancelHours };
    },
    cancel(id, by = 'customer', now = Date.now()) {
      const o = find(id);
      const t = this.cancelTerms(o, now);
      o.status = 'cancelled'; o.cancelReason = by === 'customer' ? 'Cancelled by customer' : 'Cancelled by provider'; o.refund = o.paidAt ? (by === 'customer' ? t.refund : o.total) : 0; log(o, 'cancelled', { by });
      DR.chat.notify(by === 'customer' ? o.userId : o.providerId, by === 'customer' ? o.providerId : o.userId, `Booking for ${o.date} ${o.time} was cancelled.`);
      save(); return o;
    },
    // ---- reschedule (customer) with provider-defined locking period
    canReschedule(o, now = Date.now()) {
      if (!o || !['upcoming', 'requested'].includes(o.status)) return { ok: false, reason: 'Only upcoming bookings can be rescheduled' };
      const pol = DR.policy(DR.data.provider(o.providerId));
      const used = o.reschedules || 0;
      const hrsLeft = (slotTs(o.date, o.time) - now) / 3600000;
      const base = { lockHours: pol.rescheduleLockHours, max: pol.maxReschedules, used, hrsLeft };
      if (o.rescheduleRequest) return Object.assign(base, { ok: false, reason: 'A reschedule request is already waiting for the provider' });
      if (used >= pol.maxReschedules) return Object.assign(base, { ok: false, reason: `Reschedule limit reached (${pol.maxReschedules} per booking)` });
      if (hrsLeft < pol.rescheduleLockHours) return Object.assign(base, { ok: false, locked: true, reason: `Locked — changes close ${hoursLabel(pol.rescheduleLockHours)} before the appointment` });
      return Object.assign(base, { ok: true });
    },
    reschedule(id, date, time, now = Date.now()) {
      const o = find(id);
      const chk = this.canReschedule(o, now);
      if (!chk.ok) throw new Error(chk.reason);
      const p = DR.data.provider(o.providerId);
      const slot = DR.avail.slots(p, date, o.duration, { excludeOrder: o.id, now }).find((x) => x.time === time);
      if (!slot || !slot.ok) throw new Error('That time slot is not available');
      if (DR.policy(p).mode === 'request' && o.status === 'upcoming') {
        o.rescheduleRequest = { date, time, ts: Date.now() };
        log(o, 'reschedule_requested', { to: `${date} ${time}` });
        DR.chat.notify(o.userId, o.providerId, `🔁 Reschedule request: move ${o.date} ${o.time} → ${date} ${time}.`);
        save(); return { pending: true, order: o };
      }
      this.applyMove(o, date, time, 'customer');
      save(); return { pending: false, order: o };
    },
    applyMove(o, date, time, by) {
      log(o, 'rescheduled', { from: `${o.date} ${o.time}`, to: `${date} ${time}`, by });
      o.prev = { date: o.date, time: o.time };
      o.date = date; o.time = time;
      if (by === 'customer') o.reschedules = (o.reschedules || 0) + 1;
      delete o.rescheduleRequest; delete o.proposal;
      DR.chat.notify(by === 'customer' ? o.userId : o.providerId, by === 'customer' ? o.providerId : o.userId, `🔁 Booking moved to ${date} at ${time}.`);
    },
    respondReschedule(id, accept) {
      const o = find(id);
      if (!o || !o.rescheduleRequest) throw new Error('No reschedule request');
      if (accept) {
        const p = DR.data.provider(o.providerId);
        const slot = DR.avail.slots(p, o.rescheduleRequest.date, o.duration, { excludeOrder: o.id, ignoreLead: true }).find((x) => x.time === o.rescheduleRequest.time);
        if (!slot || (!slot.ok && slot.why !== 'past')) throw new Error('Requested slot is no longer free');
        this.applyMove(o, o.rescheduleRequest.date, o.rescheduleRequest.time, 'customer');
      } else {
        log(o, 'reschedule_declined');
        DR.chat.notify(o.providerId, o.userId, 'The provider could not accommodate your reschedule request. Your original time stays.');
        delete o.rescheduleRequest;
      }
      save(); return o;
    },
    // ---- provider-initiated time change (customer must agree)
    propose(id, date, time, note = '') {
      const o = find(id);
      if (!o || !['upcoming', 'requested'].includes(o.status)) throw new Error('Only upcoming bookings can be moved');
      const p = DR.data.provider(o.providerId);
      const slot = DR.avail.slots(p, date, o.duration, { excludeOrder: o.id, ignoreLead: true }).find((x) => x.time === time);
      if (!slot || (!slot.ok && slot.why !== 'blocked')) throw new Error('That slot is not free in your schedule');
      o.proposal = { date, time, note, ts: Date.now() };
      log(o, 'proposal', { to: `${date} ${time}` });
      DR.chat.notify(o.providerId, o.userId, `🔁 ${o.providerName} proposed a new time: ${date} at ${time}.${note ? ` "${note}"` : ''}`);
      save(); return o;
    },
    respondProposal(id, accept) {
      const o = find(id);
      if (!o || !o.proposal) throw new Error('No proposal');
      if (accept) this.applyMove(o, o.proposal.date, o.proposal.time, 'provider');
      else { log(o, 'proposal_declined'); DR.chat.notify(o.userId, o.providerId, 'The customer kept the original time.'); delete o.proposal; }
      save(); return o;
    },
    markDone(id) { const o = find(id); o.status = 'to_confirm'; o.doneAt = Date.now(); log(o, 'to_confirm'); save(); return o; },
    confirmDone(id) { const o = find(id); o.status = 'to_review'; o.confirmedAt = Date.now(); log(o, 'to_review'); save(); return o; },
    // expire unpaid orders and unanswered requests
    expire(now = Date.now()) {
      let n = 0;
      S().orders.forEach((o) => {
        if (o.status === 'to_pay' && now - o.createdAt > PAY_WINDOW_MS) { o.status = 'cancelled'; o.cancelReason = 'Payment window expired'; log(o, 'cancelled', { by: 'system' }); n++; }
        if (o.status === 'requested' && o.requestExpiresAt && now > o.requestExpiresAt) { o.status = 'cancelled'; o.cancelReason = 'Provider did not respond in time — fully refunded'; o.refund = o.total; log(o, 'cancelled', { by: 'system' }); n++; }
      });
      if (n) save();
      return n;
    },
  };

  // ------------------------------------------------------------ quotes (request → offers → accept)
  const QUOTE_GROUPS = ['renovation', 'moving', 'events'];
  const QUOTE_UNITS = /^(project|move|package|28 days|month|placement|application|year|event|area|room|wall|tree|performance|job|setup|filing|site visit|consult|appraisal|show)$/;
  DR.isQuoteBased = (sub) => !!sub && (QUOTE_GROUPS.includes(sub.groupId) || QUOTE_UNITS.test(sub.unit) || sub.price === 0);
  const OFFER_MSGS = [
    'Hi! Based on your description I can do this for the price quoted — materials and travel included.',
    'Thanks for the details. The quote covers everything described; happy to adjust if the scope changes.',
    'I have done many similar jobs nearby. Price is all-in, no hidden fees. Let me know if you have questions!',
  ];

  DR.quotes = {
    TTL_DAYS: 7,
    find: (id) => S().quotes.find((q) => q.id === id),
    match(subId, cc, providerId) {
      if (providerId) return [providerId];
      const list = DR.data.bySub(subId, cc);
      const near = list.filter((p) => DR.data.dist(p) <= 30);
      return (near.length ? near : list).slice(0, 5).map((p) => p.id);
    },
    create({ user, subId, title, details, photos = [], mode = 'onsite', address = null, date = null, timeOfDay = 'any', budgetMin = null, budgetMax = null, providerId = null }) {
      if (!DR.SUB[subId]) throw new Error('Choose a service');
      if (!details || details.trim().length < 20) throw new Error('Describe the job in at least 20 characters');
      const cc = user.country || S().country;
      const q = {
        id: uid('q'), no: 'Q' + String(Date.now()).slice(-8), userId: user.id, customerName: user.name, subId, country: cc,
        title: (title || DR.SUB[subId].name).trim(), details: details.trim(), photos, mode, address, date, timeOfDay, budgetMin, budgetMax,
        invited: this.match(subId, cc, providerId), direct: !!providerId, declinedBy: [], offers: [], status: 'open',
        createdAt: Date.now(), expiresAt: Date.now() + this.TTL_DAYS * 86400000,
      };
      S().quotes.unshift(q);
      q.invited.forEach((pid) => { if (S().users[pid]) DR.chat.notify(user.id, pid, `📝 New quote request: ${q.title}`); });
      save();
      return q;
    },
    offer(quoteId, providerId, { price, date, time, duration, message = '', validDays = 3 }) {
      const q = this.find(quoteId);
      if (!q || q.status !== 'open') throw new Error('This request is no longer open');
      if (!q.invited.includes(providerId)) throw new Error('You were not invited to quote');
      if (!(price > 0)) throw new Error('Enter a price');
      const p = DR.data.provider(providerId);
      const slot = DR.avail.slots(p, date, duration || 60, { ignoreLead: false }).find((x) => x.time === time);
      if (!slot || !slot.ok) throw new Error('Pick a free time in your schedule');
      q.offers = q.offers.filter((o) => o.providerId !== providerId || o.status !== 'pending');
      const offer = { id: uid('of'), providerId, providerName: p.name, price: Math.round(price), date, time, duration: duration || 60, message: message.trim(), validUntil: Date.now() + validDays * 86400000, status: 'pending', createdAt: Date.now() };
      q.offers.push(offer);
      DR.chat.notify(providerId, q.userId, `💬 Quote: ${DR.ui.money(offer.price, q.country)} for “${q.title}” on ${date} ${time}.`);
      save();
      return offer;
    },
    declineRequest(quoteId, providerId) { const q = this.find(quoteId); if (!q.declinedBy.includes(providerId)) q.declinedBy.push(providerId); save(); return q; },
    rejectOffer(quoteId, offerId) { const q = this.find(quoteId); const o = q.offers.find((x) => x.id === offerId); o.status = 'declined'; save(); return q; },
    close(quoteId) { const q = this.find(quoteId); q.status = 'closed'; q.offers.forEach((o) => { if (o.status === 'pending') o.status = 'expired'; }); save(); return q; },
    accept(quoteId, offerId, user) {
      const q = this.find(quoteId);
      if (!q || q.status !== 'open') throw new Error('This request is no longer open');
      const offer = q.offers.find((o) => o.id === offerId);
      if (!offer || offer.status !== 'pending') throw new Error('Offer is no longer available');
      if (offer.validUntil < Date.now()) { offer.status = 'expired'; save(); throw new Error('This offer has expired'); }
      const p = DR.data.provider(offer.providerId);
      const sub = DR.SUB[q.subId];
      const service = { subId: q.subId, name: q.title || sub.name, unit: 'job', duration: offer.duration };
      const order = DR.booking.create({ user, provider: p, service, date: offer.date, time: offer.time, mode: q.mode, address: q.address, notes: q.details, price: offer.price, fee: 0, quoteId: q.id, offerId: offer.id });
      offer.status = 'accepted';
      q.offers.forEach((o) => { if (o.id !== offerId && o.status === 'pending') o.status = 'declined'; });
      q.status = 'accepted'; q.orderId = order.id;
      save();
      return order;
    },
    forProvider(pid) { return S().quotes.filter((q) => q.invited.includes(pid)); },
    // demo: seed providers answer quote requests
    simulate(now = Date.now()) {
      let n = 0;
      const gap = (DR.CONFIG.demo && DR.CONFIG.demo.quoteOfferMs) || 6000;
      S().quotes.filter((q) => q.status === 'open').forEach((q) => {
        if (q.expiresAt < now) { q.status = 'expired'; n++; return; }
        q.invited.forEach((pid, i) => {
          if (S().users[pid] || q.declinedBy.includes(pid) || q.offers.some((o) => o.providerId === pid)) return;
          if (now - q.createdAt < gap * (i + 1)) return;
          const p = DR.data.provider(pid);
          if (!p) return;
          const r = DR.u.rng(q.id + pid);
          if (r() < 0.15) { q.declinedBy.push(pid); n++; return; }
          const sub = DR.SUB[q.subId];
          const svc = p.services.find((s) => s.subId === q.subId) || { price: DR.data.catalogPrice(sub, q.country), duration: sub.duration };
          let price = (svc.price || DR.data.catalogPrice(sub, q.country) || 100) * (0.9 + r() * 0.6);
          if (q.budgetMax) price = Math.min(price, q.budgetMax * (0.85 + r() * 0.3));
          if (q.budgetMin) price = Math.max(price, q.budgetMin);
          const slot = firstSlot(p, q, svc.duration || 60);
          if (!slot) { q.declinedBy.push(pid); n++; return; }
          q.offers.push({ id: uid('of'), providerId: pid, providerName: p.name, price: DR.nicePrice(price) || Math.round(price), date: slot.key, time: slot.time, duration: svc.duration || 60, message: DR.u.pick(r, OFFER_MSGS), validUntil: now + 3 * 86400000, status: 'pending', createdAt: now });
          DR.chat.notify(pid, q.userId, `💬 New quote for “${q.title}”.`);
          n++;
        });
      });
      if (n) save();
      return n;
    },
  };
  const TOD = { morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440], any: [0, 1440] };
  function firstSlot(p, q, duration) {
    const start = q.date && q.date >= DR.u.dateKey(new Date()) ? DR.u.parseKey(q.date) : new Date();
    const [a, b] = TOD[q.timeOfDay] || TOD.any;
    for (let i = 0; i < 21; i++) {
      const key = DR.u.dateKey(DR.u.addDays(start, i));
      const s = DR.avail.slots(p, key, duration).find((x) => x.ok && DR.u.toMin(x.time) >= a && DR.u.toMin(x.time) < b);
      if (s) return { key, time: s.time };
    }
    return null;
  }
})(window.DR);
