import { canonicalPounds, poundsInText } from "@/lib/weight-units";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PrescriptionReviewForm, type RecommendationExercise } from "@/components/prescription-review-form";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import { FALLBACK_MESSAGE, type GenerationInput } from "@/lib/workout-generation";
import { TRAINING_FOCUS } from "@/lib/training-focus";
import { programmingEvidence } from "@/lib/programming-evidence";
import { GenerateWorkoutForm } from "@/components/generate-workout-form";

export default async function PrescriptionReviewPage({ params }: { params: Promise<{ clientId: string; prescriptionId: string }> }) {
  const { clientId, prescriptionId } = await params;
  const { membership, supabase, userId } = await requireRole("coach");
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[0-9a-f-]{36}$/i.test(prescriptionId)) notFound();
  const [{ data: coach }, { data: client }, { data: organization }, { data: prescription }, { data: library }, { data: loadRules }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name").eq("id", clientId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("generated_prescriptions").select("id,title,objective,estimated_duration_minutes,volume_intent,rationale,original_recommendation,status,engine_version,generation_context").eq("id", prescriptionId).eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).eq("status", "draft").maybeSingle(),
    supabase.from("exercise_library").select("id,name,default_rep_min,default_set_min,equipment_requirements").eq("is_active", true).order("name"),
    supabase.from("exercise_load_rules").select("exercise_id,organization_id,version,weight_semantics,prescription_type").eq("active", true).order("version", { ascending: false }),
  ]);
  if (!client || !prescription) notFound();
  const recommendation = prescription.original_recommendation as RecommendationExercise[];
  const snapshot = prescription.generation_context?.trainingSnapshot as GenerationInput | undefined;
  const currentRules = new Map<string, NonNullable<typeof loadRules>[number]>();
  for (const rule of loadRules ?? []) {
    const previous = currentRules.get(rule.exercise_id);
    if (!previous || !previous.organization_id && rule.organization_id) currentRules.set(rule.exercise_id, rule);
  }
  const exerciseOptions = (library ?? []).filter(e => !snapshot || snapshot.candidates.some(c => c.id === e.id)).map(e => ({ ...e,
    weight_semantics: currentRules.get(e.id)?.weight_semantics, prescription_type: currentRules.get(e.id)?.prescription_type }));
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={coach?.full_name ?? "Coach"} role="coach">
    <Link className={styles.backLink} href={`/coach/clients/${clientId}`}>← Back to {client.full_name}</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Ravoge recommendation</p><h2>Review first prescription</h2></div><p>Coach approval is required before this becomes visible to the client.</p></div>
    <section className={styles.rationalePanel}><div><span>Objective</span><strong>{prescription.objective}</strong></div><div><span>Duration</span><strong>{prescription.estimated_duration_minutes} minutes</strong></div><div><span>Volume intent</span><strong>{prescription.volume_intent}</strong></div><p>{poundsInText(prescription.rationale)}</p></section>
    <section className={styles.operationCard} aria-label="Generation evidence">
      <h3>Why this draft</h3>
      <p>Source: {prescription.generation_context?.sourceType ?? "global_library"}.</p>
      <p role="status">{prescription.engine_version.endsWith("-fallback") ? FALLBACK_MESSAGE : prescription.engine_version.endsWith("-openai") ? "OpenAI-assisted draft, validated against approved exercises and current gym equipment." : "Deterministic intake-based generation."}</p>
      {snapshot && <><p>Goal: {snapshot.goal.replaceAll("_", " ")}{snapshot.secondaryGoal ? ` · ${snapshot.secondaryGoal.replaceAll("_", " ")}` : ""}. {snapshot.experience} experience · {snapshot.frequency} sessions/week · {snapshot.duration}-minute preference.</p>
        {snapshot.trainingFocus && <p>Client focus: {TRAINING_FOCUS[snapshot.trainingFocus]}.</p>}
        {snapshot.intelligence && <p>Training analysis: {snapshot.intelligence.method==="openai"?"OpenAI-assisted":"Structured-goal fallback"}. Objectives: {snapshot.intelligence.analysis.objectives.join(", ").replaceAll("_"," ")}. Methods: {snapshot.intelligence.analysis.methods.join(", ")}. Progression focus: {snapshot.intelligence.analysis.progression.replaceAll("_"," ")}. Planned RPE ceiling: {snapshot.intelligence.analysis.intensityCeiling}. Coach review remains required.</p>}
        {snapshot.knowledgeCounts && <p>Gym knowledge search: {snapshot.knowledgeCounts.total} stored sources · {snapshot.knowledgeCounts.referenceEnabled??snapshot.knowledgeCounts.approved} references enabled · {snapshot.knowledgeCounts.approved} fully structured templates · {snapshot.references.length} credited references. Raw examples guide style, not verified prescriptions. Canonical exercises, restrictions and equipment are checked independently.</p>}
        <p>Weight context: current weight {canonicalPounds(snapshot.bodyComposition.weightKg)} lb · current muscle {canonicalPounds(snapshot.bodyComposition.skeletalMuscleMassKg)} lb · goal weight {canonicalPounds(snapshot.targets.weightKg)} lb · goal muscle {canonicalPounds(snapshot.targets.skeletalMuscleMassKg)} lb.</p>
        <p>Equipment: {snapshot.equipment.join(", ").replaceAll("_", " ") || "Bodyweight only"}.</p>
        <p>Available weight capabilities (lb): {snapshot.weightCapabilities?.filter(c => c.minLb !== null || c.maxLb !== null || c.sizesLb?.length).map(c => `${c.type}: individual range ${c.minLb ?? "unknown"}–${c.maxLb ?? "unknown"}; exact sizes ${c.sizesLb?.join(", ") ?? "unknown"}${c.pairsConfirmed ? "; one matched pair per plate size confirmed" : ""}`).join(" · ") || "Unknown — Coach must confirm any load; no sizes or quantities were assumed"}.</p>
        <p>Restrictions honored: {snapshot.restrictions.tags.join(", ").replaceAll("_", " ") || "No structured movement exclusions"}. Exercise exclusions and experience were checked by the database. Free-text injuries and pain remain local to Ravoge; review them before assigning.</p>
        <p>Gym-profile version: {snapshot.gymProfile?.version ?? "No published profile"}. Published sources in gym: {snapshot.publishedCount ?? snapshot.references.length}. Available facilities: {snapshot.facilities?.map(f => `${f.type} · ${f.length} ${f.unit}`).join(", ") || "None confirmed"}.</p>
        {snapshot.references.length ? <p>Gym references used: {snapshot.references.map((reference) => `${reference.title} (${reference.sourceKind==='raw_reference'?'raw example':'structured template'}, revision ${reference.revision})`).join("; ")}. References influence style, not an unchanged copy.</p> : <p>Gym-personality references were unavailable. Approved general-library programming was used.</p>}
        <p>Adaptations: exercises added outside recognized source movements: {((prescription.generation_context?.addedExerciseIds??[]) as string[]).map(id=>exerciseOptions.find(e=>e.id===id)?.name??'approved canonical movement').join(', ')||'None'}. Any changed exercise or protocol is an adaptation, not a verified interpretation of a raw source.</p>
        <p>Missing information: {snapshot.weightCapabilities?.some(c=>!c.sizesLb?.length)?'Some exact equipment weights are unconfirmed; Coach calibration may be required. ':'No unconfirmed exact weights reported. '}Raw sources may contain unmapped movements or ambiguous targets; these are not assigned blindly.</p>
        <p className={styles.formHint}>Rules: {prescription.generation_context?.rulesVersion}. Measurements and targets inform context, not a diagnosis, promised outcome or automatic load prescription. Choose appropriate load and substitutions after reviewing the Client.</p></>}
    </section>
    <section className={styles.operationCard}><h3>Programming evidence</h3><p>Cached source summaries · {programmingEvidence().reviewedAt}. No live web research occurred during generation.{programmingEvidence().reviewDue?' Source-cache review is due.':''}</p><ul>{programmingEvidence().sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><p>Population-level guidance, not individual medical clearance or a promise of results.</p></section>
    {prescription.engine_version.endsWith('-fallback')&&<section className={styles.operationCard}><p>The AI service did not complete. The visible fallback remains a draft and requires Coach review. Retry does not change this saved draft.</p><GenerateWorkoutForm clientId={clientId} ready/></section>}
    <PrescriptionReviewForm weightCapabilities={snapshot?.weightCapabilities} quality={prescription.engine_version.startsWith("prescription-v0.4-")} clientId={clientId} duration={prescription.estimated_duration_minutes} exerciseOptions={exerciseOptions} exercises={recommendation} prescriptionId={prescriptionId} scheduledDate={localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE)} title={prescription.title} />
  </DashboardShell>;
}
