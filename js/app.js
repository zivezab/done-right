/* Done Right — boot */
(function (DR) {
  'use strict';
  // launch scope: a saved country or language that is no longer offered falls back to the default
  (function keepToLaunchScope() {
    const s = DR.store.s;
    let changed = false;
    if (!DR.markets().includes(s.country)) { s.country = DR.markets()[0]; s.area = DR.POPULAR_AREAS[s.country][0]; changed = true; }
    if (!DR.LANGS.some(([c]) => c === s.lang)) { s.lang = 'en'; DR.u.setLangNames('en'); changed = true; }
    if (changed) DR.store.save();
    // drop a ?lang= this launch doesn't offer, so it isn't re-applied on every reload
    const url = new URL(location.href);
    if (url.searchParams.has('lang') && !DR.LANGS.some(([c]) => c === url.searchParams.get('lang'))) {
      url.searchParams.delete('lang');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  })();
  DR.applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (DR.store.s.theme === 'system') { DR.applyTheme(); DR.router.refresh(); } });
  document.documentElement.lang = { zh: 'zh-Hans', ms: 'ms' }[DR.store.s.lang] || 'en';
  DR.i18n.start();

  DR.router.start();

  if (DR.backend.configured()) {
    // Real backend: the database enforces booking rules, expiries and reviews; no simulated counterparts.
    DR.backend.init().catch((e) => { console.error(e); DR.ui.toast('Could not reach the server — showing saved data'); });
  } else {
    // Demo: simulate the other side of the marketplace (approvals, quotes, reviews, expiries)
    DR.demo.tick();
    setInterval(() => DR.demo.tick(), 3000);
  }
})(window.DR);
