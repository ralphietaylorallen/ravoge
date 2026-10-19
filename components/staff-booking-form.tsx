"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { BookingTimeSlots, type BookingSlot } from "@/components/booking-time-slots";

import { createStaffBookingAction, rescheduleStaffBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";

import styles from "./dashboard.module.css";

export function StaffBookingForm({ bookingId, clientId, clientName = "Client", coachId, duration, kind = "training", role, slots, timezone }: { bookingId?: string; clientId: string; clientName?: string; coachId: string; duration: number; kind?: "intake" | "training"; role: "owner" | "coach"; slots: BookingSlot[]; timezone: string }) {
  const bound = bookingId ? rescheduleStaffBookingAction.bind(null, role, bookingId, clientId) : createStaffBookingAction.bind(null, role, clientId, coachId);
  const [state, action, pending] = useActionState<StaffScheduleState, FormData>(bound, { status: "idle" });
  const router = useRouter();
  useEffect(() => { if (state.status !== "idle") router.refresh(); }, [router, state]);
  return <form action={action} className={styles.form}>
    <input name="duration" type="hidden" value={duration} />
    <input name="kind" type="hidden" value={kind} />
    <BookingTimeSlots slots={slots} timezone={timezone} />
    <label className={styles.field}>Session note <span>Optional · no health details</span><textarea maxLength={1000} name="notes" rows={3} /></label>
    <button aria-label={bookingId ? "Confirm reschedule" : `Book session for ${clientName}`} className={styles.action} disabled={pending || !slots.some((slot) => slot.available) || state.status === "success"} type="submit">{pending ? "Saving…" : state.status === "success" ? "Session booked" : bookingId ? "Confirm reschedule" : "Book session"}</button>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    {state.confirmedStartsAt && <p className={styles.formHint}>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(state.confirmedStartsAt))} · {timezone}{kind === "intake" && <> · <a href={`/${role}/clients/${clientId}?tab=intake`}>Open intake</a></>}</p>}
  </form>;
}
