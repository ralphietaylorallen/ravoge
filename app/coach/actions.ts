"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { parsePoundBodyCompositionGoals } from "@/lib/intake-targets";
import { poundsToKilograms } from "@/lib/weight-units";
import { type GenerationInput } from "@/lib/workout-generation";
import { generateIntelligentWorkout } from "@/lib/workout-intelligence";
import { validTrainingFocus } from "@/lib/training-focus";
import { protocolsFromForm } from "@/lib/workout-protocol";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOALS = new Set(["strength", "muscle_gain", "general_fitness", "conditioning", "fat_loss", "athletic_performance", "body_recomposition"]);
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

  const { error } = await supabase.rpc("create_workout_assignment_lb", {
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
  const bodyCompositionGoals = parsePoundBodyCompositionGoals(formData);
  if (!bodyCompositionGoals) return { message: "Review the optional body-composition targets and ranges.", status: "error" };
  const secondaryGoal = String(formData.get("secondaryGoal") ?? "");
  const trainingFocus = String(formData.get("trainingFocus") ?? "");
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
    !GOALS.has(primaryGoal) || (secondaryGoal && !GOALS.has(secondaryGoal)) || !validTrainingFocus(trainingFocus) ||
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
    customFields: { bodyCompositionGoals, ...(trainingFocus?{trainingFocus}:{}) },
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

  const baselineKeys = [
    "squatVariation", "squatOtherVariation", "squatLoadKg", "squatReps", "squatOneRmKg",
    "squatOneRmMethod", "squatNotes", "benchVariation", "benchLoadKg", "benchReps",
    "benchOneRmKg", "benchOneRmMethod", "benchNotes", "pullupStrictReps", "pullupMode",
    "pullupAdjustmentKg", "pullupNotes", "rowerDistanceM", "rowerTimeSeconds", "rowerCalories",
    "rowerPaceSecondsPer500m", "rowerAverageHeartRate", "rowerNotes", "versaDurationSeconds",
    "versaFeet", "versaCalories", "versaAverageHeartRate", "versaNotes",
  ] as const;
  const canonicalText = (key: string) => key.endsWith("Kg") ? String(poundsToKilograms(text(key.replace(/Kg$/, "Lb"), 40)) ?? "") : text(key, 1000);
  let baseline: Record<string, string>;
  try { baseline = Object.fromEntries(baselineKeys.map(key => [key, canonicalText(key)])); }
  catch { return { status: "error", message: "Enter finite measured weights in lb." }; }
  const requiredBaseline = ["squatVariation", "squatLoadKg", "squatReps", "squatOneRmKg", "squatOneRmMethod", "benchVariation", "benchLoadKg", "benchReps", "benchOneRmKg", "benchOneRmMethod", "pullupStrictReps", "pullupMode"];
  const hasRower = Boolean(baseline.rowerDistanceM && baseline.rowerTimeSeconds);
  const hasVersa = Boolean(baseline.versaDurationSeconds && baseline.versaFeet);
  if (requiredBaseline.some((key) => !baseline[key]) || (!hasRower && !hasVersa) ||
    (baseline.squatVariation === "other" && !baseline.squatOtherVariation) ||
    (baseline.pullupMode !== "bodyweight" && !baseline.pullupAdjustmentKg) ||
    (baseline.pullupMode === "bodyweight" && baseline.pullupAdjustmentKg)) {
    return { message: "Record Squat, Bench, Pull-Ups, and at least one complete conditioning test. Check mode-specific fields.", status: "error" };
  }
  const inbodyStatus = text("inbodyStatus", 20);
  if (!new Set(["pending", "completed"]).has(inbodyStatus)) return { message: "Choose an InBody status.", status: "error" };
  const inbodyKeys = ["testDate", "weightKg", "inbodyScore", "skeletalMuscleMassKg", "bodyFatMassKg", "bodyFatPercentage", "bmi", "visceralFatLevel", "ecwTbw", "bmrKcal"] as const;
  let inbody: Record<string, string>;
  try { inbody = inbodyStatus === "pending" ? { status: "pending" } : {
    status: "completed",
    ...Object.fromEntries(inbodyKeys.map((key) => [key, canonicalText(key === "testDate" ? "inbodyTestDate" : key)])),
  }; } catch { return { status: "error", message: "Enter finite InBody weights in lb." }; }
  if (inbodyStatus === "completed" && ["testDate", "weightKg", "bodyFatPercentage", "skeletalMuscleMassKg"].some((key) => !inbody[key])) {
    return { message: "A completed InBody needs a test date, weight, body-fat percentage and skeletal muscle mass.", status: "error" };
  }

  const { error } = await supabase.rpc("save_client_intake_v1", {
    baseline_payload: baseline,
    inbody_payload: inbody,
    intake_payload: payload,
    target_client_user_id: clientId,
  });
  if (error) return { message: "The intake could not be saved. Confirm the client assignment and all required values.", status: "error" };

  revalidatePath(`/coach/clients/${clientId}`);
  return { message: "Versioned intake and baseline saved; client state recalculated.", status: "success" };
}

export type GenerationActionState = { status: "idle" | "error"; message?: string };

export async function generatePrescriptionAction(clientId: string, _state: GenerationActionState): Promise<GenerationActionState> {
  void _state;
  const { supabase, userId } = await requireRole("coach");
  if (!UUID_PATTERN.test(clientId)) return { status: "error", message: "This Client is unavailable. Return to My Clients and choose an assigned Client." };
  const { data, error } = await supabase.rpc("generate_initial_prescription_v0", {
    target_client_user_id: clientId,
  }).abortSignal(AbortSignal.timeout(5000));
  if (error || typeof data !== "string") {
    return { status: "error", message: "A safe draft could not be created. Complete intake and goals, confirm the safety review, and review actual gym equipment below. No workout was assigned." };
  }
  const { data: input, error: inputError } = await supabase.rpc("get_pound_generation_input", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
  if (inputError || !input) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return { status: "error", message: inputError?.message.includes("Review the new pain check-in") ? "Today’s pain check-in needs a Coach decision. Review the readiness recommendation before creating a workout. No workout was assigned." : "Training inputs changed or could not be checked. Review the latest intake and try Create workout again. No workout was assigned." };
  }
  // Paid calls are bounded per authenticated Coach; repeated submissions still
  // have a safe deterministic path instead of an unbounded provider loop.
  const { count, error: countError } = await supabase.from("generated_prescriptions").select("id", { count: "exact", head: true }).eq("coach_user_id", userId).gte("generated_at", new Date(Date.now() - 60_000).toISOString()).abortSignal(AbortSignal.timeout(5000));
  const result = countError || (count ?? 4) > 3 ? { workout: null, reason: "unavailable" as const, intelligence: undefined } : await generateIntelligentWorkout(input as GenerationInput);
  let { error: saveError } = await supabase.rpc("complete_pound_prescription", {
    target_prescription_id: data, expected_snapshot: input.snapshot,
    proposed_workout: result.workout,
    generation_details: { ...(result.workout ? { model: result.model } : { reason: result.reason }), ...(result.intelligence ? { intelligence: result.intelligence, sourceReviewIds: result.workout?.sourceReviewIds??[] } : {}) },
  }).abortSignal(AbortSignal.timeout(5000));
  if (saveError && result.workout) {
    const fallback = await supabase.rpc("complete_pound_prescription", { target_prescription_id: data, expected_snapshot: input.snapshot, proposed_workout: null, generation_details: { reason: "invalid_output" } }).abortSignal(AbortSignal.timeout(5000));
    saveError = fallback.error;
  }
  if (saveError) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return { status: "error", message: "The training snapshot changed or validation failed. Review intake, restrictions and equipment, then create a fresh draft. Nothing was assigned." };
  }
  redirect(`/coach/clients/${clientId}/prescriptions/${data}`);
}

export async function confirmGenerationSafetyAction(clientId: string, intakeId: string, form: FormData) {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(intakeId) || form.get("confirmed") !== "yes") redirect(`/coach/clients/${clientId}?notice=prescription-unavailable`);
  const { error } = await supabase.rpc("confirm_intake_generation_safety", { target_intake_id: intakeId });
  if (error) redirect(`/coach/clients/${clientId}?notice=prescription-unavailable`);
  revalidatePath(`/coach/clients/${clientId}`);
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
  const efforts = getStrings(formData, "exerciseRpe");
  const duration = Number(formData.get("estimatedDurationMinutes"));
  const notes = getStrings(formData, "exerciseNotes");
  const reasons = getStrings(formData, "exerciseReason");
  const columns = [sets, reps, loads, rests, efforts, notes, reasons];

  if (title.length < 2 || title.length > 120 || instructions.length > 4000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || libraryIds.length < 1 || libraryIds.length > 30 ||
    columns.some((column) => column.length !== libraryIds.length) || !Number.isInteger(duration) || duration < (formData.get("quality") === "yes" ? 15 : 20) || duration > 180 ||
    efforts.some((effort) => effort !== "" && (!Number.isFinite(Number(effort)) || Number(effort) < 1 || Number(effort) > 10))) {
    return { message: "Review the workout details and exercise rows.", status: "error" };
  }

  let protocols: ReturnType<typeof protocolsFromForm> | undefined;
  if (formData.get("quality") === "yes") {
    try { protocols = protocolsFromForm(formData, libraryIds.length); }
    catch { return { status: "error", message: "Review every block, format, measurement and timed/distance target before assignment." }; }
  }
  const exercises = libraryIds.map((libraryExerciseId, index) => ({
    libraryExerciseId,
    load: loads[index] || null,
    loadUnit: "lb",
    referenceLoadLb: getStrings(formData, "referenceLoadLb")[index] || null,
    notes: [!protocols && efforts[index] ? `Target effort RPE ${efforts[index]}.` : "", notes[index]].filter(Boolean).join(" ") || null,
    reason: reasons[index] || null,
    reps: Number(reps[index]),
    restSeconds: rests[index] ? Number(rests[index]) : null,
    sets: Number(sets[index]),
    ...(protocols ? { protocol: protocols[index] } : {}),
  }));
  if (exercises.some((exercise) => !UUID_PATTERN.test(exercise.libraryExerciseId) ||
    !Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 100 ||
    !Number.isInteger(exercise.reps) || exercise.reps < 1 || exercise.reps > 1000)) {
    return { message: "One or more exercise values are invalid.", status: "error" };
  }

  const { error } = await supabase.rpc("approve_pound_prescription", {
    exercises,
    target_prescription_id: prescriptionId,
    workout_instructions: instructions || null,
    workout_scheduled_date: scheduledDate,
    workout_title: title,
    workout_duration_minutes: duration,
  });
  if (error) return { message: "The workout could not be assigned. Recheck equipment, constraints, and client access.", status: "error" };

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach");
  redirect(`/coach/clients/${clientId}?notice=prescription-assigned`);
}
