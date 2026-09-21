import { redirect } from "next/navigation";

import { completeIdentitySetupAction } from "@/app/auth/actions";
import { AuthEntryShell } from "@/components/auth-entry-shell";
import { dashboardForRole, getAccountType, getActiveMembership, getVerifiedUser, onboardingForRole } from "@/lib/auth";

import styles from "@/components/auth-entry.module.css";

export default async function IdentitySetupPage() {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const membership = await getActiveMembership(userId, supabase);
  if (membership) redirect(dashboardForRole(membership.role));
  const accountType = await getAccountType(userId, supabase);
  if (accountType === "coach" || accountType === "client") {
    redirect(onboardingForRole(accountType));
  }
  const { data: pendingOwner } = await supabase.rpc("has_pending_owner_signup");
  if (pendingOwner) redirect("/signup/owner/recover");

  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Complete account setup</p>
      <h1 className={styles.roleHeading}>Choose your profile</h1>
      <p className={styles.lede}>This does not grant access to a gym. A secure invitation is still required.</p>
      <div className={styles.identityActions}>
        <form action={completeIdentitySetupAction.bind(null, "coach")}>
          <button className={styles.primaryAction} type="submit">Continue as Coach <span aria-hidden="true">→</span></button>
        </form>
        <form action={completeIdentitySetupAction.bind(null, "client")}>
          <button className={styles.primaryAction} type="submit">Continue as Client <span aria-hidden="true">→</span></button>
        </form>
      </div>
    </AuthEntryShell>
  );
}
