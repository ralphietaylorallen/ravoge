"use client";

import { useActionState } from "react";

import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/app/auth/actions";

import styles from "./auth-entry.module.css";

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, {
    status: "idle" as const,
  });
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input autoComplete="email" id="email" name="email" required type="email" />
      </div>
      <button className={styles.primaryAction} disabled={pending} type="submit">
        {pending ? "Sending…" : "Send recovery link"}
        <span aria-hidden="true">→</span>
      </button>
      {state.message && (
        <p className={`${styles.formNotice} ${state.status === "error" ? styles.formError : ""}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, {
    status: "idle" as const,
  });
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="password">New password</label>
        <input autoComplete="new-password" id="password" name="password" required type="password" />
      </div>
      <div className={styles.field}>
        <label htmlFor="confirmPassword">Confirm password</label>
        <input autoComplete="new-password" id="confirmPassword" name="confirmPassword" required type="password" />
      </div>
      <button className={styles.primaryAction} disabled={pending} type="submit">
        {pending ? "Updating…" : "Update password"}
        <span aria-hidden="true">→</span>
      </button>
      {state.message && (
        <p className={`${styles.formNotice} ${state.status === "error" ? styles.formError : ""}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
