import assert from "node:assert/strict";
import test from "node:test";
import { selectLiveSocialCompass } from "../src/lib/live-social-compass.ts";

const now = new Date("2026-10-05T12:00:00Z");

function meetup(id, starts_at, overrides = {}) {
  return {
    id, starts_at, capacity: 8, attendee_count: 2, joined_by_me: false,
    canceled_at: null, title: id, ...overrides,
  };
}

function post(id, created_at, category = "Frage", author_id = "visible") {
  return { id, created_at, category, author_id, body: id };
}

test("promotes the nearest joined meetup in the next 48 hours, even when it is full", () => {
  const nearOpen = meetup("open", "2026-10-05T13:00:00Z");
  const laterJoined = meetup("joined", "2026-10-06T14:00:00Z", {
    capacity: 8, attendee_count: 8, joined_by_me: true,
  });
  const earlierJoined = meetup("joined-sooner", "2026-10-05T20:00:00Z", {
    joined_by_me: true,
  });
  const choice = selectLiveSocialCompass({ meetups: [laterJoined, nearOpen, earlierJoined], posts: [], now });
  assert.deepEqual(choice, {
    kind: "meetup", meetup: earlierJoined, participation: "joined", spacesLeft: 6,
  });
  assert.deepEqual(selectLiveSocialCompass({ meetups: [nearOpen, laterJoined], posts: [], now }), {
    kind: "meetup", meetup: laterJoined, participation: "joined", spacesLeft: 0,
  });
});

test("includes the 48-hour boundary but does not promote later joined meetups", () => {
  const atBoundary = meetup("boundary", "2026-10-07T12:00:00Z", { joined_by_me: true });
  const beyond = meetup("beyond", "2026-10-07T12:00:01Z", { joined_by_me: true });
  const open = meetup("open", "2026-10-07T11:00:00Z");
  assert.equal(selectLiveSocialCompass({ meetups: [open, atBoundary], posts: [], now }).meetup.id, "boundary");
  assert.deepEqual(selectLiveSocialCompass({ meetups: [beyond, open], posts: [], now }), {
    kind: "meetup", meetup: open, participation: "available", spacesLeft: 6,
  });
});

test("selects nearest available meetup and skips full, canceled, past, or invalid events", () => {
  const available = meetup("available", "2026-10-06T16:00:00Z", { attendee_count: 7 });
  const meetups = [
    meetup("past", "2026-10-05T11:59:59Z"),
    meetup("now", "2026-10-05T12:00:00Z"),
    meetup("full", "2026-10-05T12:30:00Z", { attendee_count: 8 }),
    meetup("canceled", "2026-10-05T13:00:00Z", { canceled_at: "2026-10-05T09:00:00Z" }),
    meetup("joined-canceled", "2026-10-05T14:00:00Z", { joined_by_me: true, canceled_at: "2026-10-05T09:00:00Z" }),
    meetup("invalid", "invalid"), available,
  ];
  assert.deepEqual(selectLiveSocialCompass({ meetups, posts: [], now }), {
    kind: "meetup", meetup: available, participation: "available", spacesLeft: 1,
  });
});

test("falls back to the newest visible question", () => {
  const older = post("older", "2026-10-05T10:00:00Z");
  const newest = post("newest", "2026-10-05T11:00:00Z");
  const blocked = post("blocked", "2026-10-05T12:00:00Z", "Frage", "blocked-user");
  const visiblePosts = [older, post("tip", "2026-10-05T13:00:00Z", "Tipp"), newest, blocked]
    .filter(item => item.author_id !== "blocked-user");
  assert.deepEqual(selectLiveSocialCompass({
    meetups: [meetup("full", "2026-10-05T13:00:00Z", { attendee_count: 8 })],
    posts: visiblePosts, now,
  }), { kind: "question", post: newest });
});

test("returns an honest empty prompt when no eligible content exists", () => {
  assert.deepEqual(selectLiveSocialCompass({ meetups: [], posts: [], now }), { kind: "empty" });
  assert.deepEqual(selectLiveSocialCompass({
    meetups: [meetup("canceled", "2026-10-06T12:00:00Z", { canceled_at: "2026-10-05T09:00:00Z" })],
    posts: [post("tip", "2026-10-05T10:00:00Z", "Tipp")], now,
  }), { kind: "empty" });
});
