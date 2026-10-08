# Security model

The database is the security boundary. The web app (and later the Flutter app)
are untrusted clients: hiding a button or a nav item is a convenience only.
Every rule below is enforced by PostgreSQL Row Level Security (RLS) and
triggers, and is covered by the tests in `tests/`.

## Layers

| Layer | What it does | Where |
| --- | --- | --- |
| Proxy | Refreshes the session cookie; redirects signed-out users to `/login` (API: 401) | `src/proxy.ts`, `src/lib/supabase/proxy.ts` |
| Page/action guards | `requireActiveUser`, `requirePermission`, `authorize` re-check role on the server | `src/lib/auth/session.ts` |
| RLS policies | Row-level tenant isolation and role rules | `supabase/migrations/…_rls.sql` |
| Guard triggers | Column-level rules RLS cannot express (role/status/school/code changes) | `supabase/migrations/…_functions.sql` |
| Table grants | `anon` has no table access; `authenticated` only the verbs it needs | `…_rls.sql` |

## Identity helpers (schema `private`, not exposed via the API)

| Function | Returns |
| --- | --- |
| `private.my_role()` | Caller's role, **only if** their profile is `active` and (for school users) their school is `active`; otherwise `NULL` |
| `private.my_school_id()` | Caller's school id under the same conditions |
| `private.is_super_admin()` | `my_role() = 'super_admin'` |
| `private.is_school_admin_of(school)` | Caller is an active school admin of that active school |
| `private.school_has_feature(school, key)` | Feature enabled for an active school |

Because pending/inactive users and users of a disabled school get `NULL` from
these helpers, they automatically fail every tenant-scoped policy. They can
still read **their own** profile so the app can explain why access is limited.

The helpers are `SECURITY DEFINER` (so policies on `profiles` can read
`profiles` without recursion) with `search_path = ''` to prevent hijacking.
Policies call them as `(select private.fn())` so they are evaluated once per
statement rather than per row.

## Policy matrix

`✓` allowed, `own` = only rows of the caller's own school, `self` = only the caller's own row, `—` denied.

| Table | Operation | Super admin | School admin | Teacher / Student / Parent | Anonymous |
| --- | --- | --- | --- | --- | --- |
| `schools` | select | ✓ all | own | own | — |
| | insert | ✓ | — | — | — |
| | update | ✓ (incl. code/status) | own (not code/status ¹) | — | — |
| | delete | — (deactivate instead) | — | — | — |
| `profiles` | select | ✓ all | own school | self | — |
| | insert | — (trigger only) | — | — | — |
| | update | ✓ ² | self + teachers/students/parents of own school ³ | self (contact fields only) ⁴ | — |
| | delete | — | — | — | — |
| `school_settings` | select | ✓ | own | own | — |
| | insert | ✓ (trigger creates it) | — | — | — |
| | update | ✓ | own | — | — |
| `features` (catalog) | select | ✓ | ✓ | ✓ | — |
| | write | — (migrations only) | — | — | — |
| `school_features` | select | ✓ | own | — (use `get_my_context` / `has_feature`) | — |
| | insert/update/delete | ✓ | — | — | — |

1. `schools_guard_update` trigger: only super admins may change `code` or `status`.
2. `profiles_guard_update`: nobody can grant `super_admin` through the API, and a super admin cannot change their own role/status.
3. `profiles_guard_update`: school admins may change `role`/`status` only for teacher/student/parent rows of their own school, only to teacher/student/parent, never `school_id`, never their own row.
4. `profiles_guard_update`: `role`, `status`, `school_id`, `user_id` and `email` are immutable for the user themselves. Pending/inactive users cannot update at all.

`USING (true)` is not used anywhere. The only "everyone signed in" policy is on
the `features` catalog, which contains no school data.

## Account provisioning

* **Self-registration** (`supabase.auth.signUp`): the user supplies a school
  code. The `on_auth_user_created` trigger accepts only an active school's code
  and only the roles teacher/student/parent (anything else becomes student).
  The profile starts as `pending` until a school admin approves it.
* **Admin provisioning** (server action using the service-role key): the role
  and school are written to `app_metadata`, which only the service role can
  set. The `on_auth_user_provisioned` trigger creates the profile. The server
  action checks that a school admin only provisions into their own school and
  only member roles.
* **Super admins** are created only with the service-role key (`npm run seed`)
  or SQL. There is no API path to grant `super_admin`.

## Secrets

* `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is read only in
  `src/lib/supabase/admin.ts`, which imports `server-only` (importing it from a
  client component fails the build). It has no `NEXT_PUBLIC_` prefix.
* It is used for exactly one runtime operation: creating Auth users, after the
  server action has authorized the caller.
* Never put it in the Flutter app, in Vercel "preview" environments that are
  publicly shared, or in logs.
* `school_features.configuration` must not hold secrets (e.g. SMS API keys).
  Store those in Supabase Vault and read them from server code / Edge Functions.

## Error handling

Database and auth errors are logged on the server (`fail()` in
`src/lib/action-result.ts`) and mapped to friendly messages. Raw Postgres
messages never reach the browser. Unexpected errors render the `(app)/error.tsx`
boundary, which shows only a digest reference.

## Phase 2 tables

All 11 tables (`academic_years`, `grade_levels`, `subjects`, `sections`,
`teachers`, `students`, `guardians`, `student_guardians`,
`student_enrollments`, `teacher_subject_assignments`, `invitations`) have RLS
enabled, no `anon` grants, and insert/update policies requiring
`private.can_manage_school(school_id)` (super admin, or school admin of that
school). Only `student_guardians` and `teacher_subject_assignments` allow
DELETE (removing a relationship); every other record is archived via status.

Additional helpers (all `SECURITY DEFINER`, empty `search_path`, return nothing
for inactive accounts or schools):

| Function | Returns |
| --- | --- |
| `private.can_manage_school(school)` | super admin, or school admin of that school |
| `private.my_teacher_id()` / `my_student_id()` / `my_guardian_id()` | the caller's linked record (teacher/guardian must be `active`) |
| `private.my_teacher_section_ids()` | sections the teacher advises or is assigned to |
| `private.my_teacher_student_ids()` | students enrolled (ever) in those sections |
| `private.my_guardian_student_ids()` | the parent's linked children |
| `private.my_visible_section_ids()` | teacher sections + own/children's sections |

SELECT matrix (`manage` = can_manage_school):

| Table | Visible to |
| --- | --- |
| `academic_years`, `grade_levels`, `subjects` | manage; any active member of the school |
| `sections` | manage; `id in my_visible_section_ids()` |
| `teachers` | manage; self |
| `students` | manage; teacher's students; self; parent's children |
| `guardians` | manage; self |
| `student_guardians` | manage; own guardian rows; own student rows |
| `student_enrollments` | manage; teacher's sections; self; parent's children |
| `teacher_subject_assignments` | manage; own assignments |
| `invitations` | manage only |

Integrity enforced in the database (not only the app):

* Composite FKs `(school_id, ...)`: no cross-school references, including
  section/year/grade consistency for enrollments and assignments.
* `school_id` immutable everywhere (trigger, applies to all callers).
* Archived academic years are read-only for everyone (trigger).
* Enrollment history: immutable identity columns, closed rows immutable,
  one open enrollment per student per year, section capacity (row-locked).
* Account links: `user_id` must be a profile in the same school with the
  matching role; linked profiles cannot change role or school.

Invitations: the secret is Supabase Auth's single-use, expiring `token_hash`
in the email link (verified by Auth; never stored by us). The provisioning
trigger only links a record of the **same school** that has **no account yet**;
otherwise the whole user creation rolls back. Revoking deletes the unused account.

Server Actions are public HTTP endpoints: any client can call them with any
arguments, including bound ids. Every action re-authorizes, validates with zod,
takes `school_id` from the session, and relies on RLS for row access.
`tests/actions.test.mjs` calls them directly with forged arguments.

## Phase 3 tables

See the RLS matrix and rationale in [PHASE3-ACADEMIC-OPERATIONS.md](PHASE3-ACADEMIC-OPERATIONS.md#how-rls-protects-every-academic-table). Summary:

* RLS on `grading_periods`, `grading_scales`, `class_schedules`, `attendance_sessions`, `attendance_records`, `grade_records`, `grade_change_logs`, `assignments`, `assignment_submissions`, `notifications`, `audit_logs`; no `anon` grants.
* Every non-manager policy also requires the module's feature flag for the caller's school (`private.my_feature()`).
* Teacher writes are bound to their own teacher record and, structurally, to their teaching load (composite FKs). Student writes are bound to their own student record; parents never write.
* Students and parents only see **published** grades (approved/locked).
* `grade_change_logs` and `audit_logs` are append-only for every role, including the service key. Notifications and audit rows are created only by `SECURITY DEFINER` triggers; users can only set `notifications.read_at`.
* Storage bucket `academic-files` is private. Paths are `<school_id>/assignments/<assignment_id>/…` and `<school_id>/submissions/<assignment_id>/<student_id>/…`; read/write policies call `SECURITY INVOKER` helpers that look the assignment up **under the caller's RLS**, so access mirrors the records. Downloads go through `/api/files`, which issues 60-second signed URLs only when the caller may read the object. Uploads go directly from the browser (or Flutter) to Storage with the user's own session.
* `visible_teacher_names()` is the only way students/parents see teacher data: names of their own (children's) teachers, nothing else.

## Phase 4 tables

Full rationale in [PHASE4-COMMUNICATION.md](PHASE4-COMMUNICATION.md#how-tenant-isolation-is-enforced).

| Table | Visible to | Writes |
| --- | --- | --- |
| `notifications` | the recipient, within their school | only `read_at`, `dismissed_at` by the recipient; rows created by `notify_event()` only |
| `notification_types` | any signed-in user (catalog) | migrations only |
| `notification_preferences` | own rows | own rows (user and school from the session) |
| `announcements` | school managers; the author; audience members when published and not expired | managers; teachers only if the school allows; inserts are always drafts; publishing via `publish_announcement()` |
| `announcement_targets` | managers, the author | managers, the author; trigger enforces same-school targets and teacher moderation; frozen after publishing |
| `notification_deliveries` | school managers (contains destinations) | worker RPCs only (service role) |
| `sms_usage` | school managers | worker RPC only |
| `user_devices` | own rows | own rows; `register_device()` always uses the caller |

* `claim_notification_deliveries`, `complete_notification_delivery` and `run_communication_jobs` are executable by the service role only.
* `/api/jobs/communication` requires `Authorization: Bearer $CRON_SECRET` (constant-time comparison); the proxy lets it through without a session.
* Provider credentials live only in server environment variables; audit entries record channel/provider/attempts but never destinations, message bodies or secrets.

## Known limitations / follow-ups

* `school_code_is_valid` is callable anonymously and reveals whether an active
  school uses a code. Codes are meant to be shared with families, but add rate
  limiting (or CAPTCHA on sign-up) before public launch.
* Auth rate limits and email confirmation are configured in Supabase
  (`supabase/config.toml` locally; dashboard in production). Enable email
  confirmations in production.
* Logos are URLs in Phase 1. When uploads are added, use a Storage bucket with
  RLS policies keyed on `school_id` in the object path.
* Full-form actions have replace semantics: an optional field omitted from a
  submission is stored as empty. Future API clients should send every field.
* "Link existing account" lists up to 500 unlinked accounts per role; switch it
  to the search picker if a school exceeds that.
* Storage objects are not deleted when an attachment is replaced or a submission is resubmitted (the database keeps only the latest path). Add a cleanup job before storage costs matter.
* Notifications are created per event (e.g. one per published grade). If volume grows, add digesting in the delivery phase.
* Delivery logs keep full destinations (needed for retries); consider masking/purging after a retention period.
* `run_communication_jobs` also runs from pg_cron as the database owner; keep its logic idempotent (it is: event keys).
* Consider a custom access-token hook to put `role`/`school_id` into the JWT
  once query volume grows; today they are looked up per statement via an
  indexed primary-key lookup.
