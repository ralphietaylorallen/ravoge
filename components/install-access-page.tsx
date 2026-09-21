import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { dashboardForRole, getActiveMembership, getVerifiedUser, type AccountRole } from "@/lib/auth";
import { getInvitationContext } from "@/lib/invitations";

import styles from "./auth-entry.module.css";

export async function InstallAccessPage({
  invitationToken,
  role,
}: {
  invitationToken?: string;
  role: Extract<AccountRole, "coach" | "client">;
}) {
  const { supabase, userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId, supabase) : null;
  const label = role === "coach" ? "Coach" : "Client";
  const invitation = invitationToken ? await getInvitationContext(invitationToken) : null;
  const validInvitation = invitation?.role === role ? invitation : null;
  const signupHref = validInvitation
    ? `/signup/${role}?invite=${encodeURIComponent(invitationToken!)}`
    : `/signup/${role}`;
  const loginHref = validInvitation
    ? `/login?invite=${encodeURIComponent(invitationToken!)}`
    : "/login";
  const primaryHref = membership
    ? dashboardForRole(membership.role)
    : validInvitation ? signupHref : loginHref;
  const primaryLabel = membership
    ? membership.role === role ? `Open ${label} App` : `Open ${membership.role} access`
    : validInvitation ? `Accept ${label} invitation` : "Sign in";

  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>Ravoge {label} App</p>
      <h1 className={styles.installHeading}>Install Ravoge</h1>
      <p className={styles.lede}>Ravoge is an installable, secure web app built for {role === "coach" ? "gym iPads and coach phones" : "a client’s phone"}.</p>

      {invitationToken && !validInvitation ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This gym invitation is invalid or has expired. Installing Ravoge never grants gym access.
        </p>
      ) : null}

      <div className={styles.installActions}>
        <Link className={styles.primaryAction} href={primaryHref}>{primaryLabel}<span aria-hidden="true">→</span></Link>
        {!membership && validInvitation && <Link className={styles.installSecondary} href={loginHref}>Already have an account? Sign in</Link>}
        {!membership && !validInvitation && <Link className={styles.installSecondary} href={signupHref}>Create {label} account</Link>}
      </div>

      <div className={styles.installGrid}>
        <section><span>01</span><h2>Open in Safari</h2><p>On iPhone or iPad, open this page in Safari. A QR code opens Ravoge; it cannot silently install an app.</p></section>
        <section><span>02</span><h2>Tap Share</h2><p>Tap the Safari Share button, then choose Add to Home Screen.</p></section>
        <section><span>03</span><h2>Open the Ravoge icon</h2><p>Launch Ravoge from the new icon, then use your own account to sign in or create a {label} profile.</p></section>
      </div>
      <p className={styles.intentNote}>Installing Ravoge does not change authorization. Organization access is rechecked server-side on every protected request.</p>
    </AuthEntryShell>
  );
}
