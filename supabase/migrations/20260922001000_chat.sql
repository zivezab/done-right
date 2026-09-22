-- Done Right: chat between customers and providers.
-- One thread per pair of people. Only the two members can read it. Messages are written only by
-- send_message (live providers, people you have a booking with, or someone who messaged you; 30 per minute),
-- and the database itself posts booking updates into the thread, so every device sees them.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles (id) on delete cascade,
  member_b uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check (member_a < member_b),
  unique (member_a, member_b)
);
create index on public.chat_threads (member_b);

create table public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,   -- null for platform notices (e.g. expiry)
  system boolean not null default false,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.messages (thread_id, id desc);
create index on public.messages (sender, created_at desc);

create table public.chat_reads (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.chat_threads enable row level security;
alter table public.messages enable row level security;
alter table public.chat_reads enable row level security;
create policy members_read on public.chat_threads for select using (auth.uid() in (member_a, member_b));
create policy members_read on public.messages for select using (
  exists (select 1 from public.chat_threads t where t.id = thread_id and auth.uid() in (t.member_a, t.member_b)));
create policy own_read on public.chat_reads for select using (user_id = auth.uid());
revoke all on public.chat_threads, public.messages, public.chat_reads from anon, authenticated;
grant select on public.chat_threads, public.messages, public.chat_reads to authenticated;

-- ------------------------------------------------------------------ helpers
create function dr.thread_for(p_a uuid, p_b uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare t uuid;
begin
  insert into public.chat_threads (member_a, member_b) values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict (member_a, member_b) do nothing;
  select id into t from public.chat_threads where member_a = least(p_a, p_b) and member_b = greatest(p_a, p_b);
  return t;
end $$;

create function dr.post(p_thread uuid, p_sender uuid, p_text text, p_system boolean) returns public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.messages;
begin
  insert into public.messages (thread_id, sender, system, text) values (p_thread, p_sender, p_system, left(p_text, 2000)) returning * into m;
  update public.chat_threads set last_message_at = m.created_at where id = p_thread;
  return m;
end $$;

-- ------------------------------------------------------------------ user actions
create function public.send_message(p_to uuid, p_text text) returns public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  body text := trim(coalesce(p_text, ''));
begin
  if me is null then perform dr.fail('Please sign in first'); end if;
  if p_to is null or p_to = me then perform dr.fail('Choose who to message'); end if;
  if length(body) = 0 then perform dr.fail('Write a message first'); end if;
  if length(body) > 2000 then perform dr.fail('Messages can be up to 2,000 characters'); end if;
  -- who may talk: anyone can ask a live provider; a booking together (either way round); or a reply to
  -- someone who messaged you first. Providers cannot cold-message people.
  if not exists (select 1 from public.providers where user_id = p_to and status = 'live')
     and not exists (select 1 from public.orders where (customer_id = me and provider_id = p_to) or (customer_id = p_to and provider_id = me))
     and not exists (select 1 from public.messages m join public.chat_threads t on t.id = m.thread_id
                     where t.member_a = least(me, p_to) and t.member_b = greatest(me, p_to) and m.sender = p_to and not m.system) then
    perform dr.fail('You can message providers, or people you have a booking with');
  end if;
  if (select count(*) from public.messages where sender = me and not system and created_at > now() - interval '1 minute') >= 30 then
    perform dr.fail('You are sending messages too quickly — please wait a moment');
  end if;
  return dr.post(dr.thread_for(me, p_to), me, body, false);
end $$;

create function public.mark_read(p_thread uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.chat_threads where id = p_thread and auth.uid() in (member_a, member_b)) then
    perform dr.fail('Conversation not found');
  end if;
  insert into public.chat_reads (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- Unread messages per thread for the signed-in user.
create function public.chat_unread() returns table (thread_id uuid, unread int)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, count(m.id)::int
  from public.chat_threads t
  join public.messages m on m.thread_id = t.id and m.sender is distinct from auth.uid()
  left join public.chat_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  where auth.uid() in (t.member_a, t.member_b) and m.created_at > coalesce(r.last_read_at, '-infinity')
  group by t.id
$$;

revoke execute on function public.send_message(uuid, text), public.mark_read(uuid), public.chat_unread() from public, anon;
grant execute on function public.send_message(uuid, text), public.mark_read(uuid), public.chat_unread() to authenticated;

-- ------------------------------------------------------------------ booking updates → chat (same wording as js/booking.js)
create function dr.order_event_to_chat() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  pname text;
  d text; t text;
  body text;
  from_customer boolean := false;
begin
  select * into o from public.orders where id = new.order_id;
  if not found then return new; end if;
  select coalesce(nullif(name, ''), 'Your provider') into pname from public.profiles where id = o.provider_id;
  d := o.local_date::text; t := to_char(o.local_time, 'HH24:MI');
  case new.event
    when 'confirmed' then body := format('✅ Booking confirmed: %s on %s at %s.', o.service_name, d, t);
    when 'paid' then
      if o.status = 'requested' then
        body := format('📅 New booking request: %s on %s at %s. Please accept or decline.', o.service_name, d, t); from_customer := true;
      end if;
    when 'accepted' then body := format('✅ %s accepted your booking for %s at %s.', pname, d, t);
    when 'cancelled' then
      if new.detail ->> 'by' = 'provider' and o.cancel_reason like 'Declined%' then
        body := format('❌ Booking for %s %s was declined. You have been fully refunded.', d, t);
      else
        body := format('Booking for %s %s was cancelled.', d, t); from_customer := new.detail ->> 'by' = 'customer';
      end if;
    when 'reschedule_requested' then
      -- the order still holds the old time; the requested one is in detail.to
      body := format('🔁 Reschedule request: move %s %s → %s.', d, t, new.detail ->> 'to'); from_customer := true;
    when 'rescheduled' then body := format('🔁 Booking moved to %s at %s.', d, t); from_customer := new.detail ->> 'by' = 'customer';
    when 'reschedule_declined' then body := 'The provider could not accommodate your reschedule request. Your original time stays.';
    when 'proposal' then
      body := format('🔁 %s proposed a new time: %s.', pname, replace(new.detail ->> 'to', ' ', ' at '))
        || case when coalesce(o.proposal ->> 'note', '') <> '' then format(' "%s"', o.proposal ->> 'note') else '' end;
    when 'proposal_declined' then body := 'The customer kept the original time.'; from_customer := true;
    else body := null;
  end case;
  if body is not null then
    perform dr.post(dr.thread_for(o.customer_id, o.provider_id),
      case when new.actor is null then null when from_customer then o.customer_id else o.provider_id end, body, true);
  end if;
  return new;
end $$;
create trigger order_events_chat after insert on public.order_events for each row execute function dr.order_event_to_chat();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.chat_threads;
  end if;
end $$;

-- People you are chatting with can see your public profile (name, age), like booking partners can.
create or replace view public.public_profiles as
  select p.id, p.name, p.gender, p.country, p.avatar_path,
         case when p.dob is not null then extract(year from age(p.dob))::int end as age
  from public.profiles p
  where exists (select 1 from public.providers pr where pr.user_id = p.id and pr.status = 'live')
     or p.id = auth.uid()
     or exists (select 1 from public.orders o where (o.customer_id = p.id and o.provider_id = auth.uid())
                                             or (o.provider_id = p.id and o.customer_id = auth.uid()))
     or exists (select 1 from public.chat_threads t where (t.member_a = p.id and t.member_b = auth.uid())
                                                   or (t.member_b = p.id and t.member_a = auth.uid()));
