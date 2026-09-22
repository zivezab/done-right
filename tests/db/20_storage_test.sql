-- Done Right: document storage access rules (bucket policies on storage.objects).
-- Uses the harness from 10_booking_test.sql (tests.ok / tests.throws / tests.login).

\set A '''000000a1-0000-4000-8000-000000000000'''
\set B '''000000b1-0000-4000-8000-000000000000'''
\set R '''000000e1-0000-4000-8000-000000000000'''

insert into auth.users (id, email) values (:A, 'owner@example.com'), (:B, 'other@example.com'), (:R, 'reviewer@example.com');
insert into public.staff values (:R, 'reviewer');
insert into public.verification_items (id, user_id, kind, data) values ('33333333-3333-4333-8333-333333333333', :A, 'identity', '{"docType": "NRIC"}');

select tests.ok((select not public and file_size_limit = 5242880 and 'application/pdf' = any (allowed_mime_types) from storage.buckets where id = 'verification'),
  'the verification bucket is private, size-limited and type-limited');

select tests.login(:A);
set role authenticated;
select tests.lives($$insert into storage.objects (bucket_id, name) values ('verification', '000000a1-0000-4000-8000-000000000000/33333333-3333-4333-8333-333333333333/f_front.jpg')$$,
  'owners can upload into their own folder');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('verification', '000000b1-0000-4000-8000-000000000000/x/f.jpg')$$,
  'row-level security', 'nobody can upload into someone else''s folder');
select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'verification'), 'owners see their own files');
reset role;
select tests.login(null);

select tests.login(:B);
set role authenticated;
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'verification'), 'other users cannot see someone''s documents');
delete from storage.objects where bucket_id = 'verification';
select tests.throws($$select public.log_document_view('33333333-3333-4333-8333-333333333333')$$, 'not allowed', 'only reviewers can log document views');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'verification'), 'other users cannot delete someone''s documents');

select tests.login(null);
set role anon;
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'verification'), 'visitors who are not signed in see no documents');
reset role;

select tests.login(:R);
set role authenticated;
select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'verification'), 'reviewers can open documents');
delete from storage.objects where bucket_id = 'verification';   -- matches nothing: reviewers have read-only access
select tests.lives($$select public.log_document_view('33333333-3333-4333-8333-333333333333')$$, 'reviewers log each document viewing');
reset role;
select tests.login(null);
select tests.ok((select count(*) = 1 from public.audit_log where action = 'viewed documents' and subject_user = :A), 'the viewing is in the audit log');
select tests.ok((select count(*) = 1 from storage.objects where bucket_id = 'verification'), 'reviewers cannot delete documents');

select tests.login(:A);
set role authenticated;
delete from storage.objects where bucket_id = 'verification';
reset role;
select tests.login(null);
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'verification'), 'owners can delete their own files');
