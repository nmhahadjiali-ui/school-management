-- Which catalog features are actually built.
--   available    : integrated; the per-school switch turns it on/off.
--   included     : always part of the system; the switch has no effect
--                  (payments = part of "Billing & payments"; parents always see their children).
--   coming_soon  : not built yet; it cannot be enabled for a school.
-- Shown to super admins on the web and in the app.

alter table public.features
  add column availability text not null default 'available'
  check (availability in ('available', 'included', 'coming_soon'));

update public.features set availability = 'coming_soon' where key in ('advanced_reports', 'inventory', 'library', 'online_enrollment');
update public.features set availability = 'included' where key in ('payments', 'parent_portal');

-- Switches that never did anything are turned off.
update public.school_features set enabled = false
where enabled and feature_key in (select key from public.features where availability = 'coming_soon');

create function private.forbid_unavailable_feature()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enabled and exists (select 1 from public.features f where f.key = new.feature_key and f.availability = 'coming_soon') then
    raise exception 'This feature is coming soon and cannot be enabled yet.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger school_features_forbid_unavailable before insert or update of enabled on public.school_features
  for each row execute function private.forbid_unavailable_feature();
