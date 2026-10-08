-- =============================================================================
-- Phase 4: communication & notifications (schema)
--
-- ONE notification system: every event produces one in-app notification per
-- recipient (the canonical record) and zero or more queued deliveries for
-- external channels (email, SMS, push). Channels are decided by school
-- configuration, feature flags, the notification type, and user preferences.
-- Providers are plugged in server-side and never touch this schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Notification type catalog (replaces the Phase 3 enum: types now carry
-- behaviour — category, default channels, whether users may opt out)
-- ---------------------------------------------------------------------------
create table public.notification_types (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique check (key ~ '^[a-z][a-z_]{1,49}$'),
  name            text not null,
  description     text,
  category        text not null check (category in ('academic', 'announcement', 'schedule', 'system', 'account')),
  default_in_app  boolean not null default true,
  default_email   boolean not null default false,
  default_sms     boolean not null default false,
  default_push    boolean not null default true,
  -- Mandatory: users cannot switch these off (in-app always; other channels follow the defaults).
  mandatory       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger notification_types_set_updated_at before update on public.notification_types
  for each row execute function public.set_updated_at();

insert into public.notification_types (key, name, description, category, default_in_app, default_email, default_sms, default_push, mandatory) values
  ('announcement',       'Announcements',          'School announcements addressed to you',           'announcement', true, true,  false, true,  false),
  ('school_event',       'School events',          'Events and important school notices',             'announcement', true, true,  false, true,  false),
  ('assignment_created', 'New assignments',        'A teacher posted coursework for a class',         'academic',     true, false, false, true,  false),
  ('assignment_due',     'Assignment reminders',   'Coursework due within 24 hours and not submitted', 'academic',     true, false, false, true,  false),
  ('assignment_graded',  'Assignment reviewed',    'A teacher reviewed a submission',                 'academic',     true, false, false, true,  false),
  ('attendance_absent',  'Absence alerts',         'A student was marked absent',                     'academic',     true, true,  true,  true,  false),
  ('attendance_late',    'Late arrival alerts',    'A student was marked late',                       'academic',     true, false, false, true,  false),
  ('grade_published',    'Grades published',       'A grade was approved and published',              'academic',     true, true,  false, true,  false),
  ('grade_updated',      'Grade changes',          'A published grade was changed',                   'academic',     true, true,  false, true,  false),
  ('schedule_changed',   'Schedule changes',       'A class time, room or teacher changed',           'schedule',     true, false, false, true,  false),
  ('system',             'System messages',        'Important platform messages',                     'system',       true, false, false, false, true),
  ('account',            'Account security',       'Changes to your account',                         'account',      true, true,  false, false, true);

create type public.notification_priority as enum ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- notifications: migrate from the enum to the catalog; add idempotency,
-- priority, expiry, dismissal, and per-user in-app visibility.
-- ---------------------------------------------------------------------------
alter table public.notifications alter column type type text using type::text;

update public.notifications
   set type = case when data ->> 'status' = 'late' then 'attendance_late' else 'attendance_absent' end
 where type = 'attendance_recorded';

alter table public.notifications
  add constraint notifications_type_fkey foreign key (type) references public.notification_types (key) on update cascade,
  add column event_key text,
  add column priority public.notification_priority not null default 'normal',
  add column expires_at timestamptz,
  add column dismissed_at timestamptz,
  add column show_in_app boolean not null default true,
  add column actor_user_id uuid references auth.users (id) on delete set null,
  add constraint notifications_school_id_key unique (school_id, id);

update public.notifications set event_key = 'legacy:' || id where event_key is null;
alter table public.notifications alter column event_key set not null;

-- IDEMPOTENCY: one notification per event per recipient, whatever happens upstream.
alter table public.notifications add constraint notifications_event_recipient_key unique (event_key, recipient_user_id);
create index notifications_school_type_idx on public.notifications (school_id, type, created_at desc);

-- The Phase 3 helper used the enum; it is replaced by private.notify_event().
drop function private.notify(uuid, uuid[], public.notification_type, text, text, jsonb);
drop type public.notification_type;

-- ---------------------------------------------------------------------------
-- Per-user preferences (absent row = the type's defaults)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  user_id            uuid not null references auth.users (id) on delete cascade,
  notification_type  text not null references public.notification_types (key) on update cascade on delete cascade,
  in_app_enabled     boolean not null default true,
  email_enabled      boolean not null default false,
  sms_enabled        boolean not null default false,
  push_enabled       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint notification_preferences_user_type_key unique (user_id, notification_type)
);

-- ---------------------------------------------------------------------------
-- School communication settings (choices only — NO provider credentials here;
-- those live in server environment variables)
-- ---------------------------------------------------------------------------
alter table public.school_settings
  add column notifications_enabled boolean not null default true,
  add column email_notifications_enabled boolean not null default false,
  add column sms_notifications_enabled boolean not null default false,
  add column push_notifications_enabled boolean not null default false,
  add column teachers_can_announce boolean not null default false;

-- Feature flags (platform-controlled; later tied to plans/add-ons).
insert into public.features (key, name, description, default_enabled) values
  ('announcements',        'Announcements',        'School-wide and targeted announcements.', true),
  ('email_notifications',  'Email notifications',  'Deliver notifications by email.', false),
  ('push_notifications',   'Push notifications',   'Deliver notifications to mobile devices.', false),
  ('parent_communication', 'Parent communication', 'Send academic alerts to parents and guardians.', true);

-- ---------------------------------------------------------------------------
-- Announcements + flexible targeting
-- ---------------------------------------------------------------------------
create type public.announcement_status as enum ('draft', 'scheduled', 'published', 'archived');
-- school = entire school; grade_level / section = current-year members;
-- class = one teaching load (section students + that subject's teacher);
-- user = one specific account. `roles` narrows any target (NULL = everyone in it).
create type public.announcement_target_type as enum ('school', 'grade_level', 'section', 'class', 'user');

create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  author_user_id  uuid references auth.users (id) on delete set null,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  content         text not null check (char_length(btrim(content)) between 1 and 20000),
  priority        public.notification_priority not null default 'normal',
  status          public.announcement_status not null default 'draft',
  publish_at      timestamptz,
  expires_at      timestamptz,
  published_at    timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint announcements_expiry_after_publish check (expires_at is null or publish_at is null or expires_at > publish_at),
  constraint announcements_scheduled_has_time check (status <> 'scheduled' or publish_at is not null),
  constraint announcements_school_id_key unique (school_id, id)
);
create index announcements_school_status_idx on public.announcements (school_id, status, published_at desc);
create index announcements_due_idx on public.announcements (publish_at) where status = 'scheduled';

create table public.announcement_targets (
  id               uuid primary key default gen_random_uuid(),
  announcement_id  uuid not null,
  school_id        uuid not null references public.schools (id) on delete restrict,
  target_type      public.announcement_target_type not null,
  -- school -> the school id; grade_level/section -> their id; class -> teacher_subject_assignments id; user -> auth user id
  target_id        uuid not null,
  roles            public.app_role[],
  created_at       timestamptz not null default now(),
  constraint announcement_targets_announcement_fkey foreign key (school_id, announcement_id)
    references public.announcements (school_id, id) on delete cascade,
  constraint announcement_targets_roles check (roles is null or (cardinality(roles) > 0 and not ('super_admin' = any(roles)))),
  constraint announcement_targets_unique unique (announcement_id, target_type, target_id)
);
create index announcement_targets_lookup_idx on public.announcement_targets (target_type, target_id);
create index announcement_targets_announcement_idx on public.announcement_targets (announcement_id);

-- ---------------------------------------------------------------------------
-- Delivery queue (external channels). In-app delivery IS the notification row.
-- ---------------------------------------------------------------------------
create type public.delivery_channel as enum ('in_app', 'email', 'sms', 'push');
create type public.delivery_status as enum ('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled');

create table public.notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete restrict,
  notification_id      uuid not null,
  recipient_user_id    uuid not null references auth.users (id) on delete cascade,
  channel              public.delivery_channel not null,
  -- Email address, phone number or device push token (PII: admins only, never logged).
  destination          text not null check (char_length(destination) between 3 and 4096),
  status               public.delivery_status not null default 'pending',
  provider             text,
  provider_message_id  text,
  attempts             integer not null default 0,
  next_attempt_at      timestamptz not null default now(),
  last_attempt_at      timestamptz,
  delivered_at         timestamptz,
  failed_at            timestamptz,
  error_message        text check (error_message is null or char_length(error_message) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint notification_deliveries_notification_fkey foreign key (school_id, notification_id)
    references public.notifications (school_id, id) on delete cascade,
  -- IDEMPOTENCY at the channel level: one delivery per notification/channel/destination.
  constraint notification_deliveries_unique unique (notification_id, channel, destination)
);
create index notification_deliveries_queue_idx on public.notification_deliveries (next_attempt_at) where status = 'pending';
create index notification_deliveries_school_idx on public.notification_deliveries (school_id, created_at desc);
create index notification_deliveries_status_idx on public.notification_deliveries (school_id, channel, status);

-- ---------------------------------------------------------------------------
-- SMS usage per school per month (future usage-based billing; no prices here)
-- ---------------------------------------------------------------------------
create table public.sms_usage (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  year             smallint not null check (year between 2000 and 2200),
  month            smallint not null check (month between 1 and 12),
  messages_sent    integer not null default 0 check (messages_sent >= 0),
  messages_failed  integer not null default 0 check (messages_failed >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sms_usage_school_month_key unique (school_id, year, month)
);

-- ---------------------------------------------------------------------------
-- Devices for push notifications (many per user; Flutter registers here)
-- ---------------------------------------------------------------------------
create type public.device_type as enum ('android', 'ios', 'web');

create table public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  user_id       uuid not null references auth.users (id) on delete cascade,
  device_type   public.device_type not null,
  push_token    text not null unique check (char_length(push_token) between 8 and 4096),
  app_version   text check (app_version is null or char_length(app_version) <= 50),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index user_devices_user_idx on public.user_devices (user_id);

-- ---------------------------------------------------------------------------
-- updated_at / immutable school_id
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['notification_preferences', 'announcements', 'notification_deliveries', 'sms_usage', 'user_devices'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['notification_preferences', 'announcements', 'announcement_targets', 'notification_deliveries', 'sms_usage'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.forbid_school_change()', t || '_forbid_school_change', t);
  end loop;
end $$;
