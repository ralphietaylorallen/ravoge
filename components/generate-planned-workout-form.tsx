"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./dashboard.module.css";
import workspace from "./coach-workspace.module.css";

export function GeneratePlannedWorkoutForm({ clients, clientId, date, time, today, timezone }: {
  clients: { id: string; name: string }[]; clientId: string; date: string; time?: string; today: string; timezone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState(clientId);
  const [intakeReviewRequired, setIntakeReviewRequired] = useState(false);

  function chooseClient(select: HTMLSelectElement) {
    setSelectedClient(select.value);
    setIntakeReviewRequired(false);
    setError("");
    const form = new FormData(select.form!);
    const query = new URLSearchParams({ client: select.value, date: String(form.get("date") || date) });
    if (form.get("time")) query.set("time", String(form.get("time")));
    router.push(`/coach/plan-workouts?${query}`, { scroll: false });
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/coach/clients/${form.get("clientId")}/workouts/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.get("date"), time: form.get("time"), intakeReviewed: form.get("intakeReviewed") === "on" }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        if (result.requiresIntakeReview) setIntakeReviewRequired(true);
        setError(result.error ?? "This workout couldn’t be generated. Try again.");
        return;
      }
      router.push(result.url);
    } catch {
      setError("Connection interrupted. Try again to reopen any draft saved for this time.");
    } finally { setPending(false); }
  }

  return <section className={workspace.agenda} id="generate-workout" aria-labelledby="generate-planned-heading">
    <h2 id="generate-planned-heading">Generate Workout</h2>
    <p className={workspace.muted}>Choose who and when. Review the workout, make any changes, and save it to the client’s plan.</p>
    <form className={styles.form} onSubmit={generate} aria-label="Generate a planned workout">
      <fieldset className={workspace.generatorFields} disabled={pending}>
        <label className={styles.field}>Client<select name="clientId" value={selectedClient} onChange={event => chooseClient(event.currentTarget)} required>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></label>
        <label className={styles.field}>Date<input name="date" type="date" defaultValue={date < today ? today : date} min={today} required /></label>
        <label className={styles.field}>Time<input name="time" type="time" defaultValue={time} required /></label>
      </fieldset>
      {intakeReviewRequired && <label className={styles.checkboxLabel}>
        <input name="intakeReviewed" type="checkbox" required disabled={pending} />I reviewed the updated intake and its restrictions.
        <Link target="_blank" href={`/coach/clients/${selectedClient}?tab=intake`}>View Intake</Link>
      </label>}
      <div className={workspace.actionStrip}><button className={workspace.primaryButton} disabled={pending}>
        {pending ? "Generating…" : "Generate Workout"}
      </button><span className={workspace.muted}>Times use {timezone}.</span></div>
      {pending && <p role="status">Generating from the client’s intake, goals, and training history. This can take up to a minute.</p>}
      {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error} <Link href={`/coach/clients/${selectedClient}?tab=intake`}>Open Client Intake</Link></p>}
    </form>
  </section>;
}
