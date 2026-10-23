"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { UUID, validateInjurySpot, type InjurySpot } from "@/lib/intake-history";

export async function saveInjurySpotAction(clientId: string, value: unknown): Promise<{ok:true;spot:InjurySpot}|{ok:false;message:string}> {
  const { supabase } = await requireRole("coach");
  if (!UUID.test(clientId)) return {ok:false,message:"This Client is unavailable."};
  let spot: InjurySpot;
  try { spot=validateInjurySpot(value); } catch(error) { return {ok:false,message:error instanceof Error?error.message:"Review this spot."}; }
  const {error}=await supabase.rpc("save_client_injury_spot",{target_client_user_id:clientId,spot_payload:spot,remove_spot:false}).abortSignal(AbortSignal.timeout(10000));
  if(error) return {ok:false,message:"This spot was not saved. Check your connection and Client assignment, then try again. Your answers are still here."};
  revalidatePath(`/coach/clients/${clientId}`);
  return {ok:true,spot};
}
export async function removeInjurySpotAction(clientId:string,spotId:string):Promise<{ok:boolean;message:string}> {
  const {supabase}=await requireRole("coach");
  if(!UUID.test(clientId)||!UUID.test(spotId)) return {ok:false,message:"This spot is unavailable."};
  const {error}=await supabase.rpc("save_client_injury_spot",{target_client_user_id:clientId,spot_payload:{id:spotId},remove_spot:true}).abortSignal(AbortSignal.timeout(10000));
  if(error) return {ok:false,message:"The spot could not be removed. Please try again."};
  revalidatePath(`/coach/clients/${clientId}`);
  return {ok:true,message:"Spot removed; earlier history preserved."};
}
