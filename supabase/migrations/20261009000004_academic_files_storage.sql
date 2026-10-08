-- =============================================================================
-- Coursework files in Supabase Storage (private bucket). Only paths are stored
-- in PostgreSQL. Object paths encode the tenant and owning record:
--
--   <school_id>/assignments/<assignment_id>/<uuid>-<filename>
--   <school_id>/submissions/<assignment_id>/<student_id>/<uuid>-<filename>
--
-- Access is decided by the SAME row-level rules as the records: the helper
-- functions below are SECURITY INVOKER, so their lookups of `assignments` run
-- under the caller's RLS. Guessing another school's path gains nothing: the
-- referenced assignment is invisible to the caller, so the check fails.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academic-files', 'academic-files', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;

-- Read: anyone who can see the assignment (teacher, admins, its students and
-- their parents); submissions additionally only by their student, the
-- student's guardians, the assignment's teacher, or admins.
create function private.can_read_academic_file(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (select storage.foldername(object_name) as f)
  select exists (
    select 1 from public.assignments a, p
    where a.id::text = p.f[3] and a.school_id::text = p.f[1]
      and (
        p.f[2] = 'assignments'
        or (p.f[2] = 'submissions' and (
              p.f[4] = private.my_student_id()::text
              or p.f[4] in (select s::text from private.my_guardian_student_ids() s)
              or a.teacher_id = private.my_teacher_id()
              or private.can_manage_school(a.school_id)))
      )
  )
$$;

-- Write: the assignment's teacher or school admins (assignment files); the
-- student themself on a published assignment (their own submission folder).
create function private.can_write_academic_file(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (select storage.foldername(object_name) as f)
  select exists (
    select 1 from public.assignments a, p
    where a.id::text = p.f[3] and a.school_id::text = p.f[1]
      and (
        (p.f[2] = 'assignments' and (a.teacher_id = private.my_teacher_id() or private.can_manage_school(a.school_id)))
        or (p.f[2] = 'submissions' and a.status = 'published' and p.f[4] = private.my_student_id()::text)
      )
  )
$$;

revoke all on function private.can_read_academic_file(text), private.can_write_academic_file(text) from public;
grant execute on function private.can_read_academic_file(text), private.can_write_academic_file(text) to authenticated;

create policy academic_files_select on storage.objects for select to authenticated
  using (bucket_id = 'academic-files' and private.can_read_academic_file(name));
create policy academic_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'academic-files' and private.can_write_academic_file(name));
create policy academic_files_update on storage.objects for update to authenticated
  using (bucket_id = 'academic-files' and private.can_write_academic_file(name))
  with check (bucket_id = 'academic-files' and private.can_write_academic_file(name));
create policy academic_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'academic-files' and private.can_write_academic_file(name));
