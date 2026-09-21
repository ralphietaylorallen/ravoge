import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function getActiveMembership(
  userId: string,
  authenticatedClient?: SupabaseClient,
) {
  const supabase = authenticatedClient ?? await createClient();
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

export async function getAccountType(
  userId: string,
  authenticatedClient?: SupabaseClient,
) {
  const supabase = authenticatedClient ?? await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  return data && ["owner", "coach", "client"].includes(data.account_type)
    ? data.account_type as AccountRole
    : null;
}

export const onboardingForRole = (role: Extract<AccountRole, "coach" | "client">) =>
  `/${role}/onboarding`;

export async function requireRole(expectedRole: AccountRole) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect(`/login?next=/${expectedRole}`);

  const membership = await getActiveMembership(userId, supabase);
  if (!membership) {
    const accountType = await getAccountType(userId, supabase);
    if (accountType === "coach" || accountType === "client") {
      redirect(onboardingForRole(accountType));
    }
    if (accountType === "owner") redirect("/signup/owner/recover");
    redirect("/signup?status=membership-required");
  }
  if (membership.role !== expectedRole) {
    redirect(dashboardForRole(membership.role));
  }

  return { membership, supabase, userId };
}

export async function requireUnaffiliatedRole(
  expectedRole: Extract<AccountRole, "coach" | "client">,
) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect(`/login?next=/${expectedRole}/onboarding`);

  const membership = await getActiveMembership(userId, supabase);
  if (membership) redirect(dashboardForRole(membership.role));

  const accountType = await getAccountType(userId, supabase);
  if (accountType !== expectedRole) {
    if (accountType === "coach" || accountType === "client") {
      redirect(onboardingForRole(accountType));
    }
    redirect("/signup");
  }

  return { accountType, supabase, userId };
}
