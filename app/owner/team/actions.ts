"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export async function clearEmailInvitationsAction(ids: string[]) {
  const { supabase } = await requireRole("owner");
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { status: "error" as const, message: "Select valid email invitations to clear." };
  }
  try {
    const { data, error } = await supabase.rpc("clear_email_invitations", { invitation_ids: [...new Set(ids)] }).abortSignal(AbortSignal.timeout(15000));
    if (error || !Number.isInteger(data)) return { status: "error" as const, message: "Clearing was not confirmed. Refresh the list and check that the invitations have not been accepted before retrying." };
    revalidatePath("/owner/team");
    return { status: "success" as const, message: data ? `${data} email invitation${data === 1 ? "" : "s"} cleared. Accounts and memberships are unchanged.` : "These invitations were already cleared. Accounts and memberships are unchanged." };
  } catch {
    return { status: "error" as const, message: "Clearing could not be confirmed. Refresh the list before retrying. No accounts or memberships were removed." };
  }
}
