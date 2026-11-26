"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mergeRanges, validLocalDate, type MinuteRange } from "@/lib/coach-availability";

export type AvailabilityState = { status: "idle" | "error" | "success"; message?: string; ranges?: MinuteRange[]; increment?: number; savedDates?: string[] };

export async function saveDayAvailabilityAction(_state: AvailabilityState, form: FormData): Promise<AvailabilityState> {
  const { supabase, membership } = await requireRole("coach");
  const date = String(form.get("date") ?? "");
  const increment = Number(form.get("increment"));
  let ranges: MinuteRange[];
  try { ranges = JSON.parse(String(form.get("ranges") ?? "")); } catch { return { status: "error", message: "Review your selected times and try again." }; }
  if (!validLocalDate(date) || ![45, 60].includes(increment) || !Array.isArray(ranges) || ranges.length > 96 || ranges.some(r => !r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end > 1440 || r.start >= r.end)) {
    return { status: "error", message: "Choose a valid date and availability slots." };
  }
  ranges = mergeRanges(ranges);
  const period = String(form.get("period") ?? "day");
  if (!["day", "week", "month"].includes(period)) return { status: "error", message: "Choose a day, week, or month to save." };
  const weekdays = form.getAll("weekdays").map(Number);
  if (period !== "day" && (!weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) {
    return { status: "error", message: "Select the weekdays to repeat your hours." };
  }
  const selection = { target_organization_id: membership.organization_id, target_date: date, requested_increment: increment, requested_ranges: ranges };
  const { data, error } = period === "day"
    ? await supabase.rpc("save_coach_calendar_day", selection)
    : await supabase.rpc("save_coach_calendar_period", { ...selection, requested_period: period, requested_weekdays: weekdays });
  if (error) return { status: "error", message: "Availability was not changed. Reload and try again. Check for daylight saving time changes if needed." };
  const savedDates: string[] = period === "day" ? [date] : data?.savedDates ?? [];
  if (!savedDates.length) return { status: "error", message: "No open dates matched. Choose weekdays with gym hours in this week or month." };
  for (const path of ["/coach/availability", "/coach", "/coach/schedule", "/client/book", "/owner/schedule"]) revalidatePath(path);
  return { status: "success", message: period === "day" ? "Availability saved." : `Availability saved for ${savedDates.length} days this ${period}. You can edit any date separately.`, ranges, increment, savedDates };
}
