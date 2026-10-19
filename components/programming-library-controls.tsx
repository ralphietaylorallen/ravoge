"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveProgrammingProfile, setTrainingStatus, type ReviewState } from "@/app/owner/training-library/actions";
import { FORMATS } from "@/lib/workout-protocol";
import styles from "./dashboard.module.css";

export function TrainingPublishingControls({ items }: { items: { id: string; title: string; status: string; source_filename: string | null; generation_excluded: boolean }[] }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(setTrainingStatus, { status: "idle" });
  return <form action={action} className={styles.form}><ul className={styles.activityList}>{items.map(item => <li key={item.id}>
    <label className={styles.checkboxLabel}><input type="checkbox" name="itemId" value={item.id} aria-label={`Select ${item.title}`}/><span><Link href={`/owner/training-library/${item.id}`}><strong>{item.title}</strong></Link><small>{item.source_filename ?? "Manual entry"}</small></span></label>
    <span>{item.generation_excluded ? "Excluded" : item.status === "review" ? "Needs review" : item.status}<Link href={`/owner/training-library/${item.id}`}>Review source →</Link></span>
  </li>)}</ul><label className={styles.checkboxLabel}><input type="checkbox" name="confirmed" value="yes"/>Confirm publication of selected, individually reviewed sources only. Incomplete raw drafts cannot be bulk-published.</label>
    <div className={styles.accessActions}><button className={styles.action} name="intent" value="publish" disabled={pending}>Publish selected reviewed records</button><button className={styles.secondaryAction} name="intent" value="unpublish" disabled={pending}>Unpublish selected</button><button className={styles.secondaryAction} name="intent" value="exclude" disabled={pending}>Exclude selected</button></div>
    {state.message && <p className={styles.notice} role="status">{state.message}</p>}
  </form>;
}
export type ProgrammingProfile = { version: number; summary: string; statistics: { publishedCount?: number; formats?: Record<string, number>; sets?: number[]; reps?: number[]; restSeconds?: number[]; timedRows?: number; distanceRows?: number; finishers?: number; frequentExercises?: { name: string; uses: number }[]; ordering?: string; orderPatterns?: { position: number; name: string; uses: number }[]; terminology?: string[]; progressionPatterns?: string[]; resourceUse?: Record<string, number>; preferredFinishers?: { name: string; uses: number }[] }; preferences: { formats?: string[]; emphasis?: string[] } };
export function ProgrammingProfileForm({ profile, published }: { profile?: ProgrammingProfile; published: number }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveProgrammingProfile, { status: "idle" });
  const stats = profile?.statistics;
  return <section className={styles.operationCard}><h3>Gym programming profile {profile ? `· version ${profile.version}` : ""}</h3>
    <p>{published} reviewed, published sources available. {published === 0 ? "No gym-personality programming is available yet. Coach generation uses the approved general library." : "Only compatible examples are retrieved for each Client; publication is not a safety clearance."}</p>
    {stats && <><p>Formats: {Object.entries(stats.formats ?? {}).map(([k, v]) => `${k} (${v})`).join(", ") || "None"}. Timed rows: {stats.timedRows ?? 0}; distance rows: {stats.distanceRows ?? 0}; finishers: {stats.finishers ?? 0}.</p><p>Common exercises: {stats.frequentExercises?.map(e => `${e.name} (${e.uses})`).join(", ") || "None"}.</p><p>Observed sets {stats.sets?.join("–")}; reps {stats.reps?.join("–")}; rest seconds {stats.restSeconds?.join("–")}. {stats.ordering}</p></>}
    {stats && <><p>Common order: {stats.orderPatterns?.map(e => `${e.position}. ${e.name} (${e.uses})`).join("; ") || "Not established"}.</p><p>Source terminology: {stats.terminology?.join(", ") || "Not established"}. Explicit progression phrases: {stats.progressionPatterns?.join(", ") || "None — no progression inferred"}.</p><p>Facility/equipment use: {Object.entries(stats.resourceUse ?? {}).map(([k,v]) => `${k.replaceAll("_", " ")} (${v})`).join(", ") || "None in published sources"}. Finishers: {stats.preferredFinishers?.map(f=>f.name).join(", ") || "None"}.</p></>}
    <form action={action} className={styles.form}><label className={styles.field}><span>Owner-corrected summary / terminology / progression notes</span><textarea name="summary" defaultValue={profile?.summary ?? `${published} reviewed published sources. No unreviewed imports are used.`} maxLength={2000} minLength={2} required rows={3}/></label>
      <fieldset><legend>Preferred compatible formats</legend><div className={styles.checklistGrid}>{FORMATS.map(f => <label className={styles.checkboxLabel} key={f}><input type="checkbox" name="formats" value={f} defaultChecked={profile?.preferences.formats?.includes(f)}/>{f}</label>)}</div></fieldset>
      <fieldset><legend>Programming emphasis</legend><div className={styles.checklistGrid}>{["strength", "hypertrophy", "conditioning", "mobility", "athletic"].map(f => <label className={styles.checkboxLabel} key={f}><input type="checkbox" name="emphasis" value={f} defaultChecked={profile?.preferences.emphasis?.includes(f)}/>{f}</label>)}</div></fieldset>
      <button className={styles.secondaryAction} disabled={pending}>{pending ? "Saving…" : "Save profile version"}</button>{state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
