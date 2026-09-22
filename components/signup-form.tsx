"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signupAction } from "@/app/auth/actions";
import type { AccountRole } from "@/lib/auth";
import type { EnrollmentContext } from "@/lib/invitations";

import styles from "./auth-entry.module.css";

export function SignupForm({
  enrollment,
  enrollmentToken,
  role,
}: {
  enrollment?: EnrollmentContext;
  enrollmentToken?: string;
  role: AccountRole;
}) {
  const action = signupAction.bind(null, role);
  const [state, formAction, pending] = useActionState(action, {
    status: "idle" as const,
  });

  return (
    <>
      {enrollment && (
        <p className={styles.invitationContext}>
          Join <strong>{enrollment.organizationName}</strong> as {enrollment.role}.
          {enrollment.enrollmentKind === "email_invitation" ? <> Invited by <strong>{enrollment.inviterName}</strong> ({enrollment.inviterRole}).</> : null}
        </p>
      )}
      <form action={formAction} className={styles.form}>
        {enrollmentToken ? <input name="invitationToken" type="hidden" value={enrollmentToken} /> : null}
        <div className={styles.field}>
          <label htmlFor="fullName">Full name</label>
          <input autoComplete="name" id="fullName" name="fullName" required />
        </div>

        {role === "owner" && !enrollment ? (
          <div className={styles.field}>
            <label htmlFor="organizationName">Gym name</label>
            <input id="organizationName" name="organizationName" required />
          </div>
        ) : null}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            autoComplete="email"
            defaultValue={enrollment?.email ?? ""}
            id="email"
            name="email"
            readOnly={Boolean(enrollment?.email)}
            required
            type="email"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input autoComplete="new-password" id="password" name="password" required type="password" />
        </div>
        <div className={styles.field}>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input autoComplete="new-password" id="confirmPassword" name="confirmPassword" required type="password" />
        </div>

        <button className={styles.primaryAction} disabled={pending} type="submit">
          {pending ? "Creating account…" : "Create account"}
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

      {enrollment && (
        <p className={styles.intentNote}>
          Already have a Ravoge account?{" "}
          <Link href={enrollmentToken ? `/login?enrollment=${encodeURIComponent(enrollmentToken)}` : "/login"}>
            Sign in to continue this enrollment.
          </Link>
        </p>
      )}
    </>
  );
}
