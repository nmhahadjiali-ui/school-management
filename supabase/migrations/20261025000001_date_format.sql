-- How dates are shown in the app, per school: 'medium' (Mar 30, 2026),
-- 'long' (March 30, 2026) or 'iso' (2026-03-30). Returned by get_my_context()
-- so every page can format dates without another query.
alter table public.school_settings
  add column date_format text not null default 'medium' check (date_format in ('medium', 'long', 'iso'));

create or replace function public.get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', to_jsonb(p) - 'user_id',
    'school', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'name', s.name, 'code', s.code, 'logo_url', s.logo_url,
      'timezone', s.timezone, 'status', s.status
    ) end,
    'settings', case when st.id is null then null else jsonb_build_object(
      'primary_color', st.primary_color,
      'currency', st.currency,
      'date_format', st.date_format
    ) end,
    'current_academic_year', (
      select jsonb_build_object('id', y.id, 'name', y.name, 'start_date', y.start_date, 'end_date', y.end_date)
      from public.academic_years y where y.school_id = s.id and y.is_current
    ),
    'record', coalesce(
      (select jsonb_build_object('type', 'teacher', 'id', t.id) from public.teachers t where t.user_id = p.user_id),
      (select jsonb_build_object('type', 'student', 'id', x.id) from public.students x where x.user_id = p.user_id),
      (select jsonb_build_object('type', 'guardian', 'id', g.id) from public.guardians g where g.user_id = p.user_id)
    ),
    'access_active', p.status = 'active' and (p.role = 'super_admin' or s.status = 'active'),
    'features', coalesce((
      select jsonb_agg(f.feature_key order by f.feature_key)
      from public.school_features f
      where f.school_id = s.id and f.enabled
        and p.status = 'active' and s.status = 'active'
    ), '[]'::jsonb),
    'finance_level', case when p.status = 'active' and s.status = 'active'
                          then private.finance_level(s.id) else 'none' end
  )
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join public.school_settings st on st.school_id = s.id
  where p.user_id = (select auth.uid())
$$;
