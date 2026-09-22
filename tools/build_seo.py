#!/usr/bin/env python3
"""Done Right: static SEO landing pages.

The app is a hash-routed SPA, which crawlers index poorly. This script prerenders crawlable,
server-side HTML landing pages from the same data files the app uses:

  /sg/  (/my/ with --markets SG,MY)           country hubs
  /sg/categories/<group>/                    category pages (e.g. /sg/categories/tuition/)
  /sg/<service>/                             service pages (e.g. /sg/swimming-instructor/)
  /sg/<service>/<area>/                      hot services x popular areas (e.g. /my/aircon-servicing/petaling-jaya/)
  sitemap.xml, robots.txt

Each page has a unique title and description, a canonical URL, hreflang alternates between
SG and MY, schema.org JSON-LD (Service, AggregateOffer, BreadcrumbList), and a CTA that
deep-links into the app (/#/service/<id>).

Usage:
  python3 tools/build_seo.py --base https://doneright.sg [--out dist]

Output goes to dist/, which is gitignored. Deploy it next to index.html.
"""
import argparse
import html
import json
import math
import os
import re
import shutil
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COUNTRIES = {
    'SG': {'name': 'Singapore', 'cur': 'S$', 'iso': 'SGD', 'rate': 1.0, 'lang': 'en-SG'},
    'MY': {'name': 'Malaysia', 'cur': 'RM', 'iso': 'MYR', 'rate': 2.6, 'lang': 'en-MY'},
}


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def js_str(s):
    """Parse a single- or double-quoted JS string literal body."""
    return s.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in s else s


STR = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""


def s_of(m, i):
    v = m.group(i) if m.group(i) is not None else m.group(i + 1)
    return js_str(v)


def load_categories():
    src = read('js/data/categories.js')
    groups = []
    # G('id', 'Name', 'emoji', hue, { ...meta }, [ ...subs ]),
    for gm in re.finditer(r"G\('([\w-]+)', " + STR + r", '[^']*', \d+, \{(.*?)\}, \[(.*?)\n    \]\)", src, re.S):
        gid, name, meta, subs_src = gm.group(1), s_of(gm, 2), gm.group(4), gm.group(5)
        blurb = re.search(r"blurb: " + STR, meta)
        short = re.search(r"short: " + STR, meta)
        includes = re.search(r"includes: \[(.*?)\]", meta, re.S)
        subs = []
        for sm in re.finditer(r"\['([\w-]+)', " + STR + r", '[^']*', (\d+), " + STR, subs_src):
            subs.append({'id': sm.group(1), 'name': s_of(sm, 2), 'price': int(sm.group(4)), 'unit': s_of(sm, 5), 'group': gid})
        groups.append({
            'id': gid, 'name': name, 'short': s_of(short, 1) if short else name,
            'blurb': s_of(blurb, 1) if blurb else '',
            'includes': [s_of(m, 1) for m in re.finditer(STR, includes.group(1))] if includes else [],
            'subs': subs,
        })
    hot = re.findall(r"'([\w-]+)'", re.search(r"DR\.HOT = \[(.*?)\];", src, re.S).group(1))
    return groups, hot


def load_areas():
    src = read('js/data/locations.js')
    areas = {}
    for cc in ('SG', 'MY'):
        block = re.search(cc + r": \[(.*?)\n    \],", src, re.S).group(1)
        areas[cc] = [{'n': s_of(m, 1), 'r': s_of(m, 3)} for m in re.finditer(r"A\(" + STR + r", " + STR, block)]
    pop = {}
    for cc in ('SG', 'MY'):
        pop[cc] = [s_of(m, 1) for m in re.finditer(STR, re.search(cc + r": \[(.*?)\]", src[src.index('POPULAR_AREAS'):], re.S).group(1))]
    return areas, pop


def nice(x):
    """Mirror of DR.nicePrice in js/data/providers.js."""
    if x <= 0:
        return 0
    if x < 30:
        return math.floor(x + 0.5)
    r5 = math.floor(x / 5 + 0.5) * 5  # JS Math.round, not banker's rounding
    return r5 - 2 if r5 % 10 == 0 else r5 + 3


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def e(s):
    return html.escape(str(s), quote=True)


CSS = """
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6e6e73;--brand:#e8603c;--card:#f5f5f7;--line:#e5e5ea}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#f5f5f7;--muted:#a1a1a6;--card:#1c1c1e;--line:#2c2c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}a{color:var(--brand)}nav.crumbs{font-size:13px;color:var(--muted);margin:8px 0 16px}
nav.crumbs a{color:var(--muted)}h1{font-size:28px;line-height:1.2;margin:0 0 8px}.lead{color:var(--muted)}
.price{font-size:20px;font-weight:700;color:var(--brand)}.cta{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;
padding:12px 20px;border-radius:999px;font-weight:600;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;
padding:0;list-style:none}.grid a{display:block;padding:10px 12px;background:var(--card);border-radius:12px;text-decoration:none;color:var(--fg)}
.grid small{color:var(--muted)}ul.ticks li{margin:4px 0}section{margin:24px 0}footer{color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:32px;padding-top:16px}
"""


def page(base, path, title, desc, body, ld, alternates=None, lang='en'):
    canon = f'{base}{path}'
    alts = ''.join(f'<link rel="alternate" hreflang="{e(h)}" href="{e(base + p)}">' for h, p in (alternates or []))
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(canon)}">
{alts}
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{e(canon)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/assets/icon.svg">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body><main>{body}
<footer>Done Right: verified home, lifestyle and professional services in {' &amp; '.join(COUNTRIES[m]['name'] for m in MARKETS)}. {' · '.join(f'<a href="/{m.lower()}/">{COUNTRIES[m]["name"]}</a>' for m in MARKETS)}</footer>
</main></body></html>
"""


def crumbs(items):
    return '<nav class="crumbs">' + ' › '.join(f'<a href="{e(h)}">{e(t)}</a>' if h else e(t) for t, h in items) + '</nav>'


def breadcrumb_ld(base, items):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, **({'item': base + h} if h else {})} for i, (t, h) in enumerate(items)]}


MARKETS = ('SG',)   # set by build(); used by the page footer


def build(base, out, markets=('SG',)):
    global MARKETS
    MARKETS = markets
    groups, hot = load_categories()
    areas, pop = load_areas()
    subs = {s['id']: s for g in groups for s in g['subs']}
    org = {'@type': 'Organization', 'name': 'Done Right', 'url': base + '/'}
    urls = []

    if os.path.isdir(out):
        # only wipe a previous build, never an arbitrary directory passed by mistake
        if os.listdir(out) and not os.path.exists(os.path.join(out, 'sitemap.xml')):
            raise SystemExit(f'{out} is not empty and is not a previous build; choose another --out')
        shutil.rmtree(out)

    def write(path, content, prio):
        full = os.path.join(out, path.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w', encoding='utf-8') as f:
            f.write(content)
        urls.append((path, prio))

    for cc, C in COUNTRIES.items():
        if cc not in markets:
            continue
        pre = f'/{cc.lower()}'
        other = '/my' if cc == 'SG' else '/sg'
        # alternates only between markets that are live
        alt = lambda p: [(C['lang'], pre + p)] + ([('en-MY' if cc == 'SG' else 'en-SG', other + p)] if len(markets) > 1 else []) + [('x-default', f'/{markets[0].lower()}' + p)]
        price = lambda s: nice(s['price'] * C['rate'])

        # country hub
        items = [('Home', '/'), (C['name'], None)]
        body = crumbs(items) + f"<h1>Book verified pros in {e(C['name'])}</h1><p class=\"lead\">{sum(len(g['subs']) for g in groups)} services across {len(groups)} categories. ID-verified, licensed where required, protected payments.</p><a class=\"cta\" href=\"/#/\">Open Done Right</a>"
        body += '<section><h2>Categories</h2><ul class="grid">' + ''.join(f'<li><a href="{pre}/categories/{g["id"]}/">{e(g["name"])}<br><small>{len(g["subs"])} services</small></a></li>' for g in groups) + '</ul></section>'
        body += '<section><h2>Popular services</h2><ul class="grid">' + ''.join(f'<li><a href="{pre}/{sid}/">{e(subs[sid]["name"])}<br><small>from {C["cur"]}{price(subs[sid])}/{e(subs[sid]["unit"])}</small></a></li>' for sid in hot if sid in subs) + '</ul></section>'
        write(pre + '/', page(base, pre + '/', f"Done Right {C['name']}: book trusted, verified services", f"Book verified pros in {C['name']}: cleaning, repairs, massage, tuition, swimming, singing, software and AI experts. See live availability and book instantly.", body,
              {'@context': 'https://schema.org', '@graph': [org, breadcrumb_ld(base, items)]}, alt('/'), C['lang']), '0.9')

        # category pages
        for g in groups:
            items = [('Home', '/'), (C['name'], pre + '/'), (g['name'], None)]
            low = min(price(s) for s in g['subs'] if s['price'] > 0) if any(s['price'] > 0 for s in g['subs']) else 0
            body = crumbs(items) + f"<h1>{e(g['name'])} in {e(C['name'])}</h1><p class=\"lead\">{e(g['blurb'])}</p>"
            if low:
                body += f'<p>From <span class="price">{C["cur"]}{low}</span></p>'
            body += f'<a class="cta" href="/#/group/{g["id"]}">Browse {e(g["short"])} pros</a>'
            body += '<section><h2>What\'s included</h2><ul class="ticks">' + ''.join(f'<li>{e(x)}</li>' for x in g['includes']) + '</ul></section>'
            label = lambda s: f'from {C["cur"]}{price(s)}/{e(s["unit"])}' if s['price'] else 'Free quote'
            body += '<section><h2>Services</h2><ul class="grid">' + ''.join(f'<li><a href="{pre}/{s["id"]}/">{e(s["name"])}<br><small>{label(s)}</small></a></li>' for s in g['subs']) + '</ul></section>'
            ld = {'@context': 'https://schema.org', '@graph': [org, breadcrumb_ld(base, items), {'@type': 'ItemList', 'name': g['name'], 'itemListElement': [
                {'@type': 'ListItem', 'position': i + 1, 'url': f'{base}{pre}/{s["id"]}/', 'name': s['name']} for i, s in enumerate(g['subs'])]}]}
            write(f'{pre}/categories/{g["id"]}/', page(base, f'{pre}/categories/{g["id"]}/', f"{g['name']} in {C['name']} | Done Right", f"{g['name']} in {C['name']}: {g['blurb']} Compare verified pros and book online.", body, ld, alt(f'/categories/{g["id"]}/'), C['lang']), '0.8')

        # service pages (+ area pages for hot services)
        for g in groups:
            for s in g['subs']:
                p = price(s)
                price_txt = f'{C["cur"]}{p}/{s["unit"]}' if p else 'Free quote'

                def svc_page(area=None):
                    where = area['n'] if area else C['name']
                    path = f'{pre}/{s["id"]}/' + (f'{slug(area["n"])}/' if area else '')
                    items = [('Home', '/'), (C['name'], pre + '/'), (g['name'], f'{pre}/categories/{g["id"]}/')] + ([(s['name'], f'{pre}/{s["id"]}/'), (area['n'], None)] if area else [(s['name'], None)])
                    body = crumbs(items) + f'<h1>{e(s["name"])} in {e(where)}</h1><p class="lead">{e(g["blurb"])}</p>'
                    body += f'<p>{"From" if p else ""} <span class="price">{e(price_txt)}</span></p><a class="cta" href="/#/service/{s["id"]}">See available pros</a>'
                    body += '<section><h2>Why book on Done Right</h2><ul class="ticks">' + ''.join(f'<li>{e(x)}</li>' for x in g['includes'] + ['ID-verified providers, licensed where the law requires it', 'Pay securely; payment is released only when the job is done']) + '</ul></section>'
                    near = [a for a in pop[cc] if not area or a != area['n']][:8]
                    if s['id'] in hot:
                        body += f'<section><h2>{e(s["name"])} near you</h2><ul class="grid">' + ''.join(f'<li><a href="{pre}/{s["id"]}/{slug(a)}/">{e(s["name"])} in {e(a)}</a></li>' for a in near) + '</ul></section>'
                    related = [x for x in g['subs'] if x['id'] != s['id']][:8]
                    body += '<section><h2>Related services</h2><ul class="grid">' + ''.join(f'<li><a href="{pre}/{x["id"]}/">{e(x["name"])}</a></li>' for x in related) + '</ul></section>'
                    svc = {'@type': 'Service', 'name': s['name'], 'serviceType': g['name'], 'provider': org,
                           'areaServed': {'@type': 'Place', 'name': f'{area["n"]}, {C["name"]}'} if area else {'@type': 'Country', 'name': C['name']}}
                    if p:
                        svc['offers'] = {'@type': 'AggregateOffer', 'lowPrice': p, 'priceCurrency': C['iso']}
                    desc = f'{s["name"]} in {where} {"from " + price_txt if p else "with free quotes"}. {g["blurb"]} Compare verified pros, see live availability and book online.'
                    suffix = f'/{s["id"]}/' + (f'{slug(area["n"])}/' if area else '')
                    alts = [(C['lang'], path)] if area else alt(suffix)
                    write(path, page(base, path, f'{s["name"]} in {where}{" from " + price_txt if p else ""} | Done Right', desc, body,
                                     {'@context': 'https://schema.org', '@graph': [breadcrumb_ld(base, items), svc]}, alts, C['lang']), '0.6' if area else '0.7')

                svc_page()
                if s['id'] in hot:
                    for a in pop[cc]:
                        svc_page(next((x for x in areas[cc] if x['n'] == a), {'n': a, 'r': ''}))

    os.makedirs(out, exist_ok=True)
    today = date.today().isoformat()
    urls.insert(0, ('/', '1.0'))
    with open(os.path.join(out, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for path, prio in urls:
            f.write(f'  <url><loc>{e(base + path)}</loc><lastmod>{today}</lastmod><priority>{prio}</priority></url>\n')
        f.write('</urlset>\n')
    with open(os.path.join(out, 'robots.txt'), 'w', encoding='utf-8') as f:
        f.write(f'User-agent: *\nAllow: /\nDisallow: /tests/\nDisallow: /tools/\n\nSitemap: {base}/sitemap.xml\n')
    return len(urls)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--base', default='https://doneright.example', help='public site origin, no trailing slash')
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist'), help='output directory (default: dist/)')
    ap.add_argument('--markets', default='SG', help='comma-separated markets to publish, e.g. SG or SG,MY (keep in step with js/config.js)')
    a = ap.parse_args()
    n = build(a.base.rstrip('/'), a.out, tuple(m.strip().upper() for m in a.markets.split(',') if m.strip()))
    print(f'Wrote {n} URLs to {a.out} (sitemap.xml, robots.txt, landing pages)')
