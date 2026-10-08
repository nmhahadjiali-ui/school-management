-- =============================================================================
-- Preparing for many schools at once:
--   1. Data retention: old notifications, delivery logs and rejected webhook
--      events are purged daily (they grow fastest; nothing financial or
--      academic is touched).
--   2. Rate limiting: a shared counter the server uses to throttle anonymous
--      actions (e.g. registration / school-code checks) per client.
--      `school_code_is_valid` is no longer callable directly through the
--      public API, so codes cannot be brute-forced around the app.
--   3. One fewer database round trip per page: get_my_context() now also
--      returns the caller's finance level and the school's currency.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Retention
-- ---------------------------------------------------------------------------
-- Policy (also in docs/SECURITY.md):
--   notifications            read, dismissed or expired: 180 days; any: 365 days
--                            (their delivery rows cascade)
--   notification_deliveries  sent / delivered / failed / cancelled: 90 days (they contain
--                            destinations: emails and phone numbers)
--   payment_webhook_events   rejected / ignored: 90 days (processed and failed
--                            events are kept as financial evidence)
--   rate limit counters      1 day
-- Deletes run in batches so a large purge never holds long locks.
create function private.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch constant integer := 5000;
  v_n integer;
  v_notifications integer := 0;
  v_deliveries integer := 0;
  v_webhooks integer := 0;
  v_limits integer;
begin
  loop
    delete from public.notifications where id in (
      select id from public.notifications
      where (created_at < now() - interval '365 days')
         or (created_at < now() - interval '180 days'
             and (read_at is not null or dismissed_at is not null or (expires_at is not null and expires_at < now())))
      limit v_batch);
    get diagnostics v_n = row_count;
    v_notifications := v_notifications + v_n;
    exit when v_n < v_batch;
  end loop;

  loop
    delete from public.notification_deliveries where id in (
      select id from public.notification_deliveries
      where status in ('sent', 'delivered', 'failed', 'cancelled') and created_at < now() - interval '90 days'
      limit v_batch);
    get diagnostics v_n = row_count;
    v_deliveries := v_deliveries + v_n;
    exit when v_n < v_batch;
  end loop;

  delete from public.payment_webhook_events
   where status in ('rejected', 'ignored') and received_at < now() - interval '90 days';
  get diagnostics v_webhooks = row_count;

  delete from private.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_limits = row_count;

  return jsonb_build_object('notifications', v_notifications, 'deliveries', v_deliveries,
                            'webhook_events', v_webhooks, 'rate_limit_rows', v_limits);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting (fixed window counter, shared by every app server)
-- ---------------------------------------------------------------------------
create table private.rate_limit_hits (
  bucket       text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

-- Records one hit and returns true while the bucket is within its limit.
-- Buckets are built by the server, e.g. 'register:<sha256 of client IP>'.
create function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_bucket is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit' using errcode = '22023';
  end if;
  insert into private.rate_limit_hits as r (bucket, window_start, hits) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
revoke all on function private.purge_expired_data() from public, anon, authenticated;

-- Manual / test trigger for the purge (server key only).
create function public.run_data_retention()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.purge_expired_data() $$;
revoke all on function public.run_data_retention() from public, anon, authenticated;
grant execute on function public.run_data_retention() to service_role;

-- The registration form checks codes on the server (rate limited); the raw
-- API no longer answers "does this code exist?" to anyone.
revoke execute on function public.school_code_is_valid(text) from anon, authenticated;
grant execute on function public.school_code_is_valid(text) to service_role;

-- Daily at 03:15 Manila time (19:15 UTC).
select cron.schedule('purge-expired-data', '15 19 * * *', $$select private.purge_expired_data()$$);

-- ---------------------------------------------------------------------------
-- 3. Context: + finance level and currency (saves a query on every page)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', to_jsonb(p) - 'user_id',
    'school', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.code, 'logo_url', s.logo_url,
      'timezone', s.timezone, 'status', s.status
    ) end,
    'settings', case when st.id is null then null else jsonb_build_object(
      'primary_color', st.primary_color,
      'currency', st.currency
    ) end,
    'current_academic_year', (
      select jsonb_build_object('id', y.id, 'name', y.name, 'start_date', y.start_date, 'end_date', y.end_date)
      from public.academic_years y where y.school_id = s.id and y.is_current
    ),
    'record', coalesce(
      (select jsonb_build_object('type', 'teacher', 'id', t.id) from public.teachers t where t.user_id = p.user_id),
      (select jsonb_build_object('type', 'student', 'id', x.id) from public.students x where x.user_id = p.user_id),
      (select jsonb_build_object('type', 'guardian', 'id', g.id) from public.guardians g where g.user_id = p.user_id)
    ),
    'access_active', p.status = 'active' and (p.role = 'super_admin' or s.status = 'active'),
    'features', coalesce((
      select jsonb_agg(f.feature_key order by f.feature_key)
      from public.school_features f
      where f.school_id = s.id and f.enabled
        and p.status = 'active' and s.status = 'active'
    ), '[]'::jsonb),
    'finance_level', case when p.status = 'active' and s.status = 'active'
                          then private.finance_level(s.id) else 'none' end
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join public.school_settings st on st.school_id = s.id
  where p.user_id = (select auth.uid())
$$;
