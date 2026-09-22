"use client";

import { useActionState } from "react";

import { submitPreworkoutCheckinAction, type CheckinState } from "@/app/client/preworkout-actions";

import styles from "./dashboard.module.css";

export type PreworkoutQuestion = { position: number; question_text: string | null; scale_min: number | null; scale_max: number | null };

export function PreworkoutCheckin({ workoutId, questions, previousCount }: { workoutId: string; questions: PreworkoutQuestion[]; previousCount: number }) {
  const ready = questions.length === 8 && questions.every((question) => question.question_text && question.scale_min !== null && question.scale_max !== null);
  const [state, action, pending] = useActionState<CheckinState, FormData>(submitPreworkoutCheckinAction.bind(null, workoutId), { status: "idle" });
  return <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Workout context</p><h3>Pre-workout check-in</h3></div><p>{previousCount} previous check-in{previousCount === 1 ? "" : "s"} saved for this workout.</p></div>
    {!ready ? <div className={styles.panel}><p className={styles.notice}>The eight approved question wordings and numeric scales still require product input. No medical or training thresholds have been invented.</p><ol>{Array.from({ length: 8 }, (_, index) => <li key={index}>Question {index + 1} · wording and numeric range pending</li>)}</ol></div> :
      <form action={action} className={styles.panel}><ol>{questions.map((question) => <li className={styles.field} key={question.position}><label htmlFor={`preworkout-${question.position}`}>{question.question_text}</label><input id={`preworkout-${question.position}`} max={question.scale_max!} min={question.scale_min!} name={`answer-${question.position}`} required step="any" type="number" /></li>)}</ol><button className={styles.action} disabled={pending} type="submit">{pending ? "Saving…" : "Save check-in"}</button>{state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}</form>}
  </section>;
}
