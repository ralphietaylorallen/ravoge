"use client";
import {useEffect,useState,useTransition} from "react";
import {previewAnnouncementAction,queueAnnouncementAction,resumeAnnouncementQueueAction,refreshAnnouncementAction,retryAnnouncementFailuresAction,refreshAnnouncementDeliveryAction,checkAnnouncementTransportAction,type AnnouncementState} from "@/app/owner/announcements/actions";
import {announcementCounts,type AnnouncementAudience,type AnnouncementJob} from "@/lib/announcement-types";
import styles from "./dashboard.module.css";

const labels:Record<string,string>={clients:"All active Clients",team:"All active Team members (Owners/Coaches)",selected:"Selected recipients"};
export function OwnerAnnouncements({audience,initialJobs}:{audience:AnnouncementAudience[];initialJobs:AnnouncementJob[]}){
 const [kind,setKind]=useState("clients"),[selected,setSelected]=useState<string[]>([]),[nonce,setNonce]=useState(()=>crypto.randomUUID());
 const [jobs,setJobs]=useState(initialJobs),[active,setActive]=useState<string|null>(null),[notice,setNotice]=useState<AnnouncementState>({status:"idle"}),[running,setRunning]=useState(false),[pending,start]=useTransition();
 const job=jobs.find(j=>j.id===active),counts=announcementCounts(job?.recipients??[]);
 const matching=audience.filter(a=>kind==="clients"?a.role==="client":kind==="team"?a.role!=="client":true);
 const chosen=kind==="selected"?matching.filter(a=>a.opted_in&&selected.includes(a.user_id)):matching.filter(a=>a.opted_in);
 function apply(result:AnnouncementState){if(result.message)setNotice(result);if(result.job){const j=result.job;setJobs(old=>[j,...old.filter(x=>x.id!==j.id)]);setActive(j.id);}}
 useEffect(()=>{
  if(!running||!active)return;let stopped=false;
  async function send(){
   while(!stopped){try{const result=await refreshAnnouncementAction(active!);if(stopped)return;setNotice(result);if(result.job){const j=result.job;setJobs(old=>[j,...old.filter(x=>x.id!==j.id)]);const c=announcementCounts(j.recipients);if(!c.queued&&!c.processing){setRunning(false);return;}}
    if(result.paused||result.status==="error"){setRunning(false);return;}
   }catch{if(!stopped){setNotice({status:"error",message:"Sending was interrupted. Saved recipient status is retained; refresh before retrying."});setRunning(false);}return;}
   await new Promise(resolve=>setTimeout(resolve,3000));
   }
  }void send();return()=>{stopped=true;};
 },[running,active]);
 function operate(fn:()=>Promise<AnnouncementState>,resume=false){start(async()=>{try{const result=await fn();apply(result);if(resume&&result.status==="success")setRunning(true);}catch{setNotice({status:"error",message:"The request could not be confirmed. Refresh the saved announcement before retrying."});}});}
 return <>
  <section className={`${styles.panel} ${styles.announcementPanel}`}><h3>Private email announcements</h3><p>From Ravoge &lt;hello@ravoge.com&gt; · Reply-To hello@ravoge.com. Each person receives a separate email with only their own address in To.</p><p className={styles.formHint}>Only active members who opted in are included. Invitations do not opt anyone in. Resend suppression and unsubscribe checks run before dispatch. Do not include private Client information or recipient address lists in the message.</p><button className={styles.secondaryAction} disabled={pending||running} onClick={()=>operate(checkAnnouncementTransportAction)}>Check email connection</button></section>
  {!job&&<section className={`${styles.panel} ${styles.announcementPanel}`}><h3>New announcement</h3><form className={styles.form} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);operate(()=>previewAnnouncementAction(nonce,data));}}>
   <label className={styles.field}>Audience<select name="audience" value={kind} onChange={e=>setKind(e.target.value)} disabled={pending}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <p><strong>{chosen.length} eligible recipients</strong> · {matching.filter(a=>!a.opted_in).length} have not opted in</p>
   <label className={styles.checkboxLabel}><input type="checkbox" disabled={pending||!matching.some(a=>a.opted_in)} checked={chosen.length>0&&chosen.length===matching.filter(a=>a.opted_in).length} onChange={e=>{setSelected(e.target.checked?matching.filter(a=>a.opted_in).map(a=>a.user_id):[]);setKind("selected");}}/>Select all eligible recipients</label>
   <ul className={`${styles.activityList} ${styles.announcementAudience}`} aria-label="Announcement recipients">{matching.map(a=><li key={a.user_id}><label className={styles.checkboxLabel}><input name="recipients" value={a.user_id} type="checkbox" disabled={pending||!a.opted_in} checked={chosen.some(c=>c.user_id===a.user_id)} onChange={e=>{setSelected(e.target.checked?[...chosen.map(c=>c.user_id),a.user_id]:chosen.filter(c=>c.user_id!==a.user_id).map(c=>c.user_id));setKind("selected");}}/><span><strong>{a.name}</strong><small>{a.role} · {a.email} · {a.opted_in?"Opted in":"Not opted in"}</small></span></label></li>)}</ul>
   <p className={styles.formHint}>Members control optional announcements in their Profile. Owners can set their own preference below.</p>
   <label className={styles.field}>Subject<input name="subject" required maxLength={160} disabled={pending}/></label>
   <label className={styles.field}>Message<textarea name="message" required maxLength={10000} rows={8} disabled={pending}/></label>
   <button className={styles.action} disabled={pending||chosen.length===0}>{pending?"Preparing preview…":"Preview announcement"}</button>
  </form></section>}
  {job&&<section className={`${styles.panel} ${styles.announcementPanel}`} aria-label="Announcement preview and delivery"><h3>{job.status==="preview"?"Preview announcement":"Announcement delivery"}</h3><p>{labels[job.audience]} · <strong>{counts.total} recipients</strong></p><h4>{job.subject}</h4><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{job.message}</p>
   <p className={styles.formHint}>Each email includes only this message, gym branding and the recipient’s own unsubscribe link. No audience list or Client personalization is included.</p>
   {job.status==="preview"?<div className={styles.accessActions}><button className={styles.action} disabled={pending} onClick={()=>{if(window.confirm(`Send this announcement as ${counts.total} separate private email(s)? Confirm the recipient count and message. No other recipient addresses will be included.`))operate(()=>queueAnnouncementAction(job.id,counts.total),true);}}>{pending?"Queueing…":`Confirm ${counts.total} recipients & Send`}</button><button className={styles.secondaryAction} disabled={pending} onClick={()=>{setActive(null);setNonce(crypto.randomUUID());}}>Edit / new preview</button></div>:<>
    <p role="status">Queued: {counts.queued} · Processing: {counts.processing} · Provider-accepted: {counts.accepted} · Delivered (provider confirmed): {counts.delivered} · Failed: {counts.failed} · Unconfirmed: {counts.unconfirmed} · Skipped: {counts.skipped}</p>
    <p className={styles.formHint}>Accepted and delivered are milestones; delivered is a subset of accepted. Provider confirmation is not proof the person saw the email. Sending runs in the background. If sending stops because of a provider error or an expired Owner session, refresh status and resume the saved queue.</p>
    <div className={styles.accessActions}><button className={styles.action} disabled={pending||running||counts.queued+counts.processing===0} onClick={()=>operate(()=>resumeAnnouncementQueueAction(job.id),true)}>Resume queue</button>{running&&<button className={styles.secondaryAction} onClick={()=>setRunning(false)}>Stop status updates</button>}<button className={styles.secondaryAction} disabled={pending||running} onClick={()=>operate(()=>refreshAnnouncementAction(job.id))}>Refresh status</button><button className={styles.secondaryAction} disabled={pending||running||counts.accepted===0} onClick={()=>operate(()=>refreshAnnouncementDeliveryAction(job.id))}>Refresh delivery status</button>
    <button className={styles.secondaryAction} disabled={pending||running||counts.retryable===0} onClick={()=>{if(window.confirm(`Retry only ${counts.retryable} eligible failed/unconfirmed email(s)? Accepted recipients will not be resent.`))operate(()=>retryAnnouncementFailuresAction(job.id),true);}}>Retry {counts.retryable} eligible failures</button></div>
    <p className={styles.formHint}>Only transient failures can retry, after backoff and within the safe idempotency window. Unconfirmed older requests require investigation; accepted or permanently failed recipients are never retried by this action.</p>
    <details><summary>Recipient-level status</summary><ul className={styles.activityList}>{job.recipients.map(r=><li key={r.id}><div><strong>{r.email}</strong><small>{r.member_role} · {r.status}{r.error_code?` · ${r.error_code}`:""}</small></div></li>)}</ul></details>
   </>}
  </section>}
  {notice.message&&<p role={notice.status==="error"?"alert":"status"} className={styles.notice}>{notice.message}</p>}
  <section className={`${styles.panel} ${styles.announcementPanel}`}><h3>Saved announcements</h3><button className={styles.secondaryAction} disabled={pending||running} onClick={()=>{setActive(null);setNonce(crypto.randomUUID());setNotice({status:"idle"});}}>New announcement</button>{jobs.length?<ul className={styles.activityList}>{jobs.map(j=><li key={j.id}><div><strong>{j.subject}</strong><small>{labels[j.audience]} · {j.recipients.length} recipients · {j.status}</small></div><button className={styles.secondaryAction} disabled={pending||running} onClick={()=>operate(()=>refreshAnnouncementAction(j.id))}>Open announcement</button></li>)}</ul>:<p>No announcements yet.</p>}</section>
 </>;
}
