import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { localDateInTimeZone, localDateStartIso, shiftLocalDate } from "@/lib/timezone";

type Search = { end?: string; range?: string; sort?: string; start?: string };
type Membership = { created_at: string; invitation_id: string | null; role: string; status: string; user_id: string };
type Booking = { client_user_id: string; coach_user_id: string; starts_at: string; status: string };
type Workout = { client_user_id: string; coach_user_id: string; completed_at: string | null; created_at: string; status: string };
type Intake = { client_user_id: string; completed_at: string; completed_by: string };
type State = { calculated_at: string; client_user_id: string; current_readiness: number };
type Body = { body_fat_mass_kg: number | null; body_fat_percentage: number | null; client_user_id: string; inbody_score: number | null; measured_at: string; skeletal_muscle_mass_kg: number | null; weight_kg: number | null };

function dateRange(search: Search, timezone: string) {
  const today = localDateInTimeZone(new Date(), timezone);
  const preset = new Set(["7", "30", "90"]).has(search.range ?? "") ? Number(search.range) : 30;
  const custom = search.range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(search.start ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(search.end ?? "");
  const startDate = custom ? search.start! : shiftLocalDate(today, -(preset - 1))!;
  const endDate = custom ? search.end! : today;
  const dayAfterEnd = shiftLocalDate(endDate, 1)!;
  return {
    days: Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1),
    endDate,
    endIso: localDateStartIso(dayAfterEnd, timezone)!,
    range: custom ? "custom" : String(preset),
    startDate,
    startIso: localDateStartIso(startDate, timezone)!,
  };
}

function firstByClient<T extends { client_user_id: string }>(rows: T[]) {
  const result = new Map<string, T>();
  rows.forEach((row) => { if (!result.has(row.client_user_id)) result.set(row.client_user_id, row); });
  return result;
}

export default async function OwnerReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [{ data: owner }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
  ]);
  const timezone = organization?.timezone ?? "America/Denver";
  const range = dateRange(search, timezone);
  const nowIso = new Date().toISOString();
  const [
    { data: membershipRows }, { data: assignmentRows }, { data: invitationRows },
    { data: bookingRows }, { data: allBookingRows }, { data: workoutRows },
    { data: allWorkoutRows }, { data: intakeRows }, { data: stateRows },
    { data: prescriptionRows }, { data: bodyRows },
  ] = await Promise.all([
    supabase.from("organization_memberships").select("user_id,role,status,created_at,invitation_id").eq("organization_id", organizationId),
    supabase.from("coach_client_assignments").select("coach_user_id,client_user_id,status").eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("organization_invitations").select("id,invited_by,accepted_at,accepted_by,role").eq("organization_id", organizationId).eq("role", "client"),
    supabase.from("bookings").select("coach_user_id,client_user_id,starts_at,status").eq("organization_id", organizationId).gte("starts_at", range.startIso).lt("starts_at", range.endIso),
    supabase.from("bookings").select("coach_user_id,client_user_id,starts_at,status").eq("organization_id", organizationId).order("starts_at", { ascending: false }),
    supabase.from("workout_assignments").select("coach_user_id,client_user_id,status,created_at,completed_at").eq("organization_id", organizationId).gte("created_at", range.startIso).lt("created_at", range.endIso),
    supabase.from("workout_assignments").select("coach_user_id,client_user_id,status,created_at,completed_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("client_intakes").select("client_user_id,completed_by,completed_at").eq("organization_id", organizationId).order("completed_at", { ascending: false }),
    supabase.from("client_states").select("client_user_id,current_readiness,calculated_at").eq("organization_id", organizationId).order("calculated_at", { ascending: false }),
    supabase.from("generated_prescriptions").select("coach_user_id,client_user_id,generated_at").eq("organization_id", organizationId).gte("generated_at", range.startIso).lt("generated_at", range.endIso),
    supabase.from("client_body_composition_assessments").select("client_user_id,measured_at,weight_kg,skeletal_muscle_mass_kg,body_fat_percentage,body_fat_mass_kg,inbody_score").eq("organization_id", organizationId).order("measured_at", { ascending: false }),
  ]);

  const memberships = (membershipRows ?? []) as Membership[];
  const bookings = (bookingRows ?? []) as Booking[];
  const allBookings = (allBookingRows ?? []) as Booking[];
  const workouts = (workoutRows ?? []) as Workout[];
  const allWorkouts = (allWorkoutRows ?? []) as Workout[];
  const intakes = (intakeRows ?? []) as Intake[];
  const states = (stateRows ?? []) as State[];
  const body = (bodyRows ?? []) as Body[];
  const activeCoaches = memberships.filter((row) => row.role === "coach" && row.status === "active");
  const activeClients = memberships.filter((row) => row.role === "client" && row.status === "active");
  const ids = [...new Set(memberships.map((row) => row.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", ids)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((row: { avatar_path: string | null; full_name: string; id: string; preferred_name: string | null }) => [row.id, row]));
  const photos = new Map(await Promise.all((profiles ?? []).map(async (row: { avatar_path: string | null; id: string }) => [row.id, await getProfileImageUrl(supabase, row.avatar_path)] as const)));
  const name = (id?: string) => id ? profileMap.get(id)?.preferred_name || profileMap.get(id)?.full_name || "Organization member" : "Unassigned";
  const coachByClient = new Map((assignmentRows ?? []).map((row: { client_user_id: string; coach_user_id: string }) => [row.client_user_id, row.coach_user_id]));
  const invitationById = new Map((invitationRows ?? []).map((row: { id: string; invited_by: string }) => [row.id, row]));
  const latestIntake = firstByClient(intakes);
  const latestState = firstByClient(states);
  const latestBody = firstByClient(body);
  const latestCompletedBooking = firstByClient(allBookings.filter((row) => row.status === "completed"));
  const latestCompletedWorkout = firstByClient(allWorkouts.filter((row) => row.status === "completed"));

  const coachMetrics = activeCoaches.map((coach) => {
    const assigned = [...coachByClient.values()].filter((id) => id === coach.user_id).length;
    const completed = bookings.filter((row) => row.coach_user_id === coach.user_id && row.status === "completed").length;
    return {
      assigned,
      average: assigned ? completed / assigned : 0,
      cancellations: bookings.filter((row) => row.coach_user_id === coach.user_id && row.status === "cancelled").length,
      coachId: coach.user_id,
      completed,
      intakes: intakes.filter((row) => row.completed_by === coach.user_id && row.completed_at >= range.startIso && row.completed_at < range.endIso).length,
      invited: (invitationRows ?? []).filter((row: { accepted_at: string | null; invited_by: string }) => row.invited_by === coach.user_id && row.accepted_at && row.accepted_at >= range.startIso && row.accepted_at < range.endIso).length,
      prescriptions: (prescriptionRows ?? []).filter((row: { coach_user_id: string }) => row.coach_user_id === coach.user_id).length,
      scheduled: bookings.filter((row) => row.coach_user_id === coach.user_id && row.status === "scheduled").length,
      workouts: workouts.filter((row) => row.coach_user_id === coach.user_id).length,
    };
  }).sort((a, b) => search.sort === "clients" ? b.assigned - a.assigned : search.sort === "new" ? b.invited - a.invited : b.completed - a.completed);

  const clientMetrics = activeClients.map((client) => {
    const completed = bookings.filter((row) => row.client_user_id === client.user_id && row.status === "completed").length;
    const measurements = body.filter((row) => row.client_user_id === client.user_id).reverse();
    const invitation = client.invitation_id ? invitationById.get(client.invitation_id) : undefined;
    return {
      bodyFirst: measurements[0],
      bodyLatest: latestBody.get(client.user_id),
      clientId: client.user_id,
      coachId: coachByClient.get(client.user_id),
      completed,
      intake: latestIntake.get(client.user_id),
      invitedBy: invitation ? name(invitation.invited_by) : "Owner setup / legacy",
      readiness: latestState.get(client.user_id)?.current_readiness,
      trainingFrequency: completed / Math.max(1, range.days / 7),
      workoutsCompleted: workouts.filter((row) => row.client_user_id === client.user_id && row.status === "completed").length,
    };
  });

  const reportNow = Date.parse(nowIso);
  const fourteenDaysAgo = reportNow - 14 * 86400000;
  const ninetyDaysAgo = reportNow - 90 * 86400000;
  const followUps = activeClients.flatMap((client) => {
    const reasons: string[] = [];
    const completed = latestCompletedBooking.get(client.user_id);
    const intake = latestIntake.get(client.user_id);
    const workout = latestCompletedWorkout.get(client.user_id);
    const hasFuture = allBookings.some((row) => row.client_user_id === client.user_id && row.status === "scheduled" && row.starts_at > nowIso);
    if (!completed || Date.parse(completed.starts_at) < fourteenDaysAgo) reasons.push(completed ? "No completed session in 14 days" : "No completed session recorded");
    if (!intake || Date.parse(intake.completed_at) < ninetyDaysAgo) reasons.push(intake ? "Reassessment overdue (90 days)" : "Initial intake not completed");
    if (!hasFuture) reasons.push("No future booking");
    if (!workout || Date.parse(workout.completed_at ?? workout.created_at) < fourteenDaysAgo) reasons.push("No recently completed workout");
    return reasons.length ? [{ clientId: client.user_id, coachId: coachByClient.get(client.user_id), lastActivity: completed?.starts_at ?? workout?.completed_at ?? workout?.created_at ?? client.created_at, reasons }] : [];
  });

  const completedSessions = bookings.filter((row) => row.status === "completed");
  const newClients = activeClients.filter((row) => row.created_at >= range.startIso && row.created_at < range.endIso).length;
  const uniqueClients = new Set(completedSessions.map((row) => row.client_user_id)).size;

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Factual organization reporting</p><h2>Reports</h2></div><p>{range.startDate} through {range.endDate} · {timezone}</p></div>
      <form className={styles.reportFilters}>
        <label className={styles.field}>Range<select defaultValue={range.range} name="range"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="custom">Custom</option></select></label>
        <label className={styles.field}>Start<input defaultValue={range.startDate} name="start" type="date" /></label>
        <label className={styles.field}>End<input defaultValue={range.endDate} name="end" type="date" /></label>
        <button className={styles.secondaryAction} type="submit">Apply</button>
      </form>

      <section className={styles.kpiGrid} aria-label="Gym activity">
        <article className={styles.metricCard}><span>Appointments</span><strong>{bookings.length}</strong><small>All statuses</small></article>
        <article className={styles.metricCard}><span>Completed</span><strong>{completedSessions.length}</strong><small>Recorded outcomes</small></article>
        <article className={styles.metricCard}><span>Cancellations</span><strong>{bookings.filter((row) => row.status === "cancelled").length}</strong><small>Cancelled appointments</small></article>
        <article className={styles.metricCard}><span>Unique Clients trained</span><strong>{uniqueClients}</strong><small>Completed sessions</small></article>
        <article className={styles.metricCard}><span>Active Coaches</span><strong>{activeCoaches.length}</strong><small>Current membership</small></article>
        <article className={styles.metricCard}><span>Active Clients</span><strong>{activeClients.length}</strong><small>{newClients} new in range</small></article>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Coach activity</p><h3>Operational metrics</h3></div><nav className={styles.sortLinks} aria-label="Sort Coach metrics"><Link href={`?range=${range.range}&start=${range.startDate}&end=${range.endDate}&sort=completed`}>Completed</Link><Link href={`?range=${range.range}&start=${range.startDate}&end=${range.endDate}&sort=clients`}>Clients</Link><Link href={`?range=${range.range}&start=${range.startDate}&end=${range.endDate}&sort=new`}>New Clients</Link></nav></div>
        <div className={styles.tableScroll} tabIndex={0}><table className={styles.reportTable}><thead><tr><th>Coach</th><th>Active Clients</th><th>Clients invited</th><th>Scheduled</th><th>Completed</th><th>Cancelled</th><th>Workouts</th><th>Intakes</th><th>Prescriptions</th><th>Avg / Client</th></tr></thead><tbody>{coachMetrics.map((coach) => <tr key={coach.coachId}><td><span className={styles.tableIdentity}><ProfilePhoto name={name(coach.coachId)} size="small" url={photos.get(coach.coachId)} />{name(coach.coachId)}</span></td><td>{coach.assigned}</td><td>{coach.invited}</td><td>{coach.scheduled}</td><td>{coach.completed}</td><td>{coach.cancellations}</td><td>{coach.workouts}</td><td>{coach.intakes}</td><td>{coach.prescriptions}</td><td>{coach.average.toFixed(1)}</td></tr>)}</tbody></table></div>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Client progress</p><h3>Training and assessment facts</h3></div></div>
        <div className={styles.tableScroll} tabIndex={0}><table className={styles.reportTable}><thead><tr><th>Client</th><th>Coach</th><th>Invited by</th><th>Sessions</th><th>Frequency</th><th>Latest intake</th><th>Readiness</th><th>Workouts</th><th>Body composition</th></tr></thead><tbody>{clientMetrics.map((client) => <tr key={client.clientId}><td><Link href={`/owner/clients/${client.clientId}`}>{name(client.clientId)}</Link></td><td>{name(client.coachId)}</td><td>{client.invitedBy}</td><td>{client.completed}</td><td>{client.trainingFrequency.toFixed(1)} / week</td><td>{client.intake ? new Date(client.intake.completed_at).toLocaleDateString("en-US") : "Pending"}</td><td>{client.readiness === undefined ? "—" : `${Math.round(Number(client.readiness) * 100)}%`}</td><td>{client.workoutsCompleted}</td><td>{client.bodyLatest ? `Weight ${client.bodyFirst?.weight_kg ?? "—"} → ${client.bodyLatest.weight_kg ?? "—"} kg · Muscle ${client.bodyFirst?.skeletal_muscle_mass_kg ?? "—"} → ${client.bodyLatest.skeletal_muscle_mass_kg ?? "—"} kg · Fat ${client.bodyFirst?.body_fat_percentage ?? "—"} → ${client.bodyLatest.body_fat_percentage ?? "—"}%` : "No assessment"}</td></tr>)}</tbody></table></div>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Deterministic follow up</p><h3>Follow-up queue</h3></div><p>Rules: 14 days without a completed session/workout, 90-day reassessment, or no future booking.</p></div>
        {followUps.length ? <ul className={styles.activityList}>{followUps.map((item) => <li key={item.clientId}><div><strong>{name(item.clientId)}</strong><small>Coach: {name(item.coachId)} · {item.reasons.join(" · ")}</small></div><span>Last activity<time dateTime={item.lastActivity}>{new Date(item.lastActivity).toLocaleDateString("en-US")}</time><Link href={`/owner/clients/${item.clientId}`}>View Client</Link></span></li>)}</ul> : <p className={styles.empty}>No Clients meet the current deterministic follow-up rules.</p>}
      </section>
    </DashboardShell>
  );
}
