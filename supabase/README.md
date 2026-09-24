# Done Right on Supabase

This folder holds the database for Done Right: the schema, the booking rules, row-level security and scheduled jobs. The app keeps running in local demo mode until you point it at a project.

## What the database enforces

- **Bookings go only through database functions.** Customers and providers cannot write orders directly. `create_booking`, `pay_order`, `accept_booking`, `request_reschedule` and the others re-check every rule on the server:
  - opening hours and the slot grid
  - blocked slots and days off
  - minimum notice and the booking window
  - buffers between jobs
  - licences and background checks
  - reschedule lock period and limit
  - the free-cancellation window
- **Price comes from the provider's listing.** The client never sends a price. The travel fee is computed on the server.
- **No double booking.** An exclusion constraint makes it impossible for the same provider to be booked twice, even with simultaneous requests.
- **Rules are frozen at booking time.** Each order keeps a snapshot of the provider's booking rules, so later changes never apply retroactively.
- **Only reviewers verify documents.** Users can submit and edit their documents, and any edit sends the document back to review. Only staff can approve or reject, through `review_item`, which writes an audit log entry. The same ID document can't be used on two accounts.
- **Document scans are private.** They're stored in the private `verification` bucket, in a folder per user. Only the owner and reviewers can open them, reviewers get links that expire after 5 minutes, and every viewing is written to the audit log. Uploads are limited to JPEG, PNG, WebP or PDF, up to 5 MB each.
- **Reviews are tied to real bookings.** Only the customer of a booking confirmed as complete can review it, once. Only that provider can reply, and staff can hide a review with a reason, which is logged. Everyone reads reviews through `public_reviews`, which shows the reviewer's name (or "Anonymous user") but never their account. Review photos are public, in the `review-photos` bucket, and each customer can upload only to their own folder.
- **Chat is members-only.** Each conversation can be read only by its two people. Messages are written only through `send_message`: you can message a live provider, anyone you have a booking with, or someone who messaged you first, up to 30 messages a minute. Providers can't cold-message people. Booking updates (confirmed, request, accepted, moved, cancelled…) are posted into the conversation by the database itself, so every device sees them. New messages arrive live through Realtime. Both people see read receipts (✓ sent, ✓✓ read): each member can see when the other last read the conversation, and nobody else can.
- **Quotes are server-checked.** The database invites up to 5 nearby providers who can legally offer the service (licence and background rules included), or one provider directly. Invited providers see the job, its area and the customer's first name, never the street address. Only invited providers can send an offer, and only into a free slot of their schedule. Accepting an offer books the provider at the quoted price with no travel fee, and declines the other offers. Requests expire after 7 days and offers when their validity ends. Job photos are private: only the customer and invited providers can see them.
- **Profile links are checked.** Anyone can add links to their profile (LinkedIn, TikTok, YouTube, Instagram, X, Facebook, Xiaohongshu, GitHub and a website), and they appear on their public provider profile. Each link must be https and on that platform's own domain (look-alike domains are refused). Chat-app and phone links (WhatsApp, Telegram, LINE and so on) are refused, so bookings and payments stay on Done Right.
- **Privacy.** Customers see a provider's public profile (name, age and verified credentials) but never their phone number, email, date of birth or identity documents. Everyone sees only their own orders. Other customers' bookings appear only as anonymous busy times.

## Set up a project

1. **Create a project** at [supabase.com](https://supabase.com). Choose the **Singapore (ap-southeast-1)** region, which keeps data close to both markets.
2. **Enable `pg_cron`** under *Database → Extensions*. The realtime/cron migration (`20260922000500_realtime_cron.sql`) uses it to expire unpaid orders every minute and lapse expired documents nightly.
3. **Apply the migrations**, in filename order. Either:
   - with the [Supabase CLI](https://supabase.com/docs/guides/cli):
     ```bash
     brew install supabase/tap/supabase
     ```
     ```bash
     supabase link --project-ref <your-project-ref>
     ```
     ```bash
     supabase db push
     ```
   - or paste each file in `supabase/migrations/` into the SQL editor, oldest first.
4. **Turn on sign-in:**
   - **URLs** (*Authentication → URL Configuration*): set the Site URL to your app's address (for development, `http://localhost:5173`) and add `http://localhost:5173/**` plus your live domain to *Redirect URLs*. Otherwise sign-in links go to Supabase's default address and fail.
   - **Email** is on by default. The default email contains a sign-in link, which the app accepts, but only in the browser window where it was requested; users can copy and paste it there. Supabase's built-in email only reaches members of your Supabase organisation, and only a few emails an hour. For anyone else, connect your own email service under *Authentication → SMTP Settings* (for example Resend). That also lets you edit the email templates: add `{{ .Token }}` to show a 6-digit code, which works in any window.
   - **Phone.** Connect an SMS provider (Twilio, MessageBird or Vonage) to send codes to +65 and +60 numbers.
5. **Connect the app.** In `js/config.js`, or in a `window.DR_CONFIG` defined before it loads, set:
   ```js
   supabase: { url: 'https://<project-ref>.supabase.co', anonKey: '<anon public key>' }
   ```
   The anon key is meant to be public; row-level security protects the data. **Never put the service-role key in the app.**
6. **Make yourself a reviewer.** Sign in once, then run this in the SQL editor:
   ```sql
   insert into public.staff (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
   The Trust & Safety console at `#/admin` then shows the review queue.

## Before real customers

- **Payments.** New projects have `demo_payments` on, so the Pay button confirms orders without charging anyone. For launch:
  1. Connect a payment provider (for example Stripe, HitPay or Xendit for PayNow / DuitNow / FPX).
  2. Add a webhook Edge Function that calls `confirm_payment(order_id, method, psp_reference)` with the service-role key once funds are captured.
  3. Then switch off demo payments:
     ```sql
     update public.app_config set value = 'false' where key = 'demo_payments';
     ```
- **Documents.** Scans are uploaded when a document is submitted, and a copy stays encrypted on the user's device. Supabase encrypts stored files at rest, but they aren't end-to-end encrypted: anyone with reviewer access can open them. Keep the staff list short. Scans added before this feature are uploaded automatically the next time the app saves on the device that holds them.
- **Account deletion.** Deletion requests currently go to support. Self-service deletion needs an Edge Function using the service-role key, one that anonymises order records rather than deleting them, since those must be retained.
- **Personal lists.** Follows, hidden providers and cart lines are private rows (`20260922000700_personal_lists.sql`) that users can only add or remove. Provider follower counts come from `follower_counts()`, which returns totals only, never who follows whom.
- **Not yet on the server:** the Support conversation, "online" and "typing" indicators (these work only between tabs on one device), and voice calls. Calls need their signalling moved onto Realtime, plus a TURN server or calling provider.

## Changing the catalog

Services, licence types, licence rules and areas are generated from the app's data files, so the database and the app always agree:

```bash
osascript -l JavaScript tools/gen_catalog_sql.js > supabase/migrations/20260922000200_catalog.sql
```

That command is macOS-only. On other systems, open `tools/catalog-sql.html` in a browser and download the file instead. The browser test suite fails if the committed file doesn't match the data.

The generated SQL is idempotent. Once a project is live, ship catalog changes as a **new** timestamped migration containing the regenerated output, because already-applied migrations are not re-run.

## Tests

```bash
python3 tools/db_test.py
```

This spins up a throwaway local Postgres (`brew install postgresql@16`), applies a small stand-in for Supabase's `auth` schema and roles, runs every migration, and then runs `tests/db/*.sql`: 220 checks covering access control, document storage, reviews, chat, quotes, licensing, booking rules, double-booking, reschedule locks, cancellation terms, expiry and completion. Add `--keep` to leave the database running so you can poke at it.
