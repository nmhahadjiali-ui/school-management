-- =============================================================================
-- Phase 2 RLS. Same principles as Phase 1 (see docs/SECURITY.md):
-- default deny, no anon access, helpers wrapped in (select ...), school
-- derived from the caller's profile, never from client input.
--
-- "Manage" = super admin, or school admin of the row's school
--            (private.can_manage_school).
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['academic_years', 'grade_levels', 'subjects', 'teachers', 'sections', 'students',
                           'guardians', 'student_guardians', 'student_enrollments',
                           'teacher_subject_assignments', 'invitations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    -- Managers can insert/update any row of their school.
    execute format($p$create policy %I on public.%I for insert to authenticated
                      with check ((select private.can_manage_school(school_id)))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
                      using ((select private.can_manage_school(school_id)))
                      with check ((select private.can_manage_school(school_id)))$p$, t || '_update', t);
  end loop;
end $$;

-- Only link tables may be deleted (removing a relationship / assignment).
-- Records themselves are archived via their status column. Once later phases
-- reference assignments (grades), their FKs will block deleting used rows.
grant delete on public.student_guardians, public.teacher_subject_assignments to authenticated;

create policy student_guardians_delete on public.student_guardians for delete to authenticated
  using ((select private.can_manage_school(school_id)));
create policy teacher_subject_assignments_delete on public.teacher_subject_assignments for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- ---------------------------------------------------------------------------
-- SELECT policies
-- ---------------------------------------------------------------------------

-- Reference data: readable by every active member of the school.
create policy academic_years_select on public.academic_years for select to authenticated
  using ((select private.can_manage_school(school_id)) or school_id = (select private.my_school_id()));
create policy grade_levels_select on public.grade_levels for select to authenticated
  using ((select private.can_manage_school(school_id)) or school_id = (select private.my_school_id()));
create policy subjects_select on public.subjects for select to authenticated
  using ((select private.can_manage_school(school_id)) or school_id = (select private.my_school_id()));

-- Sections: managers; teachers (advised/taught); students and parents (own/children's sections).
create policy sections_select on public.sections for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id in (select private.my_visible_section_ids())
  );

-- Teachers: managers, and the teacher themself.
create policy teachers_select on public.teachers for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id = (select private.my_teacher_id())
  );

-- Students: managers; teachers (students in their sections); the student; their guardians.
create policy students_select on public.students for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id in (select private.my_teacher_student_ids())
    or id = (select private.my_student_id())
    or id in (select private.my_guardian_student_ids())
  );

-- Guardians: managers, and the guardian themself.
create policy guardians_select on public.guardians for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id = (select private.my_guardian_id())
  );

-- Student-guardian links: managers; the guardian; the student.
create policy student_guardians_select on public.student_guardians for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or guardian_id = (select private.my_guardian_id())
    or student_id = (select private.my_student_id())
  );

-- Enrollments: managers; teachers (their sections); the student; their guardians.
create policy student_enrollments_select on public.student_enrollments for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or section_id in (select private.my_teacher_section_ids())
    or student_id = (select private.my_student_id())
    or student_id in (select private.my_guardian_student_ids())
  );

-- Assignments: managers; the assigned teacher.
create policy teacher_subject_assignments_select on public.teacher_subject_assignments for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or teacher_id = (select private.my_teacher_id())
  );

-- Invitations: managers only.
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.can_manage_school(school_id)));
