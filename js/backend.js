/* Done Right: Supabase backend adapter.
 * Off by default: the app runs in local demo mode until DR.CONFIG.supabase has a URL and anon key.
 * When on, the local store becomes a cache of server data:
 *  - hydrate() loads live providers, your profile, listing, documents and orders into DR.store.s
 *  - your own profile / listing / documents / follows / hidden providers / cart are pushed automatically after
 *    local saves (diffed, debounced)
 *  - every booking change goes through the database functions in supabase/migrations (server-enforced rules)
 *  - realtime keeps orders and review decisions in sync across devices
 * Documents (files), chat, quotes and reviews still live on this device only; see README "Backend". */
(function (DR) {
  'use strict';
  const S = () => DR.store.s;
  const cfg = () => (DR.CONFIG && DR.CONFIG.supabase) || {};
  const SINGLE = ['identity', 'business', 'background'];
  const LIST = ['education', 'certifications', 'experience'];
  // local-only fields never sent to the server (files stay encrypted on the device until Storage is wired)
  const LOCAL_ONLY = ['rid', 'status', 'reason', 'verifiedAt', 'reviewedAt', 'submittedAt', 'files', 'file'];
  let sb = null;
  let me = null;
  let pushed = {};          // last pushed JSON per section
  let pushedUser = null;    // whose data `pushed` describes
  let pushTimer = null;
  let hydrating = false;
  let channel = null;
  const names = {};         // user id → display name (public_profiles)
  const busy = {};          // provider id → { at, list: [{date, time, duration}] }
  let followerBase = {};    // provider id → followers other than you (public.follower_counts)

  const B = DR.backend = {
    enabled: false,
    staff: false,
    followers: (id) => followerBase[id] || 0,
    get client() { return sb; },
    get userId() { return me; },
    // ?backend=off forces local demo mode (tests, demos) even when a project is configured
    configured: () => !!(cfg().url && cfg().anonKey) && !/[?&]backend=off\b/.test(location.search),
  };

  // ------------------------------------------------------------------ helpers
  async function q(promise) {
    const { data, error } = await promise;
    if (error) { const e = new Error(error.message); e.code = error.code; throw e; }
    return data;
  }
  const rpc = (fn, args) => q(sb.rpc(fn, args));
  const hhmm = (t) => (t ? String(t).slice(0, 5) : t);
  const ms = (ts) => (ts ? new Date(ts).getTime() : null);
  const strip = (rec) => { const o = {}; Object.keys(rec || {}).forEach((k) => { if (!LOCAL_ONLY.includes(k)) o[k] = rec[k]; }); return o; };
  const uuid = () => DR.u.uuid();

  // ------------------------------------------------------------------ server row → app shape
  function mapOrder(r) {
    const prevLocal = S().orders.find((o) => o.id === r.id);
    return {
      id: r.id, no: r.no, userId: r.customer_id, providerId: r.provider_id,
      customerName: names[r.customer_id] || (prevLocal && prevLocal.customerName) || 'Customer',
      providerName: names[r.provider_id] || (prevLocal && prevLocal.providerName) || 'Provider',
      subId: r.service_id, serviceName: r.service_name, unit: r.unit, date: r.local_date, time: hhmm(r.local_time),
      duration: r.duration_min, mode: r.mode, address: r.address, notes: r.notes || '',
      price: +r.price, fee: +r.fee, total: +r.total, country: r.country, status: r.status, policy: r.policy,
      createdAt: ms(r.created_at), paidAt: ms(r.paid_at), payMethod: r.pay_method, requestExpiresAt: ms(r.request_expires_at),
      acceptedAt: ms(r.accepted_at), doneAt: ms(r.done_at), confirmedAt: ms(r.confirmed_at),
      cancelReason: r.cancel_reason, refund: r.refund == null ? undefined : +r.refund, reschedules: r.reschedules || 0,
      rescheduleRequest: r.reschedule_request ? { date: r.reschedule_request.date, time: r.reschedule_request.time, ts: ms(r.reschedule_request.ts) } : undefined,
      proposal: r.proposal ? { date: r.proposal.date, time: r.proposal.time, note: r.proposal.note || '', ts: ms(r.proposal.ts) } : undefined,
      prev: r.prev || undefined, quoteId: r.quote_id, log: (prevLocal && prevLocal.log) || [], remote: true,
    };
  }

  function mapVerification(items, keepLocal) {
    const v = {};
    LIST.forEach((k) => { v[k] = []; });
    items.forEach((it) => {
      const local = keepLocal && keepLocal(it.id);
      const rec = Object.assign({}, it.data, {
        rid: it.id, status: it.status, reason: it.reason || undefined, submittedAt: ms(it.submitted_at),
        verifiedAt: it.status === 'verified' ? ms(it.reviewed_at) : undefined, licenceId: it.licence_id || (it.data || {}).licenceId,
      });
      if (local) { if (local.files) rec.files = local.files; if (local.file) rec.file = local.file; }
      if (SINGLE.includes(it.kind)) v[it.kind] = rec; else (v[it.kind] = v[it.kind] || []).push(rec);
    });
    return v;
  }

  function mapProvider(row, services, extra) {
    return {
      status: row.status, paused: row.paused, area: row.area, headline: row.headline, bio: row.bio, years: row.years,
      languages: row.languages, skills: row.skills, serves: row.serves, travelFee: +row.travel_fee,
      availability: row.availability, policy: row.policy, createdAt: ms(row.created_at),
      subs: services.map((s) => s.service_id),
      services: services.map((s) => ({ subId: s.service_id, name: s.name, price: +s.price, unit: s.unit, duration: s.duration_min, active: s.active !== false, desc: s.description || '' })),
      ...(extra || {}),
    };
  }

  // ------------------------------------------------------------------ app shape → server payloads
  function profilePayload(u) {
    return { name: u.name || '', gender: u.gender || '', dob: u.dob || null, country: u.country || 'SG', roles: u.roles || { consumer: true }, addresses: u.addresses || [], consents: u.consents || {} };
  }
  function providerPayload(u) {
    const pv = u.provider;
    if (!pv) return null;
    const a = DR.area(pv.area, u.country || 'SG');
    return {
      user_id: u.id, status: pv.status === 'live' ? 'live' : 'draft', paused: !!pv.paused, area: a.n, lat: a.lat, lng: a.lng,
      headline: (pv.headline || '').slice(0, 120), bio: (pv.bio || '').slice(0, 4000), years: Math.max(0, Math.min(70, +pv.years || 1)),
      languages: pv.languages || ['English'], skills: pv.skills || [], serves: pv.serves || 'all', travel_fee: +pv.travelFee || 0,
      availability: pv.availability || DR.defaultAvailability(), policy: pv.policy || DR.defaultPolicy(),
    };
  }
  function servicesPayload(u) {
    const pv = u.provider;
    if (!pv) return [];
    return (pv.services || []).filter((s) => DR.SUB[s.subId]).map((s) => ({
      provider_id: u.id, service_id: s.subId, name: (s.name || DR.SUB[s.subId].name).slice(0, 120), price: Math.max(0, +s.price || 0),
      unit: s.unit || DR.SUB[s.subId].unit, duration_min: Math.max(15, Math.min(1440, +s.duration || 60)), active: s.active !== false, description: s.desc || '',
    }));
  }
  function verificationRecs(u) {
    const v = u.verification || {};
    const out = [];
    SINGLE.forEach((k) => { if (v[k]) out.push([k, v[k]]); });
    LIST.forEach((k) => (v[k] || []).forEach((rec) => out.push([k, rec])));
    return out;
  }

  // Personal lists: server rows ↔ DR.store.lists() shape. Each row is identified by its key; rows are only added or removed.
  const KINDS = { provider: 'providers', service: 'services', shop: 'shops' };
  const newest = (rows, col) => rows.slice().sort((a, b) => ms(b[col]) - ms(a[col]));
  const cartKey = (c) => `${c.subId}|${c.providerId || ''}`;
  const splitKey = (k) => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
  function listKeys(l) {
    return {
      follows: Object.entries(KINDS).flatMap(([kind, k]) => l.follows[k].map((t) => `${kind}|${t}`)).sort(),
      hidden: l.blocked.slice().sort(),
      cart: l.cart.map(cartKey).sort(),
    };
  }
  function mapLists(rows, prev) {
    const l = { follows: { providers: [], services: [], shops: [] }, blocked: [], cart: [] };
    newest(rows.follows, 'created_at').forEach((r) => { if (KINDS[r.kind]) l.follows[KINDS[r.kind]].push(r.target); });
    l.blocked = newest(rows.hidden, 'created_at').map((r) => r.provider_id);
    const prevCart = Object.fromEntries(((prev && prev.cart) || []).map((c) => [cartKey(c), c]));
    l.cart = newest(rows.cart, 'added_at').map((r) => {
      const c = { subId: r.service_id, providerId: r.provider_key || null, addedAt: ms(r.added_at) };
      return Object.assign(c, { id: (prevCart[cartKey(c)] || {}).id || uuid() });
    });
    return l;
  }
  // Local edits not yet on the server (debounce window, failed push) survive a reload from the server.
  function keepPending(l, prev, pushedKeys) {
    if (!prev || !pushedKeys) return l;
    const was = (name) => new Set(JSON.parse(pushedKeys[name] || '[]'));
    const pf = was('follows'); const ph = was('hidden'); const pc = was('cart');
    Object.entries(KINDS).forEach(([kind, k]) => {
      const now = prev.follows[k];
      l.follows[k] = now.filter((t) => !pf.has(`${kind}|${t}`) && !l.follows[k].includes(t))
        .concat(l.follows[k].filter((t) => !pf.has(`${kind}|${t}`) || now.includes(t)));
    });
    l.blocked = prev.blocked.filter((t) => !ph.has(t) && !l.blocked.includes(t)).concat(l.blocked.filter((t) => !ph.has(t) || prev.blocked.includes(t)));
    const prevKeys = new Set(prev.cart.map(cartKey)); const have = new Set(l.cart.map(cartKey));
    l.cart = prev.cart.filter((c) => !pc.has(cartKey(c)) && !have.has(cartKey(c))).concat(l.cart.filter((c) => !pc.has(cartKey(c)) || prevKeys.has(cartKey(c))));
    return l;
  }
  async function loadFollowerCounts(ids, mineFollows) {
    const next = {};
    for (let i = 0; i < ids.length; i += 500) {
      // counts are decoration: a failure leaves them at 0 rather than blocking the app
      const rows = await rpc('follower_counts', { p_providers: ids.slice(i, i + 500) }).catch(() => []);
      (rows || []).forEach((r) => { next[r.provider_id] = r.followers; });
    }
    (mineFollows || []).forEach((id) => { if (next[id]) next[id]--; });   // your own follow is added back live
    followerBase = next;
  }

  // ------------------------------------------------------------------ hydrate (server → cache)
  B.hydrate = async function hydrate() {
    if (!sb) return;
    hydrating = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      me = session && session.user ? session.user.id : null;
      const [live, svcs, creds, reviewRows] = await Promise.all([
        q(sb.from('providers').select('*').eq('status', 'live')),
        q(sb.from('bookable_services').select('*')),
        q(sb.from('provider_credentials').select('*')),
        // optional: a project without the reviews migration still loads (reviews just stay empty)
        q(sb.from('public_reviews').select('*').order('created_at', { ascending: false }).limit(2000))
          .catch((e) => { console.warn('[backend] reviews unavailable:', e.message); return []; }),
      ]);
      let mine = null;
      if (me) {
        const [profile, prov, myServices, myItems, orders, staff, follows, hidden, cart] = await Promise.all([
          q(sb.from('profiles').select('*').eq('id', me).maybeSingle()),
          q(sb.from('providers').select('*').eq('user_id', me).maybeSingle()),
          q(sb.from('provider_services').select('*').eq('provider_id', me)),
          q(sb.from('verification_items').select('*').eq('user_id', me)),
          q(sb.from('orders').select('*').or(`customer_id.eq.${me},provider_id.eq.${me}`).order('created_at', { ascending: false }).limit(500)),
          q(sb.from('staff').select('role').eq('user_id', me).maybeSingle()),
          q(sb.from('follows').select('kind, target, created_at').eq('user_id', me)),
          q(sb.from('hidden_providers').select('provider_id, created_at').eq('user_id', me)),
          q(sb.from('cart_items').select('service_id, provider_key, added_at').eq('user_id', me)),
        ]);
        mine = { profile, prov, myServices, myItems, orders, lists: { follows, hidden, cart } };
        B.staff = !!staff;
      } else B.staff = false;

      const ids = new Set(live.map((p) => p.user_id));
      if (mine) mine.orders.forEach((o) => { ids.add(o.customer_id); ids.add(o.provider_id); });
      if (ids.size) {
        const pubs = await q(sb.from('public_profiles').select('*').in('id', [...ids]));
        pubs.forEach((p) => { names[p.id] = p.name || 'Done Right user'; B._pub = B._pub || {}; B._pub[p.id] = p; });
      }

      await loadFollowerCounts(live.map((p) => p.user_id), mine ? mine.lists.follows.filter((f) => f.kind === 'provider').map((f) => f.target) : []);

      const s = S();
      const prevMe = me && s.users[me];
      const prevLists = me && s.userData[me] ? s.userData[me] : null;
      // lists of accounts signed in here before (via the server) are not kept on the device
      Object.keys(s.userData).forEach((id) => { if (id !== me && s.users[id] && s.users[id]._remote) delete s.userData[id]; });
      Object.keys(s.users).forEach((id) => { if (s.users[id]._remote || id === me) delete s.users[id]; });
      live.forEach((row) => {
        if (row.user_id === me) return;
        const pub = (B._pub || {})[row.user_id] || {};
        s.users[row.user_id] = {
          id: row.user_id, _remote: true, name: pub.name || '', gender: pub.gender || '', age: pub.age, country: row.country,
          roles: { provider: true }, provider: mapProvider(row, svcs.filter((x) => x.provider_id === row.user_id)),
          verification: mapVerification(creds.filter((c) => c.user_id === row.user_id)),
        };
      });
      if (mine && mine.profile) {
        const p = mine.profile;
        const localRec = (rid) => prevMe && verificationRecs(prevMe).map((x) => x[1]).find((r) => r.rid === rid);
        s.users[me] = {
          id: me, _remote: true, createdAt: ms(p.created_at), name: p.name, gender: p.gender, dob: p.dob || '', country: p.country,
          phone: p.phone || '', email: p.email || '', roles: p.roles || { consumer: true }, addresses: p.addresses || [], consents: p.consents || {},
          avatar: prevMe && prevMe.avatar, verification: mapVerification(mine.myItems, localRec),
          provider: mine.prov ? mapProvider(mine.prov, mine.myServices) : undefined,
        };
        s.orders = mine.orders.map(mapOrder);
        const onServer = listSections(mapLists(mine.lists));
        const lists = mapLists(mine.lists, prevLists);
        // lists moved to this account from device storage (store v3 migration) were never on the server: add them
        s.userData[me] = prevLists && prevLists.fromDevice ? DR.store.mergeLists(lists, prevLists) : keepPending(lists, prevLists, pushedUser === me ? pushed : null);
        Object.assign(pushed, onServer);
        if (s.country !== p.country) { s.country = p.country; s.area = DR.POPULAR_AREAS[p.country][0]; }
        if (B.staff) await loadReviewQueue();
      } else {
        s.orders = [];
      }
      applyReviews(reviewRows);
      DR.store.setSession(me && s.users[me] ? me : null);   // also saves; brings along a guest's cart
      if (me && s.users[me]) snapshotPushed(s.users[me]);
      subscribe();
    } finally {
      hydrating = false;
    }
    DR.emit('sync');
    DR.router.refresh();
    schedulePush();   // pending list edits and a guest's cart
  };

  // Staff: pending verification items (and recent decisions) from every user.
  async function loadReviewQueue() {
    const items = await q(sb.from('verification_items').select('*').order('submitted_at', { ascending: false }).limit(200));
    const audit = await q(sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(100));
    const others = items.filter((it) => it.user_id !== me);
    const users = [...new Set(others.map((it) => it.user_id))];
    const ids = [...new Set(users.concat(audit.map((a) => a.actor).filter(Boolean)))];
    const profiles = ids.length ? await q(sb.from('profiles').select('id, name, country').in('id', ids)) : [];
    users.forEach((uid) => {
      const p = profiles.find((x) => x.id === uid) || {};
      const u = S().users[uid] || (S().users[uid] = { id: uid, _remote: true, name: p.name || '', country: p.country || 'SG', roles: {} });
      u.verification = mapVerification(others.filter((it) => it.user_id === uid));
    });
    // the console's Audit tab shows the server's log (review decisions, document viewings)
    const nameOf = (id) => ((profiles.find((x) => x.id === id) || {}).name || (id ? String(id).slice(0, 8) : 'system'));
    S().audit = audit.map((a) => ({ ts: ms(a.ts), actor: nameOf(a.actor), userId: a.subject_user, item: a.item, action: a.action, reason: a.reason || '' }));
  }

  // ------------------------------------------------------------------ push (cache → server)
  function listSections(l) {
    const k = listKeys(l);
    return { follows: JSON.stringify(k.follows), hidden: JSON.stringify(k.hidden), cart: JSON.stringify(k.cart) };
  }
  function sections(u) {
    return Object.assign({
      profile: JSON.stringify(profilePayload(u)),
      provider: JSON.stringify(providerPayload(u)),
      services: JSON.stringify(servicesPayload(u)),
      docs: JSON.stringify(verificationRecs(u).map(([k, r]) => [k, r.rid || null, strip(r)])),
    }, listSections(DR.store.lists(u.id)));
  }
  // Lists are snapshotted from the server rows during hydrate (before a guest's cart is merged in).
  function snapshotPushed(u) {
    const lists = { follows: pushed.follows, hidden: pushed.hidden, cart: pushed.cart };
    pushed = Object.assign(sections(u), lists);
    pushed.rids = verificationRecs(u).map(([, r]) => r.rid).filter(Boolean);
    pushedUser = u.id;
  }

  // ------------------------------------------------------------------ document files → private Storage bucket
  // Scans stay AES-GCM encrypted on the device; the uploaded copy sits in the private `verification` bucket
  // at <user>/<document>/<file id>.<ext>. The document's `docs` list (in its data) records what was uploaded,
  // so reviewers know which files to open and repeat saves never upload twice.
  const BUCKET = 'verification';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const notOnDevice = new Set();   // files referenced by a document but stored on another device
  function fileRefs(rec) {
    const out = [];
    const walk = (o, slot) => {
      if (!o || typeof o !== 'object') return;
      if (typeof o.id === 'string' && o.id.startsWith('f_')) { out.push({ slot, ref: o }); return; }
      Object.entries(o).forEach(([k, v]) => walk(v, slot ? `${slot}.${k}` : k));
    };
    walk({ file: rec.file, ...(rec.files || {}) }, '');
    return out;
  }
  const uploadedPath = (rec, ref) => ((rec.docs || []).find((d) => d.path && d.path.includes(`/${ref.id}.`)) || {}).path;
  const needsUpload = (rec) => fileRefs(rec).some(({ ref }) => !uploadedPath(rec, ref) && !notOnDevice.has(ref.id));
  async function uploadDocFiles(rec) {
    const refs = fileRefs(rec);
    const before = JSON.stringify(rec.docs || []);
    const docs = [];
    for (const { slot, ref } of refs) {
      let path = uploadedPath(rec, ref);
      if (!path) {
        const url = notOnDevice.has(ref.id) ? null : await DR.files.get(ref.id);
        if (!url) { notOnDevice.add(ref.id); continue; }
        const blob = await (await fetch(url)).blob();
        path = `${me}/${rec.rid}/${ref.id}.${EXT[blob.type] || 'bin'}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
        // already uploaded (another tab, or a retry after a lost response) counts as done
        if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
      }
      docs.push({ slot, path, name: ref.name || '', image: !!ref.image });
    }
    // Earlier entries: a slot this device now fills with a different file was replaced → remove the old file;
    // slots this device has no file for (uploaded from another device) are kept as they are.
    const previous = (rec.docs || []).filter((d) => !docs.some((x) => x.path === d.path));
    const filled = new Set(docs.map((x) => x.slot));   // only slots whose file is actually on this device
    const replaced = previous.filter((d) => filled.has(d.slot));
    if (replaced.length) await sb.storage.from(BUCKET).remove(replaced.map((d) => d.path));
    rec.docs = docs.concat(previous.filter((d) => !filled.has(d.slot)));
    if (!rec.docs.length) delete rec.docs;
    return JSON.stringify(rec.docs || []) !== before;
  }
  B.signedUrls = async function signedUrls(paths, seconds = 300) {
    if (!paths.length) return {};
    const rows = await q(sb.storage.from(BUCKET).createSignedUrls(paths, seconds));
    return Object.fromEntries((rows || []).filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]));
  };
  const viewed = new Set();
  B.logView = async function logView(rid) {
    if (viewed.has(rid)) return;
    viewed.add(rid);
    await rpc('log_document_view', { p_item: rid });
  };

  // Each part saves on its own: a rejected listing never blocks a document submission. A failed part keeps
  // the local edit, reports the database's reason, and is retried on the next save.
  B.push = async function push() {
    const u = me && S().users[me];
    if (!u || hydrating) return;
    // give new documents a stable id before diffing
    let assigned = false;
    verificationRecs(u).forEach(([, r]) => { if (!r.rid) { r.rid = uuid(); assigned = true; } });
    if (assigned) DR.store.save();
    const now = sections(u);
    const errors = [];
    const part = async (name, label, fn, force = false) => {
      if (now[name] === pushed[name] && !force) return;
      try { const saved = await fn(); pushed[name] = typeof saved === 'string' ? saved : now[name]; } catch (e) { errors.push(`${label}: ${e.message}`); console.error('[backend] push ' + name, e); }
    };
    await part('profile', 'Profile', () => q(sb.from('profiles').update(profilePayload(u)).eq('id', me)));
    // the listing row must exist before its services (foreign key); going live is checked by the database
    if (u.provider) await part('provider', 'Provider listing', () => q(sb.from('providers').upsert(providerPayload(u))));
    if (u.provider) {
      await part('services', 'Services', async () => {
        const list = servicesPayload(u);
        const keep = list.map((x) => x.service_id);
        if (list.length) await q(sb.from('provider_services').upsert(list));
        const del = sb.from('provider_services').delete().eq('provider_id', me);
        await q(keep.length ? del.not('service_id', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`) : del);
      });
    }
    await part('docs', 'Documents', async () => {
      const recs = verificationRecs(u);
      // upload scans first so the document row lists them (reviewers read the list, not the device)
      let filesChanged = false;
      for (const [, r] of recs) if (await uploadDocFiles(r)) filesChanged = true;
      if (filesChanged) DR.store.save();
      const prev = JSON.parse(pushed.docs || '[]');
      const prevById = Object.fromEntries(prev.map(([, rid, data]) => [rid, JSON.stringify(data)]));
      const changed = recs.filter(([, r]) => prevById[r.rid] !== JSON.stringify(strip(r)));
      // New documents are inserted; existing ones may only change `data` (the database resets them to review).
      // No upsert: it would also rewrite id / user_id / kind, which users are not allowed to update.
      const known = new Set(pushed.rids || []);
      const fresh = changed.filter(([, r]) => !known.has(r.rid));
      for (const [kind, r] of fresh) {
        try {
          await q(sb.from('verification_items').insert({ id: r.rid, user_id: me, kind, data: strip(r) }));
        } catch (e) {
          // already saved (e.g. by another open tab sharing this browser's data) → update it instead
          if (e.code !== '23505') throw e;
          await q(sb.from('verification_items').update({ data: strip(r) }).eq('id', r.rid));
        }
        known.add(r.rid);
      }
      pushed.rids = [...known];
      for (const [, r] of changed.filter(([, x]) => !fresh.some(([, f]) => f === x))) {
        await q(sb.from('verification_items').update({ data: strip(r) }).eq('id', r.rid));
      }
      const gone = [...known].filter((rid) => !recs.some(([, r]) => r.rid === rid));
      if (gone.length) {
        // a deleted document takes its scans with it
        const paths = prev.filter(([, rid]) => gone.includes(rid)).flatMap(([, , data]) => ((data && data.docs) || []).map((d) => d.path));
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        await q(sb.from('verification_items').delete().in('id', gone));
      }
      pushed.rids = [...known].filter((rid) => !gone.includes(rid));
      if (changed.length) { changed.forEach(([, r]) => { r.status = 'pending'; delete r.reason; }); DR.store.save(); }
      return sections(u).docs;
    }, verificationRecs(u).some(([, r]) => needsUpload(r)));
    // Lists: rows are added with `insert … on conflict do nothing` (a row another tab saved is fine) and removed by key.
    // Never an upsert that updates: users may only insert and delete these rows.
    const diff = (name) => {
      const was = new Set(JSON.parse(pushed[name] || '[]')); const is = new Set(JSON.parse(now[name]));
      return { add: [...is].filter((k) => !was.has(k)), del: [...was].filter((k) => !is.has(k)) };
    };
    const ignoreDup = (cols) => ({ onConflict: cols, ignoreDuplicates: true });
    await part('follows', 'Following', async () => {
      const { add, del } = diff('follows');
      if (add.length) await q(sb.from('follows').upsert(add.map(splitKey).map(([kind, target]) => ({ user_id: me, kind, target })), ignoreDup('user_id,kind,target')));
      for (const kind of Object.keys(KINDS)) {
        const targets = del.map(splitKey).filter(([k]) => k === kind).map(([, t]) => t);
        if (targets.length) await q(sb.from('follows').delete().eq('user_id', me).eq('kind', kind).in('target', targets));
      }
    });
    await part('hidden', 'Hidden providers', async () => {
      const { add, del } = diff('hidden');
      if (add.length) await q(sb.from('hidden_providers').upsert(add.map((id) => ({ user_id: me, provider_id: id })), ignoreDup('user_id,provider_id')));
      if (del.length) await q(sb.from('hidden_providers').delete().eq('user_id', me).in('provider_id', del));
    });
    await part('cart', 'Cart', async () => {
      const { add, del } = diff('cart');
      const items = DR.store.lists(me).cart;
      if (add.length) {
        await q(sb.from('cart_items').upsert(add.map((k) => {
          const [service, provider] = splitKey(k);
          const c = items.find((x) => cartKey(x) === k) || {};
          return { user_id: me, service_id: service, provider_key: provider, added_at: new Date(c.addedAt || Date.now()).toISOString() };
        }), ignoreDup('user_id,service_id,provider_key')));
      }
      const byProvider = {};
      del.map(splitKey).forEach(([service, provider]) => { (byProvider[provider] = byProvider[provider] || []).push(service); });
      for (const [provider, services] of Object.entries(byProvider)) {
        await q(sb.from('cart_items').delete().eq('user_id', me).eq('provider_key', provider).in('service_id', services));
      }
    });
    if (errors.length) DR.ui.toast(`Not saved to the server — ${errors.join(' · ')}`, 8000);
    return errors;
  };
  function schedulePush() {
    if (!B.enabled || hydrating || !me) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => B.push(), 600);
  }

  // ------------------------------------------------------------------ bookings via database functions
  function upsertOrder(row) {
    const o = mapOrder(row);
    const list = S().orders;
    const i = list.findIndex((x) => x.id === o.id);
    if (i >= 0) list[i] = o; else list.unshift(o);
    DR.store.save();
    return o;
  }
  async function ensureNames(row) {
    const missing = [row.customer_id, row.provider_id].filter((id) => !names[id]);
    if (!missing.length) return;
    const pubs = await q(sb.from('public_profiles').select('id, name').in('id', missing));
    pubs.forEach((p) => { names[p.id] = p.name || 'Done Right user'; });
  }
  const orderCall = async (fn, args) => { const row = await rpc(fn, args); await ensureNames(row); return upsertOrder(row); };

  function installBooking() {
    const bk = DR.booking;
    Object.assign(bk, {
      create: ({ provider, service, date, time, mode = 'onsite', address = null, notes = '' }) =>
        orderCall('create_booking', { p_provider: provider.id, p_service: service.subId, p_date: date, p_time: time, p_mode: mode, p_address: mode === 'online' ? null : address, p_notes: notes }),
      pay: (id, method) => orderCall('pay_order', { p_order: id, p_method: method }),
      accept: (id) => orderCall('accept_booking', { p_order: id }),
      decline: (id, reason) => orderCall('decline_booking', { p_order: id, p_reason: reason || 'Declined by provider' }),
      cancel: (id) => orderCall('cancel_booking', { p_order: id }),
      async reschedule(id, date, time) { const o = await orderCall('request_reschedule', { p_order: id, p_date: date, p_time: time }); return { pending: !!o.rescheduleRequest, order: o }; },
      respondReschedule: (id, accept) => orderCall('respond_reschedule', { p_order: id, p_accept: !!accept }),
      propose: (id, date, time, note = '') => orderCall('propose_time', { p_order: id, p_date: date, p_time: time, p_note: note }),
      respondProposal: (id, accept) => orderCall('respond_proposal', { p_order: id, p_accept: !!accept }),
      markDone: (id) => orderCall('mark_done', { p_order: id }),
      confirmDone: (id) => orderCall('confirm_done', { p_order: id }),
      async expire() { const n = await rpc('expire_orders', {}); if (n) await B.hydrate(); return n; },
    });
  }

  // Taken slots of other customers (RLS hides their orders); fetched lazily, refreshed every minute.
  B.busyFor = function busyFor(pid) {
    if (!B.enabled || !S().users[pid] || !S().users[pid]._remote) return [];
    const e = busy[pid];
    if (!e || Date.now() - e.at > 60000) {
      busy[pid] = { at: Date.now(), list: e ? e.list : [] };
      const from = DR.u.dateKey(new Date());
      const to = DR.u.dateKey(new Date(Date.now() + 62 * 86400000));
      rpc('provider_busy', { p_provider: pid, p_from: from, p_to: to }).then((rows) => {
        busy[pid] = { at: Date.now(), list: rows.map((r) => ({ date: r.local_date, time: hhmm(r.local_time), duration: r.duration_min })) };
        DR.store.save(); DR.emit('sync');
      }).catch(() => {});
    }
    return busy[pid].list;
  };

  // ------------------------------------------------------------------ realtime
  function subscribe() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (!me) return;
    const onOrder = async (payload) => {
      if (!payload.new || !payload.new.id) return;
      await ensureNames(payload.new);
      upsertOrder(payload.new);
      delete busy[payload.new.provider_id];
      // a booking of mine was reviewed → fetch the new review
      if (payload.new.status === 'completed' && payload.new.provider_id === me) await B.loadReviews();
      DR.emit('sync');
    };
    channel = sb.channel('dr-' + me)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${me}` }, onOrder)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `provider_id=eq.${me}` }, onOrder)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'verification_items', filter: `user_id=eq.${me}` }, () => B.hydrate())
      .subscribe();
  }

  // ------------------------------------------------------------------ auth
  // Email sends a sign-in link (and a 6-digit code once the template shows {{ .Token }}); phone sends an SMS code.
  const NEXT_KEY = 'doneright.auth.next';
  B.sendOtp = async function sendOtp({ phone, email, country, next = '/' }) {
    if (phone) return q(sb.auth.signInWithOtp({ phone, options: { data: { country } } }));
    try { localStorage.setItem(NEXT_KEY, JSON.stringify({ next, ts: Date.now() })); } catch (e) { /* private mode */ }
    return q(sb.auth.signInWithOtp({ email, options: { data: { country }, shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } }));
  };
  // After arriving from the email link (or signing in from another tab): continue where the user left off.
  function afterLinkSignIn() {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(NEXT_KEY) || 'null'); localStorage.removeItem(NEXT_KEY); } catch (e) { /* ignore */ }
    const u = me && S().users[me];
    if (!u) return;
    const next = pending && Date.now() - pending.ts < 3600000 ? pending.next : '/';
    DR.ui.toast(u.name ? 'Welcome back!' : 'Account created');
    DR.router.go(u.name ? next : `/welcome?next=${encodeURIComponent(next)}`, { replace: true });
  }
  // Remove ?code= / ?error= left by the sign-in redirect, keeping other parameters and the #/route.
  function cleanAuthParams() {
    const url = new URL(location.href);
    const err = url.searchParams.get('error_description');
    const had = ['code', 'error', 'error_code', 'error_description'].filter((k) => url.searchParams.has(k));
    if (!had.length) return { returned: false };
    had.forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    return { returned: true, err };
  }
  B.verifyOtp = async function verifyOtp({ phone, email }, token) {
    await q(sb.auth.verifyOtp(phone ? { phone, token, type: 'sms' } : { email, token, type: 'email' }));
    await B.hydrate();
    const u = me && S().users[me];
    return { user: u, isNew: !!u && !u.name };
  };
  B.signOut = async function signOut() {
    try { await sb.auth.signOut(); } catch (e) { /* offline: local session is cleared anyway */ }
    await B.hydrate();
  };
  // ------------------------------------------------------------------ reviews
  // Reviews come from public_reviews (reviewer's account never exposed); writes go through database functions.
  const PHOTOS = 'review-photos';
  const photoUrl = (path) => sb.storage.from(PHOTOS).getPublicUrl(path).data.publicUrl;
  function mapReview(r) {
    return {
      id: r.id, providerId: r.provider_id, userId: r.mine ? me : null, name: r.reviewer_name, anon: !!r.anonymous,
      stars: r.stars, text: r.text, tags: r.tags || [], photos: (r.photos || []).map((x) => ({ path: x.path, url: photoUrl(x.path) })),
      verified: true, date: ms(r.created_at), area: r.area || '', sub: r.service_name, subId: r.service_id,
      useful: 0, vip: false, repeat: !!r.repeat_customer, remote: true,
    };
  }
  function applyReviews(rows) {
    const s = S();
    s.reviews = rows.map(mapReview);
    s.replies = {};
    rows.forEach((r) => { if (r.reply) s.replies[r.id] = { text: r.reply, ts: ms(r.reply_at), providerId: r.provider_id }; });
  }
  B.loadReviews = async function loadReviews() {
    applyReviews(await q(sb.from('public_reviews').select('*').order('created_at', { ascending: false }).limit(2000)));
    DR.store.save();
  };
  // photos: local file refs from the review sheet → public bucket at <me>/<order>/<file>.<ext>
  B.submitReview = async function submitReview(o, { stars, text, tags = [], anon = false, photos = [] }) {
    const paths = [];
    for (const f of photos.slice(0, 4)) {
      const url = await DR.files.get(f.id);
      if (!url) continue;
      const blob = await (await fetch(url)).blob();
      const path = `${me}/${o.id}/${f.id}.${EXT[blob.type] || 'jpg'}`;
      const { error } = await sb.storage.from(PHOTOS).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
      paths.push(path);
    }
    await rpc('submit_review', { p_order: o.id, p_stars: stars, p_text: text, p_tags: tags, p_anonymous: !!anon, p_photos: paths });
    const x = S().orders.find((y) => y.id === o.id);
    if (x) { x.status = 'completed'; x.reviewed = true; }
    await B.loadReviews();
  };
  B.replyToReview = async function replyToReview(id, text) {
    const r = await rpc('reply_to_review', { p_review: id, p_text: text || '' });
    if (r.reply) S().replies[id] = { text: r.reply, ts: ms(r.reply_at), providerId: r.provider_id };
    else delete S().replies[id];
    DR.store.save();
  };

  B.review = async function review(rid, status, reason) {
    await rpc('review_item', { p_item: rid, p_status: status, p_reason: reason || null });
    await B.hydrate();
  };

  // ------------------------------------------------------------------ boot
  B.init = async function init(opts = {}) {
    if (!opts.client && !B.configured()) return false;
    if (opts.client) sb = opts.client;
    else {
      const { createClient } = await import(cfg().sdk || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      // PKCE: the email link comes back as ?code=…, which does not clash with the app's #/ routes
      sb = createClient(cfg().url, cfg().anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
    }
    B.enabled = true;
    installBooking();
    if (!B._listening) { DR.on('saved', schedulePush); B._listening = true; }
    if (sb.auth.onAuthStateChange) {
      sb.auth.onAuthStateChange((event) => {
        // signed out elsewhere (another tab, expired refresh token) → drop the private cache
        if (event === 'SIGNED_OUT' && me) B.hydrate();
        // signed in from the email link in another tab → this tab follows
        if (event === 'SIGNED_IN' && !me && !hydrating) {
          setTimeout(() => B.hydrate().then(() => { if (/^#\/auth/.test(location.hash)) afterLinkSignIn(); }), 0);
        }
      });
    }
    // let the SDK finish exchanging ?code= before the URL is tidied up
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ }
    let pendingNext = null;
    try { pendingNext = localStorage.getItem(NEXT_KEY); } catch (e) { /* private mode */ }
    const link = cleanAuthParams();
    // signed in but this window never asked for a link → the link was meant for another window
    link.wasSignedIn = link.returned && !!session && !pendingNext;
    await B.hydrate();
    if (link.err) DR.ui.toast(link.err);
    else if (link.returned && me && !link.wasSignedIn) afterLinkSignIn();
    // PKCE links only work in the window that asked for them (it holds the one-time verifier)
    else if (link.returned && (!me || link.wasSignedIn)) DR.ui.toast('Open the sign-in link in the same browser window you requested it from — copy the link from the email and paste it into that window', 9000);
    return true;
  };
  B._test = { mapOrder, mapVerification, mapLists, keepPending, listKeys, providerPayload, servicesPayload, profilePayload, strip, sections, reset() { clearTimeout(pushTimer); sb = null; me = null; pushed = {}; pushedUser = null; followerBase = {}; B.enabled = false; B.staff = false; if (channel) channel = null; } };
})(window.DR);
