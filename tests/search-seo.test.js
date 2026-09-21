describe('search', () => {
  const top = (q) => DR.data.search(q).subs.map((s) => s.id);
  it('tolerates typos', () => {
    expect(top('aircn servicing')[0]).toBe('aircon-servicing');
    expect(top('swiming')).toContain('swimming-instructor');
    expect(top('ml enginer')).toContain('ml-engineer');
    expect(top('tution').some((id) => DR.SUB[id].groupId === 'tuition')).toBe(true);
  });
  it('expands synonyms', () => {
    expect(top('maid').some((id) => /housekeeper/.test(id))).toBe(true);
    expect(top('chatgpt')).toContain('genai-engineer');
    expect(top('plumber')).toContain('plumber');
  });
  it('does not match short words inside other words', () => {
    expect(top('ai')).not.toContain('house-repair');
    expect(top('ai')).toContain('ai-expert');
  });
  it('finds providers by exact ID', () => {
    const p = DR.data.providers('SG')[5];
    expect(DR.data.search(p.id).providers[0].id).toBe(p.id);
  });
});

describe('SEO', () => {
  it('writes meta description, canonical URL and JSON-LD', () => {
    DR.seo.apply(DR.seo.service(DR.SUB['aircon-servicing'], 'SG'), 'Aircon');
    expect(document.querySelector('meta[name=description]').content).toMatch(/Aircon General Servicing/);
    const ld = JSON.parse(document.getElementById('ld-json').textContent);
    expect(ld['@type']).toBe('Service');
    expect(ld.offers.priceCurrency).toBe('SGD');
    expect(document.querySelector('link[rel=canonical]').href).toMatch(/\/sg\/aircon-servicing\/$/);
  });
  it('points category canonicals at the prerendered landing pages', () => {
    expect(DR.seo.group(DR.GROUP.tuition, 'MY').canonical).toBe('/my/categories/tuition/');
  });
  it('describes providers with ratings and priced offers', () => {
    const p = DR.data.providers('MY').find((x) => x.skill);
    const s = DR.seo.provider(p);
    expect(s.jsonld.aggregateRating.ratingValue).toBe(p.skill);
    expect(s.jsonld.makesOffer[0].priceCurrency).toBe('MYR');
  });
  it('marks private pages noindex', () => {
    DR.seo.apply({ noindex: true });
    expect(document.querySelector('meta[name=robots]').content).toBe('noindex');
    DR.seo.apply({});
    expect(document.querySelector('meta[name=robots]').content).toBe('index,follow');
  });
});
