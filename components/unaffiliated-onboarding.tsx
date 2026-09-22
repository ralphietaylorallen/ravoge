import { logoutAction } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import { ProfileDetailsForm, ProfilePhotoForm } from "@/components/profile-forms";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireUnaffiliatedRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

import styles from "./dashboard.module.css";

export async function UnaffiliatedOnboarding({ role }: { role: "coach" | "client" }) {
  const { supabase, userId } = await requireUnaffiliatedRole(role);
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,preferred_name,bio,specialties,years_coaching,avatar_path")
    .eq("id", userId)
    .single();
  const imageUrl = await getProfileImageUrl(supabase, profile?.avatar_path);
  const name = profile?.preferred_name || profile?.full_name || (role === "coach" ? "Coach" : "Client");

  return (
    <main className={styles.onboardingShell}>
      <header className={styles.onboardingHeader}>
        <Logo />
        <form action={logoutAction}>
          <button className={styles.logout} type="submit">Log out</button>
        </form>
      </header>
      <section className={styles.onboardingFrame}>
        <div className={styles.profileHero}>
          <ProfilePhoto name={name} url={imageUrl} />
          <div>
            <p className={styles.eyebrow}>{role} onboarding</p>
            <h1 className={styles.detailTitle}>Your {role === "coach" ? "Coach" : "Ravoge"} profile is ready.</h1>
            <p className={styles.lede}>
              {role === "coach"
                ? "Accept a gym invitation to begin coaching."
                : "Join a gym with an invitation."}
            </p>
          </div>
        </div>
        <div className={styles.detailGrid}>
          <section className={styles.panel}>
            <h2>Photo</h2>
            <ProfilePhotoForm imageUrl={imageUrl} name={name} role={role} />
          </section>
          <section className={styles.panel}>
            <h2>Base profile</h2>
            {profile ? <ProfileDetailsForm defaults={profile} role={role} /> : null}
          </section>
        </div>
        <p className={styles.securityNote}>
          This profile does not grant gym access. A secure, email-bound invitation creates organization membership.
        </p>
      </section>
    </main>
  );
}
