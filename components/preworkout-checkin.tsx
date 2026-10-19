"use client";

import { useActionState } from "react";

import { submitIntakeSessionCheckinAction, submitPreworkoutCheckinAction, type CheckinState } from "@/app/client/preworkout-actions";
import { CheckinScales } from "./checkin-scales";

import styles from "./dashboard.module.css";

export type PreworkoutQuestion = { position: number; question_text: string | null; scale_min: number | null; scale_max: number | null };

export function PreworkoutCheckin({ workoutId, bookingId, questions, previousCount }: { workoutId?: string; bookingId?: string; questions: PreworkoutQuestion[]; previousCount: number }) {
  const ready = questions.length === 8 && questions.every((question) => question.question_text && question.scale_min !== null && question.scale_max !== null);
  const bound = bookingId ? submitIntakeSessionCheckinAction.bind(null, bookingId) : submitPreworkoutCheckinAction.bind(null, workoutId ?? "");
  const [state, action, pending] = useActionState<CheckinState, FormData>(bound, { status: "idle" });
  return <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{bookingId ? "Before your intake" : "Workout context"}</p><h3>{bookingId ? "Your gym’s intake-session questions" : "Pre-workout check-in"}</h3></div><p>{previousCount} previous check-in{previousCount === 1 ? "" : "s"} saved for this {bookingId ? "session" : "workout"}.</p></div>
    {bookingId && <p className={styles.formHint}>These are your gym’s configured session questions. Your Coach completes the full versioned intake with you.</p>}
    <form action={action} className={styles.operationCard}><CheckinScales prefix={bookingId ? `session-${bookingId}` : "client-checkin"} questions={questions}/><button className={styles.action} disabled={pending||!ready} type="submit">{pending ? "Saving…" : "Save check-in"}</button>{!ready&&<p className={styles.empty}>Your gym’s check-in is not available yet.</p>}{state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}</form>
  </section>;
}
