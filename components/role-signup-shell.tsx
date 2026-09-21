import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { SignupForm } from "@/components/signup-form";
import type { AccountRole } from "@/lib/auth";
import { getInvitationContext } from "@/lib/invitations";

import styles from "./auth-entry.module.css";

type RoleSignupShellProps = {
  accountType: "Gym Owner" | "Coach" | "Client";
  description: string;
  invitationToken?: string;
  role: AccountRole;
};

export async function RoleSignupShell({
  accountType,
  description,
  invitationToken,
  role,
}: RoleSignupShellProps) {
  const invitation = invitationToken
    ? await getInvitationContext(invitationToken)
    : null;
  const invitationIsValid = !invitationToken || invitation?.role === role;

  return (
    <AuthEntryShell>
      <Link className={styles.backAction} href="/signup">
        <span aria-hidden="true">←</span>
        Back
      </Link>

      <p className={styles.eyebrow}>Selected account type</p>
      <h1 className={styles.roleHeading}>{accountType}</h1>
      <p className={styles.lede}>{description}</p>

      {invitationIsValid ? (
        <SignupForm
          invitation={invitation ?? undefined}
          invitationToken={invitation ? invitationToken : undefined}
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
