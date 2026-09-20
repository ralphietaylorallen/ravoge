import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Assignment = { client_user_id: string; status: "active" | "inactive" };
type Workout = { client_user_id: string; scheduled_date: string; status: string; title: string };
type Prescription = { client_user_id: string; generated_at: string; status: string; title: string };
type Invitation = { created_at: string; email: string; expires_at: string };

export default async function OwnerCoachDetailPage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  if (!UUID_PATTERN.test(coachId)) notFound();
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;

  const { data: coachMembership } = await supabase
    .from("organization_memberships")
    .select("user_id,status")
    .eq("organization_id", organizationId)
    .eq("user_id", coachId)
    .eq("role", "coach")
    .maybeSingle();
  if (!coachMembership) notFound();

  const [
    { data: owner },
    { data: coach },
    { data: organization },
    { data: assignmentRows },
    { data: workoutRows },
    { data: prescriptionRows },
    { data: invitationRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name").eq("id", coachId).maybeSingle(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.from("coach_client_assignments").select("client_user_id,status").eq("organization_id", organizationId).eq("coach_user_id", coachId).order("updated_at", { ascending: false }),
    supabase.from("workout_assignments").select("client_user_id,title,status,scheduled_date").eq("organization_id", organizationId).eq("coach_user_id", coachId).order("scheduled_date", { ascending: false }).limit(12),
    supabase.from("generated_prescriptions").select("client_user_id,title,status,generated_at").eq("organization_id", organizationId).eq("coach_user_id", coachId).order("generated_at", { ascending: false }).limit(12),
    supabase.from("organization_invitations").select("email,created_at,expires_at").eq("organization_id", organizationId).eq("invited_by", coachId).eq("role", "client").is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);

  const assignments = (assignmentRows ?? []) as Assignment[];
  const clientIds = [...new Set([
    ...assignments.map((row) => row.client_user_id),
    ...(workoutRows ?? []).map((row: Workout) => row.client_user_id),
    ...(prescriptionRows ?? []).map((row: Prescription) => row.client_user_id),
  ])];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", clientIds)
    : { data: [] };
  const names = new Map((clientProfiles ?? []).map((profile: { id: string; full_name: string }) => [profile.id, profile.full_name]));
  const activeClients = assignments.filter((assignment) => assignment.status === "active");
  const workouts = (workoutRows ?? []) as Workout[];
  const prescriptions = (prescriptionRows ?? []) as Prescription[];
  const invitations = (invitationRows ?? []) as Invitation[];

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <Link className={styles.backLink} href="/owner/team">← Back to team</Link>
      <div className={styles.detailHeader}>
        <div><p className={styles.eyebrow}>Owner View · Coach</p><h2 className={styles.detailTitle}>{coach?.full_name ?? "Coach"}</h2><p className={styles.profileMeta}>Operational oversight · you remain signed in as Owner</p></div>
        <span className={coachMembership.status === "active" ? styles.statusPill : styles.mutedPill}>{coachMembership.status}</span>
      </div>
      <section className={styles.profileOverview}>
        <article className={styles.metricCard}><span>Assigned clients</span><strong>{activeClients.length}</strong><small>Active primary assignments</small></article>
        <article className={styles.metricCard}><span>Recent workouts</span><strong>{workouts.length}</strong><small>Latest assignments shown below</small></article>
        <article className={styles.metricCard}><span>Pending client invites</span><strong>{invitations.length}</strong><small>Created by this coach</small></article>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Roster</p><h3>Assigned clients</h3></div></div>
        {activeClients.length ? <ul className={styles.directoryList}>{activeClients.map((assignment) => <li key={assignment.client_user_id}><div><Link href={`/owner/clients/${assignment.client_user_id}`}>{names.get(assignment.client_user_id) ?? "Client"}</Link><small>Open intake, state, prescriptions, and history</small></div><span className={styles.statusPill}>active</span></li>)}</ul> : <p className={styles.empty}>No active clients are assigned to this coach.</p>}
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.panel}>
          <h2>Recent workouts</h2>
          {workouts.length ? <ul className={styles.activityList}>{workouts.map((workout, index) => <li key={`${workout.client_user_id}-${workout.scheduled_date}-${index}`}><div><strong>{workout.title}</strong><Link href={`/owner/clients/${workout.client_user_id}`}>{names.get(workout.client_user_id) ?? "Client"}</Link></div><span>{workout.status.replaceAll("_", " ")}<time dateTime={workout.scheduled_date}>{workout.scheduled_date}</time></span></li>)}</ul> : <p className={styles.empty}>No workouts from this coach yet.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Recent prescriptions</h2>
          {prescriptions.length ? <ul className={styles.activityList}>{prescriptions.map((prescription, index) => <li key={`${prescription.client_user_id}-${prescription.generated_at}-${index}`}><div><strong>{prescription.title}</strong><Link href={`/owner/clients/${prescription.client_user_id}`}>{names.get(prescription.client_user_id) ?? "Client"}</Link></div><span>{prescription.status}<time dateTime={prescription.generated_at}>{new Date(prescription.generated_at).toLocaleDateString("en-US")}</time></span></li>)}</ul> : <p className={styles.empty}>No generated prescriptions from this coach yet.</p>}
        </section>
      </div>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Invitations</p><h3>Pending client access</h3></div></div>
        {invitations.length ? <ul className={styles.activityList}>{invitations.map((invitation) => <li key={`${invitation.email}-${invitation.created_at}`}><div><strong>{invitation.email}</strong><small>Client invitation</small></div><span>pending<time dateTime={invitation.expires_at}>Expires {new Date(invitation.expires_at).toLocaleDateString("en-US")}</time></span></li>)}</ul> : <p className={styles.empty}>No pending invitations created by this coach.</p>}
      </section>
    </DashboardShell>
  );
}
