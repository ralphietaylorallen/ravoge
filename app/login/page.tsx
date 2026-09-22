import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { LoginForm } from "@/components/login-form";
import { getEnrollmentHandoff } from "@/lib/enrollment";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = {
  title: "Login | Ravoge",
  description: "Return to Ravoge.",
  robots: { follow: false, index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollment?: string; invite?: string; status?: string }>;
}) {
  const { enrollment: enrollmentToken, invite, status } = await searchParams;
  if (invite) {
    const legacyEnrollment = await getOrganizationEnrollmentContext(invite);
    redirect(legacyEnrollment ? `/enroll/${legacyEnrollment.role}?token=${encodeURIComponent(invite)}` : "/login?status=invalid-invitation");
  }
  const enrollment = enrollmentToken
    ? await getOrganizationEnrollmentContext(enrollmentToken)
    : (await getEnrollmentHandoff())?.enrollment ?? null;
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Ravoge access</p>
      <h1 className={styles.heading}>Welcome back</h1>
      {status === "invalid-invitation" ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This invitation is invalid or has expired. You can still sign in normally.
        </p>
      ) : null}
      <LoginForm
        invitationEmail={enrollment?.email ?? undefined}
        invitationToken={enrollment ? enrollmentToken : undefined}
      />
    </AuthEntryShell>
  );
}
