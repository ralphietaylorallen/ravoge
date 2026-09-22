"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";

export type StaffScheduleState = { status: "idle" | "error" | "success"; message?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refreshSchedules(clientId: string) {
  revalidatePath("/owner/schedule");
  revalidatePath("/coach/schedule");
  revalidatePath("/client/schedule");
  revalidatePath(`/owner/clients/${clientId}`);
  revalidatePath(`/coach/clients/${clientId}`);
}

export async function claimClientAction(clientId: string, _state: StaffScheduleState): Promise<StaffScheduleState> {
  void _state;
  const { supabase } = await requireRole("coach");
  if (!UUID.test(clientId)) return { status: "error", message: "That Client is unavailable." };
  const { error } = await supabase.rpc("claim_unassigned_client", { target_client_user_id: clientId });
  if (error) return { status: "error", message: error.message.includes("already has a Coach") ? "This Client is already assigned. Ask an Owner to reassign them." : "This Client could not be assigned." };
  revalidatePath("/coach");
  refreshSchedules(clientId);
  return { status: "success", message: "Client assigned. You can now schedule a session." };
}

export async function createStaffBookingAction(role: "owner" | "coach", clientId: string, coachId: string, _state: StaffScheduleState, formData: FormData): Promise<StaffScheduleState> {
  const { supabase } = await requireRole(role);
  const startsAt = String(formData.get("startsAt") ?? "");
  const duration = Number(formData.get("duration"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!UUID.test(clientId) || !UUID.test(coachId) || !Number.isFinite(Date.parse(startsAt)) || !Number.isInteger(duration) || duration < 15 || duration > 120 || notes.length > 1000) {
    return { status: "error", message: "Choose a valid available time." };
  }
  const { error } = await supabase.rpc("create_staff_booking", {
    staff_notes: notes || null,
    target_client_user_id: clientId,
    target_coach_user_id: coachId,
    target_duration: duration,
    target_starts_at: new Date(startsAt).toISOString(),
  });
  if (error) return { status: "error", message: error.message.includes("just booked") ? "That slot was just booked. Choose another." : "That slot is no longer available." };
  refreshSchedules(clientId);
  return { status: "success", message: "Session booked. Owner, Coach, and Client schedules are updated." };
}

export async function rescheduleStaffBookingAction(role: "owner" | "coach", bookingId: string, clientId: string, _state: StaffScheduleState, formData: FormData): Promise<StaffScheduleState> {
  const { supabase } = await requireRole(role);
  const startsAt = String(formData.get("startsAt") ?? "");
  const duration = Number(formData.get("duration"));
  if (!UUID.test(bookingId) || !Number.isFinite(Date.parse(startsAt)) || !Number.isInteger(duration) || duration < 15 || duration > 120) return { status: "error", message: "Choose a valid available time." };
  const { error } = await supabase.rpc("reschedule_staff_booking", { target_booking_id: bookingId, target_duration: duration, target_starts_at: new Date(startsAt).toISOString() });
  if (error) return { status: "error", message: "This session could not be rescheduled." };
  refreshSchedules(clientId);
  return { status: "success", message: "Session rescheduled across all schedules." };
}

export async function cancelStaffBookingAction(role: "owner" | "coach", bookingId: string, clientId: string, _state: StaffScheduleState, formData: FormData): Promise<StaffScheduleState> {
  const { supabase } = await requireRole(role);
  if (!UUID.test(bookingId)) return { status: "error", message: "That session is unavailable." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const { error } = await supabase.rpc("cancel_staff_booking", { reason: reason || null, target_booking_id: bookingId });
  if (error) return { status: "error", message: "This session could not be cancelled." };
  refreshSchedules(clientId);
  return { status: "success", message: "Session cancelled across all schedules." };
}
