"use client";

import { useActionState } from "react";
import { bulkInviteAction, refreshInvitationAction, type ActionState, type BulkInvitationState } from "@/app/auth/actions";
import { CopyLinkButton } from "./copy-link-button";
import styles from "./dashboard.module.css";

export function BulkInvitations() {
  const [state, action, pending] = useActionState<BulkInvitationState, FormData>(bulkInviteAction, { status: "idle" });
  return <form action={action} className={styles.form}>
    <label className={styles.field}><span>Account role</span><select name="role" defaultValue="coach"><option value="coach">Coach</option><option value="client">Client</option><option value="owner">Additional Owner</option></select></label>
    <label className={styles.field}><span>Email addresses — one per line</span><textarea name="emails" rows={5} maxLength={10000} required placeholder={"coach@example.com\nclient@example.com"}/></label>
    <p className={styles.formHint}>Up to 25 people. Duplicate addresses in this list are skipped. Each invitation is locked to its recipient, role and gym.</p>
    <button className={styles.action} disabled={pending} type="submit">{pending ? "Preparing invitations…" : "Create invitations"}</button>
    {state.message && <p role="status" className={styles.notice}>{state.message}</p>}
    {state.results && <ul className={styles.activityList}>{state.results.map(item => <li key={item.email}><div><strong>{item.email}</strong><small>{item.status === "not_configured" ? "Email not configured — share the secure link" : item.status === "already_pending" ? "Existing pending invitation preserved — use its controls below" : item.status === "not_created" ? "Not created — check existing membership or invitation below" : item.status === "sent" ? "Submitted to email provider" : "Delivery failed"}</small>{item.invitationUrl && <a href={item.invitationUrl}>Open secure invitation</a>}</div>{item.invitationUrl && <CopyLinkButton label="Copy secure invitation link" url={item.invitationUrl}/>}</li>)}</ul>}
  </form>;
}

export function InvitationControls({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(refreshInvitationAction.bind(null, id), { status: "idle" });
  return <div><form action={action} className={styles.accessActions}>
    <button className={styles.secondaryAction} name="intent" value="resend" disabled={pending}>Resend invitation</button>
    <button className={styles.secondaryAction} name="intent" value="copy" disabled={pending}>Prepare secure link</button>
  </form><small>Refreshing extends expiry and replaces the previous link.</small>
  {state.message && <p role="status">{state.message}</p>}
  {state.invitationUrl && <CopyLinkButton label="Copy secure invitation link" url={state.invitationUrl}/>}</div>;
}
