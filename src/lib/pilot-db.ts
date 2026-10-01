import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isUpcomingMeeting } from "./community.ts";
import { isISODate } from "./journey.ts";
import { SHIPS } from "./ships.ts";

const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_INVITES_PER_BATCH = 500;
const LEGACY_PILOT_TIME_ZONE = "Europe/Berlin";
const REASONS = ["spam", "unsafe", "harassment", "other"] as const;

type ParticipantRow = { id: string; name: string; voyage_id: string; ship: string; date_from: string; date_to: string; time_zone: string };
type StoredMeeting = { id: string; author_id: string; date: string; time: string; capacity: number; cancelled_at: string | null };
type MeetingRow = {
  id: string; author_id: string; author_name: string; title: string; description: string;
  place: string; date: string; time: string; capacity: number; family_friendly: number;
  cancelled_at: string | null; attendee_count: number; my_count: number; my_attendance: number | null;
};

export type PilotMeeting = {
  id: string; authorId: string; authorName: string; title: string; description: string;
  place: string; date: string; time: string; capacity: number; familyFriendly: boolean;
  cancelled: boolean; attendeeCount: number; myCount: number; myAttendance: boolean | null;
};
export type PilotState = { authenticated: false } | {
  authenticated: true;
  participant: { id: string; name: string };
  voyage: { id: string; ship: string; from: string; to: string; timeZone: string };
  meetings: PilotMeeting[];
};
export type PilotAction =
  | { action: "join"; code: string; name: string }
  | { action: "create"; title: string; description: string; place: string; date: string; time: string; capacity: number; familyFriendly: boolean }
  | { action: "rsvp"; meetingId: string; count: number }
  | { action: "leave"; meetingId: string }
  | { action: "cancel"; meetingId: string }
  | { action: "attendance"; meetingId: string; attended: boolean }
  | { action: "report"; meetingId: string; reason: typeof REASONS[number]; details?: string }
  | { action: "logout" };

export class PilotError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// The database is supplied by the single writable server at runtime, never bundled.
export const pilotDbPath = () => resolve(/* turbopackIgnore: true */ process.env.AHOIER_PILOT_DB || "data/ahoier-pilot.sqlite");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const nowISO = () => new Date().toISOString();
function fail(message: string, status = 400): never { throw new PilotError(message, status); }
function pathWithin(path: string, root: string): boolean {
  const normal = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const candidate = normal(path);
  const boundary = normal(root);
  return candidate === boundary || candidate.startsWith(boundary + sep);
}
function safePilotDbPath(path: string): string {
  if (path === ":memory:") return path;
  const resolved = resolve(path);
  const publicRoot = resolve(process.cwd(), "public");
  if (pathWithin(resolved, publicRoot)) fail("Pilot-Datenbank darf nicht im öffentlichen public/-Verzeichnis liegen.");
  mkdirSync(dirname(resolved), { recursive: true });
  const actualParent = realpathSync.native(dirname(resolved));
  const actualPublic = existsSync(publicRoot) ? realpathSync.native(publicRoot) : publicRoot;
  if (pathWithin(actualParent, actualPublic) || lstatSync(resolved, { throwIfNoEntry: false })?.isSymbolicLink())
    fail("Pilot-Datenbank darf nicht im öffentlichen public/-Verzeichnis liegen.");
  return resolved;
}
const hasOnlyText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
const validTime = (time: unknown): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100 || !/^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
  catch { return false; }
}

export function openPilotDb(path = pilotDbPath()): DatabaseSync {
  const db = new DatabaseSync(safePilotDbPath(path), { timeout: 5000 });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS voyages (
      id TEXT PRIMARY KEY, ship TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL,
      time_zone TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY, voyage_id TEXT NOT NULL REFERENCES voyages(id),
      name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revoked_participants (
      participant_id TEXT PRIMARY KEY REFERENCES participants(id), revoked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY, voyage_id TEXT NOT NULL REFERENCES voyages(id),
      claimed_by TEXT REFERENCES participants(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_participant ON sessions(participant_id);
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY, voyage_id TEXT NOT NULL REFERENCES voyages(id),
      author_id TEXT NOT NULL REFERENCES participants(id), title TEXT NOT NULL,
      description TEXT NOT NULL, place TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity BETWEEN 2 AND 30),
      family_friendly INTEGER NOT NULL CHECK(family_friendly IN (0,1)),
      cancelled_at TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS meetings_voyage_date ON meetings(voyage_id, date, time);
    CREATE TABLE IF NOT EXISTS hidden_meetings (
      meeting_id TEXT PRIMARY KEY REFERENCES meetings(id), hidden_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rsvps (
      meeting_id TEXT NOT NULL REFERENCES meetings(id),
      participant_id TEXT NOT NULL REFERENCES participants(id),
      party_count INTEGER NOT NULL CHECK(party_count BETWEEN 1 AND 10),
      attended INTEGER CHECK(attended IN (0,1)), created_at TEXT NOT NULL,
      PRIMARY KEY(meeting_id, participant_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id),
      reporter_id TEXT NOT NULL REFERENCES participants(id),
      reason TEXT NOT NULL CHECK(reason IN ('spam','unsafe','harassment','other')),
      details TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(meeting_id, reporter_id)
    );
  `);
  const voyageColumns = db.prepare("PRAGMA table_info(voyages)").all() as { name: string }[];
  if (!voyageColumns.some(column => column.name === "time_zone")) {
    // Legacy pilots had an implicit Berlin clock; preserve their previous interpretation.
    db.exec(`ALTER TABLE voyages ADD COLUMN time_zone TEXT NOT NULL DEFAULT '${LEGACY_PILOT_TIME_ZONE}'`);
  }
  return db;
}

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createVoyage(db: DatabaseSync, ship: string, from: string, to: string, timeZone: string): string {
  if (!SHIPS.includes(ship) || !isISODate(from) || !isISODate(to) || from > to ||
      (Date.parse(to) - Date.parse(from)) > 31 * 86400000 || !validTimeZone(timeZone))
    fail("Ungültige Pilot-Reise oder Zeitzone.");
  const id = randomUUID();
  db.prepare("INSERT INTO voyages (id,ship,date_from,date_to,time_zone,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, ship, from, to, timeZone, nowISO());
  return id;
}

export function issueInvites(db: DatabaseSync, voyageId: string, count: number): string[] {
  if (!validId(voyageId) || !Number.isInteger(count) || count < 1 || count > MAX_INVITES_PER_BATCH)
    fail("Ungültige Anzahl Einladungen.");
  if (!db.prepare("SELECT id FROM voyages WHERE id=?").get(voyageId)) fail("Reise nicht gefunden.", 404);
  return transaction(db, () => Array.from({ length: count }, () => {
    const code = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO invites (code_hash,voyage_id,created_at) VALUES (?,?,?)")
      .run(hash(code), voyageId, nowISO());
    return code;
  }));
}

// Local-operator operation: replace a leaked credential without changing guest data.
export function rotatePilotCode(db: DatabaseSync, voyageId: string, participantId: string): string {
  if (!validId(voyageId) || !validId(participantId)) fail("Ungültige Reise oder Gast-ID.");
  return transaction(db, () => {
    const participant = db.prepare("SELECT id FROM participants WHERE id=? AND voyage_id=?")
      .get(participantId, voyageId);
    if (!participant) fail("Gast nicht gefunden.", 404);
    if (db.prepare("SELECT participant_id FROM revoked_participants WHERE participant_id=?").get(participantId))
      fail("Gesperrte Gäste können keinen neuen Code erhalten.", 403);
    const code = randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM invites WHERE claimed_by=? AND voyage_id=?").run(participantId, voyageId);
    db.prepare("INSERT INTO invites (code_hash,voyage_id,claimed_by,created_at) VALUES (?,?,?,?)")
      .run(hash(code), voyageId, participantId, nowISO());
    db.prepare("DELETE FROM sessions WHERE participant_id=?").run(participantId);
    return code;
  });
}

function participantForToken(db: DatabaseSync, token: string | undefined): ParticipantRow | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (db.prepare(`SELECT p.id,p.name,p.voyage_id,v.ship,v.date_from,v.date_to,v.time_zone
    FROM sessions s JOIN participants p ON p.id=s.participant_id
    JOIN voyages v ON v.id=p.voyage_id
    WHERE s.token_hash=? AND s.expires_at>?
      AND NOT EXISTS (SELECT 1 FROM revoked_participants rp WHERE rp.participant_id=p.id)`)
    .get(hash(token), nowISO()) as ParticipantRow | undefined) ?? null;
}

export function readPilotState(db: DatabaseSync, token?: string): PilotState {
  const participant = participantForToken(db, token);
  if (!participant) return { authenticated: false };
  const rows = db.prepare(`SELECT m.id,m.author_id,p.name AS author_name,m.title,m.description,m.place,
      m.date,m.time,m.capacity,m.family_friendly,m.cancelled_at,
      COALESCE((SELECT SUM(r.party_count) FROM rsvps r WHERE r.meeting_id=m.id),0) AS attendee_count,
      COALESCE((SELECT r.party_count FROM rsvps r WHERE r.meeting_id=m.id AND r.participant_id=?),0) AS my_count,
      (SELECT r.attended FROM rsvps r WHERE r.meeting_id=m.id AND r.participant_id=?) AS my_attendance
    FROM meetings m JOIN participants p ON p.id=m.author_id
    WHERE m.voyage_id=? AND NOT EXISTS
      (SELECT 1 FROM hidden_meetings h WHERE h.meeting_id=m.id)
    ORDER BY m.date,m.time,m.created_at LIMIT 200`)
    .all(participant.id, participant.id, participant.voyage_id) as unknown as MeetingRow[];
  return {
    authenticated: true,
    participant: { id: participant.id, name: participant.name },
    voyage: { id: participant.voyage_id, ship: participant.ship, from: participant.date_from, to: participant.date_to,
      timeZone: participant.time_zone },
    meetings: rows.map(row => ({
      id: row.id, authorId: row.author_id, authorName: row.author_name, title: row.title,
      description: row.description, place: row.place, date: row.date, time: row.time,
      capacity: row.capacity, familyFriendly: !!row.family_friendly, cancelled: row.cancelled_at !== null,
      attendeeCount: row.attendee_count, myCount: row.my_count,
      myAttendance: row.my_attendance === null ? null : !!row.my_attendance,
    })),
  };
}

export function joinPilot(db: DatabaseSync, code: unknown, name: unknown): { token: string; state: PilotState } {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code) || !hasOnlyText(name, 2, 40))
    fail("Bitte gib Einladungscode und Namen ein.");
  const token = randomBytes(32).toString("base64url");
  transaction(db, () => {
    const invite = db.prepare("SELECT voyage_id,claimed_by FROM invites WHERE code_hash=?")
      .get(hash(code)) as { voyage_id: string; claimed_by: string | null } | undefined;
    if (!invite) fail("Einladung ungültig.", 409);
    let id = invite.claimed_by;
    if (id) {
      if (db.prepare("SELECT participant_id FROM revoked_participants WHERE participant_id=?").get(id))
        fail("Diese Einladung ist nicht mehr gültig.", 403);
    } else {
      id = randomUUID();
      db.prepare("INSERT INTO participants (id,voyage_id,name,created_at) VALUES (?,?,?,?)")
        .run(id, invite.voyage_id, (name as string).trim(), nowISO());
      db.prepare("UPDATE invites SET claimed_by=? WHERE code_hash=? AND claimed_by IS NULL")
        .run(id, hash(code));
    }
    const expiresAt = new Date(Date.now() + SESSION_AGE_SECONDS * 1000).toISOString();
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(nowISO());
    db.prepare("INSERT INTO sessions (token_hash,participant_id,expires_at) VALUES (?,?,?)")
      .run(hash(token), id, expiresAt);
    db.prepare(`DELETE FROM sessions WHERE participant_id=? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE participant_id=? ORDER BY rowid DESC LIMIT 5)`)
      .run(id, id);
  });
  return { token, state: readPilotState(db, token) };
}

function ownMeeting(db: DatabaseSync, participant: ParticipantRow, meetingId: unknown): StoredMeeting {
  if (!validId(meetingId)) fail("Ungültiges Treffen.");
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id=? AND voyage_id=?
    AND NOT EXISTS (SELECT 1 FROM hidden_meetings h WHERE h.meeting_id=meetings.id)`)
    .get(meetingId, participant.voyage_id) as StoredMeeting | undefined;
  if (!meeting) fail("Treffen nicht gefunden.", 404);
  return meeting;
}

export function applyPilotAction(db: DatabaseSync, token: string | undefined, action: Exclude<PilotAction, { action: "join" }>): PilotState {
  const participant = participantForToken(db, token);
  if (!participant) fail("Bitte zuerst mit Einladung beitreten.", 401);
  if (action.action === "logout") {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token!));
    return { authenticated: false };
  }
  transaction(db, () => {
    if (action.action === "create") {
      if (!hasOnlyText(action.title, 4, 90) || !hasOnlyText(action.place, 3, 120) ||
          typeof action.description !== "string" || action.description.length > 1000 ||
          !isISODate(action.date) || action.date < participant.date_from || action.date > participant.date_to ||
          !validTime(action.time) ||
          !Number.isInteger(action.capacity) || action.capacity < 2 || action.capacity > 30 ||
          typeof action.familyFriendly !== "boolean") fail("Bitte prüfe die Angaben zum Treffen.");
      if (!isUpcomingMeeting({ date: action.date, time: action.time, cancelled: false }, new Date(), participant.time_zone))
        fail("Bitte wähle einen zukünftigen Termin in der Reisezeit.");
      const createdCount = db.prepare("SELECT COUNT(*) AS n FROM meetings WHERE author_id=?")
        .get(participant.id) as { n: number };
      if (createdCount.n >= 10) fail("Maximal zehn Treffen pro Gast.", 409);
      const totalCount = db.prepare("SELECT COUNT(*) AS n FROM meetings WHERE voyage_id=?")
        .get(participant.voyage_id) as { n: number };
      if (totalCount.n >= 200) fail("Für diese Reise sind keine weiteren Treffen möglich.", 409);
      const id = randomUUID();
      db.prepare(`INSERT INTO meetings
        (id,voyage_id,author_id,title,description,place,date,time,capacity,family_friendly,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, participant.voyage_id, participant.id, action.title.trim(), action.description.trim(),
          action.place.trim(), action.date, action.time, action.capacity, action.familyFriendly ? 1 : 0, nowISO());
      db.prepare("INSERT INTO rsvps (meeting_id,participant_id,party_count,created_at) VALUES (?,?,1,?)")
        .run(id, participant.id, nowISO());
      return;
    }
    const meeting = ownMeeting(db, participant, action.meetingId);
    if (action.action === "rsvp") {
      if (!isUpcomingMeeting({ date: meeting.date, time: meeting.time, cancelled: !!meeting.cancelled_at }, new Date(), participant.time_zone))
        fail("Dieses Treffen ist nicht mehr offen.", 409);
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > 10) fail("Bitte wähle 1–10 Personen.");
      const occupied = db.prepare("SELECT COALESCE(SUM(party_count),0) AS n FROM rsvps WHERE meeting_id=?")
        .get(meeting.id) as { n: number };
      const current = db.prepare("SELECT party_count FROM rsvps WHERE meeting_id=? AND participant_id=?")
        .get(meeting.id, participant.id) as { party_count: number } | undefined;
      if (occupied.n - (current?.party_count ?? 0) + action.count > (meeting.capacity as number))
        fail("Leider sind nicht genug Plätze frei.", 409);
      db.prepare(`INSERT INTO rsvps (meeting_id,participant_id,party_count,created_at)
        VALUES (?,?,?,?) ON CONFLICT(meeting_id,participant_id)
        DO UPDATE SET party_count=excluded.party_count,attended=NULL`)
        .run(meeting.id, participant.id, action.count, nowISO());
      return;
    }
    if (action.action === "leave") {
      if (!isUpcomingMeeting({ date: meeting.date, time: meeting.time, cancelled: !!meeting.cancelled_at }, new Date(), participant.time_zone))
        fail("Dieses Treffen ist nicht mehr offen.", 409);
      if (meeting.author_id === participant.id) fail("Gastgeber können ihr Treffen nur absagen.", 403);
      db.prepare("DELETE FROM rsvps WHERE meeting_id=? AND participant_id=?")
        .run(meeting.id, participant.id);
      return;
    }
    if (action.action === "cancel") {
      if (meeting.author_id !== participant.id) fail("Nur der Gastgeber kann absagen.", 403);
      if (!isUpcomingMeeting({ date: meeting.date, time: meeting.time, cancelled: !!meeting.cancelled_at }, new Date(), participant.time_zone))
        fail("Dieses Treffen ist nicht mehr offen.", 409);
      db.prepare("UPDATE meetings SET cancelled_at=? WHERE id=?").run(nowISO(), meeting.id);
      return;
    }
    if (action.action === "attendance") {
      if (typeof action.attended !== "boolean") fail("Ungültige Teilnahmeangabe.");
      if (meeting.cancelled_at || isUpcomingMeeting({ date: meeting.date, time: meeting.time, cancelled: false }, new Date(), participant.time_zone))
        fail("Teilnahme ist erst nach dem Treffen möglich.", 409);
      const result = db.prepare("UPDATE rsvps SET attended=? WHERE meeting_id=? AND participant_id=?")
        .run(action.attended ? 1 : 0, meeting.id, participant.id);
      if (!result.changes) fail("Du bist für dieses Treffen nicht angemeldet.", 403);
      return;
    }
    if (action.action === "report") {
      if (meeting.author_id === participant.id) fail("Eigene Treffen können nicht gemeldet werden.", 403);
      if (!REASONS.includes(action.reason) || typeof action.details !== "string" && action.details !== undefined ||
          (action.details?.length ?? 0) > 500) fail("Bitte prüfe deine Meldung.");
      const existing = db.prepare("SELECT id FROM reports WHERE meeting_id=? AND reporter_id=?")
        .get(meeting.id, participant.id);
      if (existing) fail("Dieses Treffen wurde bereits gemeldet.", 409);
      db.prepare("INSERT INTO reports (id,meeting_id,reporter_id,reason,details,created_at) VALUES (?,?,?,?,?,?)")
        .run(randomUUID(), meeting.id, participant.id, action.reason, action.details?.trim() ?? "", nowISO());
    }
  });
  return readPilotState(db, token);
}

export const pilotSessionAgeSeconds = SESSION_AGE_SECONDS;
