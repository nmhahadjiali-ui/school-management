-- =============================================================================
-- Phase 3: helpers, integrity/permission triggers, notifications, audit, RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, empty search_path)
-- ---------------------------------------------------------------------------

-- "Today" in the school's own time zone (attendance windows, schedules).
create function private.school_today(target_school uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone s.timezone)::date from public.schools s where s.id = target_school
$$;

-- Is a feature enabled for the caller's school? Evaluated once per statement in policies.
create function private.my_feature(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.school_has_feature(private.my_school_id(), feature), false)
$$;

-- Sections of the calling student's own enrollments, or of a parent's children.
create function private.my_family_section_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.section_id from public.student_enrollments e
  where e.section_id is not null
    and (e.student_id = private.my_student_id()
         or e.student_id in (select private.my_guardian_student_ids()))
$$;

-- The calling teacher teaches `subject` (or any subject, when NULL) in `section`.
create function private.teacher_teaches(p_section uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_subject_assignments a
    where a.teacher_id = private.my_teacher_id()
      and a.section_id = p_section
      and (p_subject is null or a.subject_id = p_subject)
  )
$$;

-- Daily attendance: the section's adviser or any teacher of the section.
-- Subject attendance: the teacher of that subject in the section.
create function private.teacher_can_take_attendance(p_section uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_teacher_id() is not null and (
    private.teacher_teaches(p_section, p_subject)
    or (p_subject is null and exists (
      select 1 from public.sections s where s.id = p_section and s.adviser_teacher_id = private.my_teacher_id()))
  )
$$;

-- Teachers may change attendance while the session is open and within the
-- school's edit window (school_settings.attendance_edit_days).
create function private.attendance_editable(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.status = 'open'
       and (st.attendance_edit_days is null
            or s.attendance_date >= private.school_today(s.school_id) - st.attendance_edit_days)
    from public.attendance_sessions s
    join public.school_settings st on st.school_id = s.school_id
    where s.id = p_session
  ), false)
$$;

create function private.grade_max_score(target_school uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select grade_max_score from public.school_settings where school_id = target_school), 100)
$$;

-- ---------------------------------------------------------------------------
-- Audit log and notifications (written only by these definer helpers)
-- ---------------------------------------------------------------------------
create function private.audit(p_school uuid, p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (school_id, actor_user_id, action, entity, entity_id, metadata)
  values (p_school, (select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

-- In-app notification for each distinct, non-null recipient. No-op when the
-- school's 'notifications' feature is off. Delivery channels (push, email,
-- SMS) will read from this table later; nothing here is channel-specific.
create function private.notify(p_school uuid, p_users uuid[], p_type public.notification_type, p_title text, p_message text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.school_has_feature(p_school, 'notifications') then
    return;
  end if;
  insert into public.notifications (school_id, recipient_user_id, type, title, message, data)
  select distinct p_school, u, p_type, left(p_title, 200), left(p_message, 2000), coalesce(p_data, '{}'::jsonb)
  from unnest(p_users) as u
  where u is not null;
end;
$$;

-- Login accounts to notify about a student: the student and opted-in guardians.
create function private.student_audience(p_student uuid, p_include_student boolean default true)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select s.user_id from public.students s where s.id = p_student and p_include_student and s.user_id is not null
    union
    select g.user_id
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student and sg.can_receive_notifications and g.status = 'active' and g.user_id is not null
  )
$$;

-- ---------------------------------------------------------------------------
-- Grading periods: must lie within the academic year
-- ---------------------------------------------------------------------------
create function private.check_period_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.academic_years y
    where y.id = new.academic_year_id and new.start_date >= y.start_date and new.end_date <= y.end_date
  ) then
    raise exception 'A grading period must fall within its academic year' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger grading_periods_dates before insert or update of start_date, end_date, academic_year_id on public.grading_periods
  for each row execute function private.check_period_dates();

-- ---------------------------------------------------------------------------
-- Schedules: room conflicts (when the school enforces them). Teacher and
-- section conflicts are exclusion constraints on the table itself.
-- ---------------------------------------------------------------------------
-- Stored generated columns (class_schedules.minutes) are not yet computed when
-- BEFORE triggers run, so the time range is derived from NEW explicitly.
create function private.check_room_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict record;
  v_range int4range := int4range(
    (extract(hour from new.start_time) * 60 + extract(minute from new.start_time))::int,
    (extract(hour from new.end_time) * 60 + extract(minute from new.end_time))::int);
begin
  if new.status <> 'active' or new.room is null
     or not coalesce((select enforce_room_conflicts from public.school_settings where school_id = new.school_id), true) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text || lower(new.room), 0));
  select c.start_time, c.end_time, sec.name as section_name into v_conflict
  from public.class_schedules c
  join public.sections sec on sec.id = c.section_id
  where c.school_id = new.school_id
    and c.academic_year_id = new.academic_year_id
    and lower(c.room) = lower(new.room)
    and c.day_of_week = new.day_of_week
    and c.status = 'active'
    and c.id <> new.id
    and c.minutes && v_range
  limit 1;
  if found then
    raise exception 'Room % is already booked % to % (section %)',
      new.room, to_char(v_conflict.start_time, 'HH24:MI'), to_char(v_conflict.end_time, 'HH24:MI'), v_conflict.section_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger class_schedules_room_conflict before insert or update on public.class_schedules
  for each row execute function private.check_room_conflict();

-- ---------------------------------------------------------------------------
-- Attendance sessions
-- ---------------------------------------------------------------------------
create function private.guard_attendance_session()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_api boolean := current_user in ('authenticated', 'anon');
begin
  -- Integrity (everyone): the date lies within the academic year.
  if not exists (
    select 1 from public.academic_years y
    where y.id = new.academic_year_id and new.attendance_date between y.start_date and y.end_date
  ) then
    raise exception 'The attendance date must fall within the academic year' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (new.section_id, new.academic_year_id, new.attendance_date, new.session_type, new.subject_id)
       is distinct from (old.section_id, old.academic_year_id, old.attendance_date, old.session_type, old.subject_id) then
    raise exception 'An attendance session''s section, date and type cannot be changed' using errcode = 'P0001';
  end if;

  if not v_api then
    return new;
  end if;

  if new.attendance_date > private.school_today(new.school_id) then
    raise exception 'Attendance cannot be recorded for a future date' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    if not private.can_manage_school(new.school_id) and new.status <> 'open' then
      raise exception 'Only school administrators can lock attendance' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status then
    if not private.can_manage_school(new.school_id) then
      raise exception 'Only school administrators can lock or unlock attendance' using errcode = '42501';
    end if;
    new.locked_at := case when new.status = 'locked' then now() end;
    new.locked_by := case when new.status = 'locked' then (select auth.uid()) end;
  end if;
  return new;
end;
$$;

create trigger attendance_sessions_guard before insert or update on public.attendance_sessions
  for each row execute function private.guard_attendance_session();

-- ---------------------------------------------------------------------------
-- Attendance records
-- ---------------------------------------------------------------------------
create function private.guard_attendance_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
  v_date date;
begin
  if tg_op = 'UPDATE' and (new.attendance_session_id, new.student_id, new.enrollment_id)
       is distinct from (old.attendance_session_id, old.student_id, old.enrollment_id) then
    raise exception 'An attendance record''s session and student cannot be changed' using errcode = 'P0001';
  end if;

  -- Integrity (everyone): the student was enrolled on that date.
  select s.attendance_date into v_date from public.attendance_sessions s where s.id = new.attendance_session_id;
  if not exists (
    select 1 from public.student_enrollments e
    where e.id = new.enrollment_id and e.enrollment_date <= v_date and (e.exit_date is null or v_date <= e.exit_date)
  ) then
    raise exception 'The student was not enrolled in this section on %', v_date using errcode = 'P0001';
  end if;

  if v_api then
    new.recorded_by := (select auth.uid());
    new.recorded_at := now();
    if not private.can_manage_school(new.school_id) and not private.attendance_editable(new.attendance_session_id) then
      raise exception 'This attendance is locked or outside the editing window. Ask a school administrator.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger attendance_records_guard before insert or update on public.attendance_records
  for each row execute function private.guard_attendance_record();

-- ---------------------------------------------------------------------------
-- Grades: workflow draft -> submitted -> approved -> locked, with history
-- ---------------------------------------------------------------------------
create function private.log_grade_change(p_new public.grade_records, p_old_score numeric, p_old_status public.grade_status, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.grade_change_logs (school_id, grade_record_id, changed_by, old_score, new_score, old_status, new_status, reason)
  values (p_new.school_id, p_new.id, (select auth.uid()), p_old_score, p_new.score, p_old_status, p_new.status, p_reason)
$$;

create function private.guard_grade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
  v_manager boolean;
  v_reason text := nullif(btrim(new.change_reason), '');
  v_period public.grading_period_status;
begin
  if new.score > private.grade_max_score(new.school_id) then
    raise exception 'The score cannot exceed %', private.grade_max_score(new.school_id) using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.enrollment_id, new.student_id, new.subject_id, new.grading_period_id, new.teacher_id, new.section_id, new.academic_year_id)
       is distinct from (old.enrollment_id, old.student_id, old.subject_id, old.grading_period_id, old.teacher_id, old.section_id, old.academic_year_id) then
    raise exception 'A grade''s student, subject, period and teacher cannot be changed' using errcode = 'P0001';
  end if;

  if v_api then
    v_manager := private.can_manage_school(new.school_id);
    if tg_op = 'INSERT' then new.created_by := (select auth.uid()); end if;
    new.updated_by := (select auth.uid());

    if not v_manager then
      -- Teachers: only drafts, only while the grading period is open.
      select status into v_period from public.grading_periods where id = new.grading_period_id;
      if v_period is distinct from 'open' then
        raise exception 'Grades can only be entered while the grading period is open' using errcode = 'P0001';
      end if;
      if tg_op = 'UPDATE' and old.status <> 'draft' then
        raise exception 'This grade has been submitted and can no longer be changed by the teacher' using errcode = 'P0001';
      end if;
      if new.status not in ('draft', 'submitted') then
        raise exception 'Teachers can only save or submit grades' using errcode = '42501';
      end if;
    else
      if tg_op = 'INSERT' and new.status = 'locked' then
        raise exception 'Approve a grade before locking it' using errcode = 'P0001';
      end if;
      if tg_op = 'UPDATE' then
        if old.status = 'locked' then
          if new.status <> 'approved' or new.score <> old.score or new.remarks is distinct from old.remarks then
            raise exception 'Locked grades are final. Unlock the grade first.' using errcode = 'P0001';
          end if;
          if v_reason is null then
            raise exception 'A reason is required to unlock a grade' using errcode = 'P0001';
          end if;
        end if;
        if new.status = 'locked' and old.status <> 'approved' then
          raise exception 'Approve a grade before locking it' using errcode = 'P0001';
        end if;
        if old.status = 'approved' and new.status <> 'locked' and v_reason is null
           and (new.score <> old.score or new.status <> old.status) then
          raise exception 'A reason is required to change an approved grade' using errcode = 'P0001';
        end if;
        if old.status = 'submitted' and new.score <> old.score and v_reason is null then
          raise exception 'A reason is required to change a submitted grade' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  -- Workflow timestamps
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then new.submitted_at := now(); end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status not in ('approved', 'locked')) then
    new.approved_at := now();
    new.approved_by := (select auth.uid());
  end if;
  if new.status = 'locked' and (tg_op = 'INSERT' or old.status <> 'locked') then new.locked_at := now(); end if;
  if new.status = 'draft' then new.submitted_at := null; new.approved_at := null; new.approved_by := null; end if;

  -- History: every creation and every score/status change.
  if tg_op = 'INSERT' then
    perform private.log_grade_change(new, null, null, v_reason);
  elsif new.score is distinct from old.score or new.status is distinct from old.status then
    perform private.log_grade_change(new, old.score, old.status, v_reason);
  end if;
  new.change_reason := null;
  return new;
end;
$$;

create trigger grade_records_guard before insert or update on public.grade_records
  for each row execute function private.guard_grade();

-- History and audit rows are append-only for everyone.
create function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger grade_change_logs_append_only before update or delete on public.grade_change_logs
  for each row execute function private.forbid_change();
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Coursework
-- ---------------------------------------------------------------------------
create function private.guard_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.section_id, new.subject_id, new.teacher_id, new.academic_year_id)
       is distinct from (old.section_id, old.subject_id, old.teacher_id, old.academic_year_id) then
    raise exception 'An assignment''s class, subject and teacher cannot be changed' using errcode = 'P0001';
  end if;
  if new.attachment_path is not null and new.attachment_path not like new.school_id::text || '/assignments/' || new.id::text || '/%' then
    raise exception 'Invalid attachment path' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger assignments_guard before insert or update on public.assignments
  for each row execute function private.guard_assignment();

create function private.guard_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
  v_assignment public.assignments;
  v_is_student boolean;
begin
  if tg_op = 'UPDATE' and (new.assignment_id, new.student_id, new.enrollment_id)
       is distinct from (old.assignment_id, old.student_id, old.enrollment_id) then
    raise exception 'A submission''s assignment and student cannot be changed' using errcode = 'P0001';
  end if;
  if new.file_path is not null
     and new.file_path not like new.school_id::text || '/submissions/' || new.assignment_id::text || '/' || new.student_id::text || '/%' then
    raise exception 'Invalid file path' using errcode = '23514';
  end if;
  if not v_api then
    return new;
  end if;

  select * into v_assignment from public.assignments where id = new.assignment_id;
  v_is_student := new.student_id = private.my_student_id();

  if v_is_student then
    if v_assignment.status is distinct from 'published' then
      raise exception 'This assignment is not open for submissions' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.status = 'reviewed' then
      raise exception 'This submission has already been reviewed' using errcode = 'P0001';
    end if;
    new.submitted_at := now();
    new.status := case when v_assignment.due_at is not null and now() > v_assignment.due_at then 'late' else 'submitted' end;
    new.reviewed_at := null;
    new.reviewed_by := null;
  else
    -- Teachers/admins review; they never alter the student's work.
    if tg_op = 'INSERT' then
      raise exception 'Only the student can submit their work' using errcode = '42501';
    end if;
    if (new.content, new.file_path, new.file_name, new.submitted_at) is distinct from (old.content, old.file_path, old.file_name, old.submitted_at) then
      raise exception 'A student''s submitted work cannot be edited' using errcode = '42501';
    end if;
    if new.status = 'reviewed' and old.status <> 'reviewed' then
      new.reviewed_at := now();
      new.reviewed_by := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger submissions_guard before insert or update on public.assignment_submissions
  for each row execute function private.guard_submission();

-- ---------------------------------------------------------------------------
-- AFTER triggers: audit log + notifications (SECURITY DEFINER helpers)
-- ---------------------------------------------------------------------------
create function private.after_attendance_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.school_id, 'attendance.created', 'attendance_session', new.id,
      jsonb_build_object('section_id', new.section_id, 'date', new.attendance_date, 'type', new.session_type));
  elsif new.status is distinct from old.status then
    perform private.audit(new.school_id, case when new.status = 'locked' then 'attendance.locked' else 'attendance.unlocked' end,
      'attendance_session', new.id, jsonb_build_object('date', new.attendance_date));
  end if;
  return null;
end;
$$;

create trigger attendance_sessions_after after insert or update on public.attendance_sessions
  for each row execute function private.after_attendance_session();

create function private.after_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_date date;
begin
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.remarks is distinct from old.remarks) then
    perform private.audit(new.school_id, 'attendance.modified', 'attendance_record', new.id,
      jsonb_build_object('student_id', new.student_id, 'old_status', old.status, 'new_status', new.status));
  end if;
  if new.status in ('absent', 'late') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select attendance_date into v_date from public.attendance_sessions where id = new.attendance_session_id;
    perform private.notify(new.school_id, private.student_audience(new.student_id, false), 'attendance_recorded',
      (select first_name || ' was marked ' || new.status::text from public.students where id = new.student_id),
      'Attendance for ' || to_char(v_date, 'FMDay, Mon DD') || ': ' || new.status::text || coalesce(' — ' || new.remarks, ''),
      jsonb_build_object('student_id', new.student_id, 'date', v_date, 'status', new.status));
  end if;
  return null;
end;
$$;

create trigger attendance_records_after after insert or update on public.attendance_records
  for each row execute function private.after_attendance_record();

create function private.after_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'grade.created'
    when new.status is distinct from old.status then case new.status
      when 'submitted' then 'grade.submitted'
      when 'approved' then case when old.status = 'locked' then 'grade.unlocked' else 'grade.approved' end
      when 'locked' then 'grade.locked'
      when 'draft' then 'grade.returned' end
    when new.score is distinct from old.score or new.remarks is distinct from old.remarks then 'grade.modified'
  end;
  if v_action is not null then
    perform private.audit(new.school_id, v_action, 'grade_record', new.id, jsonb_build_object(
      'student_id', new.student_id, 'subject_id', new.subject_id, 'grading_period_id', new.grading_period_id,
      'old_score', case when tg_op = 'UPDATE' then old.score end, 'new_score', new.score));
  end if;

  -- Published = approved for the first time.
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status in ('draft', 'submitted')) then
    perform private.notify(new.school_id, private.student_audience(new.student_id), 'grade_published',
      'New grade: ' || (select name from public.subjects where id = new.subject_id),
      (select name from public.grading_periods where id = new.grading_period_id) || ' grade for '
        || (select first_name from public.students where id = new.student_id) || ' is now available.',
      jsonb_build_object('student_id', new.student_id, 'subject_id', new.subject_id, 'grading_period_id', new.grading_period_id));
  end if;
  return null;
end;
$$;

create trigger grade_records_after after insert or update on public.grade_records
  for each row execute function private.after_grade();

create function private.after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_users uuid[];
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.school_id, 'assignment.created', 'assignment', new.id,
      jsonb_build_object('title', new.title, 'section_id', new.section_id, 'subject_id', new.subject_id));
  elsif (new.title, new.description, new.due_at, new.status, new.attachment_path)
        is distinct from (old.title, old.description, old.due_at, old.status, old.attachment_path) then
    perform private.audit(new.school_id, 'assignment.modified', 'assignment', new.id,
      jsonb_build_object('title', new.title, 'old_status', old.status, 'new_status', new.status,
                         'old_due_at', old.due_at, 'new_due_at', new.due_at));
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then
    select array_agg(u) into v_users
    from public.student_enrollments e, unnest(private.student_audience(e.student_id)) as u
    where e.section_id = new.section_id and e.enrollment_status = 'enrolled';
    perform private.notify(new.school_id, coalesce(v_users, '{}'), 'assignment_created',
      'New assignment: ' || new.title,
      (select name from public.subjects where id = new.subject_id)
        || coalesce(' — due ' || to_char(new.due_at at time zone (select timezone from public.schools where id = new.school_id), 'Mon DD, HH24:MI'), ''),
      jsonb_build_object('assignment_id', new.id, 'section_id', new.section_id));
  end if;
  return null;
end;
$$;

create trigger assignments_after after insert or update on public.assignments
  for each row execute function private.after_assignment();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS and the triggers above apply to every row)
-- ---------------------------------------------------------------------------

-- Save a whole attendance sheet in one transaction. Creates the session if
-- needed; upserts one record per enrollment; unchanged rows are not touched.
-- p_records: [{"enrollment_id": uuid, "status": "present|absent|late|excused", "remarks": text}]
create function public.save_attendance(p_section_id uuid, p_date date, p_records jsonb, p_subject_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_section public.sections;
  v_type public.attendance_session_type := case when p_subject_id is null then 'daily' else 'subject' end;
  v_session uuid;
  v_enrollment public.student_enrollments;
  r jsonb;
begin
  select * into v_section from public.sections where id = p_section_id;
  if v_section.id is null then
    raise exception 'Section not found' using errcode = 'P0002';
  end if;

  select id into v_session from public.attendance_sessions
  where section_id = p_section_id and attendance_date = p_date and session_type = v_type
    and subject_id is not distinct from p_subject_id;
  if v_session is null then
    insert into public.attendance_sessions (school_id, academic_year_id, section_id, subject_id, teacher_id, attendance_date, session_type)
    values (v_section.school_id, v_section.academic_year_id, p_section_id, p_subject_id, private.my_teacher_id(), p_date, v_type)
    returning id into v_session;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    select * into v_enrollment from public.student_enrollments where id = (r ->> 'enrollment_id')::uuid;
    if v_enrollment.id is null then
      raise exception 'Enrollment not found' using errcode = 'P0002';
    end if;
    insert into public.attendance_records
      (school_id, academic_year_id, section_id, attendance_session_id, student_id, enrollment_id, status, remarks)
    values
      (v_section.school_id, v_section.academic_year_id, p_section_id, v_session, v_enrollment.student_id, v_enrollment.id,
       (r ->> 'status')::public.attendance_status, nullif(btrim(r ->> 'remarks'), ''))
    on conflict (attendance_session_id, student_id) do update
      set status = excluded.status, remarks = excluded.remarks
      where public.attendance_records.status is distinct from excluded.status
         or public.attendance_records.remarks is distinct from excluded.remarks;
  end loop;
  return v_session;
end;
$$;

-- Teacher grade entry for one section × subject × period, in one transaction.
-- Creates or updates DRAFT grades; optionally submits them. Grades already
-- submitted/approved/locked are skipped (never silently overwritten).
-- p_entries: [{"enrollment_id": uuid, "score": number, "remarks": text}]
create function public.save_grades(p_period_id uuid, p_section_id uuid, p_subject_id uuid, p_entries jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_teacher uuid := private.my_teacher_id();
  v_period public.grading_periods;
  v_enrollment public.student_enrollments;
  v_existing public.grade_records;
  v_status public.grade_status := case when p_submit then 'submitted' else 'draft' end;
  v_saved int := 0;
  v_skipped int := 0;
  r jsonb;
begin
  if v_teacher is null then
    raise exception 'Only teachers enter grades' using errcode = '42501';
  end if;
  select * into v_period from public.grading_periods where id = p_period_id;
  if v_period.id is null then
    raise exception 'Grading period not found' using errcode = 'P0002';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    continue when nullif(r ->> 'score', '') is null;
    select * into v_enrollment from public.student_enrollments where id = (r ->> 'enrollment_id')::uuid;
    if v_enrollment.id is null then
      raise exception 'Enrollment not found' using errcode = 'P0002';
    end if;
    select * into v_existing from public.grade_records
    where enrollment_id = v_enrollment.id and subject_id = p_subject_id and grading_period_id = p_period_id;

    if v_existing.id is null then
      insert into public.grade_records (school_id, academic_year_id, grading_period_id, section_id, enrollment_id,
                                        student_id, subject_id, teacher_id, score, remarks, status)
      values (v_period.school_id, v_period.academic_year_id, p_period_id, p_section_id, v_enrollment.id,
              v_enrollment.student_id, p_subject_id, v_teacher, (r ->> 'score')::numeric, nullif(btrim(r ->> 'remarks'), ''), v_status);
      v_saved := v_saved + 1;
    elsif v_existing.status = 'draft' then
      update public.grade_records
         set score = (r ->> 'score')::numeric, remarks = nullif(btrim(r ->> 'remarks'), ''), status = v_status
       where id = v_existing.id;
      v_saved := v_saved + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('saved', v_saved, 'skipped', v_skipped);
end;
$$;

-- School admin review: approve | return | lock | unlock, for many grades at once.
create function public.review_grades(p_ids uuid[], p_action text, p_reason text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if p_action = 'approve' then
    update public.grade_records set status = 'approved', change_reason = p_reason where id = any(p_ids) and status = 'submitted';
  elsif p_action = 'return' then
    update public.grade_records set status = 'draft', change_reason = p_reason where id = any(p_ids) and status in ('submitted', 'approved');
  elsif p_action = 'lock' then
    update public.grade_records set status = 'locked', change_reason = p_reason where id = any(p_ids) and status = 'approved';
  elsif p_action = 'unlock' then
    update public.grade_records set status = 'approved', change_reason = p_reason where id = any(p_ids) and status = 'locked';
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Attendance counts per student for a section and date range (daily sessions).
create function public.attendance_section_summary(p_section_id uuid, p_from date, p_to date)
returns table (student_id uuid, student_number text, first_name text, last_name text,
               present bigint, absent bigint, late bigint, excused bigint, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select st.id, st.student_number, st.first_name, st.last_name,
         count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'excused'),
         count(*)
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.attendance_session_id
  join public.students st on st.id = r.student_id
  where r.section_id = p_section_id and s.session_type = 'daily' and s.attendance_date between p_from and p_to
  group by st.id, st.student_number, st.first_name, st.last_name
  order by st.last_name, st.first_name
$$;

-- One student's attendance counts for an academic year (daily sessions).
create function public.attendance_student_summary(p_student_id uuid, p_academic_year_id uuid)
returns table (present bigint, absent bigint, late bigint, excused bigint, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'excused'),
         count(*)
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.attendance_session_id
  where r.student_id = p_student_id and r.academic_year_id = p_academic_year_id and s.session_type = 'daily'
$$;

-- Mark the caller's notifications as read (all when p_ids is NULL).
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  update public.notifications set read_at = now()
  where recipient_user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.school_today(uuid), private.my_feature(text), private.my_family_section_ids(),
  private.teacher_teaches(uuid, uuid), private.teacher_can_take_attendance(uuid, uuid), private.attendance_editable(uuid),
  private.grade_max_score(uuid) from public;
grant execute on function private.school_today(uuid), private.my_feature(text), private.my_family_section_ids(),
  private.teacher_teaches(uuid, uuid), private.teacher_can_take_attendance(uuid, uuid), private.attendance_editable(uuid),
  private.grade_max_score(uuid) to authenticated, service_role;

-- Writers of audit/history/notifications: callable only from triggers (definer chain).
revoke all on function private.audit(uuid, text, text, uuid, jsonb), private.notify(uuid, uuid[], public.notification_type, text, text, jsonb),
  private.student_audience(uuid, boolean), private.log_grade_change(public.grade_records, numeric, public.grade_status, text)
  from public, authenticated;
grant execute on function private.log_grade_change(public.grade_records, numeric, public.grade_status, text) to authenticated, service_role;

revoke all on function private.check_period_dates(), private.check_room_conflict(), private.guard_attendance_session(),
  private.guard_attendance_record(), private.guard_grade(), private.forbid_change(), private.guard_assignment(),
  private.guard_submission(), private.after_attendance_session(), private.after_attendance_record(),
  private.after_grade(), private.after_assignment() from public, authenticated;

revoke all on function public.save_attendance(uuid, date, jsonb, uuid), public.save_grades(uuid, uuid, uuid, jsonb, boolean),
  public.review_grades(uuid[], text, text), public.attendance_section_summary(uuid, date, date),
  public.attendance_student_summary(uuid, uuid), public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.save_attendance(uuid, date, jsonb, uuid), public.save_grades(uuid, uuid, uuid, jsonb, boolean),
  public.review_grades(uuid[], text, text), public.attendance_section_summary(uuid, date, date),
  public.attendance_student_summary(uuid, uuid), public.mark_notifications_read(uuid[]) to authenticated;

-- Today's attendance totals for a school dashboard, aggregated in the database
-- (one row back instead of every record). SECURITY INVOKER: RLS applies.
create function public.attendance_day_totals(p_school_id uuid, p_date date)
returns table (sessions bigint, present bigint, absent bigint, late bigint, excused bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct s.id),
         count(r.id) filter (where r.status = 'present'),
         count(r.id) filter (where r.status = 'absent'),
         count(r.id) filter (where r.status = 'late'),
         count(r.id) filter (where r.status = 'excused')
  from public.attendance_sessions s
  left join public.attendance_records r on r.attendance_session_id = s.id
  where s.school_id = p_school_id and s.attendance_date = p_date and s.session_type = 'daily'
$$;

revoke all on function public.attendance_day_totals(uuid, date) from public, anon;
grant execute on function public.attendance_day_totals(uuid, date) to authenticated;

-- Students and parents may not read the teachers table (it holds contact and
-- employment data). They only need the NAMES of the teachers of their own (or
-- their children's) sections, which this function returns and nothing more.
create function public.visible_teacher_names(p_ids uuid[])
returns table (id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.first_name, t.last_name
  from public.teachers t
  where t.id = any(p_ids)
    and t.school_id = private.my_school_id()
    and (
      private.can_manage_school(t.school_id)
      or t.id = private.my_teacher_id()
      or exists (select 1 from public.teacher_subject_assignments a
                 where a.teacher_id = t.id and a.section_id in (select private.my_family_section_ids()))
      or exists (select 1 from public.sections s
                 where s.adviser_teacher_id = t.id and s.id in (select private.my_family_section_ids()))
    )
$$;

revoke all on function public.visible_teacher_names(uuid[]) from public, anon;
grant execute on function public.visible_teacher_names(uuid[]) to authenticated;
