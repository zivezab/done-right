/* Done Right — provider data (deterministic demo seed + user-registered providers),
 * booking policies, availability engine (memoised), distance/fees, reviews and fuzzy search. */
(function (DR) {
  'use strict';
  const { rng, pick, between, clamp, hash, pad, dateKey, parseKey, addDays, toMin, fromMin, slotTs } = DR.u;
  const S = () => DR.store.s;

  // ------------------------------------------------------------ names
  const N = {
    chSur: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Chua', 'Goh', 'Teo', 'Ong', 'Koh', 'Low', 'Chong', 'Yeo', 'Ho', 'Lau', 'Chan', 'Sim', 'Toh', 'Foo', 'Leong', 'Chen', 'Liew'],
    chM: ['Wei Ming', 'Jun Jie', 'Kah Seng', 'Zhi Hao', 'Kai Xiang', 'Boon Keat', 'Jian Hui', 'Yong Sheng', 'Chee Keong', 'Wen Jie', 'Jia Le', 'Wei Lun', 'Shao Wei', 'Kok Leong', 'Zhen Yu'],
    chF: ['Hui Min', 'Xin Yi', 'Pei Shan', 'Jia Ying', 'Mei Ling', 'Li Ting', 'Siew Ling', 'Shu Fen', 'Yi Xuan', 'Hui Wen', 'Kai Qi', 'Yee Ling', 'Wan Ting', 'Jing Wen'],
    engM: ['Jason', 'Kelvin', 'Marcus', 'Ryan', 'Darren', 'Eugene', 'Benjamin', 'Joel', 'Nicholas', 'Alvin', 'Desmond', 'Gabriel', 'Ethan', 'Bryan', 'Shawn'],
    engF: ['Rachel', 'Michelle', 'Joanne', 'Cheryl', 'Vivian', 'Grace', 'Serene', 'Jasmine', 'Amanda', 'Charlene', 'Felicia', 'Audrey', 'Denise', 'Natalie', 'Clara'],
    mlM: ['Muhammad Hafiz', 'Ahmad Faizal', 'Syafiq', 'Aiman', 'Hakim', 'Firdaus', 'Amirul', 'Haziq', 'Irfan', 'Danial', 'Khairul', 'Azlan', 'Farhan', 'Hariz'],
    mlF: ['Nurul Aisyah', 'Siti Aminah', 'Nur Farhana', 'Aina Sofea', 'Nabilah', 'Syafiqah', 'Hidayah', 'Izzati', 'Amira', 'Dayana', 'Balqis', 'Nadia', 'Farah'],
    mlFather: ['Rahman', 'Ismail', 'Zulkifli', 'Roslan', 'Aziz', 'Yusof', 'Hassan', 'Omar', 'Kamal', 'Rahim', 'Zainal', 'Salleh', 'Hamid', 'Ibrahim'],
    inM: ['Arjun', 'Rajesh', 'Vikram', 'Suresh', 'Karthik', 'Pravin', 'Darren', 'Ganesh', 'Naveen', 'Ashwin', 'Kumaran', 'Ravi'],
    inF: ['Priya', 'Kavitha', 'Divya', 'Anjali', 'Shalini', 'Meera', 'Lavanya', 'Nisha', 'Deepa', 'Revathi', 'Sangeetha'],
    inSur: ['Pillai', 'Kumar', 'Nair', 'Muthu', 'Rajan', 'Das', 'Subramaniam', 'Menon', 'Krishnan', 'Selvam', 'Raman', 'Singh'],
    otM: ['Daniel De Souza', 'Marcus Fernandez', 'Ryan Lopez', 'Adrian Pereira', 'Joshua Oliveiro', 'Mark Santos', 'Minh Nguyen', 'Budi Santoso'],
    otF: ['Joanne Pereira', 'Rachel Oliveiro', 'Chloe Martens', 'Maria Santos', 'Lan Nguyen', 'Sarah D\'Cruz', 'Dewi Lestari', 'Hannah Schooling'],
  };
  function ethnicity(r, cc) {
    const x = r();
    if (cc === 'SG') return x < 0.72 ? 'ch' : x < 0.85 ? 'ml' : x < 0.94 ? 'in' : 'ot';
    return x < 0.55 ? 'ml' : x < 0.82 ? 'ch' : x < 0.94 ? 'in' : 'ot';
  }
  function makeName(r, eth, g) {
    const F = g === 'F';
    if (eth === 'ch') return r() < 0.45 ? `${pick(r, F ? N.engF : N.engM)} ${pick(r, N.chSur)}` : `${pick(r, N.chSur)} ${pick(r, F ? N.chF : N.chM)}`;
    if (eth === 'ml') return `${pick(r, F ? N.mlF : N.mlM)} ${pick(r, N.mlFather)}`;
    if (eth === 'in') return `${pick(r, F ? N.inF : N.inM)} ${pick(r, N.inSur)}`;
    return pick(r, F ? N.otF : N.otM);
  }
  function languagesFor(r, cc, eth, g, subs) {
    const L = ['English'];
    if (eth === 'ch') { L.push('Mandarin'); if (r() < 0.3) L.push(pick(r, ['Cantonese', 'Hokkien', 'Teochew', 'Hakka'])); if (cc === 'MY' && r() < 0.6) L.push('Malay'); }
    if (eth === 'ml') L.unshift('Malay');
    if (eth === 'in') { L.push('Tamil'); if (cc === 'MY' && r() < 0.6) L.push('Malay'); if (r() < 0.2) L.push('Hindi'); }
    if (eth === 'ot' && r() < 0.5) L.push(pick(r, ['Tagalog', 'Indonesian', 'Malay']));
    const teach = { japanese: 'Japanese', korean: 'Korean', french: 'French', spanish: 'Spanish', german: 'German', arabic: 'Arabic', hindi: 'Hindi', 'chinese-tutor': 'Mandarin', 'mandarin-lessons': 'Mandarin', 'malay-tutor': 'Malay', 'malay-lessons': 'Malay', 'tamil-tutor': 'Tamil' };
    subs.forEach((s) => { if (teach[s.id] && !L.includes(teach[s.id])) L.push(teach[s.id]); });
    return [...new Set(L)];
  }

  // ------------------------------------------------------------ credentials pools
  const B = (list) => ({ SG: list, MY: list });
  const CERTS = {
    cleaning: { SG: [['WSQ Certificate in Environmental Cleaning', 'SkillsFuture Singapore']], MY: [['Certified Cleaning Technician', 'IICRC'], ['CIDB Green Card', 'CIDB Malaysia']] },
    repair: { SG: [['WSQ Certificate in Building Maintenance', 'SkillsFuture Singapore']], MY: [['CIDB Green Card', 'CIDB Malaysia']] },
    massage: { SG: [['WSQ Certificate in Massage Therapy', 'SkillsFuture Singapore'], ['Standard First Aid + CPR/AED', 'Singapore Red Cross']], MY: [['SKM Level 3 Spa Therapy', 'Jabatan Pembangunan Kemahiran']] },
    laundry: B([['Professional Garment Care Certificate', 'Drycleaning & Laundry Institute']]),
    moving: { SG: [['Class 4 Driving Licence', 'Singapore Police Force'], ['WSQ Manual Handling', 'SkillsFuture Singapore']], MY: [['GDL Driving Licence', 'JPJ'], ['Manual Handling Safety', 'NIOSH Malaysia']] },
    'appliance-cleaning': { SG: [['WSQ Aircon Servicing Competency', 'SkillsFuture Singapore'], ['Refrigerant Handling Certificate', 'National Environment Agency']], MY: [['Refrigerant Handling Certificate', 'Department of Environment'], ['SKM Level 2 Air-Conditioning', 'Jabatan Pembangunan Kemahiran']] },
    beauty: { SG: [['CIDESCO Beauty Therapy Diploma', 'CIDESCO'], ['ITEC Level 3 Diploma in Beauty Therapy', 'ITEC']], MY: [['SKM Level 3 Beauty Therapy', 'Jabatan Pembangunan Kemahiran'], ['CIDESCO Beauty Therapy Diploma', 'CIDESCO']] },
    nanny: { SG: [['Infant Care Certificate', 'ECDA'], ['Standard First Aid + CPR/AED', 'Singapore Red Cross'], ['WSQ Confinement Care', 'SkillsFuture Singapore']], MY: [['Kursus Asuhan PERMATA', 'Jabatan Kebajikan Masyarakat'], ['First Aid & CPR', 'St John Ambulance Malaysia']] },
    care: { SG: [['Caregiver Training Grant Course', 'Agency for Integrated Care'], ['Basic Cardiac Life Support', 'Singapore Resuscitation & First Aid Council']], MY: [['Basic Life Support (BLS)', 'Malaysian Society of Anaesthesiologists']] },
    tuition: { SG: [['Postgraduate Diploma in Education (PGDE)', 'National Institute of Education'], ['MOE-trained Teacher', 'Ministry of Education']], MY: [['Registered Teacher', 'Kementerian Pendidikan Malaysia'], ['Diploma Perguruan', 'Institut Pendidikan Guru']] },
    'special-needs': B([['Certificate in Special Needs Support', 'Autism Resource Centre'], ['Applied Behaviour Analysis (RBT)', 'BACB']]),
    language: B([['CELTA', 'Cambridge English'], ['TESOL Certificate', 'Trinity College London'], ['HSK Level 6', 'Chinese Testing International']]),
    japanese: B([['JLPT N1', 'Japan Foundation']]), korean: B([['TOPIK Level 6', 'NIIED']]), french: B([['DELF C1', 'France Education International']]),
    german: B([['Goethe-Zertifikat C1', 'Goethe-Institut']]), spanish: B([['DELE C1', 'Instituto Cervantes']]),
    music: B([['ABRSM Grade 8 Performance', 'ABRSM'], ['LTCL Teaching Diploma', 'Trinity College London'], ['DipABRSM', 'ABRSM']]),
    dance: B([['RAD Registered Teacher', 'Royal Academy of Dance']]),
    'singing-coach': B([['ATCL Voice Performance', 'Trinity College London'], ['Estill Figure Proficiency', 'Estill Voice International']]),
    sports: { SG: [['NROC Coach Level 1', 'Sport Singapore'], ['Standard First Aid + CPR/AED', 'Singapore Red Cross']], MY: [['Lesen Kejurulatihan SKK Level 1', 'Majlis Sukan Negara'], ['First Aid & CPR', 'St John Ambulance Malaysia']] },
    'swimming-instructor': { SG: [['SwimSafer 2.0 Instructor', 'Sport Singapore'], ['AUSTSWIM Teacher of Swimming and Water Safety', 'AUSTSWIM'], ['Bronze Medallion (Lifesaving)', 'Singapore Life Saving Society']], MY: [['AUSTSWIM Teacher of Swimming and Water Safety', 'AUSTSWIM'], ['Lesen Kejurulatihan SKK Level 1', 'Majlis Sukan Negara'], ['Bronze Medallion', 'Malaysian Life Saving Society']] },
    'kids-swimming': { SG: [['SwimSafer 2.0 Instructor', 'Sport Singapore'], ['AUSTSWIM Teacher of Infant & Preschool Aquatics', 'AUSTSWIM']], MY: [['AUSTSWIM Teacher of Infant & Preschool Aquatics', 'AUSTSWIM']] },
    'personal-trainer': B([['ACE Certified Personal Trainer', 'American Council on Exercise'], ['NASM Certified Personal Trainer', 'NASM']]),
    yoga: B([['Registered Yoga Teacher (RYT-200)', 'Yoga Alliance']]), pilates: B([['Comprehensive Pilates Instructor', 'BASI Pilates']]),
    badminton: { SG: [['Badminton Coach Level 1', 'Singapore Badminton Association']], MY: [['BAM Coaching Level 1', 'Badminton Association of Malaysia']] },
    tennis: B([['ITF Level 1 Coach', 'International Tennis Federation']]), golf: B([['PGA Professional', 'PGA']]), scuba: B([['PADI Open Water Scuba Instructor', 'PADI']]),
    tech: B([['AWS Certified Developer – Associate', 'Amazon Web Services'], ['Meta Front-End Developer Certificate', 'Meta'], ['Oracle Certified Professional: Java SE Developer', 'Oracle']]),
    'mobile-developer': B([['Google Associate Android Developer', 'Google'], ['Meta iOS Developer Certificate', 'Meta']]),
    'ml-engineer': B([['Google Cloud Professional Machine Learning Engineer', 'Google Cloud'], ['AWS Certified Machine Learning – Specialty', 'Amazon Web Services'], ['TensorFlow Developer Certificate', 'Google']]),
    'ai-expert': { SG: [['Deep Learning Specialization', 'DeepLearning.AI'], ['Microsoft Certified: Azure AI Engineer Associate', 'Microsoft'], ['AI Apprenticeship Programme (AIAP)', 'AI Singapore']], MY: [['Deep Learning Specialization', 'DeepLearning.AI'], ['Microsoft Certified: Azure AI Engineer Associate', 'Microsoft'], ['Certified Data Science Professional', 'MDEC']] },
    'genai-engineer': B([['Generative AI with Large Language Models', 'DeepLearning.AI & AWS'], ['Microsoft Certified: Azure AI Engineer Associate', 'Microsoft'], ['Google Cloud Professional Machine Learning Engineer', 'Google Cloud']]),
    'data-scientist': B([['IBM Data Science Professional Certificate', 'IBM'], ['Microsoft Certified: Azure Data Scientist Associate', 'Microsoft']]),
    'data-engineer': B([['Databricks Certified Data Engineer Professional', 'Databricks'], ['Google Cloud Professional Data Engineer', 'Google Cloud']]),
    'devops-cloud': B([['Certified Kubernetes Administrator (CKA)', 'CNCF'], ['AWS Certified Solutions Architect – Professional', 'Amazon Web Services'], ['HashiCorp Certified: Terraform Associate', 'HashiCorp']]),
    cybersecurity: B([['CISSP', 'ISC2'], ['OSCP', 'OffSec'], ['Certified Ethical Hacker (CEH)', 'EC-Council']]),
    'ui-ux': B([['Google UX Design Professional Certificate', 'Google'], ['UX Certification', 'Nielsen Norman Group']]),
    'qa-engineer': B([['ISTQB Certified Tester Foundation Level', 'ISTQB']]), blockchain: B([['Certified Blockchain Developer', 'Blockchain Council']]),
    'fractional-cto': B([['AWS Certified Solutions Architect – Professional', 'Amazon Web Services'], ['Certified ScrumMaster (CSM)', 'Scrum Alliance']]),
    'it-support': B([['CompTIA A+', 'CompTIA'], ['Cisco CCNA', 'Cisco']]), 'network-setup': B([['Cisco CCNA', 'Cisco'], ['CompTIA Network+', 'CompTIA']]),
    'computer-repair': B([['CompTIA A+', 'CompTIA']]), 'data-recovery': B([['CompTIA A+', 'CompTIA']]), 'smart-home': B([['CompTIA Network+', 'CompTIA']]),
    business: B([['Certified Management Consultant (CMC)', 'ICMCI']]),
    accountant: { SG: [['Chartered Accountant (CA Singapore)', 'ISCA'], ['ACCA Member', 'ACCA']], MY: [['Chartered Accountant, CA(M)', 'Malaysian Institute of Accountants'], ['ACCA Member', 'ACCA']] },
    translator: B([['NAATI Certified Translator', 'NAATI']]), 'career-coach': B([['ICF Associate Certified Coach', 'International Coaching Federation']]),
    'hr-payroll': { SG: [['IHRP Certified Professional', 'Institute for Human Resource Professionals']], MY: [['Certified HR Professional', 'MIHRM']] },
    creative: B([['Adobe Certified Professional', 'Adobe'], ['Google Ads Search Certification', 'Google']]),
    'seo-marketing': B([['Google Analytics Certification', 'Google'], ['Meta Certified Digital Marketing Associate', 'Meta']]),
    events: B([['Certified Event Planner', 'Event Planning Institute']]),
    renovation: { SG: [['CaseTrust Renovation Accreditation', 'CASE Singapore']], MY: [['CIDB Green Card', 'CIDB Malaysia']] },
    'feng-shui': B([['Certified Feng Shui Consultant', 'International Feng Shui Association']]),
    auto: { SG: [['Nitec in Automotive Technology', 'ITE']], MY: [['SKM Level 3 Automotive', 'Jabatan Pembangunan Kemahiran']] },
    recycling: { SG: [['General Waste Collector Licence', 'National Environment Agency']], MY: [['Licensed Solid Waste Collector', 'SWCorp']] },
    pets: { SG: [['Certified Professional Dog Trainer (CPDT-KA)', 'CCPDT'], ['Pet First Aid & CPR', 'Pet Tech']], MY: [['Registered Pet Service Provider', 'Department of Veterinary Services'], ['Pet First Aid & CPR', 'Pet Tech']] },
    errands: { SG: [['Class 2B Motorcycle Licence', 'Singapore Police Force']], MY: [['Lesen Memandu B2', 'JPJ']] },
    lifestyle: B([['ICF Associate Certified Coach', 'International Coaching Federation']]),
  };
  CERTS.installation = CERTS.repair;
  DR.CERT_SUGGESTIONS = (subIds, cc) => {
    const out = [];
    subIds.forEach((id) => { const s = DR.SUB[id]; if (!s) return; [CERTS[id], CERTS[s.groupId]].forEach((c) => { if (c) c[cc].forEach((x) => { if (!out.some((o) => o[0] === x[0])) out.push(x); }); }); });
    return out.slice(0, 8);
  };

  const DEGREES = {
    tech: [['Bachelor of Computing', 'Computer Science'], ['Bachelor of Engineering', 'Computer Engineering'], ['Bachelor of Science', 'Information Systems']],
    ai: [['Master of Science', 'Artificial Intelligence'], ['PhD', 'Machine Learning'], ['Master of Science', 'Data Science']],
    tuition: [['Bachelor of Science', 'Mathematics'], ['Bachelor of Science', 'Physics'], ['Bachelor of Arts', 'English Literature'], ['Bachelor of Arts', 'Chinese Studies'], ['Bachelor of Science', 'Chemistry']],
    language: [['Bachelor of Arts', 'Linguistics'], ['Bachelor of Arts', 'Modern Languages']],
    music: [['Bachelor of Music', 'Performance'], ['Diploma in Music', 'Music Performance'], ['Diploma in Dance', 'Contemporary Dance']],
    sports: [['Diploma in Sports & Exercise Science', ''], ['Bachelor of Science', 'Sport Science']],
    care: [['Diploma in Nursing', ''], ['Bachelor of Science', 'Physiotherapy'], ['Bachelor of Psychology', 'Counselling']],
    business: [['Bachelor of Accountancy', ''], ['Bachelor of Laws (LLB)', ''], ['Bachelor of Business Administration', 'Management']],
    creative: [['Diploma in Visual Communication', ''], ['Bachelor of Fine Arts', 'Media Arts'], ['Diploma in Film, Sound & Video', '']],
    beauty: [['Diploma in Beauty & Spa Management', '']],
    massage: [['Certificate in Therapeutic Massage', ''], ['Diploma in Traditional Chinese Medicine', '']],
    trade: [['Nitec', 'Electrical Technology'], ['Higher Nitec', 'Mechanical Engineering'], ['Nitec', 'Facility Technology']],
    tradeMY: [['Sijil Kemahiran Malaysia (SKM) Level 3', 'Electrical'], ['Diploma', 'Mechanical Engineering'], ['SKM Level 2', 'Building Maintenance']],
    events: [['Diploma in Hospitality & Tourism Management', ''], ['Diploma in Culinary Arts', '']],
    pets: [['Diploma in Veterinary Technology', ''], ['Certificate in Animal Care', '']],
  };
  const TRADE = ['repair', 'installation', 'appliance-cleaning', 'renovation', 'auto', 'moving'];

  function eduFor(r, cc, g, primary, age, area) {
    const C = DR.COUNTRIES[cc];
    const aiSubs = ['ml-engineer', 'ai-expert', 'genai-engineer', 'data-scientist'];
    let pool = DEGREES[g.id];
    if (TRADE.includes(g.id)) pool = cc === 'SG' ? DEGREES.trade : DEGREES.tradeMY;
    if (g.id === 'nanny' || g.id === 'care') pool = DEGREES.care;
    if (g.id === 'lifestyle') pool = DEGREES.language;
    const gradYear = new Date().getFullYear() - (age - 22);
    const out = [];
    const school = (deg) => {
      if (/^(Nitec|Higher Nitec)/.test(deg)) return 'ITE College Central';
      if (/^(Sijil|SKM)/.test(deg)) return `Kolej Vokasional ${area.n}`;
      if (/^Certificate/.test(deg)) return pick(r, ['Asia Wellness Academy', 'Lotus Healing Academy', 'Harmony Therapy Institute']);
      if (/^Diploma/.test(deg)) return cc === 'SG' ? pick(r, C.schools.slice(6, 10).concat(C.schools.slice(11))) : pick(r, C.schools.slice(5));
      return cc === 'SG' ? pick(r, C.schools.slice(0, 6)) : pick(r, C.schools.slice(0, 11));
    };
    if (pool) {
      const [deg, field] = pick(r, pool);
      out.push({ school: school(deg), degree: deg, field, start: String(gradYear - (/^Bachelor/.test(deg) ? 4 : 3)), end: String(gradYear), grade: /^Bachelor/.test(deg) && r() < 0.5 ? pick(r, ['Honours (Distinction)', 'Second Class Upper Honours', 'First Class Honours']) : '', verified: r() < 0.85 });
      if ((aiSubs.includes(primary.id) && r() < 0.75) || (g.id === 'tuition' && r() < 0.4)) {
        const [d2, f2] = g.id === 'tuition' ? ['Postgraduate Diploma in Education', 'Secondary Education'] : pick(r, DEGREES.ai);
        out.unshift({ school: cc === 'SG' ? pick(r, C.schools.slice(0, 3)) : pick(r, C.schools.slice(0, 5)), degree: d2, field: f2, start: String(gradYear + 1), end: String(gradYear + (d2 === 'PhD' ? 5 : 2)), grade: '', verified: true });
      }
    } else {
      out.push({ school: cc === 'SG' ? `${area.n} Secondary School` : `SMK ${area.n}`, degree: C.basic, field: '', start: String(gradYear - 10), end: String(gradYear - 6), grade: '', verified: r() < 0.6 });
    }
    return out;
  }

  const PREV = {
    cleaning: ['Housekeeping Supervisor', 'Senior Cleaner', 'Hotel Room Attendant'], repair: ['Maintenance Technician', 'Senior Technician', 'Facilities Technician'],
    massage: ['Senior Therapist', 'Spa Therapist', 'Wellness Therapist'], laundry: ['Laundry Supervisor', 'Garment Care Technician'], moving: ['Logistics Driver', 'Senior Mover', 'Warehouse Supervisor'],
    'appliance-cleaning': ['Aircon Technician', 'Service Technician'], installation: ['Installation Technician', 'Carpentry Technician'], beauty: ['Senior Beautician', 'Nail Technician', 'Makeup Artist'],
    nanny: ['Nanny', 'Infant Care Teacher', 'Caregiver'], care: ['Staff Nurse', 'Senior Physiotherapist', 'Healthcare Assistant'], tuition: ['Teacher', 'Senior Tutor', 'Head of Department (Mathematics)', 'Tuition Centre Teacher'],
    language: ['Language Instructor', 'Teacher', 'Translator'], music: ['Music Teacher', 'Vocal Instructor', 'Session Musician'], sports: ['Swim Coach', 'Fitness Instructor', 'Head Coach'],
    tech: ['Software Engineer', 'Senior Software Engineer', 'Full-stack Developer', 'Tech Lead'], techAI: ['Machine Learning Engineer', 'Senior Data Scientist', 'AI Research Engineer'],
    business: ['Audit Associate', 'Senior Tax Consultant', 'Associate', 'Business Analyst'], creative: ['Photographer', 'Graphic Designer', 'Video Producer', 'Marketing Executive'],
    events: ['Event Executive', 'Banquet Manager', 'Performer'], renovation: ['Project Supervisor', 'Site Supervisor', 'Interior Designer'], auto: ['Automotive Technician', 'Service Advisor'],
    recycling: ['Collection Driver', 'Operations Executive'], pets: ['Pet Groomer', 'Veterinary Nurse', 'Dog Trainer'], errands: ['Delivery Rider', 'Courier'], lifestyle: ['Coach', 'Tour Guide', 'Instructor'],
  };
  const PREFIX = { SG: ['Lion City', 'Merlion', 'Harbourfront', 'Kallang', 'Straits', 'Marina', 'Orchid', 'Bukit', 'Evergreen', 'Pioneer', 'Sunrise', 'Keppel'], MY: ['Klang Valley', 'Petaling', 'Twin Rivers', 'Penang Hill', 'Borneo', 'Selangor', 'Mutiara', 'Bunga Raya', 'Seri', 'Evergreen', 'Cahaya', 'Gemilang'] };
  const SHOPWORD = { cleaning: 'Home Services', repair: 'Engineering', massage: 'Wellness', laundry: 'Laundry', moving: 'Movers', 'appliance-cleaning': 'Aircon Services', installation: 'Installations', beauty: 'Beauty Studio', nanny: 'Care Agency', care: 'Home Care', tuition: 'Learning Centre', language: 'Language School', music: 'Music School', sports: 'Sports Academy', tech: 'Technologies', business: 'Advisory', creative: 'Studio', events: 'Events', renovation: 'Renovation', auto: 'Auto Care', recycling: 'Recycling', pets: 'Pet Care', errands: 'Express', lifestyle: 'Academy' };
  const company = (r, cc, gid) => `${pick(r, PREFIX[cc])} ${SHOPWORD[gid] || 'Services'} ${DR.COUNTRIES[cc].suffix}`;

  function ym(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

  function expFor(r, cc, g, primary, years, joinedMonths, area, role) {
    const C = DR.COUNTRIES[cc];
    const joined = addMonths(new Date(), -joinedMonths);
    const regions = ['Central', 'East', 'West', 'North', 'North-East'];
    const out = [{ title: `Independent ${role}`, company: 'Self-employed via Done Right', type: 'Self-employed', location: `${area.n}, ${C.name}`, start: ym(joined), end: null, desc: `Serving customers across ${regions.includes(area.r) ? `${area.r} ${C.name}` : area.r}.`, verified: true }];
    let remaining = years * 12 - joinedMonths;
    let cursor = joined;
    const aiSubs = ['ml-engineer', 'ai-expert', 'genai-engineer', 'data-scientist', 'data-engineer'];
    const titles = g.id === 'tech' && aiSubs.includes(primary.id) ? PREV.techAI : PREV[g.id] || ['Specialist'];
    const n = remaining > 36 ? 2 : remaining > 8 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const len = i === n - 1 ? remaining : between(r, 12, Math.max(12, remaining - 12));
      const start = addMonths(cursor, -len);
      let comp = company(r, cc, g.id);
      if (g.id === 'tuition' && r() < 0.5) comp = cc === 'SG' ? 'Ministry of Education (school posting)' : 'Kementerian Pendidikan Malaysia';
      out.push({ title: titles[Math.min(i + (n === 2 ? 0 : 1), titles.length - 1)] || titles[0], company: comp, type: 'Full-time', location: C.name, start: ym(start), end: ym(cursor), desc: '', verified: r() < 0.7 });
      cursor = start; remaining -= len;
    }
    return out;
  }

  const LINES = {
    cleaning: ['Detail-oriented and fast — I bring eco-friendly supplies.', 'Hotel-standard cleaning for busy families.'],
    repair: ['Honest diagnosis and a quote before any work begins.', 'Fully equipped — most fixes done in one visit.'],
    installation: ['Neat, level and secure installs with clean-up included.'],
    massage: ['Strictly professional therapeutic massage.', 'Skilled at releasing back, neck and shoulder tension.'],
    tuition: ['Patient, structured and exam-focused.', 'I build strong fundamentals and exam confidence.'],
    language: ['Conversation-first lessons tailored to your goals.'],
    music: ['Fun, structured lessons for kids and adults — beginners welcome.', 'I prepare students for ABRSM and Trinity graded exams.'],
    sports: ['Safety first, then technique and confidence.', 'Lessons at your condo pool, gym or a nearby park.'],
    tech: ['Hands-on engineer who ships production systems end to end.', 'Comfortable with startups and enterprise teams alike.'],
    techAI: ['I have built and deployed ML and LLM systems used by real customers.', 'From data strategy to production models — pragmatic and ROI-focused.'],
    business: ['Clear advice in plain language, with fixed quotes.'],
    creative: ['Collaborative and quick to turn around — portfolio available on request.'],
    beauty: ['Hygiene-first with sterilised tools and salon-grade products.'],
    nanny: ['Gentle, patient and trusted by families for years.'], care: ['Compassionate care with clear updates for the family after each visit.'],
  };
  const OPEN = ['Professional, punctual and friendly.', 'Verified professional — quality you can trust!', 'Quality work with fair, transparent pricing.', 'Reliable and detail-oriented.'];

  // ------------------------------------------------------------ booking policies
  DR.defaultPolicy = () => ({ mode: 'instant', approvalHours: 12, rescheduleLockHours: 24, maxReschedules: 2, freeCancelHours: 24, leadMinutes: 60, advanceDays: 30, bufferMinutes: 0 });
  DR.policy = (p) => Object.assign(DR.defaultPolicy(), (p && p.policy) || {});
  function policyFor(r, g) {
    const req = ['tech', 'business', 'renovation', 'events', 'creative', 'care', 'nanny'].includes(g.id);
    return { mode: r() < (req ? 0.6 : 0.2) ? 'request' : 'instant', approvalHours: pick(r, [2, 6, 12, 24]), rescheduleLockHours: pick(r, [6, 12, 24, 48]), maxReschedules: pick(r, [1, 2, 3]), freeCancelHours: pick(r, [12, 24, 48]), leadMinutes: pick(r, [60, 120, 180]), advanceDays: pick(r, [14, 21, 30, 60]), bufferMinutes: pick(r, [0, 0, 15, 30]) };
  }

  // ------------------------------------------------------------ availability patterns
  const R1 = (a, b) => [[a, b]];
  function weekly(map) { const w = {}; for (let d = 0; d < 7; d++) w[d] = map[d] || []; return w; }
  const PATTERNS = {
    fullweek: () => weekly({ 0: R1('10:00', '18:00'), 1: R1('09:00', '21:00'), 2: R1('09:00', '21:00'), 3: R1('09:00', '21:00'), 4: R1('09:00', '21:00'), 5: R1('09:00', '21:00'), 6: R1('09:00', '21:00') }),
    weekday: () => weekly({ 1: R1('09:00', '18:00'), 2: R1('09:00', '18:00'), 3: R1('09:00', '18:00'), 4: R1('09:00', '18:00'), 5: R1('09:00', '18:00'), 6: R1('10:00', '14:00') }),
    evening: () => weekly({ 1: R1('17:00', '22:00'), 2: R1('17:00', '22:00'), 3: R1('17:00', '22:00'), 4: R1('17:00', '22:00'), 5: R1('17:00', '21:00'), 6: R1('09:00', '18:00'), 0: R1('10:00', '17:00') }),
    split: () => { const s = [['09:00', '12:00'], ['14:00', '19:00']]; return weekly({ 1: s, 2: s, 3: s, 4: s, 5: s, 6: s }); },
    late: () => weekly({ 0: R1('12:00', '23:00'), 1: R1('12:00', '23:00'), 3: R1('12:00', '23:00'), 4: R1('12:00', '23:00'), 5: R1('12:00', '23:30'), 6: R1('11:00', '23:30') }),
  };
  DR.AVAIL_PRESETS = PATTERNS;
  function availFor(r, g) {
    const pref = { tuition: ['evening', 'evening', 'split'], music: ['evening', 'split'], language: ['evening', 'weekday'], massage: ['late', 'fullweek'], tech: ['weekday', 'evening', 'split'], business: ['weekday'], sports: ['evening', 'fullweek'], beauty: ['fullweek', 'late'] }[g.id] || ['fullweek', 'weekday', 'split'];
    return { slotMinutes: g.id === 'massage' ? 30 : 60, weekly: PATTERNS[pick(r, pref)](), overrides: {}, blocks: {}, busy: between(r, 10, 35) };
  }
  DR.defaultAvailability = () => ({ slotMinutes: 60, weekly: PATTERNS.weekday(), overrides: {}, blocks: {} });

  // ------------------------------------------------------------ pricing helpers
  function nice(x) {
    if (x <= 0) return 0;
    if (x < 30) return Math.round(x);
    const r5 = Math.round(x / 5) * 5;
    return r5 % 10 === 0 ? r5 - 2 : r5 + 3;
  }
  const catalogPrice = (sub, cc) => nice(sub.price * DR.COUNTRIES[cc || S().country].rate);
  DR.nicePrice = nice;

  // ------------------------------------------------------------ seed generation
  const HOT_GROUPS = ['massage', 'cleaning', 'tuition', 'tech', 'sports', 'music', 'beauty', 'repair', 'care'];
  const seeds = {};
  const seedIndex = {};
  function weightedArea(r, areas) {
    const total = areas.reduce((a, x) => a + x.w, 0);
    let t = r() * total;
    for (const a of areas) { t -= a.w; if (t <= 0) return a; }
    return areas[0];
  }
  function genCountry(cc) {
    if (seeds[cc]) return seeds[cc];
    const r = rng('doneright-seed-' + cc);
    const used = new Set(Object.keys(seedIndex));
    const out = [];
    DR.GROUPS.forEach((g) => {
      const passes = HOT_GROUPS.includes(g.id) ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        for (let i = pass; i < g.subs.length; i += 2) {
          const subs = [g.subs[i], g.subs[(i + 1) % g.subs.length]];
          if (r() < 0.35) subs.push(g.subs[(i + 2) % g.subs.length]);
          out.push(makeProvider(r, cc, g, [...new Set(subs)], used));
        }
      }
    });
    out.forEach((p) => { seedIndex[p.id] = p; });
    return (seeds[cc] = out);
  }
  function licenceCerts(r, cc, subs) {
    const out = [];
    subs.forEach((s) => DR.lic.rules(s.id, cc).forEach((options) => {
      const id = options[0];
      if (out.some((c) => c.licenceId === id)) return;
      const L = DR.LICENCES[id];
      out.push({ name: L.name, issuer: L.issuer, licenceId: id, issued: ym(addMonths(new Date(), -between(r, 6, 60))), expiry: ym(addMonths(new Date(), between(r, 8, 36))), credentialId: `${id.split('-')[1].toUpperCase().slice(0, 4)}-${between(r, 10000, 99999)}`, verified: true, registerCheck: { status: 'Active', source: L.register, checkedAt: Date.now() - between(r, 1, 60) * 86400000 } });
    }));
    return out;
  }
  function makeProvider(r, cc, g, subs, used) {
    let id;
    do { id = String(between(r, 100000, 999999)); } while (used.has(id));
    used.add(id);
    const gender = r() < (g.female ?? 0.5) ? 'F' : 'M';
    const eth = ethnicity(r, cc);
    const name = makeName(r, eth, gender);
    const age = between(r, g.id === 'tech' ? 24 : 22, ['care', 'business', 'renovation'].includes(g.id) ? 58 : 50);
    const area = weightedArea(r, DR.AREAS[cc]);
    const primary = subs[0];
    const role = g.roleFromSub ? primary.name.replace(/\s*\(.*\)/, '') : g.role;
    const yearsExp = clamp(between(r, 1, Math.max(1, age - 21)), 1, 30);
    const joinedMonths = between(r, 1, Math.min(60, yearsExp * 12));
    const reviews = between(r, 3, 420);
    const certPool = (CERTS[primary.id] || CERTS[g.id] || { SG: [], MY: [] })[cc];
    const certs = licenceCerts(r, cc, subs).concat(certPool.slice().sort(() => r() - 0.5).slice(0, between(r, 1, Math.min(3, Math.max(1, certPool.length)))).filter(Boolean).map(([cn, issuer]) => ({ name: cn, issuer, issued: ym(addMonths(new Date(), -between(r, 6, 96))), credentialId: `${issuer.replace(/[^A-Z]/g, '').slice(0, 3) || 'CRT'}-${between(r, 100000, 999999)}`, verified: r() < 0.9 })));
    const shop = r() < 0.5 ? company(r, cc, g.id) : null;
    const langs = languagesFor(r, cc, eth, g, subs);
    const aiLike = ['ml-engineer', 'ai-expert', 'genai-engineer', 'data-scientist'].includes(primary.id);
    const line = pick(r, (aiLike ? LINES.techAI : LINES[g.id]) || ['Reliable, punctual and friendly.']);
    const services = subs.map((s) => {
      const base = catalogPrice(s, cc);
      return { subId: s.id, name: s.name, price: base === 0 ? 0 : nice(base * (0.85 + r() * 0.5)), unit: s.unit, duration: s.duration, sold: between(r, 1, 320), assessed: pick(r, ['Good', 'Excellent', 'Excellent', 'Outstanding']), desc: '' };
    });
    const bgNeeded = subs.some((s) => DR.lic.bgRequired(s.id));
    return {
      id, country: cc, name, gender, age, eth, area,
      lat: area.lat + (r() - 0.5) * 0.028, lng: area.lng + (r() - 0.5) * 0.028,
      groupId: g.id, subs: subs.map((s) => s.id), role,
      headline: `${role} · ${yearsExp} yr${yearsExp > 1 ? 's' : ''} experience`,
      bio: `${pick(r, OPEN)} ${yearsExp} years of experience in ${g.name.toLowerCase()}, specialising in ${subs.map((s) => s.name.replace(/\s*\(.*\)/, '')).join(', ')}. ${line} I speak ${langs.join(', ')}.`,
      languages: langs,
      skill: [3.5, 3.75, 4, 4.25, 4.5, 4.75, 5][between(r, 0, 6)],
      reviews, positive: between(r, 96, 100), repeat: Math.round(reviews * r() * 0.3), jobs: reviews + between(r, 5, 900),
      followers: between(r, 5, 1500), joinedMonths, yearsExp,
      education: eduFor(r, cc, g, primary, age, area),
      experience: expFor(r, cc, g, primary, yearsExp, joinedMonths, area, role),
      certs,
      verified: { identity: true, phone: true, liveness: true, assessment: r() < 0.85, certs: certs.some((c) => c.verified), education: true, background: bgNeeded || r() < 0.5, business: !!shop, licensed: certs.some((c) => c.licenceId) },
      shop, services,
      availability: availFor(r, g),
      policy: policyFor(r, g),
      metrics: [between(r, 88, 98), between(r, 86, 99), between(r, 85, 97), between(r, 88, 99), between(r, 86, 99), between(r, 84, 96)],
      photos: between(r, 3, 6), photoMatch: between(r, 88, 98), uploaded: between(r, 1, 120),
      travelBase: cc === 'SG' ? pick(r, [0, 3, 5, 8]) : pick(r, [0, 5, 10, 15]),
      serves: g.id === 'massage' ? pick(r, ['all', 'all', gender === 'F' ? 'female' : 'male']) : 'all',
      isNew: joinedMonths <= 2, activeToday: r() < 0.7, coupon: r() < 0.25, responseMins: pick(r, [5, 10, 15, 30, 60]),
      skills: [],
    };
  }

  // ------------------------------------------------------------ user-registered providers
  function monthsSince(ts) { return Math.max(0, Math.round((Date.now() - ts) / (30 * 86400000))); }
  function ageFrom(dob) { if (!dob) return null; const d = new Date(dob); if (isNaN(d)) return null; return Math.floor((Date.now() - d) / (365.25 * 86400000)); }
  // With the backend: the server's aggregate count (others' follows) plus this account's own follow.
  // Demo mode: every account on this device that follows them.
  function followerCount(id) {
    if (DR.backend && DR.backend.enabled) return DR.backend.followers(id) + (DR.store.lists().follows.providers.includes(id) ? 1 : 0);
    return Object.values(S().userData).filter((l) => l && l.follows && (l.follows.providers || []).includes(id)).length;
  }
  function fromUser(u) {
    const pv = u.provider;
    if (!pv) return null;
    const cc = u.country || 'SG';
    const area = DR.area(pv.area, cc);
    const ver = u.verification || {};
    const ok = (x) => x && x.status === 'verified';
    const active = (pv.services || []).filter((s) => s.active !== false);
    const allSubs = active.length ? active.map((s) => s.subId) : (pv.subs || []);
    const groupId = allSubs.length && DR.SUB[allSubs[0]] ? DR.SUB[allSubs[0]].groupId : 'lifestyle';
    const g = DR.GROUP[groupId];
    const primary = DR.SUB[allSubs[0]];
    const myReviews = S().reviews.filter((x) => x.providerId === u.id);
    const completed = S().orders.filter((o) => o.providerId === u.id && ['to_review', 'completed'].includes(o.status)).length;
    const jitter = (hash(u.id) % 1000) / 1000 - 0.5;
    const role = primary ? (g.roleFromSub ? primary.name.replace(/\s*\(.*\)/, '') : g.role) : 'Service Provider';
    const services = active.map((s) => {
      const chk = DR.lic.check(u, s.subId);
      return {
        subId: s.subId, name: s.name || (DR.SUB[s.subId] || {}).name, price: +s.price || 0, unit: s.unit, duration: +s.duration || 60,
        sold: S().orders.filter((o) => o.providerId === u.id && o.subId === s.subId && o.status !== 'cancelled').length, assessed: null, desc: s.desc || '',
        locked: !chk.ok && (chk.regulated || chk.bgRequired), lic: chk,
      };
    });
    const certs = (ver.certifications || []).map((c) => ({ name: c.name, issuer: c.issuer, licenceId: c.licenceId, issued: c.issued, expiry: c.expiry, credentialId: c.credentialId, url: c.url, verified: c.status === 'verified', status: c.status, file: c.file, registerCheck: c.registerCheck }));
    return {
      id: u.id, isUser: true, country: cc, name: u.name || 'New provider', gender: u.gender || 'M', age: u.age != null ? u.age : ageFrom(u.dob), area,
      lat: area.lat + jitter * 0.02, lng: area.lng - jitter * 0.02, groupId, subs: allSubs, role,
      headline: pv.headline || `${role}`, bio: pv.bio || '', languages: pv.languages && pv.languages.length ? pv.languages : ['English'],
      skill: myReviews.length ? Math.round((myReviews.reduce((a, x) => a + x.stars, 0) / myReviews.length) * 4) / 4 : null,
      reviews: myReviews.length, positive: myReviews.length ? Math.round((myReviews.filter((x) => x.stars >= 4).length / myReviews.length) * 100) : 100,
      repeat: 0, jobs: completed, followers: followerCount(u.id),
      joinedMonths: monthsSince(pv.createdAt || Date.now()), yearsExp: +pv.years || 1,
      education: (ver.education || []).map((e) => ({ school: e.school, degree: e.degree, field: e.field, start: e.start, end: e.end, grade: e.grade, verified: e.status === 'verified', status: e.status, file: e.file })),
      experience: (ver.experience || []).map((e) => ({ title: e.title, company: e.company, type: e.type, location: e.location, start: e.start, end: e.current ? null : e.end, desc: e.desc, verified: e.status === 'verified', status: e.status, file: e.file })),
      certs,
      verified: { identity: ok(ver.identity), phone: true, liveness: !!(ver.identity && ver.identity.liveness === 'passed'), assessment: false, certs: certs.some((c) => c.verified), education: (ver.education || []).some(ok), background: ok(ver.background), business: ok(ver.business), licensed: certs.some((c) => c.licenceId && c.verified) },
      identityPending: ver.identity && ver.identity.status === 'pending',
      shop: ok(ver.business) ? ver.business.name : null, businessDoc: ver.business && ver.business.file,
      services: services.filter((s) => !s.locked), lockedServices: services.filter((s) => s.locked),
      availability: pv.availability || DR.defaultAvailability(),
      policy: pv.policy || DR.defaultPolicy(),
      metrics: null, photos: 1, photoFile: u.avatar && u.avatar.id, photoMatch: ver.identity && ver.identity.faceMatch, uploaded: 0,
      travelBase: +pv.travelFee || 0, serves: pv.serves || 'all', isNew: true, activeToday: true, coupon: false, responseMins: 15,
      status: pv.status, paused: pv.paused, skills: pv.skills || [],
    };
  }

  // ------------------------------------------------------------ geo
  function distKm(a, b) {
    const Rr = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * Rr * Math.asin(Math.sqrt(x));
  }
  const distCache = new Map();

  // ------------------------------------------------------------ reviews
  const REVIEW_LINES = {
    generic: ['Very professional and punctual. Highly recommended!', 'Great service, will definitely book again.', 'Friendly, skilled and explained everything clearly.', 'Arrived on time and did a thorough job.', 'Excellent value for money.', 'Second time booking — consistently good.', 'Polite and respectful, left the place tidy.', 'Clear communication from start to finish.'],
    massage: ['Pressure was just right, my back feels so much better.', 'Very skilled with shoulder and neck knots. Strictly professional.', 'Part-time but very serious about technique. Will book again.'],
    tuition: ['My son finally understands algebra — his grades improved a lot!', 'Patient teacher with great exam tips.', 'Clear explanations and well-prepared worksheets.'],
    tech: ['Delivered our MVP ahead of schedule with clean, documented code.', 'Helped us deploy our ML model to production — very knowledgeable.', 'Great at explaining complex AI concepts to our non-technical team.'],
    sports: ['My daughter is no longer afraid of the water. Thank you coach!', 'Structured sessions — I can see progress every week.'],
    music: ['Lessons are fun and my kids practise more now.', 'Helped me pass my Grade 5 exam with merit!', 'My singing range and breath control improved so much.'],
    cleaning: ['House is spotless, even cleaned the window grilles.', 'Efficient and thorough, great attention to detail.'],
    repair: ['Fixed the leak quickly and explained the cause.', 'Fair pricing and very neat work.'],
    beauty: ['Gel nails lasted three weeks — beautiful work.', 'Very hygienic and gentle.'],
    care: ['Caring and attentive with my elderly mother.', 'Very professional, with clear updates after each visit.'],
    nanny: ['Our baby loved her — very gentle and reliable.', 'Trustworthy and punctual every time.'],
  };
  DR.REVIEW_LINES = REVIEW_LINES;
  const REPLY_LINES = ['Thank you so much for your kind words! Looking forward to seeing you again 😊', 'Thanks for booking with me — it was a pleasure!', 'Appreciate the review! Let me know whenever you need help again.', 'Thank you! Glad the session helped.'];
  const reviewCache = {};

  // ------------------------------------------------------------ availability engine (memoised per store revision + minute)
  const memo = new Map();
  let memoRev = -1, memoMin = -1;
  function cached(k, fn) {
    const rv = DR.store.rev, mn = Math.floor(Date.now() / 60000);
    if (rv !== memoRev || mn !== memoMin) { memo.clear(); memoRev = rv; memoMin = mn; }
    if (memo.has(k)) return memo.get(k);
    const v = fn(); memo.set(k, v); return v;
  }
  DR.avail = {
    ranges(p, key) {
      const a = p.availability || {};
      const ov = a.overrides && a.overrides[key];
      if (ov) return ov.off ? [] : ov.ranges || [];
      return (a.weekly && a.weekly[parseKey(key).getDay()]) || [];
    },
    dayIndex(key) { return Math.round((parseKey(key) - parseKey(dateKey(new Date()))) / 86400000); },
    // opts: { excludeOrder, ignoreLead, now }
    slots(p, key, duration, opts = {}) {
      const a = p.availability || {};
      const pol = DR.policy(p);
      const step = a.slotMinutes || 60;
      const block = Math.min(duration || step, 240);
      const now = opts.now || Date.now();
      const outOfWindow = this.dayIndex(key) > pol.advanceDays;
      const minTs = now + (opts.ignoreLead ? 0 : pol.leadMinutes * 60000);
      const buf = pol.bufferMinutes || 0;
      const mine = S().orders.filter((o) => o.providerId === p.id && o.date === key && o.status !== 'cancelled' && o.id !== opts.excludeOrder);
      // with a backend, other customers' bookings arrive as anonymous busy intervals
      const ex = opts.excludeOrder && S().orders.find((o) => o.id === opts.excludeOrder);
      const others = DR.backend && DR.backend.enabled ? DR.backend.busyFor(p.id).filter((b) => b.date === key
        && !mine.some((o) => o.time === b.time) && !(ex && ex.date === b.date && ex.time === b.time)) : [];
      const booked = mine.concat(others)
        .map((o) => ({ s: toMin(o.time) - buf, e: toMin(o.time) + Math.min(o.duration || 60, 240) + buf, id: o.id || null, exact: toMin(o.time) }));
      const blocks = (a.blocks && a.blocks[key]) || [];
      const out = [];
      for (const [s, e] of this.ranges(p, key)) {
        for (let t = toMin(s); t + Math.min(block, step) <= toMin(e); t += step) {
          const time = fromMin(t);
          const b = booked.find((x) => t < x.e && t + block > x.s);
          const blocked = blocks.includes(time);
          const seedBusy = !p.isUser && (hash(p.id + key + time) % 100) < (a.busy || 0);
          const past = slotTs(key, time) < minTs;
          const ok = !b && !blocked && !seedBusy && !past && !outOfWindow;
          out.push({ time, ok, why: b || seedBusy ? 'booked' : blocked ? 'blocked' : past ? 'past' : outOfWindow ? 'window' : '', orderId: b && b.exact === t ? b.id : (b ? b.id : null) });
        }
      }
      return out;
    },
    next(p, duration) {
      if (p.paused) return null;
      return cached(`n|${p.id}|${duration || 0}`, () => {
        const today = new Date();
        const max = Math.min(DR.policy(p).advanceDays, 30);
        for (let i = 0; i <= max; i++) {
          const key = dateKey(addDays(today, i));
          const s = this.slots(p, key, duration).find((x) => x.ok);
          if (s) return { key, time: s.time, day: i };
        }
        return null;
      });
    },
    count(p, key, duration) { return cached(`c|${p.id}|${key}|${duration || 0}`, () => this.slots(p, key, duration).filter((x) => x.ok).length); },
  };

  // ------------------------------------------------------------ fuzzy search
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    return dp[b.length];
  }
  const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9+#\s/-]/g, ' ').split(/[\s/-]+/).filter(Boolean);
  function termScore(term, words) {
    let best = 0;
    for (const w of words) {
      if (w === term) return 3;
      if (term.length <= 2) continue;
      if (w.startsWith(term)) best = Math.max(best, 2.5);
      else if (term.length >= 4 && w.includes(term)) best = Math.max(best, 2);
      else if (term.length >= 4) {
        const tol = term.length >= 7 ? 2 : 1;
        if (lev(term, w) <= tol || (w.length > term.length && lev(term, w.slice(0, term.length)) <= tol - (tol > 1 ? 1 : 0))) best = Math.max(best, 1.5);
      }
    }
    return best;
  }
  // every query term must match (AND); returns 0 when not matched
  // strict: every term must match (AND); any: partial matches score proportionally (fallback)
  function textScore(terms, text, any = false) {
    const words = tokenize(text);
    let total = 0, hit = 0;
    for (const t of terms) { const sc = termScore(t, words); if (!sc) { if (!any) return 0; continue; } total += sc; hit++; }
    return any ? (hit ? total / terms.length : 0) : total;
  }
  function queries(raw) {
    const base = tokenize(raw);
    const out = [base];
    Object.entries(DR.SYNONYMS).forEach(([k, v]) => {
      const kt = tokenize(k);
      const idx = base.findIndex((_, i) => kt.every((w, j) => base[i + j] === w || (w.length >= 5 && base[i + j] && lev(base[i + j], w) <= 1)));
      if (idx >= 0) {
        v.split(' ').forEach((alt) => { const q = base.slice(0, idx).concat(tokenize(alt), base.slice(idx + kt.length)); if (q.length) out.push(q); });
      }
    });
    return out;
  }
  DR.fuzzy = { lev, tokenize, textScore, queries };

  // ------------------------------------------------------------ public data API
  DR.data = {
    catalogPrice,
    seed: genCountry,
    here() {
      const s = S();
      if (s.geo && s.geo.country === s.country) return s.geo;
      return DR.area(s.area);
    },
    providers(cc) {
      cc = cc || S().country;
      const live = DR.backend && DR.backend.enabled;
      const users = Object.values(S().users).filter((u) => u.provider && u.provider.status === 'live' && (u.country || 'SG') === cc && (!live || u._remote)).map(fromUser).filter((p) => p.services.length);
      // with a real backend, only real providers are listed (seed data is for the demo)
      const seeds = live && !(DR.CONFIG.supabase || {}).showSeeds ? [] : genCountry(cc);
      const hidden = DR.store.lists().blocked;
      return hidden.length ? users.concat(seeds).filter((p) => !hidden.includes(p.id)) : users.concat(seeds);
    },
    provider(id) {
      if (S().users[id]) return fromUser(S().users[id]);
      if (!seedIndex[id]) { genCountry('SG'); genCountry('MY'); }
      return seedIndex[id] || null;
    },
    dist(p) {
      const h = this.here();
      const k = `${h.lat},${h.lng}|${p.id}|${p.lat}`;
      if (!distCache.has(k)) { if (distCache.size > 8000) distCache.clear(); distCache.set(k, distKm(h, p)); }
      return distCache.get(k);
    },
    distLabel(p) { const d = this.dist(p); return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`; },
    fee(p, mode) {
      if (mode === 'online') return 0;
      const d = this.dist(p);
      if (d <= 3) return 0;
      return p.country === 'MY' ? Math.min(60, p.travelBase + Math.round((d - 3) * 1.2)) : Math.min(25, p.travelBase + Math.round((d - 3) * 0.6));
    },
    minPrice(p) { const prices = p.services.map((s) => s.price).filter((x) => x > 0); return prices.length ? Math.min(...prices) : 0; },
    sold(sub) { return 200 + (hash(sub.id + S().country) % 60000); },
    subRating(sub) { return 96 + (hash(sub.id) % 4); },
    bySub(subId, cc) { return this.providers(cc).filter((p) => p.services.some((s) => s.subId === subId)).sort((a, b) => this.dist(a) - this.dist(b)); },
    byGroup(gid, cc) { return this.providers(cc).filter((p) => p.groupId === gid || p.subs.some((s) => DR.SUB[s] && DR.SUB[s].groupId === gid)); },
    mode(p) { return (DR.GROUP[p.groupId] || {}).mode || 'onsite'; },
    reviews(p) {
      const replies = S().replies || {};
      const withReply = (r) => (replies[r.id] ? Object.assign({}, r, { reply: replies[r.id] }) : r);
      const mine = S().reviews.filter((x) => x.providerId === p.id).sort((a, b) => b.date - a.date).map(withReply);
      if (p.isUser) return mine;
      if (!reviewCache[p.id]) {
        const r = rng('reviews-' + p.id);
        const pool = REVIEW_LINES[p.groupId] ? REVIEW_LINES[p.groupId].concat(REVIEW_LINES.generic) : REVIEW_LINES.generic;
        const list = [];
        for (let i = 0; i < Math.min(p.reviews, 30); i++) {
          const anon = r() < 0.35;
          const svc = p.services[between(r, 0, p.services.length - 1)];
          const date = Date.now() - between(r, 1, 150) * 86400000 - between(r, 0, 86400000);
          const photoCount = r() < 0.18 ? between(r, 1, 3) : 0;
          list.push({
            id: `${p.id}-r${i}`, name: anon ? 'Anonymous user' : `u${between(r, 10000000, 99999999)}`, anon, vip: r() < 0.15, repeat: r() < 0.25,
            stars: r() < 0.86 ? 5 : r() < 0.75 ? 4 : 3, text: pick(r, pool), date, area: pick(r, DR.AREAS[p.country]).n, useful: between(r, 0, 40),
            sub: svc.name, subId: svc.subId, verified: true, seedPhotos: photoCount,
            reply: r() < 0.22 ? { text: pick(r, REPLY_LINES), ts: date + between(r, 1, 48) * 3600000 } : null,
          });
        }
        reviewCache[p.id] = list.sort((a, b) => b.date - a.date);
      }
      return mine.concat(reviewCache[p.id].map(withReply));
    },
    search(q) {
      const raw = q.toLowerCase().trim();
      if (!raw) return { subs: [], groups: [], providers: [] };
      const qs = queries(raw);
      let any = false;
      const best = (text) => Math.max(...qs.map((t) => textScore(t, text, any)));
      const rankSubs = () => DR.ALL_SUBS.map((s) => ({ s, sc: best(s.name) * 1.2 || best(`${s.name} ${DR.GROUP[s.groupId].name}`) * 0.8 }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || this.sold(b.s) - this.sold(a.s)).map((x) => x.s);
      let subs = rankSubs();
      if (!subs.length && qs[0].length > 1) { any = true; subs = rankSubs().slice(0, 20); }
      const groups = DR.GROUPS.filter((g) => best(g.name) > 0);
      const list = this.providers();
      const providers = list.map((p) => {
        if (p.id === raw) return { p, sc: 100 };
        if (!p._text) p._text = `${p.name} ${p.shop || ''} ${p.role} ${p.subs.map((id) => (DR.SUB[id] || {}).name).join(' ')}`;
        const sc = best(p._text);
        if (!sc) return null;
        const n = DR.avail.next(p);
        return { p, sc: sc * 3 + (p.skill || 4) + (n && n.day === 0 ? 1 : 0) - this.dist(p) / 10 };
      }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 40).map((x) => x.p);
      return { subs, groups, providers };
    },
    fromUser,
    ageFrom,
  };

  // ------------------------------------------------------------ shared cards
  const { esc } = DR.u;
  DR.cards = {
    pimg(p, variant = 0, cls = '') {
      if (p.photoFile && variant === 0) return `<img class="${cls}" data-file="${p.photoFile}" src="${DR.ui.avatar(p.id, p.gender, 0)}" alt="${esc(p.name)}" loading="lazy">`;
      return `<img class="${cls}" src="${DR.ui.avatar(p.id, p.gender, variant)}" alt="${esc(p.name)}" loading="lazy">`;
    },
    availTag(p, compact = false) {
      const n = DR.avail.next(p);
      if (!n) return `<span class="avail avail-off"><b>${p.paused ? 'Paused' : 'Fully booked'}</b></span>`;
      const day = n.day === 0 ? 'Today' : n.day === 1 ? 'Tmrw' : DR.u.DAYS[parseKey(n.key).getDay()];
      return `<span class="avail ${n.day === 0 ? '' : 'avail-later'}"><b>${compact ? day : day === 'Today' ? 'Available today' : day === 'Tmrw' ? 'Tomorrow' : `Next: ${day}`}</b><i>${n.time}</i></span>`;
    },
    rating(p) { return p.skill ? `<span class="rate">${DR.ui.icon('star', 13, 'fill')}${p.skill}</span>` : '<span class="tag tag-blue">New</span>'; },
    modeChip(p) { return DR.policy(p).mode === 'instant' ? `<span class="chip-xs chip-instant">${DR.ui.icon('zap', 11)}Instant book</span>` : ''; },
    provider(p) {
      const U = DR.ui;
      const licensed = p.services.some((s) => DR.lic.regulated(s.subId, p.country));
      const vchips = [licensed ? `<span class="chip-xs chip-ok">${U.icon('shield', 11)}Licensed</span>` : p.verified.identity ? `<span class="chip-xs chip-ok">${U.icon('shield', 11)}ID verified</span>` : '', p.verified.certs && !licensed ? `<span class="chip-xs chip-ok">${U.icon('award', 11)}Certified</span>` : ''].join('');
      return `<a class="pcard" href="#/provider/${p.id}">
        <div class="pcard-img">${this.pimg(p)}</div>
        <div class="pcard-body">
          <div class="row gap6 nowrap"><b class="pcard-name ellipsis" data-no-i18n>${esc(p.name)}</b>${p.isNew ? '<span class="tag tag-green">New</span>' : ''}<span class="grow"></span>${this.availTag(p, true)}</div>
          <div class="chips-xs">${p.age ? `<span class="chip-xs">Age ${p.age}</span>` : ''}<span class="chip-xs">${esc(p.role)}</span>${this.modeChip(p)}${p.coupon ? '<span class="chip-xs chip-coupon">Coupon</span>' : ''}${vchips}</div>
          <div class="row gap10 small nowrap">${this.rating(p)}<span class="muted">from ${U.money(DR.data.minPrice(p), p.country)}</span><span class="muted">${DR.u.compact(p.jobs)} jobs</span><span class="muted hide-xs">${p.positive}% positive</span></div>
          <div class="ellipsis muted small" data-no-i18n>${esc(p.bio || p.headline)}</div>
          <div class="row between xs muted nowrap"><span class="ellipsis">${U.icon('store', 13)} <span ${p.shop ? 'data-no-i18n' : ''}>${esc(p.shop || 'Independent pro')}</span></span><span class="nowrap">${U.icon('pin', 13)} ${DR.data.distLabel(p)}</span></div>
        </div></a>`;
    },
    minPriceOf(p) { return DR.data.minPrice(p); },
    svcCard(sub) {
      return `<a class="svc-card" href="#/service/${sub.id}">${DR.ui.thumb(sub)}<div class="svc-name ellipsis">${esc(sub.name)}</div><div class="price">${DR.cards.priceHTML(catalogPrice(sub), sub.unit)}</div></a>`;
    },
    priceHTML(v, unit, cc) { return v === 0 ? '<b>Free</b> <small>quote on visit</small>' : `<b>${DR.ui.money(v, cc)}</b><small>/${esc(unit)}</small>`; },
    svcRow(sub, opts = {}) {
      const g = DR.GROUP[sub.groupId];
      return `<a class="svc-row" href="#/service/${sub.id}">${DR.ui.thumb(sub, { cls: 'thumb-row' })}<div class="svc-row-body">
        <div class="row gap6 nowrap"><span class="tag tag-select">Select</span><b class="ellipsis">${esc(sub.name)}</b></div>
        <div class="gold xs nowrap">${DR.u.compact(DR.data.sold(sub))} booked <span class="sep">|</span> ${esc(g.arrival)}</div>
        ${opts.desc ? `<div class="muted small ellipsis">${esc(g.blurb)}</div>` : ''}
        <div class="row between"><span class="price">${DR.cards.priceHTML(catalogPrice(sub), sub.unit)}</span><span class="btn btn-primary btn-xs">${DR.isQuoteBased && DR.isQuoteBased(sub) ? 'Get quotes' : 'Book'}</span></div>
      </div></a>`;
    },
  };
  DR.ui.thumb = (sub, { cls = '', badge = '' } = {}) => {
    const g = DR.GROUP[sub.groupId];
    const dur = /min/.test(sub.unit) ? sub.unit : '';
    return `<div class="thumb ${cls}" style="--h:${g.hue}"><span class="thumb-emoji" aria-hidden="true">${sub.emoji}</span>${badge || dur ? `<span class="thumb-badge">${esc(badge || dur)}</span>` : ''}</div>`;
  };
})(window.DR);
