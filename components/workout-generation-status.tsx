import { confirmGenerationSafetyAction, generatePrescriptionAction } from "@/app/coach/actions";
import type { WorkoutReadiness } from "@/lib/workout-readiness";
import styles from "./dashboard.module.css";

export function WorkoutGenerationStatus({ clientId, readiness }: { clientId: string; readiness: WorkoutReadiness | null }) {
  return <section className={styles.operationCard} aria-label="Workout generation readiness"><h3>Generate from intake</h3>
    {readiness ? <>
      <p>{readiness.compatibleExercises} compatible movement blocks. {readiness.sourceType === "organization_workout" ? `Source: ${readiness.sourceTitle}.` : readiness.sourceType === "organization_exercises_with_fallback" ? "Published gym exercises with safe library fallback." : "Safe exercise-library fallback when no suitable published gym workout is available."}</p>
      {readiness.reasons.length > 0 && <ul>{readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {!readiness.ready && Boolean(readiness.missingEquipment?.length) && <p className={styles.formHint}>Equipment types missing from potential matches: {readiness.missingEquipment!.join(", ").replaceAll("_", " ")}. Your Owner should select only equipment actually available.</p>}
      {readiness.needsSafetyReview && readiness.intakeId && <form action={confirmGenerationSafetyAction.bind(null, clientId, readiness.intakeId)} className={styles.form}>
        <label className={styles.checkboxLabel}><input type="checkbox" name="confirmed" value="yes" required/>I reviewed the latest intake, goals, injuries, pain and limitations, and reflected required exclusions in its movement constraints and exercises to avoid.</label>
        <p className={styles.formHint}>If a restriction cannot be represented safely, update intake or use the manual builder after your review. This confirmation does not remove any exercise filters.</p>
        <button className={styles.secondaryAction}>Confirm intake safety review</button>
      </form>}
      <form action={generatePrescriptionAction.bind(null, clientId)}><button className={styles.action} disabled={!readiness.ready}>Generate workout</button></form>
    </> : <p>Workout readiness could not be checked. Refresh or save the intake again before generating.</p>}
  </section>;
}
