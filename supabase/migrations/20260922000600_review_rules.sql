-- Done Right: separation of duties — nobody can approve (or reject) their own documents.
create or replace function public.review_item(p_item uuid, p_status public.verification_status, p_reason text default null)
returns public.verification_items language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.verification_items;
begin
  if not dr.is_staff() then perform dr.fail('Not allowed'); end if;
  if p_status not in ('verified', 'rejected') then perform dr.fail('Choose verified or rejected'); end if;
  if p_status = 'rejected' and coalesce(p_reason, '') = '' then perform dr.fail('A reject reason is required'); end if;
  if (select user_id from public.verification_items where id = p_item) = auth.uid() then
    perform dr.fail('You cannot review your own documents');
  end if;
  update public.verification_items set status = p_status, reason = case when p_status = 'rejected' then p_reason end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_item returning * into v;
  if not found then perform dr.fail('Item not found'); end if;
  insert into public.audit_log (actor, subject_user, item, action, reason)
  values (auth.uid(), v.user_id, v.kind || coalesce(' · ' || (v.data ->> 'name'), ''), p_status::text, p_reason);
  return v;
end $$;
revoke execute on function public.review_item(uuid, public.verification_status, text) from public, anon;
grant execute on function public.review_item(uuid, public.verification_status, text) to authenticated;
