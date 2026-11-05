"use client";

import { useActionState, useState } from "react";
import { deleteActivityAction, deleteRecoveryAction, saveActivityAction, saveDailyTotalsAction, saveRecoveryAction, type LogState } from "@/app/client/log-actions";
import { ACTIVITY_LABELS, RECOVERY_LABELS, recoverySummary, type ActivityEntry, type DailyTotal, type RecoveryEntry } from "@/lib/client-logs";
import styles from "./dashboard.module.css";
import reportStyles from "./session-report.module.css";

const initial: LogState={status:"idle",message:""};
function Message({state}:{state:LogState}) {return state.message?<p className={`${styles.notice} ${state.status==="error"?styles.error:""}`} role={state.status==="error"?"alert":"status"}>{state.message}</p>:null;}
export function DailyTotalForm({date,total}:{date:string;total:DailyTotal|null}) {
  const [state,action,pending]=useActionState(saveDailyTotalsAction,initial);
  return <form action={action} className={styles.form} aria-label="Daily nutrition"><h3>Daily intake</h3><input type="hidden" name="date" value={date}/><p>One total per day. Leave unknown values blank.</p><div className={styles.formColumns}><label className={styles.field}>Calories<input name="calories" type="number" min="0" max="30000" step="1" defaultValue={total?.calories??""} placeholder="Not logged"/></label><label className={styles.field}>Protein (g, optional)<input name="protein_grams" type="number" min="0" max="2000" step="0.01" defaultValue={total?.protein_grams??""} placeholder="Not logged"/></label></div><button className={styles.action} disabled={pending}>{pending?"Saving…":"Save daily total"}</button><Message state={state}/></form>;
}
export function ActivityForm({date,entry,newId}:{date:string;entry?:ActivityEntry;newId?:string}) {
  const [id]=useState(()=>entry?.id??newId!);
  const [state,action,pending]=useActionState(saveActivityAction.bind(null,id),initial);
  const [deleted,remove,removing]=useActionState(deleteActivityAction.bind(null,id),initial);
  return <><form action={action} className={styles.form} aria-label={entry?`Edit ${ACTIVITY_LABELS[entry.activity_type]}`:"Add activity"}><div className={styles.formColumns}><label className={styles.field}>Activity date<input type="date" name="date" required defaultValue={entry?.log_date??date}/></label><label className={styles.field}>Activity<select aria-label="Activity" name="activity_type" defaultValue={entry?.activity_type??"walk"}>{Object.entries(ACTIVITY_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className={styles.field}>Actual minutes<input name="duration_minutes" type="number" required min="0.01" max="1440" step="0.01" defaultValue={entry?.duration_minutes??""}/></label><label className={styles.field}>Distance (optional)<input name="distance" type="number" min="0.001" max="10000" step="0.001" defaultValue={entry?.distance??""} placeholder="Not logged"/></label><label className={styles.field}>Distance unit<select aria-label="Distance unit" name="distance_unit" defaultValue={entry?.distance_unit??"mi"}><option value="mi">Miles</option><option value="km">Kilometers</option></select></label><label className={styles.field}>Effort (1–10, optional)<input name="effort" type="number" min="1" max="10" step="1" defaultValue={entry?.effort??""} placeholder="Not logged"/></label></div><button className={styles.action} disabled={pending||removing}>{pending?"Saving…":"Save activity"}</button><Message state={state}/></form>{entry&&<form action={remove} onSubmit={e=>{if(!confirm("Delete this activity? Assigned workouts and training results will stay unchanged."))e.preventDefault();}}><input type="hidden" name="confirmed" value="yes"/><button className={styles.secondaryAction} disabled={pending||removing}>{removing?"Deleting…":"Delete activity"}</button><Message state={deleted}/></form>}</>;
}
function RecoveryForm({date,workoutId,type,entry,newId,timezone}:{date:string;workoutId:string;type:string;entry?:RecoveryEntry;newId?:string;timezone:string}) {
  const [id]=useState(()=>entry?.id??newId!);
  const [state,action,pending]=useActionState(saveRecoveryAction.bind(null,workoutId),initial);
  const [removed,remove,removing]=useActionState(deleteRecoveryAction.bind(null,workoutId,id),initial);
  const time=entry?.occurred_at?new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(entry.occurred_at)):"";
  return <><form action={action} onReset={event=>event.preventDefault()} className={styles.form} aria-label={`${entry?"Edit":"Add"} ${RECOVERY_LABELS[type]}`}>
    <h3>{RECOVERY_LABELS[type]}</h3><input type="hidden" name="entry_id" value={id}/><input type="hidden" name="recovery_type" value={type}/>
    <div className={styles.formColumns}>
      <label className={styles.field}>Recovery date<input name="date" type="date" required defaultValue={entry?.log_date??date}/></label>
      <label className={styles.field}>Actual recovery time<input name="time" type="time" required={!entry||!!entry.occurred_at} defaultValue={time}/></label>
      <label className={styles.field}>Actual minutes completed<input name="duration_minutes" type="number" required min="0.01" max="1440" step="0.01" defaultValue={entry?.duration_minutes??""}/></label>
      {type==="cold_plunge"?<><label className={styles.field}>Water temperature (optional)<input name="water_temperature" type="number" step="0.01" defaultValue={entry?.water_temperature??""} placeholder="Not logged"/></label><label className={styles.field}>Temperature unit<select aria-label="Temperature unit" name="temperature_unit" defaultValue={entry?.temperature_unit??"F"}><option value="F">°F</option><option value="C">°C</option></select></label></>:<input type="hidden" name="temperature_unit" value="F"/>}
    </div>
    <p className={styles.formHint}>Actual occurrence in {timezone}. {entry&&!entry.occurred_at?"Historical time is not recorded; leave it blank if unknown.":"Use the time recovery actually happened."}</p>
    <label className={styles.field}>Notes (optional)<textarea name="notes" rows={2} maxLength={1000} defaultValue={entry?.notes??""}/></label>
    <label className={styles.field}>How you felt afterward (optional)<textarea name="felt_after" rows={2} maxLength={500} defaultValue={entry?.felt_after??""}/></label>
    <button className={styles.action} disabled={pending||removing}>{pending?"Saving…":"Save recovery"}</button><Message state={state}/>
  </form>{entry&&<form action={remove} onSubmit={event=>{if(!confirm("Remove this recovery entry? Your workout results and score stay unchanged."))event.preventDefault();}}><input type="hidden" name="confirmed" value="yes"/><button className={styles.secondaryAction} disabled={pending||removing}>{removing?"Removing…":"Delete recovery"}</button><Message state={removed}/></form>}</>;
}
export function RecoveryLog({date,workoutId,entries,timezone,newIds}:{date:string;workoutId:string;entries:RecoveryEntry[];timezone:string;newIds:Record<string,string>}) {
  return <section id="recovery" className={styles.operationCard} aria-label="Workout recovery"><p>Log what you complete after training. Recovery is optional and never increases your workout score.</p>
    <div className={reportStyles.recoveryGrid}>{Object.keys(RECOVERY_LABELS).map(type=><details key={newIds[type]}><summary>{type==="sauna"?"Log sauna":"Log plunge"}</summary><RecoveryForm date={date} workoutId={workoutId} type={type} newId={newIds[type]} timezone={timezone}/></details>)}</div>
    {!entries.length&&<p>Not logged</p>}{entries.map(entry=><details key={`${entry.id}:${entry.log_date}:${entry.duration_minutes}:${entry.water_temperature}:${entry.temperature_unit}:${entry.occurred_at}:${entry.notes}:${entry.felt_after}`}><summary>{recoverySummary(entry)} · {entry.log_date} · Edit</summary><RecoveryForm date={date} workoutId={workoutId} type={entry.recovery_type} entry={entry} timezone={timezone}/></details>)}
  </section>;
}
