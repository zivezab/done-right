/* Done Right — licensing & mandatory-check rules per service category.
 * A regulated service stays hidden from customers until the provider has a *verified* licence that
 * satisfies every requirement group (each group = "any one of these licences").
 * NOTE: rules are a product configuration for SG & MY and must be confirmed with legal counsel /
 * regulators before launch. */
(function (DR) {
  'use strict';
  const L = (cc, name, issuer, register, hint, pattern) => ({ cc, name, issuer, register, hint, pattern });
  DR.LICENCES = {
    // Singapore
    'sg-lew': L('SG', 'Licensed Electrical Worker (LEW)', 'Energy Market Authority', 'EMA LEW register', 'e.g. 8-12345', /^[A-Z0-9-]{5,}$/i),
    'sg-plumber': L('SG', 'Licensed Plumber', 'PUB', 'PUB licensed plumbers directory', 'e.g. LP1234', /^[A-Z0-9-]{4,}$/i),
    'sg-massage': L('SG', 'Massage Establishment Licence', 'Singapore Police Force (Police Licensing & Regulatory Department)', 'SPF licensing register', 'e.g. MEL-2025-01234', /^[A-Z0-9-]{6,}$/i),
    'sg-snb': L('SG', 'Registered / Enrolled Nurse', 'Singapore Nursing Board', 'SNB register of nurses', 'e.g. R12345A', /^[A-Z0-9]{5,}$/i),
    'sg-ahpc': L('SG', 'Allied Health Professional Registration', 'Allied Health Professions Council', 'AHPC register', 'e.g. PT12345', /^[A-Z0-9]{5,}$/i),
    'sg-tcm': L('SG', 'Registered TCM Physician', 'TCM Practitioners Board', 'TCMPB register', 'e.g. TCM12345', /^[A-Z0-9]{5,}$/i),
    'sg-vet': L('SG', 'Veterinary Licence', 'Animal & Veterinary Service', 'AVS register of veterinarians', 'e.g. V1234', /^[A-Z0-9]{4,}$/i),
    'sg-practising-cert': L('SG', 'Practising Certificate (Advocate & Solicitor)', 'Supreme Court of Singapore', 'Legal Services Regulatory Authority register', 'e.g. PC-2025-1234', /^[A-Z0-9-]{5,}$/i),
    'sg-notary': L('SG', 'Notary Public / Commissioner for Oaths', 'Singapore Academy of Law', 'SAL register', 'e.g. NP-1234', /^[A-Z0-9-]{4,}$/i),
    'sg-cea': L('SG', 'Registered Salesperson', 'Council for Estate Agencies', 'CEA public register', 'e.g. R012345A', /^R\d{6}[A-Z]$/i),
    'sg-mas-rep': L('SG', 'Appointed Representative (Register of Representatives)', 'Monetary Authority of Singapore', 'MAS Register of Representatives', 'e.g. ABC123456789', /^[A-Z0-9]{6,}$/i),
    'sg-mom-ea': L('SG', 'Employment Agency Licence / Registered EA Personnel', 'Ministry of Manpower', 'MOM EA directory', 'e.g. 12C3456 or R1234567', /^[A-Z0-9]{7,}$/i),
    'sg-driving-instructor': L('SG', 'Driving Instructor Licence', 'Singapore Police Force (Traffic Police)', 'TP instructor register', 'e.g. DI1234', /^[A-Z0-9]{4,}$/i),
    'sg-tour-guide': L('SG', 'Tourist Guide Licence', 'Singapore Tourism Board', 'STB licensed guides', 'e.g. TG12345', /^[A-Z0-9]{5,}$/i),
    'sg-hdb-reno': L('SG', 'HDB Registered Renovation Contractor', 'Housing & Development Board', 'HDB Directory of Renovation Contractors', 'e.g. HB-01-5432X', /^[A-Z0-9-]{6,}$/i),
    'sg-pest': L('SG', 'Pest Control Operator / Technician Licence', 'National Environment Agency', 'NEA vector control register', 'e.g. VCO-1234', /^[A-Z0-9-]{4,}$/i),
    'sg-caas': L('SG', 'Unmanned Aircraft Pilot Licence', 'Civil Aviation Authority of Singapore', 'CAAS UA register', 'e.g. UAPL-12345', /^[A-Z0-9-]{5,}$/i),
    'sg-food-hygiene': L('SG', 'Food Hygiene Certificate / SFA Food Licence', 'Singapore Food Agency', 'SFA licence search', 'e.g. FHC-12345', /^[A-Z0-9-]{5,}$/i),
    'sg-pdvl': L('SG', "Private Hire Car Driver's Vocational Licence", 'Land Transport Authority', 'LTA vocational licence check', 'e.g. PDVL12345', /^[A-Z0-9]{5,}$/i),
    // Malaysia
    'my-st-wireman': L('MY', 'Wireman Competency Certificate', 'Suruhanjaya Tenaga', 'ST competent persons register', 'e.g. PW4-12345', /^[A-Z0-9-]{5,}$/i),
    'my-span-plumber': L('MY', 'Registered Plumber', 'Suruhanjaya Perkhidmatan Air Negara (SPAN)', 'SPAN plumber register', 'e.g. SPAN/TP/1234', /^[A-Z0-9/-]{5,}$/i),
    'my-spa-premise': L('MY', 'Spa & Massage Premise Licence', 'Local authority (PBT)', 'PBT licensing records', 'e.g. MBPJ/L/2025/123', /^[A-Z0-9/-]{5,}$/i),
    'my-tcm': L('MY', 'Registered T&CM Practitioner', 'T&CM Council, Ministry of Health', 'T&CM practitioner register', 'e.g. T&CM-12345', /^[A-Z0-9&-]{5,}$/i),
    'my-ljm': L('MY', 'Registered Nurse', 'Lembaga Jururawat Malaysia', 'LJM nurse register', 'e.g. 123456', /^[A-Z0-9]{5,}$/i),
    'my-mahpc': L('MY', 'Allied Health Registration', 'Malaysian Allied Health Professions Council', 'MAHPC register', 'e.g. MAHPC-12345', /^[A-Z0-9-]{5,}$/i),
    'my-counsellor': L('MY', 'Registered Counsellor', 'Lembaga Kaunselor Malaysia', 'LKM register', 'e.g. KB12345', /^[A-Z0-9]{5,}$/i),
    'my-mvc': L('MY', 'Registered Veterinary Surgeon', 'Malaysian Veterinary Council', 'MVC register', 'e.g. MVC1234', /^[A-Z0-9]{4,}$/i),
    'my-bar': L('MY', 'Advocate & Solicitor (Practising Certificate)', 'Malaysian Bar', 'Malaysian Bar lawyer search', 'e.g. BC/A/1234', /^[A-Z0-9/-]{5,}$/i),
    'my-commissioner': L('MY', 'Commissioner for Oaths', 'High Court of Malaya', 'Court records', 'e.g. W123', /^[A-Z0-9]{3,}$/i),
    'my-ren': L('MY', 'Registered Estate Negotiator (REN)', 'Board of Valuers, Appraisers, Estate Agents & Property Managers', 'LPPEH register', 'e.g. REN 12345', /^(REN\s?)?\d{4,}$/i),
    'my-insurance': L('MY', 'Registered Insurance Agent', 'Life Insurance Association of Malaysia (LIAM)', 'LIAM agent register', 'e.g. LIAM12345', /^[A-Z0-9]{5,}$/i),
    'my-jtksm': L('MY', 'Private Employment Agency Licence', 'JTKSM', 'JTKSM licensed agencies', 'e.g. JTKSM 123A', /^[A-Z0-9\s]{4,}$/i),
    'my-tax-agent': L('MY', 'Licensed Tax Agent (Section 153)', 'Ministry of Finance Malaysia', 'MOF tax agent register', 'e.g. TA/1234/2025', /^[A-Z0-9/]{5,}$/i),
    'my-ssm-sec': L('MY', 'Licensed Company Secretary', 'Companies Commission of Malaysia (SSM)', 'SSM secretary register', 'e.g. LS0001234', /^[A-Z0-9]{5,}$/i),
    'my-jpj-instructor': L('MY', 'Driving Instructor Licence (Lesen Pengajar Memandu)', 'JPJ', 'JPJ records', 'e.g. LPM-12345', /^[A-Z0-9-]{5,}$/i),
    'my-motac-guide': L('MY', 'Tourist Guide Licence', 'MOTAC', 'MOTAC licensed guides', 'e.g. KPK/LN 1234', /^[A-Z0-9/\s]{4,}$/i),
    'my-cidb': L('MY', 'CIDB Contractor Registration', 'CIDB Malaysia', 'CIDB contractor search', 'e.g. 0120250101-WP123456', /^[A-Z0-9-]{8,}$/i),
    'my-pest': L('MY', 'Pest Control Operator Licence', 'Pesticides Board (Lembaga Racun Makhluk Perosak)', 'LRMP register', 'e.g. PCO/1234', /^[A-Z0-9/]{4,}$/i),
    'my-caam': L('MY', 'Drone Operator Permit', 'Civil Aviation Authority of Malaysia (CAAM)', 'CAAM permits', 'e.g. CAAM/UAS/1234', /^[A-Z0-9/]{5,}$/i),
    'my-food-handler': L('MY', 'Food Handler Training Certificate', 'Ministry of Health Malaysia', 'MOH food handler records', 'e.g. KLM-12345', /^[A-Z0-9-]{5,}$/i),
    'my-psv': L('MY', 'E-hailing PSV Licence', 'JPJ / APAD', 'JPJ licence check', 'e.g. PSV12345', /^[A-Z0-9]{5,}$/i),
  };

  const R = (sg, my) => ({ SG: sg ? [sg] : [], MY: my ? [my] : [] });
  const RULES = {};
  const set = (ids, rule) => ids.forEach((id) => { RULES[id] = rule; });
  set(['electrical-repair', 'electrician', 'light-install', 'ev-charger'], R(['sg-lew'], ['my-st-wireman']));
  set(['plumbing', 'plumber', 'sanitary-install', 'water-heater-repair'], R(['sg-plumber'], ['my-span-plumber']));
  set((DR.GROUP.massage || { subs: [] }).subs.map((s) => s.id), R(['sg-massage'], ['my-spa-premise', 'my-tcm']));
  set(['tcm'], R(['sg-tcm'], ['my-tcm']));
  set(['home-nurse', 'wound-care'], R(['sg-snb'], ['my-ljm']));
  set(['physiotherapy', 'occupational-therapy', 'speech-therapy'], R(['sg-ahpc'], ['my-mahpc']));
  set(['counselling'], R(null, ['my-counsellor']));
  set(['vet-home-visit'], R(['sg-vet'], ['my-mvc']));
  set(['legal-consult'], R(['sg-practising-cert'], ['my-bar']));
  set(['commissioner-oaths'], R(['sg-notary'], ['my-commissioner']));
  set(['property-agent'], R(['sg-cea'], ['my-ren']));
  set(['insurance-planner'], R(['sg-mas-rep'], ['my-insurance']));
  set(['helper-agency', 'work-pass-agent'], R(['sg-mom-ea'], ['my-jtksm']));
  set(['tax-filing'], R(null, ['my-tax-agent']));
  set(['company-secretary'], R(null, ['my-ssm-sec']));
  set(['driving-coach'], R(['sg-driving-instructor'], ['my-jpj-instructor']));
  set(['tour-guide'], R(['sg-tour-guide'], ['my-motac-guide']));
  set(['renovation-contractor'], R(['sg-hdb-reno'], ['my-cidb']));
  set(['pest-control'], R(['sg-pest'], ['my-pest']));
  set(['drone'], R(['sg-caas'], ['my-caam']));
  set(['catering', 'private-chef', 'custom-cakes', 'bbq-catering', 'meal-delivery'], R(['sg-food-hygiene'], ['my-food-handler']));
  set(['chauffeur'], R(['sg-pdvl'], ['my-psv']));
  DR.LICENSING = RULES;

  // Services where a clean background check is mandatory (children, elderly, vulnerable people, intimate services)
  const BG_SUBS = new Set(['kids-swimming', 'coding-kids', 'elderly-companion', 'dog-walking', 'pet-sitting', 'pet-boarding']);

  const statusOf = (items) => (items.some((x) => x.status === 'verified') ? 'verified' : items.some((x) => x.status === 'pending') ? 'pending' : items.some((x) => x.status === 'expired') ? 'expired' : items.some((x) => x.status === 'rejected') ? 'rejected' : 'missing');

  DR.lic = {
    get: (id) => DR.LICENCES[id],
    rules(subId, cc) { const r = RULES[subId]; return r ? r[cc] || [] : []; },
    regulated(subId, cc) { return this.rules(subId, cc).length > 0; },
    bgRequired(subId) { const s = DR.SUB[subId]; return !!s && (BG_SUBS.has(subId) || !!(DR.GROUP[s.groupId] || {}).bg); },
    forCountry(cc) { return Object.entries(DR.LICENCES).filter(([, l]) => l.cc === cc).map(([id, l]) => Object.assign({ id }, l)); },
    relevant(subIds, cc) { return [...new Set(subIds.flatMap((s) => this.rules(s, cc).flat()))]; },
    // requirement status for a user-provider's service
    check(u, subId) {
      const cc = u.country || 'SG';
      const certs = (u.verification && u.verification.certifications) || [];
      const groups = this.rules(subId, cc).map((options) => {
        const items = certs.filter((c) => options.includes(c.licenceId));
        return { options, status: statusOf(items), cert: items.find((c) => c.status === 'verified') || items[0] || null };
      });
      const bgRequired = this.bgRequired(subId);
      const bgStatus = (u.verification && u.verification.background && u.verification.background.status) || 'missing';
      const ok = groups.every((g) => g.status === 'verified') && (!bgRequired || bgStatus === 'verified');
      const pending = !ok && groups.every((g) => ['verified', 'pending'].includes(g.status)) && (!bgRequired || ['verified', 'pending'].includes(bgStatus));
      return { ok, pending, groups, bgRequired, bgStatus, regulated: groups.length > 0 };
    },
    label(ids) { return ids.map((id) => DR.LICENCES[id].name).join(' or '); },
  };
})(window.DR);
