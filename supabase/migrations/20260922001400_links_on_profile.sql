-- Done Right: profile links belong to the person, not to their provider listing.
-- (20260922001300 put them on `providers`; this moves them to `profiles` so any account can have them,
-- and customers see a provider's links through public_profiles.)

alter table public.profiles add column links jsonb not null default '{}';

update public.profiles p set links = pr.links
from public.providers pr where pr.user_id = p.id and pr.links <> '{}'::jsonb;

drop trigger if exists providers_links on public.providers;
alter table public.providers drop column links;

create function dr.check_profile_links() returns trigger language plpgsql as $$
declare
  e record;
  problem text;
begin
  if jsonb_typeof(new.links) <> 'object' then raise exception using errcode = 'P0001', message = 'Invalid profile links'; end if;
  for e in select key, value from jsonb_each(new.links) loop
    problem := case when jsonb_typeof(e.value) <> 'string' then 'Invalid profile links' else dr.link_problem(e.key, e.value #>> '{}') end;
    if problem is not null then raise exception using errcode = 'P0001', message = problem; end if;
  end loop;
  return new;
end $$;
create trigger profiles_links before insert or update of links on public.profiles
  for each row execute function dr.check_profile_links();

grant update (links) on public.profiles to authenticated;

-- provider profiles show their links to customers
create or replace view public.public_profiles as
  select p.id, p.name, p.gender, p.country, p.avatar_path,
         case when p.dob is not null then extract(year from age(p.dob))::int end as age,
         p.links   -- appended: replacing a view cannot insert a column in the middle
  from public.profiles p
  where exists (select 1 from public.providers pr where pr.user_id = p.id and pr.status = 'live')
     or p.id = auth.uid()
     or exists (select 1 from public.orders o where (o.customer_id = p.id and o.provider_id = auth.uid())
                                             or (o.provider_id = p.id and o.customer_id = auth.uid()))
     or exists (select 1 from public.chat_threads t where (t.member_a = p.id and t.member_b = auth.uid())
                                                   or (t.member_b = p.id and t.member_a = auth.uid()));
