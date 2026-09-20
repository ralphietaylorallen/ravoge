"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function setExerciseCompletionAction(
  workoutId: string,
  exerciseId: string,
  isCompleted: boolean,
) {
  const { supabase } = await requireRole("client");
  const path = `/client/workouts/${workoutId}`;
  if (!UUID_PATTERN.test(workoutId) || !UUID_PATTERN.test(exerciseId)) {
    redirect(`${path}?notice=not-available`);
  }

  const { error } = await supabase.rpc("set_workout_exercise_completion", {
    is_completed: isCompleted,
    target_exercise_id: exerciseId,
  });
  if (error) redirect(`${path}?notice=not-available`);

  revalidatePath("/client");
  revalidatePath(path);
  redirect(path);
}

export async function completeWorkoutAction(workoutId: string) {
  const { supabase } = await requireRole("client");
  const path = `/client/workouts/${workoutId}`;
  if (!UUID_PATTERN.test(workoutId)) redirect(`${path}?notice=not-available`);

  const { error } = await supabase.rpc("set_workout_completion", {
    is_completed: true,
    target_workout_id: workoutId,
  });
  if (error) redirect(`${path}?notice=finish-exercises`);

  revalidatePath("/client");
  revalidatePath(path);
  redirect(path);
}
