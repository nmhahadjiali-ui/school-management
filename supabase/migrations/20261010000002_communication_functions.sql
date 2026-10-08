-- =============================================================================
-- Phase 4: the notification service, announcement targeting/lifecycle,
-- academic events, delivery queue, devices and scheduled jobs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Channel availability for a school = platform feature flag AND school choice.
-- (Feature flag: what the school has — later tied to plans/add-ons.
--  School setting: what the school chooses to use.)
-- ---------------------------------------------------------------------------
create function private.school_channels(p_school uuid)
returns table (in_app boolean, email boolean, sms boolean, push boolean, parents boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.school_has_feature(p_school, 'notifications') and st.notifications_enabled,
    private.school_has_feature(p_school, 'notifications') and st.notifications_enabled
      and private.school_has_feature(p_school, 'email_notifications') and st.email_notifications_enabled,
    private.school_has_feature(p_school, 'notifications') and st.notifications_enabled
      and private.school_has_feature(p_school, 'sms') and st.sms_notifications_enabled,
    private.school_has_feature(p_school, 'notifications') and st.notifications_enabled
      and private.school_has_feature(p_school, 'push_notifications') and st.push_notifications_enabled,
    private.school_has_feature(p_school, 'parent_communication')
  from public.school_settings st
  where st.school_id = p_school
$$;

-- ---------------------------------------------------------------------------
-- THE NOTIFICATION SERVICE. Every notification in the platform goes through
-- here (academic events, announcements, reminders, future modules).
--
--   1. validate the school (active, notifications on)
--   2. validate recipients (active accounts OF THIS SCHOOL only)
--   3. resolve channels per recipient: school channels x type defaults x
--      user preferences (mandatory types / urgent priority override opt-outs)
--   4. create the in-app notification (idempotent on event_key + recipient)
--   5. queue external deliveries (idempotent on notification + channel + destination)
--   6. audit
-- Returns the number of NEW notifications (0 when the event was already processed).
-- ---------------------------------------------------------------------------
create function private.notify_event(
  p_school uuid,
  p_type text,
  p_event_key text,
  p_recipients uuid[],
  p_title text,
  p_message text,
  p_data jsonb default '{}'::jsonb,
  p_priority public.notification_priority default 'normal',
  p_expires_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch record;
  t public.notification_types;
  v_new integer;
begin
  if p_recipients is null or cardinality(p_recipients) = 0 then
    return 0;
  end if;
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then
    return 0;
  end if;
  select * into ch from private.school_channels(p_school);
  if not coalesce(ch.in_app, false) then
    return 0;
  end if;
  select * into t from public.notification_types where key = p_type;
  if t.id is null then
    raise exception 'Unknown notification type %', p_type using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.notify_targets (
    user_id uuid primary key, email text, phone text,
    want_in_app boolean, want_email boolean, want_sms boolean, want_push boolean
  ) on commit drop;
  truncate pg_temp.notify_targets;

  insert into pg_temp.notify_targets
  select
    p.user_id,
    nullif(btrim(p.email), ''),
    coalesce(nullif(btrim(p.phone), ''),
             (select nullif(btrim(g.phone), '') from public.guardians g where g.user_id = p.user_id),
             (select nullif(btrim(s.phone), '') from public.students s where s.user_id = p.user_id),
             (select nullif(btrim(x.phone), '') from public.teachers x where x.user_id = p.user_id)),
    t.mandatory or p_priority = 'urgent' or coalesce(np.in_app_enabled, t.default_in_app),
    case when t.mandatory then t.default_email else coalesce(np.email_enabled, t.default_email) end,
    case when t.mandatory then t.default_sms else coalesce(np.sms_enabled, t.default_sms) end,
    case when t.mandatory then t.default_push else coalesce(np.push_enabled, t.default_push) end
  from public.profiles p
  left join public.notification_preferences np on np.user_id = p.user_id and np.notification_type = p_type
  where p.user_id = any(p_recipients)
    and p.school_id = p_school
    and p.status = 'active'
    -- Parent communication is an optional module; announcements/system still reach parents.
    and (p.role <> 'parent' or ch.parents or t.category in ('announcement', 'system', 'account'))
  on conflict (user_id) do nothing;

  with inserted as (
    insert into public.notifications
      (school_id, recipient_user_id, type, title, message, data, priority, expires_at, event_key, actor_user_id, show_in_app)
    select p_school, nt.user_id, p_type, left(p_title, 200), left(coalesce(p_message, ''), 2000), coalesce(p_data, '{}'::jsonb),
           p_priority, p_expires_at, p_event_key, (select auth.uid()), nt.want_in_app
    from pg_temp.notify_targets nt
    on conflict (event_key, recipient_user_id) do nothing
    returning id, recipient_user_id
  ),
  deliveries as (
    insert into public.notification_deliveries (school_id, notification_id, recipient_user_id, channel, destination)
    select p_school, i.id, i.recipient_user_id, d.channel, d.destination
    from inserted i
    join pg_temp.notify_targets nt on nt.user_id = i.recipient_user_id
    cross join lateral (
      select 'email'::public.delivery_channel as channel, nt.email as destination where ch.email and nt.want_email and nt.email is not null
      union all
      select 'sms', nt.phone where ch.sms and nt.want_sms and nt.phone is not null
      union all
      select 'push', ud.push_token from public.user_devices ud where ch.push and nt.want_push and ud.user_id = nt.user_id
    ) d
    on conflict (notification_id, channel, destination) do nothing
    returning 1
  )
  select count(*) into v_new from inserted;

  if v_new > 0 then
    perform private.audit(p_school, 'notification.generated', 'notification_event', null,
      jsonb_build_object('event_key', p_event_key, 'type', p_type, 'recipients', v_new));
  end if;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audiences
-- ---------------------------------------------------------------------------

-- Accounts belonging to a section in its year: students with an open
-- enrollment, their guardians (who accept notifications), the adviser and
-- subject teachers. `p_roles` narrows the result (NULL = all of them).
create function private.section_members(p_section uuid, p_roles public.app_role[] default null)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id
  from public.student_enrollments e join public.students s on s.id = e.student_id
  where e.section_id = p_section and e.enrollment_status = 'enrolled' and s.user_id is not null
    and (p_roles is null or 'student' = any(p_roles))
  union
  select g.user_id
  from public.student_enrollments e
  join public.student_guardians sg on sg.student_id = e.student_id
  join public.guardians g on g.id = sg.guardian_id
  where e.section_id = p_section and e.enrollment_status = 'enrolled' and g.user_id is not null
    and g.status = 'active' and sg.can_receive_notifications
    and (p_roles is null or 'parent' = any(p_roles))
  union
  select t.user_id
  from public.teachers t
  where t.user_id is not null and t.status = 'active'
    and (p_roles is null or 'teacher' = any(p_roles))
    and (t.id = (select adviser_teacher_id from public.sections where id = p_section)
         or t.id in (select teacher_id from public.teacher_subject_assignments where section_id = p_section))
$$;

-- Everyone an announcement is addressed to (union of its targets).
create function private.announcement_recipients(p_announcement uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select id, school_id from public.announcements where id = p_announcement),
  tg as (select t.* from public.announcement_targets t join a on a.id = t.announcement_id)
  -- entire school (optionally by role)
  select p.user_id
  from tg join public.profiles p on p.school_id = tg.school_id
  where tg.target_type = 'school' and tg.target_id = tg.school_id and p.status = 'active'
    and (tg.roles is null or p.role = any(tg.roles))
  union
  -- grade level: members of its sections in the CURRENT academic year
  select m.user_id
  from tg
  join public.sections s on s.grade_level_id = tg.target_id and s.school_id = tg.school_id
  join public.academic_years y on y.id = s.academic_year_id and y.is_current
  cross join lateral private.section_members(s.id, tg.roles) m
  where tg.target_type = 'grade_level'
  union
  select m.user_id
  from tg
  join public.sections s on s.id = tg.target_id and s.school_id = tg.school_id
  cross join lateral private.section_members(s.id, tg.roles) m
  where tg.target_type = 'section'
  union
  -- class (teaching load): section students & parents + THAT subject's teacher
  select m.user_id
  from tg
  join public.teacher_subject_assignments l on l.id = tg.target_id and l.school_id = tg.school_id
  cross join lateral private.section_members(l.section_id, coalesce(
    (select array_agg(r) from unnest(tg.roles) r where r in ('student', 'parent')), array['student', 'parent']::public.app_role[])) m
  where tg.target_type = 'class'
  union
  select x.user_id
  from tg
  join public.teacher_subject_assignments l on l.id = tg.target_id and l.school_id = tg.school_id
  join public.teachers x on x.id = l.teacher_id
  where tg.target_type = 'class' and x.user_id is not null and (tg.roles is null or 'teacher' = any(tg.roles))
  union
  select p.user_id
  from tg join public.profiles p on p.user_id = tg.target_id and p.school_id = tg.school_id
  where tg.target_type = 'user' and p.status = 'active'
$$;

-- The caller's memberships, mirroring announcement_recipients (current year).
-- Used by RLS to decide which announcements a user may read.
create function private.my_audience()
returns table (target_type public.announcement_target_type, target_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.my_school_id() as school_id, private.my_role() as role, (select auth.uid()) as uid),
  my_sections as (
    -- teacher: advised + taught sections; student: own; parent: children's (current year, open enrollments)
    select s.id, s.grade_level_id
    from public.sections s
    join public.academic_years y on y.id = s.academic_year_id and y.is_current
    where s.id in (select private.my_teacher_section_ids())
       or s.id in (select e.section_id from public.student_enrollments e
                   where e.enrollment_status = 'enrolled'
                     and (e.student_id = private.my_student_id() or e.student_id in (select private.my_guardian_student_ids())))
  )
  select 'school'::public.announcement_target_type, me.school_id from me where me.school_id is not null
  union all select 'user', me.uid from me where me.school_id is not null
  union all select 'section', ms.id from my_sections ms
  union all select distinct 'grade_level'::public.announcement_target_type, ms.grade_level_id from my_sections ms
  union all
  select 'class', l.id from public.teacher_subject_assignments l, me
  where (me.role = 'teacher' and l.teacher_id = private.my_teacher_id() and l.section_id in (select id from my_sections))
     or (me.role in ('student', 'parent') and l.section_id in (select id from my_sections))
$$;

-- Can the caller read this announcement as a recipient (published, active, targeted)?
create function private.announcement_visible(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.announcements a
    join public.announcement_targets t on t.announcement_id = a.id
    where a.id = p_announcement
      and a.school_id = private.my_school_id()
      and a.status = 'published'
      and (a.expires_at is null or a.expires_at > now())
      and (t.roles is null or private.my_role() = any(t.roles))
      and (t.target_type, t.target_id) in (select ma.target_type, ma.target_id from private.my_audience() ma)
  )
$$;

-- ---------------------------------------------------------------------------
-- Announcement integrity & authorization (who may target whom)
-- ---------------------------------------------------------------------------
create function private.guard_announcement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_api boolean := current_user in ('authenticated', 'anon');
begin
  if v_api then
    if tg_op = 'INSERT' then
      new.author_user_id := (select auth.uid());
      new.status := 'draft';           -- publishing goes through publish_announcement()
      new.published_at := null;
      if not private.can_manage_school(new.school_id) and not (
        private.my_teacher_id() is not null
        and coalesce((select teachers_can_announce from public.school_settings where school_id = new.school_id), false)) then
        raise exception 'You are not allowed to create announcements' using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status
          and new.status <> 'archived'                                   -- archive: any editor
          and not (old.status = 'scheduled' and new.status = 'draft') then -- unschedule
      raise exception 'Use publish_announcement() to publish or schedule' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'Archived announcements cannot be republished' using errcode = 'P0001';
    end if;
    if old.status = 'published' and new.status in ('draft', 'scheduled') then
      raise exception 'A published announcement cannot be unpublished; archive it instead' using errcode = 'P0001';
    end if;
    if new.status = 'archived' and old.status <> 'archived' then new.archived_at := now(); end if;
    if new.status = 'draft' then new.published_at := null; end if;
  end if;
  return new;
end;
$$;

create trigger announcements_guard before insert or update on public.announcements
  for each row execute function private.guard_announcement();

-- SECURITY INVOKER on purpose: current_user identifies API callers, and the
-- lookups below run under the caller's RLS.
create function private.guard_announcement_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row public.announcement_targets := case when tg_op = 'DELETE' then old else new end;
  v_status public.announcement_status;
  v_is_manager boolean;
  v_ok boolean;
begin
  select status into v_status from public.announcements where id = v_row.announcement_id;
  if v_status in ('published', 'archived') and current_user in ('authenticated', 'anon') then
    raise exception 'The audience of a published announcement cannot be changed' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Moderation first: teachers may only address sections/classes they teach.
  if current_user in ('authenticated', 'anon') then
    v_is_manager := private.can_manage_school(new.school_id);
    if not v_is_manager and not (
         (new.target_type = 'section' and new.target_id in (select private.my_teacher_section_ids()))
      or (new.target_type = 'class' and exists (select 1 from public.teacher_subject_assignments
                                                where id = new.target_id and teacher_id = private.my_teacher_id()))) then
      raise exception 'Teachers can only address their own sections and classes' using errcode = '42501';
    end if;
  end if;

  -- The target must exist in the SAME school.
  v_ok := case new.target_type
    when 'school' then new.target_id = new.school_id
    when 'grade_level' then exists (select 1 from public.grade_levels where id = new.target_id and school_id = new.school_id)
    when 'section' then exists (select 1 from public.sections where id = new.target_id and school_id = new.school_id)
    when 'class' then exists (select 1 from public.teacher_subject_assignments where id = new.target_id and school_id = new.school_id)
    when 'user' then exists (select 1 from public.profiles where user_id = new.target_id and school_id = new.school_id)
  end;
  if not v_ok then
    raise exception 'The audience must belong to this school' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger announcement_targets_guard before insert or update or delete on public.announcement_targets
  for each row execute function private.guard_announcement_target();

-- Fan-out: one in-app notification per recipient (idempotent), deliveries queued.
create function private.deliver_announcement(p_announcement uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare a public.announcements;
begin
  select * into a from public.announcements where id = p_announcement and status = 'published';
  if a.id is null then
    return 0;
  end if;
  if not private.school_has_feature(a.school_id, 'announcements') then
    return 0;
  end if;
  return private.notify_event(
    a.school_id, 'announcement', 'announcement:' || a.id,
    array(select r.user_id from private.announcement_recipients(a.id) r),
    a.title, left(regexp_replace(a.content, '\s+', ' ', 'g'), 280),
    jsonb_build_object('entity_type', 'announcement', 'entity_id', a.id),
    a.priority, a.expires_at);
end;
$$;

-- Publish now, or schedule when publish_at is in the future.
-- SECURITY DEFINER with explicit authorization: school admins of the
-- announcement's school, or its teacher-author when the school allows
-- teacher announcements (targets were already moderated on insert).
create function public.publish_announcement(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.announcements;
  v_status public.announcement_status;
begin
  select * into a from public.announcements where id = p_id for update;
  if a.id is null or a.school_id is distinct from private.my_school_id() and not private.is_super_admin() then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;
  if not (private.can_manage_school(a.school_id)
          or (a.author_user_id = (select auth.uid()) and private.my_teacher_id() is not null
              and coalesce((select teachers_can_announce from public.school_settings where school_id = a.school_id), false))) then
    raise exception 'You cannot publish this announcement' using errcode = '42501';
  end if;
  if not private.school_has_feature(a.school_id, 'announcements') then
    raise exception 'Announcements are not enabled for this school' using errcode = '42501';
  end if;
  if a.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled announcements can be published' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.announcement_targets where announcement_id = p_id) then
    raise exception 'Choose an audience before publishing' using errcode = 'P0001';
  end if;
  if a.expires_at is not null and a.expires_at <= now() then
    raise exception 'The expiry date is in the past' using errcode = 'P0001';
  end if;

  v_status := case when a.publish_at is not null and a.publish_at > now() then 'scheduled' else 'published' end;
  update public.announcements
     set status = v_status,
         published_at = case when v_status = 'published' then now() end,
         publish_at = coalesce(publish_at, now())
   where id = p_id;
  if v_status = 'published' then
    perform private.deliver_announcement(p_id);
  end if;
  return v_status::text;
end;
$$;

-- Audience preview for the editor (managers and the author only).
create function public.announcement_audience_count(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.announcements a
    where a.id = p_id and (private.can_manage_school(a.school_id) or a.author_user_id = (select auth.uid()))
  ) then (select count(*)::int from private.announcement_recipients(p_id)) else 0 end
$$;

-- Audit trail for announcements
create function private.after_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.school_id, 'announcement.created', 'announcement', new.id, jsonb_build_object('title', new.title));
  elsif new.status is distinct from old.status then
    perform private.audit(new.school_id, 'announcement.' || new.status::text, 'announcement', new.id,
      jsonb_build_object('title', new.title, 'publish_at', new.publish_at));
  elsif (new.title, new.content, new.priority, new.publish_at, new.expires_at)
        is distinct from (old.title, old.content, old.priority, old.publish_at, old.expires_at) then
    perform private.audit(new.school_id, 'announcement.edited', 'announcement', new.id, jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create trigger announcements_after after insert or update on public.announcements
  for each row execute function private.after_announcement();

-- ---------------------------------------------------------------------------
-- Academic events (replace the Phase 3 trigger functions). Event keys make
-- every event idempotent: reprocessing never duplicates a notification.
-- ---------------------------------------------------------------------------
create or replace function private.after_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_name text;
begin
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.remarks is distinct from old.remarks) then
    perform private.audit(new.school_id, 'attendance.modified', 'attendance_record', new.id,
      jsonb_build_object('student_id', new.student_id, 'old_status', old.status, 'new_status', new.status));
  end if;
  if new.status in ('absent', 'late') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select attendance_date into v_date from public.attendance_sessions where id = new.attendance_session_id;
    select first_name into v_name from public.students where id = new.student_id;
    perform private.notify_event(
      new.school_id,
      'attendance_' || new.status::text,
      'attendance:' || new.id || ':' || new.status::text,
      private.student_audience(new.student_id, true),
      v_name || ' was marked ' || new.status::text,
      'Attendance for ' || to_char(v_date, 'FMDay, Mon DD') || ': ' || new.status::text || coalesce(' — ' || new.remarks, ''),
      jsonb_build_object('entity_type', 'attendance', 'entity_id', new.id, 'student_id', new.student_id, 'date', v_date, 'status', new.status),
      case when new.status = 'absent' then 'high' else 'normal' end::public.notification_priority);
  end if;
  return null;
end;
$$;

create or replace function private.after_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_subject text;
  v_period text;
  v_name text;
begin
  v_action := case
    when tg_op = 'INSERT' then 'grade.created'
    when new.status is distinct from old.status then case new.status
      when 'submitted' then 'grade.submitted'
      when 'approved' then case when old.status = 'locked' then 'grade.unlocked' else 'grade.approved' end
      when 'locked' then 'grade.locked'
      when 'draft' then 'grade.returned' end
    when new.score is distinct from old.score or new.remarks is distinct from old.remarks then 'grade.modified'
  end;
  if v_action is not null then
    perform private.audit(new.school_id, v_action, 'grade_record', new.id, jsonb_build_object(
      'student_id', new.student_id, 'subject_id', new.subject_id, 'grading_period_id', new.grading_period_id,
      'old_score', case when tg_op = 'UPDATE' then old.score end, 'new_score', new.score));
  end if;

  select name into v_subject from public.subjects where id = new.subject_id;
  select name into v_period from public.grading_periods where id = new.grading_period_id;
  select first_name into v_name from public.students where id = new.student_id;

  -- Published = approved for the first time.
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status in ('draft', 'submitted')) then
    perform private.notify_event(new.school_id, 'grade_published', 'grade_published:' || new.id,
      private.student_audience(new.student_id),
      'New grade: ' || v_subject, v_period || ' grade for ' || v_name || ' is now available.',
      jsonb_build_object('entity_type', 'grade', 'entity_id', new.id, 'student_id', new.student_id));
  -- A published grade's score changed (admin correction with a reason).
  elsif tg_op = 'UPDATE' and old.status in ('approved', 'locked') and new.status in ('approved', 'locked')
        and new.score is distinct from old.score then
    perform private.notify_event(new.school_id, 'grade_updated', 'grade_updated:' || new.id || ':' || new.score,
      private.student_audience(new.student_id),
      'Grade changed: ' || v_subject, v_period || ' grade for ' || v_name || ' was updated.',
      jsonb_build_object('entity_type', 'grade', 'entity_id', new.id, 'student_id', new.student_id));
  end if;
  return null;
end;
$$;

create or replace function private.after_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.school_id, 'assignment.created', 'assignment', new.id,
      jsonb_build_object('title', new.title, 'section_id', new.section_id, 'subject_id', new.subject_id));
  elsif (new.title, new.description, new.due_at, new.status, new.attachment_path)
        is distinct from (old.title, old.description, old.due_at, old.status, old.attachment_path) then
    perform private.audit(new.school_id, 'assignment.modified', 'assignment', new.id,
      jsonb_build_object('title', new.title, 'old_status', old.status, 'new_status', new.status,
                         'old_due_at', old.due_at, 'new_due_at', new.due_at));
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform private.notify_event(new.school_id, 'assignment_created', 'assignment_created:' || new.id,
      array(select m.user_id from private.section_members(new.section_id, array['student', 'parent']::public.app_role[]) m),
      'New assignment: ' || new.title,
      (select name from public.subjects where id = new.subject_id)
        || coalesce(' — due ' || to_char(new.due_at at time zone (select timezone from public.schools where id = new.school_id), 'Mon DD, HH24:MI'), ''),
      jsonb_build_object('entity_type', 'assignment', 'entity_id', new.id));
  end if;
  return null;
end;
$$;

-- Submission reviewed -> the student (and parents) hear about it.
create function private.after_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'reviewed' and old.status is distinct from 'reviewed' then
    perform private.notify_event(new.school_id, 'assignment_graded', 'assignment_graded:' || new.id,
      private.student_audience(new.student_id),
      'Assignment reviewed: ' || (select title from public.assignments where id = new.assignment_id),
      'Your teacher has reviewed the submission.',
      jsonb_build_object('entity_type', 'assignment', 'entity_id', new.assignment_id, 'student_id', new.student_id));
  end if;
  return null;
end;
$$;

create trigger submissions_after after update on public.assignment_submissions
  for each row execute function private.after_submission();

-- Schedule changes (not initial timetable building): time/day/room/teacher
-- changes and removals notify the section and the teacher(s) involved.
create function private.after_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.class_schedules := case when tg_op = 'DELETE' then old else new end;
  v_subject text;
  v_users uuid[];
  v_key text;
  v_days text[] := array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
begin
  if tg_op = 'UPDATE' and (new.day_of_week, new.start_time, new.end_time, new.room, new.teacher_id, new.status)
       is not distinct from (old.day_of_week, old.start_time, old.end_time, old.room, old.teacher_id, old.status) then
    return null;
  end if;
  -- Only for the current academic year.
  if not exists (select 1 from public.academic_years where id = r.academic_year_id and is_current) then
    return null;
  end if;
  select name into v_subject from public.subjects where id = r.subject_id;
  v_users := array(
    select m.user_id from private.section_members(r.section_id, array['student', 'parent']::public.app_role[]) m
    union
    select t.user_id from public.teachers t
    where t.user_id is not null and t.id in (old.teacher_id, case when tg_op = 'DELETE' then null else new.teacher_id end));
  if tg_op = 'DELETE' then
    v_key := 'schedule:' || r.id || ':deleted';
  else
    v_key := 'schedule:' || r.id || ':' || md5(row(new.*)::text);
  end if;
  perform private.notify_event(r.school_id, 'schedule_changed', v_key, v_users,
    'Schedule change: ' || v_subject,
    case when tg_op = 'DELETE' or r.status = 'inactive' then v_subject || ' on ' || v_days[r.day_of_week] || ' was removed from the schedule.'
         else v_subject || ' is now ' || v_days[r.day_of_week] || ' ' || to_char(r.start_time, 'HH24:MI') || '–' || to_char(r.end_time, 'HH24:MI')
              || coalesce(', room ' || r.room, '') || '.' end,
    jsonb_build_object('entity_type', 'schedule', 'entity_id', r.id, 'section_id', r.section_id));
  return null;
end;
$$;

create trigger class_schedules_after after update or delete on public.class_schedules
  for each row execute function private.after_schedule();

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron, every minute; also callable by the server worker)
--   * publish due scheduled announcements
--   * remind students/parents of coursework due within 24h and not submitted
-- Expiry needs no job: feeds filter on expires_at; records are kept.
-- ---------------------------------------------------------------------------
create function private.run_communication_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  w record;
  v_published integer := 0;
  v_reminders integer := 0;
begin
  for a in
    select id from public.announcements
    where status = 'scheduled' and publish_at <= now()
    order by publish_at
    for update skip locked
  loop
    update public.announcements set status = 'published', published_at = now() where id = a.id;
    perform private.deliver_announcement(a.id);
    v_published := v_published + 1;
  end loop;

  for w in
    select x.* from public.assignments x
    where x.status = 'published' and x.due_at > now() and x.due_at <= now() + interval '24 hours'
      and private.school_has_feature(x.school_id, 'coursework')
  loop
    v_reminders := v_reminders + private.notify_event(w.school_id, 'assignment_due', 'assignment_due:' || w.id,
      array(
        select m.user_id from private.section_members(w.section_id, array['student'::public.app_role]) m
        where not exists (select 1 from public.assignment_submissions sub
                          join public.students s on s.id = sub.student_id
                          where sub.assignment_id = w.id and s.user_id = m.user_id)
        union
        select g.user_id
        from public.student_enrollments e
        join public.student_guardians sg on sg.student_id = e.student_id and sg.can_receive_notifications
        join public.guardians g on g.id = sg.guardian_id and g.status = 'active' and g.user_id is not null
        where e.section_id = w.section_id and e.enrollment_status = 'enrolled'
          and not exists (select 1 from public.assignment_submissions sub where sub.assignment_id = w.id and sub.student_id = e.student_id)),
      'Due soon: ' || w.title,
      'Due ' || to_char(w.due_at at time zone (select timezone from public.schools where id = w.school_id), 'Mon DD, HH24:MI') || ' and not submitted yet.',
      jsonb_build_object('entity_type', 'assignment', 'entity_id', w.id));
  end loop;
  return jsonb_build_object('announcements_published', v_published, 'due_reminders', v_reminders);
end;
$$;

-- ---------------------------------------------------------------------------
-- Delivery queue RPCs for the server-side worker (SERVICE ROLE ONLY).
-- Providers live in application code; the database only tracks state.
-- ---------------------------------------------------------------------------
create function public.claim_notification_deliveries(p_limit integer default 50)
returns table (
  id uuid, school_id uuid, channel public.delivery_channel, destination text, attempts integer,
  title text, message text, priority public.notification_priority, data jsonb, notification_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Never send through a channel the school no longer has (e.g. SMS switched off).
  update public.notification_deliveries d
     set status = 'cancelled', error_message = 'Channel disabled for this school'
   where d.status = 'pending'
     and not coalesce((select case d.channel when 'email' then c.email when 'sms' then c.sms when 'push' then c.push else c.in_app end
                       from private.school_channels(d.school_id) c), false);
  -- Recover deliveries stuck in processing (worker crashed).
  update public.notification_deliveries
     set status = 'pending'
   where status = 'processing' and last_attempt_at < now() - interval '10 minutes';

  return query
  with claimed as (
    update public.notification_deliveries d
       set status = 'processing', attempts = d.attempts + 1, last_attempt_at = now()
     where d.id in (
       select q.id from public.notification_deliveries q
       where q.status = 'pending' and q.next_attempt_at <= now()
       order by q.next_attempt_at
       limit greatest(1, least(p_limit, 500))
       for update skip locked)
    returning d.*
  )
  select c.id, c.school_id, c.channel, c.destination, c.attempts, n.title, n.message, n.priority, n.data, n.id
  from claimed c join public.notifications n on n.id = c.notification_id;
end;
$$;

-- Record the outcome of one send attempt. Retries with backoff up to 3 attempts.
create function public.complete_notification_delivery(
  p_id uuid, p_success boolean, p_provider text, p_provider_message_id text default null, p_error text default null
)
returns public.delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.notification_deliveries;
  v_final boolean;
  v_status public.delivery_status;
  v_year smallint := extract(year from now() at time zone 'UTC');
  v_month smallint := extract(month from now() at time zone 'UTC');
begin
  select * into d from public.notification_deliveries where id = p_id and status = 'processing' for update;
  if d.id is null then
    raise exception 'Delivery % is not being processed', p_id using errcode = 'P0002';
  end if;

  if p_success then
    v_status := 'sent';
    update public.notification_deliveries
       set status = 'sent', provider = left(p_provider, 50), provider_message_id = left(p_provider_message_id, 200), error_message = null
     where id = p_id;
  else
    v_final := d.attempts >= 3;
    v_status := case when v_final then 'failed' else 'pending' end;
    update public.notification_deliveries
       set status = v_status, provider = left(p_provider, 50), error_message = left(p_error, 1000),
           failed_at = case when v_final then now() end,
           next_attempt_at = now() + (interval '1 minute' * power(5, d.attempts))
     where id = p_id;
  end if;

  if d.channel = 'sms' and (p_success or v_final) then
    insert into public.sms_usage (school_id, year, month, messages_sent, messages_failed)
    values (d.school_id, v_year, v_month, case when p_success then 1 else 0 end, case when p_success then 0 else 1 end)
    on conflict (school_id, year, month) do update
      set messages_sent = public.sms_usage.messages_sent + excluded.messages_sent,
          messages_failed = public.sms_usage.messages_failed + excluded.messages_failed;
    perform private.audit(d.school_id, 'sms.usage_recorded', 'sms_usage', null,
      jsonb_build_object('year', v_year, 'month', v_month, 'sent', p_success));
  end if;

  if p_success or v_final then
    perform private.audit(d.school_id, case when p_success then 'notification.delivery_succeeded' else 'notification.delivery_failed' end,
      'notification_delivery', d.id,
      jsonb_build_object('channel', d.channel, 'provider', p_provider, 'attempts', d.attempts, 'error', left(p_error, 200)));
  else
    perform private.audit(d.school_id, 'notification.delivery_attempted', 'notification_delivery', d.id,
      jsonb_build_object('channel', d.channel, 'provider', p_provider, 'attempts', d.attempts, 'error', left(p_error, 200)));
  end if;
  return v_status;
end;
$$;

-- Worker entry point for scheduled work (same function pg_cron runs).
create function public.run_communication_jobs()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.run_communication_jobs()
$$;

-- ---------------------------------------------------------------------------
-- Devices: register / refresh a push token for the CALLER (never another user).
-- A token that moved to a new account is reassigned to the caller.
-- ---------------------------------------------------------------------------
create function public.register_device(p_push_token text, p_device_type public.device_type, p_app_version text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.my_school_id();
  v_id uuid;
begin
  if (select auth.uid()) is null or v_school is null then
    raise exception 'Sign in to an active school account to register a device' using errcode = '42501';
  end if;
  insert into public.user_devices (school_id, user_id, device_type, push_token, app_version, last_seen_at)
  values (v_school, (select auth.uid()), p_device_type, p_push_token, left(p_app_version, 50), now())
  on conflict (push_token) do update
    set school_id = excluded.school_id, user_id = excluded.user_id, device_type = excluded.device_type,
        app_version = excluded.app_version, last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.school_channels(uuid), private.notify_event(uuid, text, text, uuid[], text, text, jsonb, public.notification_priority, timestamptz),
  private.section_members(uuid, public.app_role[]), private.announcement_recipients(uuid), private.deliver_announcement(uuid),
  private.run_communication_jobs(), private.after_announcement(), private.after_submission(), private.after_schedule(),
  private.guard_announcement_target() from public, authenticated;
revoke all on function private.guard_announcement() from public, authenticated;

revoke all on function private.my_audience(), private.announcement_visible(uuid) from public;
grant execute on function private.my_audience(), private.announcement_visible(uuid) to authenticated, service_role;

revoke all on function public.publish_announcement(uuid), public.announcement_audience_count(uuid), public.register_device(text, public.device_type, text) from public, anon;
grant execute on function public.publish_announcement(uuid), public.announcement_audience_count(uuid), public.register_device(text, public.device_type, text) to authenticated;

-- Worker-only RPCs: not callable by signed-in users at all.
revoke all on function public.claim_notification_deliveries(integer), public.complete_notification_delivery(uuid, boolean, text, text, text),
  public.run_communication_jobs() from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer), public.complete_notification_delivery(uuid, boolean, text, text, text),
  public.run_communication_jobs() to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: run the scheduled communication jobs every minute, in the database.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('communication-jobs', '* * * * *', $$select private.run_communication_jobs()$$);
