-- Number formats are free text: any printable characters (no { } outside the
-- tokens), 1–40 long. {YYYY}, {YY} and the counter {#...} are all optional;
-- without a counter token the counter is appended at the end (e.g. 'ISF-' ->
-- ISF-1, ISF-2 ...). At most one counter token.

create or replace function private.valid_number_format(p_format text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_format is not null
     and char_length(p_format) between 1 and 40
     and p_format ~ '^([^{}[:cntrl:]]|\{YYYY\}|\{YY\}|\{#{1,8}\})+$'
     and (select count(*) from regexp_matches(p_format, '\{#+\}', 'g')) <= 1
$$;

create or replace function private.format_record_number(p_format text, p_n integer, p_today date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_width integer := coalesce(char_length((regexp_match(p_format, '\{(#+)\}'))[1]), 0);
  v_digits text := p_n::text;
  v_out text;
begin
  if char_length(v_digits) < v_width then
    v_digits := lpad(v_digits, v_width, '0');
  end if;
  v_out := case when v_width > 0 then regexp_replace(p_format, '\{#+\}', v_digits) else p_format || v_digits end;
  return replace(replace(v_out, '{YYYY}', to_char(p_today, 'YYYY')), '{YY}', to_char(p_today, 'YY'));
end;
$$;
