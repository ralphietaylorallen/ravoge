import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function TrainingLibraryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const page = Math.min(1000, Math.max(1, Number(query.page) || 1));
  const offset = (Math.floor(page) - 1) * 30;
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: libraryItems, count }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase
      .from("training_library_items")
      .select("id,title,status,source_type,source_filename,created_at", { count: "exact" })
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + 29),
  ]);
  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner workspace</p><h2>Training library</h2></div>
        <Link className={styles.action} href="/owner/training-library/import">Import workout history</Link>
      </div>
      <section className={`${styles.panel} ${styles.libraryShell}`}>
        <span className={styles.statusPill}>{count ?? 0} source records</span>
        <h3>Historical workout imports</h3>
        <p>Review the original source and confirm structured exercises before publishing. Only published, compatible gym programming can be used by the generator.</p>
        {libraryItems?.length ? (
          <ul className={styles.activityList}>
            {libraryItems.map((item) => (
              <li key={item.id}>
                <div><Link href={`/owner/training-library/${item.id}`}><strong>{item.title}</strong></Link><small>{item.source_filename ?? "Manual entry"}</small></div>
                <span>{item.status === "review" ? "Needs review" : item.status}<Link href={`/owner/training-library/${item.id}`}>Review source →</Link></span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>No workout history has been imported yet.</p>}
      </section>
      <nav aria-label="Training library pages" className={styles.accessActions}>
        {page > 1 && <Link className={styles.secondaryAction} href={`/owner/training-library?page=${page - 1}`}>Previous</Link>}
        <span>Page {Math.floor(page)} · showing {Math.min(offset + 1, count ?? 0)}–{Math.min(offset + 30, count ?? 0)} of {count ?? 0}</span>
        {offset + 30 < (count ?? 0) && <Link className={styles.secondaryAction} href={`/owner/training-library?page=${page + 1}`}>Next</Link>}
      </nav>
    </DashboardShell>
  );
}
