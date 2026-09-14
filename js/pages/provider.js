/* Done Right — Provider profile, credentials & reviews */
(function (DR) {
  'use strict';
  const { esc, fmtMonth, hash } = DR.u;
  const { icon, money } = DR.ui;
  const S = () => DR.store.s;

  function monthsBetween(a, b) {
    const [y1, m1] = a.split('-').map(Number);
    const end = b ? b.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    const m = (end[0] - y1) * 12 + ((end[1] || 1) - (m1 || 1)) + 1;
    const y = Math.floor(m / 12); const r = m % 12;
    return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ') || '1 mo';
  }
  const initials = (s) => s.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || s.slice(0, 2).toUpperCase();
  const vBadge = (item) => item.verified ? `<span class="vbadge" title="Verified by Done Right">${icon('verified', 16)}</span>` : item.status === 'pending' ? '<span class="tag tag-gold">In review</span>' : '';

  function radar(vals) {
    const labels = ['Photo match', 'Skill', 'Attitude', 'Punctuality', 'Tools & attire', 'Overall'];
    const cx = 160, cy = 104, R = 62;
    const pt = (i, rr) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
    const poly = (f) => vals.map((v, i) => pt(i, f(v)).map((n) => n.toFixed(1)).join(',')).join(' ');
    const grid = [1, 0.66, 0.33].map((s) => `<polygon points="${poly(() => R * s)}" class="radar-grid"/>`).join('');
    const axes = vals.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-grid"/>`; }).join('');
    const text = vals.map((v, i) => { const [x, y] = pt(i, R + 22); const anchor = Math.abs(x - cx) < 5 ? 'middle' : x < cx ? 'end' : 'start'; return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="radar-label">${labels[i]} <tspan class="radar-val">${v}</tspan></text>`; }).join('');
    return `<svg viewBox="-24 0 368 208" class="radar" role="img" aria-label="Customer rating breakdown">${grid}${axes}<polygon points="${poly((v) => R * Math.max(0.1, (v - 60) / 40))}" class="radar-shape"/>${text}</svg>`;
  }

  DR.reviewItem = (r) => `<div class="review">
      <img class="av-md round" src="${DR.ui.avatar('rv' + r.name, hash(r.name) % 2 ? 'F' : 'M', 1)}" alt="">
      <div class="grow minw0">
        <div class="row between"><b>${esc(r.name)}${r.vip ? ' <span class="tag tag-purple">VIP</span>' : ''}</b><span class="muted xs">${DR.u.fmtTs(r.date).split(',')[0]}</span></div>
        <div class="row gap8 mt4">${DR.ui.stars(r.stars, 13)}${r.repeat ? '<span class="chip-xs chip-coupon">Repeat customer</span>' : ''}</div>
        <p class="review-text">${esc(r.text)}</p>
        ${r.tags && r.tags.length ? `<div class="chips-xs">${r.tags.map((t) => `<span class="chip-xs">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="row between muted xs mt8"><span>${icon('pin', 12)} ${esc(r.area || '')} · ${esc(r.sub || '')}</span><button class="useful" data-useful="${r.id}">${icon('thumb', 14)} Useful ${r.useful || 0}</button></div>
      </div></div>`;

  function attr(label, value) { return `<div class="attr"><span class="muted">${label}</span><b>${value}</b></div>`; }

  DR.page('/provider/:id', ({ params }) => {
    const p = DR.data.provider(params.id);
    if (!p) return DR.notFound('Provider not found', 'This profile may have been removed.');
    const me = DR.store.user();
    const own = me && me.id === p.id;
    const g = DR.GROUP[p.groupId];
    const followed = S().follows.providers.includes(p.id);
    if (!own) {
      const h = S().history;
      if (!h.length || h[0].id !== p.id) DR.store.update((s) => { s.history = [{ id: p.id, ts: Date.now() }, ...s.history.filter((x) => x.id !== p.id)].slice(0, 50); }, { render: false });
    }
    const reviews = DR.data.reviews(p);
    const fee = DR.data.fee(p, 'onsite');
    const joined = p.joinedMonths < 12 ? `${Math.max(1, p.joinedMonths)} mo` : `${Math.floor(p.joinedMonths / 12)} yr${p.joinedMonths >= 24 ? 's' : ''}`;
    const topEdu = p.education[0];
    const today = new Date();
    const week = Array.from({ length: 7 }, (_, i) => { const key = DR.u.dateKey(DR.u.addDays(today, i)); const ranges = DR.avail.ranges(p, key); return { key, i, off: !ranges.length, n: DR.avail.count(p, key) }; });
    const creds = [
      [p.verified.identity, 'ID verified', 'id'], [p.verified.certs, 'Certified', 'award'], [p.verified.education, 'Education', 'grad'],
      [p.verified.background, 'Background check', 'shield'], [p.verified.business, 'Registered business', 'store'], [p.verified.assessment, 'Skills assessed', 'medal'],
    ].filter((c) => c[0]);
    const photos = p.photoFile ? [0] : Array.from({ length: p.photos }, (_, i) => i);

    return {
      title: p.name, bar: true, cls: 'provider-page',
      html: `
      <div class="p-hero">
        <div class="gal-track" id="gal">${photos.map((i) => `<div class="gal-slide">${DR.cards.pimg(p, i, 'gal-img')}</div>`).join('')}</div>
        <div class="p-hero-top"><button class="icon-btn glass" data-back aria-label="Back">${icon('back', 22)}</button><span class="grow"></span>
          <button class="icon-btn glass ${followed ? 'brand' : ''}" id="followTop" aria-label="Follow">${icon('userHeart', 20)}</button><button class="icon-btn glass" id="share" aria-label="Share">${icon('share', 20)}</button></div>
        <div class="p-hero-bottom">
          ${p.photoMatch ? `<span class="glass-pill">${icon('scan', 13)} ID photo match ${p.photoMatch}%</span>` : '<span class="glass-pill">Profile photo</span>'}
          <span class="grow"></span>${p.uploaded ? `<span class="glass-pill hide-xs">Uploaded ${p.uploaded} days ago</span>` : ''}<span class="glass-pill" id="galCount">1/${photos.length}</span>
        </div>
      </div>

      <section class="p-info">
        <div class="row between gap8"><div class="row gap8 wrap minw0"><h1 class="p-name">${esc(p.name)}</h1>${DR.cards.availTag(p)}${p.activeToday ? '<span class="tag tag-green-o">Active today</span>' : ''}</div><span class="nowrap small">${icon('pin', 15, 'brand')} ${DR.data.distLabel(p)}</span></div>
        <div class="row between gap8 mt8"><div class="chips-xs"><span class="chip-xs"><b>ID</b>&nbsp;${esc(p.id.slice(-6).toUpperCase())}</span>${p.age ? `<span class="chip-xs">${p.gender === 'F' ? 'Female' : 'Male'} · ${p.age}</span>` : ''}<span class="chip-xs">${icon('store', 12)} ${esc(p.shop || 'Independent')}</span></div>
          <span class="fee nowrap">${icon('car', 15)} Travel <b>${fee ? money(fee, p.country) : 'Free'}</b></span></div>
        <div class="attr-grid">
          ${attr('Skill', p.skill ? `${p.skill} ★` : 'New')}${attr('Experience', `${p.yearsExp} yr${p.yearsExp > 1 ? 's' : ''}`)}${attr('On Done Right', joined)}
          ${attr('Languages', esc(p.languages.slice(0, 3).map((l) => ({ English: 'EN', Mandarin: '中文', Malay: 'BM', Tamil: 'தமிழ்' }[l] || l.slice(0, 3))).join(' · ')))}
          ${attr('Education', esc(topEdu ? topEdu.degree.replace(/ \(.*\)/, '').replace('Bachelor of', 'B.').replace('Master of', 'M.') : '—'))}
          ${attr('Serves', { all: 'Everyone', female: 'Women only', male: 'Men only' }[p.serves])}
          ${attr('Area', esc(p.area.n))}${attr('Responds', `~${p.responseMins} min`)}${attr('Mode', DR.data.mode(p) === 'both' ? 'Online & on-site' : 'On-site')}
        </div>
        ${p.bio ? `<button class="p-bio clamp2" id="bio">${esc(p.bio)}</button>` : ''}
        ${p.skills && p.skills.length ? `<div class="chips-xs mt8">${p.skills.map((s) => `<span class="chip-xs">${esc(s)}</span>`).join('')}</div>` : ''}
      </section>
      <a class="cred-strip" href="#/provider/${p.id}/credentials">${creds.length ? creds.slice(0, 4).map(([, l]) => `<span>${icon('checkCircle', 14)}${l}</span>`).join('') : `<span class="muted">${p.identityPending ? 'Verification in review' : 'Not yet verified'}</span>`}${icon('right', 14)}</a>

      ${p.metrics ? `<section class="card stats">
        <p class="quote">“Customers say it best”</p>
        <div class="stat-row"><a class="stat gold-bg" href="#/provider/${p.id}/reviews?f=repeat">Repeat <b>${p.repeat}</b></a><a class="stat red-bg" href="#/provider/${p.id}/reviews?f=positive">Positive <b>${p.positive}%</b></a><a class="stat purple-bg" href="#/provider/${p.id}/reviews">Reviews <b>${p.reviews}</b>${icon('right', 12)}</a></div>
        ${radar(p.metrics)}
        <p class="muted xs center">${icon('info', 12)} Scores from anonymous ratings by ${Math.min(p.reviews, 84)} recent customers.</p>
      </section>` : `<section class="card"><div class="row gap10">${icon('sparkle', 22, 'brand')}<div><b>New on Done Right</b><p class="muted small">Ratings will appear after the first completed bookings.</p></div></div></section>`}

      <section class="card">
        <div class="card-h"><h2>Availability</h2><a class="more" href="#/book/${p.id}">Full calendar ${icon('right', 13)}</a></div>
        <div class="week">${week.map((d) => { const dt = DR.u.parseKey(d.key); return `<a class="day ${d.off ? 'off' : d.n ? '' : 'full'}" href="#/book/${p.id}?date=${d.key}"><small>${d.i === 0 ? 'Today' : DR.u.DAYS[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${d.off ? 'Off' : d.n ? `${d.n} slots` : 'Full'}</small></a>`; }).join('')}</div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Services</h2><span class="muted small">${p.services.length}</span></div>
        ${p.services.map((s) => { const sub = DR.SUB[s.subId] || { emoji: '✨', groupId: p.groupId, unit: s.unit, id: s.subId }; return `<div class="svc-row p-svc">
          <a href="#/service/${s.subId}">${DR.ui.thumb(sub, { cls: 'thumb-row', badge: `${s.duration} min` })}</a>
          <div class="svc-row-body">
            <a class="row gap6 nowrap" href="#/service/${s.subId}"><span class="tag tag-select">Select</span><b class="ellipsis">${esc(s.name)}</b>${icon('right', 14)}</a>
            <div class="muted small ellipsis">Duration ${s.duration} min · per ${esc(s.unit)}${s.desc ? ` · ${esc(s.desc)}` : ''}</div>
            <div class="gold xs">${s.sold} booked${s.assessed ? ` <span class="sep">|</span> Skills assessment: <i class="script">${s.assessed}</i>` : ''}</div>
            <div class="row between"><span class="price">${DR.cards.priceHTML(s.price, s.unit, p.country)}</span>${own ? '' : `<a class="btn btn-primary btn-xs" href="#/book/${p.id}?sub=${s.subId}">Book</a>`}</div>
          </div></div>`; }).join('') || '<p class="muted">No services listed yet.</p>'}
      </section>

      ${p.experience.length ? `<section class="card"><div class="card-h"><h2>Experience</h2></div>${p.experience.map((e) => `<div class="li-item"><div class="li-logo" style="--h:${hash(e.company) % 360}">${esc(initials(e.company))}</div><div class="grow minw0"><div class="row between gap6"><b>${esc(e.title)}</b>${vBadge(e)}</div><div class="small">${esc(e.company)}${e.type ? ` · ${esc(e.type)}` : ''}</div><div class="muted xs">${fmtMonth(e.start)} – ${e.end ? fmtMonth(e.end) : 'Present'} · ${monthsBetween(e.start, e.end)}</div>${e.location ? `<div class="muted xs">${esc(e.location)}</div>` : ''}${e.desc ? `<p class="small mt4">${esc(e.desc)}</p>` : ''}</div></div>`).join('')}</section>` : ''}

      ${p.education.length ? `<section class="card"><div class="card-h"><h2>Education</h2></div>${p.education.map((e) => `<div class="li-item"><div class="li-logo edu">${icon('grad', 20)}</div><div class="grow minw0"><div class="row between gap6"><b>${esc(e.school)}</b>${vBadge(e)}</div><div class="small">${esc(e.degree)}${e.field ? `, ${esc(e.field)}` : ''}</div><div class="muted xs">${esc(e.start || '')}${e.end ? ` – ${esc(e.end)}` : ''}${e.grade ? ` · ${esc(e.grade)}` : ''}</div></div></div>`).join('')}</section>` : ''}

      ${p.certs.length ? `<section class="card"><div class="card-h"><h2>Licences & certifications</h2><a class="more" href="#/provider/${p.id}/credentials">View documents ${icon('right', 13)}</a></div>${p.certs.map((c) => `<div class="li-item"><div class="li-logo cert">${icon('award', 20)}</div><div class="grow minw0"><div class="row between gap6"><b>${esc(c.name)}</b>${vBadge(c)}</div><div class="small">${esc(c.issuer)}</div><div class="muted xs">${c.issued ? `Issued ${fmtMonth(c.issued)}` : ''}${c.credentialId ? ` · ID ${esc(c.credentialId)}` : ''}</div></div></div>`).join('')}</section>` : ''}

      <section class="card">
        <div class="card-h"><h2>Reviews ${p.skill ? `<span class="brand">${p.skill} ★</span>` : ''}</h2><a class="more" href="#/provider/${p.id}/reviews">All ${reviews.length ? p.reviews : ''} ${icon('right', 13)}</a></div>
        ${reviews.slice(0, 3).map(DR.reviewItem).join('') || '<p class="muted small">No reviews yet.</p>'}
      </section>

      <div class="guarantee"><h3>${icon('shield', 18)} Done Right Guarantee</h3><div class="g-chips"><span>${icon('check', 13)}On-time arrival</span><span>${icon('check', 13)}No-show compensation</span><span>${icon('check', 13)}No hidden fees</span><span>${icon('check', 13)}Redo if unsatisfied</span></div></div>

      <div class="bottom-bar p-bar">
        ${own ? `<a class="btn btn-ghost grow" href="#/pro/profile">${icon('edit', 16)} Edit profile</a><a class="btn btn-primary grow" href="#/pro/availability">Manage availability</a>` : `
        <button class="bb-icon" id="more">${icon('more', 22)}<span>${DR.t('More')}</span></button>
        <button class="bb-icon" id="similar">${icon('similar', 22)}<span>${DR.t('Similar')}</span></button>
        <button class="btn btn-gold grow col" id="follow"><b>${followed ? DR.t('Following') : DR.t('Follow')}</b><small>${p.followers + (followed && !p.isUser ? 1 : 0)} followers</small></button>
        <a class="btn btn-primary grow" href="#/book/${p.id}">${DR.t('Book now')}</a>
        <p class="bb-note">${icon('shield', 12)} Every booking protected by Done Right Protection</p>`}
      </div>`,
      mount(el) {
        const gal = el.querySelector('#gal');
        const counter = el.querySelector('#galCount');
        gal.addEventListener('scroll', DR.u.debounce(() => { counter.textContent = `${Math.round(gal.scrollLeft / gal.clientWidth) + 1}/${photos.length}`; }, 50));
        const bio = el.querySelector('#bio'); if (bio) bio.onclick = () => bio.classList.toggle('clamp2');
        const toggleFollow = () => {
          if (own) return;
          DR.store.update((s) => { s.follows.providers = followed ? s.follows.providers.filter((x) => x !== p.id) : [p.id, ...s.follows.providers]; });
          DR.ui.toast(followed ? 'Unfollowed' : `Following ${p.name} — we'll tell you when they're nearby`);
        };
        el.querySelector('#followTop').onclick = toggleFollow;
        el.querySelector('#share').onclick = () => DR.share(p.name, `${p.name} · ${p.role} on Done Right`);
        el.addEventListener('click', (e) => { const u = e.target.closest('[data-useful]'); if (u) { u.classList.add('brand'); u.lastChild.textContent = ` Useful ${parseInt(u.textContent.replace(/\D/g, '') || '0', 10) + 1}`; } });
        if (own) return;
        el.querySelector('#follow').onclick = toggleFollow;
        el.querySelector('#similar').onclick = () => {
          const sim = DR.data.providers().filter((x) => x.id !== p.id && x.groupId === p.groupId).sort((a, b) => DR.data.dist(a) - DR.data.dist(b)).slice(0, 12);
          DR.ui.sheet({ title: `Similar to “${esc(p.name)}”`, full: true, html: `<div class="plist flush">${sim.map((x) => DR.cards.provider(x)).join('') || '<p class="muted pad">No similar providers nearby.</p>'}</div>` });
        };
        el.querySelector('#more').onclick = () => {
          const shopFollowed = p.shop && S().follows.shops.includes(p.shop);
          const sh = DR.ui.sheet({
            html: `<div class="action-grid">
              <button data-a="chat">${icon('chat', 26)}<span>Message</span></button>
              <button data-a="orders">${icon('history', 26)}<span>Order history</span></button>
              <button data-a="list">${icon('heart', 26)}<span>Follow list</span></button>
              ${p.shop ? `<button data-a="shop">${icon('store', 26)}<span>${shopFollowed ? 'Unfollow shop' : 'Follow shop'}</span></button>` : ''}
              <button data-a="hide">${icon('sad', 26)}<span>Hide provider</span></button>
              <button data-a="report">${icon('alert', 26)}<span>Report</span></button>
            </div><button class="btn btn-ghost btn-block mt12" data-close>Cancel</button>`,
            mount(s) {
              s.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-a]'); if (!b) return;
                const a = b.dataset.a;
                sh.close();
                if (a === 'chat') DR.router.go('/chat/' + p.id);
                if (a === 'orders') DR.router.go('/orders');
                if (a === 'list') DR.router.go('/cart?tab=following');
                if (a === 'shop') { DR.store.update((st) => { st.follows.shops = shopFollowed ? st.follows.shops.filter((x) => x !== p.shop) : [p.shop, ...st.follows.shops]; }, { render: false }); DR.ui.toast(shopFollowed ? 'Shop unfollowed' : 'Shop followed'); }
                if (a === 'hide' && await DR.ui.confirm({ title: `Hide ${esc(p.name)}?`, text: 'You won\'t see this provider in listings. You can undo this in Settings › Blocked providers.', ok: 'Hide', danger: true })) {
                  DR.store.update((st) => { st.blocked.push(p.id); }, { render: false });
                  DR.ui.toast('Provider hidden'); DR.router.back('/nearby');
                }
                if (a === 'report') reportSheet(p);
              });
            },
          });
        };
      },
    };
  });

  function reportSheet(p) {
    const reasons = ['Profile photos don\'t match the person', 'Inappropriate or unsafe behaviour', 'Asked to pay outside Done Right', 'Fake credentials or reviews', 'No-show or late', 'Other'];
    const sh = DR.ui.sheet({
      title: 'Report provider',
      html: `<p class="muted small mb8">Reports are confidential. Our Trust & Safety team reviews every report within 24 hours.</p>
        <div class="list">${reasons.map((r, i) => `<label class="list-item"><span>${r}</span><input type="radio" name="reason" value="${i}"></label>`).join('')}</div>
        <textarea class="input mt12" rows="3" placeholder="Tell us more (optional)"></textarea>
        <button class="btn btn-danger btn-block mt12" id="send">Submit report</button>`,
      mount(s) { s.querySelector('#send').onclick = () => { if (!s.querySelector('input:checked')) return DR.ui.toast('Please choose a reason'); sh.close(); DR.ui.toast('Report submitted. Thank you for keeping Done Right safe.'); }; },
    });
  }

  // ---------------------------------------------------------------- Credentials
  const mask = (name) => name.split(' ').map((w, i) => (i === 0 ? w : w[0] + '*'.repeat(Math.max(1, w.length - 1)))).join(' ');
  function docCard(title, lines, file) {
    return `<div class="doc">${file ? (file.image ? `<img data-file="${file.id}" alt="${esc(title)}">` : `<div class="doc-pdf">${icon('doc', 36)}<span>${esc(file.name)}</span></div>`) : `<div class="doc-paper"><div class="doc-seal">${icon('award', 26)}</div><h4>${esc(title)}</h4>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`}<div class="watermark" aria-hidden="true">${'Done Right · verification only '.repeat(14)}</div></div>`;
  }
  DR.page('/provider/:id/credentials', ({ params }) => {
    const p = DR.data.provider(params.id);
    if (!p) return DR.notFound('Provider not found');
    const C = DR.COUNTRIES[p.country];
    const u = S().users[p.id];
    const idv = u && u.verification && u.verification.identity;
    const r = DR.u.rng('cred' + p.id);
    const tag = (ok, pending) => ok ? `<span class="tag tag-verified">${icon('check', 12)} Verified</span>` : pending ? '<span class="tag tag-gold">In review</span>' : '<span class="tag tag-grey">Not provided</span>';
    const assessDate = DR.u.addDays(new Date(), -p.joinedMonths * 30 + 7);
    return {
      title: 'Credentials',
      html: `${DR.ui.navbar({ title: 'Credentials' })}
      <section class="card"><div class="card-h"><h2>Identity verification</h2>${tag(p.verified.identity, p.identityPending)}</div>
        <p class="small">${esc(mask(p.name))} · ${esc(idv ? idv.docType : C.idDocs[0])} ${esc(idv ? idv.masked : `•••• ${DR.u.between(r, 100, 999)}${String.fromCharCode(65 + DR.u.between(r, 0, 25))}`)}</p>
        <p class="muted xs mt4">Checked against government-issued ID with liveness selfie${p.photoMatch ? ` · face match ${p.photoMatch}%` : ''}. Full ID numbers are never shown publicly.</p></section>
      ${p.verified.assessment ? `<section class="card"><div class="card-h"><h2>Done Right skills assessment</h2>${tag(true)}</div>
        <div class="doc"><div class="doc-paper cert-paper"><h4 class="cert-title">Certificate of Assessment</h4><p class="cert-name">${esc(p.name)} <small>(ID: ${p.id})</small></p>
          <p>has completed Done Right service-standards training and passed the on-site practical assessment for <b>${esc(p.services.map((s) => s.name).join(', '))}</b>, achieving a rating of <b>${esc(p.services[0].assessed || 'Good')}</b>.</p>
          <div class="row between mt12"><span>Assessor: ${esc(DR.u.pick(r, ['L. Tan', 'N. Rahman', 'K. Pillai', 'M. Wong']))}</span><span class="cert-org">Done Right Trust & Safety<br>${DR.u.fmtDate(DR.u.dateKey(assessDate))}</span></div>
          <div class="cert-stamp">DONE RIGHT<br>VERIFIED</div></div><div class="watermark" aria-hidden="true">${'Done Right · verification only '.repeat(14)}</div></div></section>` : ''}
      ${p.verified.business || (u && u.verification && u.verification.business) ? `<section class="card"><div class="card-h"><h2>Business registration</h2>${tag(p.verified.business, u && u.verification.business && u.verification.business.status === 'pending')}</div>
        <p class="small">${esc(p.shop || (u && u.verification.business.name) || '')}</p><p class="muted xs">${C.bizReg}: •••••${DR.u.between(r, 100, 999)}${String.fromCharCode(65 + DR.u.between(r, 0, 25))}</p>
        ${docCard(p.country === 'SG' ? 'ACRA Business Profile' : 'SSM Business Registration', [esc(p.shop || ''), `Registered in ${C.name}`, 'Status: Live'], p.businessDoc)}</section>` : ''}
      ${p.certs.map((c) => `<section class="card"><div class="card-h"><h2>${esc(c.name)}</h2>${tag(c.verified, c.status === 'pending')}</div><p class="muted small">${esc(c.issuer)}${c.issued ? ` · issued ${fmtMonth(c.issued)}` : ''}</p>${docCard(c.name, [`Awarded to <b>${esc(p.name)}</b>`, esc(c.issuer), c.credentialId ? `Credential ID ${esc(c.credentialId)}` : ''], c.file)}</section>`).join('')}
      ${p.education.filter((e) => e.file).map((e) => `<section class="card"><div class="card-h"><h2>${esc(e.degree)}</h2>${tag(e.verified, e.status === 'pending')}</div><p class="muted small">${esc(e.school)}</p>${docCard(e.degree, [], e.file)}</section>`).join('')}
      <section class="card"><div class="card-h"><h2>Background check</h2>${tag(p.verified.background)}</div><p class="muted small">${p.verified.background ? `No adverse records found (${esc(C.police.split(' or ')[0])}).` : 'Not submitted. Required for childcare, tuition, eldercare and wellness categories.'}</p></section>
      <section class="card"><div class="card-h"><h2>Service commitment</h2><span class="tag tag-verified">${icon('check', 12)} Signed</span></div>
        <ol class="pledge"><li>I will provide services lawfully, honestly and courteously, and protect customers' rights.</li><li>I will not offer or promote any illegal, unsafe, fraudulent or indecent services.</li><li>I will keep all bookings, communication and payments on Done Right.</li><li>I will respect customer privacy under the ${esc(C.privacyLaw)}.</li></ol></section>`,
    };
  });

  // ---------------------------------------------------------------- Reviews
  DR.page('/provider/:id/reviews', ({ params, query }) => {
    const p = DR.data.provider(params.id);
    if (!p) return DR.notFound('Provider not found');
    const all = DR.data.reviews(p);
    const f = query.f || 'all';
    const sort = query.sort || 'latest';
    const scale = all.length ? p.reviews / all.length : 1;
    const est = (n) => (p.isUser ? n : Math.round(n * scale));
    const filters = [['all', 'All', () => true], ['vip', 'VIP', (r) => r.vip], ['repeat', 'Repeat', (r) => r.repeat], ['positive', 'Positive', (r) => r.stars >= 4], ['neutral', 'Neutral & negative', (r) => r.stars < 4], ['photos', 'With photos', (r) => r.photos]];
    const fn = (filters.find((x) => x[0] === f) || filters[0])[2];
    let list = all.filter(fn);
    if (sort === 'useful') list = list.slice().sort((a, b) => (b.useful || 0) - (a.useful || 0));
    return {
      title: `${p.name}'s reviews`,
      html: `${DR.ui.navbar({ title: `${esc(p.name)}'s reviews` })}
      <nav class="tabs tabs-scroll tabs-count">${filters.map(([k, l, fx]) => `<a class="tab-link ${f === k ? 'on' : ''}" href="#/provider/${p.id}/reviews?f=${k}&sort=${sort}"><span>${l}</span><small>${k === 'all' ? p.reviews : est(all.filter(fx).length)}</small></a>`).join('')}</nav>
      <div class="row between pad mt12 small"><span class="muted">${icon('verified', 14)} Only customers with completed bookings can review</span>
        <span class="row gap10"><a class="${sort === 'latest' ? '' : 'muted'}" href="#/provider/${p.id}/reviews?f=${f}&sort=latest">Latest</a><a class="${sort === 'useful' ? '' : 'muted'}" href="#/provider/${p.id}/reviews?f=${f}&sort=useful">Useful</a></span></div>
      <div class="card">${list.map(DR.reviewItem).join('') || '<p class="muted center pad-v">No reviews in this filter.</p>'}</div>`,
      mount(el) { el.addEventListener('click', (e) => { const u = e.target.closest('[data-useful]'); if (u && !u.classList.contains('brand')) { u.classList.add('brand'); u.lastChild.textContent = ` Useful ${parseInt(u.textContent.replace(/\D/g, '') || '0', 10) + 1}`; } }); },
    };
  });
})(window.DR);
