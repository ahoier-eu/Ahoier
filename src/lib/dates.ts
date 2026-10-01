export const DATE_INTENTS = ["Kennenlernen", "Dates", "Unverbindlich"] as const;
export const DATE_GENDERS = ["Männer", "Frauen", "Nichtbinäre Personen"] as const;
export const DATE_STATUSES = ["single", "relationship", "open", "private"] as const;

export type DateIntent = typeof DATE_INTENTS[number];
export type DateGender = typeof DATE_GENDERS[number];
export type DateStatus = typeof DATE_STATUSES[number];
export type DatePreferences = {
  version: 1;
  active: true;
  age: number;
  intent: DateIntent;
  preferred: DateGender[];
  minAge: number;
  maxAge: number;
  status: DateStatus;
  about: string;
  consentedAt: string;
};

export const STATUS_LABELS: Record<DateStatus, string> = {
  single: "Single",
  relationship: "In einer Beziehung",
  open: "In einer offenen Beziehung",
  private: "Möchte ich nicht angeben",
};

export function validateDatePreferences(value: Omit<DatePreferences, "version" | "active" | "consentedAt">): string | null {
  if (!Number.isInteger(value.age) || value.age < 18 || value.age > 120) return "Ahoi Dates ist nur für Erwachsene ab 18 Jahren.";
  if (!DATE_INTENTS.includes(value.intent)) return "Bitte wähle, was du suchst.";
  if (!Array.isArray(value.preferred) || value.preferred.length < 1 || value.preferred.length > DATE_GENDERS.length || new Set(value.preferred).size !== value.preferred.length || value.preferred.some(gender => !DATE_GENDERS.includes(gender))) return "Bitte wähle mindestens eine Personengruppe.";
  if (!Number.isInteger(value.minAge) || !Number.isInteger(value.maxAge) || value.minAge < 18 || value.maxAge > 120 || value.minAge > value.maxAge) return "Bitte prüfe deinen gewünschten Altersbereich.";
  if (!DATE_STATUSES.includes(value.status)) return "Bitte wähle einen Beziehungsstatus oder 'möchte ich nicht angeben'.";
  if (typeof value.about !== "string" || value.about.length > 180) return "Deine Vorstellung darf höchstens 180 Zeichen haben.";
  return null;
}

export function decodeDatePreferences(raw: string): DatePreferences | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Partial<DatePreferences>;
    if (item.version !== 1 || item.active !== true || !Array.isArray(item.preferred) || typeof item.about !== "string" || typeof item.consentedAt !== "string" || !Number.isFinite(Date.parse(item.consentedAt))) return null;
    const draft = { age: item.age!, intent: item.intent!, preferred: item.preferred, minAge: item.minAge!, maxAge: item.maxAge!, status: item.status!, about: item.about };
    return validateDatePreferences(draft) ? null : item as DatePreferences;
  } catch { return null; }
}
