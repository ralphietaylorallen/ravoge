"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOALS = new Set(["strength", "muscle_gain", "general_fitness", "conditioning", "fat_loss", "athletic_performance"]);
const EXPERIENCE_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const CONSISTENCY_LEVELS = new Set(["inconsistent", "building", "consistent"]);

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

export type IntakeActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

function commaList(value: FormDataEntryValue | null) {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30)
    : [];
}

function boundedNumber(value: FormDataEntryValue | null, minimum: number, maximum: number, optional = false) {
  if (optional && (value === null || value === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

export async function saveClientIntakeAction(
  clientId: string,
  _state: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(clientId)) return { message: "That client is not available.", status: "error" };

  const primaryGoal = String(formData.get("primaryGoal") ?? "");
  const secondaryGoal = String(formData.get("secondaryGoal") ?? "");
  const experienceLevel = String(formData.get("experienceLevel") ?? "");
  const recentConsistency = String(formData.get("recentConsistency") ?? "");
  const trainingFrequencyGoal = boundedNumber(formData.get("trainingFrequencyGoal"), 1, 7);
  const trainingYears = boundedNumber(formData.get("trainingYears"), 0, 80);
  const birthYear = boundedNumber(formData.get("birthYear"), 1900, 2100, true);
  const sessionDurationMinutes = boundedNumber(formData.get("sessionDurationMinutes"), 20, 180);
  const sleepQuality = boundedNumber(formData.get("sleepQuality"), 1, 5);
  const stressLevel = boundedNumber(formData.get("stressLevel"), 1, 5);
  const recoveryPerception = boundedNumber(formData.get("recoveryPerception"), 1, 5);
  const sorenessFatigue = boundedNumber(formData.get("sorenessFatigue"), 1, 5);
  const strengthBaseline = boundedNumber(formData.get("strengthBaseline"), 1, 5, true);
  const conditioningBaseline = boundedNumber(formData.get("conditioningBaseline"), 1, 5, true);
  const mobilityBaseline = boundedNumber(formData.get("mobilityBaseline"), 1, 5, true);

  if (
    !GOALS.has(primaryGoal) || (secondaryGoal && !GOALS.has(secondaryGoal)) ||
    !EXPERIENCE_LEVELS.has(experienceLevel) || !CONSISTENCY_LEVELS.has(recentConsistency) ||
    [trainingFrequencyGoal, trainingYears, birthYear, sessionDurationMinutes, sleepQuality,
      stressLevel, recoveryPerception, sorenessFatigue, strengthBaseline,
      conditioningBaseline, mobilityBaseline].some((value) => value === undefined)
  ) {
    return { message: "Review the required intake values and ranges.", status: "error" };
  }

  const text = (name: string, maximum = 4000) => {
    const value = String(formData.get(name) ?? "").trim();
    return value.slice(0, maximum);
  };
  const payload = {
    assessmentScores: {},
    avoidedExercises: commaList(formData.get("avoidedExercises")),
    birthYear: birthYear ?? "",
    coachNotes: text("coachNotes"),
    conditioningBaseline: conditioningBaseline ?? "",
    constraintTags: getStrings(formData, "constraintTags"),
    currentInjuries: text("currentInjuries"),
    customFields: {},
    experienceLevel,
    medicalCoachNotes: text("medicalCoachNotes"),
    mobilityBaseline: mobilityBaseline ?? "",
    movementLimitations: text("movementLimitations"),
    movementsToAvoid: commaList(formData.get("movementsToAvoid")),
    painAreas: commaList(formData.get("painAreas")),
    preferredExercises: commaList(formData.get("preferredExercises")),
    preferredTrainingDays: getStrings(formData, "preferredTrainingDays"),
    primaryGoal,
    recentConsistency,
    recoveryPerception,
    secondaryGoal,
    sessionDurationMinutes,
    sleepQuality,
    sorenessFatigue,
    strengthBaseline: strengthBaseline ?? "",
    stressLevel,
    trainingFrequencyGoal,
    trainingYears,
  };

  const { error } = await supabase.rpc("upsert_client_intake", {
    intake_payload: payload,
    target_client_user_id: clientId,
  });
  if (error) return { message: "The intake could not be saved. Confirm the client assignment and all required values.", status: "error" };

  revalidatePath(`/coach/clients/${clientId}`);
  return { message: "Intake saved and client state recalculated.", status: "success" };
}

export async function generatePrescriptionAction(clientId: string) {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(clientId)) redirect("/coach?notice=client-unavailable");
  const { data, error } = await supabase.rpc("generate_initial_prescription_v0", {
    target_client_user_id: clientId,
  });
  if (error || typeof data !== "string") {
    redirect(`/coach/clients/${clientId}?notice=prescription-unavailable`);
  }
  redirect(`/coach/clients/${clientId}/prescriptions/${data}`);
}

export type PrescriptionActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

export async function approvePrescriptionAction(
  clientId: string,
  prescriptionId: string,
  _state: PrescriptionActionState,
  formData: FormData,
): Promise<PrescriptionActionState> {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(prescriptionId)) {
    return { message: "That recommendation is not available.", status: "error" };
  }
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const scheduledDate = String(formData.get("scheduledDate") ?? "");
  const libraryIds = getStrings(formData, "libraryExerciseId");
  const sets = getStrings(formData, "exerciseSets");
  const reps = getStrings(formData, "exerciseReps");
  const loads = getStrings(formData, "exerciseLoad");
  const rests = getStrings(formData, "exerciseRest");
  const notes = getStrings(formData, "exerciseNotes");
  const reasons = getStrings(formData, "exerciseReason");
  const columns = [sets, reps, loads, rests, notes, reasons];

  if (title.length < 2 || title.length > 120 || instructions.length > 4000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || libraryIds.length < 1 || libraryIds.length > 30 ||
    columns.some((column) => column.length !== libraryIds.length)) {
    return { message: "Review the workout details and exercise rows.", status: "error" };
  }

  const exercises = libraryIds.map((libraryExerciseId, index) => ({
    libraryExerciseId,
    load: loads[index] || null,
    notes: notes[index] || null,
    reason: reasons[index] || null,
    reps: Number(reps[index]),
    restSeconds: rests[index] ? Number(rests[index]) : null,
    sets: Number(sets[index]),
  }));
  if (exercises.some((exercise) => !UUID_PATTERN.test(exercise.libraryExerciseId) ||
    !Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 100 ||
    !Number.isInteger(exercise.reps) || exercise.reps < 1 || exercise.reps > 1000)) {
    return { message: "One or more exercise values are invalid.", status: "error" };
  }

  const { error } = await supabase.rpc("approve_generated_prescription_v0", {
    exercises,
    target_prescription_id: prescriptionId,
    workout_instructions: instructions || null,
    workout_scheduled_date: scheduledDate,
    workout_title: title,
  });
  if (error) return { message: "The workout could not be assigned. Recheck equipment, constraints, and client access.", status: "error" };

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach");
  redirect(`/coach/clients/${clientId}?notice=prescription-assigned`);
}
