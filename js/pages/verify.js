/* Done Right — Verification centre: identity, education, certifications, work experience,
 * background check & business registration (LinkedIn-style credentials). */
(function (DR) {
  'use strict';
  const { esc, fmtMonth } = DR.u;
  const { icon } = DR.ui;
  const S = () => DR.store.s;
  const REVIEW_MS = 20000;

  DR.verify = {
    tag(st) {
      return { verified: `<span class="tag tag-verified">${icon('check', 12)} Verified</span>`, pending: '<span class="tag tag-gold">In review</span>', rejected: '<span class="tag tag-red">Rejected</span>' }[st] || '<span class="tag tag-grey">Not submitted</span>';
    },
    score(u) {
      const v = u.verification || {};
      const ok = (x) => x && x.status === 'verified';
      const any = (arr) => (arr || []).some(ok);
      const items = [[10, true], [35, ok(v.identity)], [10, any(v.education)], [15, any(v.certifications)], [10, any(v.experience)], [10, ok(v.background)], [10, ok(v.business)]];
      const score = items.reduce((a, [w, done]) => a + (done ? w : 0), 0);
      return { score, level: score >= 80 ? 'Pro Verified' : score >= 45 ? 'Verified' : 'Basic', done: items.filter((i) => i[1]).length, total: items.length };
    },
    // Demo: simulate Trust & Safety review completing ~20s after submission
    tick(u) {
      const v = u && u.verification;
      if (!v) return false;
      let changed = false;
      const due = (x) => x && x.status === 'pending' && Date.now() - (x.submittedAt || 0) > REVIEW_MS;
      const approve = (x) => { x.status = 'verified'; x.verifiedAt = Date.now(); changed = true; };
      ['identity', 'business', 'background'].forEach((k) => { if (due(v[k])) approve(v[k]); });
      ['education', 'certifications', 'experience'].forEach((k) => (v[k] || []).forEach((x) => { if (due(x)) approve(x); }));
      if (changed) DR.store.save();
      return changed;
    },
    approveAll(u) {
      const v = u.verification || {};
      const ap = (x) => { if (x && x.status === 'pending') { x.status = 'verified'; x.verifiedAt = Date.now(); } };
      ['identity', 'business', 'background'].forEach((k) => ap(v[k]));
      ['education', 'certifications', 'experience'].forEach((k) => (v[k] || []).forEach(ap));
      DR.store.save();
    },
  };
  const demoNote = (st) => (st === 'pending' ? `<div class="demo-box mx">${icon('sparkle', 14)} <b>Demo:</b> reviews complete automatically ~20 seconds after submission. <button class="link" data-approve>Approve now</button></div>` : '');
  const bindApprove = (el, u) => el.addEventListener('click', (e) => { if (e.target.closest('[data-approve]')) { DR.verify.approveAll(u); DR.ui.toast('Approved (demo)'); DR.router.refresh(); } });

  // ---------------------------------------------------------------- Centre
  DR.page('/verify', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    DR.verify.tick(u);
    const v = u.verification || {};
    const sc = DR.verify.score(u);
    const C = DR.COUNTRIES[u.country || S().country];
    const listStatus = (arr) => { arr = arr || []; if (!arr.length) return DR.verify.tag(); const ok = arr.filter((x) => x.status === 'verified').length; return ok ? `<span class="tag tag-verified">${ok} verified</span>${arr.length > ok ? ` <span class="tag tag-gold">${arr.length - ok} in review</span>` : ''}` : '<span class="tag tag-gold">In review</span>'; };
    const bgNeeded = u.provider && u.provider.subs.some((id) => DR.SUB[id] && DR.GROUP[DR.SUB[id].groupId].bg);
    const item = (href, ic, title, desc, status, req) => `<a class="v-item" href="#${href}"><span class="v-icon">${icon(ic, 22)}</span><div class="grow minw0"><div class="row gap6"><b>${title}</b>${req ? `<span class="tag tag-red-o">${req}</span>` : ''}</div><p class="muted xs">${desc}</p><div class="mt4">${status}</div></div>${icon('right', 16, 'muted')}</a>`;
    const r = 34, circ = 2 * Math.PI * r;
    return {
      title: 'Verification centre',
      html: `${DR.ui.navbar({ title: DR.t('Verification centre') })}
      <section class="card v-hero">
        <svg viewBox="0 0 80 80" class="ring" aria-hidden="true"><circle cx="40" cy="40" r="${r}" class="ring-bg"/><circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - sc.score / 100)}"/><text x="40" y="45" text-anchor="middle">${sc.score}</text></svg>
        <div class="grow"><div class="muted xs">Trust level</div><h2 class="h2">${sc.level}</h2><p class="small muted">Verified profiles rank higher in search and earn more customer trust.</p></div>
      </section>
      <div class="levels mx">${[['Basic', 0], ['Verified', 45], ['Pro Verified', 80]].map(([l, t]) => `<div class="level ${sc.score >= t ? 'on' : ''}"><i></i><small>${l}</small></div>`).join('')}</div>
      <div class="card flush">
        ${item('/settings', 'phone', 'Mobile number', esc(u.phone || u.email || ''), '<span class="tag tag-verified">Verified</span>')}
        ${item('/verify/identity', 'id', 'Identity verification', `${C.idDocs.join(' / ')} + selfie, or ${C.digitalId}`, DR.verify.tag(v.identity && v.identity.status), 'Required')}
        ${item('/verify/education', 'grad', 'Education', 'Schools, diplomas and degrees', listStatus(v.education))}
        ${item('/verify/certifications', 'award', 'Licences & certifications', 'Professional licences, coaching and technical certificates', listStatus(v.certifications))}
        ${item('/verify/experience', 'briefcase', 'Work experience', 'Past and current roles, like a LinkedIn profile', listStatus(v.experience))}
        ${item('/verify/background', 'shield', 'Background check', 'Required for childcare, tuition, eldercare & wellness', DR.verify.tag(v.background && v.background.status), bgNeeded ? 'Required' : '')}
        ${item('/verify/business', 'store', 'Business registration', `${C.bizReg} for companies & sole proprietors`, DR.verify.tag(v.business && v.business.status))}
      </div>
      <p class="notice mx">${icon('lock', 16)} Documents are encrypted, reviewed only by Done Right Trust & Safety and processed under the ${esc(C.privacyLaw)}. Public profiles show masked, watermarked copies only.</p>
      ${demoNote(Object.values(v).flat().some((x) => x && x.status === 'pending') ? 'pending' : '')}`,
      mount(el) { bindApprove(el, u); },
    };
  });

  // ---------------------------------------------------------------- Identity
  const idDraft = {};
  function maskId(num) {
    const m = num.toUpperCase().replace(/[\s-]/g, '');
    return m.length <= 4 ? '••••' : m[0] + '•'.repeat(Math.max(3, m.length - 5)) + m.slice(-4);
  }
  DR.page('/verify/identity', () => {
    if (!DR.requireAuth()) return null;
    const u = DR.store.user();
    DR.verify.tick(u);
    const C = DR.COUNTRIES[u.country || S().country];
    const iv = (u.verification || {}).identity;
    const d = Object.assign(idDraft, { docType: idDraft.docType || C.idDocs[0] });
    if (iv && iv.status !== 'rejected' && !idDraft.redo) {
      return {
        title: 'Identity verification',
        html: `${DR.ui.navbar({ title: 'Identity verification' })}
          <section class="card center"><div class="big-icon ${iv.status}">${icon(iv.status === 'verified' ? 'verified' : 'clock', 40)}</div><h2 class="h2 mt8">${iv.status === 'verified' ? 'Identity verified' : 'Verification in review'}</h2><p class="muted small">${iv.status === 'verified' ? 'A verified badge is now shown on your profile.' : 'We usually review documents within 1 working day.'}</p></section>
          <section class="card"><div class="kv"><span>Name</span><b>${esc(iv.fullName)}</b></div><div class="kv"><span>Document</span><b>${esc(iv.docType)} ${esc(iv.masked)}</b></div><div class="kv"><span>Method</span><b>${iv.method === 'digital' ? esc(C.digitalId) : 'Document upload + selfie'}</b></div><div class="kv"><span>Submitted</span><b>${DR.u.fmtTs(iv.submittedAt)}</b></div><div class="kv"><span>Status</span>${DR.verify.tag(iv.status)}</div></section>
          ${demoNote(iv.status)}
          <div class="pad"><button class="btn btn-ghost btn-block" id="redo">Update identity documents</button></div>`,
        mount(el) { bindApprove(el, u); el.querySelector('#redo').onclick = () => { idDraft.redo = true; DR.router.refresh(); }; },
      };
    }
    const passport = d.docType === 'Passport';
    return {
      title: 'Identity verification',
      html: `${DR.ui.navbar({ title: 'Identity verification' })}
      ${iv && iv.status === 'rejected' ? `<p class="notice notice-red mx">${icon('alert', 16)} Your last submission was rejected: ${esc(iv.reason || 'documents unclear')}. Please resubmit.</p>` : ''}
      <section class="card">
        <h2 class="h2">Instant verification</h2><p class="muted small">Securely share your verified identity details from ${esc(C.digitalId)} — no uploads needed.</p>
        <button class="btn btn-digital btn-block mt12" id="digital">${icon('id', 18)} Verify with ${esc(C.digitalId)}</button>
      </section>
      <div class="or mx"><span>or upload documents</span></div>
      <form class="card form" id="idf" novalidate>
        ${DR.ui.field('Document type', `<select class="input" name="docType">${C.idDocs.map((x) => `<option ${x === d.docType ? 'selected' : ''}>${x}</option>`).join('')}</select>`, '', true)}
        ${DR.ui.field('Full name (as shown on document)', `<input class="input" name="fullName" value="${esc(d.fullName || u.name || '')}" autocomplete="name">`, '', true)}
        ${DR.ui.field(`${esc(d.docType)} number`, `<input class="input" name="number" autocomplete="off" value="${esc(d.number || '')}" placeholder="${passport ? 'e.g. K1234567' : C.idHint}">`, 'Only the last 4 characters are stored — the full number is never shown.', true)}
        <div class="row gap10">${DR.ui.field('Date of birth', `<input class="input" type="date" name="dob" value="${esc(d.dob || u.dob || '')}">`, '', true)}${DR.ui.field('Nationality', `<select class="input" name="nationality">${(C.code === 'SG' ? ['Singapore Citizen', 'Singapore PR', 'Malaysian', 'Other'] : ['Malaysian', 'Permanent Resident', 'Singaporean', 'Other']).map((x) => `<option ${x === d.nationality ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}</div>
        <div class="upload-row">
          <div><span class="field-label">${passport ? 'Photo page' : 'Front of card'} <b class="brand">*</b></span>${DR.ui.upload('front', d.front, { label: 'Front', accept: 'image/*' })}</div>
          ${passport ? '' : `<div><span class="field-label">Back of card <b class="brand">*</b></span>${DR.ui.upload('back', d.back, { label: 'Back', accept: 'image/*' })}</div>`}
        </div>
        <div><span class="field-label">Selfie holding your document <b class="brand">*</b></span>${DR.ui.upload('selfie', d.selfie, { label: 'Take a selfie', accept: 'image/*', capture: 'user' })}<span class="field-hint">Face and document clearly visible, no glasses or masks.</span></div>
        <label class="check"><input type="checkbox" name="consent" ${d.consent ? 'checked' : ''}><span class="small">I consent to Done Right collecting and using my identity document and selfie to verify my identity, in line with the ${esc(C.privacyLaw)}.</span></label>
        <button class="btn btn-primary btn-block">Submit for review</button>
      </form>`,
      mount(el) {
        const f = el.querySelector('#idf');
        DR.ui.bindUploads(f, d);
        f.addEventListener('input', (e) => { if (e.target.name && e.target.type !== 'file') d[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
        f.docType.addEventListener('change', () => DR.router.refresh());
        const save = (rec) => {
          DR.store.update((s) => { const us = s.users[u.id]; us.verification = us.verification || {}; us.verification.identity = rec; if (!us.name) us.name = rec.fullName; if (!us.dob && rec.dob) us.dob = rec.dob; }, { render: false });
          Object.keys(idDraft).forEach((k) => delete idDraft[k]);
          DR.router.refresh();
        };
        el.querySelector('#digital').onclick = () => {
          const sh = DR.ui.sheet({ cls: 'sheet-dialog', html: `<div class="dialog center"><div class="spinner"></div><h3 class="mt12">Connecting to ${esc(C.digitalId)}…</h3><p class="muted small">Demo — a simulated consent flow</p></div>` });
          setTimeout(() => {
            sh.close();
            save({ status: 'verified', method: 'digital', docType: C.idDocs[0], fullName: u.name || 'Verified User', masked: C.code === 'SG' ? 'S•••567A' : '9001•••5678', dob: u.dob || '', nationality: C.code === 'SG' ? 'Singapore Citizen' : 'Malaysian', submittedAt: Date.now(), verifiedAt: Date.now() });
            DR.ui.toast(`Verified with ${C.digitalId}`);
          }, 1500);
        };
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const num = (d.number || '').trim();
          if (!(d.fullName || '').trim()) return DR.ui.toast('Enter your full name as shown on the document');
          if (!num) return DR.ui.toast('Enter your document number');
          if (d.docType !== 'Passport' && ['NRIC', 'FIN', 'MyKad', 'MyPR'].includes(d.docType) && !C.idPattern.test(num.replace(/\s/g, ''))) return DR.ui.toast(`That doesn't look like a valid ${d.docType} number (${C.idHint})`);
          if (!d.dob) return DR.ui.toast('Enter your date of birth');
          if (!d.front || (d.docType !== 'Passport' && !d.back) || !d.selfie) return DR.ui.toast('Please upload all required photos');
          if (!f.consent.checked) return DR.ui.toast('Please give consent to continue');
          save({ status: 'pending', method: 'upload', docType: d.docType, fullName: d.fullName.trim(), masked: maskId(num), dob: d.dob, nationality: d.nationality || f.nationality.value, files: { front: d.front, back: d.back || null, selfie: d.selfie }, submittedAt: Date.now() });
          DR.ui.toast('Submitted — we\'ll notify you once reviewed');
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
      line: (x) => [`<b>${esc(x.school)}</b>`, `${esc(x.degree)}${x.field ? `, ${esc(x.field)}` : ''}`, `<span class="muted xs">${esc(x.start || '')}${x.end ? ` – ${esc(x.end)}` : ''}${x.grade ? ` · ${esc(x.grade)}` : ''}</span>`],
    },
    certifications: {
      title: 'Licences & certifications', icon: 'award', add: 'Add licence or certificate', empty: 'Show customers you\'re qualified — e.g. SwimSafer instructor, ABRSM, AWS / Google ML, EMA licence, CIDESCO.',
      fields: [['name', 'Name', 'text', true], ['issuer', 'Issuing organisation', 'text', true], ['issued', 'Issue date', 'month', true], ['expiry', 'Expiry date (leave blank if none)', 'month'], ['credentialId', 'Credential ID', 'text'], ['url', 'Credential URL', 'url'], ['file', 'Upload certificate', 'file', true]],
      line: (x) => [`<b>${esc(x.name)}</b>`, esc(x.issuer), `<span class="muted xs">Issued ${fmtMonth(x.issued)}${x.expiry ? ` · Expires ${fmtMonth(x.expiry)}` : ' · No expiry'}${x.credentialId ? ` · ID ${esc(x.credentialId)}` : ''}</span>`],
    },
    experience: {
      title: 'Work experience', icon: 'briefcase', add: 'Add experience', empty: 'Add current and past roles. A reference letter or payslip (optional) helps us verify faster.',
      fields: [['title', 'Title', 'text', true], ['type', 'Employment type', 'select', false, EMP], ['company', 'Company / organisation', 'text', true], ['location', 'Location', 'text'], ['start', 'Start date', 'month', true], ['end', 'End date', 'month'], ['current', 'I currently work here', 'checkbox'], ['desc', 'Description', 'textarea'], ['file', 'Reference letter (optional)', 'file']],
      line: (x) => [`<b>${esc(x.title)}</b>`, `${esc(x.company)}${x.type ? ` · ${esc(x.type)}` : ''}`, `<span class="muted xs">${fmtMonth(x.start)} – ${x.current ? 'Present' : fmtMonth(x.end)}${x.location ? ` · ${esc(x.location)}` : ''}</span>`],
    },
  };

  function fieldHTML([name, label, type, req, opts], v, kind, cc) {
    const val = v[name] == null ? '' : v[name];
    let inner;
    if (type === 'select') inner = `<select class="input" name="${name}"><option value="">Select…</option>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (type === 'textarea') inner = `<textarea class="input" name="${name}" rows="3" maxlength="800">${esc(val)}</textarea>`;
    else if (type === 'checkbox') return `<label class="check"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}><span>${label}</span></label>`;
    else if (type === 'file') return `<div><span class="field-label">${label}${req ? ' <b class="brand">*</b>' : ''}</span>${DR.ui.upload(name, v[name] || null)}</div>`;
    else if (type === 'year') inner = `<input class="input" type="number" name="${name}" min="1960" max="2040" value="${esc(val)}" inputmode="numeric">`;
    else inner = `<input class="input" type="${type}" name="${name}" value="${esc(val)}" ${name === 'school' ? 'list="schools"' : ''}>`;
    return DR.ui.field(label, inner, '', req);
  }

  function itemSheet(kindKey, u, existing) {
    const K = KINDS[kindKey];
    const cc = u.country || S().country;
    const draft = Object.assign({}, existing || {});
    const suggestions = kindKey === 'certifications' && u.provider ? DR.CERT_SUGGESTIONS(u.provider.subs, cc) : [];
    const sh = DR.ui.sheet({
      title: existing ? `Edit ${K.title.toLowerCase()}` : K.add, full: true,
      html: `<form class="form" id="kf" novalidate>
        ${suggestions.length && !existing ? `<div><span class="field-label">Suggested for your services</span><div class="chips">${suggestions.map(([n, i]) => `<button type="button" class="chip" data-sug="${esc(n)}|${esc(i)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
        ${K.fields.map((fd) => fieldHTML(fd, draft, kindKey, cc)).join('')}
        <datalist id="schools">${Object.values(DR.COUNTRIES).flatMap((c) => c.schools).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <div class="row gap10 mt8">${existing ? '<button type="button" class="btn btn-ghost" id="del">Delete</button>' : ''}<button class="btn btn-primary grow">Save & submit for review</button></div>
      </form>`,
      mount(s) {
        const f = s.querySelector('#kf');
        DR.ui.bindUploads(f, draft);
        const syncCurrent = () => { if (f.current && f.end) { f.end.disabled = f.current.checked; if (f.current.checked) f.end.value = ''; } };
        syncCurrent();
        f.addEventListener('change', syncCurrent);
        s.addEventListener('click', async (e) => {
          const sg = e.target.closest('[data-sug]');
          if (sg) { const [n, i] = sg.dataset.sug.split('|'); f.name.value = n; f.issuer.value = i; }
          if (e.target.closest('#del') && await DR.ui.confirm({ title: 'Delete this entry?', ok: 'Delete', danger: true })) {
            DR.store.update((st) => { const uv = st.users[u.id].verification; uv[kindKey] = uv[kindKey].filter((x) => x.id !== existing.id); }, { render: false });
            sh.close(); DR.router.refresh();
          }
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const rec = Object.assign({}, draft);
          K.fields.forEach(([name, label, type, req]) => {
            if (type === 'file') return;
            rec[name] = type === 'checkbox' ? f[name].checked : f[name].value.trim();
          });
          const missing = K.fields.find(([name, , type, req]) => req && (type === 'file' ? !rec[name] : !rec[name]));
          if (missing) return DR.ui.toast(`${missing[1]} is required`);
          if (rec.start && rec.end && rec.end < rec.start) return DR.ui.toast('End date must be after start date');
          if (kindKey === 'experience' && !rec.current && !rec.end) return DR.ui.toast('Add an end date or tick “I currently work here”');
          if (rec.url && !/^https?:\/\//i.test(rec.url)) return DR.ui.toast('Credential URL must start with https://');
          rec.id = rec.id || DR.u.uid('v');
          rec.status = 'pending'; rec.submittedAt = Date.now();
          DR.store.update((st) => { const us = st.users[u.id]; us.verification = us.verification || {}; const arr = us.verification[kindKey] = us.verification[kindKey] || []; const i = arr.findIndex((x) => x.id === rec.id); if (i >= 0) arr[i] = rec; else arr.unshift(rec); }, { render: false });
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
      DR.verify.tick(u);
      const K = KINDS[key];
      const list = (u.verification && u.verification[key]) || [];
      return {
        title: K.title, bar: true,
        html: `${DR.ui.navbar({ title: K.title })}
          ${list.length ? `<div class="card">${list.map((x) => `<div class="li-item"><div class="li-logo ${key === 'education' ? 'edu' : 'cert'}">${icon(K.icon, 20)}</div><div class="grow minw0">${K.line(x).map((l) => `<div class="ellipsis">${l}</div>`).join('')}<div class="row gap6 mt4">${DR.verify.tag(x.status)}${x.file ? `<span class="chip-xs">${icon('doc', 11)} ${esc(x.file.name)}</span>` : ''}</div></div><button class="icon-btn sm" data-edit="${x.id}" aria-label="Edit">${icon('edit', 16)}</button></div>`).join('')}</div>`
          : `<div class="card center pad-v">${icon(K.icon, 40, 'muted')}<p class="muted small mt8">${K.empty}</p></div>`}
          ${demoNote(list.some((x) => x.status === 'pending') ? 'pending' : '')}
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
      DR.verify.tick(u);
      const C = DR.COUNTRIES[u.country || S().country];
      const cur = (u.verification || {})[key];
      const d = Object.assign({ type: cfg.types ? cfg.types[0] : '' }, cur || {});
      return {
        title: cfg.title,
        html: `${DR.ui.navbar({ title: cfg.title })}
          ${cur ? `<section class="card row between"><span><b>Status</b><br><small class="muted">Submitted ${DR.u.fmtTs(cur.submittedAt)}</small></span>${DR.verify.tag(cur.status)}</section>` : ''}
          ${demoNote(cur && cur.status)}
          <section class="card"><p class="small">${cfg.intro(C)}</p></section>
          <form class="card form" id="sf" novalidate>
            ${cfg.types ? DR.ui.field('Type', DR.ui.seg(cfg.types.map((t) => [t, t]), d.type, 'type')) : ''}
            ${cfg.fields(C, d)}
            <div><span class="field-label">${cfg.uploadLabel(C)} <b class="brand">*</b></span>${DR.ui.upload('file', d.file || null)}</div>
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
            const vals = Object.fromEntries(new FormData(f));
            const err = cfg.validate(vals, C);
            if (err) return DR.ui.toast(err);
            if (!d.file) return DR.ui.toast('Please upload the required document');
            if (!f.consent.checked) return DR.ui.toast('Please confirm consent to continue');
            delete vals.consent;
            const rec = Object.assign({}, vals, { type: d.type, file: d.file, status: 'pending', submittedAt: Date.now() });
            DR.store.update((s) => { const us = s.users[u.id]; us.verification = us.verification || {}; us.verification[key] = rec; }, { render: false });
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
    intro: (C) => `A clean background check is <b>required</b> for childcare, tuition, eldercare, nursing and home wellness services, and recommended for everyone entering customers' homes. Upload your ${esc(C.police)}.`,
    fields: (C, d) => `${DR.ui.field('Issued by', `<input class="input" name="issuer" value="${esc(d.issuer || (C.code === 'SG' ? 'Singapore Police Force' : 'Polis Diraja Malaysia (PDRM)'))}">`, '', true)}
      ${DR.ui.field('Issue date', `<input class="input" type="date" name="issued" value="${esc(d.issued || '')}" max="${DR.u.dateKey(new Date())}">`, 'Must be issued within the last 12 months', true)}`,
    uploadLabel: () => 'Clearance certificate',
    consent: (C) => `I consent to Done Right verifying this certificate with the issuing authority, in line with the ${esc(C.privacyLaw)}.`,
    validate: (v) => { if (!v.issued) return 'Enter the issue date'; if (Date.now() - new Date(v.issued).getTime() > 365 * 86400000) return 'Certificate must be issued within the last 12 months'; return ''; },
  });
})(window.DR);
