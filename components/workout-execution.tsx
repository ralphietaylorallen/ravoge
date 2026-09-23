"use client";

import { useActionState, useState } from "react";
import { recordSetAction, saveSessionAction, type ExecutionState } from "@/app/coach/workout-actions";
import styles from "./dashboard.module.css";

export type ExecutionSet = {id:string;set_number:number;prescribed_reps:number;prescribed_load:number|null;actual_reps:number|null;actual_load:number|null;execution_result:string|null;failure_reason:string|null;failure_notes:string|null};
export type ExecutionExercise = {id:string;exercise_name:string;notes:string|null;rest_seconds:number|null;workout_sets:ExecutionSet[]};
const failureReasons=[["failed_reps","Could not complete reps"],["too_heavy","Weight too heavy"],["form_breakdown","Form breakdown"],["pain_discomfort","Pain / discomfort"],["fatigue","Fatigue"],["coach_stopped","Stopped by coach"],["other","Other"]];

function SetRow({set,clientId,workoutId,locked}:{set:ExecutionSet;clientId:string;workoutId:string;locked:boolean}) {
  const [result,setResult]=useState(set.execution_result === "exceeded" ? "complete" : set.execution_result ?? "");
  const [state,action,pending]=useActionState<ExecutionState,FormData>(recordSetAction.bind(null,clientId,workoutId,set.id),{status:"idle"});
  const label=`Set ${set.set_number}`;
  // Preserve the just-recorded values when React resets a successful action form.
  return <form action={action} aria-label={label} className={styles.setRow} onReset={(event)=>event.preventDefault()}>
    <strong className={styles.setNumber}>{set.set_number}</strong>
    <span className={styles.setTarget}>{set.prescribed_load ?? "BW"}<small>× {set.prescribed_reps} reps</small></span>
    <label className={styles.field}><span>Actual weight</span><input aria-label={`${label} actual weight`} defaultValue={set.actual_load ?? set.prescribed_load ?? 0} disabled={locked} max={100000} min={0} name="actualLoad" required={result!=="not_completed"} step="0.01" type="number" /></label>
    <label className={styles.field}><span>Actual reps</span><input aria-label={`${label} actual reps`} defaultValue={set.actual_reps ?? set.prescribed_reps} disabled={locked} max={1000} min={0} name="actualReps" required={result!=="not_completed"} type="number" /></label>
    <label className={styles.field}><span>Result</span><select aria-label={`${label} result`} disabled={locked} name="result" onChange={(event)=>setResult(event.target.value)} required value={result}><option disabled value="">Not started</option><option value="complete">Complete / did more</option><option value="failed">Failed</option><option value="not_completed">Not completed</option></select></label>
    <button className={styles.secondaryAction} disabled={pending||locked||!result} type="submit">{pending?"Saving…":"Save set"}</button>
    {result==="failed" && <label className={`${styles.field} ${styles.setReason}`}><span>Why?</span><select aria-label={`${label} failure reason`} defaultValue={set.failure_reason??""} disabled={locked} name="reason" required><option disabled value="">Choose a reason</option>{failureReasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    <label className={`${styles.field} ${styles.setNotes}`}><span>Notes (optional)</span><input aria-label={`${label} notes`} defaultValue={set.failure_notes??""} disabled={locked} maxLength={1000} name="notes" placeholder="What happened in this set?" /></label>
    <div className={styles.setSaved}>{set.execution_result && <span className={set.execution_result==="failed"?styles.failurePill:set.execution_result==="not_completed"?styles.mutedPill:styles.successPill}>{set.execution_result.replaceAll("_"," ")}</span>}{state.message && <span className={state.status==="error"?styles.warningText:""} role="status">{state.message}</span>}</div>
  </form>;
}

export function WorkoutExecution({exercises,clientId,workoutId,locked}:{exercises:ExecutionExercise[];clientId:string;workoutId:string;locked:boolean}) {
  return <div className={styles.executionExercises}>{exercises.map((exercise,index)=>{
    const complete=exercise.workout_sets.filter((set)=>["complete","exceeded"].includes(set.execution_result??"")).length;
    const failed=exercise.workout_sets.some((set)=>set.execution_result==="failed");
    return <details className={styles.executionExercise} key={exercise.id} open><summary><span><small>EXERCISE {index+1}</small><strong>{exercise.exercise_name}</strong></span><span className={failed?styles.failurePill:complete===exercise.workout_sets.length?styles.successPill:styles.mutedPill}>{failed?"Failed set":complete===exercise.workout_sets.length?"Complete":`${complete} of ${exercise.workout_sets.length} sets complete`}</span></summary>{exercise.notes&&<p className={styles.exerciseInstructions}>{exercise.notes}</p>}<div className={styles.setHeader} aria-hidden="true"><span>Set</span><span>Target</span><span>Actual performance</span></div>{[...exercise.workout_sets].sort((a,b)=>a.set_number-b.set_number).map((set)=><SetRow clientId={clientId} key={set.id} locked={locked} set={set} workoutId={workoutId} />)}<p className={styles.formHint}>Targets stay unchanged. Record extra reps or weight in Actual; Ravoge records an exceeded target.</p></details>;
  })}</div>;
}

export function SessionCompletionForm({clientId,workoutId,notes,duration,locked}:{clientId:string;workoutId:string;notes:string|null;duration:number|null;locked:boolean}) {
  const [state,action,pending]=useActionState<ExecutionState,FormData>(saveSessionAction.bind(null,clientId,workoutId),{status:"idle"});
  return <form action={action} className={styles.form}><label className={styles.field}><span>Coach notes</span><textarea defaultValue={notes??""} disabled={locked} maxLength={4000} name="coachNotes" rows={4} /></label><button className={styles.secondaryAction} disabled={pending||locked} name="intent" type="submit" value="notes">Save notes</button><label className={styles.field}><span>Session duration (minutes)</span><input defaultValue={duration??""} disabled={locked} max={480} min={1} name="duration" type="number" /></label><button className={styles.action} disabled={pending||locked} name="intent" type="submit" value="finish">{locked?"Workout complete":pending?"Saving…":"Complete workout"}</button>{state.message&&<p className={`${styles.notice} ${state.status==="error"?styles.error:""}`} role="status">{state.message}</p>}</form>;
}
