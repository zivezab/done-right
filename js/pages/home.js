/* Done Right — Home, Search, City picker, Directory (yellow pages) */
(function (DR) {
  'use strict';
  const { esc } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;
  let homeTab = 'featured';
  const SHORT = { 'deep-cleaning': 'Deep clean', 'swimming-instructor': 'Swimming', 'singing-coach': 'Singing', 'ai-expert': 'AI expert', 'house-repair': 'Repairs', 'appliance-repair': 'Appliance', 'computer-repair': 'Computer', 'pipe-unclogging': 'Unclog', locksmith: 'Locksmith' };

  const HOME_TABS = [
    { k: 'featured', title: 'Featured', sub: 'Top services' },
    { k: 'therapists', title: 'Therapists', sub: 'Massage & spa', groups: ['massage'] },
    { k: 'tutors', title: 'Tutors', sub: 'Tuition & lessons', groups: ['tuition', 'language'] },
    { k: 'coaches', title: 'Coaches', sub: 'Swim, sing & more', groups: ['sports', 'music'] },
    { k: 'tech', title: 'Tech pros', sub: 'Software & AI', groups: ['tech'] },
    { k: 'handymen', title: 'Handymen', sub: 'Repair & install', groups: ['repair', 'installation'] },
    { k: 'cleaners', title: 'Cleaners', sub: 'Home cleaning', groups: ['cleaning'] },
  ];

  function banners(cc) {
    const my = cc === 'MY';
    return [
      { t: 'Home massage & spa', s: 'Certified therapists at your door in 30 min', e: '💆‍♀️', e2: '🌿', bg: 'linear-gradient(120deg,#1d5c4d,#6fbf9b)', go: '/group/massage' },
      { t: 'Find a verified tutor', s: my ? 'UASA · SPM · STPM · IGCSE — home or online' : 'PSLE · O-Level · A-Level · IB — home or online', e: '📚', e2: '✏️', bg: 'linear-gradient(120deg,#33277a,#8c67e6)', go: '/group/tuition' },
      { t: 'Hire AI & ML experts', s: 'Vetted engineers, by the hour or project', e: '🤖', e2: '✨', bg: 'linear-gradient(120deg,#0e2c52,#1695b8)', go: '/group/tech' },
      { t: 'Swim & sing this weekend', s: 'Coaches with verified credentials near you', e: '🏊', e2: '🎤', bg: 'linear-gradient(120deg,#7a2c3a,#e0735c)', go: '/group/sports' },
    ];
  }

  function tabContent(tab) {
    const t = HOME_TABS.find((x) => x.k === tab) || HOME_TABS[0];
    if (!t.groups) {
      return DR.FEATURED_GROUPS.map((gid) => {
        const g = DR.GROUP[gid];
        return `<section class="card"><div class="card-h"><h2>${esc(g.name)}</h2><a class="more" href="#/group/${gid}">More ${icon('right', 14)}</a></div>
          <div class="svc-grid">${g.subs.slice(0, 6).map((s) => DR.cards.svcCard(s)).join('')}</div></section>`;
      }).join('');
    }
    const list = DR.data.providers().filter((p) => t.groups.includes(p.groupId)).sort((a, b) => DR.data.dist(a) - DR.data.dist(b)).slice(0, 8);
    return `<div class="plist">${list.map((p) => DR.cards.provider(p)).join('') || DR.ui.empty('box', 'No providers in this area yet')}</div>
      <div class="center mt12"><a class="btn btn-ghost" href="#/nearby?g=${t.groups[0]}">See all ${esc(t.title.toLowerCase())} near you ${icon('right', 14)}</a></div>`;
  }

  DR.page('/', () => {
    const cc = S().country;
    const C = DR.COUNTRIES[cc];
    const nearby = DR.data.providers().sort((a, b) => DR.data.dist(a) - DR.data.dist(b)).slice(0, 4);
    const b = banners(cc);
    const unread = Object.values(S().threads).reduce((a, t) => a + (t.unread || 0), 0);
    return {
      tab: 'home',
      cls: 'home',
      html: `
      <div class="topbar">
        <a class="loc" href="#/city">${icon('pin', 18)}<span class="ellipsis">${esc(S().area)}</span>${icon('right', 14)}</a>
        <span class="grow"></span>
        <a class="icon-btn" href="#/cart" aria-label="Cart">${icon('cart')}${S().cart.length ? `<i class="dot-badge">${S().cart.length}</i>` : ''}</a>
        <a class="icon-btn" href="#/messages" aria-label="Messages">${icon('chat')}${unread ? `<i class="dot-badge">${unread}</i>` : ''}</a>
      </div>
      <div class="pad"><a class="searchbar" href="#/search">${icon('search', 20, 'brand')}<span class="ellipsis">${DR.t('Search services, providers, shops')}</span>${icon('camera', 20)}</a></div>

      <div class="banner-wrap pad">
        <div class="banner-track" id="banner">${b.map((x) => `<a class="banner" href="#${x.go}" style="background:${x.bg}"><div class="banner-text"><h3>${x.t}</h3><p>${x.s}</p><span class="banner-cta">Book now ${icon('right', 14)}</span></div><div class="banner-art" aria-hidden="true"><span>${x.e}</span><span>${x.e2}</span></div></a>`).join('')}</div>
        <div class="banner-dots">${b.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <div class="guarantee-strip">
        <span>${icon('clock', 14)}Late? We compensate</span><span>${icon('refresh', 14)}Redo if unhappy</span><span>${icon('headset', 14)}24/7 support</span><span>${icon('shield', 14)}Fully protected</span>
      </div>

      <section class="card">
        <div class="cat-grid">${DR.HOME_GRID.map((gid) => { const g = DR.GROUP[gid]; return `<a class="cat-item" href="#/group/${gid}"><span class="cat-bubble" style="--h:${g.hue}">${g.emoji}</span><span>${esc(g.short)}</span></a>`; }).join('')}</div>
        <div class="cat-grid mini">${DR.HOME_MINI.map((sid) => { const s = DR.SUB[sid]; return `<a class="cat-item" href="#/service/${sid}"><span class="cat-mini">${s.emoji}</span><span class="ellipsis">${esc(SHORT[sid] || s.name)}</span></a>`; }).join('')}<a class="cat-item" href="#/directory"><span class="cat-mini">${icon('grid', 22)}</span><span>All ${DR.ALL_SUBS.length}+</span></a></div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Express</h2><span class="brand small">Fastest 30 min to your door</span></div>
        <div class="express">${DR.EXPRESS.map((sid) => { const s = DR.SUB[sid]; return `<a href="#/service/${sid}" class="cat-item"><span class="cat-mini">${s.emoji}</span><span class="ellipsis">${esc(SHORT[sid] || s.name)}</span></a>`; }).join('')}</div>
      </section>

      <div class="two-col pad">
        <a class="promo promo-nearby" href="#/nearby">
          <h3>Pros near you</h3><p class="muted small">Verified · protected · direct booking</p>
          <div class="promo-art" aria-hidden="true">🧑‍🔧👩‍🏫🧑‍💻</div>
          <div class="avatars">${nearby.map((p) => DR.cards.pimg(p, 0, 'av-sm')).join('')}</div>
        </a>
        <div class="col gap10">
          <a class="promo promo-small" href="#/group/beauty"><h3>💅 Manicure <span class="tag tag-pink">Many styles</span></h3><div class="promo-thumbs">${DR.ui.thumb(DR.SUB.manicure)}${DR.ui.thumb(DR.SUB.eyelash)}</div></a>
          <a class="promo promo-small" href="#/group/tuition"><h3>🎓 Tutors <span class="tag tag-gold">${cc === 'SG' ? 'PSLE' : 'SPM'} ready</span></h3><div class="promo-thumbs">${DR.ui.thumb(DR.SUB['primary-tuition'])}${DR.ui.thumb(DR.SUB['coding-kids'])}</div></a>
        </div>
      </div>

      <nav class="home-tabs" id="homeTabs">${HOME_TABS.map((t) => `<button class="home-tab ${homeTab === t.k ? 'on' : ''}" data-tab="${t.k}"><b>${t.title}</b><small>${t.sub}</small></button>`).join('')}</nav>
      <div id="homeTabBody">${tabContent(homeTab)}</div>

      <div class="trust">
        <div>${icon('verified', 22)}<b>100%</b><small>ID-verified pros</small></div>
        <div>${icon('globe', 22)}<b>SG & MY</b><small>${esc(C.name)} coverage</small></div>
        <div>${icon('grid', 22)}<b>${DR.ALL_SUBS.length}+</b><small>Service types</small></div>
        <div>${icon('headset', 22)}<b>24 hrs</b><small>Support</small></div>
      </div>
      <p class="foot-note">Done Right · Book with confidence in Singapore & Malaysia</p>`,
      mount(el) {
        const track = el.querySelector('#banner');
        const dots = el.querySelectorAll('.banner-dots i');
        let i = 0;
        const timer = setInterval(() => { i = (i + 1) % dots.length; track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' }); }, 4500);
        DR.onLeave(() => clearInterval(timer));
        track.addEventListener('scroll', DR.u.debounce(() => { i = Math.round(track.scrollLeft / track.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, 60));
        el.querySelector('#homeTabs').addEventListener('click', (e) => {
          const b = e.target.closest('[data-tab]'); if (!b) return;
          homeTab = b.dataset.tab;
          el.querySelectorAll('.home-tab').forEach((x) => x.classList.toggle('on', x === b));
          el.querySelector('#homeTabBody').innerHTML = tabContent(homeTab);
          b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Search
  const HOT_SEARCH = ['Aircon servicing', 'Tuition', 'Swimming', 'Massage', 'AI expert', 'Singing', 'Movers', 'Deep cleaning', 'Piano', 'Plumber'];
  function results(q) {
    if (!q.trim()) {
      return `${S().searches.length ? `<div class="pad mt12"><div class="row between"><h3 class="h3">Recent</h3><button class="link muted small" id="clearRecent">${icon('trash', 14)} Clear</button></div><div class="chips mt8">${S().searches.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>` : ''}
        <div class="pad mt16"><h3 class="h3">Popular in ${esc(DR.COUNTRIES[S().country].name)}</h3><div class="chips mt8">${HOT_SEARCH.map((x, i) => `<button class="chip" data-q="${esc(x)}">${i < 3 ? '🔥 ' : ''}${esc(x)}</button>`).join('')}</div></div>
        <div class="pad mt16"><a class="btn btn-ghost btn-block" href="#/directory">${icon('grid', 16)} Browse the full directory</a></div>`;
    }
    const r = DR.data.search(q);
    if (!r.subs.length && !r.providers.length) return DR.ui.empty('search', `No results for “${esc(q)}”`, '<a class="btn btn-ghost" href="#/directory">Browse all categories</a>');
    return `${r.subs.length ? `<section class="card"><div class="card-h"><h2>Services</h2><span class="muted small">${r.subs.length}</span></div>${r.subs.slice(0, 12).map((s) => DR.cards.svcRow(s)).join('')}</section>` : ''}
      ${r.providers.length ? `<div class="pad mt12"><h3 class="h3">Providers near you</h3></div><div class="plist">${r.providers.slice(0, 20).map((p) => DR.cards.provider(p)).join('')}</div>` : ''}`;
  }
  DR.page('/search', ({ query }) => {
    const q = query.q || '';
    return {
      title: 'Search',
      html: `<header class="navbar navbar-search"><button class="icon-btn" data-back aria-label="Back">${icon('back', 24)}</button>
        <form class="searchbar grow" id="sform" role="search">${icon('search', 18, 'brand')}<input id="sq" type="search" value="${esc(q)}" placeholder="Try “swimming coach” or “ML engineer”" autocomplete="off" enterkeyhint="search"></form>
        <button class="btn btn-primary btn-sm" form="sform">Search</button></header>
        <div id="sres">${results(q)}</div>`,
      mount(el) {
        const input = el.querySelector('#sq');
        if (!q) input.focus();
        const run = (val, commit) => {
          el.querySelector('#sres').innerHTML = results(val);
          if (commit && val.trim()) {
            DR.store.update((s) => { s.searches = [val.trim(), ...s.searches.filter((x) => x !== val.trim())].slice(0, 10); }, { render: false });
            history.replaceState(null, '', '#/search?q=' + encodeURIComponent(val));
          }
        };
        input.addEventListener('input', DR.u.debounce(() => run(input.value), 250));
        el.querySelector('#sform').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); run(input.value, true); });
        el.addEventListener('click', (e) => {
          const c = e.target.closest('[data-q]');
          if (c) { input.value = c.dataset.q; run(c.dataset.q, true); }
          if (e.target.closest('#clearRecent')) { DR.store.update((s) => { s.searches = []; }, { render: false }); run(''); }
        });
      },
    };
  });

  // ---------------------------------------------------------------- City / area picker
  DR.page('/city', () => {
    const s = S();
    const cc = s.country;
    const areas = DR.AREAS[cc];
    const letters = [...new Set(areas.map((a) => a.n[0]))].sort();
    const byLetter = letters.map((L) => [L, areas.filter((a) => a.n[0] === L).sort((a, b) => a.n.localeCompare(b.n))]);
    return {
      title: 'Choose location',
      html: `${DR.ui.navbar({ title: 'Choose location' })}
      <div class="pad">
        ${DR.ui.seg([['SG', '🇸🇬 Singapore'], ['MY', '🇲🇾 Malaysia']], cc, 'cc')}
        <div class="searchbar searchbar-outline mt12">${icon('search', 18)}<input id="cq" type="search" placeholder="Search area, town or city" autocomplete="off"></div>
        <div class="row between mt16"><div><div class="muted xs">Current location</div><b class="h2">${esc(s.area)}</b> <span class="muted small">${esc(DR.area(s.area).r)}</span></div>
        <button class="icon-btn brand" id="locate" aria-label="Use my location">${icon('target', 24)}</button></div>
      </div>
      <div class="divider"></div>
      <div class="pad" id="popular"><div class="muted small mb8">Popular</div><div class="area-grid">${DR.POPULAR_AREAS[cc].map((n) => `<button class="area-btn ${n === s.area ? 'on' : ''}" data-area="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
      <div class="divider"></div>
      <div class="az-list" id="az">${byLetter.map(([L, list]) => `<div class="az-group" id="az-${L}"><div class="az-h">${L}</div>${list.map((a) => `<button class="az-row" data-area="${esc(a.n)}" data-name="${esc(a.n.toLowerCase())} ${esc(a.r.toLowerCase())}"><span>${esc(a.n)}</span><span class="muted small">${esc(a.r)}</span></button>`).join('')}</div>`).join('')}</div>
      <nav class="az-index" aria-label="Jump to letter">${letters.map((L) => `<a href="#az-${L}" data-jump="${L}">${L}</a>`).join('')}</nav>`,
      mount(el) {
        const choose = (name, country = S().country) => {
          DR.store.update((st) => { st.country = country; st.area = name; st.geo = null; }, { render: false });
          DR.ui.toast(`Location set to ${name}`);
          DR.router.back('/');
        };
        el.addEventListener('click', (e) => {
          const a = e.target.closest('[data-area]'); if (a) return choose(a.dataset.area);
          const c = e.target.closest('[data-cc]');
          if (c && c.dataset.cc !== S().country) { DR.store.update((st) => { st.country = c.dataset.cc; st.area = DR.POPULAR_AREAS[c.dataset.cc][0]; st.geo = null; }); }
          const j = e.target.closest('[data-jump]');
          if (j) { e.preventDefault(); document.getElementById('az-' + j.dataset.jump).scrollIntoView({ behavior: 'smooth' }); }
        });
        el.querySelector('#cq').addEventListener('input', (e) => {
          const v = e.target.value.toLowerCase().trim();
          el.querySelector('#popular').hidden = !!v;
          el.querySelectorAll('.az-row').forEach((r) => { r.hidden = v && !r.dataset.name.includes(v); });
          el.querySelectorAll('.az-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.az-row')].some((r) => !r.hidden); });
        });
        el.querySelector('#locate').addEventListener('click', () => {
          if (!navigator.geolocation) return DR.ui.toast('Location is not available on this device');
          DR.ui.toast('Finding your location…');
          navigator.geolocation.getCurrentPosition((pos) => {
            const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            let best = null; let bestD = Infinity; let bestCc = 'SG';
            ['SG', 'MY'].forEach((k) => DR.AREAS[k].forEach((a) => { const d = Math.hypot(a.lat - me.lat, a.lng - me.lng); if (d < bestD) { bestD = d; best = a; bestCc = k; } }));
            if (bestD > 3) return DR.ui.toast('Done Right is available in Singapore and Malaysia only');
            DR.store.update((st) => { st.country = bestCc; st.area = best.n; st.geo = { lat: me.lat, lng: me.lng, country: bestCc }; }, { render: false });
            DR.ui.toast(`You're near ${best.n}`);
            DR.router.back('/');
          }, () => DR.ui.toast('Location permission denied'), { timeout: 8000 });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Directory (yellow pages)
  let dirView = 'cat';
  DR.page('/directory', () => {
    const catHTML = DR.GROUPS.map((g) => `<section class="dir-group" data-g="${g.id}"><div class="dir-h"><span>${g.emoji} ${esc(g.name)}</span><a class="more" href="#/group/${g.id}">View ${icon('right', 13)}</a></div>
      <div class="icon-grid">${g.subs.map((s) => `<a class="icon-cell" href="#/service/${s.id}" data-name="${esc((s.name + ' ' + g.name).toLowerCase())}"><span class="icon-emoji">${s.emoji}</span><span class="icon-label">${esc(s.name)}</span></a>`).join('')}</div></section>`).join('');
    const sorted = DR.ALL_SUBS.slice().sort((a, b) => a.name.localeCompare(b.name));
    const letters = [...new Set(sorted.map((s) => s.name[0].toUpperCase()))];
    const azHTML = letters.map((L) => `<div class="az-group dir-group" id="dz-${L}"><div class="az-h">${L}</div>${sorted.filter((s) => s.name[0].toUpperCase() === L).map((s) => `<a class="az-row" href="#/service/${s.id}" data-name="${esc((s.name + ' ' + DR.GROUP[s.groupId].name).toLowerCase())}"><span>${s.emoji} ${esc(s.name)}</span><span class="muted xs">${esc(DR.GROUP[s.groupId].short)}</span></a>`).join('')}</div>`).join('');
    return {
      title: 'All categories',
      tab: 'categories',
      html: `${DR.ui.navbar({ title: `${DR.t('All categories')} · ${DR.ALL_SUBS.length}` })}
      <div class="sticky-sub pad">
        <div class="searchbar searchbar-outline">${icon('search', 18)}<input id="dq" type="search" placeholder="Filter ${DR.ALL_SUBS.length} services…" autocomplete="off"></div>
        <div class="mt8">${DR.ui.seg([['cat', 'By category'], ['az', 'A – Z']], dirView, 'view')}</div>
      </div>
      <div id="dirBody">${dirView === 'cat' ? catHTML : azHTML}</div>
      ${dirView === 'az' ? `<nav class="az-index" aria-label="Jump to letter">${letters.map((L) => `<a href="#dz-${L}" data-jump="${L}">${L}</a>`).join('')}</nav>` : ''}
      <div class="pad mt16 mb16"><div class="card-lite center"><p class="small muted">Can't find your service?</p><a class="btn btn-primary btn-sm mt8" href="#/pro">List your skills on Done Right</a></div></div>`,
      mount(el) {
        el.addEventListener('click', (e) => {
          const v = e.target.closest('[data-view]'); if (v) { dirView = v.dataset.view; DR.router.refresh(); }
          const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); document.getElementById('dz-' + j.dataset.jump).scrollIntoView({ behavior: 'smooth' }); }
        });
        el.querySelector('#dq').addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase().trim();
          el.querySelectorAll('[data-name]').forEach((c) => { c.hidden = q && !c.dataset.name.includes(q); });
          el.querySelectorAll('.dir-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('[data-name]')].some((c) => !c.hidden); });
        });
      },
    };
  });
})(window.DR);
