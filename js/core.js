/* Done Right — core: utilities, store (per-tab session + cross-tab sync), encrypted file storage,
 * event bus, router and UI kit */
window.DR = window.DR || {};
(function (DR) {
  'use strict';

  // ---------------------------------------------------------------- utilities
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const slotTs = (key, time) => parseKey(key).getTime() + toMin(time) * 60000;

  // Localised day / month names (arrays are mutated in place so destructured references stay valid)
  const NAMES = {
    en: { d: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dl: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], m: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
    zh: { d: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], dl: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'], m: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] },
    ms: { d: ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'], dl: ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'], m: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'] },
  };
  const DAYS = NAMES.en.d.slice();
  const DAYS_LONG = NAMES.en.dl.slice();
  const MONTHS = NAMES.en.m.slice();
  const lang = () => (state && state.lang) || 'en';
  function setLangNames(l) {
    const n = NAMES[l] || NAMES.en;
    DAYS.splice(0, 7, ...n.d); DAYS_LONG.splice(0, 7, ...n.dl); MONTHS.splice(0, 12, ...n.m);
  }
  const tr = (s) => s; // rendered text is translated by the i18n DOM layer
  function dayMonth(d) { return lang() === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
  function relDay(key) {
    const today = dateKey(new Date());
    if (key === today) return tr('Today');
    if (key === dateKey(addDays(new Date(), 1))) return tr('Tomorrow');
    const d = parseKey(key);
    return lang() === 'zh' ? `${dayMonth(d)} ${DAYS[d.getDay()]}` : `${DAYS[d.getDay()]} ${dayMonth(d)}`;
  }
  function fmtDate(key) {
    const d = parseKey(key);
    return lang() === 'zh' ? `${d.getFullYear()}年${dayMonth(d)} ${DAYS[d.getDay()]}` : `${DAYS[d.getDay()]}, ${dayMonth(d)} ${d.getFullYear()}`;
  }
  function fmtMonth(ym) { if (!ym) return ''; const [y, m] = ym.split('-'); if (!m) return y; return lang() === 'zh' ? `${y}年${+m}月` : `${MONTHS[+m - 1]} ${y}`; }
  function fmtTs(ts) { const d = new Date(ts); return `${lang() === 'zh' ? `${d.getFullYear()}年${dayMonth(d)}` : `${dayMonth(d)} ${d.getFullYear()}`}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function timeAgo(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return tr('just now');
    if (s < 3600) return tr(`${Math.floor(s / 60)} min ago`);
    if (s < 86400) return tr(`${Math.floor(s / 3600)} hr ago`);
    if (s < 86400 * 30) return tr(`${Math.floor(s / 86400)} days ago`);
    if (s < 86400 * 365) return tr(`${Math.floor(s / 86400 / 30)} months ago`);
    return tr(`${Math.floor(s / 86400 / 365)} yr ago`);
  }
  function hoursLabel(h) { return h >= 24 && h % 24 === 0 ? `${h / 24} day${h / 24 > 1 ? 's' : ''}` : `${h} hr${h === 1 ? '' : 's'}`; }
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const compact = (n) => (n >= 10000 ? `${Math.floor(n / 1000)}k+` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k+` : String(n));
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  DR.u = { esc, hash, rng, pick, between, clamp, uid, pad, dateKey, parseKey, addDays, toMin, fromMin, slotTs, DAYS, DAYS_LONG, MONTHS, setLangNames, relDay, fmtDate, fmtMonth, fmtTs, timeAgo, hoursLabel, debounce, plural, compact, sha256 };

  // ---------------------------------------------------------------- event bus
  const listeners = {};
  DR.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); return () => DR.off(evt, fn); };
  DR.off = (evt, fn) => { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); };
  DR.emit = (evt, data) => (listeners[evt] || []).slice().forEach((f) => { try { f(data); } catch (e) { console.error(e); } });

  // ---------------------------------------------------------------- store
  const KEY = window.DR_STORAGE_KEY || 'doneright.state.v1';
  const SKEY = KEY + ':tab-session';
  const VERSION = 2;
  const defaults = () => ({
    version: VERSION, country: 'SG', area: 'Orchard', lang: 'en', theme: 'dark',
    session: null, users: {}, orders: [], cart: [], quotes: [],
    follows: { providers: [], services: [], shops: [] },
    history: [], searches: [], blocked: [], threads: {}, reviews: [], replies: {},
    audit: [], idRegistry: {}, waitlist: [],
    notif: { bookings: true, nearby: true, promos: false, chat: true },
    demo: { autoApprove: true, simulate: true },
    tips: {},
  });
  function migrate(s) {
    if (!s.version || s.version < 2) {
      // v1 threads were keyed by peer id from a single user's perspective
      const me = s.session;
      const next = {};
      Object.entries(s.threads || {}).forEach(([peer, th]) => {
        if (th.members) { next[peer] = th; return; }
        if (!me) return;
        const members = [me, peer].sort();
        next[members.join('|')] = { members, msgs: (th.msgs || []).map((m) => ({ from: m.from === 'me' ? me : peer, text: m.text, ts: m.ts })), unread: { [me]: th.unread || 0 }, updated: th.updated || 0 };
      });
      s.threads = next;
      s.version = VERSION;
    }
    const d = defaults();
    Object.keys(d).forEach((k) => { if (s[k] === undefined || s[k] === null) s[k] = d[k]; });
    s.demo = Object.assign(d.demo, s.demo);
    return s;
  }
  let state;
  try { state = migrate(JSON.parse(localStorage.getItem(KEY) || '{}') || {}); } catch (e) { state = defaults(); }
  setLangNames(state.lang);
  let rev = 1;

  function tabSession() {
    try { const v = sessionStorage.getItem(SKEY); if (v !== null) return v || null; } catch (e) { /* ignore */ }
    return state.session || null;
  }

  DR.store = {
    KEY,
    migrate,
    get s() { return state; },
    get rev() { return rev; },
    save() {
      rev++;
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { DR.ui.toast('Device storage is full — some changes were not saved'); }
    },
    update(fn, opts = {}) { fn(state); this.save(); if (opts.render !== false) DR.router.refresh(); },
    reset() { state = defaults(); try { sessionStorage.removeItem(SKEY); } catch (e) { /* ignore */ } this.save(); },
    sessionId() { const id = tabSession(); return id && state.users[id] ? id : null; },
    setSession(id) {
      state.session = id || null;
      try { sessionStorage.setItem(SKEY, id || ''); } catch (e) { /* ignore */ }
      this.save();
    },
    user() { const id = this.sessionId(); return id ? state.users[id] : null; },
    audit(entry) { state.audit.unshift(Object.assign({ ts: Date.now() }, entry)); state.audit = state.audit.slice(0, 500); },
  };
  // Cross-tab sync: another tab saved → adopt its state (per-tab session is kept in sessionStorage)
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { state = migrate(JSON.parse(e.newValue)); rev++; DR.emit('sync'); } catch (err) { /* ignore */ }
  });

  // ---------------------------------------------------------------- file storage (IndexedDB, AES-256-GCM for sensitive docs)
  DR.files = (function () {
    const DB = window.DR_FILES_DB || 'doneright-files';
    let dbp; let keyp; const mem = {};
    function db() {
      return dbp || (dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, 2);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files');
          if (!r.result.objectStoreNames.contains('keys')) r.result.createObjectStore('keys');
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      }));
    }
    const idb = (store, mode, fn) => db().then((d) => new Promise((res, rej) => {
      const tx = d.transaction(store, mode); const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    }));
    // Device master key: non-extractable, never leaves the browser's key store
    function key() {
      return keyp || (keyp = (async () => {
        let k = await idb('keys', 'readonly', (s) => s.get('master'));
        if (!k) {
          k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          await idb('keys', 'readwrite', (s) => s.put(k, 'master'));
        }
        return k;
      })());
    }
    async function encrypt(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(text));
      return { enc: 'AES-256-GCM', iv, ct };
    }
    async function decrypt(rec) {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, await key(), rec.ct);
      return new TextDecoder().decode(pt);
    }
    async function put(dataUrl, opts = {}) {
      const id = uid('f_'); mem[id] = dataUrl;
      try {
        const rec = opts.secure ? await encrypt(dataUrl) : dataUrl;
        await idb('files', 'readwrite', (s) => s.put(rec, id));
      } catch (e) { /* memory-only fallback; sensitive data is never written unencrypted */ }
      return id;
    }
    async function get(id) {
      if (mem[id]) return mem[id];
      try {
        const rec = await idb('files', 'readonly', (s) => s.get(id));
        if (!rec) return null;
        const v = rec.enc ? await decrypt(rec) : rec;
        mem[id] = v; return v;
      } catch (e) { return null; }
    }
    const raw = (id) => idb('files', 'readonly', (s) => s.get(id)).catch(() => null);
    async function del(id) { delete mem[id]; try { await idb('files', 'readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ } }
    const readURL = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    async function downscale(file, max) {
      const url = await readURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.78);
    }
    async function fromInput(file, max = 1100, opts = {}) {
      if (!file) return null;
      const secure = !!opts.secure;
      if (file.type.startsWith('image/')) return { id: await put(await downscale(file, max), { secure }), name: file.name, image: true, secure };
      if (file.size > 4 * 1024 * 1024) throw new Error('File is too large (max 4 MB)');
      return { id: await put(await readURL(file), { secure }), name: file.name, image: false, secure };
    }
    function collect(obj, out = []) {
      if (!obj || typeof obj !== 'object') return out;
      if (typeof obj.id === 'string' && obj.id.startsWith('f_')) out.push(obj.id);
      Object.values(obj).forEach((v) => collect(v, out));
      return out;
    }
    function hydrate(root) {
      root.querySelectorAll('[data-file]').forEach(async (el) => {
        const url = await get(el.dataset.file);
        if (!url) return;
        if (el.tagName === 'IMG') el.src = url; else el.style.backgroundImage = `url("${url}")`;
      });
    }
    const forget = (id) => { delete mem[id]; };
    return { put, get, raw, del, forget, fromInput, hydrate, collect, encrypt, decrypt };
  })();

  // ---------------------------------------------------------------- router
  const routes = [];
  const cleanups = [];
  const stack = [];
  const scrolls = {};
  let current = null;
  let currentPage = null;
  let replaceNext = false;
  DR.page = (pattern, fn) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ re, keys, fn });
  };
  DR.onLeave = (fn) => cleanups.push(fn);
  function parse(h) {
    h = h === undefined ? (location.hash.slice(1) || '/') : h;
    const [path, qs = ''] = h.split('?');
    return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)), full: h };
  }
  function resolve(full) {
    const { path, query } = parse(full);
    let m = null;
    const route = routes.find((r) => (m = path.match(r.re)));
    const params = {};
    if (route) route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route, params, query, path };
  }
  function render() {
    const { route, params, query, path } = resolve();
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
    document.querySelectorAll('.sheet-wrap:not(.sheet-persist)').forEach((s) => s.remove());
    if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll');
    let page;
    try { page = route ? route.fn({ params, query, path }) : DR.notFound(); }
    catch (e) { console.error(e); page = DR.notFound('Something went wrong', e.message); }
    if (page === null) return;
    currentPage = page;
    const app = document.getElementById('app');
    app.innerHTML = `<main class="screen ${page.cls || ''} ${page.tab ? 'has-tabbar' : ''} ${page.bar ? 'has-bar' : ''}">${page.html}</main>${page.tab ? DR.ui.tabbar(page.tab) : ''}`;
    document.title = (page.title ? DR.t(page.title) + ' · ' : '') + 'Done Right';
    if (DR.seo) DR.seo.apply(page.seo, page.title);
    const main = app.firstElementChild;
    if (page.mount) page.mount(main, { params, query });
    DR.files.hydrate(app);
  }
  function onHash() {
    const full = parse().full;
    if (current !== null) scrolls[current] = window.scrollY;
    let restore = 0;
    if (replaceNext) { replaceNext = false; if (stack.length) stack[stack.length - 1] = full; else stack.push(full); }
    else if (stack.length > 1 && stack[stack.length - 2] === full) { stack.pop(); restore = scrolls[full] || 0; }
    else stack.push(full);
    current = full;
    render();
    window.scrollTo(0, restore);
  }
  const busy = () => !!document.querySelector('.sheet-wrap') || !!(document.activeElement && document.activeElement.matches('input:not([type=checkbox]):not([type=radio]), textarea, select'));
  DR.on('sync', DR.u.debounce(() => {
    if (!current) return;
    if (currentPage && currentPage.onSync) { currentPage.onSync(); return; }
    if (!busy()) DR.router.refresh();
  }, 120));
  DR.router = {
    start() { window.addEventListener('hashchange', onHash); onHash(); },
    go(path, opts = {}) {
      if (('#' + path) === location.hash) { this.refresh(); return; }
      if (opts.replace) { replaceNext = true; location.replace('#' + path); } else location.hash = path;
    },
    back(fallback = '/') { if (stack.length > 1) history.back(); else this.go(fallback, { replace: true }); },
    refresh() { if (current === null) return; const y = window.scrollY; render(); window.scrollTo(0, y); },
    parse, resolve, busy,
    // test helper: build a page object for a route without mounting
    build(full) { const r = resolve(full); return r.route ? r.route.fn({ params: r.params, query: r.query, path: r.path }) : null; },
  };
  DR.requireAuth = () => {
    if (DR.store.user()) return true;
    DR.router.go('/auth?next=' + encodeURIComponent(parse().full), { replace: true });
    return null;
  };

  // ---------------------------------------------------------------- icons (24px line set)
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6"/>',
    userHeart: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3.1-7 7-7 1.2 0 2.3.3 3.2.8"/><path d="M18 21s-3.5-2.1-3.5-4.4c0-1.1.9-2 2-2 .6 0 1.1.3 1.5.8.4-.5.9-.8 1.5-.8 1.1 0 2 .9 2 2 0 2.3-3.5 4.4-3.5 4.4z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.4 4 4 7.4 4c2 0 3.4 1.1 4.6 2.6C13.2 5.1 14.6 4 16.6 4 20 4 22.3 7.4 21.2 10.7 19.5 15.4 12 20 12 20z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>',
    map: '<path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
    similar: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="11" cy="11" r="3"/><path d="m16 16-2.8-2.8"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zm0 0s1.5-4.5 4-3.5S15 8 12 8z"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/>',
    ticket: '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    grad: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    logout: '<path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 17l-5-5 5-5M5 12h11"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    callEnd: '<path d="M3 15.5c5-5 13-5 18 0l-2.5 2.5-3.5-1.5v-2.5c-2-.7-4-.7-6 0v2.5L5.5 18z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    micOff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    more: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    dots: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    car: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18v3h-3v-1H6v1H3z"/><circle cx="7.5" cy="13" r=".8"/><circle cx="16.5" cy="13" r=".8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    verified: '<path d="M12 2.5 14.4 4l2.8-.2 1 2.6 2.3 1.6-.8 2.7.8 2.7-2.3 1.6-1 2.6-2.8-.2L12 19.5 9.6 18l-2.8.2-1-2.6L3.5 14l.8-2.7-.8-2.7 2.3-1.6 1-2.6 2.8.2z"/><path d="m8.5 11 2.5 2.5 4.5-4.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a9 9 0 0 1-2.2 3.1M6.5 6.6C4.3 8 3 10.4 3 12c0 2 4 7 9 7a9.6 9.6 0 0 0 4.5-1.1M9.9 10a3 3 0 0 0 4.1 4.1"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.5 16c1-1.2 2.1-1.8 3.5-1.8s2.5.6 3.5 1.8M9 9.5h.01M15 9.5h.01"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    broom: '<path d="M15 3 10 11M6.5 12.5h8l2 8.5H4.5z"/><path d="M8 17v4M12 17v4"/>',
    store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s2-1.3 2-3c0 1.7 1.3 3 3 3s3-1.3 3-3M9.5 20v-5h5v5"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5M20 3.5v5h-5"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    home2: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
    sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/>',
    thumb: '<path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 3 1.3 3 3v3h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8 3h8l-2 7h-4z"/>',
    language: '<path d="M4 5h9M8.5 3v2M6 5c0 4 2.5 7 6 8M11 5c-.5 4-3 7.5-7 9M13 21l4-10 4 10M14.5 17.5h5"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    quote: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 7.5v7M13.6 9.2c-.3-.5-.9-.8-1.6-.8-.9 0-1.6.5-1.6 1.2 0 1.6 3.3 1 3.3 2.7 0 .7-.8 1.2-1.7 1.2-.7 0-1.4-.3-1.7-.9"/>',
    block: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
    rules: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M18 5l2 2"/>',
  };

  // ---------------------------------------------------------------- avatar generator (illustrated portraits)
  const avatarCache = {};
  const SKINS = [['#f3cdb0', '#d9a987'], ['#e8b48f', '#c98f69'], ['#d19a72', '#ae7550'], ['#a8704b', '#85522f'], ['#f6d6bf', '#dcb094'], ['#8a5a3c', '#6a4128']];
  const HAIRS = ['#1a1a1a', '#2b1d14', '#3a2718', '#111', '#4a3426', '#23201f'];
  const BGS = [['#5f6d7a', '#2e3944'], ['#cfd4db', '#8f98a4'], ['#7c907b', '#3f503f'], ['#bba692', '#6e5b49'], ['#7182a3', '#39445f'], ['#dcd6cd', '#a39a8e'], ['#8a6f86', '#4b3a49']];
  function avatar(key, gender = 'M', variant = 0) {
    const ck = `${key}|${gender}|${variant}`;
    if (avatarCache[ck]) return avatarCache[ck];
    const r = rng(key + '|face');
    const [skin, skinD] = pick(r, SKINS);
    const hair = pick(r, HAIRS);
    const style = between(r, 0, 2);
    const bg = BGS[(hash(key) + variant * 3) % BGS.length];
    const outfit = ['polo', 'tee', 'suit', 'shirt'][variant % 4];
    const F = gender === 'F';
    const shirtFill = { polo: '#161616', tee: '#f1f1f1', suit: '#1f2a44', shirt: '#1b1b1b' }[outfit];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="100" height="120" fill="url(#g)"/>`;
    if (F) s += style === 2 ? `<path d="M31 50c-2-21 8-33 19-33s21 12 19 33l1 18H30z" fill="${hair}"/>` : `<path d="M29 50c-2-22 8-34 21-34s23 12 21 34l3 34H26z" fill="${hair}"/>`;
    s += `<path d="M43 62h14v18c-4 4-10 4-14 0z" fill="${skinD}"/>`;
    s += `<path d="M8 120c1-24 14-36 42-39 28 3 41 15 42 39z" fill="${shirtFill}"/>`;
    if (outfit === 'polo') s += '<path d="M38 80l12 10 12-10" fill="none" stroke="#e5533d" stroke-width="2.4"/><path d="M50 90v14" stroke="#2a2a2a" stroke-width="1.2"/><circle cx="50" cy="95" r=".9" fill="#777"/><circle cx="50" cy="100" r=".9" fill="#777"/><text x="61" y="101" font-size="5.5" font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#e5533d">DR</text><path d="M14 112l8-6M86 112l-8-6" stroke="#e5533d" stroke-width="1.6"/>';
    if (outfit === 'tee') s += '<path d="M41 80q9 8 18 0" stroke="#cfcfcf" stroke-width="1.6" fill="none"/>';
    if (outfit === 'suit') s += '<path d="M41 80l9 26 9-26z" fill="#d4e3f6"/><path d="M48.5 84h3l2 17-3.5 4.5-3.5-4.5z" fill="#8c2f3a"/><path d="M40 80l6 22M60 80l-6 22" stroke="#141c30" stroke-width="1.4"/>';
    if (outfit === 'shirt') s += '<path d="M39 79l11 9 11-9" stroke="#3a3a3a" stroke-width="1.6" fill="none"/><path d="M50 88v30" stroke="#2c2c2c"/>';
    s += `<ellipse cx="34.5" cy="50" rx="2.6" ry="4.2" fill="${skin}"/><ellipse cx="65.5" cy="50" rx="2.6" ry="4.2" fill="${skin}"/><ellipse cx="50" cy="48" rx="15.5" ry="19" fill="${skin}"/>`;
    if (F) {
      s += style === 1
        ? `<path d="M33 50c-3-19 5-30 17-30s20 11 17 30c-2-6-5-9-9-11-6 3-14 3-25 11z" fill="${hair}"/>`
        : `<path d="M33 52c-3-20 5-31 17-31s20 11 17 31c-3-10-8-17-17-17s-14 7-17 17z" fill="${hair}"/>`;
    } else {
      s += [
        `<path d="M34 46c-2-16 6-24 16-24s18 8 16 24c-2-7-6-11-16-11s-14 4-16 11z" fill="${hair}"/>`,
        `<path d="M34 45c-1-15 7-24 18-24 9 0 15 6 14 21-3-6-8-10-15-10-8 0-14 5-17 13z" fill="${hair}"/>`,
        `<path d="M35 42c0-12 7-18 15-18s15 6 15 18c-3-4-8-6-15-6s-12 2-15 6z" fill="${hair}"/>`,
      ][style];
    }
    s += `<path d="M40.5 43.2h6.5M53 43.2h6.5" stroke="${hair}" stroke-width="1.7" stroke-linecap="round"/><circle cx="43.8" cy="48" r="1.6" fill="#1d1d1d"/><circle cx="56.2" cy="48" r="1.6" fill="#1d1d1d"/><path d="M50 50.5v4.5h-2" stroke="${skinD}" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M45.5 59.5q4.5 2.6 9 0" stroke="${F ? '#c0616b' : '#99594a'}" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
    return (avatarCache[ck] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s));
  }

  // ---------------------------------------------------------------- UI kit
  const icon = (name, size = 22, cls = '') => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  function money(v, cc) {
    const c = DR.COUNTRIES[cc || state.country];
    const n = Number(v) || 0;
    return c.currency + (Number.isInteger(n) ? n.toLocaleString('en') : n.toFixed(2));
  }

  let toastTimer;
  DR.ui = {
    icon, avatar, money,
    navbar({ title = '', back = true, right = '', cls = '' } = {}) {
      return `<header class="navbar ${cls}">${back ? `<button class="icon-btn nav-back" data-back aria-label="Back">${icon('back', 24)}</button>` : '<span class="nav-sp"></span>'}<h1 class="nav-title">${title}</h1><div class="nav-right">${right}</div></header>`;
    },
    tabbar(active) {
      const t = (x) => x;
      const u = DR.store.user();
      const toPay = u ? state.orders.filter((o) => o.userId === u.id && o.status === 'to_pay').length : 0;
      const items = [['home', '/', 'home', 'Home'], ['categories', '/categories', 'grid', 'Categories'], ['nearby', '/nearby', 'pin', 'Nearby'], ['orders', '/orders', 'orders', 'Orders'], ['me', '/me', 'user', 'Me']];
      return `<nav class="tabbar" aria-label="Main">${items.map(([k, href, ic, label]) => k === 'nearby'
        ? `<a href="#${href}" class="tab tab-center ${active === k ? 'on' : ''}"><span class="tab-fab">${icon('pin', 26)}</span><span>${t(label)}</span></a>`
        : `<a href="#${href}" class="tab ${active === k ? 'on' : ''}">${icon(ic, 24)}${k === 'orders' && toPay ? `<i class="dot-badge">${toPay}</i>` : ''}<span>${t(label)}</span></a>`).join('')}</nav>`;
    },
    toast(msg, ms = 2400) {
      let el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
      el.textContent = DR.t ? DR.t(msg) : msg; el.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    },
    sheet({ title = '', html = '', mount, cls = '', full = false, onClose, persist = false } = {}) {
      const wrap = document.createElement('div');
      wrap.className = 'sheet-wrap' + (persist ? ' sheet-persist' : '');
      wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${full ? 'sheet-full' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">${title ? `<div class="sheet-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>` : '<div class="sheet-grip"></div>'}<div class="sheet-body"></div></div>`;
      document.body.appendChild(wrap);
      document.body.classList.add('noscroll');
      let closed = false;
      const api = {
        el: wrap.querySelector('.sheet'), body: wrap.querySelector('.sheet-body'), wrap,
        set(h) { api.body.innerHTML = h; DR.files.hydrate(api.body); },
        close() {
          if (closed) return; closed = true;
          wrap.classList.remove('open');
          setTimeout(() => { wrap.remove(); if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll'); }, 220);
          if (onClose) onClose();
        },
      };
      api.body.innerHTML = html;
      requestAnimationFrame(() => wrap.classList.add('open'));
      if (!persist) wrap.querySelector('.sheet-backdrop').addEventListener('click', api.close);
      wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !persist) api.close(); });
      if (mount) mount(api.el, api);
      DR.files.hydrate(wrap);
      const f = api.el.querySelector('[autofocus]'); if (f) f.focus();
      return api;
    },
    confirm({ title = 'Are you sure?', text = '', ok = 'Confirm', cancel = 'Cancel', danger = false } = {}) {
      return new Promise((resolve) => {
        let done = false;
        const sh = DR.ui.sheet({
          cls: 'sheet-dialog',
          html: `<div class="dialog"><h3>${title}</h3>${text ? `<p class="muted">${text}</p>` : ''}<div class="row gap10 mt16"><button class="btn btn-ghost grow" data-no>${cancel}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-yes>${ok}</button></div></div>`,
          onClose: () => { if (!done) resolve(false); },
          mount(el) {
            el.querySelector('[data-no]').onclick = () => { done = true; resolve(false); sh.close(); };
            el.querySelector('[data-yes]').onclick = () => { done = true; resolve(true); sh.close(); };
          },
        });
      });
    },
    empty(kind, text, cta = '') {
      const art = {
        box: '<path d="M30 48 60 36l30 12v34L60 94 30 82z" fill="#4a4a4d"/><path d="M60 60v34L30 82V48z" fill="#3b3b3e"/><path d="M30 48 60 60l30-12-30-12z" fill="#555558"/><path d="M22 40l30 12 8-12-30-12zM98 40 68 52l-8-12 30-12z" fill="#454548"/><rect x="72" y="14" width="22" height="15" rx="7.5" fill="#3d3d40"/><circle cx="78" cy="21.5" r="1.5" fill="#1c1c1e"/><circle cx="83" cy="21.5" r="1.5" fill="#1c1c1e"/><circle cx="88" cy="21.5" r="1.5" fill="#1c1c1e"/>',
        cart: '<ellipse cx="60" cy="98" rx="36" ry="4" fill="#2a2a2c"/><path d="M30 40h8l8 36h40l6-28H44" fill="none" stroke="#5a5a5d" stroke-width="5" stroke-linejoin="round"/><path d="M44 48h48l-6 28H48z" fill="#434346"/><circle cx="50" cy="88" r="6" fill="#4a4a4d"/><circle cx="82" cy="88" r="6" fill="#4a4a4d"/>',
        heart: '<ellipse cx="60" cy="98" rx="34" ry="5" fill="#2a2a2c"/><rect x="50" y="18" width="20" height="10" rx="2" fill="#5a5a5d"/><path d="M47 30h26v10c10 5 14 12 14 22v28c0 4-3 6-6 6H39c-3 0-6-2-6-6V62c0-10 4-17 14-22z" fill="#38383b"/><path d="M60 80s-13-8-13-17c0-4 3-7 7-7 3 0 5 2 6 4 1-2 3-4 6-4 4 0 7 3 7 7 0 9-13 17-13 17z" fill="#555558"/>',
        clipboard: '<ellipse cx="60" cy="100" rx="30" ry="4" fill="#2a2a2c"/><rect x="32" y="22" width="56" height="72" rx="6" fill="#39393c"/><rect x="38" y="30" width="44" height="58" rx="3" fill="#8a8a8d"/><rect x="50" y="16" width="20" height="10" rx="3" fill="#444447"/><path d="M46 44h28M46 54h28M48 64h22M52 74h14" stroke="#58585b" stroke-width="4" stroke-linecap="round"/>',
        chat: '<path d="M22 30h60a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H48l-16 12v-12H22a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z" fill="#3b3b3e"/><circle cx="38" cy="54" r="4" fill="#58585b"/><circle cx="52" cy="54" r="4" fill="#58585b"/><circle cx="66" cy="54" r="4" fill="#58585b"/>',
        search: '<circle cx="54" cy="52" r="24" fill="none" stroke="#4a4a4d" stroke-width="8"/><path d="m72 70 18 18" stroke="#4a4a4d" stroke-width="10" stroke-linecap="round"/>',
      }[kind] || '';
      return `<div class="empty"><svg viewBox="0 0 120 110" width="150" height="138" aria-hidden="true">${art}</svg><p>${text}</p>${cta}</div>`;
    },
    stars(v, size = 12) {
      let h = '';
      for (let i = 1; i <= 5; i++) h += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="star ${v >= i - 0.25 ? 'on' : ''}" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
      return `<span class="stars" aria-label="${v} / 5">${h}</span>`;
    },
    seg(options, active, name) {
      return `<div class="seg" role="tablist">${options.map(([v, l]) => `<button type="button" class="seg-btn ${String(v) === String(active) ? 'on' : ''}" data-${name}="${esc(v)}">${l}</button>`).join('')}</div>`;
    },
    statusPill(st) {
      const m = { to_pay: ['To pay', 'gold'], requested: ['Awaiting approval', 'gold'], upcoming: ['Upcoming', 'blue'], to_confirm: ['To confirm', 'purple'], to_review: ['To review', 'green'], completed: ['Completed', 'grey'], cancelled: ['Cancelled', 'grey'] }[st] || [st, 'grey'];
      return `<span class="tag tag-${m[1]}">${m[0]}</span>`;
    },
    field(label, inner, hint = '', req = false) {
      return `<label class="field"><span class="field-label">${label}${req ? ' <b class="brand">*</b>' : ''}</span>${inner}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
    },
    upload(name, file, { label = 'Upload file', accept = 'image/*,application/pdf', capture = '', secure = false } = {}) {
      const preview = file
        ? (file.image ? `<img data-file="${file.id}" alt="${esc(file.name)}">` : `<div class="upload-doc">${icon('doc', 28)}<span>${esc(file.name)}</span></div>`)
        : `<div class="upload-empty">${icon('upload', 26)}<span>${label}</span><small>JPG, PNG or PDF · max 4 MB</small></div>`;
      const lock = (file ? file.secure : secure) ? `<span class="upload-lock">${icon('lock', 11)} Encrypted</span>` : '';
      return `<label class="upload ${file ? 'has' : ''}" data-secure="${secure ? 1 : 0}"><input type="file" name="${name}" accept="${accept}" ${capture ? `capture="${capture}"` : ''} hidden>${preview}${lock}${file ? `<span class="upload-change">${icon('refresh', 14)} Replace</span>` : ''}</label>`;
    },
    // bind file inputs in a container: store {id,name,image,secure} into target object on change
    bindUploads(root, target, after) {
      root.querySelectorAll('input[type=file]').forEach((inp) => {
        if (inp.dataset.bound) return;
        inp.dataset.bound = 1;
        inp.addEventListener('change', async () => {
          const f = inp.files[0]; if (!f) return;
          const box = inp.closest('.upload');
          const secure = box && box.dataset.secure === '1';
          try {
            if (box) box.classList.add('loading');
            target[inp.name] = await DR.files.fromInput(f, 1100, { secure });
            if (box) {
              box.outerHTML = DR.ui.upload(inp.name, target[inp.name], { accept: inp.accept, capture: inp.getAttribute('capture') || '', secure });
              DR.files.hydrate(root);
              DR.ui.bindUploads(root, target, after);
            }
            if (after) after(inp.name);
          } catch (e) { if (box) box.classList.remove('loading'); DR.ui.toast(e.message || 'Upload failed'); }
        });
      });
    },
  };

  DR.notFound = (title = 'Page not found', text = 'The page you are looking for does not exist.') => ({
    title,
    html: `${DR.ui.navbar({ title })}${DR.ui.empty('search', `${esc(title)}<br><small class="muted">${esc(text)}</small>`, '<a class="btn btn-primary" href="#/">Go home</a>')}`,
  });

  // global click helpers
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-back]');
    if (b) { e.preventDefault(); DR.router.back(b.dataset.back || '/'); return; }
    const g = e.target.closest('[data-go]');
    if (g && !e.defaultPrevented) { e.preventDefault(); DR.router.go(g.dataset.go); }
  });

  // theme
  DR.applyTheme = function () {
    const t = state.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : state.theme;
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t === 'light' ? '#f4f4f6' : '#111111';
  };
})(window.DR);
