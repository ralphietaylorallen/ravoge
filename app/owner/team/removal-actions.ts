"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { cancelStaffBookingAction } from "@/app/schedule/staff-actions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeTeamMemberAction(memberId: string, role: "coach" | "client", assignmentIds: string[], _state: {status: string; message?: string}, form: FormData) {
  const { supabase } = await requireRole("owner");
  if (!uuid.test(memberId) || !Array.isArray(assignmentIds) || assignmentIds.length > 1000 || assignmentIds.some(id => !uuid.test(id)) || (assignmentIds.length > 0 && form.get("endAssignments") !== "yes")) return {status:"error",message:"Review and confirm the affected Coach assignments."};
  try {
    const {data,error} = await supabase.rpc("remove_organization_member", {target_user_id:memberId,target_role:role,confirmed_assignment_ids:assignmentIds}).abortSignal(AbortSignal.timeout(15000));
    if (error || typeof data !== "boolean") return {status:"error",message:"Access removal was not confirmed. Resolve future appointments, refresh this page and confirm the current assignments before retrying."};
    for (const path of ["/owner/team", "/owner/clients", "/owner/schedule", "/coach", "/client", `/owner/team/${memberId}/remove`]) revalidatePath(path);
    return {status:"success",message:"Gym access removed. The person's login and historical records are preserved."};
  } catch { return {status:"error",message:"Access removal could not be confirmed. Refresh before retrying."}; }
}

export async function cancelRemovalAppointmentAction(memberId:string, bookingId:string, clientId:string, state:{status:"idle"|"error"|"success";message?:string}, form:FormData) {
  if (!uuid.test(memberId)) return {status:"error" as const,message:"That member is unavailable."};
  const result = await cancelStaffBookingAction("owner",bookingId,clientId,state,form);
  revalidatePath(`/owner/team/${memberId}/remove`);
  return result;
}
