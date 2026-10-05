type TimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function zoneParts(value: Date, timeZone: string): TimeParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return fields as TimeParts;
}

export function localTimeForInstant(instant: string, timeZone: string): string {
  const parts = zoneParts(new Date(instant), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

// Resolve a wall-clock time in the organizer's selected IANA zone. A daylight
// saving gap is rejected; a repeated time takes its first occurrence.
export function instantForLocalTime(localTime: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(naive);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() + 1 !== month || normalized.getUTCDate() !== day || normalized.getUTCHours() !== hour || normalized.getUTCMinutes() !== minute) return null;
  const desired: TimeParts = { year, month, day, hour, minute };
  const offsets = new Set<number>();
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    const parts = zoneParts(new Date(probe), timeZone);
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - probe);
  }
  const matches = [...offsets].map(offset => new Date(naive - offset)).filter(candidate => {
    const parts = zoneParts(candidate, timeZone);
    return Object.entries(desired).every(([key, value]) => parts[key as keyof TimeParts] === value);
  });
  return matches.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}
