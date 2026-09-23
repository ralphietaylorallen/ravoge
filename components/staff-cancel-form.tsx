"use client";

import { useActionState } from "react";

import { cancelStaffBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";

import styles from "./dashboard.module.css";

export function StaffCancelForm({ bookingId, clientId, role }: { bookingId: string; clientId: string; role: "owner" | "coach" }) {
  const [state, action, pending] = useActionState<StaffScheduleState, FormData>(cancelStaffBookingAction.bind(null, role, bookingId, clientId), { status: "idle" });
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Cancel this session across all schedules?")) event.preventDefault(); }}>
    <button className={styles.secondaryAction} disabled={pending || state.status === "success"} type="submit">{pending ? "Cancelling…" : "Cancel"}</button>
    {state.message && <span role="status">{state.message}</span>}
  </form>;
}
