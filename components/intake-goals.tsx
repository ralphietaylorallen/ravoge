"use client";
import { useState } from "react";
import { INTAKE_GOALS, type IntakeContext } from "@/lib/intake-history";
import { poundsInputFromCanonical } from "@/lib/weight-units";
import styles from "./dashboard.module.css";
import local from "./intake-goals.module.css";

export function IntakeGoals({ initialGoal, initial = {}, birthYear, experience, frequency, duration, targetWeightKg, availableDays = 7 }: {
  initialGoal?:string; initial?:Partial<IntakeContext>; birthYear?:number; experience?:string; frequency?:number; duration?:number; targetWeightKg?:number; availableDays?:number;
}) {
  const [goal,setGoal]=useState(INTAKE_GOALS.some(([g])=>g===initialGoal)?initialGoal!:"");
  const [noDeadline,setNoDeadline]=useState(!initial.targetDate);
  return <section className={styles.formSection}>
    <div className={styles.sectionFields}><h3>Your goals</h3><p>Tell us where you want to go.</p>
      <fieldset className={local.goals}><legend>What is your goal? Choose one goal.</legend>
        {INTAKE_GOALS.map(([value,label],index)=><label key={value} className={goal===value?local.selected:undefined}>
          <input type="radio" name="primaryGoal" value={value} required checked={goal===value} onChange={()=>setGoal(value)}/>
          <span aria-hidden="true">{["◎","↗","◇"][index]}</span>{label}
        </label>)}
      </fieldset>
      {goal && <label className={styles.field} key={goal}>{goal==="fat_loss"?"Target weight or another measure of success (optional)":goal==="muscle_gain"?"Overall development or areas you want to develop":"Movements or activities you want to perform more comfortably"}
        <textarea name="goalTarget" maxLength={2000} defaultValue={goal===initialGoal?initial.goalTarget:""}/></label>}
      {goal==="fat_loss" && <label className={styles.field}>Target weight (lb, optional)<input type="number" name="goalWeightLb" min={44} max={1100} step="any" defaultValue={initialGoal==="fat_loss"?poundsInputFromCanonical(targetWeightKg):""}/></label>}
      <div className={styles.formColumns}>
        <label className={styles.field}>Age<input type="number" name="age" min={18} max={110} required defaultValue={initial.age??(birthYear?new Date().getFullYear()-birthYear:"")}/></label>
        <label className={styles.field}>Current weight (lb, optional)<input type="number" name="currentWeightLb" min={44} max={1100} step="any" defaultValue={initial.currentWeightLb??""}/></label>
        <label className={styles.field}>Average workout days per week over the last 6 months<select name="recentWorkoutDays" defaultValue={initial.recentWorkoutDays??""} required><option value="">Choose days</option>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i} days</option>)}</select></label>
        <label className={styles.field}>Days per week training with this gym<select name="trainingFrequencyGoal" defaultValue={frequency??""} required><option value="">Choose days</option>{Array.from({length:Math.max(0,availableDays)},(_,i)=><option key={i+1} value={i+1}>{i+1} {i?"days":"day"}</option>)}</select><span className={styles.formHint}>{availableDays===0?"No training days are currently available. Ask your Owner to review gym opening hours.":"A training preference, not a booking."}</span></label>
        <label className={styles.field}>Strength-training experience<select name="experienceLevel" defaultValue={experience??""} required><option value="">Choose experience</option><option value="beginner">New</option><option value="intermediate">Some</option><option value="advanced">Experienced</option></select></label>
        <label className={styles.field}>Time available per session<select name="sessionDurationMinutes" defaultValue={duration??60}>{[30,45,60,...(duration&&![30,45,60].includes(duration)?[duration]:[])].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
      </div>
      <label className={styles.field}>What would success look like?<textarea name="success" maxLength={2000} defaultValue={initial.success}/></label>
      <label className={local.check}><input type="checkbox" name="noDeadline" checked={noDeadline} onChange={e=>setNoDeadline(e.target.checked)}/>No specific deadline</label>
      {!noDeadline&&<label className={styles.field}>Target date (optional)<input type="date" name="targetDate" defaultValue={initial.targetDate??""}/></label>}
      <h4>Life outside the gym</h4>
      <label className={styles.field}>Other exercise, sports, or physically demanding work<textarea name="outsideActivity" maxLength={2000} defaultValue={initial.outsideActivity}/></label>
      <label className={styles.field}>How often?<input name="outsideFrequency" maxLength={2000} defaultValue={initial.outsideFrequency}/></label>
      <label className={styles.field}>Typical sleep duration (hours, optional)<input type="number" name="sleepHours" min={0} max={24} step="0.5" defaultValue={initial.sleepHours??""}/></label>
      <fieldset className={styles.choiceField}><legend>Main barriers to consistency</legend><div className={styles.choiceGrid}>{["time","travel","discomfort","motivation","other"].map(b=><label key={b}><input type="checkbox" name="barriers" value={b} defaultChecked={initial.barriers?.includes(b)}/>{b.charAt(0).toUpperCase()+b.slice(1)}</label>)}</div></fieldset>
    </div>
  </section>;
}
