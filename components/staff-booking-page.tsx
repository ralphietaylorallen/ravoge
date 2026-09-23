import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { RollingDateStrip } from "@/components/rolling-date-strip";
import { StaffBookingForm } from "@/components/staff-booking-form";
import { ProfilePhoto } from "@/components/profile-photo";
import { getProfileImageUrl } from "@/lib/profile-images";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone, shiftLocalDate } from "@/lib/timezone";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function StaffBookingPage({ clientId, role, searchParams, embedded = false }: { embedded?: boolean; clientId: string; role: "owner" | "coach"; searchParams: { coach?: string; date?: string; duration?: string; reschedule?: string } }) {
  if (!UUID.test(clientId)) notFound();
  const { membership, supabase, userId } = await requireRole(role);
  const organizationId = membership.organization_id;
  const [{ data: organization }, { data: clientMembership }, { data: actor }, { data: settings }, { data: assignments }] = await Promise.all([
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("user_id", clientId).eq("role", "client").eq("status", "active").maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organization_session_settings").select("default_duration_minutes,permitted_durations").eq("organization_id", organizationId).single(),
    supabase.from("coach_client_assignments").select("coach_user_id").eq("organization_id", organizationId).eq("client_user_id", clientId).eq("status", "active"),
  ]);
  if (!clientMembership || !settings) notFound();
  if (role === "coach" && !(assignments ?? []).some((row) => row.coach_user_id === userId)) notFound();
  const { data: coachMembers } = role === "owner" ? await supabase.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "coach").eq("status", "active") : { data: [{ user_id: userId }] };
  const { data: rescheduledBooking } = searchParams.reschedule && UUID.test(searchParams.reschedule) ? await supabase.from("bookings").select("id,coach_user_id,client_user_id,status").eq("id", searchParams.reschedule).eq("organization_id", organizationId).eq("client_user_id", clientId).eq("status", "scheduled").maybeSingle() : { data: null };
  if (searchParams.reschedule && !rescheduledBooking) notFound();
  const coachIds = (coachMembers ?? []).map((row) => row.user_id);
  const { data: people } = await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", [clientId, ...coachIds]);
  const names = new Map((people ?? []).map((row) => [row.id, row.preferred_name || row.full_name]));
  const coachId = rescheduledBooking?.coach_user_id ?? (role === "coach" ? userId : coachIds.includes(searchParams.coach ?? "") ? searchParams.coach! : (assignments?.[0]?.coach_user_id ?? coachIds[0]));
  if (role === "coach" && coachId !== userId) notFound();
  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(new Date(), timezone);
  const last = shiftLocalDate(today, 30)!;
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) && searchParams.date >= today && searchParams.date <= last ? searchParams.date : today;
  const allowed = settings.permitted_durations;
  const requestedDuration = Number(searchParams.duration);
  const duration = allowed.includes(requestedDuration) ? requestedDuration : settings.default_duration_minutes;
  const { data: slots } = coachId ? await supabase.rpc("get_staff_booking_availability", { target_client_user_id: clientId, target_coach_user_id: coachId, target_date: date, target_duration: duration }) : { data: [] };
  const basePath = `/${role}/clients/${clientId}${embedded ? "" : "/book"}`;
  const coachPhoto = await getProfileImageUrl(supabase, people?.find((person) => person.id === coachId)?.avatar_path);
  const content = <>
    {!embedded && <Link className={styles.backLink} href={`/${role}/clients/${clientId}`}>← Back to Client</Link>}
    <div className={styles.sectionHeading}><div><h2>Schedule session</h2><p className={styles.profileMeta}>Book a training session for {names.get(clientId) ?? "Client"}.</p></div></div>
    {coachId && <div className={styles.coachCard}><ProfilePhoto name={names.get(coachId) ?? "Coach"} url={coachPhoto} size="small" /><div><strong>{names.get(coachId) ?? "Coach"}</strong><p>{assignments?.some((assignment) => assignment.coach_user_id === coachId) ? "Assigned Coach" : "Session Coach"}</p></div>{role === "owner" && !rescheduledBooking && <details className={styles.changeCoach}><summary>Change session Coach</summary><form className={styles.form} method="get">{embedded && <input name="tab" type="hidden" value="schedule" />}<label className={styles.field}>Coach<select defaultValue={coachId} name="coach" required>{coachIds.map((id) => <option key={id} value={id}>{names.get(id) ?? "Coach"}</option>)}</select></label><input name="date" type="hidden" value={date} /><input name="duration" type="hidden" value={duration} /><button className={styles.secondaryAction} type="submit">Choose Coach</button></form></details>}</div>}
    {coachId ? <><RollingDateStrip basePath={basePath} selectedDate={date} today={today} timezone={timezone} duration={duration} durations={allowed} extraParams={{ ...(embedded ? {tab:"schedule"} : {}), ...(role === "owner" && !rescheduledBooking ? { coach: coachId } : {}), reschedule: rescheduledBooking?.id }} /><section className={styles.operationCard}><h3>Available times · {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {weekday:"long",month:"short",day:"numeric",timeZone:"UTC"})}</h3>{slots?.length ? <StaffBookingForm key={`${coachId}-${date}-${duration}`} bookingId={rescheduledBooking?.id} clientId={clientId} clientName={names.get(clientId) ?? "Client"} coachId={coachId} duration={duration} role={role} slots={slots} timezone={timezone} /> : <p className={styles.empty}>No open times for this date. Choose another day.</p>}</section></> : <p className={styles.empty}>Add an active Coach before scheduling.</p>}
  </>;
  return embedded ? content : <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={actor?.full_name ?? role} role={role}>{content}</DashboardShell>;
}
