import assert from "node:assert/strict";
import test from "node:test";
import { instantForLocalTime, localTimeForInstant } from "../src/lib/meetup-time.ts";

test("converts a local meetup time using the organizer's selected zone", () => {
  assert.equal(instantForLocalTime("2026-10-05T16:00", "Europe/Berlin")?.toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(instantForLocalTime("2026-10-05T16:00", "UTC")?.toISOString(), "2026-10-05T16:00:00.000Z");
});

test("rejects a time skipped by daylight saving", () => {
  assert.equal(instantForLocalTime("2026-03-29T02:30", "Europe/Berlin"), null);
});

test("selects the first occurrence of a repeated daylight-saving time", () => {
  assert.equal(instantForLocalTime("2026-10-25T02:30", "Europe/Berlin")?.toISOString(), "2026-10-25T00:30:00.000Z");
});

test("rejects invalid local dates", () => {
  assert.equal(instantForLocalTime("2026-02-30T16:00", "Europe/Berlin"), null);
});

test("prepares the organizer's local date and time for editing", () => {
  assert.equal(localTimeForInstant("2026-10-05T14:00:00Z", "Europe/Berlin"), "2026-10-05T16:00");
});
