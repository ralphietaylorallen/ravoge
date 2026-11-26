import { NextResponse } from "next/server";
import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { createGeneratedWorkoutDraft } from "@/lib/create-workout-draft";
import { validLocalDate } from "@/lib/coach-availability";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== host)) return reply({ error: "Open Ravoge directly to plan a workout." }, 403);
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return reply({ error: "Sign in again to plan a workout." }, 401);
  const membership = await getActiveMembership(userId, supabase);
  if (membership?.role !== "coach") return reply({ error: "Active Coach access is required." }, 403);
  const { clientId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return reply({ error: "Client unavailable." }, 404);
  const body = await request.json().catch(() => null);
  if (typeof body?.date !== "string" || !validLocalDate(body.date) || typeof body?.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) {
    return reply({ error: "Choose a valid date and time." }, 400);
  }
  const { data: readiness, error: readinessError } = await supabase.rpc("get_workout_generation_readiness", { target_client_user_id: clientId });
  if (readinessError) return reply({ error: "The client’s intake could not be loaded. Reopen their profile and try again." }, 422);
  if (readiness?.needsSafetyReview) {
    if (body.intakeReviewed !== true) return reply({ error: "Review the client’s updated intake before generating.", requiresIntakeReview: true }, 422);
    const { error } = await supabase.rpc("confirm_intake_generation_safety", { target_intake_id: readiness.intakeId });
    if (error) return reply({ error: "The intake review could not be saved. Reopen the client’s intake and try again." }, 422);
  }
  const result = await createGeneratedWorkoutDraft({ clientId, plannedFor: { organizationId: membership.organization_id, date: body.date, time: body.time }, supabase, userId });
  if (!result.ok) return reply({ error: result.message }, result.status);
  const base = `/coach/clients/${clientId}`;
  const query = new URLSearchParams({ mode: "plan" });
  if (result.generationIssue) query.set("generationIssue", result.generationIssue);
  return reply({ url: result.workoutId ? `${base}/workouts/${result.workoutId}` : `${base}/prescriptions/${result.prescriptionId}?${query}` }, result.workoutId ? 200 : 201);
}
