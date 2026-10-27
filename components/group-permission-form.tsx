"use client";
import { useActionState } from "react";
import { setGroupPermissionAction } from "@/app/group-programming-actions";
import styles from "./group-programming.module.css";
export function GroupPermissionForm({ coachId, name, allowed }: { coachId: string; name: string; allowed: boolean }) {
  const [state, action, pending] = useActionState<{ status: "idle" | "success" | "error"; message?: string }, FormData>(setGroupPermissionAction.bind(null, coachId), { status: "idle" });
  return <div className={styles.permission}><strong>{name}</strong><form action={action}><label className={styles.check}><input type="checkbox" name="allowed" value="yes" defaultChecked={allowed} disabled={pending} aria-label={`${name}: Can manage Group Class Programming`} />Can manage Group Class Programming</label><button className={styles.button} disabled={pending}>{pending ? "Saving…" : "Save permission"}</button>{!pending && state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}</form></div>;
}
