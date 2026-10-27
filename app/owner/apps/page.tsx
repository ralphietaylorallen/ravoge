import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { OrganizationEnrollmentCard } from "@/components/organization-enrollment-card";
import { AppAccessCard } from "@/components/app-access-card";
import { InviteForm } from "@/components/invite-form";
import { requireRole } from "@/lib/auth";
import { ensureOrganizationEnrollmentCredential } from "@/lib/organization-enrollment";

export default async function OwnerAppsPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: owner }, { data: organization }, clientCredential] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    ensureOrganizationEnrollmentCredential(supabase, "client"),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner distribution</p><h2>Apps &amp; access</h2></div>
        <p>Send each Coach a secure Ravoge invitation. Share your gym’s Client QR with members.</p>
      </div>
      <div className={styles.accessGrid}>
        <AppAccessCard description="Install the Coach App on an iPad or phone. Installation alone does not grant gym access." installPath="/coach/install" role="Coach" />
        <OrganizationEnrollmentCard credential={clientCredential} />
      </div>
      <section className={styles.panel}>
        <h2>Invite coach</h2>
        <p className={styles.empty}>Creates the Coach’s secure gym invitation and sends it from Ravoge.</p>
        <InviteForm role="coach" />
      </section>
      <section className={styles.securityNote}>
        <strong>Secure Coach access</strong>
        <p>Each Coach invitation is locked to the invited email, role, and gym. Coaches create their own password.</p>
      </section>
    </DashboardShell>
  );
}
