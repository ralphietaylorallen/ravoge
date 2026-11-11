import { BookingList, type BookingListItem } from "@/components/booking-list";
import { CoachBookingCalendar } from "@/components/coach-booking-calendar";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileThumbnailUrl as getProfileImageUrl } from "@/lib/profile-images";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  localDateInTimeZone,
  localDateStartIso,
  shiftLocalDate,
} from "@/lib/timezone";

import { monthDates, validLocalDate } from "@/lib/coach-availability";

export default async function CoachSchedulePage({ searchParams }: { searchParams: Promise<{ client?: string; duration?: string; date?: string; week?: string }> }) {
  const query = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");

  const [{ data: profile }, { data: organization }, { data: settings }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,address,timezone").eq("id", membership.organization_id).single(),
    supabase.from("organization_session_settings").select("default_duration_minutes,permitted_durations,slot_increment_minutes").eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("status", "active"),
  ]);

  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(new Date(), timezone);
  const requestedDate = query.date ?? query.week;
  const date = requestedDate && validLocalDate(requestedDate) ? requestedDate : today;
  const month = monthDates(date);
  const startDate = month[0];
  const endDate = shiftLocalDate(month.at(-1)!, 1)!;
  const startIso = localDateStartIso(startDate, timezone);
  const endIso = localDateStartIso(endDate, timezone);

  const assignedIds = [...new Set((assignments ?? []).map((row) => row.client_user_id))];
  const { data: clientRows } = assignedIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", assignedIds).order("full_name")
    : { data: [] };

  const clients = (clientRows ?? []).map((row) => ({
    id: row.id,
    name: row.preferred_name || row.full_name,
    avatar_path: row.avatar_path,
  }));

  const selectedClientId = clients.some((client) => client.id === query.client) ? query.client! : clients[0]?.id ?? "";
  const permittedDurations = settings?.permitted_durations?.length ? settings.permitted_durations : [60];
  const requestedDuration = Number(query.duration);
  const duration = permittedDurations.includes(requestedDuration)
    ? requestedDuration
    : settings?.default_duration_minutes ?? permittedDurations[0] ?? 60;

  const { data: bookingRows } = startIso && endIso
    ? await supabase
      .from("bookings")
      .select("id,client_user_id,starts_at,ends_at,timezone,status,session_type")
      .eq("organization_id", membership.organization_id)
      .eq("coach_user_id", userId)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(1000)
    : { data: [] };

  const profileMap = new Map(clients.map((client) => [client.id, client]));
  const imageMap = new Map(await Promise.all(clients.map(async (row) => [row.id, await getProfileImageUrl(supabase, row.avatar_path)] as const)));
  const coachName = profile?.preferred_name || profile?.full_name || "Coach";

  const bookings: BookingListItem[] = (bookingRows ?? []).map((row) => ({
    clientName: profileMap.get(row.client_user_id)?.name || "Client",
    clientPhotoUrl: imageMap.get(row.client_user_id),
    clientUserId: row.client_user_id,
    coachName,
    endsAt: row.ends_at,
    gymAddress: organization?.address,
    gymName: organization?.name ?? "Ravoge gym",
    id: row.id,
    startsAt: row.starts_at,
    status: row.status,
    timezone: row.timezone,
    sessionType: row.session_type,
  }));

  const { data: slots, error: availabilityError } = selectedClientId && date >= today
    ? await supabase.rpc("get_staff_booking_calendar", {
        target_client_user_id: selectedClientId,
        target_coach_user_id: userId,
        target_date: date,
        target_duration: duration,
      })
    : { data: [], error: null };

  const currentTime = new Date().getTime();
  const selectedDayBookings = bookings.filter((booking) => localDateInTimeZone(booking.startsAt, timezone) === date);

  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={coachName} role="coach">
    <div className={styles.pageHeading}>
      <div><p className={styles.eyebrow}>Coach schedule</p><h2>Calendar</h2></div>
      <p>Choose a Client, tap a date and an available time, confirm it, and Ravoge books the session to your Coach schedule.</p>
    </div>

    {clients.length ? <CoachBookingCalendar
      key={`${date}-${selectedClientId}-${duration}`}
      date={date}
      today={today}
      availabilityError={availabilityError ? "Availability could not be loaded. Refresh this page and try again." : undefined}
      bookings={bookings.map((booking) => ({
        id: booking.id,
        clientId: booking.clientUserId!,
        clientName: booking.clientName ?? "Client",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status,
        sessionType: booking.sessionType ?? "Private training",
      }))}
      clients={clients.map(({ id, name }) => ({ id, name }))}
      slots={slots ?? []}
      duration={duration}
      durations={permittedDurations}
      selectedClientId={selectedClientId}
      timezone={timezone}
    /> : <section className={styles.panel}><p className={styles.empty}>No Clients are currently assigned to this Coach.</p></section>}

    <section className={styles.workspaceSection}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Selected day</p><h3>Session details</h3></div></div>
      <BookingList currentTime={currentTime} bookings={selectedDayBookings} empty="No sessions on this date." perspective="coach" staffControls />
    </section>

    <section className={styles.workspaceSection}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Selected month</p><h3>Manage booked sessions</h3></div></div>
      <BookingList currentTime={currentTime} bookings={bookings.filter((booking) => Date.parse(booking.startsAt) >= currentTime)} empty="No upcoming sessions this month." perspective="coach" staffControls />
    </section>
  </DashboardShell>;
}
