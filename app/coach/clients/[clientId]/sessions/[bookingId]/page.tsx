import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PrepareSessionWorkout } from "@/components/prepare-session-workout";
import { savedWorkoutPreparation } from "@/lib/workout-preparation";
import { localDateInTimeZone } from "@/lib/timezone";
const UUID = /^[0-9a-f-]{36}$/i;

export default async function SessionPreparationPage({ params }: { params: Promise<{clientId:string;bookingId:string}> }) {
  const {clientId,bookingId} = await params;
  if (![clientId,bookingId].every(id=>UUID.test(id))) notFound();
  const {supabase,membership,userId} = await requireRole("coach");
  const [{data:booking},{data:client},{data:coach},{data:org},{data:assignment}] = await Promise.all([
    supabase.from("bookings").select("id,starts_at,ends_at,timezone,status,session_type").eq("id",bookingId).eq("organization_id",membership.organization_id).eq("coach_user_id",userId).eq("client_user_id",clientId).maybeSingle(),
    supabase.from("profiles").select("full_name,preferred_name").eq("id",clientId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id",userId).maybeSingle(),
    supabase.from("organizations").select("name").eq("id",membership.organization_id).maybeSingle(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id",membership.organization_id).eq("coach_user_id",userId).eq("client_user_id",clientId).eq("status","active").maybeSingle(),
  ]);
  if (!booking || !client || !assignment) notFound();
  const {data:plans,error} = await supabase.from("generated_prescriptions").select("id,title,status,engine_version,workout_assignment_id,generation_context").eq("organization_id",membership.organization_id).eq("coach_user_id",userId).eq("client_user_id",clientId).contains("generation_context",{preparedBookingId:bookingId}).in("status",["draft","assigned"]).order("generated_at",{ascending:false}).limit(1);
  const plan = plans?.[0];
  const date = localDateInTimeZone(booking.starts_at,booking.timezone);
  const localTime = new Intl.DateTimeFormat("en-GB",{hourCycle:"h23",hour:"2-digit",minute:"2-digit",timeZone:booking.timezone}).format(new Date(booking.starts_at));
  const workoutQuery=supabase.from("workout_assignments").select("id,title").eq("organization_id",membership.organization_id).eq("coach_user_id",userId).eq("client_user_id",clientId);
  const {data:plannedWorkouts,error:workoutError}=plan?.workout_assignment_id
    ? await workoutQuery.eq("id",plan.workout_assignment_id).limit(1)
    : await workoutQuery.eq("scheduled_date",date).eq("scheduled_time",`${localTime}:00`).in("status",["assigned","in_progress"]).limit(2);
  const existing=plannedWorkouts?.length===1?plannedWorkouts[0]:null;
  const draftTitle=savedWorkoutPreparation(plan?.generation_context?.coachDraft)?.title??plan?.title;
  return <DashboardShell compact role="coach" gymName={org?.name ?? "Ravoge gym"} name={coach?.full_name ?? "Coach"}>
    <Link className={styles.backLink} href={`/coach/clients/${clientId}`}>← Back to {client.preferred_name || client.full_name}</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Prepare scheduled session</p><h2>{client.preferred_name || client.full_name}</h2></div><p>{new Intl.DateTimeFormat("en-US",{dateStyle:"full",timeStyle:"short",timeZone:booking.timezone}).format(new Date(booking.starts_at))} · {booking.timezone}</p></div>
    <section className={styles.panel}>
      {booking.status!=="scheduled" ? <p role="status">This session is {booking.status.replaceAll("_"," ")}. Workout preparation is available for scheduled sessions.</p>
        : booking.session_type==="Intake" ? <Link className={styles.action} href={`/coach/clients/${clientId}?tab=intake`}>Open intake</Link>
        : error || workoutError ? <p role="alert">Saved workouts could not be loaded. Refresh before preparing another.</p>
        : (plannedWorkouts?.length??0)>1 ? <p role="alert">More than one workout matches this time. Open the Client’s workout plan and select the correct workout before preparing another.</p>
        : existing ? <><h3>{existing.title}</h3><p>This session already has a planned workout.</p><Link className={styles.action} href={`/coach/clients/${clientId}/workouts/${existing.id}`}>Open planned workout</Link></>
        : (plan?.generation_context?.preparationReady || plan && plan.engine_version!=="prescription-v0.2") ? <><h3>{draftTitle}</h3><p>Your saved draft is ready to edit. Drafts are not shown to the Client until you assign them.</p><Link className={styles.action} href={`/coach/clients/${clientId}/prescriptions/${plan.id}`}>Edit saved draft</Link></>
        : <PrepareSessionWorkout clientId={clientId} bookingId={bookingId}/>}
    </section>
  </DashboardShell>;
}
