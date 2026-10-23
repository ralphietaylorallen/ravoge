"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProgrammingProfile, setGymReferences, type ReviewState } from "@/app/owner/training-library/actions";
import { FORMATS } from "@/lib/workout-protocol";
import styles from "./dashboard.module.css";

export function TrainingPublishingControls({ items, matching, search, archived=false }: { items: { id: string; title: string; status: string; source_filename: string | null; reference_enabled: boolean }[]; matching:number;search:string;archived?:boolean }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(setGymReferences, { status: "idle" });
  const [all,setAll]=useState(false);
  return <form action={action} className={styles.form} onSubmit={event=>{
    const intent=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if(intent==='enable'&&!window.confirm("Use these workouts as examples of this gym’s programming style?")) event.preventDefault();
    if(intent==='delete'&&!window.confirm("Move selected workouts to Deleted and exclude them from generation? Original source rows are preserved and can be restored.")) event.preventDefault();
    const confirmation=event.currentTarget.querySelector<HTMLInputElement>('input[name="confirmed"]');
    if(confirmation) confirmation.value=event.isDefaultPrevented()?'no':'yes';
  }}>
    <input type="hidden" name="search" value={search}/><input type="hidden" name="confirmed" defaultValue="no"/>
    <label className={styles.checkboxLabel}><input type="checkbox" name="allMatching" value="yes" checked={all} onChange={e=>setAll(e.target.checked)}/>Select all workouts — all {matching} matching workouts across every page</label>
    {all&&<p role="status">All {matching} matching workouts selected, including other pages.</p>}
    <ul className={styles.activityList}>{items.map(item => <li key={item.id}>
    <label className={styles.checkboxLabel}><input type="checkbox" name="itemId" value={item.id} disabled={all} aria-label={`Select ${item.title}`}/><span><Link href={`/owner/training-library/${item.id}`}><strong>{item.title}</strong></Link><small>{item.source_filename ?? "Manual entry"}</small></span></label>
    <span>{archived?"Deleted":item.reference_enabled?"Gym reference enabled":"Excluded from generation"}<Link href={`/owner/training-library/${item.id}`}>Advanced edit →</Link></span>
  </li>)}</ul>
    <div className={styles.accessActions}>{archived?<button className={styles.action} name="intent" value="restore" disabled={pending}>Restore</button>:<><button className={styles.action} name="intent" value="enable" disabled={pending}>Use as gym references</button><button className={styles.secondaryAction} name="intent" value="exclude" disabled={pending}>Exclude from generation</button><button className={styles.secondaryAction} name="intent" value="delete" disabled={pending}>Delete</button></>}</div>
    {state.message && <p className={styles.notice} role="status">{state.message}</p>}
  </form>;
}
export type ProgrammingProfile = { version: number; summary: string; statistics: { publishedCount?: number; formats?: Record<string, number>; sets?: number[]; reps?: number[]; restSeconds?: number[]; timedRows?: number; distanceRows?: number; finishers?: number; frequentExercises?: { name: string; uses: number }[]; ordering?: string; orderPatterns?: { position: number; name: string; uses: number }[]; terminology?: string[]; progressionPatterns?: string[]; resourceUse?: Record<string, number>; preferredFinishers?: { name: string; uses: number }[] }; preferences: { formats?: string[]; emphasis?: string[] } };
export function ProgrammingProfileForm({ profile, published, references=0 }: { profile?: ProgrammingProfile; published: number; references?:number }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveProgrammingProfile, { status: "idle" });
  const stats = profile?.statistics;
  return <section className={styles.operationCard}><h3>Gym programming profile {profile ? `· version ${profile.version}` : ""}</h3>
    <p>{references} gym references enabled · {published} fully structured templates. Raw references guide programming style immediately; they are not individually verified templates. Coach approval and Client-specific safety checks remain required.</p>
    {stats && <><p>Formats: {Object.entries(stats.formats ?? {}).map(([k, v]) => `${k} (${v})`).join(", ") || "None"}. Timed rows: {stats.timedRows ?? 0}; distance rows: {stats.distanceRows ?? 0}; finishers: {stats.finishers ?? 0}.</p><p>Common exercises: {stats.frequentExercises?.map(e => `${e.name} (${e.uses})`).join(", ") || "None"}.</p><p>Observed sets {stats.sets?.join("–")}; reps {stats.reps?.join("–")}; rest seconds {stats.restSeconds?.join("–")}. {stats.ordering}</p></>}
    {stats && <><p>Common order: {stats.orderPatterns?.map(e => `${e.position}. ${e.name} (${e.uses})`).join("; ") || "Not established"}.</p><p>Source terminology: {stats.terminology?.join(", ") || "Not established"}. Explicit progression phrases: {stats.progressionPatterns?.join(", ") || "None — no progression inferred"}.</p><p>Facility/equipment use: {Object.entries(stats.resourceUse ?? {}).map(([k,v]) => `${k.replaceAll("_", " ")} (${v})`).join(", ") || "None in published sources"}. Finishers: {stats.preferredFinishers?.map(f=>f.name).join(", ") || "None"}.</p></>}
    <form action={action} className={styles.form}><label className={styles.field}><span>Optional gym style preferences</span><textarea name="summary" defaultValue={profile?.summary ?? "Adapt this gym's enabled references to each Client; preserve safe programming style, never assume missing measurements."} maxLength={2000} minLength={2} required rows={3}/></label>
      <fieldset><legend>Preferred compatible formats</legend><div className={styles.checklistGrid}>{FORMATS.map(f => <label className={styles.checkboxLabel} key={f}><input type="checkbox" name="formats" value={f} defaultChecked={profile?.preferences.formats?.includes(f)}/>{f}</label>)}</div></fieldset>
      <fieldset><legend>Programming emphasis</legend><div className={styles.checklistGrid}>{["strength", "hypertrophy", "conditioning", "mobility", "athletic"].map(f => <label className={styles.checkboxLabel} key={f}><input type="checkbox" name="emphasis" value={f} defaultChecked={profile?.preferences.emphasis?.includes(f)}/>{f}</label>)}</div></fieldset>
      <button className={styles.secondaryAction} disabled={pending}>{pending ? "Saving…" : "Save profile version"}</button>{state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
