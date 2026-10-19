import { poundsToKilograms } from "./weight-units.ts";
export type BodyCompositionGoals = Partial<Record<"weightKg" | "bodyFatPercentage" | "skeletalMuscleMassKg", number>>;

// The public form is pounds-only; the versioned intake contract stays canonical.
export function parsePoundBodyCompositionGoals(form: FormData): BodyCompositionGoals | null {
  const canonical = new FormData();
  canonical.set("goalBodyFatPercentage", String(form.get("goalBodyFatPercentage") ?? ""));
  try {
    for (const key of ["goalWeight", "goalSkeletalMuscleMass"]) {
      const value = poundsToKilograms(String(form.get(`${key}Lb`) ?? ""));
      canonical.set(`${key}Kg`, value === null ? "" : String(value));
    }
  } catch { return null; }
  return parseBodyCompositionGoals(canonical);
}

export function parseBodyCompositionGoals(formData: FormData): BodyCompositionGoals | null {
  const goals: BodyCompositionGoals = {};
  const fields = [["goalWeightKg", "weightKg", 500], ["goalBodyFatPercentage", "bodyFatPercentage", 75], ["goalSkeletalMuscleMassKg", "skeletalMuscleMassKg", 200]] as const;
  for (const [field, key, maximum] of fields) {
    const raw = formData.get(field);
    if (raw === null || raw === "") continue;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value > maximum || (key === "bodyFatPercentage" ? value < 0 : value <= 0)) return null;
    goals[key] = value;
  }
  if (goals.weightKg !== undefined && goals.skeletalMuscleMassKg !== undefined && goals.skeletalMuscleMassKg > goals.weightKg) return null;
  return goals;
}
