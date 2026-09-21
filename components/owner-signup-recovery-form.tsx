"use client";

import { useActionState } from "react";

import { recoverOwnerSignupAction } from "@/app/auth/actions";

import styles from "./auth-entry.module.css";

export function OwnerSignupRecoveryForm() {
  const [state, action, pending] = useActionState(recoverOwnerSignupAction, {
    status: "idle" as const,
  });

  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="organizationName">Gym name</label>
        <input
          autoComplete="organization"
          id="organizationName"
          name="organizationName"
          required
        />
      </div>

      <button className={styles.primaryAction} disabled={pending} type="submit">
        {pending ? "Completing setup…" : "Complete setup"}
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
    </form>
  );
}
