-- =============================================================================
-- Phase 3: academic operations (schema)
--
-- Every academic record is anchored to the student's ENROLLMENT in a specific
-- section and academic year, and to the TEACHER ASSIGNMENT (year, section,
-- subject, teacher) it belongs to, via composite foreign keys. The database
-- therefore guarantees, for every row:
--   * same school end to end (no cross-tenant references);
--   * the enrollment is in the same year and section as the record;
--   * the teacher actually teaches that subject in that section that year.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Phase 2 adjustments: keys that Phase 3 composite foreign keys reference
-- ---------------------------------------------------------------------------
alter table public.student_enrollments
  add constraint student_enrollments_school_year_section_id_key unique (school_id, academic_year_id, section_id, id),
  add constraint student_enrollments_school_student_id_key unique (school_id, student_id, id);

alter table public.teacher_subject_assignments
  add constraint tsa_school_year_section_subject_teacher_key
    unique (school_id, academic_year_id, section_id, subject_id, teacher_id);

-- ---------------------------------------------------------------------------
-- Phase 1 adjustment: typed school policies replace the untyped JSON placeholders
-- ---------------------------------------------------------------------------
alter table public.school_settings
  drop column grading_config,
  drop column attendance_config,
  -- Teachers may edit attendance up to N days back (NULL = no limit, 0 = same day only).
  -- School admins can always edit, lock and unlock.
  add column attendance_edit_days integer default 7 check (attendance_edit_days is null or attendance_edit_days between 0 and 365),
  add column enforce_room_conflicts boolean not null default true,
  add column grade_max_score numeric(6,2) not null default 100 check (grade_max_score > 0 and grade_max_score <= 1000),
  add column grade_passing_score numeric(6,2) not null default 75 check (grade_passing_score >= 0),
  add constraint school_settings_passing_within_max check (grade_passing_score <= grade_max_score);

-- ---------------------------------------------------------------------------
-- Feature flags: core modules on by default, still switchable per school
-- ---------------------------------------------------------------------------
alter table public.features add column default_enabled boolean not null default false;

create or replace function private.handle_new_school()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_settings (school_id) values (new.id);
  insert into public.school_features (school_id, feature_key, enabled)
  select new.id, f.key, f.default_enabled from public.features f;
  return new;
end;
$$;

create or replace function private.handle_new_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_features (school_id, feature_key, enabled)
  select s.id, new.key, new.default_enabled from public.schools s
  on conflict (school_id, feature_key) do nothing;
  return new;
end;
$$;

update public.features set default_enabled = true where key = 'notifications';
update public.school_features set enabled = true where feature_key = 'notifications';

insert into public.features (key, name, description, default_enabled) values
  ('schedules',  'Schedules',   'Class and subject timetables.', true),
  ('attendance', 'Attendance',  'Daily and subject attendance with reports.', true),
  ('grades',     'Grades',      'Grading periods, grade entry, review and history.', true),
  ('coursework', 'Assignments', 'Homework and coursework with submissions.', true);

-- ---------------------------------------------------------------------------
-- Enumerations (extendable later with ALTER TYPE ... ADD VALUE, no rewrite)
-- ---------------------------------------------------------------------------
create type public.grading_period_status as enum ('upcoming', 'open', 'closed');
create type public.schedule_status as enum ('active', 'inactive');
create type public.attendance_session_type as enum ('daily', 'subject', 'event', 'custom');
create type public.attendance_session_status as enum ('open', 'locked');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.grade_status as enum ('draft', 'submitted', 'approved', 'locked');
create type public.coursework_status as enum ('draft', 'published', 'archived');
create type public.submission_status as enum ('submitted', 'late', 'reviewed');
create type public.notification_type as enum
  ('assignment_created', 'assignment_due', 'attendance_recorded', 'grade_published', 'announcement', 'system');

-- ---------------------------------------------------------------------------
-- grading_periods: configurable per school and year (quarters, semesters, terms)
-- ---------------------------------------------------------------------------
create table public.grading_periods (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  code              text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  sequence          smallint not null check (sequence between 1 and 20),
  start_date        date not null,
  end_date          date not null,
  status            public.grading_period_status not null default 'upcoming',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint grading_periods_year_fkey foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id),
  constraint grading_periods_dates check (start_date < end_date),
  constraint grading_periods_school_id_key unique (school_id, id),
  constraint grading_periods_school_year_id_key unique (school_id, academic_year_id, id),
  constraint grading_periods_year_sequence_key unique (academic_year_id, sequence),
  -- Periods of one year never overlap.
  constraint grading_periods_no_overlap exclude using gist
    (academic_year_id with =, daterange(start_date, end_date, '[]') with &&)
);
create unique index grading_periods_year_code_key on public.grading_periods (academic_year_id, lower(code));
create unique index grading_periods_year_name_key on public.grading_periods (academic_year_id, lower(name));

-- ---------------------------------------------------------------------------
-- grading_scales: each school's own descriptors (e.g. 90-100 Excellent)
-- A score maps to the band with the highest minimum_score <= score.
-- ---------------------------------------------------------------------------
create table public.grading_scales (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete restrict,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  minimum_score  numeric(6,2) not null check (minimum_score >= 0),
  maximum_score  numeric(6,2) not null,
  equivalent     text check (equivalent is null or char_length(equivalent) <= 20),
  description    text check (description is null or char_length(description) <= 500),
  is_passing     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint grading_scales_range check (minimum_score <= maximum_score),
  constraint grading_scales_no_overlap exclude using gist
    (school_id with =, numrange(minimum_score, maximum_score, '[]') with &&)
);
create unique index grading_scales_school_name_key on public.grading_scales (school_id, lower(name));

-- ---------------------------------------------------------------------------
-- class_schedules: weekly timetable entries
-- ---------------------------------------------------------------------------
create table public.class_schedules (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  section_id        uuid not null,
  subject_id        uuid not null,
  teacher_id        uuid not null,
  day_of_week       smallint not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
  start_time        time not null,
  end_time          time not null,
  room              text check (room is null or char_length(btrim(room)) between 1 and 60),
  status            public.schedule_status not null default 'active',
  -- Minutes since midnight as a half-open range: 08:00-09:00 does not overlap 09:00-10:00.
  minutes           int4range generated always as (int4range(
                      (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
                      (extract(hour from end_time) * 60 + extract(minute from end_time))::int)) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint class_schedules_times check (start_time < end_time),
  -- Direct same-school references (redundant with the composite keys; used for joins).
  constraint class_schedules_section_ref foreign key (school_id, academic_year_id, section_id) references public.sections (school_id, academic_year_id, id),
  constraint class_schedules_subject_ref foreign key (school_id, subject_id) references public.subjects (school_id, id),
  constraint class_schedules_teacher_ref foreign key (school_id, teacher_id) references public.teachers (school_id, id),
  -- The teacher must be assigned to teach this subject in this section this year.
  constraint class_schedules_assignment_fkey foreign key (school_id, academic_year_id, section_id, subject_id, teacher_id)
    references public.teacher_subject_assignments (school_id, academic_year_id, section_id, subject_id, teacher_id),
  -- Conflict detection, enforced by PostgreSQL itself:
  constraint class_schedules_teacher_conflict exclude using gist
    (teacher_id with =, academic_year_id with =, day_of_week with =, minutes with &&) where (status = 'active'),
  constraint class_schedules_section_conflict exclude using gist
    (section_id with =, day_of_week with =, minutes with &&) where (status = 'active')
);
create index class_schedules_school_year_idx on public.class_schedules (school_id, academic_year_id);
create index class_schedules_section_day_idx on public.class_schedules (section_id, day_of_week, start_time);
create index class_schedules_teacher_day_idx on public.class_schedules (teacher_id, day_of_week, start_time);

-- ---------------------------------------------------------------------------
-- attendance_sessions: one per section per day (daily) or per subject per day
-- ---------------------------------------------------------------------------
create table public.attendance_sessions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  section_id        uuid not null,
  subject_id        uuid,
  teacher_id        uuid,
  attendance_date   date not null,
  session_type      public.attendance_session_type not null default 'daily',
  status            public.attendance_session_status not null default 'open',
  created_by        uuid references auth.users (id) on delete set null,
  locked_at         timestamptz,
  locked_by         uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint attendance_sessions_section_fkey foreign key (school_id, academic_year_id, section_id)
    references public.sections (school_id, academic_year_id, id),
  constraint attendance_sessions_subject_fkey foreign key (school_id, subject_id) references public.subjects (school_id, id),
  constraint attendance_sessions_teacher_fkey foreign key (school_id, teacher_id) references public.teachers (school_id, id),
  constraint attendance_sessions_subject_matches_type check ((session_type = 'subject') = (subject_id is not null)),
  constraint attendance_sessions_school_year_section_id_key unique (school_id, academic_year_id, section_id, id)
);
create unique index attendance_sessions_one_daily on public.attendance_sessions (section_id, attendance_date) where session_type = 'daily';
create unique index attendance_sessions_one_subject on public.attendance_sessions (section_id, subject_id, attendance_date) where session_type = 'subject';
create index attendance_sessions_school_date_idx on public.attendance_sessions (school_id, attendance_date);
create index attendance_sessions_teacher_date_idx on public.attendance_sessions (teacher_id, attendance_date);

-- ---------------------------------------------------------------------------
-- attendance_records: one per student per session, tied to the enrollment
-- ---------------------------------------------------------------------------
create table public.attendance_records (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools (id) on delete restrict,
  academic_year_id       uuid not null,
  section_id             uuid not null,
  attendance_session_id  uuid not null,
  student_id             uuid not null,
  enrollment_id          uuid not null,
  status                 public.attendance_status not null,
  remarks                text check (remarks is null or char_length(remarks) <= 500),
  recorded_at            timestamptz not null default now(),
  recorded_by            uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint attendance_records_session_fkey foreign key (school_id, academic_year_id, section_id, attendance_session_id)
    references public.attendance_sessions (school_id, academic_year_id, section_id, id),
  -- The enrollment must be in the same year and section as the session...
  constraint attendance_records_enrollment_fkey foreign key (school_id, academic_year_id, section_id, enrollment_id)
    references public.student_enrollments (school_id, academic_year_id, section_id, id),
  -- ...and belong to this student.
  constraint attendance_records_student_fkey foreign key (school_id, student_id, enrollment_id)
    references public.student_enrollments (school_id, student_id, id),
  constraint attendance_records_one_per_student unique (attendance_session_id, student_id),
  -- Direct same-school references (redundant with the composite keys; used for joins).
  constraint attendance_records_student_ref foreign key (school_id, student_id) references public.students (school_id, id)
);
create index attendance_records_enrollment_idx on public.attendance_records (enrollment_id);
create index attendance_records_student_idx on public.attendance_records (student_id, academic_year_id);
create index attendance_records_section_idx on public.attendance_records (school_id, academic_year_id, section_id);

-- ---------------------------------------------------------------------------
-- grade_records: one per enrollment × subject × grading period
-- ---------------------------------------------------------------------------
create table public.grade_records (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  academic_year_id   uuid not null,
  grading_period_id  uuid not null,
  section_id         uuid not null,
  enrollment_id      uuid not null,
  student_id         uuid not null,
  subject_id         uuid not null,
  teacher_id         uuid not null,
  score              numeric(6,2) not null check (score >= 0),
  remarks            text check (remarks is null or char_length(remarks) <= 500),
  status             public.grade_status not null default 'draft',
  -- Reason for the current change; required when altering a submitted/approved
  -- grade. Copied into grade_change_logs and cleared by the guard trigger.
  change_reason      text check (change_reason is null or char_length(change_reason) <= 500),
  submitted_at       timestamptz,
  approved_at        timestamptz,
  approved_by        uuid references auth.users (id) on delete set null,
  locked_at          timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint grade_records_period_fkey foreign key (school_id, academic_year_id, grading_period_id)
    references public.grading_periods (school_id, academic_year_id, id),
  constraint grade_records_enrollment_fkey foreign key (school_id, academic_year_id, section_id, enrollment_id)
    references public.student_enrollments (school_id, academic_year_id, section_id, id),
  constraint grade_records_student_fkey foreign key (school_id, student_id, enrollment_id)
    references public.student_enrollments (school_id, student_id, id),
  -- The teacher must teach this subject in this section this year.
  constraint grade_records_assignment_fkey foreign key (school_id, academic_year_id, section_id, subject_id, teacher_id)
    references public.teacher_subject_assignments (school_id, academic_year_id, section_id, subject_id, teacher_id),
  constraint grade_records_one_per_period unique (enrollment_id, subject_id, grading_period_id),
  -- Direct same-school references (redundant with the composite keys; used for joins).
  constraint grade_records_student_ref foreign key (school_id, student_id) references public.students (school_id, id),
  constraint grade_records_subject_ref foreign key (school_id, subject_id) references public.subjects (school_id, id),
  constraint grade_records_teacher_ref foreign key (school_id, teacher_id) references public.teachers (school_id, id),
  constraint grade_records_section_ref foreign key (school_id, academic_year_id, section_id) references public.sections (school_id, academic_year_id, id)
);
create index grade_records_entry_idx on public.grade_records (section_id, subject_id, grading_period_id);
create index grade_records_student_idx on public.grade_records (student_id, academic_year_id);
create index grade_records_teacher_idx on public.grade_records (teacher_id, grading_period_id);
create index grade_records_pending_idx on public.grade_records (school_id) where status = 'submitted';

-- ---------------------------------------------------------------------------
-- grade_change_logs: append-only history of every grade change
-- ---------------------------------------------------------------------------
create table public.grade_change_logs (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  -- Deferred: the log row is written by the BEFORE trigger of the grade itself.
  grade_record_id  uuid not null references public.grade_records (id) on delete restrict deferrable initially deferred,
  changed_by       uuid references auth.users (id) on delete set null,
  old_score        numeric(6,2),
  new_score        numeric(6,2),
  old_status       public.grade_status,
  new_status       public.grade_status,
  reason           text,
  changed_at       timestamptz not null default now()
);
create index grade_change_logs_grade_idx on public.grade_change_logs (grade_record_id, changed_at);
create index grade_change_logs_school_idx on public.grade_change_logs (school_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- assignments (coursework). "Teacher assignments" from Phase 2 are the
-- teaching loads these reference.
-- ---------------------------------------------------------------------------
create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  section_id        uuid not null,
  subject_id        uuid not null,
  teacher_id        uuid not null,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  description       text check (description is null or char_length(description) <= 10000),
  due_at            timestamptz,
  status            public.coursework_status not null default 'published',
  -- Optional attachment in Storage (bucket academic-files); only the path is stored.
  attachment_path   text,
  attachment_name   text check (attachment_name is null or char_length(attachment_name) <= 255),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint assignments_teaching_fkey foreign key (school_id, academic_year_id, section_id, subject_id, teacher_id)
    references public.teacher_subject_assignments (school_id, academic_year_id, section_id, subject_id, teacher_id),
  constraint assignments_school_id_key unique (school_id, id),
  constraint assignments_school_year_section_id_key unique (school_id, academic_year_id, section_id, id),
  -- Direct same-school references (redundant with the composite keys; used for joins).
  constraint assignments_section_ref foreign key (school_id, academic_year_id, section_id) references public.sections (school_id, academic_year_id, id),
  constraint assignments_subject_ref foreign key (school_id, subject_id) references public.subjects (school_id, id),
  constraint assignments_teacher_ref foreign key (school_id, teacher_id) references public.teachers (school_id, id),
  constraint assignments_attachment_path check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/assignments/[0-9a-f-]{36}/')
);
create index assignments_section_due_idx on public.assignments (section_id, due_at);
create index assignments_teacher_due_idx on public.assignments (teacher_id, due_at);
create index assignments_school_year_idx on public.assignments (school_id, academic_year_id);

-- ---------------------------------------------------------------------------
-- assignment_submissions (foundation): one per student per assignment
-- ---------------------------------------------------------------------------
create table public.assignment_submissions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  section_id        uuid not null,
  assignment_id     uuid not null,
  student_id        uuid not null,
  enrollment_id     uuid not null,
  status            public.submission_status not null default 'submitted',
  content           text check (content is null or char_length(content) <= 20000),
  file_path         text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/submissions/[0-9a-f-]{36}/[0-9a-f-]{36}/'),
  file_name         text check (file_name is null or char_length(file_name) <= 255),
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint submissions_assignment_fkey foreign key (school_id, academic_year_id, section_id, assignment_id)
    references public.assignments (school_id, academic_year_id, section_id, id),
  constraint submissions_enrollment_fkey foreign key (school_id, academic_year_id, section_id, enrollment_id)
    references public.student_enrollments (school_id, academic_year_id, section_id, id),
  constraint submissions_student_fkey foreign key (school_id, student_id, enrollment_id)
    references public.student_enrollments (school_id, student_id, id),
  constraint submissions_one_per_student unique (assignment_id, student_id),
  constraint submissions_has_content check (content is not null or file_path is not null),
  -- Direct same-school references (redundant with the composite keys; used for joins).
  constraint submissions_student_ref foreign key (school_id, student_id) references public.students (school_id, id)
);
create index submissions_student_idx on public.assignment_submissions (student_id);

-- ---------------------------------------------------------------------------
-- notifications (in-app now; push/email/SMS are future delivery channels)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  recipient_user_id  uuid not null references auth.users (id) on delete cascade,
  type               public.notification_type not null,
  title              text not null check (char_length(title) between 1 and 200),
  message            text not null check (char_length(message) <= 2000),
  data               jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- audit_logs: append-only record of important academic actions
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete restrict,
  actor_user_id  uuid references auth.users (id) on delete set null,
  action         text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity         text not null,
  entity_id      uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at + immutable school_id (reuse Phase 1/2 trigger functions)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grading_periods', 'grading_scales', 'class_schedules', 'attendance_sessions',
                           'attendance_records', 'grade_records', 'assignments', 'assignment_submissions']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
  foreach t in array array['grading_periods', 'grading_scales', 'class_schedules', 'attendance_sessions',
                           'attendance_records', 'grade_records', 'grade_change_logs', 'assignments',
                           'assignment_submissions', 'notifications', 'audit_logs']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.forbid_school_change()',
                   t || '_forbid_school_change', t);
  end loop;
end $$;

-- Archived academic years stay read-only (Phase 2 rule) for the new tables too.
create trigger grading_periods_year_open before insert or update on public.grading_periods
  for each row execute function private.assert_year_open();
create trigger class_schedules_year_open before insert or update on public.class_schedules
  for each row execute function private.assert_year_open();
create trigger attendance_sessions_year_open before insert or update on public.attendance_sessions
  for each row execute function private.assert_year_open();
create trigger attendance_records_year_open before insert or update on public.attendance_records
  for each row execute function private.assert_year_open();
create trigger grade_records_year_open before insert or update on public.grade_records
  for each row execute function private.assert_year_open();
create trigger assignments_year_open before insert or update on public.assignments
  for each row execute function private.assert_year_open();
create trigger submissions_year_open before insert or update on public.assignment_submissions
  for each row execute function private.assert_year_open();
