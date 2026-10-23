import { canonicalPounds, poundsInText } from "@/lib/weight-units";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PrescriptionReviewForm, type RecommendationExercise } from "@/components/prescription-review-form";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import { FALLBACK_MESSAGE, type GenerationInput, type AssistedWorkout } from "@/lib/workout-generation";
import { TRAINING_FOCUS } from "@/lib/training-focus";
import { programmingEvidence } from "@/lib/programming-evidence";

import type { EvidenceCollection } from "@/lib/exercise-evidence";
import type { ProvenanceAudit } from "@/lib/workout-provenance";

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
  const evidence=prescription.generation_context?.evidence as EvidenceCollection|undefined;
  const provenance=prescription.generation_context?.provenanceAudit as ProvenanceAudit|undefined;
  const coachReview=prescription.generation_context?.coachReview as AssistedWorkout["coachReview"];
  const currentRules = new Map<string, NonNullable<typeof loadRules>[number]>();
  for (const rule of loadRules ?? []) {
    const previous = currentRules.get(rule.exercise_id);
    if (!previous || !previous.organization_id && rule.organization_id) currentRules.set(rule.exercise_id, rule);
  }
  const exerciseOptions = (library ?? []).filter(e => !snapshot || snapshot.candidates.some(c => c.id === e.id)).map(e => ({ ...e,
    weight_semantics: currentRules.get(e.id)?.weight_semantics, prescription_type: currentRules.get(e.id)?.prescription_type }));
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={coach?.full_name ?? "Coach"} role="coach">
    <Link className={styles.backLink} href={`/coach/clients/${clientId}`}>← Back to {client.full_name}</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{client.full_name}’s workout</p><h2>Review and assign</h2></div><p>Edit anything below, then assign it to the client.</p></div>
    {prescription.generation_context?.intakeReviewRequired&&<p role="alert">Intake updated. Generate a new workout before assigning.</p>}
    <details className={styles.operationCard}><summary>Plan details</summary><section className={styles.rationalePanel}><div><span>Objective</span><strong>{prescription.objective}</strong></div><div><span>Duration</span><strong>{prescription.estimated_duration_minutes} minutes</strong></div><div><span>Volume intent</span><strong>{prescription.volume_intent}</strong></div><p>{poundsInText(prescription.rationale)}</p></section>
    <section className={styles.operationCard} aria-label="Generation evidence">
      <h3>Why this draft</h3>
      {coachReview&&<><p>{coachReview.goalSupport}</p><h4>Your weekly structure</h4><ul>{coachReview.weeklyPlan.map(d=><li key={d.day}>Session {d.day}: {d.focus}</li>)}</ul><h4>Adaptations and next steps</h4><ul>{coachReview.injuryAdaptations.map(a=><li key={a}>{a}</li>)}</ul><p>Progress when: {coachReview.progression}</p><p>Reduce or stop when: {coachReview.regression}</p>{coachReview.unresolvedQuestions.length>0&&<><h4>Review with the Client</h4><ul>{coachReview.unresolvedQuestions.map(q=><li key={q}>{q}</li>)}</ul></>}</>}
      {prescription.generation_context?.intakeReviewRequired && <p role="alert">The intake or injury history changed. Create a fresh workout before assigning this draft.</p>}
      {provenance&&<><p>Gym programming: <strong>{provenance.gymPercentage}%</strong> · {provenance.gymBouts} of {provenance.totalBouts} main-work bouts. Warm-up and cooldown are excluded.</p><ul>{provenance.rows.map((r,index)=><li key={index}>{recommendation[index]?.name}: {r.referenceId?`Gym reference · ${r.segmentKey}`:"External substitution"}. {r.adaptation}{r.substitutionReason&&` Reason: ${r.substitutionReason}`}</li>)}</ul></>}
      {evidence&&<><h4>Verified exercise guidance</h4><p>{evidence.cacheHit?"Reused applicable retrieved evidence; no new search was claimed.":"Evidence retrieved for this training context."} Population guidance is not personal medical clearance.</p><ul>{evidence.sources.map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><p>{s.applicability}</p><p>Retrieved {new Date(s.retrievedAt).toLocaleDateString("en-US")}{s.publishedAt?` · Published ${s.publishedAt}`:" · Publication date not established"}</p><ul>{s.recommendations.map(r=><li key={r}>{r}</li>)}</ul><p>Limitations: {s.limitations.join(" ")}</p></li>)}</ul></>}
      <p role="status">{prescription.engine_version.endsWith("-fallback") ? FALLBACK_MESSAGE : prescription.engine_version.endsWith("-openai") ? "OpenAI-assisted draft, validated against approved exercises and current gym equipment." : "Deterministic intake-based generation."}</p>
      {snapshot && <><p>Goal: {snapshot.goal.replaceAll("_", " ")}{snapshot.secondaryGoal ? ` · ${snapshot.secondaryGoal.replaceAll("_", " ")}` : ""}. {snapshot.experience} experience · {snapshot.frequency} sessions/week · {snapshot.duration}-minute preference.</p>
        {snapshot.trainingFocus && <p>Client focus: {TRAINING_FOCUS[snapshot.trainingFocus]}.</p>}
        <p>Equipment: {snapshot.equipment.join(", ").replaceAll("_", " ") || "Bodyweight only"}.</p>
        <p>Restrictions: {snapshot.restrictions.tags.join(", ").replaceAll("_", " ") || "No movement exclusions recorded"}. {snapshot.restrictions.hasInjuries || snapshot.restrictions.hasPain || snapshot.restrictions.hasLimitations ? <Link href={`/coach/clients/${clientId}?tab=intake`}>Review the client’s recorded injuries, pain and limitations before assigning.</Link> : "Check with the client before training."}</p>
        {snapshot.references.length ? <p>Gym workouts used: {snapshot.references.map(reference => reference.title).join("; ")}. Adapted to this client, not copied unchanged.</p> : <p>No suitable gym workout was available. This workout uses the general exercise library.</p>}
        <p>Added movements: {((prescription.generation_context?.addedExerciseIds??[]) as string[]).map(id=>exerciseOptions.find(e=>e.id===id)?.name??'approved exercise').join(', ')||'None'}.</p>
        {snapshot.weightCapabilities?.some(c=>!c.sizesLb?.length) && <p>Some equipment weights are unconfirmed. Confirm any starting load marked for review before assigning.</p>}</>}
    </section>
    </details>
    {prescription.engine_version.endsWith('-fallback')&&<section className={styles.operationCard}><p>The AI service did not complete. The visible fallback remains a draft and requires Coach review. Retry does not change this saved draft.</p><Link className={styles.action} href={`/coach/clients/${clientId}#train-session`}>Generate another workout</Link></section>}
    <PrescriptionReviewForm weightCapabilities={snapshot?.weightCapabilities} quality={prescription.engine_version.startsWith("prescription-v0.4-")} clientId={clientId} duration={prescription.estimated_duration_minutes} exerciseOptions={exerciseOptions} exercises={recommendation} prescriptionId={prescriptionId} scheduledDate={localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE)} title={prescription.title} />
    <details className={styles.operationCard}><summary>Advanced: programming details and evidence</summary>
      <p>Source: {prescription.generation_context?.sourceType ?? "global_library"}.</p>
      {snapshot && <><p>Gym-profile version: {snapshot.gymProfile?.version ?? "None"}. Gym references available: {snapshot.knowledgeCounts?.referenceEnabled ?? snapshot.publishedCount ?? 0}.</p>
      <p>Weight context: current weight {canonicalPounds(snapshot.bodyComposition.weightKg)} lb · current muscle {canonicalPounds(snapshot.bodyComposition.skeletalMuscleMassKg)} lb · goal weight {canonicalPounds(snapshot.targets.weightKg)} lb · goal muscle {canonicalPounds(snapshot.targets.skeletalMuscleMassKg)} lb.</p>
      <p>Available equipment weights (lb): {snapshot.weightCapabilities?.map(c=>`${c.type}: ${c.minLb??"unknown"}–${c.maxLb??"unknown"}; exact sizes ${c.sizesLb?.join(", ")||"unknown"}`).join(" · ")||"Not confirmed"}. Facilities: {snapshot.facilities?.map(f=>`${f.type} · ${f.length} ${f.unit}`).join(", ")||"None confirmed"}.</p></>}
      <p>Rules: {prescription.generation_context?.rulesVersion}. Starting weights use saved measurements and results, not AI guesses.</p>
      {!evidence&&<><h3>Programming evidence</h3><p>Cached source summaries · {programmingEvidence().reviewedAt}. No live web research occurred during generation.{programmingEvidence().reviewDue?' Source-cache review is due.':''}</p><ul>{programmingEvidence().sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><p>Population-level guidance, not individual medical clearance or a promise of results.</p></>}
    </details>
  </DashboardShell>;
}
