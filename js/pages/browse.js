/* Done Right — Categories, Group listing, Service detail, Nearby (map & list) */
(function (DR) {
  'use strict';
  const { esc } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  // ---------------------------------------------------------------- Categories (sidebar layout)
  let sideScroll = 0;
  DR.page('/categories', ({ query }) => {
    const active = query.g && DR.GROUP[query.g] ? query.g : 'hot';
    const subs = active === 'hot' ? DR.HOT.map((id) => DR.SUB[id]) : DR.GROUP[active].subs;
    const tiles = active === 'hot' ? ['tui-na', 'daily-cleaning', 'house-repair', 'manicure', 'swimming-instructor', 'ai-expert', 'piano', 'primary-tuition'].map((id) => DR.SUB[id]) : subs;
    return {
      tab: 'categories', title: 'Categories', cls: 'cat-page',
      html: `<div class="topbar">
          <a class="searchbar grow" href="#/search">${icon('search', 18, 'brand')}<span class="ellipsis">Search services, providers, shops</span></a>
          <a class="pill-btn" href="#/directory">All categories ${icon('down', 14, 'brand')}</a>
        </div>
        <div class="cat-layout">
          <aside class="cat-side" id="side">
            <button class="side-item ${active === 'hot' ? 'on' : ''}" data-g="hot">Hot 🔥</button>
            ${DR.GROUPS.map((g) => `<button class="side-item ${active === g.id ? 'on' : ''}" data-g="${g.id}">${esc(g.short)}</button>`).join('')}
          </aside>
          <section class="cat-main" id="catMain">
            ${active !== 'hot' ? `<a class="group-banner" href="#/group/${active}" style="--h:${DR.GROUP[active].hue}"><span>${DR.GROUP[active].emoji}</span><div><b>${esc(DR.GROUP[active].name)}</b><small>${esc(DR.GROUP[active].blurb)}</small></div>${icon('right', 16)}</a>` : ''}
            <div class="sub-tiles">${tiles.map((s) => `<a class="sub-tile" href="#/service/${s.id}"><span>${s.emoji}</span><small class="clamp2">${esc(s.name.replace(/\s*\(.*\)/, ''))}</small></a>`).join('')}</div>
            <div class="svc-rows">${subs.map((s) => DR.cards.svcRow(s)).join('')}</div>
          </section>
        </div>`,
      mount(el) {
        const side = el.querySelector('#side');
        side.scrollTop = sideScroll;
        side.addEventListener('click', (e) => {
          const b = e.target.closest('[data-g]'); if (!b) return;
          sideScroll = side.scrollTop;
          DR.router.go('/categories' + (b.dataset.g === 'hot' ? '' : '?g=' + b.dataset.g), { replace: true });
        });
      },
    };
  });

  // ---------------------------------------------------------------- Group listing
  let groupSort = 'recommended';
  let groupGrid = false;
  const SORTS = [['recommended', 'Recommended'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['popular', 'Most booked']];
  DR.page('/group/:gid', ({ params }) => {
    const g = DR.GROUP[params.gid];
    if (!g) return DR.notFound('Category not found');
    let subs = g.subs.slice();
    if (groupSort === 'price-asc') subs.sort((a, b) => a.price - b.price);
    if (groupSort === 'price-desc') subs.sort((a, b) => b.price - a.price);
    if (groupSort === 'popular') subs.sort((a, b) => DR.data.sold(b) - DR.data.sold(a));
    const pros = DR.data.byGroup(g.id).sort((a, b) => (b.skill || 0) * 2 - DR.data.dist(b) / 5 - ((a.skill || 0) * 2 - DR.data.dist(a) / 5)).slice(0, 5);
    return {
      title: g.name, seo: DR.seo.group(g, S().country),
      html: `${DR.ui.navbar({ title: g.name, right: `<a class="icon-btn" href="#/cart" aria-label="Cart">${icon('cart')}</a><a class="icon-btn" href="#/search" aria-label="Search">${icon('search')}</a>` })}
        <div class="sub-strip">${g.subs.map((s) => `<a class="sub-chip" href="#/service/${s.id}"><span>${s.emoji}</span><small class="ellipsis">${esc(s.name.replace(/\s*\(.*\)/, ''))}</small></a>`).join('')}</div>
        <div class="sortbar">
          <button class="sort-btn on" id="sortBtn">${esc(SORTS.find((x) => x[0] === groupSort)[1])} ${icon('down', 14)}</button>
          <a class="sort-btn" href="#/nearby?g=${g.id}">${icon('users', 16)} Pros near me</a>
          <button class="icon-btn" id="gridBtn" aria-label="Toggle layout">${icon(groupGrid ? 'list' : 'grid', 20)}</button>
        </div>
        <div class="${groupGrid ? 'svc-grid pad mt12' : 'svc-rows'}">${subs.map((s) => (groupGrid ? DR.cards.svcCard(s) : DR.cards.svcRow(s, { desc: true }))).join('')}</div>
        ${pros.length ? `<div class="pad mt16 row between"><h3 class="h3">Top-rated pros</h3><a class="more" href="#/nearby?g=${g.id}">See all ${icon('right', 13)}</a></div><div class="plist">${pros.map((p) => DR.cards.provider(p)).join('')}</div>` : ''}
        <div class="pad mt16 mb16"><div class="card-lite"><b>${g.emoji} Are you a ${esc((g.role || 'professional').toLowerCase())}?</b><p class="muted small">Join Done Right, set your own hours and get booked by customers near you.</p><a class="btn btn-primary btn-sm mt8" href="#/pro">Become a provider</a></div></div>`,
      mount(el) {
        el.querySelector('#gridBtn').onclick = () => { groupGrid = !groupGrid; DR.router.refresh(); };
        el.querySelector('#sortBtn').onclick = () => {
          const sh = DR.ui.sheet({
            title: 'Sort by',
            html: `<div class="list">${SORTS.map(([k, l]) => `<button class="list-item" data-sort="${k}"><span>${l}</span>${k === groupSort ? icon('check', 18, 'brand') : ''}</button>`).join('')}</div>`,
            mount(s) { s.addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; groupSort = b.dataset.sort; sh.close(); DR.router.refresh(); }); },
          });
        };
      },
    };
  });

  // ---------------------------------------------------------------- Service detail
  function bestMatch(list) {
    return list.map((p) => ({ p, n: DR.avail.next(p) })).filter((x) => x.n).sort((a, b) => (a.n.day * 8 + DR.data.dist(a.p)) - (b.n.day * 8 + DR.data.dist(b.p)))[0];
  }
  DR.page('/service/:sid', ({ params }) => {
    const sub = DR.SUB[params.sid];
    if (!sub) return DR.notFound('Service not found');
    const g = DR.GROUP[sub.groupId];
    const cc = S().country;
    const price = DR.data.catalogPrice(sub);
    const pros = DR.data.bySub(sub.id);
    const followed = S().follows.services.includes(sub.id);
    const inCart = S().cart.some((c) => c.subId === sub.id && !c.providerId);
    const proRow = (p) => {
      const svc = p.services.find((s) => s.subId === sub.id);
      const n = DR.avail.next(p, svc.duration);
      return `<div class="pro-row" data-go="/provider/${p.id}">${DR.cards.pimg(p, 0, 'av-md')}<div class="grow minw0">
          <div class="row gap6 nowrap"><b class="ellipsis" data-no-i18n>${esc(p.name)}</b>${DR.cards.rating(p)}</div>
          <div class="muted xs ellipsis"><span ${p.shop ? 'data-no-i18n' : ''}>${esc(p.shop || 'Independent pro')}</span> · ${DR.data.distLabel(p)}</div>
          <div class="xs ${n && n.day === 0 ? 'brand' : 'muted'}">${n ? `${icon('clock', 12)} ${DR.u.relDay(n.key)} ${n.time}` : 'Fully booked'}</div>
        </div><div class="right"><div class="price">${DR.cards.priceHTML(svc.price, svc.unit, p.country)}</div><a class="btn btn-primary btn-xs mt4" href="#/book/${p.id}?sub=${sub.id}">Book</a></div></div>`;
    };
    const quoteBased = DR.isQuoteBased(sub);
    const nearCount = pros.filter((p) => DR.data.dist(p) <= 30).length;
    const onWaitlist = S().waitlist.some((w) => w.subId === sub.id && w.area === S().area);
    return {
      title: sub.name, bar: true, seo: DR.seo.service(sub, cc),
      html: `${DR.ui.navbar({ title: '', cls: 'navbar-float', right: `<button class="icon-btn glass" id="share" aria-label="Share">${icon('share')}</button><a class="icon-btn glass" href="#/cart" aria-label="Cart">${icon('cart')}</a>` })}
        <div class="svc-hero">${DR.ui.thumb(sub, { cls: 'thumb-hero', badge: `${g.emoji} ${g.name}` })}</div>
        <section class="card svc-info">
          <div class="row gap6"><span class="tag tag-select">Select</span><span class="tag tag-gold">${esc(g.arrival)}</span>${g.mode === 'both' ? '<span class="tag tag-blue">Online available</span>' : ''}</div>
          <h1 class="h1 mt8">${esc(sub.name)}</h1>
          <div class="row between mt8"><span class="price price-lg">${price === 0 ? '<b>Free</b> <small>quote on visit</small>' : `<small>from</small> <b>${money(price)}</b><small>/${esc(sub.unit)}</small>`}</span><span class="muted small">${DR.u.compact(DR.data.sold(sub))} booked · ${DR.data.subRating(sub)}% positive</span></div>
          <p class="muted small mt8"><span>${esc(g.blurb)}</span> <span>Prices vary by provider; travel fee may apply beyond 3 km.</span></p>
          <div class="g-chips mt12"><span>${icon('check', 14)}On-time or we pay</span><span>${icon('check', 14)}No hidden fees</span><span>${icon('check', 14)}Verified pros</span><span>${icon('check', 14)}Redo if unhappy</span></div>
        </section>
        <section class="card">
          <div class="card-h"><h2>Choose a pro</h2><span class="muted small">${pros.length} in ${esc(DR.COUNTRIES[cc].name)}</span></div>
          ${pros.length ? pros.slice(0, 6).map(proRow).join('') + (pros.length > 6 ? `<a class="btn btn-ghost btn-block mt8" href="#/nearby?sub=${sub.id}">See all ${pros.length} providers</a>` : '') : `<div class="center pad-v"><p class="muted">No providers offer this in your area yet.</p><a class="btn btn-primary btn-sm mt8" href="#/pro">Offer this service</a></div>`}
          ${nearCount < 2 ? `<div class="waitlist mt12">${icon('bell', 18, 'brand')}<span class="grow small">${nearCount ? 'Only one pro' : 'No pros'} within 30 km of <b data-no-i18n>${esc(S().area)}</b>. <span>${onWaitlist ? 'You are on the waitlist — we will notify you.' : 'Join the waitlist and we will notify you when one joins.'}</span></span>${onWaitlist ? '' : '<button class="btn btn-ghost btn-xs" id="waitlist">Notify me</button>'}</div>` : ''}
        </section>
        <a class="card quote-cta ${quoteBased ? 'quote-cta-strong' : ''}" href="#/quote/new?sub=${sub.id}">${icon('quote', 22)}<span class="grow"><b>${quoteBased ? ('Custom job? Get quotes from up to 5 pros') : ('Need something custom?')}</b><br><small class="muted">Describe the job, compare offers, accept the best one — free.</small></span>${icon('right', 16)}</a>
        <section class="card"><div class="card-h"><h2>What's included</h2></div><ul class="checks">${g.includes.map((x) => `<li>${icon('checkCircle', 18, 'green')}${esc(x)}</li>`).join('')}</ul></section>
        <section class="card"><div class="card-h"><h2>How it works</h2></div>
          <ol class="steps">${[['Pick a pro & time', 'Compare verified profiles, credentials and live availability.'], ['Pay securely', 'Your payment is held by Done Right until the job is done.'], ['Get it done right', 'Your pro arrives on time — or joins you online.'], ['Confirm & review', 'Release payment and help the community with a review.']].map(([t, d], i) => `<li><span class="step-n">${i + 1}</span><div><b>${t}</b><p class="muted small">${d}</p></div></li>`).join('')}</ol>
        </section>
        <section class="card"><div class="card-h"><h2>FAQ</h2></div>
          ${[['Can I cancel?', 'Free cancellation up to 24 hours before your appointment. Later cancellations may incur a fee of up to 50% to compensate the provider.'], ['How are providers verified?', `Every provider completes identity verification (${DR.COUNTRIES[cc].idDocs.slice(0, 2).join(' / ')}). Certificates, education and work history are reviewed by our Trust & Safety team before a “Verified” badge is shown.`], ['What if something goes wrong?', 'Report an issue before confirming completion. We will arrange a redo or refund under the Done Right Guarantee.']].map(([q, a]) => `<details class="faq"><summary>${q}${icon('down', 16)}</summary><p class="muted small">${a}</p></details>`).join('')}
        </section>
        <div class="bottom-bar">
          <button class="bb-icon ${followed ? 'brand' : ''}" id="fav">${icon('heart', 22)}<span>${followed ? 'Saved' : 'Save'}</span></button>
          <button class="bb-icon ${inCart ? 'brand' : ''}" id="cart">${icon('cart', 22)}<span>${inCart ? 'In cart' : 'Cart'}</span></button>
          ${quoteBased ? `<a class="btn btn-primary grow" href="#/quote/new?sub=${sub.id}">Request quotes</a>` : `<button class="btn btn-primary grow" id="bookNow" ${pros.length ? '' : 'disabled'}>Book best match</button>`}
        </div>`,
      mount(el) {
        el.querySelector('#fav').onclick = () => DR.signInFirst('Sign in to save services') && DR.store.update((s) => { s.follows.services = followed ? s.follows.services.filter((x) => x !== sub.id) : [sub.id, ...s.follows.services]; });
        el.querySelector('#cart').onclick = () => {
          if (inCart) return DR.router.go('/cart');
          DR.store.update((s) => { s.cart.unshift({ id: DR.u.uid('c'), subId: sub.id, providerId: null, addedAt: Date.now() }); });
          DR.ui.toast('Added to cart');
        };
        el.querySelector('#share').onclick = () => DR.share(sub.name, `Book ${sub.name} on Done Right`);
        const wl = el.querySelector('#waitlist');
        if (wl) wl.onclick = () => { DR.store.update((s) => { s.waitlist.push({ subId: sub.id, area: s.area, country: s.country, ts: Date.now() }); }); DR.ui.toast('Added to waitlist'); };
        const bn = el.querySelector('#bookNow');
        if (bn) bn.onclick = () => {
          const m = bestMatch(pros);
          if (!m) return DR.ui.toast('All providers are fully booked — try another day');
          DR.ui.toast(`Matched with ${m.p.name}`);
          DR.router.go(`/book/${m.p.id}?sub=${sub.id}&date=${m.n.key}`);
        };
      },
    };
  });

  DR.share = (title, text) => {
    const url = location.href;
    if (navigator.share) navigator.share({ title, text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => DR.ui.toast('Link copied'));
    else DR.ui.toast(url);
  };

  // ---------------------------------------------------------------- Nearby
  let nearView = 'list';
  const PAGE = 20;
  const blankFilter = () => ({ sort: 'recommended', gender: '', distance: 30, ignoreDist: false, serves: '', ageMax: 0, minSkill: 0, idOnly: false, certOnly: false, bgOnly: false, langs: [], avail: '', flags: [], q: '', subs: [] });
  let nf = blankFilter();
  const NSORTS = [['recommended', 'Recommended'], ['distance', 'Nearest'], ['soonest', 'Soonest available'], ['rating', 'Top rated'], ['price', 'Lowest price'], ['jobs', 'Most jobs']];

  function filterCount() {
    const d = blankFilter();
    return ['gender', 'serves', 'ageMax', 'minSkill', 'idOnly', 'certOnly', 'bgOnly', 'avail', 'q'].filter((k) => nf[k] && nf[k] !== d[k]).length + (nf.distance !== 30 || nf.ignoreDist ? 1 : 0) + nf.langs.length + nf.flags.length + nf.subs.length;
  }

  function nearbyList(g, sub) {
    let list = DR.data.providers();
    if (g && g !== 'all') list = list.filter((p) => p.groupId === g || p.subs.some((s) => DR.SUB[s] && DR.SUB[s].groupId === g));
    if (sub) list = list.filter((p) => p.services.some((s) => s.subId === sub));
    if (nf.subs.length) list = list.filter((p) => p.services.some((s) => nf.subs.includes(s.subId)));
    if (nf.flags.includes('instant')) list = list.filter((p) => DR.policy(p).mode === 'instant');
    if (nf.flags.includes('licensed')) list = list.filter((p) => p.verified.licensed);
    if (nf.gender) list = list.filter((p) => p.gender === nf.gender);
    if (nf.serves) list = list.filter((p) => p.serves === 'all' || p.serves === nf.serves);
    if (nf.ageMax) list = list.filter((p) => p.age && p.age <= nf.ageMax);
    if (nf.minSkill) list = list.filter((p) => (p.skill || 0) >= nf.minSkill);
    if (nf.idOnly) list = list.filter((p) => p.verified.identity);
    if (nf.certOnly) list = list.filter((p) => p.verified.certs);
    if (nf.bgOnly) list = list.filter((p) => p.verified.background);
    if (nf.langs.length) list = list.filter((p) => nf.langs.every((l) => p.languages.includes(l)));
    if (nf.flags.includes('new')) list = list.filter((p) => p.isNew);
    if (nf.flags.includes('coupon')) list = list.filter((p) => p.coupon);
    if (nf.flags.includes('repeat')) list = list.filter((p) => p.repeat >= 30);
    if (nf.flags.includes('online')) list = list.filter((p) => DR.data.mode(p) === 'both');
    if (nf.flags.includes('business')) list = list.filter((p) => p.verified.business);
    if (nf.q) { const q = nf.q.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.shop || '').toLowerCase().includes(q)); }
    if (nf.avail) {
      const today = new Date();
      const keys = nf.avail === 'today' ? [0] : nf.avail === 'tomorrow' ? [1] : [0, 1, 2, 3, 4, 5, 6].filter((i) => [0, 6].includes(DR.u.addDays(today, i).getDay()));
      list = list.filter((p) => keys.some((i) => DR.avail.count(p, DR.u.dateKey(DR.u.addDays(today, i))) > 0));
    }
    let relaxed = false;
    if (!nf.ignoreDist) {
      const within = list.filter((p) => DR.data.dist(p) <= nf.distance);
      if (!within.length && list.length) relaxed = true; else list = within;
    }
    const score = (p) => (p.skill || 4) * 2 + p.positive / 50 - DR.data.dist(p) / 4 + (p.activeToday ? 1 : 0) + (p.isUser ? 1.5 : 0);
    const nextScore = (p) => { const n = DR.avail.next(p); return n ? n.day * 1440 + DR.u.toMin(n.time) : 1e9; };
    const sorters = {
      recommended: (a, b) => score(b) - score(a), distance: (a, b) => DR.data.dist(a) - DR.data.dist(b), rating: (a, b) => (b.skill || 0) - (a.skill || 0) || b.reviews - a.reviews,
      price: (a, b) => DR.data.minPrice(a) - DR.data.minPrice(b), jobs: (a, b) => b.jobs - a.jobs, soonest: (a, b) => nextScore(a) - nextScore(b),
    };
    list.sort(sorters[nf.sort] || sorters.recommended);
    return { list, relaxed };
  }

  function filterSheet(g) {
    const groupSubs = g && g !== 'all' ? DR.GROUP[g].subs : [];
    const draft = JSON.parse(JSON.stringify(nf));
    const chip = (attr, val, label, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-${attr}="${esc(val)}">${label}</button>`;
    const body = () => `<div class="filter">
      ${groupSubs.length ? `<section><h4>Service type</h4><div class="chips">${groupSubs.map((s) => chip('sub', s.id, esc(s.name.replace(/\s*\(.*\)/, '')), draft.subs.includes(s.id))).join('')}</div></section>` : ''}
      <section><h4>Distance (≤ ${draft.distance} km)</h4><input type="range" min="1" max="50" value="${draft.distance}" id="fDist" class="range">
        <label class="check mt8"><input type="checkbox" id="fIgnore" ${draft.ignoreDist ? 'checked' : ''}><span>Show providers beyond this distance too</span></label></section>
      <section><h4>Provider gender</h4><div class="chips chips-3">${chip('gender', '', 'Any', !draft.gender)}${chip('gender', 'F', 'Female', draft.gender === 'F')}${chip('gender', 'M', 'Male', draft.gender === 'M')}</div></section>
      <section><h4>Serves customers</h4><div class="chips chips-3">${chip('serves', '', 'Everyone', !draft.serves)}${chip('serves', 'female', 'Women', draft.serves === 'female')}${chip('serves', 'male', 'Men', draft.serves === 'male')}</div></section>
      <section><h4>Availability</h4><div class="chips chips-3">${chip('avail', 'today', 'Today', draft.avail === 'today')}${chip('avail', 'tomorrow', 'Tomorrow', draft.avail === 'tomorrow')}${chip('avail', 'weekend', 'This weekend', draft.avail === 'weekend')}</div></section>
      <section><h4>Provider age</h4><div class="chips chips-3">${[30, 40, 50].map((a) => chip('age', a, `≤ ${a}`, draft.ageMax === a)).join('')}</div></section>
      <section><h4>Skill rating (≥ ${draft.minSkill || 'any'}${draft.minSkill ? ' ★' : ''})</h4><div class="chips chips-3">${[0, 4, 4.5].map((v) => chip('skill', v, v ? `≥ ${v} ★` : 'Any', draft.minSkill === v)).join('')}</div></section>
      <section><h4>Trust & verification <span class="tag tag-green">Verified</span></h4><div class="chips chips-3">${chip('trust', 'idOnly', 'ID verified', draft.idOnly)}${chip('trust', 'certOnly', 'Certified', draft.certOnly)}${chip('trust', 'bgOnly', 'Background check', draft.bgOnly)}</div></section>
      <section><h4>Personal filters</h4><div class="chips chips-3">${[['instant', 'Instant book'], ['licensed', 'Licensed'], ['new', 'New on Done Right'], ['coupon', 'Has coupon'], ['repeat', '30+ repeat customers'], ['online', 'Online sessions'], ['business', 'Registered business']].map(([k, l]) => chip('flag', k, l, draft.flags.includes(k))).join('')}</div></section>
      <section><h4>Languages</h4><div class="chips">${['English', 'Mandarin', 'Malay', 'Tamil', 'Cantonese', 'Hokkien', 'Hindi', 'Japanese', 'Korean'].map((l) => chip('lang', l, l, draft.langs.includes(l))).join('')}</div></section>
      <section><h4>Find a provider</h4><input class="input" id="fQ" placeholder="Name, provider ID or shop name" value="${esc(draft.q)}"></section>
    </div>`;
    const sh = DR.ui.sheet({
      title: 'Filters', full: true,
      html: `<div id="fBody">${body()}</div><div class="sheet-actions"><button class="btn btn-outline grow" id="fReset">Reset</button><button class="btn btn-primary grow" id="fOk">Show results</button></div>`,
      mount(s) {
        const rerender = () => { const y = s.querySelector('.sheet-body').scrollTop; s.querySelector('#fBody').innerHTML = body(); s.querySelector('.sheet-body').scrollTop = y; };
        s.addEventListener('click', (e) => {
          const t = e.target.closest('button'); if (!t) return;
          const d = t.dataset;
          const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
          if ('sub' in d) draft.subs = toggle(draft.subs, d.sub);
          else if ('gender' in d) draft.gender = d.gender;
          else if ('serves' in d) draft.serves = d.serves;
          else if ('avail' in d) draft.avail = draft.avail === d.avail ? '' : d.avail;
          else if ('age' in d) draft.ageMax = draft.ageMax === +d.age ? 0 : +d.age;
          else if ('skill' in d) draft.minSkill = +d.skill;
          else if ('trust' in d) draft[d.trust] = !draft[d.trust];
          else if ('flag' in d) draft.flags = toggle(draft.flags, d.flag);
          else if ('lang' in d) draft.langs = toggle(draft.langs, d.lang);
          else if (t.id === 'fReset') { Object.assign(draft, blankFilter(), { sort: nf.sort }); }
          else if (t.id === 'fOk') { draft.q = (s.querySelector('#fQ') || {}).value || ''; nf = draft; sh.close(); DR.router.refresh(); return; }
          else return;
          rerender();
        });
        s.addEventListener('input', (e) => {
          if (e.target.id === 'fDist') { draft.distance = +e.target.value; e.target.closest('section').querySelector('h4').textContent = `Distance (≤ ${draft.distance} km)`; }
          if (e.target.id === 'fIgnore') draft.ignoreDist = e.target.checked;
          if (e.target.id === 'fQ') draft.q = e.target.value;
        });
      },
    });
  }

  DR.page('/nearby', ({ query }) => {
    if (query.view) nearView = query.view;
    const g = query.g || 'all';
    const sub = query.sub || '';
    const { list, relaxed } = nearbyList(g, sub);
    const count = filterCount();
    const groups = [['all', 'Recommended']].concat(DR.GROUPS.map((x) => [x.id, x.short]));
    const q = (patch) => '/nearby?' + new URLSearchParams(Object.assign({ g, ...(sub ? { sub } : {}) }, patch)).toString();
    return {
      tab: 'nearby', title: 'Nearby', cls: nearView === 'map' ? 'nearby-map' : '',
      html: `<div class="topbar">
          <a class="loc" href="#/city">${icon('pin', 18)}<span class="ellipsis">${esc(S().area)}</span>${icon('right', 14)}</a>
          <span class="grow"></span>
          ${DR.ui.seg([['map', 'Map'], ['list', 'List']], nearView, 'view')}
          <a class="icon-btn" href="#/cart?tab=following" aria-label="Followed providers">${icon('userHeart')}</a>
          <a class="icon-btn" href="#/search" aria-label="Search">${icon('search')}</a>
        </div>
        <nav class="tabs tabs-scroll" id="gtabs">${groups.map(([k, l]) => `<a href="#${q({ g: k, sub: '' }).replace('&sub=', '')}" class="tab-link ${g === k ? 'on' : ''}" data-k="${k}">${esc(l)}</a>`).join('')}</nav>
        ${sub ? `<div class="pad mt8"><span class="chip on">${DR.SUB[sub] ? esc(DR.SUB[sub].name) : ''} <a href="#/nearby?g=${g}" aria-label="Clear">${icon('x', 12)}</a></span></div>` : ''}
        ${nearView === 'list' ? `
          <div class="filterbar">
            <button class="fb-btn brand" id="nsort">${esc(NSORTS.find((x) => x[0] === nf.sort)[1])} ${icon('down', 12)}</button>
            <button class="fb-chip ${nf.gender === 'F' ? 'on' : ''}" data-gender="F">Female</button>
            <button class="fb-chip ${nf.gender === 'M' ? 'on' : ''}" data-gender="M">Male</button>
            <button class="fb-chip ${nf.avail === 'today' ? 'on' : ''}" data-today>Today</button>
            <button class="fb-btn" id="nfilter">Filter${count ? ` (${count})` : ''} ${icon('filter', 14)}</button>
          </div>
          ${relaxed ? `<div class="notice">${icon('info', 16)} No providers within ${nf.distance} km — showing the nearest in ${esc(DR.COUNTRIES[S().country].name)}.</div>` : ''}
          <div class="plist" id="plist">${list.slice(0, PAGE).map((p) => DR.cards.provider(p)).join('') || DR.ui.empty('heart', 'No providers match your filters', '<button class="btn btn-ghost" id="clearF">Clear filters</button>')}</div>
          ${list.length > PAGE ? `<p class="center muted small mb16" id="more-sentinel">${list.length} providers · scroll for more</p>` : ''}
        ` : `
          <div class="map-wrap"><div id="map" class="map"></div>
            <button class="map-locate" id="locate" aria-label="Recenter">${icon('target', 22)}</button>
            <a class="map-join" href="#/pro">${icon('briefcase', 16)} Become a pro</a>
            <div class="map-count">${list.length} pros</div>
            <div class="map-card" id="mapCard" hidden></div>
          </div>`}`,
      mount(el) {
        el.addEventListener('click', (e) => {
          const v = e.target.closest('[data-view]');
          if (v) { nearView = v.dataset.view; DR.router.go(q({ view: nearView }), { replace: true }); return; }
          const gb = e.target.closest('[data-gender]');
          if (gb) { nf.gender = nf.gender === gb.dataset.gender ? '' : gb.dataset.gender; DR.router.refresh(); }
          if (e.target.closest('[data-today]')) { nf.avail = nf.avail === 'today' ? '' : 'today'; DR.router.refresh(); }
          if (e.target.closest('#nfilter')) filterSheet(g);
          if (e.target.closest('#clearF')) { nf = blankFilter(); DR.router.refresh(); }
          if (e.target.closest('#nsort')) {
            const sh = DR.ui.sheet({ title: 'Sort providers', html: `<div class="list">${NSORTS.map(([k, l]) => `<button class="list-item" data-s="${k}"><span>${l}</span>${nf.sort === k ? icon('check', 18, 'brand') : ''}</button>`).join('')}</div>`, mount(s) { s.addEventListener('click', (ev) => { const b = ev.target.closest('[data-s]'); if (b) { nf.sort = b.dataset.s; sh.close(); DR.router.refresh(); } }); } });
          }
        });
        const tabs = el.querySelector('#gtabs .on');
        if (tabs) tabs.scrollIntoView({ inline: 'center', block: 'nearest' });
        el.querySelectorAll('#gtabs a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); DR.router.go(q({ g: a.dataset.k, view: nearView }).replace(/&?sub=[^&]*/, ''), { replace: true }); }));
        if (nearView === 'map') mountMap(el, list.slice(0, 200));
        // incremental rendering: append the next page when the sentinel scrolls into view
        const sentinel = el.querySelector('#more-sentinel');
        if (sentinel && 'IntersectionObserver' in window) {
          let shown = PAGE;
          const io = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) return;
            const next = list.slice(shown, shown + PAGE);
            shown += next.length;
            el.querySelector('#plist').insertAdjacentHTML('beforeend', next.map((p) => DR.cards.provider(p)).join(''));
            DR.files.hydrate(el);
            if (shown >= list.length) { io.disconnect(); sentinel.remove(); }
          }, { rootMargin: '400px' });
          io.observe(sentinel);
          DR.onLeave(() => io.disconnect());
        }
      },
    };
  });

  // Production map tiles per market (see js/config.js): OneMap (SG, keyless) · MapTiler (needs key) · OSM (dev fallback)
  DR.tileLayer = function (cc) {
    const L = window.L;
    const dark = document.documentElement.dataset.theme !== 'light';
    const provider = (DR.CONFIG.maps || {})[cc] || 'osm';
    if (provider === 'onemap' && cc === 'SG') {
      return L.tileLayer(`https://www.onemap.gov.sg/maps/tiles/${dark ? 'Night' : 'Default'}/{z}/{x}/{y}.png`, {
        minZoom: 11, maxZoom: 19, detectRetina: true, bounds: [[1.144, 103.535], [1.494, 104.502]],
        attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:14px;width:14px;vertical-align:middle"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
      });
    }
    if (provider === 'maptiler' && DR.CONFIG.maptilerKey) {
      return L.tileLayer(`https://api.maptiler.com/maps/${dark ? 'dataviz-dark' : 'streets-v2'}/256/{z}/{x}/{y}.png?key=${encodeURIComponent(DR.CONFIG.maptilerKey)}`, {
        maxZoom: 19, attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>',
      });
    }
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors (dev tiles — set a MapTiler key for production)', maxZoom: 19, className: 'osm-tiles' });
  };

  function mountMap(el, list) {
    const mapEl = el.querySelector('#map');
    const card = el.querySelector('#mapCard');
    const here = DR.data.here();
    const show = (p) => {
      card.hidden = false;
      card.innerHTML = `<button class="icon-btn map-card-x" aria-label="Close">${icon('x', 18)}</button>${DR.cards.provider(p)}`;
      DR.files.hydrate(card);
      card.querySelector('.map-card-x').onclick = () => { card.hidden = true; };
    };
    const init = () => {
      const map = window.L.map(mapEl, { zoomControl: false }).setView([here.lat, here.lng], 13);
      DR.tileLayer(S().country).addTo(map);
      window.L.marker([here.lat, here.lng], { icon: window.L.divIcon({ className: 'me-pin', html: '<span></span>', iconSize: [22, 22] }), interactive: false }).addTo(map);
      list.forEach((p) => {
        const src = p.photoFile ? DR.ui.avatar(p.id, p.gender) : DR.ui.avatar(p.id, p.gender, 0);
        const m = window.L.marker([p.lat, p.lng], { icon: window.L.divIcon({ className: 'av-pin', html: `<img src="${src}" alt=""><i></i>`, iconSize: [46, 56], iconAnchor: [23, 56] }), title: p.name });
        m.on('click', () => show(p));
        m.addTo(map);
      });
      el.querySelector('#locate').onclick = () => map.setView([here.lat, here.lng], 13);
      map.on('click', () => { card.hidden = true; });
      DR.onLeave(() => map.remove());
    };
    const fallback = () => {
      mapEl.classList.add('map-fallback');
      const k = 900;
      mapEl.innerHTML = `<div class="me-pin static" style="left:50%;top:50%"><span></span></div>` + list.filter((p) => Math.abs(p.lat - here.lat) < 0.06 && Math.abs(p.lng - here.lng) < 0.06).map((p) =>
        `<button class="av-pin static" data-pid="${p.id}" style="left:calc(50% + ${((p.lng - here.lng) * k).toFixed(1)}%);top:calc(50% - ${((p.lat - here.lat) * k).toFixed(1)}%)"><img src="${DR.ui.avatar(p.id, p.gender)}" alt="${esc(p.name)}"><i></i></button>`).join('') + '<p class="map-note">Offline map preview</p>';
      mapEl.addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b) show(DR.data.provider(b.dataset.pid)); });
      el.querySelector('#locate').onclick = () => DR.ui.toast('Centred on ' + S().area);
    };
    if (window.L) return init();
    let tries = 0;
    const t = setInterval(() => { tries++; if (window.L) { clearInterval(t); init(); } else if (tries > 10) { clearInterval(t); fallback(); } }, 300);
    DR.onLeave(() => clearInterval(t));
  }
})(window.DR);
