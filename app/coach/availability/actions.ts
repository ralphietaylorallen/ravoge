"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mergeRanges, validLocalDate, type MinuteRange } from "@/lib/coach-availability";

export type AvailabilityState = { status: "idle" | "error" | "success"; message?: string; ranges?: MinuteRange[]; increment?: number };

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
  const { error } = await supabase.rpc("save_coach_calendar_day", { target_organization_id: membership.organization_id, target_date: date, requested_increment: increment, requested_ranges: ranges });
  if (error) return { status: "error", message: "Availability was not changed. Reload and try again. Check for daylight saving time changes if needed." };
  for (const path of ["/coach/availability", "/coach", "/coach/schedule", "/client/book", "/owner/schedule"]) revalidatePath(path);
  return { status: "success", message: "Availability saved.", ranges, increment };
}
