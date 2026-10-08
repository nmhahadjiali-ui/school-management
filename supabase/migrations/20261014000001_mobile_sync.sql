-- =============================================================================
-- Phase 6: mobile (offline-first) synchronization support.
--
-- The Flutter app is another client of the SAME backend: it reads through
-- RLS like the web app and writes through the same functions. This migration
-- adds what offline work needs on top of them:
--
--   client_operations   one row per operation the device performed offline,
--                       keyed by an id generated ON THE DEVICE. Replaying the
--                       same operation (lost response, retry, app restart)
--                       returns the stored result instead of writing again.
--   sync_attendance()   offline attendance: detects records changed on the
--                       server since the device last saw them (conflicts are
--                       reported, never silently overwritten) and saves the
--                       rest through public.save_attendance — the same
--                       function, RLS rules and audit trail the web uses.
-- =============================================================================

create table public.client_operations (
  id          uuid primary key,                      -- generated on the device
  user_id     uuid not null references auth.users (id) on delete cascade,
  school_id   uuid not null references public.schools (id) on delete restrict,
  kind        text not null check (kind in ('attendance')),
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index client_operations_user_idx on public.client_operations (user_id, created_at desc);

alter table public.client_operations enable row level security;
revoke all on public.client_operations from anon, authenticated;
grant select on public.client_operations to authenticated;
create policy client_operations_select on public.client_operations for select to authenticated
  using (user_id = (select auth.uid()));
-- Written only by sync functions (below); never directly through the API.

-- Stored result of an operation, if this user already performed it.
create function private.client_op_result(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v public.client_operations;
begin
  select * into v from public.client_operations where id = p_id;
  if v.id is null then
    return null;
  end if;
  if v.user_id is distinct from (select auth.uid()) then
    raise exception 'Invalid operation id' using errcode = '42501';
  end if;
  return v.result;
end;
$$;

create function private.save_client_op(p_id uuid, p_kind text, p_school uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.client_operations (id, user_id, school_id, kind, result)
  values (p_id, (select auth.uid()), p_school, p_kind, p_result)
$$;

revoke all on function private.client_op_result(uuid), private.save_client_op(uuid, text, uuid, jsonb) from public, anon;
grant execute on function private.client_op_result(uuid), private.save_client_op(uuid, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Offline attendance sync.
-- p_records: [{ "enrollment_id": uuid, "student_id": uuid, "status": "present|absent|late|excused",
--               "remarks": text|null, "base_updated_at": <server updated_at the device last saw> | null }]
-- Returns { op_id, session_id, applied, conflicts: [...], records: [...current server rows...], duplicate }.
-- SECURITY INVOKER: every read and write runs under the teacher's own RLS.
-- ---------------------------------------------------------------------------
create function public.sync_attendance(
  p_op_id uuid, p_section_id uuid, p_date date, p_records jsonb, p_subject_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type public.attendance_session_type := case when p_subject_id is null then 'daily' else 'subject' end;
  v_existing jsonb;
  v_session uuid;
  v_school uuid;
  v_cur_status text;
  v_cur_remarks text;
  v_cur_updated timestamptz;
  v_apply jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_result jsonb;
  r jsonb;
begin
  if p_op_id is null or p_section_id is null or p_date is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Invalid attendance sync request' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) > 200 then
    raise exception 'Too many records in one sync' using errcode = '22023';
  end if;

  -- Only teachers and school administrators take attendance (RLS re-checks the details).
  if (select private.my_teacher_id()) is null and (select private.admin_school_id()) is null
     and not (select private.is_super_admin()) then
    raise exception 'Only teachers and school administrators can record attendance' using errcode = '42501';
  end if;

  -- Same operation retried concurrently or after a lost response: one execution only.
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text, 0));
  v_existing := private.client_op_result(p_op_id);
  if v_existing is not null then
    return v_existing || jsonb_build_object('duplicate', true);
  end if;

  select school_id into v_school from public.sections where id = p_section_id;
  if v_school is null then
    raise exception 'Section not found' using errcode = 'P0002';
  end if;

  select id into v_session from public.attendance_sessions
  where section_id = p_section_id and attendance_date = p_date and session_type = v_type
    and subject_id is not distinct from p_subject_id;

  for r in select * from jsonb_array_elements(p_records) loop
    if r ->> 'status' not in ('present', 'absent', 'late', 'excused') then
      raise exception 'Invalid attendance status' using errcode = '22023';
    end if;
    v_cur_status := null;
    v_cur_remarks := null;
    v_cur_updated := null;
    if v_session is not null then
      select ar.status::text, ar.remarks, ar.updated_at into v_cur_status, v_cur_remarks, v_cur_updated
      from public.attendance_records ar
      where ar.attendance_session_id = v_session and ar.student_id = (r ->> 'student_id')::uuid;
    end if;
    -- Conflict: the server record changed after the device's copy (or the
    -- device never saw it) AND it now differs from what the device wants.
    if v_cur_updated is not null
       and (r ->> 'base_updated_at' is null or v_cur_updated > (r ->> 'base_updated_at')::timestamptz)
       and (v_cur_status is distinct from r ->> 'status'
            or coalesce(v_cur_remarks, '') is distinct from coalesce(nullif(btrim(r ->> 'remarks'), ''), '')) then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'student_id', r ->> 'student_id', 'local_status', r ->> 'status', 'local_remarks', r ->> 'remarks',
        'server_status', v_cur_status, 'server_remarks', v_cur_remarks, 'server_updated_at', v_cur_updated));
    else
      v_apply := v_apply || jsonb_build_array(jsonb_build_object(
        'enrollment_id', r ->> 'enrollment_id', 'status', r ->> 'status', 'remarks', r ->> 'remarks'));
    end if;
  end loop;

  -- The web's own function: teacher assignment, school, section, enrollment on
  -- that date, locks and the edit window are all enforced there / by RLS.
  if jsonb_array_length(v_apply) > 0 then
    v_session := public.save_attendance(p_section_id, p_date, v_apply, p_subject_id);
  end if;

  v_result := jsonb_build_object(
    'op_id', p_op_id,
    'session_id', v_session,
    'applied', jsonb_array_length(v_apply),
    'conflicts', v_conflicts,
    'records', coalesce((
      select jsonb_agg(jsonb_build_object('student_id', ar.student_id, 'status', ar.status, 'remarks', ar.remarks,
                                          'updated_at', ar.updated_at))
      from public.attendance_records ar where ar.attendance_session_id = v_session), '[]'::jsonb));
  perform private.save_client_op(p_op_id, 'attendance', v_school, v_result);
  return v_result || jsonb_build_object('duplicate', false);
end;
$$;

revoke all on function public.sync_attendance(uuid, uuid, date, jsonb, uuid) from public, anon;
grant execute on function public.sync_attendance(uuid, uuid, date, jsonb, uuid) to authenticated;

-- Operation receipts are only needed for retries: keep them 30 days.
create or replace function private.purge_expired_data()
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
  v_ops integer;
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

  delete from public.client_operations where created_at < now() - interval '30 days';
  get diagnostics v_ops = row_count;

  return jsonb_build_object('notifications', v_notifications, 'deliveries', v_deliveries,
                            'webhook_events', v_webhooks, 'rate_limit_rows', v_limits, 'client_operations', v_ops);
end;
$$;
