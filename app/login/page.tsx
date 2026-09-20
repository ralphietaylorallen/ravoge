import type { Metadata } from "next";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { LoginForm } from "@/components/login-form";

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
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Ravoge access</p>
      <h1 className={styles.heading}>Welcome back</h1>
      <LoginForm invitationToken={invite} />
    </AuthEntryShell>
  );
}
