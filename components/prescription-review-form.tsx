"use client";

import { useActionState, useState } from "react";

import { approvePrescriptionAction } from "@/app/coach/actions";

import styles from "./dashboard.module.css";

export type RecommendationExercise = {
  libraryExerciseId: string;
  load: number | string | null;
  name: string;
  notes: string | null;
  reason: string;
  reps: number;
  restSeconds: number | null;
  sets: number;
};

type ExerciseOption = {
  default_rep_min: number;
  default_set_min: number;
  id: string;
  name: string;
};

type ReviewRow = RecommendationExercise & { rowId: number };

export function PrescriptionReviewForm({
  clientId,
  exercises,
  exerciseOptions,
  prescriptionId,
  title,
}: {
  clientId: string;
  exercises: RecommendationExercise[];
  exerciseOptions: ExerciseOption[];
  prescriptionId: string;
  title: string;
}) {
  const approve = approvePrescriptionAction.bind(null, clientId, prescriptionId);
  const [state, action, pending] = useActionState(approve, { status: "idle" as const });
  const [rows, setRows] = useState<ReviewRow[]>(exercises.map((exercise, index) => ({ ...exercise, rowId: index + 1 })));
  const [nextId, setNextId] = useState(exercises.length + 1);
  const firstOption = exerciseOptions[0];

  function addExercise() {
    if (!firstOption || rows.length >= 30) return;
    setRows((current) => [...current, {
      libraryExerciseId: firstOption.id,
      load: null,
      name: firstOption.name,
      notes: null,
      reason: "Added by coach during review.",
      reps: firstOption.default_rep_min,
      restSeconds: 75,
      rowId: nextId,
      sets: firstOption.default_set_min,
    }]);
    setNextId((current) => current + 1);
  }

  function removeExercise(rowId: number) {
    if (rows.length === 1) return;
    setRows((current) => current.filter((row) => row.rowId !== rowId));
  }

  return (
    <form action={action} className={styles.reviewForm}>
      <div className={styles.formColumns}>
        <div className={styles.field}><label htmlFor="review-title">Workout name</label><input defaultValue={title} id="review-title" maxLength={120} name="title" required /></div>
        <div className={styles.field}><label htmlFor="review-date">Assign date</label><input defaultValue={new Date().toISOString().slice(0, 10)} id="review-date" name="scheduledDate" required type="date" /></div>
      </div>
      <div className={styles.field}><label htmlFor="review-instructions">Coach instructions</label><textarea id="review-instructions" maxLength={4000} name="instructions" rows={3} /></div>

      <div className={styles.exerciseHeader}><h3>Editable recommendation</h3><button className={styles.textAction} onClick={addExercise} type="button">+ Add exercise</button></div>
      <div className={styles.reviewList}>
        {rows.map((row, index) => (
          <fieldset className={styles.reviewRow} key={row.rowId}>
            <legend>{String(index + 1).padStart(2, "0")}</legend>
            <div className={`${styles.field} ${styles.reviewExercise}`}>
              <label htmlFor={`review-exercise-${row.rowId}`}>Exercise</label>
              <select defaultValue={row.libraryExerciseId} id={`review-exercise-${row.rowId}`} name="libraryExerciseId" required>
                {exerciseOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            <div className={styles.field}><label htmlFor={`review-sets-${row.rowId}`}>Sets</label><input defaultValue={row.sets} id={`review-sets-${row.rowId}`} max={100} min={1} name="exerciseSets" required type="number" /></div>
            <div className={styles.field}><label htmlFor={`review-reps-${row.rowId}`}>Reps</label><input defaultValue={row.reps} id={`review-reps-${row.rowId}`} max={1000} min={1} name="exerciseReps" required type="number" /></div>
            <div className={styles.field}><label htmlFor={`review-load-${row.rowId}`}>Load</label><input defaultValue={row.load ?? ""} id={`review-load-${row.rowId}`} max={100000} min={0} name="exerciseLoad" step="0.01" type="number" /></div>
            <div className={styles.field}><label htmlFor={`review-rest-${row.rowId}`}>Rest seconds</label><input defaultValue={row.restSeconds ?? ""} id={`review-rest-${row.rowId}`} max={1800} min={10} name="exerciseRest" type="number" /></div>
            <div className={`${styles.field} ${styles.reviewNotes}`}><label htmlFor={`review-notes-${row.rowId}`}>Notes</label><input defaultValue={row.notes ?? ""} id={`review-notes-${row.rowId}`} maxLength={1000} name="exerciseNotes" /></div>
            <div className={`${styles.field} ${styles.reviewReason}`}><label htmlFor={`review-reason-${row.rowId}`}>Why Ravoge selected it</label><input defaultValue={row.reason} id={`review-reason-${row.rowId}`} maxLength={1000} name="exerciseReason" /></div>
            <button aria-label={`Remove exercise ${index + 1}`} className={styles.removeAction} disabled={rows.length === 1} onClick={() => removeExercise(row.rowId)} type="button">Remove</button>
          </fieldset>
        ))}
      </div>
      <div className={styles.reviewFooter}>
        <p>Approval creates the client assignment. The original Ravoge recommendation remains preserved.</p>
        <button className={styles.action} disabled={pending} type="submit">{pending ? "Assigning…" : "Approve & assign"}</button>
      </div>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    </form>
  );
}
