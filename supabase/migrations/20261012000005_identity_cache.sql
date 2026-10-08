-- =============================================================================
-- Identity cache + helper tuning (RLS performance, part 2).
--
-- Every policy asks "who am I?" through private.my_role(), my_school_id(),
-- my_teacher_id(), my_student_id(), my_guardian_id() and my_feature(); each
-- call used to re-query profiles/schools (my_teacher_id three times), and
-- several set-returning helpers called them once PER ROW across all schools.
--
-- 1. private.my_ident() resolves the caller once per transaction and caches
--    it in a transaction-local setting keyed by the user id. This adds no new
--    attack surface: the caller's identity already comes from a
--    transaction-local setting (request.jwt.claims) that only trusted code
--    can set. Any change to profiles, schools, teachers, students, guardians
--    or school_features clears the cache for the rest of the transaction.
-- 2. The helpers keep their exact semantics but read the cache, and the
--    set-returning helpers evaluate identity once ((select …) initPlans).
-- 3. Indexes for "sections I advise" and "my teaching loads".
-- =============================================================================

create function private.my_ident()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_raw text;
  v jsonb;
  v_role public.app_role;
  v_school uuid;
begin
  if v_uid is null then
    return null;
  end if;
  v_raw := current_setting('app.ident', true);
  if v_raw is not null and v_raw <> '' then
    v := v_raw::jsonb;
    if v ->> 'uid' = v_uid::text then
      return v;
    end if;
  end if;

  -- Same rules as the original my_role() / my_school_id().
  select case when p.status = 'active' and (p.role = 'super_admin' or s.status = 'active') then p.role end,
         case when p.status = 'active' and s.status = 'active' then p.school_id end
    into v_role, v_school
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  where p.user_id = v_uid;

  v := jsonb_build_object(
    'uid', v_uid,
    'role', v_role,
    'school_id', v_school,
    'teacher_id', case when v_role = 'teacher' then
      (select t.id from public.teachers t where t.user_id = v_uid and t.status = 'active' and t.school_id = v_school limit 1) end,
    'student_id', case when v_role = 'student' then
      (select x.id from public.students x where x.user_id = v_uid and x.school_id = v_school limit 1) end,
    'guardian_id', case when v_role = 'parent' then
      (select g.id from public.guardians g where g.user_id = v_uid and g.status = 'active' and g.school_id = v_school limit 1) end,
    'features', coalesce((select jsonb_agg(f.feature_key) from public.school_features f
                          where f.school_id = v_school and f.enabled), '[]'::jsonb)
  );
  perform set_config('app.ident', v::text, true);
  return v;
end;
$$;

create function private.reset_ident()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.ident', '', true);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'schools', 'teachers', 'students', 'guardians', 'school_features'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each statement execute function private.reset_ident()',
                   t || '_reset_ident', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Identity helpers: same signatures and results, now cached.
-- ---------------------------------------------------------------------------
create or replace function private.my_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select (private.my_ident() ->> 'role')::public.app_role $$;

create or replace function private.my_school_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select (private.my_ident() ->> 'school_id')::uuid $$;

create or replace function private.my_teacher_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select (private.my_ident() ->> 'teacher_id')::uuid $$;

create or replace function private.my_student_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select (private.my_ident() ->> 'student_id')::uuid $$;

create or replace function private.my_guardian_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select (private.my_ident() ->> 'guardian_id')::uuid $$;

-- Enabled features of the caller's (active) school.
create or replace function private.my_feature(feature text)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((private.my_ident() -> 'features') ? feature, false) $$;

-- ---------------------------------------------------------------------------
-- Set-returning helpers: identity evaluated once per query.
-- ---------------------------------------------------------------------------
create or replace function private.my_guardian_student_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select sg.student_id from public.student_guardians sg where sg.guardian_id = (select private.my_guardian_id()) $$;

create or replace function private.my_teacher_section_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from public.sections s where s.adviser_teacher_id = (select private.my_teacher_id())
  union
  select a.section_id from public.teacher_subject_assignments a where a.teacher_id = (select private.my_teacher_id())
$$;

create or replace function private.my_visible_section_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select private.my_teacher_section_ids()
  union
  select e.section_id from public.student_enrollments e
  where e.section_id is not null
    and (e.student_id = (select private.my_student_id()) or e.student_id in (select private.my_guardian_student_ids()))
$$;

create or replace function private.my_family_section_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select e.section_id from public.student_enrollments e
  where e.section_id is not null
    and (e.student_id = (select private.my_student_id()) or e.student_id in (select private.my_guardian_student_ids()))
$$;

create or replace function private.family_finance_student_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select s.id from public.students s
  where (select private.my_feature('billing')) and (select private.my_feature('student_finance'))
    and (s.id = (select private.my_student_id()) or s.id in (select private.my_guardian_student_ids()))
$$;

create or replace function private.teacher_teaches(p_section uuid, p_subject uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_subject_assignments a
    where a.teacher_id = (select private.my_teacher_id()) and a.section_id = p_section
      and (p_subject is null or a.subject_id = p_subject)
  )
$$;

create or replace function private.my_audience()
returns table (target_type public.announcement_target_type, target_id uuid)
language sql stable security definer set search_path = ''
as $$
  with me as (select private.my_school_id() as school_id, private.my_role() as role, (select auth.uid()) as uid,
                     private.my_teacher_id() as teacher_id, private.my_student_id() as student_id),
  my_sections as (
    select s.id, s.grade_level_id
    from public.sections s
    join public.academic_years y on y.id = s.academic_year_id and y.is_current
    where s.id in (select private.my_teacher_section_ids())
       or s.id in (select e.section_id from public.student_enrollments e, me
                   where e.enrollment_status = 'enrolled'
                     and (e.student_id = me.student_id or e.student_id in (select private.my_guardian_student_ids())))
  )
  select 'school'::public.announcement_target_type, me.school_id from me where me.school_id is not null
  union all select 'user', me.uid from me where me.school_id is not null
  union all select 'section', ms.id from my_sections ms
  union all select distinct 'grade_level'::public.announcement_target_type, ms.grade_level_id from my_sections ms
  union all
  select 'class', l.id from public.teacher_subject_assignments l, me
  where (me.role = 'teacher' and l.teacher_id = me.teacher_id and l.section_id in (select id from my_sections))
     or (me.role in ('student', 'parent') and l.section_id in (select id from my_sections))
$$;

create or replace function private.my_visible_announcement_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct a.id
  from public.announcements a
  join public.announcement_targets t on t.announcement_id = a.id
  where a.school_id = (select private.my_school_id())
    and a.status = 'published'
    and (a.expires_at is null or a.expires_at > now())
    and (t.roles is null or (select private.my_role()) = any(t.roles))
    and (t.target_type, t.target_id) in (select ma.target_type, ma.target_id from private.my_audience() ma)
$$;

create index if not exists sections_adviser_idx on public.sections (adviser_teacher_id) where adviser_teacher_id is not null;
create index if not exists tsa_teacher_idx on public.teacher_subject_assignments (teacher_id);

revoke all on function private.my_ident(), private.reset_ident() from public, anon;
grant execute on function private.my_ident() to authenticated, service_role;
