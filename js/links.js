/* Done Right — public profile links (LinkedIn, TikTok, YouTube, X, Instagram…).
 * Added in Me › Profile or Provider centre › Profile (they belong to the account); shown on the public provider profile.
 * Only https links to each platform's own domain are accepted. Chat apps and phone links are refused
 * (bookings and payments stay on Done Right, where they are protected). The database re-checks the same rules. */
(function (DR) {
  'use strict';
  // [key, label, allowed domains (null = any website), how a "@handle" becomes a profile URL, placeholder]
  const PLATFORMS = [
    ['linkedin', 'LinkedIn', ['linkedin.com'], (h) => `https://www.linkedin.com/in/${h}`, 'linkedin.com/in/yourname'],
    ['tiktok', 'TikTok', ['tiktok.com'], (h) => `https://www.tiktok.com/@${h}`, '@yourhandle'],
    ['youtube', 'YouTube', ['youtube.com', 'youtu.be'], (h) => `https://www.youtube.com/@${h}`, '@yourchannel'],
    ['instagram', 'Instagram', ['instagram.com'], (h) => `https://www.instagram.com/${h}`, '@yourhandle'],
    ['x', 'X', ['x.com', 'twitter.com'], (h) => `https://x.com/${h}`, '@yourhandle'],
    ['facebook', 'Facebook', ['facebook.com', 'fb.com'], (h) => `https://www.facebook.com/${h}`, 'facebook.com/yourpage'],
    ['xiaohongshu', 'Xiaohongshu (RED)', ['xiaohongshu.com', 'xhslink.com'], null, 'xiaohongshu.com/user/profile/…'],
    ['github', 'GitHub', ['github.com'], (h) => `https://github.com/${h}`, '@yourname'],
    ['website', 'Website', null, null, 'https://yourwebsite.com'],
  ];
  // off-platform contact: never allowed as a "website"
  const BLOCKED = ['wa.me', 'whatsapp.com', 'whatsapp.net', 't.me', 'telegram.me', 'telegram.org', 'line.me', 'signal.me', 'weixin.qq.com', 'wechat.com'];
  const MAX_LEN = 300;
  const hostMatches = (host, domains) => domains.some((d) => host === d || host.endsWith('.' + d));

  // → { ok: true, url } | { ok: true, url: '' } for empty | { ok: false, error }
  function normalize(key, input) {
    const p = PLATFORMS.find((x) => x[0] === key);
    if (!p) return { ok: false, error: 'Unknown link type' };
    const [, label, domains, fromHandle] = p;
    let v = String(input || '').trim();
    if (!v) return { ok: true, url: '' };
    if (/^(tel|sms|mailto|whatsapp|javascript|data):/i.test(v)) return { ok: false, error: 'Chat apps and phone links are not allowed — keep messages on Done Right' };
    const handle = /^@?([A-Za-z0-9._-]{2,60})$/.exec(v);
    if (handle && fromHandle && (v.startsWith('@') || !v.includes('.'))) v = fromHandle(handle[1]);
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    let u;
    try { u = new URL(v); } catch (e) { return { ok: false, error: `Enter a valid ${label} link` }; }
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return { ok: false, error: `Enter a valid ${label} link` };
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (hostMatches(host, BLOCKED)) return { ok: false, error: 'Chat apps and phone links are not allowed — keep messages on Done Right' };
    if (domains && !hostMatches(host, domains)) return { ok: false, error: `Enter a valid ${label} link` };
    if (!domains && (!host.includes('.') || /^[\d.]+$/.test(host) || host === 'localhost')) return { ok: false, error: `Enter a valid ${label} link` };
    const url = u.toString().replace(/\/$/, u.pathname === '/' && !u.search ? '' : '/');
    if (url.length > MAX_LEN) return { ok: false, error: `Enter a valid ${label} link` };
    return { ok: true, url };
  }

  // Validate a whole set; returns { ok, links, error }
  function normalizeAll(values) {
    const links = {};
    for (const [key] of PLATFORMS) {
      const r = normalize(key, values[key]);
      if (!r.ok) return { ok: false, error: r.error, key };
      if (r.url) links[key] = r.url;
    }
    return { ok: true, links };
  }

  const label = (key) => (PLATFORMS.find((x) => x[0] === key) || [, key])[1];
  // what shows on the chip: the handle or site name, not the whole URL
  function display(key, url) {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, '');
      const last = path.split('/').filter(Boolean).pop() || '';
      if (key === 'website') return u.hostname.replace(/^www\./, '');
      if (last && key !== 'xiaohongshu') return last.startsWith('@') ? last : (['tiktok', 'youtube', 'instagram', 'x', 'github'].includes(key) ? '@' + last : last);
      return label(key);
    } catch (e) { return label(key); }
  }

  // The form shown on Me › Profile and Provider centre › Profile (links belong to the account).
  function form(u, opts = {}) {
    const cur = (u && u.links) || {};
    const { esc } = DR.u;
    return `<form id="lf" class="form" novalidate>
      <p class="muted small">${opts.intro || 'Add your other profiles. They appear on your public provider profile.'}</p>
      ${PLATFORMS.map(([key, lbl, , , ph]) => DR.ui.field(lbl, `<input class="input" name="${key}" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ph)}" value="${esc(cur[key] || '')}" data-no-i18n>`)).join('')}
      <p class="notice mt8">${DR.ui.icon('shield', 16)}<span>WhatsApp, Telegram and phone links aren't allowed. Keep chats and payments on Done Right, so your bookings stay protected.</span></p>
    </form>`;
  }
  // Validates the form and saves to the account; returns false (after showing the problem) if something is wrong.
  function saveForm(el, userId) {
    const f = el.querySelector('#lf');
    if (!f) return true;
    const r = normalizeAll(Object.fromEntries(new FormData(f)));
    if (!r.ok) {
      DR.ui.toast(r.error);
      const input = f.querySelector(`[name=${r.key}]`);
      if (input) { input.classList.add('invalid'); input.focus(); }
      return false;
    }
    PLATFORMS.forEach(([key]) => { const i = f.querySelector(`[name=${key}]`); if (i) { i.value = r.links[key] || ''; i.classList.remove('invalid'); } });
    DR.store.update((s) => { s.users[userId].links = r.links; }, { render: false });
    return true;
  }

  DR.links = { PLATFORMS, BLOCKED, normalize, normalizeAll, label, display, form, saveForm };
})(window.DR);
