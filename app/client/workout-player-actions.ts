"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { ExecutionState } from "@/app/coach/workout-actions";

function refresh(id: string) { revalidatePath(`/client/workouts/${id}`); revalidatePath("/client"); revalidatePath("/coach"); }
export async function playerSessionAction(role: "client" | "coach", workoutId: string, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const { supabase } = await requireRole(role);
  if (!/^[0-9a-f-]{36}$/i.test(workoutId)) return { status: "error", message: "Workout unavailable." };
  const { error } = await supabase.rpc("manage_quality_workout", { target_workout_id: workoutId, intent: String(form.get("intent") ?? ""), difficulty: form.get("difficulty") ? Number(form.get("difficulty")) : null, feedback: String(form.get("feedback") ?? "").trim() || null });
  if (error) return { status: "error", message: "Not saved. Record every set and a difficulty rating before finishing; this workout must still be open." };
  refresh(workoutId);
  return { status: "success", message: form.get("intent") === "finish" ? "Workout recorded. Your Coach can review completed, modified, missed and painful work." : "Workout started. Work at the effort approved by your Coach." };
}
export async function playerSetAction(role: "client" | "coach", workoutId: string, setId: string, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const { supabase } = await requireRole(role);
  if (![workoutId, setId].every(v => /^[0-9a-f-]{36}$/i.test(v))) return { status: "error", message: "Set unavailable." };
  const value = (key: string) => String(form.get(key) ?? "").trim() ? Number(form.get(key)) : null;
  const { error } = await supabase.rpc("record_quality_workout_set", { target_workout_id: workoutId, target_set_id: setId, result: String(form.get("result") ?? ""), performance: {
    reps: value("reps"), load: value("load"), loadUnit: "lb", seconds: value("seconds"), distance: value("distance"), rpe: value("rpe"),
    pain: form.get("pain") === "yes", notes: String(form.get("notes") ?? "").trim(), substitutionId: String(form.get("substitutionId") ?? "") || null,
  } });
  if (error) return { status: "error", message: "Set not saved. Check actual values, approved substitution and that the workout is still open." };
  refresh(workoutId);
  return { status: "success", message: "Set recorded. Targets were not changed." };
}
