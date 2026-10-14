-- Time slots of the weekly timetable (the school's bell schedule), per
-- academic year and day: "Monday 08:00-09:30, 09:30-11:00, ...". Classes
-- (class_schedules) are assigned into these slots from the Schedules page;
-- a slot itself holds no class, so removing one never touches classes.
-- Managers only (the timetable itself stays readable through class_schedules).

create table public.schedule_time_slots (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  day_of_week       smallint not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
  start_time        time not null,
  end_time          time not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint schedule_time_slots_times check (start_time < end_time),
  constraint schedule_time_slots_year_ref foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade
);
create unique index schedule_time_slots_key on public.schedule_time_slots (academic_year_id, day_of_week, start_time, end_time);
create index schedule_time_slots_school_year_idx on public.schedule_time_slots (school_id, academic_year_id);

create trigger schedule_time_slots_set_updated_at before update on public.schedule_time_slots
  for each row execute function public.set_updated_at();
create trigger schedule_time_slots_forbid_school_change before update on public.schedule_time_slots
  for each row execute function private.forbid_school_change();
create trigger schedule_time_slots_year_open before insert or update on public.schedule_time_slots
  for each row execute function private.assert_year_open();

alter table public.schedule_time_slots enable row level security;
revoke all on public.schedule_time_slots from anon, authenticated;
grant select, insert, update, delete on public.schedule_time_slots to authenticated;
create policy schedule_time_slots_select on public.schedule_time_slots for select to authenticated
  using ((select private.can_manage_school(school_id)));
create policy schedule_time_slots_insert on public.schedule_time_slots for insert to authenticated
  with check ((select private.can_manage_school(school_id)));
create policy schedule_time_slots_update on public.schedule_time_slots for update to authenticated
  using ((select private.can_manage_school(school_id))) with check ((select private.can_manage_school(school_id)));
create policy schedule_time_slots_delete on public.schedule_time_slots for delete to authenticated
  using ((select private.can_manage_school(school_id)));

-- Setup templates also hold time-slot sets: items = [{day_of_week, start_time, end_time}].
-- A full week needs more than 20 items, so slot templates may hold up to 100.
alter table public.setup_templates drop constraint setup_templates_kind_check;
alter table public.setup_templates add constraint setup_templates_kind_check
  check (kind in ('grading_periods', 'grading_scales', 'grade_levels', 'subjects', 'schedule_slots'));
alter table public.setup_templates drop constraint setup_templates_items_check;
alter table public.setup_templates add constraint setup_templates_items_check
  check (jsonb_typeof(items) = 'array'
         and jsonb_array_length(items) between 1 and (case when kind = 'schedule_slots' then 100 else 20 end));
