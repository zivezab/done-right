-- Done Right: quote requests, offers and accepting. Builds on 10_booking_test.sql
-- (C, D customers; P offers swimming lessons in Orchard; Q offers piano, request-to-book).

\set C '''0000000c-0000-4000-8000-000000000000'''
\set D '''0000000d-0000-4000-8000-000000000000'''
\set P '''0000000a-0000-4000-8000-000000000000'''
\set Q '''0000000b-0000-4000-8000-000000000000'''
\set Q1 '''91000000-0000-4000-8000-000000000001'''
\set Q2 '''91000000-0000-4000-8000-000000000002'''
\set Q3 '''91000000-0000-4000-8000-000000000003'''

set dr.now = '2026-09-21 09:00:00+08';

-- ------------------------------------------------------------------ requesting quotes
select tests.login(null);
set role anon;
select tests.throws($$select public.create_quote(gen_random_uuid(), 'swimming-instructor', 'Lessons', 'Two kids aged 6 and 8, beginners, weekends please.')$$,
  'permission denied', 'visitors who are not signed in cannot request quotes');
reset role;

select tests.login(:C);
set role authenticated;
select tests.throws($$select public.create_quote(gen_random_uuid(), 'swimming-instructor', 'Lessons', 'Too short')$$, 'at least 20 characters', 'a request needs a proper description');
select tests.throws($$select public.create_quote(gen_random_uuid(), 'swimming-instructor', 'Lessons', 'Two kids aged 6 and 8, beginners, weekends please.', '{}', 'onsite', null)$$,
  'address', 'on-site jobs need an address');
select tests.throws($$select public.create_quote('91000000-0000-4000-8000-000000000009', 'swimming-instructor', 'Lessons', 'Two kids aged 6 and 8, beginners, weekends please.',
  '{0000000d-0000-4000-8000-000000000000/x/p.jpg}', 'online')$$, 'invalid photo', 'photos must be the customer''s own uploads for this request');
select tests.throws($$select public.create_quote(gen_random_uuid(), 'dog-walking', 'Walks', 'A friendly labrador, needs a walk every weekday evening.', '{}', 'online')$$,
  'no pros nearby', 'a request with nobody to invite is refused');
select tests.lives(format($$select public.create_quote(%L, 'swimming-instructor', 'Swimming for 2 kids', 'Two kids aged 6 and 8, beginners, weekends please.',
  '{0000000c-0000-4000-8000-000000000000/91000000-0000-4000-8000-000000000001/f_pool.jpg}', 'onsite', '{"line": "1 Orchard Rd #05-01", "area": "Orchard"}')$$, :Q1),
  'a customer requests quotes');
select tests.ok((select count(*) = 1 and bool_and(provider_id = :P) from public.quote_invites where quote_id = :Q1), 'providers who offer the service are invited');
select tests.lives(format($$select public.create_quote(%L, 'piano', 'Piano for adult beginner', 'Adult beginner, wants to play pop songs, weekday evenings.', '{}', 'online', null, 'Orchard', null, 'evening', 50, 90, %L)$$, :Q2, :Q),
  'a customer asks one provider directly');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from public.messages where system and text = '📝 New quote request: Swimming for 2 kids'), 'invited providers are told in chat');

-- ------------------------------------------------------------------ what providers see
select tests.login(:P);
set role authenticated;
select tests.ok((select area = 'Orchard' and customer_name is not null from public.provider_quote_inbox where id = :Q1), 'invited providers see the job and its area');
select tests.throws($$select address from public.provider_quote_inbox$$, 'does not exist', 'invited providers never see the street address');
select tests.ok((select count(*) = 0 from public.quote_requests), 'providers cannot read customers'' request records directly');
select tests.ok((select count(*) = 0 from public.provider_quote_inbox where id = :Q2), 'a direct request only reaches the chosen provider');
reset role;
select tests.login(null);
select tests.login(:D);
set role authenticated;
select tests.ok((select count(*) = 0 from public.quote_requests) and (select count(*) = 0 from public.provider_quote_inbox), 'other people cannot see a request');
select tests.throws(format('select public.send_quote_offer(%L, 100, %L, %L)', :Q1, '2026-10-02', '10:00'), 'not invited', 'only invited providers can quote');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ offers
select tests.login(:P);
set role authenticated;
select tests.throws(format('select public.send_quote_offer(%L, 0, %L, %L)', :Q1, '2026-10-02', '10:00'), 'enter a price', 'an offer needs a price');
select tests.throws(format('select public.send_quote_offer(%L, 150, %L, %L)', :Q1, '2026-10-02', '21:00'), 'free time', 'offers must use a free slot in the provider''s schedule');
select tests.lives(format('select public.send_quote_offer(%L, 140, %L, %L, 60, %L)', :Q1, '2026-10-02', '10:00', 'Includes floats and goggles'), 'an invited provider sends an offer');
select tests.lives(format('select public.send_quote_offer(%L, 150.4, %L, %L, 60, %L)', :Q1, '2026-10-02', '10:00', 'Two kids, 1 hr'), 'a provider can revise their offer');
select tests.ok((select count(*) = 1 and min(price) = 150 from public.quote_offers where quote_id = :Q1 and status = 'pending'), 'only the latest offer stays open (prices are whole amounts)');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from public.messages where system and text = '💬 Quote: S$150 for “Swimming for 2 kids” on 2026-10-02 10:00.'), 'the customer is told about the offer in chat');

select tests.login(:Q);
set role authenticated;
select tests.lives(format('select public.decline_quote_request(%L)', :Q2), 'a provider can decline a request');
select tests.throws(format('select public.send_quote_offer(%L, 80, %L, %L)', :Q2, '2026-10-02', '19:00'), 'not invited', 'no offers after declining');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ accepting
select tests.login(:D);
set role authenticated;
select tests.throws(format('select public.accept_quote_offer(%L)', (select id from public.quote_offers where quote_id = :Q1 and status = 'pending')), 'no longer available', 'only the customer can accept');
reset role;
select tests.login(null);
select tests.login(:C);
set role authenticated;
select tests.ok((select count(*) = 2 from public.quote_offers where quote_id = :Q1), 'the customer sees the offers on their request');
select tests.set('qo', (public.accept_quote_offer((select id from public.quote_offers where quote_id = :Q1 and status = 'pending'))).id::text);
select tests.ok((select status = 'to_pay' and price = 150 and fee = 0 and total = 150 and quote_id = :Q1 and local_time = '10:00' from public.orders where id = tests.get('qo')),
  'accepting books the provider at the quoted price, with no travel fee');
select tests.ok((select status = 'accepted' and order_id = tests.get('qo') from public.quote_requests where id = :Q1), 'the request is marked accepted');
select tests.ok((select status = 'upcoming' from public.pay_order(tests.get('qo'), 'paynow')), 'paying for an accepted quote confirms it straight away');
select tests.throws(format('select public.accept_quote_offer(%L)', (select id from public.quote_offers where quote_id = :Q1 and status = 'replaced')), 'no longer', 'an accepted request cannot be accepted again');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ closing and expiry
select tests.login(:C);
set role authenticated;
select public.create_quote(:Q3, 'swimming-instructor', 'Adult lessons', 'Adult who cannot swim yet, wants to learn freestyle.', '{}', 'online', null, 'Orchard');
reset role;
select tests.login(null);
select tests.login(:P);
set role authenticated;
select public.send_quote_offer(:Q3, 90, '2026-10-03', '10:00', 60, '', 1);
reset role;
select tests.login(null);
set dr.now = '2026-09-23 09:00:00+08';   -- the 1-day offer has lapsed
select tests.login(:C);
set role authenticated;
select tests.throws(format('select public.accept_quote_offer(%L)', (select id from public.quote_offers where quote_id = :Q3)), 'expired', 'expired offers cannot be accepted');
select tests.lives(format('select public.close_quote(%L)', :Q3), 'a customer can close a request');
reset role;
select tests.login(null);
select tests.ok((select status = 'closed' from public.quote_requests where id = :Q3), 'the request is closed');
set dr.now = '2026-10-01 09:00:00+08';
select tests.ok(public.expire_quotes() >= 1, 'open requests expire after 7 days');
select tests.ok((select status = 'expired' from public.quote_requests where id = :Q2), 'the declined direct request expired');

-- ------------------------------------------------------------------ job photos
select tests.ok((select not public from storage.buckets where id = 'quote-photos'), 'job photos are private');
select tests.login(:C);
set role authenticated;
select tests.lives($$insert into storage.objects (bucket_id, name) values ('quote-photos', '0000000c-0000-4000-8000-000000000000/91000000-0000-4000-8000-000000000001/f_pool.jpg')$$,
  'customers upload job photos to their own folder');
reset role;
select tests.login(null);
select tests.login(:P);
set role authenticated;
select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'quote-photos'), 'invited providers can see the job photos');
reset role;
select tests.login(null);
select tests.login(:D);
set role authenticated;
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'quote-photos'), 'other people cannot see job photos');
reset role;
select tests.login(null);
