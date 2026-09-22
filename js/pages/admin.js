/* Done Right — Trust & Safety review console (demo). In production this is an internal back office
 * behind SSO + role-based access, with document access logged and time-limited. */
(function (DR) {
  'use strict';
  const { esc, fmtTs } = DR.u;
  const { icon } = DR.ui;
  const S = () => DR.store.s;

  function docs(rec) {
    const files = [];
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.id && String(o.id).startsWith('f_')) files.push(o); else Object.values(o).forEach(walk); };
    walk(rec.files || rec.file || null);
    if (rec.file && !files.includes(rec.file)) files.push(rec.file);
    return files;
  }
  function detail(kind, rec) {
    const kv = (k, v) => (v ? `<div class="kv"><span>${k}</span><b data-no-i18n>${esc(v)}</b></div>` : '');
    const checks = [];
    if (kind === 'identity') {
      checks.push(['Duplicate ID', rec.status === 'rejected' && /Duplicate/.test(rec.reason || '') ? 'Duplicate found' : 'Unique', !/Duplicate/.test(rec.reason || '')]);
      checks.push(['Liveness', rec.liveness === 'passed' ? 'Passed (3 frames)' : rec.liveness === 'digital' ? 'Digital ID' : 'Manual selfie', rec.liveness !== 'manual']);
      if (rec.faceMatch) checks.push(['Face match', `${rec.faceMatch}%`, rec.faceMatch >= 90]);
      if (rec.docExpiry) checks.push(['Document expiry', rec.docExpiry, new Date(rec.docExpiry) > new Date()]);
    }
    if (rec.registerCheck) checks.push(['Public register', `${rec.registerCheck.source}: ${rec.registerCheck.status}`, rec.registerCheck.found]);
    return `${kv('Name', rec.fullName || rec.name)}${kv('Document', rec.docType ? `${rec.docType} ${rec.masked || ''}` : '')}${kv('Date of birth', rec.dob)}${kv('Issuer', rec.issuer)}${kv('Licence', rec.licenceId && DR.LICENCES[rec.licenceId] ? DR.LICENCES[rec.licenceId].name : '')}${kv('Number', rec.credentialId || rec.regNo)}${kv('School', rec.school)}${kv('Qualification', rec.degree)}${kv('Title', rec.title)}${kv('Company', rec.company)}${kv('Issued', rec.issued)}${kv('Expiry', rec.expiry)}
      ${checks.length ? `<div class="checks-grid">${checks.map(([k, v, ok]) => `<span class="${ok ? 'green' : 'brand'}">${icon(ok ? 'checkCircle' : 'alert', 14)} ${k}: <b data-no-i18n>${esc(v)}</b></span>`).join('')}</div>` : ''}
      ${docs(rec).length ? `<div class="admin-docs">${docs(rec).map((f) => (f.image ? `<img data-file="${f.id}" alt="">` : `<span class="chip-xs">${icon('doc', 12)} ${esc(f.name)}</span>`)).join('')}</div>` : ''}`;
  }

  DR.page('/admin', ({ query }) => {
    const live = DR.backend.enabled;
    if (live && !DR.backend.staff) {
      return { title: 'Trust & Safety console', seo: { noindex: true }, html: `${DR.ui.navbar({ title: 'Trust & Safety' })}${DR.ui.empty('shield', 'Staff only')}` };
    }
    const tab = query.tab || 'pending';
    const all = Object.values(S().users).flatMap((u) => DR.verify.items(u));
    const pending = all.filter((x) => x.rec.status === 'pending');
    const reviewed = all.filter((x) => ['verified', 'rejected', 'expired'].includes(x.rec.status)).sort((a, b) => (b.rec.verifiedAt || b.rec.reviewedAt || 0) - (a.rec.verifiedAt || a.rec.reviewedAt || 0)).slice(0, 40);
    const list = tab === 'pending' ? pending : reviewed;
    const card = ({ u, kind, rec }, i) => `<div class="card admin-item">
      <div class="row between gap8"><b>${esc(DR.verify.label(kind, rec))}</b>${DR.verify.tag(rec.status)}</div>
      <div class="muted xs"><span data-no-i18n>${esc(u.name || u.id)}</span> · ${u.id} · ${DR.COUNTRIES[u.country || 'SG'].flag} · submitted ${rec.submittedAt ? fmtTs(rec.submittedAt) : '—'}</div>
      <div class="mt8">${detail(kind, rec)}</div>
      ${rec.status === 'pending' ? `<div class="row gap8 mt12"><button class="btn btn-ghost grow" data-reject="${i}">Reject</button><button class="btn btn-primary grow" data-approve="${i}">Approve</button></div>` : rec.reason ? `<p class="xs brand mt8">${esc(rec.reason)}</p>` : ''}
    </div>`;
    return {
      title: 'Trust & Safety console', seo: { noindex: true },
      html: `${DR.ui.navbar({ title: 'Trust & Safety' })}
        ${live ? '' : `<p class="notice notice-gold mx">${icon('alert', 16)}<span>Demo reviewer console. In production this is an internal back office with SSO, role-based access and logged, time-limited document viewing.</span></p>`}
        ${live ? '' : `<div class="card flush">
          <label class="list-item"><span><b>Auto-approve after 20 s</b><br><small class="muted">Simulates reviewers for demos</small></span><span class="switch"><input type="checkbox" id="auto" ${S().demo.autoApprove !== false ? 'checked' : ''}><i></i></span></label>
          <label class="list-item"><span><b>Simulate counterparts</b><br><small class="muted">Seed providers accept requests & send quotes; sample customers reply</small></span><span class="switch"><input type="checkbox" id="sim" ${S().demo.simulate !== false ? 'checked' : ''}><i></i></span></label>
        </div>`}
        <nav class="tabs">${[['pending', `Pending (${pending.length})`], ['reviewed', 'Reviewed'], ['audit', 'Audit log']].map(([k, l]) => `<a class="tab-link ${tab === k ? 'on' : ''}" href="#/admin?tab=${k}">${l}</a>`).join('')}</nav>
        ${tab === 'audit' ? `<div class="card">${S().audit.slice(0, 100).map((a) => `<div class="audit-row"><span class="muted xs">${fmtTs(a.ts)}</span><span class="small"><b data-no-i18n>${esc(a.actor)}</b> · ${esc(a.action)} · <span data-no-i18n>${esc(a.item || '')}</span>${a.reason ? ` — <i>${esc(a.reason)}</i>` : ''}</span></div>`).join('') || '<p class="muted small">No events yet.</p>'}</div>`
        : list.map(card).join('') || DR.ui.empty('box', tab === 'pending' ? 'Nothing waiting for review' : 'No reviewed items yet')}`,
      mount(el) {
        if (!live) {
          el.querySelector('#auto').onchange = (e) => DR.store.update((s) => { s.demo.autoApprove = e.target.checked; }, { render: false });
          el.querySelector('#sim').onchange = (e) => DR.store.update((s) => { s.demo.simulate = e.target.checked; }, { render: false });
        }
        // with a backend, decisions are made by the review_item database function (staff only, audited)
        const decide = async (it, status, reason) => {
          if (live) await DR.backend.review(it.rec.rid, status, reason);
          else { DR.verify.setStatus(it.u, it.kind, it.rec, status, { reason, actor: 'reviewer' }); DR.store.save(); }
        };
        el.addEventListener('click', async (e) => {
          const a = e.target.closest('[data-approve]');
          if (a) {
            try { await decide(list[+a.dataset.approve], 'verified'); DR.ui.toast('Approved'); } catch (err) { DR.ui.toast(err.message); }
            DR.router.refresh();
          }
          const r = e.target.closest('[data-reject]');
          if (r) {
            const it = list[+r.dataset.reject];
            const sh = DR.ui.sheet({
              title: 'Reject reason',
              html: `<div class="list">${DR.REJECT_REASONS.map((x, i) => `<label class="list-item"><span>${x}</span><input type="radio" name="rr" value="${i}" ${i === 0 ? 'checked' : ''}></label>`).join('')}</div><button class="btn btn-danger btn-block mt12" id="rj">Reject</button>`,
              mount(s) {
                s.querySelector('#rj').onclick = async () => {
                  const reason = DR.REJECT_REASONS[+s.querySelector('input:checked').value];
                  try { await decide(it, 'rejected', reason); sh.close(); DR.ui.toast('Rejected — user notified'); } catch (err) { DR.ui.toast(err.message); }
                  DR.router.refresh();
                };
              },
            });
          }
        });
      },
    };
  });
})(window.DR);
