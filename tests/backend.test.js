/* Supabase adapter (js/backend.js) against a mock client. The database rules themselves are
 * tested in Postgres: python3 tools/db_test.py */
(function () {
  const ME = '0000000c-0000-4000-8000-000000000000';
  const PRO = '0000000a-0000-4000-8000-000000000000';
  const day = () => H.day(2);

  // Chainable stand-in for the supabase-js query builder: records every call, resolves via handler.
  function mockClient(handler, state = {}) {
    const calls = [];
    let this_ = null;
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
    return this_ = {
      calls,
      rpcs: [],
      from: builder,
      rpc(fn, args) { this.rpcs.push({ fn, args }); return builder('rpc:' + fn).eq('args', args); },
      auth: {
        getSession: async () => ({ data: { session: state.signedOut ? null : { user: { id: ME } } } }),
        onAuthStateChange() {},
        signOut: async () => ({ error: null }),
      },
      channel() { const c = { on: () => c, subscribe: () => c }; return c; },
      removeChannel() {},
      uploads: [],
      removed: [],
      storage: {
        from: (bucket) => ({
          upload: async (path, blob, opts) => {
            this_.uploads.push({ bucket, path, type: blob.type, opts });
            return state.uploadExists ? { data: null, error: { statusCode: '409', message: 'The resource already exists' } } : { data: { path }, error: null };
          },
          remove: async (paths) => { this_.removed.push(...paths); return { data: [], error: null }; },
          createSignedUrls: async (paths, secs) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}?ttl=${secs}` })), error: null }),
          getPublicUrl: (path) => ({ data: { publicUrl: `https://public.example/${bucket}/${path}` } }),
        }),
      },
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
      if (['follows', 'hidden_providers', 'cart_items'].includes(table)) {
        if (ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o[0]))) { if (state.listError) throw new Error(state.listError); return null; }
        return ((state.lists || {})[table] || []).slice();
      }
      if (table === 'rpc:follower_counts') return state.counts || [];
      if (table === 'rpc:log_document_view') return null;
      if (table === 'public_reviews') return state.reviews || [];
      if (table === 'chat_threads') return eq('id') ? (state.threads || []).find((t) => t.id === eq('id')) || null : state.threads || [];
      if (table === 'messages') return state.messages || [];
      if (table === 'chat_reads') return state.reads || [];
      if (table === 'rpc:chat_unread') return state.unread || [];
      if (table === 'rpc:mark_read') { state.marked = (state.marked || 0) + 1; return null; }
      if (table === 'rpc:send_message') {
        if (state.sendError) throw new Error(state.sendError);
        const a = eq('args');
        return { id: 501, thread_id: 't-1', sender: ME, system: false, text: a.p_text, created_at: new Date().toISOString() };
      }
      if (table === 'rpc:submit_review') { state.reviews = [reviewRow({ mine: true })]; return {}; }
      if (table === 'rpc:reply_to_review') return { id: 'rv-1', provider_id: PRO, reply: (ops.find((o) => o[0] === 'eq')[2] || {}).p_text || null, reply_at: new Date().toISOString() };
      throw new Error('unexpected ' + table);
    };
  }

  const reviewRow = (extra = {}) => Object.assign({
    id: 'rv-1', provider_id: PRO, service_id: 'swimming-instructor', service_name: 'Swimming lessons', stars: 5, text: 'Great coach',
    tags: ['Patient'], area: 'Orchard', photos: [{ path: `${ME}/o-1/f_1.jpg` }], reply: 'Thank you!', reply_at: '2026-09-20T00:00:00Z',
    created_at: '2026-09-19T00:00:00Z', reviewer_name: 'Chris', anonymous: false, mine: false, repeat_customer: false,
  }, extra);

  let original;
  async function start(state = {}) {
    H.reset();
    original = original || Object.assign({}, DR.booking);
    const client = mockClient(handler(state), state);
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

  describe('backend adapter: document files (Storage)', () => {
    const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    const inserted = (c) => c.calls.filter((x) => x.table === 'verification_items').flatMap((x) => x.ops.filter((o) => o[0] === 'insert').map((o) => o[1]));
    it('uploads scans to the private bucket and lists them on the document', guard(async () => {
      const c = await start();
      const id = await DR.files.put(JPEG, { secure: true });
      DR.store.s.users[ME].verification.identity = { docType: 'NRIC', fullName: 'Chris', files: { front: { id, name: 'front.jpg', image: true, secure: true }, back: null } };
      expect((await DR.backend.push()).length).toBe(0);
      const rid = DR.store.s.users[ME].verification.identity.rid;
      expect(c.uploads.length).toBe(1);
      expect(c.uploads[0].bucket).toBe('verification');
      expect(c.uploads[0].path).toBe(`${ME}/${rid}/${id}.jpg`);
      expect(c.uploads[0].opts.upsert).toBe(false);
      const row = inserted(c)[0];
      expect(row.data.docs[0].slot).toBe('front');
      expect(row.data.docs[0].path).toBe(c.uploads[0].path);
      expect('files' in row.data).toBe(false);
    }));
    it('never uploads the same file twice', guard(async () => {
      const c = await start();
      const id = await DR.files.put(JPEG, { secure: true });
      DR.store.s.users[ME].verification.identity = { docType: 'NRIC', files: { front: { id, name: 'f.jpg', image: true } } };
      await DR.backend.push();
      DR.store.s.users[ME].verification.identity.fullName = 'Chris Lee';
      await DR.backend.push();
      expect(c.uploads.length).toBe(1);
    }));
    it('treats a file that is already in the bucket as uploaded', guard(async () => {
      const c = await start({ uploadExists: true });
      const id = await DR.files.put(JPEG, { secure: true });
      DR.store.s.users[ME].verification.identity = { docType: 'NRIC', files: { front: { id, name: 'f.jpg', image: true } } };
      expect((await DR.backend.push()).length).toBe(0);
      expect(inserted(c)[0].data.docs.length).toBe(1);
    }));
    it('replacing a photo removes the old file; deleting a document removes its files', guard(async () => {
      const c = await start();
      const a = await DR.files.put(JPEG, { secure: true });
      const b = await DR.files.put(JPEG, { secure: true });
      const v = DR.store.s.users[ME].verification;
      v.education = [{ school: 'NUS', file: { id: a, name: 'a.jpg', image: true } }];
      await DR.backend.push();
      const first = c.uploads[0].path;
      v.education[0].file = { id: b, name: 'b.jpg', image: true };
      await DR.backend.push();
      expect(c.removed).toContain(first);
      const second = c.uploads[1].path;
      v.education = [];
      await DR.backend.push();
      expect(c.removed).toContain(second);
    }));
    it('gives reviewers short-lived links', guard(async () => {
      await start();
      const urls = await DR.backend.signedUrls(['u/d/f.jpg']);
      expect(urls['u/d/f.jpg']).toMatch(/ttl=300$/);
    }));
  });

  describe('backend adapter: reviews', () => {
    it('shows server reviews, ratings and replies on provider profiles', guard(async () => {
      await start({ reviews: [reviewRow(), reviewRow({ id: 'rv-2', stars: 3, reply: null })] });
      const p = DR.data.provider(PRO);
      expect(p.reviews).toBe(2);
      expect(p.skill).toBe(4);
      const list = DR.data.reviews(p);
      const first = list.find((r) => r.id === 'rv-1');
      expect(first.reply.text).toBe('Thank you!');
      expect(first.photos[0].url).toBe(`https://public.example/review-photos/${ME}/o-1/f_1.jpg`);
      expect(list.find((r) => r.id === 'rv-2').reply).toBe(undefined);
    }));
    it('submits a review with photos through the database function', guard(async () => {
      const c = await start({ orders: [orderRow({ status: 'to_review' })] });
      const id = await DR.files.put('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==');
      const o = DR.store.s.orders.find((x) => x.id === 'o-1');
      await DR.backend.submitReview(o, { stars: 5, text: 'Great coach', tags: ['Patient'], anon: true, photos: [{ id, image: true }] });
      expect(c.uploads[0].bucket).toBe('review-photos');
      expect(c.uploads[0].path).toBe(`${ME}/o-1/${id}.jpg`);
      const call = c.rpcs.find((r) => r.fn === 'submit_review');
      expect(call.args.p_order).toBe('o-1');
      expect(call.args.p_anonymous).toBe(true);
      expect(call.args.p_photos).toEqual([`${ME}/o-1/${id}.jpg`]);
      expect(DR.store.s.orders.find((x) => x.id === 'o-1').status).toBe('completed');
      expect(DR.store.s.reviews[0].userId).toBe(ME);
    }));
    it('posts and removes provider replies on the server', guard(async () => {
      const c = await start({ reviews: [reviewRow({ reply: null })] });
      await DR.backend.replyToReview('rv-1', 'Thanks for booking!');
      expect(c.rpcs.find((r) => r.fn === 'reply_to_review').args.p_text).toBe('Thanks for booking!');
      expect(DR.store.s.replies['rv-1'].text).toBe('Thanks for booking!');
      await DR.backend.replyToReview('rv-1', '');
      expect(DR.store.s.replies['rv-1']).toBe(undefined);
    }));
  });

  describe('backend adapter: chat', () => {
    const thread = { id: 't-1', member_a: PRO, member_b: ME, last_message_at: '2026-09-21T02:00:00Z', created_at: '2026-09-21T01:00:00Z' };
    const msgs = [
      { id: 11, thread_id: 't-1', sender: ME, system: false, text: 'Hi, free on Saturday?', created_at: '2026-09-21T01:00:00Z' },
      { id: 12, thread_id: 't-1', sender: PRO, system: false, text: 'Yes, 10 am works!', created_at: '2026-09-21T02:00:00Z' },
    ];
    const chatState = (extra) => Object.assign({ threads: [thread], messages: msgs.slice(), unread: [{ thread_id: 't-1', unread: 1 }] }, extra);
    it('loads conversations, messages and unread counts from the server', guard(async () => {
      await start(chatState());
      const th = DR.chat.get(ME, PRO);
      expect(th.msgs.map((m) => m.text)).toEqual(['Hi, free on Saturday?', 'Yes, 10 am works!']);
      expect(DR.chat.unreadTotal(ME)).toBe(1);
      expect(DR.chat.name(PRO)).toBe('Pat Tan');
      expect(DR.chat.isReal(PRO)).toBe(true);
    }));
    it('sends through the database and shows the message at once', guard(async () => {
      const c = await start(chatState());
      const m = DR.chat.send(ME, PRO, 'See you then');
      expect(m.pending).toBe(true);
      expect(DR.chat.get(ME, PRO).msgs.slice(-1)[0].text).toBe('See you then');
      await H.sleep(20);
      expect(c.rpcs.find((r) => r.fn === 'send_message').args).toEqual({ p_to: PRO, p_text: 'See you then' });
      expect(m.id).toBe(501);
      expect(m.pending).toBe(undefined);
      await H.sleep(1400);
      expect(DR.chat.get(ME, PRO).msgs.length).toBe(3);   // no demo auto-reply for real people
    }));
    it('removes a message the server refused and says why', guard(async () => {
      await start(chatState({ sendError: 'You are sending messages too quickly — please wait a moment' }));
      DR.chat.send(ME, PRO, 'spam');
      await H.sleep(20);
      expect(DR.chat.get(ME, PRO).msgs.length).toBe(2);
      expect(document.getElementById('toast').textContent).toMatch(/too quickly/);
    }));
    it('adds incoming messages live and ignores its own echo', guard(async () => {
      await start(chatState({ unread: [] }));
      await DR.backend._test.onMessage({ new: { id: 13, thread_id: 't-1', sender: PRO, system: false, text: 'Bring goggles', created_at: new Date().toISOString() } });
      expect(DR.chat.get(ME, PRO).msgs.slice(-1)[0].text).toBe('Bring goggles');
      expect(DR.chat.unreadTotal(ME)).toBe(1);
      const m = DR.chat.send(ME, PRO, 'Will do');
      await DR.backend._test.onMessage({ new: { id: 777, thread_id: 't-1', sender: ME, system: false, text: 'Will do', created_at: new Date().toISOString() } });
      await H.sleep(20);
      expect(DR.chat.get(ME, PRO).msgs.filter((x) => x.text === 'Will do').length).toBe(1);
      expect(m.pending).toBe(undefined);
    }));
    it('records read receipts on the server', guard(async () => {
      const state = chatState();
      await start(state);
      DR.chat.markRead(ME, PRO);
      expect(DR.chat.unreadTotal(ME)).toBe(0);
      await H.sleep(900);
      expect(state.marked).toBe(1);
    }));
    it('shows ✓ sent and ✓✓ read on my messages, updated live', guard(async () => {
      await start(chatState({ reads: [{ thread_id: 't-1', user_id: PRO, last_read_at: '2026-09-21T01:30:00Z' }] }));
      const th = DR.chat.get(ME, PRO);
      expect(DR.chat.receipt(th.msgs[0], th, ME)).toBe('read');        // mine, sent 01:00, they read at 01:30
      expect(DR.chat.receipt(th.msgs[1], th, ME)).toBe(null);          // theirs: no receipt
      const m = DR.chat.send(ME, PRO, 'Great, see you');
      expect(DR.chat.receipt(m, th, ME)).toBe('sending');
      await H.sleep(20);
      expect(DR.chat.receipt(m, th, ME)).toBe('sent');
      DR.backend._test.onRead({ new: { thread_id: 't-1', user_id: PRO, last_read_at: new Date(Date.now() + 1000).toISOString() } });
      expect(DR.chat.receipt(m, th, ME)).toBe('read');
    }));
    it('leaves booking updates between accounts to the database', guard(async () => {
      await start(chatState());
      expect(DR.chat.notify(PRO, ME, '✅ Booking confirmed')).toBe(null);
      expect(DR.chat.get(ME, PRO).msgs.length).toBe(2);
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

  describe('backend adapter: follows, hidden providers and cart', () => {
    const writes = (c, table, op) => c.calls.filter((x) => x.table === table && x.ops.some((o) => o[0] === op));
    const lists = () => ({
      follows: [{ kind: 'provider', target: PRO, created_at: '2026-09-20T00:00:00Z' }, { kind: 'service', target: 'piano', created_at: '2026-09-21T00:00:00Z' }],
      hidden_providers: [{ provider_id: 'p-hidden', created_at: '2026-09-20T00:00:00Z' }],
      cart_items: [{ service_id: 'painter', provider_key: '', added_at: '2026-09-20T00:00:00Z' }],
    });
    it('loads your lists from the server into your account', guard(async () => {
      await start({ lists: lists() });
      const l = DR.store.lists();
      expect(l.follows.providers).toEqual([PRO]);
      expect(l.follows.services).toEqual(['piano']);
      expect(l.blocked).toEqual(['p-hidden']);
      expect(l.cart.length).toBe(1);
      expect(l.cart[0].subId).toBe('painter');
      expect(l.cart[0].providerId).toBe(null);
      expect(DR.store.s.userData[ME]).toBe(l);
    }));
    it('shows the server follower count, with your own follow applied live', guard(async () => {
      await start({ lists: lists(), counts: [{ provider_id: PRO, followers: 5 }] });
      expect(DR.data.provider(PRO).followers).toBe(5);   // 4 others + you
      DR.store.update(() => { const f = DR.store.lists().follows; f.providers = f.providers.filter((x) => x !== PRO); }, { render: false });
      expect(DR.data.provider(PRO).followers).toBe(4);
    }));
    it('adds rows with insert-or-ignore and removes them by key, never updating', guard(async () => {
      const c = await start({ lists: lists() });
      DR.store.update(() => {
        const l = DR.store.lists();
        l.follows.shops.unshift('Tan Swim School');
        l.follows.providers = [];
        l.blocked = [];
        l.cart.unshift({ id: DR.u.uuid(), subId: 'piano', providerId: PRO, addedAt: Date.now() });
      }, { render: false });
      const errors = await DR.backend.push();
      expect(errors).toEqual([]);
      const add = writes(c, 'follows', 'upsert');
      expect(add.length).toBe(1);
      const [rows, opts] = add[0].ops.find((o) => o[0] === 'upsert').slice(1);
      expect(rows).toEqual([{ user_id: ME, kind: 'shop', target: 'Tan Swim School' }]);
      expect(opts).toEqual({ onConflict: 'user_id,kind,target', ignoreDuplicates: true });
      const del = writes(c, 'follows', 'delete')[0].ops;
      expect(del.filter((o) => o[0] === 'eq').map((o) => o.slice(1))).toEqual([['user_id', ME], ['kind', 'provider']]);
      expect(del.find((o) => o[0] === 'in').slice(1)).toEqual(['target', [PRO]]);
      expect(writes(c, 'hidden_providers', 'delete')[0].ops.find((o) => o[0] === 'in').slice(1)).toEqual(['provider_id', ['p-hidden']]);
      const cart = writes(c, 'cart_items', 'upsert')[0].ops.find((o) => o[0] === 'upsert');
      expect(cart[1].map((r) => [r.service_id, r.provider_key])).toEqual([['piano', PRO]]);
      expect(cart[2].ignoreDuplicates).toBe(true);
      expect(['follows', 'hidden_providers', 'cart_items'].some((t) => writes(c, t, 'update').length || writes(c, t, 'insert').length)).toBe(false);
      const n = c.calls.length;
      await DR.backend.push();
      expect(c.calls.length).toBe(n);   // nothing changed → nothing sent
    }));
    it('removes a cart line by service and provider', guard(async () => {
      const c = await start({ lists: lists() });
      DR.store.update(() => { DR.store.lists().cart = []; }, { render: false });
      await DR.backend.push();
      const del = writes(c, 'cart_items', 'delete')[0].ops;
      expect(del.filter((o) => o[0] === 'eq').map((o) => o.slice(1))).toEqual([['user_id', ME], ['provider_key', '']]);
      expect(del.find((o) => o[0] === 'in').slice(1)).toEqual(['service_id', ['painter']]);
    }));
    it('a failed list save keeps the edit and retries it', guard(async () => {
      const state = { lists: lists(), listError: 'offline' };
      const c = await start(state);
      DR.store.update(() => { DR.store.lists().follows.services.unshift('painter'); }, { render: false });
      const errors = await DR.backend.push();
      expect(errors).toEqual(['Following: offline']);
      expect(DR.store.lists().follows.services).toContain('painter');
      delete state.listError;
      await DR.backend.push();
      expect(writes(c, 'follows', 'upsert').length).toBe(2);
    }));
    it('keeps edits not yet saved when the server data is reloaded', guard(async () => {
      await start({ lists: lists() });
      DR.store.update(() => { const f = DR.store.lists().follows; f.services = ['painter']; }, { render: false });   // + painter, − piano
      await DR.backend.hydrate();
      expect(DR.store.lists().follows.services).toEqual(['painter']);
      expect(DR.store.lists().follows.providers).toEqual([PRO]);
    }));
    it('brings a guest cart into the account on sign-in and saves it', guard(async () => {
      H.reset();
      DR.store.update((s) => { s.guestCart = [{ id: 'g1', subId: 'plumber', providerId: null, addedAt: Date.now() }, { id: 'g2', subId: 'painter', providerId: null, addedAt: Date.now() }]; }, { render: false });
      const state = { lists: lists() };
      const client = mockClient(handler(state), state);
      await DR.backend.init({ client });
      expect(DR.store.s.guestCart).toEqual([]);
      expect(DR.store.lists().cart.map((c) => c.subId).sort()).toEqual(['painter', 'plumber']);
      await DR.backend.push();
      const up = client.calls.find((x) => x.table === 'cart_items' && x.ops.some((o) => o[0] === 'upsert'));
      expect(up.ops.find((o) => o[0] === 'upsert')[1].map((r) => r.service_id)).toEqual(['plumber']);
    }));
    it('lists moved from device storage are added to the server', guard(async () => {
      H.reset();
      DR.store.s.userData[ME] = { follows: { providers: [], services: ['tutor'], shops: [] }, blocked: [], cart: [], fromDevice: true };
      const state = { lists: lists() };
      const client = mockClient(handler(state), state);
      await DR.backend.init({ client });
      expect(DR.store.lists().follows.services.sort()).toEqual(['piano', 'tutor']);
      expect('fromDevice' in DR.store.lists()).toBe(false);
      await DR.backend.push();
      const up = client.calls.find((x) => x.table === 'follows' && x.ops.some((o) => o[0] === 'upsert'));
      expect(up.ops.find((o) => o[0] === 'upsert')[1]).toEqual([{ user_id: ME, kind: 'service', target: 'tutor' }]);
    }));
    it('signing out removes your lists from this device', guard(async () => {
      const state = { lists: lists() };
      await start(state);
      expect(!!DR.store.s.userData[ME]).toBe(true);
      state.signedOut = true;
      await DR.backend.hydrate();
      expect(DR.store.sessionId()).toBe(null);
      expect(DR.store.s.userData[ME]).toBe(undefined);
      expect(DR.store.lists().follows.providers).toEqual([]);
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
