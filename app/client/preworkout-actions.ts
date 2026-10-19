"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";

export type CheckinState = { status: "idle" | "error" | "success"; message?: string };

async function saveCheckin(contextId: string, kind: "workout" | "booking", formData: FormData): Promise<CheckinState> {
  const { supabase } = await requireRole("client");
  if (!/^[0-9a-f-]{36}$/i.test(contextId)) return { status: "error", message: "This session or workout is unavailable." };
  const answers = Array.from({ length: 8 }, (_, index) => ({ position: index + 1, answer: Number(formData.get(`answer-${index + 1}`)) }));
  if (answers.some(({ position, answer }) => !Number.isFinite(answer) || !String(formData.get(`answer-${position}`) ?? "").trim())) return { status: "error", message: "Answer every question within its shown range." };
  const { error } = await supabase.rpc("submit_preworkout_checkin", { target_booking_id: kind === "booking" ? contextId : null, target_workout_assignment_id: kind === "workout" ? contextId : null, submitted_answers: answers });
  if (error) return { status: "error", message: "Check-in was not saved. Confirm the workout and answer ranges." };
  revalidatePath("/client/schedule");
  if (kind === "workout") revalidatePath(`/client/workouts/${contextId}`);
  return { status: "success", message: kind === "booking" ? "Your responses were saved securely for this intake session." : "Pre-workout check-in saved to this workout history." };
}

export async function submitPreworkoutCheckinAction(workoutId: string, _state: CheckinState, formData: FormData): Promise<CheckinState> {
  return saveCheckin(workoutId, "workout", formData);
}

export async function submitIntakeSessionCheckinAction(bookingId: string, _state: CheckinState, formData: FormData): Promise<CheckinState> {
  return saveCheckin(bookingId, "booking", formData);
}
