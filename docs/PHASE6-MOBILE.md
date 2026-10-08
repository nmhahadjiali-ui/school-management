# Phase 6 — Flutter Android app & offline-first sync

The Android app lives in its own project (`../school-management-mobile`, see its
`README.md` and `docs/ARCHITECTURE.md`). It is **another client of this
backend**, not a second system:

```
Next.js web ──┐
              ├──► Supabase (same Auth, same database, same RLS, same functions)
Flutter app ──┘
```

## What this repository added for it

Migration `20261014000001_mobile_sync.sql`:

| Object | Purpose |
| --- | --- |
| `client_operations` | One row per operation a device performed offline, keyed by an id generated on the device. Replays return the stored result (idempotent sync). Visible only to its owner; written only by sync functions; kept 30 days. |
| `sync_attendance(op_id, section, date, records)` | Offline attendance. `SECURITY INVOKER` (runs as the teacher). Refuses non-teachers/admins; per student, reports a **conflict** if the server record changed after the version the device last saw (never silently overwritten); saves the rest through the web's own `save_attendance()` — same RLS, assignment, enrollment, lock and edit-window rules, same audit. |

Everything else the app needs already existed: `get_my_context()` (now with
`finance_level` and `currency`), the RLS policies of every phase,
`register_device()` and `user_devices` (Phase 4), notification `read_at`.

Tests: `tests/mobile-sync.test.mjs` — offline sheet saved through the web
rules, replay of the same operation does not write twice, conflicts reported
and resolvable ("keep mine" against the current version), no false conflicts,
authorization (other section / school / student, parent, student, invalid
status, future date, signed out), operation ids private per user and not
forgeable, device registration / refresh / multiple devices / removal /
token privacy.

## Deliberately web-only (for now)

Payments, refunds and receipts printing; grade entry; announcement
publishing; school setup and people management. The app views these where
useful (balances, payment history, grades, announcements). Online payments are
confirmed only by the provider's server-side webhook — never by the app,
never offline.

## Push notifications

The app registers its token after sign-in and removes it on sign-out, and
routes notification taps by the standard payload `{entity_type, entity_id}`.
To deliver real pushes: create a Firebase project, connect it in the app
(see the mobile `docs/ARCHITECTURE.md`), and add an FCM provider to
`src/server/notifications/providers.ts` (server-side credentials only).
