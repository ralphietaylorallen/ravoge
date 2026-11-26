"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import workspace from "./coach-workspace.module.css";

const questions = ["Energy", "Sleep quality", "Physical comfort / recovery", "Manageable stress", "Readiness to train"];
const scores = [1, 2, 3, 4, 5];

export function TrainSessionForm({
  clientId, hasIntake, intakeReviewRequired = false, plannedWorkoutTitle, role = "coach", workoutNow = false, bookingId, workoutId,
}: {
  role?: "owner" | "coach";
  workoutNow?: boolean;
  clientId: string;
  hasIntake: boolean;
  intakeReviewRequired?: boolean;
  plannedWorkoutTitle?: string;
  bookingId?: string;
  workoutId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [pain, setPain] = useState("");
  const [comfort, setComfort] = useState("");
  const reviewPain = !!pain.trim() || !!comfort && Number(comfort) <= 2;
  const coach = role === "coach";
  const submitLabel = plannedWorkoutTitle ? "Save Readiness & Open Workout" : "Save Readiness & Generate";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/${role}/clients/${clientId}/workouts/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readiness: Array.from({ length: questions.length }, (_, i) => Number(form.get(`readiness-${i + 1}`))),
          painNote: pain, painReviewed: form.get("painReviewed") === "on", intakeReviewed: form.get("intakeReviewed") === "on",
          bookingId, workoutId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        setMessage(result.error ?? "Workout could not be opened. Try again.");
        return;
      }
      router.push(result.url);
    } catch {
      setMessage("Connection interrupted. Your answers are still here.");
    } finally {
      setPending(false);
    }
  }

  return <section id="train-session" className={`${styles.operationCard} ${workspace.sessionSection}`} aria-labelledby="session-readiness">
    <h2 id="session-readiness">{coach ? "Check readiness" : workoutNow ? "Workout Now" : "Train today"}</h2>
    {plannedWorkoutTitle && <p className={workspace.muted}>Planned workout · {plannedWorkoutTitle}</p>}
    {hasIntake ? <form className={styles.form} onSubmit={submit} aria-label="Train today — five questions">
      <p className={workspace.muted}>Rate each answer from 1 (low or poor) to 5 (high or good).</p>
      <div className={coach ? workspace.readinessQuestions : styles.formColumns}>
        {questions.map((question, index) => {
          const name = `readiness-${index + 1}`;
          return coach ? <fieldset key={question} className={workspace.readinessField}>
            <legend>{question}</legend>
            <div className={workspace.scale}>{scores.map(score => <label key={score}>
              <input aria-label={`${question} ${score}`} type="radio" name={name} value={score} required
                onChange={index === 2 ? event => setComfort(event.target.value) : undefined} />
              <span>{score}</span>
            </label>)}</div>
          </fieldset> : <label key={question} className={styles.field}>{question}
            <select name={name} required defaultValue="" onChange={index === 2 ? event => setComfort(event.target.value) : undefined}>
              <option value="">Choose</option>{scores.map(score => <option key={score}>{score}</option>)}
            </select>
          </label>;
        })}
      </div>
      <details><summary>Pain or changes today?</summary><label className={styles.field}>Pain or injury update
        <textarea name="painNote" value={pain} maxLength={1000} onChange={event => setPain(event.target.value)} />
      </label></details>
      {reviewPain && <label className={styles.checkboxLabel}><input type="checkbox" name="painReviewed" required />I reviewed today’s discomfort and updated any needed intake restrictions.</label>}
      {intakeReviewRequired && <label className={styles.checkboxLabel}><input type="checkbox" name="intakeReviewed" required />I reviewed the updated intake and its restrictions. <Link href={`/${role}/clients/${clientId}?tab=intake`}>View intake</Link></label>}
      <button className={coach ? workspace.primaryButton : styles.action} disabled={pending}>
        {pending ? (plannedWorkoutTitle ? "Opening planned workout…" : "Generating workout…") :
          coach ? submitLabel : plannedWorkoutTitle ? "Save readiness & open planned workout" : workoutNow ? "Generate workout for today" : "Generate workout"}
      </button>
      {pending && <p role="status">{plannedWorkoutTitle ? "Saving readiness and opening workout…" : "Generating…"}</p>}
      {message && <p className={styles.notice} role="alert">{message}</p>}
    </form> : <>
      <p className={workspace.muted}>Complete the client’s first intake before training.</p>
      <Link className={workspace.secondaryButton} href={`/${role}/clients/${clientId}?tab=intake#intake-evaluation`}>Open Client Intake</Link>
    </>}
  </section>;
}
