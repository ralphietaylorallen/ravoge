import type { Metadata } from "next";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { UpdatePasswordForm } from "@/components/password-form";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = { title: "Choose New Password | Ravoge" };

export default function UpdatePasswordPage() {
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Secure recovery</p>
      <h1 className={styles.heading}>Choose a new password</h1>
      <UpdatePasswordForm />
    </AuthEntryShell>
  );
}
