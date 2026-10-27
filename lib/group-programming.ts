export type GroupProgram = {
  id: string; programming_date: string; raw_workout_text: string; revision: number;
  published_revision: number | null; published_at: string | null; content_hash: string;
  created_by: string; updated_by: string; updated_at: string;
  mindbody_sync_status: string; last_safe_sync_error: string | null;
};
export type GroupVersion = { revision: number; raw_workout_text: string; edited_by: string; edited_at: string; published_at: string | null };
export type GroupResult = { status: "success" | "error"; message: string; programs?: GroupProgram[]; versions?: GroupVersion[] };
export const MINDBODY_BLOCKER = "Mindbody sync is unavailable until a supported date-specific workout field and branded-app display are verified. No Mindbody classes or bookings will be changed.";

export function validGroupDate(value: string) {
  if (!/^20\d\d-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() !== 0;
}
export function moveGroupDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function groupMonday(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return moveGroupDate(value, -((date.getUTCDay() + 6) % 7));
}
export function groupWeek(monday: string) { return Array.from({ length: 6 }, (_, index) => moveGroupDate(monday, index)); }
export function groupDateLabel(value: string, full = false) {
  return new Intl.DateTimeFormat("en-US", { weekday: full ? "long" : "short", month: "short", day: "numeric", year: full ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
export function groupStatus(program?: GroupProgram, dirty = false) {
  if (dirty) return "Unsaved Changes";
  if (!program?.raw_workout_text.trim()) return "Empty";
  if (program.published_revision === null) return "Draft Saved";
  if (program.published_revision !== program.revision) return "Updated Draft";
  if (program.mindbody_sync_status === "synced") return "Synced to Mindbody";
  if (program.mindbody_sync_status === "failed") return "Mindbody Sync Failed — Retry";
  return "Published to Ravoge";
}
export function publishableGroupDates(programs: GroupProgram[], dates: string[]) {
  return [...new Set(dates)].filter(date => validGroupDate(date) && programs.some(p => p.programming_date === date && p.raw_workout_text.trim()));
}
