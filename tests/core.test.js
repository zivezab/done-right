describe('core utilities', () => {
  it('escapes HTML', () => expect(DR.u.esc('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'));
  it('formats money per market', () => {
    expect(DR.ui.money(98, 'SG')).toBe('S$98');
    expect(DR.ui.money(1234, 'MY')).toBe('RM1,234');
    expect(DR.ui.money(12.5, 'SG')).toBe('S$12.50');
    expect(DR.ui.money(0, 'SG')).toBe('S$0');
  });
  it('round-trips date keys and slot timestamps', () => {
    const k = H.day(3);
    expect(DR.u.dateKey(DR.u.parseKey(k))).toBe(k);
    expect(DR.u.slotTs(k, '10:30') - DR.u.parseKey(k).getTime()).toBe(630 * 60000);
    expect(DR.u.fromMin(DR.u.toMin('17:45'))).toBe('17:45');
  });
  it('labels hours and relative days', () => {
    expect(DR.u.hoursLabel(24)).toBe('1 day');
    expect(DR.u.hoursLabel(48)).toBe('2 days');
    expect(DR.u.hoursLabel(6)).toBe('6 hrs');
    expect(DR.u.hoursLabel(1)).toBe('1 hr');
    expect(DR.u.relDay(H.day(0))).toBe('Today');
    expect(DR.u.relDay(H.day(1))).toBe('Tomorrow');
  });
  it('hashes with SHA-256', async () => expect(await DR.u.sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  it('has a deterministic seeded RNG', () => {
    const a = DR.u.rng('x'); const b = DR.u.rng('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('store', () => {
  beforeEach(H.reset);
  it('keeps the signed-in user per browser tab', () => {
    H.user('u1');
    DR.store.setSession('u1');
    expect(DR.store.sessionId()).toBe('u1');
    expect(sessionStorage.getItem(DR.store.KEY + ':tab-session')).toBe('u1');
    DR.store.setSession(null);
    expect(DR.store.user()).toBe(null);
  });
  it('ignores sessions for deleted users', () => { DR.store.setSession('ghost'); expect(DR.store.sessionId()).toBe(null); });
  it('bumps the revision on every save', () => { const r = DR.store.rev; DR.store.save(); expect(DR.store.rev).toBeGreaterThan(r); });
  it('migrates v1 chat threads to per-pair threads', () => {
    const s = DR.store.migrate({ session: 'u9', threads: { p1: { msgs: [{ from: 'me', text: 'hi', ts: 1 }, { from: 'them', text: 'yo', ts: 2 }], unread: 1, updated: 2 } } });
    const th = s.threads['p1|u9'];
    expect(!!th).toBe(true);
    expect(th.msgs[0].from).toBe('u9');
    expect(th.msgs[1].from).toBe('p1');
    expect(th.unread.u9).toBe(1);
    expect(s.version).toBe(2);
    expect(Array.isArray(s.quotes)).toBe(true);
  });
});

describe('encrypted document storage', () => {
  it('stores sensitive documents AES-256-GCM encrypted at rest', async () => {
    const url = 'data:text/plain;base64,' + btoa('NRIC S1234567A');
    const id = await DR.files.put(url, { secure: true });
    const raw = await DR.files.raw(id);
    expect(raw.enc).toBe('AES-256-GCM');
    expect(raw.iv.length).toBe(12);
    expect(new TextDecoder().decode(new Uint8Array(raw.ct)).includes('base64')).toBe(false);
    DR.files.forget(id);
    expect(await DR.files.get(id)).toBe(url);
    await DR.files.del(id);
  });
  it('uses a fresh IV per file', async () => {
    const a = await DR.files.put('data:,same', { secure: true });
    const b = await DR.files.put('data:,same', { secure: true });
    const ra = await DR.files.raw(a); const rb = await DR.files.raw(b);
    expect(Array.from(ra.iv).join()).not.toBe(Array.from(rb.iv).join());
    await DR.files.del(a); await DR.files.del(b);
  });
  it('keeps non-sensitive images (review photos) unencrypted', async () => {
    const id = await DR.files.put('data:image/png;base64,AAA');
    expect(await DR.files.raw(id)).toBe('data:image/png;base64,AAA');
    await DR.files.del(id);
  });
  it('collects file ids for wiping on account deletion', () => expect(DR.files.collect({ a: { id: 'f_1' }, b: [{ file: { id: 'f_2' } }] }).sort()).toEqual(['f_1', 'f_2']));
});
