import { deleteCertificationAction } from "@/app/profile/actions";
import { CertificationForm, ProfileDetailsForm, ProfilePhotoForm } from "@/components/profile-forms";
import { ProfilePhoto } from "@/components/profile-photo";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

type Certification = { certification_name: string; credential_number: string | null; expiration_date: string | null; id: string; issue_date: string | null; issuing_organization: string; notes: string | null };

export default async function CoachProfilePage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: certificationRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name,bio,specialties,years_coaching,avatar_path").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("coach_certifications").select("id,certification_name,issuing_organization,credential_number,issue_date,expiration_date,notes").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).order("expiration_date"),
  ]);
  const imageUrl = await getProfileImageUrl(supabase, profile?.avatar_path);
  const name = profile?.preferred_name || profile?.full_name || "Coach";
  const certifications = (certificationRows ?? []) as Certification[];
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={name} role="coach">
    <div className={styles.profileHero}><ProfilePhoto name={name} url={imageUrl} /><div><p className={styles.eyebrow}>Coach profile</p><h2 className={styles.detailTitle}>{profile?.full_name ?? "Coach"}</h2><p className={styles.profileMeta}>{profile?.specialties?.length ? profile.specialties.join(" · ") : "Add your specialties and credentials"}</p></div></div>
    <div className={styles.detailGrid}>
      <section className={styles.panel}><h2>Photo</h2><ProfilePhotoForm role="coach" /></section>
      <section className={styles.panel}><h2>Profile details</h2>{profile && <ProfileDetailsForm defaults={profile} role="coach" />}</section>
    </div>
    <section className={styles.workspaceSection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Credentials</p><h3>Certifications</h3></div><p>Structured credentials for owner and assigned-client visibility. Ravoge does not externally verify them yet.</p></div>
      {certifications.length ? <ul className={styles.credentialList}>{certifications.map((certification) => <li key={certification.id}><div><strong>{certification.certification_name}</strong><span>{certification.issuing_organization}</span><small>{[certification.credential_number && `Credential ${certification.credential_number}`, certification.issue_date && `Issued ${certification.issue_date}`, certification.expiration_date && `Expires ${certification.expiration_date}`].filter(Boolean).join(" · ") || "Dates and credential number not supplied"}</small>{certification.notes && <p>{certification.notes}</p>}</div><form action={deleteCertificationAction.bind(null, certification.id)}><button className={styles.textAction} type="submit">Remove</button></form></li>)}</ul> : <p className={styles.empty}>No certifications added yet.</p>}
      <div className={styles.panel}><h2>Add certification</h2><CertificationForm /></div>
    </section>
  </DashboardShell>;
}
