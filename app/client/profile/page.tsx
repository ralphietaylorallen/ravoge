import Link from "next/link";
import { workoutCompletion, type ReportExercise } from "@/lib/session-report";
import { SessionReportHistory } from "@/components/session-report-history";
import { ProfileDetailsForm, ProfilePhotoForm } from "@/components/profile-forms";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { ProfilePhoto } from "@/components/profile-photo";
import { clientDayLabel, displayIntakeGoal } from "@/lib/client-display";
import { getProfileImageUrl } from "@/lib/profile-images";
import { AnnouncementPreferences } from "@/components/announcement-preferences";

import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import ui from "../client-home.module.css";

export default async function ClientProfilePage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: coaches }, intakeResult, sleep, session] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name,bio,avatar_path").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.rpc("get_my_assigned_coach"),
    supabase.from("client_intakes").select("primary_goal,completed_at").eq("organization_id", membership.organization_id).eq("client_user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("client_sleep_scores").select("log_date,score").eq("organization_id", membership.organization_id).eq("client_user_id", userId).order("log_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("workout_session_reports").select("workout_assignment_id,workout_date,exercises:source_snapshot->exercises").eq("organization_id", membership.organization_id).eq("client_user_id", userId).order("workout_date", { ascending: false }).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const coach = coaches?.[0];
  const coachName = coach?.preferred_name || coach?.full_name;
  const imageUrl = await getProfileImageUrl(supabase, profile?.avatar_path);
  const name = profile?.preferred_name || profile?.full_name || "Client";
  const intake = intakeResult.data;
  const savedDate = intake && localDateInTimeZone(intake.completed_at, organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE);
  const exercises = session.data?.exercises as ReportExercise[] | undefined;
  const sessionScore = Array.isArray(exercises) ? workoutCompletion(exercises).value : null;
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={name} role="client">
    <div className={ui.stack}>
      <header className={ui.identity}>
        <ProfilePhoto url={imageUrl} name={name} size="small" />
        <div>
          <h1>{name}</h1>
          {coachName && <p className={ui.muted}>Coach {coachName}</p>}
        </div>
      </header>
      <Link className={`${ui.surface} ${ui.intakeLink}`} href="/client/profile/intake" prefetch={false}>
        <span>
          <strong>View intake</strong>
          <small>{intakeResult.error ? "Status unavailable" : intake && savedDate ? `${displayIntakeGoal(intake.primary_goal)} · Saved ${clientDayLabel(savedDate, { year: "numeric" })}` : "No saved intake yet"}</small>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
      <section className={styles.clientScores} aria-labelledby="client-scores-heading">
        <h2 id="client-scores-heading">Your scores</h2>
        <article className={styles.metricCard}>
          <span>Latest workout completion</span>
          <strong>{session.error ? "Unavailable" : sessionScore === null ? "No score yet" : `${sessionScore}/100`}</strong>
          {session.data
            ? <Link className={styles.scoreLink} href={`/client/workouts/${session.data.workout_assignment_id}`}>{clientDayLabel(session.data.workout_date, { year: "numeric" })} workout report</Link>
            : <small>{session.error ? "Reload to try again." : "Workout reports show your recorded results."}</small>}
        </article>
        <article className={styles.metricCard}>
          <span>Latest sleep score</span>
          <strong>{sleep.error ? "Unavailable" : sleep.data ? `${sleep.data.score}/100` : "No score logged"}</strong>
          {sleep.data && <small>Logged for {clientDayLabel(sleep.data.log_date, { year: "numeric" })}</small>}
          <Link className={styles.scoreLink} href="/client/my-day#sleep">Log sleep</Link>
        </article>
      </section>
      <details className={`${ui.surface} ${ui.profileSettings}`}>
        <summary>Edit profile</summary>
        <ProfilePhotoForm imageUrl={imageUrl} name={name} role="client" />
        {profile && <ProfileDetailsForm defaults={profile} role="client" />}
      </details>
      <AnnouncementPreferences />
      <SessionReportHistory supabase={supabase} organizationId={membership.organization_id} clientId={userId} role="client"/>
    </div>
  </DashboardShell>;
}
