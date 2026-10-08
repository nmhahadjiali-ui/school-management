# Phase 2 — Core school structure

Builds on Phase 1 (see `ARCHITECTURE.md`). Same rules: one codebase, one
database, many schools, isolation enforced by PostgreSQL.

Migrations: `supabase/migrations/20261008000001`–`…04`.

## Changes to Phase 1 (and why)

| Problem found in Phase 1 | Resolution |
| --- | --- |
| `school_settings.academic_year/_start/_end` would duplicate `academic_years` | Values migrated into `academic_years`, columns dropped; `get_my_context()` now returns `current_academic_year` |
| Login accounts (`profiles`) were not linked to school records | `user_id` on `teachers`/`students`/`guardians`, validated by trigger (same school + matching role); a linked profile's role/school cannot change |
| Provisioning created bare profiles | The provisioning trigger can link a record atomically (used by invitations); admins can link self-registered accounts |
| RLS only knew "admin" vs "self" | New helpers: my teacher/student/guardian id; visible sections/students for teachers, students, parents |
| Streaming (`loading.tsx`) turned redirects/404s into HTTP 200 | New pages authorize **before** any Suspense boundary and stream only their data, so denials stay 307/404 |
| Dashboard stats counted login accounts | Now count records: open enrollments in the current year, active teachers/guardians, active sections |

## Database relationships

```
schools ─┬─ academic_years ─┬─ sections ◄── grade_levels
         │   (is_current:    │     │  └── adviser_teacher_id → teachers
         │    one per school)│     │
         │                   │     ├── teacher_subject_assignments ── teachers
         │                   │     │        (year, teacher, subject, section)   └── subjects
         │                   │     │
         │                   └── student_enrollments ── students ── student_guardians ── guardians
         │                         (year, grade, section?,           (relationship, primary,
         │                          status, dates)                     pickup, notifications)
         └─ invitations → teacher | student | guardian (+ auth user)

teachers.user_id / students.user_id / guardians.user_id → auth.users (nullable; login optional)
```

| Table | Unique within a school | Notes |
| --- | --- | --- |
| `academic_years` | name; **one `is_current`** (partial unique index) | status planned → active → archived; current must be active; start < end |
| `grade_levels` | code, name (case-insensitive) | `sort_order` controls display; each school defines its own |
| `subjects` | code, name (case-insensitive) | |
| `sections` | name per (year, grade); code per year | capacity (enforced), room, optional adviser |
| `teachers` | employee number (when set) | status active/inactive/resigned/retired |
| `students` | **student number** (`UNIQUE (school_id, student_number)`) | status active/inactive/graduated/transferred/withdrawn |
| `guardians` | — | status active/inactive |
| `student_guardians` | (student, guardian); one primary per student | many-to-many |
| `student_enrollments` | **one open enrollment per student per year** | see history below |
| `teacher_subject_assignments` | (section, subject, teacher) | |
| `invitations` | one open invitation per record | no secrets stored |

### How cross-school references are made impossible

Every parent table has `UNIQUE (school_id, id)`; every child references it with
a **composite foreign key** `(school_id, parent_id)`. A School A enrollment can
therefore only point at School A students, sections, grade levels and years —
the database rejects anything else (`23503`), regardless of RLS or the app.
Tighter composite keys encode further rules:

* enrollment → section via `(school_id, academic_year_id, grade_level_id, section_id)`: the section must be in the **same year and grade** as the enrollment;
* assignment → section via `(school_id, academic_year_id, section_id)`: same year;
* section → adviser via `(school_id, adviser_teacher_id)`: adviser must be a teacher of the same school.

`school_id` itself is immutable on every table (trigger), so a row cannot be
moved to another tenant.

## How student history is preserved

* Placement lives in `student_enrollments`, never on `students`. A student has
  one row per year (and per placement within a year).
* An enrollment's student, year, grade and start date can never change. A
  section can be filled in once (unsectioned → section).
* Moving sections mid-year uses `transfer_enrollment()`: the open row is closed
  as `transferred` with an exit date, and a new row starts. Both remain.
* Closing (`completed`/`transferred`/`withdrawn`) is final: closed rows are immutable.
* `archive_academic_year()` closes the year's open enrollments as `completed`,
  then the year becomes read-only — no section, enrollment or assignment in an
  archived year can be inserted or changed, **even with the service key**.
* Records are never deleted through the API; status columns are used instead.

```
John Doe:  2025-2026  Grade 5  Section A  completed    2025-06-01 → 2026-03-31
           2026-2027  Grade 6  Section A  transferred  2026-06-01 → 2026-09-01
           2026-2027  Grade 6  Section B  enrolled     2026-09-01 → (open)
```

Future grades and attendance will reference `student_enrollments.id` (and
`teacher_subject_assignments.id`), so every mark is tied to the exact placement
and teacher it belonged to, and report cards/transcripts can be rebuilt for any year.

## How school isolation works

1. **Identity:** the caller's school and role come from their profile
   (`private.my_school_id()`, `private.my_role()`), never from the request.
2. **RLS on all 11 new tables** (default deny, no `anon` access). Writes require
   `private.can_manage_school(school_id)` = super admin, or school admin of that school.
3. **Composite foreign keys** make cross-school references impossible (above).
4. **Server actions** take `school_id` from the session (a forged `school_id`
   form field is ignored — tested), and every bound id is re-checked by RLS.
5. **Lists** always filter by the session's school id and page on the server
   (20 rows per request; lookups return at most 10).

## How teachers are assigned

* **Adviser / class teacher:** `sections.adviser_teacher_id` (optional, one per section).
* **Subject teaching:** `teacher_subject_assignments` rows of (academic year,
  teacher, subject, section). A teacher can have any number: several subjects,
  sections and grade levels; several teachers can share a section.
* A teacher sees exactly the sections they advise or teach in
  (`private.my_teacher_section_ids()`), and the students enrolled in those
  sections — current and past. A teacher whose record is not `active`
  (resigned/retired/inactive) loses that access immediately.

## How parent–child relationships work

* `guardians` hold the person; `student_guardians` hold each relationship
  (type, primary contact, pickup permission, notification preference).
* Many-to-many: one guardian → many children (family accounts), one student →
  many guardians; at most one primary per student.
* A parent account is linked to its guardian record (`guardians.user_id`). The
  parent then sees only their linked children, those children's enrollments and
  sections, and their own guardian record — never other guardians or students,
  and nothing from other schools.

## Roles and permissions

| | Super admin | School admin | Teacher | Student | Parent |
| --- | --- | --- | --- | --- | --- |
| Years, grades, subjects | all schools (API) | manage (own school) | read (own school) | read | read |
| Sections | all | manage | own sections | own | children's |
| Students | all | manage | in own sections | self | own children |
| Teachers | all | manage | self | — | — |
| Guardians | all | manage | — | — | self |
| Student ↔ guardian links | all | manage | — | own | own |
| Enrollments | all | manage | own sections | own | children's |
| Teacher assignments | all | manage | own | — | — |
| Invitations | all | manage | — | — | — |

Enforced by RLS (`supabase/migrations/…_school_structure_rls.sql`). The UI
mirrors it with the permissions `school.records.manage`, `teacher.classes`,
`parent.children` (`src/lib/auth/permissions.ts`). Super admins use the
platform pages; school management screens are for school admins.

## Invitations

1. Admin clicks **Send invitation** on a teacher/student/guardian profile (record must have an email and no account).
2. Supabase Auth creates the user and emails a **one-time, 24-hour** link
   (`supabase/templates/invite.html` → `/auth/confirm?token_hash=…&type=invite`).
   The token is a hash Supabase verifies once; it never reaches our database or logs.
3. Service-role `app_metadata` tells the provisioning trigger to create the
   profile (school, role) **and** link the record in the same transaction; an
   invitation row records who/when/expiry. Failures roll back the auth user.
4. The user lands on `/accept-invite`, sets their own password; `accept_invitation()` marks it accepted.
5. Admins can **revoke** an open invitation (unused account deleted, link dead)
   and invite again. Self-registered accounts can be attached with **Link existing account**.

Production: set the same invite template in Supabase → Authentication → Email
Templates, and keep the email OTP expiry at 24 h (or adjust `INVITATION_TTL_HOURS`).

## UI

School admin navigation: *Academics* (Academic Years, Grade Levels, Sections,
Subjects, Enrollments, Teacher Assignments), *People* (Students, Teachers,
Parents & Guardians, User Accounts), *School* (School, Settings).
Teachers get **My Classes**, parents **My Children**.

Reusable pieces: `ListToolbar` (debounced search + filters in the URL),
`SortTh`, `Pagination`, `TableSkeleton` (`src/components/data/`), `FormDialog`,
`ConfirmAction`, toasts, `RecordPicker` (server-side search for large lists),
and field groups in `src/components/school/fields.tsx`.

## How this prepares Phase 3 (grades, attendance, scheduling, notifications, payments, mobile)

* **Grades:** `grades(school_id, enrollment_id, assignment_id, …)` with composite
  FKs to `student_enrollments` and `teacher_subject_assignments` — a mark is
  tied to the student's placement *and* the teacher/subject that gave it.
  Grading periods hang off `academic_years`; `school_settings.grading_config` holds scales.
* **Attendance:** `attendance(school_id, enrollment_id, section_id, date, status)`;
  teachers already see exactly their sections' students through RLS.
* **Scheduling:** timetable slots reference `teacher_subject_assignments` (who
  teaches what where) plus rooms already on `sections`.
* **Notifications / SMS:** `student_guardians.can_receive_notifications` and
  `is_primary` decide recipients; gated by `private.school_has_feature()`.
* **Payments:** billed per student per academic year → `student_enrollments`.
* **History is already immutable**, so report cards and transcripts can be
  regenerated for any past year.
* **Flutter:** same tables, same RLS; `get_my_context()` now also returns
  `current_academic_year` and the linked `record` (`{type, id}`), so the app
  knows whether it is showing a teacher, student or parent view in one call.
