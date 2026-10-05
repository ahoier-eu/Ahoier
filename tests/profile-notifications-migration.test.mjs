import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const unconfirmed = "44444444-4444-4444-8444-444444444444";
const voyage = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherVoyage = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

async function setup(db) {
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
    "20261005000000_ahoier_profile_notifications.sql",
  ]) {
    const file = new URL(`../supabase/migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, "utf8"));
  }
  // SQL Editor users sometimes rerun the same migration. It must stay safe.
  const latest = new URL("../supabase/migrations/20261005000000_ahoier_profile_notifications.sql", import.meta.url);
  await db.exec(readFileSync(latest, "utf8"));

  for (const id of [alice, bob, outsider, unconfirmed]) {
    await query(db, "insert into auth.users(id) values($1)", [id]);
    await query(db,
      "insert into public.ahoier_profiles(user_id,display_name,adult_confirmed_at) values($1,$2,$3)",
      [id, id === alice ? "Alice" : id === bob ? "Bob" : id === outsider ? "Outsider" : "New", id === unconfirmed ? null : new Date().toISOString()]);
  }
  await query(db, `insert into public.ahoier_voyages(id,ship,starts_on,ends_on)
    values($1,'AIDAcosma','2026-11-01','2026-11-10'),
          ($2,'AIDAperla','2026-12-01','2026-12-10')`, [voyage, otherVoyage]);
  for (const id of [alice, bob, unconfirmed]) {
    await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)", [voyage, id]);
  }
  await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)", [otherVoyage, outsider]);
}

test("profile bio and interests remain bounded and respect profile visibility", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await asUser(db, alice,
      "update public.ahoier_profiles set bio=$1,interests=$2 where user_id=$3",
      ["Kaffee an Deck", ["Kaffee", "Musik"], alice]);
    const own = (await asUser(db, alice, "select bio,interests from public.ahoier_my_profile()"))[0];
    assert.equal(own.bio, "Kaffee an Deck");
    assert.deepEqual(own.interests, ["Kaffee", "Musik"]);
    assert.equal((await asUser(db, bob,
      "select bio from public.ahoier_profiles where user_id=$1", [alice]))[0].bio,
      "Kaffee an Deck");
    assert.equal((await asUser(db, outsider,
      "select count(*)::int as n from public.ahoier_profiles where user_id=$1", [alice]))[0].n, 0);
    await assert.rejects(asUser(db, alice,
      "update public.ahoier_profiles set interests=$1 where user_id=$2", [["Kaffee", "Kaffee"], alice]));
    await assert.rejects(asUser(db, alice,
      "update public.ahoier_profiles set interests=$1 where user_id=$2", [["Unbekannt"], alice]));
    await assert.rejects(asUser(db, alice,
      "update public.ahoier_profiles set bio=$1 where user_id=$2", [" ".repeat(2) + "Text", alice]));
    await assert.rejects(asUser(db, alice,
      "update public.ahoier_profiles set bio=$1 where user_id=$2", ["x".repeat(161), alice]));
    assert.equal((await asUser(db, bob,
      "update public.ahoier_profiles set bio='forged' where user_id=$1 returning user_id", [alice])).length, 0);
    const latest = new URL("../supabase/migrations/20261005000000_ahoier_profile_notifications.sql", import.meta.url);
    await db.exec(readFileSync(latest, "utf8"));
    assert.equal((await asUser(db, alice,
      "select bio from public.ahoier_my_profile()"))[0].bio, "Kaffee an Deck");
  } finally {
    await db.close();
  }
});

test("notifications are generated from real actions and visible only to the recipient", async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await assert.rejects(asUser(db, alice,
      "insert into public.ahoier_notifications(recipient_id,actor_id,kind,message_id) values($1,$2,'message',gen_random_uuid())",
      [alice, bob]));

    const requestId = (await asUser(db, bob,
      "select public.ahoier_send_friend_request($1) as id", [alice]))[0].id;
    const pending = await asUser(db, alice,
      "select id,actor_id,kind from public.ahoier_notifications order by created_at");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].kind, "friend_request");
    assert.equal(pending[0].actor_id, bob);
    assert.equal((await asUser(db, outsider,
      "select count(*)::int as n from public.ahoier_notifications"))[0].n, 0);
    assert.equal((await asUser(db, unconfirmed,
      "select count(*)::int as n from public.ahoier_notifications"))[0].n, 0);
    await assert.rejects(asUser(db, outsider,
      "select public.ahoier_send_friend_request($1)", [alice]));
    assert.equal((await asUser(db, bob,
      "update public.ahoier_notifications set read_at=now() where id=$1 returning id", [pending[0].id])).length, 0);

    await asUser(db, alice,
      "select public.ahoier_respond_friend_request($1,true)", [requestId]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications"))[0].n, 0);
    assert.equal((await asUser(db, bob,
      "select kind from public.ahoier_notifications"))[0].kind, "friend_accepted");

    const messageId = (await asUser(db, bob,
      "select public.ahoier_send_message($1,'Private content') as id", [alice]))[0].id;
    const messageNotification = (await asUser(db, alice,
      "select id,kind,message_id,read_at from public.ahoier_notifications where kind='message'"))[0];
    assert.equal(messageNotification.message_id, messageId);
    assert.equal(messageNotification.read_at, null);
    assert.equal(Object.hasOwn(messageNotification, "body"), false);
    await asUser(db, alice,
      "update public.ahoier_notifications set read_at=now() where id=$1", [messageNotification.id]);
    assert.notEqual((await asUser(db, alice,
      "select read_at from public.ahoier_notifications where id=$1", [messageNotification.id]))[0].read_at, null);
    await assert.rejects(asUser(db, alice,
      "update public.ahoier_notifications set actor_id=$1 where id=$2", [outsider, messageNotification.id]));

    const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await asUser(db, alice,
      "insert into public.ahoier_posts(id,voyage_id,author_id,category,body) values($1,$2,$3,'Frage','Kaffee?')",
      [postId, voyage, alice]);
    const replyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await asUser(db, bob,
      "insert into public.ahoier_replies(id,post_id,author_id,body) values($1,$2,$3,'Gerne!')",
      [replyId, postId, bob]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reply'"))[0].n, 1);
    const draftReplyId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await asUser(db, bob,
      "insert into public.ahoier_replies(id,post_id,author_id,body,published_at) values($1,$2,$3,'Noch eine Idee',null)",
      [draftReplyId, postId, bob]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reply'"))[0].n, 1);
    await asUser(db, bob,
      "select public.ahoier_publish_reply($1)", [draftReplyId]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reply'"))[0].n, 2);
    await asUser(db, bob,
      "select public.ahoier_react($1,null,'👍')", [postId]);
    const reaction = (await asUser(db, alice,
      "select id,kind,post_id,reply_id,voyage_id from public.ahoier_notifications where kind='reaction'"))[0];
    assert.equal(reaction.post_id, postId);
    assert.equal(reaction.reply_id, null);
    assert.equal(reaction.voyage_id, voyage);
    await asUser(db, bob,
      "select public.ahoier_react($1,null,'❤️')", [postId]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reaction'"))[0].n, 1);
    await asUser(db, bob,
      "select public.ahoier_react($1,null,null)", [postId]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reaction'"))[0].n, 0);
    // Once the prior reaction is old, a new one reopens the same notice.
    await query(db, `update public.ahoier_notifications
      set created_at=now()-interval '25 hours',read_at=now()-interval '24 hours'
      where id=$1`, [reaction.id]);
    await asUser(db, bob,
      "select public.ahoier_react($1,null,'👍')", [postId]);
    assert.equal((await asUser(db, alice,
      "select read_at from public.ahoier_notifications where id=$1", [reaction.id]))[0].read_at, null);
    await assert.rejects(asUser(db, outsider,
      "select public.ahoier_react($1,null,'👍')", [postId]));
    await asUser(db, alice,
      "select public.ahoier_react(null,$1,'👍')", [replyId]);
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_notifications where kind='reaction' and reply_id=$1",
      [replyId]))[0].n, 1);
    await asUser(db, alice,
      "select public.ahoier_react($1,null,'👍')", [postId]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications where kind='reaction' and actor_id=$1",
      [alice]))[0].n, 0);

    await asUser(db, alice,
      "select public.ahoier_block_user($1)", [bob]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications"))[0].n, 0);
    await asUser(db, alice,
      "select public.ahoier_unblock_user($1)", [bob]);
    assert.equal((await asUser(db, alice,
      "select count(*)::int as n from public.ahoier_notifications"))[0].n, 0);
  } finally {
    await db.close();
  }
});
