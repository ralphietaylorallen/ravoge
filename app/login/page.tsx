import type { Metadata } from "next";

import { AuthEntryShell } from "@/components/auth-entry-shell";
import { LoginForm } from "@/components/login-form";

import styles from "@/components/auth-entry.module.css";

export const metadata: Metadata = {
  title: "Login | Ravoge",
  description: "Return to Ravoge.",
};

export default function LoginPage() {
  return (
    <AuthEntryShell>
      <p className={styles.eyebrow}>Ravoge access</p>
      <h1 className={styles.heading}>Welcome back</h1>
      <LoginForm />
    </AuthEntryShell>
  );
}
