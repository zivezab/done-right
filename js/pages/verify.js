/* Done Right — Verification centre: identity (+ liveness, duplicate-ID detection, document expiry),
 * education, licences & certifications (licence types + public-register checks), work experience,
 * background check & business registration. All documents are stored AES-256-GCM encrypted. */
(function (DR) {
  'use strict';
  const { esc, fmtMonth } = DR.u;
  const { icon } = DR.ui;
  const S = () => DR.store.s;
  const CONSENT_VERSION = '2026-09';
  const REJECT_REASONS = ['Document unclear or cropped', 'Name does not match profile', 'Document expired', 'Face does not match ID photo', 'Not found in public register', 'Suspected altered document', 'Duplicate identity'];
  DR.REJECT_REASONS = REJECT_REASONS;
  const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  // ------------------------------------------------------------ public register lookup (simulated)
  DR.registry = {
    check(licenceId, number) {
      const L = DR.LICENCES[licenceId];
      return new Promise((res) => setTimeout(() => {
        const n = String(number || '').trim();
        const found = !!L && !!n && L.pattern.test(n);
        res({ found, status: found ? 'Active' : 'Not found', source: L ? L.register : 'Register', checkedAt: Date.now() });
      }, 700));
    },
  };

  const LIST_KINDS = ['education', 'certifications', 'experience'];
  const SINGLE_KINDS = ['identity', 'business', 'background'];
  DR.verify = {
    CONSENT_VERSION,
    tag(st) {
      return {
        verified: `<span class="tag tag-verified">${icon('check', 12)} Verified</span>`, pending: '<span class="tag tag-gold">In review</span>',
        rejected: '<span class="tag tag-red">Rejected</span>', expired: '<span class="tag tag-red">Expired</span>',
      }[st] || '<span class="tag tag-grey">Not submitted</span>';
    },
    score(u) {
      const v = u.verification || {};
      const ok = (x) => x && x.status === 'verified';
      const any = (arr) => (arr || []).some(ok);
      const items = [[10, true], [35, ok(v.identity)], [10, any(v.education)], [15, any(v.certifications)], [10, any(v.experience)], [10, ok(v.background)], [10, ok(v.business)]];
      const score = items.reduce((a, [w, done]) => a + (done ? w : 0), 0);
      return { score, level: score >= 80 ? 'Pro Verified' : score >= 45 ? 'Verified' : 'Basic', done: items.filter((i) => i[1]).length, total: items.length };
    },
    // flatten a user's verification records
    items(u) {
      const v = u.verification || {};
      const out = [];
      SINGLE_KINDS.forEach((k) => { if (v[k]) out.push({ u, kind: k, rec: v[k] }); });
      LIST_KINDS.forEach((k) => (v[k] || []).forEach((rec) => out.push({ u, kind: k, rec })));
      return out;
    },
    label(kind, rec) {
      return { identity: `Identity · ${rec.docType || ''}`, business: `Business · ${rec.name || ''}`, background: 'Background check', education: `Education · ${rec.school || ''}`, certifications: `${rec.licenceId ? 'Licence' : 'Certificate'} · ${rec.name || ''}`, experience: `Experience · ${rec.title || ''}` }[kind];
    },
    setStatus(u, kind, rec, status, { reason = '', actor = 'reviewer' } = {}) {
      rec.status = status;
      if (status === 'verified') { rec.verifiedAt = Date.now(); delete rec.reason; }
      if (status === 'rejected') { rec.reason = reason; rec.reviewedAt = Date.now(); }
      DR.store.audit({ actor, userId: u.id, item: this.label(kind, rec), action: status, reason });
    },
    expiring(u, days = 60, now = Date.now()) {
      const out = [];
      const v = u.verification || {};
      (v.certifications || []).forEach((c) => {
        if (c.expiry && c.status === 'verified') {
          const [y, m] = c.expiry.split('-').map(Number);
          const t = new Date(y, m, 0).getTime();
          if (t - now < days * 86400000) out.push({ label: c.name, when: t, href: '/verify/certifications' });
        }
      });
      if (v.background && v.background.status === 'verified' && v.background.issued) {
        const t = new Date(v.background.issued).getTime() + 365 * 86400000;
        if (t - now < days * 86400000) out.push({ label: 'Background check', when: t, href: '/verify/background' });
      }
      if (v.identity && v.identity.docExpiry && v.identity.status === 'verified') {
        const t = new Date(v.identity.docExpiry).getTime();
        if (t - now < days * 86400000) out.push({ label: `${v.identity.docType}`, when: t, href: '/verify/identity' });
      }
      return out.sort((a, b) => a.when - b.when);
    },
    // expiry + demo auto-review for every user; returns true when something changed
    tickAll(now = Date.now()) {
      if (DR.backend.enabled) return false;   // the server lapses documents and staff review them
      let changed = false;
      const auto = S().demo.autoApprove !== false;
      const wait = (DR.CONFIG.demo && DR.CONFIG.demo.reviewMs) || 20000;
      Object.values(S().users).forEach((u) => {
        const v = u.verification; if (!v) return;
        this.items(u).forEach(({ kind, rec }) => {
          // expiry
          let expired = false;
          if (kind === 'certifications' && rec.expiry && rec.expiry < ymNow()) expired = true;
          if (kind === 'background' && rec.issued && now - new Date(rec.issued).getTime() > 365 * 86400000) expired = true;
          if (kind === 'identity' && rec.docExpiry && new Date(rec.docExpiry).getTime() < now) expired = true;
          if (expired && rec.status !== 'expired') { this.setStatus(u, kind, rec, 'expired', { actor: 'system' }); changed = true; return; }
          if (auto && rec.status === 'pending' && now - (rec.submittedAt || 0) > wait) { this.setStatus(u, kind, rec, 'verified', { actor: 'auto-review (demo)' }); changed = true; }
        });
      });
      if (changed) DR.store.save();
      return changed;
    },
    approveAllPending(u) { this.items(u).forEach(({ kind, rec }) => { if (rec.status === 'pending') this.setStatus(u, kind, rec, 'verified', { actor: 'reviewer (demo)' }); }); DR.store.save(); },
    // identity number uniqueness (hashed — the raw number is never stored)
    async idHash(cc, docType, number) { return DR.u.sha256(`${cc}|${docType}|${String(number).toUpperCase().replace(/[\s-]/g, '')}`); },
    async claimId(u, cc, docType, number) {
      const h = await this.idHash(cc, docType, number);
      const owner = S().idRegistry[h];
      if (owner && owner !== u.id && S().users[owner]) return { ok: false, hash: h };
      S().idRegistry[h] = u.id;
      return { ok: true, hash: h };
    },
  };
  const hasPending = (u) => DR.verify.items(u).some((x) => x.rec.status === 'pending');
  const demoNote = (u) => (hasPending(u) ? `<div class="demo-box mx">${icon('sparkle', 14)} <b>Demo:</b> ${S().demo.autoApprove !== false ? 'reviews complete automatically ~20 seconds after submission, or ' : 'auto-review is off — '}review items in the <a class="link" href="#/admin">Trust & Safety console</a>. <button class="link" data-approve>Approve now</button></div>` : '');
  const bindApprove = (el, u) => el.addEventListener('click', (e) => { if (e.target.closest('[data-approve]')) { DR.verify.approveAllPending(u); DR.ui.toast('Approved (demo)'); DR.router.refresh(); } });
  const rejectedNote = (rec) => (rec && rec.status === 'rejected' ? `<p class="notice notice-red mx">${icon('alert', 16)} <span>Rejected: <b>${esc(rec.reason || 'please resubmit')}</b>. Please update and resubmit.</span></p>` : rec && rec.status === 'expired' ? `<p class="notice notice-red mx">${icon('alert', 16)} <span>This document has expired — upload a current one to keep your badge.</span></p>` : '');

  // ---------------------------------------------------------------- Centre
  DR.page('/verify', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    DR.verify.tickAll();
    const v = u.verification || {};
    const sc = DR.verify.score(u);
    const C = DR.COUNTRIES[u.country || S().country];
    const exp = DR.verify.expiring(u);
    const listStatus = (arr) => {
      arr = arr || []; if (!arr.length) return DR.verify.tag();
      const c = (st) => arr.filter((x) => x.status === st).length;
      return [c('verified') ? `<span class="tag tag-verified">${c('verified')} verified</span>` : '', c('pending') ? `<span class="tag tag-gold">${c('pending')} in review</span>` : '', c('rejected') + c('expired') ? `<span class="tag tag-red">${c('rejected') + c('expired')} need attention</span>` : ''].join(' ');
    };
    const subs = u.provider ? u.provider.subs : [];
    const bgNeeded = subs.some((id) => DR.lic.bgRequired(id));
    const licNeeded = DR.lic.relevant(subs, u.country || 'SG');
    const item = (href, ic, title, desc, status, req) => `<a class="v-item" href="#${href}"><span class="v-icon">${icon(ic, 22)}</span><div class="grow minw0"><div class="row gap6 wrap"><b>${title}</b>${req ? `<span class="tag tag-red-o">${req}</span>` : ''}</div><p class="muted xs">${desc}</p><div class="mt4">${status}</div></div>${icon('right', 16, 'muted')}</a>`;
    const r = 34, circ = 2 * Math.PI * r;
    return {
      title: 'Verification centre', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: ('Verification centre') })}
      <section class="card v-hero">
        <svg viewBox="0 0 80 80" class="ring" aria-hidden="true"><circle cx="40" cy="40" r="${r}" class="ring-bg"/><circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - sc.score / 100)}"/><text x="40" y="45" text-anchor="middle">${sc.score}</text></svg>
        <div class="grow"><div class="muted xs">Trust level</div><h2 class="h2">${sc.level}</h2><p class="small muted">Verified profiles rank higher in search and earn more customer trust.</p></div>
      </section>
      <div class="levels mx">${[['Basic', 0], ['Verified', 45], ['Pro Verified', 80]].map(([l, t]) => `<div class="level ${sc.score >= t ? 'on' : ''}"><i></i><small>${l}</small></div>`).join('')}</div>
      ${exp.length ? `<div class="notice notice-gold mx">${icon('clock', 16)}<span><b>Expiring soon:</b> ${exp.map((x) => `<a class="link" href="#${x.href}">${esc(x.label)}</a> (${DR.u.fmtTs(x.when).split(',')[0]})`).join(', ')}</span></div>` : ''}
      <div class="card flush">
        ${item('/settings', 'phone', 'Mobile number', esc(u.phone || u.email || ''), '<span class="tag tag-verified">Verified</span>')}
        ${item('/verify/identity', 'id', 'Identity verification', `${C.idDocs.join(' / ')} + liveness selfie, or ${C.digitalId}`, DR.verify.tag(v.identity && v.identity.status), 'Required')}
        ${item('/verify/certifications', 'award', 'Licences & certifications', licNeeded.length ? `Required for your services: ${esc(DR.lic.label(licNeeded.slice(0, 2)))}${licNeeded.length > 2 ? '…' : ''}` : 'Professional licences, coaching and technical certificates', listStatus(v.certifications), licNeeded.length ? 'Required' : '')}
        ${item('/verify/education', 'grad', 'Education', 'Schools, diplomas and degrees', listStatus(v.education))}
        ${item('/verify/experience', 'briefcase', 'Work experience', 'Past and current roles, like a LinkedIn profile', listStatus(v.experience))}
        ${item('/verify/background', 'shield', 'Background check', 'Required for childcare, tuition, eldercare, wellness & pet sitting', DR.verify.tag(v.background && v.background.status), bgNeeded ? 'Required' : '')}
        ${item('/verify/business', 'store', 'Business registration', `${C.bizReg} for companies & sole proprietors`, DR.verify.tag(v.business && v.business.status))}
      </div>
      <p class="notice mx">${icon('lock', 16)} <span>Documents are encrypted on this device (AES-256-GCM), reviewed only by Done Right Trust & Safety and processed under the ${esc(C.privacyLaw)}. Public profiles show masked, watermarked copies only.</span></p>
      ${demoNote(u)}`,
      mount(el) { bindApprove(el, u); },
    };
  });

  // ---------------------------------------------------------------- Liveness check (camera challenge-response)
  const CHALLENGES = ['Look straight at the camera', 'Turn your head slowly to the left', 'Turn your head slowly to the right', 'Smile', 'Blink twice', 'Move a little closer'];
  DR.liveness = function (onDone) {
    const steps = CHALLENGES.slice(1).sort(() => Math.random() - 0.5).slice(0, 2);
    steps.unshift(CHALLENGES[0]);
    let stream = null; let cancelled = false;
    const sh = DR.ui.sheet({
      title: 'Liveness check', full: true,
      html: `<div class="live"><div class="live-frame"><video id="lv" autoplay playsinline muted></video><div class="live-oval"></div></div>
        <p class="live-step" id="ls">Starting camera…</p><div class="live-dots">${steps.map(() => '<i></i>').join('')}</div>
        <p class="muted xs center mt8">Frames are encrypted on your device and only used to confirm you are a real person matching your ID.</p>
        <div id="lfall" hidden><p class="notice notice-red mt12">${icon('alert', 16)} <span>Camera unavailable. You can upload a clear selfie holding your ID instead — this goes to manual review.</span></p>${DR.ui.upload('selfie', null, { label: 'Upload selfie with ID', accept: 'image/*', capture: 'user', secure: true })}</div></div>`,
      onClose() { cancelled = true; if (stream) stream.getTracks().forEach((t) => t.stop()); },
      async mount(s) {
        const video = s.querySelector('#lv');
        const label = s.querySelector('#ls');
        const fallback = () => {
          label.textContent = ('Camera not available');
          s.querySelector('#lfall').hidden = false;
          const tgt = {};
          DR.ui.bindUploads(s, tgt, () => { onDone({ status: 'manual', frames: [tgt.selfie], challenges: [] }); sh.close(); });
        };
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480 }, audio: false }); }
        catch (e) { return fallback(); }
        video.srcObject = stream;
        await new Promise((r) => { video.onloadedmetadata = r; setTimeout(r, 1500); });
        const frames = [];
        for (let i = 0; i < steps.length; i++) {
          if (cancelled) return;
          for (let c = 3; c > 0; c--) { label.textContent = `${steps[i]} · ${c}`; await new Promise((r) => setTimeout(r, 700)); if (cancelled) return; }
          const cv = document.createElement('canvas'); cv.width = video.videoWidth || 480; cv.height = video.videoHeight || 360;
          cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
          frames.push({ id: await DR.files.put(cv.toDataURL('image/jpeg', 0.7), { secure: true }), name: `liveness-${i + 1}.jpg`, image: true, secure: true });
          s.querySelectorAll('.live-dots i')[i].classList.add('on');
        }
        stream.getTracks().forEach((t) => t.stop());
        label.textContent = ('Liveness confirmed ✓');
        setTimeout(() => { onDone({ status: 'passed', frames, challenges: steps }); sh.close(); }, 700);
      },
    });
  };

  // ---------------------------------------------------------------- Identity
  const idDraft = {};
  const EXPIRING_DOCS = ['FIN', 'Passport', 'MyPR', 'MyKAS'];
  function maskId(num) {
    const m = num.toUpperCase().replace(/[\s-]/g, '');
    return m.length <= 4 ? '••••' : m[0] + '•'.repeat(Math.max(3, m.length - 5)) + m.slice(-4);
  }
  DR.page('/verify/identity', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    DR.verify.tickAll();
    const cc = u.country || S().country;
    const C = DR.COUNTRIES[cc];
    const iv = (u.verification || {}).identity;
    const d = Object.assign(idDraft, { docType: idDraft.docType || C.idDocs[0] });
    if (iv && ['pending', 'verified'].includes(iv.status) && !idDraft.redo) {
      return {
        title: 'Identity verification', seo: { noindex: true },
        html: `${DR.ui.navbar({ title: 'Identity verification' })}
          <section class="card center"><div class="big-icon ${iv.status}">${icon(iv.status === 'verified' ? 'verified' : 'clock', 40)}</div><h2 class="h2 mt8">${iv.status === 'verified' ? 'Identity verified' : 'Verification in review'}</h2><p class="muted small">${iv.status === 'verified' ? 'A verified badge is now shown on your profile.' : 'We usually review documents within 1 working day.'}</p></section>
          <section class="card"><div class="kv"><span>Name</span><b data-no-i18n>${esc(iv.fullName)}</b></div><div class="kv"><span>Document</span><b>${esc(iv.docType)} ${esc(iv.masked)}</b></div>
            ${iv.docExpiry ? `<div class="kv"><span>Document expiry</span><b>${DR.u.fmtDate(iv.docExpiry)}</b></div>` : ''}
            <div class="kv"><span>Method</span><b>${iv.method === 'digital' ? esc(C.digitalId) : 'Document upload + selfie'}</b></div>
            <div class="kv"><span>Liveness</span><b>${iv.liveness === 'passed' ? `${icon('check', 13, 'green')} Passed` : iv.liveness === 'digital' ? esc(C.digitalId) : ('Manual review')}</b></div>
            ${iv.faceMatch ? `<div class="kv"><span>Face match</span><b>${iv.faceMatch}%</b></div>` : ''}
            <div class="kv"><span>Duplicate check</span><b>${icon('check', 13, 'green')} Unique identity</b></div>
            <div class="kv"><span>Submitted</span><b>${DR.u.fmtTs(iv.submittedAt)}</b></div><div class="kv"><span>Status</span>${DR.verify.tag(iv.status)}</div></section>
          <p class="notice mx">${icon('lock', 16)} <span>Your documents are stored encrypted. Only the last 4 characters of your ID number are kept.</span></p>
          ${demoNote(u)}
          <div class="pad"><button class="btn btn-ghost btn-block" id="redo">Update identity documents</button></div>`,
        mount(el) { bindApprove(el, u); el.querySelector('#redo').onclick = () => { idDraft.redo = true; DR.router.refresh(); }; },
      };
    }
    const passport = d.docType === 'Passport';
    const needsExpiry = EXPIRING_DOCS.includes(d.docType);
    return {
      title: 'Identity verification', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Identity verification' })}
      ${rejectedNote(iv)}
      <section class="card">
        <h2 class="h2">Instant verification</h2><p class="muted small">Securely share your verified identity details from ${esc(C.digitalId)} — no uploads needed.</p>
        <button class="btn btn-digital btn-block mt12" id="digital">${icon('id', 18)} Verify with ${esc(C.digitalId)}</button>
      </section>
      <div class="or mx"><span>or upload documents</span></div>
      <form class="card form" id="idf" novalidate>
        ${DR.ui.field('Document type', `<select class="input" name="docType">${C.idDocs.map((x) => `<option ${x === d.docType ? 'selected' : ''}>${x}</option>`).join('')}</select>`, '', true)}
        ${DR.ui.field('Full name (as shown on document)', `<input class="input" name="fullName" value="${esc(d.fullName || u.name || '')}" autocomplete="name">`, '', true)}
        ${DR.ui.field(`${esc(d.docType)} number`, `<input class="input" name="number" autocomplete="off" value="${esc(d.number || '')}" placeholder="${passport ? 'e.g. K1234567' : C.idHint}">`, 'Only the last 4 characters are stored. A one-way hash prevents the same ID being used on two accounts.', true)}
        <div class="row gap10">${DR.ui.field('Date of birth', `<input class="input" type="date" name="dob" value="${esc(d.dob || u.dob || '')}">`, '', true)}${DR.ui.field('Nationality', `<select class="input" name="nationality">${(cc === 'SG' ? ['Singapore Citizen', 'Singapore PR', 'Malaysian', 'Other'] : ['Malaysian', 'Permanent Resident', 'Singaporean', 'Other']).map((x) => `<option ${x === d.nationality ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}</div>
        ${needsExpiry ? DR.ui.field('Document expiry date', `<input class="input" type="date" name="docExpiry" min="${DR.u.dateKey(new Date())}" value="${esc(d.docExpiry || '')}">`, 'We will remind you before it expires', true) : ''}
        <div class="upload-row">
          <div><span class="field-label">${passport ? 'Photo page' : 'Front of card'} <b class="brand">*</b></span>${DR.ui.upload('front', d.front, { label: 'Front', accept: 'image/*', secure: true })}</div>
          ${passport ? '' : `<div><span class="field-label">Back of card <b class="brand">*</b></span>${DR.ui.upload('back', d.back, { label: 'Back', accept: 'image/*', secure: true })}</div>`}
        </div>
        <div class="live-box"><div class="row gap10">${icon('scan', 24, d.liveness ? 'green' : 'brand')}<div class="grow"><b>Liveness check</b> <b class="brand">*</b><p class="muted xs">${d.liveness ? (d.liveness.status === 'passed' ? ('Completed — 3 frames captured') : ('Selfie uploaded — manual review')) : ('A 10-second camera check with simple prompts. Confirms you are a real person matching your ID.')}</p></div>
          <button type="button" class="btn ${d.liveness ? 'btn-ghost' : 'btn-primary'} btn-sm" id="live">${d.liveness ? 'Redo' : 'Start'}</button></div></div>
        <label class="check"><input type="checkbox" name="consent" ${d.consent ? 'checked' : ''}><span class="small">I consent to Done Right collecting and using my identity document and liveness images to verify my identity, in line with the ${esc(C.privacyLaw)} (consent v${CONSENT_VERSION}).</span></label>
        <button class="btn btn-primary btn-block">Submit for review</button>
      </form>`,
      mount(el) {
        const f = el.querySelector('#idf');
        DR.ui.bindUploads(f, d);
        f.addEventListener('input', (e) => { if (e.target.name && e.target.type !== 'file') d[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
        f.docType.addEventListener('change', () => DR.router.refresh());
        el.querySelector('#live').onclick = () => DR.liveness((res) => { d.liveness = res; DR.router.refresh(); });
        const save = (rec) => {
          DR.store.update((s) => {
            const us = s.users[u.id]; us.verification = us.verification || {}; us.verification.identity = rec;
            if (!us.name) us.name = rec.fullName; if (!us.dob && rec.dob) us.dob = rec.dob;
            us.consents = Object.assign({}, us.consents, { identity: { version: CONSENT_VERSION, ts: Date.now() } });
            DR.store.audit({ actor: u.id, userId: u.id, item: `Identity · ${rec.docType}`, action: rec.status === 'rejected' ? 'rejected' : 'submitted', reason: rec.reason || '' });
          }, { render: false });
          Object.keys(idDraft).forEach((k) => delete idDraft[k]);
          DR.router.refresh();
        };
        el.querySelector('#digital').onclick = () => {
          const sh = DR.ui.sheet({ cls: 'sheet-dialog', html: `<div class="dialog center"><div class="spinner"></div><h3 class="mt12">Connecting to ${esc(C.digitalId)}…</h3><p class="muted small">Demo — a simulated consent flow</p></div>` });
          setTimeout(async () => {
            sh.close();
            const claim = await DR.verify.claimId(u, cc, 'digital', u.id);
            save({ status: 'verified', method: 'digital', liveness: 'digital', docType: C.idDocs[0], fullName: u.name || 'Verified User', masked: cc === 'SG' ? 'S•••567A' : '9001•••5678', dob: u.dob || '', nationality: cc === 'SG' ? 'Singapore Citizen' : 'Malaysian', idHash: claim.hash, submittedAt: Date.now(), verifiedAt: Date.now() });
            DR.ui.toast(`Verified with ${C.digitalId}`);
          }, 1500);
        };
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          Object.assign(d, Object.fromEntries([...new FormData(f)].filter(([k]) => !['front', 'back'].includes(k))));
          const num = (d.number || '').trim();
          if (!(d.fullName || '').trim()) return DR.ui.toast('Enter your full name as shown on the document');
          if (!num) return DR.ui.toast('Enter your document number');
          if (['NRIC', 'FIN', 'MyKad', 'MyPR'].includes(d.docType) && !C.idPattern.test(num.replace(/\s/g, ''))) return DR.ui.toast(`That doesn't look like a valid ${d.docType} number (${C.idHint})`);
          if (!d.dob) return DR.ui.toast('Enter your date of birth');
          if (DR.data.ageFrom(d.dob) < 18) return DR.ui.toast('You must be 18 or older to verify');
          if (needsExpiry && !d.docExpiry) return DR.ui.toast('Enter the document expiry date');
          if (needsExpiry && new Date(d.docExpiry) < new Date()) return DR.ui.toast('This document has expired');
          if (!d.front || (!passport && !d.back)) return DR.ui.toast('Please upload photos of your document');
          if (!d.liveness) return DR.ui.toast('Please complete the liveness check');
          if (!f.consent.checked) return DR.ui.toast('Please give consent to continue');
          const claim = await DR.verify.claimId(u, cc, d.docType, num);
          const rec = {
            status: claim.ok ? 'pending' : 'rejected', reason: claim.ok ? '' : 'Duplicate identity — this ID is already verified on another account. Contact support if this is a mistake.',
            method: 'upload', docType: d.docType, fullName: d.fullName.trim(), masked: maskId(num), idHash: claim.hash, dob: d.dob, nationality: d.nationality, docExpiry: needsExpiry ? d.docExpiry : null,
            liveness: d.liveness.status, faceMatch: d.liveness.status === 'passed' ? 86 + Math.floor(Math.random() * 13) : null,
            files: { front: d.front, back: d.back || null, liveness: d.liveness.frames }, submittedAt: Date.now(),
          };
          save(rec);
          DR.ui.toast(claim.ok ? 'Submitted — we\'ll notify you once reviewed' : 'This ID is already used by another account');
        });
      },
    };
  });

  // ---------------------------------------------------------------- List-type credentials
  const QUALS = ['PSLE / UPSR', 'GCE O-Level / SPM', 'GCE A-Level / STPM', 'IB Diploma', 'Nitec / Higher Nitec', 'Sijil Kemahiran Malaysia (SKM)', 'Diploma', 'Advanced Diploma', "Bachelor's degree", "Master's degree", 'PhD / Doctorate', 'Postgraduate Diploma in Education', 'Professional qualification', 'Other'];
  const EMP = ['Full-time', 'Part-time', 'Self-employed', 'Freelance', 'Contract', 'Internship', 'Apprenticeship'];
  const KINDS = {
    education: {
      title: 'Education', icon: 'grad', add: 'Add education', empty: 'Add your schools, diplomas and degrees. Upload certificates or transcripts to get a verified badge.',
      fields: [['school', 'School / institution', 'text', true], ['degree', 'Qualification', 'select', true, QUALS], ['field', 'Field of study', 'text'], ['start', 'Start year', 'year'], ['end', 'End year (or expected)', 'year'], ['grade', 'Grade / honours', 'text'], ['file', 'Certificate or transcript', 'file']],
      line: (x) => [`<b data-no-i18n>${esc(x.school)}</b>`, `${esc(x.degree)}${x.field ? `, <span data-no-i18n>${esc(x.field)}</span>` : ''}`, `<span class="muted xs">${esc(x.start || '')}${x.end ? ` – ${esc(x.end)}` : ''}${x.grade ? ` · ${esc(x.grade)}` : ''}</span>`],
    },
    certifications: {
      title: 'Licences & certifications', icon: 'award', add: 'Add licence or certificate', empty: 'Show customers you\'re qualified — e.g. SwimSafer instructor, ABRSM, AWS / Google ML, EMA LEW licence, CIDESCO.',
      fields: [['licenceId', 'Licence type', 'licence'], ['name', 'Name', 'text', true], ['issuer', 'Issuing organisation', 'text', true], ['issued', 'Issue date', 'month', true], ['expiry', 'Expiry date (leave blank if none)', 'month'], ['credentialId', 'Licence / credential number', 'text'], ['url', 'Credential URL', 'url'], ['file', 'Upload certificate', 'file', true]],
      line: (x) => [`<b>${esc(x.name)}</b>${x.licenceId ? ' <span class="tag tag-blue">Licence</span>' : ''}`, esc(x.issuer), `<span class="muted xs">Issued ${fmtMonth(x.issued)}${x.expiry ? ` · Expires ${fmtMonth(x.expiry)}` : ` · No expiry`}${x.credentialId ? ` · ID ${esc(x.credentialId)}` : ''}</span>${x.registerCheck ? `<div class="xs ${x.registerCheck.found ? 'green' : 'brand'}">${icon(x.registerCheck.found ? 'check' : 'alert', 11)} ${esc(x.registerCheck.source)}: ${x.registerCheck.status}</div>` : ''}`],
    },
    experience: {
      title: 'Work experience', icon: 'briefcase', add: 'Add experience', empty: 'Add current and past roles. A reference letter or payslip (optional) helps us verify faster.',
      fields: [['title', 'Title', 'text', true], ['type', 'Employment type', 'select', false, EMP], ['company', 'Company / organisation', 'text', true], ['location', 'Location', 'text'], ['start', 'Start date', 'month', true], ['end', 'End date', 'month'], ['current', 'I currently work here', 'checkbox'], ['desc', 'Description', 'textarea'], ['file', 'Reference letter (optional)', 'file']],
      line: (x) => [`<b data-no-i18n>${esc(x.title)}</b>`, `<span data-no-i18n>${esc(x.company)}</span>${x.type ? ` · ${esc(x.type)}` : ''}`, `<span class="muted xs">${fmtMonth(x.start)} – ${x.current ? ('Present') : fmtMonth(x.end)}${x.location ? ` · <span data-no-i18n>${esc(x.location)}</span>` : ''}</span>`],
    },
  };

  function fieldHTML([name, label, type, req, opts], v, ctx) {
    const val = v[name] == null ? '' : v[name];
    let inner;
    if (type === 'licence') {
      const rel = ctx.relevant;
      const list = DR.lic.forCountry(ctx.cc).sort((a, b) => (rel.includes(b.id) ? 1 : 0) - (rel.includes(a.id) ? 1 : 0));
      inner = `<select class="input" name="licenceId"><option value="">Certificate / course (not a statutory licence)</option>${rel.length ? `<optgroup label="${esc(('Required for your services'))}">${list.filter((l) => rel.includes(l.id)).map((l) => `<option value="${l.id}" ${l.id === val ? 'selected' : ''}>${esc(l.name)} — ${esc(l.issuer)}</option>`).join('')}</optgroup>` : ''}<optgroup label="${esc(('Other licences'))}">${list.filter((l) => !rel.includes(l.id)).map((l) => `<option value="${l.id}" ${l.id === val ? 'selected' : ''}>${esc(l.name)} — ${esc(l.issuer)}</option>`).join('')}</optgroup></select>`;
      return DR.ui.field(label, inner, 'Statutory licences are checked against the public register');
    }
    if (type === 'select') inner = `<select class="input" name="${name}"><option value="">Select…</option>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (type === 'textarea') inner = `<textarea class="input" name="${name}" rows="3" maxlength="800">${esc(val)}</textarea>`;
    else if (type === 'checkbox') return `<label class="check"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}><span>${label}</span></label>`;
    else if (type === 'file') return `<div><span class="field-label">${label}${req ? ' <b class="brand">*</b>' : ''}</span>${DR.ui.upload(name, v[name] || null, { secure: true })}</div>`;
    else if (type === 'year') inner = `<input class="input" type="number" name="${name}" min="1960" max="2040" value="${esc(val)}" inputmode="numeric">`;
    else inner = `<input class="input" type="${type}" name="${name}" value="${esc(val)}" ${name === 'school' ? 'list="schools"' : ''}>`;
    if (name === 'credentialId') return DR.ui.field(label, `<div class="row gap8">${inner}<button type="button" class="btn btn-ghost btn-sm" id="regcheck">${icon('search', 14)} Check register</button></div><div id="regres" class="xs mt4">${v.registerCheck ? `${esc(v.registerCheck.source)}: ${v.registerCheck.status}` : ''}</div>`);
    return DR.ui.field(label, inner, '', req);
  }

  function itemSheet(kindKey, u, existing) {
    const K = KINDS[kindKey];
    const cc = u.country || S().country;
    const draft = Object.assign({}, existing || {});
    const subs = u.provider ? u.provider.subs : [];
    const ctx = { cc, relevant: DR.lic.relevant(subs, cc) };
    const suggestions = kindKey === 'certifications' && u.provider ? DR.CERT_SUGGESTIONS(subs, cc) : [];
    const sh = DR.ui.sheet({
      title: existing ? `Edit ${K.title.toLowerCase()}` : K.add, full: true,
      html: `<form class="form" id="kf" novalidate>
        ${suggestions.length && !existing ? `<div><span class="field-label">Suggested for your services</span><div class="chips">${suggestions.map(([n, i]) => `<button type="button" class="chip" data-sug="${esc(n)}|${esc(i)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
        ${K.fields.map((fd) => fieldHTML(fd, draft, ctx)).join('')}
        <datalist id="schools">${Object.values(DR.COUNTRIES).flatMap((c) => c.schools).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <div class="row gap10 mt8">${existing ? '<button type="button" class="btn btn-ghost" id="del">Delete</button>' : ''}<button class="btn btn-primary grow">Save & submit for review</button></div>
      </form>`,
      mount(s) {
        const f = s.querySelector('#kf');
        DR.ui.bindUploads(f, draft);
        const syncCurrent = () => { if (f.current && f.end) { f.end.disabled = f.current.checked; if (f.current.checked) f.end.value = ''; } };
        syncCurrent();
        f.addEventListener('change', (e) => {
          syncCurrent();
          if (e.target.name === 'licenceId') {
            const L = DR.LICENCES[e.target.value];
            if (L) { f.name.value = L.name; f.issuer.value = L.issuer; f.credentialId.placeholder = L.hint; }
            draft.registerCheck = null; s.querySelector('#regres').textContent = '';
          }
        });
        const runCheck = async () => {
          const lid = f.licenceId && f.licenceId.value;
          if (!lid) { s.querySelector('#regres').textContent = ('Register checks apply to statutory licences only'); return null; }
          s.querySelector('#regres').textContent = ('Checking public register…');
          const r = await DR.registry.check(lid, f.credentialId.value);
          draft.registerCheck = r;
          s.querySelector('#regres').innerHTML = `<span class="${r.found ? 'green' : 'brand'}">${icon(r.found ? 'check' : 'alert', 11)} ${esc(r.source)}: ${r.status}</span>`;
          return r;
        };
        s.addEventListener('click', async (e) => {
          const sg = e.target.closest('[data-sug]');
          if (sg) { const [n, i] = sg.dataset.sug.split('|'); f.name.value = n; f.issuer.value = i; }
          if (e.target.closest('#regcheck')) runCheck();
          if (e.target.closest('#del') && await DR.ui.confirm({ title: 'Delete this entry?', ok: 'Delete', danger: true })) {
            DR.store.update((st) => { const uv = st.users[u.id].verification; uv[kindKey] = uv[kindKey].filter((x) => x.id !== existing.id); }, { render: false });
            DR.files.collect(existing).forEach((id) => DR.files.del(id));
            sh.close(); DR.router.refresh();
          }
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const rec = Object.assign({}, draft);
          K.fields.forEach(([name, , type]) => { if (type !== 'file') rec[name] = type === 'checkbox' ? f[name].checked : f[name].value.trim(); });
          const missing = K.fields.find(([name, , , req]) => req && !rec[name]);
          if (missing) return DR.ui.toast(`${missing[1]} is required`);
          if (rec.start && rec.end && rec.end < rec.start) return DR.ui.toast('End date must be after start date');
          if (rec.expiry && rec.issued && rec.expiry < rec.issued) return DR.ui.toast('Expiry must be after the issue date');
          if (rec.expiry && rec.expiry < ymNow()) return DR.ui.toast('This certificate has already expired');
          if (kindKey === 'experience' && !rec.current && !rec.end) return DR.ui.toast('Add an end date or tick “I currently work here”');
          if (rec.url && !/^https?:\/\//i.test(rec.url)) return DR.ui.toast('Credential URL must start with https://');
          if (rec.licenceId) {
            if (!rec.credentialId) return DR.ui.toast('Enter the licence number');
            if (!DR.LICENCES[rec.licenceId].pattern.test(rec.credentialId)) return DR.ui.toast(`Licence number format looks wrong (${DR.LICENCES[rec.licenceId].hint})`);
            if (!rec.registerCheck || !draft.registerCheck) rec.registerCheck = await runCheck();
          }
          rec.id = rec.id || DR.u.uid('v');
          rec.status = 'pending'; rec.submittedAt = Date.now(); delete rec.reason;
          DR.store.update((st) => {
            const us = st.users[u.id]; us.verification = us.verification || {}; const arr = us.verification[kindKey] = us.verification[kindKey] || [];
            const i = arr.findIndex((x) => x.id === rec.id); if (i >= 0) arr[i] = rec; else arr.unshift(rec);
            DR.store.audit({ actor: u.id, userId: u.id, item: DR.verify.label(kindKey, rec), action: 'submitted' });
          }, { render: false });
          sh.close();
          DR.ui.toast('Saved — submitted for review');
          DR.router.refresh();
        });
      },
    });
  }

  Object.keys(KINDS).forEach((key) => {
    DR.page('/verify/' + key, () => {
      if (!DR.requireAuth()) return null;
      const u = DR.store.user();
      DR.verify.tickAll();
      const K = KINDS[key];
      const list = (u.verification && u.verification[key]) || [];
      const cc = u.country || 'SG';
      const needs = key === 'certifications' && u.provider ? DR.lic.relevant(u.provider.subs, cc).filter((id) => !list.some((c) => c.licenceId === id && ['verified', 'pending'].includes(c.status))) : [];
      return {
        title: K.title, bar: true, seo: { noindex: true },
        html: `${DR.ui.navbar({ title: K.title })}
          ${needs.length ? `<div class="notice notice-gold mx">${icon('award', 16)}<span><b>Licence required:</b> ${needs.map((id) => esc(DR.LICENCES[id].name)).join(', ')} — regulated services stay hidden from customers until verified.</span></div>` : ''}
          ${list.length ? `<div class="card">${list.map((x) => `<div class="li-item"><div class="li-logo ${key === 'education' ? 'edu' : 'cert'}">${icon(K.icon, 20)}</div><div class="grow minw0">${K.line(x).map((l) => `<div class="ellipsis">${l}</div>`).join('')}<div class="row gap6 mt4 wrap">${DR.verify.tag(x.status)}${x.file ? `<span class="chip-xs">${icon('lock', 11)} ${esc(x.file.name)}</span>` : ''}</div>${x.status === 'rejected' && x.reason ? `<div class="xs brand mt4">${esc(x.reason)}</div>` : ''}</div><button class="icon-btn sm" data-edit="${x.id}" aria-label="Edit">${icon('edit', 16)}</button></div>`).join('')}</div>`
          : `<div class="card center pad-v">${icon(K.icon, 40, 'muted')}<p class="muted small mt8">${K.empty}</p></div>`}
          ${demoNote(u)}
          <div class="bottom-bar"><button class="btn btn-primary grow" id="add">${icon('plus', 16)} ${K.add}</button></div>`,
        mount(el) {
          bindApprove(el, u);
          el.querySelector('#add').onclick = () => itemSheet(key, u);
          el.addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) itemSheet(key, u, list.find((x) => x.id === b.dataset.edit)); });
        },
      };
    });
  });

  // ---------------------------------------------------------------- Single-document checks
  function singleDocPage(key, cfg) {
    DR.page('/verify/' + key, () => {
      if (!DR.requireAuth()) return null;
      const u = DR.store.user();
      DR.verify.tickAll();
      const C = DR.COUNTRIES[u.country || S().country];
      const cur = (u.verification || {})[key];
      const d = Object.assign({ type: cfg.types ? cfg.types[0] : '' }, cur || {});
      return {
        title: cfg.title, seo: { noindex: true },
        html: `${DR.ui.navbar({ title: cfg.title })}
          ${cur ? `<section class="card row between"><span><b>Status</b><br><small class="muted">Submitted ${DR.u.fmtTs(cur.submittedAt)}</small></span>${DR.verify.tag(cur.status)}</section>` : ''}
          ${rejectedNote(cur)}${demoNote(u)}
          <section class="card"><p class="small">${cfg.intro(C)}</p></section>
          <form class="card form" id="sf" novalidate>
            ${cfg.types ? DR.ui.field('Type', DR.ui.seg(cfg.types.map((t) => [t, t]), d.type, 'type')) : ''}
            ${cfg.fields(C, d)}
            <div><span class="field-label">${cfg.uploadLabel(C)} <b class="brand">*</b></span>${DR.ui.upload('file', d.file || null, { secure: true })}</div>
            <label class="check"><input type="checkbox" name="consent" ${cur ? 'checked' : ''}><span class="small">${cfg.consent(C)}</span></label>
            <button class="btn btn-primary btn-block">${cur ? 'Update & resubmit' : 'Submit for review'}</button>
          </form>`,
        mount(el) {
          bindApprove(el, u);
          const f = el.querySelector('#sf');
          DR.ui.bindUploads(f, d);
          el.addEventListener('click', (e) => { const t = e.target.closest('[data-type]'); if (t) { d.type = t.dataset.type; el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === t)); } });
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const vals = Object.fromEntries([...new FormData(f)].filter(([k]) => k !== 'file'));
            const err = cfg.validate(vals, C);
            if (err) return DR.ui.toast(err);
            if (!d.file) return DR.ui.toast('Please upload the required document');
            if (!f.consent.checked) return DR.ui.toast('Please confirm consent to continue');
            delete vals.consent;
            const rec = Object.assign({}, vals, { type: d.type, file: d.file, status: 'pending', submittedAt: Date.now() });
            DR.store.update((s) => {
              const us = s.users[u.id]; us.verification = us.verification || {}; us.verification[key] = rec;
              us.consents = Object.assign({}, us.consents, { [key]: { version: CONSENT_VERSION, ts: Date.now() } });
              DR.store.audit({ actor: u.id, userId: u.id, item: DR.verify.label(key, rec), action: 'submitted' });
            }, { render: false });
            DR.ui.toast('Submitted for review');
            DR.router.refresh();
          });
        },
      };
    });
  }

  singleDocPage('business', {
    title: 'Business registration',
    types: ['Sole proprietor', 'Partnership', 'Company'],
    intro: (C) => `Registered businesses get a <b>Registered business</b> badge and can list a shop with multiple providers. Provide your ${C.bizReg} and business profile.`,
    fields: (C, d) => `${DR.ui.field('Registered business name', `<input class="input" name="name" value="${esc(d.name || '')}">`, '', true)}
      ${DR.ui.field(C.bizReg, `<input class="input" name="regNo" value="${esc(d.regNo || '')}" placeholder="${C.bizHint}" autocomplete="off">`, C.bizHint, true)}
      ${DR.ui.field('Registration date', `<input class="input" type="date" name="regDate" value="${esc(d.regDate || '')}">`)}`,
    uploadLabel: (C) => (C.code === 'SG' ? 'ACRA BizFile business profile' : 'SSM certificate / e-Info business profile'),
    consent: () => 'I confirm I am authorised to represent this business and the information is accurate.',
    validate: (v, C) => (!v.name.trim() ? 'Enter the registered business name' : !C.bizPattern.test(v.regNo.trim()) ? `Enter a valid ${C.bizReg} (${C.bizHint})` : ''),
  });
  singleDocPage('background', {
    title: 'Background check',
    intro: (C) => `A clean background check is <b>required</b> for childcare, tuition, eldercare, nursing, home wellness and pet-sitting services, and recommended for everyone entering customers' homes. Upload your ${esc(C.police)}. It must be renewed every 12 months.`,
    fields: (C, d) => `${DR.ui.field('Issued by', `<input class="input" name="issuer" value="${esc(d.issuer || (C.code === 'SG' ? 'Singapore Police Force' : 'Polis Diraja Malaysia (PDRM)'))}">`, '', true)}
      ${DR.ui.field('Issue date', `<input class="input" type="date" name="issued" value="${esc(d.issued || '')}" max="${DR.u.dateKey(new Date())}">`, 'Must be issued within the last 12 months', true)}`,
    uploadLabel: () => 'Clearance certificate',
    consent: (C) => `I consent to Done Right verifying this certificate with the issuing authority, in line with the ${esc(C.privacyLaw)}.`,
    validate: (v) => { if (!v.issued) return 'Enter the issue date'; if (Date.now() - new Date(v.issued).getTime() > 365 * 86400000) return 'Certificate must be issued within the last 12 months'; return ''; },
  });
})(window.DR);
