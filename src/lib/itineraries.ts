import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseItineraries, type Journey, type FleetEntry } from "./journey.ts";
import { SHIPS } from "./ships.ts";

let cache: { path: string; stops: ReturnType<typeof parseItineraries> } | undefined;
export function allStops() {
  const path = process.env.AHOIER_ITINERARY_FILE || join(process.cwd(), "data/itineraries.csv");
  if (cache?.path === path) return cache.stops;
  let stops: ReturnType<typeof parseItineraries>;
  try {
    // An optional private dataset is supplied at runtime, never bundled into the build.
    stops = parseItineraries(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    stops = [];
  }
  cache = { path, stops };
  return stops;
}

export function getFleet(): FleetEntry[] {
  // The ship picker must work even when no optional itinerary file is installed.
  const entries = new Map<string, FleetEntry>(SHIPS.map(name => [name, { name, firstDate: "", lastDate: "", count: 0 }]));
  for (const stop of allStops()) {
    const current = entries.get(stop.ship);
    if (!current) continue;
    if (!current.firstDate || stop.date < current.firstDate) current.firstDate = stop.date;
    if (!current.lastDate || stop.date > current.lastDate) current.lastDate = stop.date;
    current.count++;
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getStops(journey: Journey) {
  return allStops().filter(s => s.ship === journey.ship && s.date >= journey.from && s.date <= journey.to);
}
