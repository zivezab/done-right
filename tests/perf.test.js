describe('performance budgets', () => {
  it('generates ~500 seed providers quickly', () => {
    const t = performance.now();
    const n = DR.data.seed('SG').length + DR.data.seed('MY').length;
    const ms = performance.now() - t;
    expect(n).toBeGreaterThan(400);
    expect(ms).toBeLessThan(600);
  });
  it('builds the Nearby page under 250 ms (cold)', () => {
    H.reset();
    const t = performance.now();
    const pg = DR.router.build('/nearby');
    const ms = performance.now() - t;
    expect(pg.html.length).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(250);
  });
  it('memoises availability lookups (warm ≥5× faster)', () => {
    DR.store.save();
    const list = DR.data.providers('SG');
    let t = performance.now();
    list.forEach((p) => DR.avail.next(p));
    const cold = performance.now() - t;
    t = performance.now();
    list.forEach((p) => DR.avail.next(p));
    const warm = performance.now() - t;
    expect(warm).toBeLessThan(Math.max(4, cold / 5));
  });
  it('searches the directory under 80 ms', () => {
    const t = performance.now();
    const r = DR.data.search('swimming coach');
    expect(performance.now() - t).toBeLessThan(80);
    expect(r.subs.length).toBeGreaterThan(0);
  });
  it('renders a provider profile under 60 ms', () => {
    const p = DR.data.providers('SG')[3];
    const t = performance.now();
    const pg = DR.router.build('/provider/' + p.id);
    expect(performance.now() - t).toBeLessThan(60);
    expect(pg.html).toContain(DR.u.esc(p.name));
  });
  it('renders only the first page of Nearby cards (lazy loading)', () => {
    const pg = DR.router.build('/nearby?g=all');
    const cards = (pg.html.match(/class="pcard"/g) || []).length;
    expect(cards).toBeLessThan(21);
    expect(pg.html).toContain('more-sentinel');
  });
});
