-- =============================================================================
-- Phase 5 RLS. Financial tables are READ-ONLY through the API (except fee and
-- discount configuration); every money movement goes through the audited,
-- transaction-safe functions in the previous migration.
--   view    = private.finance_can_view(school_id)   finance roles / school admins per setting
--   manage  = private.finance_can_manage(school_id)
--   family  = student_id in private.family_finance_student_ids()   own / verified children
-- Teachers have no finance access. Super admins: platform-level (as before).
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['fee_types', 'fee_structures', 'fee_structure_items', 'discount_types', 'student_charges',
                           'student_discounts', 'financial_adjustments', 'payment_transactions', 'payments',
                           'payment_allocations', 'refunds', 'receipt_sequences', 'receipts', 'payment_webhook_events',
                           'financial_audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.fee_types, public.fee_structures, public.fee_structure_items, public.discount_types,
  public.student_charges, public.student_discounts, public.financial_adjustments, public.payment_transactions,
  public.payments, public.payment_allocations, public.refunds, public.receipts, public.payment_webhook_events,
  public.financial_audit_logs to authenticated;
grant insert, update on public.fee_types, public.fee_structures, public.fee_structure_items, public.discount_types to authenticated;
grant delete on public.fee_structure_items to authenticated;
grant select on public.student_charge_balances, public.student_payment_credits, public.student_ledger to authenticated;
revoke all on public.student_charge_balances, public.student_payment_credits, public.student_ledger from anon;

-- Configuration: finance users read; finance managers write.
do $$
declare t text;
begin
  foreach t in array array['fee_types', 'fee_structures', 'fee_structure_items', 'discount_types'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.finance_can_view(school_id)))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.finance_can_manage(school_id)))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.finance_can_manage(school_id))) with check ((select private.finance_can_manage(school_id)))', t || '_update', t);
  end loop;
end $$;
-- Items of a structure that has not generated charges yet may be removed.
create policy fee_structure_items_delete on public.fee_structure_items for delete to authenticated
  using ((select private.finance_can_manage(school_id))
         and not exists (select 1 from public.student_charges c where c.fee_structure_item_id = fee_structure_items.id));

-- Student-level records: finance users of the school, or the student / verified parents.
do $$
declare t text;
begin
  foreach t in array array['student_charges', 'student_discounts', 'financial_adjustments', 'payments',
                           'payment_allocations', 'refunds', 'payment_transactions'] loop
    execute format($p$create policy %I on public.%I for select to authenticated
      using ((select private.finance_can_view(school_id)) or student_id in (select private.family_finance_student_ids()))$p$, t || '_select', t);
  end loop;
end $$;

-- Receipts: finance users, or the family of the payment's student.
create policy receipts_select on public.receipts for select to authenticated
  using ((select private.finance_can_view(school_id))
         or exists (select 1 from public.payments p where p.id = payment_id
                    and p.student_id in (select private.family_finance_student_ids())));

-- Provider events and the financial audit trail: finance managers only.
create policy payment_webhook_events_select on public.payment_webhook_events for select to authenticated
  using ((select private.finance_can_manage(school_id)));
create policy financial_audit_logs_select on public.financial_audit_logs for select to authenticated
  using ((select private.finance_can_manage(school_id)));
-- receipt_sequences: no policies (functions only).

-- ---------------------------------------------------------------------------
-- Least-privilege reads finance users need from Phase 2 (names, numbers and
-- placement to bill students) — NOT grades, attendance or guardian contacts.
-- ---------------------------------------------------------------------------
drop policy students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id in (select private.my_teacher_student_ids())
    or id = (select private.my_student_id())
    or id in (select private.my_guardian_student_ids())
    or (select private.finance_can_view(school_id))
  );

drop policy student_enrollments_select on public.student_enrollments;
create policy student_enrollments_select on public.student_enrollments for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or section_id in (select private.my_teacher_section_ids())
    or student_id = (select private.my_student_id())
    or student_id in (select private.my_guardian_student_ids())
    or (select private.finance_can_view(school_id))
  );

drop policy sections_select on public.sections;
create policy sections_select on public.sections for select to authenticated
  using (
    (select private.can_manage_school(school_id))
    or id in (select private.my_visible_section_ids())
    or (select private.finance_can_view(school_id))
  );

-- Finance admins may update their school's FINANCE settings (guard trigger
-- rejects any other column).
create policy school_settings_finance_update on public.school_settings for update to authenticated
  using (private.my_role() = 'finance_admin' and school_id = (select private.my_school_id()))
  with check (private.my_role() = 'finance_admin' and school_id = (select private.my_school_id()));
