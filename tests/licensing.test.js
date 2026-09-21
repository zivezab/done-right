describe('licensing rules', () => {
  beforeEach(H.reset);
  it('maps regulated services to licences per market', () => {
    expect(DR.lic.rules('electrician', 'SG')).toEqual([['sg-lew']]);
    expect(DR.lic.rules('electrician', 'MY')).toEqual([['my-st-wireman']]);
    expect(DR.lic.rules('tui-na', 'MY')).toEqual([['my-spa-premise', 'my-tcm']]);
    expect(DR.lic.rules('tax-filing', 'SG')).toEqual([]);
    expect(DR.lic.regulated('daily-cleaning', 'SG')).toBe(false);
  });
  it('hides regulated services until a licence is verified', () => {
    const u = H.provider('p1', { subs: ['electrician', 'handyman'] });
    let p = H.p('p1');
    expect(p.services.map((s) => s.subId)).toEqual(['handyman']);
    expect(p.lockedServices.map((s) => s.subId)).toEqual(['electrician']);
    H.licence(u, 'sg-lew', 'pending');
    p = H.p('p1');
    expect(p.lockedServices[0].lic.pending).toBe(true);
    u.verification.certifications[0].status = 'verified';
    DR.store.save();
    expect(H.p('p1').services.map((s) => s.subId).sort()).toEqual(['electrician', 'handyman']);
  });
  it('accepts any licence in a requirement group', () => {
    const u = H.provider('p1', { subs: ['tui-na'], country: 'MY' });
    expect(H.p('p1').services.length).toBe(0);
    H.licence(u, 'my-tcm');
    u.verification.background = { status: 'verified', issued: H.day(-10) };
    DR.store.save();
    expect(H.p('p1').services.map((s) => s.subId)).toEqual(['tui-na']);
  });
  it('requires a background check for tuition, childcare and eldercare', () => {
    const u = H.provider('p1', { subs: ['primary-tuition'] });
    expect(H.p('p1').services.length).toBe(0);
    u.verification.background = { status: 'verified', issued: H.day(-10) };
    DR.store.save();
    expect(H.p('p1').services.length).toBe(1);
    expect(DR.lic.bgRequired('elderly-caregiver')).toBe(true);
    expect(DR.lic.bgRequired('web-developer')).toBe(false);
  });
  it('keeps providers without listable services out of search', () => {
    H.provider('p1', { subs: ['electrician'] });
    expect(DR.data.providers('SG').some((p) => p.id === 'p1')).toBe(false);
    expect(DR.data.bySub('electrician', 'SG').some((p) => p.id === 'p1')).toBe(false);
  });
  it('seed providers hold verified licences for every regulated service', () => {
    ['SG', 'MY'].forEach((cc) => DR.data.seed(cc).forEach((p) => p.services.forEach((s) => DR.lic.rules(s.subId, cc).forEach((g) => {
      expect(p.certs.some((c) => g.includes(c.licenceId) && c.verified)).toBe(true);
    }))));
  });
  it('seed providers in background-check categories are cleared', () => {
    DR.data.seed('SG').filter((p) => p.services.some((s) => DR.lic.bgRequired(s.subId))).forEach((p) => expect(p.verified.background).toBe(true));
  });
});
