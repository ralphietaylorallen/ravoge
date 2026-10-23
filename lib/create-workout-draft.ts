import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generationSaveIssue } from "@/lib/workout-generation-quality";
import { type GenerationInput } from "@/lib/workout-generation";
import { generateIntelligentWorkout, requiresReviewedGymRetry } from "@/lib/workout-intelligence";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GeneratedWorkoutDraftResult =
  | { ok: true; prescriptionId: string; generationIssue: string }
  | { ok: false; status: number; message: string };

export async function createGeneratedWorkoutDraft({
  clientId,
  supabase,
  userId,
}: {
  clientId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<GeneratedWorkoutDraftResult> {
  if (!UUID_PATTERN.test(clientId)) {
    return { ok: false, status: 404, message: "This Client is unavailable. Return to My Clients and choose an assigned Client." };
  }

  const { data, error } = await supabase.rpc("generate_initial_prescription_v0", {
    target_client_user_id: clientId,
  }).abortSignal(AbortSignal.timeout(5000));
  if (error || typeof data !== "string") {
    return { ok: false, status: 409, message: "A safe draft could not be created. Complete intake and goals, confirm the safety review, and review actual gym equipment below. No workout was assigned." };
  }

  const { data: input, error: inputError } = await supabase.rpc("get_pound_generation_input", {
    target_prescription_id: data,
  }).abortSignal(AbortSignal.timeout(5000));
  if (inputError || !input) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return {
      ok: false,
      status: 409,
      message: inputError?.message.includes("Review the new pain check-in")
        ? "Today’s pain check-in needs a Coach decision. Review the readiness recommendation before creating a workout. No workout was assigned."
        : "Training inputs changed or could not be checked. Review the latest intake and try Create workout again. No workout was assigned.",
    };
  }

  // Paid calls are bounded per authenticated Coach; repeated submissions still
  // have a safe deterministic path instead of an unbounded provider loop.
  const { count, error: countError } = await supabase
    .from("generated_prescriptions")
    .select("id", { count: "exact", head: true })
    .eq("coach_user_id", userId)
    .gte("generated_at", new Date(Date.now() - 60_000).toISOString())
    .abortSignal(AbortSignal.timeout(5000));
  const result = countError || (count ?? 4) > 3
    ? { workout: null, reason: "unavailable" as const, intelligence: undefined }
    : await generateIntelligentWorkout(input as GenerationInput);
  if((input as GenerationInput).intakeContext?.version===2 && !result.workout) {
    await supabase.rpc("discard_incomplete_quality_draft",{target_prescription_id:data});
    return {ok:false,status:409,message:"blocker" in result && result.blocker ? result.blocker : "A verified workout within the 90% gym-library requirement could not be created. Review intake restrictions and compatible gym programming, then try again. Nothing was assigned."};
  }
  // The legacy deterministic fallback reads exact-goal references. If the
  // wider reviewed catalog has compatible sources but that older shortlist
  // is empty, do not silently call global programming a gym-informed fallback.
  // Leave manual creation available and ask for a fresh provider attempt.
  if (!result.workout && requiresReviewedGymRetry(input as GenerationInput)) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return { ok: false, status: 503, message: "Reviewed gym programming is available, but automated adaptation could not finish. Try Create workout again shortly, or use the manual builder. No generic replacement was assigned." };
  }
  let generationIssue = result.reason === "invalid_output"
    ? `output:${"issue" in result ? result.issue : result.reason}`
    : "";

  let { error: saveError } = await supabase.rpc("complete_pound_prescription", {
    target_prescription_id: data,
    expected_snapshot: input.snapshot,
    proposed_workout: result.workout,
    generation_details: {
      ...(result.workout ? { model: result.model } : { reason: result.reason }),
      ...("method" in result && result.method ? {method:result.method,providerIssue:result.providerIssue}:{}),
      ...(result.intelligence ? { intelligence: result.intelligence, sourceReviewIds: result.workout?.sourceReviewIds ?? [] } : {}),
      ...("evidence" in result && result.evidence ? {evidence:result.evidence,provenanceAudit:result.workout?.provenanceAudit,coachReview:result.workout?.coachReview}:{}),
    },
  }).abortSignal(AbortSignal.timeout(5000));

  if (saveError && result.workout) {
    console.warn("[Ravoge generation] database rejected draft", {
      issue: generationSaveIssue(saveError.message),
      code: /^[A-Z0-9]{5}$/.test(saveError.code ?? "") ? saveError.code : "transport",
    });
    generationIssue = `save:${/^[A-Z0-9]{5}$/.test(saveError.code ?? "") ? saveError.code : "transport"}:${generationSaveIssue(saveError.message)}`;
    const fallback = requiresReviewedGymRetry(input as GenerationInput) || (input as GenerationInput).knowledgeCounts?.referenceEnabled
      ? {error:saveError} : await supabase.rpc("complete_pound_prescription", {
      target_prescription_id: data,
      expected_snapshot: input.snapshot,
      proposed_workout: null,
      generation_details: { reason: "invalid_output" },
    }).abortSignal(AbortSignal.timeout(5000));
    saveError = fallback.error;
  }

  if (saveError) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return { ok: false, status: 409, message: "The training snapshot changed or validation failed. Review intake, restrictions and equipment, then create a fresh draft. Nothing was assigned." };
  }

  return { ok: true, prescriptionId: data, generationIssue };
}
