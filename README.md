# Done Right

An English-first, mobile-friendly marketplace web app for home, lifestyle and professional services in **Singapore** and **Malaysia**. It's modelled on the 到位 (Daowei) app and adds:

- **Two-sided accounts.** Anyone can register as a customer, a service provider, or both.
- **Verification like a LinkedIn profile.** Identity (NRIC / FIN / MyKad / passport + selfie, or Singpass / MyDigital ID), education, licences & certifications, work experience, background checks and business registration (ACRA UEN / SSM). Each item has its own review status and verified badge.
- **A yellow-pages directory.** 303 service types in 24 groups: every category from the 到位 screenshots, plus tuition, languages, music (singing coach, piano…), sports (swimming instructor…), tech (software engineer, ML engineer, AI expert…), business, creative, events, renovation, pets, errands and more.
- **Provider availability.** Weekly hours, slot length, presets, and date overrides (days off / custom hours). Customers book real open slots, and a booked slot blocks its full service duration.

## Run it

No build step and no dependencies. Serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173 on a phone-sized window.

The app is fully client-side. All data (accounts, orders, follows, messages) is stored in `localStorage`, and uploaded documents go to `IndexedDB`. **Settings › Reset demo data** clears everything.

## Demo notes

| Flow | What happens in demo mode |
| --- | --- |
| Sign in | Mobile (+65 / +60) or email OTP. The code is shown on screen. |
| Payment | PayNow / card / GrabPay (SG) and DuitNow / FPX / Touch 'n Go / card (MY) are simulated. No card data is collected. |
| Verification review | Submitted items are auto-approved about 20 s later, or right away with **Approve now**. Singpass / MyDigital ID verification is simulated instantly. |
| Job completion | On an upcoming order, **Simulate job completed** moves it to *To confirm*. |
| Incoming bookings | Live providers can create a sample paid booking from the Provider centre. |
| Map | Leaflet with OpenStreetMap tiles. There's a styled offline fallback if the CDN is unavailable. |

The seed providers (~500) are generated deterministically, so every sub-category has providers in both countries.

## Features

- **Home.** Location picker, search, banners, guarantees, category grid, Express services, provider tabs (therapists, tutors, coaches, tech pros…).
- **Categories.** Sidebar layout, plus a full directory with by-category and A–Z views and a filter.
- **Service page.** Pros offering the service, with price, next free slot and distance; best-match booking; inclusions; FAQ.
- **Nearby.** Map and list views. Filters for distance, gender, who the provider serves, availability, age, rating, verification, languages, coupons and more.
- **Provider profile.** Photo gallery, attributes, credential strip, rating radar, 7-day availability, services, experience / education / certifications, reviews, follow, similar providers, report and hide.
- **Credentials page.** Watermarked documents, skills-assessment certificate, and the signed service commitment.
- **Booking.** Choose a service, on-site or online, an address (SG 6-digit / MY 5-digit postcodes), date, time slot and notes, then see the fee breakdown and pay.
- **Orders.** To pay → Upcoming → To confirm → To review → Completed, plus cancellations with a refund policy, issue reports and reviews.
- **Cart & following.** Providers, services and shops. Also chat with quick replies, customer support, and settings (language, appearance, notifications, blocked providers, addresses, PDPA pages).
- **Provider centre.** 5-step onboarding wizard, go-live checklist, services & pricing, availability calendar, jobs, earnings.

## Structure

```
index.html
css/app.css             # dark default + light theme, mobile-first
js/core.js              # utils, i18n, store, IndexedDB files, router, UI kit, avatar generator
js/data/categories.js   # 24 groups / 303 services
js/data/locations.js    # SG & MY areas, ID formats, payment methods, schools
js/data/providers.js    # seed providers, availability engine, fees, reviews, search, shared cards
js/pages/*.js           # home, browse, provider, orders, account, verify, pro
js/app.js               # boot
```

## Towards production

- **Backend.** API and database for users, providers, orders, availability, reviews and chat (with real-time updates).
- **Auth.** SMS/email OTP provider, plus Singpass MyInfo (SG) and MyDigital ID (MY).
- **Payments & payouts.** A PayNow / DuitNow / FPX-capable PSP with escrow-style capture and weekly payouts.
- **Documents.** Encrypted object storage for KYC files, a reviewer back office, and retention rules under PDPA SG / MY.
- **Messaging.** Push notifications; masked calling.
- **Maps.** A production tile provider or key-based maps service.
