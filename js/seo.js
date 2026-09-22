/* Done Right — SEO: per-route meta description, Open Graph, canonical URL and schema.org JSON-LD.
 * Crawlers that execute JS (Google) read these; tools/build_seo.py prerenders static landing pages
 * (/sg/<service>/, /my/<service>/<area>/ …) plus sitemap.xml for everything else. */
(function (DR) {
  'use strict';
  const DEFAULT_DESC_BOTH = 'Book verified pros in Singapore & Malaysia — home cleaning, repairs, massage, tuition, swimming and singing lessons, software, ML and AI experts. ID-verified, licensed, protected payments.';
  const DEFAULT_DESC_SG = 'Book verified pros in Singapore — home cleaning, repairs, massage, tuition, swimming and singing lessons, software, ML and AI experts. ID-verified, licensed, protected payments.';
  const defaultDesc = () => (DR.markets().length > 1 ? DEFAULT_DESC_BOTH : DEFAULT_DESC_SG);
  const CURRENCY = { SG: 'SGD', MY: 'MYR' };
  function meta(attr, key, value) {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', value);
  }
  function link(rel, href) {
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
    el.href = href;
  }
  function jsonld(data) {
    let el = document.getElementById('ld-json');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-json'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(data);
  }
  const base = () => (DR.CONFIG.siteUrl || location.origin).replace(/\/$/, '');
  const org = () => ({ '@type': 'Organization', name: 'Done Right', url: base(), logo: `${base()}/assets/icon.svg`, areaServed: DR.markets() });

  DR.seo = {
    apply(seo = {}, title) {
      const t = `${title ? DR.t(title) + ' · ' : ''}Done Right`;
      const desc = seo.desc || defaultDesc();
      meta('name', 'description', desc);
      meta('property', 'og:title', t);
      meta('property', 'og:description', desc);
      meta('property', 'og:type', 'website');
      meta('property', 'og:url', `${base()}/#${DR.router.parse().path}`);
      meta('name', 'robots', seo.noindex ? 'noindex' : 'index,follow');
      link('canonical', seo.canonical ? base() + seo.canonical : `${base()}/#${DR.router.parse().path}`);
      jsonld(seo.jsonld || { '@context': 'https://schema.org', '@graph': [org(), { '@type': 'WebSite', name: 'Done Right', url: base(), potentialAction: { '@type': 'SearchAction', target: `${base()}/#/search?q={query}`, 'query-input': 'required name=query' } }] });
    },
    provider(p) {
      const cur = CURRENCY[p.country];
      return {
        desc: `${p.name} — ${p.role} in ${p.area.n}, ${DR.COUNTRIES[p.country].name}. ${p.skill ? `${p.skill}★ from ${p.reviews} reviews. ` : ''}${p.verified.identity ? 'ID verified. ' : ''}Book online with Done Right.`,
        jsonld: {
          '@context': 'https://schema.org', '@type': 'ProfessionalService', name: p.shop || p.name, url: `${base()}/#/provider/${p.id}`,
          employee: { '@type': 'Person', name: p.name, jobTitle: p.role, knowsLanguage: p.languages },
          address: { '@type': 'PostalAddress', addressLocality: p.area.n, addressRegion: p.area.r, addressCountry: p.country },
          geo: { '@type': 'GeoCoordinates', latitude: +p.lat.toFixed(3), longitude: +p.lng.toFixed(3) },
          ...(p.skill ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.skill, bestRating: 5, reviewCount: p.reviews } } : {}),
          makesOffer: p.services.map((s) => ({ '@type': 'Offer', price: s.price, priceCurrency: cur, itemOffered: { '@type': 'Service', name: s.name } })),
        },
      };
    },
    service(sub, cc) {
      const g = DR.GROUP[sub.groupId];
      const price = DR.data.catalogPrice(sub, cc);
      return {
        canonical: `/${cc.toLowerCase()}/${sub.id}/`, // prerendered by tools/build_seo.py
        desc: `${sub.name} in ${DR.COUNTRIES[cc].name} from ${DR.ui.money(price, cc)}/${sub.unit}. ${g.blurb} Compare verified pros, see live availability and book instantly.`,
        jsonld: {
          '@context': 'https://schema.org', '@type': 'Service', name: sub.name, serviceType: g.name, provider: org(), areaServed: { '@type': 'Country', name: DR.COUNTRIES[cc].name },
          offers: { '@type': 'AggregateOffer', lowPrice: price, priceCurrency: CURRENCY[cc] },
        },
      };
    },
    group(g, cc) {
      return {
        canonical: `/${cc.toLowerCase()}/categories/${g.id}/`,
        desc: `${g.name} services in ${DR.COUNTRIES[cc].name}: ${g.subs.slice(0, 6).map((s) => s.name).join(', ')} and more. ${g.blurb}`,
        jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', name: g.name, itemListElement: g.subs.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${base()}/${cc.toLowerCase()}/${s.id}/` })) },
      };
    },
  };
})(window.DR);
