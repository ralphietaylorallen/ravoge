"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/app/auth/actions";

import styles from "./auth-entry.module.css";

export function LoginForm({
  invitationEmail,
  invitationToken = "",
}: {
  invitationEmail?: string;
  invitationToken?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, {
    status: "idle" as const,
  });

  return (
    <form action={action} className={styles.form}>
      {invitationToken && (
        <input name="invitationToken" type="hidden" value={invitationToken} />
      )}
      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          defaultValue={invitationEmail ?? ""}
          id="email"
          name="email"
          readOnly={Boolean(invitationEmail)}
          required
          type="email"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      <button className={styles.primaryAction} disabled={pending} type="submit">
        {pending ? "Signing in…" : "Login"}
        <span aria-hidden="true">→</span>
      </button>

      {state.message && (
        <p
          aria-live="polite"
          className={`${styles.formNotice} ${state.status === "error" ? styles.formError : ""}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}

      <div className={styles.formLinks}>
        <Link href="/reset-password">Forgot password?</Link>
        <Link href="/signup">
          Don’t have an account? <strong>Sign up</strong>
        </Link>
      </div>
    </form>
  );
}
