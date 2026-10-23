"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmGenerationSafetyAction } from "@/app/coach/actions";
import { GenerateWorkoutForm } from "@/components/generate-workout-form";
import type { WorkoutReadiness } from "@/lib/workout-readiness";
import styles from "./dashboard.module.css";

export function WorkoutGenerationStatus({ clientId, readiness }: { clientId: string; readiness: WorkoutReadiness | null }) {
  const [, confirmSafety, confirming] = useActionState(async (_state: null, form: FormData) => {
    await confirmGenerationSafetyAction(clientId, readiness?.intakeId ?? "", form);
    return null;
  }, null);
  return <section className={styles.operationCard} aria-label="Workout generation readiness"><h3>Create a workout</h3>
    {readiness ? <>
      <p>Ravoge uses this client’s intake, goals, limitations, results and available equipment, then finds relevant workouts from your gym.</p>
      {readiness.reasons.length > 0 && <ul>{readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {!readiness.ready && Boolean(readiness.missingEquipment?.length) && <p className={styles.formHint}>Equipment types missing from potential matches: {readiness.missingEquipment!.join(", ").replaceAll("_", " ")}. Your Owner should select only equipment actually available.</p>}
      {readiness.needsSafetyReview && readiness.intakeId && <form action={confirmSafety} className={styles.form} aria-busy={confirming}>
        <label className={styles.checkboxLabel}><input type="checkbox" name="confirmed" value="yes" required/>I reviewed the latest intake, goals, injuries, pain and limitations, and reflected required exclusions in its movement constraints and exercises to avoid.</label>
        <p className={styles.formHint}>If a restriction cannot be represented safely, update intake or use the manual builder after your review. This confirmation does not remove any exercise filters.</p>
        <button className={styles.secondaryAction} disabled={confirming}>{confirming ? "Saving safety review…" : "Confirm intake safety review"}</button>
      </form>}
      {!readiness.ready && <div className={styles.bookingActions}><Link href={`/coach/clients/${clientId}?tab=intake`}>{readiness.intakeId ? "Add goals / review restrictions" : "Complete intake"}</Link><details><summary>Review equipment</summary><p className={styles.formHint}>Ask your Owner to review Equipment and select only what is actually available. {readiness.missingEquipment?.length ? `Potentially missing: ${readiness.missingEquipment.join(", ").replaceAll("_", " ")}.` : "Then refresh this page to check compatibility again."}</p></details></div>}
      <GenerateWorkoutForm clientId={clientId} ready={readiness.ready} />
      <p className={styles.formHint}>Review and edit the workout, then assign it. The client won’t see it until you assign it.</p>
    </> : <p>Workout readiness could not be checked. Refresh or save the intake again before generating.</p>}
  </section>;
}
