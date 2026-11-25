import Link from "next/link";
import styles from "./coach-workspace.module.css";

export function CoachClientActions({ clientId, hasIntake, workoutHref, workoutLabel = "Workout Now" }: {
  clientId: string; hasIntake: boolean; workoutHref: string; workoutLabel?: string;
}) {
  const client = `/coach/clients/${clientId}`;
  const intake = `${client}?tab=intake#intake-evaluation`;
  return <nav id="train-session" aria-label="Client coaching actions" className={styles.clientActions}>
    <div className={styles.actionStrip}>
      {hasIntake ? <>
        <Link className={styles.primaryButton} href={workoutHref}>{workoutLabel} <span aria-hidden="true">→</span></Link>
        <Link className={styles.secondaryButton} href={`/coach/plan-workouts?client=${clientId}`}>Plan</Link>
        <Link className={styles.secondaryButton} href={intake}>Update Intake</Link>
      </> : <>
        <Link className={styles.primaryButton} href={intake}>Fill Out Intake <span aria-hidden="true">→</span></Link>
        <Link className={styles.secondaryButton} href={`/coach/plan-workouts?client=${clientId}`}>Plan</Link>
      </>}
      <Link className={styles.secondaryButton} href={`${client}/book`}>Book a Session</Link>
    </div>
  </nav>;
}
