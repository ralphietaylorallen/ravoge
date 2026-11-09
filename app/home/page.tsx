import { redirect } from "next/navigation";
import { dashboardForRole, getActiveMembership, getVerifiedUser, getAccountType, onboardingForRole } from "@/lib/auth";

// Shared logos (including reports and error screens) resolve current verified
// access without mutating cookies, signing out, or visiting the public homepage.
export default async function AuthenticatedHome() {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const membership = await getActiveMembership(userId, supabase);
  if (membership) redirect(dashboardForRole(membership.role));
  const role = await getAccountType(userId, supabase);
  if (role === "coach" || role === "client") redirect(onboardingForRole(role));
  if (role === "owner") redirect("/signup/owner/recover");
  redirect("/access");
}
