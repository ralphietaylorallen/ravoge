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
        <p>Upload a straightforward CSV or XLSX file, review the parsed rows, then save them as draft source records for this gym.</p>
      </div>
      <section className={styles.panel}>
        <TrainingHistoryImport />
      </section>
    </DashboardShell>
  );
}
