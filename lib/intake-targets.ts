export type BodyCompositionGoals = Partial<Record<"weightKg" | "bodyFatPercentage" | "skeletalMuscleMassKg", number>>;

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
