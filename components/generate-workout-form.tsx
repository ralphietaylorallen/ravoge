"use client";

import { useActionState } from "react";
import { generatePrescriptionAction } from "@/app/coach/actions";
import styles from "./dashboard.module.css";

export function GenerateWorkoutForm({ clientId, ready }: { clientId: string; ready: boolean }) {
  const [state, action, pending] = useActionState(generatePrescriptionAction.bind(null, clientId), { status: "idle" as const });
  return <form action={action} aria-busy={pending} className={styles.form}>
    <button className={styles.action} disabled={!ready || pending} type="submit">{pending ? "Creating your review draft…" : "Create workout"}</button>
    {pending && <p role="status">Checking your saved intake, safe exercises and gym programming. This can take up to 45 seconds; a safe fallback is available.</p>}
    {state.message && <p className={`${styles.notice} ${styles.error}`} role="alert">{state.message}</p>}
  </form>;
}
