# Phase 5 — Fees, billing & payments

Migrations `supabase/migrations/20261011000001`–`…04`. Builds on Phases 1–4.

```
 fee_types ─┐            discount_types
            ↓                  ↓
 fee_structures → fee_structure_items ──generate_charges()──→ student_charges ←── student_discounts
                                                                   ↑   ↑             financial_adjustments
                                                     payment_allocations
                                                                   ↑
 manual: record_payment() ─────────────→ payments ──→ receipts (unique number)
 online: create_payment_intent() → payment_transactions ──(verified webhook)──→ payments
                                                   │
                                                refunds (requested → approved → processed)

 Every change → financial_audit_logs (who, when, old values, new values, reason)
 Balances are never stored: views student_charge_balances / student_payment_credits / student_ledger
```

A **fee** (configuration) is not a **charge** (what one student owes), and a
**payment** (money received) is not a charge either. A payment is linked to
charges only through **allocations**.

## What was built

| Area | Where |
| --- | --- |
| Finance roles `finance_admin`, `finance_staff`; school-admin finance access (full / view / none) | `…01_finance_roles.sql`, `private.finance_level()` |
| Fee types, fee structures (year, optional grade or section), items (amount, frequency, installments, due date) | Finance → Fee Setup |
| Charge generation with preview, idempotent | `generate_charges(structure, dry_run)` |
| Individual charges, cancellation (unpaid only) | `create_charge`, `cancel_charge` |
| Discount types (fixed / %), student discounts, revocation | `apply_discount`, `revoke_discount` |
| Adjustments (penalty, debit, waiver, discount, credit, signed correction) | `create_adjustment` |
| Payments with allocation, partial payments, overpayment credit, credit application, release | `record_payment`, `apply_credit`, `release_allocation` |
| Reversal (never delete) with receipt voiding | `reverse_payment` |
| Refunds with approval and second-approver rule | `request_refund`, `decide_refund`, `process_refund`, `cancel_refund` |
| Receipts: unique per school, sequential per year, printable | `next_receipt_number`, `/receipts/[id]` |
| Student ledger, balances, credits | views; Finance → student account; `/fees` for families |
| Finance dashboard with filters (year, grade, section, fee type, method, dates) | `finance_overview()`, `/finance` |
| Online payment abstraction, simulator gateway, signed webhooks | `src/server/payments/`, `/api/payments/webhooks/[provider]` |
| CSV exports (payments, balances, charges, receipts, refunds) | `/api/finance/export/[report]` |
| Financial audit log viewer | `/finance/audit` |
| Feature flags `billing`, `student_finance`, `refunds`, `online_payments` | `features` catalog |

**Feature flags.** `billing` turns the whole module on for a school (off by
default). `student_finance` lets students and parents see their accounts
(the spec's *parent_payments* view). `online_payments` allows paying online.
`refunds` enables the refund workflow. Receipts are always issued with a
payment (the spec's *payment_receipts* is part of `billing`), because a
payment without a receipt would be an incomplete record.

## How the ledger works

Nothing in the database stores "the balance". Every number is derived from
the records, in PostgreSQL `numeric(12,2)`:

```
charge net      = original amount + Σ adjustments − Σ active discounts      (0 if cancelled)
charge paid     = Σ active allocations from completed payments
charge balance  = net − paid
payment credit  = amount − Σ active allocations − Σ refunds (requested/approved/processed)
```

`student_ledger` is the chronological statement: charges (+), cancellations
(−), discounts (−), revocations (+), adjustments (±), payments (−),
reversals (+) and refunds paid out (+). Its running total always equals
"balance due − credit" (pending refunds hold credit until paid out — tested).

`student_charges.status` is a cached label (`pending`, `partially_paid`,
`paid`, `cancelled`) refreshed by the same transaction that changes money;
`overdue` is derived when reading (past due date and unpaid), so it is always
correct without a job.

## How balances are calculated

The views `student_charge_balances` (per charge) and `student_payment_credits`
(per payment) are `security_invoker`, so RLS applies to them. Totals on the
dashboards come from `finance_overview()`, which aggregates in SQL. The
browser only formats numbers; where the UI adds amounts for display (e.g. the
payment form's "applied / unapplied" line) it uses integer cents, and the
database re-validates every amount.

## How allocation works

`record_payment(student, amount, method, …, allocations[], idempotency_key)`
runs as **one transaction**:

1. authorizes the caller (finance staff or admin of the student's school);
2. inserts the payment (school and enrollment come from the student record,
   never from the client);
3. for each allocation: locks the charge (`FOR UPDATE`), checks it belongs to
   the same student, is not cancelled, and that the amount ≤ what it still
   owes; checks the total ≤ the payment;
4. refreshes charge statuses, issues the receipt, writes the audit trail,
   sends the `payment_received` notification.

Any failure rolls everything back — a rejected payment leaves nothing behind
(tested). Composite foreign keys `(school_id, student_id, …)` make it
structurally impossible to allocate one student's money to another student's
charge.

## Partial payments

A charge can receive any number of allocations from any number of payments
until its balance is zero; it shows `partially_paid` in between.

## Overpayments and credits

Money not allocated stays on the payment as **credit** (visible in
`student_payment_credits`, on the payment, and as "Credit" on the account).
Staff can later `apply_credit` it to a charge, or it can be refunded. A
finance admin can `release_allocation` (with a reason) to move applied money
back to credit — the allocation row is kept, marked released.

## Refunds

A refund comes only from a payment's **unallocated** credit (so it can never
make a charge "unpaid" silently). Workflow: `requested` (staff/admin) →
`approved` / `rejected` (finance admin; a *different person* from the
requester when *Refunds need a second person* is on — the default) →
`processed` (payout recorded with method and reference) — or `cancelled`.
The original payment is never changed; the ledger shows the payout.

## How historical records are preserved

* `student_charges`, `payments`, `payment_allocations`, `receipts`, `refunds`
  and `student_discounts` cannot be deleted by anyone, including the service
  key (trigger). A guard trigger freezes every recorded fact (amounts,
  student, dates, method…) and allows only forward status transitions
  (e.g. completed → reversed, issued → voided).
* `financial_adjustments` and `financial_audit_logs` are append-only.
* Corrections are new records: a wrong payment is **reversed** (receipt
  voided, charges owed again, reason recorded); a wrong discount is
  **revoked**; a wrong charge is **cancelled** (only if nothing was paid) or
  **adjusted**.
* Editing fee structures or discount types never touches existing charges.
* `financial_audit_logs` records actor, action, entity, student, old values,
  new values and reason for every operation and configuration change
  (including changes to finance settings).

## Online payment integration

`src/server/payments/providers.ts` defines `PaymentProvider`:
`createPayment`, `verifyWebhook`, `verifyPayment`, `getPaymentStatus`,
`refundPayment`. Enabled providers come from `PAYMENT_PROVIDERS`; secrets
from server-only env vars. The included **simulator** stands in for a gateway
during development (its checkout page is `/pay/simulator/[id]`) — never
enable it in production.

Flow:

1. Parent/student selects charges → `startOnlinePayment` → the database
   function `create_payment_intent` checks the caller may pay for that student
   and **computes the amount from the charges**; a `payment_transactions` row
   is created (`pending`).
2. The provider creates a checkout; its reference and URL are attached with
   the service key (`set_transaction_checkout`, service role only).
3. The payer pays on the provider's page.
4. The provider calls `POST /api/payments/webhooks/<provider>`. The handler
   verifies the HMAC signature over the **raw body** and a timestamp (±5 min),
   records the event, asks the provider to confirm (`verifyPayment`), then
   calls `complete_payment_transaction` (service role only), which checks the
   verified amount equals the transaction amount, creates the payment,
   allocates it to the selected charges (oldest due first; anything left —
   e.g. a charge paid at the counter meanwhile — becomes credit) and issues
   the receipt.
5. The return page `/fees/payments/[id]` only **reads** the status.

A browser can never mark a payment successful: `complete_payment_transaction`
and the webhook RPCs are not executable by `authenticated`; transactions are
read-only through the API; the return URL changes nothing; an amount
mismatch fails the transaction.

**Adding a real gateway** (e.g. PayMongo, Xendit, Stripe): implement
`PaymentProvider` (create a checkout session via its API, verify its webhook
signature with its signing secret, confirm the payment via its API in
`verifyPayment`), register it in `getPaymentProvider`, set its keys as
server-only env vars, add its name to `PAYMENT_PROVIDERS`, and configure the
webhook URL `https://<domain>/api/payments/webhooks/<name>` in the gateway.

## How duplicate webhook processing is prevented

* `payment_webhook_events` has `unique (provider, event_id)`; a retried event
  that was already processed returns `duplicate` and changes nothing.
* `complete_payment_transaction` locks the transaction row and is idempotent:
  a second success (even under a different event id) returns the existing
  payment; `payments.payment_transaction_id` is unique as a last line.
* Events that fail mid-way are stored as `failed` and are processed again on
  the provider's retry.
* Unsigned/forged/stale events are stored as `rejected` under a hash of the
  body (so a forged request cannot "use up" a real event id) and return 401.
* Manual payments use an idempotency key per form: a double click or a retry
  returns the first payment (unique `(school_id, idempotency_key)`).

## How financial RLS works

| Table | Read | Write through the API |
| --- | --- | --- |
| `fee_types`, `fee_structures`, `fee_structure_items`, `discount_types` | finance view level | finance admin (insert/update; items deletable only before charges exist) |
| `student_charges`, `student_discounts`, `financial_adjustments`, `payments`, `payment_allocations`, `refunds`, `payment_transactions` | finance view level, or the student / verified parents (when `student_finance` is on) | none — database functions only |
| `receipts` | finance view level, or the payment's student / parents | none |
| `payment_webhook_events`, `financial_audit_logs` | finance admin | none |
| `receipt_sequences` | nobody | functions only |

Levels come from `private.finance_level(school)`: finance admin → admin;
finance staff → staff; school admin → per *School administrators' finance
access* (full = admin, view, none); teachers, students, parents → none.
Every level requires the `billing` feature and the caller's own school.
Finance users additionally get read access to students, enrollments and
sections (to bill them) — but **not** grades, attendance or guardian
contacts. All money-moving RPCs are `SECURITY DEFINER` and re-check the
level themselves; school ids always come from the records, never from input.

**Separation of duties.** Only the `finance_admin` role (or the platform)
can change school admins' finance access (trigger-enforced), and finance roles
are provisioned only by the platform — a school admin cannot create a finance
account whose password they would know. Finance admins can change only the
finance settings of their school, not branding or academic settings.

## How parent financial access is secured

* `private.family_finance_student_ids()` returns only the caller's own
  student record or students linked to their guardian record, and only when
  the school has `billing` and `student_finance` on.
* Parents never write financial tables; online payments go through
  `create_payment_intent`, which checks the same relationship and prices the
  charges itself.
* Pages under `/fees` and `/receipts` show "not found" for any other student
  (RLS), and the simulator checkout cannot be driven for another family's
  transaction. Tested: Parent A sees Child A, not Child B or School B.

## How this prepares for SaaS subscription billing

Platform billing (schools paying the platform) can reuse the same building
blocks without mixing tenants' money: the provider abstraction and webhook
pipeline (with a `platform` provider account), the transaction → verified
payment → receipt pattern, idempotency keys, the audit trail and the
numeric/derived-balance approach. It would live in its own tables keyed by
`school_id` as the *customer* (e.g. `subscriptions`, `platform_invoices`),
readable by super admins and the school's own admin, while the tables in
this phase stay strictly within each school. Feature flags already gate
modules per school, so plans map naturally onto them. (Not built: no
subscriptions, no platform billing dashboard, no automatic suspension.)

## Money handling rules

* PostgreSQL `numeric(12,2)` everywhere; money arrives at RPCs as decimal
  strings and is validated (positive, ≤ 2 decimals) on both sides.
* Installments split to the cent: the last installment absorbs the remainder
  (1,000.00 / 3 → 333.33, 333.33, 333.34).
* Each school has a currency (`school_settings.currency`, default PHP);
  payments and transactions store it.
* Receipts state that they acknowledge payment and are **not** an official
  receipt or invoice for tax purposes.

## Not built (by design)

Subscription billing, a platform billing dashboard, automatic suspension,
general ledger accounting, payroll, tax/BIR invoicing, crypto, lending,
forecasting, AI analysis. A real payment gateway is not configured — only
the simulator.
