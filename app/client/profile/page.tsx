import { ProfileDetailsForm, ProfilePhotoForm } from "@/components/profile-forms";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { AnnouncementPreferences } from "@/components/announcement-preferences";

export default async function ClientProfilePage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: assignment }, { data: intakeRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name,bio,avatar_path,account_status").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("coach_user_id,status").eq("organization_id", membership.organization_id).eq("client_user_id", userId).eq("status", "active").limit(1).maybeSingle(),
    supabase.from("client_intakes").select("primary_goal,completed_at").eq("organization_id", membership.organization_id).eq("client_user_id", userId).order("version", { ascending: false }).limit(1),
  ]);
  const { data: coach } = assignment ? await supabase.from("profiles").select("full_name,preferred_name").eq("id", assignment.coach_user_id).maybeSingle() : { data: null };
  const imageUrl = await getProfileImageUrl(supabase, profile?.avatar_path);
  const name = profile?.preferred_name || profile?.full_name || "Client";
  const intake = intakeRows?.[0];
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={name} role="client">
    <div className={styles.profileHero}><ProfilePhotoForm imageUrl={imageUrl} name={name} role="client" /><div><p className={styles.eyebrow}>Client profile</p><h1 className={styles.detailTitle}>{name}</h1><p className={styles.profileMeta}>Training account details and your editable profile</p></div></div>
    <section className={styles.profileOverview}>
      <article className={styles.metricCard}><span>Primary goal</span><strong>{intake?.primary_goal?.replaceAll("_", " ") ?? "Pending"}</strong><small>Managed through your intake</small></article>
      <article className={styles.metricCard}><span>Your Coach</span><strong>{coach?.preferred_name || coach?.full_name || "Pending"}</strong><small>Assigned by your gym</small></article>
      <article className={styles.metricCard}><span>Intake / account</span><strong>{intake ? "Complete" : "Pending"}</strong><small>{membership.status} membership · {profile?.account_status ?? "active"} account</small></article>
    </section>
    <div className={`${styles.detailGrid} ${styles.workspaceSection}`}>
      <section className={styles.panel}><h2>About you</h2>{profile && <ProfileDetailsForm defaults={profile} role="client" />}<p className={styles.formHint}>Your gym manages your Coach, goals and account access.</p></section>
    </div>
    <AnnouncementPreferences />
  </DashboardShell>;
}
