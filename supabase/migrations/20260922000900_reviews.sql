-- Done Right: reviews and provider replies on the server.
-- Only the customer of a completed (confirmed) booking can review it, once. Only the provider can reply.
-- Everyone reads reviews through public_reviews, which never exposes who the customer is.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  provider_id uuid not null references public.providers (user_id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  service_id text not null references public.service_types (id),
  service_name text not null,
  stars int not null check (stars between 1 and 5),
  text text not null check (length(text) between 1 and 600),
  tags text[] not null default '{}' check (coalesce(array_length(tags, 1), 0) <= 8),
  anonymous boolean not null default false,
  area text,
  -- [{"path": "<customer>/<order>/<file>.jpg"}] in the public review-photos bucket
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  reply text check (reply is null or length(reply) between 2 and 500),
  reply_at timestamptz,
  hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.reviews (provider_id, created_at desc);
create trigger reviews_touch before update on public.reviews for each row execute function dr.touch();

alter table public.reviews enable row level security;
-- staff read everything (moderation); everyone else reads through the view below
create policy staff_read on public.reviews for select using (dr.is_staff());
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;

-- Public face of reviews: reviewer shown by name unless anonymous; customer ids never leave the table.
create view public.public_reviews as
  select r.id, r.provider_id, r.service_id, r.service_name, r.stars, r.text, r.tags, r.area, r.photos,
         r.reply, r.reply_at, r.created_at,
         case when r.anonymous then 'Anonymous user' else coalesce(nullif(p.name, ''), 'Done Right user') end as reviewer_name,
         r.anonymous,
         coalesce(r.customer_id = auth.uid(), false) as mine,
         (select count(*) from public.orders o
           where o.customer_id = r.customer_id and o.provider_id = r.provider_id and o.status <> 'cancelled') > 1 as repeat_customer
  from public.reviews r
  join public.profiles p on p.id = r.customer_id
  join public.providers pr on pr.user_id = r.provider_id and pr.status = 'live'
  where not r.hidden;
grant select on public.public_reviews to anon, authenticated;

create view public.provider_ratings as
  select provider_id, count(*)::int as reviews, round(avg(stars)::numeric, 2) as average,
         round(100.0 * count(*) filter (where stars >= 4) / count(*))::int as positive_pct
  from public.reviews where not hidden group by provider_id;
grant select on public.provider_ratings to anon, authenticated;

-- ------------------------------------------------------------------ writes
create function public.submit_review(
  p_order uuid, p_stars int, p_text text, p_tags text[] default '{}', p_anonymous boolean default false, p_photos text[] default '{}'
) returns public.reviews language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  r public.reviews;
  path text;
begin
  select * into o from public.orders where id = p_order and customer_id = auth.uid() for update;
  if not found then perform dr.fail('Booking not found'); end if;
  if exists (select 1 from public.reviews where order_id = p_order) then perform dr.fail('You have already reviewed this booking'); end if;
  if o.status <> 'to_review' then perform dr.fail('You can review a booking once the job is confirmed complete'); end if;
  if p_stars not between 1 and 5 then perform dr.fail('Choose 1 to 5 stars'); end if;
  if length(trim(coalesce(p_text, ''))) = 0 then perform dr.fail('Write a few words about the service'); end if;
  if coalesce(array_length(p_photos, 1), 0) > 4 then perform dr.fail('Up to 4 photos'); end if;
  foreach path in array coalesce(p_photos, '{}') loop
    if path not like auth.uid()::text || '/' || p_order::text || '/%' then perform dr.fail('Invalid photo'); end if;
  end loop;
  insert into public.reviews (order_id, provider_id, customer_id, service_id, service_name, stars, text, tags, anonymous, area, photos)
  values (o.id, o.provider_id, o.customer_id, o.service_id, o.service_name, p_stars, left(trim(p_text), 600),
          coalesce(p_tags[1:8], '{}'), coalesce(p_anonymous, false), o.address ->> 'area',
          coalesce((select jsonb_agg(jsonb_build_object('path', x)) from unnest(p_photos) x), '[]'))
  returning * into r;
  update public.orders set status = 'completed' where id = o.id;
  perform dr.log(o.id, 'completed', jsonb_build_object('review', r.id));
  return r;
end $$;

-- Provider's public reply; an empty text removes it.
create function public.reply_to_review(p_review uuid, p_text text) returns public.reviews
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_review and provider_id = auth.uid() for update;
  if not found then perform dr.fail('Review not found'); end if;
  if length(trim(coalesce(p_text, ''))) = 0 then
    update public.reviews set reply = null, reply_at = null where id = r.id returning * into r;
  elsif length(trim(p_text)) < 2 then
    perform dr.fail('Write a reply first');
  else
    update public.reviews set reply = left(trim(p_text), 500), reply_at = now() where id = r.id returning * into r;
  end if;
  return r;
end $$;

-- Trust & Safety: hide (or restore) a review that breaks the guidelines.
create function public.moderate_review(p_review uuid, p_hidden boolean, p_reason text default null) returns public.reviews
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reviews;
begin
  if not dr.is_staff() then perform dr.fail('Not allowed'); end if;
  if p_hidden and coalesce(p_reason, '') = '' then perform dr.fail('A reason is required'); end if;
  update public.reviews set hidden = p_hidden, hidden_reason = case when p_hidden then p_reason end
  where id = p_review returning * into r;
  if not found then perform dr.fail('Review not found'); end if;
  insert into public.audit_log (actor, subject_user, item, action, reason)
  values (auth.uid(), r.provider_id, 'Review · ' || r.service_name, case when p_hidden then 'review hidden' else 'review restored' end, p_reason);
  return r;
end $$;

revoke execute on function public.submit_review(uuid, int, text, text[], boolean, text[]),
  public.reply_to_review(uuid, text), public.moderate_review(uuid, boolean, text) from public, anon;
grant execute on function public.submit_review(uuid, int, text, text[], boolean, text[]),
  public.reply_to_review(uuid, text), public.moderate_review(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------ review photos (public: reviews are public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "review photos: customers upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "review photos: customers can delete their uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- providers learn about new reviews through their orders (status → completed), which are already on realtime
