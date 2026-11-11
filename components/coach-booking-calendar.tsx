"use client";

import { useActionState, useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createCoachCalendarBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";
import { localDateInTimeZone } from "@/lib/timezone";
import { bookingCalendarHref } from "@/lib/booking-calendar-navigation";
import { BookingMonthPicker, BookingDurationButtons, calendarDateLabel } from "./booking-month-picker";
import styles from "./dashboard.module.css";
import calendar from "./coach-availability-calendar.module.css";

type ClientOption = { id: string; name: string };
type CalendarSlot = { starts_at: string; ends_at: string; available: boolean };
type CalendarBooking = { id: string; clientId: string; clientName: string; startsAt: string; endsAt: string; status: string; sessionType: string };
const formatTime = (value: string, timezone: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));

export function CoachBookingCalendar({ bookings, clients, date, today, slots, duration, durations, selectedClientId, timezone, availabilityError }: {
  bookings: CalendarBooking[]; clients: ClientOption[]; date: string; today: string; slots: CalendarSlot[]; duration: number; durations: number[]; selectedClientId: string; timezone: string; availabilityError?: string;
}) {
  const router = useRouter();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const selectedClient = clients.find(client => client.id === selectedClientId);
  const selectedSlotObject = slots.find(slot => slot.starts_at === selectedSlot) ?? null;
  const dayBookings = bookings.filter(booking => localDateInTimeZone(booking.startsAt, timezone) === date);
  const counts: Record<string, number> = {};
  for (const booking of bookings) { const day = localDateInTimeZone(booking.startsAt, timezone); counts[day] = (counts[day] || 0) + 1; }
  const extraParams = { client: selectedClientId, duration: String(duration) };
  return <div className={calendar.layout}>
    <BookingMonthPicker date={date} today={today} timezone={timezone} basePath="/coach/schedule" extraParams={extraParams} counts={counts} />
    <section className={styles.panel} aria-label="Book a client session">
      <h2>{calendarDateLabel(date, { weekday: "long", month: "long", day: "numeric" })}</h2>
      <div className={calendar.bookingControls}>
        <label className={styles.field}><span>Client</span><select value={selectedClientId} onChange={event => router.push(bookingCalendarHref("/coach/schedule", date, { ...extraParams, client: event.target.value }))}>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <BookingDurationButtons date={date} duration={duration} durations={durations} basePath="/coach/schedule" extraParams={extraParams} />
      </div>
      <p className={styles.formHint}>Tap an available time, then confirm the booking. Existing sessions stay visible below. All times use {timezone}.</p>
      {availabilityError ? <p className={`${styles.notice} ${styles.error}`} role="alert">{availabilityError}</p> : <>
        {!slots.some(slot => slot.available) && <p className={styles.empty}>{date < today ? "Past dates are read only." : "No open times for this date. Choose another day or update your availability."}</p>}
        <div className={calendar.slots}>{slots.map(slot => <button type="button" key={slot.starts_at} aria-pressed={selectedSlot === slot.starts_at} disabled={!slot.available || date < today} onClick={() => setSelectedSlot(slot.starts_at)}>
          <strong>{formatTime(slot.starts_at, timezone)} – {formatTime(slot.ends_at, timezone)}</strong><span>{slot.available && date >= today ? "Available" : "Unavailable"}</span>
        </button>)}</div>
      </>}
      {dayBookings.length > 0 && <div className={calendar.dayBookings}><h3>Booked sessions</h3>{dayBookings.map(booking => <a key={booking.id} href={`/coach/clients/${booking.clientId}`}><strong>{booking.clientName}</strong><span>{formatTime(booking.startsAt, timezone)} – {formatTime(booking.endsAt, timezone)} · {booking.sessionType || "Training"}</span></a>)}</div>}
    </section>
    {selectedSlotObject && selectedClient && <BookingConfirmation key={`${selectedClient.id}-${selectedSlotObject.starts_at}`} selectedClient={selectedClient} selectedSlotObject={selectedSlotObject} duration={duration} timezone={timezone} onClose={() => setSelectedSlot(null)} />}
  </div>;
}

function BookingConfirmation({ selectedClient, selectedSlotObject, duration, timezone, onClose }: { selectedClient: ClientOption; selectedSlotObject: CalendarSlot; duration: number; timezone: string; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<StaffScheduleState, FormData>(createCoachCalendarBookingAction, { status: "idle" });
  useEffect(() => { if (state.status !== "idle") router.refresh(); }, [router, state]);
  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !pending) { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select, textarea, a[href]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className={styles.calendarConfirmBackdrop} role="dialog" aria-modal="true" aria-labelledby="booking-confirm-title" onKeyDown={handleDialogKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <form action={action} className={styles.calendarConfirmCard}>
        <div><p className={styles.eyebrow}>Confirm session</p><h3 id="booking-confirm-title">Book {selectedClient.name}</h3></div>
        <dl className={styles.calendarConfirmFacts}>
          <div><dt>Date & time</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(selectedSlotObject.starts_at))}</dd></div>
          <div><dt>Coach</dt><dd>You</dd></div>
          <div><dt>Length</dt><dd>{duration} minutes</dd></div>
        </dl>
        <input name="clientId" type="hidden" value={selectedClient.id} />
        <input name="startsAt" type="hidden" value={selectedSlotObject.starts_at} />
        <input name="duration" type="hidden" value={duration} />
        <label className={styles.field}><span>Session type</span><select defaultValue="training" name="kind"><option value="training">Training</option><option value="intake">Intake</option></select></label>
        <label className={styles.field}><span>Note <small>optional</small></span><textarea maxLength={1000} name="notes" rows={3} placeholder="Optional session note" /></label>
        {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
        <div className={styles.calendarConfirmActions}>
          <button autoFocus className={styles.secondaryAction} disabled={pending} type="button" onClick={() => onClose()}>{state.status === "success" ? "Done" : "Cancel"}</button>
          <button className={styles.action} disabled={pending || !selectedSlotObject.available || state.status === "success"} type="submit">{pending ? "Booking…" : state.status === "success" ? "Booked" : "Confirm & Book"}</button>
        </div>
      </form>
    </div>;
}
