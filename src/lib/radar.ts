import { availablePlaces, type Meeting, type Profile } from "./community.ts";

export const RADAR_MODES = ["Alle", "Kaffee", "Spiele", "Kulinarik", "Landgang"] as const;
export type RadarMode = typeof RADAR_MODES[number];

const TERMS: Record<Exclude<RadarMode, "Alle">, string[]> = {
  Kaffee: ["kaffee", "café", "cafe", "plaudern", "kennenlernen"],
  Spiele: ["spiel", "quiz", "karte", "brett"],
  Kulinarik: ["essen", "abendessen", "restaurant", "kulinar", "frühstück", "fruehstueck"],
  Landgang: ["landgang", "hafen", "ausflug", "entdecken", "spaziergang"],
};

const INTERESTS: Partial<Record<RadarMode, string[]>> = {
  Kaffee: ["Entspannt treffen"], Spiele: ["Spiele"], Kulinarik: ["Kulinarik"], Landgang: ["Ausflüge"],
};

function text(value: string) { return value.toLocaleLowerCase("de-DE"); }
function mentions(meeting: Meeting, mode: Exclude<RadarMode, "Alle">): boolean {
  const words = text(`${meeting.title} ${meeting.description}`).split(/[^\p{L}]+/u);
  return TERMS[mode].some(term => words.some(word => word.startsWith(term)));
}

/** A transparent text match; no location, inferred personality or guest activity data. */
export function radarMeetings(meetings: Meeting[], mode: RadarMode, profile: Pick<Profile, "interests"> & Partial<Pick<Profile, "travelGroup">>): Meeting[] {
  const open = meetings.filter(meeting => !meeting.cancelled && availablePlaces(meeting) > 0);
  const filtered = mode === "Alle" ? open : open.filter(meeting => mentions(meeting, mode));
  return filtered.sort((a, b) => {
    const score = (meeting: Meeting) => {
      const modes = RADAR_MODES.filter((item): item is Exclude<RadarMode, "Alle"> => item !== "Alle");
      return modes.reduce((total, item) => total + (mentions(meeting, item) && profile.interests.some(interest => INTERESTS[item]?.includes(interest)) ? 1 : 0), profile.travelGroup === "family" && meeting.familyFriendly ? 1 : 0);
    };
    return score(b) - score(a) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
  });
}

export const CONVERSATION_PROMPTS = [
  "Welchen Ort auf der Reise möchtest du unbedingt entdecken?",
  "Was ist dein liebster Moment an einem Seetag?",
  "Welche Musik gehört für dich zu einem perfekten Abend an Bord?",
  "Was sollte man auf dieser Reise unbedingt zusammen ausprobieren?",
  "Reist du zum ersten Mal mit AIDA? Worauf freust du dich am meisten?",
  "Wer hat Lust auf eine kleine Runde Spiele oder einen Kaffee?",
] as const;
