-- =============================================================================
-- Phase 2: integrity triggers, RLS helpers and RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- school_id is immutable on every tenant table (for everyone).
-- Composite FKs already stop cross-school references; this stops a row being
-- "moved" to another tenant wholesale.
-- ---------------------------------------------------------------------------
create function private.forbid_school_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['academic_years', 'grade_levels', 'subjects', 'teachers', 'sections', 'students',
                           'guardians', 'student_guardians', 'student_enrollments',
                           'teacher_subject_assignments', 'invitations']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.forbid_school_change()',
                   t || '_forbid_school_change', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Archived academic years are read-only history (for everyone, including the
-- service role; archive_academic_year closes enrollments BEFORE archiving).
-- ---------------------------------------------------------------------------
create function private.assert_year_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.academic_years y
    where y.id in (new.academic_year_id, case when tg_op = 'UPDATE' then old.academic_year_id end)
      and y.status = 'archived'
  ) then
    raise exception 'The academic year is archived and can no longer be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sections_year_open before insert or update on public.sections
  for each row execute function private.assert_year_open();
create trigger student_enrollments_year_open before insert or update on public.student_enrollments
  for each row execute function private.assert_year_open();
create trigger tsa_year_open before insert or update on public.teacher_subject_assignments
  for each row execute function private.assert_year_open();

-- ---------------------------------------------------------------------------
-- Enrollment history rules (API callers):
--  * student, academic year and grade level never change on an enrollment;
--  * a section can be assigned once (NULL -> section); moving sections is a
--    transfer (close + new row, see transfer_enrollment);
--  * closed enrollments are immutable.
-- ---------------------------------------------------------------------------
create function private.guard_enrollment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.enrollment_status <> 'enrolled' then
    raise exception 'Closed enrollments are part of the student''s history and cannot be changed'
      using errcode = 'P0001';
  end if;
  if new.student_id is distinct from old.student_id
     or new.academic_year_id is distinct from old.academic_year_id
     or new.grade_level_id is distinct from old.grade_level_id
     or new.enrollment_date is distinct from old.enrollment_date then
    raise exception 'Student, academic year, grade level and enrollment date cannot be changed; record a transfer instead'
      using errcode = 'P0001';
  end if;
  if old.section_id is not null and new.section_id is distinct from old.section_id then
    raise exception 'Use a transfer to move a student to another section' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger student_enrollments_guard_update before update on public.student_enrollments
  for each row execute function private.guard_enrollment_update();

-- Section capacity (NULL capacity = unlimited). Locks the section row so
-- concurrent enrollments cannot overfill it.
create function private.check_section_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_count    integer;
begin
  if new.section_id is null or new.enrollment_status <> 'enrolled' then
    return new;
  end if;
  select capacity into v_capacity from public.sections where id = new.section_id for update;
  if v_capacity is null then
    return new;
  end if;
  select count(*) into v_count
  from public.student_enrollments
  where section_id = new.section_id and enrollment_status = 'enrolled' and id <> new.id;
  if v_count >= v_capacity then
    raise exception 'This section is full (capacity %)', v_capacity using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger student_enrollments_capacity
  before insert or update of section_id, enrollment_status on public.student_enrollments
  for each row execute function private.check_section_capacity();

-- ---------------------------------------------------------------------------
-- Account links: a record's user_id must be a profile of the SAME school with
-- the matching role (teachers -> teacher, students -> student, guardians -> parent).
-- ---------------------------------------------------------------------------
create function private.validate_account_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := case tg_table_name
    when 'teachers' then 'teacher'
    when 'students' then 'student'
    when 'guardians' then 'parent'
  end::public.app_role;
begin
  if new.user_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = new.user_id and p.school_id = new.school_id and p.role = v_role
  ) then
    raise exception 'The account must belong to this school and have the % role', v_role
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teachers_validate_account before insert or update of user_id on public.teachers
  for each row execute function private.validate_account_link();
create trigger students_validate_account before insert or update of user_id on public.students
  for each row execute function private.validate_account_link();
create trigger guardians_validate_account before insert or update of user_id on public.guardians
  for each row execute function private.validate_account_link();

-- A linked profile cannot change role or school (unlink the record first).
create function private.guard_profile_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.school_id is distinct from old.school_id)
     and (exists (select 1 from public.teachers where user_id = old.user_id)
       or exists (select 1 from public.students where user_id = old.user_id)
       or exists (select 1 from public.guardians where user_id = old.user_id)) then
    raise exception 'This account is linked to a school record; unlink it before changing role or school'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_links before update of role, school_id on public.profiles
  for each row execute function private.guard_profile_links();

-- ---------------------------------------------------------------------------
-- Provisioning (replaces the Phase 1 version): additionally links the new
-- account to a teacher/student/guardian record, atomically.
-- app_metadata: provision_record_type ('teacher'|'student'|'guardian'), provision_record_id
-- ---------------------------------------------------------------------------
create or replace function private.handle_provisioned_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_meta  jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  user_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_school  uuid := nullif(app_meta ->> 'provision_school_id', '')::uuid;
  v_type    text := app_meta ->> 'provision_record_type';
  v_record  uuid := nullif(app_meta ->> 'provision_record_id', '')::uuid;
begin
  if not (app_meta ? 'provision_role')
     or exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  insert into public.profiles (user_id, school_id, email, first_name, last_name, role, status)
  values (
    new.id,
    v_school,
    coalesce(new.email, ''),
    left(coalesce(user_meta ->> 'first_name', ''), 100),
    left(coalesce(user_meta ->> 'last_name', ''), 100),
    (app_meta ->> 'provision_role')::public.app_role,
    coalesce(nullif(app_meta ->> 'provision_status', ''), 'active')::public.profile_status
  );

  if v_type is not null then
    if v_type = 'teacher' then
      update public.teachers set user_id = new.id where id = v_record and school_id = v_school and user_id is null;
    elsif v_type = 'student' then
      update public.students set user_id = new.id where id = v_record and school_id = v_school and user_id is null;
    elsif v_type = 'guardian' then
      update public.guardians set user_id = new.id where id = v_record and school_id = v_school and user_id is null;
    else
      raise exception 'invalid provision_record_type';
    end if;
    if not found then
      raise exception 'record_not_linkable' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER: they read tables whose own policies call
-- these helpers, so they must bypass RLS to avoid recursion).
-- All return nothing for inactive accounts / inactive schools via my_role().
-- ---------------------------------------------------------------------------
create function private.can_manage_school(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or private.is_school_admin_of(target_school)
$$;

create function private.my_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.teachers t
  where t.user_id = (select auth.uid())
    and t.status = 'active'
    and t.school_id = private.my_school_id()
    and private.my_role() = 'teacher'
$$;

create function private.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.students s
  where s.user_id = (select auth.uid())
    and s.school_id = private.my_school_id()
    and private.my_role() = 'student'
$$;

create function private.my_guardian_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.guardians g
  where g.user_id = (select auth.uid())
    and g.status = 'active'
    and g.school_id = private.my_school_id()
    and private.my_role() = 'parent'
$$;

-- Sections the calling teacher advises or teaches in (all years: history stays visible).
create function private.my_teacher_section_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.sections s where s.adviser_teacher_id = private.my_teacher_id()
  union
  select a.section_id from public.teacher_subject_assignments a where a.teacher_id = private.my_teacher_id()
$$;

-- Students enrolled (now or historically) in the calling teacher's sections.
create function private.my_teacher_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.student_id from public.student_enrollments e
  where e.section_id in (select private.my_teacher_section_ids())
$$;

-- Children linked to the calling parent.
create function private.my_guardian_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sg.student_id from public.student_guardians sg where sg.guardian_id = private.my_guardian_id()
$$;

-- Sections visible to a teacher, a student (own enrollments) or a parent (children's enrollments).
create function private.my_visible_section_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_teacher_section_ids()
  union
  select e.section_id from public.student_enrollments e
  where e.section_id is not null
    and (e.student_id = private.my_student_id()
         or e.student_id in (select private.my_guardian_student_ids()))
$$;

revoke all on function private.can_manage_school(uuid), private.my_teacher_id(), private.my_student_id(),
  private.my_guardian_id(), private.my_teacher_section_ids(), private.my_teacher_student_ids(),
  private.my_guardian_student_ids(), private.my_visible_section_ids() from public;
grant execute on function private.can_manage_school(uuid), private.my_teacher_id(), private.my_student_id(),
  private.my_guardian_id(), private.my_teacher_section_ids(), private.my_teacher_student_ids(),
  private.my_guardian_student_ids(), private.my_visible_section_ids() to authenticated, service_role;

revoke all on function private.forbid_school_change(), private.assert_year_open(), private.guard_enrollment_update(),
  private.check_section_capacity(), private.validate_account_link(), private.guard_profile_links()
  from public, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs. SECURITY INVOKER unless noted, so RLS applies to every statement.
-- ---------------------------------------------------------------------------

-- Make one academic year current (atomically unsets the previous one).
create function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_school uuid;
begin
  select school_id into v_school from public.academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'Academic year not found' using errcode = 'P0002';
  end if;
  update public.academic_years set is_current = false where school_id = v_school and is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id;
  if not found then
    raise exception 'Academic year not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Archive a year: open enrollments are closed as 'completed', then the year
-- becomes read-only history.
create function public.archive_academic_year(p_year_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_end date;
begin
  select end_date into v_end from public.academic_years where id = p_year_id and status <> 'archived';
  if v_end is null then
    raise exception 'Academic year not found or already archived' using errcode = 'P0002';
  end if;
  update public.student_enrollments
     set enrollment_status = 'completed',
         exit_date = greatest(enrollment_date, least(v_end, current_date))
   where academic_year_id = p_year_id and enrollment_status = 'enrolled';
  update public.academic_years set status = 'archived', is_current = false where id = p_year_id;
end;
$$;

-- Move a student within the same academic year: the current enrollment is
-- closed as 'transferred' and a new one opened. History is never overwritten.
create function public.transfer_enrollment(
  p_enrollment_id uuid,
  p_grade_level_id uuid,
  p_section_id uuid,
  p_effective_date date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.student_enrollments;
  v_new uuid;
begin
  select * into v_old from public.student_enrollments where id = p_enrollment_id;
  if v_old.id is null or v_old.enrollment_status <> 'enrolled' then
    raise exception 'Only an open enrollment can be transferred' using errcode = 'P0001';
  end if;
  if p_effective_date < v_old.enrollment_date then
    raise exception 'The transfer date cannot be before the enrollment date' using errcode = 'P0001';
  end if;

  update public.student_enrollments
     set enrollment_status = 'transferred', exit_date = p_effective_date
   where id = v_old.id;

  insert into public.student_enrollments
    (school_id, academic_year_id, student_id, grade_level_id, section_id, enrollment_status, enrollment_date)
  values
    (v_old.school_id, v_old.academic_year_id, v_old.student_id, p_grade_level_id, p_section_id, 'enrolled', p_effective_date)
  returning id into v_new;
  return v_new;
end;
$$;

-- Called by an invited user after setting their password. SECURITY DEFINER:
-- users cannot otherwise write invitations; it only touches the caller's own.
create function public.accept_invitation()
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.invitations
       set accepted_at = now()
     where user_id = (select auth.uid())
       and accepted_at is null and revoked_at is null
     returning 1
  )
  select exists (select 1 from updated)
$$;

-- Replaces the Phase 1 version: academic year now comes from academic_years,
-- and the caller's linked record (teacher/student/guardian) is included.
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
      'primary_color', st.primary_color
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
    ), '[]'::jsonb)
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join public.school_settings st on st.school_id = s.id
  where p.user_id = (select auth.uid())
$$;

revoke all on function public.set_current_academic_year(uuid), public.archive_academic_year(uuid),
  public.transfer_enrollment(uuid, uuid, uuid, date), public.accept_invitation() from public, anon;
grant execute on function public.set_current_academic_year(uuid), public.archive_academic_year(uuid),
  public.transfer_enrollment(uuid, uuid, uuid, date), public.accept_invitation() to authenticated;
