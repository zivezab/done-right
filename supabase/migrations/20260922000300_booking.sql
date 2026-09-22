-- Done Right: server-side booking rules. Clients never write orders directly; every state change goes
-- through these functions, which re-check availability, licensing and the provider's booking rules.
-- Mirrors js/booking.js and DR.avail in js/data/providers.js.

-- ------------------------------------------------------------------ helpers
-- Clock, overridable in tests only (clients cannot SET through the API).
create function dr.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('dr.now', true), '')::timestamptz, now())
$$;

create function dr.tz(cc public.country_code) returns text language sql immutable as $$
  select case cc when 'MY' then 'Asia/Kuala_Lumpur' else 'Asia/Singapore' end
$$;

create function dr.to_min(t text) returns int language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int
$$;

create function dr.default_policy() returns jsonb language sql immutable as $$
  select '{"mode": "instant", "approvalHours": 12, "rescheduleLockHours": 24, "maxReschedules": 2,
           "freeCancelHours": 24, "leadMinutes": 60, "advanceDays": 30, "bufferMinutes": 0}'::jsonb
$$;

create function dr.policy_of(p public.providers) returns jsonb language sql stable as $$
  select dr.default_policy() || coalesce(p.policy, '{}'::jsonb)
$$;

create function dr.pint(pol jsonb, k text) returns int language sql immutable as $$
  select coalesce((pol ->> k)::numeric, (dr.default_policy() ->> k)::numeric)::int
$$;

create function dr.fail(msg text) returns void language plpgsql as $$
begin raise exception using errcode = 'P0001', message = msg; end $$;

create function dr.log(p_order uuid, p_event text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.order_events (order_id, actor, event, detail) values (p_order, auth.uid(), p_event, coalesce(p_detail, '{}'))
$$;

-- Opening ranges (in minutes) for a provider on a local date: date override, else the weekly pattern.
create function dr.day_ranges(av jsonb, d date) returns table (s int, e int) language sql immutable as $$
  with src as (
    select case
      when av -> 'overrides' -> d::text is not null then
        case when coalesce((av -> 'overrides' -> d::text ->> 'off')::boolean, false) then '[]'::jsonb
             else coalesce(av -> 'overrides' -> d::text -> 'ranges', '[]'::jsonb) end
      else coalesce(av -> 'weekly' -> (extract(dow from d)::int)::text, '[]'::jsonb)
    end as ranges
  )
  select dr.to_min(r ->> 0), dr.to_min(r ->> 1) from src, jsonb_array_elements(src.ranges) r
$$;

-- Does the provider hold everything the law / platform needs to offer this service?
create function dr.service_listable(p_provider uuid, p_service text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  with prov as (select country from public.providers where user_id = p_provider),
  needs as (
    select distinct lr.req_group from public.licence_rules lr, prov
    where lr.service_id = p_service and lr.country = prov.country
  )
  select
    not exists (
      select 1 from needs n
      where not exists (
        select 1 from public.verification_items v
        join public.licence_rules lr on lr.licence_id = v.licence_id and lr.service_id = p_service and lr.req_group = n.req_group
        join prov on lr.country = prov.country
        where v.user_id = p_provider and v.kind = 'certifications' and v.status = 'verified'
          and (v.expires_on is null or v.expires_on >= (dr.now() at time zone dr.tz(prov.country))::date)
      )
    )
    and (
      not (select st.background_check or sg.background_check
           from public.service_types st join public.service_groups sg on sg.id = st.group_id where st.id = p_service)
      or exists (
        select 1 from public.verification_items v
        where v.user_id = p_provider and v.kind = 'background' and v.status = 'verified'
      )
    )
$$;

-- Why a slot cannot be booked, or null when it can.
-- Reasons: closed | not_open | blocked | past | window | booked (same vocabulary as DR.avail.slots).
create function dr.slot_problem(
  p_provider uuid, p_date date, p_time time, p_duration int,
  p_exclude uuid default null, p_ignore_lead boolean default false, p_allow_blocked boolean default false
) returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.providers;
  pol jsonb;
  step int;
  blk int;
  t int := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
  ts timestamptz;
  today date;
  wanted tstzrange;
begin
  select * into p from public.providers where user_id = p_provider;
  if not found or p.status <> 'live' or p.paused then return 'closed'; end if;
  pol := dr.policy_of(p);
  step := coalesce((p.availability ->> 'slotMinutes')::int, 60);
  blk := least(coalesce(p_duration, step), 240);
  if not exists (
    select 1 from dr.day_ranges(p.availability, p_date) r
    where t >= r.s and (t - r.s) % step = 0 and t + least(blk, step) <= r.e
  ) then return 'not_open'; end if;
  ts := (p_date + p_time) at time zone dr.tz(p.country);
  -- the provider's current buffer keeps a gap on both sides of existing jobs
  wanted := tstzrange(ts - make_interval(mins => dr.pint(pol, 'bufferMinutes')),
                    ts + make_interval(mins => blk + dr.pint(pol, 'bufferMinutes')));
  if exists (
    select 1 from public.orders o
    where o.provider_id = p_provider and o.status <> 'cancelled' and o.id is distinct from p_exclude and o.busy && wanted
  ) then return 'booked'; end if;
  if not p_allow_blocked and coalesce(p.availability -> 'blocks' -> p_date::text, '[]'::jsonb) ? to_char(p_time, 'HH24:MI') then
    return 'blocked';
  end if;
  if ts < dr.now() + make_interval(mins => case when p_ignore_lead then 0 else dr.pint(pol, 'leadMinutes') end) then
    return 'past';
  end if;
  today := (dr.now() at time zone dr.tz(p.country))::date;
  if p_date - today > dr.pint(pol, 'advanceDays') then return 'window'; end if;
  return null;
end $$;

-- Travel fee, same formula as DR.data.fee: free within 3 km, then per-km up to a cap.
create function dr.travel_fee(p public.providers, p_mode public.service_mode, p_address jsonb) returns numeric
language plpgsql stable as $$
declare
  lat double precision := (p_address ->> 'lat')::double precision;
  lng double precision := (p_address ->> 'lng')::double precision;
  d double precision;
begin
  if p_mode = 'online' then return 0; end if;
  if lat is null or lng is null then
    select a.lat, a.lng into lat, lng from public.areas a where a.country = p.country and a.name = p_address ->> 'area';
  end if;
  if lat is null then return p.travel_fee; end if;
  -- haversine, km
  d := 2 * 6371 * asin(sqrt(power(sin(radians(lat - p.lat) / 2), 2)
       + cos(radians(p.lat)) * cos(radians(lat)) * power(sin(radians(lng - p.lng) / 2), 2)));
  if d <= 3 then return 0; end if;
  if p.country = 'MY' then return least(60, p.travel_fee + round((d - 3) * 1.2)); end if;
  return least(25, p.travel_fee + round((d - 3) * 0.6));
end $$;

create function dr.order_for_update(p_order uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or auth.uid() is null or auth.uid() not in (o.customer_id, o.provider_id) then
    perform dr.fail('Booking not found');
  end if;
  return o;
end $$;

create function dr.move(o public.orders, p_date date, p_time time, p_by text) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ts timestamptz := (p_date + p_time) at time zone dr.tz(o.country);
  r public.orders;
begin
  update public.orders set
    prev = jsonb_build_object('date', o.local_date, 'time', to_char(o.local_time, 'HH24:MI')),
    starts_at = ts, local_date = p_date, local_time = p_time,
    busy = tstzrange(ts, ts + make_interval(mins => least(o.duration_min, 240))),
    reschedules = o.reschedules + case when p_by = 'customer' then 1 else 0 end,
    reschedule_request = null, proposal = null
  where id = o.id returning * into r;
  perform dr.log(o.id, 'rescheduled', jsonb_build_object('from', o.local_date || ' ' || to_char(o.local_time, 'HH24:MI'),
    'to', p_date || ' ' || to_char(p_time, 'HH24:MI'), 'by', p_by));
  return r;
exception when exclusion_violation then
  perform dr.fail('That time slot is not available');
end $$;

-- ------------------------------------------------------------------ customer: book & pay
create function public.create_booking(
  p_provider uuid, p_service text, p_date date, p_time time,
  p_mode public.service_mode default 'onsite', p_address jsonb default null, p_notes text default ''
) returns public.orders language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  p public.providers;
  s public.provider_services;
  fee numeric;
  ts timestamptz;
  why text;
  pol jsonb;
  o public.orders;
begin
  if me is null then perform dr.fail('Please sign in to book'); end if;
  if me = p_provider then perform dr.fail('You cannot book yourself'); end if;
  select * into p from public.providers where user_id = p_provider;
  if not found or p.status <> 'live' or p.paused then perform dr.fail('This provider is not taking bookings'); end if;
  select * into s from public.provider_services where provider_id = p_provider and service_id = p_service and active;
  if not found then perform dr.fail('This service is not offered by the provider'); end if;
  if not dr.service_listable(p_provider, p_service) then perform dr.fail('This service is not available until the provider is licensed'); end if;
  if p_mode = 'onsite' and (p_address is null or coalesce(p_address ->> 'line', '') = '') then perform dr.fail('Add a service address'); end if;
  why := dr.slot_problem(p_provider, p_date, p_time, s.duration_min);
  if why is not null then perform dr.fail('That time slot is no longer available'); end if;
  pol := dr.policy_of(p);
  fee := dr.travel_fee(p, p_mode, p_address);
  ts := (p_date + p_time) at time zone dr.tz(p.country);
  insert into public.orders (customer_id, provider_id, service_id, service_name, unit, country, starts_at, local_date, local_time,
    duration_min, busy, mode, address, notes, price, fee, total, policy, created_at)
  values (me, p_provider, p_service, s.name, s.unit, p.country, ts, p_date, p_time, s.duration_min,
    tstzrange(ts, ts + make_interval(mins => least(s.duration_min, 240))),
    p_mode, case when p_mode = 'online' then null else p_address end, left(trim(coalesce(p_notes, '')), 1000),
    s.price, fee, s.price + fee, pol, dr.now())
  returning * into o;
  perform dr.log(o.id, 'created');
  return o;
exception when exclusion_violation then
  perform dr.fail('That time slot is no longer available');
end $$;

-- After payment: instant bookings confirm; request-to-book waits for the provider (payment held).
create function dr.after_payment(p_order uuid, p_method text, p_ref text) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'to_pay' then perform dr.fail('Order is not awaiting payment'); end if;
  if o.quote_id is not null or o.policy ->> 'mode' = 'instant' then
    update public.orders set status = 'upcoming', paid_at = dr.now(), pay_method = p_method, psp_ref = p_ref
    where id = o.id returning * into o;
    perform dr.log(o.id, 'paid');
    perform dr.log(o.id, 'confirmed');
  else
    update public.orders set status = 'requested', paid_at = dr.now(), pay_method = p_method, psp_ref = p_ref,
      request_expires_at = least(dr.now() + make_interval(hours => dr.pint(o.policy, 'approvalHours')), o.starts_at - interval '30 minutes')
    where id = o.id returning * into o;
    perform dr.log(o.id, 'paid');
  end if;
  return o;
end $$;

-- Demo-only payment. Production: set app_config.demo_payments=false and call confirm_payment from the PSP webhook.
create function public.pay_order(p_order uuid, p_method text) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  if not coalesce((select (value)::text::boolean from public.app_config where key = 'demo_payments'), false) then
    perform dr.fail('Payments must be completed with the payment provider');
  end if;
  o := dr.order_for_update(p_order);
  if o.customer_id <> auth.uid() then perform dr.fail('Booking not found'); end if;
  if o.created_at < dr.now() - make_interval(mins => (select (value)::text::int from public.app_config where key = 'pay_window_minutes')) then
    perform dr.fail('Payment window expired');
  end if;
  return dr.after_payment(p_order, left(coalesce(p_method, 'demo'), 40), null);
end $$;

-- Called by the payment webhook (Edge Function with the service-role key) once funds are captured.
create function public.confirm_payment(p_order uuid, p_method text, p_psp_ref text) returns public.orders
language sql security definer set search_path = public, pg_temp as $$
  select dr.after_payment(p_order, p_method, p_psp_ref)
$$;

-- ------------------------------------------------------------------ provider: requests
create function public.accept_booking(p_order uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.provider_id <> auth.uid() or o.status <> 'requested' then perform dr.fail('Nothing to accept'); end if;
  update public.orders set status = 'upcoming', accepted_at = dr.now() where id = o.id returning * into o;
  perform dr.log(o.id, 'accepted');
  return o;
end $$;

create function public.decline_booking(p_order uuid, p_reason text default 'Declined by provider') returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.provider_id <> auth.uid() or o.status not in ('requested', 'upcoming') then perform dr.fail('Cannot decline this booking'); end if;
  update public.orders set status = 'cancelled', cancelled_at = dr.now(), cancelled_by = 'provider',
    cancel_reason = left(coalesce(nullif(p_reason, ''), 'Declined by provider'), 200),
    refund = case when paid_at is not null then total else 0 end
  where id = o.id returning * into o;
  perform dr.log(o.id, 'cancelled', '{"by": "provider"}');
  return o;
end $$;

-- ------------------------------------------------------------------ cancellation
create function public.cancel_terms(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  hrs numeric;
  free_h int;
  fee numeric;
begin
  select * into o from public.orders where id = p_order and auth.uid() in (customer_id, provider_id);
  if not found then perform dr.fail('Booking not found'); end if;
  if o.status in ('to_pay', 'requested') then
    return jsonb_build_object('free', true, 'fee', 0, 'refund', case when o.paid_at is not null then o.total else 0 end);
  end if;
  free_h := dr.pint(o.policy, 'freeCancelHours');
  hrs := extract(epoch from (o.starts_at - dr.now())) / 3600;
  if hrs >= free_h then return jsonb_build_object('free', true, 'fee', 0, 'refund', o.total, 'hours', free_h); end if;
  fee := round(o.total / 2);
  return jsonb_build_object('free', false, 'fee', fee, 'refund', o.total - fee, 'hours', free_h);
end $$;

create function public.cancel_booking(p_order uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  by_customer boolean;
  terms jsonb;
begin
  o := dr.order_for_update(p_order);
  if o.status not in ('to_pay', 'requested', 'upcoming') then perform dr.fail('This booking can no longer be cancelled'); end if;
  by_customer := o.customer_id = auth.uid();
  terms := public.cancel_terms(p_order);
  update public.orders set status = 'cancelled', cancelled_at = dr.now(),
    cancelled_by = case when by_customer then 'customer' else 'provider' end,
    cancel_reason = case when by_customer then 'Cancelled by customer' else 'Cancelled by provider' end,
    refund = case when paid_at is null then 0 when by_customer then (terms ->> 'refund')::numeric else total end
  where id = o.id returning * into o;
  perform dr.log(o.id, 'cancelled', jsonb_build_object('by', o.cancelled_by));
  return o;
end $$;

-- ------------------------------------------------------------------ rescheduling
-- Customer move, allowed until the provider's lock period; request-to-book providers must approve.
create function public.request_reschedule(p_order uuid, p_date date, p_time time) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  hrs numeric;
begin
  o := dr.order_for_update(p_order);
  if o.customer_id <> auth.uid() or o.status not in ('upcoming', 'requested') then
    perform dr.fail('Only upcoming bookings can be rescheduled');
  end if;
  if o.reschedule_request is not null then perform dr.fail('A reschedule request is already waiting for the provider'); end if;
  if o.reschedules >= dr.pint(o.policy, 'maxReschedules') then
    perform dr.fail(format('Reschedule limit reached (%s per booking)', dr.pint(o.policy, 'maxReschedules')));
  end if;
  hrs := extract(epoch from (o.starts_at - dr.now())) / 3600;
  if hrs < dr.pint(o.policy, 'rescheduleLockHours') then
    -- same wording as the app (hoursLabel): "24 hrs", "2 days"
    perform dr.fail(format('Locked — changes close %s before the appointment',
      case when dr.pint(o.policy, 'rescheduleLockHours') >= 24 and dr.pint(o.policy, 'rescheduleLockHours') % 24 = 0
           then (dr.pint(o.policy, 'rescheduleLockHours') / 24) || ' day' || case when dr.pint(o.policy, 'rescheduleLockHours') > 24 then 's' else '' end
           else dr.pint(o.policy, 'rescheduleLockHours') || ' hr' || case when dr.pint(o.policy, 'rescheduleLockHours') = 1 then '' else 's' end end));
  end if;
  if dr.slot_problem(o.provider_id, p_date, p_time, o.duration_min, o.id) is not null then
    perform dr.fail('That time slot is not available');
  end if;
  if o.policy ->> 'mode' = 'request' and o.status = 'upcoming' then
    update public.orders set reschedule_request = jsonb_build_object('date', p_date, 'time', to_char(p_time, 'HH24:MI'), 'ts', dr.now())
    where id = o.id returning * into o;
    perform dr.log(o.id, 'reschedule_requested', jsonb_build_object('to', p_date || ' ' || to_char(p_time, 'HH24:MI')));
    return o;
  end if;
  return dr.move(o, p_date, p_time, 'customer');
end $$;

create function public.respond_reschedule(p_order uuid, p_accept boolean) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  d date;
  t time;
begin
  o := dr.order_for_update(p_order);
  if o.provider_id <> auth.uid() or o.reschedule_request is null then perform dr.fail('No reschedule request'); end if;
  if not p_accept then
    update public.orders set reschedule_request = null where id = o.id returning * into o;
    perform dr.log(o.id, 'reschedule_declined');
    return o;
  end if;
  d := (o.reschedule_request ->> 'date')::date;
  t := (o.reschedule_request ->> 'time')::time;
  if dr.slot_problem(o.provider_id, d, t, o.duration_min, o.id, true) is not null then
    perform dr.fail('Requested slot is no longer free');
  end if;
  return dr.move(o, d, t, 'customer');
end $$;

-- Provider-initiated change; the customer must agree. Providers may propose into their own blocked slots.
create function public.propose_time(p_order uuid, p_date date, p_time time, p_note text default '') returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.provider_id <> auth.uid() or o.status not in ('upcoming', 'requested') then
    perform dr.fail('Only upcoming bookings can be moved');
  end if;
  if dr.slot_problem(o.provider_id, p_date, p_time, o.duration_min, o.id, true, true) is not null then
    perform dr.fail('That slot is not free in your schedule');
  end if;
  update public.orders set proposal = jsonb_build_object('date', p_date, 'time', to_char(p_time, 'HH24:MI'),
    'note', left(coalesce(p_note, ''), 300), 'ts', dr.now())
  where id = o.id returning * into o;
  perform dr.log(o.id, 'proposal', jsonb_build_object('to', p_date || ' ' || to_char(p_time, 'HH24:MI')));
  return o;
end $$;

create function public.respond_proposal(p_order uuid, p_accept boolean) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.customer_id <> auth.uid() or o.proposal is null then perform dr.fail('No proposal'); end if;
  if not p_accept then
    update public.orders set proposal = null where id = o.id returning * into o;
    perform dr.log(o.id, 'proposal_declined');
    return o;
  end if;
  if dr.slot_problem(o.provider_id, (o.proposal ->> 'date')::date, (o.proposal ->> 'time')::time, o.duration_min, o.id, true, true) is not null then
    perform dr.fail('That time slot is not available');
  end if;
  return dr.move(o, (o.proposal ->> 'date')::date, (o.proposal ->> 'time')::time, 'provider');
end $$;

-- ------------------------------------------------------------------ completion
create function public.mark_done(p_order uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.provider_id <> auth.uid() or o.status <> 'upcoming' then perform dr.fail('Only upcoming jobs can be marked done'); end if;
  if o.starts_at > dr.now() then perform dr.fail('The job has not started yet'); end if;
  update public.orders set status = 'to_confirm', done_at = dr.now() where id = o.id returning * into o;
  perform dr.log(o.id, 'to_confirm');
  return o;
end $$;

create function public.confirm_done(p_order uuid) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  o := dr.order_for_update(p_order);
  if o.customer_id <> auth.uid() or o.status <> 'to_confirm' then perform dr.fail('Nothing to confirm'); end if;
  update public.orders set status = 'to_review', confirmed_at = dr.now() where id = o.id returning * into o;
  perform dr.log(o.id, 'to_review');
  return o;
end $$;

-- ------------------------------------------------------------------ expiry (pg_cron every minute; also safe for clients to call)
create function public.expire_orders() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k int;
begin
  with x as (
    update public.orders set status = 'cancelled', cancelled_at = dr.now(), cancelled_by = 'system', cancel_reason = 'Payment window expired'
    where status = 'to_pay'
      and created_at < dr.now() - make_interval(mins => (select (value)::text::int from public.app_config where key = 'pay_window_minutes'))
    returning id
  ) select count(*) into k from x;
  n := n + k;
  with x as (
    update public.orders set status = 'cancelled', cancelled_at = dr.now(), cancelled_by = 'system',
      cancel_reason = 'Provider did not respond in time — fully refunded', refund = total
    where status = 'requested' and request_expires_at < dr.now()
    returning id
  ) select count(*) into k from x;
  return n + k;
end $$;

-- ------------------------------------------------------------------ read helpers for the app
-- Busy intervals of a provider (no customer details), so the app can show which slots are taken.
create function public.provider_busy(p_provider uuid, p_from date, p_to date)
returns table (local_date date, local_time time, duration_min int)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.local_date, o.local_time, o.duration_min
  from public.orders o
  where o.provider_id = p_provider and o.status <> 'cancelled' and o.local_date between p_from and least(p_to, p_from + 62)
$$;

create function public.slot_status(p_provider uuid, p_service text, p_date date, p_time time) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select dr.slot_problem(p_provider, p_date, p_time,
    (select duration_min from public.provider_services where provider_id = p_provider and service_id = p_service))
$$;
