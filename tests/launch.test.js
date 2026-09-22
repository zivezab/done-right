/* Launch scope: Singapore, English + Chinese (DR.CONFIG.markets / DR.CONFIG.languages). */
describe('launch scope: Singapore, English and Chinese', () => {
  const keep = { markets: DR.CONFIG.markets, languages: DR.CONFIG.languages };
  const restore = () => Object.assign(DR.CONFIG, keep);
  it('serves Singapore only', () => {
    expect(DR.markets()).toEqual(['SG']);
    expect(DR.marketCountries().map((c) => c.name)).toEqual(['Singapore']);
  });
  it('offers English and Chinese, not Malay', () => {
    expect(DR.LANGS.map(([c]) => c)).toEqual(['en', 'zh']);
  });
  it('keeps Malaysia and Malay ready to switch back on', () => {
    try {
      DR.CONFIG.markets = ['SG', 'MY'];
      DR.CONFIG.languages = ['en', 'zh', 'ms'];
      expect(DR.markets()).toEqual(['SG', 'MY']);
      expect(DR.LANGS.map(([c]) => c)).toEqual(['en', 'zh', 'ms']);
      expect(DR.i18n.translate('Bookings', 'ms')).not.toBe('Bookings');
    } finally { restore(); }
  });
  it('always keeps English and a valid market even if misconfigured', () => {
    try {
      DR.CONFIG.markets = ['XX'];
      DR.CONFIG.languages = [];
      expect(DR.markets()).toEqual(['SG']);
      expect(DR.LANGS.map(([c]) => c)).toEqual(['en']);
    } finally { restore(); }
  });
  it('writes Singapore-only copy and search descriptions', () => {
    DR.seo.apply({}, 'Home');
    expect(document.querySelector('meta[name=description]').content).toMatch(/in Singapore —/);
    expect(/Malaysia/.test(document.querySelector('meta[name=description]').content)).toBe(false);
    expect(DR.i18n.translate('Trusted, verified services across Singapore', 'zh')).toBe('新加坡值得信赖的认证服务');
  });
});
