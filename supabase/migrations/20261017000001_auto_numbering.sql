-- Automatic student and employee numbers, configured per school.
--
-- Format tokens: {YYYY} = year (school's time zone), {YY} = 2-digit year,
-- {#...} = the counter, zero-padded to the number of # (exactly one required).
-- Example: 'EMP-{YYYY}-{####}' -> EMP-2026-0001.
--
-- When automatic numbering is on, a new student/teacher saved WITHOUT a number
-- gets the next one, assigned in the database (row-locked counter, skips
-- numbers already used), so concurrent saves never collide. A number typed
-- by the admin is always kept as is.

create function private.valid_number_format(p_format text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_format is not null
     and char_length(p_format) between 3 and 40
     and p_format ~ '^([A-Za-z0-9 ._/-]|\{YYYY\}|\{YY\}|\{#{1,8}\})+$'
     and (select count(*) from regexp_matches(p_format, '\{#+\}', 'g')) = 1
$$;

alter table public.school_settings
  add column student_number_auto    boolean not null default false,
  add column student_number_format  text    not null default '{YYYY}-{####}',
  add column student_number_next    integer not null default 1,
  add column employee_number_auto   boolean not null default false,
  add column employee_number_format text    not null default 'EMP-{####}',
  add column employee_number_next   integer not null default 1,
  add constraint school_settings_student_number_format check (private.valid_number_format(student_number_format)),
  add constraint school_settings_employee_number_format check (private.valid_number_format(employee_number_format)),
  add constraint school_settings_student_number_next check (student_number_next between 1 and 99999999),
  add constraint school_settings_employee_number_next check (employee_number_next between 1 and 99999999);

create function private.format_record_number(p_format text, p_n integer, p_today date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_width integer := char_length((regexp_match(p_format, '\{(#+)\}'))[1]);
  v_digits text := p_n::text;
begin
  if char_length(v_digits) < v_width then
    v_digits := lpad(v_digits, v_width, '0');
  end if;
  return replace(replace(regexp_replace(p_format, '\{#+\}', v_digits),
                 '{YYYY}', to_char(p_today, 'YYYY')),
                 '{YY}', to_char(p_today, 'YY'));
end;
$$;

-- Next free number for a school ('student' or 'employee'); advances the counter.
create function private.next_record_number(p_school uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.school_today(p_school);
  v_format text;
  v_n integer;
  v_candidate text;
begin
  for i in 1..1000 loop
    if p_kind = 'student' then
      update public.school_settings set student_number_next = student_number_next + 1
       where school_id = p_school
       returning student_number_format, student_number_next - 1 into v_format, v_n;
      if v_format is null then raise exception 'School settings are missing.' using errcode = 'P0001'; end if;
      v_candidate := private.format_record_number(v_format, v_n, v_today);
      exit when not exists (select 1 from public.students where school_id = p_school and student_number = v_candidate);
    else
      update public.school_settings set employee_number_next = employee_number_next + 1
       where school_id = p_school
       returning employee_number_format, employee_number_next - 1 into v_format, v_n;
      if v_format is null then raise exception 'School settings are missing.' using errcode = 'P0001'; end if;
      v_candidate := private.format_record_number(v_format, v_n, v_today);
      exit when not exists (select 1 from public.teachers where school_id = p_school and lower(employee_number) = lower(v_candidate));
    end if;
  end loop;
  return v_candidate;
end;
$$;

create function private.assign_record_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
begin
  if tg_table_name = 'students' then
    if nullif(btrim(new.student_number), '') is null then
      select student_number_auto into v_auto from public.school_settings where school_id = new.school_id;
      if not coalesce(v_auto, false) then
        raise exception 'Enter a student number, or turn on automatic student numbers in Settings.' using errcode = 'P0001';
      end if;
      new.student_number := private.next_record_number(new.school_id, 'student');
    end if;
  else
    if nullif(btrim(new.employee_number), '') is null then
      new.employee_number := null;
      select employee_number_auto into v_auto from public.school_settings where school_id = new.school_id;
      if coalesce(v_auto, false) then
        new.employee_number := private.next_record_number(new.school_id, 'employee');
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger students_assign_number before insert on public.students
  for each row execute function private.assign_record_number();
create trigger teachers_assign_number before insert on public.teachers
  for each row execute function private.assign_record_number();
