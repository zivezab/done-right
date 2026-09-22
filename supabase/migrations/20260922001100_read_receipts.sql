-- Done Right: read receipts for both people in a conversation.
-- Each member can see when the other last read the conversation (and nobody else can); changes go out on
-- Realtime so "Read" appears without a reload. A read time only ever moves forward.

drop policy if exists own_read on public.chat_reads;
create policy members_read on public.chat_reads for select using (
  exists (select 1 from public.chat_threads t where t.id = thread_id and auth.uid() in (t.member_a, t.member_b)));

create or replace function public.mark_read(p_thread uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.chat_threads where id = p_thread and auth.uid() in (member_a, member_b)) then
    perform dr.fail('Conversation not found');
  end if;
  insert into public.chat_reads (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;
