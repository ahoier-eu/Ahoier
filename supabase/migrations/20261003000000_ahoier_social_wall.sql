-- Additive social release for Ahoier. Apply after the two 20261001/02 migrations.
-- The application must use the publish RPCs for media drafts. Only a project
-- owner may populate ahoier_private.ahoier_moderators via the SQL editor.
begin;

alter table public.ahoier_profiles
  add column adult_confirmed_at timestamptz,
  add column avatar_path text,
  add column suspended_at timestamptz;
alter table public.ahoier_profiles add constraint ahoier_avatar_path_check check (
  avatar_path is null or (
    avatar_path like 'avatar/' || user_id::text || '/%.webp'
    and avatar_path ~ '^avatar/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.webp$'
  )
);

-- Existing text posts and replies stay published. A client creates a media
-- draft by explicitly inserting published_at = null, then uploads and publishes.
alter table public.ahoier_posts add column published_at timestamptz default now();
alter table public.ahoier_replies add column published_at timestamptz default now();
alter table public.ahoier_posts drop constraint ahoier_posts_body_check;
alter table public.ahoier_replies drop constraint ahoier_replies_body_check;
alter table public.ahoier_posts add constraint ahoier_posts_body_check check (
  char_length(body) <= 1000 and (body = '' or char_length(btrim(body)) > 0)
);
alter table public.ahoier_replies add constraint ahoier_replies_body_check check (
  char_length(body) <= 1000 and (body = '' or char_length(btrim(body)) > 0)
);

create table public.ahoier_post_photos (
  post_id uuid not null references public.ahoier_posts(id) on delete cascade,
  slot integer not null check (slot between 0 and 3),
  path text not null unique,
  primary key (post_id, slot)
);
create table public.ahoier_reply_photos (
  reply_id uuid primary key references public.ahoier_replies(id) on delete cascade,
  path text not null unique
);
create table public.ahoier_stories (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.ahoier_voyages(id) on delete cascade,
  author_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  caption text not null default '',
  photo_path text unique,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  hidden_at timestamptz,
  constraint ahoier_story_caption_check check (char_length(caption) <= 160),
  constraint ahoier_story_dates_check check (
    (published_at is null and expires_at is null) or
    (published_at is not null and expires_at is not null and expires_at = published_at + interval '24 hours')
  )
);
create index ahoier_stories_visible_idx on public.ahoier_stories (voyage_id, expires_at desc)
  where published_at is not null and hidden_at is null;
create index ahoier_posts_author_created_idx on public.ahoier_posts (author_id, created_at desc);
create index ahoier_replies_author_created_idx on public.ahoier_replies (author_id, created_at desc);
create index ahoier_stories_author_created_idx on public.ahoier_stories (author_id, created_at desc);

create table public.ahoier_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.ahoier_posts(id) on delete cascade,
  reply_id uuid references public.ahoier_replies(id) on delete cascade,
  user_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🎉')),
  created_at timestamptz not null default now(),
  constraint ahoier_reaction_target_check check (num_nonnulls(post_id, reply_id) = 1)
);
create unique index ahoier_reaction_post_once_idx on public.ahoier_reactions (post_id, user_id) where post_id is not null;
create unique index ahoier_reaction_reply_once_idx on public.ahoier_reactions (reply_id, user_id) where reply_id is not null;

create table public.ahoier_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  recipient_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint ahoier_friend_not_self_check check (requester_id <> recipient_id)
);
create unique index ahoier_friend_pair_idx on public.ahoier_friend_requests (
  least(requester_id, recipient_id), greatest(requester_id, recipient_id)
);
create index ahoier_friend_recipient_idx on public.ahoier_friend_requests (recipient_id, created_at desc);

-- A cancelled request still counts towards the daily contact limit. This
-- private ledger prevents cancelling and resending to evade that limit.
create table ahoier_private.ahoier_friend_request_attempts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ahoier_friend_request_attempts_user_idx
  on ahoier_private.ahoier_friend_request_attempts (requester_id, created_at desc);
alter table ahoier_private.ahoier_friend_request_attempts enable row level security;
revoke all on ahoier_private.ahoier_friend_request_attempts from public, anon, authenticated;

create table public.ahoier_blocks (
  blocker_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  blocked_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint ahoier_block_not_self_check check (blocker_id <> blocked_id)
);
create index ahoier_blocks_blocked_idx on public.ahoier_blocks (blocked_id, blocker_id);

create table public.ahoier_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  recipient_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and char_length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint ahoier_message_not_self_check check (sender_id <> recipient_id)
);
create index ahoier_messages_sender_recipient_idx on public.ahoier_messages (sender_id, recipient_id, created_at desc);
create index ahoier_messages_recipient_sender_idx on public.ahoier_messages (recipient_id, sender_id, created_at desc);

-- Reports survive deletion of the original row and retain a moderator-only
-- snapshot. No client may supply or change these snapshot fields.
alter table public.ahoier_reports
  add column story_id uuid,
  add column message_id uuid,
  add column profile_id uuid,
  add column target_photo_paths text[] not null default '{}',
  add column status text not null default 'open' check (status in ('open', 'dismissed', 'hidden', 'suspended')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id);
alter table public.ahoier_reports alter column target_voyage_id drop not null;
alter table public.ahoier_reports drop constraint ahoier_reports_one_target_check;
alter table public.ahoier_reports add constraint ahoier_reports_one_target_check
  check (num_nonnulls(post_id, reply_id, story_id, message_id, profile_id) = 1);
create unique index ahoier_reports_once_per_story_idx on public.ahoier_reports (story_id, reporter_id) where story_id is not null;
create unique index ahoier_reports_once_per_message_idx on public.ahoier_reports (message_id, reporter_id) where message_id is not null;
create unique index ahoier_reports_once_per_profile_idx on public.ahoier_reports (profile_id, reporter_id) where profile_id is not null;
create index ahoier_reports_open_idx on public.ahoier_reports (created_at desc) where status = 'open';

create table ahoier_private.ahoier_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table ahoier_private.ahoier_moderators enable row level security;
revoke all on ahoier_private.ahoier_moderators from public, anon, authenticated;

alter table public.ahoier_post_photos enable row level security;
alter table public.ahoier_reply_photos enable row level security;
alter table public.ahoier_stories enable row level security;
alter table public.ahoier_reactions enable row level security;
alter table public.ahoier_friend_requests enable row level security;
alter table public.ahoier_blocks enable row level security;
alter table public.ahoier_messages enable row level security;
revoke all on public.ahoier_post_photos, public.ahoier_reply_photos,
  public.ahoier_stories, public.ahoier_reactions,
  public.ahoier_friend_requests, public.ahoier_blocks,
  public.ahoier_messages from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ahoier-media', 'ahoier-media', false, 2097152, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/webp'];

alter table public.ahoier_messages
  add column sender_removed_at timestamptz,
  add column recipient_removed_at timestamptz;

-- SECURITY DEFINER helpers are private, fixed-search-path, and used only by
-- RLS/RPC entry points. They avoid recursive policies on memberships/profiles.
create function ahoier_private.ahoier_is_active(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_profiles p
    where p.user_id = p_user and p.adult_confirmed_at is not null
      and p.suspended_at is null
  );
$$;

-- Serialize creation by profile row to make daily/draft limits effective even
-- when a client submits several requests at once. Counts are global to the
-- account, not reset by switching voyage.
create function ahoier_private.ahoier_can_create_content(p_kind text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today bigint;
  v_drafts bigint;
begin
  perform 1 from public.ahoier_profiles p where p.user_id = v_user for update;
  if not found then return false; end if;
  if p_kind = 'post' then
    select count(*) into v_today from public.ahoier_posts p
    where p.author_id = v_user and p.created_at > now() - interval '1 day';
    select count(*) into v_drafts from public.ahoier_posts p
    where p.author_id = v_user and p.published_at is null and p.hidden_at is null;
    return v_today < 30 and v_drafts < 8;
  elsif p_kind = 'reply' then
    select count(*) into v_today from public.ahoier_replies r
    where r.author_id = v_user and r.created_at > now() - interval '1 day';
    select count(*) into v_drafts from public.ahoier_replies r
    where r.author_id = v_user and r.published_at is null and r.hidden_at is null;
    return v_today < 100 and v_drafts < 20;
  elsif p_kind = 'story' then
    select count(*) into v_today from public.ahoier_stories s
    where s.author_id = v_user and s.created_at > now() - interval '1 day';
    select count(*) into v_drafts from public.ahoier_stories s
    where s.author_id = v_user and s.published_at is null and s.hidden_at is null;
    return v_today < 12 and v_drafts < 5;
  end if;
  return false;
end;
$$;

create function ahoier_private.ahoier_is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from ahoier_private.ahoier_moderators m
    where m.user_id = (select auth.uid())
  );
$$;

create function ahoier_private.ahoier_is_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create function ahoier_private.ahoier_share_voyage(p_other uuid, p_voyage uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_memberships mine
    join public.ahoier_memberships theirs on theirs.voyage_id = mine.voyage_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_other
      and (p_voyage is null or mine.voyage_id = p_voyage)
  );
$$;

create function ahoier_private.ahoier_are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_friend_requests f
    where f.status = 'accepted'
      and ((f.requester_id = p_a and f.recipient_id = p_b)
        or (f.requester_id = p_b and f.recipient_id = p_a))
  );
$$;

create or replace function ahoier_private.ahoier_can_view_profile(p_other_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_other_user = (select auth.uid()) or (
    ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_is_active(p_other_user)
    and not ahoier_private.ahoier_is_blocked((select auth.uid()), p_other_user)
    and (
      ahoier_private.ahoier_share_voyage(p_other_user)
      or ahoier_private.ahoier_are_friends((select auth.uid()), p_other_user)
    )
  ) or (ahoier_private.ahoier_is_moderator()
    and ahoier_private.ahoier_is_active((select auth.uid())));
$$;

-- Directory rows reveal only name/avatar. Onboarding gets adult/suspension
-- state through this self-only RPC, not through a table-wide SELECT grant.
create function ahoier_private.ahoier_my_profile_impl()
returns table(user_id uuid, display_name text, avatar_path text,
  adult_confirmed_at timestamptz, suspended_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.avatar_path,
    p.adult_confirmed_at, p.suspended_at
  from public.ahoier_profiles p where p.user_id = (select auth.uid());
$$;
create function public.ahoier_my_profile()
returns table(user_id uuid, display_name text, avatar_path text,
  adult_confirmed_at timestamptz, suspended_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_my_profile_impl();
$$;

create function ahoier_private.ahoier_can_view_post(p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ahoier_private.ahoier_is_active((select auth.uid())) and exists (
    select 1 from public.ahoier_posts p
    join public.ahoier_memberships m on m.voyage_id = p.voyage_id
    where p.id = p_post and m.user_id = (select auth.uid())
      and p.published_at is not null and p.hidden_at is null
      and ahoier_private.ahoier_is_active(p.author_id)
      and not ahoier_private.ahoier_is_blocked((select auth.uid()), p.author_id)
  );
$$;

create function ahoier_private.ahoier_can_view_reply(p_reply uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ahoier_replies r
    where r.id = p_reply and r.published_at is not null and r.hidden_at is null
      and ahoier_private.ahoier_is_active(r.author_id)
      and not ahoier_private.ahoier_is_blocked((select auth.uid()), r.author_id)
      and ahoier_private.ahoier_can_view_post(r.post_id)
  );
$$;

create function ahoier_private.ahoier_can_view_story(p_story uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ahoier_private.ahoier_is_active((select auth.uid())) and exists (
    select 1 from public.ahoier_stories s
    join public.ahoier_memberships m on m.voyage_id = s.voyage_id
    where s.id = p_story and m.user_id = (select auth.uid())
      and s.published_at is not null and s.expires_at > now()
      and s.hidden_at is null and ahoier_private.ahoier_is_active(s.author_id)
      and not ahoier_private.ahoier_is_blocked((select auth.uid()), s.author_id)
  );
$$;

drop policy ahoier_profiles_read_shared on public.ahoier_profiles;
create policy ahoier_profiles_read_shared on public.ahoier_profiles
  for select to authenticated using (ahoier_private.ahoier_can_view_profile(user_id));

drop policy ahoier_memberships_insert_self on public.ahoier_memberships;
create policy ahoier_memberships_insert_self on public.ahoier_memberships
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and ahoier_private.ahoier_is_active((select auth.uid()))
  );
create policy ahoier_memberships_read_cotravelers on public.ahoier_memberships
  for select to authenticated using (
    ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_is_active(user_id)
    and not ahoier_private.ahoier_is_blocked((select auth.uid()), user_id)
    and ahoier_private.ahoier_share_voyage(user_id, voyage_id)
  );

drop policy ahoier_posts_read_member on public.ahoier_posts;
create policy ahoier_posts_read_member on public.ahoier_posts
  for select to authenticated using (
    ahoier_private.ahoier_can_view_post(id)
    or (author_id = (select auth.uid()) and published_at is null
      and ahoier_private.ahoier_is_active((select auth.uid())))
  );
drop policy ahoier_posts_insert_member on public.ahoier_posts;
create policy ahoier_posts_insert_member on public.ahoier_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_can_create_content('post')
    and hidden_at is null
    and (published_at is null or char_length(btrim(body)) > 0)
    and exists (select 1 from public.ahoier_memberships m
      where m.voyage_id = ahoier_posts.voyage_id
        and m.user_id = (select auth.uid()))
  );
drop policy ahoier_posts_delete_own on public.ahoier_posts;

drop policy ahoier_replies_read_member on public.ahoier_replies;
create policy ahoier_replies_read_member on public.ahoier_replies
  for select to authenticated using (
    ahoier_private.ahoier_can_view_reply(id)
    or (author_id = (select auth.uid()) and published_at is null
      and ahoier_private.ahoier_is_active((select auth.uid())))
  );
drop policy ahoier_replies_insert_member on public.ahoier_replies;
create policy ahoier_replies_insert_member on public.ahoier_replies
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_can_create_content('reply')
    and hidden_at is null
    and (published_at is null or char_length(btrim(body)) > 0)
    and ahoier_private.ahoier_can_view_post(post_id)
  );
drop policy ahoier_replies_delete_own on public.ahoier_replies;

create policy ahoier_post_photos_read on public.ahoier_post_photos
  for select to authenticated using (
    ahoier_private.ahoier_can_view_post(post_id)
    or exists (select 1 from public.ahoier_posts p where p.id = post_id
      and p.author_id = (select auth.uid()) and p.published_at is null
      and ahoier_private.ahoier_is_active((select auth.uid())))
  );
create policy ahoier_post_photos_insert on public.ahoier_post_photos
  for insert to authenticated with check (
    ahoier_private.ahoier_is_active((select auth.uid()))
    and exists (select 1 from public.ahoier_posts p
      where p.id = post_id and p.author_id = (select auth.uid())
        and p.published_at is null and p.hidden_at is null
        and path = 'post/' || p.voyage_id::text || '/' || p.id::text || '/' || slot::text || '.webp')
  );
create policy ahoier_post_photos_delete_draft on public.ahoier_post_photos
  for delete to authenticated using (
    exists (select 1 from public.ahoier_posts p
      where p.id = post_id and p.author_id = (select auth.uid()) and p.published_at is null)
  );

create policy ahoier_reply_photos_read on public.ahoier_reply_photos
  for select to authenticated using (
    ahoier_private.ahoier_can_view_reply(reply_id)
    or exists (select 1 from public.ahoier_replies r where r.id = reply_id
      and r.author_id = (select auth.uid()) and r.published_at is null
      and ahoier_private.ahoier_is_active((select auth.uid())))
  );
create policy ahoier_reply_photos_insert on public.ahoier_reply_photos
  for insert to authenticated with check (
    ahoier_private.ahoier_is_active((select auth.uid()))
    and exists (select 1 from public.ahoier_replies r
      join public.ahoier_posts p on p.id = r.post_id
      where r.id = reply_id and r.author_id = (select auth.uid())
        and r.published_at is null and r.hidden_at is null
        and path = 'reply/' || p.voyage_id::text || '/' || r.id::text || '/0.webp')
  );
create policy ahoier_reply_photos_delete_draft on public.ahoier_reply_photos
  for delete to authenticated using (
    exists (select 1 from public.ahoier_replies r
      where r.id = reply_id and r.author_id = (select auth.uid()) and r.published_at is null)
  );

create policy ahoier_stories_read on public.ahoier_stories
  for select to authenticated using (
    ahoier_private.ahoier_can_view_story(id)
    or (author_id = (select auth.uid()) and published_at is null
      and ahoier_private.ahoier_is_active((select auth.uid())))
  );
create policy ahoier_stories_insert on public.ahoier_stories
  for insert to authenticated with check (
    author_id = (select auth.uid()) and published_at is null
    and expires_at is null and photo_path is null and hidden_at is null
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_can_create_content('story')
    and exists (select 1 from public.ahoier_memberships m
      where m.voyage_id = ahoier_stories.voyage_id
        and m.user_id = (select auth.uid()))
  );
create policy ahoier_stories_set_photo on public.ahoier_stories
  for update to authenticated using (
    author_id = (select auth.uid()) and published_at is null
    and ahoier_private.ahoier_is_active((select auth.uid()))
  ) with check (
    author_id = (select auth.uid()) and published_at is null
    and photo_path = 'story/' || voyage_id::text || '/' || id::text || '/0.webp'
    and ahoier_private.ahoier_is_active((select auth.uid()))
  );

create policy ahoier_friend_requests_read on public.ahoier_friend_requests
  for select to authenticated using (
    ahoier_private.ahoier_is_active((select auth.uid()))
    and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );
create policy ahoier_blocks_read_self on public.ahoier_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy ahoier_messages_read_participant on public.ahoier_messages
  for select to authenticated using (
    ahoier_private.ahoier_is_active((select auth.uid())) and hidden_at is null
    and ((sender_id = (select auth.uid()) and sender_removed_at is null)
      or (recipient_id = (select auth.uid()) and recipient_removed_at is null))
  );

-- Storage names encode the parent row. Users can upload only to their own
-- unpublished draft or avatar directory; bucket settings enforce WebP/2 MiB.
create function ahoier_private.ahoier_can_upload_media(p_name text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_user uuid := auth.uid();
begin
  if not ahoier_private.ahoier_is_active(v_user) then
    return false;
  end if;
  -- Storage invokes this during INSERT. Locking the account serializes the
  -- counter check with other uploads from the same account.
  perform 1 from public.ahoier_profiles p where p.user_id = v_user for update;
  if not found or (select count(*) from storage.objects o
    where o.bucket_id = 'ahoier-media' and o.owner_id = v_user::text
      and o.created_at > now() - interval '1 day') >= 40 then
    return false;
  end if;
  if p_name ~ '^avatar/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.webp$' then
    return v_parts[2] = v_user::text and (select count(*) from storage.objects o
      where o.bucket_id = 'ahoier-media' and o.owner_id = v_user::text
        and o.name like 'avatar/' || v_user::text || '/%') < 3;
  end if;
  if p_name ~ '^post/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-3]\.webp$' then
    return exists (select 1 from public.ahoier_posts p
      join public.ahoier_memberships m on m.voyage_id = p.voyage_id
      where p.voyage_id::text = v_parts[2] and p.id::text = v_parts[3]
        and p.author_id = v_user and m.user_id = v_user
        and p.published_at is null and p.hidden_at is null);
  end if;
  if p_name ~ '^reply/[0-9a-f-]{36}/[0-9a-f-]{36}/0\.webp$' then
    return exists (select 1 from public.ahoier_replies r
      join public.ahoier_posts p on p.id = r.post_id
      where p.voyage_id::text = v_parts[2] and r.id::text = v_parts[3]
        and r.author_id = v_user and r.published_at is null
        and r.hidden_at is null and ahoier_private.ahoier_can_view_post(p.id));
  end if;
  if p_name ~ '^story/[0-9a-f-]{36}/[0-9a-f-]{36}/0\.webp$' then
    return exists (select 1 from public.ahoier_stories s
      join public.ahoier_memberships m on m.voyage_id = s.voyage_id
      where s.voyage_id::text = v_parts[2] and s.id::text = v_parts[3]
        and s.author_id = v_user and m.user_id = v_user
        and s.published_at is null and s.hidden_at is null);
  end if;
  return false;
end;
$$;

create function ahoier_private.ahoier_can_read_media(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select ahoier_private.ahoier_is_active((select auth.uid())) and (
    exists (select 1 from public.ahoier_profiles p
      where p.avatar_path = p_name
        and ahoier_private.ahoier_can_view_profile(p.user_id))
    or exists (select 1 from public.ahoier_post_photos ph
      where ph.path = p_name and ahoier_private.ahoier_can_view_post(ph.post_id))
    or exists (select 1 from public.ahoier_reply_photos ph
      where ph.path = p_name and ahoier_private.ahoier_can_view_reply(ph.reply_id))
    or exists (select 1 from public.ahoier_stories s
      where s.photo_path = p_name and ahoier_private.ahoier_can_view_story(s.id))
    or (ahoier_private.ahoier_is_moderator() and exists (
      select 1 from public.ahoier_reports rep where rep.status = 'open'
        and p_name = any(rep.target_photo_paths)))
  );
$$;

create function ahoier_private.ahoier_can_delete_media(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.ahoier_reports rep
    where rep.status = 'open' and p_name = any(rep.target_photo_paths)
  ) and not exists (
    select 1 from public.ahoier_profiles p where p.avatar_path = p_name
  ) and not exists (
    select 1 from public.ahoier_post_photos ph
    join public.ahoier_posts p on p.id = ph.post_id
    where ph.path = p_name and p.published_at is not null
      and (p.hidden_at is null or p.hidden_at > now() - interval '1 day')
  ) and not exists (
    select 1 from public.ahoier_reply_photos ph
    join public.ahoier_replies r on r.id = ph.reply_id
    join public.ahoier_posts p on p.id = r.post_id
    where ph.path = p_name and r.published_at is not null
      and (r.hidden_at is null or r.hidden_at > now() - interval '1 day')
      and (p.hidden_at is null or p.hidden_at > now() - interval '1 day')
  ) and not exists (
    select 1 from public.ahoier_stories s where s.photo_path = p_name
      and s.published_at is not null
      and coalesce(s.hidden_at, s.expires_at) > now() - interval '1 day'
  );
$$;

-- Prevent an old, already-queued orphan from becoming the current avatar.
create function ahoier_private.ahoier_validate_avatar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null
    and not exists (select 1 from storage.objects o
      where o.bucket_id = 'ahoier-media' and o.name = new.avatar_path
        and o.owner_id = new.user_id::text
        and o.created_at > now() - interval '1 day') then
    raise exception 'Avatar upload is missing or too old' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger ahoier_profiles_validate_avatar
  before update of avatar_path on public.ahoier_profiles
  for each row execute function ahoier_private.ahoier_validate_avatar();

create policy ahoier_media_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'ahoier-media'
    and owner_id = (select auth.uid())::text
    and ahoier_private.ahoier_can_upload_media(name)
  );
create policy ahoier_media_read on storage.objects
  for select to authenticated using (
    bucket_id = 'ahoier-media'
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and (owner_id = (select auth.uid())::text
      or ahoier_private.ahoier_can_read_media(name))
  );
create policy ahoier_media_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'ahoier-media'
    and owner_id = (select auth.uid())::text
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and ahoier_private.ahoier_can_delete_media(name)
  );

-- Draft publication validates that every referenced binary exists. A failed
-- upload leaves only an owner-visible draft, never a broken public card.
create function ahoier_private.ahoier_publish_post_impl(p_post_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_post public.ahoier_posts%rowtype;
begin
  select * into v_post from public.ahoier_posts where id = p_post_id for update;
  if not found or v_post.author_id <> auth.uid()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or v_post.hidden_at is not null or v_post.published_at is not null
    or v_post.created_at <= now() - interval '1 day'
    or not exists (select 1 from public.ahoier_memberships m
      where m.voyage_id = v_post.voyage_id and m.user_id = auth.uid()) then
    raise exception 'Post cannot be published' using errcode = '42501';
  end if;
  if btrim(v_post.body) = '' and not exists (
    select 1 from public.ahoier_post_photos where post_id = p_post_id) then
    raise exception 'Post needs text or a photo' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.ahoier_post_photos ph
    where ph.post_id = p_post_id and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'ahoier-media' and o.name = ph.path
        and o.owner_id = auth.uid()::text)
  ) then
    raise exception 'A post photo is missing' using errcode = '22023';
  end if;
  update public.ahoier_posts set published_at = now() where id = p_post_id;
end;
$$;
create function public.ahoier_publish_post(p_post_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_publish_post_impl(p_post_id);
$$;

create function ahoier_private.ahoier_publish_reply_impl(p_reply_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reply public.ahoier_replies%rowtype;
begin
  select * into v_reply from public.ahoier_replies where id = p_reply_id for update;
  if not found or v_reply.author_id <> auth.uid()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or v_reply.hidden_at is not null or v_reply.published_at is not null
    or v_reply.created_at <= now() - interval '1 day'
    or not ahoier_private.ahoier_can_view_post(v_reply.post_id) then
    raise exception 'Reply cannot be published' using errcode = '42501';
  end if;
  if btrim(v_reply.body) = '' and not exists (
    select 1 from public.ahoier_reply_photos where reply_id = p_reply_id) then
    raise exception 'Reply needs text or a photo' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.ahoier_reply_photos ph
    where ph.reply_id = p_reply_id and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'ahoier-media' and o.name = ph.path
        and o.owner_id = auth.uid()::text)
  ) then
    raise exception 'Reply photo is missing' using errcode = '22023';
  end if;
  update public.ahoier_replies set published_at = now() where id = p_reply_id;
end;
$$;
create function public.ahoier_publish_reply(p_reply_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_publish_reply_impl(p_reply_id);
$$;

create function ahoier_private.ahoier_publish_story_impl(p_story_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_story public.ahoier_stories%rowtype;
  v_now timestamptz := now();
begin
  select * into v_story from public.ahoier_stories where id = p_story_id for update;
  if not found or v_story.author_id <> auth.uid()
    or not ahoier_private.ahoier_is_active(auth.uid())
    or v_story.hidden_at is not null or v_story.published_at is not null
    or v_story.created_at <= now() - interval '1 day'
    or not exists (select 1 from public.ahoier_memberships m
      where m.voyage_id = v_story.voyage_id and m.user_id = auth.uid()) then
    raise exception 'Story cannot be published' using errcode = '42501';
  end if;
  if v_story.photo_path is null or v_story.photo_path <>
    'story/' || v_story.voyage_id::text || '/' || v_story.id::text || '/0.webp'
    or not exists (select 1 from storage.objects o
      where o.bucket_id = 'ahoier-media' and o.name = v_story.photo_path
        and o.owner_id = auth.uid()::text) then
    raise exception 'Story photo is missing' using errcode = '22023';
  end if;
  update public.ahoier_stories
  set published_at = v_now, expires_at = v_now + interval '24 hours'
  where id = p_story_id;
end;
$$;
create function public.ahoier_publish_story(p_story_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_publish_story_impl(p_story_id);
$$;

create function ahoier_private.ahoier_react_impl(p_post_id uuid, p_reply_id uuid, p_emoji text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if pg_catalog.num_nonnulls(p_post_id, p_reply_id) <> 1
    or not ahoier_private.ahoier_is_active(v_user)
    or (p_emoji is not null and p_emoji not in ('👍', '❤️', '😂', '😮', '🎉')) then
    raise exception 'Invalid reaction' using errcode = '22023';
  end if;
  if p_post_id is not null and not ahoier_private.ahoier_can_view_post(p_post_id) then
    raise exception 'Post is not available' using errcode = '42501';
  end if;
  if p_reply_id is not null and not ahoier_private.ahoier_can_view_reply(p_reply_id) then
    raise exception 'Reply is not available' using errcode = '42501';
  end if;
  delete from public.ahoier_reactions
  where user_id = v_user
    and ((p_post_id is not null and post_id = p_post_id)
      or (p_reply_id is not null and reply_id = p_reply_id));
  if p_emoji is not null then
    insert into public.ahoier_reactions (post_id, reply_id, user_id, emoji)
    values (p_post_id, p_reply_id, v_user, p_emoji);
  end if;
end;
$$;
create function public.ahoier_react(p_post_id uuid, p_reply_id uuid, p_emoji text)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_react_impl(p_post_id, p_reply_id, p_emoji);
$$;

create function ahoier_private.ahoier_reaction_summary_impl(p_voyage_id uuid)
returns table(target_kind text, target_id uuid, emoji text, total bigint, reacted_by_me boolean)
language sql stable security definer set search_path = '' as $$
  select 'post'::text, r.post_id, r.emoji, count(*)::bigint,
    bool_or(r.user_id = (select auth.uid()))
  from public.ahoier_reactions r
  join public.ahoier_posts p on p.id = r.post_id
  where p.voyage_id = p_voyage_id
    and ahoier_private.ahoier_can_view_post(r.post_id)
  group by r.post_id, r.emoji
  union all
  select 'reply'::text, r.reply_id, r.emoji, count(*)::bigint,
    bool_or(r.user_id = (select auth.uid()))
  from public.ahoier_reactions r
  join public.ahoier_replies rep on rep.id = r.reply_id
  join public.ahoier_posts p on p.id = rep.post_id
  where p.voyage_id = p_voyage_id
    and ahoier_private.ahoier_can_view_reply(r.reply_id)
  group by r.reply_id, r.emoji;
$$;
create function public.ahoier_reaction_summary(p_voyage_id uuid)
returns table(target_kind text, target_id uuid, emoji text, total bigint, reacted_by_me boolean)
language sql stable security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_reaction_summary_impl(p_voyage_id);
$$;

create function ahoier_private.ahoier_send_friend_request_impl(p_other_user uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_request public.ahoier_friend_requests%rowtype;
begin
  if p_other_user is null or p_other_user = v_user
    or not ahoier_private.ahoier_is_active(v_user)
    or not ahoier_private.ahoier_is_active(p_other_user)
    or ahoier_private.ahoier_is_blocked(v_user, p_other_user)
    or not ahoier_private.ahoier_share_voyage(p_other_user) then
    raise exception 'Person is not available' using errcode = '42501';
  end if;
  select * into v_request from public.ahoier_friend_requests f
  where (f.requester_id = v_user and f.recipient_id = p_other_user)
     or (f.requester_id = p_other_user and f.recipient_id = v_user)
  for update;
  if found then
    if v_request.status = 'accepted' or
      (v_request.status = 'pending' and v_request.requester_id = v_user) then
      return v_request.id;
    end if;
    if v_request.status = 'pending' and v_request.recipient_id = v_user then
      raise exception 'Respond to the incoming request' using errcode = '22023';
    end if;
    -- A declined request cannot be repeated without the other person taking
    -- action. This prevents a rejected member from spamming fresh requests.
    raise exception 'Request was declined' using errcode = '22023';
  end if;
  perform 1 from public.ahoier_profiles p where p.user_id = v_user for update;
  if (select count(*) from ahoier_private.ahoier_friend_request_attempts a
    where a.requester_id = v_user and a.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many friend requests today' using errcode = '22023';
  end if;
  insert into ahoier_private.ahoier_friend_request_attempts (requester_id) values (v_user);
  insert into public.ahoier_friend_requests (requester_id, recipient_id)
  values (v_user, p_other_user) returning id into v_request.id;
  return v_request.id;
end;
$$;
create function public.ahoier_send_friend_request(p_other_user uuid)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_send_friend_request_impl(p_other_user);
$$;

create function ahoier_private.ahoier_respond_friend_request_impl(p_request_id uuid, p_accept boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_request public.ahoier_friend_requests%rowtype;
begin
  select * into v_request from public.ahoier_friend_requests f
  where f.id = p_request_id for update;
  if not found or v_request.recipient_id <> auth.uid()
    or v_request.status <> 'pending' or p_accept is null
    or not ahoier_private.ahoier_is_active(auth.uid())
    or not ahoier_private.ahoier_is_active(v_request.requester_id)
    or ahoier_private.ahoier_is_blocked(auth.uid(), v_request.requester_id) then
    raise exception 'Request is not available' using errcode = '42501';
  end if;
  update public.ahoier_friend_requests
  set status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now()
  where id = p_request_id;
end;
$$;
create function public.ahoier_respond_friend_request(p_request_id uuid, p_accept boolean)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_respond_friend_request_impl(p_request_id, p_accept);
$$;

create function ahoier_private.ahoier_cancel_friend_request_impl(p_request_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.ahoier_friend_requests
  where id = p_request_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Request is not available' using errcode = '42501';
  end if;
end;
$$;
create function public.ahoier_cancel_friend_request(p_request_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_cancel_friend_request_impl(p_request_id);
$$;

create function ahoier_private.ahoier_remove_friend_impl(p_other_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.ahoier_friend_requests f
  where f.status = 'accepted' and (
    (f.requester_id = auth.uid() and f.recipient_id = p_other_user)
    or (f.recipient_id = auth.uid() and f.requester_id = p_other_user)
  );
end;
$$;
create function public.ahoier_remove_friend(p_other_user uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_remove_friend_impl(p_other_user);
$$;

create function ahoier_private.ahoier_block_user_impl(p_other_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if p_other_user is null or p_other_user = v_user
    or not ahoier_private.ahoier_is_active(v_user)
    or not exists (select 1 from public.ahoier_profiles p where p.user_id = p_other_user) then
    raise exception 'Person is not available' using errcode = '42501';
  end if;
  insert into public.ahoier_blocks (blocker_id, blocked_id)
  values (v_user, p_other_user) on conflict do nothing;
  delete from public.ahoier_friend_requests f
  where (f.requester_id = v_user and f.recipient_id = p_other_user)
    or (f.requester_id = p_other_user and f.recipient_id = v_user);
end;
$$;
create function public.ahoier_block_user(p_other_user uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_block_user_impl(p_other_user);
$$;

create function ahoier_private.ahoier_unblock_user_impl(p_other_user uuid)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.ahoier_blocks
  where blocker_id = (select auth.uid()) and blocked_id = p_other_user;
$$;
create function public.ahoier_unblock_user(p_other_user uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_unblock_user_impl(p_other_user);
$$;

create function ahoier_private.ahoier_send_message_impl(p_recipient_id uuid, p_body text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if p_recipient_id is null or p_recipient_id = v_user
    or p_body is null or char_length(p_body) > 2000 or btrim(p_body) = ''
    or not ahoier_private.ahoier_is_active(v_user)
    or not ahoier_private.ahoier_is_active(p_recipient_id)
    or ahoier_private.ahoier_is_blocked(v_user, p_recipient_id)
    or not ahoier_private.ahoier_are_friends(v_user, p_recipient_id) then
    raise exception 'Message cannot be sent' using errcode = '42501';
  end if;
  perform 1 from public.ahoier_profiles p where p.user_id = v_user for update;
  if (select count(*) from public.ahoier_messages m
    where m.sender_id = v_user and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many messages this hour' using errcode = '22023';
  end if;
  insert into public.ahoier_messages (sender_id, recipient_id, body)
  values (v_user, p_recipient_id, p_body) returning id into v_id;
  return v_id;
end;
$$;
create function public.ahoier_send_message(p_recipient_id uuid, p_body text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_send_message_impl(p_recipient_id, p_body);
$$;

create function ahoier_private.ahoier_remove_message_impl(p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ahoier_messages
  set sender_removed_at = case when sender_id = auth.uid() then now() else sender_removed_at end,
      recipient_removed_at = case when recipient_id = auth.uid() then now() else recipient_removed_at end
  where id = p_message_id and (sender_id = auth.uid() or recipient_id = auth.uid());
  if not found then
    raise exception 'Message is not available' using errcode = '42501';
  end if;
end;
$$;
create function public.ahoier_remove_message(p_message_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_remove_message_impl(p_message_id);
$$;

create function ahoier_private.ahoier_remove_post_impl(p_post_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ahoier_posts set hidden_at = coalesce(hidden_at, now())
  where id = p_post_id and author_id = auth.uid();
  if not found then raise exception 'Post is not available' using errcode = '42501'; end if;
end;
$$;
create function public.ahoier_remove_post(p_post_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_remove_post_impl(p_post_id);
$$;

create function ahoier_private.ahoier_remove_reply_impl(p_reply_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ahoier_replies set hidden_at = coalesce(hidden_at, now())
  where id = p_reply_id and author_id = auth.uid();
  if not found then raise exception 'Reply is not available' using errcode = '42501'; end if;
end;
$$;
create function public.ahoier_remove_reply(p_reply_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_remove_reply_impl(p_reply_id);
$$;

create function ahoier_private.ahoier_remove_story_impl(p_story_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ahoier_stories set hidden_at = coalesce(hidden_at, now())
  where id = p_story_id and author_id = auth.uid();
  if not found then raise exception 'Story is not available' using errcode = '42501'; end if;
end;
$$;
create function public.ahoier_remove_story(p_story_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_remove_story_impl(p_story_id);
$$;

drop policy ahoier_reports_insert_member on public.ahoier_reports;
create policy ahoier_reports_insert_visible_target on public.ahoier_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and ahoier_private.ahoier_is_active((select auth.uid()))
    and (
      (post_id is not null and ahoier_private.ahoier_can_view_post(post_id)
        and exists (select 1 from public.ahoier_posts p
          where p.id = post_id and p.author_id <> (select auth.uid())))
      or (reply_id is not null and ahoier_private.ahoier_can_view_reply(reply_id)
        and exists (select 1 from public.ahoier_replies r
          where r.id = reply_id and r.author_id <> (select auth.uid())))
      or (story_id is not null and ahoier_private.ahoier_can_view_story(story_id)
        and exists (select 1 from public.ahoier_stories s
          where s.id = story_id and s.author_id <> (select auth.uid())))
      or (message_id is not null and exists (
        select 1 from public.ahoier_messages msg
        where msg.id = message_id and msg.recipient_id = (select auth.uid())
          and msg.hidden_at is null and msg.recipient_removed_at is null))
      or (profile_id is not null and profile_id <> (select auth.uid())
        and ahoier_private.ahoier_can_view_profile(profile_id)
        and ahoier_private.ahoier_share_voyage(profile_id))
    )
  );
create policy ahoier_reports_read_moderator on public.ahoier_reports
  for select to authenticated using (
    ahoier_private.ahoier_is_moderator()
    and ahoier_private.ahoier_is_active((select auth.uid()))
  );

create or replace function ahoier_private.ahoier_capture_report_target()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_body text;
  v_voyage uuid;
  v_author uuid;
  v_paths text[] := '{}';
begin
  if pg_catalog.num_nonnulls(new.post_id, new.reply_id, new.story_id, new.message_id, new.profile_id) <> 1
    or not ahoier_private.ahoier_is_active(auth.uid()) then
    raise exception 'Choose one visible report target' using errcode = '22023';
  end if;
  if new.post_id is not null then
    select p.body, p.voyage_id, p.author_id into v_body, v_voyage, v_author
    from public.ahoier_posts p where p.id = new.post_id
      and p.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_post(p.id)
    for share of p;
    select coalesce(array_agg(ph.path order by ph.slot), '{}') into v_paths
    from public.ahoier_post_photos ph where ph.post_id = new.post_id;
  elsif new.reply_id is not null then
    select r.body, p.voyage_id, r.author_id into v_body, v_voyage, v_author
    from public.ahoier_replies r join public.ahoier_posts p on p.id = r.post_id
    where r.id = new.reply_id and r.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_reply(r.id)
    for share of r, p;
    select coalesce(array_agg(ph.path), '{}') into v_paths
    from public.ahoier_reply_photos ph where ph.reply_id = new.reply_id;
  elsif new.story_id is not null then
    select s.caption, s.voyage_id, s.author_id,
      case when s.photo_path is null then '{}'::text[] else array[s.photo_path] end
    into v_body, v_voyage, v_author, v_paths
    from public.ahoier_stories s where s.id = new.story_id
      and s.author_id <> auth.uid()
      and ahoier_private.ahoier_can_view_story(s.id)
    for share of s;
  elsif new.message_id is not null then
    select msg.body, msg.sender_id into v_body, v_author
    from public.ahoier_messages msg where msg.id = new.message_id
      and msg.recipient_id = auth.uid() and msg.recipient_removed_at is null
      and msg.hidden_at is null
    for share of msg;
    v_voyage := null;
  else
    select p.display_name, p.user_id,
      case when p.avatar_path is null then '{}'::text[] else array[p.avatar_path] end
    into v_body, v_author, v_paths
    from public.ahoier_profiles p where p.user_id = new.profile_id
      and p.user_id <> auth.uid()
      and ahoier_private.ahoier_can_view_profile(p.user_id)
      and ahoier_private.ahoier_share_voyage(p.user_id)
    for share of p;
    select mine.voyage_id into v_voyage
    from public.ahoier_memberships mine
    join public.ahoier_memberships theirs on theirs.voyage_id = mine.voyage_id
    where mine.user_id = auth.uid() and theirs.user_id = new.profile_id
    order by mine.voyage_id limit 1;
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

create function ahoier_private.ahoier_moderate_report_impl(p_report_id uuid, p_action text)
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
      update public.ahoier_posts set hidden_at = coalesce(hidden_at, now())
      where id = v_report.post_id;
    elsif v_report.reply_id is not null then
      update public.ahoier_replies set hidden_at = coalesce(hidden_at, now())
      where id = v_report.reply_id;
    elsif v_report.story_id is not null then
      update public.ahoier_stories set hidden_at = coalesce(hidden_at, now())
      where id = v_report.story_id;
    elsif v_report.message_id is not null then
      update public.ahoier_messages set hidden_at = coalesce(hidden_at, now())
      where id = v_report.message_id;
    else
      -- A visible directory row cannot be hidden safely while the member can
      -- immediately restore an abusive name/avatar. Hide means suspension.
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
create function public.ahoier_moderate_report(p_report_id uuid, p_action text)
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_moderate_report_impl(p_report_id, p_action);
$$;
create function public.ahoier_is_moderator()
returns boolean language sql stable security invoker set search_path = '' as $$
  select ahoier_private.ahoier_is_moderator()
    and ahoier_private.ahoier_is_active((select auth.uid()));
$$;

-- A server-side scheduled worker fetches paths here, removes each binary via
-- the Storage API (never by deleting storage.objects), then acknowledges them.
-- This also catches stories that expired while no client was online.
create table ahoier_private.ahoier_media_cleanup_queue (
  path text primary key,
  queued_at timestamptz not null default now()
);
alter table ahoier_private.ahoier_media_cleanup_queue enable row level security;
revoke all on ahoier_private.ahoier_media_cleanup_queue from public, anon, authenticated;

create function ahoier_private.ahoier_cleanup_candidates_impl()
returns table(path text) language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from ahoier_private.ahoier_friend_request_attempts
  where created_at < now() - interval '2 days';
  delete from public.ahoier_stories s
  where s.published_at is null and s.created_at <= now() - interval '1 day';
  delete from public.ahoier_replies r
  where r.published_at is null and r.created_at <= now() - interval '1 day';
  delete from public.ahoier_posts p
  where p.published_at is null and p.created_at <= now() - interval '1 day';

  insert into ahoier_private.ahoier_media_cleanup_queue (path)
  select s.photo_path from public.ahoier_stories s
  where s.photo_path is not null
    and coalesce(s.hidden_at, s.expires_at) <= now() - interval '1 day'
    and not exists (select 1 from public.ahoier_reports rep
      where rep.status = 'open' and s.photo_path = any(rep.target_photo_paths))
  on conflict do nothing;

  insert into ahoier_private.ahoier_media_cleanup_queue (path)
  select ph.path from public.ahoier_post_photos ph
  join public.ahoier_posts p on p.id = ph.post_id
  where p.hidden_at <= now() - interval '1 day'
    and not exists (select 1 from public.ahoier_reports rep
      where rep.status = 'open' and ph.path = any(rep.target_photo_paths))
  on conflict do nothing;

  insert into ahoier_private.ahoier_media_cleanup_queue (path)
  select ph.path from public.ahoier_reply_photos ph
  join public.ahoier_replies r on r.id = ph.reply_id
  join public.ahoier_posts p on p.id = r.post_id
  where (r.hidden_at <= now() - interval '1 day'
      or p.hidden_at <= now() - interval '1 day')
    and not exists (select 1 from public.ahoier_reports rep
      where rep.status = 'open' and ph.path = any(rep.target_photo_paths))
  on conflict do nothing;

  insert into ahoier_private.ahoier_media_cleanup_queue (path)
  select o.name from storage.objects o
  where o.bucket_id = 'ahoier-media' and o.name like 'avatar/%'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.ahoier_profiles p where p.avatar_path = o.name)
    and not exists (select 1 from public.ahoier_reports rep
      where rep.status = 'open' and o.name = any(rep.target_photo_paths))
  on conflict do nothing;

  -- Failed uploads and abandoned drafts have no published parent. They are
  -- kept for a full day so a slow or interrupted client can retry safely.
  insert into ahoier_private.ahoier_media_cleanup_queue (path)
  select o.name from storage.objects o
  where o.bucket_id = 'ahoier-media'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.ahoier_profiles p where p.avatar_path = o.name)
    and not exists (select 1 from public.ahoier_post_photos ph
      join public.ahoier_posts p on p.id = ph.post_id
      where ph.path = o.name and p.published_at is not null
        and (p.hidden_at is null or p.hidden_at > now() - interval '1 day'))
    and not exists (select 1 from public.ahoier_reply_photos ph
      join public.ahoier_replies r on r.id = ph.reply_id
      join public.ahoier_posts p on p.id = r.post_id
      where ph.path = o.name and r.published_at is not null
        and (r.hidden_at is null or r.hidden_at > now() - interval '1 day')
        and (p.hidden_at is null or p.hidden_at > now() - interval '1 day'))
    and not exists (select 1 from public.ahoier_stories s
      where s.photo_path = o.name and s.published_at is not null
        and coalesce(s.hidden_at, s.expires_at) > now() - interval '1 day')
    and not exists (select 1 from public.ahoier_reports rep
      where rep.status = 'open' and o.name = any(rep.target_photo_paths))
  on conflict do nothing;

  return query select q.path from ahoier_private.ahoier_media_cleanup_queue q
  where not exists (select 1 from public.ahoier_reports rep
    where rep.status = 'open' and q.path = any(rep.target_photo_paths))
    and not exists (select 1 from public.ahoier_profiles p where p.avatar_path = q.path)
    and not exists (select 1 from public.ahoier_post_photos ph
      join public.ahoier_posts p on p.id = ph.post_id
      where ph.path = q.path and p.published_at is not null and p.hidden_at is null)
    and not exists (select 1 from public.ahoier_reply_photos ph
      join public.ahoier_replies r on r.id = ph.reply_id
      join public.ahoier_posts p on p.id = r.post_id
      where ph.path = q.path and r.published_at is not null
        and r.hidden_at is null and p.hidden_at is null)
    and not exists (select 1 from public.ahoier_stories s
      where s.photo_path = q.path and s.published_at is not null
        and s.expires_at > now() and s.hidden_at is null)
  order by q.queued_at limit 100;
end;
$$;
create function public.ahoier_cleanup_candidates()
returns table(path text) language sql volatile security invoker set search_path = '' as $$
  select * from ahoier_private.ahoier_cleanup_candidates_impl();
$$;

create function ahoier_private.ahoier_cleanup_ack_impl(p_paths text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_paths is null or cardinality(p_paths) > 100 then
    raise exception 'Invalid cleanup batch' using errcode = '22023';
  end if;
  delete from public.ahoier_stories s
  where s.photo_path = any(p_paths)
    and (s.expires_at <= now() or s.hidden_at is not null);
  delete from public.ahoier_post_photos ph
  using public.ahoier_posts p
  where ph.post_id = p.id and ph.path = any(p_paths) and p.hidden_at is not null;
  delete from public.ahoier_reply_photos ph
  using public.ahoier_replies r, public.ahoier_posts p
  where ph.reply_id = r.id and p.id = r.post_id and ph.path = any(p_paths)
    and (r.hidden_at is not null or p.hidden_at is not null);
  delete from ahoier_private.ahoier_media_cleanup_queue q
  where q.path = any(p_paths);
end;
$$;
create function public.ahoier_cleanup_ack(p_paths text[])
returns void language sql volatile security invoker set search_path = '' as $$
  select ahoier_private.ahoier_cleanup_ack_impl(p_paths);
$$;

-- Newly inserted messages can be delivered through Realtime under their own
-- participant-only SELECT policy. Polling remains a valid client fallback.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'ahoier_messages') then
    alter publication supabase_realtime add table public.ahoier_messages;
  end if;
end;
$$;

-- Functions have PUBLIC EXECUTE by default; remove that before granting the
-- exact PostgREST entry points and private helper calls they need.
revoke execute on all functions in schema ahoier_private from public, anon, authenticated, service_role;
revoke execute on function
  public.ahoier_publish_post(uuid), public.ahoier_publish_reply(uuid),
  public.ahoier_publish_story(uuid), public.ahoier_react(uuid, uuid, text),
  public.ahoier_reaction_summary(uuid), public.ahoier_send_friend_request(uuid),
  public.ahoier_respond_friend_request(uuid, boolean),
  public.ahoier_cancel_friend_request(uuid), public.ahoier_remove_friend(uuid),
  public.ahoier_block_user(uuid), public.ahoier_unblock_user(uuid),
  public.ahoier_send_message(uuid, text), public.ahoier_remove_message(uuid),
  public.ahoier_remove_post(uuid), public.ahoier_remove_reply(uuid),
  public.ahoier_remove_story(uuid), public.ahoier_moderate_report(uuid, text),
  public.ahoier_is_moderator(), public.ahoier_my_profile(),
  public.ahoier_cleanup_candidates(), public.ahoier_cleanup_ack(text[])
from public, anon, authenticated, service_role;

grant usage on schema ahoier_private to authenticated, service_role;
grant execute on function
  ahoier_private.ahoier_can_view_profile(uuid),
  ahoier_private.ahoier_my_profile_impl(),
  ahoier_private.ahoier_is_active(uuid),
  ahoier_private.ahoier_can_create_content(text),
  ahoier_private.ahoier_is_moderator(),
  ahoier_private.ahoier_is_blocked(uuid, uuid),
  ahoier_private.ahoier_share_voyage(uuid, uuid),
  ahoier_private.ahoier_are_friends(uuid, uuid),
  ahoier_private.ahoier_can_view_post(uuid),
  ahoier_private.ahoier_can_view_reply(uuid),
  ahoier_private.ahoier_can_view_story(uuid),
  ahoier_private.ahoier_can_upload_media(text),
  ahoier_private.ahoier_can_read_media(text),
  ahoier_private.ahoier_can_delete_media(text),
  ahoier_private.ahoier_publish_post_impl(uuid),
  ahoier_private.ahoier_publish_reply_impl(uuid),
  ahoier_private.ahoier_publish_story_impl(uuid),
  ahoier_private.ahoier_react_impl(uuid, uuid, text),
  ahoier_private.ahoier_reaction_summary_impl(uuid),
  ahoier_private.ahoier_send_friend_request_impl(uuid),
  ahoier_private.ahoier_respond_friend_request_impl(uuid, boolean),
  ahoier_private.ahoier_cancel_friend_request_impl(uuid),
  ahoier_private.ahoier_remove_friend_impl(uuid),
  ahoier_private.ahoier_block_user_impl(uuid),
  ahoier_private.ahoier_unblock_user_impl(uuid),
  ahoier_private.ahoier_send_message_impl(uuid, text),
  ahoier_private.ahoier_remove_message_impl(uuid),
  ahoier_private.ahoier_remove_post_impl(uuid),
  ahoier_private.ahoier_remove_reply_impl(uuid),
  ahoier_private.ahoier_remove_story_impl(uuid),
  ahoier_private.ahoier_moderate_report_impl(uuid, text)
to authenticated;

grant execute on function
  public.ahoier_publish_post(uuid), public.ahoier_publish_reply(uuid),
  public.ahoier_publish_story(uuid), public.ahoier_react(uuid, uuid, text),
  public.ahoier_reaction_summary(uuid), public.ahoier_send_friend_request(uuid),
  public.ahoier_respond_friend_request(uuid, boolean),
  public.ahoier_cancel_friend_request(uuid), public.ahoier_remove_friend(uuid),
  public.ahoier_block_user(uuid), public.ahoier_unblock_user(uuid),
  public.ahoier_send_message(uuid, text), public.ahoier_remove_message(uuid),
  public.ahoier_remove_post(uuid), public.ahoier_remove_reply(uuid),
  public.ahoier_remove_story(uuid), public.ahoier_moderate_report(uuid, text),
  public.ahoier_is_moderator(), public.ahoier_my_profile()
to authenticated;

grant execute on function
  ahoier_private.ahoier_cleanup_candidates_impl(),
  ahoier_private.ahoier_cleanup_ack_impl(text[])
to service_role;
grant execute on function
  public.ahoier_cleanup_candidates(), public.ahoier_cleanup_ack(text[])
to service_role;

grant select on public.ahoier_post_photos, public.ahoier_reply_photos,
  public.ahoier_stories, public.ahoier_friend_requests,
  public.ahoier_blocks, public.ahoier_messages, public.ahoier_reports
to authenticated;
revoke select on public.ahoier_profiles from authenticated;
grant select (user_id, display_name, avatar_path) on public.ahoier_profiles to authenticated;
grant insert (post_id, slot, path) on public.ahoier_post_photos to authenticated;
grant delete on public.ahoier_post_photos to authenticated;
grant insert (reply_id, path) on public.ahoier_reply_photos to authenticated;
grant delete on public.ahoier_reply_photos to authenticated;
grant insert (voyage_id, author_id, caption) on public.ahoier_stories to authenticated;
grant insert (id) on public.ahoier_stories to authenticated;
grant update (photo_path) on public.ahoier_stories to authenticated;
grant insert (adult_confirmed_at) on public.ahoier_profiles to authenticated;
grant update (adult_confirmed_at, avatar_path) on public.ahoier_profiles to authenticated;
grant insert (id, published_at) on public.ahoier_posts, public.ahoier_replies to authenticated;
grant insert (story_id, message_id, profile_id) on public.ahoier_reports to authenticated;
revoke delete on public.ahoier_posts, public.ahoier_replies from authenticated;

commit;
