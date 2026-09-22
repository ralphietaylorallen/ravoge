import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { SignupForm } from "@/components/signup-form";
import type { AccountRole } from "@/lib/auth";
import { getEnrollmentHandoff } from "@/lib/enrollment";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";

import styles from "./auth-entry.module.css";

type RoleSignupShellProps = {
  accountType: "Gym Owner" | "Coach" | "Client";
  description: string;
  enrollmentToken?: string;
  invalidInvitation?: boolean;
  role: AccountRole;
};

export async function RoleSignupShell({
  accountType,
  description,
  enrollmentToken,
  invalidInvitation = false,
  role,
}: RoleSignupShellProps) {
  const handoff = await getEnrollmentHandoff();
  const directEnrollment = enrollmentToken
    ? await getOrganizationEnrollmentContext(enrollmentToken)
    : null;
  const enrollment = enrollmentToken
    ? directEnrollment?.role === role ? directEnrollment : null
    : handoff?.enrollment.role === role ? handoff.enrollment : null;
  const enrollmentIsValid = !invalidInvitation && (!(handoff || enrollmentToken) || Boolean(enrollment));

  return (
    <AuthEntryShell>
      <Link className={styles.backAction} href="/signup">
        <span aria-hidden="true">←</span>
        Back
      </Link>

      <p className={styles.eyebrow}>{enrollment ? "Secure gym enrollment" : "Selected account type"}</p>
      <h1 className={styles.roleHeading}>{enrollment ? `Join ${enrollment.organizationName}` : accountType}</h1>
      <p className={styles.lede}>{enrollment ? `Create or use your own Ravoge account to join as ${enrollment.role}.` : description}</p>

      {enrollmentIsValid ? (
        <SignupForm
          enrollment={enrollment ?? undefined}
          enrollmentToken={enrollment ? enrollmentToken : undefined}
          role={role}
        />
      ) : (
        <div className={styles.formNotice} role="alert">
          This enrollment is invalid, expired, disabled, or intended for another account type.
        </div>
      )}

      <p className={styles.intentNote}>
        Account type is identity intent only. Active database membership determines gym access.
      </p>
    </AuthEntryShell>
  );
}
