import { INTAKE_GOALS } from "./intake-history";

export function displayIntakeGoal(value: string) {
  return INTAKE_GOALS.find(([key]) => key === value)?.[1] ?? displayIntakeOption(value);
}

export function displayIntakeOption(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function clientDayLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...options, timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function clientWorkoutTitle(title: string | null | undefined) {
  return title?.trim().replace(/^coach review draft\s*[-–—:]\s*/i, "").trim() || "Workout";
}
