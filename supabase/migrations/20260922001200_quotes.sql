-- Done Right: quote requests, provider offers and accepting an offer (which books it).
-- Customers describe a job; the database invites up to 5 nearby providers who can legally offer the
-- service (or one provider directly). Invited providers see the job and its area — never the street
-- address — and can send one offer into a free slot of their schedule, or decline. Accepting an offer
-- creates the booking at the quoted price; the other offers are declined.

create type public.quote_status as enum ('open', 'accepted', 'closed', 'expired');
create type public.offer_status as enum ('pending', 'accepted', 'declined', 'expired', 'replaced');

create table public.quote_requests (
  id uuid primary key,                         -- chosen by the app so photos can be uploaded first
  no text not null unique default ('Q' || lpad((floor(random() * 1e8))::bigint::text, 8, '0')),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  service_id text not null references public.service_types (id),
  country public.country_code not null,
  title text not null check (length(title) between 1 and 120),
  details text not null check (length(details) between 20 and 2000),
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  mode public.service_mode not null default 'onsite',
  address jsonb,                               -- only the customer sees this; providers see the area
  area text,
  preferred_date date,
  time_of_day text not null default 'any' check (time_of_day in ('any', 'morning', 'afternoon', 'evening')),
  budget_min numeric(10, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(10, 2) check (budget_max is null or budget_max >= 0),
  direct boolean not null default false,
  status public.quote_status not null default 'open',
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);
create index on public.quote_requests (customer_id, created_at desc);

create table public.quote_invites (
  quote_id uuid not null references public.quote_requests (id) on delete cascade,
  provider_id uuid not null references public.providers (user_id) on delete cascade,
  declined boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (quote_id, provider_id)
);
create index on public.quote_invites (provider_id);

create table public.quote_offers (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quote_requests (id) on delete cascade,
  provider_id uuid not null references public.providers (user_id) on delete cascade,
  price numeric(10, 2) not null check (price > 0),
  local_date date not null,
  local_time time not null,
  duration_min int not null check (duration_min between 15 and 1440),
  message text not null default '' check (length(message) <= 1000),
  valid_until timestamptz not null,
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index on public.quote_offers (quote_id);
create unique index quote_offers_one_pending on public.quote_offers (quote_id, provider_id) where status = 'pending';

alter table public.quote_requests enable row level security;
alter table public.quote_invites enable row level security;
alter table public.quote_offers enable row level security;
create policy owner_read on public.quote_requests for select using (customer_id = auth.uid());
create policy party_read on public.quote_invites for select using (
  provider_id = auth.uid() or exists (select 1 from public.quote_requests q where q.id = quote_id and q.customer_id = auth.uid()));
create policy party_read on public.quote_offers for select using (
  provider_id = auth.uid() or exists (select 1 from public.quote_requests q where q.id = quote_id and q.customer_id = auth.uid()));
revoke all on public.quote_requests, public.quote_invites, public.quote_offers from anon, authenticated;
grant select on public.quote_requests, public.quote_invites, public.quote_offers to authenticated;

-- What an invited provider sees: the job, its area and who asked (to reply in chat) — never the street address.
create view public.provider_quote_inbox as
  select q.id, q.no, q.customer_id, q.service_id, q.country, q.title, q.details, q.photos, q.mode, q.area, q.preferred_date, q.time_of_day,
         q.budget_min, q.budget_max, q.direct, q.status, q.created_at, q.expires_at, i.declined,
         coalesce(nullif(split_part(p.name, ' ', 1), ''), 'Customer') as customer_name
  from public.quote_invites i
  join public.quote_requests q on q.id = i.quote_id
  join public.profiles p on p.id = q.customer_id
  where i.provider_id = auth.uid();
grant select on public.provider_quote_inbox to authenticated;

-- ------------------------------------------------------------------ helpers
create function dr.km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) returns double precision
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create function dr.money(p numeric, cc public.country_code) returns text language sql immutable as $$
  select case cc when 'MY' then 'RM' else 'S$' end
         || case when p = trunc(p) then to_char(p, 'FM999,999,990') else to_char(p, 'FM999,999,990.00') end
$$;

-- ------------------------------------------------------------------ customer: request quotes
create function public.create_quote(
  p_id uuid, p_service text, p_title text, p_details text, p_photos text[] default '{}',
  p_mode public.service_mode default 'onsite', p_address jsonb default null, p_area text default null,
  p_date date default null, p_time_of_day text default 'any', p_budget_min numeric default null, p_budget_max numeric default null,
  p_provider uuid default null
) returns public.quote_requests language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  cc public.country_code;
  here_lat double precision; here_lng double precision;   -- job location (not named lat/lng: those are columns)
  area_name text;
  q public.quote_requests;
  path text;
  invited int;
begin
  if me is null then perform dr.fail('Please sign in first'); end if;
  if not exists (select 1 from public.service_types where id = p_service) then perform dr.fail('Choose a service'); end if;
  if length(trim(coalesce(p_details, ''))) < 20 then perform dr.fail('Describe the job in at least 20 characters'); end if;
  if p_mode = 'onsite' and (p_address is null or coalesce(p_address ->> 'line', '') = '') then perform dr.fail('Add the address where the job is'); end if;
  if p_budget_min is not null and p_budget_max is not null and p_budget_min > p_budget_max then perform dr.fail('Budget “from” must be lower than “to”'); end if;
  if coalesce(array_length(p_photos, 1), 0) > 4 then perform dr.fail('Up to 4 photos'); end if;
  foreach path in array coalesce(p_photos, '{}') loop
    if path not like me::text || '/' || p_id::text || '/%' then perform dr.fail('Invalid photo'); end if;
  end loop;
  select country into cc from public.profiles where id = me;
  area_name := coalesce(nullif(p_address ->> 'area', ''), p_area);
  here_lat := (p_address ->> 'lat')::double precision; here_lng := (p_address ->> 'lng')::double precision;
  if here_lat is null then select a.lat, a.lng into here_lat, here_lng from public.areas a where a.country = cc and a.name = area_name; end if;

  insert into public.quote_requests (id, customer_id, service_id, country, title, details, photos, mode, address, area,
    preferred_date, time_of_day, budget_min, budget_max, direct, expires_at)
  values (p_id, me, p_service, cc, left(coalesce(nullif(trim(p_title), ''), (select name from public.service_types where id = p_service)), 120),
    left(trim(p_details), 2000), coalesce((select jsonb_agg(jsonb_build_object('path', x)) from unnest(p_photos) x), '[]'),
    p_mode, case when p_mode = 'online' then null else p_address end, area_name, p_date,
    case when p_time_of_day in ('morning', 'afternoon', 'evening') then p_time_of_day else 'any' end,
    p_budget_min, p_budget_max, p_provider is not null, dr.now() + interval '7 days')
  returning * into q;

  -- who is invited: the chosen provider, or up to 5 nearest (within 30 km when any are) who can offer it legally
  with candidates as (
    select pr.user_id, case when here_lat is null then 0 else dr.km(here_lat, here_lng, pr.lat, pr.lng) end as km
    from public.providers pr
    where pr.status = 'live' and not pr.paused and pr.country = cc and pr.user_id <> me
      and (p_provider is null or pr.user_id = p_provider)
      and exists (select 1 from public.provider_services s where s.provider_id = pr.user_id and s.service_id = p_service and s.active)
      and dr.service_listable(pr.user_id, p_service)
  ), near as (
    select * from candidates where km <= 30 or not exists (select 1 from candidates where km <= 30)
  )
  insert into public.quote_invites (quote_id, provider_id)
  select q.id, user_id from near order by km limit 5;
  get diagnostics invited = row_count;
  if invited = 0 then
    perform dr.fail(case when p_provider is null then 'No pros nearby yet — we''ll notify you when one joins' else 'This provider is not taking requests for this service' end);
  end if;

  perform dr.post(dr.thread_for(me, i.provider_id), me, '📝 New quote request: ' || q.title, true)
  from public.quote_invites i where i.quote_id = q.id;
  return q;
end $$;

create function public.reject_quote_offer(p_offer uuid) returns public.quote_offers
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.quote_offers;
begin
  update public.quote_offers f set status = 'declined'
  where f.id = p_offer and f.status = 'pending'
    and exists (select 1 from public.quote_requests q where q.id = f.quote_id and q.customer_id = auth.uid())
  returning * into o;
  if not found then perform dr.fail('Offer is no longer available'); end if;
  return o;
end $$;

create function public.close_quote(p_quote uuid) returns public.quote_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.quote_requests;
begin
  update public.quote_requests set status = 'closed' where id = p_quote and customer_id = auth.uid() and status = 'open' returning * into q;
  if not found then perform dr.fail('This request is no longer open'); end if;
  update public.quote_offers set status = 'expired' where quote_id = p_quote and status = 'pending';
  return q;
end $$;

-- Accepting books the provider at the quoted price (no travel fee); payment then confirms it directly.
create function public.accept_quote_offer(p_offer uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.quote_offers;
  q public.quote_requests;
  p public.providers;
  ts timestamptz;
  o public.orders;
begin
  select * into f from public.quote_offers where id = p_offer for update;
  if not found then perform dr.fail('Offer is no longer available'); end if;
  select * into q from public.quote_requests where id = f.quote_id and customer_id = auth.uid() for update;
  if not found then perform dr.fail('Offer is no longer available'); end if;
  if q.status <> 'open' then perform dr.fail('This request is no longer open'); end if;
  if f.status <> 'pending' then perform dr.fail('Offer is no longer available'); end if;
  if f.valid_until < dr.now() then
    update public.quote_offers set status = 'expired' where id = f.id;
    perform dr.fail('This offer has expired');
  end if;
  select * into p from public.providers where user_id = f.provider_id;
  if dr.slot_problem(f.provider_id, f.local_date, f.local_time, f.duration_min) is not null then
    perform dr.fail('That time slot is no longer available');
  end if;
  ts := (f.local_date + f.local_time) at time zone dr.tz(p.country);
  insert into public.orders (customer_id, provider_id, service_id, service_name, unit, country, starts_at, local_date, local_time,
    duration_min, busy, mode, address, notes, price, fee, total, policy, quote_id, created_at)
  values (q.customer_id, f.provider_id, q.service_id, q.title, 'job', p.country, ts, f.local_date, f.local_time, f.duration_min,
    tstzrange(ts, ts + make_interval(mins => least(f.duration_min, 240))), q.mode, q.address, left(q.details, 1000),
    f.price, 0, f.price, dr.policy_of(p), q.id, dr.now())
  returning * into o;
  perform dr.log(o.id, 'created', jsonb_build_object('quote', q.id));
  update public.quote_offers set status = 'accepted' where id = f.id;
  update public.quote_offers set status = 'declined' where quote_id = q.id and id <> f.id and status = 'pending';
  update public.quote_requests set status = 'accepted', order_id = o.id where id = q.id;
  return o;
exception when exclusion_violation then
  perform dr.fail('That time slot is no longer available');
end $$;

-- ------------------------------------------------------------------ provider: answer requests
create function public.send_quote_offer(
  p_quote uuid, p_price numeric, p_date date, p_time time, p_duration int default 60, p_message text default '', p_valid_days int default 3
) returns public.quote_offers language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  q public.quote_requests;
  f public.quote_offers;
begin
  select * into q from public.quote_requests where id = p_quote;
  if not found or q.status <> 'open' or q.expires_at < dr.now() then perform dr.fail('This request is no longer open'); end if;
  if not exists (select 1 from public.quote_invites where quote_id = p_quote and provider_id = me and not declined) then
    perform dr.fail('You were not invited to quote');
  end if;
  if coalesce(p_price, 0) <= 0 then perform dr.fail('Enter a price'); end if;
  if dr.slot_problem(me, p_date, p_time, coalesce(p_duration, 60)) is not null then perform dr.fail('Pick a free time in your schedule'); end if;
  update public.quote_offers set status = 'replaced' where quote_id = p_quote and provider_id = me and status = 'pending';
  insert into public.quote_offers (quote_id, provider_id, price, local_date, local_time, duration_min, message, valid_until)
  values (p_quote, me, round(p_price), p_date, p_time, greatest(15, least(coalesce(p_duration, 60), 1440)), left(trim(coalesce(p_message, '')), 1000),
    dr.now() + make_interval(days => greatest(1, least(coalesce(p_valid_days, 3), 14))))
  returning * into f;
  perform dr.post(dr.thread_for(me, q.customer_id), me,
    format('💬 Quote: %s for “%s” on %s %s.', dr.money(f.price, q.country), q.title, f.local_date, to_char(f.local_time, 'HH24:MI')), true);
  return f;
end $$;

create function public.decline_quote_request(p_quote uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.quote_invites set declined = true where quote_id = p_quote and provider_id = auth.uid();
  if not found then perform dr.fail('You were not invited to quote'); end if;
  update public.quote_offers set status = 'expired' where quote_id = p_quote and provider_id = auth.uid() and status = 'pending';
end $$;

-- ------------------------------------------------------------------ expiry (runs with the order expiry job)
create function public.expire_quotes() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; k int;
begin
  with x as (update public.quote_requests set status = 'expired' where status = 'open' and expires_at < dr.now() returning id)
  select count(*) into n from x;
  update public.quote_offers f set status = 'expired'
  where f.status = 'pending' and (f.valid_until < dr.now()
    or exists (select 1 from public.quote_requests q where q.id = f.quote_id and q.status <> 'open'));
  get diagnostics k = row_count;
  return n + k;
end $$;

revoke execute on function
  public.create_quote(uuid, text, text, text, text[], public.service_mode, jsonb, text, date, text, numeric, numeric, uuid),
  public.reject_quote_offer(uuid), public.close_quote(uuid), public.accept_quote_offer(uuid),
  public.send_quote_offer(uuid, numeric, date, time, int, text, int), public.decline_quote_request(uuid), public.expire_quotes()
  from public, anon;
grant execute on function
  public.create_quote(uuid, text, text, text, text[], public.service_mode, jsonb, text, date, text, numeric, numeric, uuid),
  public.reject_quote_offer(uuid), public.close_quote(uuid), public.accept_quote_offer(uuid),
  public.send_quote_offer(uuid, numeric, date, time, int, text, int), public.decline_quote_request(uuid), public.expire_quotes()
  to authenticated;

-- ------------------------------------------------------------------ job photos: private; the customer and invited providers
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "quote photos: customers upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quote-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "quote photos: the customer and invited providers can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.quote_invites i where i.quote_id::text = (storage.foldername(name))[2] and i.provider_id = auth.uid())));
create policy "quote photos: customers can delete their uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quote-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ realtime + schedule
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.quote_requests, public.quote_invites, public.quote_offers;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dr-expire-quotes', '*/5 * * * *', 'select public.expire_quotes()');
  end if;
end $$;
