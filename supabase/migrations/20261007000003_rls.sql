-- =============================================================================
-- Row Level Security: the database enforces tenant isolation.
--
-- Principles
--  * RLS is enabled on every table in the exposed schema.
--  * Default deny: an operation without a matching policy is rejected.
--  * `anon` gets no table access at all.
--  * Helper calls are wrapped in (select ...) so Postgres evaluates them once
--    per statement (initPlan) instead of once per row.
--  * Rows are never deleted through the API in Phase 1; schools and users are
--    deactivated instead (status column).
--
-- See docs/SECURITY.md for a human-readable matrix of these policies.
-- =============================================================================

alter table public.schools          enable row level security;
alter table public.profiles         enable row level security;
alter table public.school_settings  enable row level security;
alter table public.features         enable row level security;
alter table public.school_features  enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges (defense in depth on top of RLS)
-- ---------------------------------------------------------------------------
revoke all on public.schools, public.profiles, public.school_settings,
              public.features, public.school_features
  from anon, authenticated;

grant select, insert, update on public.schools         to authenticated;
grant select, update         on public.profiles        to authenticated;
grant select, insert, update on public.school_settings to authenticated;
grant select                 on public.features        to authenticated;
grant select, insert, update, delete on public.school_features to authenticated;

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------
-- Super admin: every school. Others: only their own (active) school.
create policy schools_select on public.schools
  for select to authenticated
  using (
    (select private.is_super_admin())
    or id = (select private.my_school_id())
  );

create policy schools_insert on public.schools
  for insert to authenticated
  with check ((select private.is_super_admin()));

-- School admins may edit their own school's basic details. Code/status
-- changes are additionally blocked for them by schools_guard_update.
create policy schools_update on public.schools
  for update to authenticated
  using (
    (select private.is_super_admin())
    or (select private.is_school_admin_of(id))
  )
  with check (
    (select private.is_super_admin())
    or (select private.is_school_admin_of(id))
  );

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Everyone sees their own profile (even while pending/inactive).
-- School admins see profiles of their school. Super admins see all.
-- Teachers/students/parents see only themselves in Phase 1.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_super_admin())
    or (select private.is_school_admin_of(school_id))
  );

-- Inserts happen only through the auth trigger (no insert policy).

-- Active users may edit their own contact details. School admins may edit
-- non-admin members of their school. Role/status/school changes are further
-- restricted by profiles_guard_update.
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.my_role()) is not null)
    or (select private.is_super_admin())
    or ((select private.is_school_admin_of(school_id)) and role in ('teacher', 'student', 'parent'))
  )
  with check (
    (user_id = (select auth.uid()) and (select private.my_role()) is not null)
    or (select private.is_super_admin())
    or (select private.is_school_admin_of(school_id))
  );

-- ---------------------------------------------------------------------------
-- school_settings
-- ---------------------------------------------------------------------------
-- Members of an active school can read its settings (branding, academic year).
create policy school_settings_select on public.school_settings
  for select to authenticated
  using (
    (select private.is_super_admin())
    or school_id = (select private.my_school_id())
  );

create policy school_settings_insert on public.school_settings
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy school_settings_update on public.school_settings
  for update to authenticated
  using (
    (select private.is_super_admin())
    or (select private.is_school_admin_of(school_id))
  )
  with check (
    (select private.is_super_admin())
    or (select private.is_school_admin_of(school_id))
  );

-- ---------------------------------------------------------------------------
-- features (platform catalog — not tenant data, contains no school info)
-- ---------------------------------------------------------------------------
create policy features_select on public.features
  for select to authenticated
  using ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- school_features
-- ---------------------------------------------------------------------------
-- Feature flags are a platform decision (they will later be tied to billing),
-- so only super admins change them. School admins can view their own flags.
-- Other users learn their enabled features via get_my_context()/has_feature().
create policy school_features_select on public.school_features
  for select to authenticated
  using (
    (select private.is_super_admin())
    or (select private.is_school_admin_of(school_id))
  );

create policy school_features_insert on public.school_features
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy school_features_update on public.school_features
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy school_features_delete on public.school_features
  for delete to authenticated
  using ((select private.is_super_admin()));
