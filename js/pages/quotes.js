/* Done Right — Request a quote: customer request form, offer comparison & acceptance, provider quote inbox */
(function (DR) {
  'use strict';
  const { esc, fmtDate, fmtTs, dateKey, relDay } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;
  const TOD = [['any', 'Flexible'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
  const budgetLabel = (q) => (q.budgetMin && q.budgetMax ? `${money(q.budgetMin, q.country)} – ${money(q.budgetMax, q.country)}` : q.budgetMax ? `Up to ${money(q.budgetMax, q.country)}` : `From ${money(q.budgetMin, q.country)}`);
  const qStatus = (s) => ({ open: '<span class="tag tag-blue">Open</span>', accepted: '<span class="tag tag-green">Accepted</span>', closed: '<span class="tag tag-grey">Closed</span>', expired: '<span class="tag tag-grey">Expired</span>' }[s] || '');

  // ---------------------------------------------------------------- new request
  const drafts = {};
  DR.page('/quote/new', ({ query }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const key = `${query.sub || ''}|${query.pid || ''}`;
    const d = drafts[key] || (drafts[key] = { subId: query.sub || '', title: '', details: '', photos: [], mode: 'onsite', addr: null, date: '', tod: 'any', min: '', max: '' });
    const sub = DR.SUB[d.subId];
    const cc = u.country || S().country;
    const pro = query.pid ? DR.data.provider(query.pid) : null;
    const addrs = u.addresses || [];
    if (!addrs.some((a) => a.id === d.addr)) d.addr = addrs[0] ? addrs[0].id : null;
    const both = sub && DR.GROUP[sub.groupId].mode === 'both';
    if (!both) d.mode = 'onsite';
    const matches = sub ? DR.quotes.match(sub.id, cc, pro && pro.id).length : 0;
    const subOptions = (pro ? pro.services.map((s) => DR.SUB[s.subId]).filter(Boolean) : DR.ALL_SUBS);
    return {
      title: 'Request a quote', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Request a quote' })}
      <section class="card quote-intro">${icon('quote', 26, 'brand')}<div><b>${pro ? `Get a quote from <span data-no-i18n>${esc(pro.name)}</span>` : 'Get offers from up to 5 verified pros'}</b><p class="muted small">Describe the job, compare prices and proposed times, then accept the best offer. Free, no obligation.</p></div></section>
      <form class="card form" id="qf" novalidate>
        ${DR.ui.field('Service', `<select class="input" name="subId"><option value="">Choose a service…</option>${pro ? subOptions.map((s) => `<option value="${s.id}" ${s.id === d.subId ? 'selected' : ''}>${esc(s.name)}</option>`).join('') : DR.GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${g.subs.map((s) => `<option value="${s.id}" ${s.id === d.subId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select>`, '', true)}
        ${DR.ui.field('Title', `<input class="input" name="title" maxlength="80" value="${esc(d.title)}" placeholder="${sub ? `e.g. ${esc(sub.name)} for a 4-room HDB flat` : 'e.g. Repaint 3-bedroom condo'}">`)}
        ${DR.ui.field('Describe the job', `<textarea class="input" name="details" rows="5" maxlength="1500" placeholder="Size, quantity, condition, materials, access, anything the pro should know…">${esc(d.details)}</textarea>`, 'At least 20 characters — more detail gets more accurate quotes', true)}
        <div><span class="field-label">Photos (optional, up to 4)</span><div class="review-photos" id="qph">${d.photos.map((p) => `<img data-file="${p.id}" alt="">`).join('')}<label class="rp-add" ${d.photos.length >= 4 ? 'hidden' : ''}>${icon('camera', 22)}<input type="file" accept="image/*" multiple hidden></label></div></div>
        ${both ? `<div><span class="field-label">Where</span>${DR.ui.seg([['onsite', `${icon('home2', 16)} At my place`], ['online', `${icon('video', 16)} Online`]], d.mode, 'mode')}</div>` : ''}
        ${d.mode === 'onsite' ? `<div><span class="field-label">Address <b class="brand">*</b></span><div class="radio-list">${addrs.map((a) => `<div class="radio-card ${a.id === d.addr ? 'on' : ''}" data-addr="${a.id}" role="button" tabindex="0"><span class="radio-dot"></span><div class="grow minw0 left" data-no-i18n><b>${esc(a.label)}</b> <span class="muted xs">${esc(a.area)}</span><div class="small ellipsis">${esc(a.line)} ${esc(a.unit)}</div></div></div>`).join('')}</div><button type="button" class="btn btn-ghost btn-block mt8" id="addAddr">${icon('plus', 16)} Add address</button></div>` : ''}
        <div class="row gap10">${DR.ui.field('Preferred date', `<input class="input" type="date" name="date" min="${dateKey(new Date())}" value="${esc(d.date)}">`)}${DR.ui.field('Time of day', `<select class="input" name="tod">${TOD.map(([k, l]) => `<option value="${k}" ${k === d.tod ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
        <div class="row gap10">${DR.ui.field(`Budget from (${DR.COUNTRIES[cc].currency})`, `<input class="input" type="number" min="0" name="min" value="${esc(d.min)}" placeholder="Optional">`)}${DR.ui.field(`Budget to (${DR.COUNTRIES[cc].currency})`, `<input class="input" type="number" min="0" name="max" value="${esc(d.max)}" placeholder="Optional">`)}</div>
        ${sub ? `<p class="notice">${icon('users', 16)} <span>${pro ? `Your request goes only to <b data-no-i18n>${esc(pro.name)}</b>.` : `We'll send it to <b>${matches}</b> matching pros near ${esc(S().area)}.`}</span></p>` : ''}
      </form>
      <div class="bottom-bar"><button class="btn btn-primary grow" id="send">Send request</button></div>`,
      mount(el) {
        const f = el.querySelector('#qf');
        const sync = () => { const v = Object.fromEntries(new FormData(f)); Object.assign(d, { subId: v.subId, title: v.title, details: v.details, date: v.date, tod: v.tod, min: v.min, max: v.max }); };
        f.addEventListener('input', sync);
        f.subId.addEventListener('change', () => { sync(); DR.router.refresh(); });
        el.addEventListener('click', (e) => {
          const m = e.target.closest('[data-mode]'); if (m) { sync(); d.mode = m.dataset.mode; DR.router.refresh(); }
          const a = e.target.closest('[data-addr]'); if (a) { sync(); d.addr = a.dataset.addr; DR.router.refresh(); }
          if (e.target.closest('#addAddr')) { sync(); DR.addressSheet(null, (ad) => { d.addr = ad.id; DR.router.refresh(); }); }
        });
        el.querySelector('#qph input').addEventListener('change', async (e) => {
          sync();
          for (const file of [...e.target.files].slice(0, 4 - d.photos.length)) d.photos.push(await DR.files.fromInput(file, 1000));
          DR.router.refresh();
        });
        el.querySelector('#send').onclick = () => {
          sync();
          if (!d.subId) return DR.ui.toast('Choose a service');
          if (d.mode === 'onsite' && !d.addr) return DR.ui.toast('Add the address where the job is');
          if (d.min && d.max && +d.min > +d.max) return DR.ui.toast('Budget “from” must be lower than “to”');
          try {
            const addr = addrs.find((x) => x.id === d.addr);
            const q = DR.quotes.create({ user: u, subId: d.subId, title: d.title, details: d.details, photos: d.photos, mode: d.mode, address: d.mode === 'online' ? null : Object.assign({}, addr), date: d.date || null, timeOfDay: d.tod, budgetMin: d.min ? +d.min : null, budgetMax: d.max ? +d.max : null, providerId: pro ? pro.id : null });
            if (!q.invited.length) DR.ui.toast('No pros nearby yet — we\'ll notify you when one joins');
            delete drafts[key];
            DR.router.go('/quote/' + q.id, { replace: true });
          } catch (err) { DR.ui.toast(err.message); }
        };
      },
    };
  });

  // ---------------------------------------------------------------- my requests
  DR.page('/quotes', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const list = S().quotes.filter((q) => q.userId === u.id);
    return {
      title: 'Quote requests', bar: true, seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Quote requests' })}
        <div class="olist">${list.map((q) => { const sub = DR.SUB[q.subId]; const pending = q.offers.filter((o) => o.status === 'pending').length; return `<a class="ocard" href="#/quote/${q.id}"><div class="row between"><b class="ellipsis" data-no-i18n>${esc(q.title)}</b>${qStatus(q.status)}</div>
          <div class="row gap10 mt8">${sub ? DR.ui.thumb(sub, { cls: 'thumb-sm' }) : ''}<div class="grow minw0"><div class="small">${esc(sub ? sub.name : '')}</div><div class="muted xs">${q.no} · ${DR.u.timeAgo(q.createdAt)}</div></div><div class="right"><b class="brand">${q.offers.length}</b><div class="muted xs">offers</div></div></div>
          ${pending && q.status === 'open' ? `<div class="order-flag">${icon('sparkle', 14)} ${pending} offer${pending === 1 ? '' : 's'} waiting for your decision</div>` : ''}</a>`; }).join('') || DR.ui.empty('clipboard', 'No quote requests yet<br><small class="muted">Custom job? Let pros compete for it.</small>')}</div>
        <div class="bottom-bar"><a class="btn btn-primary grow" href="#/quote/new">${icon('plus', 16)} New quote request</a></div>`,
    };
  });

  // ---------------------------------------------------------------- request detail + offers
  DR.page('/quote/:id', ({ params }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const q = DR.quotes.find(params.id);
    if (!q || q.userId !== u.id) return DR.notFound('Quote request not found');
    const sub = DR.SUB[q.subId];
    const responded = q.offers.length + q.declinedBy.length;
    const offers = q.offers.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.price - b.price);
    const cheapest = Math.min(...q.offers.filter((o) => o.status === 'pending').map((o) => o.price));
    const offerCard = (o) => {
      const p = DR.data.provider(o.providerId);
      if (!p) return '';
      const licensed = DR.lic.regulated(q.subId, q.country);
      return `<div class="offer ${o.status}">
        <div class="row gap10"><a href="#/provider/${p.id}">${DR.cards.pimg(p, 0, 'av-md round')}</a><div class="grow minw0"><div class="row gap6"><b class="ellipsis" data-no-i18n>${esc(p.name)}</b>${DR.cards.rating(p)}</div>
          <div class="chips-xs mt4">${p.verified.identity ? `<span class="chip-xs chip-ok">${icon('shield', 11)}ID verified</span>` : ''}${licensed ? `<span class="chip-xs chip-ok">${icon('award', 11)}Licensed</span>` : ''}<span class="chip-xs">${DR.data.distLabel(p)}</span></div></div>
          <div class="right"><div class="price price-lg"><b>${money(o.price, q.country)}</b></div>${o.price === cheapest && o.status === 'pending' && q.offers.length > 1 ? '<span class="tag tag-green">Lowest</span>' : ''}</div></div>
        <div class="kv mt8"><span>${icon('calendar', 14)} Proposed</span><b>${fmtDate(o.date)}, ${o.time} · ${o.duration} min</b></div>
        ${o.message ? `<p class="small offer-msg" data-no-i18n>“${esc(o.message)}”</p>` : ''}
        <div class="row between mt8"><span class="muted xs">${o.status === 'pending' ? `Valid until ${fmtTs(o.validUntil)}` : ({ accepted: 'Accepted', declined: 'Declined', expired: 'Expired' }[o.status] || '')}</span>
          ${o.status === 'pending' && q.status === 'open' ? `<span class="row gap6"><a class="btn btn-ghost btn-xs" href="#/chat/${p.id}">${icon('chat', 14)}</a><button class="btn btn-ghost btn-xs" data-reject="${o.id}">Decline</button><button class="btn btn-primary btn-xs" data-accept="${o.id}">Accept & pay</button></span>` : ''}</div>
      </div>`;
    };
    return {
      title: q.title, bar: q.status === 'open', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Quote request' })}
        <section class="card"><div class="row between gap8"><h2 class="h2" data-no-i18n>${esc(q.title)}</h2>${qStatus(q.status)}</div>
          <div class="muted small mt4">${sub ? `${sub.emoji} ${esc(sub.name)}` : ''} · ${q.no}</div>
          <p class="small mt8 pre" data-no-i18n>${esc(q.details)}</p>
          ${q.photos.length ? `<div class="review-photos mt8">${q.photos.map((p) => `<img data-file="${p.id}" alt="">`).join('')}</div>` : ''}
          <div class="kv mt8"><span>${icon('calendar', 14)} Preferred</span><b>${q.date ? fmtDate(q.date) : ('Flexible date')}${q.timeOfDay && q.timeOfDay !== 'any' ? ` · ${((TOD.find((t) => t[0] === q.timeOfDay) || TOD[0])[1])}` : ''}</b></div>
          ${q.budgetMin || q.budgetMax ? `<div class="kv"><span>${icon('wallet', 14)} Budget</span><b>${budgetLabel(q)}</b></div>` : ''}
          <div class="kv"><span>${icon(q.mode === 'online' ? 'video' : 'pin', 14)} Where</span><b data-no-i18n>${q.mode === 'online' ? ('Online') : esc(`${q.address.line}, ${q.address.area}`)}</b></div>
        </section>
        <section class="card"><div class="card-h"><h2>Offers <span class="muted small">${q.offers.length}</span></h2><span class="muted xs">Sent to ${q.invited.length} · ${responded} responded</span></div>
          ${offers.map(offerCard).join('') || (q.status === 'open' ? `<div class="center pad-v"><div class="spinner"></div><p class="muted small mt12">Waiting for offers… pros usually respond within an hour.</p></div>` : '<p class="muted small">No offers received.</p>')}
          ${q.orderId ? `<a class="btn btn-ghost btn-block mt12" href="#/order/${q.orderId}">View booking ${icon('right', 14)}</a>` : ''}
        </section>
        ${q.status === 'open' ? `<div class="bottom-bar"><button class="btn btn-ghost grow" id="close">Close request</button></div>` : ''}`,
      mount(el) {
        el.addEventListener('click', async (e) => {
          const acc = e.target.closest('[data-accept]');
          if (acc) {
            const o = q.offers.find((x) => x.id === acc.dataset.accept);
            if (!(await DR.ui.confirm({ title: `Accept ${money(o.price, q.country)} offer?`, text: `Books ${esc(o.providerName)} for ${fmtDate(o.date)}, ${o.time}. Other offers will be declined.`, ok: 'Accept & pay' }))) return;
            try { const order = DR.quotes.accept(q.id, o.id, u); DR.router.go('/pay/' + order.id); } catch (err) { DR.ui.toast(err.message); DR.router.refresh(); }
          }
          const rej = e.target.closest('[data-reject]'); if (rej) { DR.quotes.rejectOffer(q.id, rej.dataset.reject); DR.router.refresh(); }
          if (e.target.closest('#close') && await DR.ui.confirm({ title: 'Close this request?', text: 'Pending offers will expire.', ok: 'Close request', danger: true })) { DR.quotes.close(q.id); DR.router.refresh(); }
        });
      },
    };
  });

  // ---------------------------------------------------------------- provider quote inbox
  function offerSheet(q, u) {
    const p = DR.data.fromUser(DR.store.user());
    const mySvc = p.services.concat(p.lockedServices || []).find((s) => s.subId === q.subId);
    const sub = DR.SUB[q.subId];
    const st = { date: q.date && q.date >= dateKey(new Date()) ? q.date : null, time: null, duration: (mySvc && mySvc.duration) || Math.min(sub.duration, 240) };
    const cc = q.country;
    const body = () => {
      const days = DR.picker.days(p, st.duration, null, { days: 21 });
      if (!st.date || !days.some((x) => x.k === st.date)) st.date = (days.find((x) => x.n) || days[0]).k;
      return `${DR.picker.datesHTML(days, st.date)}<div class="mt12">${DR.picker.slotsHTML(p, st.date, st.duration, st.time)}</div>`;
    };
    const sh = DR.ui.sheet({
      title: 'Send a quote', full: true,
      html: `<p class="small" data-no-i18n><b>${esc(q.title)}</b></p><p class="muted xs mb12">${q.budgetMax ? `Budget up to ${money(q.budgetMax, cc)} · ` : ''}${q.date ? `Prefers ${fmtDate(q.date)}` : ('Flexible date')}</p>
        <form class="form" id="of">
          <div class="row gap10"><label class="field grow"><span class="field-label">Price (all-in)</span><span class="input-prefix"><em>${DR.COUNTRIES[cc].currency}</em><input class="input" type="number" min="1" name="price" value="${mySvc ? mySvc.price : DR.data.catalogPrice(sub, cc)}"></span></label>
            <label class="field grow"><span class="field-label">Duration</span><select class="input" name="duration">${[30, 60, 90, 120, 180, 240].map((x) => `<option value="${x}" ${x === st.duration ? 'selected' : ''}>${x} min</option>`).join('')}</select></label></div>
          <div><span class="field-label">Proposed date & time</span><div id="ob">${body()}</div></div>
          ${DR.ui.field('Message', '<textarea class="input" name="message" rows="3" maxlength="600" placeholder="What is included, materials, assumptions…"></textarea>')}
          <div><span class="field-label">Valid for</span>${DR.ui.seg([[1, '1 day'], [3, '3 days'], [7, '7 days']], 3, 'valid')}</div>
          <button class="btn btn-primary btn-block">Send quote</button>
        </form>`,
      mount(s) {
        let valid = 3;
        const f = s.querySelector('#of');
        f.duration.addEventListener('change', () => { st.duration = +f.duration.value; st.time = null; s.querySelector('#ob').innerHTML = body(); });
        s.addEventListener('click', (e) => {
          const dt = e.target.closest('[data-date]'); if (dt) { st.date = dt.dataset.date; st.time = null; s.querySelector('#ob').innerHTML = body(); }
          const tm = e.target.closest('[data-time]'); if (tm) { st.time = tm.dataset.time; s.querySelector('#ob').innerHTML = body(); }
          const v = e.target.closest('[data-valid]'); if (v) { valid = +v.dataset.valid; s.querySelectorAll('[data-valid]').forEach((x) => x.classList.toggle('on', x === v)); }
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!st.time) return DR.ui.toast('Pick a proposed time');
          try { DR.quotes.offer(q.id, u.id, { price: +f.price.value, date: st.date, time: st.time, duration: st.duration, message: f.message.value, validDays: valid }); sh.close(); DR.ui.toast('Quote sent'); DR.router.refresh(); } catch (err) { DR.ui.toast(err.message); }
        });
      },
    });
  }

  DR.page('/pro/quotes', ({ query }) => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    const tab = query.tab || 'new';
    const all = DR.quotes.forProvider(u.id);
    const mine = (q) => q.offers.filter((o) => o.providerId === u.id);
    const groups = {
      new: all.filter((q) => q.status === 'open' && !q.declinedBy.includes(u.id) && !mine(q).some((o) => o.status === 'pending')),
      sent: all.filter((q) => mine(q).some((o) => o.status === 'pending')),
      won: all.filter((q) => mine(q).some((o) => o.status === 'accepted')),
      lost: all.filter((q) => (q.status !== 'open' && !mine(q).some((o) => o.status === 'accepted')) || q.declinedBy.includes(u.id) || mine(q).some((o) => o.status === 'declined')),
    };
    const list = groups[tab] || [];
    const card = (q) => {
      const sub = DR.SUB[q.subId];
      const o = mine(q).slice(-1)[0];
      return `<div class="ocard"><div class="row between"><b class="ellipsis" data-no-i18n>${esc(q.title)}</b>${qStatus(q.status)}</div>
        <div class="muted xs">${sub ? `${sub.emoji} ${esc(sub.name)}` : ''} · <span data-no-i18n>${esc(q.customerName || '')}</span> · ${q.address ? esc(q.address.area) : ('Online')} · ${DR.u.timeAgo(q.createdAt)}</div>
        <p class="small mt8 clamp3" data-no-i18n>${esc(q.details)}</p>
        ${q.photos.length ? `<div class="review-photos mt8">${q.photos.map((p) => `<img data-file="${p.id}" alt="">`).join('')}</div>` : ''}
        <div class="row gap10 mt8 small muted"><span>${icon('calendar', 13)} ${q.date ? relDay(q.date) : ('Flexible')}</span>${q.budgetMax || q.budgetMin ? `<span>${icon('wallet', 13)} ${budgetLabel(q)}</span>` : ''}<span>${icon('users', 13)} ${q.offers.length} offers</span></div>
        ${o ? `<div class="order-flag">Your quote: <b>${money(o.price, q.country)}</b> · ${relDay(o.date)} ${o.time} · ${({ pending: 'Pending', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' }[o.status])}</div>` : ''}
        ${tab === 'new' ? `<div class="ocard-actions"><button class="btn btn-ghost btn-sm" data-qdecline="${q.id}">Not interested</button><button class="btn btn-primary btn-sm" data-qoffer="${q.id}">Send quote</button></div>` : tab === 'won' && q.orderId ? `<div class="ocard-actions"><a class="btn btn-primary btn-sm" href="#/order/${q.orderId}">View job</a></div>` : ''}
      </div>`;
    };
    return {
      title: 'Quote requests', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Quote requests' })}
        <nav class="tabs">${[['new', 'New'], ['sent', 'Sent'], ['won', 'Won'], ['lost', 'Closed']].map(([k, l]) => `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/pro/quotes?tab=${k}">${l}${groups[k].length ? `<i class="count">${groups[k].length}</i>` : ''}</a>`).join('')}</nav>
        <div class="olist">${list.map(card).join('') || DR.ui.empty('clipboard', tab === 'new' ? 'No new requests right now<br><small class="muted">Requests matching your services appear here</small>' : 'Nothing here yet')}</div>`,
      mount(el) {
        el.addEventListener('click', (e) => {
          const off = e.target.closest('[data-qoffer]'); if (off) offerSheet(DR.quotes.find(off.dataset.qoffer), u);
          const dec = e.target.closest('[data-qdecline]'); if (dec) { DR.quotes.declineRequest(dec.dataset.qdecline, u.id); DR.ui.toast('Request declined'); DR.router.refresh(); }
        });
      },
    };
  });
})(window.DR);
