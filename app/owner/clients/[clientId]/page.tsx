import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientCoachAssignmentForm } from "@/components/client-coach-assignment-form";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

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

function level(score: number) {
  if (score < 0.4) return "Conservative";
  if (score < 0.7) return "Moderate";
  return "Developed";
}

export default async function OwnerClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!UUID_PATTERN.test(clientId)) notFound();
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;

  const { data: clientMembership } = await supabase
    .from("organization_memberships")
    .select("user_id,status")
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
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.from("profiles").select("full_name").eq("id", clientId).maybeSingle(),
    supabase.from("coach_client_assignments").select("coach_user_id,status").eq("organization_id", organizationId).eq("client_user_id", clientId).order("updated_at", { ascending: false }),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "coach").eq("status", "active").order("created_at"),
    supabase.from("client_intakes").select("version,completed_at,training_frequency_goal,primary_goal,experience_level,recent_consistency,current_injuries,movement_limitations").eq("organization_id", organizationId).eq("client_user_id", clientId).order("version", { ascending: false }).limit(1),
    supabase.from("client_states").select("training_experience,recovery_capacity,current_readiness,movement_tolerance,volume_tolerance,constraint_tags,confidence,calculated_at").eq("organization_id", organizationId).eq("client_user_id", clientId).order("calculated_at", { ascending: false }).limit(1),
    supabase.from("generated_prescriptions").select("id,title,status,generated_at,coach_user_id").eq("organization_id", organizationId).eq("client_user_id", clientId).order("generated_at", { ascending: false }),
    supabase.from("workout_assignments").select("id,title,scheduled_date,status,completed_at,coach_user_id,workout_exercises(id,exercise_name,sets,reps,load,sort_order)").eq("organization_id", organizationId).eq("client_user_id", clientId).order("scheduled_date", { ascending: false }),
    supabase.from("coach_client_assignment_audit").select("action,actor_user_id,coach_user_id,created_at").eq("organization_id", organizationId).eq("client_user_id", clientId).order("created_at", { ascending: false }).limit(12),
  ]);

  const assignments = (assignmentRows ?? []) as Assignment[];
  const activeAssignment = assignments.find((assignment) => assignment.status === "active");
  const coachIds = (coachMemberships ?? []).map((row: { user_id: string }) => row.user_id);
  const audits = (auditRows ?? []) as AuditEvent[];
  const profileIds = [...new Set([...coachIds, ...audits.map((row) => row.actor_user_id)])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile: { id: string; full_name: string }) => [profile.id, profile.full_name]));
  const coaches = coachIds.map((id) => ({ id, name: names.get(id) ?? "Coach" }));
  const intake = (intakeRows?.[0] ?? null) as Intake | null;
  const state = (stateRows?.[0] ?? null) as ClientState | null;
  const prescriptions = (prescriptionRows ?? []) as Prescription[];
  const workouts = (workoutRows ?? []) as Workout[];

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <Link className={styles.backLink} href="/owner/clients">← Back to clients</Link>
      <div className={styles.detailHeader}>
        <div><p className={styles.eyebrow}>Owner View · Client</p><h2 className={styles.detailTitle}>{client?.full_name ?? "Client"}</h2><p className={styles.profileMeta}>{activeAssignment ? `Primary coach: ${names.get(activeAssignment.coach_user_id) ?? "Assigned coach"}` : "Primary coach not assigned"}</p></div>
        <span className={clientMembership.status === "active" ? styles.statusPill : styles.mutedPill}>{clientMembership.status}</span>
      </div>
      <nav aria-label="Client oversight sections" className={styles.tabs}><a href="#overview">Overview</a><a href="#intake">Intake</a><a href="#state">State</a><a href="#prescriptions">Prescriptions</a><a href="#history">Workout history</a></nav>

      <section className={styles.profileOverview} id="overview">
        <article className={styles.metricCard}><span>Intake</span><strong>{intake ? `Version ${intake.version}` : "Pending"}</strong><small>{intake ? new Date(intake.completed_at).toLocaleDateString("en-US") : "No intake recorded"}</small></article>
        <article className={styles.metricCard}><span>Prescriptions</span><strong>{prescriptions.length}</strong><small>{prescriptions.filter((row) => row.status === "draft").length} awaiting coach review</small></article>
        <article className={styles.metricCard}><span>Workouts</span><strong>{workouts.length}</strong><small>{workouts.filter((row) => row.status === "completed").length} completed</small></article>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Organization management</p><h3>Primary coach assignment</h3></div><p>The change is authorized by the database and audited to your Owner identity.</p></div>
        <div className={styles.detailGrid}>
          <section className={styles.panel}><h2>Assign or reassign</h2><ClientCoachAssignmentForm clientId={clientId} coaches={coaches} currentCoachId={activeAssignment?.coach_user_id} /></section>
          <section className={styles.panel}><h2>Assignment activity</h2>{audits.length ? <ul className={styles.activityList}>{audits.map((event, index) => <li key={`${event.created_at}-${index}`}><div><strong>{event.action}</strong><small>{names.get(event.coach_user_id) ?? "Coach"}</small></div><span>{names.get(event.actor_user_id) ?? "Organization member"}<time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("en-US")}</time></span></li>)}</ul> : <p className={styles.empty}>No audited assignment changes yet.</p>}</section>
        </div>
      </section>

      <section className={styles.workspaceSection} id="intake">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Structured intake</p><h3>Client baseline</h3></div></div>
        {intake ? <div className={styles.stateGrid}>
          <article><span>Primary goal</span><strong>{intake.primary_goal.replaceAll("_", " ")}</strong></article>
          <article><span>Experience</span><strong>{intake.experience_level}</strong></article>
          <article><span>Recent consistency</span><strong>{intake.recent_consistency}</strong></article>
          <article><span>Weekly target</span><strong>{intake.training_frequency_goal} sessions</strong></article>
          <article><span>Current injuries</span><strong>{intake.current_injuries || "None recorded"}</strong></article>
          <article><span>Movement limits</span><strong>{intake.movement_limitations || "None recorded"}</strong></article>
        </div> : <p className={styles.empty}>No intake has been completed.</p>}
      </section>

      <section className={styles.workspaceSection} id="state">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Ravoge state</p><h3>Latest calculated summary</h3></div></div>
        {state ? <div className={styles.stateGrid}>
          <article><span>Training level</span><strong>{level(state.training_experience)}</strong></article><article><span>Recovery</span><strong>{level(state.recovery_capacity)}</strong></article><article><span>Readiness</span><strong>{level(state.current_readiness)}</strong></article><article><span>Volume tolerance</span><strong>{level(state.volume_tolerance)}</strong></article><article><span>Movement tolerance</span><strong>{level(state.movement_tolerance)}</strong></article><article><span>Confidence</span><strong>{state.confidence.overall ?? "Low"}</strong></article><article className={styles.stateConstraints}><span>Constraints</span><strong>{state.constraint_tags.length ? state.constraint_tags.join(", ").replaceAll("_", " ") : "None recorded"}</strong></article>
        </div> : <p className={styles.empty}>No calculated client state yet.</p>}
      </section>

      <section className={styles.workspaceSection} id="prescriptions">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Generated prescriptions</p><h3>Recommendation status</h3></div></div>
        {prescriptions.length ? <ul className={styles.activityList}>{prescriptions.map((prescription) => <li key={prescription.id}><div><strong>{prescription.title}</strong><small>Coach: {names.get(prescription.coach_user_id) ?? "Coach"}</small></div><span>{prescription.status}<time dateTime={prescription.generated_at}>{new Date(prescription.generated_at).toLocaleDateString("en-US")}</time></span></li>)}</ul> : <p className={styles.empty}>No prescriptions generated yet.</p>}
      </section>

      <section className={styles.workspaceSection} id="history">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Training record</p><h3>Workout history</h3></div></div>
        {workouts.length ? <ul className={styles.workoutList}>{workouts.map((workout) => <li key={workout.id}><div className={styles.workoutSummary}><div><strong>{workout.title}</strong><time dateTime={workout.scheduled_date}>{workout.scheduled_date} · {names.get(workout.coach_user_id) ?? "Coach"}</time></div><span>{workout.status.replaceAll("_", " ")}</span></div><ol className={styles.compactExercises}>{[...workout.workout_exercises].sort((a, b) => a.sort_order - b.sort_order).map((exercise) => <li key={exercise.id}><span>{exercise.exercise_name}</span><small>{exercise.sets} × {exercise.reps}{exercise.load !== null ? ` · ${exercise.load}` : ""}</small></li>)}</ol></li>)}</ul> : <p className={styles.empty}>No workout history yet.</p>}
      </section>
    </DashboardShell>
  );
}
