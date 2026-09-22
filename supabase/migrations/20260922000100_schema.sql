-- Done Right: core schema.
-- Targets Supabase (Postgres 15+). Local tests stub the `auth` schema; see tests/db/00_supabase_stub.sql.
-- Everything app-owned lives in `public`; private helpers live in `dr`.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;  -- exclusion constraint on (provider, time range)

create schema if not exists dr;

-- ------------------------------------------------------------------ enums
create type public.country_code as enum ('SG', 'MY');
create type public.provider_status as enum ('draft', 'live');
create type public.order_status as enum ('to_pay', 'requested', 'upcoming', 'to_confirm', 'to_review', 'completed', 'cancelled');
create type public.service_mode as enum ('onsite', 'online');
create type public.verification_kind as enum ('identity', 'business', 'background', 'education', 'certifications', 'experience');
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'expired');

-- ------------------------------------------------------------------ catalog (seeded by the catalog migration)
create table public.service_groups (
  id text primary key,
  name text not null,
  background_check boolean not null default false
);

create table public.service_types (
  id text primary key,
  group_id text not null references public.service_groups (id),
  name text not null,
  unit text not null,
  duration_min int not null check (duration_min > 0),
  base_price_sgd numeric(10, 2) not null default 0,
  background_check boolean not null default false
);

create table public.licence_types (
  id text primary key,
  country public.country_code not null,
  name text not null,
  issuer text not null,
  register text
);

-- A service needs one verified licence from EVERY requirement group of its country ("any of" inside a group).
create table public.licence_rules (
  service_id text not null references public.service_types (id),
  country public.country_code not null,
  req_group int not null,
  licence_id text not null references public.licence_types (id),
  primary key (service_id, country, req_group, licence_id)
);

create table public.areas (
  country public.country_code not null,
  name text not null,
  region text not null,
  lat double precision not null,
  lng double precision not null,
  primary key (country, name)
);

-- Runtime switches. demo_payments=true lets customers "pay" without a PSP (never enable in production).
create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values ('demo_payments', 'true'), ('pay_window_minutes', '15');

-- ------------------------------------------------------------------ people
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 80),
  gender text not null default '' check (gender in ('', 'M', 'F')),
  dob date,
  country public.country_code not null default 'SG',
  phone text,
  email text,
  avatar_path text,
  roles jsonb not null default '{"consumer": true}',
  addresses jsonb not null default '[]',
  consents jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('reviewer', 'admin'))
);

create table public.providers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.provider_status not null default 'draft',
  paused boolean not null default false,
  country public.country_code not null,
  area text not null,
  lat double precision not null,
  lng double precision not null,
  headline text not null default '' check (length(headline) <= 120),
  bio text not null default '' check (length(bio) <= 4000),
  years int not null default 1 check (years between 0 and 70),
  languages text[] not null default '{English}',
  skills text[] not null default '{}',
  serves text not null default 'all' check (serves in ('all', 'female', 'male')),
  travel_fee numeric(10, 2) not null default 0 check (travel_fee between 0 and 200),
  -- {slotMinutes, weekly: {"0".."6": [["09:00","18:00"]]}, overrides: {"YYYY-MM-DD": {off} | {ranges}}, blocks: {"YYYY-MM-DD": ["10:00"]}}
  availability jsonb not null default '{"slotMinutes": 60, "weekly": {}, "overrides": {}, "blocks": {}}',
  -- {mode, approvalHours, rescheduleLockHours, maxReschedules, freeCancelHours, leadMinutes, advanceDays, bufferMinutes}
  policy jsonb not null default '{}',
  extra jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_services (
  provider_id uuid not null references public.providers (user_id) on delete cascade,
  service_id text not null references public.service_types (id),
  name text not null check (length(name) between 1 and 120),
  price numeric(10, 2) not null check (price >= 0),
  unit text not null,
  duration_min int not null check (duration_min between 15 and 1440),
  active boolean not null default true,
  description text not null default '',
  primary key (provider_id, service_id)
);

create table public.verification_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.verification_kind not null,
  licence_id text references public.licence_types (id),
  data jsonb not null default '{}',
  id_hash text,
  status public.verification_status not null default 'pending',
  reason text,
  expires_on date,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);
create index on public.verification_items (user_id);
create index on public.verification_items (status) where status = 'pending';
-- one identity per person: the same document hash cannot be pending/verified on two accounts
create unique index verification_identity_unique on public.verification_items (id_hash)
  where kind = 'identity' and id_hash is not null and status in ('pending', 'verified');

create table public.audit_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  actor uuid,
  actor_label text,
  subject_user uuid,
  item text,
  action text not null,
  reason text
);

-- ------------------------------------------------------------------ orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('DR' || lpad((floor(random() * 1e10))::bigint::text, 10, '0')),
  customer_id uuid not null references public.profiles (id),
  provider_id uuid not null references public.providers (user_id),
  service_id text not null references public.service_types (id),
  service_name text not null,
  unit text not null,
  country public.country_code not null,
  starts_at timestamptz not null,
  local_date date not null,
  local_time time not null,
  duration_min int not null,
  -- the job itself: [start, start + min(duration, 240)); buffers are applied by dr.slot_problem like DR.avail.slots
  busy tstzrange not null,
  mode public.service_mode not null,
  address jsonb,
  notes text not null default '' check (length(notes) <= 1000),
  price numeric(10, 2) not null,
  fee numeric(10, 2) not null,
  total numeric(10, 2) not null,
  -- booking rules in force when the order was made (policy changes never apply retroactively)
  policy jsonb not null,
  status public.order_status not null default 'to_pay',
  pay_method text,
  paid_at timestamptz,
  psp_ref text,
  request_expires_at timestamptz,
  accepted_at timestamptz,
  done_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by text,
  refund numeric(10, 2),
  reschedules int not null default 0,
  reschedule_request jsonb,
  proposal jsonb,
  prev jsonb,
  quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id <> provider_id),
  -- a provider can never be double-booked, even under concurrent requests
  constraint orders_no_overlap exclude using gist (provider_id extensions.gist_uuid_ops with =, busy with &&) where (status <> 'cancelled')
);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (provider_id, starts_at);
create index on public.orders (status) where status in ('to_pay', 'requested');

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  ts timestamptz not null default now(),
  actor uuid,
  event text not null,
  detail jsonb not null default '{}'
);
create index on public.order_events (order_id, ts);

-- ------------------------------------------------------------------ housekeeping triggers
create function dr.touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function dr.touch();
create trigger providers_touch before update on public.providers for each row execute function dr.touch();
create trigger orders_touch before update on public.orders for each row execute function dr.touch();

-- every new auth user gets a profile
create function dr.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, phone, email, country)
  values (new.id, new.phone, new.email,
          case when new.raw_user_meta_data ->> 'country' = 'MY' then 'MY'::public.country_code else 'SG' end)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function dr.handle_new_user();
