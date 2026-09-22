/* Done Right — runtime configuration. Override any value by defining window.DR_CONFIG before this file loads. */
(function (DR) {
  'use strict';
  DR.CONFIG = Object.assign({
    // Map tile provider per market:
    //  'onemap'   — Singapore Land Authority OneMap basemap (free, no key, SG only)
    //  'maptiler' — MapTiler raster tiles (needs maptilerKey; recommended for MY)
    //  'osm'      — OpenStreetMap community tiles (development only — not for production traffic)
    maps: { SG: 'onemap', MY: 'maptiler' },
    maptilerKey: '',
    // OneMap API token (https://www.onemap.gov.sg/apidocs/) — enables SG postal code → address autofill
    oneMapToken: '',
    // Canonical site URL used for SEO tags and the static page generator
    siteUrl: 'https://doneright.example',
    // Masked-number relay prefixes (production: provisioned numbers from a CPaaS such as Twilio / Vonage / 8x8)
    relay: { SG: '+65 3159', MY: '+60 3-2785' },
    // Launch scope. Markets and languages not listed are hidden everywhere (pickers, sign-in, SEO), but their
    // data and translations stay in the code, so adding 'MY' or 'ms' back switches them on again.
    markets: ['SG'],
    languages: ['en', 'zh'],
    // Supabase backend (see supabase/ and README "Backend"). Leave url empty for local demo mode.
    // anonKey is the public "anon" key; never put the service-role key in client code.
    supabase: { url: '', anonKey: '', showSeeds: false },
    // Demo simulation timings (ms)
    demo: { providerReplyMs: 8000, quoteOfferMs: 6000, reviewMs: 20000 },
  }, window.DR_CONFIG || {});
})(window.DR);
