-- =============================================================================
-- Remove the Phase 1 academic-year fields from school_settings: academic_years
-- is now the single source of truth. Existing values are migrated first.
-- =============================================================================

insert into public.academic_years (school_id, name, start_date, end_date, status, is_current)
select st.school_id,
       coalesce(st.academic_year, to_char(st.academic_year_start, 'YYYY') || '-' || to_char(st.academic_year_end, 'YYYY')),
       st.academic_year_start,
       st.academic_year_end,
       'active',
       true
from public.school_settings st
where st.academic_year_start is not null
  and st.academic_year_end is not null
  and st.academic_year_start < st.academic_year_end
  and not exists (select 1 from public.academic_years y where y.school_id = st.school_id and y.is_current);

alter table public.school_settings
  drop constraint school_settings_year_range,
  drop column academic_year,
  drop column academic_year_start,
  drop column academic_year_end;
