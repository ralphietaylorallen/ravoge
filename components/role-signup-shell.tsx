import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";

import styles from "./auth-entry.module.css";

type RoleSignupShellProps = {
  accountType: "Gym Owner" | "Coach" | "Client";
  description: string;
};

export function RoleSignupShell({
  accountType,
  description,
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

      <div
        aria-label={`${accountType} signup form placeholder`}
        className={styles.placeholder}
        role="region"
      >
        <span>Account setup</span>
        <h2>Signup form coming next</h2>
        <p>
          Secure account creation and invitation verification will be connected
          in a future authentication task.
        </p>
      </div>

      <p className={styles.intentNote}>
        This selection records no role and grants no Ravoge access.
      </p>
    </AuthEntryShell>
  );
}
