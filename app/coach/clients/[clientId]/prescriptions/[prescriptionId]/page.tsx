import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PrescriptionReviewForm, type RecommendationExercise } from "@/components/prescription-review-form";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

export default async function PrescriptionReviewPage({ params }: { params: Promise<{ clientId: string; prescriptionId: string }> }) {
  const { clientId, prescriptionId } = await params;
  const { membership, supabase, userId } = await requireRole("coach");
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[0-9a-f-]{36}$/i.test(prescriptionId)) notFound();
  const [{ data: coach }, { data: client }, { data: organization }, { data: prescription }, { data: library }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name").eq("id", clientId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("generated_prescriptions").select("id,title,objective,estimated_duration_minutes,volume_intent,rationale,original_recommendation,status").eq("id", prescriptionId).eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).eq("status", "draft").maybeSingle(),
    supabase.from("exercise_library").select("id,name,default_rep_min,default_set_min").eq("is_active", true).order("name"),
  ]);
  if (!client || !prescription) notFound();
  const recommendation = prescription.original_recommendation as RecommendationExercise[];
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={coach?.full_name ?? "Coach"} role="coach">
    <Link className={styles.backLink} href={`/coach/clients/${clientId}`}>← Back to {client.full_name}</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Ravoge recommendation</p><h2>Review first prescription</h2></div><p>Coach approval is required before this becomes visible to the client.</p></div>
    <section className={styles.rationalePanel}><div><span>Objective</span><strong>{prescription.objective}</strong></div><div><span>Duration</span><strong>{prescription.estimated_duration_minutes} minutes</strong></div><div><span>Volume intent</span><strong>{prescription.volume_intent}</strong></div><p>{prescription.rationale}</p></section>
    <PrescriptionReviewForm clientId={clientId} exerciseOptions={library ?? []} exercises={recommendation} prescriptionId={prescriptionId} scheduledDate={localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE)} title={prescription.title} />
  </DashboardShell>;
}
