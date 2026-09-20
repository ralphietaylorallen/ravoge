"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import styles from "./auth-entry.module.css";

export function LoginForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
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

      <button className={styles.primaryAction} type="submit">
        Login
        <span aria-hidden="true">→</span>
      </button>

      {submitted && (
        <p aria-live="polite" className={styles.formNotice} role="status">
          Login is not connected yet. No access has been granted.
        </p>
      )}

      <div className={styles.formLinks}>
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/signup">
          Don’t have an account? <strong>Sign up</strong>
        </Link>
      </div>
    </form>
  );
}
