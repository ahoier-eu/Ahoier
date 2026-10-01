import { openPilotDb, createVoyage, issueInvites } from "../src/lib/pilot-db.ts";

function parseArgs(argv) {
  const allowed = new Set(["--ship", "--from", "--to", "--time-zone", "--voyage", "--invites", "--db"]);
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!allowed.has(key) || !argv[i + 1] || result[key]) throw new Error(`Ungültiges Argument: ${key ?? ""}`);
    result[key] = argv[i + 1];
  }
  return result;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const existing = args["--voyage"];
  if ((!existing && (!args["--ship"] || !args["--from"] || !args["--to"] || !args["--time-zone"])) ||
      (existing && (args["--ship"] || args["--from"] || args["--to"] || args["--time-zone"])) ||
      !args["--invites"]) {
    throw new Error("Verwendung: --ship AIDAcosma --from YYYY-MM-DD --to YYYY-MM-DD --time-zone Europe/Berlin --invites 20 [--db PATH] ODER --voyage ID --invites 20 [--db PATH]");
  }
  const count = Number(args["--invites"]);
  if (!Number.isInteger(count) || count < 1 || count > 500)
    throw new Error("Bitte 1–500 persönliche Codes pro Aufruf wählen.");
  const db = openPilotDb(args["--db"]);
  try {
    const voyageId = existing ?? createVoyage(db, args["--ship"], args["--from"], args["--to"], args["--time-zone"]);
    const codes = issueInvites(db, voyageId, count);
    process.stdout.write(`Pilot-Reise: ${voyageId}\n`);
    process.stdout.write("Persönliche Zugangscodes (nur jetzt sichtbar; privat und sicher aufbewahren):\n");
    for (const code of codes) process.stdout.write(`${code}\n`);
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Pilot konnte nicht eingerichtet werden.");
  process.exitCode = 1;
}
