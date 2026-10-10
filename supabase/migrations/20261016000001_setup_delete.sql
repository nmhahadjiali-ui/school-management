-- School setup records can be deleted by managers (school admin of the row's
-- school, or super admin), but only while nothing refers to them: every
-- foreign key into these tables is ON DELETE NO ACTION, so the database
-- refuses to delete a year, grade, section, subject or grading period that is
-- in use (enrollments, schedules, attendance, grades, fees, ...).
-- The web app also asks for the admin's password before calling this.

grant delete on public.academic_years, public.grade_levels, public.sections, public.subjects, public.grading_periods to authenticated;

create policy academic_years_delete on public.academic_years for delete to authenticated
  using ((select private.can_manage_school(school_id)));
create policy grade_levels_delete on public.grade_levels for delete to authenticated
  using ((select private.can_manage_school(school_id)));
create policy sections_delete on public.sections for delete to authenticated
  using ((select private.can_manage_school(school_id)));
create policy subjects_delete on public.subjects for delete to authenticated
  using ((select private.can_manage_school(school_id)));
create policy grading_periods_delete on public.grading_periods for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- The current academic year cannot be deleted (choose another current year first).
create function private.forbid_delete_current_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_current then
    raise exception 'This is the current academic year. Make another year current before deleting it.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger academic_years_forbid_delete_current before delete on public.academic_years
  for each row execute function private.forbid_delete_current_year();

-- Every deletion is recorded in the audit log (who, what, and its name).
create function private.audit_setup_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.audit(old.school_id, tg_table_name || '.deleted', tg_table_name, old.id,
    jsonb_build_object('name', to_jsonb(old) ->> 'name', 'code', to_jsonb(old) ->> 'code'));
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['academic_years', 'grade_levels', 'sections', 'subjects', 'grading_periods'] loop
    execute format('create trigger %I after delete on public.%I for each row execute function private.audit_setup_delete()', t || '_audit_delete', t);
  end loop;
end $$;

-- Read a rate-limit counter without adding a hit (server key only). Used to
-- block password confirmations after repeated failures while correct
-- passwords never count against the limit.
create function public.rate_limit_hits(p_bucket text, p_window_seconds integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select hits from private.rate_limit_hits
                   where bucket = p_bucket
                     and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)), 0)
$$;
revoke all on function public.rate_limit_hits(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hits(text, integer) to service_role;
