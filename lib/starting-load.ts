import { formatPounds, poundsToKilograms } from "./weight-units.ts";

export type LoadPrescription = {
  basis?: string; semantics?: string; explanation?: string; calibrationRequired?: boolean;
  coachReviewRequired?: boolean; ruleVersion?: number; bandResistance?: string;
};
export const CALIBRATION_REQUIRED = "Calibration required — choose the first technique load before approval.";
export function startingLoadLabel(load: number | string | null, prescription?: LoadPrescription | null) {
  if (load === null || load === "") return prescription?.calibrationRequired ? CALIBRATION_REQUIRED : prescription?.explanation ?? "Load not prescribed";
  const n = Number(load);
  if (!Number.isFinite(n)) return CALIBRATION_REQUIRED;
  return prescription?.semantics === "each_hand" ? `${formatPounds(n)} lb per hand — ${formatPounds(n * 2)} lb total`
    : `${formatPounds(n)} lb ${prescription?.semantics === "added" ? "added weight" : prescription?.semantics === "sled" ? "sled load" : "total"}`;
}

export type StrengthAnchor = { method: string; variation?: string; loadKg?: number; oneRmKg?: number; reps?: number };
export function optionalStrengthAnchors(form: FormData): Record<string, StrengthAnchor> {
  return Object.fromEntries(["deadlift", "overhead_press"].map(key => {
    const method = String(form.get(`${key}Method`) ?? "not_tested");
    if (method === "not_tested") return [key, { method }];
    const variation = String(form.get(`${key}Variation`) ?? key);
    const loadKg = poundsToKilograms(String(form.get(`${key}LoadLb`) ?? ""));
    const oneRmKg = poundsToKilograms(String(form.get(`${key}OneRmLb`) ?? ""));
    const reps = Number(form.get(`${key}Reps`));
    if (!["tested", "estimated"].includes(method) || ![key, ...(key === "deadlift" ? ["romanian_deadlift"] : [])].includes(variation)
      || loadKg === null || loadKg <= 0 || loadKg > 1000 || oneRmKg === null || oneRmKg <= 0 || oneRmKg > 1000 || !Number.isInteger(reps) || reps < 1 || reps > 30) {
      throw new Error("Record an actual load, repetitions, matching variation and tested/estimated 1RM in lb, or choose Not tested.");
    }
    return [key, { method, variation, loadKg, oneRmKg, reps }];
  }));
}
