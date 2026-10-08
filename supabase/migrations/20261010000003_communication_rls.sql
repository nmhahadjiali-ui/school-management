-- =============================================================================
-- Phase 4 RLS. Same principles as Phases 1-3 (see docs/SECURITY.md).
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['notification_types', 'notification_preferences', 'announcements', 'announcement_targets',
                           'notification_deliveries', 'sms_usage', 'user_devices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.notification_types to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update on public.announcements to authenticated;
grant select, insert, delete on public.announcement_targets to authenticated;
grant select on public.notification_deliveries, public.sms_usage to authenticated;
grant select, insert, update, delete on public.user_devices to authenticated;
-- Notifications (Phase 3): recipients may additionally dismiss.
grant update (dismissed_at) on public.notifications to authenticated;

-- Catalog: readable by any signed-in user (no school data in it).
create policy notification_types_select on public.notification_types for select to authenticated
  using ((select auth.uid()) is not null);

-- Preferences: only your own, only inside your own school.
create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()) and school_id = (select private.my_school_id()))
  with check (user_id = (select auth.uid()) and school_id = (select private.my_school_id()));

-- Announcements:
--   managers: everything of their school (including drafts, archived, expired)
--   authors (permitted teachers): their own
--   everyone else: published, not expired, and addressed to them (membership match)
create policy announcements_select on public.announcements for select to authenticated
  using ((select private.can_manage_school(school_id))
         or author_user_id = (select auth.uid())
         or ((select private.my_feature('announcements')) and private.announcement_visible(id)));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (((select private.can_manage_school(school_id))
               or (school_id = (select private.my_school_id()) and (select private.my_teacher_id()) is not null))
              and (select private.my_feature('announcements')));
create policy announcements_update on public.announcements for update to authenticated
  using ((select private.can_manage_school(school_id))
         or (author_user_id = (select auth.uid()) and (select private.my_teacher_id()) is not null))
  with check ((select private.can_manage_school(school_id))
              or (author_user_id = (select auth.uid()) and (select private.my_teacher_id()) is not null));

-- Targets follow their announcement; teacher targets are moderated by trigger.
create policy announcement_targets_select on public.announcement_targets for select to authenticated
  using ((select private.can_manage_school(school_id))
         or exists (select 1 from public.announcements a where a.id = announcement_id and a.author_user_id = (select auth.uid())));
create policy announcement_targets_insert on public.announcement_targets for insert to authenticated
  with check ((select private.can_manage_school(school_id))
              or exists (select 1 from public.announcements a where a.id = announcement_id and a.author_user_id = (select auth.uid())));
create policy announcement_targets_delete on public.announcement_targets for delete to authenticated
  using ((select private.can_manage_school(school_id))
         or exists (select 1 from public.announcements a where a.id = announcement_id and a.author_user_id = (select auth.uid())));

-- Delivery logs and SMS usage: school managers only (destinations are PII).
-- Written exclusively by the notification service and the server worker.
create policy notification_deliveries_select on public.notification_deliveries for select to authenticated
  using ((select private.can_manage_school(school_id)));
create policy sms_usage_select on public.sms_usage for select to authenticated
  using ((select private.can_manage_school(school_id)));

-- Devices: only your own. Registration goes through register_device(), which
-- always uses the caller's identity; direct writes are limited the same way.
create policy user_devices_own on public.user_devices for all to authenticated
  using (user_id = (select auth.uid()) and school_id = (select private.my_school_id()))
  with check (user_id = (select auth.uid()) and school_id = (select private.my_school_id()));
