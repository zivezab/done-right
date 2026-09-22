-- Done Right: reviews, provider replies, moderation and review photos.
-- Builds on 10_booking_test.sql: order r1 (customer C, provider Q) is confirmed complete ("to_review").

\set C '''0000000c-0000-4000-8000-000000000000'''
\set D '''0000000d-0000-4000-8000-000000000000'''
\set Q '''0000000b-0000-4000-8000-000000000000'''
\set S '''00000005-0000-4000-8000-000000000000'''

select tests.ok((select status = 'to_review' from public.orders where id = tests.get('r1')), 'fixture: a booking waiting for its review');

-- ------------------------------------------------------------------ who can review
select tests.login(:D);
set role authenticated;
select tests.throws(format('select public.submit_review(%L, 5, %L)', tests.get('r1'), 'Great'), 'booking not found', 'only the customer of a booking can review it');
reset role;
select tests.login(null);

select tests.login(:C);
set role authenticated;
select tests.throws($$insert into public.reviews (order_id, provider_id, customer_id, service_id, service_name, stars, text)
  select id, provider_id, customer_id, service_id, service_name, 5, 'x' from public.orders limit 1$$, 'permission denied', 'reviews cannot be written directly');
select tests.throws(format('select public.submit_review(%L, 5, %L)', tests.get('o1'), 'Great'), 'once the job is confirmed complete', 'cancelled bookings cannot be reviewed');
select tests.throws(format('select public.submit_review(%L, 6, %L)', tests.get('r1'), 'Great'), '1 to 5 stars', 'stars must be 1 to 5');
select tests.throws(format('select public.submit_review(%L, 5, %L)', tests.get('r1'), '   '), 'a few words', 'a review needs some text');
select tests.throws(format('select public.submit_review(%L, 5, %L, %L, false, %L)', tests.get('r1'), 'Great', '{}', '{0000000d-0000-4000-8000-000000000000/x/p.jpg}'),
  'invalid photo', 'photos must come from the reviewer''s own folder for this booking');
select tests.lives(format('select public.submit_review(%L, 4, %L, %L, false, %L)', tests.get('r1'), 'Patient teacher, very clear.', '{Punctual,Skilled}',
  '{0000000c-0000-4000-8000-000000000000/' || tests.get('r1') || '/f_1.jpg}'), 'the customer reviews a completed booking');
select tests.throws(format('select public.submit_review(%L, 5, %L)', tests.get('r1'), 'Again'), 'already reviewed', 'one review per booking');
select tests.ok((select status = 'completed' from public.orders where id = tests.get('r1')), 'reviewing completes the booking');
select tests.ok((select count(*) = 0 from public.reviews), 'customers cannot read the private reviews table');
select tests.ok((select mine from public.public_reviews limit 1), 'customers can tell which public reviews are theirs');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ public view
select tests.login(null);
set role anon;
select tests.ok((select count(*) = 1 from public.public_reviews), 'anyone can read reviews');
select tests.ok((select stars = 4 and 'Skilled' = any (tags) and jsonb_array_length(photos) = 1 and not mine from public.public_reviews), 'reviews show stars, tags and photos');
select tests.throws($$select customer_id from public.public_reviews$$, 'does not exist', 'the reviewer''s account is never exposed');
select tests.ok((select reviews = 1 and average = 4 and positive_pct = 100 from public.provider_ratings where provider_id = '0000000b-0000-4000-8000-000000000000'),
  'provider ratings are aggregated on the server');
reset role;
select tests.login(null);
update public.reviews set anonymous = true;
select tests.ok((select reviewer_name = 'Anonymous user' from public.public_reviews), 'anonymous reviews hide the reviewer''s name');

-- ------------------------------------------------------------------ replies
select tests.login(:C);
set role authenticated;
select tests.throws(format('select public.reply_to_review(%L, %L)', (select id from public.public_reviews limit 1), 'Thanks'), 'review not found', 'customers cannot reply as the provider');
reset role;
select tests.login(null);
select tests.login(:Q);
set role authenticated;
select tests.lives(format('select public.reply_to_review(%L, %L)', (select id from public.public_reviews limit 1), 'Thank you, see you next week!'), 'the provider replies publicly');
select tests.ok((select reply like 'Thank you%' and reply_at is not null from public.public_reviews), 'the reply is shown with the review');
select tests.lives(format('select public.reply_to_review(%L, %L)', (select id from public.public_reviews limit 1), ''), 'the provider can remove their reply');
select tests.ok((select reply is null from public.public_reviews), 'a removed reply disappears');
select tests.throws(format('select public.moderate_review(%L, true, %L)', (select id from public.public_reviews limit 1), 'spam'), 'not allowed', 'providers cannot hide reviews');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ moderation
select tests.login(:S);
set role authenticated;
select tests.throws(format('select public.moderate_review(%L, true)', (select id from public.reviews limit 1)), 'reason is required', 'hiding a review needs a reason');
select tests.lives(format('select public.moderate_review(%L, true, %L)', (select id from public.reviews limit 1), 'Personal data in review'), 'staff can hide a review');
select tests.ok((select count(*) = 0 from public.public_reviews), 'hidden reviews are not shown');
select tests.ok((select count(*) = 1 from public.reviews), 'staff still see hidden reviews');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from public.audit_log where action = 'review hidden'), 'moderation is in the audit log');
select tests.ok((select count(*) = 0 from public.provider_ratings where provider_id = :Q), 'hidden reviews do not count towards ratings');

-- ------------------------------------------------------------------ review photos bucket
select tests.ok((select public and not ('application/pdf' = any (allowed_mime_types)) from storage.buckets where id = 'review-photos'), 'review photos are public images only');
select tests.login(:C);
set role authenticated;
select tests.lives($$insert into storage.objects (bucket_id, name) values ('review-photos', '0000000c-0000-4000-8000-000000000000/o/f_1.jpg')$$, 'customers upload review photos to their own folder');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('review-photos', '0000000d-0000-4000-8000-000000000000/o/f_1.jpg')$$, 'row-level security', 'nobody uploads into someone else''s folder');
reset role;
select tests.login(null);
