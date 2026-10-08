-- =============================================================================
-- Phase 5: fees, billing & payments (schema)
--
--   fee types / structures / items  (configuration, per school)
--        ↓ generate (idempotent)
--   student_charges   (what a student owes; amount never changes)
--        ↓ student_discounts / financial_adjustments   (separate rows, never edits)
--   payments          (money received; never edited — reversed instead)
--        ↓ payment_allocations   (which charges a payment paid; released, never deleted)
--   refunds           (money returned from a payment's unallocated credit)
--        ↓
--   balances / credits / ledger  = VIEWS computed from the rows above
--
-- Money: numeric(12,2) everywhere (never floating point). Currency per school.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings, features, notification type
-- ---------------------------------------------------------------------------
create type public.finance_access as enum ('full', 'view', 'none');

alter table public.school_settings
  add column currency char(3) not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  -- How much finance access school admins have (separation of duties).
  -- Only finance admins or the platform owner may change it (guard trigger).
  add column admin_finance_access public.finance_access not null default 'full',
  -- Refunds must be approved by someone other than the requester.
  add column refunds_require_second_approver boolean not null default true,
  add column receipt_prefix text not null default 'PR' check (receipt_prefix ~ '^[A-Z0-9-]{1,10}$');

insert into public.features (key, name, description, default_enabled) values
  ('billing',         'Billing & payments', 'Fee structures, charges, payments, receipts and balances.', false),
  ('student_finance', 'Family finance view', 'Students and parents can see their balances, charges and receipts.', true),
  ('refunds',         'Refunds',            'Refund requests and approvals.', true),
  ('online_payments', 'Online payments',    'Parents pay online through a payment provider.', false);

insert into public.notification_types (key, name, description, category, default_in_app, default_email, default_sms, default_push, mandatory)
values ('payment_received', 'Payment receipts', 'A payment was recorded for your child', 'account', true, true, false, true, false);

-- Charges must reference the student's enrollment IN THE SAME YEAR.
alter table public.student_enrollments
  add constraint student_enrollments_school_year_student_id_key unique (school_id, academic_year_id, student_id, id);

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.fee_frequency as enum ('one_time', 'monthly', 'quarterly', 'semester', 'annual', 'custom');
create type public.charge_status as enum ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.discount_calculation as enum ('fixed', 'percentage');
create type public.adjustment_type as enum ('discount', 'waiver', 'penalty', 'credit', 'debit', 'correction');
create type public.payment_method as enum ('cash', 'bank_transfer', 'check', 'card', 'e_wallet', 'online', 'other');
create type public.payment_status as enum ('completed', 'reversed');
create type public.refund_status as enum ('requested', 'approved', 'rejected', 'processed', 'cancelled');
create type public.receipt_status as enum ('issued', 'voided');
create type public.payment_transaction_status as enum ('pending', 'processing', 'successful', 'failed', 'cancelled', 'expired', 'refunded');

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
create table public.fee_types (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  code         text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  description  text check (description is null or char_length(description) <= 500),
  category     text not null default 'other' check (category in ('tuition', 'registration', 'miscellaneous', 'laboratory', 'library', 'activity', 'transportation', 'uniform', 'other')),
  status       public.record_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fee_types_school_id_key unique (school_id, id)
);
create unique index fee_types_school_code_key on public.fee_types (school_id, lower(code));

create table public.fee_structures (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  name              text not null check (char_length(btrim(name)) between 1 and 150),
  description       text check (description is null or char_length(description) <= 1000),
  grade_level_id    uuid,
  section_id        uuid,
  status            public.record_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fee_structures_year_fkey foreign key (school_id, academic_year_id) references public.academic_years (school_id, id),
  constraint fee_structures_grade_fkey foreign key (school_id, grade_level_id) references public.grade_levels (school_id, id),
  constraint fee_structures_section_fkey foreign key (school_id, academic_year_id, section_id) references public.sections (school_id, academic_year_id, id),
  constraint fee_structures_school_id_key unique (school_id, id),
  constraint fee_structures_school_year_id_key unique (school_id, academic_year_id, id)
);
create index fee_structures_year_idx on public.fee_structures (school_id, academic_year_id);

create table public.fee_structure_items (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  fee_structure_id  uuid not null,
  fee_type_id       uuid not null,
  name              text not null check (char_length(btrim(name)) between 1 and 150),
  amount            numeric(12,2) not null check (amount > 0),
  frequency         public.fee_frequency not null default 'one_time',
  -- Charges generated: 1 for one_time/annual/custom; N installments otherwise.
  installments      smallint not null default 1 check (installments between 1 and 24),
  due_date          date,
  sequence          smallint not null default 1 check (sequence between 1 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fee_items_structure_fkey foreign key (school_id, fee_structure_id) references public.fee_structures (school_id, id) on delete cascade,
  constraint fee_items_type_fkey foreign key (school_id, fee_type_id) references public.fee_types (school_id, id),
  constraint fee_items_installments_match check (frequency in ('monthly', 'quarterly', 'semester') or installments = 1),
  constraint fee_items_school_id_key unique (school_id, id)
);
create index fee_items_structure_idx on public.fee_structure_items (fee_structure_id, sequence);

create table public.discount_types (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  name              text not null check (char_length(btrim(name)) between 1 and 100),
  code              text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  description       text check (description is null or char_length(description) <= 500),
  calculation_type  public.discount_calculation not null,
  value             numeric(12,2) not null check (value > 0),
  status            public.record_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint discount_types_percentage check (calculation_type = 'fixed' or value <= 100),
  constraint discount_types_school_id_key unique (school_id, id)
);
create unique index discount_types_school_code_key on public.discount_types (school_id, lower(code));

-- ---------------------------------------------------------------------------
-- Charges (what a student owes)
-- ---------------------------------------------------------------------------
create table public.student_charges (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools (id) on delete restrict,
  academic_year_id       uuid not null,
  enrollment_id          uuid not null,
  student_id             uuid not null,
  fee_structure_item_id  uuid,
  installment_no         smallint not null default 1 check (installment_no between 1 and 24),
  fee_type_id            uuid not null,
  description            text not null check (char_length(btrim(description)) between 1 and 200),
  -- Original amount: NEVER changes. Discounts/adjustments are separate rows.
  amount                 numeric(12,2) not null check (amount > 0),
  due_date               date,
  -- Cached from the records by the database (pending/partially_paid/paid/cancelled);
  -- "overdue" is derived at read time from due_date.
  status                 public.charge_status not null default 'pending',
  created_by             uuid references auth.users (id) on delete set null,
  cancelled_at           timestamptz,
  cancelled_by           uuid references auth.users (id) on delete set null,
  cancel_reason          text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- The enrollment belongs to this student, in this school and this year.
  constraint charges_enrollment_fkey foreign key (school_id, academic_year_id, student_id, enrollment_id)
    references public.student_enrollments (school_id, academic_year_id, student_id, id),
  constraint charges_fee_type_fkey foreign key (school_id, fee_type_id) references public.fee_types (school_id, id),
  constraint charges_item_fkey foreign key (school_id, fee_structure_item_id) references public.fee_structure_items (school_id, id),
  constraint charges_student_ref foreign key (school_id, student_id) references public.students (school_id, id),
  constraint charges_cancel_complete check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint charges_school_id_key unique (school_id, id),
  constraint charges_school_student_id_key unique (school_id, student_id, id)
);
-- IDEMPOTENT GENERATION: one charge per student per fee item per installment, ever.
create unique index charges_generation_key on public.student_charges (student_id, fee_structure_item_id, installment_no)
  where fee_structure_item_id is not null;
create index charges_student_idx on public.student_charges (student_id, academic_year_id);
create index charges_school_year_idx on public.student_charges (school_id, academic_year_id, status);
create index charges_due_idx on public.student_charges (school_id, due_date) where status in ('pending', 'partially_paid');
create index charges_fee_type_idx on public.student_charges (fee_type_id);
create index charges_enrollment_idx on public.student_charges (enrollment_id);

-- ---------------------------------------------------------------------------
-- Discounts and adjustments (never edit the charge)
-- ---------------------------------------------------------------------------
create table public.student_discounts (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  student_id         uuid not null,
  enrollment_id      uuid not null,
  student_charge_id  uuid not null,
  discount_type_id   uuid not null,
  -- Computed by the database from the discount type at the time it was applied.
  amount             numeric(12,2) not null check (amount > 0),
  percentage         numeric(5,2) check (percentage is null or (percentage > 0 and percentage <= 100)),
  reason             text not null check (char_length(btrim(reason)) between 3 and 500),
  status             public.record_status not null default 'active',
  created_by         uuid references auth.users (id) on delete set null,
  revoked_at         timestamptz,
  revoked_by         uuid references auth.users (id) on delete set null,
  revoke_reason      text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint student_discounts_charge_fkey foreign key (school_id, student_id, student_charge_id) references public.student_charges (school_id, student_id, id),
  constraint student_discounts_type_fkey foreign key (school_id, discount_type_id) references public.discount_types (school_id, id),
  constraint student_discounts_enrollment_fkey foreign key (school_id, student_id, enrollment_id) references public.student_enrollments (school_id, student_id, id),
  constraint student_discounts_revoke_complete check ((status = 'inactive') = (revoked_at is not null))
);
create index student_discounts_charge_idx on public.student_discounts (student_charge_id) where status = 'active';
create index student_discounts_student_idx on public.student_discounts (student_id);

-- Append-only. Positive signed_amount increases what is owed; negative reduces it.
create table public.financial_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  student_id         uuid not null,
  student_charge_id  uuid not null,
  adjustment_type    public.adjustment_type not null,
  signed_amount      numeric(12,2) not null check (signed_amount <> 0),
  reason             text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint adjustments_charge_fkey foreign key (school_id, student_id, student_charge_id) references public.student_charges (school_id, student_id, id),
  constraint adjustments_direction check (
    (adjustment_type in ('discount', 'waiver', 'credit') and signed_amount < 0) or
    (adjustment_type in ('penalty', 'debit') and signed_amount > 0) or
    adjustment_type = 'correction')
);
create index adjustments_charge_idx on public.financial_adjustments (student_charge_id);
create index adjustments_student_idx on public.financial_adjustments (student_id);

-- ---------------------------------------------------------------------------
-- Online payment transactions (provider-independent) — before payments (FK)
-- ---------------------------------------------------------------------------
create table public.payment_transactions (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references public.schools (id) on delete restrict,
  student_id               uuid not null,
  provider                 text not null check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  provider_transaction_id  text check (provider_transaction_id is null or char_length(provider_transaction_id) <= 200),
  -- Computed by the database from the selected charges; never from the client.
  amount                   numeric(12,2) not null check (amount > 0),
  currency                 char(3) not null,
  status                   public.payment_transaction_status not null default 'pending',
  checkout_url             text check (checkout_url is null or checkout_url ~* '^https?://'),
  -- Allocation plan: {"charge_ids": [...]} plus non-secret provider data.
  metadata                 jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by               uuid references auth.users (id) on delete set null,
  failure_reason           text check (failure_reason is null or char_length(failure_reason) <= 500),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint payment_tx_student_ref foreign key (school_id, student_id) references public.students (school_id, id),
  constraint payment_tx_school_id_key unique (school_id, id)
);
create unique index payment_tx_provider_key on public.payment_transactions (provider, provider_transaction_id) where provider_transaction_id is not null;
create index payment_tx_student_idx on public.payment_transactions (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Payments (money received). Immutable; incorrect payments are REVERSED.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references public.schools (id) on delete restrict,
  student_id              uuid not null,
  enrollment_id           uuid,
  amount                  numeric(12,2) not null check (amount > 0),
  currency                char(3) not null,
  payment_method          public.payment_method not null,
  reference_number        text check (reference_number is null or char_length(reference_number) <= 100),
  status                  public.payment_status not null default 'completed',
  payment_date            date not null default current_date,
  received_by             uuid references auth.users (id) on delete set null,
  notes                   text check (notes is null or char_length(notes) <= 1000),
  payment_transaction_id  uuid unique,     -- online payments: at most one payment per transaction
  -- Double-submit protection for manual entry (one payment per client key).
  idempotency_key         text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  reversed_at             timestamptz,
  reversed_by             uuid references auth.users (id) on delete set null,
  reversal_reason         text check (reversal_reason is null or char_length(reversal_reason) <= 500),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint payments_student_ref foreign key (school_id, student_id) references public.students (school_id, id),
  constraint payments_enrollment_fkey foreign key (school_id, student_id, enrollment_id) references public.student_enrollments (school_id, student_id, id),
  constraint payments_tx_fkey foreign key (school_id, payment_transaction_id) references public.payment_transactions (school_id, id),
  constraint payments_reversal_complete check ((status = 'reversed') = (reversed_at is not null and reversal_reason is not null)),
  constraint payments_school_id_key unique (school_id, id),
  constraint payments_school_student_id_key unique (school_id, student_id, id)
);
create unique index payments_idempotency_key on public.payments (school_id, idempotency_key) where idempotency_key is not null;
create index payments_student_idx on public.payments (student_id, payment_date desc);
create index payments_school_date_idx on public.payments (school_id, payment_date desc);
create index payments_school_status_idx on public.payments (school_id, status, payment_method);

create table public.payment_allocations (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  student_id         uuid not null,
  payment_id         uuid not null,
  student_charge_id  uuid not null,
  amount             numeric(12,2) not null check (amount > 0),
  created_by         uuid references auth.users (id) on delete set null,
  -- Released allocations return their amount to the payment's credit.
  released_at        timestamptz,
  released_by        uuid references auth.users (id) on delete set null,
  release_reason     text check (release_reason is null or char_length(release_reason) <= 500),
  created_at         timestamptz not null default now(),
  -- Payment and charge must belong to the SAME student (and school).
  constraint allocations_payment_fkey foreign key (school_id, student_id, payment_id) references public.payments (school_id, student_id, id),
  constraint allocations_charge_fkey foreign key (school_id, student_id, student_charge_id) references public.student_charges (school_id, student_id, id),
  constraint allocations_release_complete check ((released_at is null) = (release_reason is null))
);
create index allocations_payment_idx on public.payment_allocations (payment_id);
create index allocations_charge_idx on public.payment_allocations (student_charge_id) where released_at is null;

create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  payment_id        uuid not null,
  student_id        uuid not null,
  amount            numeric(12,2) not null check (amount > 0),
  reason            text not null check (char_length(btrim(reason)) between 3 and 500),
  status            public.refund_status not null default 'requested',
  requested_by      uuid references auth.users (id) on delete set null,
  approved_by       uuid references auth.users (id) on delete set null,
  decided_at        timestamptz,
  decision_note     text check (decision_note is null or char_length(decision_note) <= 500),
  processed_by      uuid references auth.users (id) on delete set null,
  processed_at      timestamptz,
  refund_method     public.payment_method,
  refund_reference  text check (refund_reference is null or char_length(refund_reference) <= 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint refunds_payment_fkey foreign key (school_id, student_id, payment_id) references public.payments (school_id, student_id, id)
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_school_status_idx on public.refunds (school_id, status);

-- ---------------------------------------------------------------------------
-- Receipts: numbered by the database, unique per school
-- ---------------------------------------------------------------------------
create table public.receipt_sequences (
  school_id    uuid not null references public.schools (id) on delete restrict,
  year         smallint not null,
  last_number  integer not null default 0,
  primary key (school_id, year)
);

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  payment_id      uuid not null unique,
  receipt_number  text not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references auth.users (id) on delete set null,
  status          public.receipt_status not null default 'issued',
  voided_at       timestamptz,
  void_reason     text,
  created_at      timestamptz not null default now(),
  constraint receipts_payment_fkey foreign key (school_id, payment_id) references public.payments (school_id, id),
  constraint receipts_number_key unique (school_id, receipt_number)
);

-- ---------------------------------------------------------------------------
-- Webhook events: every provider notification is recorded once (idempotency)
-- ---------------------------------------------------------------------------
create table public.payment_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  event_id         text not null check (char_length(event_id) between 1 and 200),
  event_type       text,
  school_id        uuid references public.schools (id) on delete restrict,
  transaction_id   uuid references public.payment_transactions (id) on delete set null,
  signature_valid  boolean not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed', 'rejected')),
  attempts         integer not null default 1,
  error_message    text check (error_message is null or char_length(error_message) <= 1000),
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  constraint webhook_events_unique unique (provider, event_id)
);
create index webhook_events_school_idx on public.payment_webhook_events (school_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Financial audit trail: append-only, with previous/new values and reason
-- ---------------------------------------------------------------------------
create table public.financial_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete restrict,
  actor_user_id  uuid references auth.users (id) on delete set null,
  action         text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity         text not null,
  entity_id      uuid,
  student_id     uuid,
  old_values     jsonb,
  new_values     jsonb,
  reason         text,
  created_at     timestamptz not null default now()
);
create index financial_audit_school_idx on public.financial_audit_logs (school_id, created_at desc);
create index financial_audit_entity_idx on public.financial_audit_logs (entity, entity_id);
create index financial_audit_student_idx on public.financial_audit_logs (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at / immutable school_id / append-only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fee_types', 'fee_structures', 'fee_structure_items', 'discount_types', 'student_charges',
                           'student_discounts', 'payment_transactions', 'payments', 'refunds'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['fee_types', 'fee_structures', 'fee_structure_items', 'discount_types', 'student_charges',
                           'student_discounts', 'financial_adjustments', 'payment_transactions', 'payments',
                           'payment_allocations', 'refunds', 'receipts', 'financial_audit_logs'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.forbid_school_change()', t || '_forbid_school_change', t);
  end loop;
end $$;

-- Financial history is never deleted (for everyone, including the service key).
do $$
declare t text;
begin
  foreach t in array array['student_charges', 'student_discounts', 'financial_adjustments', 'payments',
                           'payment_allocations', 'refunds', 'receipts', 'payment_transactions',
                           'payment_webhook_events', 'financial_audit_logs'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function private.forbid_change()', t || '_no_delete', t);
  end loop;
end $$;
create trigger financial_adjustments_no_update before update on public.financial_adjustments
  for each row execute function private.forbid_change();
create trigger financial_audit_logs_no_update before update on public.financial_audit_logs
  for each row execute function private.forbid_change();
