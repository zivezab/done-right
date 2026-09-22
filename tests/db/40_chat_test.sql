-- Done Right: chat. Builds on 10_booking_test.sql (C, D customers; P instant and Q request-to-book providers).

\set C '''0000000c-0000-4000-8000-000000000000'''
\set D '''0000000d-0000-4000-8000-000000000000'''
\set P '''0000000a-0000-4000-8000-000000000000'''
\set Q '''0000000b-0000-4000-8000-000000000000'''
\set N '''0000000f-0000-4000-8000-000000000000'''

set dr.now = '2026-09-21 09:00:00+08';
insert into auth.users (id, email) values (:N, 'newcomer@example.com');

-- ------------------------------------------------------------------ who can message whom
select tests.login(:N);
set role authenticated;
select tests.lives($$select public.send_message('0000000a-0000-4000-8000-000000000000', 'Hi, are you free on Saturday?')$$, 'anyone can ask a live provider a question');
select tests.throws($$select public.send_message('0000000d-0000-4000-8000-000000000000', 'hello')$$, 'providers, or people you have a booking with', 'customers cannot message strangers');
select tests.throws($$select public.send_message('0000000a-0000-4000-8000-000000000000', '   ')$$, 'write a message', 'empty messages are refused');
select tests.throws(format('select public.send_message(%L, %L)', '0000000a-0000-4000-8000-000000000000', repeat('x', 2001)), 'up to 2,000', 'very long messages are refused');
select tests.throws($$insert into public.messages (thread_id, sender, text) select id, auth.uid(), 'fake' from public.chat_threads limit 1$$, 'permission denied', 'messages cannot be written directly');
select tests.throws($$select public.send_message('0000000f-0000-4000-8000-000000000000', 'me')$$, 'choose who', 'you cannot message yourself');
reset role;
select tests.login(null);

select tests.login(:P);
set role authenticated;
select tests.lives($$select public.send_message('0000000f-0000-4000-8000-000000000000', 'Yes, 10 am works!')$$, 'a provider can reply to someone who messaged them');
select tests.throws($$select public.send_message('0000000d-0000-4000-8000-000000000000', 'Special offer!')$$, 'providers, or people you have a booking with', 'providers cannot cold-message people');
select tests.ok((select count(*) = 1 from public.chat_unread() u join public.chat_threads t on t.id = u.thread_id
  where '0000000f-0000-4000-8000-000000000000' in (t.member_a, t.member_b) and u.unread = 1), 'the provider has one unread message');
select tests.ok((select name = '' or name is not null from public.public_profiles where id = '0000000f-0000-4000-8000-000000000000'),
  'a provider can see the public profile of someone who messaged them');
select public.mark_read(t.id) from public.chat_threads t where '0000000f-0000-4000-8000-000000000000' in (t.member_a, t.member_b);
select tests.ok((select count(*) = 0 from public.chat_unread() u join public.chat_threads t on t.id = u.thread_id
  where '0000000f-0000-4000-8000-000000000000' in (t.member_a, t.member_b)), 'reading the conversation clears the unread count');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ privacy
select tests.login(:D);
set role authenticated;
select tests.ok((select count(*) = 0 from public.messages m join public.chat_threads t on t.id = m.thread_id
  where '0000000f-0000-4000-8000-000000000000' in (t.member_a, t.member_b)), 'other people cannot read a conversation');
select tests.ok((select count(*) = 0 from public.public_profiles where id = '0000000f-0000-4000-8000-000000000000'),
  'strangers still cannot see that person''s profile');
select tests.throws(format('select public.mark_read(%L)', (select id from public.chat_threads where member_a = least(:P::uuid, :N::uuid) and member_b = greatest(:P::uuid, :N::uuid))),
  'conversation not found', 'other people cannot touch a conversation');
reset role;
select tests.login(null);
select tests.login(null);
set role anon;
select tests.throws($$select * from public.messages$$, 'permission denied', 'visitors who are not signed in cannot read messages');
reset role;

-- ------------------------------------------------------------------ flood limit
select tests.login(:N);
set role authenticated;
select count(public.send_message('0000000a-0000-4000-8000-000000000000', 'msg ' || g)) from generate_series(1, 29) g;
select tests.throws($$select public.send_message('0000000a-0000-4000-8000-000000000000', 'one too many')$$, 'too quickly', 'at most 30 messages a minute');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ booking updates appear in the conversation
select tests.login(:N);
set role authenticated;
select tests.set('n1', (public.create_booking(:P, 'swimming-instructor', '2026-09-28', '11:00', 'online')).id::text);
select public.pay_order(tests.get('n1'), 'paynow');
select tests.set('n2', (public.create_booking(:Q, 'piano', '2026-09-29', '11:00', 'online')).id::text);
select public.pay_order(tests.get('n2'), 'card');
select tests.ok((select system and sender = :P from public.messages where text = '✅ Booking confirmed: Swimming lessons on 2026-09-28 at 11:00.'),
  'an instant booking posts a confirmation from the provider');
select tests.ok((select system and sender = :N from public.messages where text = '📅 New booking request: Piano on 2026-09-29 at 11:00. Please accept or decline.'),
  'a booking request is posted from the customer');
select public.request_reschedule(tests.get('n1'), '2026-09-30', '11:00');
select tests.ok((select count(*) = 1 from public.messages where text = '🔁 Booking moved to 2026-09-30 at 11:00.'), 'a move is posted to the conversation');
select public.cancel_booking(tests.get('n1'));
select tests.ok((select count(*) = 1 from public.messages where text = 'Booking for 2026-09-30 11:00 was cancelled.' and sender = :N), 'a cancellation is posted by whoever cancelled');
reset role;
select tests.login(null);
select tests.login(:Q);
set role authenticated;
select public.accept_booking(tests.get('n2'));
select tests.ok((select count(*) = 1 from public.messages where text like '✅ % accepted your booking for 2026-09-29 at 11:00.'), 'accepting a request is posted to the customer');
select tests.ok((select count(*) = 0 from public.messages m join public.chat_threads t on t.id = m.thread_id
  where '0000000a-0000-4000-8000-000000000000' in (t.member_a, t.member_b) and '0000000f-0000-4000-8000-000000000000' in (t.member_a, t.member_b)),
  'a provider cannot see another provider''s conversations');
reset role;
select tests.login(null);

-- ------------------------------------------------------------------ read receipts
select tests.login(:N);
set role authenticated;
select public.mark_read(t.id) from public.chat_threads t where t.member_a = least(:P::uuid, :N::uuid) and t.member_b = greatest(:P::uuid, :N::uuid);
reset role;
select tests.login(null);
select tests.login(:P);
set role authenticated;
select tests.ok((select count(*) = 1 from public.chat_reads r join public.chat_threads t on t.id = r.thread_id
  where r.user_id = :N and t.member_a = least(:P::uuid, :N::uuid) and t.member_b = greatest(:P::uuid, :N::uuid)),
  'the other person can see when you last read the conversation');
reset role;
select tests.login(null);
select tests.login(:D);
set role authenticated;
select tests.ok((select count(*) = 0 from public.chat_reads where user_id in (:P, :N)), 'nobody else can see read receipts');
reset role;
select tests.login(null);
