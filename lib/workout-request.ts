export const WORKOUT_SECTIONS = {
  strength: "Weights", legs: "Legs", arms: "Arms", back: "Back", shoulders: "Shoulders",
  lower_body: "Lower body", upper_body: "Upper body", full_body: "Full body",
  abs: "Abs / core", cardio: "Cardio", finisher: "Finisher", stretching: "Stretching",
} as const;
export type WorkoutRequest = { sections: (keyof typeof WORKOUT_SECTIONS)[]; duration: number; scheduledDate: string | null };
export function parseWorkoutRequest(value: unknown): WorkoutRequest | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("Choose workout focus and time.");
  const v=value as Record<string,unknown>;
  if (!Array.isArray(v.sections) || v.sections.length<1 || v.sections.length>12 || v.sections.some(s=>typeof s!=="string"||!Object.hasOwn(WORKOUT_SECTIONS,s))
    || !Number.isInteger(v.duration) || Number(v.duration)<20 || Number(v.duration)>180) throw new Error("Select at least one focus and 20–180 minutes.");
  const date=v.scheduledDate;
  if(date!==null && date!==undefined && (typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)) throw new Error("Choose a valid scheduled day.");
  return {sections:[...new Set(v.sections)] as WorkoutRequest['sections'],duration:Number(v.duration),scheduledDate:typeof date==="string"?date:null};
}
