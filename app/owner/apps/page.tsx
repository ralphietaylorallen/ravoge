import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { OrganizationEnrollmentCard } from "@/components/organization-enrollment-card";
import { AppAccessCard } from "@/components/app-access-card";
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
        <p>Invite each Coach from Team. Share your gym’s Client QR with members.</p>
      </div>
      <div className={styles.accessGrid}>
        <AppAccessCard description="Install the Coach App on an iPad or phone. Each Coach needs their own email invitation from Team to join your gym. This QR only opens installation and login." installPath="/coach/install" role="Coach" />
        <OrganizationEnrollmentCard credential={clientCredential} />
      </div>
      <section className={styles.securityNote}>
        <strong>Email option</strong>
        <p>Use Team to send a secure, person-specific invitation. Coaches join by individual email invitation only. Each person uses their own account and password.</p>
      </section>
    </DashboardShell>
  );
}
