-- Done Right: personal lists — follows (providers, services, shops), hidden providers and the cart.
-- Private to their owner (RLS "own rows only"). Every column is part of the key or set once, so rows are only
-- inserted or deleted: there is no update grant, and an upsert that rewrites a row is refused. The app adds rows
-- with `insert … on conflict (key) do nothing`, which only needs insert, so a row another tab already saved is fine.
-- Targets are text: provider ids are uuids for real accounts, shops are business names.

create type public.follow_kind as enum ('provider', 'service', 'shop');

create table public.follows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.follow_kind not null,
  target text not null check (length(target) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target)
);
-- follower counts per provider
create index follows_target on public.follows (target) where kind = 'provider';

create table public.hidden_providers (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider_id text not null check (length(provider_id) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);

-- A cart line is a service, optionally with a chosen provider ('' = best match); each is in the cart at most once.
create table public.cart_items (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  service_id text not null references public.service_types (id),
  provider_key text not null default '' check (length(provider_key) <= 200),
  added_at timestamptz not null default now(),
  primary key (user_id, service_id, provider_key)
);

-- a cart stays a short list
create function dr.cart_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.cart_items where user_id = new.user_id) >= 200 then
    raise exception using errcode = 'P0001', message = 'Your cart is full (200 items)';
  end if;
  return new;
end $$;
create trigger cart_limit before insert on public.cart_items for each row execute function dr.cart_limit();

alter table public.follows enable row level security;
alter table public.hidden_providers enable row level security;
alter table public.cart_items enable row level security;

create policy own_read on public.follows for select using (user_id = auth.uid());
create policy own_insert on public.follows for insert with check (user_id = auth.uid());
create policy own_delete on public.follows for delete using (user_id = auth.uid());
create policy own_read on public.hidden_providers for select using (user_id = auth.uid());
create policy own_insert on public.hidden_providers for insert with check (user_id = auth.uid());
create policy own_delete on public.hidden_providers for delete using (user_id = auth.uid());
create policy own_read on public.cart_items for select using (user_id = auth.uid());
create policy own_insert on public.cart_items for insert with check (user_id = auth.uid());
create policy own_delete on public.cart_items for delete using (user_id = auth.uid());

-- Follower counts for provider profiles: an aggregate only, never who follows whom.
create function public.follower_counts(p_providers text[])
returns table (provider_id text, followers int) language sql stable security definer set search_path = public, pg_temp as $$
  select f.target, count(*)::int from public.follows f
  where f.kind = 'provider' and f.target = any (p_providers[1:500])
  group by f.target
$$;

revoke all on public.follows, public.hidden_providers, public.cart_items from anon, authenticated;
grant select, insert, delete on public.follows, public.hidden_providers, public.cart_items to authenticated;
revoke execute on function dr.cart_limit() from public, anon, authenticated;
revoke execute on function public.follower_counts(text[]) from public;
grant execute on function public.follower_counts(text[]) to anon, authenticated;
