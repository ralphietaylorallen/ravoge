import Link from "next/link";

import { BookingList, type BookingListItem } from "@/components/booking-list";
import { CancelBookingForm } from "@/components/schedule-forms";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

export default async function ClientSchedulePage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: bookingRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,address").eq("id", membership.organization_id).single(),
    supabase.from("bookings").select("id,coach_user_id,starts_at,ends_at,timezone,status").eq("organization_id", membership.organization_id).eq("client_user_id", userId).order("starts_at", { ascending: false }).limit(100),
  ]);
  const coachIds = [...new Set((bookingRows ?? []).map((row: { coach_user_id: string }) => row.coach_user_id))];
  const { data: coaches } = coachIds.length ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", coachIds) : { data: [] };
  const coachMap = new Map((coaches ?? []).map((row: { id: string; full_name: string; preferred_name: string | null; avatar_path: string | null }) => [row.id, row]));
  const imageMap = new Map(await Promise.all((coaches ?? []).map(async (row: { id: string; avatar_path: string | null }) => [row.id, await getProfileImageUrl(supabase, row.avatar_path)] as const)));
  const bookings: BookingListItem[] = (bookingRows ?? []).map((row: { id: string; coach_user_id: string; starts_at: string; ends_at: string; timezone: string; status: string }) => ({ coachName: coachMap.get(row.coach_user_id)?.preferred_name || coachMap.get(row.coach_user_id)?.full_name || "Coach", coachPhotoUrl: imageMap.get(row.coach_user_id), endsAt: row.ends_at, gymAddress: organization?.address, gymName: organization?.name ?? "Ravoge gym", id: row.id, startsAt: row.starts_at, status: row.status, timezone: row.timezone }));
  const currentTime = new Date().getTime();
  const upcoming = bookings.filter((booking) => booking.status === "scheduled" && Date.parse(booking.startsAt) >= currentTime).sort((a,b) => Date.parse(a.startsAt)-Date.parse(b.startsAt));
  const past = bookings.filter((booking) => booking.status !== "scheduled" || Date.parse(booking.startsAt) < currentTime);
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.preferred_name || profile?.full_name || "Client"} role="client">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Your training</p><h2>Schedule</h2></div><Link className={styles.action} href="/client/book">Book session</Link></div>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Upcoming</p><h3>Scheduled sessions</h3></div></div><BookingList bookings={upcoming} empty="No upcoming sessions." perspective="client" />{upcoming.map((booking) => <div className={styles.manageBooking} key={`manage-${booking.id}`}><Link className={styles.secondaryAction} href={`/client/book?reschedule=${booking.id}`}>Reschedule</Link><CancelBookingForm bookingId={booking.id} /></div>)}</section>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>History</p><h3>Past &amp; cancelled</h3></div></div><BookingList bookings={past} empty="No session history yet." perspective="client" /></section>
  </DashboardShell>;
}
