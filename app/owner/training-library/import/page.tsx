import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { TrainingHistoryImport } from "@/components/training-history-import";
import { requireRole } from "@/lib/auth";

export default async function TrainingLibraryImportPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <Link className={styles.backLink} href="/owner/training-library">← Back to training library</Link>
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner training library</p><h2>Import workout history</h2></div>
        <p>Upload CSV or XLSX, preview the source rows, then add them to your gym’s programming library. Successful imports are usable immediately as references; mapping is optional. Your original file and raw values are preserved.</p>
      </div>
      <section className={styles.panel}>
        <TrainingHistoryImport />
      </section>
    </DashboardShell>
  );
}
