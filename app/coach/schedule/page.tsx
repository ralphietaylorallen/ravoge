import { BookingList, type BookingListItem } from "@/components/booking-list";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

export default async function CoachSchedulePage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: bookingRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,address").eq("id", membership.organization_id).single(),
    supabase.from("bookings").select("id,client_user_id,starts_at,ends_at,timezone,status").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).order("starts_at").limit(100),
  ]);
  const clientIds = [...new Set((bookingRows ?? []).map((row: { client_user_id: string }) => row.client_user_id))];
  const { data: clients } = clientIds.length ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", clientIds) : { data: [] };
  const profileMap = new Map((clients ?? []).map((row: { id: string; full_name: string; preferred_name: string | null; avatar_path: string | null }) => [row.id, row]));
  const imageMap = new Map(await Promise.all((clients ?? []).map(async (row: { id: string; avatar_path: string | null }) => [row.id, await getProfileImageUrl(supabase, row.avatar_path)] as const)));
  const coachName = profile?.preferred_name || profile?.full_name || "Coach";
  const bookings: BookingListItem[] = (bookingRows ?? []).map((row: { id: string; client_user_id: string; starts_at: string; ends_at: string; timezone: string; status: string }) => ({ clientName: profileMap.get(row.client_user_id)?.preferred_name || profileMap.get(row.client_user_id)?.full_name || "Client", clientPhotoUrl: imageMap.get(row.client_user_id), clientUserId: row.client_user_id, coachName, endsAt: row.ends_at, gymAddress: organization?.address, gymName: organization?.name ?? "Ravoge gym", id: row.id, startsAt: row.starts_at, status: row.status, timezone: row.timezone }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: bookings[0]?.timezone ?? "UTC" }).format(new Date());
  const todays = bookings.filter((booking) => new Intl.DateTimeFormat("en-CA", { timeZone: booking.timezone }).format(new Date(booking.startsAt)) === today);
  const currentTime = new Date().getTime();
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={coachName} role="coach"><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Coach schedule</p><h2>Sessions</h2></div><p>Your authorized appointments. Each opens the corresponding client profile.</p></div><section className={styles.panel}><h2>Today</h2><BookingList bookings={todays} empty="No sessions today." perspective="coach" /></section><section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Week &amp; upcoming</p><h3>Upcoming sessions</h3></div></div><BookingList bookings={bookings.filter((booking) => Date.parse(booking.startsAt) >= currentTime)} empty="No upcoming sessions." perspective="coach" /></section></DashboardShell>;
}
