-- =============================================================================
-- Call the delivery worker (POST /api/jobs/communication) every minute from
-- the database scheduler (pg_cron + pg_net), so email / SMS / push deliveries
-- go out on any hosting plan (Vercel Hobby cron runs only once a day).
--
-- The app URL and the worker secret live in Supabase Vault (encrypted), set
-- once per environment — never in migrations or git:
--   select vault.create_secret('https://<your-domain>', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Without both secrets the job does nothing (e.g. local development).
-- =============================================================================
create extension if not exists pg_net with schema extensions;

create function private.trigger_delivery_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/jobs/communication',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke all on function private.trigger_delivery_worker() from public, anon, authenticated;

select cron.schedule('delivery-worker', '* * * * *', $$select private.trigger_delivery_worker()$$);
