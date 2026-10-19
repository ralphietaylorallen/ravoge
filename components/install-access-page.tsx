import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { InvitationRecovery } from "@/components/invitation-recovery";
import { dashboardForRole, getActiveMembership, getVerifiedUser, type AccountRole } from "@/lib/auth";
import { getEnrollmentHandoff } from "@/lib/enrollment";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";

import styles from "./auth-entry.module.css";

export async function InstallAccessPage({ enrollmentToken, role, status }: {
  enrollmentToken?: string;
  role: Extract<AccountRole, "coach" | "client">;
  status?: string;
}) {
  const { supabase, userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId, supabase) : null;
  const handoff = await getEnrollmentHandoff();
  const directEnrollment = enrollmentToken
    ? await getOrganizationEnrollmentContext(enrollmentToken)
    : null;
  const enrollment = enrollmentToken
    ? directEnrollment?.role === role ? directEnrollment : null
    : handoff?.enrollment.role === role ? handoff.enrollment : null;
  const label = role === "coach" ? "Coach" : "Client";
  const verifiedToken = enrollment ? enrollmentToken ?? handoff?.token : undefined;
  const continueHref = membership ? dashboardForRole(membership.role) : verifiedToken ? `/launch?enrollment=${encodeURIComponent(verifiedToken)}` : "/login";

  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>Ravoge {label} App</p>
      <h1 className={styles.installHeading}>Install Ravoge</h1>
      <p className={styles.lede}>
        {enrollment
          ? <>Join <strong>{enrollment.organizationName}</strong> as {enrollment.role}{enrollment.enrollmentKind === "email_invitation" && role === "client" ? `, invited by ${enrollment.inviterName}` : ""}.</>
          : `Ravoge is an installable, secure web app built for ${role === "coach" ? "gym iPads and coach phones" : "a client’s phone"}.`}
      </p>

      {status === "membership-conflict" ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This Ravoge account already belongs to a different gym or role. A QR cannot change an existing membership. Sign out and use the intended account.
        </p>
      ) : status === "invalid-invitation" || ((handoff || enrollmentToken) && !enrollment) ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This gym invitation is invalid, expired, revoked, or already used. Ask your gym for a new invitation.
        </p>
      ) : null}

      {(status === "invalid-invitation" || ((handoff || enrollmentToken) && !enrollment)) && <InvitationRecovery />}
      <PwaInstallButton className={styles.primaryAction} continueHref={continueHref} roleLabel={label} />

      <div className={styles.installGrid} data-install-instructions>
        <section><span>01</span><h2>Install</h2><p>Tap Install Ravoge. Android and Chromium use the native prompt when available.</p></section>
        <section><span>02</span><h2>iPhone or iPad</h2><p>Open in Safari → Share → Add to Home Screen → Add → open Ravoge. If this opened inside another iOS app, open this page in Safari first.</p></section>
        <section><span>03</span><h2>Continue securely</h2><p>Open the Ravoge icon. Your gym and role remain server-verified; your password is never stored in the link or QR.</p></section>
      </div>

      {membership || !enrollment ? (
        <div className={styles.installActions}>
          <Link className={styles.installSecondary} href={continueHref}>
            {membership ? "Open Ravoge" : "Sign in"}
          </Link>
        </div>
      ) : (
        <p className={styles.intentNote}>
          Install first, then open the Ravoge icon from your Home Screen to {enrollment.accountExists ? "sign in" : `create your ${label} account`}. Or <Link className={styles.installSecondary} href={continueHref}>Continue without installing</Link>.
        </p>
      )}
      <p className={styles.intentNote}>{enrollment ? "Your gym and role are verified from your invitation before membership is created." : role === "coach" ? "Ask your gym Owner for an invitation sent to your own email. Installing the app does not grant gym access." : "Use your gym’s Client QR or your individual invitation to join."}</p>
    </AuthEntryShell>
  );
}
