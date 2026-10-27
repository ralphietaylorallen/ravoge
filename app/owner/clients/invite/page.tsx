import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { requireRole } from "@/lib/auth";

export default async function InviteClientPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: owner }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
  ]);

  return <DashboardShell compact gymName={organization?.name ?? "Your gym"} name={owner?.full_name ?? "Owner"} role="owner">
    <Link className={styles.backLink} href="/owner/clients">← Back to Clients</Link>
    <div className={styles.pageHeading}><div><h2>Invite client</h2><p className={styles.profileMeta}>Invite a client to {organization?.name ?? "your gym"} by email.</p></div></div>
    <section className={styles.panel} aria-label="Client email invitation">
      <p>They’ll create their own password and profile, then open their Client home screen. Already have Ravoge? They can sign in from the same invitation.</p>
      <InviteForm role="client" />
      <p className={styles.formHint}>This invitation grants Client access to this gym only. It never grants Coach or Owner access.</p>
    </section>
  </DashboardShell>;
}
