import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { dashboardForRole, getActiveMembership, getVerifiedUser, type AccountRole } from "@/lib/auth";
import { getEnrollmentHandoff } from "@/lib/enrollment";

import styles from "./auth-entry.module.css";

export async function InstallAccessPage({ invalidInvitation = false, role }: {
  invalidInvitation?: boolean;
  role: Extract<AccountRole, "coach" | "client">;
}) {
  const { supabase, userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId, supabase) : null;
  const handoff = await getEnrollmentHandoff();
  const invitation = handoff?.invitation.role === role ? handoff.invitation : null;
  const label = role === "coach" ? "Coach" : "Client";
  const continueHref = membership ? dashboardForRole(membership.role) : invitation ? "/launch" : "/login";

  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>Ravoge {label} App</p>
      <h1 className={styles.installHeading}>Install Ravoge</h1>
      <p className={styles.lede}>
        {invitation
          ? <>Join <strong>{invitation.organizationName}</strong> as {invitation.role}{role === "client" ? `, invited by ${invitation.inviterName}` : ""}.</>
          : `Ravoge is an installable, secure web app built for ${role === "coach" ? "gym iPads and coach phones" : "a client’s phone"}.`}
      </p>

      {invalidInvitation || (handoff && !invitation) ? (
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

      <div className={styles.installActions}>
        <Link className={styles.installSecondary} href={continueHref}>
          {membership ? "Open Ravoge" : invitation?.accountExists ? "Sign in with invited email" : invitation ? `Create ${label} account` : "Sign in"}
        </Link>
      </div>
      <p className={styles.intentNote}>Installing Ravoge does not grant access. Organization membership is validated server-side on every protected request.</p>
    </AuthEntryShell>
  );
}
