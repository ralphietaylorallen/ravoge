"use client";

import { useActionState } from "react";
import { saveTrainingReadiness, reviewTrainingReadiness } from "@/app/coach/readiness-actions";
import styles from "./dashboard.module.css";

const questions = ["Energy", "Sleep quality", "Physical comfort / recovery", "Manageable stress", "Readiness to train"];
export function TrainingReadinessForm({ role, clientId, workoutId = null }: { role: "client" | "coach"; clientId: string; workoutId?: string | null }) {
  const [state, action, pending] = useActionState(saveTrainingReadiness.bind(null, role, clientId, workoutId), { status: "idle" as const });
  return <form action={action} className={styles.operationCard} aria-label="Five-question training readiness"><h3>Today’s readiness</h3><p>Five quick answers while warming up — about one minute. 1 = very low / poor; 5 = very good. Tell your Coach about pain before training.</p>
    <div className={styles.formColumns}>{questions.map((question, i) => <label className={styles.field} key={question}><span>{question}</span><select name={`readiness-${i + 1}`} defaultValue="" required><option disabled value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>)}</div>
    <label className={styles.field}><span>Pain location or note (optional)</span><textarea name="painNote" rows={2} maxLength={1000}/></label><button className={styles.secondaryAction} disabled={pending}>{pending ? "Saving…" : "Save today’s readiness"}</button>{state.message && <p role="status" className={styles.notice}>{state.message}</p>}
  </form>;
}
export function TrainingReadinessReview({ clientId, row }: { clientId: string; row: { id: string; answers: number[]; pain_note: string | null; recommendation: string; coach_decision: string; coach_response: string | null; created_at: string } }) {
  const [state, action, pending] = useActionState(reviewTrainingReadiness.bind(null, clientId, row.id), { status: "idle" as const });
  return <section className={styles.operationCard}><h3>Readiness recommendation · {new Date(row.created_at).toLocaleDateString("en-US")}</h3><p>{questions.map((q, i) => `${q}: ${row.answers[i]}/5`).join(" · ")}</p>{row.pain_note && <p className={styles.notice}>Pain note: {row.pain_note}</p>}<p>{row.recommendation}</p><p>Decision: {row.coach_decision}</p>
    <form action={action} className={styles.form}><label className={styles.field}><span>Coach decision</span><select name="decision" defaultValue={row.coach_decision === "pending" ? "accepted" : row.coach_decision}><option value="accepted">Accept recommendation</option><option value="declined">Decline recommendation</option><option value="edited">Edit recommendation</option></select></label><label className={styles.field}><span>Intended action / reason</span><textarea name="response" defaultValue={row.coach_response ?? ""} minLength={2} maxLength={2000} required rows={2}/></label><button className={styles.secondaryAction} disabled={pending}>Save Coach decision</button>{state.message && <p role="status">{state.message}</p>}</form>
  </section>;
}
