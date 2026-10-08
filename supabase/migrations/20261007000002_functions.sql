-- =============================================================================
-- Identity helpers, provisioning and guard triggers
--
-- Helpers live in the `private` schema, which is NOT exposed through the Data
-- API. They are SECURITY DEFINER so RLS policies can look up the caller's
-- profile without recursing into the profiles policies.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Caller identity
--
-- A caller only "has" a role/school when their profile is active AND (for
-- school users) their school is active. Pending/inactive users and users of a
-- disabled school therefore fail every tenant-scoped policy automatically.
-- ---------------------------------------------------------------------------
create function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  where p.user_id = (select auth.uid())
    and p.status = 'active'
    and (p.role = 'super_admin' or s.status = 'active')
$$;

create function private.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.user_id = (select auth.uid())
    and p.status = 'active'
    and s.status = 'active'
$$;

create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'super_admin', false)
$$;

create function private.is_school_admin_of(target_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.my_role() = 'school_admin' and private.my_school_id() = target_school,
    false
  )
$$;

-- Feature gate for RLS policies of future modules, e.g.
--   using (school_id = (select private.my_school_id())
--          and private.school_has_feature(school_id, 'library'))
create function private.school_has_feature(target_school uuid, feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_features f
    join public.schools s on s.id = f.school_id
    where f.school_id = target_school
      and f.feature_key = feature
      and f.enabled
      and s.status = 'active'
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auth user -> profile
--
-- Two paths:
--  1. Self-registration (insert). The user supplies a school code and may only
--     request teacher/student/parent. The account starts as `pending` until a
--     school admin approves it. Admin roles can never be self-assigned.
--  2. Provisioned by an administrator through the service-role key. The role,
--     school and status come from raw_app_meta_data, which end users cannot
--     set. GoTrue writes app_metadata with an UPDATE right after the INSERT
--     (same transaction), so this path runs on update.
-- An auth user with neither gets no profile and therefore no access.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_school  uuid;
begin
  if new.raw_app_meta_data ? 'provision_role'
     or nullif(btrim(user_meta ->> 'school_code'), '') is null then
    return new; -- not a self-registration (e.g. admin-provisioned, handled on update)
  end if;

  select s.id into v_school
  from public.schools s
  where s.code = upper(btrim(user_meta ->> 'school_code'))
    and s.status = 'active';

  if v_school is null then
    raise exception 'invalid_school_code' using errcode = 'P0001';
  end if;

  insert into public.profiles (user_id, school_id, email, first_name, last_name, phone, role, status)
  values (
    new.id,
    v_school,
    coalesce(new.email, ''),
    left(coalesce(user_meta ->> 'first_name', ''), 100),
    left(coalesce(user_meta ->> 'last_name', ''), 100),
    nullif(left(coalesce(user_meta ->> 'phone', ''), 40), ''),
    case user_meta ->> 'requested_role'
      when 'teacher' then 'teacher'
      when 'parent'  then 'parent'
      else 'student'
    end::public.app_role,
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_provisioned_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_meta  jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  user_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if not (app_meta ? 'provision_role')
     or exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  insert into public.profiles (user_id, school_id, email, first_name, last_name, role, status)
  values (
    new.id,
    nullif(app_meta ->> 'provision_school_id', '')::uuid,
    coalesce(new.email, ''),
    left(coalesce(user_meta ->> 'first_name', ''), 100),
    left(coalesce(user_meta ->> 'last_name', ''), 100),
    (app_meta ->> 'provision_role')::public.app_role,
    coalesce(nullif(app_meta ->> 'provision_status', ''), 'active')::public.profile_status
  );
  return new;
end;
$$;

-- Fires on update (current GoTrue behaviour) and on insert (in case
-- app_metadata is ever written with the initial row). Idempotent.
create trigger on_auth_user_provisioned
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data ? 'provision_role')
  execute function private.handle_provisioned_user();

create trigger on_auth_user_created_provisioned
  after insert on auth.users
  for each row
  when (new.raw_app_meta_data ? 'provision_role')
  execute function private.handle_provisioned_user();

-- Keep the mirrored email in sync when a user changes it.
create function private.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_user_email();

-- ---------------------------------------------------------------------------
-- New school -> default settings + one (disabled) row per catalog feature
-- ---------------------------------------------------------------------------
create function private.handle_new_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_settings (school_id) values (new.id);
  insert into public.school_features (school_id, feature_key, enabled)
  select new.id, f.key, false from public.features f;
  return new;
end;
$$;

create trigger on_school_created
  after insert on public.schools
  for each row execute function private.handle_new_school();

-- New catalog feature -> disabled row for every existing school
create function private.handle_new_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_features (school_id, feature_key, enabled)
  select s.id, new.key, false from public.schools s
  on conflict (school_id, feature_key) do nothing;
  return new;
end;
$$;

create trigger on_feature_created
  after insert on public.features
  for each row execute function private.handle_new_feature();

-- ---------------------------------------------------------------------------
-- Guard triggers: column-level rules RLS cannot express.
-- They only constrain API callers (authenticated/anon). Trusted server
-- contexts (service_role, postgres, migrations) are not restricted.
-- These functions are SECURITY INVOKER so current_user is the API role.
-- ---------------------------------------------------------------------------
create function private.guard_school_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if not private.is_super_admin()
     and (new.code is distinct from old.code or new.status is distinct from old.status) then
    raise exception 'Only platform administrators can change a school''s code or status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger schools_guard_update
  before update on public.schools
  for each row execute function private.guard_school_update();

create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Identity columns are immutable through the API.
  if new.user_id is distinct from old.user_id or new.email is distinct from old.email then
    raise exception 'This field cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.school_id is distinct from old.school_id then

    if private.is_super_admin() then
      -- Super admin role is only granted through the service key / SQL.
      if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
        raise exception 'Platform administrators can only be created by the platform owner'
          using errcode = '42501';
      end if;
      if old.user_id = (select auth.uid()) then
        raise exception 'You cannot change your own role or status' using errcode = '42501';
      end if;
      return new;
    end if;

    -- School admins: manage non-admin members of their own school only.
    if private.is_school_admin_of(old.school_id)
       and new.school_id is not distinct from old.school_id
       and old.user_id <> (select auth.uid())
       and old.role in ('teacher', 'student', 'parent')
       and new.role in ('teacher', 'student', 'parent') then
      return new;
    end if;

    raise exception 'You do not have permission to change role, status or school'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Public RPCs (callable from web and Flutter via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Everything a client needs after sign-in, in one round trip:
-- profile, school, branding, role and enabled features.
-- Returns the caller's own profile even when pending/inactive so the UI can
-- explain why access is limited; features are only listed for active access.
create function public.get_my_context()
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
      'primary_color', st.primary_color, 'academic_year', st.academic_year
    ) end,
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

-- Is `feature` enabled for the caller's school? (false when signed out/inactive)
create function public.has_feature(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.school_has_feature(private.my_school_id(), feature), false)
$$;

-- Lets the registration form validate a school code before sign-up.
-- Reveals only whether an ACTIVE school uses that code.
create function public.school_code_is_valid(school_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.schools
    where code = upper(btrim(school_code)) and status = 'active'
  )
$$;

revoke all on function public.get_my_context() from public, anon;
revoke all on function public.has_feature(text) from public, anon;
revoke all on function public.school_code_is_valid(text) from public;
grant execute on function public.get_my_context() to authenticated;
grant execute on function public.has_feature(text) to authenticated;
grant execute on function public.school_code_is_valid(text) to anon, authenticated;

-- Trigger functions are never called directly.
revoke all on function private.handle_new_user() from public, authenticated;
revoke all on function private.handle_provisioned_user() from public, authenticated;
revoke all on function private.sync_user_email() from public, authenticated;
revoke all on function private.handle_new_school() from public, authenticated;
revoke all on function private.handle_new_feature() from public, authenticated;
revoke all on function private.guard_school_update() from public, authenticated;
revoke all on function private.guard_profile_update() from public, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
