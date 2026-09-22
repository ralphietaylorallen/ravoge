import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { requireRole } from "@/lib/auth";

import styles from "@/components/auth-entry.module.css";

export default async function ClientWelcomePage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: organization }, { data: assignment }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", membership.organization_id)
      .single(),
    supabase
      .from("coach_client_assignments")
      .select("coach_user_id")
      .eq("organization_id", membership.organization_id)
      .eq("client_user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  const { data: coach } = assignment
    ? await supabase
        .from("profiles")
        .select("full_name,preferred_name")
        .eq("id", assignment.coach_user_id)
        .maybeSingle()
    : { data: null };

  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>You&apos;re in</p>
      <h1 className={styles.installHeading}>{organization?.name ?? "Your gym"}</h1>
      <p className={styles.lede}>
        Coach: {coach?.preferred_name || coach?.full_name || "Your gym will assign a Coach"}
      </p>

      <div className={styles.installActions}>
        <PwaInstallButton className={styles.primaryAction} fallbackHref="/client/install" />
        <Link className={styles.installSecondary} href="/client">Open Client App</Link>
      </div>

      <div className={styles.installGrid}>
        <section><span>01</span><h2>Open in Safari</h2><p>On iPhone or iPad, open Ravoge in Safari.</p></section>
        <section><span>02</span><h2>Tap Share</h2><p>Choose Add to Home Screen, then tap Add.</p></section>
        <section><span>03</span><h2>Open Ravoge</h2><p>Use the Ravoge icon and sign in with the account you just created. The invitation is not needed again.</p></section>
      </div>
    </AuthEntryShell>
  );
}
