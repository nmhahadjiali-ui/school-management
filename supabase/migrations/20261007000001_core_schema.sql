-- =============================================================================
-- Core multi-tenant schema
--
-- ONE platform -> MANY schools -> ONE codebase -> SHARED database.
-- Every school-specific row carries a school_id. Tenant isolation is enforced by
-- Row Level Security (see 20261007000003_rls.sql), never by the client.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'school_admin', 'teacher', 'student', 'parent');
create type public.school_status as enum ('active', 'inactive');
-- pending  = self-registered, awaiting approval by a school admin
-- active   = may use the platform
-- inactive = disabled by an administrator
create type public.profile_status as enum ('pending', 'active', 'inactive');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- schools: one row per tenant
-- ---------------------------------------------------------------------------
create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 200),
  -- Short, human-friendly, globally unique join code (e.g. "NHS-01").
  code          text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  logo_url      text check (logo_url is null or logo_url ~* '^https?://'),
  address       text check (address is null or char_length(address) <= 500),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  timezone      text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  status        public.school_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index schools_status_idx on public.schools (status);
create index schools_created_at_idx on public.schools (created_at desc);

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user. Passwords live only in auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  school_id   uuid references public.schools (id) on delete restrict,
  -- Mirrored from auth.users so admins can list users without the service key.
  email       text not null,
  first_name  text not null default '' check (char_length(first_name) <= 100),
  last_name   text not null default '' check (char_length(last_name) <= 100),
  phone       text check (phone is null or char_length(phone) <= 40),
  avatar_url  text check (avatar_url is null or avatar_url ~* '^https?://'),
  role        public.app_role not null,
  status      public.profile_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Super admins are platform-level (no school); everyone else belongs to exactly one school.
  constraint profiles_school_matches_role
    check ((role = 'super_admin') = (school_id is null))
);

create index profiles_school_role_idx on public.profiles (school_id, role);
create index profiles_school_status_idx on public.profiles (school_id, status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- school_settings: one configurable row per school
-- (timezone and logo live on schools to avoid duplication)
-- ---------------------------------------------------------------------------
create table public.school_settings (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null unique references public.schools (id) on delete cascade,
  academic_year        text check (academic_year is null or academic_year ~ '^\d{4}-\d{4}$'),
  academic_year_start  date,
  academic_year_end    date,
  primary_color        text not null default '#1d4ed8' check (primary_color ~* '^#[0-9a-f]{6}$'),
  -- Placeholders for future modules. Shape is owned by those modules.
  grading_config       jsonb not null default '{}'::jsonb check (jsonb_typeof(grading_config) = 'object'),
  attendance_config    jsonb not null default '{}'::jsonb check (jsonb_typeof(attendance_config) = 'object'),
  branding             jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint school_settings_year_range
    check (academic_year_start is null or academic_year_end is null or academic_year_start < academic_year_end)
);

create trigger school_settings_set_updated_at
  before update on public.school_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- features: platform catalog of optional modules (not tenant data)
-- ---------------------------------------------------------------------------
create table public.features (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]{1,49}$'),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger features_set_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();

insert into public.features (key, name, description) values
  ('sms',               'SMS',               'Send SMS messages to parents and staff.'),
  ('payments',          'Payments',          'Collect fees and record payments.'),
  ('library',           'Library',           'Catalogue and lend library books.'),
  ('inventory',         'Inventory',         'Track school assets and supplies.'),
  ('online_enrollment', 'Online Enrollment', 'Accept student applications online.'),
  ('advanced_reports',  'Advanced Reports',  'Extended analytics and exports.'),
  ('parent_portal',     'Parent Portal',     'Give parents access to their children''s information.'),
  ('notifications',     'Notifications',     'In-app and push notifications.');

-- ---------------------------------------------------------------------------
-- school_features: per-school feature flags
-- configuration must NOT hold secrets (use Supabase Vault for API keys).
-- ---------------------------------------------------------------------------
create table public.school_features (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  feature_key   text not null references public.features (key) on update cascade on delete cascade,
  enabled       boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, feature_key)
);

create index school_features_enabled_idx on public.school_features (school_id) where enabled;

create trigger school_features_set_updated_at
  before update on public.school_features
  for each row execute function public.set_updated_at();
