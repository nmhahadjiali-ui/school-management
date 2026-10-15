-- A discount type can be active on a charge only once. Applying the same type
-- again skips that charge; if every requested charge already has it, the call
-- fails with a clear message. A different discount type on the same charge is
-- still allowed, and a revoked discount can be applied again.
-- Safe under concurrency: each charge row is locked (FOR UPDATE) before the check,
-- and student_discounts is only written through this function.

create or replace function public.apply_discount(p_charge_ids uuid[], p_discount_type_id uuid, p_reason text)
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
  v_duplicates integer := 0;
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
    if exists (select 1 from public.student_discounts d
               where d.student_charge_id = c.id and d.discount_type_id = dt.id and d.status = 'active') then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;
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
  if v_count = 0 and v_duplicates > 0 then
    raise exception '% already applied to %. Revoke it first to apply it again.', dt.name,
      case when v_duplicates = 1 then 'this charge' else 'these charges' end using errcode = 'P0001';
  end if;
  return v_count;
end;
$$;
