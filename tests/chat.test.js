describe('chat, masked numbers & calls', () => {
  beforeEach(H.reset);
  it('uses one thread per pair of users', () => expect(DR.chat.tid('a', 'b')).toBe(DR.chat.tid('b', 'a')));
  it('tracks unread messages per member', () => {
    H.user('a'); H.user('b');
    DR.chat.send('a', 'b', 'hi');
    expect(DR.chat.unreadTotal('b')).toBe(1);
    expect(DR.chat.unreadTotal('a')).toBe(0);
    DR.chat.markRead('b', 'a');
    expect(DR.chat.unreadTotal('b')).toBe(0);
    expect(DR.chat.list('a').length).toBe(1);
  });
  it('gives each pair a stable masked relay number', () => {
    const n = DR.masked('a', 'b', 'SG');
    expect(n).toBe(DR.masked('b', 'a', 'SG'));
    expect(n).toMatch(/^\+65 3159 \d{4}$/);
    expect(DR.masked('a', 'b', 'MY')).toMatch(/^\+60 3-2785 \d{4}$/);
  });
  it('only allows calls between parties with an active booking', () => {
    H.provider('p1');
    const c = H.user('c1');
    expect(DR.canCall('c1', 'p1').ok).toBe(false);
    const o = H.book(c, 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'x');
    expect(DR.canCall('c1', 'p1').ok).toBe(true);
    expect(DR.canCall('c1', 'support').ok).toBe(true);
    DR.booking.cancel(o.id);
    expect(DR.canCall('c1', 'p1').ok).toBe(false);
  });
  it('posts booking events into the thread as system messages', () => {
    H.provider('p1');
    const o = H.book(H.user('c1'), 'p1', H.day(2), '10:00');
    DR.booking.pay(o.id, 'x');
    expect(DR.chat.get('c1', 'p1').msgs.some((m) => m.system)).toBe(true);
  });
  it('auto-replies from demo accounts', async () => {
    H.user('c1');
    DR.chat.send('c1', 'support', 'help please');
    await H.waitFor(() => (DR.chat.get('c1', 'support') || { msgs: [] }).msgs.length === 2, 'the auto-reply');
    expect(DR.chat.get('c1', 'support').msgs.length).toBe(2);
  });
  it('does not auto-reply between two real users', async () => {
    H.user('a'); H.user('b');
    DR.chat.send('a', 'b', 'hello');
    await H.sleep(200);   // long enough for an auto-reply to have arrived, if one were coming
    expect(DR.chat.get('a', 'b').msgs.length).toBe(1);
  });
});

describe('reviews', () => {
  beforeEach(H.reset);
  it('shows provider replies on reviews', () => {
    const p = DR.data.providers('SG').find((x) => x.reviews > 5);
    const r = DR.data.reviews(p)[0];
    DR.store.s.replies[r.id] = { text: 'Thank you!', ts: Date.now(), providerId: p.id };
    expect(DR.data.reviews(p)[0].reply.text).toBe('Thank you!');
  });
  it('marks reviews as verified bookings and includes photos', () => {
    const withPhotos = DR.data.providers('SG').flatMap((p) => DR.data.reviews(p)).filter((r) => r.seedPhotos);
    expect(withPhotos.length).toBeGreaterThan(0);
    expect(withPhotos.every((r) => r.verified)).toBe(true);
  });
});
