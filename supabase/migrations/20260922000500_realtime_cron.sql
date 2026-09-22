-- Done Right: realtime change feeds and scheduled jobs.

-- Clients subscribe to their own orders (Realtime applies the RLS policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_events, public.verification_items;
  end if;
end $$;

-- Expire unpaid orders / unanswered requests every minute and lapse documents nightly.
-- pg_cron is available on Supabase (enable it under Database > Extensions); skipped where it is missing.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('dr-expire-orders', '* * * * *', 'select public.expire_orders()');
    perform cron.schedule('dr-expire-documents', '15 16 * * *', 'select public.expire_documents()');  -- 00:15 SGT
  end if;
end $$;
