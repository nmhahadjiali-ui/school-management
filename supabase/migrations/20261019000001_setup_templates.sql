-- Reusable setup templates per school: grading periods and grading scales.
-- items:
--   grading_periods: [{name, code, sequence, start_offset, end_offset}]
--                    (offsets = days from the academic year's start date)
--   grading_scales:  [{name, minimum_score, maximum_score, equivalent, description, is_passing}]
-- Built-in presets (quarters, semesters, DepEd scale...) live in the app;
-- this table holds the school's own templates. Managers only.

create table public.setup_templates (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  kind        text not null check (kind in ('grading_periods', 'grading_scales')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index setup_templates_name_key on public.setup_templates (school_id, kind, lower(name));

create trigger setup_templates_set_updated_at before update on public.setup_templates
  for each row execute function public.set_updated_at();

alter table public.setup_templates enable row level security;
revoke all on public.setup_templates from anon, authenticated;
grant select, insert, update, delete on public.setup_templates to authenticated;
create policy setup_templates_select on public.setup_templates for select to authenticated
  using ((select private.can_manage_school(school_id)));
create policy setup_templates_insert on public.setup_templates for insert to authenticated
  with check ((select private.can_manage_school(school_id)));
create policy setup_templates_update on public.setup_templates for update to authenticated
  using ((select private.can_manage_school(school_id))) with check ((select private.can_manage_school(school_id)));
create policy setup_templates_delete on public.setup_templates for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- Replace the caller's school grading scale with p_bands in one transaction
-- (all or nothing). Runs as the caller: RLS on grading_scales applies.
create function public.replace_grading_scale(p_bands jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := private.my_school_id();
  v_count integer;
begin
  if v_school is null or not private.can_manage_school(v_school) then
    raise exception 'You do not have permission to do that.' using errcode = '42501';
  end if;
  if p_bands is null or jsonb_typeof(p_bands) <> 'array' or jsonb_array_length(p_bands) not between 1 and 20 then
    raise exception 'A grading scale needs 1 to 20 bands.' using errcode = '22023';
  end if;
  delete from public.grading_scales where school_id = v_school;
  insert into public.grading_scales (school_id, name, minimum_score, maximum_score, equivalent, description, is_passing)
  select v_school, b.name, b.minimum_score, b.maximum_score, nullif(btrim(b.equivalent), ''), nullif(btrim(b.description), ''), coalesce(b.is_passing, false)
  from jsonb_to_recordset(p_bands) as b(name text, minimum_score numeric, maximum_score numeric, equivalent text, description text, is_passing boolean);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.replace_grading_scale(jsonb) from public, anon;
grant execute on function public.replace_grading_scale(jsonb) to authenticated;
