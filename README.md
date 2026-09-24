# Done Right

An English-first, mobile-friendly marketplace web app for home, lifestyle and professional services in **Singapore** and **Malaysia**, fully translated into **中文** and **Bahasa Melayu**. It's modelled on the 到位 (Daowei) app and adds:

- **Two-sided accounts.** Anyone can register as a customer, a service provider, or both.
- **Verification like a LinkedIn profile.** Identity (NRIC / FIN / MyKad / passport with a liveness check, or Singpass / MyDigital ID), education, licences & certifications, work experience, background checks and business registration (ACRA UEN / SSM). Each item has its own review status, expiry and verified badge.
- **A yellow-pages directory.** 303 service types in 24 groups: every category from the 到位 screenshots, plus tuition, languages, music (singing coach, piano…), sports (swimming instructor…), tech (software engineer, ML engineer, AI expert…), business, creative, events, renovation, pets, errands and more.
- **Provider-controlled scheduling.** Weekly hours, slot length, date overrides, per-slot blocking and booking rules (instant vs request-to-book, reschedule lock period, notice, booking window, buffers).

## Launch scope

The first launch is **Singapore only**, in **English and Chinese**. Two settings in `js/config.js` control this:

```js
markets: ['SG'],          // add 'MY' to bring Malaysia back
languages: ['en', 'zh'],  // add 'ms' to bring Bahasa Melayu back
```

Anything outside the launch is hidden everywhere: the country pickers, the +60 sign-in prefix, Malaysian payment methods and schools, the Malay language option, the `hreflang` tags and the SEO pages. People with an old Malaysian or Malay setting, or an old `?lang=ms` link, are moved to Singapore and English. The Malaysian data, licences and Malay translations all stay in the code, and the translation tests still check them (using `?langs=all`), so switching them back on is just a settings change. The SEO generator follows the same rule: it publishes Singapore by default, and `--markets SG,MY` publishes both.

## Run it

No build step and no dependencies. Start the bundled no-cache dev server:

```bash
python3 tools/serve.py 5173
```

Then open http://localhost:5173 on a phone-sized window. Any static server works too, but `serve.py` sends `Cache-Control: no-store` so you never run stale scripts.

The app is fully client-side. State lives in `localStorage` (follows, hidden providers and the cart are kept per account; a guest's cart joins their account when they sign in) and uploaded documents live in `IndexedDB`, encrypted. **Settings › Reset demo data** clears everything. Add `?sandbox=<name>` to the URL for an isolated data set, and `?lang=zh|ms` to switch language.

## Tests

Open http://localhost:5173/tests/index.html. The suite has 155 tests covering availability, booking and rescheduling, quotes, licensing, verification, chat, search, SEO, i18n, per-account lists, the Supabase adapter (against a mock client) and performance budgets. It runs in the browser against isolated storage (`doneright.test.v1`), so your demo data is untouched. Results are also exposed as `window.__TESTS__` for automation.

The i18n specs crawl about 42 routes in both 中文 and Bahasa Melayu, and fail on any untranslated UI string. Missing strings are listed in `window.__MISSING_ZH__` and `window.__MISSING_MS__`.

The database has its own suite of 220 checks, run against a throwaway local Postgres (`brew install postgresql@16`):

```bash
python3 tools/db_test.py
```

## Backend (Supabase)

The app works in two modes:

- **Local demo (default).** Everything lives in the browser, with ~500 generated providers and simulated counterparts.
- **Supabase.** Set `supabase.url` and `supabase.anonKey` in `js/config.js`. Then:
  - Sign-in uses real SMS or email codes.
  - Only real providers are listed.
  - Your profile, provider listing, document details, follows, hidden providers and cart are saved to the server.
  - Every booking action (book, pay, accept, decline, reschedule, propose, cancel, complete) runs as a database function that re-checks the rules.
  - Orders and review decisions update live across devices.

`supabase/README.md` explains how to set up a project, and what is still device-only (document files, chat, quotes, reviews).

## Features

### Customers
- **Discovery.** Search with typo tolerance and synonyms ("maid", "ac", "psle"), a category directory, Nearby (map + list, lazy-loaded) with filters including *Instant book* and *Licensed*, and a waitlist when no pro is in range.
- **Booking.** Real open slots that respect each provider's rules. *Instant book* confirms on payment. *Request to book* holds payment until the provider accepts; it auto-refunds if they decline or don't respond.
- **Reschedule.** Customers can move a booking themselves until the provider's lock period (e.g. 24 h before). Request-to-book providers approve moves. Providers can propose a new time, which the customer accepts or declines.
- **Request a quote.** For renovation, moving, events and other custom jobs: describe the job, add photos, a budget and a time. Up to 5 nearby pros send offers; accepting one books it at the quoted price.
- **Chat and calls.** Realtime chat with presence and typing indicators. Voice calls through a masked relay number (WebRTC between two browser tabs; simulated for demo pros). Calls are only possible around an active booking.
- **Reviews.** Photo reviews marked *Verified booking*, plus provider replies.

### Providers
- **Schedule.** Tap any day to block or unblock individual slots, block the whole day or set custom hours. Existing bookings are never silently cancelled.
- **Booking rules.** Instant / request mode, response window, reschedule lock period and limit, free-cancellation window, minimum notice, booking window and buffer.
- **Jobs and quotes inbox.** Accept or decline requests, propose new times, send quotes into free slots only.
- **Licensing rules per category.** 41 statutory licences (e.g. EMA, PUB, HDB, NEA, SNB, CEA, Suruhanjaya Tenaga, SPAN, CIDB, MOTAC, KKM) mapped to the services that need them in each market. Regulated services stay hidden from customers until the licence is verified. Childcare, tuition, eldercare and some pet services also require a background check.
- **Review replies.** Reply to reviews, with an *Unreplied* filter.

### Trust & Safety
- **Stronger identity checks.** A camera liveness challenge, document expiry, a face-match score, and a SHA-256 ID hash registry that stops one ID being used on two accounts. Licence numbers are checked against a (simulated) public register.
- **Encrypted documents.** Verification uploads are encrypted with AES-256-GCM, using a non-extractable key held in IndexedDB.
- **Reviewer console** (`#/admin`). Pending and reviewed queues, approve or reject with a reason, and an audit log.

### SEO
- Each route sets its own meta description, Open Graph tags, canonical URL and schema.org JSON-LD (`Service`, `ProfessionalService`, `AggregateRating`, `ItemList`). Private pages are `noindex`.
- `tools/build_seo.py` prerenders crawlable landing pages from the same data files:

  ```bash
  python3 tools/build_seo.py --base https://doneright.sg
  ```

  This writes `dist/` (gitignored) with about 1,100 pages: country hubs, `/{sg,my}/categories/<group>/`, `/{sg,my}/<service>/`, and hot services × popular areas (`/my/aircon-servicing/petaling-jaya/`). It also writes `sitemap.xml` and `robots.txt`. Deploy `dist/` next to `index.html`. The SPA's canonical URLs point at these pages.

## Configuration

`js/config.js` holds the defaults. Override them by defining `window.DR_CONFIG` before it loads.

| Key | Purpose |
| --- | --- |
| `maps` | Tile provider per market: `onemap` (SG, free and keyless), `maptiler` (needs `maptilerKey`) or `osm` (development only) |
| `maptilerKey` | MapTiler API key; recommended for Malaysia |
| `oneMapToken` | Enables SG postal code → address autofill |
| `siteUrl` | Canonical origin for SEO tags |
| `relay` | Masked-number prefixes per market |
| `demo` | Simulation timings (provider replies, quote offers, auto-review) |
| `supabase` | `url` and public `anonKey` of your Supabase project; empty means local demo mode. `showSeeds` also lists demo providers |

## Demo notes

| Flow | What happens in demo mode |
| --- | --- |
| Sign in | Mobile (+65 / +60) or email OTP. The code is shown on screen. |
| Payment | PayNow / card / GrabPay (SG) and DuitNow / FPX / Touch 'n Go / card (MY) are simulated. No card data is collected. |
| Verification review | Auto-approved about 20 s after submission. Toggle this off in `#/admin` to review items by hand. |
| Counterparts | Seed providers accept requests (about 1 in 10 decline), approve reschedules and send quotes. Sample customers accept proposals. Toggle this in `#/admin`. |
| Realtime | Open the app in two tabs and sign in as different users to chat and call each other live. |

The seed providers (~500) are generated deterministically with verified licences where required, so every service has providers in both countries.

## Structure

```
index.html
css/app.css             # dark default + light theme, mobile-first
js/core.js              # utils, event bus, store + migrations, encrypted file store, router, UI kit
js/i18n.js              # DOM translation engine (English source → 中文 / Bahasa Melayu)
js/i18n/*.js            # dictionaries: dynamic patterns, UI strings, directory data
js/config.js            # runtime configuration
js/data/                # categories, locations, licensing rules, providers + availability engine
js/booking.js           # booking lifecycle, reschedule, quotes
js/rt.js                # realtime transport, chat, masked numbers, calls
js/seo.js               # meta tags + JSON-LD
js/demo.js              # counterpart simulation (local demo mode only)
js/backend.js           # Supabase adapter: hydrate, push, booking RPCs, realtime
js/pages/*.js           # home, browse, provider, orders, quotes, account, verify, admin, pro
supabase/migrations/    # schema, catalog, booking functions, RLS, cron
tests/                  # in-browser test suite; tests/db/ for the database
tools/db_test.py        # runs the database tests on a throwaway Postgres
tools/gen_catalog_sql.js # regenerates the catalog migration from js/data
tools/serve.py          # no-cache dev server
tools/build_seo.py      # static landing pages + sitemap
```

## Towards production

- **Backend.** Done for accounts, provider listings, document details and bookings (see *Backend (Supabase)*). Still to move to the server: live presence, calls across devices and the Support conversation.
- **Realtime and calls.** Replace the BroadcastChannel transport with WebSockets, and use a CPaaS (Twilio, Vonage, 8x8) for number masking and PSTN calls.
- **Auth.** An SMS/email OTP provider, plus Singpass MyInfo (SG) and MyDigital ID (MY).
- **Payments and payouts.** A PayNow / DuitNow / FPX-capable PSP with escrow-style capture and weekly payouts. The database is ready for it: a webhook calls `confirm_payment`, and demo payments are switched off in `app_config`.
- **Documents.** Object storage with KMS-managed envelope encryption, a reviewer back office with SSO and role-based access, logged and time-limited document access, and retention rules under PDPA SG / MY.
- **Verification vendors.** Liveness and face match from a KYC provider, plus direct public-register lookups where APIs exist.
