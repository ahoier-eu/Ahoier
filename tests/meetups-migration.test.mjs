import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const unconfirmed = "55555555-5555-4555-8555-555555555555";
const moderator = "66666666-6666-4666-8666-666666666666";
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
  const migrations = [
    "20261001000000_ahoier_shared_community.sql",
    "20261002000000_ahoier_open_voyages.sql",
    "20261003000000_ahoier_social_wall.sql",
    "20261005000000_ahoier_profile_notifications.sql",
    "20261006000000_ahoier_meetups.sql",
  ];
  for (const name of migrations) {
    const file = new URL(`../supabase/migrations/${name}`, import.meta.url);
    await db.exec(readFileSync(file, "utf8"));
  }
  const latest = new URL(`../supabase/migrations/${migrations.at(-1)}`, import.meta.url);
  await db.exec(readFileSync(latest, "utf8"));

  for (const id of [alice, bob, carol, outsider, unconfirmed, moderator]) {
    await query(db, "insert into auth.users(id) values($1)", [id]);
    await query(db,
      "insert into public.ahoier_profiles(user_id,display_name,adult_confirmed_at) values($1,$2,$3)",
      [id, `Guest ${id.slice(0, 4)}`, id === unconfirmed ? null : new Date().toISOString()]);
  }
  // Test dates stay valid when the suite is run after the migration date.
  const start = new Date(Date.now() + 30 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  const startsOn = start.toISOString().slice(0, 10);
  const endsOn = end.toISOString().slice(0, 10);
  await query(db, `insert into public.ahoier_voyages(id,ship,starts_on,ends_on)
    values($1,'AIDAcosma',$3,$4),($2,'AIDAperla',$3,$4)`,
  [voyage, otherVoyage, startsOn, endsOn]);
  for (const id of [alice, bob, carol, unconfirmed, moderator]) {
    await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)", [voyage, id]);
  }
  await query(db, "insert into public.ahoier_memberships(voyage_id,user_id) values($1,$2)",
    [otherVoyage, outsider]);
  await query(db, "insert into ahoier_private.ahoier_moderators(user_id) values($1)", [moderator]);
  return new Date(start.getTime() + 4 * 3600000).toISOString();
}

const create = "select public.ahoier_create_meetup($1,$2,$3,$4,$5,$6,$7) as id";

test("meetups enforce voyage, adult access, capacity and host actions", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const args = [voyage, "Coffee together", "An informal meetup", "Public cafe", startsAt, "UTC", 2];
    const id = (await asUser(db, alice, create, args))[0].id;
    assert.equal((await asUser(db, bob,
      "select attendee_count,joined_by_me from public.ahoier_meetup_summary($1) where id=$2",
      [voyage, id]))[0].attendee_count, 1);
    assert.equal((await asUser(db, outsider,
      "select count(*)::int as n from public.ahoier_meetups where id=$1", [id]))[0].n, 0);
    assert.equal((await asUser(db, unconfirmed,
      "select count(*)::int as n from public.ahoier_meetups where id=$1", [id]))[0].n, 0);
    await assert.rejects(asUser(db, outsider, create, args));
    await assert.rejects(asUser(db, unconfirmed, create, args));
    await assert.rejects(asUser(db, alice,
      "insert into public.ahoier_meetup_rsvps(meetup_id,user_id) values($1,$2)", [id, alice]));
    await assert.rejects(asUser(db, alice, "select public.ahoier_rsvp_meetup($1)", [id]));
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    assert.equal((await asUser(db, bob,
      "select attendee_count,joined_by_me from public.ahoier_meetup_summary($1) where id=$2",
      [voyage, id]))[0].attendee_count, 2);
    await assert.rejects(asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]), /full/i);
    await assert.rejects(asUser(db, outsider, "select public.ahoier_rsvp_meetup($1)", [id]));
    await assert.rejects(asUser(db, unconfirmed, "select public.ahoier_rsvp_meetup($1)", [id]));
    assert.deepEqual((await asUser(db, carol,
      "select display_name,is_organizer from public.ahoier_meetup_attendees($1)", [id]))
      .map(row => row.is_organizer), [true, false]);
    await assert.rejects(asUser(db, alice,
      "select public.ahoier_update_meetup($1,$2,$3,$4,$5,$6,$7)",
      [id, "Coffee together", "An informal meetup", "Public cafe", startsAt, "UTC", 1]));
    await assert.rejects(asUser(db, bob, "select public.ahoier_cancel_meetup($1)", [id]));
    await asUser(db, bob, "select public.ahoier_leave_meetup($1)", [id]);
    await asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, alice, "select public.ahoier_cancel_meetup($1)", [id]);
    assert.equal((await asUser(db, carol,
      "select kind from public.ahoier_notifications where meetup_id=$1", [id]))[0].kind,
    "meetup_canceled");
    await assert.rejects(asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]));
  } finally {
    await db.close();
  }
});

test("meetup changes notify attendees, reporting can hide content, and blocks filter names", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const args = [voyage, "Board games", "Bring a game", "Public lounge", startsAt, "UTC", 3];
    const id = (await asUser(db, alice, create, args))[0].id;
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, alice,
      "select public.ahoier_update_meetup($1,$2,$3,$4,$5,$6,$7)",
      [id, "Board games", "Bring cards", "Public lounge", startsAt, "UTC", 3]);
    assert.equal((await asUser(db, bob,
      "select kind from public.ahoier_notifications where meetup_id=$1", [id]))[0].kind,
    "meetup_changed");
    await asUser(db, bob,
      "insert into public.ahoier_reports(meetup_id,reporter_id,reason,details) values($1,$2,'unsafe','')",
      [id, bob]);
    const reportId = (await query(db,
      "select id from public.ahoier_reports where meetup_id=$1", [id]))[0].id;
    assert.match((await query(db,
      "select target_body from public.ahoier_reports where id=$1", [reportId]))[0].target_body,
    /Board games/);
    await assert.rejects(asUser(db, alice,
      "insert into public.ahoier_reports(meetup_id,reporter_id,reason,details) values($1,$2,'unsafe','')",
      [id, alice]));
    await asUser(db, carol, "select public.ahoier_block_user($1)", [bob]);
    assert.deepEqual((await asUser(db, carol,
      "select user_id from public.ahoier_meetup_attendees($1)", [id]))
      .map(row => row.user_id), [alice, carol]);
    await asUser(db, moderator, "select public.ahoier_moderate_report($1,'hide')", [reportId]);
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_meetup_summary($1)", [voyage]))[0].n, 0);
    assert.equal((await query(db,
      "select status from public.ahoier_reports where id=$1", [reportId]))[0].status, "hidden");
    assert.equal((await asUser(db, bob,
      "select kind from public.ahoier_notifications where meetup_id=$1", [id]))[0].kind,
    "meetup_removed");
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_meetups where id=$1", [id]))[0].n, 0);
  } finally {
    await db.close();
  }
});

test("blocking a meetup host releases the RSVP place", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const id = (await asUser(db, alice, create,
      [voyage, "Coffee together", "", "Public cafe", startsAt, "UTC", 2]))[0].id;
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, bob, "select public.ahoier_block_user($1)", [alice]);
    assert.equal((await query(db,
      "select count(*)::int as n from public.ahoier_meetup_rsvps where meetup_id=$1", [id]))[0].n, 0);
    assert.equal((await asUser(db, carol,
      "select attendee_count from public.ahoier_meetup_summary($1) where id=$2",
      [voyage, id]))[0].attendee_count, 1);
    await asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]);
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_meetup_summary($1)", [voyage]))[0].n, 0);
  } finally {
    await db.close();
  }
});

test("suspension removes a guest place and hides a host's future meetup", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const id = (await asUser(db, alice, create,
      [voyage, "Coffee together", "", "Public cafe", startsAt, "UTC", 3]))[0].id;
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]);
    await query(db, "update public.ahoier_profiles set suspended_at=now() where user_id=$1", [bob]);
    assert.equal((await query(db,
      "select count(*)::int as n from public.ahoier_meetup_rsvps where meetup_id=$1", [id]))[0].n, 1);
    await query(db, "update public.ahoier_profiles set suspended_at=now() where user_id=$1", [alice]);
    assert.equal((await asUser(db, carol,
      "select count(*)::int as n from public.ahoier_meetup_summary($1)", [voyage]))[0].n, 0);
    assert.equal((await asUser(db, carol,
      "select kind from public.ahoier_notifications where meetup_id=$1", [id]))[0].kind,
    "meetup_removed");
  } finally {
    await db.close();
  }
});

test("withdrawing adult confirmation also releases the RSVP place", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const id = (await asUser(db, alice, create,
      [voyage, "Coffee together", "", "Public cafe", startsAt, "UTC", 2]))[0].id;
    await asUser(db, bob, "select public.ahoier_rsvp_meetup($1)", [id]);
    await asUser(db, bob,
      "update public.ahoier_profiles set adult_confirmed_at=null where user_id=$1", [bob]);
    assert.equal((await query(db,
      "select count(*)::int as n from public.ahoier_meetup_rsvps where meetup_id=$1", [id]))[0].n, 0);
    await asUser(db, carol, "select public.ahoier_rsvp_meetup($1)", [id]);
  } finally {
    await db.close();
  }
});

test("meetup time requires host-selected IANA zone and a future voyage date", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    const args = [voyage, "Coffee together", "", "Public cafe", startsAt, "UTC", 3];
    await assert.rejects(asUser(db, alice, create, [...args.slice(0, 5), "Fake/Nowhere", 3]));
    await assert.rejects(asUser(db, alice, create, [...args.slice(0, 4),
      new Date(Date.now() + 3600000).toISOString(), "UTC", 3]));
    await assert.rejects(asUser(db, alice, create, [...args.slice(0, 4),
      new Date(Date.now() - 3600000).toISOString(), "UTC", 3]));
    await assert.rejects(asUser(db, alice, create, [...args.slice(0, 6), 31]));
    await assert.rejects(asUser(db, alice, create, [...args.slice(0, 1),
      "  Untrimmed", ...args.slice(2)]));
  } finally {
    await db.close();
  }
});

test("voyage-wide cap keeps every active future meetup in the bounded summary", async () => {
  const db = new PGlite();
  try {
    const startsAt = await setup(db);
    await query(db, `insert into public.ahoier_meetups
      (voyage_id,organizer_id,title,description,location_label,starts_at,time_zone,capacity)
      select $1,$2,'Open coffee','', 'Public cafe',$3,'UTC',2
      from generate_series(1,100)`, [voyage, alice, startsAt]);
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_meetup_summary($1)", [voyage]))[0].n, 100);
    await assert.rejects(asUser(db, bob, create,
      [voyage, "Another coffee", "", "Public cafe", startsAt, "UTC", 2]),
    /Too many upcoming meetups/i);
    const firstId = (await query(db,
      "select id from public.ahoier_meetups where voyage_id=$1 order by id limit 1", [voyage]))[0].id;
    await asUser(db, alice, "select public.ahoier_cancel_meetup($1)", [firstId]);
    await asUser(db, bob, create,
      [voyage, "Another coffee", "", "Public cafe", startsAt, "UTC", 2]);
    assert.equal((await asUser(db, bob,
      "select count(*)::int as n from public.ahoier_meetup_summary($1) where canceled_at is null",
      [voyage]))[0].n, 100);
  } finally {
    await db.close();
  }
});
