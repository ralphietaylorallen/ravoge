import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { CoachCompensationForm, SessionPricingForm } from "@/components/revenue-forms";
import { requireRole } from "@/lib/auth";

type Compensation = {
  coach_user_id: string;
  commission_basis_points: number | null;
  currency: string;
  hourly_rate_minor: number | null;
  model: "none" | "hourly" | "percentage";
};
type BookingFinancial = {
  client_user_id: string;
  coach_compensation_minor: number | null;
  coach_user_id: string;
  currency: string | null;
  gym_retained_minor: number | null;
  id: string;
  payment_status: string;
  session_price_minor: number | null;
  starts_at: string;
  status: string;
};

function money(value: number | null, currency = "USD") {
  return value === null
    ? "NOT PRICED"
    : new Intl.NumberFormat("en-US", { currency, style: "currency" }).format(value / 100);
}

export default async function OwnerRevenuePage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [
    { data: owner }, { data: organization }, { data: pricing },
    { data: coachRows }, { data: compensationRows }, { data: bookingRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.from("organization_session_pricing").select("default_session_price_minor,currency").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "coach").eq("status", "active"),
    supabase.from("coach_compensation_configs").select("coach_user_id,model,hourly_rate_minor,commission_basis_points,currency").eq("organization_id", organizationId),
    supabase.from("bookings").select("id,coach_user_id,client_user_id,starts_at,status,session_price_minor,currency,coach_compensation_minor,gym_retained_minor,payment_status").eq("organization_id", organizationId).order("starts_at", { ascending: false }).limit(100),
  ]);
  const coachIds = (coachRows ?? []).map((row: { user_id: string }) => row.user_id);
  const clientIds = [...new Set((bookingRows ?? []).map((row: { client_user_id: string }) => row.client_user_id))];
  const profileIds = [...new Set([...coachIds, ...clientIds])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name").in("id", profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile: { full_name: string; id: string; preferred_name: string | null }) => [profile.id, profile.preferred_name || profile.full_name]));
  const compensations = new Map((compensationRows ?? []).map((row: Compensation) => [row.coach_user_id, row]));
  const bookings = (bookingRows ?? []) as BookingFinancial[];
  const priced = bookings.filter((booking) => booking.session_price_minor !== null);
  const sum = (selector: (booking: BookingFinancial) => number | null) => priced.reduce((total, booking) => total + (selector(booking) ?? 0), 0);
  const currency = pricing?.currency ?? "USD";

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Reporting foundation</p><h2>Revenue</h2></div><p>Exact session-value and estimated compensation snapshots. No payment processing occurs in Ravoge yet.</p></div>

      <section className={styles.kpiGrid} aria-label="Revenue snapshots">
        <article className={styles.metricCard}><span>Priced sessions</span><strong>{priced.length}</strong><small>Latest 100 appointments</small></article>
        <article className={styles.metricCard}><span>Session value</span><strong>{money(sum((row) => row.session_price_minor), currency)}</strong><small>Configured snapshots</small></article>
        <article className={styles.metricCard}><span>Coach estimate</span><strong>{money(sum((row) => row.coach_compensation_minor), currency)}</strong><small>Not payroll</small></article>
        <article className={styles.metricCard}><span>Gym retained</span><strong>{money(sum((row) => row.gym_retained_minor), currency)}</strong><small>Before external costs</small></article>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Organization pricing</p><h3>Default session value</h3></div><p>Applied as an immutable reporting snapshot when a new session is booked or rescheduled.</p></div>
        <div className={styles.panel}><SessionPricingForm priceMinor={pricing?.default_session_price_minor ?? null} /></div>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Coach compensation</p><h3>Per-Coach models</h3></div><p>Choose none, hourly, or percentage. All calculations use integer minor units and basis points.</p></div>
        <div className={styles.compensationGrid}>{coachIds.map((coachId) => <article className={styles.panel} key={coachId}><h2>{names.get(coachId) ?? "Coach"}</h2><CoachCompensationForm coachId={coachId} compensation={compensations.get(coachId)} /></article>)}</div>
        {!coachIds.length ? <p className={styles.empty}>No active Coaches are available.</p> : null}
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Session snapshots</p><h3>Latest appointments</h3></div><p>Unconfigured values remain NOT PRICED. Payment status is informational only.</p></div>
        <div className={styles.tableScroll} tabIndex={0}><table className={styles.reportTable}><thead><tr><th>Date</th><th>Coach</th><th>Client</th><th>Status</th><th>Session value</th><th>Coach estimate</th><th>Gym retained</th><th>Payment</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td>{new Date(booking.starts_at).toLocaleDateString("en-US")}</td><td>{names.get(booking.coach_user_id) ?? "Coach"}</td><td>{names.get(booking.client_user_id) ?? "Client"}</td><td>{booking.status}</td><td>{money(booking.session_price_minor, booking.currency ?? currency)}</td><td>{money(booking.coach_compensation_minor, booking.currency ?? currency)}</td><td>{money(booking.gym_retained_minor, booking.currency ?? currency)}</td><td>{booking.payment_status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>
        {!bookings.length ? <p className={styles.empty}>No appointment history yet.</p> : null}
      </section>
    </DashboardShell>
  );
}
