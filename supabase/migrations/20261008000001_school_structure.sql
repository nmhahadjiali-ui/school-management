-- =============================================================================
-- Phase 2: core school structure
--
-- Tenant integrity is enforced DECLARATIVELY: every parent table exposes
-- UNIQUE (school_id, id) and every child references it with a COMPOSITE foreign
-- key (school_id, parent_id). A row can therefore never point at another
-- school's row, whatever the application sends.
--
-- History is preserved: no hard deletes of records, enrollments are one row
-- per student per year (per placement), and closed enrollments are immutable.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.academic_year_status as enum ('planned', 'active', 'archived');
create type public.record_status as enum ('active', 'inactive');
create type public.student_status as enum ('active', 'inactive', 'graduated', 'transferred', 'withdrawn');
create type public.teacher_status as enum ('active', 'inactive', 'resigned', 'retired');
create type public.enrollment_status as enum ('enrolled', 'completed', 'transferred', 'withdrawn');
create type public.gender as enum ('male', 'female', 'other', 'unspecified');
create type public.guardian_relationship as enum ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other');

-- Shared value checks
create domain public.email_address as text
  check (value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(value) <= 254);
create domain public.http_url as text
  check (value ~* '^https?://' and char_length(value) <= 2000);

-- ---------------------------------------------------------------------------
-- academic_years
-- ---------------------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 50),
  start_date  date not null,
  end_date    date not null,
  status      public.academic_year_status not null default 'planned',
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_dates check (start_date < end_date),
  constraint academic_years_current_is_active check (not is_current or status = 'active'),
  constraint academic_years_school_id_key unique (school_id, id)
);
create unique index academic_years_school_name_key on public.academic_years (school_id, lower(name));
-- At most one current academic year per school.
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;
create index academic_years_school_start_idx on public.academic_years (school_id, start_date desc);

-- ---------------------------------------------------------------------------
-- grade_levels (configured per school: Nursery, Kinder, Grade 1, ...)
-- ---------------------------------------------------------------------------
create table public.grade_levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  code        text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  sort_order  integer not null default 0 check (sort_order between -1000 and 1000),
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint grade_levels_school_id_key unique (school_id, id)
);
create unique index grade_levels_school_code_key on public.grade_levels (school_id, lower(code));
create unique index grade_levels_school_name_key on public.grade_levels (school_id, lower(name));
create index grade_levels_school_order_idx on public.grade_levels (school_id, sort_order);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  code        text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  description text check (description is null or char_length(description) <= 1000),
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint subjects_school_id_key unique (school_id, id)
);
create unique index subjects_school_code_key on public.subjects (school_id, lower(code));
create unique index subjects_school_name_key on public.subjects (school_id, lower(name));

-- ---------------------------------------------------------------------------
-- teachers (user_id links an Auth account when the teacher has app access)
-- ---------------------------------------------------------------------------
create table public.teachers (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  user_id          uuid unique references auth.users (id) on delete set null,
  employee_number  text check (employee_number is null or char_length(btrim(employee_number)) between 1 and 50),
  first_name       text not null check (char_length(btrim(first_name)) between 1 and 100),
  middle_name      text check (middle_name is null or char_length(middle_name) <= 100),
  last_name        text not null check (char_length(btrim(last_name)) between 1 and 100),
  email            public.email_address,
  phone            text check (phone is null or char_length(phone) <= 40),
  specialization   text check (specialization is null or char_length(specialization) <= 200),
  status           public.teacher_status not null default 'active',
  search_text      text generated always as (
                     lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name || ' ' ||
                           coalesce(employee_number, '') || ' ' || coalesce(email::text, ''))
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint teachers_school_id_key unique (school_id, id)
);
create unique index teachers_school_employee_number_key
  on public.teachers (school_id, lower(employee_number)) where employee_number is not null;
create index teachers_school_name_idx on public.teachers (school_id, last_name, first_name);
create index teachers_search_idx on public.teachers using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- sections: one school, one academic year, one grade level
-- ---------------------------------------------------------------------------
create table public.sections (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete restrict,
  academic_year_id    uuid not null,
  grade_level_id      uuid not null,
  name                text not null check (char_length(btrim(name)) between 1 and 60),
  code                text check (code is null or code ~ '^[A-Za-z0-9_-]{1,20}$'),
  capacity            integer check (capacity is null or capacity between 1 and 1000),
  room                text check (room is null or char_length(room) <= 60),
  adviser_teacher_id  uuid,
  status              public.record_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sections_year_fkey foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id),
  constraint sections_grade_level_fkey foreign key (school_id, grade_level_id)
    references public.grade_levels (school_id, id),
  -- Adviser must be a teacher of the SAME school (NULL = no adviser).
  constraint sections_adviser_fkey foreign key (school_id, adviser_teacher_id)
    references public.teachers (school_id, id),
  constraint sections_school_id_key unique (school_id, id),
  constraint sections_school_year_id_key unique (school_id, academic_year_id, id),
  constraint sections_school_year_grade_id_key unique (school_id, academic_year_id, grade_level_id, id)
);
create unique index sections_year_grade_name_key on public.sections (academic_year_id, grade_level_id, lower(name));
create unique index sections_year_code_key on public.sections (academic_year_id, lower(code)) where code is not null;
create index sections_school_year_grade_idx on public.sections (school_id, academic_year_id, grade_level_id);
create index sections_adviser_idx on public.sections (adviser_teacher_id) where adviser_teacher_id is not null;

-- ---------------------------------------------------------------------------
-- students (user_id nullable: records exist before any login)
-- ---------------------------------------------------------------------------
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  user_id         uuid unique references auth.users (id) on delete set null,
  -- Unique per school, NOT globally (School A and B may both have 2026-0001).
  student_number  text not null check (char_length(btrim(student_number)) between 1 and 50),
  first_name      text not null check (char_length(btrim(first_name)) between 1 and 100),
  middle_name     text check (middle_name is null or char_length(middle_name) <= 100),
  last_name       text not null check (char_length(btrim(last_name)) between 1 and 100),
  suffix          text check (suffix is null or char_length(suffix) <= 20),
  date_of_birth   date check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  gender          public.gender,
  email           public.email_address,
  phone           text check (phone is null or char_length(phone) <= 40),
  address         text check (address is null or char_length(address) <= 500),
  photo_url       public.http_url,
  status          public.student_status not null default 'active',
  search_text     text generated always as (
                    lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name || ' ' ||
                          student_number || ' ' || coalesce(email::text, ''))
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint students_school_id_key unique (school_id, id),
  constraint students_school_number_key unique (school_id, student_number)
);
create index students_school_status_name_idx on public.students (school_id, status, last_name, first_name);
create index students_search_idx on public.students using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- guardians (parents / guardians; login optional)
-- ---------------------------------------------------------------------------
create table public.guardians (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  user_id      uuid unique references auth.users (id) on delete set null,
  first_name   text not null check (char_length(btrim(first_name)) between 1 and 100),
  middle_name  text check (middle_name is null or char_length(middle_name) <= 100),
  last_name    text not null check (char_length(btrim(last_name)) between 1 and 100),
  email        public.email_address,
  phone        text check (phone is null or char_length(phone) <= 40),
  address      text check (address is null or char_length(address) <= 500),
  occupation   text check (occupation is null or char_length(occupation) <= 100),
  status       public.record_status not null default 'active',
  search_text  text generated always as (
                 lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name || ' ' ||
                       coalesce(email::text, '') || ' ' || coalesce(phone, ''))
               ) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint guardians_school_id_key unique (school_id, id)
);
create index guardians_school_name_idx on public.guardians (school_id, last_name, first_name);
create index guardians_search_idx on public.guardians using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- student_guardians: many-to-many (families with several children, children
-- with several guardians). Both ends must belong to the same school.
-- ---------------------------------------------------------------------------
create table public.student_guardians (
  id                         uuid primary key default gen_random_uuid(),
  school_id                  uuid not null references public.schools (id) on delete restrict,
  student_id                 uuid not null,
  guardian_id                uuid not null,
  relationship_type          public.guardian_relationship not null,
  is_primary                 boolean not null default false,
  can_pickup                 boolean not null default false,
  can_receive_notifications  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint student_guardians_student_fkey foreign key (school_id, student_id)
    references public.students (school_id, id),
  constraint student_guardians_guardian_fkey foreign key (school_id, guardian_id)
    references public.guardians (school_id, id),
  constraint student_guardians_pair_key unique (student_id, guardian_id)
);
create unique index student_guardians_one_primary on public.student_guardians (student_id) where is_primary;
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

-- ---------------------------------------------------------------------------
-- student_enrollments: the student's placement per academic year.
-- Never overwritten across years; a mid-year section move closes the old row
-- (status 'transferred') and opens a new one, so history is complete.
-- ---------------------------------------------------------------------------
create table public.student_enrollments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  academic_year_id   uuid not null,
  student_id         uuid not null,
  grade_level_id     uuid not null,
  section_id         uuid,
  enrollment_status  public.enrollment_status not null default 'enrolled',
  enrollment_date    date not null default current_date,
  exit_date          date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint student_enrollments_year_fkey foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id),
  constraint student_enrollments_student_fkey foreign key (school_id, student_id)
    references public.students (school_id, id),
  constraint student_enrollments_grade_level_fkey foreign key (school_id, grade_level_id)
    references public.grade_levels (school_id, id),
  -- The section must be in the same school, the same academic year AND the same grade level.
  constraint student_enrollments_section_fkey foreign key (school_id, academic_year_id, grade_level_id, section_id)
    references public.sections (school_id, academic_year_id, grade_level_id, id),
  constraint student_enrollments_exit_after_entry check (exit_date is null or exit_date >= enrollment_date),
  constraint student_enrollments_open_has_no_exit check (enrollment_status <> 'enrolled' or exit_date is null)
);
-- A student has at most one OPEN enrollment per academic year.
create unique index student_enrollments_one_open_per_year
  on public.student_enrollments (student_id, academic_year_id) where enrollment_status = 'enrolled';
create index student_enrollments_student_idx on public.student_enrollments (student_id, enrollment_date desc);
create index student_enrollments_school_year_idx on public.student_enrollments (school_id, academic_year_id, grade_level_id);
create index student_enrollments_section_idx on public.student_enrollments (section_id) where section_id is not null;

-- ---------------------------------------------------------------------------
-- teacher_subject_assignments: teacher × subject × section (per year)
-- ---------------------------------------------------------------------------
create table public.teacher_subject_assignments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  teacher_id        uuid not null,
  subject_id        uuid not null,
  section_id        uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tsa_year_fkey foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id),
  constraint tsa_teacher_fkey foreign key (school_id, teacher_id)
    references public.teachers (school_id, id),
  constraint tsa_subject_fkey foreign key (school_id, subject_id)
    references public.subjects (school_id, id),
  -- Section must be in the same school and the same academic year.
  constraint tsa_section_fkey foreign key (school_id, academic_year_id, section_id)
    references public.sections (school_id, academic_year_id, id),
  constraint tsa_unique_assignment unique (section_id, subject_id, teacher_id)
);
create index tsa_teacher_year_idx on public.teacher_subject_assignments (teacher_id, academic_year_id);
create index tsa_school_year_idx on public.teacher_subject_assignments (school_id, academic_year_id);
create index tsa_subject_idx on public.teacher_subject_assignments (subject_id);

-- ---------------------------------------------------------------------------
-- invitations: tracks account invitations for teacher/student/guardian
-- records. The secret is Supabase Auth's one-time, expiring email token; no
-- token is stored here.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  email        public.email_address not null,
  role         public.app_role not null check (role in ('teacher', 'student', 'parent')),
  user_id      uuid references auth.users (id) on delete set null,
  teacher_id   uuid,
  student_id   uuid,
  guardian_id  uuid,
  invited_by   uuid references auth.users (id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint invitations_teacher_fkey foreign key (school_id, teacher_id) references public.teachers (school_id, id),
  constraint invitations_student_fkey foreign key (school_id, student_id) references public.students (school_id, id),
  constraint invitations_guardian_fkey foreign key (school_id, guardian_id) references public.guardians (school_id, id),
  constraint invitations_one_record check (num_nonnulls(teacher_id, student_id, guardian_id) = 1),
  constraint invitations_role_matches_record check (
    (role = 'teacher' and teacher_id is not null) or
    (role = 'student' and student_id is not null) or
    (role = 'parent' and guardian_id is not null)
  )
);
-- One open invitation per record.
create unique index invitations_one_open_per_record
  on public.invitations ((coalesce(teacher_id, student_id, guardian_id)))
  where accepted_at is null and revoked_at is null;
create index invitations_school_created_idx on public.invitations (school_id, created_at desc);
create index invitations_user_idx on public.invitations (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['academic_years', 'grade_levels', 'subjects', 'teachers', 'sections', 'students',
                           'guardians', 'student_guardians', 'student_enrollments',
                           'teacher_subject_assignments', 'invitations']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;
