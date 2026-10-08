# School Management Platform

Multi-tenant School Management SaaS — **Phase 1: Foundation**.
One codebase and one Supabase database serve many schools, with tenant
isolation enforced by PostgreSQL Row Level Security.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) · Vercel.
A Flutter app will use the same Supabase backend later.

* Architecture, database, roles, feature flags, Flutter: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
* Phase 2 school structure (relationships, history, assignments, invitations): [docs/PHASE2-SCHOOL-STRUCTURE.md](docs/PHASE2-SCHOOL-STRUCTURE.md)
* RLS policy matrix and security notes: [docs/SECURITY.md](docs/SECURITY.md)

## What's in Phase 1

* Schools (tenants), profiles linked to Supabase Auth, 5 roles
* Email/password registration (with school code + admin approval), login, logout, password reset, session refresh, protected routes
* Super admin: platform dashboard, create/edit/activate/deactivate schools, per-school feature flags, add users (incl. school admins), view all users
* School admin: school dashboard (stats), school details, users (approve, change role, deactivate, add), settings (time zone, academic year, branding)
* Teacher / student / parent: dashboard and profile
* Feature-flag and settings foundations; no academic modules yet

## What's in Phase 2

* Academic years (planned, active, archived; one current per school), grade levels and subjects configured per school
* Sections per year and grade (capacity, room, adviser)
* Students, teachers, parents/guardians with profiles; many-to-many student-guardian relationships
* Enrollment history per academic year (transfers and closures keep every past placement)
* Teacher subject assignments per section and year
* Invitations (email, one-time 24 h link) and linking self-registered accounts to records
* Searchable, filterable, sortable, server-paginated management screens; teacher "My Classes" and parent "My Children"

## Setup (local)

Prerequisites: Node 20+, Docker Desktop (for the local Supabase stack).

```bash
npm install
npm run db:start          # starts Supabase locally and applies supabase/migrations
npx supabase status       # prints the local URL and keys
cp .env.example .env.local   # fill in the values from `supabase status`
npm run seed -- --demo    # creates the super admin (+ two demo schools with years, grades,
                          #   sections, subjects, teachers, students, guardians, enrollments)
npm run dev               # http://localhost:3000
```

Local services use non-default ports so they don't clash with other Supabase
projects: API `54421`, DB `54422`, Studio `54423`, Mailpit (emails) `54424`.
Password-reset and confirmation emails are visible in Mailpit at http://127.0.0.1:54424.

Demo accounts (`--demo`, password `Demo-pass-123`): `admin@north.example`,
`teacher@north.example`, `student@north.example`, `parent@north.example`
(and the same for `@south.example`). School codes: `NORTH`, `SOUTH`.
The super admin uses `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public anon key (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Creates Auth users for admin provisioning. Bypasses RLS — never expose it |
| `NEXT_PUBLIC_SITE_URL` | server | Base URL used in auth email links |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` | seed script | First platform owner account |
| `TEST_APP_URL` | tests | Running app URL for HTTP tests (optional) |

## Deploying

1. Create a Supabase project. Link and push migrations — never edit production tables by hand:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
2. In Supabase → Authentication: set the Site URL to your production domain, add
   `https://<domain>/auth/confirm` to redirect URLs, enable email confirmations,
   and configure SMTP. Under Email Templates → Invite user, paste
   `supabase/templates/invite.html` (it routes the link through `/auth/confirm`).
3. In Vercel: import the repo and set the environment variables above
   (`SUPABASE_SERVICE_ROLE_KEY` for Production only, not exposed to the client).
4. Create the first super admin from a trusted machine:
   `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SEED_SUPER_ADMIN_EMAIL=… SEED_SUPER_ADMIN_PASSWORD=… node scripts/seed.mjs`

Schema changes always go through a new file in `supabase/migrations/`
(`npx supabase migration new <name>`), then `npm run db:types`.

## Testing

Integration tests run against the **local** Supabase (they refuse to run against
a remote URL) and exercise the real RLS policies.

```bash
npm run db:start
npm test                                   # auth, tenant isolation, roles, feature flags
```

HTTP tests (route protection, server-side role checks, feature gates over HTTP)
need the app running:

```bash
npm run build && npm start                 # in one terminal (actions tests need the build)
TEST_APP_URL=http://localhost:3000 npm test   # in another
```

| File | Covers |
| --- | --- |
| `tests/auth.test.mjs` | register (valid/invalid/inactive code, no role escalation), login, wrong password, logout, no passwords in app schema |
| `tests/tenant-isolation.test.mjs` | School A ↔ B reads and writes for users, settings, flags; anon access; no direct inserts/deletes |
| `tests/roles.test.mjs` | super admin, school admin, teacher, student, parent permissions; pending/deactivated users; school deactivation |
| `tests/features.test.mjs` | enabled flag visible for the right school, hidden for the other, not toggleable by school admins, effective immediately |
| `tests/http.test.mjs` | protected pages redirect, API 401, expired session, role-gated pages, feature-gated module page and API (403/404) |
| `tests/school-structure.test.mjs` | Phase 2 isolation for all 11 tables, composite-FK cross-school references, uniqueness rules, one current year, enrollment history/transfer/archive/capacity, parent and teacher visibility, all five roles |
| `tests/invitations.test.mjs` | invite, email (Mailpit), single-use token, password, accepted; cross-school and double-link prevention |
| `tests/http-school-structure.test.mjs` | management pages per role, 404 for other schools' profiles, teacher/parent/student views, lookups API |
| `tests/actions.test.mjs` | Server Actions over HTTP with forged arguments (other school's ids, injected `school_id`), enrollment workflow, invitations, account linking |

Other checks: `npm run typecheck`, `npm run lint`, `npm run build`.

### Manual test checklist

1. Sign in as the super admin → create a school → add a school admin on the school page → toggle SMS.
2. Register at `/register` with the school code → you land on "Awaiting approval".
3. Sign in as the school admin → Users → Pending approval → Approve.
4. Sign in as the new user → only Dashboard and Profile are visible; `/users` redirects to the dashboard.
5. Deactivate the school as super admin → its users land on "School access is disabled".
6. As `admin@north.example`: Academic Years → create 2027-2028, activate, set current; Sections → add a section; Students → Juan Cruz → see the 2025-2026 (completed) and 2026-2027 history; Transfer him to section B → both placements remain.
7. Teachers → Jose Reyes → add an email → Send invitation → open the email in Mailpit (http://127.0.0.1:54424) → set a password → "My Classes" shows his sections.
8. As `parent@north.example`: My Children shows only Juan and Lia.
