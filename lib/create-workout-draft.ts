import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generationSaveIssue } from "@/lib/workout-generation-quality";
import { type GenerationInput } from "@/lib/workout-generation";
import { generateIntelligentWorkout } from "@/lib/workout-intelligence";

import { ageFromBirthYear } from "@/lib/session-programming";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GeneratedWorkoutDraftResult =
  | { ok: true; prescriptionId: string; generationIssue: string; workoutId?: string }
  | { ok: false; status: number; message: string };

export async function createGeneratedWorkoutDraft({
  clientId,
  bookingId,
  supabase,
  userId,
  workoutRequest,
}: {
  clientId: string;
  bookingId?: string;
  supabase: SupabaseClient;
  userId: string;
  workoutRequest?: import("./workout-request").WorkoutRequest;
}): Promise<GeneratedWorkoutDraftResult> {
  if (!UUID_PATTERN.test(clientId)) {
    return { ok: false, status: 404, message: "This Client is unavailable. Return to My Clients and choose an assigned Client." };
  }

  const initial = bookingId
    ? await supabase.rpc("begin_booking_workout_draft", {target_booking_id:bookingId,target_client_user_id:clientId}).abortSignal(AbortSignal.timeout(5000))
    : await supabase.rpc("generate_initial_prescription_v0", {target_client_user_id:clientId}).abortSignal(AbortSignal.timeout(5000));
  if (bookingId && !initial.error && initial.data?.workoutId) return {ok:true,prescriptionId:initial.data.prescriptionId ?? "",workoutId:initial.data.workoutId,generationIssue:""};
  const data = bookingId ? initial.data?.prescriptionId : initial.data;
  const error = initial.error;
  if (bookingId && initial.data?.busy) return {ok:false,status:409,message:"This session’s draft is still being prepared. Reopen the session in a moment; do not generate a second workout."};
  if (bookingId && !error && initial.data?.reused && typeof data === "string") return {ok:true,prescriptionId:data,generationIssue:"",workoutId:initial.data.workoutId ?? undefined};
  if (error || typeof data !== "string") {
    return { ok: false, status: 409, message: "A safe draft could not be created. Complete intake and goals, confirm the safety review, and review actual gym equipment below. No workout was assigned." };
  }

  if(workoutRequest) {
    const configured=await supabase.rpc("configure_workout_generation",{target_prescription_id:data,request:workoutRequest}).abortSignal(AbortSignal.timeout(5000));
    if(configured.error){
      await supabase.rpc("discard_incomplete_quality_draft",{target_prescription_id:data});
      return {ok:false,status:409,message:"Workout choices could not be saved. Refresh and try again."};
    }
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

  const [{data:intake,error:ageError},{data:recent,error:recentError},{data:sessionContext,error:contextError}]=await Promise.all([
    supabase.from("client_intakes").select("birth_year").eq("id",input.intakeId).eq("client_user_id",clientId).abortSignal(AbortSignal.timeout(5000)).maybeSingle(),
    supabase.from("generated_prescriptions").select("original_recommendation").eq("client_user_id",clientId).eq("coach_user_id",userId).neq("id",data).order("generated_at",{ascending:false}).limit(3).abortSignal(AbortSignal.timeout(5000)),
    supabase.rpc("get_recent_session_report_context",{target_prescription_id:data}).abortSignal(AbortSignal.timeout(5000)),
  ]);
  if(ageError||recentError||contextError){
    await supabase.rpc("discard_incomplete_quality_draft",{target_prescription_id:data});
    return {ok:false,status:503,message:"The saved intake or recent sessions could not be loaded. Try again."};
  }
  const generationInput:GenerationInput={...input,...(bookingId||workoutRequest?.scheduledDate?{todayReadiness:null}:{}),recentSessionContext:sessionContext,age:ageFromBirthYear(intake?.birth_year),recentDrafts:(recent??[]).filter(d=>Array.isArray(d.original_recommendation)).map(d=>({exercises:d.original_recommendation}))};

  // Paid calls are bounded per authenticated Coach; repeated submissions still
  // fail clearly instead of creating an unbounded provider loop.
  const { count, error: countError } = await supabase
    .from("generated_prescriptions")
    .select("id", { count: "exact", head: true })
    .eq("coach_user_id", userId)
    .gte("generated_at", new Date(Date.now() - 60_000).toISOString())
    .abortSignal(AbortSignal.timeout(5000));
  if(countError || (count ?? 4)>3) {
    await supabase.rpc("discard_incomplete_quality_draft",{target_prescription_id:data});
    return {ok:false,status:countError?503:429,message:countError?"Generation availability could not be checked. Try again.":"Several workouts were requested in the last minute. Wait one minute, then generate again."};
  }
  const result=await generateIntelligentWorkout(generationInput);
  if(!result.workout) {
    await supabase.rpc("discard_incomplete_quality_draft",{target_prescription_id:data});
    return {ok:false,status:409,message:"blocker" in result && result.blocker ? result.blocker : "AI could not produce a verified catalog-based workout. Your intake is saved. Retry generation or use the manual planner; no fallback was assigned."};
  }
  const { error: saveError } = await supabase.rpc("complete_pound_prescription", {
    target_prescription_id: data,
    expected_snapshot: input.snapshot,
    proposed_workout: result.workout,
    generation_details: {
      model: result.model,
      ...("method" in result && result.method ? {method:result.method,providerIssue:"providerIssue" in result ? result.providerIssue : undefined}:{}),
      bayesianTraining:input.bayesianTraining,sessionRequest:input.sessionRequest,
      ...(result.intelligence ? { intelligence: result.intelligence, sourceReviewIds: result.workout?.sourceReviewIds ?? [] } : {}),
      ...("evidence" in result && result.evidence ? {evidence:result.evidence,provenanceAudit:result.workout?.provenanceAudit,coachReview:result.workout?.coachReview}:{}),
    },
  }).abortSignal(AbortSignal.timeout(5000));

  if (saveError && result.workout) {
    console.warn("[Ravoge generation] database rejected draft", {
      issue: generationSaveIssue(saveError.message),
      code: /^[A-Z0-9]{5}$/.test(saveError.code ?? "") ? saveError.code : "transport",
    });

  }

  if (saveError) {
    await supabase.rpc("discard_incomplete_quality_draft", { target_prescription_id: data }).abortSignal(AbortSignal.timeout(5000));
    return { ok: false, status: 409, message: "The training snapshot changed or validation failed. Review intake, restrictions and equipment, then create a fresh draft. Nothing was assigned." };
  }

  if (bookingId) {
    const {error:finishError}=await supabase.rpc("finish_booking_workout_draft",{target_prescription_id:data});
    if(finishError)return {ok:false,status:409,message:"The draft was generated but could not be confirmed. Reopen the scheduled session before trying again."};
  }
  return { ok: true, prescriptionId: data, generationIssue: "" };
}
