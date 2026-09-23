"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignClientCoachAction, type CoachAssignmentActionState } from "@/app/owner/actions";
import { ProfilePhoto } from "./profile-photo";
import styles from "./dashboard.module.css";

type CoachOption = { id: string; name: string; photo?: string | null; clientCount?: number };

export function ClientCoachAssignmentForm({ clientId, clientName = "Client", coaches, currentCoachId }: { clientId: string; clientName?: string; coaches: CoachOption[]; currentCoachId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [selected, setSelected] = useState(currentCoachId ?? "");
  const [state, action, pending] = useActionState<CoachAssignmentActionState, FormData>(assignClientCoachAction.bind(null, clientId), { status: "idle" });
  useEffect(() => { if (state.status === "success") { dialog.current?.close(); router.refresh(); trigger.current?.focus(); } }, [state, router]);
  return <>
    <button className={styles.action} onClick={() => dialog.current?.showModal()} ref={trigger} type="button">{currentCoachId ? "Change Coach" : "Assign Coach"}</button>
    {state.status === "success" && <div className={styles.assignmentSuccess}><p role="status">Coach assigned. Ready to book your first session.</p><Link className={styles.action} href={`/owner/clients/${clientId}?tab=schedule`}>Schedule first session →</Link></div>}
    <dialog aria-labelledby="assign-coach-title" className={styles.coachDialog} onClose={() => trigger.current?.focus()} ref={dialog}>
      <div className={styles.dialogHeading}><h2 id="assign-coach-title">Assign Coach to {clientName}</h2><button aria-label="Close Coach selection" className={styles.dialogClose} onClick={() => dialog.current?.close()} type="button">×</button></div>
      <form action={action}>
        <fieldset className={styles.coachChoices}><legend className={styles.srOnly}>Choose an active Coach</legend>{coaches.map((coach) => <label key={coach.id}><ProfilePhoto name={coach.name} size="small" url={coach.photo} /><span><strong>{coach.name}</strong><small>Coach{coach.clientCount !== undefined ? ` · ${coach.clientCount} active clients` : ""}</small></span><input checked={selected === coach.id} name="coachId" onChange={() => setSelected(coach.id)} required type="radio" value={coach.id} /></label>)}</fieldset>
        {!coaches.length && <p className={styles.empty}>No active Coaches are available. Invite a Coach from Team.</p>}
        {state.status === "error" && <p className={`${styles.notice} ${styles.error}`} role="alert">{state.message}</p>}
        <div className={styles.dialogActions}><button className={styles.secondaryAction} onClick={() => dialog.current?.close()} type="button">Cancel</button><button className={styles.action} disabled={pending || !selected} type="submit">{pending ? "Assigning…" : "Confirm assignment"}</button></div>
      </form>
    </dialog>
  </>;
}
