/* Public profile links (js/links.js). The database re-checks the same rules: tests/db/60_profile_links_test.sql */
describe('profile links', () => {
  const n = (k, v) => DR.links.normalize(k, v);
  it('turns handles into profile addresses', () => {
    expect(n('tiktok', '@pat.tan').url).toBe('https://www.tiktok.com/@pat.tan');
    expect(n('instagram', 'pattan').url).toBe('https://www.instagram.com/pattan');
    expect(n('youtube', '@PatSwims').url).toBe('https://www.youtube.com/@PatSwims');
    expect(n('x', '@pattan').url).toBe('https://x.com/pattan');
    expect(n('github', 'pattan').url).toBe('https://github.com/pattan');
    expect(n('linkedin', 'linkedin.com/in/pat-tan').url).toBe('https://linkedin.com/in/pat-tan');
  });
  it('upgrades http and adds https:// when missing', () => {
    expect(n('website', 'pattan.sg').url).toBe('https://pattan.sg');
    expect(n('facebook', 'http://www.facebook.com/pattan').url).toBe('https://www.facebook.com/pattan');
  });
  it('keeps each link on its own platform, including look-alike domains', () => {
    expect(n('linkedin', 'https://evil.example/in/pat').ok).toBe(false);
    expect(n('linkedin', 'https://linkedin.com.evil.example/in/pat').ok).toBe(false);
    expect(n('youtube', 'https://youtu.be/abc').ok).toBe(true);
    expect(n('x', 'https://twitter.com/pattan').ok).toBe(true);
  });
  it('refuses chat apps, phone links and unsafe addresses', () => {
    expect(n('website', 'https://wa.me/6591234567').error).toMatch(/Chat apps/);
    expect(n('website', 't.me/pattan').error).toMatch(/Chat apps/);
    expect(n('website', 'tel:+6591234567').error).toMatch(/Chat apps/);
    expect(n('website', 'javascript:alert(1)').ok).toBe(false);
    expect(n('website', 'https://user:pw@pattan.sg').ok).toBe(false);
    expect(n('website', 'https://192.168.1.1').ok).toBe(false);
    expect(n('website', 'localhost').ok).toBe(false);
  });
  it('validates a whole set and treats empty fields as no link', () => {
    const ok = DR.links.normalizeAll({ linkedin: 'linkedin.com/in/pat', tiktok: '', website: 'pattan.sg' });
    expect(ok.ok).toBe(true);
    expect(Object.keys(ok.links)).toEqual(['linkedin', 'website']);
    const bad = DR.links.normalizeAll({ linkedin: 'https://evil.example', website: 'pattan.sg' });
    expect(bad.ok).toBe(false);
    expect(bad.key).toBe('linkedin');
  });
  it('shows short names on the profile chips', () => {
    expect(DR.links.display('website', 'https://www.pattan.sg/about')).toBe('pattan.sg');
    expect(DR.links.display('tiktok', 'https://www.tiktok.com/@pattan')).toBe('@pattan');
  });
  it('shows links on the public profile, opened safely', () => {
    H.reset();
    const u = H.provider('p-links');
    u.links = { linkedin: 'https://www.linkedin.com/in/pat', website: 'https://pattan.sg' };   // links belong to the account
    DR.store.save();
    const p = DR.data.provider('p-links');
    expect(p.links.website).toBe('https://pattan.sg');
    H.reset();
  });
});
