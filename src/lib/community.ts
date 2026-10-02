import { addDays, shipLocalDateTime } from "./journey.ts";

export const CATEGORIES = ["Frage", "Tipp", "Zusammen an Land", "Fundstück"] as const;
export const INTERESTS = ["Spiele", "Kulinarik", "Sport", "Musik", "Ausflüge", "Entspannt treffen"];
export const TRAVEL_GROUPS = ["solo", "couple", "family", "friends"] as const;
export type TravelGroup = "" | typeof TRAVEL_GROUPS[number];
export const TRAVEL_GROUP_LABELS: Record<Exclude<TravelGroup, "">, string> = {
  solo: "Allein",
  couple: "Zu zweit",
  family: "Mit Familie",
  friends: "Mit Freunden",
};
export type Profile = { name: string; bio: string; interests: string[]; travelGroup: TravelGroup; photo?: string; adultConfirmed?: boolean };
export type DemoPerson = { id: string; name: string; travelGroup: Exclude<TravelGroup, "">; interests: readonly string[]; intro: string };
// Fictional preview personas only. They are never registered users or voyage members.
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { id: "demo-lena", name: "Lena", travelGroup: "solo", interests: ["Spiele", "Musik"], intro: "Freut sich über eine kleine Spielrunde und neue Gespräche." },
  { id: "demo-ben", name: "Ben", travelGroup: "solo", interests: ["Sport", "Spiele"], intro: "Ist gern aktiv und probiert auch neue Brettspiele aus." },
  { id: "demo-tom", name: "Tom", travelGroup: "friends", interests: ["Kulinarik", "Musik"], intro: "Mag gutes Essen und entspannte Abende in Gesellschaft." },
  { id: "demo-mira", name: "Mira", travelGroup: "solo", interests: ["Entspannt treffen", "Ausflüge"], intro: "Lernt neue Menschen am liebsten bei einem Kaffee kennen." },
  { id: "demo-sara", name: "Sara", travelGroup: "family", interests: ["Spiele", "Ausflüge"], intro: "Sucht unkomplizierte Ideen für gemeinsame Familienzeit." },
  { id: "demo-lea", name: "Lea", travelGroup: "couple", interests: ["Musik", "Kulinarik"], intro: "Freut sich über nette Gespräche beim Essen oder Konzert." },
  { id: "demo-jan", name: "Jan", travelGroup: "friends", interests: ["Sport", "Ausflüge"], intro: "Entdeckt gern Neues und ist bei einem Spaziergang dabei." },
  { id: "demo-aylin", name: "Aylin", travelGroup: "solo", interests: ["Musik", "Entspannt treffen"], intro: "Findet, dass ein gutes Gespräch oft mit einem Ahoi beginnt." },
  { id: "demo-paul", name: "Paul", travelGroup: "couple", interests: ["Spiele", "Kulinarik"], intro: "Mag spontane Spielideen und gemeinsames Abendessen." },
  { id: "demo-nele", name: "Nele", travelGroup: "family", interests: ["Ausflüge", "Entspannt treffen"], intro: "Freut sich über ruhige Treffen mit anderen Familien." },
  { id: "demo-karim", name: "Karim", travelGroup: "solo", interests: ["Sport", "Musik"], intro: "Teilt gern Musiktipps und bewegt sich am liebsten draußen." },
  { id: "demo-frida", name: "Frida", travelGroup: "friends", interests: ["Kulinarik", "Ausflüge"], intro: "Probiert gern Neues und sammelt Ideen für Ausflüge." },
  { id: "demo-elias", name: "Elias", travelGroup: "solo", interests: ["Spiele", "Entspannt treffen"], intro: "Ist für eine lockere Runde ohne große Planung zu haben." },
  { id: "demo-maren", name: "Maren", travelGroup: "couple", interests: ["Musik", "Ausflüge"], intro: "Mag Live-Musik und gemeinsame Entdeckungen." },
  { id: "demo-noah", name: "Noah", travelGroup: "friends", interests: ["Sport", "Spiele"], intro: "Sucht nette Leute für eine kleine Runde zwischendurch." },
  { id: "demo-yasmin", name: "Yasmin", travelGroup: "solo", interests: ["Kulinarik", "Entspannt treffen"], intro: "Ein Kaffee und ein ehrliches Gespräch reichen ihr völlig." },
  { id: "demo-oskar", name: "Oskar", travelGroup: "family", interests: ["Spiele", "Sport"], intro: "Freut sich über einfache Ideen, bei denen alle mitmachen können." },
  { id: "demo-eva", name: "Eva", travelGroup: "couple", interests: ["Ausflüge", "Kulinarik"], intro: "Tauscht gern Tipps für gemeinsame Entdeckungen aus." },
  { id: "demo-david", name: "David", travelGroup: "solo", interests: ["Musik", "Sport"], intro: "Mag Bewegung, Musik und Begegnungen ohne Druck." },
  { id: "demo-mila", name: "Mila", travelGroup: "friends", interests: ["Entspannt treffen", "Spiele"], intro: "Findet, dass eine kleine Spielrunde schnell verbindet." },
];
export type Meeting = { id: string; author: string; name: string; title: string; place: string; date: string; time: string; capacity: number; members: string[]; memberCounts: Record<string, number>; description: string; familyFriendly: boolean; cancelled: boolean; demo: boolean };
export const DEMO_EMOJI = ["👍", "❤️", "😂", "😮", "🎉"] as const;
export type DemoEmoji = typeof DEMO_EMOJI[number];
export type DemoReactions = Record<string, DemoEmoji>;
export type DemoReply = { id: string; name: string; body: string; author?: string; photo?: string; reactions?: DemoReactions };
export type Post = { id: string; author: string; name: string; category: string; body: string; created: string; demo: boolean; replies: DemoReply[]; helpful: boolean; photos?: string[]; reactions?: DemoReactions };
export type Message = { id: string; meeting: string; body: string; name: string; created: string };
export type DemoStory = { id: string; author: string; name: string; caption: string; photo: string; created: string; expires: string; demo: boolean };
export type DemoDirectMessage = { id: string; person: string; body: string; created: string; from: "self" | "demo"; demo: boolean };
export type Space = { meetings: Meeting[]; posts: Post[]; messages: Message[]; hidden: string[]; blocked: string[]; stories?: DemoStory[]; friendRequests?: string[]; friends?: string[]; directMessages?: DemoDirectMessage[] };
export type CommunityState = { version: 1; profile: Profile; spaces: Record<string, Space>; friends?: string[]; friendRequests?: string[]; directMessages?: DemoDirectMessage[]; blockedPeople?: string[] };
export const SELF = "local-guest";
export const freshState = (): CommunityState => ({ version: 1, profile: { name: "", bio: "", interests: [], travelGroup: "" }, spaces: {}, friends: ["demo-lena"], friendRequests: [], blockedPeople: [], directMessages: [
  { id: "demo-hello", person: "demo-lena", body: "Beispielnachricht: Ahoi! So könnte ein privater Chat nach einer angenommenen Freundschaft aussehen.", created: "2026-10-01T10:15:00", from: "demo", demo: true },
] });

export function scopeKey(ship: string, from: string, to: string) { return `${ship}|${from}|${to}`; }
export function examples(from: string, to?: string, now: Date = new Date()): Space {
  const localNow = shipLocalDateTime(now);
  const scheduledDate = (time: string) => {
    if (to === undefined) return from;
    let day = from > localNow.date ? from : localNow.date;
    if (day === localNow.date && time <= localNow.time) day = addDays(day, 1);
    return day;
  };
  const demoMeetings: Meeting[] = [
      { id: "demo-games", author: "demo-lena", name: "Lena", title: "Spiele, Lachen & neue Gesichter", place: "Öffentlicher Treffpunkt – gemeinsam vereinbaren", date: scheduledDate("17:00"), time: "17:00", capacity: 6, members: ["demo-lena", "demo-ben"], memberCounts: { "demo-lena": 1, "demo-ben": 1 }, description: "Beispiel: Eine entspannte Runde Karten oder ein Brettspiel. Auch allein bist du willkommen! Der Treffpunkt wird in der Gruppe vereinbart.", familyFriendly: false, cancelled: false, demo: true },
      { id: "demo-dinner", author: "demo-tom", name: "Tom", title: "Zusammen schmeckt’s besser", place: "Öffentlicher Treffpunkt – gemeinsam vereinbaren", date: scheduledDate("18:30"), time: "18:30", capacity: 4, members: ["demo-tom"], memberCounts: { "demo-tom": 1 }, description: "Beispiel: Gesellschaft für ein gemeinsames Abendessen. Restaurant und Treffpunkt stimmen wir vorab ab. Keine Tischreservierung enthalten.", familyFriendly: false, cancelled: false, demo: true },
      { id: "demo-coffee", author: "demo-mira", name: "Mira", title: "Kaffee & Meer", place: "Öffentlicher Treffpunkt – gemeinsam vereinbaren", date: scheduledDate("15:00"), time: "15:00", capacity: 5, members: ["demo-mira"], memberCounts: { "demo-mira": 1 }, description: "Beispiel: Neue Menschen bei einem Kaffee kennenlernen. Auch allein bist du willkommen. Ganz ungezwungen, ohne festes Programm.", familyFriendly: false, cancelled: false, demo: true },
      { id: "demo-family", author: "demo-sara", name: "Sara", title: "Familien treffen sich zum Spielen", place: "Öffentlicher Treffpunkt – gemeinsam vereinbaren", date: scheduledDate("16:00"), time: "16:00", capacity: 10, members: ["demo-sara"], memberCounts: { "demo-sara": 1 }, description: "Beispiel: Eine lockere Spielrunde für Familien an Bord. Erwachsene stimmen den öffentlichen Treffpunkt gemeinsam ab.", familyFriendly: true, cancelled: false, demo: true },
  ];
  return {
    meetings: demoMeetings.filter(meeting => to === undefined || meeting.date <= to),
    posts: [
      { id: "demo-question", author: "demo-lena", name: "Lena", category: "Frage", body: "Wo würdet ihr euch für einen ruhigen Spielenachmittag treffen? Ich freue mich über eure Ideen!", created: `${from}T10:00:00`, demo: true, replies: [{ id: "demo-answer", name: "Mira", author: "demo-mira", body: "Beispielantwort: Ein öffentliches Café wäre ein guter Anfang.", reactions: { "demo-lena": "❤️" } }], helpful: false, reactions: { "demo-ben": "👍", "demo-mira": "❤️" } },
      { id: "demo-tip", author: "demo-mira", name: "Mira", category: "Tipp", body: "Allein unterwegs? Erst ein kleines Treffen mit wenigen Leuten ausprobieren – ein gemeinsamer Kaffee ist ein schöner Anfang.", created: `${from}T09:00:00`, demo: true, replies: [], helpful: false, reactions: { "demo-lena": "👍" } },
    ], messages: [], hidden: [], blocked: [],
  };
}

const string = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length <= max;
const list = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 500 && v.every(x => string(x, 200));
const date = (v: unknown): v is string => string(v, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validPartySize = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10;
const validTravelGroup = (v: unknown): v is TravelGroup => v === "" || (typeof v === "string" && (TRAVEL_GROUPS as readonly string[]).includes(v));
type LegacyMeeting = Omit<Meeting, "memberCounts" | "familyFriendly">;
function validLegacyMeeting(v: unknown): v is LegacyMeeting {
  return record(v) && [v.id, v.author, v.name, v.title, v.place, v.description].every(x => string(x)) && date(v.date) && string(v.time) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) && Number.isInteger(v.capacity) && Number(v.capacity) >= 2 && Number(v.capacity) <= 30 && list(v.members) && new Set(v.members).size === v.members.length && v.members.length <= Number(v.capacity) && typeof v.cancelled === "boolean" && typeof v.demo === "boolean";
}
function normalizeMeeting(v: unknown): Meeting | null {
  if (!validLegacyMeeting(v)) return null;
  const extra = v as LegacyMeeting & { familyFriendly?: unknown; memberCounts?: unknown };
  const familyFriendly = extra.familyFriendly === undefined ? false : extra.familyFriendly;
  if (typeof familyFriendly !== "boolean") return null;
  const rawCounts: unknown = extra.memberCounts === undefined
    ? Object.fromEntries(v.members.map(member => [member, 1]))
    : extra.memberCounts;
  if (!record(rawCounts) || Object.keys(rawCounts).length !== v.members.length) return null;
  let total = 0;
  const counts: [string, number][] = [];
  for (const member of v.members) {
    if (!Object.prototype.hasOwnProperty.call(rawCounts, member) || !validPartySize(rawCounts[member])) return null;
    total += rawCounts[member];
    counts.push([member, rawCounts[member]]);
  }
  if (total > v.capacity) return null;
  return { ...v, familyFriendly, memberCounts: Object.fromEntries(counts) };
}
function validPost(v: unknown): v is Post {
  return record(v) && [v.id, v.author, v.name, v.body, v.created].every(x => string(x)) && CATEGORIES.includes(v.category as typeof CATEGORIES[number]) && typeof v.demo === "boolean" && typeof v.helpful === "boolean" && Array.isArray(v.replies) && v.replies.length <= 100 && v.replies.every(r => record(r) && [r.id, r.name, r.body].every(x => string(x)));
}
const mediaKey = (v: unknown): v is string => typeof v === "string" && /^demo-media:[0-9a-f-]{36}$/.test(v);
function cleanReactions(v: unknown): DemoReactions {
  if (!record(v)) return {};
  return Object.fromEntries(Object.entries(v).slice(0, 100).filter(([person, emoji]) => string(person, 100) && (DEMO_EMOJI as readonly unknown[]).includes(emoji))) as DemoReactions;
}
function normalizePost(v: unknown): Post | null {
  if (!validPost(v)) return null;
  const reactions = cleanReactions(v.reactions);
  if (v.helpful && !reactions[SELF]) reactions[SELF] = "👍";
  return {
    ...v,
    photos: Array.isArray(v.photos) ? v.photos.filter(mediaKey).slice(0, 4) : [],
    reactions,
    replies: v.replies.map(reply => ({ id: reply.id, name: reply.name, body: reply.body,
      author: string(reply.author, 100) ? reply.author : undefined,
      photo: mediaKey(reply.photo) ? reply.photo : undefined,
      reactions: cleanReactions(reply.reactions),
    })),
  };
}
function normalizeStories(v: unknown): DemoStory[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 100).filter((story): story is DemoStory => record(story)
    && [story.id, story.author, story.name, story.caption, story.created, story.expires].every(x => string(x, 250))
    && mediaKey(story.photo) && typeof story.demo === "boolean");
}
function normalizeDirectMessages(v: unknown): DemoDirectMessage[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-500).filter((message): message is DemoDirectMessage => record(message)
    && [message.id, message.person, message.body, message.created].every(x => string(x, 1000))
    && (message.from === "self" || message.from === "demo") && typeof message.demo === "boolean");
}
export function decodeState(raw: string): CommunityState {
  try {
    const v: unknown = JSON.parse(raw);
    if (!record(v) || v.version !== 1 || !record(v.profile) || !string(v.profile.name, 40) || !string(v.profile.bio, 250) || !list(v.profile.interests) || !record(v.spaces)) return freshState();
    const spaces: Record<string, Space> = {};
    for (const [key, s] of Object.entries(v.spaces).slice(0, 100)) {
      if (!key.includes("|") || !record(s) || !Array.isArray(s.meetings) || !Array.isArray(s.posts) || !Array.isArray(s.messages) || !list(s.hidden) || !list(s.blocked)) continue;
      spaces[key] = { meetings: s.meetings.map(normalizeMeeting).filter((meeting): meeting is Meeting => meeting !== null).slice(0, 100), posts: s.posts.map(normalizePost).filter((post): post is Post => post !== null).slice(0, 100), messages: s.messages.filter((m): m is Message => record(m) && [m.id, m.meeting, m.body, m.name, m.created].every(x => string(x))).slice(-500), hidden: s.hidden, blocked: s.blocked,
        stories: normalizeStories(s.stories), friends: list(s.friends) ? s.friends.filter(id => DEMO_PEOPLE.some(person => person.id === id)).slice(0, 20) : [],
        friendRequests: list(s.friendRequests) ? s.friendRequests.filter(id => DEMO_PEOPLE.some(person => person.id === id)).slice(0, 20) : [],
        directMessages: normalizeDirectMessages(s.directMessages) };
    }
    const validPeople = (people: unknown) => list(people) ? people.filter(id => DEMO_PEOPLE.some(person => person.id === id)).slice(0, 20) : [];
    const defaults = freshState();
    return { version: 1, profile: { name: v.profile.name, bio: v.profile.bio, interests: v.profile.interests.filter(i => INTERESTS.includes(i)), travelGroup: validTravelGroup(v.profile.travelGroup) ? v.profile.travelGroup : "", photo: mediaKey(v.profile.photo) ? v.profile.photo : undefined, adultConfirmed: v.profile.adultConfirmed === true }, spaces,
      friends: v.friends === undefined ? defaults.friends : validPeople(v.friends),
      friendRequests: validPeople(v.friendRequests),
      blockedPeople: validPeople(v.blockedPeople),
      directMessages: v.directMessages === undefined ? defaults.directMessages : normalizeDirectMessages(v.directMessages),
    };
  } catch { return freshState(); }
}

export function isUpcomingMeeting(meeting: Pick<Meeting, "date" | "time" | "cancelled">, now: Date = new Date(), timeZone?: string): boolean {
  const localNow = shipLocalDateTime(now, timeZone);
  return !meeting.cancelled && `${meeting.date}T${meeting.time}` > `${localNow.date}T${localNow.time}`;
}

export function validateMeeting(m: Pick<Meeting, "title" | "description" | "place" | "date" | "time" | "capacity">, from: string, to: string, now: Date = new Date()): string | null {
  if (m.title.trim().length < 4 || m.title.length > 90) return "Bitte gib einen Titel mit 4–90 Zeichen ein.";
  if (!m.place.trim() || m.place.length > 120) return "Bitte nenne einen öffentlichen Treffpunkt (max. 120 Zeichen).";
  if (m.description.length > 1000) return "Bitte verwende höchstens 1000 Zeichen für die Beschreibung.";
  if (!date(m.date) || m.date < from || m.date > to) return "Das Treffen muss innerhalb deiner Reise liegen.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)) return "Bitte gib eine gültige Uhrzeit ein.";
  if (!Number.isInteger(m.capacity) || m.capacity < 2 || m.capacity > 30) return "Bitte wähle 2–30 Plätze inklusive dir.";
  if (!isUpcomingMeeting({ date: m.date, time: m.time, cancelled: false }, now)) return "Bitte wähle einen zukünftigen Termin in der Reisezeit.";
  return null;
}
export function memberPartySize(meeting: Meeting, member: string): number {
  if (!meeting.members.includes(member)) return 0;
  const count = Object.prototype.hasOwnProperty.call(meeting.memberCounts, member) ? meeting.memberCounts[member] : undefined;
  return validPartySize(count) ? count : 1;
}
export function attendeeCount(meeting: Meeting): number {
  return meeting.members.reduce((total, member) => total + memberPartySize(meeting, member), 0);
}
export function availablePlaces(meeting: Meeting): number {
  return Math.max(0, meeting.capacity - attendeeCount(meeting));
}
export function joinMeeting(meeting: Meeting, member: string, count = 1): Meeting {
  if (meeting.cancelled || !member || member.length > 200 || meeting.members.includes(member) || !validPartySize(count) || count > availablePlaces(meeting)) return meeting;
  return { ...meeting, members: [...meeting.members, member], memberCounts: { ...meeting.memberCounts, [member]: count } };
}
export function updateMeetingPartySize(meeting: Meeting, member: string, count: number): Meeting {
  if (meeting.cancelled || !meeting.members.includes(member) || !validPartySize(count)) return meeting;
  const current = memberPartySize(meeting, member);
  if (current === count || count - current > availablePlaces(meeting)) return meeting;
  return { ...meeting, memberCounts: { ...meeting.memberCounts, [member]: count } };
}
export function leaveMeeting(meeting: Meeting, member: string): Meeting {
  if (meeting.author === member || !meeting.members.includes(member)) return meeting;
  const memberCounts = { ...meeting.memberCounts };
  delete memberCounts[member];
  return { ...meeting, members: meeting.members.filter(m => m !== member), memberCounts };
}
