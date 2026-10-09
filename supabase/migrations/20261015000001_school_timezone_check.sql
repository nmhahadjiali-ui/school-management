-- Schools: reject time zones PostgreSQL does not recognise.
-- The web form already validates the name; the mobile app also writes schools
-- directly (as the signed-in super/school admin, under RLS), so the database
-- enforces it for every client. Raised as P0001 so apps can show the message.

create or replace function public.validate_school_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Choose a valid time zone (for example Asia/Manila).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists schools_validate_timezone on public.schools;
create trigger schools_validate_timezone
  before insert or update of timezone on public.schools
  for each row execute function public.validate_school_timezone();
