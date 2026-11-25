import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PrepareSessionWorkout } from "@/components/prepare-session-workout";
import { TrainSessionForm } from "@/components/train-session-form";
import { bookingWorkoutSlot } from "@/lib/coach-workday";
import { savedWorkoutPreparation } from "@/lib/workout-preparation";
import { localDateInTimeZone } from "@/lib/timezone";
import workspace from "@/components/coach-workspace.module.css";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function SessionPreparationPage({ params, searchParams }: {
  params: Promise<{ clientId: string; bookingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { clientId, bookingId } = await params;
  const preparing = (await searchParams).mode === "prepare";
  if (![clientId, bookingId].every(id => UUID.test(id))) notFound();
  const { supabase, membership, userId } = await requireRole("coach");
  const gym = membership.organization_id;
  const [bookingResult, clientResult, coach, org, assignment] = await Promise.all([
    supabase.from("bookings").select("id,starts_at,ends_at,timezone,status,session_type")
      .eq("id", bookingId).eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", clientId).maybeSingle(),
    supabase.from("profiles").select("full_name,preferred_name").eq("id", clientId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", gym).maybeSingle(),
    supabase.from("coach_client_assignments").select("client_user_id")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", clientId).eq("status", "active").maybeSingle(),
  ]);
  const booking = bookingResult.data, client = clientResult.data;
  if (!booking || !client || !assignment.data) notFound();

  const base = `/coach/clients/${clientId}`;
  const slot = bookingWorkoutSlot(booking);
  const today = slot.date === localDateInTimeZone(new Date(), booking.timezone);
  const isIntake = booking.session_type === "Intake";
  const scheduled = booking.status === "scheduled";
  const [plans, intake, readiness] = scheduled && !isIntake ? await Promise.all([
    supabase.from("generated_prescriptions").select("id,title,status,engine_version,workout_assignment_id,generation_context")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", clientId)
      .contains("generation_context", { preparedBookingId: bookingId })
      .in("status", ["draft", "assigned"]).order("generated_at", { ascending: false }).limit(1),
    supabase.from("client_intakes").select("id").eq("organization_id", gym).eq("client_user_id", clientId)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    today && !preparing ? supabase.rpc("get_workout_generation_readiness", { target_client_user_id: clientId }) : null,
  ]) : [null, null, null];
  const plan = plans?.data?.[0];
  const query = supabase.from("workout_assignments").select("id,title,status")
    .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", clientId);
  const workouts = scheduled && !isIntake
    ? await (plan?.workout_assignment_id ? query.eq("id", plan.workout_assignment_id).limit(1) :
      query.eq("scheduled_date", slot.date).eq("scheduled_time", slot.time).in("status", ["assigned", "in_progress", "completed"]).limit(2))
    : null;
  const existing = workouts?.data?.length === 1 && workouts.data[0].status !== "cancelled" ? workouts.data[0] : null;
  const draft = plan?.status === "draft" && (plan.generation_context?.preparationReady || plan.engine_version !== "prescription-v0.2") ? plan : null;
  const draftTitle = savedWorkoutPreparation(draft?.generation_context?.coachDraft)?.title ?? draft?.title;
  const dateLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: booking.timezone }).format(new Date(booking.starts_at));

  return <DashboardShell compact role="coach" gymName={org.data?.name ?? "Ravoge gym"} name={coach.data?.full_name ?? "Coach"}>
    <div className={workspace.workday}>
      <div className={workspace.actionStrip}>
        <Link className={workspace.secondaryButton} href="/coach">← Today</Link>
        <Link className={workspace.secondaryButton} href={base}>Client Profile</Link>
      </div>
      <header className={workspace.workdayHeading}>
        <div><p className={workspace.kicker}>{booking.session_type}</p><h1>{client.preferred_name || client.full_name}</h1><p className={workspace.muted}>{dateLabel}</p></div>
      </header>
      {!scheduled ? <section className={styles.operationCard}><p role="status">This session is {booking.status.replaceAll("_", " ")}.</p></section> :
      isIntake ? <section className={styles.operationCard}><h2>Client intake</h2><p>Fill this out with the client or enter the information they’ve already provided.</p>
        <Link className={workspace.primaryButton} href={`${base}?tab=intake#intake-evaluation`}>Fill Out Intake</Link></section> :
      plans?.error || workouts?.error || intake?.error || readiness?.error ?
        <p className={styles.notice} role="alert">The session details couldn’t be loaded. Refresh before preparing a workout.</p> :
      (workouts?.data?.length ?? 0) > 1 ?
        <section className={styles.operationCard}><p role="alert">More than one workout matches this time. Choose the right workout from the client’s plan.</p>
          <Link className={workspace.secondaryButton} href={`/coach/plan-workouts?client=${clientId}&date=${slot.date}`}>Open Client Plan</Link></section> :
      existing?.status === "in_progress" || existing?.status === "completed" ?
        <section className={workspace.focusCard}><div><h2>{existing.title}</h2><p className={workspace.focusSubtitle}>{existing.status === "completed" ? "Workout complete" : "In progress"}</p></div>
          <Link className={workspace.primaryButton} href={`${base}/workouts/${existing.id}`}>{existing.status === "completed" ? "View Report" : "Resume Workout"}</Link></section> :
      today && !preparing ?
        <TrainSessionForm clientId={clientId} bookingId={bookingId} hasIntake={!!intake?.data}
          intakeReviewRequired={readiness?.data?.needsSafetyReview === true} plannedWorkoutTitle={existing?.title || draftTitle} /> :
      <section className={`${styles.operationCard} ${workspace.sessionSection}`}>
        <h2>{existing?.title || draftTitle || "Prepare workout"}</h2>
        {existing ? <Link className={workspace.primaryButton} href={`${base}/workouts/${existing.id}`}>View Workout Plan</Link> :
        draft ? <Link className={workspace.primaryButton} href={`${base}/prescriptions/${draft.id}?mode=prepare`}>Review Saved Draft</Link> :
        intake?.data ? <PrepareSessionWorkout clientId={clientId} bookingId={bookingId} /> :
        <><p className={workspace.muted}>Complete the intake to generate a workout for this booking.</p>
          <Link className={workspace.primaryButton} href={`${base}?tab=intake#intake-evaluation`}>Fill Out Intake</Link></>}
      </section>}
      {scheduled && !isIntake && <>
        {today && preparing && <Link className={workspace.secondaryButton} href={`${base}/sessions/${bookingId}`}>Open Today’s Session</Link>}
        {today && !preparing && !!draft && <details className={workspace.disclosure}><summary>Workout draft</summary>
          <Link className={workspace.secondaryButton} href={`${base}/prescriptions/${draft.id}`}>Review Saved Draft</Link>
        </details>}
        <Link className={styles.inlineAction} href={`/coach/plan-workouts?client=${clientId}&date=${slot.date}`}>Client’s workout calendar →</Link>
        {!existing && <Link className={styles.inlineAction} href={`/coach/plan-workouts?client=${clientId}&date=${slot.date}&time=${slot.time.slice(0, 5)}&edit=manual#workout-editor`}>Add a coach-built workout for this time →</Link>}
      </>}
    </div>
  </DashboardShell>;
}
