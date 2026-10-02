import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const users = {
  alice: "11111111-1111-4111-8111-111111111111",
  bob: "22222222-2222-4222-8222-222222222222",
  otherVoyage: "33333333-3333-4333-8333-333333333333",
  unconfirmed: "44444444-4444-4444-8444-444444444444",
  moderator: "55555555-5555-4555-8555-555555555555",
};
const voyage = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const differentVoyage = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function query(db, statement, values = []) {
  return (await db.query(statement, values)).rows;
}

async function asUser(db, userId, statement, values = []) {
  await db.exec("set role authenticated");
  await db.exec(`set request.jwt.claim.sub = '${userId}'`);
  try {
    return await query(db, statement, values);
  } finally {
    await db.exec("reset role");
    await db.exec("reset request.jwt.claim.sub");
  }
}

async function asService(db, statement, values = []) {
  await db.exec("set role service_role");
  try {
    return await query(db, statement, values);
  } finally {
    await db.exec("reset role");
  }
}

async function migrate(db) {
  // Minimal Supabase platform stub. The migrations themselves are executed
  // unchanged, including grants, triggers, RLS and Storage object policies.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text,
      name text, owner_id text, created_at timestamptz default now()
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    create publication supabase_realtime;
  `);
  for (const name of [
    "20261001000000_ahoier_shared_community.sql",
    "20261002000000_ahoier_open_voyages.sql",
    "20261003000000_ahoier_social_wall.sql",
  ]) {
    const file = new URL(`../supabase/migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, "utf8"));
  }
}

test("social migration isolates voyages, drafts, media, messaging and moderation", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await db.exec("set role anon");
    try {
      await assert.rejects(query(db, "select id from public.ahoier_posts"));
      await assert.rejects(query(db, "select name from storage.objects where bucket_id='ahoier-media'"));
    } finally {
      await db.exec("reset role");
    }
    for (const userId of Object.values(users)) {
      await query(db, "insert into auth.users(id) values($1)", [userId]);
    }
    for (const [name, userId] of Object.entries(users)) {
      await query(db,
        "insert into public.ahoier_profiles(user_id,display_name,adult_confirmed_at) values($1,$2,$3)",
        [userId, name, name === "unconfirmed" ? null : new Date().toISOString()]);
    }
    await query(db, `insert into public.ahoier_voyages(id,ship,starts_on,ends_on)
      values($1,'AIDAcosma','2026-11-01','2026-11-10'),
            ($2,'AIDAperla','2026-12-01','2026-12-10')`, [voyage, differentVoyage]);
    for (const userId of [users.alice, users.bob, users.unconfirmed, users.moderator]) {
      await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)", [voyage, userId]);
    }
    await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)",
      [differentVoyage, users.otherVoyage]);
    await query(db, "insert into ahoier_private.ahoier_moderators(user_id) values($1)",
      [users.moderator]);

    assert.equal((await asUser(db, users.alice,
      "select count(*)::int as n from public.ahoier_memberships where voyage_id=$1",
      [voyage]))[0].n, 3); // The unconfirmed account is excluded.
    assert.equal((await asUser(db, users.otherVoyage,
      "select count(*)::int as n from public.ahoier_memberships where voyage_id=$1",
      [voyage]))[0].n, 0);
    assert.equal((await asUser(db, users.unconfirmed,
      "select count(*)::int as n from public.ahoier_profiles where user_id=$1",
      [users.alice]))[0].n, 0);
    await assert.rejects(asUser(db, users.alice,
      "select adult_confirmed_at from public.ahoier_profiles where user_id=$1", [users.bob]));
    assert.equal((await asUser(db, users.alice,
      "select adult_confirmed_at from public.ahoier_my_profile()"))[0]
      .adult_confirmed_at !== null, true);
    assert.equal((await asUser(db, users.moderator,
      "select public.ahoier_is_moderator() as yes"))[0].yes, true);
    assert.equal((await asUser(db, users.alice,
      "select public.ahoier_is_moderator() as yes"))[0].yes, false);

    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const photo = `post/${voyage}/${postId}/0.webp`;
    await asUser(db, users.alice,
      `insert into public.ahoier_posts(id,voyage_id,author_id,category,body,published_at)
       values($1,$2,$3,'Frage','',null)`, [postId, voyage, users.alice]);
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_posts where id=$1", [postId]))[0].n, 0);
    await asUser(db, users.alice,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [photo, users.alice]);
    await asUser(db, users.alice,
      "insert into public.ahoier_post_photos(post_id,slot,path) values($1,0,$2)",
      [postId, photo]);
    await asUser(db, users.alice, "select public.ahoier_publish_post($1)", [postId]);
    for (const [userId, count] of [[users.bob, 1], [users.otherVoyage, 0], [users.unconfirmed, 0]]) {
      assert.equal((await asUser(db, userId,
        "select count(*)::int as n from public.ahoier_posts where id=$1", [postId]))[0].n, count);
      assert.equal((await asUser(db, userId,
        "select count(*)::int as n from storage.objects where name=$1", [photo]))[0].n, count);
    }
    await assert.rejects(asUser(db, users.otherVoyage,
      "select public.ahoier_react($1,null,'👍')", [postId]));
    await asUser(db, users.bob, "select public.ahoier_react($1,null,'👍')", [postId]);
    const reactions = await asUser(db, users.bob,
      "select target_kind,emoji,total,reacted_by_me from public.ahoier_reaction_summary($1)", [voyage]);
    assert.deepEqual(reactions.map(row => row.target_kind), ["post"]);
    assert.equal(reactions[0].reacted_by_me, true);

    const replyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const replyPhoto = `reply/${voyage}/${replyId}/0.webp`;
    await asUser(db, users.bob,
      "insert into public.ahoier_replies(id,post_id,author_id,body,published_at) values($1,$2,$3,'',null)",
      [replyId, postId, users.bob]);
    await asUser(db, users.bob,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [replyPhoto, users.bob]);
    await asUser(db, users.bob,
      "insert into public.ahoier_reply_photos(reply_id,path) values($1,$2)",
      [replyId, replyPhoto]);
    await asUser(db, users.bob, "select public.ahoier_publish_reply($1)", [replyId]);
    assert.equal((await asUser(db, users.alice,
      "select count(*)::int as n from storage.objects where name=$1", [replyPhoto]))[0].n, 1);
    assert.equal((await asUser(db, users.otherVoyage,
      "select count(*)::int as n from storage.objects where name=$1", [replyPhoto]))[0].n, 0);

    const storyId = (await asUser(db, users.alice,
      "insert into public.ahoier_stories(voyage_id,author_id,caption) values($1,$2,'Deckabend') returning id",
      [voyage, users.alice]))[0].id;
    const storyPhoto = `story/${voyage}/${storyId}/0.webp`;
    await asUser(db, users.alice,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [storyPhoto, users.alice]);
    await asUser(db, users.alice,
      "update public.ahoier_stories set photo_path=$1 where id=$2", [storyPhoto, storyId]);
    await asUser(db, users.alice, "select public.ahoier_publish_story($1)", [storyId]);
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_stories where id=$1", [storyId]))[0].n, 1);
    assert.equal((await asUser(db, users.otherVoyage,
      "select count(*)::int as n from public.ahoier_stories where id=$1", [storyId]))[0].n, 0);
    await asUser(db, users.bob,
      "insert into public.ahoier_reports(story_id,reporter_id,reason,details) values($1,$2,'unsafe','')",
      [storyId, users.bob]);
    assert.deepEqual((await query(db,
      "select target_photo_paths from public.ahoier_reports where story_id=$1", [storyId]))[0]
      .target_photo_paths, [storyPhoto]);
    await query(db,
      `update public.ahoier_stories
       set published_at=now()-interval '49 hours', expires_at=now()-interval '25 hours'
       where id=$1`, [storyId]);
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_stories where id=$1", [storyId]))[0].n, 0);
    assert.equal((await asUser(db, users.moderator,
      "select count(*)::int as n from storage.objects where name=$1", [storyPhoto]))[0].n, 1);
    assert.equal((await asService(db,
      "select count(*)::int as n from public.ahoier_cleanup_candidates() where path=$1", [storyPhoto]))[0].n, 0);
    const storyReportId = (await query(db,
      "select id from public.ahoier_reports where story_id=$1", [storyId]))[0].id;
    await asUser(db, users.moderator,
      "select public.ahoier_moderate_report($1,'dismiss')", [storyReportId]);
    assert.equal((await asService(db,
      "select count(*)::int as n from public.ahoier_cleanup_candidates() where path=$1", [storyPhoto]))[0].n, 1);

    await asUser(db, users.bob,
      "insert into public.ahoier_reports(post_id,reporter_id,reason,details) values($1,$2,'spam','')",
      [postId, users.bob]);
    const report = (await query(db,
      "select id,target_photo_paths,target_body from public.ahoier_reports where post_id=$1", [postId]))[0];
    assert.deepEqual(report.target_photo_paths, [photo]);
    assert.equal(report.target_body, "");
    await asUser(db, users.alice, "select public.ahoier_remove_post($1)", [postId]);
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_posts where id=$1", [postId]))[0].n, 0);
    assert.equal((await asUser(db, users.moderator,
      "select count(*)::int as n from storage.objects where name=$1", [photo]))[0].n, 1);
    await asUser(db, users.alice, "delete from storage.objects where name=$1", [photo]);
    assert.equal((await query(db,
      "select count(*)::int as n from storage.objects where name=$1", [photo]))[0].n, 1);
    assert.equal((await asService(db,
      "select count(*)::int as n from public.ahoier_cleanup_candidates() where path=$1", [photo]))[0].n, 0);
    await asUser(db, users.moderator,
      "select public.ahoier_moderate_report($1,'hide')", [report.id]);
    await query(db,
      "update public.ahoier_posts set hidden_at=now()-interval '2 days' where id=$1", [postId]);
    assert.equal((await asService(db,
      "select count(*)::int as n from public.ahoier_cleanup_candidates() where path=$1", [photo]))[0].n, 1);
    assert.equal((await asService(db,
      "select count(*)::int as n from public.ahoier_cleanup_candidates() where path=$1", [replyPhoto]))[0].n, 1);
    // A reply that is still individually visible must lose its photo when its
    // parent post is hidden. Otherwise the binary is retained indefinitely.
    await query(db, "delete from storage.objects where name=$1", [replyPhoto]);
    await asService(db, "select public.ahoier_cleanup_ack(array[$1]::text[])", [replyPhoto]);
    assert.equal((await query(db,
      "select count(*)::int as n from public.ahoier_reply_photos where path=$1", [replyPhoto]))[0].n, 0);

    const requestId = (await asUser(db, users.alice,
      "select public.ahoier_send_friend_request($1) as id", [users.bob]))[0].id;
    await assert.rejects(asUser(db, users.alice,
      "select public.ahoier_send_message($1,'Too early')", [users.bob]));
    await asUser(db, users.bob,
      "select public.ahoier_respond_friend_request($1,true)", [requestId]);
    const messageId = (await asUser(db, users.alice,
      "select public.ahoier_send_message($1,'Hello') as id", [users.bob]))[0].id;
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_messages where id=$1", [messageId]))[0].n, 1);
    assert.equal((await asUser(db, users.otherVoyage,
      "select count(*)::int as n from public.ahoier_messages where id=$1", [messageId]))[0].n, 0);
    await asUser(db, users.bob,
      "insert into public.ahoier_reports(message_id,reporter_id,reason,details) values($1,$2,'harassment','')",
      [messageId, users.bob]);
    assert.equal((await query(db,
      "select target_body from public.ahoier_reports where message_id=$1", [messageId]))[0].target_body, "Hello");
    assert.equal((await asUser(db, users.otherVoyage,
      "select count(*)::int as n from public.ahoier_reports where message_id=$1", [messageId]))[0].n, 0);
    await asUser(db, users.alice, "select public.ahoier_remove_message($1)", [messageId]);
    assert.equal((await asUser(db, users.alice,
      "select count(*)::int as n from public.ahoier_messages where id=$1", [messageId]))[0].n, 0);
    assert.equal((await asUser(db, users.bob,
      "select count(*)::int as n from public.ahoier_messages where id=$1", [messageId]))[0].n, 1);
    await asUser(db, users.bob, "select public.ahoier_block_user($1)", [users.alice]);
    await assert.rejects(asUser(db, users.alice,
      "select public.ahoier_send_message($1,'Blocked')", [users.bob]));
    assert.equal((await asUser(db, users.alice,
      "select count(*)::int as n from public.ahoier_profiles where user_id=$1", [users.bob]))[0].n, 0);

    const avatar = `avatar/${users.bob}/first.webp`;
    const replacement = `avatar/${users.bob}/second.webp`;
    await asUser(db, users.bob,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [avatar, users.bob]);
    await asUser(db, users.bob,
      "update public.ahoier_profiles set avatar_path=$1 where user_id=$2", [avatar, users.bob]);
    await asUser(db, users.moderator,
      "insert into public.ahoier_reports(profile_id,reporter_id,reason,details) values($1,$2,'harassment','')",
      [users.bob, users.moderator]);
    const profileReport = (await query(db,
      "select id,target_body,target_photo_paths from public.ahoier_reports where profile_id=$1", [users.bob]))[0];
    assert.equal(profileReport.target_body, "bob");
    assert.deepEqual(profileReport.target_photo_paths, [avatar]);
    await asUser(db, users.bob,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [replacement, users.bob]);
    await asUser(db, users.bob,
      "update public.ahoier_profiles set avatar_path=$1 where user_id=$2", [replacement, users.bob]);
    await asUser(db, users.bob, "delete from storage.objects where name=$1", [avatar]);
    assert.equal((await query(db,
      "select count(*)::int as n from storage.objects where name=$1", [avatar]))[0].n, 1);
    assert.equal((await asUser(db, users.moderator,
      "select count(*)::int as n from storage.objects where name=$1", [avatar]))[0].n, 1);
    const thirdAvatar = `avatar/${users.bob}/third.webp`;
    await asUser(db, users.bob,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [thirdAvatar, users.bob]);
    await assert.rejects(asUser(db, users.bob,
      "insert into storage.objects(bucket_id,name,owner_id) values('ahoier-media',$1,$2)",
      [`avatar/${users.bob}/fourth.webp`, users.bob]));
    await asUser(db, users.moderator,
      "select public.ahoier_moderate_report($1,'hide')", [profileReport.id]);
    assert.equal((await asUser(db, users.bob,
      "select suspended_at is not null as yes from public.ahoier_my_profile()"))[0].yes, true);

    for (let draft = 0; draft < 8; draft++) {
      await asUser(db, users.alice,
        "insert into public.ahoier_posts(voyage_id,author_id,category,body,published_at) values($1,$2,'Frage','',null)",
        [voyage, users.alice]);
    }
    await assert.rejects(asUser(db, users.alice,
      "insert into public.ahoier_posts(voyage_id,author_id,category,body,published_at) values($1,$2,'Frage','',null)",
      [voyage, users.alice]));
  } finally {
    await db.close();
  }
});
