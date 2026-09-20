"use client";

import { useActionState, useState } from "react";

import { createWorkoutAction } from "@/app/coach/actions";

import styles from "./dashboard.module.css";

type ExerciseRow = { id: number };

export function WorkoutForm({ clientId }: { clientId: string }) {
  const createForClient = createWorkoutAction.bind(null, clientId);
  const [state, action, pending] = useActionState(createForClient, {
    status: "idle" as const,
  });
  const [rows, setRows] = useState<ExerciseRow[]>([{ id: 1 }]);
  const [nextId, setNextId] = useState(2);

  function addExercise() {
    if (rows.length >= 30) return;
    setRows((current) => [...current, { id: nextId }]);
    setNextId((current) => current + 1);
  }

  function removeExercise(id: number) {
    if (rows.length === 1) return;
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <form action={action} className={styles.workoutForm}>
      <div className={styles.formColumns}>
        <div className={styles.field}>
          <label htmlFor="workout-title">Workout name</label>
          <input id="workout-title" maxLength={120} name="title" required />
        </div>
        <div className={styles.field}>
          <label htmlFor="workout-date">Date</label>
          <input id="workout-date" name="scheduledDate" required type="date" />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="workout-instructions">Coach instructions</label>
        <textarea id="workout-instructions" maxLength={4000} name="instructions" rows={3} />
      </div>

      <div className={styles.exerciseHeader}>
        <h3>Exercises</h3>
        <button className={styles.textAction} onClick={addExercise} type="button">
          + Add exercise
        </button>
      </div>
      <div className={styles.exerciseList}>
        {rows.map((row, index) => (
          <fieldset className={styles.exerciseRow} key={row.id}>
            <legend>Exercise {index + 1}</legend>
            <div className={`${styles.field} ${styles.exerciseName}`}>
              <label htmlFor={`exercise-name-${row.id}`}>Name</label>
              <input id={`exercise-name-${row.id}`} maxLength={120} name="exerciseName" required />
            </div>
            <div className={styles.field}>
              <label htmlFor={`exercise-sets-${row.id}`}>Sets</label>
              <input id={`exercise-sets-${row.id}`} max={100} min={1} name="exerciseSets" required type="number" />
            </div>
            <div className={styles.field}>
              <label htmlFor={`exercise-reps-${row.id}`}>Reps</label>
              <input id={`exercise-reps-${row.id}`} max={1000} min={1} name="exerciseReps" required type="number" />
            </div>
            <div className={styles.field}>
              <label htmlFor={`exercise-load-${row.id}`}>Weight</label>
              <input id={`exercise-load-${row.id}`} max={100000} min={0} name="exerciseLoad" step="0.01" type="number" />
            </div>
            <div className={`${styles.field} ${styles.exerciseNotes}`}>
              <label htmlFor={`exercise-notes-${row.id}`}>Notes</label>
              <input id={`exercise-notes-${row.id}`} maxLength={1000} name="exerciseNotes" />
            </div>
            <button
              aria-label={`Remove exercise ${index + 1}`}
              className={styles.removeAction}
              disabled={rows.length === 1}
              onClick={() => removeExercise(row.id)}
              type="button"
            >
              Remove
            </button>
          </fieldset>
        ))}
      </div>

      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Saving…" : "Save workout"}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
