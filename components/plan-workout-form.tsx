"use client";

import { useActionState, useState } from "react";

import { planWorkoutAction, type PlannedWorkoutActionState } from "@/app/coach/actions";
import styles from "./dashboard.module.css";

type ClientOption = { id: string; name: string };
type Prescription = {
  sets: string;
  reps: string;
  load: string;
  notes: string;
  duration: string;
  rest: string;
};
type ExerciseRow = {
  id: number;
  name: string;
  mode: "reps" | "time";
  primary: Prescription;
  secondary: Prescription;
};

function blankPrescription(): Prescription {
  return { sets: "3", reps: "8", load: "", notes: "", duration: "30", rest: "" };
}

function blankRow(id: number): ExerciseRow {
  return { id, name: "", mode: "reps", primary: blankPrescription(), secondary: blankPrescription() };
}

function parseLine(line: string, id: number): ExerciseRow {
  const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
  const time = cleaned.match(/^(.+?)\s+(\d+)\s*[xX×]\s*(\d+)\s*(?:sec|secs|seconds|s)\b(?:.*?([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs))?/i);
  if (time) {
    const primary = { ...blankPrescription(), sets: time[2], reps: "1", duration: time[3], load: time[4] ?? "" };
    const secondary = { ...primary, load: "" };
    return { id, name: time[1].trim(), mode: "time", primary, secondary };
  }
  const reps = cleaned.match(/^(.+?)\s+(\d+)\s*[xX×]\s*(\d+)(?:\s*(?:@|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs)?)?$/i);
  if (reps) {
    const primary = { ...blankPrescription(), sets: reps[2], reps: reps[3], load: reps[4] ?? "" };
    const secondary = { ...primary, load: "" };
    return { id, name: reps[1].trim(), mode: "reps", primary, secondary };
  }
  return { ...blankRow(id), name: cleaned };
}

function clientName(clients: ClientOption[], id: string, fallback: string) {
  return clients.find((client) => client.id === id)?.name || fallback;
}

export function PlanWorkoutForm({ clients, defaultClientId = "" }: { clients: ClientOption[]; defaultClientId?: string }) {
  const initial: PlannedWorkoutActionState = { status: "idle" };
  const [state, action, pending] = useActionState(planWorkoutAction, initial);
  const [rows, setRows] = useState<ExerciseRow[]>([blankRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [paste, setPaste] = useState("");
  const [primaryClientId, setPrimaryClientId] = useState(defaultClientId);
  const [secondaryClientId, setSecondaryClientId] = useState("");
  const [pairEnabled, setPairEnabled] = useState(false);
  const [activeClient, setActiveClient] = useState<"primary" | "secondary">("primary");

  const primaryName = clientName(clients, primaryClientId, "Client A");
  const secondaryName = clientName(clients, secondaryClientId, "Client B");

  function updateSharedRow(id: number, patch: Partial<Pick<ExerciseRow, "name" | "mode">>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function updatePrescription(id: number, side: "primary" | "secondary", patch: Partial<Prescription>) {
    setRows((current) => current.map((row) => row.id === id ? {
      ...row,
      [side]: { ...row[side], ...patch },
    } : row));
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

  function setPair(value: boolean) {
    setPairEnabled(value);
    if (!value) {
      setSecondaryClientId("");
      setActiveClient("primary");
    }
  }

  function hiddenPrescription(side: "primary" | "secondary", row: ExerciseRow) {
    const prescription = row[side];
    const prefix = side === "primary" ? "primary" : "secondary";
    return <>
      <input type="hidden" name={`${prefix}ExerciseSets`} value={prescription.sets} />
      <input type="hidden" name={`${prefix}ExerciseReps`} value={row.mode === "time" ? "1" : prescription.reps} />
      <input type="hidden" name={`${prefix}ExerciseLoad`} value={prescription.load} />
      <input type="hidden" name={`${prefix}ExerciseNotes`} value={prescription.notes} />
      <input type="hidden" name={`${prefix}ExerciseDurationSeconds`} value={row.mode === "time" ? prescription.duration : ""} />
      <input type="hidden" name={`${prefix}ExerciseRestSeconds`} value={prescription.rest} />
    </>;
  }

  function prescriptionFields(side: "primary" | "secondary", row: ExerciseRow) {
    const prescription = row[side];
    const prefix = side === "primary" ? "primary" : "secondary";
    return <>
      <label className={styles.field}><span>Sets</span><input name={`${prefix}ExerciseSets`} value={prescription.sets} onChange={(event) => updatePrescription(row.id, side, { sets: event.target.value })} type="number" min={1} max={100} required /></label>
      {row.mode === "reps"
        ? <label className={styles.field}><span>Reps</span><input name={`${prefix}ExerciseReps`} value={prescription.reps} onChange={(event) => updatePrescription(row.id, side, { reps: event.target.value })} type="number" min={1} max={1000} required /><input type="hidden" name={`${prefix}ExerciseDurationSeconds`} value="" /></label>
        : <label className={styles.field}><span>Time per set</span><div className={styles.inputWithSuffix}><input name={`${prefix}ExerciseDurationSeconds`} value={prescription.duration} onChange={(event) => updatePrescription(row.id, side, { duration: event.target.value })} type="number" min={5} max={1200} required /><span>sec</span></div><input type="hidden" name={`${prefix}ExerciseReps`} value="1" /></label>}
      <label className={styles.field}><span>Weight</span><div className={styles.inputWithSuffix}><input name={`${prefix}ExerciseLoad`} value={prescription.load} onChange={(event) => updatePrescription(row.id, side, { load: event.target.value })} type="number" min={0} max={100000} step="0.5" /><span>lb</span></div></label>
      <label className={styles.field}><span>Rest</span><div className={styles.inputWithSuffix}><input name={`${prefix}ExerciseRestSeconds`} value={prescription.rest} onChange={(event) => updatePrescription(row.id, side, { rest: event.target.value })} type="number" min={0} max={1200} /><span>sec</span></div></label>
      <label className={`${styles.field} ${styles.exerciseNotes}`}><span>Notes for {side === "primary" ? primaryName : secondaryName}</span><input name={`${prefix}ExerciseNotes`} value={prescription.notes} onChange={(event) => updatePrescription(row.id, side, { notes: event.target.value })} maxLength={1000} placeholder="Tempo, cues, modification, etc." /></label>
    </>;
  }

  return <form action={action} className={styles.workoutForm}>
    <div className={styles.formColumns}>
      <label className={styles.field}><span>Client A</span><select name="clientId" required value={primaryClientId} onChange={(event) => {
        setPrimaryClientId(event.target.value);
        if (event.target.value === secondaryClientId) setSecondaryClientId("");
      }}><option value="" disabled>Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className={styles.field}><span>Workout name</span><input name="title" maxLength={120} required placeholder="Lower body strength" /></label>
      <label className={styles.field}><span>Date</span><input name="scheduledDate" type="date" required /></label>
      <label className={styles.field}><span>Time</span><input name="scheduledTime" type="time" required /></label>
    </div>

    <section className={styles.partnerPanel}>
      <label className={styles.partnerToggle}><input type="checkbox" checked={pairEnabled} onChange={(event) => setPair(event.target.checked)} /><span>Add a training partner</span></label>
      <p>Pair two clients in one session while keeping each person’s weights, reps, notes, completion and progression separate.</p>
      {pairEnabled && <label className={styles.field}><span>Client B</span><select name="secondaryClientId" required value={secondaryClientId} onChange={(event) => setSecondaryClientId(event.target.value)}><option value="" disabled>Select training partner</option>{clients.filter((client) => client.id !== primaryClientId).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
      {!pairEnabled && <input type="hidden" name="secondaryClientId" value="" />}
    </section>

    <label className={styles.field}><span>Coach instructions / workout notes</span><textarea name="instructions" maxLength={4000} rows={3} placeholder="Optional notes for the session." /></label>

    <section className={styles.formSection}>
      <div className={styles.sectionFields}>
        <label className={styles.field}><span>Paste a workout</span><textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder={"Back Squat 4x6 @ 225 lb\nDB Reverse Lunge 3x8\nBike 4x45 sec"} /></label>
        <p className={styles.formHint}>One exercise per line. In a paired session, exercise order and type are shared. Reps/timing are copied to Client B as a starting point, but Client B’s weight starts blank so the coach sets the correct individual load.</p>
        <button className={styles.secondaryAction} type="button" onClick={usePastedWorkout}>Turn pasted workout into rows</button>
      </div>
    </section>

    {pairEnabled && <div className={styles.clientTabs} role="tablist" aria-label="Paired workout clients">
      <button type="button" role="tab" aria-selected={activeClient === "primary"} className={activeClient === "primary" ? styles.clientTabActive : styles.clientTab} onClick={() => setActiveClient("primary")}>{primaryName}</button>
      <button type="button" role="tab" aria-selected={activeClient === "secondary"} className={activeClient === "secondary" ? styles.clientTabActive : styles.clientTab} onClick={() => setActiveClient("secondary")}>{secondaryName}</button>
    </div>}

    <div className={styles.exerciseHeader}><div><h3>{pairEnabled ? `${activeClient === "primary" ? primaryName : secondaryName} · Individual prescription` : "Workout"}</h3>{pairEnabled && <p className={styles.formHint}>Exercise names stay synchronized. Values below belong only to this client.</p>}</div><button className={styles.textAction} type="button" onClick={addExercise}>+ Add next exercise</button></div>
    <div className={styles.exerciseList}>
      {rows.map((row, index) => <fieldset className={styles.exerciseRow} key={row.id}>
        <legend>Exercise {index + 1}</legend>
        <label className={`${styles.field} ${styles.exerciseName}`}><span>Exercise · shared</span><input name="exerciseName" value={row.name} onChange={(event) => updateSharedRow(row.id, { name: event.target.value })} maxLength={120} required /></label>
        <label className={styles.field}><span>Type · shared</span><select name="exerciseMode" value={row.mode} onChange={(event) => updateSharedRow(row.id, { mode: event.target.value as ExerciseRow["mode"] })}><option value="reps">Reps</option><option value="time">Timed</option></select></label>
        {activeClient === "primary" || !pairEnabled ? prescriptionFields("primary", row) : hiddenPrescription("primary", row)}
        {pairEnabled && (activeClient === "secondary" ? prescriptionFields("secondary", row) : hiddenPrescription("secondary", row))}
        <button className={styles.removeAction} type="button" disabled={rows.length === 1} onClick={() => removeExercise(row.id)}>Remove</button>
      </fieldset>)}
    </div>

    <div className={styles.reviewFooter}>
      <p>{pairEnabled ? "This saves two linked workouts. The clients train through the same exercise sequence, but each tab keeps its own load, reps, timing, notes and history." : "Timed exercises automatically include Ravoge’s workout timer. Saving this plan makes it the Client’s scheduled workout and prevents a duplicate generated workout for that day."}</p>
      <div className={styles.accessActions}>
        <button className={styles.secondaryAction} name="saveIntent" value="another" disabled={pending}>Save & Keep Planning</button>
        <button className={styles.action} name="saveIntent" value="save" disabled={pending}>{pending ? "Saving…" : pairEnabled ? "Save Paired Workout" : "Save Planned Workout"}</button>
      </div>
    </div>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
  </form>;
}
