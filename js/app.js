/* Done Right — boot */
(function (DR) {
  'use strict';
  DR.applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (DR.store.s.theme === 'system') { DR.applyTheme(); DR.router.refresh(); } });
  document.documentElement.lang = { zh: 'zh-Hans', ms: 'ms' }[DR.store.s.lang] || 'en';
  DR.i18n.start();

  // Demo: simulate the other side of the marketplace (approvals, quotes, reviews, expiries)
  DR.demo.tick();
  setInterval(() => DR.demo.tick(), 3000);

  DR.router.start();
})(window.DR);
