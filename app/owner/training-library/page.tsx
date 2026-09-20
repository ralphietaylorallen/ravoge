import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function TrainingLibraryPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
  ]);
  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner workspace</p><h2>Training library</h2></div>
        <p>A secure staging area for the Pitt’s historical programming.</p>
      </div>
      <section className={`${styles.panel} ${styles.libraryShell}`}>
        <span className={styles.statusPill}>Import foundation</span>
        <h3>Historical workout imports are the next library milestone.</h3>
        <p>CSV, Excel, PDF, and Word sources will be staged, normalized into programs, workouts, blocks, exercises, and set prescriptions, then reviewed by an owner before publication.</p>
        <p className={styles.empty}>No files are uploaded or parsed in Gate 4.</p>
      </section>
    </DashboardShell>
  );
}
