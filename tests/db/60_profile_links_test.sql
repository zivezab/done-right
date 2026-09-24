-- Done Right: public profile links on a person's profile. Builds on 10_booking_test.sql (provider P).

\set P '''0000000a-0000-4000-8000-000000000000'''
\set D '''0000000d-0000-4000-8000-000000000000'''

select tests.login(:P);
set role authenticated;
select tests.lives($$update public.profiles set links = '{"linkedin": "https://www.linkedin.com/in/pat-tan", "tiktok": "https://www.tiktok.com/@pattan",
  "youtube": "https://youtu.be/abc123", "x": "https://x.com/pattan", "instagram": "https://www.instagram.com/pattan", "xiaohongshu": "https://www.xiaohongshu.com/user/profile/5f00",
  "github": "https://github.com/pattan", "website": "https://pattan.sg"}' where id = auth.uid()$$, 'people can add links to their public profile');
select tests.throws($$update public.profiles set links = '{"whatsapp": "https://wa.me/6591234567"}' where id = auth.uid()$$, 'unknown link type', 'only known link types are accepted');
select tests.throws($$update public.profiles set links = '{"website": "https://wa.me/6591234567"}' where id = auth.uid()$$, 'chat apps', 'chat-app links are refused even as a website');
select tests.throws($$update public.profiles set links = '{"website": "https://t.me/pattan"}' where id = auth.uid()$$, 'chat apps', 'Telegram links are refused');
select tests.throws($$update public.profiles set links = '{"linkedin": "https://evil.example/in/pat"}' where id = auth.uid()$$, 'right site', 'a platform link must be on that platform');
select tests.throws($$update public.profiles set links = '{"linkedin": "https://linkedin.com.evil.example/in/pat"}' where id = auth.uid()$$, 'right site', 'look-alike domains are refused');
select tests.throws($$update public.profiles set links = '{"website": "javascript:alert(1)"}' where id = auth.uid()$$, 'https://', 'only https links are accepted');
select tests.throws($$update public.profiles set links = '{"website": "http://pattan.sg"}' where id = auth.uid()$$, 'https://', 'plain http links are refused');
select tests.throws($$update public.profiles set links = '{"website": "https://user:pw@pattan.sg"}' where id = auth.uid()$$, 'https://', 'links with credentials are refused');
reset role;
select tests.login(null);

select tests.login(:D);
set role authenticated;
select tests.ok((select links ->> 'linkedin' = 'https://www.linkedin.com/in/pat-tan' from public.public_profiles where id = :P), 'customers can see a provider''s links');
update public.profiles set links = '{"website": "https://spam.example"}' where id = :P;   -- matches nothing: not their profile
select tests.ok((select links ->> 'website' = 'https://pattan.sg' from public.public_profiles where id = :P), 'nobody else can change a provider''s links');
reset role;
select tests.login(null);
