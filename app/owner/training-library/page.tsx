import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function TrainingLibraryPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: libraryItems }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase
      .from("training_library_items")
      .select("id,title,source_type,source_filename,created_at")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner workspace</p><h2>Training library</h2></div>
        <Link className={styles.action} href="/owner/training-library/import">Import workout history</Link>
      </div>
      <section className={`${styles.panel} ${styles.libraryShell}`}>
        <span className={styles.statusPill}>Draft source records</span>
        <h3>Historical workout imports</h3>
        <p>CSV and XLSX rows are preserved here as organization-scoped draft source records for later review and normalization.</p>
        {libraryItems?.length ? (
          <ul className={styles.activityList}>
            {libraryItems.map((item) => (
              <li key={item.id}>
                <div><strong>{item.title}</strong><small>{item.source_filename ?? "Manual entry"}</small></div>
                <span>{item.source_type}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("en-US")}</time></span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>No workout history has been imported yet.</p>}
      </section>
    </DashboardShell>
  );
}
