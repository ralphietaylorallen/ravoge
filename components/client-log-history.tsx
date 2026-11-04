import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activitySummary, recoverySummary, type ActivityEntry, type DailyTotal, type RecoveryEntry } from "@/lib/client-logs";
import styles from "./dashboard.module.css";

export async function ClientLogHistory({supabase,organizationId,clientId,clientView=false}:{supabase:SupabaseClient;organizationId:string;clientId:string;clientView?:boolean}) {
  const [daily,activity,recovery]=await Promise.all([
    supabase.from("client_daily_totals").select("log_date,calories,protein_grams").eq("organization_id",organizationId).eq("client_user_id",clientId).order("log_date",{ascending:false}).limit(60),
    supabase.from("client_activity_entries").select("id,log_date,activity_type,duration_minutes,distance,distance_unit,effort").eq("organization_id",organizationId).eq("client_user_id",clientId).order("log_date",{ascending:false}).limit(200),
    supabase.from("client_recovery_entries").select("id,log_date,workout_assignment_id,recovery_type,duration_minutes,water_temperature,temperature_unit").eq("organization_id",organizationId).eq("client_user_id",clientId).order("log_date",{ascending:false}).limit(200),
  ]);
  if(daily.error||activity.error||recovery.error) return <section className={styles.operationCard}><h3>Daily &amp; recovery history</h3><p role="alert">History could not be loaded. Please reload and try again.</p></section>;
  const totals=(daily.data??[]) as DailyTotal[],activities=(activity.data??[]) as ActivityEntry[],recoveries=(recovery.data??[]) as RecoveryEntry[];
  const dates=[...new Set([...totals,...activities,...recoveries].map(e=>e.log_date))].sort().reverse();
  return <section className={styles.operationCard} aria-label="Daily and recovery history"><h3>Daily &amp; recovery history</h3><p>Recent entries. Extra activity and recovery do not change assigned-workout results or scores.</p>{!dates.length?<p className={styles.empty}>Not logged</p>:<ul className={styles.activityList}>{dates.map(date=>{const total=totals.find(t=>t.log_date===date);return <li key={date}><div><h4><time dateTime={date}>{date}</time></h4><p>Calories: {total?.calories??"Not logged"} · Protein: {total?.protein_grams===null||total?.protein_grams===undefined?"Not logged":`${total.protein_grams} g`}</p>{activities.filter(e=>e.log_date===date).map(e=><p key={e.id}>{activitySummary(e)}</p>)}{recoveries.filter(e=>e.log_date===date).map(e=><p key={e.id}>{recoverySummary(e)} · {clientView?<Link href={`/client/workouts/${e.workout_assignment_id}#recovery`}>Workout recovery</Link>:"Linked to completed workout"}</p>)}{clientView&&<Link href={`/client/my-day?date=${date}`}>Open day</Link>}</div></li>})}</ul>}</section>;
}
