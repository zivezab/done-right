/* Minimal async test harness (describe / it / beforeEach / expect). Results: window.__TESTS__ */
(function () {
  'use strict';
  const T = { suites: [], cur: null };
  window.T = T;
  window.describe = (name, fn) => { T.cur = { name, tests: [], before: [] }; T.suites.push(T.cur); fn(); };
  window.it = (name, fn) => T.cur.tests.push({ name, fn });
  window.beforeEach = (fn) => T.cur.before.push(fn);
  const fmt = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  window.expect = (v) => {
    const m = {
      toBe: (x) => assert(Object.is(v, x), `expected ${fmt(v)} to be ${fmt(x)}`),
      toEqual: (x) => assert(fmt(v) === fmt(x), `expected ${fmt(v)} to equal ${fmt(x)}`),
      toBeTruthy: () => assert(!!v, `expected ${fmt(v)} to be truthy`),
      toBeFalsy: () => assert(!v, `expected ${fmt(v)} to be falsy`),
      toContain: (x) => assert(v && v.includes(x), `expected ${fmt(v)} to contain ${fmt(x)}`),
      toBeGreaterThan: (n) => assert(v > n, `expected ${v} > ${n}`),
      toBeLessThan: (n) => assert(v < n, `expected ${v} < ${n}`),
      toMatch: (re) => assert(re.test(String(v)), `expected ${fmt(v)} to match ${re}`),
      toThrow: (re) => {
        let threw = null;
        try { v(); } catch (e) { threw = e; }
        assert(threw, 'expected function to throw');
        if (re) assert(re.test(threw.message), `expected error "${threw.message}" to match ${re}`);
      },
    };
    m.not = {
      toBe: (x) => assert(!Object.is(v, x), `expected ${fmt(v)} not to be ${fmt(x)}`),
      toContain: (x) => assert(!(v && v.includes(x)), `expected ${fmt(v)} not to contain ${fmt(x)}`),
    };
    return m;
  };
  T.run = async function () {
    const out = document.getElementById('out');
    const results = [];
    let pass = 0, fail = 0;
    const t0 = performance.now();
    for (const s of T.suites) {
      out.insertAdjacentHTML('beforeend', `<div class="suite">${s.name}</div>`);
      for (const t of s.tests) {
        const start = performance.now();
        let err = null;
        try { for (const b of s.before) await b(); await t.fn(); } catch (e) { err = e; }
        const ms = Math.round(performance.now() - start);
        results.push({ suite: s.name, name: t.name, ok: !err, error: err ? err.message : null, ms });
        if (err) fail++; else pass++;
        out.insertAdjacentHTML('beforeend', `<div class="t ${err ? 'fail' : 'pass'}">${t.name} <span class="ms">${ms} ms</span></div>${err ? `<div class="err">${String(err.message).replace(/</g, '&lt;')}</div>` : ''}`);
      }
    }
    const total = Math.round(performance.now() - t0);
    document.getElementById('summary').textContent = `${pass} passed, ${fail} failed · ${total} ms`;
    document.getElementById('summary').style.color = fail ? '#ff6b5b' : '#4cb782';
    window.__TESTS__ = { pass, fail, total, results, done: true };
  };
})();
