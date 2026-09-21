import { ProfileDetailsForm, ProfilePhotoForm } from "@/components/profile-forms";
import { ProfilePhoto } from "@/components/profile-photo";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

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
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={name} role="client">
    <div className={styles.profileHero}><ProfilePhoto name={name} url={imageUrl} /><div><p className={styles.eyebrow}>Client profile</p><h2 className={styles.detailTitle}>{name}</h2><p className={styles.profileMeta}>Training account details and your editable profile</p></div></div>
    <section className={styles.profileOverview}>
      <article className={styles.metricCard}><span>Primary goal</span><strong>{intake?.primary_goal?.replaceAll("_", " ") ?? "Pending"}</strong><small>Managed through your intake</small></article>
      <article className={styles.metricCard}><span>Assigned coach</span><strong>{coach?.preferred_name || coach?.full_name || "Pending"}</strong><small>Protected organization assignment</small></article>
      <article className={styles.metricCard}><span>Intake / account</span><strong>{intake ? "Complete" : "Pending"}</strong><small>{membership.status} membership · {profile?.account_status ?? "active"} account</small></article>
    </section>
    <div className={`${styles.detailGrid} ${styles.workspaceSection}`}>
      <section className={styles.panel}><h2>Photo</h2><ProfilePhotoForm role="client" /></section>
      <section className={styles.panel}><h2>About</h2>{profile && <ProfileDetailsForm defaults={profile} role="client" />}<p className={styles.securityNote}>Organization, role, coach assignment, goal, intake status, and account status cannot be changed here.</p></section>
    </div>
  </DashboardShell>;
}
