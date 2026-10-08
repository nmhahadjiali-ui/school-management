-- =============================================================================
-- Picture uploads (max 1.5 MB; JPG, PNG or WebP — no SVG, which can carry script).
--
--   school-logos (PUBLIC bucket)   <school_id>/<uuid>.<ext>
--       logos are shown to everyone; schools.logo_url stores the public URL.
--   photos (PRIVATE bucket)        <school_id>/students/<student_id>/<uuid>.<ext>
--                                  <school_id | platform>/users/<user_id>/<uuid>.<ext>
--       students.photo_path / profiles.avatar_path store the object path;
--       the app serves them through /api/photos (short-lived signed URLs).
--
-- Who may do what (enforced by Storage RLS, evaluated as the caller):
--   logos           write: super admin, or the admin of that school
--   student photos  read: whoever can read the student record (RLS on students)
--                   write: super admin, or the admin of the student's school
--   profile photos  read: the user, their school's admins, super admins
--                   write: only the user, in their own folder
-- The 1.5 MB / type limits are enforced by the buckets themselves (and by the
-- browser before uploading). Paths stored in the tables are checked against
-- the row they belong to, so a record can't point at another record's picture.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('school-logos', 'school-logos', true, 1572864, array['image/png', 'image/jpeg', 'image/webp']),
  ('photos', 'photos', false, 1572864, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles add column avatar_path text
  check (avatar_path is null or avatar_path ~ (
    '^(platform|[0-9a-f-]{36})/users/' || user_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$'));
alter table public.students add column photo_path text
  check (photo_path is null or photo_path ~ (
    '^' || school_id::text || '/students/' || id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$'));

-- ---------------------------------------------------------------------------
-- Storage access helpers (SECURITY INVOKER: lookups run under the caller's RLS)
-- ---------------------------------------------------------------------------
create function private.can_write_logo(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select private.is_super_admin())
      or (storage.foldername(object_name))[1] = (select private.admin_school_id())::text
$$;

create function private.can_read_photo(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (select storage.foldername(object_name) as f)
  select case p.f[2]
    when 'students' then exists (
      select 1 from public.students s where s.id::text = p.f[3] and s.school_id::text = p.f[1])
    when 'users' then
      p.f[3] = (select auth.uid())::text
      or (select private.is_super_admin())
      or p.f[1] = (select private.admin_school_id())::text
    else false
  end
  from p
$$;

create function private.can_write_photo(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (select storage.foldername(object_name) as f)
  select case p.f[2]
    when 'students' then
      ((select private.is_super_admin()) or p.f[1] = (select private.admin_school_id())::text)
      and exists (select 1 from public.students s where s.id::text = p.f[3] and s.school_id::text = p.f[1])
    when 'users' then
      p.f[3] = (select auth.uid())::text
      and p.f[1] = coalesce((select private.my_school_id())::text, 'platform')
    else false
  end
  from p
$$;

revoke all on function private.can_write_logo(text), private.can_read_photo(text), private.can_write_photo(text) from public;
grant execute on function private.can_write_logo(text), private.can_read_photo(text), private.can_write_photo(text) to authenticated;

-- Logos: public read happens through the public URL; signed-in reads are
-- needed for the API to replace/delete objects.
create policy school_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'school-logos');
create policy school_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'school-logos' and private.can_write_logo(name));
create policy school_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'school-logos' and private.can_write_logo(name))
  with check (bucket_id = 'school-logos' and private.can_write_logo(name));
create policy school_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'school-logos' and private.can_write_logo(name));

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and private.can_read_photo(name));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and private.can_write_photo(name));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and private.can_write_photo(name))
  with check (bucket_id = 'photos' and private.can_write_photo(name));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and private.can_write_photo(name));
