describe('booking lifecycle', () => {
  beforeEach(H.reset);
  it('confirms instant bookings on payment', () => {
    H.provider('p1');
    const c = H.user('c1');
    const o = H.book(c, 'p1', H.day(2), '10:00');
    expect(o.status).toBe('to_pay');
    DR.booking.pay(o.id, 'PayNow');
    expect(o.status).toBe('upcoming');
    expect(o.payMethod).toBe('PayNow');
  });
  it('refuses a slot that is already taken', () => {
    H.provider('p1');
    H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    expect(() => H.book(H.user('c2'), 'p1', H.day(2), '10:00')).toThrow(/no longer available/);
  });
  it('holds request-to-book payments until the provider accepts', () => {
    H.provider('p1', { policy: { mode: 'request', approvalHours: 6 } });
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'PayNow');
    expect(o.status).toBe('requested');
    expect(o.requestExpiresAt).toBeGreaterThan(Date.now());
    DR.booking.accept(o.id);
    expect(o.status).toBe('upcoming');
  });
  it('refunds in full when the provider declines', () => {
    H.provider('p1', { policy: { mode: 'request' } });
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'PayNow');
    DR.booking.decline(o.id);
    expect(o.status).toBe('cancelled');
    expect(o.refund).toBe(o.total);
  });
  it('auto-cancels requests that are not answered in time', () => {
    H.provider('p1', { policy: { mode: 'request', approvalHours: 2 } });
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'PayNow');
    DR.booking.expire(o.requestExpiresAt + 1);
    expect(o.status).toBe('cancelled');
    expect(o.refund).toBe(o.total);
  });
  it('expires unpaid orders after 15 minutes', () => {
    H.provider('p1');
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.expire(o.createdAt + 16 * 60000);
    expect(o.status).toBe('cancelled');
  });
  it('applies the provider free-cancellation window', () => {
    H.provider('p1', { policy: { freeCancelHours: 24 } });
    const o = H.book(H.user('c1'), 'p1', H.day(3), '10:00');
    DR.booking.pay(o.id, 'x');
    const start = DR.u.slotTs(o.date, o.time);
    expect(DR.booking.cancelTerms(o, start - 48 * 3600000).free).toBe(true);
    const late = DR.booking.cancelTerms(o, start - 2 * 3600000);
    expect(late.free).toBe(false);
    expect(late.fee).toBe(Math.round(o.total / 2));
  });
  it('moves through done → confirmed', () => {
    H.provider('p1');
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'x');
    DR.booking.markDone(o.id);
    expect(o.status).toBe('to_confirm');
    DR.booking.confirmDone(o.id);
    expect(o.status).toBe('to_review');
  });
});

describe('rescheduling', () => {
  beforeEach(H.reset);
  const paid = (policy) => { H.provider('p1', { policy }); const o = H.book(H.user('c1'), 'p1', H.day(3), '10:00'); DR.booking.pay(o.id, 'x'); return o; };
  it('lets customers move instant bookings before the lock period', () => {
    const o = paid({ rescheduleLockHours: 24, maxReschedules: 2 });
    const r = DR.booking.reschedule(o.id, H.day(4), '15:00');
    expect(r.pending).toBe(false);
    expect(o.date).toBe(H.day(4));
    expect(o.time).toBe('15:00');
    expect(o.reschedules).toBe(1);
    expect(o.prev.time).toBe('10:00');
  });
  it('locks rescheduling inside the provider lock period', () => {
    const o = paid({ rescheduleLockHours: 24 });
    const now = DR.u.slotTs(o.date, o.time) - 3 * 3600000;
    const chk = DR.booking.canReschedule(o, now);
    expect(chk.ok).toBe(false);
    expect(chk.locked).toBe(true);
    expect(() => DR.booking.reschedule(o.id, H.day(4), '15:00', now)).toThrow(/Locked/);
  });
  it('enforces the maximum number of reschedules', () => {
    const o = paid({ maxReschedules: 1 });
    DR.booking.reschedule(o.id, H.day(4), '15:00');
    const chk = DR.booking.canReschedule(o);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toMatch(/limit/);
  });
  it('rejects a new time that is not free', () => {
    const o = paid({});
    H.book(H.user('c2'), 'p1', H.day(4), '15:00');
    expect(() => DR.booking.reschedule(o.id, H.day(4), '15:00')).toThrow(/not available/);
  });
  it('needs approval from request-to-book providers', () => {
    const o = paid({ mode: 'request' });
    DR.booking.accept(o.id);
    const r = DR.booking.reschedule(o.id, H.day(4), '15:00');
    expect(r.pending).toBe(true);
    expect(o.date).toBe(H.day(3));
    DR.booking.respondReschedule(o.id, true);
    expect(o.date).toBe(H.day(4));
    expect(o.rescheduleRequest).toBe(undefined);
  });
  it('moves provider proposals only after the customer accepts', () => {
    const o = paid({});
    DR.booking.propose(o.id, H.day(5), '09:00', 'running late');
    expect(o.date).toBe(H.day(3));
    DR.booking.respondProposal(o.id, true);
    expect(o.date).toBe(H.day(5));
    expect(o.reschedules || 0).toBe(0);
  });
  it('keeps the original time when a proposal is declined', () => {
    const o = paid({});
    DR.booking.propose(o.id, H.day(5), '09:00');
    DR.booking.respondProposal(o.id, false);
    expect(o.date).toBe(H.day(3));
    expect(o.proposal).toBe(undefined);
  });
});
