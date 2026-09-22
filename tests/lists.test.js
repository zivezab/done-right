/* Personal lists (follows, hidden providers, cart) belong to an account, not to the device. */
(function () {
  const seedId = () => DR.data.providers('SG')[0].id;
  const signIn = (id) => DR.store.setSession(id);
  // build and mount a page off-screen (the router is not running on the test page)
  function mount(route) {
    const page = DR.router.build(route);
    const main = document.createElement('main');
    main.innerHTML = page.html;
    if (page.mount) page.mount(main, { params: {}, query: DR.router.parse(route).query });
    return main;
  }

  describe('personal lists per account', () => {
    beforeEach(H.reset);
    it('two accounts on one browser keep separate follows', () => {
      H.user('ua'); H.user('ub');
      signIn('ua');
      DR.store.update(() => { DR.store.lists().follows.providers.unshift('p1'); DR.store.lists().follows.services.unshift('piano'); }, { render: false });
      signIn('ub');
      expect(DR.store.lists().follows.providers).toEqual([]);
      expect(DR.store.lists().follows.services).toEqual([]);
      signIn('ua');
      expect(DR.store.lists().follows.providers).toEqual(['p1']);
      expect(DR.store.s.userData.ua.follows.services).toEqual(['piano']);
    });
    it('a hidden provider is hidden only for the account that hid them', () => {
      H.user('ua'); H.user('ub');
      const pid = seedId();
      signIn('ua');
      DR.store.update(() => { DR.store.lists().blocked.push(pid); }, { render: false });
      expect(DR.data.providers('SG').some((p) => p.id === pid)).toBe(false);
      signIn('ub');
      expect(DR.data.providers('SG').some((p) => p.id === pid)).toBe(true);
      signIn(null);
      expect(DR.data.providers('SG').some((p) => p.id === pid)).toBe(true);
    });
    it('guests have no follows, and their cart is kept on the device', () => {
      signIn(null);
      DR.store.update(() => { DR.store.lists().follows.providers.push('p1'); DR.store.lists().cart.unshift({ id: 'g1', subId: 'piano', providerId: null, addedAt: 1 }); }, { render: false });
      expect(DR.store.lists().follows.providers).toEqual([]);
      expect(DR.store.s.guestCart.map((c) => c.subId)).toEqual(['piano']);
      DR.store.update(() => { DR.store.lists().cart = []; }, { render: false });
      expect(DR.store.s.guestCart).toEqual([]);
    });
    it('signing in merges the guest cart into the account (no duplicates)', () => {
      H.user('ua');
      DR.store.s.userData.ua = { follows: { providers: [], services: [], shops: [] }, blocked: [], cart: [{ id: 'c1', subId: 'piano', providerId: null, addedAt: 1 }] };
      DR.store.s.guestCart = [{ id: 'g1', subId: 'painter', providerId: null, addedAt: 2 }, { id: 'g2', subId: 'piano', providerId: null, addedAt: 3 }];
      signIn('ua');
      expect(DR.store.lists().cart.map((c) => c.subId)).toEqual(['painter', 'piano']);
      expect(DR.store.s.guestCart).toEqual([]);
      signIn(null);
      expect(DR.store.lists().cart).toEqual([]);
    });
    it('follower counts add up every account on this device', () => {
      H.provider('pro1'); H.user('ua'); H.user('ub');
      ['ua', 'ub'].forEach((id) => { signIn(id); DR.store.update(() => { DR.store.lists().follows.providers.unshift('pro1'); }, { render: false }); });
      expect(H.p('pro1').followers).toBe(2);
    });
    it('deleting an account removes its lists', async () => {
      H.user('ua');
      signIn('ua');
      DR.store.update(() => { DR.store.lists().follows.providers.unshift('p1'); }, { render: false });
      const confirm = DR.ui.confirm;
      DR.ui.confirm = async () => true;
      try {
        mount('/settings').querySelector('#delete').click();
        await H.sleep(30);
      } finally { DR.ui.confirm = confirm; }
      expect(DR.store.s.users.ua).toBe(undefined);
      expect(DR.store.s.userData.ua).toBe(undefined);
    });
    it('the cart page and blocked-providers page read the signed-in account', async () => {
      H.user('ua');
      const pid = seedId();
      signIn('ua');
      DR.store.update(() => { const l = DR.store.lists(); l.cart.unshift({ id: DR.u.uuid(), subId: 'piano', providerId: null, addedAt: Date.now() }); l.blocked.push(pid); }, { render: false });
      expect(mount('/cart').querySelectorAll('.cart-row').length).toBe(1);
      const blocked = mount('/settings/blocked');
      expect(blocked.querySelectorAll('[data-unblock]').length).toBe(1);
      blocked.querySelector('[data-unblock]').click();
      expect(DR.store.lists().blocked).toEqual([]);
      signIn(null);
      expect(mount('/cart').querySelectorAll('.cart-row').length).toBe(0);
    });
  });

  describe('store migration v2 → v3 (personal lists)', () => {
    beforeEach(H.reset);   // no tab session left over from other tests
    const v2 = (session) => ({
      version: 2, session, users: { ua: { id: 'ua', name: 'A' } }, orders: [], threads: {},
      follows: { providers: ['p1'], services: ['piano'], shops: ['Tan Swim'] }, blocked: ['p9'], cart: [{ id: 'c1', subId: 'painter', providerId: null, addedAt: 1 }],
    });
    it('gives device lists to the signed-in user', () => {
      const s = DR.store.migrate(v2('ua'));
      expect(s.version).toBe(3);
      expect(s.userData.ua.follows).toEqual({ providers: ['p1'], services: ['piano'], shops: ['Tan Swim'] });
      expect(s.userData.ua.blocked).toEqual(['p9']);
      expect(s.userData.ua.cart.map((c) => c.subId)).toEqual(['painter']);
      expect(s.userData.ua.fromDevice).toBe(true);
      expect('follows' in s || 'blocked' in s || 'cart' in s).toBe(false);
      expect(s.guestCart).toEqual([]);
    });
    it('drops follows and hidden providers for guests, keeping their cart', () => {
      const s = DR.store.migrate(v2(null));
      expect(s.userData).toEqual({});
      expect(s.guestCart.map((c) => c.subId)).toEqual(['painter']);
      expect('follows' in s || 'blocked' in s).toBe(false);
    });
    it('is a no-op on v3 state', () => {
      const s = DR.store.migrate({ version: 3, users: {}, userData: { ua: { follows: { providers: ['p1'], services: [], shops: [] }, blocked: [], cart: [] } }, guestCart: [] });
      expect(s.userData.ua.follows.providers).toEqual(['p1']);
      expect(s.userData.ua.fromDevice).toBe(undefined);
    });
  });
})();
