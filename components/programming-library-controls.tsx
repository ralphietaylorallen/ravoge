"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { saveProgrammingProfile, setGymReferences, type ReviewState } from "@/app/owner/training-library/actions";
import { FORMATS } from "@/lib/workout-protocol";
import styles from "./dashboard.module.css";

export function TrainingPublishingControls({ items, matching, search, archived=false }: { items: { id: string; title: string; status: string; source_filename: string | null; reference_enabled: boolean }[]; matching:number;search:string;archived?:boolean }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(setGymReferences, { status: "idle" });
  const [all,setAll]=useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitter = useRef<HTMLButtonElement | null>(null);
  const approved = useRef(false);
  const [confirmIntent, setConfirmIntent] = useState<string>();
  const [selectionMessage, setSelectionMessage] = useState("");
  return <form action={action} className={styles.form} aria-busy={pending} onReset={()=>setAll(false)} onSubmit={event=>{
    const intent=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    const values = new FormData(event.currentTarget);
    if (!all && !values.getAll('itemId').length) { event.preventDefault(); setSelectionMessage("Select workouts, or choose Select all workouts first."); return; }
    setSelectionMessage("");
    if ((intent === 'enable' || intent === 'delete') && !approved.current) {
      event.preventDefault();
      submitter.current = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
      setConfirmIntent(intent);
      dialog.current?.showModal();
      return;
    }
    const confirmation=event.currentTarget.querySelector<HTMLInputElement>('input[name="confirmed"]');
    if(confirmation) confirmation.value=approved.current?'yes':'no';
    approved.current = false;
  }}>
    <input type="hidden" name="search" value={search}/><input type="hidden" name="confirmed" defaultValue="no"/>
    <label className={styles.checkboxLabel}><input type="checkbox" name="allMatching" value="yes" checked={all} onChange={e=>setAll(e.target.checked)}/>Select all workouts — all {matching} matching workouts across every page</label>
    {all&&<p role="status">All {matching} matching workouts selected, including other pages.</p>}
    <div className={styles.accessActions}>{archived?<button className={styles.action} name="intent" value="restore" disabled={pending}>Restore</button>:<><button className={styles.action} name="intent" value="enable" disabled={pending}>Use as gym references</button><button className={styles.secondaryAction} name="intent" value="exclude" disabled={pending}>Exclude from generation</button><button className={styles.secondaryAction} name="intent" value="delete" disabled={pending}>Delete</button></>}</div>
    {pending && <p role="status">Updating your workouts…</p>}
    {selectionMessage && <p role="alert">{selectionMessage}</p>}
    {state.message && <p className={styles.notice} role="status">{state.message}</p>}
    <ul className={styles.activityList}>{items.map(item => <li key={item.id}>
    <label className={styles.checkboxLabel}><input type="checkbox" name="itemId" value={item.id} disabled={all} aria-label={`Select ${item.title}`}/><span><Link href={`/owner/training-library/${item.id}`}><strong>{item.title}</strong></Link><small>{item.source_filename ?? "Manual entry"}</small></span></label>
    <span>{archived?"Deleted":item.reference_enabled?"Used in new workouts":"Not used in new workouts"}<Link href={`/owner/training-library/${item.id}`}>Advanced edit →</Link></span>
  </li>)}</ul>
    <dialog className={styles.photoDialog} ref={dialog} aria-labelledby="library-confirmation-heading" onClose={()=>submitter.current?.focus()}>
      <h3 id="library-confirmation-heading">{confirmIntent === 'delete' ? 'Delete selected workouts?' : 'Use these workouts as examples of this gym’s programming style?'}</h3>
      <p>{confirmIntent === 'delete' ? 'You can restore them from Deleted workouts. Their original content stays unchanged.' : 'Ravoge will adapt these examples to each client. You can exclude them again at any time.'}</p>
      <div className={styles.accessActions}><button className={styles.secondaryAction} type="button" onClick={()=>dialog.current?.close()}>Cancel</button><button className={styles.action} type="button" onClick={event=>{
        const form = event.currentTarget.form;
        dialog.current?.close();
        if (form && submitter.current) { approved.current = true; form.requestSubmit(submitter.current); }
      }}>{confirmIntent === 'delete' ? 'Delete workouts' : 'Use workouts'}</button></div>
    </dialog>
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
