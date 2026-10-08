-- =============================================================================
-- RLS performance: evaluate permissions once per query, not once per row.
--
-- Policies like `(select private.can_manage_school(school_id))` pass a COLUMN
-- to the helper, so PostgreSQL cannot cache the result (initPlan) and calls
-- it — with its profile lookups — for every row it examines, across every
-- school's rows. A load test showed 100–900 ms per query on tiny tables.
--
-- Each per-row call is replaced by an exactly equivalent comparison against a
-- value computed once per statement:
--   can_manage_school(x)    → is_super_admin() OR x = admin_school_id()
--   is_school_admin_of(x)   → x = admin_school_id()
--   finance_can_view(x)     → is_super_admin() OR x = finance_view_school_id()
--   finance_can_manage(x)   → is_super_admin() OR x = finance_manage_school_id()
--   announcement_visible(id)→ id IN my_visible_announcement_ids()
-- (helpers return NULL when the caller has no such school; comparisons are
-- wrapped in COALESCE(…, false) so results match the old booleans exactly.)
--
-- The rewrite is applied to the policies' current definitions, so it covers
-- every phase. New policies must use these forms (see docs/SECURITY.md).
-- =============================================================================

-- The school this user administers (active school admin), else NULL.
create function private.admin_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select case when private.my_role() = 'school_admin' then private.my_school_id() end $$;

-- The user's own school if their finance level there is at least view / admin.
create function private.finance_view_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select case when private.finance_level(private.my_school_id()) in ('admin', 'staff', 'view') then private.my_school_id() end $$;

create function private.finance_manage_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select case when private.finance_level(private.my_school_id()) = 'admin' then private.my_school_id() end $$;

-- Every announcement visible to the caller as an audience member (same rules
-- as private.announcement_visible, computed once).
create function private.my_visible_announcement_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.id
  from public.announcements a
  join public.announcement_targets t on t.announcement_id = a.id
  where a.school_id = private.my_school_id()
    and a.status = 'published'
    and (a.expires_at is null or a.expires_at > now())
    and (t.roles is null or private.my_role() = any(t.roles))
    and (t.target_type, t.target_id) in (select ma.target_type, ma.target_id from private.my_audience() ma)
$$;

revoke all on function private.admin_school_id(), private.finance_view_school_id(), private.finance_manage_school_id(),
  private.my_visible_announcement_ids() from public, anon;
grant execute on function private.admin_school_id(), private.finance_view_school_id(), private.finance_manage_school_id(),
  private.my_visible_announcement_ids() to authenticated, service_role;

-- Rewrite the policies.
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
  n integer := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'private\.(can_manage_school|is_school_admin_of|finance_can_view|finance_can_manage|announcement_visible)\('
  loop
    v_using := p.qual;
    v_check := p.with_check;
    for i in 1..2 loop
      v_sql := case i when 1 then v_using else v_check end;
      continue when v_sql is null;
      v_sql := regexp_replace(v_sql, '\( SELECT private\.can_manage_school\(([^()]+)\) AS can_manage_school\)',
        '((SELECT private.is_super_admin()) OR COALESCE(\1 = (SELECT private.admin_school_id()), false))', 'g');
      v_sql := regexp_replace(v_sql, '\( SELECT private\.is_school_admin_of\(([^()]+)\) AS is_school_admin_of\)',
        'COALESCE(\1 = (SELECT private.admin_school_id()), false)', 'g');
      v_sql := regexp_replace(v_sql, '\( SELECT private\.finance_can_view\(([^()]+)\) AS finance_can_view\)',
        '((SELECT private.is_super_admin()) OR COALESCE(\1 = (SELECT private.finance_view_school_id()), false))', 'g');
      v_sql := regexp_replace(v_sql, '\( SELECT private\.finance_can_manage\(([^()]+)\) AS finance_can_manage\)',
        '((SELECT private.is_super_admin()) OR COALESCE(\1 = (SELECT private.finance_manage_school_id()), false))', 'g');
      v_sql := regexp_replace(v_sql, 'private\.announcement_visible\(id\)',
        '(id IN (SELECT private.my_visible_announcement_ids()))', 'g');
      if i = 1 then v_using := v_sql; else v_check := v_sql; end if;
    end loop;

    if v_using ~ 'private\.(can_manage_school|is_school_admin_of|finance_can_view|finance_can_manage|announcement_visible)\('
       or v_check ~ 'private\.(can_manage_school|is_school_admin_of|finance_can_view|finance_can_manage|announcement_visible)\(' then
      raise exception 'Policy %.% still has a per-row helper call: % / %', p.tablename, p.policyname, v_using, v_check;
    end if;

    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
         || coalesce(' using (' || v_using || ')', '')
         || coalesce(' with check (' || v_check || ')', '');
    n := n + 1;
  end loop;
  raise notice 'Rewrote % policies', n;
end $$;
