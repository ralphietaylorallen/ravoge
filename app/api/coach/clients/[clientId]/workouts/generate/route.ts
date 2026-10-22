import { NextResponse } from "next/server";

import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { createGeneratedWorkoutDraft } from "@/lib/create-workout-draft";

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
  const result = await createGeneratedWorkoutDraft({ clientId, supabase, userId });
  if (!result.ok) return reply({ error: result.message }, result.status);

  const suffix = result.generationIssue
    ? `?generationIssue=${encodeURIComponent(result.generationIssue)}`
    : "";
  return reply({ url: `/coach/clients/${clientId}/prescriptions/${result.prescriptionId}${suffix}` }, 201);
}
