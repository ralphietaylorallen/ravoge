"use client";

import { useActionState } from "react";

import { createInvitationAction } from "@/app/auth/actions";

import styles from "./dashboard.module.css";

export function InviteForm({ canInviteCoach }: { canInviteCoach: boolean }) {
  const [state, action, pending] = useActionState(createInvitationAction, {
    status: "idle" as const,
  });
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" required type="email" />
      </div>
      <div className={styles.field}>
        <label htmlFor="invite-role">Account type</label>
        <select defaultValue="client" id="invite-role" name="role">
          {canInviteCoach && <option value="coach">Coach</option>}
          <option value="client">Client</option>
        </select>
      </div>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Creating…" : "Create secure invite"}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.status === "success" ? `Invite link: ${state.message}` : state.message}
        </p>
      )}
    </form>
  );
}
