"use client";

import { useActionState, useId, useState } from "react";

import {
  createClientInvitationAction,
  createCoachInvitationAction,
  createOwnerInvitationAction,
  type ActionState,
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
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(async (previous, form) => {
    try {
      const next = await invitationActions[role](previous, form);
      return next.invitationUrl || previous.recipientEmail !== String(form.get("email")).trim().toLowerCase()
        ? next : { ...previous, ...next };
    } catch {
      return { ...previous, status: "error", message: "The invitation request could not finish. Retry, or copy the secure link if one is shown below." };
    }
  }, { status: "idle" });
  return (
    <form action={action} aria-busy={pending} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={emailId}>Email</label>
        <input autoComplete="email" disabled={pending} id={emailId} name="email" onChange={event => setEmail(event.target.value)} required type="email" value={email} />
      </div>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Sending…" : state.emailDeliveryStatus === "failed" || state.emailDeliveryStatus === "not_configured" ? "Retry invitation" : state.invitationUrl ? "Resend invitation" : role === "coach" ? "Send Coach Invite" : role === "client" ? "Send invite" : "Invite owner"}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.message}
        </p>
      )}
      {state.invitationUrl && (
        <div className={styles.inviteResult}>
          <strong>
            {state.emailDeliveryStatus === "sent"
              ? "Accepted by email provider — pending account setup"
              : state.emailDeliveryStatus === "not_configured"
                ? "Email not configured"
                : "Email delivery failed"}
          </strong>
          <a href={state.invitationUrl}>Open secure invitation</a>
          <CopyLinkButton label="Copy secure invitation" url={state.invitationUrl} />
          {(role === "coach" || role === "client") && <QrCode label={`Ravoge ${role} invitation QR`} url={state.invitationUrl} />}
          <small>The opaque link is intended only for {state.recipientEmail}. Its organization and role are fixed in the database.</small>
        </div>
      )}
    </form>
  );
}
