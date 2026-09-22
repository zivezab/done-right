/* Done Right — i18n engine (English source strings, 中文 + Bahasa Melayu).
 * Strings are looked up in DR.I18N ({ English: [zh, ms] }) and DR.I18N_PATTERNS for dynamic text.
 * A MutationObserver translates every rendered text node, placeholder, aria-label and title, so page
 * code stays in English. Composite text ("Coach · 13.5 km") is translated part by part.
 * User-generated content is skipped via [data-no-i18n]; proper nouns / IDs match DR.I18N_KEEP. */
(function (DR) {
  'use strict';
  const IDX = { zh: 0, ms: 1 };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const SEP = /( · | \| | – | — |, | \/ )/;
  const JOIN_ZH = { ', ': '、' };
  const missing = new Set();
  const lang = () => (DR.store && DR.store.s.lang) || 'en';

  const keep = (s) => !/[A-Za-z]{2,}/.test(s) || (DR.I18N_KEEP || []).some((re) => re.test(s));
  function lookup(s, l) {
    const e = (DR.I18N || {})[s];
    return e && e[IDX[l]] ? e[IDX[l]] : null;
  }
  function pattern(s, l) {
    for (const [re, zh, ms] of DR.I18N_PATTERNS || []) {
      const m = re.exec(s);
      if (!m) continue;
      const rep = l === 'zh' ? zh : ms;
      if (rep == null) continue;
      return typeof rep === 'function' ? rep(m, (x) => translate(x, l)) : s.replace(re, rep);
    }
    return null;
  }
  // core lookup: exact → pattern → strip decorations → composite parts
  function tr(core, l, depth = 0) {
    let r = lookup(core, l);
    if (r != null) return r;
    r = pattern(core, l);
    if (r != null) return r;
    const m2 = /^([^A-Za-z0-9(]*)([\s\S]*?)([^A-Za-z0-9)\]]*)$/.exec(core);
    if (m2 && (m2[1] || m2[3]) && m2[2]) {
      if (keep(m2[2])) return core;
      if (m2[1] && m2[3]) { // "💻 Are you a coach?" → keep the trailing punctuation with the sentence
        const withEnd = lookup(m2[2] + m2[3], l) ?? pattern(m2[2] + m2[3], l);
        if (withEnd != null) return m2[1] + withEnd;
      }
      const inner = lookup(m2[2], l) ?? pattern(m2[2], l) ?? (depth < 2 ? tr(m2[2], l, depth + 1) : null);
      if (inner != null) return m2[1] + inner + m2[3];
    }
    if (depth < 3 && SEP.test(core)) {
      const parts = core.split(SEP);
      let ok = true;
      const out = parts.map((p, i) => {
        if (i % 2) return l === 'zh' && JOIN_ZH[p] ? JOIN_ZH[p] : p;
        if (!p.trim() || keep(p.trim())) return p;
        const t = tr(p.trim(), l, depth + 1);
        if (t == null) { ok = false; return p; }
        return p.replace(p.trim(), t);
      });
      if (ok) return out.join('');
    }
    return null;
  }
  function translate(text, l = lang()) {
    if (l === 'en' || text == null) return text;
    text = String(text);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    const core = m[2];
    if (!core || keep(core)) return text;
    const r = tr(core, l);
    if (r == null) { missing.add(core); return text; }
    return m[1] + r + m[3];
  }
  const isTranslated = (text, l) => { const c = String(text).trim(); return !c || keep(c) || tr(c, l) != null; };

  const skip = (el) => !el || el.closest('script,style,[data-no-i18n],textarea');
  function textNode(n) {
    if (n.__i18n === n.nodeValue || skip(n.parentElement)) return;
    const l = lang();
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.nodeValue);
    if (!m[2] || keep(m[2])) { n.__ok = true; n.__i18n = n.nodeValue; return; }
    const r = tr(m[2], l);
    if (r != null) { const v = m[1] + r + m[3]; if (v !== n.nodeValue) n.nodeValue = v; n.__ok = true; }
    else missing.add(m[2]);
    n.__i18n = n.nodeValue;
  }
  function element(el) {
    if (skip(el)) return;
    ATTRS.forEach((a) => {
      const v = el.getAttribute(a);
      if (!v || el[`__i18n_${a}`] === v) return;
      const t = translate(v);
      if (t !== v) el.setAttribute(a, t);
      el[`__i18n_${a}`] = el.getAttribute(a);
    });
  }
  function apply(root) {
    if (lang() === 'en' || !root) return;
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1) return;
    element(root);
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(element);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) textNode(n);
  }
  const observer = new MutationObserver((muts) => {
    if (lang() === 'en') return;
    for (const m of muts) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') element(m.target);
      else m.addedNodes.forEach(apply);
    }
  });
  function start() {
    if (lang() !== 'en') apply(document.body);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  DR.LANGS_ALL = [['en', 'English'], ['zh', '中文（简体）'], ['ms', 'Bahasa Melayu']];
  // languages offered in this launch (DR.CONFIG.languages); English is always available
  Object.defineProperty(DR, 'LANGS', {
    get() {
      const on = (DR.CONFIG && DR.CONFIG.languages) || DR.LANGS_ALL.map(([c]) => c);
      return DR.LANGS_ALL.filter(([c]) => c === 'en' || on.includes(c));
    },
  });
  DR.t = (s) => translate(s);
  DR.i18n = {
    translate, apply, start, missing, isTranslated,
    setLang(l) {
      DR.store.update((s) => { s.lang = l; }, { render: false });
      DR.u.setLangNames(l);
      document.documentElement.lang = { zh: 'zh-Hans', ms: 'ms' }[l] || 'en';
      // a ?lang= in the address would override the choice on reload
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); location.replace(url.pathname + url.search + url.hash); } else location.reload();
    },
    // coverage helper (tests & dev): untranslated UI strings in a DOM subtree (checked in the source language)
    untranslated(root, l = lang()) {
      const out = new Set();
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (skip(n.parentElement)) continue;
        const v = n.nodeValue.trim();
        if (!v || n.__ok || keep(v)) continue;
        if (l === 'zh' && /[\u4e00-\u9fff]/.test(v)) continue;
        if (!isTranslated(v, l)) out.add(v);
      }
      return [...out];
    },
  };
})(window.DR);
