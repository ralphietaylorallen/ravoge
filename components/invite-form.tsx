"use client";

import { useActionState, useId } from "react";

import {
  createClientInvitationAction,
  createCoachInvitationAction,
  createOwnerInvitationAction,
} from "@/app/auth/actions";

import styles from "./dashboard.module.css";

const invitationActions = {
  client: createClientInvitationAction,
  coach: createCoachInvitationAction,
  owner: createOwnerInvitationAction,
};

export function InviteForm({ role }: { role: keyof typeof invitationActions }) {
  const emailId = useId();
  const [state, action, pending] = useActionState(invitationActions[role], {
    status: "idle" as const,
  });
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={emailId}>Email</label>
        <input autoComplete="email" id={emailId} name="email" required type="email" />
      </div>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Creating…" : `Invite ${role}`}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.status === "success" ? `Invite link: ${state.message}` : state.message}
        </p>
      )}
    </form>
  );
}
