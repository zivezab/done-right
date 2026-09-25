/* Test fixtures */
(function () {
  'use strict';
  const H = {
    reset() {
      DR.store.reset();
      try { sessionStorage.removeItem(DR.store.KEY + ':tab-session'); } catch (e) { /* ignore */ }
    },
    allDay() { const w = {}; for (let d = 0; d < 7; d++) w[d] = [['08:00', '20:00']]; return { slotMinutes: 60, weekly: w, overrides: {}, blocks: {} }; },
    user(id, extra = {}) {
      const u = Object.assign({ id, name: 'User ' + id, country: 'SG', roles: { consumer: true }, addresses: [{ id: 'a-' + id, label: 'Home', line: '1 Test Road', unit: '', postal: '123456', area: 'Orchard' }], verification: {} }, extra);
      DR.store.s.users[id] = u; DR.store.save();
      return u;
    },
    provider(id, { subs = ['swimming-instructor'], policy = {}, country = 'SG', availability } = {}) {
      const u = H.user(id, { country });
      DR.ensureProvider(u);
      u.provider.area = DR.AREAS[country][0].n;
      u.provider.subs = subs;
      u.provider.services = subs.map((s) => ({ subId: s, name: DR.SUB[s].name, price: 80, unit: DR.SUB[s].unit, duration: 60, active: true }));
      u.provider.availability = availability || H.allDay();
      u.provider.policy = Object.assign(DR.defaultPolicy(), { leadMinutes: 60 }, policy);
      u.provider.status = 'live';
      DR.store.save();
      return u;
    },
    p: (id) => DR.data.provider(id),
    day: (n) => DR.u.dateKey(DR.u.addDays(new Date(), n)),
    ym: (monthsFromNow) => { const d = new Date(); d.setMonth(d.getMonth() + monthsFromNow); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
    book(customer, provId, date, time) {
      const p = H.p(provId);
      return DR.booking.create({ user: customer, provider: p, service: p.services[0], date, time, mode: 'onsite', address: customer.addresses[0] });
    },
    licence(u, licenceId, status = 'verified') {
      u.verification.certifications = (u.verification.certifications || []).concat([{ id: DR.u.uid('v'), licenceId, name: DR.LICENCES[licenceId].name, issuer: DR.LICENCES[licenceId].issuer, credentialId: 'X-12345', status, submittedAt: Date.now() }]);
      DR.store.save();
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // resolves as soon as fn() is truthy; fails the test with `label` if it never becomes true
    async waitFor(fn, label = 'condition', timeout = 4000) {
      const until = Date.now() + timeout;
      for (;;) {
        const v = fn();
        if (v) return v;
        if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
        await H.sleep(20);
      }
    },
  };
  // demo auto-replies answer immediately in tests
  if (DR.CONFIG && DR.CONFIG.demo) DR.CONFIG.demo.autoReplyMs = 10;
  window.H = H;
})();
