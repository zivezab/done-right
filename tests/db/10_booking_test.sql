-- Done Right: database tests. Run with `python3 tools/db_test.py` (throwaway local Postgres).
-- Every check prints "ok - …" or "not ok - …"; the runner counts them.

\set C '''0000000c-0000-4000-8000-000000000000'''
\set D '''0000000d-0000-4000-8000-000000000000'''
\set P '''0000000a-0000-4000-8000-000000000000'''
\set Q '''0000000b-0000-4000-8000-000000000000'''
\set S '''00000005-0000-4000-8000-000000000000'''

-- ------------------------------------------------------------------ harness
create schema tests;
grant usage on schema tests to anon, authenticated;
create table tests.vars (k text primary key, v text);
grant all on tests.vars to anon, authenticated;

create function tests.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'ok - %', name; else raise notice 'not ok - %', name; end if;
end $$;

-- Runs q; passes when it raises an error whose message matches pattern (case-insensitive).
create function tests.throws(q text, pattern text, name text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'not ok - % (no error)', name;
exception when others then
  if sqlerrm ~* pattern then raise notice 'ok - %', name;
  else raise notice 'not ok - % (got: %)', name, sqlerrm; end if;
end $$;

create function tests.lives(q text, name text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'ok - %', name;
exception when others then
  raise notice 'not ok - % (got: %)', name, sqlerrm;
end $$;

create function tests.set(k text, v text) returns void language sql as $$
  insert into tests.vars values (k, v) on conflict (k) do update set v = excluded.v
$$;
create function tests.get(k text) returns uuid language sql as $$ select v::uuid from tests.vars where vars.k = get.k $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Act as a signed-in user (or anon when uid is null) for the following statements.
create function tests.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, false);
end $$;
grant execute on function tests.login(text) to anon, authenticated;

set dr.now = '2026-09-21 09:00:00+08';   -- Monday, 9 am in Singapore

-- ------------------------------------------------------------------ fixtures
insert into auth.users (id, email, raw_user_meta_data) values
  (:C, 'c@example.com', '{"country": "SG"}'), (:D, 'd@example.com', '{}'),
  (:P, 'p@example.com', '{"country": "SG"}'), (:Q, 'q@example.com', '{"country": "SG"}'), (:S, 's@example.com', '{}');
insert into public.staff values (:S, 'reviewer');

select tests.ok((select count(*) = 5 from public.profiles), 'a profile is created for every new auth user');
select tests.ok((select count(*) = 303 from public.service_types) and (select count(*) = 41 from public.licence_types), 'catalog is seeded (303 services, 41 licences)');

-- provider P: instant booking, open every day 08:00–20:00
select tests.login(:P);
set role authenticated;
update public.profiles set name = 'Pat Tan', dob = '1990-05-01' where id = auth.uid();
select tests.throws($$insert into public.providers (user_id, area, lat, lng, status) values (auth.uid(), 'Orchard', 1.3048, 103.8318, 'live')$$,
  'identity verification is required', 'cannot go live without a verified identity');
insert into public.providers (user_id, area, lat, lng, availability, policy) values (auth.uid(), 'Orchard', 1.3048, 103.8318,
  '{"slotMinutes": 60, "weekly": {"0": [["08:00","20:00"]], "1": [["08:00","20:00"]], "2": [["08:00","20:00"]], "3": [["08:00","20:00"]], "4": [["08:00","20:00"]], "5": [["08:00","20:00"]], "6": [["08:00","20:00"]]}, "overrides": {}, "blocks": {}}',
  '{"mode": "instant", "rescheduleLockHours": 24, "maxReschedules": 2, "freeCancelHours": 24, "leadMinutes": 60, "advanceDays": 30, "bufferMinutes": 0}');
insert into public.provider_services (provider_id, service_id, name, price, unit, duration_min) values
  (auth.uid(), 'swimming-instructor', 'Swimming lessons', 80, 'lesson', 60),
  (auth.uid(), 'electrical-repair', 'Electrical repair', 70, 'visit', 60);
insert into public.verification_items (user_id, kind, data, status) values (auth.uid(), 'identity', '{"docType": "NRIC", "idHash": "hash-p"}', 'verified');
select tests.ok((select status = 'pending' from public.verification_items where kind = 'identity'), 'a user cannot self-verify (status forced to pending)');
select tests.throws($$update public.verification_items set status = 'verified'$$, 'permission denied', 'a user cannot change a review status');
select tests.throws($$select public.review_item((select id from public.verification_items limit 1), 'verified')$$, 'not allowed', 'only staff can review');
reset role;
select tests.login(null);

select tests.login(:S);
set role authenticated;
select public.review_item(id, 'verified') from public.verification_items where kind = 'identity';
reset role;
select tests.login(null);

select tests.login(:P);
set role authenticated;
select tests.lives($$update public.providers set status = 'live' where user_id = auth.uid()$$, 'goes live once identity is verified');
select tests.throws($$update public.providers set policy = '{"mode": "whenever"}' where user_id = auth.uid()$$, 'invalid booking rules', 'rejects invalid booking rules');
select tests.throws($$update public.providers set availability = availability || '{"slotMinutes": 7}' where user_id = auth.uid()$$, 'invalid slot length', 'rejects invalid slot lengths');
reset role;
select tests.login(null);

-- provider Q: request-to-book, verified by a reviewer
insert into public.verification_items (user_id, kind, data, status) values (:Q, 'identity', '{"idHash": "hash-q"}', 'verified');
insert into public.providers (user_id, area, lat, lng, status, availability, policy)
select :Q, 'Tampines', 1.3496, 103.9568, 'live', availability, '{"mode": "request", "approvalHours": 12}' from public.providers where user_id = :P;
insert into public.provider_services (provider_id, service_id, name, price, unit, duration_min) values (:Q, 'piano', 'Piano', 60, 'lesson', 60);

-- ------------------------------------------------------------------ access control
select tests.login(:C);
set role authenticated;
select tests.ok((select count(*) = 0 from public.profiles where id = :P), 'customers cannot read another user''s private profile');
select tests.ok((select name = 'Pat Tan' and age is not null from public.public_profiles where id = :P), 'live providers have a public profile (name, age; no DOB)');
select tests.ok((select count(*) = 0 from public.verification_items where user_id = :P), 'customers cannot read anyone''s verification documents');
select tests.throws($$insert into public.orders (customer_id, provider_id, service_id, service_name, unit, country, starts_at, local_date, local_time, duration_min, busy, mode, price, fee, total, policy)
  values (auth.uid(), '0000000a-0000-4000-8000-000000000000', 'piano', 'x', 'x', 'SG', now(), now()::date, '10:00', 60, tstzrange(now(), now() + interval '1 hour'), 'online', 0, 0, 0, '{}')$$,
  'permission denied', 'orders cannot be inserted directly');
select tests.throws($$select public.confirm_payment(gen_random_uuid(), 'card', 'x')$$, 'permission denied', 'only the payment webhook can confirm payments');
select tests.throws($$insert into public.verification_items (user_id, kind, data) values (auth.uid(), 'identity', '{"idHash": "hash-p"}')$$,
  'duplicate key|unique', 'the same ID cannot be used on a second account');
reset role;
select tests.login(null);

select tests.login(null);
set role anon;
select tests.ok((select count(*) = 303 from public.service_types), 'anonymous visitors can browse the catalog');
select tests.ok((select count(*) = 2 from public.providers), 'anonymous visitors can see live providers');
select tests.throws($$select * from public.orders$$, 'permission denied', 'anonymous visitors cannot read orders');
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-22', '10:00')$$,
  'permission denied', 'anonymous visitors cannot book');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ licensing
select tests.ok((select count(*) = 1 from public.bookable_services where provider_id = :P), 'unlicensed regulated services are not bookable');
select tests.login(:C);
set role authenticated;
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'electrical-repair', '2026-09-22', '10:00', 'onsite', '{"line": "1 Test Rd", "area": "Orchard"}')$$,
  'until the provider is licensed', 'booking an unlicensed regulated service fails');
reset role;
select tests.login(null);
select tests.login(:P);
set role authenticated;
insert into public.verification_items (user_id, kind, data) values (auth.uid(), 'certifications', '{"licenceId": "sg-lew", "name": "LEW", "expiry": "2027-12"}');
select tests.ok((select licence_id = 'sg-lew' and expires_on = '2027-12-31' from public.verification_items where kind = 'certifications'), 'licence type and expiry are derived from the document');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from public.bookable_services where provider_id = :P), 'a pending licence does not unlock the service');
update public.verification_items set status = 'verified' where kind = 'certifications';
select tests.ok((select count(*) = 2 from public.bookable_services where provider_id = :P), 'a verified licence unlocks the service');
select tests.login(:P);
set role authenticated;
update public.verification_items set data = data || '{"name": "LEW (renewed)"}' where kind = 'certifications';
reset role;
select tests.login(null);
select tests.ok((select status = 'pending' from public.verification_items where kind = 'certifications'), 'editing a verified document sends it back to review');
update public.verification_items set status = 'verified' where kind = 'certifications';

-- ------------------------------------------------------------------ booking rules
select tests.login(:C);
set role authenticated;
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-21', '09:30', 'online')$$, 'no longer available', 'respects the minimum notice');
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-22', '21:00', 'online')$$, 'no longer available', 'rejects times outside working hours');
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-22', '10:30', 'online')$$, 'no longer available', 'rejects times off the slot grid');
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-11-30', '10:00', 'online')$$, 'no longer available', 'respects the booking window');
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-22', '10:00', 'onsite', null)$$, 'address', 'on-site bookings need an address');
select tests.set('o1', (public.create_booking(:P, 'swimming-instructor', '2026-09-22', '10:00', 'onsite', '{"line": "1 Orchard Rd", "area": "Orchard"}', 'Beginner')).id::text);
select tests.ok((select status = 'to_pay' and price = 80 and fee = 0 and total = 80 and local_time = '10:00' from public.orders where id = tests.get('o1')),
  'price comes from the provider''s listing, not the client');
select tests.ok((select starts_at = '2026-09-22 02:00:00+00' from public.orders where id = tests.get('o1')), 'local time is stored in Singapore time');
select tests.set('far', (public.create_booking(:P, 'swimming-instructor', '2026-09-23', '09:00', 'onsite', '{"line": "Jurong", "area": "Jurong East"}')).id::text);
select tests.ok((select fee > 0 and fee <= 25 from public.orders where id = tests.get('far')), 'travel fee is charged beyond 3 km (capped)');
reset role;
select tests.login(null);

select tests.login(:D);
set role authenticated;
select tests.throws($$select public.create_booking('0000000a-0000-4000-8000-000000000000', 'swimming-instructor', '2026-09-22', '10:00', 'online')$$, 'no longer available', 'a taken slot cannot be booked again');
select tests.ok((select count(*) = 0 from public.orders), 'customers only see their own orders');
select tests.ok((select count(*) = 2 from public.provider_busy(:P, '2026-09-21', '2026-09-30')), 'busy times are visible without customer details');
reset role;
select tests.login(null);

-- the database itself refuses overlapping jobs, even if a check were bypassed
select tests.throws($$update public.orders set busy = tstzrange('2026-09-22 02:30:00+00', '2026-09-22 03:30:00+00'), local_date = '2026-09-22' where id = (select id from tests.vars v join public.orders o on o.id = v.v::uuid where v.k = 'far')$$,
  'conflicting key|exclusion|orders_no_overlap', 'an exclusion constraint prevents double booking');

-- buffer between bookings uses the provider's current setting on both sides
update public.providers set policy = policy || '{"bufferMinutes": 30}' where user_id = :P;
select tests.ok(dr.slot_problem(:P, '2026-09-22', '11:00', 60) = 'booked', 'buffer blocks the slot right after a booking');
select tests.ok(dr.slot_problem(:P, '2026-09-22', '12:00', 60) is null, 'the slot after the buffer is free');
update public.providers set policy = policy || '{"bufferMinutes": 0}' where user_id = :P;

-- provider blocks a slot
update public.providers set availability = jsonb_set(availability, '{blocks}', '{"2026-09-22": ["14:00"]}') where user_id = :P;
select tests.ok(dr.slot_problem(:P, '2026-09-22', '14:00', 60) = 'blocked', 'blocked slots cannot be booked');
update public.providers set availability = jsonb_set(availability, '{overrides}', '{"2026-09-24": {"off": true}}') where user_id = :P;
select tests.ok(dr.slot_problem(:P, '2026-09-24', '10:00', 60) = 'not_open', 'days off cannot be booked');

-- ------------------------------------------------------------------ payment, instant vs request-to-book
select tests.login(:C);
set role authenticated;
select tests.ok((select status = 'upcoming' from public.pay_order(tests.get('o1'), 'paynow')), 'instant bookings confirm on payment');
select tests.set('r1', (public.create_booking(:Q, 'piano', '2026-09-22', '14:00', 'online')).id::text);
select tests.ok((select status = 'requested' and request_expires_at = '2026-09-21 21:00:00+08' from public.pay_order(tests.get('r1'), 'card')),
  'request-to-book holds payment until the provider responds (12 h window)');
select tests.throws(format('select public.accept_booking(%L)', tests.get('r1')), 'nothing to accept', 'customers cannot accept their own request');
reset role;
select tests.login(null);
select tests.login(:Q);
set role authenticated;
select tests.ok((select status = 'upcoming' from public.accept_booking(tests.get('r1'))), 'providers accept requests');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ rescheduling
select tests.login(:C);
set role authenticated;
select tests.ok((select local_date = '2026-09-23' and local_time = '10:00' and reschedules = 1 from public.request_reschedule(tests.get('o1'), '2026-09-23', '10:00')),
  'customers move instant bookings themselves');
select tests.ok((select reschedules = 2 from public.request_reschedule(tests.get('o1'), '2026-09-25', '10:00')), 'a second move is allowed');
select tests.throws(format('select public.request_reschedule(%L, %L, %L)', tests.get('o1'), '2026-09-26', '10:00'), 'limit reached', 'the reschedule limit is enforced');
select tests.ok((select reschedule_request is not null and local_date = '2026-09-22' from public.request_reschedule(tests.get('r1'), '2026-09-23', '14:00')),
  'request-to-book providers must approve a move');
reset role;
select tests.login(null);
select tests.login(:Q);
set role authenticated;
select tests.ok((select local_date = '2026-09-23' and reschedule_request is null from public.respond_reschedule(tests.get('r1'), true)), 'provider approves the move');
select tests.ok((select proposal is not null from public.propose_time(tests.get('r1'), '2026-09-23', '16:00', 'Running late')), 'providers can propose a new time');
reset role;
select tests.login(null);
select tests.login(:C);
set role authenticated;
select tests.ok((select local_time = '16:00' and reschedules = 1 from public.respond_proposal(tests.get('r1'), true)),
  'accepting a proposal moves the booking without using a customer reschedule');
set dr.now = '2026-09-22 17:00:00+08';   -- 23 h before the 16:00 lesson on the 23rd
select tests.throws(format('select public.request_reschedule(%L, %L, %L)', tests.get('r1'), '2026-09-24', '14:00'), 'locked — changes close 1 day before', 'moves close at the provider''s lock period');
set dr.now = '2026-09-21 09:00:00+08';
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ cancellation uses the rules in force at booking time
update public.providers set policy = policy || '{"freeCancelHours": 1}' where user_id = :P;
set dr.now = '2026-09-25 04:00:00+08';   -- 6 h before o1 (now on the 25th at 10:00)
select tests.login(:C);
set role authenticated;
select tests.ok((select (public.cancel_terms(tests.get('o1')) ->> 'free')::boolean = false), 'later rule changes do not apply to existing bookings');
select tests.ok((select status = 'cancelled' and refund = 40 from public.cancel_booking(tests.get('o1'))), 'late customer cancellations refund 50%');
reset role;
select tests.login(null);
set dr.now = '2026-09-21 09:00:00+08';
select tests.login(:P);
set role authenticated;
select tests.throws(format('select public.decline_booking(%L)', tests.get('far')), 'cannot decline', 'unpaid orders cannot be declined (nothing to decide yet)');
select tests.ok((select refund = 0 and cancelled_by = 'provider' from public.cancel_booking(tests.get('far'))), 'providers can cancel unpaid orders; nothing is refunded');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ expiry
select tests.login(:C);
set role authenticated;
select tests.set('unpaid', (public.create_booking(:P, 'swimming-instructor', '2026-09-26', '10:00', 'online')).id::text);
select tests.set('r2', (public.create_booking(:Q, 'piano', '2026-09-27', '10:00', 'online')).id::text);
select public.pay_order(tests.get('r2'), 'card');
set dr.now = '2026-09-21 09:20:00+08';
select tests.throws(format('select public.pay_order(%L, %L)', tests.get('unpaid'), 'card'), 'payment window expired', 'payment closes after 15 minutes');
select tests.ok(public.expire_orders() = 1, 'unpaid orders expire after 15 minutes');
set dr.now = '2026-09-21 21:01:00+08';
select tests.ok(public.expire_orders() = 1, 'unanswered requests expire');
select tests.ok((select status = 'cancelled' and refund = total from public.orders where id = tests.get('r2')), 'expired requests are fully refunded');
select tests.throws($$select dr.slot_problem('0000000a-0000-4000-8000-000000000000', '2026-09-26', '10:00', 60)$$, 'permission denied', 'internal helpers are not callable by users');
reset role;
select tests.login(null);
select tests.ok(dr.slot_problem(:P, '2026-09-26', '10:00', 60) is null, 'expired orders free their slot');

-- ------------------------------------------------------------------ completion
set dr.now = '2026-09-23 12:00:00+08';
select tests.login(:Q);
set role authenticated;
select tests.throws(format('select public.mark_done(%L)', tests.get('r1')), 'not started', 'jobs cannot be completed before they start');
set dr.now = '2026-09-23 17:30:00+08';
select tests.ok((select status = 'to_confirm' from public.mark_done(tests.get('r1'))), 'provider marks the job done');
reset role;
select tests.login(null);
select tests.login(:C);
set role authenticated;
select tests.ok((select status = 'to_review' from public.confirm_done(tests.get('r1'))), 'customer confirms completion');
select tests.ok((select count(*) >= 6 from public.order_events where order_id = tests.get('r1')), 'every step is recorded in the order history');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ documents
set dr.now = '2028-01-02 09:00:00+08';
select tests.ok(public.expire_documents() >= 1, 'expired licences lapse');
select tests.ok((select count(*) = 1 from public.bookable_services where provider_id = :P), 'a lapsed licence unlists the regulated service');

-- ------------------------------------------------------------------ the exact writes the app sends through PostgREST
set dr.now = '2026-09-21 09:00:00+08';
insert into auth.users (id, email) values ('0000000e-0000-4000-8000-000000000000', 'e@example.com');
select tests.login('0000000e-0000-4000-8000-000000000000');
set role authenticated;
select tests.lives($$update public.profiles set name = 'Eve', gender = 'F', dob = '1995-01-01', country = 'SG', roles = '{"provider": true}', addresses = '[]', consents = '{}' where id = auth.uid()$$,
  'app: profile update');
select tests.lives($$insert into public.providers (user_id, status, paused, area, lat, lng, headline, bio, years, languages, skills, serves, travel_fee, availability, policy)
  values (auth.uid(), 'draft', false, 'Bishan', 1.35, 103.85, 'Tutor', '', 3, '{English}', '{}', 'all', 0, '{"slotMinutes": 60, "weekly": {}, "overrides": {}, "blocks": {}}', '{}')
  on conflict (user_id) do update set status = excluded.status, headline = excluded.headline, availability = excluded.availability, policy = excluded.policy$$, 'app: provider listing upsert (first save)');
select tests.lives($$insert into public.providers (user_id, status, paused, area, lat, lng, headline, bio, years, languages, skills, serves, travel_fee, availability, policy)
  values (auth.uid(), 'draft', false, 'Bishan', 1.35, 103.85, 'Maths tutor', '', 3, '{English}', '{}', 'all', 0, '{"slotMinutes": 60, "weekly": {}, "overrides": {}, "blocks": {}}', '{}')
  on conflict (user_id) do update set user_id = excluded.user_id, status = excluded.status, headline = excluded.headline$$, 'app: provider listing upsert (later saves)');
select tests.lives($$insert into public.provider_services (provider_id, service_id, name, price, unit, duration_min, active, description)
  values (auth.uid(), 'piano', 'Maths', 60, 'lesson', 60, true, '')
  on conflict (provider_id, service_id) do update set provider_id = excluded.provider_id, service_id = excluded.service_id, name = excluded.name, price = excluded.price$$,
  'app: services upsert');
select tests.lives($$delete from public.provider_services where provider_id = auth.uid() and service_id not in ('piano')$$, 'app: removing dropped services');
select tests.lives($$insert into public.verification_items (id, user_id, kind, data) values ('22222222-2222-4222-8222-222222222222', auth.uid(), 'identity', '{"docType": "NRIC", "idHash": "hash-e"}')$$,
  'app: submitting a new document');
select tests.lives($$update public.verification_items set data = '{"docType": "NRIC", "idHash": "hash-e", "fullName": "Eve"}' where id = '22222222-2222-4222-8222-222222222222'$$,
  'app: editing a document');
select tests.throws($$insert into public.verification_items (id, user_id, kind, data) values ('22222222-2222-4222-8222-222222222222', auth.uid(), 'identity', '{}')
  on conflict (id) do update set id = excluded.id, user_id = excluded.user_id, kind = excluded.kind, data = excluded.data$$,
  'permission denied', 'documents cannot be upserted (id, owner and kind stay fixed)');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 and bool_and(status = 'pending') from public.verification_items where user_id = '0000000e-0000-4000-8000-000000000000'),
  'a submitted identity waits for review');

-- reviewers cannot approve their own documents
insert into public.staff values ('0000000e-0000-4000-8000-000000000000', 'admin');
select tests.login('0000000e-0000-4000-8000-000000000000');
set role authenticated;
select tests.throws($$select public.review_item('22222222-2222-4222-8222-222222222222', 'verified')$$, 'your own', 'staff cannot approve their own documents');
reset role;
select tests.login(null);
