"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { saveClientIntakeAction } from "@/app/coach/actions";

import { poundsInputFromCanonical } from "@/lib/weight-units";
import { IntakeGoals } from "./intake-goals";
import { InjuryMap } from "./injury-map";
import { useDemo } from "./demo-context";
import type { InjurySpot, IntakeContext } from "@/lib/intake-history";
import type { StrengthAnchor } from "@/lib/starting-load";
import styles from "./dashboard.module.css";

type IntakeDefaults = Partial<{
  custom_fields: { intakeContext?: IntakeContext; trainingFocus?: string; strengthAnchors?: Record<string, StrengthAnchor>; bodyCompositionGoals?: { weightKg?: number; bodyFatPercentage?: number; skeletalMuscleMassKg?: number } };
  avoided_exercises: string[];
  birth_year: number;
  coach_notes: string;
  conditioning_baseline: number;
  constraint_tags: string[];
  current_injuries: string;
  experience_level: string;
  medical_coach_notes: string;
  mobility_baseline: number;
  movement_limitations: string;
  movements_to_avoid: string[];
  pain_areas: string[];
  preferred_exercises: string[];
  preferred_training_days: string[];
  primary_goal: string;
  recent_consistency: string;
  recovery_perception: number;
  secondary_goal: string;
  session_duration_minutes: number;
  sleep_quality: number;
  soreness_fatigue: number;
  strength_baseline: number;
  stress_level: number;
  training_frequency_goal: number;
  training_years: number;
}>;

const constraints = [
  ["knee_flexion", "Knee flexion"], ["hinge", "Hip hinge"],
  ["axial_load", "Axial loading"], ["horizontal_push", "Horizontal pressing"],
  ["vertical_push", "Overhead pressing"], ["impact", "Impact"],
  ["balance", "Balance"], ["conditioning", "Conditioning"],
];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function StrengthTestFields({ kind, label, optional = false, initial }: { kind: string; label: string; optional?: boolean; initial?: StrengthAnchor }) {
  const demo=useDemo();
  const stored=demo?.intakeValues;
  const [method, setMethod] = useState(stored?.[optional?`${kind}Method`:`${kind}OneRmMethod`]?.[0] ?? initial?.method ?? (optional ? "not_tested" : "tested"));
  const methodName = optional ? `${kind}Method` : `${kind}OneRmMethod`;
  return <>
    <label className={styles.field}>{label} 1RM method<select id={methodName} name={methodName} value={method} onChange={event => setMethod(event.target.value)}><option value="not_tested">Not tested — no safe measured anchor</option><option value="tested">Tested</option><option value="estimated">Estimated from measured work</option></select></label>
    <fieldset disabled={method === "not_tested"} className={styles.threeColumns}>
      <label className={styles.field}>{label} load (lb)<input id={`${kind}LoadLb`} name={`${kind}LoadLb`} type="number" min={0} step="any" defaultValue={stored?.[`${kind}LoadLb`]?.[0] ?? poundsInputFromCanonical(initial?.loadKg)} required/></label>
      <label className={styles.field}>Reps<input id={`${kind}Reps`} name={`${kind}Reps`} type="number" min={1} max={30} defaultValue={stored?.[`${kind}Reps`]?.[0] ?? initial?.reps ?? ""} required/></label>
      <label className={styles.field}>1RM (lb)<input id={`${kind}OneRmLb`} name={`${kind}OneRmLb`} type="number" min={0} step="any" defaultValue={stored?.[`${kind}OneRmLb`]?.[0] ?? poundsInputFromCanonical(initial?.oneRmKg)} required/></label>
    </fieldset>
  </>;
}

function ScaleSelect({ defaultValue, id, label, required = true }: { defaultValue?: number; id: string; label: string; required?: boolean }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select defaultValue={defaultValue ?? ""} id={id} name={id} required={required}>
        <option disabled value="">Choose 1–5</option>
        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
  );
}

export function IntakeForm({ clientId, defaults = {}, checkin, injurySpots = [], availableDays = 7 }: { clientId: string; defaults?: IntakeDefaults; checkin?: ReactNode; injurySpots?: InjurySpot[]; availableDays?:number }) {
  const demo=useDemo();
  const [step,setStep]=useState(0);
  const [tests,setTests]=useState<{rower:boolean;versa:boolean}>({rower:!demo?.intakeValues.versaDurationSeconds || !!demo?.intakeValues.rowerDistanceM,versa:!!demo?.intakeValues.versaDurationSeconds});
  const [review,setReview]=useState<[string,string][]>([]);
  const formRef=useRef<HTMLFormElement>(null);
  const restored=useRef(false);
  useEffect(()=>{
    if(!demo||restored.current||!formRef.current)return;
    restored.current=true;
    for(const element of formRef.current.elements){
      if(!(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement))continue;
      const values=demo.intakeValues[element.name];if(!values)continue;
      if(element instanceof HTMLInputElement&&(element.type==="checkbox"||element.type==="radio"))element.checked=values.includes(element.value);
      else element.value=values[0]??"";
    }
  },[demo]);
  const steps=["Your goals","Body map","Movement review","Strength tests","Conditioning","InBody","Review & save"];
  function go(next:number) { if(next===6&&formRef.current) setReview([...new FormData(formRef.current).entries()].filter(([key,value])=>typeof value==="string"&&value!==""&&!key.startsWith("$")).map(([key,value])=>[key,String(value)])); setStep(next); }
  function validate(event:React.FormEvent<HTMLFormElement>) { if(!demo&&!event.currentTarget.checkValidity()){ event.preventDefault(); const invalid=event.currentTarget.querySelector(":invalid") as HTMLInputElement|null; const container=invalid?.closest("[data-step]") as HTMLElement|null; if(container) setStep(Number(container.dataset.step)); requestAnimationFrame(()=>invalid?.reportValidity()); } }
  const saveForClient = demo?.saveIntake ?? saveClientIntakeAction.bind(null, clientId);
  const [state, action, pending] = useActionState(saveForClient, { status: "idle" as const });
  const [inbodyStatus, setInbodyStatus] = useState(demo?.intakeValues.inbodyStatus?.[0] ?? "pending");
  return (
    <>{demo&&<p className={styles.notice}>TEST assessment — every step is optional. Jump between steps or skip ahead. Changes stay in this Owner demo.</p>}<nav aria-label="Intake steps" className={styles.intakeSteps}>{steps.map((label,index)=><button aria-current={step===index?"step":undefined} key={label} onClick={()=>go(index)} type="button"><span>{index+1}</span>{label}</button>)}</nav>{step===2&&checkin}<form action={action} className={styles.intakeForm} noValidate onSubmit={validate} onChange={demo?event=>demo.captureIntake(new FormData(event.currentTarget)):undefined} ref={formRef}>
      <div data-step={0} hidden={step!==0}>
        <IntakeGoals initialGoal={defaults.primary_goal} initial={defaults.custom_fields?.intakeContext} birthYear={defaults.birth_year} experience={defaults.experience_level} frequency={defaults.training_frequency_goal} duration={defaults.session_duration_minutes} targetWeightKg={defaults.custom_fields?.bodyCompositionGoals?.weightKg} availableDays={availableDays}/>
        <div className={styles.sectionFields}>
          <label className={styles.field}>Years strength training (optional)<input defaultValue={defaults.training_years} name="trainingYears" min={0} max={80} step="0.5" type="number"/></label>
          <fieldset className={styles.choiceField}><legend>Preferred training days</legend><div className={styles.choiceGrid}>{days.map((day) => <label key={day}><input defaultChecked={defaults.preferred_training_days?.includes(day)} name="preferredTrainingDays" type="checkbox" value={day} />{day.slice(0, 3)}</label>)}</div></fieldset>
        </div>
      </div>
      <div data-step={1} hidden={step!==1}><InjuryMap clientId={clientId} initialSpots={injurySpots} noInjuryReport={defaults.custom_fields?.intakeContext?.noInjuryReport}/></div>

      <details className={styles.formSection} data-step={2} hidden={step!==2} open>
        <summary><span>03</span> Limitations &amp; movement</summary>
        <div className={styles.sectionFields}>
          <div className={styles.field}><label htmlFor="currentInjuries">Current injuries</label><textarea defaultValue={defaults.current_injuries} id="currentInjuries" maxLength={4000} name="currentInjuries" rows={3} /></div>
          <div className={styles.field}><label htmlFor="movementLimitations">Movement limitations</label><textarea defaultValue={defaults.movement_limitations} id="movementLimitations" maxLength={4000} name="movementLimitations" rows={3} /></div>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="painAreas">Pain areas <span>comma separated</span></label><input defaultValue={defaults.pain_areas?.join(", ")} id="painAreas" name="painAreas" /></div>
            <div className={styles.field}><label htmlFor="movementsToAvoid">Movements to avoid <span>comma separated</span></label><input defaultValue={defaults.movements_to_avoid?.join(", ")} id="movementsToAvoid" name="movementsToAvoid" /></div>
          </div>
          <fieldset className={styles.choiceField}><legend>Structured movement constraints</legend><div className={styles.choiceGrid}>{constraints.map(([value, label]) => <label key={value}><input defaultChecked={defaults.constraint_tags?.includes(value)} name="constraintTags" type="checkbox" value={value} />{label}</label>)}</div></fieldset>
          <div className={styles.field}><label htmlFor="medicalCoachNotes">Relevant medical / coach notes</label><textarea defaultValue={defaults.medical_coach_notes} id="medicalCoachNotes" maxLength={4000} name="medicalCoachNotes" rows={3} /></div>
        </div>
      </details>

      <details className={styles.formSection} data-step={0} hidden={step!==0} open>
        <summary><span>04</span> Baseline &amp; recovery</summary>
        <div className={styles.sectionFields}>
          <p className={styles.formHint}>Baseline scores are optional. Leaving them blank intentionally lowers state confidence.</p>
          <div className={styles.threeColumns}>
            <ScaleSelect defaultValue={defaults.strength_baseline} id="strengthBaseline" label="Strength baseline" required={false} />
            <ScaleSelect defaultValue={defaults.conditioning_baseline} id="conditioningBaseline" label="Conditioning baseline" required={false} />
            <ScaleSelect defaultValue={defaults.mobility_baseline} id="mobilityBaseline" label="Mobility baseline" required={false} />
          </div>
          <div className={styles.threeColumns}>
            <ScaleSelect defaultValue={defaults.sleep_quality} id="sleepQuality" label="Sleep quality" />
            <ScaleSelect defaultValue={defaults.stress_level} id="stressLevel" label="Stress level" />
            <ScaleSelect defaultValue={defaults.recovery_perception} id="recoveryPerception" label="Perceived recovery" />
          </div>
          <ScaleSelect defaultValue={defaults.soreness_fatigue} id="sorenessFatigue" label="Soreness / fatigue" />
        </div>
      </details>

      <details className={styles.formSection} data-step={0} hidden={step!==0} open>
        <summary><span>05</span> Preferences &amp; notes</summary>
        <div className={styles.sectionFields}>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="preferredExercises">Preferred exercises <span>comma separated</span></label><input defaultValue={defaults.preferred_exercises?.join(", ")} id="preferredExercises" name="preferredExercises" /></div>
            <div className={styles.field}><label htmlFor="avoidedExercises">Avoided exercises <span>comma separated</span></label><input defaultValue={defaults.avoided_exercises?.join(", ")} id="avoidedExercises" name="avoidedExercises" /></div>
          </div>
          <div className={styles.field}><label htmlFor="coachNotes">Other coach notes</label><textarea defaultValue={defaults.coach_notes} id="coachNotes" maxLength={4000} name="coachNotes" rows={3} /></div>
        </div>
      </details>

      <details className={styles.formSection} data-step={3} hidden={step!==3} open>
        <summary><span>02</span> Measured strength baseline</summary>
        <div className={styles.sectionFields}>
          <p className={styles.formHint}>Record measured values in pounds (lb). Mark each 1RM as tested or estimated; do not fabricate a test.</p>
          <div className={styles.formColumns}><div className={styles.field}><label htmlFor="squatVariation">Squat variation</label><select id="squatVariation" name="squatVariation" required><option value="back_squat">Back Squat</option><option value="front_squat">Front Squat</option><option value="goblet_squat">Goblet Squat</option><option value="other">Other</option></select></div><div className={styles.field}><label htmlFor="squatOtherVariation">Other variation <span>when selected</span></label><input id="squatOtherVariation" maxLength={120} name="squatOtherVariation" /></div></div>
          <StrengthTestFields kind="squat" label="Squat"/>
          <label className={styles.field}>Squat notes <input id="squatNotes" name="squatNotes" maxLength={1000}/></label>
          <div className={styles.field}><label htmlFor="benchVariation">Bench variation</label><input defaultValue="Barbell Bench Press" id="benchVariation" maxLength={120} name="benchVariation" required /></div>
          <StrengthTestFields kind="bench" label="Bench"/>
          <label className={styles.field}>Bench notes <input id="benchNotes" name="benchNotes" maxLength={1000}/></label>
          <details><summary>Optional measured deadlift and overhead press anchors</summary>
            <p>Not tested is valid. Never infer these values from a different movement.</p>
            <label className={styles.field}>Deadlift variation<select name="deadliftVariation" defaultValue={defaults.custom_fields?.strengthAnchors?.deadlift?.variation ?? "deadlift"}><option value="deadlift">Deadlift</option><option value="romanian_deadlift">Romanian deadlift</option></select></label>
            <StrengthTestFields kind="deadlift" label="Deadlift" optional initial={defaults.custom_fields?.strengthAnchors?.deadlift}/>
            <input type="hidden" name="overhead_pressVariation" value="overhead_press"/>
            <StrengthTestFields kind="overhead_press" label="Overhead press" optional initial={defaults.custom_fields?.strengthAnchors?.overhead_press}/>
          </details>
          <div className={styles.threeColumns}><div className={styles.field}><label htmlFor="pullupStrictReps">Strict pull-ups</label><input id="pullupStrictReps" max={100} min={0} name="pullupStrictReps" required type="number" /></div><div className={styles.field}><label htmlFor="pullupMode">Pull-up mode</label><select id="pullupMode" name="pullupMode"><option value="bodyweight">Bodyweight</option><option value="assisted">Assisted</option><option value="weighted">Weighted</option></select></div><div className={styles.field}><label htmlFor="pullupAdjustmentLb">Assistance / added weight (lb) <span>if applicable</span></label><input id="pullupAdjustmentLb" min={0} name="pullupAdjustmentLb" step="0.01" type="number" /></div></div>
          <div className={styles.field}><label htmlFor="pullupNotes">Pull-up notes <span>optional</span></label><input id="pullupNotes" maxLength={1000} name="pullupNotes" /></div>
        </div>
      </details>

      <details className={styles.formSection} data-step={4} hidden={step!==4} open>
        <summary><span>03</span> Conditioning baseline</summary>
        <div className={styles.sectionFields}><p className={styles.formHint}>Complete at least one test. Both may be recorded.</p>
          <div className={styles.choiceGrid}><label><input checked={tests.rower} onChange={event=>setTests({...tests,rower:event.target.checked})} type="checkbox"/>Rower</label><label><input checked={tests.versa} onChange={event=>setTests({...tests,versa:event.target.checked})} type="checkbox"/>Versa Climber</label></div><fieldset className={styles.conditioningTest} disabled={!tests.rower} hidden={!tests.rower}><legend>Rower</legend><div className={styles.threeColumns}><div className={styles.field}><label htmlFor="rowerDistanceM">Distance (m)</label><input id="rowerDistanceM" min={1} name="rowerDistanceM" type="number" /></div><div className={styles.field}><label htmlFor="rowerTimeSeconds">Time (seconds)</label><input id="rowerTimeSeconds" min={1} name="rowerTimeSeconds" type="number" /></div><div className={styles.field}><label htmlFor="rowerCalories">Calories <span>optional</span></label><input id="rowerCalories" min={0} name="rowerCalories" type="number" /></div></div>
          <div className={styles.threeColumns}><div className={styles.field}><label htmlFor="rowerPaceSecondsPer500m">Average pace (sec/500m) <span>optional</span></label><input id="rowerPaceSecondsPer500m" min={1} name="rowerPaceSecondsPer500m" step="0.01" type="number" /></div><div className={styles.field}><label htmlFor="rowerAverageHeartRate">Average HR <span>optional</span></label><input id="rowerAverageHeartRate" min={30} name="rowerAverageHeartRate" type="number" /></div><div className={styles.field}><label htmlFor="rowerNotes">Notes <span>optional</span></label><input id="rowerNotes" maxLength={1000} name="rowerNotes" /></div></div>
          </fieldset><fieldset className={styles.conditioningTest} disabled={!tests.versa} hidden={!tests.versa}><legend>Versa Climber</legend><div className={styles.threeColumns}><div className={styles.field}><label htmlFor="versaDurationSeconds">Duration (seconds)</label><input id="versaDurationSeconds" min={1} name="versaDurationSeconds" type="number" /></div><div className={styles.field}><label htmlFor="versaFeet">Feet climbed / output</label><input id="versaFeet" min={1} name="versaFeet" type="number" /></div><div className={styles.field}><label htmlFor="versaCalories">Calories <span>optional</span></label><input id="versaCalories" min={0} name="versaCalories" type="number" /></div></div>
          <div className={styles.formColumns}><div className={styles.field}><label htmlFor="versaAverageHeartRate">Average HR <span>optional</span></label><input id="versaAverageHeartRate" min={30} name="versaAverageHeartRate" type="number" /></div><div className={styles.field}><label htmlFor="versaNotes">Notes <span>optional</span></label><input id="versaNotes" maxLength={1000} name="versaNotes" /></div></div></fieldset>
        </div>
      </details>

      <details className={styles.formSection} data-step={5} hidden={step!==5} open>
        <summary><span>04</span> InBody baseline</summary>
        <div className={styles.sectionFields}><div className={styles.field}><label htmlFor="inbodyStatus">Assessment status</label><select id="inbodyStatus" name="inbodyStatus" onChange={(event) => setInbodyStatus(event.target.value)} value={inbodyStatus}><option value="pending">Pending InBody — baseline incomplete</option><option value="completed">Completed InBody</option></select></div>
          {inbodyStatus === "completed" && <><div className={styles.field}><label htmlFor="inbodyTestDate">Test date</label><input id="inbodyTestDate" name="inbodyTestDate" required type="date" /></div><div className={styles.threeColumns}>{[["weightLb","Current weight (lb)"],["bodyFatPercentage","Current percent body fat (%)"],["skeletalMuscleMassLb","Current skeletal muscle mass (lb)"],["inbodyScore","InBody Score (optional)"],["bodyFatMassLb","Body fat mass (lb, optional)"],["bmi","BMI (optional)"],["visceralFatLevel","Visceral fat level (optional)"],["ecwTbw","ECW/TBW (optional)"],["bmrKcal","BMR (kcal, optional)"]].map(([key, label]) => <div className={styles.field} key={key}><label htmlFor={key}>{label}</label><input id={key} min={0} name={key} required={["weightLb", "bodyFatPercentage", "skeletalMuscleMassLb"].includes(key)} step={key === "bmrKcal" ? "1" : "0.001"} type="number" /></div>)}</div></>}
        </div>
      </details>

      <details className={styles.formSection} data-step={5} hidden={step!==5} open>
        <summary>Body-composition goals · optional</summary>
        <div className={styles.sectionFields}><p className={styles.formHint}>Targets are optional. Skeletal muscle mass is a weight measurement, not a percentage. Current measurements above are saved as a new assessment; earlier measurements are preserved.</p>
          <div className={styles.threeColumns}>
            <div className={styles.field}><label htmlFor="goalBodyFatPercentage">Goal body-fat percentage (%)</label><input defaultValue={defaults.custom_fields?.bodyCompositionGoals?.bodyFatPercentage} id="goalBodyFatPercentage" min={0} max={75} name="goalBodyFatPercentage" step="0.01" type="number" /></div>
            <div className={styles.field}><label htmlFor="goalSkeletalMuscleMassLb">Goal skeletal muscle mass (lb)</label><input defaultValue={poundsInputFromCanonical(defaults.custom_fields?.bodyCompositionGoals?.skeletalMuscleMassKg)} id="goalSkeletalMuscleMassLb" min={0.01} max={440.92452437} name="goalSkeletalMuscleMassLb" step="any" type="number" /></div>
          </div>
        </div>
      </details>

      {step===6&&<section className={styles.operationCard}><h3>Review your evaluation</h3><p className={styles.formHint}>Measurements use pounds (lb). Saving creates a new baseline version and preserves earlier assessments. Body-map spots are saved individually.</p><dl className={styles.reviewValues}>{review.map(([key,value])=><div key={key+value}><dt>{key.replace(/Lb$/, " (lb)").replace(/([A-Z])/g," $1")}</dt><dd>{value.replaceAll("_"," ")}</dd></div>)}</dl></section>}
      <div className={styles.stepActions}>{step>0&&<button className={styles.secondaryAction} onClick={()=>go(step-1)} type="button">← Back</button>}{step<6&&<button className={styles.action} onClick={()=>go(step+1)} type="button">Continue →</button>}{demo&&step<6&&<button className={styles.secondaryAction} type="button" onClick={()=>go(6)}>Skip to review</button>}</div>
      <button className={styles.action} hidden={step!==6} disabled={pending} type="submit">{pending ? "Saving intake…" : "Save intake"}</button>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    </form></>
  );
}
