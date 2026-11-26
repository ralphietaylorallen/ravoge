import Link from "next/link";
import { randomUUID } from "node:crypto";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ActivityForm, DailyTotalForm, SleepScoreForm } from "@/components/client-log-forms";
import { ClientLogHistory } from "@/components/client-log-history";
import { activitySummary, logDate, recoverySummary, type ActivityEntry, type DailyTotal, type RecoveryEntry } from "@/lib/client-logs";
import { clientWorkoutTitle } from "@/lib/client-display";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

export default async function MyDayPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {membership,supabase,userId}=await requireRole("client");
  const [query,profile,organization]=await Promise.all([searchParams,supabase.from("profiles").select("full_name").eq("id",userId).single(),supabase.from("organizations").select("name,timezone").eq("id",membership.organization_id).single()]);
  const today=localDateInTimeZone(new Date(),organization.data?.timezone??DEFAULT_ORGANIZATION_TIMEZONE);
  let date=today,invalidDate=false;
  if(query.date){try{date=logDate(query.date);if(date>today){date=today;invalidDate=true;}}catch{invalidDate=true;}}
  const [daily,activity,recovery,workouts,sleep]=await Promise.all([
    supabase.from("client_daily_totals").select("log_date,calories,protein_grams").eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("log_date",date).maybeSingle(),
    supabase.from("client_activity_entries").select("id,log_date,activity_type,duration_minutes,distance,distance_unit,effort").eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("log_date",date).order("updated_at"),
    supabase.from("client_recovery_entries").select("id,log_date,workout_assignment_id,recovery_type,duration_minutes,water_temperature,temperature_unit,occurred_at,notes,felt_after").is("deleted_at",null).eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("log_date",date),
    supabase.from("workout_assignments").select("id,title,status").eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("scheduled_date",date).order("created_at"),
    supabase.from("client_sleep_scores").select("score").eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("log_date",date).maybeSingle(),
  ]);
  const entries=(activity.data??[]) as ActivityEntry[];
  const unavailable=daily.error||activity.error||recovery.error||workouts.error;
  return <DashboardShell compact name={profile.data?.full_name ?? "Client"} gymName={organization.data?.name ?? "Ravoge gym"} role="client">
    <div className={styles.pageHeading}>
      <div>
        <h1 className={styles.clientHeading}>My day</h1>
        <p>Sleep, nutrition, activity and recovery.</p>
      </div>
    </div>
    <form action="/client/my-day" className={`${styles.form} ${styles.dayDateForm}`}>
      <label className={styles.field}>
        Date
        <input key={date} type="date" name="date" defaultValue={date} max={today} required />
      </label>
      <button className={styles.secondaryAction}>Open date</button>
    </form>
    {invalidDate && <p role="alert">Choose today or an earlier date. Showing today.</p>}
    <section id="sleep" className={styles.operationCard}>
      <h3>Sleep</h3>
      {sleep.error
        ? <p role="alert">Sleep scores could not be loaded. Reload before editing.</p>
        : <SleepScoreForm key={date} date={date} score={sleep.data?.score ?? null} />}
    </section>
    {unavailable ? <p role="alert">Your day could not be loaded. Reload before editing.</p> : <>
      <section className={styles.operationCard}>
        <DailyTotalForm key={`${date}:${daily.data?.calories}:${daily.data?.protein_grams}`} date={date} total={daily.data as DailyTotal | null} />
      </section>
      <section className={styles.operationCard}>
        <h3>Extra activity</h3>
        {!entries.length && <p>Not logged</p>}
        {entries.map(entry => <details key={`${entry.id}:${entry.log_date}:${entry.duration_minutes}:${entry.distance}:${entry.effort}`}>
          <summary>{activitySummary(entry)} · Edit</summary>
          <ActivityForm date={date} entry={entry} />
        </details>)}
        <details key={`new:${date}:${entries.map(entry => entry.id).join()}`}>
          <summary>Add activity</summary>
          <ActivityForm date={date} newId={randomUUID()} />
        </details>
      </section>
      <section className={styles.operationCard}>
        <h3>Recovery &amp; workouts</h3>
        {((recovery.data ?? []) as RecoveryEntry[]).map(entry => <p key={entry.id}>
          {recoverySummary(entry)} · <Link href={`/client/workouts/${entry.workout_assignment_id}#recovery`}>Edit recovery</Link>
        </p>)}
        {!recovery.data?.length && <p>Recovery: Not logged</p>}
        {workouts.data?.map(workout => <p key={workout.id}>
          <Link href={`/client/workouts/${workout.id}${workout.status === "completed" ? "#recovery" : ""}`}>
            {clientWorkoutTitle(workout.title)} · {workout.status.replaceAll("_", " ")}
          </Link>
        </p>)}
      </section>
    </>}
    <ClientLogHistory supabase={supabase} organizationId={membership.organization_id} clientId={userId} clientView />
  </DashboardShell>;
}
