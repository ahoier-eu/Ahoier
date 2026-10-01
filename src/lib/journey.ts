export type Stop = {
  id: string;
  cruise: string;
  title: string;
  ship: string;
  date: string;
  location: string;
  country: string;
  pier: string;
  arrival: string;
  departure: string;
  seaDay: boolean;
};

export type FleetEntry = { name: string; firstDate: string; lastDate: string; count: number };
export type Journey = { ship: string; from: string; to: string };

// Prototype-only clock assumption. Actual ship time can differ by itinerary and must be
// supplied by an authoritative source before meetings are shared with real guests.
export const PROTOTYPE_SHIP_TIME_ZONE = "Europe/Berlin";

export function shipLocalDateTime(now: Date = new Date(), timeZone = PROTOTYPE_SHIP_TIME_ZONE): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === name)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function dateLabel(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "UTC", ...options });
}

export function validateJourney(value: Journey, fleet: FleetEntry[]): string | null {
  if (!fleet.some(s => s.name === value.ship)) return "Bitte wähle ein verfügbares Schiff.";
  if (!isISODate(value.from) || !isISODate(value.to)) return "Bitte gib gültige Reisedaten ein.";
  if (value.to < value.from) return "Das Reiseende muss nach dem Beginn liegen.";
  if (Date.parse(value.to) - Date.parse(value.from) > 31 * 86400000) return "Bitte wähle höchstens 32 Reisetage.";
  return null;
}

// CSV fields may contain commas, doubled quotes and embedded line breaks.
export function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseItineraries(csv: string): Stop[] {
  const [header, ...rows] = parseCSV(csv);
  if (!header) return [];
  for (const required of ["ship", "date", "location"]) {
    if (!header.includes(required)) throw new Error(`Missing CSV column: ${required}`);
  }
  const stops = new Map<string, Stop>();
  for (const values of rows) {
    const row = Object.fromEntries(header.map((name, i) => [name, values[i]?.trim() ?? ""]));
    if (!row.ship || !isISODate(row.date) || !row.location) continue;
    const seaDay = /at sea|sea day|seetag/i.test(`${row.call_type} ${row.location}`);
    // Preserve distinct calls on the same day; only collapse equivalent rows.
    const key = `${row.ship}|${row.date}|${row.location}|${row.eta}|${row.etd}`;
    if (!stops.has(key)) stops.set(key, {
      id: key, cruise: row.cruise_nr, title: row.cruise_name, ship: row.ship,
      date: row.date, location: row.location, country: row.country,
      pier: row.pier, arrival: row.eta, departure: row.etd, seaDay,
    });
  }
  return [...stops.values()].sort((a, b) => a.date.localeCompare(b.date) || a.arrival.localeCompare(b.arrival));
}
