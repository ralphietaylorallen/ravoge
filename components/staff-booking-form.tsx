"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BookingTimeSlots, type BookingSlot } from "@/components/booking-time-slots";

import { createStaffBookingAction, rescheduleStaffBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";

import styles from "./dashboard.module.css";
import calendar from "./coach-availability-calendar.module.css";

export function StaffBookingForm({ bookingId, clientId, clientName = "Client", coachId, duration, kind = "training", role, slots, timezone }: { bookingId?: string; clientId: string; clientName?: string; coachId: string; duration: number; kind?: "intake" | "training"; role: "owner" | "coach"; slots: BookingSlot[]; timezone: string }) {
  const bound = bookingId ? rescheduleStaffBookingAction.bind(null, role, bookingId, clientId) : createStaffBookingAction.bind(null, role, clientId, coachId);
  const [state, action, pending] = useActionState<StaffScheduleState, FormData>(bound, { status: "idle" });
  const [selectedSlot, setSelectedSlot] = useState("");
  const validSelection = slots.some(slot => slot.available && slot.starts_at === selectedSlot);
  const time = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
  const router = useRouter();
  useEffect(() => { if (state.status !== "idle") router.refresh(); }, [router, state]);
  return <form action={action} className={styles.form}>
    <input name="duration" type="hidden" value={duration} />
    <input name="kind" type="hidden" value={kind} />
    {role === "coach" ? <>
      <input type="hidden" name="startsAt" value={validSelection ? selectedSlot : ""} />
      <div className={calendar.slots}>{slots.map(slot => <button type="button" aria-pressed={validSelection && selectedSlot === slot.starts_at} disabled={!slot.available || pending || state.status === "success"} onClick={() => setSelectedSlot(slot.starts_at)} key={slot.starts_at}><strong>{time(slot.starts_at)} – {time(slot.ends_at)}</strong><span>{slot.available ? "Available" : "Unavailable"}</span></button>)}</div>
    </> : <BookingTimeSlots slots={slots} timezone={timezone} />}
    <label className={styles.field}>Session note <span>Optional · no health details</span><textarea maxLength={1000} name="notes" rows={3} /></label>
    <button aria-label={bookingId ? "Confirm reschedule" : `Book session for ${clientName}`} className={styles.action} disabled={pending || (role === "coach" && !validSelection) || !slots.some((slot) => slot.available) || state.status === "success"} type="submit">{pending ? "Saving…" : state.status === "success" ? "Session booked" : bookingId ? "Confirm reschedule" : "Book session"}</button>
    {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    {state.confirmedStartsAt && <p className={styles.formHint}>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(state.confirmedStartsAt))} · {timezone}{kind === "intake" && <> · <a href={`/${role}/clients/${clientId}?tab=intake`}>Open intake</a></>}</p>}
  </form>;
}
