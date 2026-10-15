import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { TrainingLibraryReview } from "@/components/training-library-review";
import { requireRole } from "@/lib/auth";
import { sourceFields, suggestTrainingReview, type ReviewedExercise } from "@/lib/training-review";

export default async function TrainingReviewPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: org }, { data: item }, { data: reviews }, { data: library }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("training_library_items").select("id,title,normalized_content,source_filename,status").eq("id", itemId).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("training_library_reviews").select("*").eq("training_item_id", itemId).eq("organization_id", membership.organization_id).order("revision", { ascending: false }),
    supabase.from("exercise_library").select("id,name,equipment_requirements").eq("is_active", true).order("name"),
  ]);
  if (!item) notFound();
  const suggestion = suggestTrainingReview(item.normalized_content, library ?? []);
  const review = reviews?.[0];
  return <DashboardShell gymName={org?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
    <Link className={styles.backLink} href="/owner/training-library">← Training library</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Source review</p><h2>{review?.title ?? (suggestion.title || item.title)}</h2></div><span className={styles.statusPill}>{item.status === "review" ? "Needs review" : item.status}</span></div>
    <section className={styles.operationCard}><h3>Original imported row</h3><p>{item.source_filename ?? "Manual source"} · preserved unchanged</p><dl className={styles.sourceFields}>{sourceFields(item.normalized_content).map((field, index) => <div key={index}><dt>{field.header}</dt><dd>{field.value || "—"}</dd></div>)}</dl></section>
    {suggestion.issues.length > 0 && <section className={styles.operationCard}><h3>Needs review</h3><p>Some source instructions cannot be interpreted as fixed sets and reps safely.</p><ul>{suggestion.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></section>}
    <section className={styles.operationCard}><h3>Review and publish</h3><TrainingLibraryReview itemId={itemId} title={review?.title ?? (suggestion.title || item.title)} library={library ?? []} exercises={(review?.exercises ?? suggestion.exercises) as ReviewedExercise[]} goal={review?.primary_goal} duration={review?.duration_minutes} notes={review?.review_notes} canPublish={!suggestion.issues.length}/></section>
    {reviews?.length ? <section className={styles.operationCard}><h3>Review history</h3><ul className={styles.activityList}>{reviews.map(row => <li key={row.id}><span>Revision {row.revision} · {row.status}</span><time>{new Date(row.reviewed_at).toLocaleString("en-US")}</time></li>)}</ul></section> : null}
  </DashboardShell>;
}
