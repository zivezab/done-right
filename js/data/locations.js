/* Done Right — markets: Singapore & Malaysia */
(function (DR) {
  'use strict';

  DR.COUNTRIES = {
    SG: {
      code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'S$', dial: '+65', rate: 1,
      phone: /^[3689]\d{7}$/, phoneHint: '8 digits, e.g. 9123 4567', postal: /^\d{6}$/, postalHint: '6-digit postal code',
      idDocs: ['NRIC', 'FIN', 'Passport'], idHint: 'e.g. S1234567A', idPattern: /^[STFGM]\d{7}[A-Z]$/i,
      digitalId: 'Singpass', bizReg: 'ACRA UEN', bizHint: 'e.g. 201912345K or T19LL1234A', bizPattern: /^(\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/i,
      privacyLaw: 'Personal Data Protection Act 2012 (Singapore)', regulator: 'PDPC',
      police: 'Certificate of Clearance (SPF) or employer background screening',
      payments: [['paynow', 'PayNow', 'Scan QR with any SG banking app'], ['card', 'Credit / Debit card', 'Visa, Mastercard, Amex'], ['grabpay', 'GrabPay', 'E-wallet'], ['applepay', 'Apple Pay / Google Pay', 'Device wallet']],
      schools: ['National University of Singapore', 'Nanyang Technological University', 'Singapore Management University', 'Singapore University of Technology and Design', 'Singapore Institute of Technology', 'Singapore University of Social Sciences', 'Temasek Polytechnic', 'Ngee Ann Polytechnic', 'Singapore Polytechnic', 'Republic Polytechnic', 'ITE College Central', 'LASALLE College of the Arts', 'Nanyang Academy of Fine Arts'],
      basic: 'GCE O-Level', suffix: 'Pte Ltd',
    },
    MY: {
      code: 'MY', name: 'Malaysia', flag: '🇲🇾', currency: 'RM', dial: '+60', rate: 2.6,
      phone: /^1\d{8,9}$/, phoneHint: '9–10 digits, e.g. 12 345 6789', postal: /^\d{5}$/, postalHint: '5-digit postcode',
      idDocs: ['MyKad', 'MyPR', 'MyKAS', 'Passport'], idHint: 'e.g. 900101-14-5678', idPattern: /^\d{6}-?\d{2}-?\d{4}$/,
      digitalId: 'MyDigital ID', bizReg: 'SSM registration no.', bizHint: 'e.g. 202301012345 (12 digits)', bizPattern: /^(\d{12}|\d{6,7}-[A-Z])$/i,
      privacyLaw: 'Personal Data Protection Act 2010 (Malaysia)', regulator: 'JPDP',
      police: 'Police clearance / Sijil Kelakuan Baik (PDRM)',
      payments: [['duitnow', 'DuitNow QR', 'Scan QR with any MY banking app'], ['fpx', 'FPX Online Banking', 'Maybank2u, CIMB Clicks, RHB & more'], ['tng', "Touch 'n Go eWallet", 'E-wallet'], ['card', 'Credit / Debit card', 'Visa, Mastercard'], ['grabpay', 'GrabPay', 'E-wallet']],
      schools: ['Universiti Malaya', 'Universiti Kebangsaan Malaysia', 'Universiti Putra Malaysia', 'Universiti Teknologi Malaysia', 'Universiti Sains Malaysia', "Taylor's University", 'Sunway University', 'Monash University Malaysia', 'Asia Pacific University (APU)', 'Multimedia University', 'Universiti Teknologi MARA', 'Politeknik Ungku Omar', 'Kolej Vokasional Kuala Lumpur'],
      basic: 'SPM', suffix: 'Sdn Bhd',
    },
  };

  const A = (n, r, lat, lng, w = 1) => ({ n, r, lat, lng, w });
  DR.AREAS = {
    SG: [
      A('Orchard', 'Central', 1.3048, 103.8318, 2), A('Marina Bay', 'Central', 1.2823, 103.8585), A('Tanjong Pagar', 'Central', 1.2764, 103.8458),
      A('Bugis', 'Central', 1.2995, 103.8554), A('Novena', 'Central', 1.3204, 103.8438), A('Toa Payoh', 'Central', 1.3343, 103.8563, 2),
      A('Bishan', 'Central', 1.3508, 103.8485, 2), A('Queenstown', 'Central', 1.2942, 103.7861), A('Holland Village', 'Central', 1.311, 103.796),
      A('Bukit Timah', 'Central', 1.3294, 103.8021), A('Kallang', 'Central', 1.31, 103.8651), A('Geylang', 'Central', 1.3201, 103.8918),
      A('Sentosa', 'Central', 1.2494, 103.8303, 0.3),
      A('Tampines', 'East', 1.3496, 103.9568, 3), A('Pasir Ris', 'East', 1.3721, 103.9474, 2), A('Bedok', 'East', 1.3236, 103.9273, 3),
      A('Marine Parade', 'East', 1.302, 103.9072, 2), A('Changi', 'East', 1.3644, 103.9915, 0.5),
      A('Ang Mo Kio', 'North-East', 1.3691, 103.8454, 3), A('Serangoon', 'North-East', 1.3554, 103.8679, 2), A('Hougang', 'North-East', 1.3712, 103.8863, 3),
      A('Sengkang', 'North-East', 1.3868, 103.8914, 3), A('Punggol', 'North-East', 1.3984, 103.9072, 3),
      A('Woodlands', 'North', 1.4382, 103.789, 3), A('Yishun', 'North', 1.4304, 103.8354, 3), A('Sembawang', 'North', 1.4491, 103.8185, 2),
      A('Jurong East', 'West', 1.3329, 103.7436, 3), A('Jurong West', 'West', 1.3404, 103.709, 3), A('Clementi', 'West', 1.3162, 103.7649, 2),
      A('Buona Vista', 'West', 1.3071, 103.7904), A('Bukit Batok', 'West', 1.359, 103.7637, 2), A('Bukit Panjang', 'West', 1.3774, 103.7719, 2),
      A('Choa Chu Kang', 'West', 1.384, 103.747, 2),
    ],
    MY: [
      A('KLCC', 'Kuala Lumpur', 3.1579, 101.7123, 2), A('Bukit Bintang', 'Kuala Lumpur', 3.1466, 101.7101, 2), A('Bangsar', 'Kuala Lumpur', 3.1297, 101.671, 2),
      A('Mont Kiara', 'Kuala Lumpur', 3.1706, 101.6528, 2), A('Cheras', 'Kuala Lumpur', 3.087, 101.744, 3), A('Kepong', 'Kuala Lumpur', 3.215, 101.636, 2),
      A('Sri Petaling', 'Kuala Lumpur', 3.069, 101.689, 2), A('Setapak', 'Kuala Lumpur', 3.2, 101.725, 2), A('Brickfields', 'Kuala Lumpur', 3.13, 101.686),
      A('Petaling Jaya', 'Selangor', 3.1073, 101.6067, 4), A('Subang Jaya', 'Selangor', 3.0567, 101.5851, 3), A('Shah Alam', 'Selangor', 3.0733, 101.5185, 3),
      A('Puchong', 'Selangor', 3.025, 101.618, 3), A('Cyberjaya', 'Selangor', 2.9213, 101.6559, 2), A('Klang', 'Selangor', 3.0449, 101.4456, 2),
      A('Damansara', 'Selangor', 3.15, 101.62, 2), A('Ampang', 'Selangor', 3.15, 101.76, 2), A('Kajang', 'Selangor', 2.9927, 101.7909, 2),
      A('Putrajaya', 'Putrajaya', 2.9264, 101.6964),
      A('George Town', 'Penang', 5.4141, 100.3288, 2), A('Bayan Lepas', 'Penang', 5.2945, 100.2593, 1.5), A('Butterworth', 'Penang', 5.3991, 100.3638),
      A('Johor Bahru', 'Johor', 1.4927, 103.7414, 2.5), A('Iskandar Puteri', 'Johor', 1.426, 103.638, 1.5), A('Skudai', 'Johor', 1.5333, 103.6572),
      A('Ipoh', 'Perak', 4.5975, 101.0901, 1), A('Melaka City', 'Melaka', 2.1896, 102.2501, 1), A('Seremban', 'Negeri Sembilan', 2.7297, 101.9381, 1),
      A('Kuantan', 'Pahang', 3.8077, 103.326, 0.6), A('Alor Setar', 'Kedah', 6.1248, 100.3678, 0.5), A('Kota Bharu', 'Kelantan', 6.1254, 102.2381, 0.4),
      A('Kuala Terengganu', 'Terengganu', 5.3296, 103.137, 0.4), A('Kota Kinabalu', 'Sabah', 5.9804, 116.0735, 0.8), A('Kuching', 'Sarawak', 1.5535, 110.3593, 0.8),
    ],
  };
  DR.POPULAR_AREAS = {
    SG: ['Orchard', 'Tampines', 'Jurong East', 'Woodlands', 'Punggol', 'Bishan', 'Bedok', 'Ang Mo Kio', 'Clementi', 'Sengkang', 'Toa Payoh', 'Marina Bay'],
    MY: ['KLCC', 'Petaling Jaya', 'Subang Jaya', 'Mont Kiara', 'Cheras', 'Shah Alam', 'Cyberjaya', 'George Town', 'Johor Bahru', 'Ipoh', 'Kota Kinabalu', 'Kuching'],
  };
  DR.area = (name, cc) => {
    const list = DR.AREAS[cc || DR.store.s.country];
    return list.find((a) => a.n === name) || list[0];
  };
  DR.LANGUAGES = ['English', 'Mandarin', 'Malay', 'Tamil', 'Cantonese', 'Hokkien', 'Teochew', 'Hakka', 'Hindi', 'Tagalog', 'Indonesian', 'Japanese', 'Korean', 'French', 'German', 'Spanish', 'Arabic'];
})(window.DR);
