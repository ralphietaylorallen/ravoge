import { NextResponse } from "next/server";

import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { selectTodayWorkout } from "@/lib/coach-workday";
import { createGeneratedWorkoutDraft } from "@/lib/create-workout-draft";
import { prepareTrainingSession } from "@/lib/training-session";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

const UUID = /^[0-9a-f-]{36}$/i;

export const maxDuration=60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, string>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== host)) {
    return reply({ error: "Open Ravoge directly and try Create workout again." }, 403);
  }

  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return reply({ error: "Your session ended. Sign in again, then create the workout." }, 401);
  const membership = await getActiveMembership(userId, supabase);
  if (!membership || membership.role !== "coach" && membership.role !== "owner") {
    return reply({ error: "Active Coach or Owner access is required." }, 403);
  }

  const { clientId } = await params;
  if (!UUID.test(clientId)) return reply({ error: "Client unavailable." }, 404);
  const body = await request.json().catch(() => null);
  const bookingId = body?.bookingId;
  const workoutId = body?.workoutId;
  if ((bookingId !== undefined && (typeof bookingId !== "string" || !UUID.test(bookingId))) ||
      (workoutId !== undefined && (typeof workoutId !== "string" || !UUID.test(workoutId))) ||
      (bookingId && workoutId)) return reply({ error: "Choose a valid session or workout." }, 400);
  if ((bookingId || workoutId) && membership.role !== "coach") return reply({ error: "Coach access is required for this session." }, 403);
  const now = new Date();
  if (bookingId) {
    const { data: booking, error } = await supabase.from("bookings")
      .select("starts_at,timezone,status,session_type").eq("id", bookingId)
      .eq("organization_id", membership.organization_id).eq("coach_user_id", userId)
      .eq("client_user_id", clientId).maybeSingle();
    if (error) return reply({ error: "This appointment could not be verified. Refresh and try again." }, 503);
    if (!booking || booking.status !== "scheduled" || booking.session_type === "Intake" ||
        localDateInTimeZone(booking.starts_at, booking.timezone) !== localDateInTimeZone(now, booking.timezone)) {
      return reply({ error: "Open today’s scheduled training session to check readiness." }, 409);
    }
  }
  if (workoutId) {
    const [{ data: workout, error }, { data: organization, error: organizationError }] = await Promise.all([
      supabase.from("workout_assignments").select("scheduled_date,status").eq("id", workoutId)
        .eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).maybeSingle(),
      supabase.from("organizations").select("timezone").eq("id", membership.organization_id).maybeSingle(),
    ]);
    if (error || organizationError) return reply({ error: "The planned workout could not be verified. Refresh and try again." }, 503);
    if (!workout || !["assigned", "in_progress"].includes(workout.status) ||
        workout.scheduled_date !== localDateInTimeZone(now, organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE)) {
      return reply({ error: "This planned workout is unavailable for today. Reopen the client’s plan." }, 409);
    }
  }
  try{await prepareTrainingSession(supabase,clientId,body,workoutId ?? null);}
  catch(error){return reply({error:error instanceof Error?error.message:"Today’s check-in could not be saved."},422);}
  if (workoutId) return reply({ url: `/coach/clients/${clientId}/workouts/${workoutId}` }, 200);
  if (bookingId) {
    const result = await createGeneratedWorkoutDraft({ clientId, bookingId, dayOfSession: true, supabase, userId });
    if (!result.ok) return reply({ error: result.message }, result.status);
    const base = `/coach/clients/${clientId}`;
    if (result.workoutId) return reply({ url: `${base}/workouts/${result.workoutId}` }, 200);
    const issue = result.generationIssue ? `?generationIssue=${encodeURIComponent(result.generationIssue)}` : "";
    return reply({ url: `${base}/prescriptions/${result.prescriptionId}${issue}` }, 201);
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", membership.organization_id)
    .maybeSingle();
  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(now, timezone);
  const { data: existingWorkouts, error: existingError } = await supabase
    .from("workout_assignments")
    .select("id,status,scheduled_time")
    .eq("organization_id", membership.organization_id)
    .eq("coach_user_id", userId)
    .eq("client_user_id", clientId)
    .eq("scheduled_date", today)
    .in("status", ["assigned", "in_progress"])
    .order("scheduled_time", { ascending: true, nullsFirst: false })
    .limit(10);
  if(existingError)return reply({error:"Saved workouts could not be checked. Try again before creating another workout."},503);
  const existingWorkout = selectTodayWorkout(existingWorkouts ?? [], now, timezone);
  if (existingWorkout) return reply({ url: `/${membership.role}/clients/${clientId}/workouts/${existingWorkout.id}` }, 200);

  const result = await createGeneratedWorkoutDraft({ clientId, supabase, userId });
  if (!result.ok) return reply({ error: result.message }, result.status);

  const suffix = result.generationIssue
    ? `?generationIssue=${encodeURIComponent(result.generationIssue)}`
    : "";
  return reply({ url: `/${membership.role}/clients/${clientId}/prescriptions/${result.prescriptionId}${suffix}` }, 201);
}
