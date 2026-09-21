describe('request a quote', () => {
  beforeEach(H.reset);
  const DETAILS = 'Weekly cleaning for a 3-room HDB flat, about 3 hours each visit.';
  it('classifies quote-based services', () => {
    expect(DR.isQuoteBased(DR.SUB.painter)).toBe(true);
    expect(DR.isQuoteBased(DR.SUB['house-moving'])).toBe(true);
    expect(DR.isQuoteBased(DR.SUB['aircon-servicing'])).toBe(false);
  });
  it('requires a meaningful job description', () => {
    expect(() => DR.quotes.create({ user: H.user('c1'), subId: 'painter', details: 'too short' })).toThrow(/20 characters/);
  });
  it('invites up to 5 matching pros', () => {
    const c = H.user('c1');
    const q = DR.quotes.create({ user: c, subId: 'daily-cleaning', details: DETAILS, address: c.addresses[0] });
    expect(q.invited.length).toBeGreaterThan(0);
    expect(q.invited.length < 6).toBe(true);
    q.invited.forEach((id) => expect(DR.data.provider(id).services.some((s) => s.subId === 'daily-cleaning')).toBe(true));
  });
  it('sends a direct request to a single provider', () => {
    const pid = DR.data.bySub('daily-cleaning')[0].id;
    const q = DR.quotes.create({ user: H.user('c1'), subId: 'daily-cleaning', details: DETAILS, providerId: pid });
    expect(q.invited).toEqual([pid]);
    expect(q.direct).toBe(true);
  });
  it('collects offers from pros over time', () => {
    const q = DR.quotes.create({ user: H.user('c1'), subId: 'daily-cleaning', details: DETAILS });
    DR.quotes.simulate(q.createdAt + 60000);
    expect(q.offers.length + q.declinedBy.length).toBe(q.invited.length);
    q.offers.forEach((o) => { expect(o.price).toBeGreaterThan(0); expect(!!(o.date && o.time)).toBe(true); });
  });
  it('keeps offers near the customer budget', () => {
    const q = DR.quotes.create({ user: H.user('c1'), subId: 'daily-cleaning', details: DETAILS, budgetMax: 50 });
    DR.quotes.simulate(q.createdAt + 60000);
    q.offers.forEach((o) => expect(o.price).toBeLessThan(61));
  });
  it('accepting an offer books at the quoted price and declines the rest', () => {
    const c = H.user('c1');
    const q = DR.quotes.create({ user: c, subId: 'daily-cleaning', details: DETAILS, address: c.addresses[0] });
    DR.quotes.simulate(q.createdAt + 60000);
    const [first, ...rest] = q.offers;
    const order = DR.quotes.accept(q.id, first.id, c);
    expect(order.price).toBe(first.price);
    expect(order.fee).toBe(0);
    expect(order.date).toBe(first.date);
    expect(q.status).toBe('accepted');
    rest.forEach((o) => expect(o.status).toBe('declined'));
    DR.booking.pay(order.id, 'PayNow');
    expect(order.status).toBe('upcoming');
  });
  it('lets invited providers quote only into free slots', () => {
    H.provider('p1', { subs: ['daily-cleaning'] });
    const q = DR.quotes.create({ user: H.user('c1'), subId: 'daily-cleaning', details: DETAILS, providerId: 'p1' });
    expect(() => DR.quotes.offer(q.id, 'p1', { price: 0, date: H.day(2), time: '10:00' })).toThrow(/price/);
    expect(() => DR.quotes.offer(q.id, 'p9', { price: 10, date: H.day(2), time: '10:00' })).toThrow(/not invited/);
    const o = DR.quotes.offer(q.id, 'p1', { price: 120, date: H.day(2), time: '10:00', duration: 120 });
    expect(o.status).toBe('pending');
    expect(() => DR.quotes.offer(q.id, 'p1', { price: 120, date: H.day(2), time: '23:00' })).toThrow(/free time/);
  });
  it('refuses expired offers', () => {
    const c = H.user('c1');
    const q = DR.quotes.create({ user: c, subId: 'daily-cleaning', details: DETAILS });
    DR.quotes.simulate(q.createdAt + 60000);
    const o = q.offers[0];
    o.validUntil = Date.now() - 1;
    expect(() => DR.quotes.accept(q.id, o.id, c)).toThrow(/expired/);
  });
});
