# Architecture (Phase 1 — Foundation)

> Phase 2 (academic years, grade levels, sections, subjects, students,
> teachers, guardians, enrollments, assignments, invitations) is documented in
> [PHASE2-SCHOOL-STRUCTURE.md](PHASE2-SCHOOL-STRUCTURE.md); Phase 3 (attendance, grades,
> schedules, coursework, notifications, audit) in
> [PHASE3-ACADEMIC-OPERATIONS.md](PHASE3-ACADEMIC-OPERATIONS.md); Phase 4 (notification service,
> announcements, channels, SMS, devices) in [PHASE4-COMMUNICATION.md](PHASE4-COMMUNICATION.md). The academic-year
> fields once on `school_settings` moved to `academic_years`.

```
ONE platform → MANY schools → ONE codebase → SHARED database → STRICT isolation (RLS)
```

There is no per-school code, deployment or database. A school is a row in
`schools`; behaviour differences come from **roles**, **settings** and
**feature flags**, never from `if school_id == …`.

## Database structure

All primary keys are UUIDs; all tables have `created_at`/`updated_at`
(maintained by the `set_updated_at` trigger).

```
auth.users (Supabase Auth — passwords live only here)
   │ 1:1 (user_id, on delete cascade)
   ▼
profiles ──────────────► schools ◄──────── school_settings (1:1)
 id, user_id, school_id    id, name, code,       academic year, primary color,
 email, names, phone,      logo_url, address,    grading/attendance/branding JSONB
 role, status              contact, timezone,
                           status                 school_features (N per school)
                              ▲                    school_id, feature_key,
                              └────────────────────enabled, configuration JSONB
                                                        │
                                                   features (catalog)
                                                    key, name, description
```

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `schools` | One row per tenant | `code` unique, `^[A-Z0-9][A-Z0-9-]{1,19}$`; `status` ∈ active/inactive |
| `profiles` | App user, linked to `auth.users` | `user_id` unique; **`(role = 'super_admin') = (school_id IS NULL)`** — super admins are platform-level, everyone else belongs to exactly one school |
| `school_settings` | Per-school configuration | one row per school (created by trigger); hex color check; JSONB must be objects |
| `features` | Catalog of optional modules | `key` unique; seeded: sms, payments, library, inventory, online_enrollment, advanced_reports, parent_portal, notifications |
| `school_features` | Per-school flags | unique `(school_id, feature_key)`; a disabled row per feature is created for every new school and for every new feature |

Enums: `app_role` (super_admin, school_admin, teacher, student, parent),
`school_status` (active, inactive), `profile_status` (pending, active, inactive).

Indexes cover every RLS/filter path: `profiles(user_id)` (unique),
`profiles(school_id, role)`, `profiles(school_id, status)`,
`schools(status)`, `schools(created_at)`, partial `school_features(school_id) where enabled`.

**Rule for every future table holding school data:** add `school_id uuid not null
references schools`, an index starting with `school_id`, enable RLS, and write
policies using `private.my_school_id()` / `private.is_school_admin_of()` (and
`private.school_has_feature()` for optional modules). See `docs/SECURITY.md`.

## Authentication architecture

* Supabase Auth (email/password). The web app uses `@supabase/ssr`, storing the
  session in HTTP-only-capable cookies so Server Components and Server Actions
  act **as the user** (RLS applies).
* `src/proxy.ts` (Next.js 16 "proxy", formerly middleware) refreshes the session
  on each request and redirects signed-out users to `/login`
  (`?reason=expired` when a stale auth cookie is present; API routes get 401).
* Server code verifies the JWT with `auth.getClaims()`; it never trusts
  `getSession()`.
* Flows: `/register` (school code → pending account), `/login`, sign-out
  (Server Action), `/forgot-password` → email → `/auth/confirm` →
  `/reset-password`. Session persistence is handled by Supabase cookies with
  automatic refresh.
* After sign-in, one RPC — `get_my_context()` — returns profile, school,
  branding, `access_active` and enabled features. Users who are pending,
  deactivated, or whose school is disabled are routed to `/account-status`.

## Multi-tenant architecture

* Shared schema, `school_id` discriminator column on all tenant data.
* The tenant is derived **server-side from the authenticated user** (their
  profile), never from a URL, header or form field. School admin pages read
  `ctx.profile.school_id`; Server Actions never trust a client-supplied school id
  without checking it against the session.
* RLS guarantees isolation even if application code has a bug.

## RLS strategy

See `docs/SECURITY.md` for the full policy matrix. Summary:

1. RLS enabled on every exposed table, default deny, `anon` has no grants.
2. Identity helpers in a non-exposed `private` schema (`SECURITY DEFINER`,
   empty `search_path`) resolve the caller's role and school — and return NULL
   unless both the profile and the school are active.
3. One policy per table/operation combining super-admin, school-admin and
   self rules; helpers wrapped in `(select …)` for per-statement caching.
4. Guard triggers enforce column-level rules (who may change role, status,
   school, code).
5. No hard deletes through the API in Phase 1 — deactivate instead.

## Role / permission strategy

* The **role** lives in `profiles.role` (database). It is the single source of
  truth and is what RLS checks.
* `src/lib/auth/permissions.ts` maps roles → named permissions
  (`platform.schools.manage`, `school.users.manage`, `profile.self`, …). It
  drives navigation (`src/lib/navigation.ts`) and the first server-side check in
  pages (`requirePermission`) and actions (`authorize`).
* New roles/permissions: add the enum value in a migration, extend the map, and
  extend RLS. Permission names are stable strings Flutter can mirror.

## Feature flag strategy

* Catalog in `features`; per-school state in `school_features`
  (`enabled` + `configuration` JSONB for non-secret settings).
* Only super admins toggle flags (they will later be tied to billing). School
  admins can see their school's flags.
* Checks happen in three places:
  1. **UI:** `get_my_context().features` decides which modules to show.
  2. **Server:** `requireFeature(key)` (pages) and the `has_feature` RPC
     (route handlers, e.g. `/api/features/[feature]`) → 404/403 when off.
  3. **Database:** future module tables add
     `private.school_has_feature(school_id, '<key>')` to their RLS policies, so a
     disabled module's data is unreachable even through the raw API.
* Adding a module = migration inserting into `features` (rows for all schools
  are created automatically, disabled) + the module's tables/policies + UI.

## Application structure

```
src/
  app/                 Routes (App Router)
    (auth)/            login, register, forgot/reset password
    (app)/             authenticated shell: dashboard, platform/*, school, users, settings, profile, modules/[feature]
    auth/confirm/      email-link handler
    api/features/      example feature-gated API route
  components/          UI (ui/ primitives, layout/, dashboard/, schools/, users/, settings/, profile/)
  lib/
    supabase/          browser, server, admin (service role, server-only), proxy clients
    auth/              session guards (server) + permission map (shared)
    actions/           Server Actions: validate → authorize → service → revalidate
    validations/       zod schemas
    features.ts        requireFeature()
  services/            Data access (Supabase queries), no React
  types/               generated database types + domain types
  proxy.ts             session refresh + route protection
supabase/migrations/   schema, functions/triggers, RLS
tests/                 integration tests (RLS, roles, features, HTTP)
scripts/seed.mjs       bootstrap super admin (+ optional demo data)
```

## Connecting Flutter later

The database contract is client-agnostic; nothing depends on Next.js.

```dart
await Supabase.initialize(url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY);
await supabase.auth.signInWithPassword(email: e, password: p);

// Profile, school, role, status, branding, enabled features,
// current academic year and linked record {type, id} in one call
final ctx = await supabase.rpc('get_my_context');

// Feature gate
final smsOn = await supabase.rpc('has_feature', params: {'feature': 'sms'});

// School data — RLS scopes every query to the user's school automatically
final school = await supabase.from('schools').select().single();
final users  = await supabase.from('profiles').select(); // admins only see their school
```

* Use only the **anon key** in the app; RLS provides the security.
* Registration: `auth.signUp(data: {first_name, last_name, school_code, requested_role})`
  — the same trigger validates it. Validate the code first with
  `rpc('school_code_is_valid', params: {'school_code': code})`.
* Operations that need the service role (provisioning users) must stay
  server-side. Expose them to Flutter later via a Supabase Edge Function or a
  Next.js route handler that authenticates the caller's JWT and applies the
  same checks as `src/lib/actions/users.ts`.
* Password reset deep links: add the app's redirect URL to Supabase Auth's
  allowed redirect URLs.
