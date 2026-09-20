import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { SignupForm } from "@/components/signup-form";
import type { AccountRole } from "@/lib/auth";

import styles from "./auth-entry.module.css";

type RoleSignupShellProps = {
  accountType: "Gym Owner" | "Coach" | "Client";
  description: string;
  invitationToken?: string;
  role: AccountRole;
};

export function RoleSignupShell({
  accountType,
  description,
  invitationToken,
  role,
}: RoleSignupShellProps) {
  return (
    <AuthEntryShell>
      <Link className={styles.backAction} href="/signup">
        <span aria-hidden="true">←</span>
        Back
      </Link>

      <p className={styles.eyebrow}>Selected account type</p>
      <h1 className={styles.roleHeading}>{accountType}</h1>
      <p className={styles.lede}>{description}</p>

      <SignupForm invitationToken={invitationToken} role={role} />

      <p className={styles.intentNote}>
        Account type selection is signup intent only. Your active database
        membership determines access.
      </p>
    </AuthEntryShell>
  );
}
