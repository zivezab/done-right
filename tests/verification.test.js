describe('verification', () => {
  beforeEach(H.reset);
  it('blocks the same ID number on two accounts (hashed)', async () => {
    const a = H.user('a'); const b = H.user('b');
    expect((await DR.verify.claimId(a, 'SG', 'NRIC', 'S1234567A')).ok).toBe(true);
    expect((await DR.verify.claimId(a, 'SG', 'NRIC', 's1234567a')).ok).toBe(true);
    expect((await DR.verify.claimId(b, 'SG', 'NRIC', 'S1234567A')).ok).toBe(false);
    expect(Object.keys(DR.store.s.idRegistry)[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(DR.store.s).includes('S1234567A')).toBe(false);
  });
  it('auto-approves pending items only when auto-review is on', () => {
    const u = H.user('u');
    u.verification.education = [{ id: 'e1', school: 'NUS', degree: 'x', status: 'pending', submittedAt: Date.now() }];
    DR.store.s.demo.autoApprove = false;
    DR.verify.tickAll(Date.now() + 60000);
    expect(u.verification.education[0].status).toBe('pending');
    DR.store.s.demo.autoApprove = true;
    DR.verify.tickAll(Date.now() + 60000);
    expect(u.verification.education[0].status).toBe('verified');
  });
  it('expires lapsed certificates and background checks', () => {
    const u = H.provider('p1');
    u.verification.certifications = [{ id: 'c1', name: 'X', issuer: 'Y', expiry: '2020-01', status: 'verified' }];
    u.verification.background = { status: 'verified', issued: DR.u.dateKey(DR.u.addDays(new Date(), -400)) };
    DR.verify.tickAll();
    expect(u.verification.certifications[0].status).toBe('expired');
    expect(u.verification.background.status).toBe('expired');
    expect(H.p('p1').verified.certs).toBe(false);
  });
  it('lists documents that expire within 60 days', () => {
    const u = H.user('u');
    u.verification.certifications = [{ id: 'c1', name: 'CPR', issuer: 'SRC', expiry: H.ym(1), status: 'verified' }, { id: 'c2', name: 'Later', issuer: 'x', expiry: H.ym(12), status: 'verified' }];
    const list = DR.verify.expiring(u);
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('CPR');
  });
  it('records reviewer decisions with reasons in the audit log', () => {
    const u = H.user('u');
    const rec = { status: 'pending', docType: 'NRIC' };
    u.verification.identity = rec;
    DR.verify.setStatus(u, 'identity', rec, 'rejected', { reason: 'Document expired' });
    expect(rec.status).toBe('rejected');
    expect(rec.reason).toBe('Document expired');
    expect(DR.store.s.audit[0].action).toBe('rejected');
  });
  it('checks licence numbers against the register format', async () => {
    expect((await DR.registry.check('sg-cea', 'R012345A')).found).toBe(true);
    expect((await DR.registry.check('sg-cea', '12345')).found).toBe(false);
  });
  it('computes trust levels', () => {
    const u = H.user('u');
    expect(DR.verify.score(u).level).toBe('Basic');
    u.verification.identity = { status: 'verified' };
    expect(DR.verify.score(u)).toEqual({ score: 45, level: 'Verified', done: 2, total: 7 });
  });
});
