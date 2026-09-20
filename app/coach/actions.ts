"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";

export type WorkoutActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

type ExerciseInput = {
  load: string | null;
  name: string;
  notes: string | null;
  reps: number;
  sets: number;
};

function getStrings(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

function parsePositiveInteger(value: string, maximum: number) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : null;
}

export async function createWorkoutAction(
  clientId: string,
  _state: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const { supabase } = await requireRole("coach");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    return { message: "That client is not available.", status: "error" };
  }

  const titleValue = formData.get("title");
  const instructionsValue = formData.get("instructions");
  const scheduledDateValue = formData.get("scheduledDate");
  const title = typeof titleValue === "string" ? titleValue.trim() : "";
  const instructions = typeof instructionsValue === "string"
    ? instructionsValue.trim()
    : "";
  const scheduledDate = typeof scheduledDateValue === "string"
    ? scheduledDateValue
    : "";

  if (title.length < 2 || title.length > 120) {
    return { message: "Enter a workout name between 2 and 120 characters.", status: "error" };
  }
  if (instructions.length > 4000) {
    return { message: "Instructions must be 4,000 characters or fewer.", status: "error" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || Number.isNaN(Date.parse(`${scheduledDate}T00:00:00Z`))) {
    return { message: "Choose a valid workout date.", status: "error" };
  }

  const names = getStrings(formData, "exerciseName");
  const sets = getStrings(formData, "exerciseSets");
  const reps = getStrings(formData, "exerciseReps");
  const loads = getStrings(formData, "exerciseLoad");
  const notes = getStrings(formData, "exerciseNotes");
  if (
    names.length < 1 ||
    names.length > 30 ||
    [sets, reps, loads, notes].some((values) => values.length !== names.length)
  ) {
    return { message: "Add between 1 and 30 complete exercises.", status: "error" };
  }

  const exercises: ExerciseInput[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const parsedSets = parsePositiveInteger(sets[index], 100);
    const parsedReps = parsePositiveInteger(reps[index], 1000);
    const parsedLoad = loads[index] === "" ? null : Number(loads[index]);
    if (
      names[index].length < 1 ||
      names[index].length > 120 ||
      parsedSets === null ||
      parsedReps === null ||
      (parsedLoad !== null && (!Number.isFinite(parsedLoad) || parsedLoad < 0 || parsedLoad > 100000)) ||
      notes[index].length > 1000
    ) {
      return { message: `Check the values for exercise ${index + 1}.`, status: "error" };
    }
    exercises.push({
      load: parsedLoad === null ? null : String(parsedLoad),
      name: names[index],
      notes: notes[index] || null,
      reps: parsedReps,
      sets: parsedSets,
    });
  }

  const { error } = await supabase.rpc("create_workout_assignment", {
    client_user_id: clientId,
    exercises,
    workout_instructions: instructions || null,
    workout_scheduled_date: scheduledDate,
    workout_title: title,
  });
  if (error) {
    return {
      message: "The workout could not be saved for this client. Confirm the assignment is still active.",
      status: "error",
    };
  }

  revalidatePath("/coach");
  revalidatePath(`/coach/clients/${clientId}`);
  return { message: "Workout assigned successfully.", status: "success" };
}
