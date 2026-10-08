-- =============================================================================
-- Phase 5: access levels, money math, transaction-safe financial operations
--
-- Every multi-record financial operation is ONE database function (one
-- transaction): it authorizes the caller, validates every relationship, locks
-- the rows it changes, writes the records, refreshes derived status and writes
-- the financial audit trail — or fails and leaves nothing behind.
-- Direct table writes to charges, payments, allocations, discounts,
-- adjustments, refunds and receipts are not granted to API users.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Access levels
--   admin : finance admin (or school admin when admin_finance_access = full, or super admin)
--   staff : finance staff — view, record payments, issue receipts, request refunds
--   view  : school admin when admin_finance_access = view
--   none  : everyone else (teachers never get finance access)
-- ---------------------------------------------------------------------------
create function private.finance_level(p_school uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_super_admin() then 'admin'
    when p_school is null or p_school is distinct from private.my_school_id() then 'none'
    when not private.school_has_feature(p_school, 'billing') then 'none'
    when private.my_role() = 'finance_admin' then 'admin'
    when private.my_role() = 'finance_staff' then 'staff'
    when private.my_role() = 'school_admin' then (
      select case st.admin_finance_access when 'full' then 'admin' when 'view' then 'view' else 'none' end
      from public.school_settings st where st.school_id = p_school)
    else 'none'
  end
$$;

create function private.finance_can_view(p_school uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select private.finance_level(p_school) in ('admin', 'staff', 'view') $$;
create function private.finance_can_collect(p_school uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select private.finance_level(p_school) in ('admin', 'staff') $$;
create function private.finance_can_manage(p_school uuid) returns boolean language sql stable security definer set search_path = ''
as $$ select private.finance_level(p_school) = 'admin' $$;

-- Students/parents may see their own (children's) finances when the school offers it.
create function private.family_finance_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.students s
  where private.school_has_feature(private.my_school_id(), 'billing')
    and private.school_has_feature(private.my_school_id(), 'student_finance')
    and (s.id = private.my_student_id() or s.id in (select private.my_guardian_student_ids()))
$$;

-- ---------------------------------------------------------------------------
-- Money math (all numeric; derived from records, never stored as a balance)
-- ---------------------------------------------------------------------------

-- What a charge currently amounts to: original + adjustments − active discounts (0 if cancelled).
create function private.charge_net(p_charge uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.status = 'cancelled' then 0::numeric else
    c.amount
    + coalesce((select sum(a.signed_amount) from public.financial_adjustments a where a.student_charge_id = c.id), 0)
    - coalesce((select sum(d.amount) from public.student_discounts d where d.student_charge_id = c.id and d.status = 'active'), 0)
  end
  from public.student_charges c where c.id = p_charge
$$;

-- Money from completed payments currently applied to a charge.
create function private.charge_paid(p_charge uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(pa.amount), 0)
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.student_charge_id = p_charge and pa.released_at is null and p.status = 'completed'
$$;

create function private.charge_remaining(p_charge uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select private.charge_net(p_charge) - private.charge_paid(p_charge)
$$;

-- A payment's money not applied to charges and not (being) refunded = the student's credit.
create function private.payment_unallocated(p_payment uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.status <> 'completed' then 0::numeric else
    p.amount
    - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.payment_id = p.id and pa.released_at is null), 0)
    - coalesce((select sum(r.amount) from public.refunds r where r.payment_id = p.id and r.status in ('requested', 'approved', 'processed')), 0)
  end
  from public.payments p where p.id = p_payment
$$;

-- Cached status (pending / partially_paid / paid); "overdue" is derived at read time.
create function private.refresh_charge_status(p_charge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_net numeric := private.charge_net(p_charge);
  v_paid numeric := private.charge_paid(p_charge);
begin
  update public.student_charges
     set status = case when v_net - v_paid <= 0 then 'paid'::public.charge_status
                       when v_paid > 0 then 'partially_paid'::public.charge_status
                       else 'pending'::public.charge_status end
   where id = p_charge and status <> 'cancelled'
     and status is distinct from case when v_net - v_paid <= 0 then 'paid'::public.charge_status
                                      when v_paid > 0 then 'partially_paid'::public.charge_status
                                      else 'pending'::public.charge_status end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Financial audit (append-only; previous/new values and reason)
-- ---------------------------------------------------------------------------
create function private.fin_audit(p_school uuid, p_action text, p_entity text, p_entity_id uuid, p_student uuid,
                                  p_old jsonb default null, p_new jsonb default null, p_reason text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.financial_audit_logs (school_id, actor_user_id, action, entity, entity_id, student_id, old_values, new_values, reason)
  values (p_school, (select auth.uid()), p_action, p_entity, p_entity_id, p_student, p_old, p_new, p_reason)
$$;

-- Configuration changes (fee types, structures, items, discount types) are audited by trigger.
create function private.fin_audit_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_entity text := regexp_replace(tg_table_name, 's$', '');
begin
  perform private.fin_audit(new.school_id,
    v_entity || case when tg_op = 'INSERT' then '.created' else '.modified' end,
    v_entity, new.id, null,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), null);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['fee_types', 'fee_structures', 'fee_structure_items', 'discount_types'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function private.fin_audit_config()', t || '_fin_audit', t);
  end loop;
end $$;

-- Structure scope integrity: a section must be in the structure's grade.
create function private.check_fee_structure_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.section_id is not null and new.grade_level_id is not null and not exists (
    select 1 from public.sections where id = new.section_id and grade_level_id = new.grade_level_id) then
    raise exception 'The section does not belong to the selected grade level' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fee_structures_scope before insert or update on public.fee_structures
  for each row execute function private.check_fee_structure_scope();

-- ---------------------------------------------------------------------------
-- Finance settings: separation of duties
-- ---------------------------------------------------------------------------
create function private.guard_finance_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Only finance admins (the role itself) or the platform owner decide how much
  -- finance access school admins have.
  if new.admin_finance_access is distinct from old.admin_finance_access
     and not (private.is_super_admin() or (private.my_role() = 'finance_admin' and private.my_school_id() = new.school_id)) then
    raise exception 'Only a finance administrator can change school administrators'' finance access' using errcode = '42501';
  end if;
  if (new.currency, new.receipt_prefix, new.refunds_require_second_approver)
       is distinct from (old.currency, old.receipt_prefix, old.refunds_require_second_approver)
     and not private.finance_can_manage(new.school_id) then
    raise exception 'Only finance administrators can change finance settings' using errcode = '42501';
  end if;
  -- Finance admins may only touch the finance settings.
  if private.my_role() = 'finance_admin'
     and (to_jsonb(new) - array['currency', 'receipt_prefix', 'refunds_require_second_approver', 'admin_finance_access', 'updated_at'])
         is distinct from (to_jsonb(old) - array['currency', 'receipt_prefix', 'refunds_require_second_approver', 'admin_finance_access', 'updated_at']) then
    raise exception 'Finance administrators can only change finance settings' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger school_settings_finance_guard before update on public.school_settings
  for each row execute function private.guard_finance_settings();

-- The guard above must run as the caller (to tell API users apart), so the
-- audit write happens in a separate definer trigger once the change is allowed.
create function private.audit_finance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fin_audit(new.school_id, 'settings.finance_changed', 'school_settings', new.id, null,
    jsonb_build_object('admin_finance_access', old.admin_finance_access, 'currency', old.currency,
                       'receipt_prefix', old.receipt_prefix, 'refunds_require_second_approver', old.refunds_require_second_approver),
    jsonb_build_object('admin_finance_access', new.admin_finance_access, 'currency', new.currency,
                       'receipt_prefix', new.receipt_prefix, 'refunds_require_second_approver', new.refunds_require_second_approver),
    null);
  return null;
end;
$$;

create trigger school_settings_finance_audit after update on public.school_settings
  for each row when ((old.admin_finance_access, old.currency, old.receipt_prefix, old.refunds_require_second_approver)
                     is distinct from (new.admin_finance_access, new.currency, new.receipt_prefix, new.refunds_require_second_approver))
  execute function private.audit_finance_settings();

-- Receipt numbers: per school and year, gap-free under concurrency (row lock).
create function private.next_receipt_number(p_school uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint := extract(year from private.school_today(p_school));
  v_n integer;
  v_prefix text;
begin
  insert into public.receipt_sequences as rs (school_id, year, last_number) values (p_school, v_year, 1)
  on conflict (school_id, year) do update set last_number = rs.last_number + 1
  returning last_number into v_n;
  select receipt_prefix into v_prefix from public.school_settings where school_id = p_school;
  return coalesce(v_prefix, 'PR') || '-' || v_year || '-' || lpad(v_n::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: apply money from a payment to charges (shared by manual payments,
-- credit application and online payments). Locks each charge; never lets a
-- charge go below zero or a payment allocate more than it holds.
-- p_allocations: [{"charge_id": uuid, "amount": "123.45"}]
-- ---------------------------------------------------------------------------
create function private.allocate_payment(p_payment uuid, p_allocations jsonb)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments;
  c public.student_charges;
  r jsonb;
  v_amount numeric(12,2);
  v_available numeric;
  v_total numeric := 0;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or p.status <> 'completed' then
    raise exception 'Payment is not available for allocation' using errcode = 'P0001';
  end if;
  v_available := private.payment_unallocated(p.id);

  for r in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_amount := (r ->> 'amount')::numeric(12,2);
    continue when v_amount is null or v_amount = 0;
    if v_amount < 0 then
      raise exception 'Allocation amounts must be positive' using errcode = 'P0001';
    end if;
    select * into c from public.student_charges where id = (r ->> 'charge_id')::uuid for update;
    if c.id is null or c.student_id <> p.student_id or c.school_id <> p.school_id then
      raise exception 'A selected charge does not belong to this student' using errcode = 'P0001';
    end if;
    if c.status = 'cancelled' then
      raise exception 'Charge "%" is cancelled', c.description using errcode = 'P0001';
    end if;
    if v_amount > private.charge_remaining(c.id) then
      raise exception 'Allocation to "%" (%) exceeds its remaining balance (%)', c.description, v_amount, private.charge_remaining(c.id) using errcode = 'P0001';
    end if;
    v_total := v_total + v_amount;
    if v_total > v_available then
      raise exception 'Allocations (%) exceed the payment''s available amount (%)', v_total, v_available using errcode = 'P0001';
    end if;
    insert into public.payment_allocations (school_id, student_id, payment_id, student_charge_id, amount, created_by)
    values (p.school_id, p.student_id, p.id, c.id, v_amount, (select auth.uid()));
    perform private.refresh_charge_status(c.id);
  end loop;

  if v_total > 0 then
    perform private.fin_audit(p.school_id, 'payment.allocated', 'payment', p.id, p.student_id, null, p_allocations, null);
  end if;
  return v_total;
end;
$$;

-- Internal: create a payment + allocations + receipt + audit + notification.
create function private.create_payment(
  p_student uuid, p_amount numeric, p_method public.payment_method, p_reference text, p_payment_date date,
  p_notes text, p_allocations jsonb, p_idempotency_key text, p_transaction uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_payment uuid;
  v_receipt uuid;
  v_number text;
  v_enrollment uuid;
  v_currency char(3);
  v_allocated numeric;
begin
  select * into s from public.students where id = p_student;
  select currency into v_currency from public.school_settings where school_id = s.school_id;
  select e.id into v_enrollment
  from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id
  where e.student_id = s.id and e.enrollment_status = 'enrolled'
  order by y.is_current desc, e.enrollment_date desc limit 1;

  insert into public.payments (school_id, student_id, enrollment_id, amount, currency, payment_method, reference_number,
                               payment_date, received_by, notes, idempotency_key, payment_transaction_id)
  values (s.school_id, s.id, v_enrollment, p_amount::numeric(12,2), coalesce(v_currency, 'PHP'), p_method, nullif(btrim(p_reference), ''),
          p_payment_date, (select auth.uid()), nullif(btrim(p_notes), ''), p_idempotency_key, p_transaction)
  returning id into v_payment;

  v_allocated := private.allocate_payment(v_payment, p_allocations);

  v_number := private.next_receipt_number(s.school_id);
  insert into public.receipts (school_id, payment_id, receipt_number, issued_by)
  values (s.school_id, v_payment, v_number, (select auth.uid()))
  returning id into v_receipt;

  perform private.fin_audit(s.school_id, 'payment.recorded', 'payment', v_payment, s.id, null,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', p_reference, 'payment_date', p_payment_date,
                       'allocated', v_allocated, 'online_transaction', p_transaction), null);
  perform private.fin_audit(s.school_id, 'receipt.issued', 'receipt', v_receipt, s.id, null, jsonb_build_object('receipt_number', v_number), null);

  perform private.notify_event(s.school_id, 'payment_received', 'payment:' || v_payment,
    private.student_audience(s.id),
    'Payment received',
    'A payment of ' || coalesce(v_currency, 'PHP') || ' ' || to_char(p_amount, 'FM999,999,990.00') || ' for ' || s.first_name || ' was recorded. Receipt ' || v_number || '.',
    jsonb_build_object('entity_type', 'receipt', 'entity_id', v_receipt, 'student_id', s.id));

  return jsonb_build_object('payment_id', v_payment, 'receipt_id', v_receipt, 'receipt_number', v_number,
                            'allocated', v_allocated, 'unallocated', p_amount - v_allocated, 'duplicate', false);
end;
$$;

-- =============================================================================
-- PUBLIC RPCs (each one transaction; authorization inside)
-- =============================================================================

-- Generate charges from a fee structure for every matching OPEN enrollment.
-- Idempotent: the unique (student, item, installment) key makes re-runs no-ops.
create function public.generate_charges(p_structure_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fs public.fee_structures;
  v_targets integer;
  v_candidates integer;
  v_existing integer;
  v_created integer := 0;
begin
  select * into fs from public.fee_structures where id = p_structure_id;
  if fs.id is null or not private.finance_can_manage(fs.school_id) then
    raise exception 'Fee structure not found' using errcode = 'P0002';
  end if;
  if fs.status <> 'active' then
    raise exception 'Only active fee structures can generate charges' using errcode = 'P0001';
  end if;

  create temporary table if not exists pg_temp.charge_candidates (
    school_id uuid, academic_year_id uuid, enrollment_id uuid, student_id uuid, item_id uuid,
    installment_no smallint, fee_type_id uuid, description text, amount numeric(12,2), due_date date
  ) on commit drop;
  truncate pg_temp.charge_candidates;

  insert into pg_temp.charge_candidates
  select fs.school_id, fs.academic_year_id, e.id, e.student_id, i.id, k::smallint, i.fee_type_id,
         left(i.name || case when i.installments > 1 then ' (' || k || '/' || i.installments || ')' else '' end, 200),
         -- Split evenly; the last installment absorbs the rounding remainder (exact to the cent).
         case when k < i.installments then trunc(i.amount / i.installments, 2)
              else i.amount - trunc(i.amount / i.installments, 2) * (i.installments - 1) end,
         case when i.due_date is null then null else (i.due_date + (k - 1) * case i.frequency
              when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months'
              when 'semester' then interval '6 months' else interval '0' end)::date end
  from public.student_enrollments e
  join public.students st on st.id = e.student_id and st.status = 'active'
  join public.fee_structure_items i on i.fee_structure_id = fs.id
  cross join lateral generate_series(1, i.installments) as k
  where e.school_id = fs.school_id
    and e.academic_year_id = fs.academic_year_id
    and e.enrollment_status = 'enrolled'
    and (fs.grade_level_id is null or e.grade_level_id = fs.grade_level_id)
    and (fs.section_id is null or e.section_id = fs.section_id);

  select count(distinct student_id), count(*) into v_targets, v_candidates from pg_temp.charge_candidates;
  select count(*) into v_existing from pg_temp.charge_candidates cc
  where exists (select 1 from public.student_charges c
                where c.student_id = cc.student_id and c.fee_structure_item_id = cc.item_id and c.installment_no = cc.installment_no);

  if not p_dry_run then
    with ins as (
      insert into public.student_charges (school_id, academic_year_id, enrollment_id, student_id, fee_structure_item_id,
                                          installment_no, fee_type_id, description, amount, due_date, created_by)
      select school_id, academic_year_id, enrollment_id, student_id, item_id, installment_no, fee_type_id, description, amount, due_date, (select auth.uid())
      from pg_temp.charge_candidates
      on conflict (student_id, fee_structure_item_id, installment_no) where fee_structure_item_id is not null do nothing
      returning 1
    )
    select count(*) into v_created from ins;
    perform private.fin_audit(fs.school_id, 'charges.generated', 'fee_structure', fs.id, null, null,
      jsonb_build_object('students', v_targets, 'created', v_created, 'already_existed', v_existing), null);
  end if;

  return jsonb_build_object('students', v_targets, 'charges', v_candidates,
                            'created', case when p_dry_run then v_candidates - v_existing else v_created end,
                            'already_existed', v_existing, 'dry_run', p_dry_run);
end;
$$;

-- One-off charge for one student (e.g. an extra laboratory fee).
create function public.create_charge(p_student_id uuid, p_fee_type_id uuid, p_description text, p_amount numeric,
                                     p_due_date date default null, p_academic_year_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_enrollment public.student_enrollments;
  v_id uuid;
begin
  select * into s from public.students where id = p_student_id;
  if s.id is null or not private.finance_can_manage(s.school_id) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter an amount greater than zero with at most two decimals' using errcode = 'P0001';
  end if;
  select e.* into v_enrollment
  from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id
  where e.student_id = s.id
    and (p_academic_year_id is null and y.is_current or e.academic_year_id = p_academic_year_id)
  order by (e.enrollment_status = 'enrolled') desc, e.enrollment_date desc limit 1;
  if v_enrollment.id is null then
    raise exception 'The student has no enrollment in that academic year' using errcode = 'P0001';
  end if;
  insert into public.student_charges (school_id, academic_year_id, enrollment_id, student_id, fee_type_id, description, amount, due_date, created_by)
  values (s.school_id, v_enrollment.academic_year_id, v_enrollment.id, s.id, p_fee_type_id, btrim(p_description), p_amount, p_due_date, (select auth.uid()))
  returning id into v_id;
  perform private.fin_audit(s.school_id, 'charge.created', 'student_charge', v_id, s.id, null,
    jsonb_build_object('description', p_description, 'amount', p_amount, 'due_date', p_due_date, 'fee_type_id', p_fee_type_id), null);
  return v_id;
end;
$$;

create function public.cancel_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.student_charges;
begin
  select * into c from public.student_charges where id = p_charge_id for update;
  if c.id is null or not private.finance_can_manage(c.school_id) then
    raise exception 'Charge not found' using errcode = 'P0002';
  end if;
  if c.status = 'cancelled' then
    raise exception 'The charge is already cancelled' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  if private.charge_paid(c.id) > 0 then
    raise exception 'Payments are applied to this charge; release them first' using errcode = 'P0001';
  end if;
  update public.student_charges
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = btrim(p_reason)
   where id = c.id;
  perform private.fin_audit(c.school_id, 'charge.cancelled', 'student_charge', c.id, c.student_id,
    jsonb_build_object('status', c.status), jsonb_build_object('status', 'cancelled'), p_reason);
end;
$$;

-- Apply a discount type to one or more charges. The charge is never edited;
-- the computed discount is a separate row (capped at what remains owed).
create function public.apply_discount(p_charge_ids uuid[], p_discount_type_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  dt public.discount_types;
  c public.student_charges;
  v_amount numeric(12,2);
  v_count integer := 0;
  v_id uuid;
begin
  select * into dt from public.discount_types where id = p_discount_type_id;
  if dt.id is null or not private.finance_can_manage(dt.school_id) then
    raise exception 'Discount type not found' using errcode = 'P0002';
  end if;
  if dt.status <> 'active' then
    raise exception 'This discount type is inactive' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  foreach v_id in array p_charge_ids loop
    select * into c from public.student_charges where id = v_id for update;
    if c.id is null or c.school_id <> dt.school_id then
      raise exception 'A selected charge does not belong to this school' using errcode = 'P0001';
    end if;
    continue when c.status = 'cancelled';
    v_amount := least(
      case dt.calculation_type when 'fixed' then dt.value else round(c.amount * dt.value / 100, 2) end,
      private.charge_remaining(c.id));
    continue when v_amount <= 0;
    insert into public.student_discounts (school_id, student_id, enrollment_id, student_charge_id, discount_type_id, amount, percentage, reason, created_by)
    values (c.school_id, c.student_id, c.enrollment_id, c.id, dt.id, v_amount,
            case when dt.calculation_type = 'percentage' then dt.value end, btrim(p_reason), (select auth.uid()));
    perform private.refresh_charge_status(c.id);
    perform private.fin_audit(c.school_id, 'discount.applied', 'student_charge', c.id, c.student_id, null,
      jsonb_build_object('discount_type', dt.code, 'amount', v_amount, 'percentage', case when dt.calculation_type = 'percentage' then dt.value end), p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.revoke_discount(p_discount_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d public.student_discounts;
begin
  select * into d from public.student_discounts where id = p_discount_id for update;
  if d.id is null or not private.finance_can_manage(d.school_id) then
    raise exception 'Discount not found' using errcode = 'P0002';
  end if;
  if d.status <> 'active' then
    raise exception 'The discount is already revoked' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  update public.student_discounts set status = 'inactive', revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = btrim(p_reason)
   where id = d.id;
  perform private.refresh_charge_status(d.student_charge_id);
  perform private.fin_audit(d.school_id, 'discount.revoked', 'student_discount', d.id, d.student_id,
    jsonb_build_object('status', 'active', 'amount', d.amount), jsonb_build_object('status', 'inactive'), p_reason);
end;
$$;

-- Waiver / penalty / debit / credit / correction on a charge (append-only).
create function public.create_adjustment(p_charge_id uuid, p_type public.adjustment_type, p_amount numeric, p_reason text,
                                         p_increase boolean default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.student_charges;
  v_signed numeric(12,2);
  v_id uuid;
begin
  select * into c from public.student_charges where id = p_charge_id for update;
  if c.id is null or not private.finance_can_manage(c.school_id) then
    raise exception 'Charge not found' using errcode = 'P0002';
  end if;
  if c.status = 'cancelled' then
    raise exception 'The charge is cancelled' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter an amount greater than zero with at most two decimals' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  v_signed := case
    when p_type in ('discount', 'waiver', 'credit') then -p_amount
    when p_type in ('penalty', 'debit') then p_amount
    when p_increase is true then p_amount
    when p_increase is false then -p_amount
  end;
  if v_signed is null then
    raise exception 'Say whether the correction increases or decreases the amount owed' using errcode = 'P0001';
  end if;
  if v_signed < 0 and -v_signed > private.charge_remaining(c.id) then
    raise exception 'The reduction (%) exceeds the remaining balance (%). Release applied payments first.', -v_signed, private.charge_remaining(c.id) using errcode = 'P0001';
  end if;
  insert into public.financial_adjustments (school_id, student_id, student_charge_id, adjustment_type, signed_amount, reason, created_by)
  values (c.school_id, c.student_id, c.id, p_type, v_signed, btrim(p_reason), (select auth.uid()))
  returning id into v_id;
  perform private.refresh_charge_status(c.id);
  perform private.fin_audit(c.school_id, 'adjustment.created', 'student_charge', c.id, c.student_id,
    jsonb_build_object('net', private.charge_net(c.id) - v_signed), jsonb_build_object('type', p_type, 'signed_amount', v_signed, 'net', private.charge_net(c.id)), p_reason);
  return v_id;
end;
$$;

-- Record money received (cash, bank, check, card, e-wallet…). One transaction:
-- payment + allocations + receipt + audit + notification. The idempotency key
-- makes a double-submitted form return the first payment instead of a second.
create function public.record_payment(
  p_student_id uuid, p_amount numeric, p_method public.payment_method, p_reference text, p_payment_date date,
  p_notes text, p_allocations jsonb, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  existing public.payments;
begin
  select * into s from public.students where id = p_student_id;
  if s.id is null or not private.finance_can_collect(s.school_id) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is not null then
    select * into existing from public.payments where school_id = s.school_id and idempotency_key = p_idempotency_key;
    if existing.id is not null then
      return jsonb_build_object('payment_id', existing.id, 'duplicate', true,
        'receipt_number', (select receipt_number from public.receipts where payment_id = existing.id));
    end if;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 9999999999.99 then
    raise exception 'Enter an amount greater than zero with at most two decimals' using errcode = 'P0001';
  end if;
  if p_method = 'online' then
    raise exception 'Online payments are recorded automatically after provider verification' using errcode = 'P0001';
  end if;
  if p_payment_date is null or p_payment_date > private.school_today(s.school_id) then
    raise exception 'The payment date cannot be in the future' using errcode = 'P0001';
  end if;
  return private.create_payment(s.id, p_amount, p_method, p_reference, p_payment_date, p_notes, p_allocations, p_idempotency_key, null);
end;
$$;

-- Apply a payment's unallocated credit to (other) charges.
create function public.apply_credit(p_payment_id uuid, p_allocations jsonb)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id;
  if p.id is null or not private.finance_can_collect(p.school_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  return private.allocate_payment(p.id, p_allocations);
end;
$$;

-- Take money off a charge and return it to the payment's credit (e.g. before a
-- refund or a waiver). The allocation row is kept, marked released.
create function public.release_allocation(p_allocation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a public.payment_allocations;
begin
  select * into a from public.payment_allocations where id = p_allocation_id for update;
  if a.id is null or not private.finance_can_manage(a.school_id) then
    raise exception 'Allocation not found' using errcode = 'P0002';
  end if;
  if a.released_at is not null then
    raise exception 'Already released' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  update public.payment_allocations set released_at = now(), released_by = (select auth.uid()), release_reason = btrim(p_reason) where id = a.id;
  perform private.refresh_charge_status(a.student_charge_id);
  perform private.fin_audit(a.school_id, 'allocation.released', 'payment_allocation', a.id, a.student_id,
    jsonb_build_object('amount', a.amount, 'charge_id', a.student_charge_id), null, p_reason);
end;
$$;

-- Reverse an incorrectly recorded payment. The payment stays (status
-- 'reversed'), its allocations stop counting, its receipt is voided.
create function public.reverse_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments;
  v_charge uuid;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null or not private.finance_can_manage(p.school_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if p.status = 'reversed' then
    raise exception 'The payment is already reversed' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.refunds where payment_id = p.id and status in ('approved', 'processed')) then
    raise exception 'This payment has approved or processed refunds and cannot be reversed' using errcode = 'P0001';
  end if;
  update public.refunds set status = 'cancelled', decision_note = 'Payment reversed' where payment_id = p.id and status = 'requested';
  update public.payments set status = 'reversed', reversed_at = now(), reversed_by = (select auth.uid()), reversal_reason = btrim(p_reason) where id = p.id;
  for v_charge in select distinct student_charge_id from public.payment_allocations where payment_id = p.id and released_at is null loop
    perform private.refresh_charge_status(v_charge);
  end loop;
  update public.receipts set status = 'voided', voided_at = now(), void_reason = 'Payment reversed: ' || btrim(p_reason) where payment_id = p.id;
  perform private.fin_audit(p.school_id, 'payment.reversed', 'payment', p.id, p.student_id,
    jsonb_build_object('status', 'completed', 'amount', p.amount), jsonb_build_object('status', 'reversed'), p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Refunds: only from a payment's unallocated credit; requested → approved
-- (by a second person when the school requires it) → processed.
-- ---------------------------------------------------------------------------
create function public.request_refund(p_payment_id uuid, p_amount numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments;
  v_id uuid;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null or not private.finance_can_collect(p.school_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if not private.school_has_feature(p.school_id, 'refunds') then
    raise exception 'Refunds are not enabled for this school' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter an amount greater than zero with at most two decimals' using errcode = 'P0001';
  end if;
  if p_amount > private.payment_unallocated(p.id) then
    raise exception 'The refund (%) exceeds the refundable amount (%). Release applied amounts first.', p_amount, private.payment_unallocated(p.id) using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;
  insert into public.refunds (school_id, payment_id, student_id, amount, reason, requested_by)
  values (p.school_id, p.id, p.student_id, p_amount, btrim(p_reason), (select auth.uid()))
  returning id into v_id;
  perform private.fin_audit(p.school_id, 'refund.requested', 'refund', v_id, p.student_id, null, jsonb_build_object('amount', p_amount, 'payment_id', p.id), p_reason);
  return v_id;
end;
$$;

create function public.decide_refund(p_refund_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds;
  v_second boolean;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or not private.finance_can_manage(r.school_id) then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if r.status <> 'requested' then
    raise exception 'Only requested refunds can be decided' using errcode = 'P0001';
  end if;
  select refunds_require_second_approver into v_second from public.school_settings where school_id = r.school_id;
  if p_approve and coalesce(v_second, true) and r.requested_by = (select auth.uid()) and not private.is_super_admin() then
    raise exception 'A refund must be approved by someone other than the person who requested it' using errcode = '42501';
  end if;
  update public.refunds
     set status = case when p_approve then 'approved'::public.refund_status else 'rejected'::public.refund_status end,
         approved_by = case when p_approve then (select auth.uid()) end,
         decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = r.id;
  perform private.fin_audit(r.school_id, case when p_approve then 'refund.approved' else 'refund.rejected' end, 'refund', r.id, r.student_id,
    jsonb_build_object('status', 'requested'), jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end), p_note);
end;
$$;

create function public.process_refund(p_refund_id uuid, p_method public.payment_method, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.refunds;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or not private.finance_can_manage(r.school_id) then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if r.status <> 'approved' then
    raise exception 'Only approved refunds can be processed' using errcode = 'P0001';
  end if;
  update public.refunds set status = 'processed', processed_by = (select auth.uid()), processed_at = now(),
                            refund_method = p_method, refund_reference = nullif(btrim(p_reference), '')
   where id = r.id;
  perform private.fin_audit(r.school_id, 'refund.processed', 'refund', r.id, r.student_id,
    jsonb_build_object('status', 'approved'), jsonb_build_object('status', 'processed', 'method', p_method, 'reference', p_reference), null);
end;
$$;

create function public.cancel_refund(p_refund_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.refunds;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or not (private.finance_can_manage(r.school_id)
                          or (private.finance_can_collect(r.school_id) and r.requested_by = (select auth.uid()))) then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if r.status not in ('requested', 'approved') then
    raise exception 'This refund can no longer be cancelled' using errcode = 'P0001';
  end if;
  update public.refunds set status = 'cancelled', decision_note = nullif(btrim(p_reason), ''), decided_at = now() where id = r.id;
  perform private.fin_audit(r.school_id, 'refund.cancelled', 'refund', r.id, r.student_id,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'cancelled'), p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Online payments (provider-independent)
-- ---------------------------------------------------------------------------

-- A parent (or the student) starts an online payment for selected charges.
-- The AMOUNT IS COMPUTED HERE from what those charges still owe.
create function public.create_payment_intent(p_student_id uuid, p_charge_ids uuid[], p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_amount numeric := 0;
  v_ids uuid[];
  v_id uuid;
  v_currency char(3);
begin
  select * into s from public.students where id = p_student_id;
  if s.id is null
     or not (p_student_id in (select private.family_finance_student_ids()) or private.finance_can_collect(s.school_id)) then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if not private.school_has_feature(s.school_id, 'online_payments') then
    raise exception 'Online payments are not enabled for this school' using errcode = '42501';
  end if;
  select array_agg(c.id order by c.due_date nulls last, c.created_at), coalesce(sum(private.charge_remaining(c.id)), 0)
    into v_ids, v_amount
  from public.student_charges c
  where c.id = any(p_charge_ids) and c.student_id = s.id and c.status <> 'cancelled' and private.charge_remaining(c.id) > 0;
  if v_amount <= 0 or cardinality(v_ids) <> cardinality(p_charge_ids) then
    raise exception 'Select charges of this student that still have a balance' using errcode = 'P0001';
  end if;
  select currency into v_currency from public.school_settings where school_id = s.school_id;
  insert into public.payment_transactions (school_id, student_id, provider, amount, currency, metadata, created_by)
  values (s.school_id, s.id, p_provider, v_amount, coalesce(v_currency, 'PHP'), jsonb_build_object('charge_ids', to_jsonb(v_ids)), (select auth.uid()))
  returning id into v_id;
  perform private.fin_audit(s.school_id, 'payment_transaction.created', 'payment_transaction', v_id, s.id, null,
    jsonb_build_object('amount', v_amount, 'provider', p_provider, 'charges', cardinality(v_ids)), null);
  return jsonb_build_object('transaction_id', v_id, 'amount', v_amount, 'currency', coalesce(v_currency, 'PHP'));
end;
$$;

-- SERVICE ROLE: attach the provider's checkout session to a transaction.
create function public.set_transaction_checkout(p_transaction_id uuid, p_provider_transaction_id text, p_checkout_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_transactions
     set provider_transaction_id = p_provider_transaction_id, checkout_url = p_checkout_url
   where id = p_transaction_id and status = 'pending'
$$;

-- SERVICE ROLE ONLY: the result of SERVER-SIDE verification with the provider.
-- Idempotent: a transaction becomes at most one payment, however many times
-- the provider (or our retries) report it.
create function public.complete_payment_transaction(p_transaction_id uuid, p_status public.payment_transaction_status,
                                                    p_verified_amount numeric default null, p_failure_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.payment_transactions;
  v_result jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_left numeric;
  v_charge uuid;
  v_rem numeric;
begin
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if t.status = 'successful' then
    return jsonb_build_object('duplicate', true, 'payment_id', (select id from public.payments where payment_transaction_id = t.id));
  end if;
  if t.status in ('refunded') then
    return jsonb_build_object('duplicate', true, 'status', t.status);
  end if;

  if p_status = 'successful' then
    if p_verified_amount is null or p_verified_amount <> t.amount then
      update public.payment_transactions set status = 'failed', failure_reason = 'Verified amount does not match the requested amount' where id = t.id;
      perform private.fin_audit(t.school_id, 'payment_transaction.updated', 'payment_transaction', t.id, t.student_id,
        jsonb_build_object('status', t.status), jsonb_build_object('status', 'failed', 'verified_amount', p_verified_amount, 'expected', t.amount), 'amount mismatch');
      return jsonb_build_object('duplicate', false, 'status', 'failed');
    end if;
    -- Allocate to the selected charges in due order, up to what each still owes;
    -- anything left (charges paid meanwhile) stays as the student's credit.
    v_left := t.amount;
    for v_charge in select value::uuid from jsonb_array_elements_text(t.metadata -> 'charge_ids') loop
      v_rem := private.charge_remaining(v_charge);
      continue when v_rem <= 0 or v_left <= 0;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('charge_id', v_charge, 'amount', least(v_rem, v_left)));
      v_left := v_left - least(v_rem, v_left);
    end loop;
    update public.payment_transactions set status = 'successful' where id = t.id;
    v_result := private.create_payment(t.student_id, t.amount, 'online', coalesce(t.provider_transaction_id, t.id::text),
                                       private.school_today(t.school_id), 'Online payment via ' || t.provider, v_plan, null, t.id);
    perform private.fin_audit(t.school_id, 'payment_transaction.updated', 'payment_transaction', t.id, t.student_id,
      jsonb_build_object('status', t.status), jsonb_build_object('status', 'successful', 'payment_id', v_result ->> 'payment_id'), null);
    return v_result;
  end if;

  if t.status in ('pending', 'processing') then
    update public.payment_transactions set status = p_status, failure_reason = left(p_failure_reason, 500) where id = t.id;
    perform private.fin_audit(t.school_id, 'payment_transaction.updated', 'payment_transaction', t.id, t.student_id,
      jsonb_build_object('status', t.status), jsonb_build_object('status', p_status), p_failure_reason);
  end if;
  return jsonb_build_object('duplicate', false, 'status', p_status);
end;
$$;

-- SERVICE ROLE ONLY: record a webhook delivery once. Returns whether it was
-- already processed (duplicate) so the caller can acknowledge without work.
create function public.record_webhook_event(p_provider text, p_event_id text, p_event_type text, p_payload jsonb,
                                            p_signature_valid boolean, p_transaction_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_inserted boolean;
  v_school uuid;
begin
  select school_id into v_school from public.payment_transactions where id = p_transaction_id;
  insert into public.payment_webhook_events (provider, event_id, event_type, school_id, transaction_id, signature_valid, payload,
                                             status, error_message)
  values (p_provider, p_event_id, p_event_type, v_school, p_transaction_id, p_signature_valid, coalesce(p_payload, '{}'::jsonb),
          case when p_signature_valid then 'received' else 'rejected' end,
          case when p_signature_valid then null else 'Invalid signature' end)
  on conflict (provider, event_id) do update set attempts = public.payment_webhook_events.attempts + 1
  returning id, status, (xmax = 0) into v_id, v_status, v_inserted;
  return jsonb_build_object('event_row_id', v_id, 'status', v_status, 'duplicate', not v_inserted and v_status in ('processed', 'ignored'));
end;
$$;

create function public.finish_webhook_event(p_event_row_id uuid, p_status text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_webhook_events
     set status = p_status, error_message = left(p_error, 1000), processed_at = case when p_status in ('processed', 'ignored') then now() end
   where id = p_event_row_id
$$;

-- ---------------------------------------------------------------------------
-- Reporting (SECURITY INVOKER: RLS applies; finance users only see their school)
-- ---------------------------------------------------------------------------
create view public.student_charge_balances with (security_invoker = true) as
select
  c.id, c.school_id, c.academic_year_id, c.enrollment_id, c.student_id, c.fee_type_id, c.fee_structure_item_id,
  c.description, c.amount, c.due_date, c.created_at, c.status, c.cancelled_at,
  coalesce(d.total, 0)::numeric(12,2) as discounts,
  coalesce(a.total, 0)::numeric(12,2) as adjustments,
  case when c.status = 'cancelled' then 0 else c.amount + coalesce(a.total, 0) - coalesce(d.total, 0) end::numeric(12,2) as net_amount,
  coalesce(p.total, 0)::numeric(12,2) as paid,
  case when c.status = 'cancelled' then 0 else c.amount + coalesce(a.total, 0) - coalesce(d.total, 0) - coalesce(p.total, 0) end::numeric(12,2) as remaining,
  case
    when c.status = 'cancelled' then 'cancelled'
    when c.amount + coalesce(a.total, 0) - coalesce(d.total, 0) - coalesce(p.total, 0) <= 0 then 'paid'
    when c.due_date < (now() at time zone coalesce(sc.timezone, 'UTC'))::date then 'overdue'
    when coalesce(p.total, 0) > 0 then 'partially_paid'
    else 'pending'
  end::public.charge_status as effective_status
from public.student_charges c
join public.schools sc on sc.id = c.school_id
left join lateral (select sum(x.amount) total from public.student_discounts x where x.student_charge_id = c.id and x.status = 'active') d on true
left join lateral (select sum(x.signed_amount) total from public.financial_adjustments x where x.student_charge_id = c.id) a on true
left join lateral (
  select sum(x.amount) total from public.payment_allocations x join public.payments y on y.id = x.payment_id
  where x.student_charge_id = c.id and x.released_at is null and y.status = 'completed') p on true;

-- Credit held by each completed payment (overpayments / released allocations).
create view public.student_payment_credits with (security_invoker = true) as
select p.id as payment_id, p.school_id, p.student_id, p.payment_date, p.amount,
       (p.amount - coalesce(al.total, 0) - coalesce(rf.total, 0))::numeric(12,2) as unallocated
from public.payments p
left join lateral (select sum(x.amount) total from public.payment_allocations x where x.payment_id = p.id and x.released_at is null) al on true
left join lateral (select sum(x.amount) total from public.refunds x where x.payment_id = p.id and x.status in ('requested', 'approved', 'processed')) rf on true
where p.status = 'completed';

-- Chronological ledger. amount > 0 increases what is owed; < 0 decreases it.
create view public.student_ledger with (security_invoker = true) as
select c.school_id, c.student_id, c.academic_year_id, c.created_at as occurred_at, coalesce(c.due_date, c.created_at::date) as entry_date,
       'charge' as entry_type, c.id as entity_id, c.description, c.amount::numeric(12,2) as amount
from public.student_charges c
union all
select c.school_id, c.student_id, c.academic_year_id, c.cancelled_at, c.cancelled_at::date, 'charge_cancelled', c.id,
       'Cancelled: ' || c.description, -c.amount
from public.student_charges c where c.status = 'cancelled'
union all
select d.school_id, d.student_id, c.academic_year_id, d.created_at, d.created_at::date, 'discount', d.id,
       'Discount: ' || dt.name || ' (' || c.description || ')', -d.amount
from public.student_discounts d join public.student_charges c on c.id = d.student_charge_id join public.discount_types dt on dt.id = d.discount_type_id
where c.status <> 'cancelled'
union all
select d.school_id, d.student_id, c.academic_year_id, d.revoked_at, d.revoked_at::date, 'discount_revoked', d.id,
       'Discount revoked: ' || dt.name, d.amount
from public.student_discounts d join public.student_charges c on c.id = d.student_charge_id join public.discount_types dt on dt.id = d.discount_type_id
where d.status = 'inactive' and c.status <> 'cancelled'
union all
select a.school_id, a.student_id, c.academic_year_id, a.created_at, a.created_at::date, 'adjustment', a.id,
       initcap(a.adjustment_type::text) || ': ' || a.reason, a.signed_amount
from public.financial_adjustments a join public.student_charges c on c.id = a.student_charge_id
where c.status <> 'cancelled'
union all
select p.school_id, p.student_id, e.academic_year_id, p.created_at, p.payment_date, 'payment', p.id,
       'Payment (' || replace(p.payment_method::text, '_', ' ') || coalesce(', ref ' || p.reference_number, '') || ')', -p.amount
from public.payments p left join public.student_enrollments e on e.id = p.enrollment_id
union all
select p.school_id, p.student_id, e.academic_year_id, p.reversed_at, p.reversed_at::date, 'payment_reversed', p.id,
       'Payment reversed: ' || p.reversal_reason, p.amount
from public.payments p left join public.student_enrollments e on e.id = p.enrollment_id
where p.status = 'reversed'
union all
select r.school_id, r.student_id, e.academic_year_id, r.processed_at, r.processed_at::date, 'refund', r.id,
       'Refund: ' || r.reason, r.amount
from public.refunds r join public.payments p on p.id = r.payment_id left join public.student_enrollments e on e.id = p.enrollment_id
where r.status = 'processed';

-- Dashboard totals for a school with optional filters (one round trip).
create function public.finance_overview(
  p_school_id uuid, p_academic_year_id uuid default null, p_grade_level_id uuid default null, p_section_id uuid default null,
  p_fee_type_id uuid default null, p_method public.payment_method default null, p_from date default null, p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ch as (
    select b.* from public.student_charge_balances b
    join public.student_enrollments e on e.id = b.enrollment_id
    where b.school_id = p_school_id and b.status <> 'cancelled'
      and (p_academic_year_id is null or b.academic_year_id = p_academic_year_id)
      and (p_grade_level_id is null or e.grade_level_id = p_grade_level_id)
      and (p_section_id is null or e.section_id = p_section_id)
      and (p_fee_type_id is null or b.fee_type_id = p_fee_type_id)
  ),
  pay as (
    select p.* from public.payments p
    left join public.student_enrollments e on e.id = p.enrollment_id
    where p.school_id = p_school_id and p.status = 'completed'
      and (p_academic_year_id is null or e.academic_year_id = p_academic_year_id)
      and (p_grade_level_id is null or e.grade_level_id = p_grade_level_id)
      and (p_section_id is null or e.section_id = p_section_id)
      and (p_method is null or p.payment_method = p_method)
  ),
  today as (select private.school_today(p_school_id) as d)
  select jsonb_build_object(
    'total_charges', coalesce((select sum(net_amount) from ch), 0),
    'total_collected', coalesce((select sum(paid) from ch), 0),
    'outstanding', coalesce((select sum(remaining) from ch), 0),
    'overdue', coalesce((select sum(remaining) from ch where effective_status = 'overdue'), 0),
    'payments_in_range', coalesce((select sum(amount) from pay where (p_from is null or payment_date >= p_from) and (p_to is null or payment_date <= p_to)), 0),
    'today', coalesce((select sum(amount) from pay, today where payment_date = today.d), 0),
    'this_month', coalesce((select sum(amount) from pay, today where date_trunc('month', payment_date) = date_trunc('month', today.d)), 0),
    'by_method', coalesce((select jsonb_object_agg(payment_method::text, total) from (
        select payment_method, sum(amount) total from pay
        where (p_from is null or payment_date >= p_from) and (p_to is null or payment_date <= p_to) group by payment_method) m), '{}'::jsonb),
    'by_fee_type', coalesce((select jsonb_agg(jsonb_build_object('fee_type_id', fee_type_id, 'charged', charged, 'collected', collected, 'outstanding', outstanding) order by charged desc) from (
        select fee_type_id, sum(net_amount) charged, sum(paid) collected, sum(remaining) outstanding from ch group by fee_type_id) f), '[]'::jsonb),
    'credits', coalesce((select sum(unallocated) from public.student_payment_credits where school_id = p_school_id and unallocated > 0), 0)
  )
$$;

-- ---------------------------------------------------------------------------
-- History is immutable for EVERYONE (including the service key): recorded
-- facts never change; only explicit, audited state transitions are allowed.
-- ---------------------------------------------------------------------------
create function private.guard_financial_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'student_charges' then
    if (new.amount, new.student_id, new.enrollment_id, new.academic_year_id, new.fee_type_id, new.fee_structure_item_id, new.installment_no, new.description, new.created_at)
       is distinct from (old.amount, old.student_id, old.enrollment_id, old.academic_year_id, old.fee_type_id, old.fee_structure_item_id, old.installment_no, old.description, old.created_at)
       or (old.status = 'cancelled' and new.status <> 'cancelled') then
      raise exception 'Charges are permanent records; use discounts, adjustments or cancellation' using errcode = '42501';
    end if;
  elsif tg_table_name = 'payments' then
    if (new.amount, new.student_id, new.payment_method, new.payment_date, new.reference_number, new.received_by, new.currency, new.payment_transaction_id, new.created_at)
       is distinct from (old.amount, old.student_id, old.payment_method, old.payment_date, old.reference_number, old.received_by, old.currency, old.payment_transaction_id, old.created_at)
       or (old.status = 'reversed') then
      raise exception 'Payments are permanent records; reverse an incorrect payment instead' using errcode = '42501';
    end if;
  elsif tg_table_name = 'payment_allocations' then
    if (new.amount, new.payment_id, new.student_charge_id, new.created_at) is distinct from (old.amount, old.payment_id, old.student_charge_id, old.created_at)
       or old.released_at is not null then
      raise exception 'Allocations are permanent records; release an allocation instead' using errcode = '42501';
    end if;
  elsif tg_table_name = 'receipts' then
    if (new.receipt_number, new.payment_id, new.issued_at) is distinct from (old.receipt_number, old.payment_id, old.issued_at)
       or old.status = 'voided' then
      raise exception 'Receipts are permanent records; they can only be voided' using errcode = '42501';
    end if;
  elsif tg_table_name = 'refunds' then
    if (new.amount, new.payment_id, new.student_id, new.requested_by, new.created_at) is distinct from (old.amount, old.payment_id, old.student_id, old.requested_by, old.created_at)
       or old.status in ('processed', 'rejected', 'cancelled') then
      raise exception 'Refunds are permanent records' using errcode = '42501';
    end if;
  elsif tg_table_name = 'student_discounts' then
    if (new.amount, new.student_charge_id, new.discount_type_id, new.created_at) is distinct from (old.amount, old.student_charge_id, old.discount_type_id, old.created_at)
       or old.status = 'inactive' then
      raise exception 'Discounts are permanent records; revoke instead' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['student_charges', 'payments', 'payment_allocations', 'receipts', 'refunds', 'student_discounts'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.guard_financial_history()', t || '_history_guard', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.finance_level(uuid), private.finance_can_view(uuid), private.finance_can_collect(uuid),
  private.finance_can_manage(uuid), private.family_finance_student_ids() from public;
grant execute on function private.finance_level(uuid), private.finance_can_view(uuid), private.finance_can_collect(uuid),
  private.finance_can_manage(uuid), private.family_finance_student_ids() to authenticated, service_role;

revoke all on function private.charge_net(uuid), private.charge_paid(uuid), private.charge_remaining(uuid), private.payment_unallocated(uuid),
  private.refresh_charge_status(uuid), private.fin_audit(uuid, text, text, uuid, uuid, jsonb, jsonb, text), private.fin_audit_config(),
  private.check_fee_structure_scope(), private.next_receipt_number(uuid), private.allocate_payment(uuid, jsonb),
  private.create_payment(uuid, numeric, public.payment_method, text, date, text, jsonb, text, uuid) from public, authenticated;
revoke all on function private.guard_finance_settings(), private.guard_financial_history() from public, authenticated;

revoke all on function public.generate_charges(uuid, boolean), public.create_charge(uuid, uuid, text, numeric, date, uuid),
  public.cancel_charge(uuid, text), public.apply_discount(uuid[], uuid, text), public.revoke_discount(uuid, text),
  public.create_adjustment(uuid, public.adjustment_type, numeric, text, boolean),
  public.record_payment(uuid, numeric, public.payment_method, text, date, text, jsonb, text), public.apply_credit(uuid, jsonb),
  public.release_allocation(uuid, text), public.reverse_payment(uuid, text), public.request_refund(uuid, numeric, text),
  public.decide_refund(uuid, boolean, text), public.process_refund(uuid, public.payment_method, text), public.cancel_refund(uuid, text),
  public.create_payment_intent(uuid, uuid[], text), public.finance_overview(uuid, uuid, uuid, uuid, uuid, public.payment_method, date, date)
  from public, anon;
grant execute on function public.generate_charges(uuid, boolean), public.create_charge(uuid, uuid, text, numeric, date, uuid),
  public.cancel_charge(uuid, text), public.apply_discount(uuid[], uuid, text), public.revoke_discount(uuid, text),
  public.create_adjustment(uuid, public.adjustment_type, numeric, text, boolean),
  public.record_payment(uuid, numeric, public.payment_method, text, date, text, jsonb, text), public.apply_credit(uuid, jsonb),
  public.release_allocation(uuid, text), public.reverse_payment(uuid, text), public.request_refund(uuid, numeric, text),
  public.decide_refund(uuid, boolean, text), public.process_refund(uuid, public.payment_method, text), public.cancel_refund(uuid, text),
  public.create_payment_intent(uuid, uuid[], text), public.finance_overview(uuid, uuid, uuid, uuid, uuid, public.payment_method, date, date)
  to authenticated;

-- Provider-side operations: trusted server only.
revoke all on function public.set_transaction_checkout(uuid, text, text), public.complete_payment_transaction(uuid, public.payment_transaction_status, numeric, text),
  public.record_webhook_event(text, text, text, jsonb, boolean, uuid), public.finish_webhook_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_transaction_checkout(uuid, text, text), public.complete_payment_transaction(uuid, public.payment_transaction_status, numeric, text),
  public.record_webhook_event(text, text, text, jsonb, boolean, uuid), public.finish_webhook_event(uuid, text, text)
  to service_role;
revoke all on function private.audit_finance_settings() from public, authenticated;

-- The caller's finance level in their own school (drives what the UI offers;
-- every function and policy re-checks it).
create function public.my_finance_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select private.finance_level(private.my_school_id()) $$;
revoke all on function public.my_finance_level() from public, anon;
grant execute on function public.my_finance_level() to authenticated;

-- Names (only) of the staff who recorded / approved financial records, for
-- finance viewers of the same school (finance staff cannot read profiles).
create function public.finance_actor_names(p_user_ids uuid[])
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, nullif(btrim(p.first_name || ' ' || p.last_name), '')
  from public.profiles p
  where p.user_id = any(p_user_ids)
    and (p.school_id = private.my_school_id() or p.role = 'super_admin')
    and private.finance_can_view(private.my_school_id())
$$;
revoke all on function public.finance_actor_names(uuid[]) from public, anon;
grant execute on function public.finance_actor_names(uuid[]) to authenticated;
