import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { OrganizationEnrollmentCard } from "@/components/organization-enrollment-card";
import { requireRole } from "@/lib/auth";
import { ensureOrganizationEnrollmentCredential } from "@/lib/organization-enrollment";

export default async function OwnerAppsPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: owner }, { data: organization }, coachCredential, clientCredential] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    ensureOrganizationEnrollmentCredential(supabase, "coach"),
    ensureOrganizationEnrollmentCredential(supabase, "client"),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner distribution</p><h2>Apps &amp; access</h2></div>
        <p>Use your gym’s reusable enrollment QRs for install-first onboarding, or send a person-specific email invitation from Team.</p>
      </div>
      <div className={styles.accessGrid}>
        <OrganizationEnrollmentCard credential={coachCredential} />
        <OrganizationEnrollmentCard credential={clientCredential} />
      </div>
      <section className={styles.securityNote}>
        <strong>Email option</strong>
        <p>Need a person-specific link? Use Team to email an invitation. Email invitations and these QRs use the same server-validated enrollment engine; neither contains a password or session.</p>
      </section>
    </DashboardShell>
  );
}
