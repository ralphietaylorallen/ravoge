import Link from "next/link";
import { notFound } from "next/navigation";

import { OperationsTabs } from "@/components/operations-tabs";
import { StaffBookingPage } from "@/components/staff-booking-page";
import { BookingList } from "@/components/booking-list";
import { ClientCoachAssignmentForm } from "@/components/client-coach-assignment-form";
import { BaselineSummary, type BaselineRecord } from "@/components/baseline-summary";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProgressChart, type ProgressMetric } from "@/components/progress-chart";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { DEFAULT_ORGANIZATION_TIMEZONE, localWeekStartDate } from "@/lib/timezone";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Assignment = { coach_user_id: string; status: "active" | "inactive" };
type AuditEvent = { action: string; actor_user_id: string; coach_user_id: string; created_at: string };
type Intake = {
  completed_at: string;
  current_injuries: string | null;
  experience_level: string;
  movement_limitations: string | null;
  primary_goal: string;
  recent_consistency: string;
  training_frequency_goal: number;
  version: number;
};
type ClientState = {
  calculated_at: string;
  confidence: { overall?: string };
  constraint_tags: string[];
  current_readiness: number;
  movement_tolerance: number;
  recovery_capacity: number;
  training_experience: number;
  volume_tolerance: number;
};
type Prescription = { coach_user_id: string; generated_at: string; id: string; status: string; title: string };
type Workout = {
  coach_user_id: string;
  completed_at: string | null;
  id: string;
  scheduled_date: string;
  status: string;
  title: string;
  workout_exercises: { exercise_name: string; id: string; load: number | null; reps: number; sets: number; sort_order: number }[];
};
type Booking = { coach_user_id: string; ends_at: string; id: string; starts_at: string; status: string; timezone: string };
type BodyComposition = {
  intake_id: string | null;
  body_fat_mass_kg: number | null;
  body_fat_percentage: number | null;
  inbody_score: number | null;
  measured_at: string;
  skeletal_muscle_mass_kg: number | null;
  weight_kg: number | null;
};

function level(score: number) {
  if (score < 0.4) return "Conservative";
  if (score < 0.7) return "Moderate";
  return "Developed";
}

export default async function OwnerClientDetailPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ tab?: string; date?: string; duration?: string; coach?: string; reschedule?: string }> }) {
  const query = await searchParams;
  const tab = ["overview", "schedule", "intake", "progress", "workouts", "notes"].includes(query.tab ?? "") ? query.tab! : "overview";
  const { clientId } = await params;
  if (!UUID_PATTERN.test(clientId)) notFound();
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;

  const { data: clientMembership } = await supabase
    .from("organization_memberships")
    .select("user_id,status,invitation_id,created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", clientId)
    .eq("role", "client")
    .maybeSingle();
  if (!clientMembership) notFound();

  const [
    { data: owner },
    { data: organization },
    { data: client },
    { data: assignmentRows },
    { data: coachMemberships },
    { data: intakeRows },
    { data: stateRows },
    { data: prescriptionRows },
    { data: workoutRows },
    { data: auditRows },
    { data: bookingRows },
    { data: bodyCompositionRows },
    { data: intakeVersionRows },
    { data: baselineRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
    supabase.from("profiles").select("full_name,preferred_name,bio,avatar_path,account_status").eq("id", clientId).maybeSingle(),
    supabase.from("coach_client_assignments").select("coach_user_id,status").eq("organization_id", organizationId).eq("client_user_id", clientId).order("updated_at", { ascending: false }),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "coach").eq("status", "active").order("created_at"),
    supabase.from("client_intakes").select("version,completed_at,training_frequency_goal,primary_goal,experience_level,recent_consistency,current_injuries,movement_limitations").eq("organization_id", organizationId).eq("client_user_id", clientId).order("version", { ascending: false }).limit(1),
    supabase.from("client_states").select("training_experience,recovery_capacity,current_readiness,movement_tolerance,volume_tolerance,constraint_tags,confidence,calculated_at").eq("organization_id", organizationId).eq("client_user_id", clientId).order("calculated_at", { ascending: false }).limit(1),
    supabase.from("generated_prescriptions").select("id,title,status,generated_at,coach_user_id").eq("organization_id", organizationId).eq("client_user_id", clientId).order("generated_at", { ascending: false }),
    supabase.from("workout_assignments").select("id,title,scheduled_date,status,completed_at,coach_user_id,workout_exercises(id,exercise_name,sets,reps,load,sort_order)").eq("organization_id", organizationId).eq("client_user_id", clientId).order("scheduled_date", { ascending: false }),
    supabase.from("coach_client_assignment_audit").select("action,actor_user_id,coach_user_id,created_at").eq("organization_id", organizationId).eq("client_user_id", clientId).order("created_at", { ascending: false }).limit(12),
    supabase.from("bookings").select("id,coach_user_id,starts_at,ends_at,timezone,status").eq("organization_id", organizationId).eq("client_user_id", clientId).order("starts_at", { ascending: false }),
    supabase.from("client_body_composition_assessments").select("intake_id,measured_at,weight_kg,skeletal_muscle_mass_kg,body_fat_percentage,body_fat_mass_kg,inbody_score").eq("organization_id", organizationId).eq("client_user_id", clientId).order("measured_at"),
    supabase.from("client_intakes").select("id,version,completed_at").eq("organization_id", organizationId).eq("client_user_id", clientId).order("version", { ascending: false }),
    supabase.from("client_intake_baselines").select("intake_id,squat_variation,squat_one_rm_kg,squat_one_rm_method,bench_variation,bench_one_rm_kg,bench_one_rm_method,pullup_strict_reps,pullup_mode,rower_distance_m,rower_time_seconds,versa_duration_seconds,versa_feet,inbody_status").eq("organization_id", organizationId).eq("client_user_id", clientId),
  ]);

  const assignments = (assignmentRows ?? []) as Assignment[];
  const activeAssignment = assignments.find((assignment) => assignment.status === "active");
  const coachIds = (coachMemberships ?? []).map((row: { user_id: string }) => row.user_id);
  const audits = (auditRows ?? []) as AuditEvent[];
  const profileIds = [...new Set([...coachIds, ...audits.map((row) => row.actor_user_id)])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id,full_name,avatar_path").in("id", profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile: { id: string; full_name: string }) => [profile.id, profile.full_name]));
  const coachPhotos = new Map(await Promise.all((profiles ?? []).map(async (profile) => [profile.id, await getProfileImageUrl(supabase, profile.avatar_path)] as const)));
  const coaches = coachIds.map((id) => ({ id, name: names.get(id) ?? "Coach", photo: coachPhotos.get(id) }));
  const intake = (intakeRows?.[0] ?? null) as Intake | null;
  const state = (stateRows?.[0] ?? null) as ClientState | null;
  const prescriptions = (prescriptionRows ?? []) as Prescription[];
  const workouts = (workoutRows ?? []) as Workout[];
  const bookings = (bookingRows ?? []) as Booking[];
  const bodyComposition = (bodyCompositionRows ?? []) as BodyComposition[];
  const baselineByIntake = new Map((baselineRows ?? []).map((row) => [row.intake_id, row]));
  const baselineRecords = (intakeVersionRows ?? []).flatMap((intakeVersion) => {
    const baseline = baselineByIntake.get(intakeVersion.id);
    if (!baseline) return [];
    const inbody = bodyComposition.find((row) => row.intake_id === intakeVersion.id);
    return [{ ...baseline, version: intakeVersion.version, completed_at: intakeVersion.completed_at, inbody_score: inbody?.inbody_score, body_fat_percentage: inbody?.body_fat_percentage } as BaselineRecord];
  });
  const clientName = client?.preferred_name || client?.full_name || "Client";
  const clientImageUrl = await getProfileImageUrl(supabase, client?.avatar_path);
  const { data: invitation } = clientMembership.invitation_id
    ? await supabase.from("organization_invitations").select("invited_by").eq("id", clientMembership.invitation_id).maybeSingle()
    : { data: null };
  const { data: inviterProfile } = invitation?.invited_by
    ? await supabase.from("profiles").select("full_name,preferred_name").eq("id", invitation.invited_by).maybeSingle()
    : { data: null };
  const inviterName = invitation?.invited_by
    ? names.get(invitation.invited_by) ?? inviterProfile?.preferred_name ?? inviterProfile?.full_name ?? "Organization member"
    : "Owner setup / legacy";
  const completedBookings = [...bookings].filter((booking) => booking.status === "completed").reverse();
  const weeklySessions = new Map<string, number>();
  completedBookings.forEach((booking) => {
    const key = localWeekStartDate(booking.starts_at, organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE);
    if (!key) return;
    weeklySessions.set(key, (weeklySessions.get(key) ?? 0) + 1);
  });
  const progressMetrics: ProgressMetric[] = [
    { label: "Weight", unit: "kg", points: bodyComposition.filter((row) => row.weight_kg !== null).map((row) => ({ date: row.measured_at, value: Number(row.weight_kg) })) },
    { label: "Skeletal muscle", unit: "kg", points: bodyComposition.filter((row) => row.skeletal_muscle_mass_kg !== null).map((row) => ({ date: row.measured_at, value: Number(row.skeletal_muscle_mass_kg) })) },
    { label: "Body fat", unit: "%", points: bodyComposition.filter((row) => row.body_fat_percentage !== null).map((row) => ({ date: row.measured_at, value: Number(row.body_fat_percentage) })) },
    { label: "Workout completion", unit: "%", points: [...workouts].reverse().map((row) => ({ date: row.completed_at ?? `${row.scheduled_date}T12:00:00Z`, value: row.status === "completed" ? 100 : 0 })) },
    { label: "Training frequency", unit: "sessions/week", points: [...weeklySessions].map(([date, value]) => ({ date: `${date}T12:00:00Z`, value })) },
  ];


  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const requestTime = new Date().getTime();
  const nextBooking = [...bookings].filter((booking) => booking.status === "scheduled" && Date.parse(booking.starts_at) >= requestTime).sort((a,b) => a.starts_at.localeCompare(b.starts_at))[0];
  const latestBody = bodyComposition.at(-1);
  const basePath = `/owner/clients/${clientId}`;
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: timezone }).format(new Date(value));
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
    <Link className={styles.backLink} href="/owner/clients">← Clients</Link>
    <div className={styles.detailHeader}><div className={styles.profileHero}><ProfilePhoto name={clientName} url={clientImageUrl} /><div><h2 className={styles.detailTitle}>{clientName}</h2><p className={styles.profileMeta}>Client · {organization?.name} · Joined {formatDate(clientMembership.created_at)}</p></div></div><span className={clientMembership.status === "active" ? styles.successPill : styles.mutedPill}>{clientMembership.status}</span></div>
    <OperationsTabs active={tab} basePath={basePath} tabs={[{id:"overview",label:"Overview"},{id:"schedule",label:"Schedule"},{id:"intake",label:"Intake"},{id:"progress",label:"Progress"},{id:"workouts",label:"Workouts"},{id:"notes",label:"Notes"}]} />
    {tab === "overview" && <div className={styles.overviewCards}>
      <section className={styles.operationCard}><h3>Assigned Coach</h3>{activeAssignment ? <div className={styles.coachIdentity}><ProfilePhoto name={names.get(activeAssignment.coach_user_id) ?? "Coach"} url={coachPhotos.get(activeAssignment.coach_user_id)} size="small" /><strong>{names.get(activeAssignment.coach_user_id) ?? "Coach"}</strong></div> : <div className={styles.emptyAssignment}><span aria-hidden="true">♙</span><strong>No coach assigned yet</strong><p>Assign a coach to plan training and book the first session.</p></div>}<ClientCoachAssignmentForm clientId={clientId} clientName={clientName} coaches={coaches} currentCoachId={activeAssignment?.coach_user_id} />{activeAssignment && <Link className={styles.secondaryAction} href={`${basePath}?tab=schedule`}>Schedule session →</Link>}</section>
      <section className={styles.operationCard}><h3>Client status</h3><dl className={styles.factList}><div><dt>Next session</dt><dd>{nextBooking ? new Date(nextBooking.starts_at).toLocaleString("en-US", {timeZone:timezone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "None"}</dd></div><div><dt>Intake status</dt><dd><span className={intake ? styles.successPill : styles.pendingPill}>{intake ? "Complete" : "Pending"}</span></dd></div><div><dt>Current phase</dt><dd>{prescriptions.length ? "Foundation" : "Not started"}</dd></div><div><dt>Latest workout</dt><dd>{workouts[0]?.title ?? "None"}</dd></div><div><dt>Member since</dt><dd>{formatDate(clientMembership.created_at)}</dd></div></dl></section>
      <section className={styles.operationCard}><h3>Recent activity</h3><ul className={styles.activityList}><li><div><strong>Joined {organization?.name}</strong><small>{formatDate(clientMembership.created_at)}</small></div></li><li><div><strong>{activeAssignment ? "Coach assigned" : "Awaiting coach assignment"}</strong><small>Invited by {inviterName}</small></div></li>{audits.slice(0,3).map((event) => <li key={event.created_at}><div><strong>{event.action.replaceAll("_"," ")}</strong><small>{names.get(event.coach_user_id) ?? "Coach"} · {formatDate(event.created_at)}</small></div></li>)}</ul></section>
      <section className={styles.operationCard}><h3>Body composition (InBody)</h3>{latestBody ? <dl className={styles.factList}><div><dt>InBody score</dt><dd>{latestBody.inbody_score ?? "Not recorded"}</dd></div><div><dt>Body fat</dt><dd>{latestBody.body_fat_percentage !== null ? `${latestBody.body_fat_percentage}%` : "Not recorded"}</dd></div><div><dt>Test date</dt><dd>{formatDate(latestBody.measured_at)}</dd></div></dl> : <div className={styles.emptyAssignment}><strong>No InBody data yet</strong><p>Complete intake to add baseline measurements.</p></div>}<Link className={styles.secondaryAction} href={`${basePath}?tab=intake`}>Go to Intake</Link></section>
    </div>}
    {tab === "schedule" && <><StaffBookingPage clientId={clientId} embedded role="owner" searchParams={query} /><section className={styles.operationCard}><h3>Client sessions</h3><BookingList bookings={bookings.map((booking) => ({id:booking.id,clientUserId:clientId,clientName,clientPhotoUrl:clientImageUrl,coachName:names.get(booking.coach_user_id) ?? "Coach",startsAt:booking.starts_at,endsAt:booking.ends_at,status:booking.status,timezone:booking.timezone,gymName:organization?.name ?? "Gym"}))} empty="No sessions booked yet." perspective="owner" staffControls /></section></>}
    {tab === "intake" && <section className={styles.operationCard}><h3>Intake & baseline</h3><p className={styles.empty}>{intake ? `Version ${intake.version} · ${formatDate(intake.completed_at)} · ${intake.primary_goal.replaceAll("_"," ")}` : "Your assigned Coach can run the guided intake evaluation from their Client workspace."}</p><BaselineSummary records={baselineRecords} />{state && <div className={styles.stateGrid}><article><span>Readiness</span><strong>{level(state.current_readiness)}</strong></article><article><span>Recovery</span><strong>{level(state.recovery_capacity)}</strong></article><article><span>Confidence</span><strong>{state.confidence.overall ?? "Low"}</strong></article></div>}</section>}
    {tab === "workouts" && <section className={styles.operationCard}><h3>Workout history</h3>{workouts.length ? <ul className={styles.workoutList}>{workouts.map((workout) => <li key={workout.id}><div className={styles.workoutSummary}><div><strong>{workout.title}</strong><small>{workout.scheduled_date} · {names.get(workout.coach_user_id) ?? "Coach"}</small></div><span className={workout.status === "completed" ? styles.successPill : styles.mutedPill}>{workout.status.replaceAll("_"," ")}</span></div><ol className={styles.compactExercises}>{[...workout.workout_exercises].sort((a,b)=>a.sort_order-b.sort_order).map((exercise)=><li key={exercise.id}><span>{exercise.exercise_name}</span><small>{exercise.sets} × {exercise.reps} · {exercise.load ?? "Bodyweight"}</small></li>)}</ol></li>)}</ul> : <p className={styles.empty}>No workouts assigned yet.</p>}</section>}
    {tab === "notes" && <section className={styles.operationCard}><h3>Client notes</h3><p className={styles.empty}>{client?.bio || "No client About section yet."}</p><dl className={styles.factList}><div><dt>Current injuries</dt><dd>{intake?.current_injuries || "None recorded"}</dd></div><div><dt>Movement limitations</dt><dd>{intake?.movement_limitations || "None recorded"}</dd></div></dl></section>}
    {tab === "progress" && <><ProgressChart metrics={progressMetrics} /><section className={styles.operationCard}><h3>InBody history</h3>{bodyComposition.length ? <div className={styles.tableScroll} tabIndex={0}><table className={styles.previewTable}><thead><tr><th>Date</th><th>Weight (kg)</th><th>Muscle (kg)</th><th>Body fat</th><th>Score</th></tr></thead><tbody>{bodyComposition.map((row)=><tr key={row.measured_at}><td>{formatDate(row.measured_at)}</td><td>{row.weight_kg ?? "—"}</td><td>{row.skeletal_muscle_mass_kg ?? "—"}</td><td>{row.body_fat_percentage ?? "—"}%</td><td>{row.inbody_score ?? "—"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No measurements yet.</p>}</section></>}
  </DashboardShell>;
}
