import type { Metadata } from "next";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { LoginForm } from "@/components/login-form";
import { getInvitationContext } from "@/lib/invitations";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = {
  title: "Login | Ravoge",
  description: "Return to Ravoge.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const invitation = invite ? await getInvitationContext(invite) : null;
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Ravoge access</p>
      <h1 className={styles.heading}>Welcome back</h1>
      {invite && !invitation ? (
        <p className={`${styles.formNotice} ${styles.formError}`} role="alert">
          This invitation is invalid or has expired. You can still sign in normally.
        </p>
      ) : null}
      <LoginForm
        invitationEmail={invitation?.email}
        invitationToken={invitation ? invite : undefined}
      />
    </AuthEntryShell>
  );
}
