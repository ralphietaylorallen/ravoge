"use client";

import { useActionState } from "react";

import { submitPreworkoutCheckinAction, type CheckinState } from "@/app/client/preworkout-actions";
import { CheckinScales } from "./checkin-scales";

import styles from "./dashboard.module.css";

export type PreworkoutQuestion = { position: number; question_text: string | null; scale_min: number | null; scale_max: number | null };

export function PreworkoutCheckin({ workoutId, questions, previousCount }: { workoutId: string; questions: PreworkoutQuestion[]; previousCount: number }) {
  const ready = questions.length === 8 && questions.every((question) => question.question_text && question.scale_min !== null && question.scale_max !== null);
  const [state, action, pending] = useActionState<CheckinState, FormData>(submitPreworkoutCheckinAction.bind(null, workoutId), { status: "idle" });
  return <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Workout context</p><h3>Pre-workout check-in</h3></div><p>{previousCount} previous check-in{previousCount === 1 ? "" : "s"} saved for this workout.</p></div>
    <form action={action} className={styles.operationCard}><CheckinScales prefix="client-checkin" questions={questions}/><button className={styles.action} disabled={pending||!ready} type="submit">{pending ? "Saving…" : "Save check-in"}</button>{!ready&&<p className={styles.empty}>Your gym’s check-in is not available yet.</p>}{state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}</form>
  </section>;
}
