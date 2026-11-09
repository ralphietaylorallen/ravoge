import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PlanWorkoutForm } from "@/components/plan-workout-form";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

type ClientProfile = { id: string; full_name: string; preferred_name: string | null };
type PlannedWorkout = {
  id: string;
  client_user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  paired_workout_group_id: string | null;
};

export default async function CoachPlanWorkoutsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client: requestedClient } = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const clientIds = (assignments ?? []).map((row) => row.client_user_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name").in("id", clientIds).order("full_name")
    : { data: [] };
  const today = localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE);
  const { data: workoutRows } = await supabase
    .from("workout_assignments")
    .select("id,client_user_id,title,scheduled_date,scheduled_time,status,paired_workout_group_id")
    .eq("organization_id", membership.organization_id)
    .eq("coach_user_id", userId)
    .in("status", ["assigned", "in_progress"])
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time")
    .limit(100);

  const profileMap = new Map((clients ?? []).map((client: ClientProfile) => [client.id, client]));
  const options = (clients ?? []).map((client: ClientProfile) => ({
    id: client.id,
    name: client.preferred_name || client.full_name,
  }));
  const defaultClientId = options.some((client) => client.id === requestedClient) ? requestedClient : "";
  const planned = (workoutRows ?? []) as PlannedWorkout[];
  const plannedGroups = Array.from(planned.reduce((groups, workout) => {
    const key = workout.paired_workout_group_id || workout.id;
    const current = groups.get(key) || [];
    current.push(workout);
    groups.set(key, current);
    return groups;
  }, new Map<string, PlannedWorkout[]>()).values());
  const coachName = profile?.preferred_name || profile?.full_name || "Coach";

  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={coachName} role="coach">
    <div className={styles.pageHeading}>
      <div><p className={styles.eyebrow}>Coach programming</p><h2>Plan Workouts</h2></div>
      <p>Build a Client workout ahead of time. If a workout is already saved for that day, Ravoge opens it after readiness instead of generating another one.</p>
    </div>

    <section className={styles.panel}>
      <h2>Create planned workout</h2>
      {options.length ? <PlanWorkoutForm clients={options} defaultClientId={defaultClientId} /> : <p className={styles.empty}>Assign a Client to yourself before planning workouts.</p>}
    </section>

    <section className={styles.workspaceSection}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Saved plans</p><h3>Upcoming planned workouts</h3></div></div>
      {plannedGroups.length ? <ul className={styles.workoutList}>{plannedGroups.map((group) => {
        const workout = group[0];
        const clientNames = group.map((item) => {
          const client = profileMap.get(item.client_user_id);
          return client?.preferred_name || client?.full_name || "Client";
        }).join(" + ");
        const time = workout.scheduled_time ? workout.scheduled_time.slice(0, 5) : "Time not set";
        const status = group.some((item) => item.status === "in_progress") ? "in progress" : workout.status.replaceAll("_", " ");
        return <li key={workout.paired_workout_group_id || workout.id}><div className={styles.workoutSummary}><div><strong>{workout.title}</strong><time>{workout.scheduled_date} · {time} · {clientNames}</time></div><span>{status}</span></div><Link className={styles.inlineAction} href={`/coach/clients/${workout.client_user_id}/workouts/${workout.id}`}>Open workout →</Link></li>;
      })}</ul> : <p className={styles.empty}>No upcoming planned workouts.</p>}
    </section>
  </DashboardShell>;
}
