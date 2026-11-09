import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingList, type BookingListItem } from "./booking-list";
import { localDateInTimeZone, localDateStartIso, shiftLocalDate } from "@/lib/timezone";
import styles from "./dashboard.module.css";

type Client = { id: string; full_name: string; preferred_name: string | null };
export async function CoachDashboardSummary({ supabase, organizationId, userId, timezone, clients, photos }: { supabase: SupabaseClient; organizationId: string; userId: string; timezone: string; clients: Client[]; photos: Map<string, string | null> }) {
  const now = new Date();
  const today = localDateInTimeZone(now, timezone);
  const start = localDateStartIso(today, timezone)!;
  const end = localDateStartIso(shiftLocalDate(today, 1)!, timezone)!;
  const [bookings, workouts] = await Promise.all([
    supabase.from("bookings").select("id,client_user_id,starts_at,ends_at,timezone,status,session_type").eq("organization_id", organizationId).eq("coach_user_id", userId).gte("starts_at", start).neq("status", "cancelled").order("starts_at").limit(50),
    supabase.from("workout_assignments").select("id,client_user_id,title,scheduled_date,scheduled_time,status").eq("organization_id", organizationId).eq("coach_user_id", userId).in("status", ["assigned", "in_progress"]).gte("scheduled_date", today).order("scheduled_date").order("scheduled_time").limit(6),
  ]);
  const names = new Map(clients.map(c => [c.id, c.preferred_name || c.full_name]));
  const items: BookingListItem[] = (bookings.data ?? []).map(b => ({ id: b.id, clientUserId: b.client_user_id, clientName: names.get(b.client_user_id) || "Client", clientPhotoUrl: photos.get(b.client_user_id), startsAt: b.starts_at, endsAt: b.ends_at, status: b.status, sessionType: b.session_type, timezone, coachName: "You", gymName: "Private training" }));
  return <>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Coach dashboard</p><h2>Today’s coaching</h2><p className={styles.profileMeta}>{today} · {timezone}</p></div></div>
    <div className={styles.quickActions}><Link href="/coach/schedule">Book a Client →</Link><Link href="/coach/plan-workouts">Plan Workouts →</Link><Link href="/coach/availability">Set availability →</Link><Link href="/coach/add-client">Add Client →</Link></div>
    <div className={styles.overviewCards}>
      <section className={styles.operationCard}><h2>Today’s schedule</h2>{bookings.error ? <p role="alert">Your schedule could not be loaded. Reload to try again.</p> : <BookingList bookings={items.filter(b => Date.parse(b.startsAt) < Date.parse(end))} currentTime={now.getTime()} empty="No sessions booked today." perspective="coach" />}<Link className={styles.inlineAction} href="/coach/schedule">Open full schedule →</Link></section>
      <section className={styles.operationCard}><h2>Upcoming clients</h2>{bookings.error ? <p role="alert">Upcoming sessions could not be loaded.</p> : <BookingList bookings={items.filter(b => Date.parse(b.startsAt) >= Date.parse(end)).slice(0, 4)} empty="No upcoming sessions booked." perspective="coach" />}</section>
      <section className={styles.operationCard}><h2>Upcoming workouts</h2>{workouts.error ? <p role="alert">Workouts could not be loaded. Reload to try again.</p> : workouts.data?.length ? <ul className={styles.activityList}>{workouts.data.map(w => <li key={w.id}><div><Link href={`/coach/clients/${w.client_user_id}/workouts/${w.id}`}>{w.title}</Link><small>{names.get(w.client_user_id) || "Client"} · {w.scheduled_date}{w.scheduled_time ? ` · ${w.scheduled_time.slice(0, 5)}` : ""} · {w.status.replaceAll("_", " ")}</small></div></li>)}</ul> : <p className={styles.empty}>No upcoming workouts yet.</p>}</section>
    </div>
  </>;
}
