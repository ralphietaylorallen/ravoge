import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { dashboardForRole, getActiveMembership, getVerifiedUser, type AccountRole } from "@/lib/auth";
import { getEnrollmentHandoff } from "@/lib/enrollment";

import styles from "./auth-entry.module.css";

export async function InstallAccessPage({ role, status }: {
  role: Extract<AccountRole, "coach" | "client">;
  status?: string;
}) {
  const { supabase, userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId, supabase) : null;
  const handoff = await getEnrollmentHandoff();
  const enrollment = handoff?.enrollment.role === role ? handoff.enrollment : null;
  const label = role === "coach" ? "Coach" : "Client";
  const continueHref = membership ? dashboardForRole(membership.role) : enrollment ? "/launch" : "/login";

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
      ) : status === "invalid-invitation" || (handoff && !enrollment) ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This gym invitation is invalid, expired, revoked, or already used. Ask your gym for a new invitation.
        </p>
      ) : null}

      <PwaInstallButton className={styles.primaryAction} continueHref={continueHref} roleLabel={label} />

      <div className={styles.installGrid} data-install-instructions>
        <section><span>01</span><h2>Install</h2><p>Tap Install Ravoge. Android and Chromium use the native prompt when available.</p></section>
        <section><span>02</span><h2>iPhone or iPad</h2><p>In Safari, tap Share, then Add to Home Screen. If this opened inside another iOS app, rescan the QR with Camera to continue in Safari.</p></section>
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
          Install first, then open the Ravoge icon from your Home Screen to {enrollment.accountExists ? "sign in" : `create your ${label} account`}.
        </p>
      )}
      <p className={styles.intentNote}>The organization enrollment is authorized by this secure link. Your organization and role are resolved and validated server-side before membership is created.</p>
    </AuthEntryShell>
  );
}
