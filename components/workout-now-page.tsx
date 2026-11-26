import Link from "next/link";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { CoachClientDirectory } from "@/components/coach-client-directory";
import { TrainSessionForm } from "@/components/train-session-form";
import { selectTodayWorkout } from "@/lib/coach-workday";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import workspace from "./coach-workspace.module.css";

const UUID = /^[0-9a-f-]{36}$/i;
type WorkoutNowQuery = { client?: string; workout?: string };

export async function WorkoutNowPage({ role, searchParams }: { role: "owner" | "coach"; searchParams: Promise<WorkoutNowQuery> }) {
  const { client: requested, workout: requestedWorkout } = await searchParams;
  const { membership, supabase, userId } = await requireRole(role);
  const gym = membership.organization_id;
  const [actor, org, members] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", gym).single(),
    role === "owner" ? supabase.from("organization_member_roles").select("user_id").eq("organization_id", gym).eq("role", "client").eq("status", "active") :
      supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", gym).eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const ids = (members.data ?? []).map(row => "user_id" in row ? row.user_id : row.client_user_id);
  const { data: clients, error: clientError } = ids.length ? await supabase.from("profiles").select("id,full_name,preferred_name")
    .in("id", ids).eq("account_status", "active").order("full_name") : { data: [], error: null };
  const client = clients?.find(row => row.id === requested);
  const now = new Date();
  const timezone = org.data?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(now, timezone);
  const exactId = role === "coach" && requestedWorkout && UUID.test(requestedWorkout) ? requestedWorkout : undefined;
  const [intake, readiness, plans] = client ? await Promise.all([
    supabase.from("client_intakes").select("id").eq("organization_id", gym).eq("client_user_id", client.id)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("get_workout_generation_readiness", { target_client_user_id: client.id }),
    (() => {
      const query = supabase.from("workout_assignments").select("id,title,status,scheduled_time").eq("organization_id", gym)
        .eq("coach_user_id", userId).eq("client_user_id", client.id).eq("scheduled_date", today)
        .in("status", ["assigned", "in_progress"]);
      return exactId ? query.eq("id", exactId).limit(1) : query.order("scheduled_time", { nullsFirst: false }).limit(10);
    })(),
  ]) : [null, null, null];
  const failed = members.error || clientError || intake?.error || readiness?.error || plans?.error;
  const name = client?.preferred_name || client?.full_name;
  const plan = selectTodayWorkout(plans?.data ?? [], now, timezone);
  const workoutUnavailable = !!requestedWorkout && (!exactId || !plan);
  const workoutLink = client && plan ? `/coach/clients/${client.id}/workouts/${plan.id}` : null;
  const intakeRequired = readiness?.data?.needsSafetyReview === true;
  const gymName = org.data?.name ?? "Ravoge gym";
  const actorName = actor.data?.full_name ?? role;

  if (role === "owner") return <DashboardShell compact role={role} gymName={gymName} name={actorName}>
    <div className={styles.quickActions}><Link href="/owner" className={styles.backLink}>← Dashboard</Link></div>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Train without a booking</p><h2>Workout Now</h2>
      <p className={styles.profileMeta}>Select a Client, check readiness, then review and start their workout. For a session happening today.</p></div></div>
    <section className={styles.operationCard}>
      <form method="get" className={styles.form}><label className={styles.field}>Client
        <select name="client" required defaultValue={client?.id ?? ""}><option value="" disabled>Select a Client</option>
          {clients?.map(row => <option key={row.id} value={row.id}>{row.preferred_name || row.full_name}</option>)}</select>
      </label><button className={styles.action} disabled={!!members.error || !!clientError || !clients?.length}>Select Client</button></form>
      {!clients?.length && !failed && <p className={styles.empty}>No active Clients are available yet.</p>}
    </section>
    {requested && !client && !failed && <p role="alert" className={styles.notice}>This Client is unavailable in your current gym.</p>}
    {failed ? <p role="alert" className={styles.notice}>Client training details could not be loaded. Refresh to try again.</p> : client && <>
      <h3>{name}</h3>
      <TrainSessionForm key={client.id} clientId={client.id} role={role} workoutNow hasIntake={!!intake?.data}
        intakeReviewRequired={intakeRequired} plannedWorkoutTitle={plan?.title} />
      {!intake?.data && <Link className={styles.secondaryAction} href={`/owner/clients/${client.id}?tab=intake`}>Open Client intake</Link>}
    </>}
  </DashboardShell>;

  return <DashboardShell compact role={role} gymName={gymName} name={actorName}>
    <div className={workspace.workday}>
      <header className={workspace.workdayHeading}><div>{name && <p className={workspace.kicker}>{name}</p>}<h1>Workout Now</h1></div>
        <div className={workspace.actionStrip}>{client && <Link className={workspace.secondaryButton} href="/coach/workout-now">Change Client</Link>}
          <Link className={workspace.secondaryButton} href="/coach">← Today</Link></div>
      </header>
      {!client && !failed && <CoachClientDirectory mode="workout" clients={(clients ?? []).map(row => ({
        id: row.id, name: row.preferred_name || row.full_name, photo: null,
      }))} />}
      {!!requested && !client && !failed && <p role="alert" className={styles.notice}>This client is unavailable in your current gym or assigned client list.</p>}
      {failed ? <p role="alert" className={styles.notice}>Client training details couldn’t be loaded. Refresh to try again.</p> : client &&
        (workoutUnavailable ? <p role="alert" className={styles.notice}>This workout is unavailable for today. <Link href={`/${role}/clients/${client.id}`}>Open Client Profile</Link></p> :
          workoutLink && plan?.status === "in_progress" ?
            <section className={workspace.focusCard}><div><p className={workspace.kicker}>In progress</p><h2>{plan.title}</h2></div>
              <Link className={workspace.primaryButton} href={workoutLink}>Resume Workout</Link></section> :
            <TrainSessionForm key={`${client.id}:${plan?.id ?? ""}`} clientId={client.id} role={role} workoutNow hasIntake={!!intake?.data}
              intakeReviewRequired={intakeRequired} plannedWorkoutTitle={plan?.title} workoutId={plan?.id} />)}
    </div>
  </DashboardShell>;
}
