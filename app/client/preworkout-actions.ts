"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";

export type CheckinState = { status: "idle" | "error" | "success"; message?: string };

export async function submitPreworkoutCheckinAction(workoutId: string, _state: CheckinState, formData: FormData): Promise<CheckinState> {
  const { supabase } = await requireRole("client");
  if (!/^[0-9a-f-]{36}$/i.test(workoutId)) return { status: "error", message: "Workout is unavailable." };
  const answers = Array.from({ length: 8 }, (_, index) => ({ position: index + 1, answer: Number(formData.get(`answer-${index + 1}`)) }));
  if (answers.some(({ answer }) => !Number.isFinite(answer))) return { status: "error", message: "Answer each numeric question." };
  const { error } = await supabase.rpc("submit_preworkout_checkin", { target_booking_id: null, target_workout_assignment_id: workoutId, submitted_answers: answers });
  if (error) return { status: "error", message: "Check-in was not saved. Confirm the workout and answer ranges." };
  revalidatePath(`/client/workouts/${workoutId}`);
  return { status: "success", message: "Pre-workout check-in saved to this workout history." };
}
