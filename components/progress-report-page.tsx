import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { LOG_UUID, logDate } from "@/lib/client-logs";
import { localDateInTimeZone } from "@/lib/timezone";
import type { SixWeekFacts, ProgressShare } from "@/lib/session-report";
import { loadProgressContext, loadProgressShares } from "@/lib/session-report-data";
import { ProgressReport } from "./progress-report";
import { ProgressShareForm } from "./progress-share-form";
import { DashboardShell } from "./dashboard-shell";
import styles from "./session-report.module.css";

export async function ProgressReportPage({role,clientId,search}:{role:"owner"|"coach"|"client";clientId?:string;search:{end?:string;share?:string}}) {
 const {membership,supabase,userId}=await requireRole(role),target=role==="client"?userId:clientId;
 if(!target||!LOG_UUID.test(target))notFound();
 const [{data:actor},{data:org}]=await Promise.all([supabase.from("profiles").select("full_name").eq("id",userId).single(),supabase.from("organizations").select("name,timezone").eq("id",membership.organization_id).single()]);
 const today=localDateInTimeZone(new Date(),org?.timezone??"America/Denver");let end=today;try{if(search.end)end=logDate(search.end);}catch{end="invalid";}
 const base=role==="client"?"/client":`/${role}/clients/${target}`,back=role==="client"?"/client/profile":`${base}?tab=progress`;
 let facts:SixWeekFacts|null=null,shares:ProgressShare[]=[],share:ProgressShare|undefined,issue="";
 try {
  shares=await loadProgressShares(supabase,membership.organization_id,target);
  share=search.share?shares.find(s=>s.id===search.share):undefined;
  if(search.share&&!share&&LOG_UUID.test(search.share)){
   const saved=await supabase.from("client_progress_report_shares").select("id,period_start,period_end,revision,shared_at,coach_summary,next_priorities,source_snapshot").eq("organization_id",membership.organization_id).eq("client_user_id",target).eq("id",search.share).maybeSingle();
   if(!saved.error&&saved.data)share=saved.data as ProgressShare;
  }
  if(search.share&&!share)throw new Error("That saved snapshot is unavailable. Choose a report from the shared history below or return to the current period.");
  facts=share?.source_snapshot??await loadProgressContext(supabase,membership.organization_id,target,end);
 }catch(e){issue=e instanceof Error?e.message:"Please reload to try again. Your records are unchanged.";}
 const previous=shares.find(s=>s.period_end===facts?.periodEnd);
 const content=facts&&!issue?<><form className={styles.period} action={`${base}/progress`}><label>Six-week period ending<input type="date" name="end" defaultValue={facts.periodEnd} min="1900-02-11" max={today} required/></label><button className={styles.secondary}>View period</button></form>
   <ProgressReport facts={facts} share={share} base={base}/>
   {role!=="client"&&!share&&<ProgressShareForm key={end} role={role} clientId={target} end={end} previous={previous?.id} summary={previous?.coach_summary??""} priorities={previous?.next_priorities??""}/>}
   <section className={`${styles.card} ${styles.note}`}><h2>Shared reports</h2>{shares.length?<ul className={styles.list}>{shares.map(s=><li key={s.id}><Link className={styles.historyLink} href={`${base}/progress?share=${s.id}`}><span>{s.period_start} – {s.period_end} · Revision {s.revision}<small>Shared {s.shared_at.slice(0,10)}</small></span><span aria-hidden="true">→</span></Link></li>)}</ul>:<p>No progress report has been shared yet.</p>}{share&&<Link className={styles.secondary} href={`${base}/progress?end=${share.period_end}`}>View current records for this period</Link>}{shares.length===30&&<p className={styles.hint}>Showing the latest 30 shared reports.</p>}</section></>
:<section className={`${styles.card} ${styles.note}`}><h1>Progress report unavailable</h1><p role="alert">{issue}</p><Link className={styles.secondary} href={`${base}/progress`}>Return to current period</Link></section>;
 return <DashboardShell compact role={role} gymName={org?.name??"Ravoge gym"} name={actor?.full_name??role}><article className={styles.report}><Link className={styles.secondary} href={back}>← Back to profile</Link>{content}</article></DashboardShell>;
}
