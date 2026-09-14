/* Done Right — boot */
(function (DR) {
  'use strict';
  DR.applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (DR.store.s.theme === 'system') { DR.applyTheme(); DR.router.refresh(); } });
  document.documentElement.lang = DR.store.s.lang || 'en';

  // Demo: simulated Trust & Safety review of submitted credentials
  setInterval(() => {
    const u = DR.store.user();
    if (!u || !DR.verify.tick(u)) return;
    DR.ui.toast('✅ A verification item was approved');
    const busy = document.querySelector('.sheet-wrap') || (document.activeElement && document.activeElement.matches('input, textarea, select'));
    if (!busy && /^\/(verify|me|pro|provider|settings)/.test(DR.router.parse().path)) DR.router.refresh();
  }, 4000);

  DR.router.start();
})(window.DR);
