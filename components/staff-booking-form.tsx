"use client";

import { useActionState } from "react";

import { createStaffBookingAction, rescheduleStaffBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";

import styles from "./dashboard.module.css";

type Slot = { starts_at: string; ends_at: string };

export function StaffBookingForm({ bookingId, clientId, coachId, duration, role, slots, timezone }: { bookingId?: string; clientId: string; coachId: string; duration: number; role: "owner" | "coach"; slots: Slot[]; timezone: string }) {
  const bound = bookingId ? rescheduleStaffBookingAction.bind(null, role, bookingId, clientId) : createStaffBookingAction.bind(null, role, clientId, coachId);
  const [state, action, pending] = useActionState<StaffScheduleState, FormData>(bound, { status: "idle" });
  return <form action={action} className={styles.form}>
    <input name="duration" type="hidden" value={duration} />
    <fieldset className={styles.choiceField}><legend>Available times</legend><div className={styles.slotGrid}>
      {slots.map((slot, index) => <label key={slot.starts_at}><input defaultChecked={index === 0} name="startsAt" required type="radio" value={slot.starts_at} /><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(slot.starts_at))}</span></label>)}
    </div></fieldset>
    <label className={styles.field}>Session note <span>Optional · no health details</span><textarea maxLength={1000} name="notes" rows={3} /></label>
    <button className={styles.action} disabled={pending || !slots.length} type="submit">{pending ? "Saving…" : bookingId ? "Confirm reschedule" : "Book session"}</button>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
  </form>;
}
