-- User-organized meetups on a voyage. Time is an instant plus the host's
-- chosen IANA zone; neither value is an official ship schedule/time source.
begin;

create table if not exists public.ahoier_meetups (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  voyage_id uuid not null references public.ahoier_voyages(id) on delete cascade,
  organizer_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 3 and 80 and title !~ '[[:cntrl:]]'),
  description text not null default '' check (description = btrim(description) and char_length(description) <= 300 and description !~ '[[:cntrl:]]'),
  location_label text not null check (location_label = btrim(location_label) and char_length(location_label) between 3 and 100 and location_label !~ '[[:cntrl:]]'),
  starts_at timestamptz not null,
  time_zone text not null check (char_length(time_zone) between 3 and 64 and time_zone !~ '[[:cntrl:]]'),
  capacity integer not null check (capacity between 2 and 30),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  canceled_at timestamptz,
  hidden_at timestamptz
);
create index if not exists ahoier_meetups_voyage_starts_idx on public.ahoier_meetups (voyage_id, starts_at)
  where hidden_at is null;
create index if not exists ahoier_meetups_organizer_idx on public.ahoier_meetups (organizer_id, starts_at desc);

-- The organizer owns one place without a separate RSVP row. This key makes
-- repeat requests idempotent and ensures one guest place per account.
create table if not exists public.ahoier_meetup_rsvps (
  meetup_id uuid not null references public.ahoier_meetups(id) on delete cascade,
  user_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (meetup_id, user_id)
);
create index if not exists ahoier_meetup_rsvps_user_idx on public.ahoier_meetup_rsvps (user_id, meetup_id);

alter table public.ahoier_meetups enable row level security;
alter table public.ahoier_meetup_rsvps enable row level security;
revoke all on public.ahoier_meetups, public.ahoier_meetup_rsvps from public, anon, authenticated;

create or replace function ahoier_private.ahoier_can_view_meetup(p_meetup_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ahoier_private.ahoier_is_active((select auth.uid())) and exists (
    select 1 from public.ahoier_meetups meet
    join public.ahoier_memberships member on member.voyage_id = meet.voyage_id
    where meet.id = p_meetup_id and member.user_id = (select auth.uid())
      and meet.hidden_at is null and meet.starts_at >= pg_catalog.now() - interval '1 day'
      and ahoier_private.ahoier_is_active(meet.organizer_id)
      and not ahoier_private.ahoier_is_blocked((select auth.uid()), meet.organizer_id)
  );
$$;

drop policy if exists ahoier_meetups_read_member on public.ahoier_meetups;
create policy ahoier_meetups_read_member on public.ahoier_meetups
  for select to authenticated using (ahoier_private.ahoier_can_view_meetup(id));
drop policy if exists ahoier_meetup_rsvps_read_member on public.ahoier_meetup_rsvps;
create policy ahoier_meetup_rsvps_read_member on public.ahoier_meetup_rsvps
  for select to authenticated using (
    ahoier_private.ahoier_can_view_meetup(meetup_id)
    and ahoier_private.ahoier_is_active(user_id)
    and not ahoier_private.ahoier_is_blocked((select auth.uid()), user_id)
  );
grant select on public.ahoier_meetups, public.ahoier_meetup_rsvps to authenticated;

-- Blocking a host or one of their guests releases that guest's place. Lock
-- affected meetups to serialize this cleanup with simultaneous RSVP calls.
create or replace function ahoier_private.ahoier_remove_blocked_meetup_rsvps()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meetup_id uuid;
begin
  for v_meetup_id in
    select meet.id from public.ahoier_meetups meet
    where (meet.organizer_id = new.blocker_id and exists (
        select 1 from public.ahoier_meetup_rsvps r
        where r.meetup_id = meet.id and r.user_id = new.blocked_id))
      or (meet.organizer_id = new.blocked_id and exists (
        select 1 from public.ahoier_meetup_rsvps r
        where r.meetup_id = meet.id and r.user_id = new.blocker_id))
    order by meet.id for update of meet
  loop
    delete from public.ahoier_meetup_rsvps r where r.meetup_id = v_meetup_id
      and r.user_id in (new.blocker_id, new.blocked_id)
      and exists (select 1 from public.ahoier_meetups meet where meet.id = v_meetup_id
        and meet.organizer_id in (new.blocker_id, new.blocked_id));
  end loop;
  return new;
end;
$$;
drop trigger if exists ahoier_blocks_release_meetup_rsvps on public.ahoier_blocks;
create trigger ahoier_blocks_release_meetup_rsvps
  after insert on public.ahoier_blocks for each row
  execute function ahoier_private.ahoier_remove_blocked_meetup_rsvps();

-- Privileged writes are kept behind narrow public RPCs. No client receives
-- INSERT/UPDATE/DELETE privileges on either table.
create or replace function ahoier_private.ahoier_validate_meetup_time(
  p_voyage_id uuid, p_starts_at timestamptz, p_time_zone text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_starts_at > pg_catalog.now() + interval '15 minutes'
    and exists (select 1 from pg_catalog.pg_timezone_names tz
      where tz.name = p_time_zone and (tz.name = 'UTC' or tz.name like '%/%'))
    and exists (select 1 from public.ahoier_voyages v
      where v.id = p_voyage_id
        and (p_starts_at at time zone p_time_zone)::date between v.starts_on and v.ends_on);
$$;

create or replace function ahoier_private.ahoier_create_meetup_impl(
  p_voyage_id uuid, p_title text, p_description text, p_location_label text,
  p_starts_at timestamptz, p_time_zone text, p_capacity integer)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not ahoier_private.ahoier_is_active(v_user)
    or not exists (select 1 from public.ahoier_memberships m
      where m.user_id = v_user and m.voyage_id = p_voyage_id) then
    raise exception 'Meetup creation requires an active voyage member' using errcode = '42501';
  end if;
  if not ahoier_private.ahoier_validate_meetup_time(p_voyage_id, p_starts_at, p_time_zone) then
    raise exception 'Choose a future time within this voyage and a valid time zone' using errcode = '22023';
  end if;
  -- Serialize the per-account creation limit, including concurrent requests.
  perform 1 from public.ahoier_profiles p where p.user_id = v_user for update;
  if (select count(*) from public.ahoier_meetups meet
      where meet.organizer_id = v_user and meet.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'Too many meetups created today' using errcode = '22023';
  end if;
  -- The summary lists at most 100 active future meetups. Serialize this
  -- voyage-wide ceiling so no valid future meetup becomes undiscoverable.
  perform 1 from public.ahoier_voyages v where v.id = p_voyage_id for update;
  if (select count(*) from public.ahoier_meetups meet
      where meet.voyage_id = p_voyage_id and meet.starts_at >= pg_catalog.now()
        and meet.canceled_at is null and meet.hidden_at is null) >= 100 then
    raise exception 'Too many upcoming meetups on this voyage' using errcode = '22023';
  end if;
  insert into public.ahoier_meetups
    (voyage_id, organizer_id, title, description, location_label, starts_at, time_zone, capacity)
  values (p_voyage_id, v_user, p_title, p_description, p_location_label,
    p_starts_at, p_time_zone, p_capacity)
  returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.ahoier_create_meetup(
  p_voyage_id uuid, p_title text, p_description text, p_location_label text,
  p_starts_at timestamptz, p_time_zone text, p_capacity integer)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_create_meetup_impl(p_voyage_id, p_title, p_description,
    p_location_label, p_starts_at, p_time_zone, p_capacity);
$$;

create or replace function ahoier_private.ahoier_rsvp_meetup_impl(p_meetup_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_meetup public.ahoier_meetups%rowtype;
begin
  if v_user is null or not ahoier_private.ahoier_is_active(v_user) then
    raise exception 'An active account is required' using errcode = '42501';
  end if;
  -- Every RSVP and host edit locks the same meetup row before counting places.
  select * into v_meetup from public.ahoier_meetups where id = p_meetup_id for update;
  if not found or not ahoier_private.ahoier_can_view_meetup(p_meetup_id)
    or v_meetup.canceled_at is not null or v_meetup.starts_at <= pg_catalog.now()
    or v_meetup.organizer_id = v_user then
    raise exception 'Meetup is not available for RSVP' using errcode = '42501';
  end if;
  if exists (select 1 from public.ahoier_meetup_rsvps r
    where r.meetup_id = p_meetup_id and r.user_id = v_user) then
    return;
  end if;
  if 1 + (select count(*) from public.ahoier_meetup_rsvps r
      where r.meetup_id = p_meetup_id) >= v_meetup.capacity then
    raise exception 'Meetup is full' using errcode = '22023';
  end if;
  insert into public.ahoier_meetup_rsvps (meetup_id, user_id)
  values (p_meetup_id, v_user);
end;
$$;
create or replace function public.ahoier_rsvp_meetup(p_meetup_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_rsvp_meetup_impl(p_meetup_id);
$$;

create or replace function ahoier_private.ahoier_leave_meetup_impl(p_meetup_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  delete from public.ahoier_meetup_rsvps r
  where r.meetup_id = p_meetup_id and r.user_id = auth.uid();
end;
$$;
create or replace function public.ahoier_leave_meetup(p_meetup_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_leave_meetup_impl(p_meetup_id);
$$;

create or replace function ahoier_private.ahoier_update_meetup_impl(
  p_meetup_id uuid, p_title text, p_description text, p_location_label text,
  p_starts_at timestamptz, p_time_zone text, p_capacity integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_meetup public.ahoier_meetups%rowtype;
begin
  select * into v_meetup from public.ahoier_meetups where id = p_meetup_id for update;
  if not found or v_meetup.organizer_id <> auth.uid()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or v_meetup.hidden_at is not null or v_meetup.canceled_at is not null
    or v_meetup.starts_at <= pg_catalog.now() then
    raise exception 'Meetup cannot be changed' using errcode = '42501';
  end if;
  if not ahoier_private.ahoier_validate_meetup_time(v_meetup.voyage_id, p_starts_at, p_time_zone)
    or p_capacity < 1 + (select count(*) from public.ahoier_meetup_rsvps r
      where r.meetup_id = p_meetup_id) then
    raise exception 'Invalid time or fewer places than current attendees' using errcode = '22023';
  end if;
  update public.ahoier_meetups
  set title = p_title, description = p_description, location_label = p_location_label,
    starts_at = p_starts_at, time_zone = p_time_zone, capacity = p_capacity,
    updated_at = pg_catalog.now()
  where id = p_meetup_id;
end;
$$;
create or replace function public.ahoier_update_meetup(
  p_meetup_id uuid, p_title text, p_description text, p_location_label text,
  p_starts_at timestamptz, p_time_zone text, p_capacity integer)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_update_meetup_impl(p_meetup_id, p_title, p_description,
    p_location_label, p_starts_at, p_time_zone, p_capacity);
$$;

create or replace function ahoier_private.ahoier_cancel_meetup_impl(p_meetup_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_meetup public.ahoier_meetups%rowtype;
begin
  select * into v_meetup from public.ahoier_meetups where id = p_meetup_id for update;
  if not found or v_meetup.organizer_id <> auth.uid()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or v_meetup.hidden_at is not null then
    raise exception 'Meetup cannot be canceled' using errcode = '42501';
  end if;
  if v_meetup.canceled_at is null then
    update public.ahoier_meetups set canceled_at = pg_catalog.now(),
      updated_at = pg_catalog.now() where id = p_meetup_id;
  end if;
end;
$$;
create or replace function public.ahoier_cancel_meetup(p_meetup_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_cancel_meetup_impl(p_meetup_id);
$$;

create or replace function ahoier_private.ahoier_meetup_summary_impl(p_voyage_id uuid)
returns table (id uuid, voyage_id uuid, organizer_id uuid, title text, description text,
  location_label text, starts_at timestamptz, time_zone text, capacity integer,
  created_at timestamptz, updated_at timestamptz, canceled_at timestamptz,
  attendee_count bigint, joined_by_me boolean)
language sql stable security definer set search_path = '' as $$
  with available as (
    (select meet.id from public.ahoier_meetups meet
      where meet.voyage_id = p_voyage_id and meet.starts_at >= pg_catalog.now()
        and meet.canceled_at is null and meet.hidden_at is null
      order by meet.starts_at, meet.id limit 100)
    union all
    (select meet.id from public.ahoier_meetups meet
      where meet.voyage_id = p_voyage_id and meet.starts_at >= pg_catalog.now()
        and meet.canceled_at is not null and meet.hidden_at is null
        and meet.updated_at >= pg_catalog.now() - interval '1 day'
      order by meet.updated_at desc, meet.id limit 20)
  )
  select meet.id, meet.voyage_id, meet.organizer_id, meet.title, meet.description,
    meet.location_label, meet.starts_at, meet.time_zone, meet.capacity,
    meet.created_at, meet.updated_at, meet.canceled_at,
    1 + (select count(*) from public.ahoier_meetup_rsvps r where r.meetup_id = meet.id),
    meet.organizer_id = (select auth.uid()) or exists (
      select 1 from public.ahoier_meetup_rsvps r
      where r.meetup_id = meet.id and r.user_id = (select auth.uid()))
  from available
  join public.ahoier_meetups meet on meet.id = available.id
  where ahoier_private.ahoier_can_view_meetup(meet.id)
  order by meet.starts_at, meet.id;
$$;
create or replace function public.ahoier_meetup_summary(p_voyage_id uuid)
returns table (id uuid, voyage_id uuid, organizer_id uuid, title text, description text,
  location_label text, starts_at timestamptz, time_zone text, capacity integer,
  created_at timestamptz, updated_at timestamptz, canceled_at timestamptz,
  attendee_count bigint, joined_by_me boolean)
language sql stable security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_meetup_summary_impl(p_voyage_id);
$$;

create or replace function ahoier_private.ahoier_meetup_attendees_impl(p_meetup_id uuid)
returns table (user_id uuid, display_name text, is_organizer boolean)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.user_id = meet.organizer_id
  from public.ahoier_meetups meet
  join public.ahoier_profiles p on p.user_id = meet.organizer_id
    or exists (select 1 from public.ahoier_meetup_rsvps r
      where r.meetup_id = meet.id and r.user_id = p.user_id)
  where meet.id = p_meetup_id and ahoier_private.ahoier_can_view_meetup(meet.id)
    and ahoier_private.ahoier_is_active(p.user_id)
    and not ahoier_private.ahoier_is_blocked((select auth.uid()), p.user_id)
  order by (p.user_id = meet.organizer_id) desc, p.display_name, p.user_id;
$$;
create or replace function public.ahoier_meetup_attendees(p_meetup_id uuid)
returns table (user_id uuid, display_name text, is_organizer boolean)
language sql stable security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_meetup_attendees_impl(p_meetup_id);
$$;

-- Extend existing report moderation. A report keeps the real target snapshot
-- even if the host later changes or cancels the meetup.
alter table public.ahoier_reports add column if not exists meetup_id uuid;
alter table public.ahoier_reports drop constraint if exists ahoier_reports_one_target_check;
alter table public.ahoier_reports add constraint ahoier_reports_one_target_check
  check (pg_catalog.num_nonnulls(post_id, reply_id, story_id, message_id, profile_id, meetup_id) = 1);
create unique index if not exists ahoier_reports_once_per_meetup_idx on public.ahoier_reports (meetup_id, reporter_id)
  where meetup_id is not null;
grant insert (meetup_id) on public.ahoier_reports to authenticated;

drop policy if exists ahoier_reports_insert_visible_target on public.ahoier_reports;
create policy ahoier_reports_insert_visible_target on public.ahoier_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and (
      (post_id is not null and ahoier_private.ahoier_can_view_post(post_id)
        and exists (select 1 from public.ahoier_posts p where p.id = post_id and p.author_id <> (select auth.uid())))
      or (reply_id is not null and ahoier_private.ahoier_can_view_reply(reply_id)
        and exists (select 1 from public.ahoier_replies r where r.id = reply_id and r.author_id <> (select auth.uid())))
      or (story_id is not null and ahoier_private.ahoier_can_view_story(story_id)
        and exists (select 1 from public.ahoier_stories s where s.id = story_id and s.author_id <> (select auth.uid())))
      or (message_id is not null and exists (
        select 1 from public.ahoier_messages msg
        where msg.id = message_id and msg.recipient_id = (select auth.uid())
          and msg.hidden_at is null and msg.recipient_removed_at is null))
      or (profile_id is not null and profile_id <> (select auth.uid())
        and ahoier_private.ahoier_can_view_profile(profile_id)
        and ahoier_private.ahoier_share_voyage(profile_id))
      or (meetup_id is not null and ahoier_private.ahoier_can_view_meetup(meetup_id)
        and exists (select 1 from public.ahoier_meetups meet
          where meet.id = meetup_id and meet.organizer_id <> (select auth.uid())))
    )
  );

create or replace function ahoier_private.ahoier_capture_report_target()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_body text;
  v_voyage uuid;
  v_author uuid;
  v_paths text[] := '{}';
begin
  if pg_catalog.num_nonnulls(new.post_id, new.reply_id, new.story_id,
      new.message_id, new.profile_id, new.meetup_id) <> 1
    or not ahoier_private.ahoier_is_active(auth.uid()) then
    raise exception 'Choose one visible report target' using errcode = '22023';
  end if;
  if new.post_id is not null then
    select p.body, p.voyage_id, p.author_id into v_body, v_voyage, v_author
    from public.ahoier_posts p where p.id = new.post_id and p.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_post(p.id) for share of p;
    select coalesce(array_agg(ph.path order by ph.slot), '{}') into v_paths
    from public.ahoier_post_photos ph where ph.post_id = new.post_id;
  elsif new.reply_id is not null then
    select r.body, p.voyage_id, r.author_id into v_body, v_voyage, v_author
    from public.ahoier_replies r join public.ahoier_posts p on p.id = r.post_id
    where r.id = new.reply_id and r.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_reply(r.id) for share of r, p;
    select coalesce(array_agg(ph.path), '{}') into v_paths
    from public.ahoier_reply_photos ph where ph.reply_id = new.reply_id;
  elsif new.story_id is not null then
    select s.caption, s.voyage_id, s.author_id,
      case when s.photo_path is null then '{}'::text[] else array[s.photo_path] end
    into v_body, v_voyage, v_author, v_paths
    from public.ahoier_stories s where s.id = new.story_id and s.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_story(s.id) for share of s;
  elsif new.message_id is not null then
    select msg.body, msg.sender_id into v_body, v_author
    from public.ahoier_messages msg where msg.id = new.message_id
      and msg.recipient_id = auth.uid() and msg.recipient_removed_at is null
      and msg.hidden_at is null for share of msg;
    v_voyage := null;
  elsif new.profile_id is not null then
    select p.display_name, p.user_id,
      case when p.avatar_path is null then '{}'::text[] else array[p.avatar_path] end
    into v_body, v_author, v_paths
    from public.ahoier_profiles p where p.user_id = new.profile_id
      and p.user_id <> auth.uid() and ahoier_private.ahoier_can_view_profile(p.user_id)
      and ahoier_private.ahoier_share_voyage(p.user_id) for share of p;
    select mine.voyage_id into v_voyage
    from public.ahoier_memberships mine
    join public.ahoier_memberships theirs on theirs.voyage_id = mine.voyage_id
    where mine.user_id = auth.uid() and theirs.user_id = new.profile_id
    order by mine.voyage_id limit 1;
  else
    select pg_catalog.concat_ws(' | ', meet.title, meet.description, meet.location_label),
      meet.voyage_id, meet.organizer_id into v_body, v_voyage, v_author
    from public.ahoier_meetups meet where meet.id = new.meetup_id
      and meet.organizer_id <> auth.uid()
      and ahoier_private.ahoier_can_view_meetup(meet.id) for share of meet;
  end if;
  if v_author is null then
    raise exception 'Report target is not available' using errcode = '42501';
  end if;
  new.target_body := v_body;
  new.target_voyage_id := v_voyage;
  new.target_author_id := v_author;
  new.target_photo_paths := coalesce(v_paths, '{}');
  return new;
end;
$$;

create or replace function ahoier_private.ahoier_moderate_report_impl(p_report_id uuid, p_action text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_report public.ahoier_reports%rowtype;
begin
  if not ahoier_private.ahoier_is_moderator()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or p_action not in ('dismiss', 'hide', 'suspend') then
    raise exception 'Moderation not allowed' using errcode = '42501';
  end if;
  select * into v_report from public.ahoier_reports
  where id = p_report_id and status = 'open' for update;
  if not found then
    raise exception 'Report is not open' using errcode = '22023';
  end if;
  if p_action <> 'dismiss' then
    if v_report.post_id is not null then
      update public.ahoier_posts set hidden_at = coalesce(hidden_at, now()) where id = v_report.post_id;
    elsif v_report.reply_id is not null then
      update public.ahoier_replies set hidden_at = coalesce(hidden_at, now()) where id = v_report.reply_id;
    elsif v_report.story_id is not null then
      update public.ahoier_stories set hidden_at = coalesce(hidden_at, now()) where id = v_report.story_id;
    elsif v_report.message_id is not null then
      update public.ahoier_messages set hidden_at = coalesce(hidden_at, now()) where id = v_report.message_id;
    elsif v_report.meetup_id is not null then
      update public.ahoier_meetups set hidden_at = coalesce(hidden_at, now()),
        canceled_at = coalesce(canceled_at, now()) where id = v_report.meetup_id;
    else
      update public.ahoier_profiles set suspended_at = coalesce(suspended_at, now())
      where user_id = v_report.profile_id;
    end if;
  end if;
  if p_action = 'suspend' then
    update public.ahoier_profiles set suspended_at = coalesce(suspended_at, now())
    where user_id = v_report.target_author_id;
  end if;
  update public.ahoier_reports
  set status = case p_action when 'dismiss' then 'dismissed'
    when 'hide' then 'hidden' else 'suspended' end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_report_id;
end;
$$;

-- Existing notifications deliver schedule changes and cancellations to users
-- who joined. They contain a target ID only; the event details stay in meetup.
alter table public.ahoier_notifications add column if not exists meetup_id uuid
  references public.ahoier_meetups(id) on delete cascade;
alter table public.ahoier_notifications drop constraint if exists ahoier_notifications_kind_check;
alter table public.ahoier_notifications add constraint ahoier_notifications_kind_check
  check (kind in ('friend_request', 'friend_accepted', 'reply', 'reaction', 'message',
    'meetup_changed', 'meetup_canceled', 'meetup_removed'));
alter table public.ahoier_notifications drop constraint if exists ahoier_notification_shape_check;
alter table public.ahoier_notifications add constraint ahoier_notification_shape_check check (
  (kind in ('friend_request', 'friend_accepted') and friend_request_id is not null
    and post_id is null and reply_id is null and message_id is null and voyage_id is null and meetup_id is null)
  or (kind = 'reply' and post_id is not null and reply_id is not null
    and voyage_id is not null and friend_request_id is null and message_id is null and meetup_id is null)
  or (kind = 'reaction' and post_id is not null and voyage_id is not null
    and friend_request_id is null and message_id is null and meetup_id is null)
  or (kind = 'message' and message_id is not null and post_id is null
    and reply_id is null and friend_request_id is null and voyage_id is null and meetup_id is null)
  or (kind in ('meetup_changed', 'meetup_canceled', 'meetup_removed') and meetup_id is not null
    and voyage_id is not null and post_id is null and reply_id is null
    and friend_request_id is null and message_id is null)
);

create or replace function ahoier_private.ahoier_meetup_notification_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ahoier_notifications n
    join public.ahoier_meetups meet on meet.id = n.meetup_id
    join public.ahoier_meetup_rsvps r on r.meetup_id = meet.id and r.user_id = n.recipient_id
    where n.id = p_id and n.recipient_id = (select auth.uid())
      and n.kind in ('meetup_changed', 'meetup_canceled', 'meetup_removed')
      and n.actor_id = meet.organizer_id and n.voyage_id = meet.voyage_id
      and n.created_at >= pg_catalog.now() - interval '30 days'
      and (ahoier_private.ahoier_can_view_meetup(meet.id)
        or (n.kind = 'meetup_removed' and meet.hidden_at is not null
          and ahoier_private.ahoier_is_active(n.recipient_id)
          and exists (select 1 from public.ahoier_memberships member
            where member.voyage_id = meet.voyage_id and member.user_id = n.recipient_id))));
$$;
drop policy if exists ahoier_notifications_read_meetup on public.ahoier_notifications;
create policy ahoier_notifications_read_meetup on public.ahoier_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and ahoier_private.ahoier_meetup_notification_visible(id));
drop policy if exists ahoier_notifications_mark_read_meetup on public.ahoier_notifications;
create policy ahoier_notifications_mark_read_meetup on public.ahoier_notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())
    and ahoier_private.ahoier_meetup_notification_visible(id))
  with check (recipient_id = (select auth.uid())
    and ahoier_private.ahoier_meetup_notification_visible(id));

create or replace function ahoier_private.ahoier_notify_meetup_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
begin
  if old.hidden_at is null and new.hidden_at is not null then
    v_kind := 'meetup_removed';
  elsif old.canceled_at is null and new.canceled_at is not null then
    v_kind := 'meetup_canceled';
  elsif new.hidden_at is null and new.canceled_at is null and
    (old.title, old.description, old.location_label, old.starts_at,
     old.time_zone, old.capacity) is distinct from
    (new.title, new.description, new.location_label, new.starts_at,
     new.time_zone, new.capacity) then
    v_kind := 'meetup_changed';
  else
    return new;
  end if;
  delete from public.ahoier_notifications n
  where n.meetup_id = new.id and n.kind in ('meetup_changed', 'meetup_canceled', 'meetup_removed');
  insert into public.ahoier_notifications
    (recipient_id, actor_id, kind, meetup_id, voyage_id)
  select r.user_id, new.organizer_id, v_kind, new.id, new.voyage_id
  from public.ahoier_meetup_rsvps r where r.meetup_id = new.id
    and ahoier_private.ahoier_is_active(r.user_id)
    and not ahoier_private.ahoier_is_blocked(r.user_id, new.organizer_id);
  return new;
end;
$$;
drop trigger if exists ahoier_meetups_notify_change on public.ahoier_meetups;
create trigger ahoier_meetups_notify_change
  after update on public.ahoier_meetups for each row
  execute function ahoier_private.ahoier_notify_meetup_change();

-- A suspension or withdrawn adult confirmation must not leave an inactive
-- organizer's meetup open or an inactive guest holding a place. Hiding the
-- meetup sends a generic removal notice to its remaining attendees.
create or replace function ahoier_private.ahoier_remove_suspended_meetup_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.suspended_at is null and new.suspended_at is not null)
    or (old.adult_confirmed_at is not null and new.adult_confirmed_at is null) then
    update public.ahoier_meetups meet
    set hidden_at = coalesce(meet.hidden_at, pg_catalog.now()),
      canceled_at = coalesce(meet.canceled_at, pg_catalog.now())
    where meet.organizer_id = new.user_id and meet.starts_at >= pg_catalog.now()
      and meet.hidden_at is null;
    delete from public.ahoier_meetup_rsvps r where r.user_id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists ahoier_profiles_remove_suspended_meetup_access on public.ahoier_profiles;
create trigger ahoier_profiles_remove_suspended_meetup_access
  after update of suspended_at, adult_confirmed_at on public.ahoier_profiles for each row
  execute function ahoier_private.ahoier_remove_suspended_meetup_access();

revoke execute on function
  ahoier_private.ahoier_can_view_meetup(uuid),
  ahoier_private.ahoier_validate_meetup_time(uuid, timestamptz, text),
  ahoier_private.ahoier_create_meetup_impl(uuid, text, text, text, timestamptz, text, integer),
  ahoier_private.ahoier_rsvp_meetup_impl(uuid),
  ahoier_private.ahoier_leave_meetup_impl(uuid),
  ahoier_private.ahoier_update_meetup_impl(uuid, text, text, text, timestamptz, text, integer),
  ahoier_private.ahoier_cancel_meetup_impl(uuid),
  ahoier_private.ahoier_meetup_summary_impl(uuid),
  ahoier_private.ahoier_meetup_attendees_impl(uuid),
  ahoier_private.ahoier_remove_blocked_meetup_rsvps(),
  ahoier_private.ahoier_meetup_notification_visible(uuid),
  ahoier_private.ahoier_notify_meetup_change(),
  ahoier_private.ahoier_remove_suspended_meetup_access()
from public, anon, authenticated, service_role;
grant execute on function
  ahoier_private.ahoier_can_view_meetup(uuid),
  ahoier_private.ahoier_validate_meetup_time(uuid, timestamptz, text),
  ahoier_private.ahoier_create_meetup_impl(uuid, text, text, text, timestamptz, text, integer),
  ahoier_private.ahoier_rsvp_meetup_impl(uuid),
  ahoier_private.ahoier_leave_meetup_impl(uuid),
  ahoier_private.ahoier_update_meetup_impl(uuid, text, text, text, timestamptz, text, integer),
  ahoier_private.ahoier_cancel_meetup_impl(uuid),
  ahoier_private.ahoier_meetup_summary_impl(uuid),
  ahoier_private.ahoier_meetup_attendees_impl(uuid),
  ahoier_private.ahoier_meetup_notification_visible(uuid)
to authenticated;
revoke execute on function
  public.ahoier_create_meetup(uuid, text, text, text, timestamptz, text, integer),
  public.ahoier_rsvp_meetup(uuid), public.ahoier_leave_meetup(uuid),
  public.ahoier_update_meetup(uuid, text, text, text, timestamptz, text, integer),
  public.ahoier_cancel_meetup(uuid), public.ahoier_meetup_summary(uuid),
  public.ahoier_meetup_attendees(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  public.ahoier_create_meetup(uuid, text, text, text, timestamptz, text, integer),
  public.ahoier_rsvp_meetup(uuid), public.ahoier_leave_meetup(uuid),
  public.ahoier_update_meetup(uuid, text, text, text, timestamptz, text, integer),
  public.ahoier_cancel_meetup(uuid), public.ahoier_meetup_summary(uuid),
  public.ahoier_meetup_attendees(uuid)
to authenticated;

notify pgrst, 'reload schema';
commit;
