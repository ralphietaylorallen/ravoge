import { deleteClosureAction } from "@/app/schedule/actions";
import { BookingList, type BookingListItem } from "@/components/booking-list";
import { ClosureForm, OrganizationScheduleForm } from "@/components/schedule-forms";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import { MutationActionForm } from "@/components/mutation-action-form";

const defaults = { buffer_after_minutes: 0, buffer_before_minutes: 0, cancellation_cutoff_minutes: 720, default_duration_minutes: 60, maximum_advance_days: 60, minimum_notice_minutes: 120, permitted_durations: [30,45,60,90], slot_increment_minutes: 15 };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function OwnerSchedulePage({ searchParams }: { searchParams: Promise<{ coach?: string }> }) {
  const { coach: filterCoach } = await searchParams;
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [{ data: owner }, { data: organization }, { data: hours }, { data: settings }, { data: coachMembers }, { data: coachAvailability }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone,address").eq("id", organizationId).single(),
    supabase.from("organization_hours").select("day_of_week,is_closed,opens_at,closes_at").eq("organization_id", organizationId).order("day_of_week"),
    supabase.from("organization_session_settings").select("default_duration_minutes,permitted_durations,slot_increment_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_cutoff_minutes,buffer_before_minutes,buffer_after_minutes").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "coach").eq("status", "active"),
    supabase.from("coach_availability").select("id,coach_user_id,day_of_week,starts_at,ends_at").eq("organization_id", organizationId).order("coach_user_id").order("day_of_week").order("starts_at"),
  ]);
  const { data: closures } = await supabase.from("organization_special_hours").select("id,local_date,label").eq("organization_id", organizationId).gte("local_date", localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE)).order("local_date");
  let bookingQuery = supabase.from("bookings").select("id,coach_user_id,client_user_id,starts_at,ends_at,timezone,status").eq("organization_id", organizationId).order("starts_at").limit(200);
  if (filterCoach) bookingQuery = bookingQuery.eq("coach_user_id", filterCoach);
  const { data: bookingRows } = await bookingQuery;
  const ids = [...new Set([...(coachMembers ?? []).map((row: { user_id: string }) => row.user_id), ...(bookingRows ?? []).flatMap((row: { coach_user_id: string; client_user_id: string }) => [row.coach_user_id, row.client_user_id])])];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", ids) : { data: [] };
  const profileMap = new Map((profiles ?? []).map((row: { id: string; full_name: string; preferred_name: string | null; avatar_path: string | null }) => [row.id, row]));
  const imageMap = new Map(await Promise.all((profiles ?? []).map(async (row: { id: string; avatar_path: string | null }) => [row.id, await getProfileImageUrl(supabase, row.avatar_path)] as const)));
  const bookings: BookingListItem[] = (bookingRows ?? []).map((row: { id: string; coach_user_id: string; client_user_id: string; starts_at: string; ends_at: string; timezone: string; status: string }) => ({
    clientName: profileMap.get(row.client_user_id)?.preferred_name || profileMap.get(row.client_user_id)?.full_name || "Client", clientPhotoUrl: imageMap.get(row.client_user_id), clientUserId: row.client_user_id,
    coachName: profileMap.get(row.coach_user_id)?.preferred_name || profileMap.get(row.coach_user_id)?.full_name || "Coach", coachPhotoUrl: imageMap.get(row.coach_user_id), endsAt: row.ends_at, gymAddress: organization?.address, gymName: organization?.name ?? "Ravoge gym", id: row.id, startsAt: row.starts_at, status: row.status, timezone: row.timezone,
  }));
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Organization operations</p><h2>Master schedule</h2></div><p>One booking record powers this view, the Coach schedule, and the Client schedule.</p></div>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Today &amp; upcoming</p><h3>All sessions</h3></div><form><label className={styles.field}>Filter by Coach<select defaultValue={filterCoach ?? ""} name="coach"><option value="">All Coaches</option>{(coachMembers ?? []).map((row: { user_id: string }) => <option key={row.user_id} value={row.user_id}>{profileMap.get(row.user_id)?.preferred_name || profileMap.get(row.user_id)?.full_name || "Coach"}</option>)}</select></label><button className={styles.secondaryAction} type="submit">Apply</button></form></div><BookingList bookings={bookings} empty="No sessions match this view." perspective="owner" /></section>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Coach capacity</p><h3>Weekly availability</h3></div><p>Read-only organization view of each active Coach&apos;s recurring windows.</p></div>{coachAvailability?.length ? <ul className={styles.activityList}>{coachAvailability.map((row: { id: string; coach_user_id: string; day_of_week: number; starts_at: string; ends_at: string }) => <li key={row.id}><div><strong>{profileMap.get(row.coach_user_id)?.preferred_name || profileMap.get(row.coach_user_id)?.full_name || "Coach"}</strong><small>{days[row.day_of_week]} · {row.starts_at.slice(0,5)}–{row.ends_at.slice(0,5)}</small></div></li>)}</ul> : <p className={styles.empty}>No Coach availability has been added.</p>}</section>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Gym hours</p><h3>Scheduling rules</h3></div><p>Standard hours only. Overnight hours are intentionally not supported in beta.</p></div><OrganizationScheduleForm address={organization?.address} hours={hours ?? []} settings={settings ?? defaults} timezone={organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE} /></section>
    <section className={styles.workspaceSection}><div className={styles.detailGrid}><div className={styles.panel}><h2>Date-specific closures</h2><ClosureForm /></div><div className={styles.panel}><h2>Upcoming closures</h2>{closures?.length ? <ul className={styles.list}>{closures.map((closure: { id: string; label: string; local_date: string }) => <li key={closure.id}><span>{closure.local_date} · {closure.label}</span><MutationActionForm action={deleteClosureAction.bind(null, closure.id)} confirmMessage={`Remove the ${closure.local_date} closure?`} label="Remove" /></li>)}</ul> : <p className={styles.empty}>No upcoming closures.</p>}</div></div></section>
  </DashboardShell>;
}
