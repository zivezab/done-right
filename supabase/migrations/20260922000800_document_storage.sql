-- Done Right: verification document files in Supabase Storage.
-- Private bucket; files live at <user id>/<verification item id>/<file id>.<ext>.
-- Owners upload to and delete from their own folder; owners and reviewers can read; nobody else can.
-- Reviewers open files through short-lived signed URLs, and each viewing is written to the audit log.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "verification: owners upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "verification: owners and reviewers can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or dr.is_staff()));

create policy "verification: owners can delete their files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);

-- Reviewer opened a document's files (called by the Trust & Safety console before showing them).
create function public.log_document_view(p_item uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not dr.is_staff() then perform dr.fail('Not allowed'); end if;
  insert into public.audit_log (actor, subject_user, item, action)
  select auth.uid(), v.user_id, v.kind || coalesce(' · ' || (v.data ->> 'name'), ''), 'viewed documents'
  from public.verification_items v where v.id = p_item;
  if not found then perform dr.fail('Item not found'); end if;
end $$;
revoke execute on function public.log_document_view(uuid) from public, anon;
grant execute on function public.log_document_view(uuid) to authenticated;
