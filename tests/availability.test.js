describe('availability engine', () => {
  beforeEach(H.reset);
  const at = (p, key, t, opts) => DR.avail.slots(p, key, 60, opts).find((x) => x.time === t);
  it('generates slots from weekly hours', () => {
    H.provider('p1');
    const s = DR.avail.slots(H.p('p1'), H.day(2), 60);
    expect(s.length).toBe(12);
    expect(s[0].time).toBe('08:00');
    expect(s.every((x) => x.ok)).toBe(true);
  });
  it('honours day-off and custom-hour overrides', () => {
    const u = H.provider('p1');
    u.provider.availability.overrides[H.day(2)] = { off: true };
    u.provider.availability.overrides[H.day(3)] = { ranges: [['18:00', '20:00']] };
    DR.store.save();
    expect(DR.avail.slots(H.p('p1'), H.day(2), 60).length).toBe(0);
    expect(DR.avail.slots(H.p('p1'), H.day(3), 60).map((s) => s.time)).toEqual(['18:00', '19:00']);
  });
  it('marks provider-blocked slots', () => {
    const u = H.provider('p1');
    u.provider.availability.blocks = { [H.day(2)]: ['10:00'] };
    DR.store.save();
    const s = at(H.p('p1'), H.day(2), '10:00');
    expect(s.ok).toBe(false);
    expect(s.why).toBe('blocked');
  });
  it('enforces the minimum notice period', () => {
    H.provider('p1', { policy: { leadMinutes: 120 } });
    const key = H.day(2);
    const now = DR.u.slotTs(key, '09:00');
    expect(at(H.p('p1'), key, '10:00', { now }).why).toBe('past');
    expect(at(H.p('p1'), key, '11:00', { now }).ok).toBe(true);
  });
  it('enforces the booking window', () => {
    H.provider('p1', { policy: { advanceDays: 7 } });
    expect(DR.avail.slots(H.p('p1'), H.day(9), 60).every((x) => x.why === 'window')).toBe(true);
    expect(DR.avail.slots(H.p('p1'), H.day(6), 60).some((x) => x.ok)).toBe(true);
  });
  it('blocks overlapping slots for the full service duration', () => {
    H.provider('p1');
    const c = H.user('c1');
    const p = H.p('p1');
    DR.booking.create({ user: c, provider: p, service: Object.assign({}, p.services[0], { duration: 120 }), date: H.day(2), time: '10:00', address: c.addresses[0] });
    const q = H.p('p1');
    expect(at(q, H.day(2), '10:00').why).toBe('booked');
    expect(at(q, H.day(2), '11:00').why).toBe('booked');
    expect(at(q, H.day(2), '12:00').ok).toBe(true);
    expect(at(q, H.day(2), '09:00').ok).toBe(true);
  });
  it('adds buffer time around bookings', () => {
    H.provider('p1', { policy: { bufferMinutes: 30 } });
    const c = H.user('c1');
    H.book(c, 'p1', H.day(2), '10:00');
    const q = H.p('p1');
    expect(at(q, H.day(2), '09:00').ok).toBe(false);
    expect(at(q, H.day(2), '11:00').ok).toBe(false);
    expect(at(q, H.day(2), '12:00').ok).toBe(true);
  });
  it('can ignore an order (for rescheduling it)', () => {
    H.provider('p1');
    const c = H.user('c1');
    const o = H.book(c, 'p1', H.day(2), '10:00');
    expect(at(H.p('p1'), H.day(2), '10:00').ok).toBe(false);
    expect(at(H.p('p1'), H.day(2), '10:00', { excludeOrder: o.id }).ok).toBe(true);
  });
  it('does not free a slot when an order is cancelled… until it is', () => {
    H.provider('p1');
    const c = H.user('c1');
    const o = H.book(c, 'p1', H.day(2), '10:00');
    DR.booking.cancel(o.id);
    expect(at(H.p('p1'), H.day(2), '10:00').ok).toBe(true);
  });
  it('memoises next() and invalidates on store changes', () => {
    const u = H.provider('p1');
    const a = DR.avail.next(H.p('p1'));
    expect(DR.avail.next(H.p('p1'))).toBe(a);
    u.provider.availability.overrides[a.key] = { off: true };
    DR.store.save();
    expect(DR.avail.next(H.p('p1')).key).not.toBe(a.key);
  });
  it('hides paused providers from availability', () => {
    const u = H.provider('p1');
    u.provider.paused = true; DR.store.save();
    expect(DR.avail.next(H.p('p1'))).toBe(null);
  });
});
