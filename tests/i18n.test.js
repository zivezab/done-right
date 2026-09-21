describe('i18n dictionary', () => {
  it('has Chinese and Malay for every entry', () => {
    const bad = Object.entries(DR.I18N).filter(([, v]) => !Array.isArray(v) || !v[0] || !v[1]).map(([k]) => k);
    expect(bad).toEqual([]);
    expect(Object.keys(DR.I18N).length).toBeGreaterThan(800);
  });
  it('translates UI strings', () => {
    expect(DR.i18n.translate('Book now', 'zh')).toBe(DR.I18N['Book now'][0]);
    expect(DR.i18n.translate('Book now', 'ms')).toBe(DR.I18N['Book now'][1]);
    expect(DR.i18n.translate('Book now', 'en')).toBe('Book now');
  });
  it('translates dynamic text with patterns', () => {
    expect(DR.i18n.translate('3 slots', 'zh')).toBe('3 个时段');
    expect(DR.i18n.translate('12 min ago', 'ms')).toBe('12 min lalu');
    expect(DR.i18n.translate('from S$58', 'zh')).toBe('S$58 起');
  });
  it('translates every category, group name and blurb', () => {
    const missing = [];
    DR.GROUPS.forEach((g) => { [g.name, g.short, g.blurb, g.arrival, ...g.includes].forEach((s) => { if (!DR.I18N[s]) missing.push(s); }); g.subs.forEach((s) => { if (!DR.I18N[s.name]) missing.push(s.name); }); });
    expect(missing).toEqual([]);
  });
  it('translates rendered DOM but never user content', () => {
    const d = document.createElement('div');
    d.innerHTML = '<p>Book now</p><p data-no-i18n>Book now</p><input placeholder="Search services, providers, shops">';
    const prev = DR.store.s.lang;
    DR.store.s.lang = 'zh';
    DR.i18n.apply(d);
    DR.store.s.lang = prev;
    expect(d.children[0].textContent).toBe(DR.I18N['Book now'][0]);
    expect(d.children[1].textContent).toBe('Book now');
    expect(d.querySelector('input').placeholder).toBe(DR.I18N['Search services, providers, shops'][0]);
  });
});

describe('i18n coverage on rendered screens', () => {
  const ROUTES = (pid) => ['/', '/categories?g=tuition', '/directory', '/search?q=swim', '/city', '/nearby', '/group/tech', '/service/swimming-instructor', '/service/painter', `/provider/${pid}`, `/provider/${pid}/credentials`, `/provider/${pid}/reviews`, `/book/${pid}`, '/me', '/orders', '/cart?tab=following', '/quotes', '/quote/new?sub=painter', '/messages', '/chat/support', '/settings', '/verify', '/verify/identity', '/verify/certifications', '/verify/education', '/verify/experience', '/verify/business', '/verify/background', '/pro', '/pro/setup', '/pro/setup?step=4', '/pro/setup?step=5', '/pro/schedule', '/pro/policies', '/pro/services', '/pro/availability', '/pro/jobs', '/pro/quotes', '/admin', '/page/help', '/page/privacy', '/auth'];
  async function crawl(lang) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:390px;height:800px;position:fixed;left:-9999px';
    frame.src = `../index.html?sandbox=i18n-${lang}&lang=${lang}#/`;
    document.body.appendChild(frame);
    await new Promise((r) => { frame.onload = r; });
    await H.sleep(400);
    const W = frame.contentWindow;
    W.DR.store.update((s) => {
      s.users.u777777 = { id: 'u777777', name: 'Coverage Tester', country: 'SG', roles: { consumer: true, provider: true }, addresses: [{ id: 'a1', label: 'Home', line: 'Blk 1', unit: '', postal: '520001', area: 'Tampines' }], verification: {} };
      W.DR.ensureProvider(s.users.u777777);
      s.users.u777777.provider.subs = ['swimming-instructor'];
      s.users.u777777.provider.services = [{ subId: 'swimming-instructor', name: 'Swimming Instructor', price: 60, unit: 'lesson', duration: 60, active: true }];
    }, { render: false });
    W.DR.store.setSession('u777777');
    const pid = W.DR.data.providers('SG').find((p) => !p.isUser && p.groupId === 'sports').id;
    const missing = {};
    for (const r of ROUTES(pid)) {
      W.location.hash = r;
      await H.sleep(260);
      W.DR.i18n.untranslated(W.document.getElementById('app'), lang).forEach((s) => { (missing[s] = missing[s] || []).push(r); });
    }
    frame.remove();
    return missing;
  }
  it('has no untranslated UI text in 中文', async () => {
    const m = await crawl('zh');
    window.__MISSING_ZH__ = m;
    expect(Object.keys(m)).toEqual([]);
  });
  it('has no untranslated UI text in Bahasa Melayu', async () => {
    const m = await crawl('ms');
    window.__MISSING_MS__ = m;
    expect(Object.keys(m)).toEqual([]);
  });
});
