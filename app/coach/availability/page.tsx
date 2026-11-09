import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { availabilityForDate, monthDates, validLocalDate } from "@/lib/coach-availability";
import { localDateInTimeZone, localDateStartIso, shiftLocalDate } from "@/lib/timezone";

export default async function CoachAvailabilityPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const query = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  const [profile, organization] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
  ]);
  const timezone = organization.data?.timezone ?? "America/Denver";
  const today = localDateInTimeZone(new Date(), timezone);
  const date = query.date && validLocalDate(query.date) ? query.date : today;
  const dates = monthDates(date);
  const start = localDateStartIso(dates[0], timezone)!;
  const end = localDateStartIso(shiftLocalDate(dates.at(-1)!, 1)!, timezone)!;
  const loadExceptions = async () => {
    const data = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await supabase.from("coach_availability_exceptions").select("kind,starts_at,ends_at,label").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).lt("starts_at", end).gt("ends_at", start).order("id").range(offset, offset + 499);
      if (batch.error) return { data: [], error: batch.error };
      data.push(...(batch.data ?? []));
      if ((batch.data?.length ?? 0) < 500) return { data, error: null };
    }
  };
  const [windows, exceptions, hours, specials] = await Promise.all([
    supabase.from("coach_availability").select("day_of_week,starts_at,ends_at").eq("organization_id", membership.organization_id).eq("coach_user_id", userId),
    loadExceptions(),
    supabase.from("organization_hours").select("day_of_week,is_closed,opens_at,closes_at").eq("organization_id", membership.organization_id),
    supabase.from("organization_special_hours").select("local_date,is_closed,opens_at,closes_at").eq("organization_id", membership.organization_id).gte("local_date", dates[0]).lte("local_date", dates.at(-1)!),
  ]);
  const failed = [profile, organization, windows, exceptions, hours, specials].some(result => result.error);
  const days = Object.fromEntries(dates.map(d => [d, availabilityForDate(d, timezone, windows.data ?? [], exceptions.data ?? [], hours.data ?? [], specials.data ?? [])]));
  return <DashboardShell compact gymName={organization.data?.name ?? "Ravoge gym"} name={profile.data?.preferred_name || profile.data?.full_name || "Coach"} role="coach">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Coach schedule</p><h2>Availability</h2></div><p>Choose a date and tap the hours you can train. Saved times use the same availability system as Client bookings.</p></div>
    {failed ? <p className={`${styles.notice} ${styles.error}`} role="alert">Availability could not be loaded. Reload before editing.</p> : <CoachAvailabilityCalendar key={date} date={date} today={today} timezone={timezone} days={days} />}
  </DashboardShell>;
}
