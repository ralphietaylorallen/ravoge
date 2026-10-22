"use client";

import { useActionState, useState } from "react";

import { approvePrescriptionAction } from "@/app/coach/actions";

import { loadInPounds, poundsInText } from "@/lib/weight-units";
import styles from "./dashboard.module.css";
import { defaultProtocol, type WorkoutProtocol } from "@/lib/workout-protocol";
import { WorkoutProtocolFields } from "./workout-protocol-fields";
import { roundedPercentageLoad, type WeightCapability } from "@/lib/equipment-weights";
import { startingLoadLabel, type LoadPrescription } from "@/lib/starting-load";

export type RecommendationExercise = {
  libraryExerciseId: string;
  load: number | string | null;
  loadUnit?: string | null;
  name: string;
  notes: string | null;
  reason: string;
  reps: number;
  restSeconds: number | null;
  sets: number;
  targetRpe?: number;
  protocol?: WorkoutProtocol;
  loadPrescription?: LoadPrescription & { coachingRule?: string };
  programmingSources?: { title: string; reviewId: string; revision: number }[];
};

type ExerciseOption = {
  default_rep_min: number;
  default_set_min: number;
  id: string;
  name: string;
  equipment_requirements?: string[];
};

type ReviewRow = RecommendationExercise & { rowId: number };

export function PrescriptionReviewForm({
  clientId,
  exercises,
  exerciseOptions,
  prescriptionId,
  scheduledDate,
  title,
  duration,
  quality = false,
  weightCapabilities = [],
}: {
  clientId: string;
  exercises: RecommendationExercise[];
  exerciseOptions: ExerciseOption[];
  prescriptionId: string;
  scheduledDate: string;
  title: string;
  duration: number;
  quality?: boolean;
  weightCapabilities?: WeightCapability[];
}) {
  const approve = approvePrescriptionAction.bind(null, clientId, prescriptionId);
  const [state, action, pending] = useActionState(approve, { status: "idle" as const });
  const [rows, setRows] = useState<ReviewRow[]>(exercises.map((exercise, index) => ({ ...exercise, rowId: index + 1 })));
  const [nextId, setNextId] = useState(exercises.length + 1);
  const firstOption = exerciseOptions[0];
  const [loadMessage, setLoadMessage] = useState("");

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
      ...(quality ? { protocol: defaultProtocol() } : {}),
    }]);
    setNextId((current) => current + 1);
  }

  function removeExercise(rowId: number) {
    if (rows.length === 1) return;
    setRows((current) => current.filter((row) => row.rowId !== rowId));
  }

  return (
    <form action={action} className={styles.reviewForm}>
      {quality && <input type="hidden" name="quality" value="yes"/>}
      <div className={styles.formColumns}>
        <div className={styles.field}><label htmlFor="review-title">Workout name</label><input defaultValue={title} id="review-title" maxLength={120} name="title" required /></div>
        <div className={styles.field}><label htmlFor="review-date">Assign date</label><input defaultValue={scheduledDate} id="review-date" name="scheduledDate" required type="date" /></div>
      </div>
      <div className={styles.field}><label htmlFor="review-duration">Workout duration (minutes)</label><input defaultValue={duration} id="review-duration" name="estimatedDurationMinutes" min={quality ? 15 : 20} max={180} required type="number" /></div>
      <div className={styles.field}><label htmlFor="review-instructions">Coach instructions</label><textarea id="review-instructions" maxLength={4000} name="instructions" rows={3} /></div>

      <div className={styles.exerciseHeader}><h3>Editable recommendation</h3><button className={styles.textAction} onClick={addExercise} type="button">+ Add exercise</button></div>
      <div className={styles.reviewList}>
        {rows.map((row, index) => (
          <fieldset className={styles.reviewRow} key={row.rowId}>
            <legend>{String(index + 1).padStart(2, "0")}</legend>
            <div className={`${styles.field} ${styles.reviewExercise}`}>
              <label htmlFor={`review-exercise-${row.rowId}`}>Exercise</label>
              <select defaultValue={row.libraryExerciseId} id={`review-exercise-${row.rowId}`} name="libraryExerciseId" required onChange={event => {
                const id = event.target.value;
                const fieldset = event.currentTarget.closest("fieldset")!;
                fieldset.querySelector<HTMLInputElement>('[name="exerciseLoad"]')!.value = "";
                setRows(current => current.map(ex => ex.rowId === row.rowId ? { ...ex, libraryExerciseId: id, load: null, programmingSources: [], loadPrescription: { calibrationRequired: true, explanation: "Exercise changed — confirm this movement’s technique load before approval." } } : ex));
              }}>
                {exerciseOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </div>
            <div className={styles.field}><label htmlFor={`review-sets-${row.rowId}`}>Sets</label><input defaultValue={row.sets} id={`review-sets-${row.rowId}`} max={100} min={1} name="exerciseSets" required type="number" /></div>
            {quality && row.protocol && row.protocol.measurement !== "reps" ? <input type="hidden" name="exerciseReps" value="1"/> : <div className={styles.field}><label htmlFor={`review-reps-${row.rowId}`}>Reps</label><input defaultValue={row.reps} id={`review-reps-${row.rowId}`} max={1000} min={1} name="exerciseReps" required type="number" /></div>}
            <div className={styles.field}><label htmlFor={`review-load-${row.rowId}`}>Load (lb){row.loadPrescription?.semantics === "each_hand" ? " per hand" : ""}</label><input defaultValue={loadInPounds(row.load, row.loadUnit) ?? ""} id={`review-load-${row.rowId}`} max={100000} min={0} name="exerciseLoad" step="any" type="number" />
              {row.loadPrescription && <div><p>{startingLoadLabel(row.load, row.loadPrescription)}</p><p>Basis: {row.loadPrescription.basis ?? "Coach override"} · rule {row.loadPrescription.ruleVersion ?? "review required"}</p><p>{row.loadPrescription.explanation}</p>{row.loadPrescription.coachReviewRequired && <p role="alert">Pain was recorded. Review before assigning; no automatic progression.</p>}</div>}
            </div>
            {exerciseOptions.find(e => e.id === row.libraryExerciseId)?.equipment_requirements?.includes("bands") ? <label className={styles.field}>Band resistance / level<input name="bandResistance" maxLength={120} required placeholder="Coach-confirmed band level"/></label> : <input type="hidden" name="bandResistance" value=""/>}
            <div className={styles.field}><label htmlFor={`review-reference-${row.rowId}`}>Coach-confirmed 1RM (lb, only for a percentage target)</label><input id={`review-reference-${row.rowId}`} name="referenceLoadLb" type="number" min="0.001" max="100000" step="0.001" />
              <button className={styles.textAction} type="button" onClick={event => {
                const fieldset = event.currentTarget.closest("fieldset")!;
                const number = (name: string) => Number(fieldset.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value);
                const exerciseId = fieldset.querySelector<HTMLSelectElement>('[name="libraryExerciseId"]')!.value;
                try {
                  const load = roundedPercentageLoad(number("referenceLoadLb"), number("protocol-percentageLoad"), exerciseOptions.find(e => e.id === exerciseId)?.equipment_requirements ?? [], weightCapabilities);
                  fieldset.querySelector<HTMLInputElement>('[name="exerciseLoad"]')!.value = String(load);
                  setLoadMessage(`Rounded down to a confirmed achievable load: ${load} lb. Review before assigning.`);
                } catch (error) { setLoadMessage(error instanceof Error ? error.message : "Confirm the reference and available sizes."); }
              }}>Calculate achievable percentage load</button>
            </div>
            {quality ? <input type="hidden" name="exerciseRpe" value={row.targetRpe ?? ""}/> : <div className={styles.field}><label htmlFor={`review-rpe-${row.rowId}`}>Target effort (RPE)</label><input defaultValue={row.targetRpe ?? ""} id={`review-rpe-${row.rowId}`} min={1} max={10} step="0.5" name="exerciseRpe" type="number" /></div>}
            <div className={styles.field}><label htmlFor={`review-rest-${row.rowId}`}>Rest seconds</label><input defaultValue={row.restSeconds ?? ""} id={`review-rest-${row.rowId}`} max={1800} min={quality ? 0 : 10} name="exerciseRest" type="number" /></div>
            <div className={`${styles.field} ${styles.reviewNotes}`}><label htmlFor={`review-notes-${row.rowId}`}>Notes</label><input defaultValue={poundsInText(row.notes ?? "")} id={`review-notes-${row.rowId}`} maxLength={1000} name="exerciseNotes" /></div>
            <div className={`${styles.field} ${styles.reviewReason}`}><label htmlFor={`review-reason-${row.rowId}`}>Why Ravoge selected it</label><input defaultValue={row.reason} id={`review-reason-${row.rowId}`} maxLength={1000} name="exerciseReason" /></div>
            <p className={styles.reviewReason}>Programming: {row.programmingSources?.length ? row.programmingSources.map(source => `${source.title} (review ${source.revision})`).join("; ") : "Global canonical exercise; see session evidence for any reviewed gym influence."}</p>
            {quality && <div className={styles.reviewProtocol}><WorkoutProtocolFields value={row.protocol} library={exerciseOptions} substitutions onMeasurementChange={measurement => setRows(current => current.map(ex => ex.rowId === row.rowId ? { ...ex, reps: measurement === "reps" ? 8 : 1, protocol: { ...(ex.protocol ?? defaultProtocol()), measurement } } : ex))}/></div>}
            <button aria-label={`Remove exercise ${index + 1}`} className={styles.removeAction} disabled={rows.length === 1} onClick={() => removeExercise(row.rowId)} type="button">Remove</button>
          </fieldset>
        ))}
      </div>
      <div className={styles.reviewFooter}>
        <p>Approval creates the client assignment. The original Ravoge recommendation remains preserved.</p>
        <button className={styles.action} disabled={pending} type="submit">{pending ? "Assigning…" : "Approve & assign"}</button>
      </div>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
      {loadMessage && <p role="status">{loadMessage}</p>}
    </form>
  );
}
