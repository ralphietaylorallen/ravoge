import type { Metadata } from "next";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { PasswordResetRequestForm } from "@/components/password-form";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = { title: "Reset Password | Ravoge" };

export default function ResetPasswordPage() {
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Account recovery</p>
      <h1 className={styles.heading}>Reset password</h1>
      <p className={styles.lede}>We’ll send a secure recovery link if the account exists.</p>
      <PasswordResetRequestForm />
    </AuthEntryShell>
  );
}
