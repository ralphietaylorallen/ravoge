import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { dashboardForRole, getActiveMembership, getVerifiedUser, type AccountRole } from "@/lib/auth";

import styles from "./auth-entry.module.css";

export async function InstallAccessPage({
  invitationToken,
  role,
}: {
  invitationToken?: string;
  role: Extract<AccountRole, "coach" | "client">;
}) {
  const { userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId) : null;
  const label = role === "coach" ? "Coach" : "Client";
  const signupHref = invitationToken ? `/signup/${role}?invite=${encodeURIComponent(invitationToken)}` : null;
  const loginHref = invitationToken ? `/login?invite=${encodeURIComponent(invitationToken)}` : "/login";
  const primaryHref = membership
    ? dashboardForRole(membership.role)
    : signupHref ?? loginHref;
  const primaryLabel = membership
    ? membership.role === role ? `Open ${label} App` : `Open ${membership.role} access`
    : signupHref ? `Accept ${label} invitation` : `Sign in to ${label} App`;

  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>Ravoge {label} App</p>
      <h1 className={styles.installHeading}>Train from any device.</h1>
      <p className={styles.lede}>Ravoge is an installable, secure web app built for {role === "coach" ? "gym iPads and coach phones" : "a client’s phone"}.</p>

      <div className={styles.installActions}>
        <Link className={styles.primaryAction} href={primaryHref}>{primaryLabel}<span aria-hidden="true">→</span></Link>
        {!membership && signupHref && <Link className={styles.installSecondary} href={loginHref}>Already have an account? Sign in</Link>}
      </div>

      <div className={styles.installGrid}>
        <section><span>01</span><h2>Open securely</h2><p>{invitationToken ? "Use the invitation above. The database verifies its intended email, gym, and role." : "Sign in with your own Ravoge account. This general link never grants a role or gym access."}</p></section>
        <section><span>02</span><h2>Add to Home Screen</h2><p>On iPhone or iPad, open in Safari, tap Share, then Add to Home Screen. In supported browsers, use Install App from the browser menu.</p></section>
        <section><span>03</span><h2>Launch Ravoge</h2><p>Open the new Ravoge icon. Your authenticated membership sends you to the correct private experience.</p></section>
      </div>
      <p className={styles.intentNote}>Installing Ravoge does not change authorization. Organization access is rechecked server-side on every protected request.</p>
    </AuthEntryShell>
  );
}
