"use client";

import { useActionState } from "react";

import styles from "./dashboard.module.css";

type MutationState = { message?: string; status: "idle" | "error" | "success" };

export function MutationActionForm({
  action,
  className = styles.textAction,
  confirmMessage,
  label,
  pendingLabel = "Working…",
}: {
  action: (state: MutationState, formData: FormData) => Promise<MutationState>;
  className?: string;
  confirmMessage?: string;
  label: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <button className={className} disabled={pending} type="submit">{pending ? pendingLabel : label}</button>
      {state.message ? <p aria-live="polite" className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
