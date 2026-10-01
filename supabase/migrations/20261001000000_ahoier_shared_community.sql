-- Ahoier shared community. Run once as the project owner/postgres role.
-- No guest content or invite codes are imported from the local preview/pilot.
begin;

create schema if not exists ahoier_private;
revoke all on schema ahoier_private from public, anon, authenticated;

create table public.ahoier_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  constraint ahoier_profiles_name_check check (
    display_name = btrim(display_name)
    and char_length(display_name) between 2 and 40
    and display_name !~ '[[:cntrl:]]'
  )
);

create table public.ahoier_voyages (
  id uuid primary key default gen_random_uuid(),
  ship text not null,
  starts_on date not null,
  ends_on date not null,
  constraint ahoier_voyages_ship_check check (ship = btrim(ship) and char_length(ship) between 2 and 60),
  constraint ahoier_voyages_dates_check check (ends_on >= starts_on and ends_on - starts_on <= 31),
  constraint ahoier_voyages_unique unique (ship, starts_on, ends_on)
);

create table public.ahoier_memberships (
  voyage_id uuid not null references public.ahoier_voyages(id) on delete cascade,
  user_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (voyage_id, user_id)
);
create index ahoier_memberships_user_voyage_idx on public.ahoier_memberships (user_id, voyage_id);

create table public.ahoier_posts (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.ahoier_voyages(id) on delete cascade,
  author_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  category text not null,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint ahoier_posts_category_check check (category in ('Frage', 'Tipp', 'Zusammen an Land', 'Fundstück')),
  constraint ahoier_posts_body_check check (char_length(body) between 1 and 1000 and char_length(btrim(body)) > 0)
);
create index ahoier_posts_voyage_created_idx on public.ahoier_posts (voyage_id, created_at desc) where hidden_at is null;
create index ahoier_posts_visible_author_idx on public.ahoier_posts (voyage_id, author_id) where hidden_at is null;

create table public.ahoier_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.ahoier_posts(id) on delete cascade,
  author_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint ahoier_replies_body_check check (char_length(body) between 1 and 1000 and char_length(btrim(body)) > 0)
);
create index ahoier_replies_post_created_idx on public.ahoier_replies (post_id, created_at) where hidden_at is null;
create index ahoier_replies_visible_author_idx on public.ahoier_replies (post_id, author_id) where hidden_at is null;

-- Deliberately keep target UUIDs and a moderator-only content snapshot after an
-- author deletes content. The trigger below captures the real target, never a
-- client-supplied snapshot; the INSERT policy verifies a visible target.
create table public.ahoier_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid,
  reply_id uuid,
  reporter_id uuid not null references public.ahoier_profiles(user_id) on delete cascade,
  reason text not null,
  details text not null default '',
  target_voyage_id uuid not null,
  target_author_id uuid not null,
  target_body text not null,
  created_at timestamptz not null default now(),
  constraint ahoier_reports_one_target_check check (num_nonnulls(post_id, reply_id) = 1),
  constraint ahoier_reports_reason_check check (reason in ('spam', 'unsafe', 'harassment', 'other')),
  constraint ahoier_reports_details_check check (char_length(details) <= 300)
);
create unique index ahoier_reports_once_per_post_idx on public.ahoier_reports (post_id, reporter_id) where post_id is not null;
create unique index ahoier_reports_once_per_reply_idx on public.ahoier_reports (reply_id, reporter_id) where reply_id is not null;
create index ahoier_reports_created_idx on public.ahoier_reports (created_at desc);
create index ahoier_reports_voyage_created_idx on public.ahoier_reports (target_voyage_id, created_at desc);

-- Only SHA-256 hashes of locally generated 128-bit codes are stored.
-- A 32-hex-character code itself must never be written to this database or Git.
create table ahoier_private.ahoier_invites (
  code_hash text primary key,
  voyage_id uuid not null references public.ahoier_voyages(id) on delete cascade,
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint ahoier_invites_hash_check check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint ahoier_invites_usage_check check (max_uses between 1 and 500 and uses between 0 and max_uses)
);
create index ahoier_invites_voyage_idx on ahoier_private.ahoier_invites (voyage_id);

alter table public.ahoier_profiles enable row level security;
alter table public.ahoier_voyages enable row level security;
alter table public.ahoier_memberships enable row level security;
alter table public.ahoier_posts enable row level security;
alter table public.ahoier_replies enable row level security;
alter table public.ahoier_reports enable row level security;
alter table ahoier_private.ahoier_invites enable row level security;

revoke all on public.ahoier_profiles, public.ahoier_voyages,
  public.ahoier_memberships, public.ahoier_posts, public.ahoier_replies,
  public.ahoier_reports from public, anon, authenticated;
revoke all on ahoier_private.ahoier_invites from public, anon, authenticated;

-- The private helper avoids recursive RLS. A member cannot enumerate people
-- who have not authored visible content in one of their voyages.
create function ahoier_private.ahoier_can_view_profile(p_other_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) = p_other_user or exists (
    select 1
    from public.ahoier_memberships mine
    join public.ahoier_posts p on p.voyage_id = mine.voyage_id
    where mine.user_id = (select auth.uid())
      and p.author_id = p_other_user and p.hidden_at is null
  ) or exists (
    select 1
    from public.ahoier_memberships mine
    join public.ahoier_posts p on p.voyage_id = mine.voyage_id
    join public.ahoier_replies r on r.post_id = p.id
    where mine.user_id = (select auth.uid())
      and r.author_id = p_other_user
      and p.hidden_at is null and r.hidden_at is null
  );
$$;

create policy ahoier_profiles_read_shared on public.ahoier_profiles
  for select to authenticated
  using (ahoier_private.ahoier_can_view_profile(user_id));
create policy ahoier_profiles_insert_self on public.ahoier_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy ahoier_profiles_update_self on public.ahoier_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ahoier_memberships_read_self on public.ahoier_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy ahoier_voyages_read_member on public.ahoier_voyages
  for select to authenticated
  using (exists (
    select 1 from public.ahoier_memberships m
    where m.voyage_id = id and m.user_id = (select auth.uid())
  ));

create policy ahoier_posts_read_member on public.ahoier_posts
  for select to authenticated
  using (hidden_at is null and exists (
    select 1 from public.ahoier_memberships m
    where m.voyage_id = ahoier_posts.voyage_id and m.user_id = (select auth.uid())
  ));
create policy ahoier_posts_insert_member on public.ahoier_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and hidden_at is null and exists (
    select 1 from public.ahoier_memberships m
    where m.voyage_id = ahoier_posts.voyage_id and m.user_id = (select auth.uid())
  ));
create policy ahoier_posts_delete_own on public.ahoier_posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy ahoier_replies_read_member on public.ahoier_replies
  for select to authenticated
  using (hidden_at is null and exists (
    select 1 from public.ahoier_posts p
    join public.ahoier_memberships m on m.voyage_id = p.voyage_id
    where p.id = ahoier_replies.post_id and p.hidden_at is null
      and m.user_id = (select auth.uid())
  ));
create policy ahoier_replies_insert_member on public.ahoier_replies
  for insert to authenticated
  with check (author_id = (select auth.uid()) and hidden_at is null and exists (
    select 1 from public.ahoier_posts p
    join public.ahoier_memberships m on m.voyage_id = p.voyage_id
    where p.id = ahoier_replies.post_id and p.hidden_at is null
      and m.user_id = (select auth.uid())
  ));
create policy ahoier_replies_delete_own on public.ahoier_replies
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy ahoier_reports_insert_member on public.ahoier_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (
    (post_id is not null and exists (
      select 1 from public.ahoier_posts p
      join public.ahoier_memberships m on m.voyage_id = p.voyage_id
      where p.id = ahoier_reports.post_id and p.hidden_at is null
        and p.author_id <> (select auth.uid()) and m.user_id = (select auth.uid())
    )) or
    (reply_id is not null and exists (
      select 1 from public.ahoier_replies r
      join public.ahoier_posts p on p.id = r.post_id
      join public.ahoier_memberships m on m.voyage_id = p.voyage_id
      where r.id = ahoier_reports.reply_id and r.hidden_at is null and p.hidden_at is null
        and r.author_id <> (select auth.uid()) and m.user_id = (select auth.uid())
    ))
  ));

create function ahoier_private.ahoier_capture_report_target()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_body text;
  v_voyage uuid;
  v_author uuid;
begin
  if pg_catalog.num_nonnulls(new.post_id, new.reply_id) <> 1 then
    raise exception 'Choose one report target' using errcode = '22023';
  end if;
  if new.post_id is not null then
    select p.body, p.voyage_id, p.author_id
    into v_body, v_voyage, v_author
    from public.ahoier_posts p
    join public.ahoier_memberships m on m.voyage_id = p.voyage_id
    where p.id = new.post_id and p.hidden_at is null
      and m.user_id = auth.uid() and p.author_id <> auth.uid();
  else
    select r.body, p.voyage_id, r.author_id
    into v_body, v_voyage, v_author
    from public.ahoier_replies r
    join public.ahoier_posts p on p.id = r.post_id
    join public.ahoier_memberships m on m.voyage_id = p.voyage_id
    where r.id = new.reply_id and r.hidden_at is null and p.hidden_at is null
      and m.user_id = auth.uid() and r.author_id <> auth.uid();
  end if;
  if not found then
    raise exception 'Report target is not available' using errcode = '22023';
  end if;
  if v_author = auth.uid() or not exists (
    select 1 from public.ahoier_memberships m
    where m.voyage_id = v_voyage and m.user_id = auth.uid()
  ) then
    raise exception 'Report target is not available' using errcode = '22023';
  end if;
  new.target_body := v_body;
  new.target_voyage_id := v_voyage;
  new.target_author_id := v_author;
  return new;
end;
$$;
create trigger ahoier_reports_capture_target
  before insert on public.ahoier_reports
  for each row execute function ahoier_private.ahoier_capture_report_target();

-- Lock one invite row to serialize claims. Distinct codes for the same voyage
-- cannot double-charge a member thanks to INSERT ... ON CONFLICT DO NOTHING.
create function ahoier_private.ahoier_join_voyage_impl(p_code text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite ahoier_private.ahoier_invites%rowtype;
  v_inserted uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_code is null or p_code !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid invitation code' using errcode = '22023';
  end if;

  select * into v_invite
  from ahoier_private.ahoier_invites
  where code_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_code, 'UTF8')), 'hex')
  for update;
  if not found then
    raise exception 'Invalid invitation code' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.ahoier_memberships
    where voyage_id = v_invite.voyage_id and user_id = v_user
  ) then
    return v_invite.voyage_id;
  end if;

  if v_invite.revoked_at is not null or v_invite.expires_at <= pg_catalog.now()
     or v_invite.uses >= v_invite.max_uses then
    raise exception 'Invalid invitation code' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ahoier_profiles where user_id = v_user) then
    raise exception 'Create a display name before joining' using errcode = '23503';
  end if;

  insert into public.ahoier_memberships (voyage_id, user_id)
  values (v_invite.voyage_id, v_user)
  on conflict do nothing
  returning voyage_id into v_inserted;

  if v_inserted is not null then
    update ahoier_private.ahoier_invites set uses = uses + 1
    where code_hash = v_invite.code_hash;
  end if;
  return v_invite.voyage_id;
end;
$$;

-- Supabase exposes only public RPC. Keep the privileged implementation in a
-- non-exposed schema and the public entry point as SECURITY INVOKER.
create function public.ahoier_join_voyage(p_code text)
returns uuid
language sql volatile security invoker
set search_path = ''
as $$
  select ahoier_private.ahoier_join_voyage_impl(p_code);
$$;

revoke execute on function ahoier_private.ahoier_can_view_profile(uuid) from public, anon, authenticated;
revoke execute on function ahoier_private.ahoier_join_voyage_impl(text) from public, anon, authenticated;
revoke execute on function ahoier_private.ahoier_capture_report_target() from public, anon, authenticated;
revoke execute on function public.ahoier_join_voyage(text) from public, anon, authenticated;
grant usage on schema ahoier_private to authenticated;
grant execute on function ahoier_private.ahoier_can_view_profile(uuid) to authenticated;
grant execute on function ahoier_private.ahoier_join_voyage_impl(text) to authenticated;
grant execute on function public.ahoier_join_voyage(text) to authenticated;

grant select on public.ahoier_profiles, public.ahoier_voyages,
  public.ahoier_memberships, public.ahoier_posts, public.ahoier_replies to authenticated;
grant insert (user_id, display_name)
  on public.ahoier_profiles to authenticated;
grant update (display_name)
  on public.ahoier_profiles to authenticated;
grant insert (voyage_id, author_id, category, body)
  on public.ahoier_posts to authenticated;
grant delete on public.ahoier_posts to authenticated;
grant insert (post_id, author_id, body)
  on public.ahoier_replies to authenticated;
grant delete on public.ahoier_replies to authenticated;
grant insert (post_id, reply_id, reporter_id, reason, details)
  on public.ahoier_reports to authenticated;

commit;
