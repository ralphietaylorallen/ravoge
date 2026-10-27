"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { groupWeek, validGroupDate, type GroupResult } from "@/lib/group-programming";

async function authorized(role: "owner" | "coach") {
  const session = await requireRole(role);
  const { data, error } = await session.supabase.rpc("can_manage_group_programming");
  return { ...session, allowed: !error && data === true };
}
function refresh() { revalidatePath("/owner/group-programming"); revalidatePath("/coach/group-programming"); }
export async function loadGroupWeekAction(role: "owner" | "coach", monday: string): Promise<GroupResult> {
  const { supabase, membership, allowed } = await authorized(role);
  if (!allowed) return { status: "error", message: "Your Owner must enable Group Class Programming access." };
  if (!validGroupDate(monday) || new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) return { status: "error", message: "Choose a valid Monday." };
  try {
    const { data, error } = await supabase.from("group_daily_programs").select("*").eq("organization_id", membership.organization_id).in("programming_date", groupWeek(monday)).abortSignal(AbortSignal.timeout(10000));
    return error ? { status: "error", message: "Could not load this week. Your editor text has been kept. Try again." } : { status: "success", message: "Week loaded.", programs: data ?? [] };
  } catch { return { status: "error", message: "Could not load this week. Your editor text has been kept. Try again." }; }
}
export async function saveGroupDraftAction(role: "owner" | "coach", date: string, text: string, revision: number): Promise<GroupResult> {
  const { supabase, allowed } = await authorized(role);
  if (!allowed) return { status: "error", message: "Group programming permission required. Your text has been kept." };
  if (!validGroupDate(date) || typeof text !== "string" || text.length > 50000 || !Number.isInteger(revision) || revision < 0) return { status: "error", message: "Choose Monday–Saturday and at most 50,000 characters." };
  try {
    const { data, error } = await supabase.rpc("save_group_program", { target_date: date, workout_text: text, expected_revision: revision }).abortSignal(AbortSignal.timeout(12000));
    if (error) return { status: "error", message: error.code === "40001" ? "Another editor saved this date. Copy your text, reload, and compare before saving." : "Draft save was not confirmed. Keep your text and reload before retrying." };
    refresh(); return { status: "success", message: "Draft Saved.", programs: [data] };
  } catch { return { status: "error", message: "Draft save was not confirmed. Your text has been kept; reload before retrying." }; }
}
export async function publishGroupDatesAction(role: "owner" | "coach", entries: { date: string; revision: number }[], retry = false): Promise<GroupResult> {
  const { supabase, allowed } = await authorized(role);
  if (!allowed) return { status: "error", message: "Group programming permission required." };
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 6 || entries.some(e => !validGroupDate(e.date) || !Number.isInteger(e.revision) || e.revision < 1) || new Set(entries.map(e => e.date)).size !== entries.length) return { status: "error", message: "Select up to six saved, non-empty dates." };
  const programs = [], failed: string[] = [];
  for (const entry of entries) {
    try {
      const { data, error } = await supabase.rpc("publish_group_program", { target_date: entry.date, expected_revision: entry.revision, retry_sync: retry }).abortSignal(AbortSignal.timeout(10000));
      if (error) failed.push(entry.date); else programs.push(data);
    } catch { failed.push(entry.date); }
  }
  refresh();
  return { status: failed.length ? "error" : "success", programs, message: `${programs.length} workout${programs.length === 1 ? "" : "s"} ${retry ? "checked" : "published to Ravoge"}. Mindbody sync remains unavailable; no Mindbody data was changed.${failed.length ? ` Not confirmed for ${failed.join(", ")}. Reload those dates before retrying.` : ""}` };
}
export async function loadGroupHistoryAction(role: "owner" | "coach", programId: string): Promise<GroupResult> {
  const { supabase, membership, allowed } = await authorized(role);
  if (!allowed || !/^[0-9a-f-]{36}$/i.test(programId)) return { status: "error", message: "History unavailable." };
  const { data, error } = await supabase.from("group_program_versions").select("revision,raw_workout_text,edited_by,edited_at,published_at").eq("organization_id", membership.organization_id).eq("program_id", programId).order("revision", { ascending: false }).limit(50);
  return error ? { status: "error", message: "History could not load. Try again." } : { status: "success", message: "Latest 50 saved versions.", versions: data ?? [] };
}
export async function setGroupPermissionAction(coachId: string, _state: { status: "idle" | "success" | "error"; message?: string }, form: FormData) {
  const { supabase } = await requireRole("owner");
  if (!/^[0-9a-f-]{36}$/i.test(coachId)) return { status: "error" as const, message: "Choose a Coach in your gym." };
  const { error } = await supabase.rpc("set_group_programming_permission", { target_coach: coachId, allowed: form.get("allowed") === "yes" });
  refresh(); return error ? { status: "error" as const, message: "Permission was not saved. Choose an active Coach in your gym." } : { status: "success" as const, message: "Permission saved." };
}
