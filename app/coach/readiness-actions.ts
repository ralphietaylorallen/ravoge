"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { ExecutionState } from "@/app/coach/workout-actions";

export async function saveTrainingReadiness(role: "client" | "coach", clientId: string, workoutId: string | null, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const { supabase, userId } = await requireRole(role);
  const answers = Array.from({ length: 5 }, (_, i) => Number(form.get(`readiness-${i + 1}`)));
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || (role === "client" && clientId !== userId) || (workoutId && !/^[0-9a-f-]{36}$/i.test(workoutId)) || answers.some(n => !Number.isInteger(n) || n < 1 || n > 5)) return { status: "error", message: "Answer all five questions on the 1–5 scale." };
  const { error } = await supabase.rpc("submit_training_readiness", { target_client_user_id: clientId, target_workout_id: workoutId, responses: answers, pain_note: String(form.get("painNote") ?? "").trim() || null });
  if (error) return { status: "error", message: "Readiness was not saved. Confirm your access and the open assigned workout." };
  revalidatePath(`/coach/clients/${clientId}`);
  if (workoutId) revalidatePath(`/client/workouts/${workoutId}`);
  return { status: "success", message: "Five responses saved. Your Coach can accept, decline or edit the recommendation; no workout changed automatically." };
}
export async function reviewTrainingReadiness(clientId: string, checkinId: string, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const { supabase } = await requireRole("coach");
  if (![clientId, checkinId].every(v => /^[0-9a-f-]{36}$/i.test(v))) return { status: "error", message: "Check-in unavailable." };
  const { error } = await supabase.rpc("review_training_readiness", { target_checkin_id: checkinId, decision: String(form.get("decision") ?? ""), response: String(form.get("response") ?? "").trim() });
  if (error) return { status: "error", message: "Record an authorized decision and your intended action." };
  revalidatePath(`/coach/clients/${clientId}`);
  return { status: "success", message: "Coach decision saved. Make any intended workout edits explicitly; the approved plan was not silently changed." };
}
