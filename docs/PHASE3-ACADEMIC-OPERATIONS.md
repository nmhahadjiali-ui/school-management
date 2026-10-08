# Phase 3 — Academic operations

Builds on Phases 1–2. Migrations `supabase/migrations/20261009000001`–`…04`.
Same rules: one codebase, one database, many schools; the database enforces
tenant isolation, roles and history.

```
Teacher → Schedule → Attendance → Assignments → Grades → Student/Parent sees results
```

## Changes to Phases 1–2 (and why)

| Found | Change |
| --- | --- |
| `school_settings.grading_config` / `attendance_config` were untyped JSON placeholders | Replaced by typed, validated policy columns: `attendance_edit_days`, `enforce_room_conflicts`, `grade_max_score`, `grade_passing_score` |
| Teaching loads (`teacher_subject_assignments`) could be deleted freely | Grades, schedules and coursework now reference them by composite key, so a load with history cannot be deleted (friendly message in the UI) |
| Enrollments lacked keys for section-safe references | Added `UNIQUE (school_id, academic_year_id, section_id, id)` and `UNIQUE (school_id, student_id, id)` |
| Feature flags had no "on by default" | `features.default_enabled`; core modules (schedules, attendance, grades, coursework, notifications) start enabled, optional ones disabled |
| "Teacher Assignments" (Phase 2) would be confused with homework "Assignments" | Phase 2 page renamed **Teaching Loads** (`/teaching-loads`); homework lives at `/coursework`, labelled "Assignments" |
| Students/parents need teacher names, but the `teachers` table holds contact/HR data | `visible_teacher_names()` returns only names of the viewer's own (children's) teachers; the table stays closed |
| Local Supabase ran without Storage | Storage enabled (`npm run db:start`) for coursework files |

## New tables

| Table | Purpose | Key integrity rules |
| --- | --- | --- |
| `grading_periods` | Quarters / semesters / terms per school & year | composite FK to the year; dates inside the year; **no overlap** (exclusion constraint); unique order/code/name per year; status upcoming → open → closed |
| `grading_scales` | School's score bands (e.g. 90–100 Outstanding) | **no overlapping ranges** per school (exclusion constraint) |
| `class_schedules` | Weekly timetable rows | composite FK to the teaching load; **teacher and section conflicts are exclusion constraints**; room conflicts by trigger when the school enables them |
| `attendance_sessions` | One per section per day (daily) or per subject per day | date inside the academic year, not in the future; one daily session per section/date |
| `attendance_records` | One per student per session | composite FKs to the session **and** to the enrollment in the same section/year; student must be enrolled on that date |
| `grade_records` | One per enrollment × subject × grading period | composite FKs to the period (same year), the enrollment (same section/year) and the **teaching load** (teacher teaches that subject in that section) |
| `grade_change_logs` | Append-only grade history | written by trigger; update/delete blocked for everyone, including the service key |
| `assignments` | Coursework | composite FK to the teaching load; attachment path must be inside the record's own Storage folder |
| `assignment_submissions` | One per student per assignment | composite FKs to the assignment and the student's enrollment in that section |
| `notifications` | In-app notifications | recipient-only access; created only by database triggers |
| `audit_logs` | Append-only audit trail | written by triggers; update/delete blocked |

## How attendance is associated with enrollment

Each `attendance_records` row stores `enrollment_id` and is bound by two
composite foreign keys:

* `(school_id, academic_year_id, section_id, attendance_session_id)` → the session, and
* `(school_id, academic_year_id, section_id, enrollment_id)` → the enrollment.

Both share the same school, year and section, so a record can only point to an
enrollment **in the section and year of that session**. A trigger also checks
the student was enrolled **on that date** (`enrollment_date ≤ date ≤ exit_date`).
When a student transfers mid-year, attendance before the transfer stays on the
old enrollment and attendance after it on the new one — history is exact.

## How grades are associated with academic year and grading period

`grade_records` references `(school_id, academic_year_id, grading_period_id)` →
`grading_periods`, and the period itself belongs to that academic year. The
enrollment and teaching-load keys repeat the same `academic_year_id`, so a
grade, its period, the student's placement and the teacher's load are
guaranteed to be in **one school and one year**. Exactly one grade exists per
enrollment × subject × period.

## How teachers are authorized to enter grades

Three independent layers:

1. **Database structure:** the grade row's `(school, year, section, subject,
   teacher)` must exist in `teacher_subject_assignments` (composite FK). A
   grade for a subject/section the teacher doesn't teach cannot exist at all.
2. **RLS:** teachers may insert/update only rows where
   `teacher_id = private.my_teacher_id()` — their own record, derived from
   their login. They can't write as another teacher, and can't see other
   teachers' grades.
3. **Workflow trigger:** teachers only create/edit **drafts**, only while the
   grading period is **open**, and only up to the school's maximum score.
   Once submitted, the grade is the administrator's to approve, return or lock.

The Server Action additionally checks the teaching load belongs to the caller
before calling `save_grades()` (one transaction for the whole class).

## How parents are authorized to view children

Every parent-facing policy uses `private.my_guardian_student_ids()`: the
students linked to the caller's own guardian record through
`student_guardians` (Phase 2). A `?student_id=` in a URL or API call changes
nothing — rows of unlinked students simply aren't visible, so the page 404s.
Parents see children's attendance, **published** grades (approved/locked
only), published coursework, submissions and schedules; they can't write any
of it.

## How grade history is preserved

* The guard trigger writes a `grade_change_logs` row **in the same
  transaction** for every creation and every score or status change: who
  (`changed_by`), when, old/new score, old/new status, and the reason.
* Changing a submitted or approved grade requires a reason; locked grades are
  final until an administrator unlocks them **with a reason**.
* Logs are append-only — update and delete raise an error for every role,
  including the service key. Teachers never silently overwrite: `save_grades`
  skips (and reports) grades that are no longer drafts.
* The audit log separately records `grade.created/modified/submitted/approved/
  locked/unlocked/returned`.

"Who changed this grade and what was it before?" → `/grades/<id>` shows the
full timeline.

## How schedule conflicts are detected

* **Teacher** and **section** double-bookings are PostgreSQL **exclusion
  constraints** over `(teacher/section, year, weekday, minutes range)`. They
  are enforced atomically by the database, even for concurrent requests.
  Back-to-back classes (08:00–09:00, 09:00–10:00) don't conflict.
* **Room** conflicts are checked by a trigger (with an advisory lock against
  races) only when the school enables `enforce_room_conflicts`, and the error
  names the clashing class: *"Room 101 is already booked 08:00 to 09:00
  (section A)"*.
* The Server Action looks up the clashing class first so the user sees which
  teacher/section/time collides; the constraints remain the final guard.

## How notifications are isolated per school

Rows carry `school_id` and `recipient_user_id`. RLS shows a notification only
to its recipient **and** only within their (active) school. Users can only set
`read_at` (column-level grant); nobody can create notifications through the
API — they're created by triggers (`assignment_created`, `grade_published`,
`attendance_recorded` for absent/late), and only when the school's
`notifications` feature is on. Delivery channels (push, email, SMS) are not
coupled to this table; they will read from it in a later phase.

## How RLS protects every academic table

All 11 Phase 3 tables have RLS, no `anon` grants, and policies of the form
*manager* (super admin / that school's admin) **or** *(feature enabled for the
caller's school **and** a role-specific relationship)*:

| Table | Teacher | Student | Parent |
| --- | --- | --- | --- |
| grading periods/scales | read (own school) | read | read |
| class_schedules | own classes + own sections | own section | children's sections |
| attendance sessions/records | read their sections; write if adviser/assigned, within lock + window | own records | children's records |
| grade_records | own grades (write drafts) | own **published** | children's **published** |
| grade_change_logs | of own grades | — | — |
| assignments | own (write) | published, own sections | published, children's sections |
| assignment_submissions | of own assignments (review) | own (write) | children's |
| notifications | own | own | own |
| audit_logs | own actions | own actions | own actions |

Disabling a module (e.g. `grades`) for a school removes access in the
database, not just the menu. Storage (`academic-files` bucket) uses the same
rules: file paths start with `<school_id>/…/<record id>` and policies check the
record through RLS, so guessing another school's path returns nothing.

## Configurable school policies

| Policy | Where | Default |
| --- | --- | --- |
| Grading periods (any number, any names) | Grading Periods | — |
| Grading scale bands | Grading Scales | — |
| Maximum / passing score | Settings → Academic policies | 100 / 75 |
| Teacher attendance edit window (days, or unlimited) | Settings | 7 |
| Room double-booking prevention | Settings | on |
| Modules on/off per school | Super admin → school → Features | core on |

## Flutter readiness

Nothing is web-specific. The mobile app uses the same anon key, RLS, and RPCs:

```dart
await supabase.rpc('save_attendance', params: {'p_section_id': s, 'p_date': d, 'p_records': rows});
await supabase.rpc('save_grades', params: {'p_period_id': p, 'p_section_id': s, 'p_subject_id': sub, 'p_entries': e, 'p_submit': false});
await supabase.rpc('attendance_student_summary', params: {'p_student_id': id, 'p_academic_year_id': y});
await supabase.from('class_schedules').select();          // RLS-scoped timetable
await supabase.from('notifications').select().order('created_at', ascending: false);
await supabase.rpc('visible_teacher_names', params: {'p_ids': ids});
await supabase.storage.from('academic-files').upload('$school/submissions/$assignment/$student/$uuid-$name', file);
```

Multi-record operations are single RPC transactions, files upload directly to
Storage under the same policies, and every rule (locks, windows, workflow,
conflicts) is enforced in PostgreSQL — the app cannot bypass them.

## What's next (Phase 4)

Announcements and parent/student communication on top of `notifications`
(add `announcement` sources and delivery channels: push, email, SMS), due-date
reminders (`assignment_due`), and report-card generation from the locked
grades already stored per enrollment and period.
