import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function ClientPage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: assignment }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("coach_user_id").eq("organization_id", membership.organization_id).eq("status", "active").limit(1).maybeSingle(),
  ]);
  const { data: coach } = assignment
    ? await supabase.from("profiles").select("full_name").eq("id", assignment.coach_user_id).maybeSingle()
    : { data: null };

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Client"} role="client">
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Your coach</h2>
          <p className={styles.empty}>{coach?.full_name ?? "A coach has not been assigned yet."}</p>
        </section>
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Account foundation ready</h2>
          <p className={styles.empty}>Only your authorized gym relationship is visible here. Training features come next.</p>
        </section>
      </div>
    </DashboardShell>
  );
}
