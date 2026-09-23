"use client";
import {useActionState} from "react";
import {coachCheckinAction,type ExecutionState} from "@/app/coach/workout-actions";
import {CheckinScales,type CheckinQuestion} from "./checkin-scales";
import styles from "./dashboard.module.css";
export function CoachCheckin({clientId,questions,contexts}:{clientId:string;questions:CheckinQuestion[];contexts:{id:string;label:string}[]}) {
  const [state,action,pending]=useActionState<ExecutionState,FormData>(coachCheckinAction.bind(null,clientId),{status:"idle"});
  return <form action={action} className={styles.operationCard}><h3>Pre-workout check-in</h3><p className={styles.profileMeta}>Record the Client’s responses for this session.</p><label className={styles.field}><span>Session or workout</span><select defaultValue="" name="context" required><option disabled value="">Choose a session or workout</option>{contexts.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><CheckinScales prefix="coach-checkin" questions={questions}/><button className={styles.action} disabled={pending||!contexts.length} type="submit">{pending?"Saving…":"Save check-in"}</button>{!contexts.length&&<p className={styles.empty}>Book a session or assign a workout to save a check-in. You can continue the baseline evaluation now.</p>}{state.message&&<p className={`${styles.notice} ${state.status==="error"?styles.error:""}`} role="status">{state.message}</p>}</form>;
}
