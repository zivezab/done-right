-- Done Right: row-level security, grants, validation triggers and reviewer actions.
-- Principle: clients may read what they are entitled to and edit their own profile / listing / documents.
-- Orders and verification decisions change only through security-definer functions.

-- ------------------------------------------------------------------ staff
create function dr.is_staff() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- ------------------------------------------------------------------ validation
create function dr.validate_provider() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pol jsonb := new.policy;
  step int := coalesce((new.availability ->> 'slotMinutes')::int, 60);
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  if step not in (15, 30, 45, 60, 90, 120) then raise exception using errcode = 'P0001', message = 'Invalid slot length'; end if;
  if jsonb_typeof(coalesce(new.availability -> 'weekly', '{}')) <> 'object'
     or jsonb_typeof(coalesce(new.availability -> 'overrides', '{}')) <> 'object'
     or jsonb_typeof(coalesce(new.availability -> 'blocks', '{}')) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Invalid availability';
  end if;
  if coalesce(pol ->> 'mode', 'instant') not in ('instant', 'request')
     or dr.pint(pol, 'approvalHours') not between 1 and 72
     or dr.pint(pol, 'rescheduleLockHours') not between 0 and 168
     or dr.pint(pol, 'maxReschedules') not between 0 and 10
     or dr.pint(pol, 'freeCancelHours') not between 0 and 168
     or dr.pint(pol, 'leadMinutes') not between 0 and 10080
     or dr.pint(pol, 'advanceDays') not between 1 and 365
     or dr.pint(pol, 'bufferMinutes') not between 0 and 240 then
    raise exception using errcode = 'P0001', message = 'Invalid booking rules';
  end if;
  new.country := (select country from public.profiles where id = new.user_id);
  -- going live requires a verified identity
  if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live') and not exists (
    select 1 from public.verification_items v where v.user_id = new.user_id and v.kind = 'identity' and v.status = 'verified'
  ) then
    raise exception using errcode = 'P0001', message = 'Identity verification is required before going live';
  end if;
  return new;
end $$;
create trigger providers_validate before insert or update on public.providers for each row execute function dr.validate_provider();

-- Owners can submit and edit their documents; any edit goes back to review. Only staff change status.
create function dr.guard_verification() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare staff boolean := dr.is_staff() or auth.uid() is null;  -- auth.uid() is null for service role / migrations
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  new.licence_id := case when new.kind = 'certifications' and exists (select 1 from public.licence_types where id = new.data ->> 'licenceId')
                         then new.data ->> 'licenceId' end;
  new.id_hash := case when new.kind = 'identity' then nullif(new.data ->> 'idHash', '') end;
  new.expires_on := case
    when new.kind = 'certifications' and coalesce(new.data ->> 'expiry', '') ~ '^\d{4}-\d{2}$'
      then ((new.data ->> 'expiry') || '-01')::date + interval '1 month' - interval '1 day'
    when new.kind = 'identity' and coalesce(new.data ->> 'docExpiry', '') ~ '^\d{4}-\d{2}-\d{2}$' then (new.data ->> 'docExpiry')::date
    when new.kind = 'background' and coalesce(new.data ->> 'issued', '') ~ '^\d{4}-\d{2}-\d{2}$' then (new.data ->> 'issued')::date + interval '1 year'
  end;
  if not staff then
    if tg_op = 'INSERT' or new.data is distinct from old.data then
      new.status := 'pending'; new.reason := null; new.reviewed_at := null; new.reviewed_by := null; new.submitted_at := now();
    else
      new.status := old.status; new.reason := old.reason; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end $$;
create trigger verification_guard before insert or update on public.verification_items for each row execute function dr.guard_verification();

-- ------------------------------------------------------------------ reviewer actions
create function public.review_item(p_item uuid, p_status public.verification_status, p_reason text default null)
returns public.verification_items language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.verification_items;
begin
  if not dr.is_staff() then perform dr.fail('Not allowed'); end if;
  if p_status not in ('verified', 'rejected') then perform dr.fail('Choose verified or rejected'); end if;
  if p_status = 'rejected' and coalesce(p_reason, '') = '' then perform dr.fail('A reject reason is required'); end if;
  update public.verification_items set status = p_status, reason = case when p_status = 'rejected' then p_reason end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_item returning * into v;
  if not found then perform dr.fail('Item not found'); end if;
  insert into public.audit_log (actor, subject_user, item, action, reason)
  values (auth.uid(), v.user_id, v.kind || coalesce(' · ' || (v.data ->> 'name'), ''), p_status::text, p_reason);
  return v;
end $$;

-- Nightly: lapse expired documents (a lapsed licence immediately unlists the regulated service).
create function public.expire_documents() returns int language sql security definer set search_path = public, pg_temp as $$
  with x as (
    update public.verification_items set status = 'expired'
    where status = 'verified' and expires_on is not null and expires_on < (dr.now() at time zone 'Asia/Singapore')::date
    returning id
  ) select count(*)::int from x
$$;

-- ------------------------------------------------------------------ public read models
-- Public face of people: live providers, plus anyone you share a booking with. No phone, email or date of birth.
create view public.public_profiles as
  select p.id, p.name, p.gender, p.country, p.avatar_path,
         case when p.dob is not null then extract(year from age(p.dob))::int end as age
  from public.profiles p
  where exists (select 1 from public.providers pr where pr.user_id = p.id and pr.status = 'live')
     or p.id = auth.uid()
     or exists (select 1 from public.orders o where (o.customer_id = p.id and o.provider_id = auth.uid())
                                             or (o.provider_id = p.id and o.customer_id = auth.uid()));

-- Verified credentials shown on provider profiles; identity documents never leave the private table.
create view public.provider_credentials as
  select v.id, v.user_id, v.kind, v.licence_id, v.status, v.expires_on, v.submitted_at,
         case when v.kind in ('identity', 'background') then '{}'::jsonb
              when v.kind = 'business' then jsonb_build_object('name', v.data ->> 'name')
              else v.data - 'file' - 'files' - 'idHash' end as data
  from public.verification_items v
  join public.providers pr on pr.user_id = v.user_id and pr.status = 'live'
  where v.status = 'verified';

-- Services customers can actually book (licensed where required).
create view public.bookable_services as
  select s.*, st.group_id from public.provider_services s
  join public.providers pr on pr.user_id = s.provider_id and pr.status = 'live' and not pr.paused
  join public.service_types st on st.id = s.service_id
  where s.active and dr.service_listable(s.provider_id, s.service_id);

-- ------------------------------------------------------------------ RLS
alter table public.service_groups enable row level security;
alter table public.service_types enable row level security;
alter table public.licence_types enable row level security;
alter table public.licence_rules enable row level security;
alter table public.areas enable row level security;
alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.providers enable row level security;
alter table public.provider_services enable row level security;
alter table public.verification_items enable row level security;
alter table public.audit_log enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;

create policy catalog_read on public.service_groups for select using (true);
create policy catalog_read on public.service_types for select using (true);
create policy catalog_read on public.licence_types for select using (true);
create policy catalog_read on public.licence_rules for select using (true);
create policy catalog_read on public.areas for select using (true);
create policy config_read on public.app_config for select using (true);

create policy own_read on public.profiles for select using (id = auth.uid() or dr.is_staff());
create policy own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy own_read on public.staff for select using (user_id = auth.uid());

create policy public_read on public.providers for select using (status = 'live' or user_id = auth.uid() or dr.is_staff());
create policy own_insert on public.providers for insert with check (user_id = auth.uid());
create policy own_update on public.providers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_delete on public.providers for delete using (user_id = auth.uid());

create policy public_read on public.provider_services for select using (
  provider_id = auth.uid() or exists (select 1 from public.providers p where p.user_id = provider_id and p.status = 'live'));
create policy own_write on public.provider_services for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());

create policy own_read on public.verification_items for select using (user_id = auth.uid() or dr.is_staff());
create policy own_insert on public.verification_items for insert with check (user_id = auth.uid());
create policy own_update on public.verification_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_delete on public.verification_items for delete using (user_id = auth.uid());

create policy staff_read on public.audit_log for select using (dr.is_staff());

create policy party_read on public.orders for select using (auth.uid() in (customer_id, provider_id) or dr.is_staff());
create policy party_read on public.order_events for select using (
  exists (select 1 from public.orders o where o.id = order_id and (auth.uid() in (o.customer_id, o.provider_id) or dr.is_staff())));

-- ------------------------------------------------------------------ grants
-- Supabase grants table privileges to anon/authenticated by default; narrow them to what RLS expects.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.service_groups, public.service_types, public.licence_types, public.licence_rules, public.areas, public.app_config
  to anon, authenticated;
grant select on public.providers, public.provider_services, public.public_profiles, public.provider_credentials, public.bookable_services
  to anon, authenticated;
grant select, update (name, gender, dob, country, avatar_path, roles, addresses, consents) on public.profiles to authenticated;
grant select on public.staff, public.orders, public.order_events, public.audit_log to authenticated;
grant insert, update, delete on public.providers, public.provider_services to authenticated;
grant select, insert, delete on public.verification_items to authenticated;
grant update (data) on public.verification_items to authenticated;

revoke all on schema dr from public;
grant usage on schema dr to anon, authenticated;
revoke execute on all functions in schema dr from public, anon, authenticated;
grant execute on function dr.is_staff(), dr.service_listable(uuid, text), dr.now(), dr.pint(jsonb, text), dr.default_policy()
  to anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.provider_busy(uuid, date, date), public.slot_status(uuid, text, date, time) to anon, authenticated;
grant execute on function
  public.create_booking(uuid, text, date, time, public.service_mode, jsonb, text),
  public.pay_order(uuid, text),
  public.accept_booking(uuid), public.decline_booking(uuid, text),
  public.cancel_terms(uuid), public.cancel_booking(uuid),
  public.request_reschedule(uuid, date, time), public.respond_reschedule(uuid, boolean),
  public.propose_time(uuid, date, time, text), public.respond_proposal(uuid, boolean),
  public.mark_done(uuid), public.confirm_done(uuid), public.expire_orders(),
  public.review_item(uuid, public.verification_status, text)
  to authenticated;
grant execute on function public.confirm_payment(uuid, text, text), public.expire_documents() to service_role;
