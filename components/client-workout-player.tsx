"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { playerSessionAction, playerSetAction } from "@/app/client/workout-player-actions";
import { protocolTarget, type WorkoutProtocol } from "@/lib/workout-protocol";
import styles from "./workout-player.module.css";

type PlayerSet = { id: string; set_number: number; actual_reps: number | null; actual_load: number | null; actual_load_unit: string | null; actual_work_seconds: number | null; actual_distance: number | null; actual_rpe: number | null; client_result: string | null; completed_at: string | null; pain_reported: boolean; failure_notes: string | null };
export type PlayerExercise = { id: string; exercise_name: string; sets: number; reps: number; load: number | null; rest_seconds: number | null; notes: string | null; prescription_details: WorkoutProtocol | null; workout_sets: PlayerSet[]; exercise_library: { coach_cue: string | null; equipment_requirements: string[] } | null };

export function WorkoutTimer({ work, rest }: { work: number; rest: number }) {
  const [timer, setTimer] = useState({ remaining: 0, phase: "Rest", running: false, end: 0 });
  const { remaining, phase, running } = timer;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTimer(v => {
      const left = Math.ceil((v.end - Date.now()) / 1000);
      if (left > 0) return { ...v, remaining: left };
      if (v.phase === "Work" && rest > 0 && v.end + rest * 1000 > Date.now()) return { remaining: Math.ceil((v.end + rest * 1000 - Date.now()) / 1000), phase: "Rest", running: true, end: v.end + rest * 1000 };
      return { ...v, remaining: 0, running: false };
    }), 250);
    return () => window.clearInterval(id);
  }, [running, rest]);
  function start(seconds: number, label: string) { setTimer({ remaining: seconds, phase: label, running: true, end: Date.now() + seconds * 1000 }); }
  return <div className={styles.timer}><span role="timer" aria-label={`${phase} timer`}>{phase} · {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
    <div className={styles.actions}>{work > 0 && <button type="button" onClick={() => start(work, "Work")}>Start interval timer</button>}{rest > 0 && <button type="button" onClick={() => start(rest, "Rest")}>Start rest timer ({rest}s)</button>}
      <button type="button" disabled={!remaining} onClick={() => setTimer(v => ({ ...v, remaining: v.running ? Math.max(0, Math.ceil((v.end - Date.now()) / 1000)) : v.remaining, running: !v.running, end: v.running ? v.end : Date.now() + v.remaining * 1000 }))}>{running ? "Pause timer" : "Resume timer"}</button><button type="button" onClick={() => setTimer(v => ({ ...v, remaining: 0, running: false }))}>Reset timer</button></div>
  </div>;
}

function PlayerSetForm({ set, exercise, workoutId, locked, role, substitutions }: { set: PlayerSet; exercise: PlayerExercise; workoutId: string; locked: boolean; role: "client" | "coach"; substitutions: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(playerSetAction.bind(null, role, workoutId, set.id), { status: "idle" as const });
  const router = useRouter();
  useEffect(() => { if (state.status === "success") router.refresh(); }, [state, router]);
  const p = exercise.prescription_details;
  const label = `Set ${set.set_number}`;
  return <details className={styles.set} open={!set.completed_at}><summary>{label} · {set.client_result ?? (set.completed_at ? "recorded" : "not started")}{set.pain_reported ? " · pain reported" : ""}</summary>
    <form action={action} aria-label={`${exercise.exercise_name} ${label}`} onReset={event => event.preventDefault()}>
      <div className={styles.fields}>
        {(!p || p.measurement === "reps") && <label>Actual repetitions<input name="reps" type="number" min={0} max={1000} defaultValue={set.actual_reps ?? exercise.reps} disabled={locked}/></label>}
        {p?.measurement === "time" && <label>Actual work seconds<input name="seconds" type="number" min={0} max={7200} defaultValue={set.actual_work_seconds ?? p.workSeconds ?? ""} disabled={locked}/></label>}
        {p?.measurement === "distance" && <label>Actual distance ({p.distanceUnit})<input name="distance" type="number" step="0.5" min={0} max={10000} defaultValue={set.actual_distance ?? p.distance ?? ""} disabled={locked}/></label>}
        <label>Actual load (optional)<input name="load" type="number" step="0.01" min={0} max={100000} defaultValue={set.actual_load ?? exercise.load ?? ""} disabled={locked}/></label>
        <label>Load unit<select name="loadUnit" defaultValue={set.actual_load_unit ?? "kg"} disabled={locked}><option value="kg">kg</option><option value="lb">lb</option></select></label>
        <label>Actual effort (RPE, optional)<input name="rpe" type="number" min={1} max={10} step="0.5" defaultValue={set.actual_rpe ?? ""} disabled={locked}/></label>
        {substitutions.length > 0 && <label>Coach-approved substitution<select name="substitutionId" disabled={locked}><option value="">Original exercise</option>{substitutions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <label className={styles.pain}><input type="checkbox" name="pain" value="yes" defaultChecked={set.pain_reported} disabled={locked}/>Pain or problem — stop if needed and tell your Coach</label>
      <label>Modification / pain location / notes<textarea name="notes" defaultValue={set.failure_notes ?? ""} maxLength={1000} rows={2} disabled={locked}/></label>
      <div className={styles.actions}><button className={styles.primary} name="result" value="complete" disabled={pending || locked}>Complete set</button><button name="result" value="modified" disabled={pending || locked}>Modified</button><button name="result" value="missed" disabled={pending || locked} formNoValidate>Missed</button></div>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </details>;
}

export function ClientWorkoutPlayer({ workoutId, title, goal, duration, status, exercises, substitutions = [], role = "client" }: { workoutId: string; title: string; goal: string | null; duration: number | null; status: string; exercises: PlayerExercise[]; substitutions?: { id: string; name: string }[]; role?: "client" | "coach" }) {
  const [state, action, pending] = useActionState(playerSessionAction.bind(null, role, workoutId), { status: "idle" as const });
  const router = useRouter();
  useEffect(() => { if (state.status === "success") router.refresh(); }, [state, router]);
  const allSets = exercises.flatMap(e => e.workout_sets);
  const recorded = allSets.filter(s => s.completed_at).length;
  const locked = ["completed", "cancelled"].includes(status);
  return <section className={styles.player} aria-label="Ravoge workout player"><header className={styles.header}><span>RAVOGE · TRAIN WITH INTENT</span><p className={styles.title}>{title}</p><p>{goal ?? "Coach-approved training"} · {duration ? `About ${duration} minutes` : "Follow your Coach’s timing"}</p>
    <label>Workout progress<progress max={Math.max(1, allSets.length)} value={recorded}/></label><p>{recorded} / {allSets.length} sets recorded · Modified and missed work remain visible to your Coach.</p>
    <form action={action}><button className={styles.primary} name="intent" value="start" disabled={locked || pending}>{status === "assigned" ? "Start workout" : locked ? "Workout closed" : "Continue workout"}</button></form>
  </header><h3>Exercises</h3>
    {exercises.map((exercise, index) => {
      const p = exercise.prescription_details;
      const options = substitutions.filter(s => p?.substitutionIds.includes(s.id));
      return <article id={`player-exercise-${index}`} key={exercise.id} className={styles.block}>
        <div className={styles.blockHeading}><span>{String(index + 1).padStart(2, "0")} · {(p?.block ?? "strength").replaceAll("_", " ")}</span><span>{p?.format ?? "straight"}{p?.group ? ` · ${p.group}` : ""}</span></div>
        <h3>{exercise.exercise_name}</h3><p className={styles.target}>{protocolTarget(exercise.sets, exercise.reps, p)}{exercise.load !== null ? ` · Load ${exercise.load} (confirm unit with Coach)` : ""}</p>
        {p?.format === "emom" && <p>Begin this station every {p.intervalSeconds}s slot. Rest for the remainder; keep the shared group order.</p>}
        {p?.format === "amrap" && <p>{p.blockDurationSeconds}s for this entire group. Repeat its movements at controlled effort; no fixed number of rounds is prescribed.</p>}
        {["circuit", "superset", "stations", "rounds"].includes(p?.format ?? "") && <p>Complete the group in the Coach’s listed order, then repeat for the prescribed rounds.</p>}
        <p>{exercise.exercise_library?.coach_cue}</p><p>Equipment: {exercise.exercise_library?.equipment_requirements.join(", ").replaceAll("_", " ") || "Bodyweight"}.</p>
        {exercise.notes && <p>{exercise.notes}</p>}<p>Rest: {exercise.rest_seconds ?? 0}s as prescribed.</p>
        <WorkoutTimer work={p?.format === "amrap" ? p.blockDurationSeconds ?? 0 : p?.format === "emom" ? p.intervalSeconds ?? 0 : p?.workSeconds ?? 0} rest={exercise.rest_seconds ?? 0}/>
        {[...exercise.workout_sets].sort((a, b) => a.set_number - b.set_number).map(set => <PlayerSetForm key={set.id} set={set} exercise={exercise} workoutId={workoutId} locked={locked} role={role} substitutions={options}/>)}
        {index + 1 < exercises.length && <a className={styles.next} href={`#player-exercise-${index + 1}`}>Next exercise →</a>}
      </article>;
    })}
    <form action={action} className={styles.block}><h3>Finish and reflect</h3><label>How difficult was today’s workout?<select name="difficulty" required defaultValue="" disabled={locked}><option value="" disabled>Choose 1–5</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {n === 1 ? "Easy" : n === 5 ? "Very difficult" : "Moderate"}</option>)}</select></label><label>Short feedback (optional)<textarea name="feedback" maxLength={2000} rows={3} disabled={locked}/></label><button className={styles.primary} name="intent" value="finish" disabled={pending || locked || recorded !== allSets.length || allSets.length === 0}>Complete workout</button>{state.message && <p role="status">{state.message}</p>}</form>
  </section>;
}
