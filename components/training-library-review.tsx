"use client";

import { useActionState, useState } from "react";
import { saveTrainingReview, type ReviewState } from "@/app/owner/training-library/actions";
import type { LibraryExerciseOption, ReviewedExercise } from "@/lib/training-review";
import styles from "./dashboard.module.css";
import { WorkoutProtocolFields } from "./workout-protocol-fields";
import { defaultProtocol } from "@/lib/workout-protocol";

export function TrainingLibraryReview({ itemId, title, library, exercises, goal, duration, notes, canPublish }: {
  itemId: string; title: string; library: LibraryExerciseOption[]; exercises: ReviewedExercise[]; goal?: string; duration?: number; notes?: string; canPublish: boolean;
}) {
  const [rows, setRows] = useState(exercises.map((ex, index) => ({ ...ex, key: index })));
  const [nextKey, setNextKey] = useState(exercises.length);
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveTrainingReview.bind(null, itemId), { status: "idle" });
  return <form action={action} className={styles.reviewForm} onReset={event => event.preventDefault()}>
    <label className={styles.field}><span>Reviewed workout name</span><input defaultValue={title} name="title" maxLength={120} minLength={2} required/></label>
    <div className={styles.formColumns}><label className={styles.field}><span>Intended goal</span><select defaultValue={goal ?? ""} name="goal" required><option value="" disabled>Choose from source / review</option>{["strength", "muscle_gain", "general_fitness", "conditioning", "fat_loss", "athletic_performance"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    <label className={styles.field}><span>Session duration (minutes)</span><input name="duration" type="number" min={1} max={180} defaultValue={duration ?? ""} required/><small>Use the actual source duration. Short blocks are valid references, not assumed full sessions.</small></label></div>
    <p className={styles.formHint}>Map the source exactly, including circuits, stations, EMOM slots, AMRAP duration, rounds, intervals, distances, percentages and per-side work. Choose Time or Distance for measured work, rather than guessing repetitions. For AMRAP use one block and the explicit block duration. Leave unresolved information in Needs review.</p>
    {rows.map((row, index) => <fieldset className={styles.operationCard} key={row.key}><legend>Exercise {index + 1}</legend>
      <label className={styles.field}><span>Recognized exercise</span><select defaultValue={row.libraryExerciseId} name="libraryExerciseId" required><option value="" disabled>Choose the matching exercise</option>{library.map(ex => <option key={ex.id} value={ex.id}>{ex.name}{ex.equipment_requirements?.length ? ` · ${ex.equipment_requirements.join(", ").replaceAll("_", " ")}` : ""}</option>)}</select></label>
      <div className={styles.formColumns}><label className={styles.field}><span>Sets / rounds / visits</span><input aria-label="Sets" name="sets" type="number" min={1} max={100} defaultValue={row.sets ?? ""} required/></label>{row.protocol && row.protocol.measurement !== "reps" ? <input type="hidden" name="reps" value="1"/> : <label className={styles.field}><span>Reps per set</span><input name="reps" type="number" min={1} max={1000} defaultValue={row.reps ?? ""} required/></label>}</div>
      <div className={styles.formColumns}><label className={styles.field}><span>Load, if specified</span><input name="load" type="number" min={0} max={100000} step="0.01" defaultValue={row.load ?? ""}/></label><label className={styles.field}><span>Rest seconds, if specified</span><input name="rest" type="number" min={0} max={1800} defaultValue={row.restSeconds ?? ""}/></label></div>
      <label className={styles.field}><span>Source evidence / reviewed interpretation</span><textarea name="sourceText" rows={2} maxLength={2000} defaultValue={row.sourceText} required/></label>
      <label className={styles.field}><span>Instructions from source</span><textarea name="notes" rows={2} maxLength={1000} defaultValue={row.notes}/></label>
      <WorkoutProtocolFields value={row.protocol} onMeasurementChange={measurement => setRows(current => current.map(ex => ex.key === row.key ? { ...ex, reps: measurement === "reps" ? null : 1, protocol: { ...(ex.protocol ?? defaultProtocol()), measurement } } : ex))}/>
      <button className={styles.textAction} type="button" onClick={() => setRows(current => current.filter(ex => ex.key !== row.key))}>Remove exercise {index + 1}</button>
    </fieldset>)}
    <button className={styles.secondaryAction} type="button" disabled={rows.length >= 30} onClick={() => { setRows(current => [...current, { key: nextKey, libraryExerciseId: "", sets: null, reps: null, load: null, restSeconds: null, notes: "", sourceText: "" }]); setNextKey(nextKey + 1); }}>Add reviewed exercise</button>
    <label className={styles.field}><span>Review notes and unresolved issues</span><textarea name="reviewNotes" rows={3} maxLength={2000} defaultValue={notes ?? ""} required/></label>
    <label className={styles.checkboxLabel}><input name="sourceConfirmed" value="yes" type="checkbox"/>I reviewed the original source, confirmed the exercise mappings and quantities, and resolved ambiguous protocols before publication.</label>
    <div className={styles.accessActions}><button className={styles.secondaryAction} name="intent" value="review" disabled={pending} formNoValidate>Save as Needs review</button><button className={styles.action} name="intent" value="published" disabled={pending || !rows.length}>{pending ? "Saving…" : "Publish reviewed workout"}</button></div>
    {!canPublish && <p className={styles.notice}>The automatic parser could not safely resolve this source. It stays in review until you map every exercise and protocol, resolve missing information, and explicitly confirm the source.</p>}
    <p className={styles.formHint}>Raw imported data is preserved. Publish only what you can verify. Timed stations, ranges and unfamiliar movements require review; do not convert them into guessed reps.</p>
    {state.message && <p className={styles.notice} role="status">{state.message}</p>}
  </form>;
}
