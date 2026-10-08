-- =============================================================================
-- Phase 3 RLS. Same principles as Phases 1-2 (see docs/SECURITY.md).
--   M = (select private.can_manage_school(school_id))   super admin / school admin
--   F = (select private.my_feature('<module>'))         module enabled for the caller's school
-- Teacher access is checked against teaching assignments, parent access against
-- student_guardians, student access against the caller's own student record.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['grading_periods', 'grading_scales', 'class_schedules', 'attendance_sessions',
                           'attendance_records', 'grade_records', 'grade_change_logs', 'assignments',
                           'assignment_submissions', 'notifications', 'audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select, insert, update on public.grading_periods, public.class_schedules, public.attendance_sessions,
  public.attendance_records, public.grade_records, public.assignments, public.assignment_submissions to authenticated;
grant select, insert, update, delete on public.grading_scales to authenticated;
grant delete on public.class_schedules to authenticated;
grant select on public.grade_change_logs, public.audit_logs to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Configuration: grading periods and scales (module: grades)
-- ---------------------------------------------------------------------------
create policy grading_periods_select on public.grading_periods for select to authenticated
  using ((select private.can_manage_school(school_id))
         or (school_id = (select private.my_school_id()) and (select private.my_feature('grades'))));
create policy grading_periods_insert on public.grading_periods for insert to authenticated
  with check ((select private.can_manage_school(school_id)));
create policy grading_periods_update on public.grading_periods for update to authenticated
  using ((select private.can_manage_school(school_id))) with check ((select private.can_manage_school(school_id)));

create policy grading_scales_select on public.grading_scales for select to authenticated
  using ((select private.can_manage_school(school_id))
         or (school_id = (select private.my_school_id()) and (select private.my_feature('grades'))));
create policy grading_scales_insert on public.grading_scales for insert to authenticated
  with check ((select private.can_manage_school(school_id)));
create policy grading_scales_update on public.grading_scales for update to authenticated
  using ((select private.can_manage_school(school_id))) with check ((select private.can_manage_school(school_id)));
create policy grading_scales_delete on public.grading_scales for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- ---------------------------------------------------------------------------
-- Schedules (module: schedules). Managed by school admins; teachers see their
-- classes; students and parents see their (children's) sections.
-- ---------------------------------------------------------------------------
create policy class_schedules_select on public.class_schedules for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('schedules')) and (
              teacher_id = (select private.my_teacher_id())
              or section_id in (select private.my_teacher_section_ids())
              or section_id in (select private.my_family_section_ids()))));
create policy class_schedules_insert on public.class_schedules for insert to authenticated
  with check ((select private.can_manage_school(school_id)));
create policy class_schedules_update on public.class_schedules for update to authenticated
  using ((select private.can_manage_school(school_id))) with check ((select private.can_manage_school(school_id)));
create policy class_schedules_delete on public.class_schedules for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- ---------------------------------------------------------------------------
-- Attendance (module: attendance)
-- ---------------------------------------------------------------------------
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('attendance')) and (
              section_id in (select private.my_teacher_section_ids())
              or section_id in (select private.my_family_section_ids()))));
create policy attendance_sessions_insert on public.attendance_sessions for insert to authenticated
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('attendance'))
                  and teacher_id = (select private.my_teacher_id())
                  and private.teacher_can_take_attendance(section_id, subject_id)));
create policy attendance_sessions_update on public.attendance_sessions for update to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('attendance')) and private.teacher_can_take_attendance(section_id, subject_id)))
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('attendance')) and private.teacher_can_take_attendance(section_id, subject_id)));

create policy attendance_records_select on public.attendance_records for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('attendance')) and (
              section_id in (select private.my_teacher_section_ids())
              or student_id = (select private.my_student_id())
              or student_id in (select private.my_guardian_student_ids()))));
create policy attendance_records_insert on public.attendance_records for insert to authenticated
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('attendance')) and exists (
                   select 1 from public.attendance_sessions s
                   where s.id = attendance_session_id and private.teacher_can_take_attendance(s.section_id, s.subject_id))));
create policy attendance_records_update on public.attendance_records for update to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('attendance')) and exists (
              select 1 from public.attendance_sessions s
              where s.id = attendance_session_id and private.teacher_can_take_attendance(s.section_id, s.subject_id))))
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('attendance')) and exists (
                   select 1 from public.attendance_sessions s
                   where s.id = attendance_session_id and private.teacher_can_take_attendance(s.section_id, s.subject_id))));

-- ---------------------------------------------------------------------------
-- Grades (module: grades). Teachers: their own grade rows (the composite FK
-- guarantees they teach that subject in that section). Students and parents:
-- PUBLISHED grades only (approved/locked), never drafts.
-- ---------------------------------------------------------------------------
create policy grade_records_select on public.grade_records for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('grades')) and (
              teacher_id = (select private.my_teacher_id())
              or (status in ('approved', 'locked') and (
                   student_id = (select private.my_student_id())
                   or student_id in (select private.my_guardian_student_ids()))))));
create policy grade_records_insert on public.grade_records for insert to authenticated
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('grades')) and teacher_id = (select private.my_teacher_id())));
create policy grade_records_update on public.grade_records for update to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('grades')) and teacher_id = (select private.my_teacher_id())))
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('grades')) and teacher_id = (select private.my_teacher_id())));

create policy grade_change_logs_select on public.grade_change_logs for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('grades')) and exists (
              select 1 from public.grade_records g
              where g.id = grade_record_id and g.teacher_id = (select private.my_teacher_id()))));

-- ---------------------------------------------------------------------------
-- Coursework (module: coursework)
-- ---------------------------------------------------------------------------
create policy assignments_select on public.assignments for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('coursework')) and (
              teacher_id = (select private.my_teacher_id())
              or (status = 'published' and section_id in (select private.my_family_section_ids())))));
create policy assignments_insert on public.assignments for insert to authenticated
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('coursework')) and teacher_id = (select private.my_teacher_id())));
create policy assignments_update on public.assignments for update to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('coursework')) and teacher_id = (select private.my_teacher_id())))
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('coursework')) and teacher_id = (select private.my_teacher_id())));

create policy submissions_select on public.assignment_submissions for select to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('coursework')) and (
              student_id = (select private.my_student_id())
              or student_id in (select private.my_guardian_student_ids())
              or exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = (select private.my_teacher_id())))));
create policy submissions_insert on public.assignment_submissions for insert to authenticated
  with check ((select private.my_feature('coursework')) and student_id = (select private.my_student_id()));
create policy submissions_update on public.assignment_submissions for update to authenticated
  using ((select private.can_manage_school(school_id))
         or ((select private.my_feature('coursework')) and (
              student_id = (select private.my_student_id())
              or exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = (select private.my_teacher_id())))))
  with check ((select private.can_manage_school(school_id))
              or ((select private.my_feature('coursework')) and (
                   student_id = (select private.my_student_id())
                   or exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = (select private.my_teacher_id())))));

-- ---------------------------------------------------------------------------
-- Notifications: only the recipient, only within their own (active) school.
-- Rows are created exclusively by database triggers (no insert policy).
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()) and school_id = (select private.my_school_id()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()) and school_id = (select private.my_school_id()))
  with check (recipient_user_id = (select auth.uid()) and school_id = (select private.my_school_id()));

-- ---------------------------------------------------------------------------
-- Audit log: school managers; everyone can see their own actions.
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.can_manage_school(school_id)) or actor_user_id = (select auth.uid()));
