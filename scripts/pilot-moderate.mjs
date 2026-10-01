import { openPilotDb, rotatePilotCode } from "../src/lib/pilot-db.ts";
import { shipLocalDateTime } from "../src/lib/journey.ts";

function parseArgs(argv) {
  const options = {};
  const keys = new Set(["--db", "--voyage", "--cancel-meeting", "--hide-meeting", "--revoke-participant", "--rotate-code"]);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--reports") { options.reports = true; continue; }
    if (!keys.has(argv[i]) || !argv[i + 1] || options[argv[i]]) throw new Error(`Ungültiges Argument: ${argv[i]}`);
    options[argv[i]] = argv[++i];
  }
  if (!options["--voyage"] ||
      [options.reports, options["--cancel-meeting"], options["--hide-meeting"], options["--revoke-participant"], options["--rotate-code"]].filter(Boolean).length !== 1)
    throw new Error("Verwendung: --voyage ID (--reports | --cancel-meeting ID | --hide-meeting ID | --revoke-participant ID | --rotate-code ID) [--db PATH]");
  return options;
}

function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = work(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const db = openPilotDb(args["--db"]);
  try {
    const voyageId = args["--voyage"];
    const voyage = db.prepare("SELECT id,time_zone FROM voyages WHERE id=?").get(voyageId);
    if (!voyage) throw new Error("Reise nicht gefunden.");
    if (args.reports) {
      const reports = db.prepare(`SELECT r.id,r.created_at,r.reason,r.details,
        m.id AS meeting_id,m.title AS meeting_title,m.cancelled_at,
        author.id AS author_id,author.name AS author_name,
        reporter.id AS reporter_id,reporter.name AS reporter_name
        FROM reports r JOIN meetings m ON m.id=r.meeting_id
        JOIN participants author ON author.id=m.author_id
        JOIN participants reporter ON reporter.id=r.reporter_id
        WHERE m.voyage_id=? ORDER BY r.created_at DESC`).all(voyageId);
      process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
    } else if (args["--cancel-meeting"] || args["--hide-meeting"]) {
      const meetingId = args["--cancel-meeting"] ?? args["--hide-meeting"];
      transaction(db, () => {
        const meeting = db.prepare("SELECT id FROM meetings WHERE id=? AND voyage_id=?").get(meetingId, voyageId);
        if (!meeting) throw new Error("Treffen nicht gefunden.");
        db.prepare("UPDATE meetings SET cancelled_at=COALESCE(cancelled_at,?) WHERE id=?")
          .run(new Date().toISOString(), meetingId);
        if (args["--hide-meeting"]) db.prepare("INSERT OR IGNORE INTO hidden_meetings (meeting_id,hidden_at) VALUES (?,?)")
          .run(meetingId, new Date().toISOString());
      });
      process.stdout.write(args["--hide-meeting"] ? "Treffen abgesagt und für Gäste verborgen.\n" : "Treffen abgesagt.\n");
    } else if (args["--rotate-code"]) {
      const code = rotatePilotCode(db, voyageId, args["--rotate-code"]);
      process.stdout.write("Neuer persönlicher Zugangscode (nur jetzt sichtbar; alten Code vernichten):\n" + code + "\n");
    } else {
      const participantId = args["--revoke-participant"];
      const result = transaction(db, () => {
        const participant = db.prepare("SELECT id FROM participants WHERE id=? AND voyage_id=?")
          .get(participantId, voyageId);
        if (!participant) throw new Error("Gast nicht gefunden.");
        const { date, time } = shipLocalDateTime(new Date(), voyage.time_zone);
        const nowLocal = `${date}T${time}`;
        db.prepare("INSERT OR IGNORE INTO revoked_participants (participant_id,revoked_at) VALUES (?,?)")
          .run(participantId, new Date().toISOString());
        const sessions = db.prepare("DELETE FROM sessions WHERE participant_id=?").run(participantId).changes;
        const meetings = db.prepare(`UPDATE meetings SET cancelled_at=?
          WHERE author_id=? AND voyage_id=? AND cancelled_at IS NULL AND date || 'T' || time > ?`)
          .run(new Date().toISOString(), participantId, voyageId, nowLocal).changes;
        db.prepare(`DELETE FROM rsvps WHERE participant_id=? AND meeting_id IN
          (SELECT id FROM meetings WHERE voyage_id=? AND date || 'T' || time > ?)`)
          .run(participantId, voyageId, nowLocal);
        return { sessions, meetings };
      });
      process.stdout.write(`Persönlichen Code gesperrt; Sitzungen widerrufen: ${result.sessions}; künftige eigene Treffen abgesagt: ${result.meetings}.\n`);
    }
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Moderation fehlgeschlagen.");
  process.exitCode = 1;
}
