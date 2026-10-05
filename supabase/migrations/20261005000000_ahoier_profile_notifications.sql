-- Real community profiles and in-app notifications. Apply after the social-wall
-- migration. Safe to rerun in the SQL Editor; no demo people or activity is added.
begin;

-- Bio and interests use the existing profile RLS: only the owner, a currently
-- visible fellow traveller/friend, or a moderator can read these fields.
create or replace function ahoier_private.ahoier_interests_valid(p_interests text[])
returns boolean language sql immutable set search_path = '' as $$
  select p_interests is not null
    and pg_catalog.cardinality(p_interests) <= 5
    and p_interests <@ array[
      'Kaffee', 'Kulinarik', 'Landgang', 'Musik', 'Sport', 'Kultur',
      'Fotografie', 'Spiele', 'Wellness', 'Familie', 'Natur', 'Tanzen'
    ]::text[]
    and pg_catalog.cardinality(p_interests) = (
      select pg_catalog.count(distinct interest)
      from pg_catalog.unnest(p_interests) as item(interest)
    );
$$;
revoke execute on function ahoier_private.ahoier_interests_valid(text[])
  from public, anon, authenticated, service_role;
grant execute on function ahoier_private.ahoier_interests_valid(text[])
  to authenticated, service_role;

alter table public.ahoier_profiles
  add column if not exists bio text not null default '',
  add column if not exists interests text[] not null default '{}'::text[];
alter table public.ahoier_profiles
  drop constraint if exists ahoier_profile_bio_check,
  drop constraint if exists ahoier_profile_interests_check;
alter table public.ahoier_profiles
  add constraint ahoier_profile_bio_check check (
    bio = pg_catalog.btrim(bio)
    and pg_catalog.char_length(bio) <= 160
    and bio !~ '[[:cntrl:]]'
  ),
  add constraint ahoier_profile_interests_check check (
    ahoier_private.ahoier_interests_valid(interests)
  );
grant select (bio, interests), update (bio, interests)
  on public.ahoier_profiles to authenticated;

-- The onboarding RPC has a fixed RETURNS TABLE signature, so recreate both
-- layers in dependency order. Existing clients can ignore the two new fields.
drop function if exists public.ahoier_my_profile();
drop function if exists ahoier_private.ahoier_my_profile_impl();
create function ahoier_private.ahoier_my_profile_impl()
returns table(user_id uuid, display_name text, avatar_path text,
  adult_confirmed_at timestamptz, suspended_at timestamptz,
  bio text, interests text[])
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.avatar_path,
    p.adult_confirmed_at, p.suspended_at, p.bio, p.interests
  from public.ahoier_profiles p where p.user_id = (select auth.uid());
$$;
create function public.ahoier_my_profile()
returns table(user_id uuid, display_name text, avatar_path text,
  adult_confirmed_at timestamptz, suspended_at timestamptz,
  bio text, interests text[])
language sql stable security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_my_profile_impl();
$$;
revoke execute on function ahoier_private.ahoier_my_profile_impl()
  from public, anon, authenticated, service_role;
revoke execute on function public.ahoier_my_profile()
  from public, anon, authenticated, service_role;
grant execute on function ahoier_private.ahoier_my_profile_impl(),
  public.ahoier_my_profile() to authenticated;

-- Notifications hold IDs and event type only. In particular, the body of a
-- private message is never copied into a notification or exposed through it.
create table if not exists public.ahoier_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  recipient_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  actor_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  kind text not null check (kind in
    ('friend_request', 'friend_accepted', 'reply', 'reaction', 'message')),
  post_id uuid references public.ahoier_posts(id) on delete cascade,
  reply_id uuid references public.ahoier_replies(id) on delete cascade,
  friend_request_id uuid references public.ahoier_friend_requests(id) on delete cascade,
  message_id uuid references public.ahoier_messages(id) on delete cascade,
  voyage_id uuid references public.ahoier_voyages(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  constraint ahoier_notification_not_self_check check (recipient_id <> actor_id),
  constraint ahoier_notification_shape_check check (
    (kind in ('friend_request', 'friend_accepted') and friend_request_id is not null
      and post_id is null and reply_id is null and message_id is null and voyage_id is null)
    or (kind = 'reply' and post_id is not null and reply_id is not null
      and voyage_id is not null and friend_request_id is null and message_id is null)
    or (kind = 'reaction' and post_id is not null and voyage_id is not null
      and friend_request_id is null and message_id is null)
    or (kind = 'message' and message_id is not null and post_id is null
      and reply_id is null and friend_request_id is null and voyage_id is null)
  )
);
create index if not exists ahoier_notifications_recipient_created_idx
  on public.ahoier_notifications (recipient_id, created_at desc);
create index if not exists ahoier_notifications_unread_idx
  on public.ahoier_notifications (recipient_id, created_at desc) where read_at is null;
create unique index if not exists ahoier_notifications_request_once_idx
  on public.ahoier_notifications (recipient_id, kind, friend_request_id)
  where friend_request_id is not null;
create unique index if not exists ahoier_notifications_reply_once_idx
  on public.ahoier_notifications (recipient_id, kind, reply_id)
  where kind = 'reply';
create unique index if not exists ahoier_notifications_post_reaction_once_idx
  on public.ahoier_notifications (recipient_id, actor_id, post_id)
  where kind = 'reaction' and reply_id is null;
create unique index if not exists ahoier_notifications_reply_reaction_once_idx
  on public.ahoier_notifications (recipient_id, actor_id, reply_id)
  where kind = 'reaction' and reply_id is not null;
create unique index if not exists ahoier_notifications_message_once_idx
  on public.ahoier_notifications (recipient_id, message_id)
  where kind = 'message';
alter table public.ahoier_notifications enable row level security;
revoke all on public.ahoier_notifications from public, anon, authenticated;

-- The function runs as the migration owner to inspect private reaction rows,
-- but returns true only for the authenticated recipient. It rechecks the live
-- target, voyage access and blocks whenever a notification is listed.
create or replace function ahoier_private.ahoier_notification_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_notifications n
    where n.id = p_id and n.recipient_id = (select auth.uid())
      and ahoier_private.ahoier_is_active(n.recipient_id)
      and ahoier_private.ahoier_is_active(n.actor_id)
      and not ahoier_private.ahoier_is_blocked(n.recipient_id, n.actor_id)
      and ahoier_private.ahoier_can_view_profile(n.actor_id)
      and (
        (n.kind = 'friend_request' and exists (
          select 1 from public.ahoier_friend_requests f
          where f.id = n.friend_request_id and f.status = 'pending'
            and f.requester_id = n.actor_id and f.recipient_id = n.recipient_id
            and ahoier_private.ahoier_share_voyage(n.actor_id)
        ))
        or (n.kind = 'friend_accepted' and exists (
          select 1 from public.ahoier_friend_requests f
          where f.id = n.friend_request_id and f.status = 'accepted'
            and f.requester_id = n.recipient_id and f.recipient_id = n.actor_id
        ))
        or (n.kind = 'reply' and exists (
          select 1 from public.ahoier_replies r
          join public.ahoier_posts p on p.id = r.post_id
          where r.id = n.reply_id and p.id = n.post_id
            and p.voyage_id = n.voyage_id and p.author_id = n.recipient_id
            and r.author_id = n.actor_id
            and ahoier_private.ahoier_can_view_reply(r.id)
        ))
        or (n.kind = 'reaction' and exists (
          select 1 from public.ahoier_reactions react
          join public.ahoier_posts p on p.id = n.post_id
          left join public.ahoier_replies r on r.id = n.reply_id
          where react.user_id = n.actor_id and p.voyage_id = n.voyage_id
            and ((n.reply_id is null and react.post_id = p.id
                and p.author_id = n.recipient_id
                and ahoier_private.ahoier_can_view_post(p.id))
              or (n.reply_id is not null and react.reply_id = r.id
                and r.post_id = p.id and r.author_id = n.recipient_id
                and ahoier_private.ahoier_can_view_reply(r.id)))
        ))
        or (n.kind = 'message' and exists (
          select 1 from public.ahoier_messages m
          where m.id = n.message_id and m.sender_id = n.actor_id
            and m.recipient_id = n.recipient_id and m.hidden_at is null
            and m.recipient_removed_at is null
        ))
      )
  );
$$;
revoke execute on function ahoier_private.ahoier_notification_visible(uuid)
  from public, anon, authenticated, service_role;
grant execute on function ahoier_private.ahoier_notification_visible(uuid) to authenticated;

drop policy if exists ahoier_notifications_read_own on public.ahoier_notifications;
create policy ahoier_notifications_read_own on public.ahoier_notifications
  for select to authenticated
  using (recipient_id = (select auth.uid())
    and ahoier_private.ahoier_notification_visible(id));
drop policy if exists ahoier_notifications_mark_read_own on public.ahoier_notifications;
create policy ahoier_notifications_mark_read_own on public.ahoier_notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())
    and ahoier_private.ahoier_notification_visible(id))
  with check (recipient_id = (select auth.uid())
    and ahoier_private.ahoier_notification_visible(id));
grant select on public.ahoier_notifications to authenticated;
grant update (read_at) on public.ahoier_notifications to authenticated;

create or replace function ahoier_private.ahoier_notify_friend_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.requester_id = auth.uid()
      and ahoier_private.ahoier_is_active(new.requester_id)
      and ahoier_private.ahoier_is_active(new.recipient_id)
      and not ahoier_private.ahoier_is_blocked(new.requester_id, new.recipient_id)
      and ahoier_private.ahoier_share_voyage(new.recipient_id) then
      insert into public.ahoier_notifications
        (recipient_id, actor_id, kind, friend_request_id)
      values (new.recipient_id, new.requester_id, 'friend_request', new.id)
      on conflict do nothing;
    end if;
  elsif old.status = 'pending' and new.status <> 'pending' then
    delete from public.ahoier_notifications n
    where n.friend_request_id = new.id and n.kind = 'friend_request';
    if new.status = 'accepted' and new.recipient_id = auth.uid()
      and ahoier_private.ahoier_is_active(new.requester_id)
      and ahoier_private.ahoier_is_active(new.recipient_id)
      and not ahoier_private.ahoier_is_blocked(new.requester_id, new.recipient_id) then
      insert into public.ahoier_notifications
        (recipient_id, actor_id, kind, friend_request_id)
      values (new.requester_id, new.recipient_id, 'friend_accepted', new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ahoier_notify_friend_request on public.ahoier_friend_requests;
create trigger ahoier_notify_friend_request
  after insert or update of status on public.ahoier_friend_requests
  for each row execute function ahoier_private.ahoier_notify_friend_request();

-- Both a text-only INSERT and publishing a photo draft must notify exactly
-- once. The author and post owner must still share the voyage at that moment.
create or replace function ahoier_private.ahoier_notify_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post public.ahoier_posts%rowtype;
begin
  if new.published_at is null or new.hidden_at is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if old.published_at is not null then return new; end if;
  end if;
  if auth.uid() is null or new.author_id <> auth.uid() then return new; end if;

  select * into v_post from public.ahoier_posts p where p.id = new.post_id;
  if not found or v_post.author_id = new.author_id
    or v_post.hidden_at is not null or v_post.published_at is null
    or not ahoier_private.ahoier_is_active(new.author_id)
    or not ahoier_private.ahoier_is_active(v_post.author_id)
    or ahoier_private.ahoier_is_blocked(new.author_id, v_post.author_id)
    or not exists (select 1 from public.ahoier_memberships m
      where m.user_id = new.author_id and m.voyage_id = v_post.voyage_id)
    or not exists (select 1 from public.ahoier_memberships m
      where m.user_id = v_post.author_id and m.voyage_id = v_post.voyage_id) then
    return new;
  end if;
  insert into public.ahoier_notifications
    (recipient_id, actor_id, kind, post_id, reply_id, voyage_id)
  values (v_post.author_id, new.author_id, 'reply', v_post.id, new.id, v_post.voyage_id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists ahoier_notify_reply on public.ahoier_replies;
create trigger ahoier_notify_reply
  after insert or update of published_at on public.ahoier_replies
  for each row execute function ahoier_private.ahoier_notify_reply();

-- A changed emoji replaces the reaction row in the existing RPC. Keep one
-- notification per actor/target, reopening it at most once per day so repeated
-- toggles cannot flood the owner or make a much later reaction invisible.
create or replace function ahoier_private.ahoier_notify_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post_id uuid;
  v_voyage_id uuid;
  v_published_at timestamptz;
  v_hidden_at timestamptz;
  v_recipient uuid;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then return new; end if;
  if new.reply_id is not null then
    select p.id, p.voyage_id, p.published_at, p.hidden_at, r.author_id
    into v_post_id, v_voyage_id, v_published_at, v_hidden_at, v_recipient
    from public.ahoier_replies r
    join public.ahoier_posts p on p.id = r.post_id
    where r.id = new.reply_id and r.published_at is not null
      and r.hidden_at is null;
  else
    select p.id, p.voyage_id, p.published_at, p.hidden_at, p.author_id
    into v_post_id, v_voyage_id, v_published_at, v_hidden_at, v_recipient
    from public.ahoier_posts p where p.id = new.post_id;
  end if;
  if not found or v_recipient = new.user_id
    or v_hidden_at is not null or v_published_at is null
    or not ahoier_private.ahoier_is_active(new.user_id)
    or not ahoier_private.ahoier_is_active(v_recipient)
    or ahoier_private.ahoier_is_blocked(new.user_id, v_recipient)
    or not exists (select 1 from public.ahoier_memberships m
      where m.user_id = new.user_id and m.voyage_id = v_voyage_id)
    or not exists (select 1 from public.ahoier_memberships m
      where m.user_id = v_recipient and m.voyage_id = v_voyage_id) then
    return new;
  end if;
  if new.reply_id is null then
    insert into public.ahoier_notifications
      (recipient_id, actor_id, kind, post_id, voyage_id)
    values (v_recipient, new.user_id, 'reaction', v_post_id, v_voyage_id)
    on conflict (recipient_id, actor_id, post_id)
      where kind = 'reaction' and reply_id is null
    do update set created_at = excluded.created_at, read_at = null
    where public.ahoier_notifications.created_at < pg_catalog.now() - interval '1 day';
  else
    insert into public.ahoier_notifications
      (recipient_id, actor_id, kind, post_id, reply_id, voyage_id)
    values (v_recipient, new.user_id, 'reaction', v_post_id, new.reply_id, v_voyage_id)
    on conflict (recipient_id, actor_id, reply_id)
      where kind = 'reaction' and reply_id is not null
    do update set created_at = excluded.created_at, read_at = null
    where public.ahoier_notifications.created_at < pg_catalog.now() - interval '1 day';
  end if;
  return new;
end;
$$;
drop trigger if exists ahoier_notify_reaction on public.ahoier_reactions;
create trigger ahoier_notify_reaction
  after insert on public.ahoier_reactions
  for each row execute function ahoier_private.ahoier_notify_reaction();

create or replace function ahoier_private.ahoier_notify_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_id = auth.uid()
    and ahoier_private.ahoier_is_active(new.sender_id)
    and ahoier_private.ahoier_is_active(new.recipient_id)
    and not ahoier_private.ahoier_is_blocked(new.sender_id, new.recipient_id)
    and ahoier_private.ahoier_are_friends(new.sender_id, new.recipient_id) then
    insert into public.ahoier_notifications
      (recipient_id, actor_id, kind, message_id)
    values (new.recipient_id, new.sender_id, 'message', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists ahoier_notify_message on public.ahoier_messages;
create trigger ahoier_notify_message
  after insert on public.ahoier_messages
  for each row execute function ahoier_private.ahoier_notify_message();

-- A block clears the existing notices in both directions as well as hiding
-- future contact, so old notices do not reappear after an unblock.
create or replace function ahoier_private.ahoier_clear_blocked_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ahoier_notifications n
  where (n.recipient_id = new.blocker_id and n.actor_id = new.blocked_id)
     or (n.recipient_id = new.blocked_id and n.actor_id = new.blocker_id);
  return new;
end;
$$;
drop trigger if exists ahoier_clear_blocked_notifications on public.ahoier_blocks;
create trigger ahoier_clear_blocked_notifications
  after insert on public.ahoier_blocks
  for each row execute function ahoier_private.ahoier_clear_blocked_notifications();

revoke execute on function
  ahoier_private.ahoier_notify_friend_request(),
  ahoier_private.ahoier_notify_reply(),
  ahoier_private.ahoier_notify_reaction(),
  ahoier_private.ahoier_notify_message(),
  ahoier_private.ahoier_clear_blocked_notifications()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
