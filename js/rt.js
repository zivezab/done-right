/* Done Right — chat store, realtime channel (cross-tab BroadcastChannel + storage sync), presence,
 * typing indicators and WebRTC voice calls through masked relay numbers.
 * Production: replace the BroadcastChannel transport with a WebSocket service and route calls through a
 * CPaaS number-masking API (e.g. Twilio Proxy / Vonage / 8x8); the UI and data model stay the same. */
(function (DR) {
  'use strict';
  const S = () => DR.store.s;
  const { esc } = DR.u;
  const me = () => DR.store.sessionId();

  // ------------------------------------------------------------ realtime transport
  DR.rt = (function () {
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('doneright-rt:' + DR.store.KEY) : null;
    const seen = {};
    const typing = {};
    const tabId = DR.u.uid('tab');
    function post(msg) { if (ch) ch.postMessage(Object.assign({ tab: tabId, ts: Date.now() }, msg)); }
    if (ch) {
      ch.onmessage = (e) => {
        const m = e.data;
        if (!m || m.tab === tabId) return;
        if (m.uid) seen[m.uid] = Date.now();
        if (m.type === 'typing') typing[m.tid + '|' + m.uid] = Date.now();
        DR.emit('rt:' + m.type, m);
      };
    }
    setInterval(() => { const u = me(); if (u) post({ type: 'presence', uid: u }); }, 4000);
    return {
      post, tabId, available: !!ch,
      online(uid) { return uid === me() || (seen[uid] && Date.now() - seen[uid] < 10000); },
      lastSeen: (uid) => seen[uid] || null,
      isTyping(tid, uid) { return typing[tid + '|' + uid] && Date.now() - typing[tid + '|' + uid] < 3500; },
    };
  })();

  // ------------------------------------------------------------ chat store
  const REPLIES = {
    provider: ["Hi! Thanks for reaching out 😊 Yes, I'm available — you can pick a slot on my profile.", "Sure, that's included in the service.", "Noted! I'll bring everything that's needed.", 'Let me check my schedule and get back to you shortly.', 'Thank you! Looking forward to it.'],
    support: ['Thanks for contacting Done Right Support. An agent will join this chat within 5 minutes.', 'For urgent booking issues, you can also call our 24/7 hotline listed in the Help Centre.'],
    customer: ['Great, thank you!', 'Noted, see you then.', 'Can you come a little earlier?', 'Thanks for the update 👍'],
  };
  DR.chat = {
    tid: (a, b) => [a, b].sort().join('|'),
    isReal: (id) => !!S().users[id],
    get(a, b) { return S().threads[this.tid(a, b)] || null; },
    ensure(a, b) {
      const tid = this.tid(a, b);
      return S().threads[tid] || (S().threads[tid] = { members: [a, b].sort(), msgs: [], unread: {}, updated: 0 });
    },
    send(from, to, text, opts = {}) {
      text = String(text || '').trim();
      if (!text) return null;
      const th = this.ensure(from, to);
      const m = { from, text, ts: Date.now(), system: !!opts.system };
      th.msgs.push(m); th.updated = m.ts;
      th.unread[to] = (th.unread[to] || 0) + 1;
      DR.store.save();
      DR.rt.post({ type: 'msg', tid: this.tid(from, to), uid: from });
      DR.emit('chat', { tid: this.tid(from, to), m });
      if (!opts.system && !opts.noAuto && !this.isReal(to)) this.autoReply(to, from);
      return m;
    },
    // system notice inside a thread (booking events); never triggers auto-replies
    notify(from, to, text) { if (from && to) this.send(from, to, text, { system: true }); },
    autoReply(bot, user) {
      const pool = bot === 'support' ? REPLIES.support : String(bot).startsWith('demo-') ? REPLIES.customer : REPLIES.provider;
      setTimeout(() => {
        const th = this.ensure(bot, user);
        th.msgs.push({ from: bot, text: pool[Math.floor(Math.random() * pool.length)], ts: Date.now() });
        th.updated = Date.now(); th.unread[user] = (th.unread[user] || 0) + 1;
        DR.store.save();
        DR.emit('chat', { tid: this.tid(bot, user) });
      }, 1200);
    },
    list(uid) { return Object.entries(S().threads).filter(([, t]) => t.members && t.members.includes(uid)).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0)); },
    peer(th, uid) { return th.members.find((m) => m !== uid) || uid; },
    markRead(a, b) { const th = this.get(a, b); if (th && th.unread[a]) { th.unread[a] = 0; DR.store.save(); } },
    unreadTotal(uid) { if (!uid) return 0; return this.list(uid).reduce((n, [, t]) => n + ((t.unread && t.unread[uid]) || 0), 0); },
    name(id) {
      if (id === 'support') return 'Done Right Support';
      if (S().users[id]) return S().users[id].name || 'Done Right user';
      if (String(id).startsWith('demo-')) { const o = S().orders.find((x) => x.userId === id); return o ? o.customerName : 'Customer'; }
      const p = DR.data.provider(id); return p ? p.name : 'User';
    },
    avatar(id, cls) {
      if (id === 'support') return `<span class="${cls} support-av">${DR.ui.icon('headset', 22)}</span>`;
      const u = S().users[id];
      if (u) return u.provider ? DR.cards.pimg(DR.data.fromUser(u), 0, cls) : DR.userAvatar(u, cls);
      const p = !String(id).startsWith('demo-') && DR.data.provider(id);
      return p ? DR.cards.pimg(p, 0, cls) : `<img class="${cls}" src="${DR.ui.avatar(id, 'M', 1)}" alt="">`;
    },
  };

  // ------------------------------------------------------------ masked numbers
  DR.masked = (a, b, cc) => {
    const prefix = (DR.CONFIG.relay || {})[cc || S().country] || '+65 3159';
    return `${prefix} ${String(DR.u.hash(DR.chat.tid(a, b)) % 10000).padStart(4, '0')}`;
  };
  // calls are only allowed between parties with an active booking (or recent one), or with support
  DR.canCall = (a, b, now = Date.now()) => {
    if (b === 'support' || a === 'support') return { ok: true };
    const orders = S().orders.filter((o) => (o.userId === a && o.providerId === b) || (o.userId === b && o.providerId === a));
    const active = orders.find((o) => ['requested', 'upcoming', 'to_confirm'].includes(o.status) || (['to_review', 'completed'].includes(o.status) && now - (o.confirmedAt || o.doneAt || o.createdAt) < 48 * 3600000));
    return active ? { ok: true, order: active } : { ok: false, reason: 'Calls unlock once you have an active booking together — chat is always available.' };
  };

  // ------------------------------------------------------------ voice calls (WebRTC, signalled over the realtime channel)
  DR.call = (function () {
    let cur = null; // { id, peer, pc, stream, sheet, startedAt, timer, role, pendingIce }
    const icon = (n, s) => DR.ui.icon(n, s);
    async function mic() {
      try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return null; }
    }
    function ui(peer, status, role) {
      const cc = S().country;
      const number = DR.masked(me(), peer, cc);
      const html = `<div class="call">
        <div class="call-av">${DR.chat.avatar(peer, 'av-xl round')}</div>
        <h2 class="h2 mt12" data-no-i18n>${esc(DR.chat.name(peer))}</h2>
        <p class="muted small">${icon('lock', 12)} <span>Masked line</span> ${number}</p>
        <p class="call-status" id="callStatus">${status}</p>
        <p class="call-timer" id="callTimer"></p>
        <audio id="callAudio" autoplay playsinline></audio>
        <div class="call-actions">
          ${role === 'incoming' ? `<button class="call-btn call-decline" data-call="decline" aria-label="Decline">${icon('callEnd', 26)}</button><button class="call-btn call-accept" data-call="accept" aria-label="Accept">${icon('call', 26)}</button>`
          : `<button class="call-btn call-mute" data-call="mute" aria-label="Mute">${icon('mic', 24)}</button><button class="call-btn call-decline" data-call="end" aria-label="End call">${icon('callEnd', 26)}</button>`}
        </div>
        <p class="muted xs mt12">Neither side sees the other's real phone number. Calls are routed through Done Right.</p>
      </div>`;
      return DR.ui.sheet({ html, cls: 'call-sheet', persist: true, mount(el) { el.addEventListener('click', onClick); } });
    }
    const setStatus = (t) => { const el = document.getElementById('callStatus'); if (el) el.textContent = (t); };
    function startTimer() {
      if (!cur) return;
      cur.startedAt = Date.now();
      setStatus('Connected');
      cur.timer = setInterval(() => { const el = document.getElementById('callTimer'); if (el && cur) { const s = Math.floor((Date.now() - cur.startedAt) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }, 500);
    }
    function end(notify = true, reason = '') {
      if (!cur) return;
      const c = cur; cur = null;
      clearInterval(c.timer); clearTimeout(c.noAnswer);
      if (notify && c.real) DR.rt.post({ type: 'call-end', callId: c.id, to: c.peer, uid: me() });
      if (c.pc) try { c.pc.close(); } catch (e) { /* ignore */ }
      if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
      const dur = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
      if (c.role !== 'incoming' || dur) DR.chat.notify(me(), c.peer, dur ? `📞 Voice call · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : `📞 ${reason || 'Missed call'}`);
      if (reason) setStatus(reason);
      setTimeout(() => c.sheet && c.sheet.close(), reason ? 1200 : 0);
    }
    function newPC() {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.onicecandidate = (e) => { if (e.candidate && cur) DR.rt.post({ type: 'call-ice', callId: cur.id, to: cur.peer, uid: me(), cand: e.candidate.toJSON() }); };
      pc.ontrack = (e) => { const a = document.getElementById('callAudio'); if (a) { a.srcObject = e.streams[0]; a.play().catch(() => {}); } };
      pc.onconnectionstatechange = () => { if (!cur) return; if (pc.connectionState === 'connected' && !cur.startedAt) startTimer(); if (['failed', 'disconnected'].includes(pc.connectionState)) end(true, 'Call dropped'); };
      return pc;
    }
    async function onClick(e) {
      const b = e.target.closest('[data-call]'); if (!b || !cur) return;
      const a = b.dataset.call;
      if (a === 'end' || a === 'decline') {
        if (a === 'decline' && cur.real) DR.rt.post({ type: 'call-decline', callId: cur.id, to: cur.peer, uid: me() });
        end(a === 'end', a === 'decline' ? 'Declined' : '');
      }
      if (a === 'mute' && cur.stream) { const t = cur.stream.getAudioTracks()[0]; t.enabled = !t.enabled; b.classList.toggle('on', !t.enabled); b.innerHTML = icon(t.enabled ? 'mic' : 'micOff', 24); }
      if (a === 'accept') await accept();
    }
    async function start(peer) {
      const u = me();
      if (!u) return DR.router.go('/auth');
      if (cur) return DR.ui.toast('You are already on a call');
      const perm = DR.canCall(u, peer);
      if (!perm.ok) return DR.ui.toast(perm.reason);
      const real = DR.chat.isReal(peer);
      cur = { id: DR.u.uid('call'), peer, role: 'outgoing', real, pendingIce: [] };
      cur.sheet = ui(peer, 'Calling via Done Right masked line…', 'outgoing');
      if (!real) {
        // demo counterpart (seed provider / demo customer / support): simulated call
        setTimeout(() => cur && setStatus('Ringing…'), 900);
        setTimeout(() => { if (cur) { startTimer(); setStatus('Connected (simulated demo call)'); } }, 2600);
        return;
      }
      if (!DR.rt.online(peer)) setStatus('Ringing… (they may be offline — open their account in another tab to answer)');
      const c = cur;
      c.pc = newPC();
      c.stream = await mic();
      if (c.stream) c.stream.getTracks().forEach((t) => c.pc.addTrack(t, c.stream));
      else { c.pc.addTransceiver('audio', { direction: 'recvonly' }); DR.ui.toast('Microphone unavailable — you can still listen'); }
      const offer = await c.pc.createOffer();
      await c.pc.setLocalDescription(offer);
      DR.rt.post({ type: 'call-offer', callId: c.id, to: peer, uid: u, sdp: offer.sdp });
      c.noAnswer = setTimeout(() => { if (cur === c && !c.startedAt) end(true, 'No answer'); }, 30000);
    }
    async function accept() {
      const c = cur;
      setStatus('Connecting…');
      c.pc = newPC();
      c.stream = await mic();
      if (c.stream) c.stream.getTracks().forEach((t) => c.pc.addTrack(t, c.stream));
      await c.pc.setRemoteDescription({ type: 'offer', sdp: c.offerSdp });
      const ans = await c.pc.createAnswer();
      await c.pc.setLocalDescription(ans);
      for (const cand of c.pendingIce) await c.pc.addIceCandidate(cand).catch(() => {});
      c.pendingIce = [];
      DR.rt.post({ type: 'call-answer', callId: c.id, to: c.peer, uid: me(), sdp: ans.sdp });
      c.sheet.set(c.sheet.body.innerHTML.replace(/<div class="call-actions">[\s\S]*?<\/div>/, `<div class="call-actions"><button class="call-btn call-mute" data-call="mute" aria-label="Mute">${icon('mic', 24)}</button><button class="call-btn call-decline" data-call="end" aria-label="End call">${icon('callEnd', 26)}</button></div>`));
      setStatus('Connecting…');
    }
    // signalling handlers
    DR.on('rt:call-offer', (m) => {
      if (m.to !== me()) return;
      if (cur) { DR.rt.post({ type: 'call-decline', callId: m.callId, to: m.uid, uid: me(), busy: true }); return; }
      cur = { id: m.callId, peer: m.uid, role: 'incoming', real: true, offerSdp: m.sdp, pendingIce: [] };
      cur.sheet = ui(m.uid, 'Incoming call…', 'incoming');
    });
    DR.on('rt:call-answer', async (m) => { if (!cur || m.callId !== cur.id) return; await cur.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); for (const cand of cur.pendingIce) await cur.pc.addIceCandidate(cand).catch(() => {}); cur.pendingIce = []; setStatus('Connecting…'); });
    DR.on('rt:call-ice', async (m) => {
      if (!cur || m.callId !== cur.id) return;
      if (cur.pc && cur.pc.remoteDescription) await cur.pc.addIceCandidate(m.cand).catch(() => {});
      else cur.pendingIce.push(m.cand);
    });
    DR.on('rt:call-decline', (m) => { if (cur && m.callId === cur.id) end(false, m.busy ? 'Busy' : 'Declined'); });
    DR.on('rt:call-end', (m) => { if (cur && m.callId === cur.id) end(false, 'Call ended'); });
    return { start, end: () => end(true), active: () => !!cur };
  })();
})(window.DR);
