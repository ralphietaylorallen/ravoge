import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { OwnerSignupRecoveryForm } from "@/components/owner-signup-recovery-form";
import { dashboardForRole, getActiveMembership, getVerifiedUser } from "@/lib/auth";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = {
  title: "Complete Owner Setup | Ravoge",
};

export default async function OwnerSignupRecoveryPage() {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");

  const membership = await getActiveMembership(userId);
  if (membership) redirect(dashboardForRole(membership.role));

  const { data: canRecover } = await supabase.rpc("has_pending_owner_signup");
  if (!canRecover) redirect("/signup?status=owner-setup-unavailable");

  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Owner account recovery</p>
      <h1 className={styles.heading}>Complete gym setup</h1>
      <p className={styles.lede}>
        Confirm the gym name you entered when creating this Owner account.
      </p>
      <OwnerSignupRecoveryForm />
      <p className={styles.intentNote}>
        This creates a new gym only. It cannot join or alter an existing organization.
      </p>
    </AuthEntryShell>
  );
}
