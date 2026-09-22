import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { organizationTodayWindow, organizationWeekWindow } from "@/lib/timezone";

type BookingRow = {
  client_user_id: string;
  coach_user_id: string;
  starts_at: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
};

function bookingMetrics(rows: BookingRow[]) {
  return {
    appointments: rows.length,
    cancellations: rows.filter((row) => row.status === "cancelled").length,
    clients: new Set(rows.filter((row) => row.status !== "cancelled").map((row) => row.client_user_id)).size,
    coaches: new Set(rows.filter((row) => row.status !== "cancelled").map((row) => row.coach_user_id)).size,
    completed: rows.filter((row) => row.status === "completed").length,
    scheduled: rows.filter((row) => row.status === "scheduled").length,
  };
}

export default async function OwnerPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [{ data: profile }, { data: organization }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
    supabase.from("organization_memberships").select("role,status").eq("organization_id", organizationId),
  ]);
  const timezone = organization?.timezone ?? "America/Denver";
  const todayWindow = organizationTodayWindow(timezone);
  const weekWindow = organizationWeekWindow(timezone);
  const { data: bookingRows } = weekWindow
    ? await supabase
        .from("bookings")
        .select("client_user_id,coach_user_id,starts_at,status")
        .eq("organization_id", organizationId)
        .gte("starts_at", weekWindow.startIso)
        .lt("starts_at", weekWindow.endIso)
    : { data: [] };
  const weekRows = (bookingRows ?? []) as BookingRow[];
  const todayRows = todayWindow
    ? weekRows.filter((row) => row.starts_at >= todayWindow.startIso && row.starts_at < todayWindow.endIso)
    : [];
  const today = bookingMetrics(todayRows);
  const week = bookingMetrics(weekRows);
  const active = memberships?.filter((row: { status: string }) => row.status === "active") ?? [];
  const activeCoaches = active.filter((row: { role: string }) => row.role === "coach").length;
  const activeClients = active.filter((row: { role: string }) => row.role === "client").length;

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Live operations · {timezone}</p><h2>Today</h2></div>
        <p>Organization-wide session activity from Ravoge scheduling records. No estimated or placeholder values.</p>
      </div>
      <section className={styles.kpiGrid} aria-label="Today metrics">
        <article className={styles.metricCard}><span>Scheduled sessions</span><strong>{today.scheduled}</strong><small>{today.appointments} total appointments</small></article>
        <article className={styles.metricCard}><span>Completed sessions</span><strong>{today.completed}</strong><small>Completed today</small></article>
        <article className={styles.metricCard}><span>Cancelled sessions</span><strong>{today.cancellations}</strong><small>Cancelled today</small></article>
        <article className={styles.metricCard}><span>Coaches working</span><strong>{today.coaches}</strong><small>{activeCoaches} active Coaches</small></article>
        <article className={styles.metricCard}><span>Clients scheduled</span><strong>{today.clients}</strong><small>{activeClients} active Clients</small></article>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>This week</p><h3>Organization activity</h3></div><Link className={styles.inlineAction} href="/owner/reports">Open reports →</Link></div>
        <div className={styles.profileOverview}>
          <article className={styles.metricCard}><span>Appointments</span><strong>{week.appointments}</strong><small>{week.scheduled} still scheduled</small></article>
          <article className={styles.metricCard}><span>Completed</span><strong>{week.completed}</strong><small>Recorded session outcomes</small></article>
          <article className={styles.metricCard}><span>Cancellations</span><strong>{week.cancellations}</strong><small>Cancelled bookings</small></article>
          <article className={styles.metricCard}><span>Active Coaches</span><strong>{activeCoaches}</strong><small>Current organization access</small></article>
          <article className={styles.metricCard}><span>Active Clients</span><strong>{activeClients}</strong><small>Current organization access</small></article>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}><h2>Clients</h2><p className={styles.empty}>Review every Client, assigned Coach, activity, intake, and training history.</p><Link className={styles.inlineAction} href="/owner/clients">Open directory →</Link></section>
        <section className={styles.panel}><h2>Revenue foundation</h2><p className={styles.empty}>Configure session value and exact Coach compensation without processing payments.</p><Link className={styles.inlineAction} href="/owner/revenue">Open revenue →</Link></section>
        <section className={styles.panel}><h2>Beta setup</h2><p className={styles.empty}>Confirm team, equipment, scheduling, training history, and app access.</p><Link className={styles.inlineAction} href="/owner/setup">Review setup →</Link></section>
      </div>
    </DashboardShell>
  );
}
