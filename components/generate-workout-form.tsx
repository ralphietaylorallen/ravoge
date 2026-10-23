"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./dashboard.module.css";

export function GenerateWorkoutForm({ clientId, ready }: { clientId: string; ready: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function createWorkout() {
    if (!ready || pending) return;
    setMessage("");
    setPending(true);
    try {
      const response = await fetch(`/api/coach/clients/${clientId}/workouts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json().catch(() => ({})) as { error?: string; url?: string };
      if (!response.ok || !result.url) {
        setMessage(result.error ?? "Ravoge could not create the workout. Refresh this Client and try once more.");
        return;
      }
      router.push(result.url);
    } catch {
      setMessage("Ravoge could not reach the workout service. Check the connection and try once more.");
    } finally {
      setPending(false);
    }
  }

  return <div aria-busy={pending} className={styles.form}>
    <button className={styles.action} disabled={!ready || pending} onClick={createWorkout} type="button">{pending ? "Creating your review draft…" : message ? "Retry Create workout" : "Create workout"}</button>
    {pending && <p role="status">Checking your saved intake, safe exercises and gym programming. This can take up to 45 seconds; a safe fallback is available.</p>}
    {message && <p className={`${styles.notice} ${styles.error}`} role="alert">{message}</p>}
  </div>;
}
