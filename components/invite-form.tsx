"use client";

import { useActionState, useId } from "react";

import {
  createClientInvitationAction,
  createCoachInvitationAction,
  createOwnerInvitationAction,
} from "@/app/auth/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { QrCode } from "@/components/qr-code";

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
  const emailHref = state.invitationUrl && state.recipientEmail
    ? `mailto:${encodeURIComponent(state.recipientEmail)}?subject=${encodeURIComponent(`Your Ravoge ${role} invitation`)}&body=${encodeURIComponent(`You have been invited to Ravoge. Open this secure, email-bound invitation:\n\n${state.invitationUrl}\n\nUse your own Ravoge account. No password is shared.`)}`
    : undefined;
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={emailId}>Email</label>
        <input autoComplete="email" id={emailId} name="email" required type="email" />
      </div>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Creating…" : role === "client" ? "Send invite" : `Invite ${role}`}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.message}
        </p>
      )}
      {state.status === "success" && state.invitationUrl && (
        <div className={styles.inviteResult}>
          <strong>
            {state.emailDeliveryStatus === "sent"
              ? "Email confirmed sent"
              : state.emailDeliveryStatus === "not_configured"
                ? "Email not configured"
                : "Email delivery failed"}
          </strong>
          <a href={state.invitationUrl}>Open secure invitation</a>
          <CopyLinkButton label="Copy secure invitation" url={state.invitationUrl} />
          {(role === "coach" || role === "client") && <QrCode label={`Ravoge ${role} invitation QR`} url={state.invitationUrl} />}
          {emailHref && <a className={styles.secondaryAction} href={emailHref}>Email invitation</a>}
          <small>The opaque link is intended only for {state.recipientEmail}. Its organization and role are fixed in the database.</small>
        </div>
      )}
    </form>
  );
}
