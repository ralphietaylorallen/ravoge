import { AppAccessCard } from "@/components/app-access-card";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function OwnerAppsPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: owner }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner distribution</p><h2>Apps &amp; access</h2></div>
        <p>Share the installable Ravoge web experience. Secure gym membership still requires an email-bound invitation from Team.</p>
      </div>
      <div className={styles.accessGrid}>
        <AppAccessCard description="Optimized for shared gym iPads and a coach’s phone, with individual sign-in for every coach." installPath="/coach/install" role="Coach" />
        <AppAccessCard description="A mobile-first path for clients to install Ravoge, sign in, and reach only their authorized training records." installPath="/client/install" role="Client" />
      </div>
      <section className={styles.securityNote}>
        <strong>New member?</strong>
        <p>Create the Coach or Client invitation from Team first. Its opaque link binds the intended email, organization, and role in the database; these general App links do not.</p>
      </section>
    </DashboardShell>
  );
}
