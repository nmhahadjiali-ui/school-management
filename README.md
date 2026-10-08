# School Management Platform

Multi-tenant School Management SaaS — **Phase 1: Foundation**.
One codebase and one Supabase database serve many schools, with tenant
isolation enforced by PostgreSQL Row Level Security.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) · Vercel.
A Flutter app will use the same Supabase backend later.

* Architecture, database, roles, feature flags, Flutter: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
* Phase 2 school structure (relationships, history, assignments, invitations): [docs/PHASE2-SCHOOL-STRUCTURE.md](docs/PHASE2-SCHOOL-STRUCTURE.md)
* Phase 3 academic operations (attendance, grades, schedules, coursework, notifications, audit): [docs/PHASE3-ACADEMIC-OPERATIONS.md](docs/PHASE3-ACADEMIC-OPERATIONS.md)
* Phase 4 communication (notification service, announcements, channels, SMS, devices): [docs/PHASE4-COMMUNICATION.md](docs/PHASE4-COMMUNICATION.md)
* Phase 5 fees, billing & payments (ledger, allocations, refunds, receipts, online payments, financial RLS): [docs/PHASE5-FINANCE.md](docs/PHASE5-FINANCE.md)
* Phase 6 Android app (offline-first, same backend; app in `../school-management-mobile`): [docs/PHASE6-MOBILE.md](docs/PHASE6-MOBILE.md)
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

## What's in Phase 3

* Configurable grading periods (quarters, semesters, terms) and grading scales per school
* Weekly schedules with database-enforced teacher/section conflict detection (room conflicts optional)
* Daily attendance (fast "mark all present" sheet), configurable edit window, admin lock/unlock, reports by section and by date
* Grade entry per class and period, draft → submitted → approved → locked workflow, bulk review, append-only grade history
* Coursework ("Assignments") with file attachments and student submissions (Supabase Storage, tenant-safe)
* Teacher, student, parent and school-admin academic dashboards; in-app notifications; audit log

## What's in Phase 4

* One notification service for every event; in-app notification center with bell, filters, read/unread/dismiss and deep links
* Announcements with flexible audiences (school, grade, section, class, person; narrowed by role), scheduling (published by pg_cron) and expiry
* Per-user notification preferences; per-school channel settings (email, SMS, push) on top of platform feature flags
* Delivery queue with retries, idempotency, audit, and pluggable email/SMS/push providers (simulator included)
* SMS usage tracking per school per month; device registration for the future mobile app

## What's in Phase 5

* Finance roles (finance admin, finance staff) and configurable school-admin finance access (full / view / none)
* Fee types, fee structures per year/grade/section with installments; idempotent charge generation with preview; individual charges
* Discounts (fixed / %) and adjustments recorded separately — the original charge never changes
* Payments with allocation across charges, partial payments, overpayment credit, credit application, reversals (never deletes)
* Unique, sequential receipt numbers per school; printable receipts; refunds with approval (second approver) and payout
* Student ledger and balances computed by the database (numeric), parent/student "Fees & payments", finance dashboard with filters, CSV exports
* Online payment provider abstraction with signed, idempotent webhooks (test simulator included); append-only financial audit log

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

## Using the hosted Supabase project

The hosted project (`school-management-DB`) is linked (`npx supabase link`). Its settings live in
`.env.hosted` (git-ignored, same variables as `.env.local`).

```bash
npm run dev:hosted              # the app on http://localhost:3001 using the hosted database
npm run seed:hosted -- --demo   # super admin (+ demo data); safe to re-run
npx supabase db push --linked   # apply new migrations to the hosted database
```

`npm run dev` / `npm test` keep using the local Docker database; tests refuse to run against a remote URL.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public anon key (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Creates Auth users for admin provisioning. Bypasses RLS — never expose it |
| `NEXT_PUBLIC_SITE_URL` | server | Base URL used in auth email links |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` | seed script | First platform owner account |
| `CRON_SECRET` | **server only** | Bearer secret for `/api/jobs/communication` (delivery worker) |
| `EMAIL_PROVIDER`, `SMS_PROVIDER`, `PUSH_PROVIDER` | **server only** | `simulator` or empty; real vendors are added in `src/server/notifications/providers.ts` with their own server-only API keys |
| `PAYMENT_PROVIDERS` | **server only** | Enabled online payment providers, e.g. `simulator` (test gateway — never in production). Real gateways: `src/server/payments/providers.ts` |
| `PAYMENT_SIMULATOR_SECRET` | **server only** | Webhook signing secret for the simulator (32+ random characters) |
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
3. In Vercel: import the repo (`vercel.json` pins the Next.js framework and the Singapore region `sin1`, next to the database) and set the environment variables above
   (`SUPABASE_SERVICE_ROLE_KEY` for Production only, not exposed to the client).
4. Delivery worker: the database calls `POST https://<domain>/api/jobs/communication` every minute itself (pg_cron + pg_net, migration `20261012000003`). Store the address and secret once in Supabase Vault (SQL editor): `select vault.create_secret('https://<domain>', 'app_url'); select vault.create_secret('<CRON_SECRET>', 'cron_secret');`. Scheduled announcements and the daily data-retention purge also run inside the database.
5. Online payments: configure a real gateway (see docs/PHASE5-FINANCE.md), set its webhook URL to `https://<domain>/api/payments/webhooks/<provider>`, and leave `simulator` out of `PAYMENT_PROVIDERS`.
6. Create the first super admin from a trusted machine:
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
| `tests/academic.test.mjs` | Phase 3 isolation for all 11 tables, attendance (assigned sections, locks, edit window, enrollment-on-date), grades (assignment-bound, workflow, reasons, history immutability, published-only visibility), schedule conflicts, coursework, Storage files, notifications |
| `tests/communication.test.mjs` | Phase 4: announcement targeting (school/grade/section/class/user, roles), readable ⇔ notified, cross-school targets, teacher moderation, drafts/scheduling/pg_cron/expiry, academic events, notification center security, preferences and urgent override, SMS feature isolation, idempotency, retries, usage, devices, tenant isolation |
| `tests/http-communication.test.mjs` | Phase 4 pages per role, announcement actions with forged input, deep links re-authorized, worker secret, simulated SMS delivery and failure retry |
| `tests/http-academic.test.mjs` | Phase 3 pages per role, other teachers'/schools' sheets 404, file download route, academic Server Actions with forged input |
| `tests/finance.test.mjs` | Phase 5: charge generation and idempotency, installments to the cent, discounts/adjustments leave charges unchanged, full/partial/multi payments, overpayment credit, allocation limits and atomicity, double submit, reversal, receipt numbering, refund limits and second approver, ledger = balances, parent/student/teacher access, separation of duties, online transactions (browser cannot complete, idempotent completion, failure/cancel/amount mismatch), webhook duplicates/invalid signatures, isolation of all 14 finance tables |
| `tests/http-finance.test.mjs` | Phase 5 pages per finance level and role, other schools' records 404, payment entry action (double submit, forged charges, manual "online", sub-cent), receipts access, CSV export access and formula escaping, online payment end-to-end through signed webhooks (unsigned/forged/tampered/stale rejected, replay, amount mismatch) |
| `tests/mobile-sync.test.mjs` | Phase 6: offline attendance sync (idempotent replays, conflicts, authorization), operation receipts privacy, device registration |
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
9. As `teacher@north.example`: Attendance → pick a section → mark one student absent → Save (the parent gets a notification). Grades → 1st Quarter → Enter grades → Save draft → Submit.
10. As `admin@north.example`: Grades → approve the submitted grades (students and parents see them), change one with a reason, open its History. Schedules → pick a section → try to schedule a clash (refused with the clashing class named).
11. Compare Grading Periods for `admin@north.example` (quarters) and `admin@south.example` (semesters): same code, different configuration.
12. As `admin@north.example`: Announcements → New → audience "Grade level: Grade 2, Parents" → Schedule 2 minutes ahead → it publishes by itself. Settings → Communication shows SMS (NORTH has the add-on; SOUTH shows "not included").
13. As `teacher@north.example`: mark a student absent → the parent's bell shows it; run the worker (`curl -X POST -H "Authorization: Bearer local-dev-cron-secret-change-me" http://localhost:3000/api/jobs/communication`) → Settings → Delivery health / SMS usage update.
14. As `cashier@north.example`: Record payment → search "Cruz" → Juan → Auto-apply → Review → Confirm → open the receipt and print it. A double click records only one payment.
15. As `finance@north.example`: Refunds → approve the pending refund (the cashier requested it) → Mark paid out; Charges → open one → Apply discount; Payments → Reverse a payment (its receipt shows VOID); Reports → download CSVs; Audit log shows every step. Settings → set school admins' access to "No access": the Finance menu disappears for `admin@north.example`.
16. As `parent@north.example`: Fees & payments → Juan → Pay online → test gateway → "Pay (simulate success)" → the payment and receipt appear (recorded by the signed webhook). `admin@south.example` can only view finances.
