"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import styles from "./dashboard.module.css";

export function TrainSessionForm({clientId,hasIntake,intakeReviewRequired=false}:{clientId:string;hasIntake:boolean;intakeReviewRequired?:boolean}) {
  const router=useRouter();const [pending,setPending]=useState(false);const [message,setMessage]=useState("");
  const [pain,setPain]=useState("");const [comfort,setComfort]=useState("");
  const reviewPain=pain.trim().length>0||!!comfort&&Number(comfort)<=2;
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(pending)return;const form=new FormData(event.currentTarget);setPending(true);setMessage("");
    try{const response=await fetch(`/api/coach/clients/${clientId}/workouts/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({readiness:Array.from({length:5},(_,i)=>Number(form.get(`readiness-${i+1}`))),painNote:pain,painReviewed:form.get("painReviewed")==="on",intakeReviewed:form.get("intakeReviewed")==="on"})});
      const result=await response.json();if(!response.ok||!result.url){setMessage(result.error??"Workout could not be generated. Try again.");return;}router.push(result.url);
    }catch{setMessage("Connection interrupted. Your answers are still here.");}finally{setPending(false);}
  }
  return <section id="train-session" className={styles.operationCard}><h3>Train today</h3>{hasIntake?<form className={styles.form} onSubmit={submit} aria-label="Train today — five questions"><p className={styles.formHint}>1 · Low / poor &nbsp; 5 · High / good</p><div className={styles.formColumns}>{["Energy","Sleep quality","Physical comfort / recovery","Manageable stress","Readiness to train"].map((q,i)=><label key={q} className={styles.field}>{q}<select name={`readiness-${i+1}`} required defaultValue="" onChange={i===2?e=>setComfort(e.target.value):undefined}><option value="">Choose</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>)}</div><details><summary>Pain or changes today?</summary><label className={styles.field}>Pain or injury update<textarea name="painNote" value={pain} maxLength={1000} onChange={e=>setPain(e.target.value)}/></label></details>{reviewPain&&<label className={styles.checkboxLabel}><input type="checkbox" name="painReviewed" required/>I reviewed today’s discomfort and updated any needed intake restrictions.</label>}{intakeReviewRequired&&<label className={styles.checkboxLabel}><input type="checkbox" name="intakeReviewed" required/>I reviewed the updated intake and its restrictions. <a href={`/coach/clients/${clientId}?tab=intake`}>View intake</a></label>}<button className={styles.action} disabled={pending}>{pending?"Generating workout…":"Generate workout"}</button>{pending&&<p role="status">Generating…</p>}{message&&<p className={styles.notice} role="alert">{message}</p>}</form>:<p>Complete the first intake to begin.</p>}</section>;
}
