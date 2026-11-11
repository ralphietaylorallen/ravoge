import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { createGeneratedWorkoutDraft } from "@/lib/create-workout-draft";
export const maxDuration=60;
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f-]{36}$/i;
const reply=(body:Record<string,string>,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request,{params}:{params:Promise<{clientId:string;bookingId:string}>}) {
  const origin=request.headers.get("origin"), host=request.headers.get("x-forwarded-host")??request.headers.get("host");
  if(origin&&(!URL.canParse(origin)||new URL(origin).host!==host))return reply({error:"Open Ravoge directly to prepare this session."},403);
  const {supabase,userId}=await getVerifiedUser();
  if(!userId)return reply({error:"Sign in again to prepare the session."},401);
  const membership=await getActiveMembership(userId,supabase);
  if(membership?.role!=="coach")return reply({error:"Only an active Coach can prepare a session workout."},403);
  const {clientId,bookingId}=await params;
  if(![clientId,bookingId].every(id=>UUID.test(id)))return reply({error:"Session unavailable."},404);
  const result=await createGeneratedWorkoutDraft({clientId,bookingId,supabase,userId});
  if(!result.ok)return reply({error:result.message},result.status);
  revalidatePath(`/coach/clients/${clientId}/sessions/${bookingId}`);
  revalidatePath(`/coach/clients/${clientId}`);
  return reply({url:result.workoutId ? `/coach/clients/${clientId}/workouts/${result.workoutId}` : `/coach/clients/${clientId}/prescriptions/${result.prescriptionId}`},201);
}
