import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { SignupForm } from "@/components/signup-form";
import type { AccountRole } from "@/lib/auth";
import { getEnrollmentHandoff } from "@/lib/enrollment";

import styles from "./auth-entry.module.css";

type RoleSignupShellProps = {
  accountType: "Gym Owner" | "Coach" | "Client";
  description: string;
  invalidInvitation?: boolean;
  role: AccountRole;
};

export async function RoleSignupShell({
  accountType,
  description,
  invalidInvitation = false,
  role,
}: RoleSignupShellProps) {
  const handoff = await getEnrollmentHandoff();
  const invitation = handoff?.invitation.role === role ? handoff.invitation : null;
  const invitationIsValid = !invalidInvitation && (!handoff || Boolean(invitation));

  return (
    <AuthEntryShell>
      <Link className={styles.backAction} href="/signup">
        <span aria-hidden="true">←</span>
        Back
      </Link>

      <p className={styles.eyebrow}>{invitation ? "Secure gym invitation" : "Selected account type"}</p>
      <h1 className={styles.roleHeading}>{invitation ? `Join ${invitation.organizationName}` : accountType}</h1>
      <p className={styles.lede}>{invitation ? `${invitation.inviterName} invited you to join as ${invitation.role}.` : description}</p>

      {invitationIsValid ? (
        <SignupForm
          invitation={invitation ?? undefined}
          role={role}
        />
      ) : (
        <div className={styles.formNotice} role="alert">
          This invitation is invalid, expired, revoked, or intended for another account type.
        </div>
      )}

      <p className={styles.intentNote}>
        Account type is identity intent only. Active database membership determines gym access.
      </p>
    </AuthEntryShell>
  );
}
