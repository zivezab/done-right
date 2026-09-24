-- Done Right: public profile links (LinkedIn, TikTok, YouTube, X, Instagram, Facebook, Xiaohongshu, GitHub, website).
-- Same rules as js/links.js: https only, each platform's own domain, no chat apps or phone links
-- (bookings and payments stay on Done Right), at most one link per platform.

alter table public.providers add column links jsonb not null default '{}';

create function dr.link_host(url text) returns text language sql immutable as $$
  select regexp_replace(lower(substring(url from '^https://([^/:?#@]+)')), '^www\.', '')
$$;

create function dr.link_problem(p_key text, p_url text) returns text language sql immutable as $$
  select case
    when p_key not in ('linkedin', 'tiktok', 'youtube', 'instagram', 'x', 'facebook', 'xiaohongshu', 'github', 'website') then 'Unknown link type'
    when p_url is null or length(p_url) > 300 or p_url !~ '^https://[^/\s:@?#]+\.[a-z]{2,}(/\S*)?$' then 'Links must be https:// addresses'
    when dr.link_host(p_url) ~ '(^|\.)(wa\.me|whatsapp\.com|whatsapp\.net|t\.me|telegram\.me|telegram\.org|line\.me|signal\.me|weixin\.qq\.com|wechat\.com)$'
      then 'Chat apps and phone links are not allowed — keep messages on Done Right'
    when p_key <> 'website' and dr.link_host(p_url) !~ case p_key
        when 'linkedin' then '(^|\.)linkedin\.com$'
        when 'tiktok' then '(^|\.)tiktok\.com$'
        when 'youtube' then '(^|\.)(youtube\.com|youtu\.be)$'
        when 'instagram' then '(^|\.)instagram\.com$'
        when 'x' then '(^|\.)(x\.com|twitter\.com)$'
        when 'facebook' then '(^|\.)(facebook\.com|fb\.com)$'
        when 'xiaohongshu' then '(^|\.)(xiaohongshu\.com|xhslink\.com)$'
        when 'github' then '(^|\.)github\.com$'
      end then 'That link is not on the right site'
  end
$$;

create function dr.check_links() returns trigger language plpgsql as $$
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
create trigger providers_links before insert or update of links on public.providers
  for each row execute function dr.check_links();
