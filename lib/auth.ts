import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AccountRole = "owner" | "coach" | "client";

export const dashboardForRole = (role: AccountRole) => `/${role}`;

export async function getVerifiedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;

  if (error || typeof subject !== "string") {
    return { supabase, userId: null };
  }

  return { supabase, userId: subject };
}

export async function getActiveMembership(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!data || !["owner", "coach", "client"].includes(data.role)) {
    return null;
  }

  return data as {
    id: string;
    organization_id: string;
    role: AccountRole;
    status: "active";
  };
}

export async function requireRole(expectedRole: AccountRole) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect(`/login?next=/${expectedRole}`);

  const membership = await getActiveMembership(userId);
  if (!membership) redirect("/signup?status=membership-required");
  if (membership.role !== expectedRole) {
    redirect(dashboardForRole(membership.role));
  }

  return { membership, supabase, userId };
}
