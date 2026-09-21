import Link from "next/link";

import { BookingForm } from "@/components/schedule-forms";
import { ProfilePhoto } from "@/components/profile-photo";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

function validDate(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(Date.now() + 86400000).toISOString().slice(0, 10); }

export default async function ClientBookPage({ searchParams }: { searchParams: Promise<{ date?: string; duration?: string; reschedule?: string }> }) {
  const params = await searchParams;
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: assignment }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("coach_user_id").eq("organization_id", membership.organization_id).eq("client_user_id", userId).eq("status", "active").limit(1).maybeSingle(),
    supabase.from("organization_session_settings").select("default_duration_minutes,permitted_durations").eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  const { data: coach } = assignment ? await supabase.from("profiles").select("full_name,preferred_name,avatar_path,bio,specialties").eq("id", assignment.coach_user_id).maybeSingle() : { data: null };
  const coachPhotoUrl = await getProfileImageUrl(supabase, coach?.avatar_path);
  const date = validDate(params.date);
  const allowed = settings?.permitted_durations ?? [30,45,60,90];
  const requestedDuration = Number(params.duration);
  const duration = allowed.includes(requestedDuration) ? requestedDuration : settings?.default_duration_minutes ?? 60;
  const { data: slots } = assignment && settings ? await supabase.rpc("get_client_booking_availability", { target_date: date, target_duration: duration }) : { data: [] };
  const clientName = profile?.preferred_name || profile?.full_name || "Client";
  const coachName = coach?.preferred_name || coach?.full_name || "Coach";
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={clientName} role="client">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{params.reschedule ? "Reschedule" : "Book session"}</p><h2>{params.reschedule ? "Choose a new time" : "Train with your Coach"}</h2></div><p>Availability is calculated from gym hours, Coach availability, closures, blocks, existing sessions, and buffer rules.</p></div>
    {coach ? <div className={styles.coachCard}><ProfilePhoto name={coachName} url={coachPhotoUrl} /><div><p className={styles.eyebrow}>Your Coach</p><h3>{coachName}</h3><p>{coach.bio || "Your assigned Ravoge Coach."}</p>{coach.specialties?.length ? <small>{coach.specialties.join(" · ")}</small> : null}</div></div> : <p className={`${styles.notice} ${styles.error}`}>A Coach must be assigned before you can book.</p>}
    <form className={styles.bookingFilters}><label className={styles.field}>Date<input defaultValue={date} name="date" type="date" /></label><label className={styles.field}>Duration<select defaultValue={duration} name="duration">{allowed.map((value: number) => <option key={value} value={value}>{value} minutes</option>)}</select></label>{params.reschedule && <input name="reschedule" type="hidden" value={params.reschedule} />}<button className={styles.secondaryAction} type="submit">Show times</button></form>
    <section className={styles.panel}><h2>{date} · {duration} minutes</h2>{slots?.length ? <BookingForm bookingId={params.reschedule} duration={duration} slots={slots} timezone={organization?.timezone ?? "UTC"} /> : <p className={styles.empty}>No valid times are available for this date. Try another day.</p>}</section>
    <Link className={styles.backLink} href="/client/schedule">← View your schedule</Link>
  </DashboardShell>;
}
