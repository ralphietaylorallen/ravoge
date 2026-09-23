"use client";

import { useActionState } from "react";

import { claimClientAction, type StaffScheduleState } from "@/app/schedule/staff-actions";

import styles from "./dashboard.module.css";

export function ClaimClientForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<StaffScheduleState>(claimClientAction.bind(null, clientId), { status: "idle" });
  return <form action={action}>
    <button className={styles.secondaryAction} disabled={pending || state.status === "success"} type="submit">{pending ? "Assigning…" : "Assign to me"}</button>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
  </form>;
}
