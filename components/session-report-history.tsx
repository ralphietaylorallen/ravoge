import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionScore } from "@/lib/session-report";
import styles from "./session-report.module.css";

export async function SessionReportHistory({supabase,organizationId,clientId,role}:{supabase:SupabaseClient;organizationId:string;clientId:string;role:"client"|"coach"|"owner"}) {
 const base=role==="client"?"/client":`/${role}/clients/${clientId}`;
 const {data,error}=await supabase.from("workout_session_reports").select("workout_assignment_id,workout_date,completed_at,title:source_snapshot->workout->>title,score_snapshot").eq("organization_id",organizationId).eq("client_user_id",clientId).order("workout_date",{ascending:false}).order("completed_at",{ascending:false}).limit(200);
 const dates=[...new Set((data??[]).map(row=>row.workout_date as string))];
 return <section id="workout-history" className={styles.card}><h2 className={styles.sectionTitle}>Completed workout reports</h2><p className={styles.hint}>Open a session for every exercise and actual result. <Link href={`${base}/progress`}>6-week progress →</Link></p>
  {error?<p role="alert">Report history could not be loaded. Your workouts are saved; please reload.</p>:!dates.length?<p className={styles.muted}>Your completed sessions will appear here.</p>:dates.map(date=><div key={date}><h3 className={styles.historyDate}><time dateTime={date}>{date}</time></h3><ul className={styles.list}>{data!.filter(row=>row.workout_date===date).map(row=>{const score=row.score_snapshot as SessionScore;return <li key={row.workout_assignment_id}><Link className={styles.historyLink} href={`${base}/workouts/${row.workout_assignment_id}`}><span><strong>{String(row.title??"Completed workout")}</strong><small>Completed · {score?.status==="scored"&&score.value!==null?`${score.value}/100`:"Score pending"}</small></span><span aria-hidden="true">→</span></Link></li>;})}</ul></div>)}
  {data?.length===200&&<p className={styles.hint}>Showing the latest 200 completed sessions. Use the 6-week date selector for older periods.</p>}
 </section>;
}
