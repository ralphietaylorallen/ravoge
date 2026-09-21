import { deleteAvailabilityAction, deleteAvailabilityExceptionAction } from "@/app/schedule/actions";
import { AvailabilityExceptionForm, AvailabilityWindowForm } from "@/components/schedule-forms";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { formatZonedDateTime } from "@/lib/timezone";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export default async function CoachAvailabilityPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: windows }, { data: exceptions }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_availability").select("id,day_of_week,starts_at,ends_at").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).order("day_of_week").order("starts_at"),
    supabase.from("coach_availability_exceptions").select("id,kind,starts_at,ends_at,label").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  const timezone = organization?.timezone ?? "America/Denver";
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.preferred_name || profile?.full_name || "Coach"} role="coach">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Coach schedule</p><h2>Availability</h2></div><p>Weekly windows are intersected with gym hours. Blocks, time off, bookings, closures, and buffers are removed automatically.</p></div>
    <div className={styles.detailGrid}><section className={styles.panel}><h2>Add weekly window</h2><AvailabilityWindowForm /></section><section className={styles.panel}><h2>Recurring availability</h2>{windows?.length ? <ul className={styles.list}>{windows.map((row: { id: string; day_of_week: number; starts_at: string; ends_at: string }) => <li key={row.id}><span>{days[row.day_of_week]} · {row.starts_at.slice(0,5)}–{row.ends_at.slice(0,5)}</span><form action={deleteAvailabilityAction.bind(null, row.id)}><button className={styles.textAction} type="submit">Remove</button></form></li>)}</ul> : <p className={styles.empty}>No weekly availability yet.</p>}</section></div>
    <section className={styles.workspaceSection}><div className={styles.detailGrid}><section className={styles.panel}><h2>Block or override</h2><AvailabilityExceptionForm timezone={timezone} /></section><section className={styles.panel}><h2>Upcoming exceptions</h2>{exceptions?.length ? <ul className={styles.activityList}>{exceptions.map((row: { id: string; kind: string; starts_at: string; ends_at: string; label: string | null }) => <li key={row.id}><div><strong>{row.label || row.kind.replaceAll("_", " ")}</strong><small>{formatZonedDateTime(row.starts_at, timezone)}–{formatZonedDateTime(row.ends_at, timezone, { hour: "numeric", minute: "2-digit", timeZone: timezone })}</small></div><form action={deleteAvailabilityExceptionAction.bind(null, row.id)}><button className={styles.textAction} type="submit">Remove</button></form></li>)}</ul> : <p className={styles.empty}>No upcoming exceptions.</p>}</section></div></section>
  </DashboardShell>;
}
