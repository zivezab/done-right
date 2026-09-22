/* Supabase adapter (js/backend.js) against a mock client. The database rules themselves are
 * tested in Postgres: python3 tools/db_test.py */
(function () {
  const ME = '0000000c-0000-4000-8000-000000000000';
  const PRO = '0000000a-0000-4000-8000-000000000000';
  const day = () => H.day(2);

  // Chainable stand-in for the supabase-js query builder: records every call, resolves via handler.
  function mockClient(handler) {
    const calls = [];
    const builder = (table) => {
      const ops = [];
      const b = new Proxy({}, {
        get(_, k) {
          if (k === 'then') return (res, rej) => Promise.resolve().then(() => handler(table, ops)).then((data) => ({ data, error: null }), (e) => ({ data: null, error: { message: e.message, code: e.code } })).then(res, rej);
          return (...args) => { ops.push([k, ...args]); return b; };
        },
      });
      calls.push({ table, ops });
      return b;
    };
    return {
      calls,
      rpcs: [],
      from: builder,
      rpc(fn, args) { this.rpcs.push({ fn, args }); return builder('rpc:' + fn).eq('args', args); },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: ME } } } }),
        onAuthStateChange() {},
        signOut: async () => ({ error: null }),
      },
      channel() { const c = { on: () => c, subscribe: () => c }; return c; },
      removeChannel() {},
    };
  }

  const liveRow = () => ({
    user_id: PRO, status: 'live', paused: false, country: 'SG', area: 'Orchard', lat: 1.3048, lng: 103.8318, headline: 'Swim coach', bio: '',
    years: 5, languages: ['English'], skills: [], serves: 'all', travel_fee: 0, policy: { mode: 'instant' }, created_at: '2026-01-01T00:00:00Z',
    availability: { slotMinutes: 60, weekly: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [['08:00', '20:00']]])), overrides: {}, blocks: {} },
  });
  const orderRow = (extra = {}) => Object.assign({
    id: 'o-1', no: 'DR0000000001', customer_id: ME, provider_id: PRO, service_id: 'swimming-instructor', service_name: 'Swimming lessons', unit: 'lesson',
    country: 'SG', local_date: day(), local_time: '10:00:00', duration_min: 60, mode: 'online', address: null, notes: '', price: '80.00', fee: '0.00', total: '80.00',
    policy: { mode: 'instant', freeCancelHours: 24 }, status: 'to_pay', created_at: new Date().toISOString(), reschedules: 0,
  }, extra);

  function handler(state) {
    return (table, ops) => {
      const eq = (k) => (ops.find((o) => o[0] === 'eq' && o[1] === k) || [])[2];
      if (table === 'providers') { if (state.providerError && ops.some((o) => o[0] === 'upsert')) throw new Error(state.providerError); return eq('user_id') === ME ? null : [liveRow()]; }
      if (table === 'bookable_services') return [{ provider_id: PRO, service_id: 'swimming-instructor', name: 'Swimming lessons', price: '80', unit: 'lesson', duration_min: 60, active: true }];
      if (table === 'provider_credentials') return [{ id: 'v-1', user_id: PRO, kind: 'identity', status: 'verified', data: {} }];
      if (table === 'profiles') return ops.some((o) => o[0] === 'update') ? null : { id: ME, name: 'Chris', gender: '', dob: null, country: 'SG', roles: { consumer: true }, addresses: [], consents: {}, created_at: '2026-01-01T00:00:00Z' };
      if (table === 'provider_services') return [];
      if (table === 'verification_items') {
        if (state.dupInsert && ops.some((o) => o[0] === 'insert')) { const e = new Error('duplicate key value violates unique constraint "verification_items_pkey"'); e.code = '23505'; throw e; }
        return ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o[0])) ? null : [];
      }
      if (table === 'orders') return state.orders || [];
      if (table === 'staff') return null;
      if (table === 'public_profiles') return [{ id: PRO, name: 'Pat Tan', age: 36 }, { id: ME, name: 'Chris' }];
      if (table === 'rpc:create_booking') return orderRow();
      if (table === 'rpc:pay_order') { if (state.payError) throw new Error(state.payError); return orderRow({ status: 'upcoming', paid_at: new Date().toISOString() }); }
      if (table === 'rpc:provider_busy') return [{ local_date: day(), local_time: '14:00:00', duration_min: 60 }];
      if (table === 'rpc:expire_orders') return 0;
      throw new Error('unexpected ' + table);
    };
  }

  let original;
  async function start(state = {}) {
    H.reset();
    original = original || Object.assign({}, DR.booking);
    const client = mockClient(handler(state));
    await DR.backend.init({ client });
    return client;
  }
  function stop() {
    DR.backend._test.reset();
    Object.assign(DR.booking, original);
    H.reset();
  }
  const guard = (fn) => async () => { try { await fn(); } finally { stop(); } };

  describe('backend adapter (Supabase)', () => {
    it('stays off until a project URL and anon key are configured', () => {
      expect(DR.backend.configured()).toBe(false);
      expect(DR.backend.enabled).toBe(false);
    });
    it('maps database orders to the app shape', () => {
      const o = DR.backend._test.mapOrder(orderRow({ reschedule_request: { date: '2026-10-01', time: '09:00', ts: '2026-09-21T00:00:00Z' } }));
      expect(o.time).toBe('10:00');
      expect(o.total).toBe(80);
      expect(o.userId).toBe(ME);
      expect(o.policy.freeCancelHours).toBe(24);
      expect(o.rescheduleRequest.time).toBe('09:00');
    });
    it('lists only real providers once connected (no seed data)', guard(async () => {
      await start();
      const list = DR.data.providers('SG');
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(PRO);
      expect(list[0].name).toBe('Pat Tan');
      expect(list[0].age).toBe(36);
      expect(DR.store.sessionId()).toBe(ME);
    }));
    it('books through the database function and never sends a price', guard(async () => {
      const c = await start();
      const p = DR.data.provider(PRO);
      const o = await DR.booking.create({ provider: p, service: p.services[0], date: day(), time: '10:00', mode: 'online', notes: 'hi' });
      const call = c.rpcs.find((r) => r.fn === 'create_booking');
      expect(call.args.p_provider).toBe(PRO);
      expect(call.args.p_service).toBe('swimming-instructor');
      expect('price' in call.args || 'p_price' in call.args).toBe(false);
      expect(o.status).toBe('to_pay');
      expect(DR.store.s.orders[0].id).toBe('o-1');
    }));
    it('surfaces database rule errors to the UI', guard(async () => {
      await start({ payError: 'Payment window expired' });
      let msg = '';
      try { await DR.booking.pay('o-1', 'PayNow'); } catch (e) { msg = e.message; }
      expect(msg).toBe('Payment window expired');
    }));
    it('marks other customers\' bookings as taken', guard(async () => {
      await start();
      const p = DR.data.provider(PRO);
      DR.avail.slots(p, day(), 60);          // triggers the busy fetch
      await H.sleep(20);
      const slot = DR.avail.slots(p, day(), 60).find((s) => s.time === '14:00');
      expect(slot.ok).toBe(false);
      expect(slot.why).toBe('booked');
    }));
    it('pushes profile edits to the server', guard(async () => {
      const c = await start();
      DR.store.s.users[ME].name = 'Chris Lee';
      await DR.backend.push();
      const upd = c.calls.find((x) => x.table === 'profiles' && x.ops.some((o) => o[0] === 'update'));
      expect(upd.ops.find((o) => o[0] === 'update')[1].name).toBe('Chris Lee');
    }));
    it('sends documents without files or review status', guard(async () => {
      const c = await start();
      DR.store.s.users[ME].verification.certifications = [{ name: 'SwimSafer', issuer: 'SportSG', status: 'verified', file: { id: 'f_1' } }];
      await DR.backend.push();
      const up = c.calls.find((x) => x.table === 'verification_items' && x.ops.some((o) => o[0] === 'insert'));
      expect(c.calls.some((x) => x.table === 'verification_items' && x.ops.some((o) => o[0] === 'upsert'))).toBe(false);
      const row = up.ops.find((o) => o[0] === 'insert')[1];
      expect(row.kind).toBe('certifications');
      expect(row.data.name).toBe('SwimSafer');
      expect('file' in row.data || 'status' in row.data).toBe(false);
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(DR.store.s.users[ME].verification.certifications[0].status).toBe('pending');
    }));
  });

  describe('backend adapter: document edits', () => {
    it('updates only the data of a document the server already has', guard(async () => {
      const c = await start();
      DR.store.s.users[ME].verification.education = [{ school: 'NUS', degree: 'Diploma' }];
      await DR.backend.push();
      DR.store.s.users[ME].verification.education[0].school = 'NTU';
      await DR.backend.push();
      const upd = c.calls.filter((x) => x.table === 'verification_items' && x.ops.some((o) => o[0] === 'update'));
      expect(upd.length).toBe(1);
      expect(Object.keys(upd[0].ops.find((o) => o[0] === 'update')[1])).toEqual(['data']);
      expect(upd[0].ops.find((o) => o[0] === 'update')[1].data.school).toBe('NTU');
    }));
  });

  describe('backend adapter: failed saves', () => {
    it('a rejected listing does not block or discard a document submission', guard(async () => {
      const c = await start({ providerError: 'Invalid booking rules' });
      const u = DR.store.s.users[ME];
      DR.ensureProvider(u);
      u.verification.identity = { docType: 'NRIC', fullName: 'Chris', idHash: 'h' };
      const errors = await DR.backend.push();
      expect(errors.length).toBe(1);
      expect(errors[0]).toMatch(/Provider listing: Invalid booking rules/);
      expect(c.calls.some((x) => x.table === 'verification_items' && x.ops.some((o) => o[0] === 'insert'))).toBe(true);
      expect(DR.store.s.users[ME].verification.identity.status).toBe('pending');
      expect(!!DR.store.s.users[ME].provider).toBe(true);   // local edit kept for the retry
    }));
  });

  describe('backend adapter: several tabs', () => {
    it('a document another tab already saved is updated, not re-added', guard(async () => {
      const c = await start({ dupInsert: true });
      DR.store.s.users[ME].verification.identity = { docType: 'NRIC', fullName: 'Chris', idHash: 'h' };
      const errors = await DR.backend.push();
      expect(errors.length).toBe(0);
      expect(c.calls.some((x) => x.table === 'verification_items' && x.ops.some((o) => o[0] === 'update'))).toBe(true);
    }));
  });

  describe('booking rules snapshot', () => {
    beforeEach(H.reset);
    it('keeps the rules a booking was made under', () => {
      const pro = H.provider('p1', { policy: { freeCancelHours: 24 } });
      const cust = H.user('c1');
      const p = DR.data.provider('p1');
      const o = DR.booking.create({ user: cust, provider: p, service: p.services[0], date: H.day(1), time: '10:00', mode: 'online' });
      DR.booking.pay(o.id, 'PayNow');
      pro.provider.policy.freeCancelHours = 0;
      DR.store.save();
      expect(DR.booking.cancelTerms(DR.store.s.orders[0], DR.u.slotTs(H.day(1), '06:00')).free).toBe(false);
    });
  });

  describe('database catalog', () => {
    it('matches the app data (regenerate with tools/gen_catalog_sql.js)', async () => {
      const sql = await fetch('../supabase/migrations/20260922000200_catalog.sql?t=' + Date.now()).then((r) => r.text());
      expect(sql.trimEnd() === DR.catalogSQL().trimEnd()).toBe(true);
    });
  });
})();
