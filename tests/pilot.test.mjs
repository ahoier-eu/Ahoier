import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addDays } from "../src/lib/journey.ts";
import { shipLocalDateTime } from "../src/lib/journey.ts";
import {
  applyPilotAction, createVoyage, issueInvites, joinPilot, openPilotDb,
  readPilotState,
} from "../src/lib/pilot-db.ts";

const tomorrow = addDays(shipLocalDateTime().date, 1);
const meetingInput = { action: "create", title: "Kaffee an Deck", description: "Wir treffen uns am Café.",
  place: "Café auf Deck 5", date: tomorrow, time: "17:00", capacity: 3, familyFriendly: false };

function setup(ship = "AIDAcosma") {
  const db = openPilotDb(":memory:");
  const voyage = createVoyage(db, ship, tomorrow, addDays(tomorrow, 3), "Europe/Berlin");
  return { db, voyage };
}

function guest(db, voyage, name) {
  const [code] = issueInvites(db, voyage, 1);
  const { token } = joinPilot(db, code, name);
  return { code, token };
}

test("private codes recover the same participant while sessions remain separate", () => {
  const { db, voyage } = setup();
  try {
    const [code] = issueInvites(db, voyage, 1);
    assert.equal(db.prepare("SELECT code_hash FROM invites").get().code_hash.includes(code), false);
    const { token, state } = joinPilot(db, code, "Mira");
    assert.equal(state.authenticated, true);
    assert.equal(db.prepare("SELECT token_hash FROM sessions").get().token_hash.includes(token), false);
    const again = joinPilot(db, code, "Other");
    assert.equal(again.state.participant.id, state.participant.id);
    assert.equal(again.state.participant.name, "Mira");
    assert.notEqual(again.token, token);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants").get().n, 1);
    assert.deepEqual(readPilotState(db, "invalid"), { authenticated: false });
    assert.equal(readPilotState(db, token).authenticated, true);
    assert.deepEqual(applyPilotAction(db, token, { action: "logout" }), { authenticated: false });
    assert.deepEqual(readPilotState(db, token), { authenticated: false });
    assert.equal(readPilotState(db, again.token).authenticated, true);
  } finally { db.close(); }
});

test("sessions are capped at five per guest and expired sessions are pruned on join", () => {
  const { db, voyage } = setup();
  try {
    const [code] = issueInvites(db, voyage, 1);
    const tokens = Array.from({ length: 7 }, () => joinPilot(db, code, "Mira").token);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 5);
    assert.equal(readPilotState(db, tokens[0]).authenticated, false);
    assert.equal(readPilotState(db, tokens[2]).authenticated, true);
    db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE rowid=(SELECT MIN(rowid) FROM sessions)").run();
    joinPilot(db, code, "Mira");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at<'2020-01-01'").get().n, 0);
  } finally { db.close(); }
});

test("database cannot be opened under the project's public webroot", () => {
  const path = join(process.cwd(), "public", "pilot-security-test.sqlite");
  assert.throws(() => openPilotDb(path), /public\//);
  assert.equal(existsSync(path), false);
  const previous = process.env.AHOIER_PILOT_DB;
  try {
    process.env.AHOIER_PILOT_DB = path;
    assert.throws(() => openPilotDb(), /public\//);
  } finally {
    if (previous === undefined) delete process.env.AHOIER_PILOT_DB;
    else process.env.AHOIER_PILOT_DB = previous;
  }
});

test("meeting eligibility uses each voyage's configured IANA time zone", () => {
  const db = openPilotDb(":memory:");
  try {
    assert.throws(() => createVoyage(db, "AIDAcosma", tomorrow, addDays(tomorrow, 2), "Mars/Olympus"), { status: 400 });
    const kiritimatiNow = shipLocalDateTime(new Date(), "Pacific/Kiritimati");
    const from = kiritimatiNow.date;
    const to = addDays(from, 2);
    const ahead = createVoyage(db, "AIDAcosma", from, to, "Pacific/Kiritimati");
    const behind = createVoyage(db, "AIDAperla", from, to, "Pacific/Honolulu");
    const aheadGuest = guest(db, ahead, "Ahead");
    const behindGuest = guest(db, behind, "Behind");
    const input = { ...meetingInput, date: from, time: kiritimatiNow.time };
    assert.throws(() => applyPilotAction(db, aheadGuest.token, input), { status: 400 });
    const state = applyPilotAction(db, behindGuest.token, input);
    assert.equal(state.voyage.timeZone, "Pacific/Honolulu");
    assert.equal(state.meetings.length, 1);
  } finally { db.close(); }
});

test("existing voyages receive the previous Berlin assumption during schema migration", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahoier-pilot-migration-"));
  const path = join(temp, "pilot.sqlite");
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE voyages (id TEXT PRIMARY KEY, ship TEXT NOT NULL, date_from TEXT NOT NULL,
    date_to TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO voyages VALUES ('legacy','AIDAcosma','2026-10-01','2026-10-05','2026-09-01T00:00:00Z');`);
  old.close();
  try {
    const db = openPilotDb(path);
    try { assert.equal(db.prepare("SELECT time_zone FROM voyages WHERE id='legacy'").get().time_zone, "Europe/Berlin"); }
    finally { db.close(); }
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) unlinkSync(path + suffix);
    rmdirSync(temp);
  }
});

test("RSVP counts remain within capacity and can be adjusted atomically", () => {
  const { db, voyage } = setup();
  try {
    const host = guest(db, voyage, "Host");
    const mira = guest(db, voyage, "Mira");
    const ben = guest(db, voyage, "Ben");
    const made = applyPilotAction(db, host.token, meetingInput);
    const meetingId = made.meetings[0].id;
    const joined = applyPilotAction(db, mira.token, { action: "rsvp", meetingId, count: 2 });
    assert.equal(joined.meetings[0].attendeeCount, 3);
    assert.throws(() => applyPilotAction(db, ben.token, { action: "rsvp", meetingId, count: 1 }), { status: 409 });
    assert.equal(readPilotState(db, host.token).meetings[0].attendeeCount, 3);
    assert.throws(() => applyPilotAction(db, mira.token, { action: "rsvp", meetingId, count: 3 }), { status: 409 });
    applyPilotAction(db, mira.token, { action: "rsvp", meetingId, count: 1 });
    assert.equal(applyPilotAction(db, ben.token, { action: "rsvp", meetingId, count: 1 }).meetings[0].attendeeCount, 3);
  } finally { db.close(); }
});

test("voyages are isolated and only hosts can cancel", () => {
  const { db, voyage } = setup();
  try {
    const otherVoyage = createVoyage(db, "AIDAperla", tomorrow, addDays(tomorrow, 3), "Europe/Berlin");
    const host = guest(db, voyage, "Host");
    const peer = guest(db, voyage, "Peer");
    const outsider = guest(db, otherVoyage, "Outsider");
    const meetingId = applyPilotAction(db, host.token, meetingInput).meetings[0].id;
    assert.equal(readPilotState(db, outsider.token).meetings.length, 0);
    assert.throws(() => applyPilotAction(db, outsider.token, { action: "rsvp", meetingId, count: 1 }), { status: 404 });
    assert.throws(() => applyPilotAction(db, peer.token, { action: "cancel", meetingId }), { status: 403 });
    assert.throws(() => applyPilotAction(db, host.token, { action: "leave", meetingId }), { status: 403 });
    assert.equal(applyPilotAction(db, host.token, { action: "cancel", meetingId }).meetings[0].cancelled, true);
    assert.throws(() => applyPilotAction(db, peer.token, { action: "rsvp", meetingId, count: 1 }), { status: 409 });
  } finally { db.close(); }
});

test("reports stay private and duplicate reports are blocked", () => {
  const { db, voyage } = setup();
  try {
    const host = guest(db, voyage, "Host");
    const peer = guest(db, voyage, "Peer");
    const meetingId = applyPilotAction(db, host.token, meetingInput).meetings[0].id;
    const state = applyPilotAction(db, peer.token, { action: "report", meetingId, reason: "unsafe", details: "Unsafe spot" });
    assert.equal(JSON.stringify(state).includes("Unsafe spot"), false);
    assert.equal(JSON.stringify(readPilotState(db, host.token)).includes("unsafe"), false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reports").get().n, 1);
    assert.throws(() => applyPilotAction(db, peer.token, { action: "report", meetingId, reason: "spam" }), { status: 409 });
    assert.throws(() => applyPilotAction(db, undefined, { action: "create", ...meetingInput }), { status: 401 });
  } finally { db.close(); }
});

test("past meetings cannot be left or cancelled; attendance is a later self-report", () => {
  const { db, voyage } = setup();
  try {
    const host = guest(db, voyage, "Host");
    const peer = guest(db, voyage, "Peer");
    const meetingId = applyPilotAction(db, host.token, meetingInput).meetings[0].id;
    applyPilotAction(db, peer.token, { action: "rsvp", meetingId, count: 1 });
    db.prepare("UPDATE meetings SET date=? WHERE id=?")
      .run(addDays(shipLocalDateTime().date, -1), meetingId);
    assert.throws(() => applyPilotAction(db, peer.token, { action: "leave", meetingId }), { status: 409 });
    assert.throws(() => applyPilotAction(db, host.token, { action: "cancel", meetingId }), { status: 409 });
    assert.equal(applyPilotAction(db, peer.token, { action: "attendance", meetingId, attended: true })
      .meetings[0].myAttendance, true);
  } finally { db.close(); }
});

test("local moderation hides unsafe meetings and revokes participant sessions", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahoier-pilot-test-"));
  const path = join(temp, "pilot.sqlite");
  let db = openPilotDb(path);
  try {
    const voyage = createVoyage(db, "AIDAcosma", tomorrow, addDays(tomorrow, 3), "Europe/Berlin");
    const host = guest(db, voyage, "Host");
    const peer = guest(db, voyage, "Peer");
    const hostId = readPilotState(db, host.token).participant.id;
    const meetingId = applyPilotAction(db, host.token, meetingInput).meetings[0].id;
    applyPilotAction(db, peer.token, { action: "rsvp", meetingId, count: 1 });
    db.close();
    db = null;
    const script = fileURLToPath(new URL("../scripts/pilot-moderate.mjs", import.meta.url));
    const run = (...args) => spawnSync(process.execPath,
      ["--experimental-strip-types", script, "--voyage", voyage, ...args, "--db", path],
      { encoding: "utf8" });
    const rotate = run("--rotate-code", hostId);
    assert.equal(rotate.status, 0, rotate.stderr);
    const replacement = rotate.stdout.trim().split(/\r?\n/).at(-1);
    assert.match(replacement, /^[A-Za-z0-9_-]{43}$/);
    db = openPilotDb(path);
    assert.deepEqual(readPilotState(db, host.token), { authenticated: false });
    assert.throws(() => joinPilot(db, host.code, "Host"), { status: 409 });
    const recovered = joinPilot(db, replacement, "Other Name");
    assert.equal(recovered.state.participant.id, hostId);
    assert.equal(recovered.state.participant.name, "Host");
    assert.equal(recovered.state.meetings[0].attendeeCount, 2);
    db.close();
    db = null;
    const hide = run("--hide-meeting", meetingId);
    assert.equal(hide.status, 0, hide.stderr);
    db = openPilotDb(path);
    assert.equal(readPilotState(db, peer.token).meetings.length, 0);
    assert.throws(() => applyPilotAction(db, peer.token,
      { action: "report", meetingId, reason: "unsafe", details: "known ID" }), { status: 404 });
    db.close();
    db = null;
    const revoke = run("--revoke-participant", hostId);
    assert.equal(revoke.status, 0, revoke.stderr);
    db = openPilotDb(path);
    assert.deepEqual(readPilotState(db, recovered.token), { authenticated: false });
    assert.throws(() => joinPilot(db, replacement, "Host"), { status: 403 });
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) unlinkSync(path + suffix);
    rmdirSync(temp);
  }
});
