import { NextResponse } from "next/server";

import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { createGeneratedWorkoutDraft } from "@/lib/create-workout-draft";
import { prepareTrainingSession } from "@/lib/training-session";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

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
  if (!membership || membership.role !== "coach") {
    return reply({ error: "Only an active Coach can create a workout." }, 403);
  }

  const { clientId } = await params;
  if(!/^[0-9a-f-]{36}$/i.test(clientId))return reply({error:"Client unavailable."},404);
  try{await prepareTrainingSession(supabase,clientId,await request.json());}
  catch(error){return reply({error:error instanceof Error?error.message:"Today’s check-in could not be saved."},422);}

  const { data: organization } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", membership.organization_id)
    .maybeSingle();
  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const now = new Date();
  const today = localDateInTimeZone(now, timezone);
  const localTimeParts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
  }).formatToParts(now);
  const localTimeMap = Object.fromEntries(localTimeParts.map((part) => [part.type, part.value]));
  const currentMinutes = (Number(localTimeMap.hour) % 24) * 60 + Number(localTimeMap.minute);
  const { data: existingWorkouts } = await supabase
    .from("workout_assignments")
    .select("id,status,scheduled_time")
    .eq("organization_id", membership.organization_id)
    .eq("coach_user_id", userId)
    .eq("client_user_id", clientId)
    .eq("scheduled_date", today)
    .in("status", ["assigned", "in_progress"])
    .order("scheduled_time", { ascending: true, nullsFirst: false })
    .limit(10);
  const inProgressWorkout = existingWorkouts?.find((workout) => workout.status === "in_progress");
  const timedWorkouts = (existingWorkouts ?? []).filter((workout) => workout.status === "assigned" && workout.scheduled_time);
  const closestTimedWorkout = timedWorkouts
    .map((workout) => {
      const [hours, minutes] = String(workout.scheduled_time).split(":").map(Number);
      return { workout, distance: Math.abs(hours * 60 + minutes - currentMinutes) };
    })
    .sort((left, right) => left.distance - right.distance)[0]?.workout;
  const existingWorkout = inProgressWorkout
    ?? closestTimedWorkout
    ?? existingWorkouts?.find((workout) => workout.status === "assigned");
  if (existingWorkout) return reply({ url: `/coach/clients/${clientId}/workouts/${existingWorkout.id}` }, 200);

  const result = await createGeneratedWorkoutDraft({ clientId, supabase, userId });
  if (!result.ok) return reply({ error: result.message }, result.status);

  const suffix = result.generationIssue
    ? `?generationIssue=${encodeURIComponent(result.generationIssue)}`
    : "";
  return reply({ url: `/coach/clients/${clientId}/prescriptions/${result.prescriptionId}${suffix}` }, 201);
}
