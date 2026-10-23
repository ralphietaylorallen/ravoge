/** Shared, bounded intake data. No authorization or medical clearance is inferred here. */
export const INTAKE_GOALS = [["fat_loss", "Weight loss"], ["muscle_gain", "Muscle growth"], ["mobility", "Mobility"]] as const;
export const BODY_REGIONS = ["head", "neck", "shoulder", "upper_arm", "elbow", "forearm", "wrist", "hand", "chest", "upper_back", "lower_back", "abdomen", "hip", "thigh", "knee", "calf", "ankle", "foot"] as const;
export const HISTORY_CATEGORIES = [["recent_injury", "Recent injury"], ["long_term", "Long-term issue"], ["surgery", "Surgically repaired"], ["unexplained_pain", "Pain/discomfort without a known injury"]] as const;
export type InjurySpot = {
  id: string; region: typeof BODY_REGIONS[number]; side: "left" | "right" | "midline"; view: "front" | "back";
  categories: typeof HISTORY_CATEGORIES[number][0][]; onset: string; sensation: string; pain: number | null;
  occurrence: ("rest" | "movement" | "after_activity")[]; triggers: string; limitations: string;
  clinicianInstructions: "yes" | "no" | "unsure"; clinicianDetails: string; notes: string;
  surgeryRepair: string; surgeryWhen: string; postoperativeRestrictions: string;
};
export type IntakeContext = {
  version: 2; age: number | null; currentWeightLb: number | null; recentWorkoutDays: number | null;
  success: string; targetDate: string | null; outsideActivity: string; outsideFrequency: string;
  sleepHours: number | null; barriers: string[]; goalTarget: string;
  noInjuryReport: boolean;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function emptySpot(): InjurySpot {
  return { id: crypto.randomUUID(), region: "knee", side: "left", view: "front", categories: [], onset: "", sensation: "", pain: null,
    occurrence: [], triggers: "", limitations: "", clinicianInstructions: "unsure", clinicianDetails: "", notes: "",
    surgeryRepair: "", surgeryWhen: "", postoperativeRestrictions: "" };
}
export function validateInjurySpot(value: unknown): InjurySpot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review this spot’s answers.");
  const s = value as InjurySpot;
  const textKeys = ["onset", "sensation", "triggers", "limitations", "clinicianDetails", "notes", "surgeryRepair", "surgeryWhen", "postoperativeRestrictions"] as const;
  const keys = ["id", "region", "side", "view", "categories", "pain", "occurrence", "clinicianInstructions", ...textKeys];
  if (Object.keys(s).some(k => !keys.includes(k)) || !UUID.test(s.id) || !BODY_REGIONS.includes(s.region)
    || !["left", "right", "midline"].includes(s.side) || !["front", "back"].includes(s.view)
    || !["yes", "no", "unsure"].includes(s.clinicianInstructions)
    || !Array.isArray(s.categories) || !s.categories.length || s.categories.length > 4 || new Set(s.categories).size !== s.categories.length
    || s.categories.some(c => !HISTORY_CATEGORIES.some(([key]) => key === c))
    || !Array.isArray(s.occurrence) || s.occurrence.length > 3 || s.occurrence.some(c => !["rest", "movement", "after_activity"].includes(c))
    || (s.pain !== null && (!Number.isInteger(s.pain) || s.pain < 0 || s.pain > 10))
    || textKeys.some(k => typeof s[k] !== "string" || s[k].length > 2000)) throw new Error("Review this spot’s answers and ranges.");
  // Inactive surgery fields never erase a historical surgery record; edits to a
  // saved spot are versioned on the server, including any category changes.
  return Object.fromEntries(keys.map(k => [k, s[k as keyof InjurySpot]])) as InjurySpot;
}
export function parseIntakeContext(form: FormData): IntakeContext {
  const number = (key: string, min: number, max: number, integer = false) => {
    const raw = form.get(key);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || integer && !Number.isInteger(n)) throw new Error("Review the goals and recovery values.");
    return n;
  };
  const text = (key: string) => { const v = String(form.get(key) ?? "").trim(); if (v.length > 2000) throw new Error("Keep intake answers under 2,000 characters."); return v; };
  const targetDate = form.get("noDeadline") === "on" ? null : text("targetDate") || null;
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("Review the target date.");
  const barriers = form.getAll("barriers").map(String);
  if (barriers.some(b => !["time", "travel", "discomfort", "motivation", "other"].includes(b)) || barriers.length > 5) throw new Error("Review consistency barriers.");
  return { version: 2, age: number("age", 18, 110, true), currentWeightLb: number("currentWeightLb", 44, 1100), recentWorkoutDays: number("recentWorkoutDays", 0, 7, true),
    success: text("success"), targetDate, outsideActivity: text("outsideActivity"), outsideFrequency: text("outsideFrequency"), sleepHours: number("sleepHours", 0, 24), barriers, goalTarget: text("goalTarget"),noInjuryReport:form.get("noInjuryReport")==="on" };
}
