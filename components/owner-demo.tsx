"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DemoContext, type DemoAdapter } from "./demo-context";
import { IntakeForm } from "./intake-form";
import { PrescriptionReviewForm } from "./prescription-review-form";
import { ClientWorkoutPlayer } from "./client-workout-player";
import { demoIntake, demoNumber, formValues, newDemoData, sampleExercises, toDemoWorkout, type DemoData } from "@/lib/demo-state";
import { defaultProtocol, protocolsFromForm } from "@/lib/workout-protocol";
import type { AssistedWorkout } from "@/lib/workout-generation";
import type { ExecutionState } from "@/app/coach/workout-actions";
import styles from "./dashboard.module.css";
import local from "./owner-demo.module.css";

type Section="overview"|"assessment"|"workout"|"run"|"history"|"schedule"|"availability"|"profile";
type ExerciseOption={id:string;name:string;default_rep_min:number;default_set_min:number;equipment_requirements?:string[]};
const success=(message:string):ExecutionState=>({status:"success",message});

export function OwnerDemo({storageKey,exerciseOptions=[]}:{storageKey:string;exerciseOptions?:ExerciseOption[]}) {
  const [data,setData]=useState<DemoData>(newDemoData);
  const [role,setRole]=useState<"client"|"coach">("coach");
  const [section,setSection]=useState<Section>("overview");
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [editorKey,setEditorKey]=useState(0);
  const [photo,setPhoto]=useState<string|null>(null);
  const generation=useRef<AbortController|null>(null);
  const resetVersion=useRef(0);
  useEffect(()=>{
    queueMicrotask(()=>{
      try {const raw=localStorage.getItem(storageKey);if(raw){const saved=JSON.parse(raw);if(saved?.version===1&&Array.isArray(saved.spots)&&Array.isArray(saved.history)&&Array.isArray(saved.bookings)&&saved.profiles)setData({...newDemoData(),...saved});}}catch{}
      setReady(true);
    });
    return ()=>generation.current?.abort();
  },[storageKey]);
  useEffect(()=>{if(ready){try{localStorage.setItem(storageKey,JSON.stringify(data));}catch{}}},[data,ready,storageKey]);
  function reset(){generation.current?.abort();generation.current=null;resetVersion.current++;setBusy(false);setData(newDemoData());setPhoto(null);setEditorKey(k=>k+1);setMessage("Demo reset. Real clients, workouts and gym settings were not changed.");setSection("overview");}
  function open(next:Section){setSection(next);setMessage("");}
  const adapter:DemoAdapter={
    intakeValues:data.intake,
    captureIntake:form=>setData(d=>({...d,intake:formValues(form)})),
    saveIntake:async(_state,form)=>{setData(d=>({...d,intake:formValues(form)}));setMessage("Test assessment saved. You can generate a workout now.");return success("Test assessment saved — skipped answers are allowed.");},
    saveSpot:async spot=>{setData(d=>({...d,spots:[...d.spots.filter(s=>s.id!==spot.id),spot]}));return {ok:true,spot};},
    removeSpot:async id=>{setData(d=>({...d,spots:d.spots.filter(s=>s.id!==id)}));return {ok:true,message:"Test spot removed."};},
    approve:async(_state,form)=>{
      const values=formValues(form),get=(key:string,i=0)=>values[key]?.[i]??"";
      const protocols=protocolsFromForm(form,values.libraryExerciseId?.length??0,false);
      const rows=get("libraryExerciseId")?values.libraryExerciseId.slice(0,30).map((id,i)=>{
        const prior=data.draft.find(e=>e.libraryExerciseId===id);
        const protocol=protocols[i]??prior?.protocol??defaultProtocol();
        return {...(prior??sampleExercises()[0]),libraryExerciseId:id,name:exerciseOptions.find(o=>o.id===id)?.name??prior?.name??"Test exercise",
          sets:Math.floor(demoNumber(get("exerciseSets",i),1,1,100)),reps:Math.floor(demoNumber(get("exerciseReps",i),8,1,1000)),load:get("exerciseLoad",i)===""?null:demoNumber(get("exerciseLoad",i),0),loadUnit:"lb",
          restSeconds:demoNumber(get("exerciseRest",i),45,0,1800),notes:get("exerciseNotes",i),reason:get("exerciseReason",i),protocol};
      }):data.draft;
      const title=get("title")||"Test workout",duration=demoNumber(get("estimatedDurationMinutes"),45,1,180);
      const workout=toDemoWorkout(rows.length?rows:sampleExercises(),title,duration,demoIntake(data.intake).goal);
      setData(d=>({...d,draft:rows,title,duration,workout}));setMessage("Assigned to Test Client. Open Client Demo to run it.");return success("Assigned to Client Demo only.");
    },
    session:async(_state,form)=>{
      const finish=form.get("intent")==="finish";
      setData(d=>{if(!d.workout)return d;const workout={...d.workout,status:finish?"completed":"in_progress"};return {...d,workout,history:finish?[...d.history.filter(w=>w.id!==workout.id),workout].slice(-20):d.history};});
      setMessage(finish?"Test workout complete. Results are available in both demo views.":"Test workout started.");return success(finish?"Test workout recorded. Skipped sets stay unrecorded.":"Test workout started.");
    },
    recordSet:async(setId,_state,form)=>{
      const n=(key:string)=>form.get(key)?demoNumber(form.get(key),0):null;
      setData(d=>({...d,workout:d.workout?{...d.workout,exercises:d.workout.exercises.map(e=>({...e,workout_sets:e.workout_sets.map(s=>s.id!==setId?s:{...s,actual_reps:n("reps"),actual_load:n("load"),actual_rpe:n("rpe"),actual_work_seconds:n("seconds"),actual_distance:n("distance"),client_result:String(form.get("result")??"complete"),pain_reported:form.get("pain")==="yes",failure_notes:String(form.get("notes")??""),completed_at:new Date().toISOString()})}))}:null}));
      return success("Test set recorded.");
    },
  };
  async function generate(){
    if(busy)return;const version=resetVersion.current;const controller=new AbortController();generation.current=controller;setBusy(true);setMessage("Generating from this test assessment, your gym programming and verified guidance…");
    try {
      const response=await fetch("/owner/demo/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),signal:controller.signal});
      const result=await response.json() as {workout?:AssistedWorkout;message?:string;assumptions?:string[];sources?:{title:string;url:string}[];percentage?:number|null};
      if(version!==resetVersion.current)return;
      if(!response.ok||!result.workout)throw new Error(result.message??"Generation could not finish.");
      const workout=result.workout;
      setData(d=>({...d,draft:workout.exercises,title:workout.title,duration:workout.durationMinutes,generation:{kind:"openai",rationale:workout.rationale,assumptions:result.assumptions??[],sources:result.sources??[],percentage:result.percentage??null}}));
      setEditorKey(k=>k+1);setSection("workout");setMessage("AI draft ready. Edit it, assign to Test Client, then run it.");
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Generation could not finish. Your test data is preserved.");}
    finally{if(version===resetVersion.current){setBusy(false);generation.current=null;}}
  }
  function loadSample(){setData(d=>({...d,draft:sampleExercises(),title:"Sample button-testing workout",duration:20,generation:{kind:"sample",rationale:"Sample only — this workout was not generated from your intake. Generate with AI to test personalized programming.",assumptions:[],sources:[],percentage:null}}));setEditorKey(k=>k+1);setSection("workout");setMessage("Loaded a sample for button testing.");}
  function quickRun(){setData(d=>({...d,workout:toDemoWorkout(d.draft.length?d.draft:sampleExercises(),d.draft.length?d.title:"Sample button-testing workout",d.duration,demoIntake(d.intake).goal)}));setRole("client");setSection("run");setMessage("TEST workout opened. You can skip sets and finish at any time.");}
  const tabs:Section[]=role==="coach"?["overview","assessment","workout","run","history","schedule","availability","profile"]:["overview","assessment","run","history","schedule","profile"];
  const labels:Record<Section,string>={overview:role==="coach"?"Test client":"Workouts",assessment:"Assessment",workout:"Build / review workout",run:"Run workout",history:"Results & history",schedule:role==="coach"?"Schedule":"Book / schedule",availability:"Availability",profile:"Profile"};
  const scalar=(key:string)=>data.intake[key]?.[0];
  const num=(key:string)=>scalar(key)?Number(scalar(key)):undefined;
  const defaults={primary_goal:scalar("primaryGoal"),experience_level:scalar("experienceLevel"),training_frequency_goal:num("trainingFrequencyGoal"),session_duration_minutes:num("sessionDurationMinutes"),training_years:num("trainingYears"),
    custom_fields:{intakeContext:{...demoIntake(data.intake).context,age:num("age")??null,recentWorkoutDays:num("recentWorkoutDays")??null}},preferred_training_days:data.intake.preferredTrainingDays,
    current_injuries:scalar("currentInjuries"),movement_limitations:scalar("movementLimitations"),coach_notes:scalar("coachNotes"),sleep_quality:num("sleepQuality"),stress_level:num("stressLevel"),recovery_perception:num("recoveryPerception"),soreness_fatigue:num("sorenessFatigue")};
  const options=[...exerciseOptions,...data.draft.filter(e=>!exerciseOptions.some(o=>o.id===e.libraryExerciseId)).map(e=>({id:e.libraryExerciseId,name:e.name,default_rep_min:8,default_set_min:1}))];
  if(!ready)return <p role="status">Opening Owner Demo…</p>;
  return <DemoContext.Provider value={adapter}><div className={local.root}>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Owner workspace</p><h1>Demo</h1></div><button className={styles.secondaryAction} type="button" onClick={reset}>Reset demo</button></div>
    <div className={local.banner}><strong>TEST MODE</strong><span>Test Client and Test Coach share this demo. Skip any step. Changes stay in this browser’s Owner demo; no real clients, bookings, emails or gym records are changed.</span></div>
    <div className={local.roleSwitch} role="group" aria-label="Demo view"><button type="button" aria-pressed={role==="client"} onClick={()=>{setRole("client");setSection("overview");}}>Client Demo</button><button type="button" aria-pressed={role==="coach"} onClick={()=>{setRole("coach");setSection("overview");}}>Coach Demo</button></div>
    <nav className={local.tabs} aria-label={`${role} demo sections`}>{tabs.map(t=><button type="button" key={t} aria-current={section===t?"page":undefined} onClick={()=>open(t)}>{labels[t]}</button>)}</nav>
    {message&&<p className={styles.notice} role="status">{message}</p>}
    {busy&&<button className={styles.secondaryAction} type="button" onClick={()=>{generation.current?.abort();setBusy(false);setMessage("Generation cancelled. Your assessment is preserved.");}}>Cancel generation</button>}
    {section==="overview"&&<><section className={styles.operationCard}><p className={styles.eyebrow}>TEST · {role==="coach"?"Coach view":"Client view"}</p><h2>{data.profiles.client.name} · Test</h2><p>Assigned to {data.profiles.coach.name}. Complete an assessment, generate a personalized test workout, then switch views to run it.</p><div className={local.actions}><button className={styles.action} type="button" onClick={()=>open("assessment")}>Start assessment</button><button className={styles.action} disabled={busy} type="button" onClick={generate}>Generate with AI</button><button className={styles.secondaryAction} type="button" onClick={quickRun}>Skip straight to workout</button></div></section>
      <section className={styles.operationCard}><h3>Today’s test workout</h3><p>{data.workout?`${data.workout.title} · ${data.workout.status.replaceAll("_"," ")}`:"No test workout assigned yet."}</p><div className={local.actions}><button className={styles.secondaryAction} type="button" onClick={()=>open("run")}>Open workout</button><button className={styles.secondaryAction} type="button" onClick={()=>open("schedule")}>Book a test session</button><button className={styles.secondaryAction} type="button" onClick={()=>open("history")}>View results</button></div></section></>}
    {section==="assessment"&&<><IntakeForm clientId="owner-demo" defaults={defaults} injurySpots={data.spots}/><div className={local.actions}><button className={styles.action} type="button" disabled={busy} onClick={generate}>Generate with AI from this assessment</button><button className={styles.secondaryAction} type="button" onClick={()=>{setRole("coach");open("workout");}}>Skip to workout builder</button></div></>}
    {section==="workout"&&<><section className={styles.operationCard}><h2>Coach Demo · Workout builder</h2><p>AI generation uses the entered age, goal, assessment, injury history and this gym’s eligible programming. Skipped generation inputs use the sample assumptions listed below. AI and evidence validation remain active.</p><div className={local.actions}><button className={styles.action} type="button" disabled={busy} onClick={generate}>Generate with AI</button><button className={styles.secondaryAction} type="button" onClick={loadSample}>New manual / sample workout</button><button className={styles.secondaryAction} type="button" onClick={quickRun}>Skip approval and run</button></div>
      {!!data.draft.length&&<><p><strong>{data.generation.kind==="openai"?"AI generated from test intake":"Sample — button testing only"}</strong></p><p>{data.generation.rationale}</p>{data.generation.percentage!==null&&<p>Gym-library work: {data.generation.percentage}%</p>}{!!data.generation.assumptions.length&&<details open><summary>Sample assumptions for skipped answers</summary><ul>{data.generation.assumptions.map(a=><li key={a}>{a}</li>)}</ul></details>}{!!data.generation.sources.length&&<details><summary>Retrieved exercise guidance</summary><ul>{data.generation.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul></details>}</>}
      </section>{data.draft.length>0&&<PrescriptionReviewForm key={editorKey} clientId="owner-demo" prescriptionId="owner-demo" exercises={data.draft} exerciseOptions={options} title={data.title} duration={data.duration} scheduledDate={new Date().toISOString().slice(0,10)} quality/>}</>}
    {section==="run"&&<>{!data.workout?<section className={styles.operationCard}><h2>Run a test workout</h2><div className={local.actions}><button className={styles.action} type="button" disabled={busy} onClick={generate}>Generate from assessment</button><button className={styles.secondaryAction} type="button" onClick={quickRun}>Skip to sample workout</button></div></section>:<><section className={styles.operationCard}><h2>{role==="coach"?"Coach Demo":"Client Demo"} · Test workout</h2><p>Use the real workout player below. You can start, record complete/modified/missed sets, try timers, report pain, or finish without filling everything in.</p><div className={local.actions}><button type="button" className={styles.secondaryAction} onClick={()=>setData(d=>({...d,workout:d.workout?{...d.workout,status:"assigned"}:null}))}>Reopen test workout</button></div><form className={styles.form} noValidate onSubmit={e=>{e.preventDefault();const readiness=Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>;setData(d=>({...d,readiness}));setMessage("Test readiness saved.");}}><h3>Pre-workout check-in</h3><div className={styles.threeColumns}>{["Energy","Sleep quality","Physical comfort / recovery","Manageable stress","Readiness to train"].map(n=><label className={styles.field} key={n}>{n}<select name={n} defaultValue={data.readiness[n]??""}><option value="">Skip</option>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select></label>)}</div><button className={styles.secondaryAction}>Save test check-in</button></form></section>
      <ClientWorkoutPlayer key={data.workout.id} workoutId={data.workout.id} title={data.workout.title} goal={data.workout.goal} duration={data.workout.duration} status={data.workout.status} exercises={data.workout.exercises} role={role}/>
      {role==="coach"&&<form className={styles.operationCard} noValidate onSubmit={e=>{e.preventDefault();const coachNotes=String(new FormData(e.currentTarget).get("notes")??"");setData(d=>({...d,coachNotes}));setMessage("Test coach notes saved.");}}><label className={styles.field}>Coach session notes<textarea name="notes" defaultValue={data.coachNotes}/></label><button className={styles.secondaryAction}>Save test coach notes</button></form>}</>}</>}
    {section==="history"&&<section className={styles.operationCard}><h2>Test results &amp; history</h2><p>Recorded demo results are shared between Client Demo and Coach Demo and supplied as history for later demo generation.</p>{!data.history.length?<p>Complete a test workout to see results.</p>:data.history.map(w=><details key={w.id} open><summary>{w.title} · {w.status}</summary>{w.exercises.map(e=><div key={e.id}><h3>{e.exercise_name}</h3><ul>{e.workout_sets.map(s=><li key={s.id}>Set {s.set_number}: {s.client_result??"Skipped / not recorded"}{s.actual_reps!==null?` · ${s.actual_reps} reps`:""}{s.actual_load!==null?` · ${s.actual_load} lb`:""}{s.pain_reported?" · Pain reported":""}{s.failure_notes?` · ${s.failure_notes}`:""}</li>)}</ul></div>)}</details>)}<button className={styles.action} type="button" disabled={busy} onClick={generate}>Generate next test workout</button></section>}
    {section==="schedule"&&<section className={styles.operationCard}><h2>{role==="coach"?"Coach Demo · Schedule":"Client Demo · Book a session"}</h2><p>Test bookings only. No real slots are reserved and no notifications are sent.</p><form className={styles.form} noValidate onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setData(d=>({...d,bookings:[...d.bookings,{id:crypto.randomUUID(),date:String(f.get("date")||new Date().toISOString().slice(0,10)),time:String(f.get("time")||"09:00"),status:"scheduled",notes:String(f.get("notes")??"")}]}));setMessage("Test session booked in both demo views.");}}><div className={styles.formColumns}><label className={styles.field}>Session date<input name="date" type="date"/></label><label className={styles.field}>Session time<input name="time" type="time"/></label></div><label className={styles.field}>Session type<select name="kind"><option>Training</option><option>Intake assessment</option></select></label><label className={styles.field}>Notes<input name="notes"/></label><button className={styles.action}>Book test session</button></form><ul className={styles.list}>{data.bookings.map(b=><li key={b.id}><span>{b.date} · {b.time} · {b.status}{b.notes?` · ${b.notes}`:""}</span><div className={local.actions}><button className={styles.secondaryAction} type="button" onClick={()=>setData(d=>({...d,bookings:d.bookings.map(x=>x.id===b.id?{...x,status:"cancelled"}:x)}))}>Cancel test session</button>{role==="coach"&&<button className={styles.secondaryAction} type="button" onClick={()=>setData(d=>({...d,bookings:d.bookings.map(x=>x.id===b.id?{...x,status:"completed"}:x)}))}>Mark completed</button>}</div></li>)}</ul></section>}
    {section==="availability"&&<section className={styles.operationCard}><h2>Test Coach · Availability</h2><form noValidate className={styles.form} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setData(d=>({...d,availability:f.getAll("days").map(String)}));setMessage("Test availability saved. Real gym availability is unchanged.");}}><fieldset className={styles.choiceField}><legend>Available days</legend><div className={styles.choiceGrid}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=><label key={day}><input type="checkbox" name="days" value={day} defaultChecked={data.availability.includes(day)}/>{day}</label>)}</div></fieldset><button className={styles.action}>Save test availability</button></form></section>}
    {section==="profile"&&<section className={styles.operationCard}><h2>{role==="coach"?"Test Coach":"Test Client"} · Profile</h2><form className={styles.form} noValidate key={role} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setData(d=>({...d,profiles:{...d.profiles,[role]:{name:String(f.get("name")||`Test ${role}`),bio:String(f.get("bio")??"")}}}));setMessage("Test profile saved. Your real account is unchanged.");}}><label className={styles.field}>Name<input name="name" defaultValue={data.profiles[role].name}/></label><label className={styles.field}>About<textarea name="bio" defaultValue={data.profiles[role].bio}/></label><label className={styles.field}>Try profile photo<input type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2000000){setMessage("Choose an image under 2 MB for the demo preview.");return;}const reader=new FileReader();reader.onload=()=>setPhoto(String(reader.result));reader.readAsDataURL(file);}}/></label>{photo&&<Image src={photo} alt="Test profile preview" width={100} height={100} unoptimized className={local.photo}/>}<button className={styles.action}>Save test profile</button></form></section>}
  </div></DemoContext.Provider>;
}
