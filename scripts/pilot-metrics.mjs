import { openPilotDb } from "../src/lib/pilot-db.ts";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--reports") { result.reports = true; continue; }
    if ((argv[i] === "--voyage" || argv[i] === "--db") && argv[i + 1] && !result[argv[i]]) {
      result[argv[i]] = argv[++i]; continue;
    }
    throw new Error(`Ungültiges Argument: ${argv[i]}`);
  }
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const db = openPilotDb(args["--db"]);
  try {
    const voyages = db.prepare("SELECT id,ship,date_from,date_to,time_zone FROM voyages ORDER BY created_at DESC").all();
    const voyage = args["--voyage"]
      ? voyages.find(row => row.id === args["--voyage"])
      : voyages.length === 1 ? voyages[0] : null;
    if (!voyage) throw new Error("Bitte --voyage ID angeben (oder zuerst eine Reise anlegen).");
    const id = voyage.id;
    const counts = {
      invites: db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN claimed_by IS NOT NULL THEN 1 ELSE 0 END) AS used FROM invites WHERE voyage_id=?").get(id),
      participants: db.prepare("SELECT COUNT(*) AS total FROM participants WHERE voyage_id=?").get(id),
      meetings: db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN cancelled_at IS NULL THEN 1 ELSE 0 END) AS active FROM meetings WHERE voyage_id=?").get(id),
      reservations: db.prepare(`SELECT COUNT(*) AS bookings, COALESCE(SUM(r.party_count),0) AS places,
        SUM(CASE WHEN r.attended=1 THEN 1 ELSE 0 END) AS attended_yes,
        SUM(CASE WHEN r.attended=0 THEN 1 ELSE 0 END) AS attended_no
        FROM rsvps r JOIN meetings m ON m.id=r.meeting_id WHERE m.voyage_id=?`).get(id),
      reports: db.prepare("SELECT reason,COUNT(*) AS total FROM reports r JOIN meetings m ON m.id=r.meeting_id WHERE m.voyage_id=? GROUP BY reason").all(id),
    };
    process.stdout.write(JSON.stringify({ voyage, ...counts }, null, 2) + "\n");
    if (args.reports) {
      const reports = db.prepare(`SELECT r.id,r.created_at,r.reason,r.details,m.title AS meeting,
        p.name AS reporter FROM reports r JOIN meetings m ON m.id=r.meeting_id
        JOIN participants p ON p.id=r.reporter_id WHERE m.voyage_id=? ORDER BY r.created_at DESC`).all(id);
      process.stdout.write("Private Meldungen (nur lokal):\n" + JSON.stringify(reports, null, 2) + "\n");
    }
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Metriken nicht verfügbar.");
  process.exitCode = 1;
}
