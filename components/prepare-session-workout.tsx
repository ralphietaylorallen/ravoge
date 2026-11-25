"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

export function PrepareSessionWorkout({ clientId, bookingId }: { clientId: string; bookingId: string }) {
  const router = useRouter();
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  async function generate() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/coach/clients/${clientId}/sessions/${bookingId}/workout`, {method:"POST"});
      const result = await response.json();
      if (!response.ok || !result.url) { setError(result.error || "The workout draft could not be prepared. Try again."); return; }
      router.push(result.url.includes("/prescriptions/") ? `${result.url}${result.url.includes("?") ? "&" : "?"}mode=prepare` : result.url);
    } catch { setError("Connection interrupted. Reopen this session before trying again; an existing draft will be reused."); }
    finally { setPending(false); }
  }
  return <div className={styles.form}>
    <p className={styles.formHint}>Generate from the client’s intake, goals, equipment, and training history. Then review and save the workout for this appointment.</p>
    <button type="button" className={styles.action} disabled={pending} onClick={() => void generate()}>{pending ? "Generating…" : "Generate Workout"}</button>
    {pending && <p role="status">Preparing this session’s workout. This can take up to a minute.</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
  </div>;
}
