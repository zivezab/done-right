/* Done Right — demo simulation of the "other side" (seed providers, sample customers, Trust & Safety).
 * Runs on an interval from app.js; disable with Settings › Demo simulation. */
(function (DR) {
  'use strict';
  const S = () => DR.store.s;
  DR.demo = {
    tick(now = Date.now()) {
      const s = S();
      let changed = DR.booking.expire(now) > 0;
      if (s.demo.simulate !== false) {
        const wait = (DR.CONFIG.demo && DR.CONFIG.demo.providerReplyMs) || 8000;
        s.orders.forEach((o) => {
          const seedProvider = !s.users[o.providerId];
          // seed providers answer booking requests
          if (o.status === 'requested' && seedProvider && now - (o.paidAt || o.createdAt) > wait) {
            if (DR.u.hash(o.id) % 10 === 0) DR.booking.decline(o.id, 'Declined by provider (schedule conflict)');
            else DR.booking.accept(o.id);
            changed = true;
          }
          // seed providers answer reschedule requests
          if (o.rescheduleRequest && seedProvider && now - o.rescheduleRequest.ts > wait / 2) {
            try { DR.booking.respondReschedule(o.id, true); } catch (e) { DR.booking.respondReschedule(o.id, false); }
            changed = true;
          }
          // sample customers answer provider time-change proposals
          if (o.proposal && String(o.userId).startsWith('demo-') && now - o.proposal.ts > wait / 2) { DR.booking.respondProposal(o.id, true); changed = true; }
        });
        if (DR.quotes.simulate(now)) changed = true;
      }
      if (DR.verify && DR.verify.tickAll(now)) changed = true;
      if (changed) DR.emit('sync');
      return changed;
    },
  };
})(window.DR);
