"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { planWorkoutAction, type PlannedWorkoutActionState } from "@/app/coach/actions";
import styles from "./dashboard.module.css";

type ClientOption = { id: string; name: string };
type ExerciseRow = {
  id: number;
  name: string;
  sets: string;
  reps: string;
  load: string;
  notes: string;
  mode: "reps" | "time";
  duration: string;
  rest: string;
};

function blankRow(id: number): ExerciseRow {
  return { id, name: "", sets: "3", reps: "8", load: "", notes: "", mode: "reps", duration: "30", rest: "" };
}

function parseLine(line: string, id: number): ExerciseRow {
  const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
  const time = cleaned.match(/^(.+?)\s+(\d+)\s*[xX×]\s*(\d+)\s*(?:sec|secs|seconds|s)\b(?:.*?([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs))?/i);
  if (time) {
    return { ...blankRow(id), name: time[1].trim(), sets: time[2], mode: "time", duration: time[3], reps: "1", load: time[4] ?? "" };
  }
  const reps = cleaned.match(/^(.+?)\s+(\d+)\s*[xX×]\s*(\d+)(?:\s*(?:@|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs)?)?$/i);
  if (reps) {
    return { ...blankRow(id), name: reps[1].trim(), sets: reps[2], reps: reps[3], load: reps[4] ?? "" };
  }
  return { ...blankRow(id), name: cleaned };
}

export function PlanWorkoutForm({ clients }: { clients: ClientOption[] }) {
  const initial: PlannedWorkoutActionState = { status: "idle" };
  const [state, action, pending] = useActionState(planWorkoutAction, initial);
  const [rows, setRows] = useState<ExerciseRow[]>([blankRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [paste, setPaste] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success" || !state.clearForm) return;
    formRef.current?.reset();
    setRows([blankRow(1)]);
    setNextId(2);
    setPaste("");
  }, [state]);

  function updateRow(id: number, patch: Partial<ExerciseRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addExercise() {
    if (rows.length >= 30) return;
    setRows((current) => [...current, blankRow(nextId)]);
    setNextId((value) => value + 1);
  }

  function removeExercise(id: number) {
    if (rows.length === 1) return;
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function usePastedWorkout() {
    const lines = paste.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 30);
    if (!lines.length) return;
    const parsed = lines.map((line, index) => parseLine(line, index + 1));
    setRows(parsed);
    setNextId(parsed.length + 1);
  }

  return <form ref={formRef} action={action} className={styles.workoutForm}>
    <div className={styles.formColumns}>
      <label className={styles.field}><span>Client</span><select name="clientId" required defaultValue=""><option value="" disabled>Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className={styles.field}><span>Workout name</span><input name="title" maxLength={120} required placeholder="Lower body strength" /></label>
      <label className={styles.field}><span>Date</span><input name="scheduledDate" type="date" required /></label>
      <label className={styles.field}><span>Time</span><input name="scheduledTime" type="time" required /></label>
    </div>

    <label className={styles.field}><span>Coach instructions / workout notes</span><textarea name="instructions" maxLength={4000} rows={3} placeholder="Optional notes for the session." /></label>

    <section className={styles.formSection}>
      <div className={styles.sectionFields}>
        <label className={styles.field}><span>Paste a workout</span><textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder={"Back Squat 4x6 @ 135 lb\nDB Reverse Lunge 3x8\nBike 4x45 sec"} /></label>
        <p className={styles.formHint}>One exercise per line. Simple sets × reps, weight, and timed formats are recognized automatically. Everything stays editable before saving.</p>
        <button className={styles.secondaryAction} type="button" onClick={usePastedWorkout}>Turn pasted workout into rows</button>
      </div>
    </section>

    <div className={styles.exerciseHeader}><h3>Workout</h3><button className={styles.textAction} type="button" onClick={addExercise}>+ Add next exercise</button></div>
    <div className={styles.exerciseList}>
      {rows.map((row, index) => <fieldset className={styles.exerciseRow} key={row.id}>
        <legend>Exercise {index + 1}</legend>
        <label className={`${styles.field} ${styles.exerciseName}`}><span>Exercise</span><input name="exerciseName" value={row.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} maxLength={120} required /></label>
        <label className={styles.field}><span>Sets</span><input name="exerciseSets" value={row.sets} onChange={(event) => updateRow(row.id, { sets: event.target.value })} type="number" min={1} max={100} required /></label>
        <label className={styles.field}><span>Type</span><select name="exerciseMode" value={row.mode} onChange={(event) => updateRow(row.id, { mode: event.target.value as ExerciseRow["mode"] })}><option value="reps">Reps</option><option value="time">Timed</option></select></label>
        {row.mode === "reps"
          ? <label className={styles.field}><span>Reps</span><input name="exerciseReps" value={row.reps} onChange={(event) => updateRow(row.id, { reps: event.target.value })} type="number" min={1} max={1000} required /><input type="hidden" name="exerciseDurationSeconds" value="" /></label>
          : <label className={styles.field}><span>Time per set (seconds)</span><input name="exerciseDurationSeconds" value={row.duration} onChange={(event) => updateRow(row.id, { duration: event.target.value })} type="number" min={5} max={1200} required /><input type="hidden" name="exerciseReps" value="1" /></label>}
        <label className={styles.field}><span>Weight (lb)</span><input name="exerciseLoad" value={row.load} onChange={(event) => updateRow(row.id, { load: event.target.value })} type="number" min={0} max={100000} step="0.5" /></label>
        <label className={styles.field}><span>Rest (seconds, optional)</span><input name="exerciseRestSeconds" value={row.rest} onChange={(event) => updateRow(row.id, { rest: event.target.value })} type="number" min={0} max={1200} /></label>
        <label className={`${styles.field} ${styles.exerciseNotes}`}><span>Notes</span><input name="exerciseNotes" value={row.notes} onChange={(event) => updateRow(row.id, { notes: event.target.value })} maxLength={1000} placeholder="Tempo, cues, modification, etc." /></label>
        <button className={styles.removeAction} type="button" disabled={rows.length === 1} onClick={() => removeExercise(row.id)}>Remove</button>
      </fieldset>)}
    </div>

    <div className={styles.reviewFooter}>
      <p>Timed exercises automatically include Ravoge’s workout timer. Saving this plan makes it the Client’s scheduled workout and prevents a duplicate generated workout for that day.</p>
      <div className={styles.accessActions}>
        <button className={styles.secondaryAction} name="saveIntent" value="another" disabled={pending}>Save + Plan Another</button>
        <button className={styles.action} name="saveIntent" value="save" disabled={pending}>{pending ? "Saving…" : "Save Planned Workout"}</button>
      </div>
    </div>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
  </form>;
}
