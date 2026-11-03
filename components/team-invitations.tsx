"use client";

import { useActionState, useState, useTransition } from "react";
import { bulkInviteAction, refreshInvitationAction, revokeInvitationAction, type ActionState, type BulkInvitationState } from "@/app/auth/actions";
import { clearEmailInvitationsAction } from "@/app/owner/team/actions";
import { MutationActionForm } from "./mutation-action-form";
import { CopyLinkButton } from "./copy-link-button";
import styles from "./dashboard.module.css";

export type TeamInvitation = {
  id: string; email: string; role: "owner" | "coach" | "client";
  accepted_at: string | null; revoked_at: string | null; expires_at: string; delivery_status: string;
};

export function TeamInvitationList({ invitations, nowIso }: { invitations: TeamInvitation[]; nowIso: string }) {
  const [selection, setSelection] = useState<string[]>([]), [hidden, setHidden] = useState<string[]>([]);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = invitations.filter(i => !hidden.includes(i.id));
  const eligible = visible.filter(i => !i.accepted_at);
  const selected = selection.filter(id => eligible.some(i => i.id === id));
  function clear(ids: string[]) {
    if (pending || !ids.length || !window.confirm(`Clear ${ids.length} email invitation${ids.length === 1 ? "" : "s"}? Pending signup links will stop working. User accounts and memberships will not change.`)) return;
    setResult(null);
    startTransition(async () => {
      try {
        const next = await clearEmailInvitationsAction(ids);
        setResult(next);
        if (next.status === "success") { setHidden(old => [...old, ...ids]); setSelection([]); }
      } catch { setResult({ status: "error", message: "Clearing could not be confirmed. Refresh the list before retrying." }); }
    });
  }
  return <div aria-busy={pending}>
    <p className={styles.formHint}>Select pending, expired or revoked invitations below. Clearing stops pending signup links and keeps invitation history. Accepted accounts and memberships stay unchanged.</p>
    <div className={styles.accessActions}>
      <button className={styles.action} disabled={pending || !selected.length} onClick={() => clear(selected)}>{pending ? "Clearing…" : "Clear email invitations"}</button>
      {eligible.length > 0 && <label className={styles.checkboxLabel}><input type="checkbox" disabled={pending} checked={selected.length === eligible.length} onChange={event => setSelection(event.target.checked ? eligible.map(i => i.id) : [])} />Select all eligible invitations ({eligible.length})</label>}
    </div>
    <p className={styles.formHint}>{selected.length} selected</p>
    {result && <p className={`${styles.notice} ${result.status === "error" ? styles.error : ""}`} role={result.status === "error" ? "alert" : "status"}>{result.message}</p>}
    {visible.length ? <ul className={`${styles.list} ${styles.teamMembers}`} aria-label="Email invitations">{visible.map(invitation => {
      const status = invitation.accepted_at ? "accepted" : invitation.revoked_at ? "revoked" : invitation.expires_at <= nowIso ? "expired" : "pending";
      return <li key={invitation.id} data-invitation-id={invitation.id}>
        <div className={styles.invitationDetails}>
          <strong>{invitation.email}</strong>
          <small>{invitation.role} · {status} · expires {new Date(invitation.expires_at).toLocaleDateString("en-US", { timeZone: "UTC" })}</small>
          <small>{invitation.delivery_status === "not_configured" ? "Email not configured" : invitation.delivery_status === "failed" ? "Failed delivery" : invitation.delivery_status === "sent" ? "Submitted to email provider" : "Email pending"}</small>
          {!invitation.accepted_at && <label className={styles.checkboxLabel}><input type="checkbox" disabled={pending} checked={selected.includes(invitation.id)} aria-label={`Select ${invitation.role} invitation for ${invitation.email} (${status})`} onChange={event => setSelection(old => event.target.checked ? [...old, invitation.id] : old.filter(id => id !== invitation.id))} />Select to clear</label>}
          {["pending", "expired"].includes(status) && <InvitationControls id={invitation.id} />}
        </div>
        {!invitation.accepted_at && <button className={styles.textAction} disabled={pending} onClick={() => clear([invitation.id])}>Clear</button>}
        {["pending", "expired"].includes(status) && <MutationActionForm action={revokeInvitationAction.bind(null, invitation.id)} confirmMessage={`Revoke the ${invitation.role} invitation for ${invitation.email}?`} label="Revoke" />}
      </li>;
    })}</ul> : <p className={styles.empty}>No active email invitations. Cleared invitations remain in audit history.</p>}
  </div>;
}

export function BulkInvitations() {
  const [state, action, pending] = useActionState<BulkInvitationState, FormData>(bulkInviteAction, { status: "idle" });
  return <form action={action} className={styles.form}>
    <label className={styles.field}><span>Account role</span><select name="role" defaultValue="coach"><option value="coach">Coach</option><option value="client">Client</option><option value="owner">Additional Owner</option></select></label>
    <label className={styles.field}><span>Email addresses — one per line</span><textarea name="emails" rows={5} maxLength={10000} required placeholder={"coach@example.com\nclient@example.com"}/></label>
    <p className={styles.formHint}>Up to 25 people. Duplicate addresses in this list are skipped. Each invitation is locked to its recipient, role and gym.</p>
    <button className={styles.action} disabled={pending} type="submit">{pending ? "Sending…" : "Create invitations"}</button>
    {state.message && <p role="status" className={styles.notice}>{state.message}</p>}
    {state.results && <ul className={styles.activityList}>{state.results.map(item => <li key={item.email}><div><strong>{item.email}</strong><small>{item.status === "not_configured" ? "Email not configured — share the secure link" : item.status === "already_pending" ? "Existing pending invitation preserved — use its controls below" : item.status === "not_created" ? "Not created — check existing membership or invitation below" : item.status === "sent" ? "Submitted to email provider" : "Delivery failed"}</small>{item.invitationUrl && <a href={item.invitationUrl}>Open secure invitation</a>}</div>{item.invitationUrl && <CopyLinkButton label="Copy secure invitation link" url={item.invitationUrl}/>}</li>)}</ul>}
  </form>;
}

export function InvitationControls({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(refreshInvitationAction.bind(null, id), { status: "idle" });
  return <div><form action={action} className={styles.accessActions}>
    <button className={styles.secondaryAction} name="intent" value="resend" disabled={pending}>{pending ? "Sending…" : "Resend invitation"}</button>
    <button className={styles.secondaryAction} name="intent" value="copy" disabled={pending}>Prepare secure link</button>
  </form><small>Refreshing extends expiry and replaces the previous link.</small>
  {state.message && <p role="status">{state.message}</p>}
  {state.invitationUrl && <CopyLinkButton label="Copy secure invitation link" url={state.invitationUrl}/>}</div>;
}
