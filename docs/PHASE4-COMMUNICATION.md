# Phase 4 — Communication & notifications

Migrations `supabase/migrations/20261010000001`–`…03`. Builds on Phases 1–3.

```
   Academic event      Announcement      Schedule change      (future modules)
          └──────────────────┼────────────────────┘
                             ↓
              private.notify_event()   ← ONE notification service
                             │
      ┌──────────────────────┼─────────────────────────┐
      ↓                      ↓                         ↓
  notifications        notification_deliveries   audit_logs
  (in-app record,      (queue: email / sms /
   one per recipient)   push, one per destination)
                             ↓
          server worker  /api/jobs/communication  (cron)
                             ↓
          EmailProvider · SmsProvider · PushProvider   (pluggable, server-only)
```

## Changes to Phase 3 (and why)

| Found | Change |
| --- | --- |
| `notification_type` was an enum: no behaviour, unsafe to extend | `notification_types` catalog (category, default channels, mandatory); notifications reference it by key |
| `private.notify()` wrote in-app rows only — no channels, preferences or de-duplication | Replaced everywhere by `private.notify_event()` (below) |
| One `attendance_recorded` type, sent only to guardians | `attendance_absent` / `attendance_late`, sent to the student **and** verified guardians; old rows migrated |
| No idempotency, priority, expiry or dismissal on notifications | `event_key` + unique `(event_key, recipient)`, `priority`, `expires_at`, `dismissed_at`, `show_in_app` |
| Payload shapes varied (`assignment_id`, `student_id`) | Standard deep-link payload `{ entity_type, entity_id, … }` |

## Notification architecture

`private.notify_event(school, type, event_key, recipients[], title, message, data, priority, expires_at)`
is the only way notifications are created (database triggers and RPCs call
it; users cannot insert notifications). It:

1. **Validates the school** — active, `notifications` feature on, school master switch on.
2. **Validates recipients** — only *active accounts of that school* survive; anything else passed in is dropped.
3. **Resolves channels per recipient** — school channels × type defaults × the user's preferences. Mandatory types (`system`, `account`) and `urgent` priority force in-app.
4. **Creates the in-app notification** — `on conflict (event_key, recipient) do nothing`.
5. **Queues external deliveries** — one row per channel and destination (email address, phone, each device token), also idempotent.
6. **Audits** — `notification.generated` with the event key and recipient count.

The in-app notification *is* the in-app delivery (no extra queue row), so
large announcements create one row per recipient plus only the external
deliveries actually needed. Everything is set-based SQL inside one
transaction — a 2,000-recipient announcement is two `INSERT … SELECT`s.

**Events wired in:** absence/late (student + guardians), grade published and
grade corrected (student + guardians), assignment published (section students +
guardians), assignment reviewed (student + guardians), schedule changed or
removed (section + teachers involved; current year, not initial setup),
assignment due within 24 h and not submitted (pg_cron), announcements.

## Announcement targeting architecture

One table, `announcement_targets(target_type, target_id, roles[])`, no
per-audience code:

| target_type | target_id | reaches (current academic year) |
| --- | --- | --- |
| `school` | the school (set by the server, never the client) | every active account |
| `grade_level` | grade level | students with open enrollments in its sections, their guardians, the sections' advisers and subject teachers |
| `section` | section | same, for one section |
| `class` | teaching load | the section's students and guardians + **that subject's** teacher |
| `user` | auth user | one person |

`roles` narrows any row (e.g. *Grade 6 — parents only*). An announcement
reaches the **union** of its rows.

Two functions share the same membership rules:
`private.announcement_recipients()` (who gets notified) and
`private.my_audience()` (which announcements RLS lets a user read). A test
asserts *readable ⇔ notified* for every non-admin role.

**Lifecycle.** Inserts are always `draft`. `publish_announcement()` publishes
now or sets `scheduled` (when `publish_at` is in the future) and fans out.
**pg_cron** runs `private.run_communication_jobs()` every minute inside the
database to publish due scheduled announcements — no browser or app server
needed. Expiry needs no job: feeds and RLS filter `expires_at`; records are
kept and stay visible to administrators. Published announcements can be edited
(text) but their audience is frozen; archiving is final.

**Moderation.** Students and parents can never author. Teachers author only
when the school enables `teachers_can_announce`, and a trigger restricts their
targets to sections they teach/advise and their own classes. School admins
have school-wide authority. All targets must belong to the same school.

## How duplicate notifications are prevented

Every event has a deterministic key, e.g. `attendance:<record>:absent`,
`grade_published:<grade>`, `assignment_created:<assignment>`,
`announcement:<announcement>`, `assignment_due:<assignment>`,
`schedule:<schedule>:<hash of the new row>`. The database enforces
`UNIQUE (event_key, recipient_user_id)` on notifications and
`UNIQUE (notification_id, channel, destination)` on deliveries. Replaying an
event — a re-save, a retry, a second cron run, two workers at once — inserts
nothing. Workers claim deliveries with `FOR UPDATE SKIP LOCKED`, so two workers
never send the same message. Tested: replaying an absence produces exactly one
SMS.

## How SMS is isolated as an optional feature

A channel is used only when **all** of these hold:

1. the platform feature flag (`sms`, `email_notifications`, `push_notifications`) — what the school *has* (later: the paid add-on);
2. the school's own switch in Settings → Communication — what the school *chooses*;
3. the notification type's default / the user's preference;
4. a destination exists (phone number, email, device).

`claim_notification_deliveries()` re-checks the school's channels before every
send and **cancels** queued messages if SMS was switched off in the meantime.
School B with SMS disabled never gets an SMS row at all (tested).

## How future email/SMS/push providers are added

`src/server/notifications/providers.ts` defines `EmailProvider`,
`SmsProvider`, `PushProvider` (`send()` → `{ ok, providerMessageId }` or
`{ ok: false, error }`). The worker (`dispatcher.ts`) picks providers from
environment variables (`EMAIL_PROVIDER`, `SMS_PROVIDER`, `PUSH_PROVIDER`).
Adding a vendor = one class + one `case` in `pick()` + its API key in server
env vars. Nothing in the database or the notification service changes.
Phase 4 ships a `simulator` provider (records sends without contacting anyone;
destinations containing `FAIL` fail, to exercise retries) and reports
"no provider configured" otherwise. Credentials are never stored in
`school_settings` or anywhere the browser can reach.

**Delivery states:** `pending → processing → sent` (`delivered` reserved for
provider receipts), or retry with exponential backoff (1, 5, 25 min) up to 3
attempts → `failed`; `cancelled` when a channel is turned off. Each attempt,
success and failure is audited (without destinations or secrets).

## How parent authorization works

Parents receive and see only what concerns **their verified children** —
recipients come from `student_guardians` (and only guardians who accept
notifications), and every academic RLS policy from Phase 3 uses
`my_guardian_student_ids()`. A notification's deep link (`/students/<id>`) is
re-authorized by that page, so a forged payload leads to a 404. The
`parent_communication` feature can turn academic alerts to parents off per
school (announcements still reach them).

## How mobile devices integrate

Flutter uses the same backend:

```dart
await supabase.rpc('register_device', params: {'p_push_token': token, 'p_device_type': 'android', 'p_app_version': '1.0.0'});
final items = await supabase.from('notifications').select().eq('show_in_app', true).isFilter('dismissed_at', null).order('created_at', ascending: false);
await supabase.from('notifications').update({'read_at': DateTime.now().toIso8601String()}).eq('id', id);
final feed = await supabase.from('announcements').select().eq('status', 'published');   // RLS = my audience
// Push payload carries {notification_id, entity_type, entity_id} for deep links.
```

`register_device()` always uses the caller's identity (a token moving to a new
account is reassigned to the caller); users can hold many devices; push
deliveries are queued per device. A real push provider (e.g. FCM/APNs) plugs
into `PushProvider`.

## How tenant isolation is enforced

* Every communication table has RLS, no `anon` access, `school_id`
  immutability, and school-scoped policies (see `SECURITY.md`).
* Notifications: recipient-only **and** own school; users can change only
  `read_at` / `dismissed_at` (column grants); nobody can insert or delete via the API.
* Preferences and devices: own rows in own school only.
* Delivery logs (contain phone numbers/emails) and SMS usage: that school's
  admins only.
* Announcements: managers of the school, the author, or members of the
  audience; every target must belong to the same school (trigger).
* `notify_event()` drops recipients who aren't active members of the school.
* Server actions take `school_id` from the session; a "whole school" target is
  pinned server-side to the caller's school (tested with a forged id).

## How the system can later support paid SMS

* `sms` is a **platform feature flag** (super admin), separate from the school's
  own on/off switch — the flag becomes "add-on purchased".
* `sms_usage` counts sent and failed messages per school per month, updated in
  the same transaction that records each delivery outcome (and audited).
* No prices exist in code or schema. A billing phase can add plans/add-ons,
  read `sms_usage` for usage charges, and enforce quotas inside
  `notify_event()` / the claim step (e.g. skip SMS beyond an allowance).

## Running the worker

* **Scheduled announcements & due reminders:** pg_cron (already scheduled by the migration).
* **External sending:** call `POST /api/jobs/communication` with
  `Authorization: Bearer $CRON_SECRET`, every minute, from any scheduler:
  * Vercel Cron (Pro allows per-minute schedules), or
  * from the database itself with pg_net (works on any hosting plan):

    ```sql
    select cron.schedule('send-notifications', '* * * * *', $$
      select net.http_post('https://<your-app>/api/jobs/communication',
        headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>'))
    $$);
    ```
    (store the secret in Supabase Vault rather than inline in production).

## Not built yet

Real provider integrations (only the interfaces and simulator), provider
delivery receipts (`delivered`), digesting/batching for very high volumes,
two-way messaging, and platform-level (super admin) announcements.
