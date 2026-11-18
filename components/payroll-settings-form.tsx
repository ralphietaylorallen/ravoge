"use client";
import {useActionState,useState} from "react";
import {savePayrollSettingsAction,type PayrollActionState} from "@/app/owner/payroll/actions";
import {PAYROLL_WEEKDAYS,payrollAnchorForWeekday,validPayrollDate,type PayrollSettings} from "@/lib/payroll";
import styles from "./dashboard.module.css";
export function PayrollSettingsForm({settings,today}:{settings:PayrollSettings;today:string}) {
 const [state,action,pending]=useActionState<PayrollActionState,FormData>(savePayrollSettingsAction,{status:"idle"});
 const [weekday,setWeekday]=useState(settings.startWeekday);
 const [anchor,setAnchor]=useState(settings.configured?settings.anchorDate:payrollAnchorForWeekday(today,settings.startWeekday));
 return <form action={action} className={styles.form}>
  <div className={styles.formColumns}>
   <label className={styles.field}>Pay period<select name="cadenceDays" defaultValue={settings.cadenceDays}><option value="7">Every week</option><option value="14">Every two weeks</option></select></label>
   <label className={styles.field}>Period starts on<select name="startWeekday" value={weekday} onChange={e=>{const day=Number(e.target.value);setWeekday(day);setAnchor(payrollAnchorForWeekday(validPayrollDate(anchor)?anchor:today,day));}}>{PAYROLL_WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>
   <label className={styles.field}>A period starts on this date<input name="anchorDate" type="date" value={anchor} min="1900-01-01" max="2200-12-31" required onChange={e=>{setAnchor(e.target.value);if(validPayrollDate(e.target.value)){setWeekday(new Date(e.target.value+"T12:00:00Z").getUTCDay());}}}/></label>
  </div>
  <p className={styles.formHint}>Choose one known period start date. This fixes which alternating week is used for two-week periods. Dates use your gym’s timezone. These are period boundaries, not automatic payment dates.</p>
  <button className={styles.secondaryAction} disabled={pending} type="submit">{pending?"Saving…":"Save pay period"}</button>
  {state.message&&<p role={state.status==="error"?"alert":"status"} className={styles.notice}>{state.message}</p>}
 </form>;
}
