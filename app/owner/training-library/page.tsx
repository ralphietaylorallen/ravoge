import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { ProgrammingProfileForm, TrainingPublishingControls, type ProgrammingProfile } from "@/components/programming-library-controls";

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
      .select("id,title,status,source_type,source_filename,created_at,generation_excluded", { count: "exact" })
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + 29),
  ]);
  const [{ count: published }, { data: programmingProfile }, { data: catalogCounts }] = await Promise.all([
    supabase.from("training_library_items").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "published").eq("generation_excluded", false),
    supabase.from("gym_programming_profiles").select("version,summary,statistics,preferences").eq("organization_id", membership.organization_id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("get_training_catalog_counts"),
  ]);
  const { data: titles } = libraryItems?.length ? await supabase.from("training_library_reviews").select("training_item_id,title,revision").in("training_item_id", libraryItems.map(i => i.id)).eq("organization_id", membership.organization_id).order("revision", { ascending: false }) : { data: [] };
  const reviewedTitles = new Map<string, string>();
  for (const row of titles ?? []) if (!reviewedTitles.has(row.training_item_id)) reviewedTitles.set(row.training_item_id, row.title);
  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner workspace</p><h2>Training library</h2></div>
        <Link className={styles.action} href="/owner/training-library/import">Import workout history</Link>
      </div>
      <p role="status">{catalogCounts?.imported ?? count ?? 0} imported · {catalogCounts?.approved ?? 0} approved · {catalogCounts?.eligible ?? 0} available to generation before Client-specific safety checks</p>
      <Link className={styles.secondaryAction} href="/owner/training-library/load-rules">Review starting-load rules</Link>
      <ProgrammingProfileForm key={programmingProfile?.version ?? 0} profile={programmingProfile as ProgrammingProfile | undefined} published={published ?? 0}/>
      <section className={`${styles.panel} ${styles.libraryShell}`}>
        <span className={styles.statusPill}>{count ?? 0} source records</span>
        <h3>Historical workout imports</h3>
        <p>Review the original source and confirm structured exercises before publishing. Only published, compatible gym programming can be used by the generator.</p>
        {libraryItems?.length ? (
          <TrainingPublishingControls items={libraryItems.map(item => ({ ...item, title: reviewedTitles.get(item.id) ?? item.title }))}/>
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
