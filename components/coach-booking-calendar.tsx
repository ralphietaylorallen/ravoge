"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createCoachCalendarBookingAction, type StaffScheduleState } from "@/app/schedule/staff-actions";
import styles from "./dashboard.module.css";

type ClientOption = { id: string; name: string };
type CalendarSlot = { starts_at: string; ends_at: string; available: boolean };
type CalendarBooking = {
  id: string;
  clientId: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  sessionType: string;
};
type DayColumn = { date: string; label: string; shortLabel: string; slots: CalendarSlot[] };

const START_MINUTES = 5 * 60;
const END_MINUTES = 21 * 60;

function zonedParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${mapped.year}-${mapped.month}-${mapped.day}`,
    minutes: (Number(mapped.hour) % 24) * 60 + Number(mapped.minute),
  };
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

export function CoachBookingCalendar({
  bookings,
  clients,
  days,
  duration,
  durations,
  rowMinutes,
  selectedClientId,
  timezone,
  weekLabel,
  previousWeek,
  nextWeek,
}: {
  bookings: CalendarBooking[];
  clients: ClientOption[];
  days: DayColumn[];
  duration: number;
  durations: number[];
  rowMinutes: number;
  selectedClientId: string;
  timezone: string;
  weekLabel: string;
  previousWeek: string;
  nextWeek: string;
}) {
  const router = useRouter();
  const initial: StaffScheduleState = { status: "idle" };
  const [state, action, pending] = useActionState(createCoachCalendarBookingAction, initial);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "idle") router.refresh();
  }, [router, state.status]);

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const rowCount = Math.ceil((END_MINUTES - START_MINUTES) / rowMinutes);
  const timeLabels = useMemo(() => Array.from({ length: rowCount }, (_, index) => START_MINUTES + index * rowMinutes), [rowCount, rowMinutes]);

  function replaceParams(patch: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    router.push(`/coach/schedule?${params.toString()}`);
  }

  const selectedSlotObject = days.flatMap((day) => day.slots).find((slot) => slot.starts_at === selectedSlot) ?? null;

  return <section className={styles.calendarPanel}>
    <div className={styles.calendarToolbar}>
      <div>
        <p className={styles.eyebrow}>Weekly calendar</p>
        <h3>{weekLabel}</h3>
      </div>
      <div className={styles.calendarControls}>
        <label className={styles.field}><span>Client</span><select value={selectedClientId} onChange={(event) => replaceParams({ client: event.target.value })}>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className={styles.field}><span>Length</span><select value={duration} onChange={(event) => replaceParams({ duration: event.target.value })}>{durations.map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
        <div className={styles.calendarWeekButtons}>
          <button className={styles.secondaryAction} type="button" onClick={() => replaceParams({ week: previousWeek })}>← Previous</button>
          <button className={styles.secondaryAction} type="button" onClick={() => replaceParams({ week: nextWeek })}>Next →</button>
        </div>
      </div>
    </div>

    <p className={styles.formHint}>Select a Client, then tap an open time. Existing sessions stay visible on the Coach calendar.</p>

    <div className={styles.bigCalendarScroll}>
      <div
        className={styles.bigCalendar}
        style={{
          gridTemplateColumns: "4.75rem repeat(7, minmax(8.5rem, 1fr))",
          gridTemplateRows: `4.5rem repeat(${rowCount}, 1.55rem)`,
        }}
      >
        <div className={styles.calendarCorner}>Time</div>
        {days.map((day, index) => <div className={styles.calendarDayHeader} key={day.date} style={{ gridColumn: index + 2, gridRow: 1 }}><strong>{day.shortLabel}</strong><span>{day.label}</span></div>)}

        {timeLabels.map((minutes, index) => {
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;
          const label = new Date(Date.UTC(2020, 0, 1, hours, mins)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
          return <div className={styles.calendarTimeLabel} key={minutes} style={{ gridColumn: 1, gridRow: index + 2 }}>{mins === 0 || rowMinutes >= 30 ? label : ""}</div>;
        })}

        {days.map((day, dayIndex) => timeLabels.map((minutes, rowIndex) => <div className={styles.calendarCell} key={`${day.date}-${minutes}`} style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 2 }} />))}

        {days.flatMap((day, dayIndex) => day.slots.filter((slot) => slot.available).map((slot) => {
          const parts = zonedParts(slot.starts_at, timezone);
          const row = Math.floor((parts.minutes - START_MINUTES) / rowMinutes) + 2;
          if (row < 2 || row > rowCount + 1) return null;
          return <button
            aria-label={`Book ${selectedClient?.name ?? "Client"} on ${day.label} at ${formatTime(slot.starts_at, timezone)}`}
            className={styles.calendarOpenSlot}
            key={`${day.date}-${slot.starts_at}`}
            onClick={() => setSelectedSlot(slot.starts_at)}
            style={{ gridColumn: dayIndex + 2, gridRow: row }}
            type="button"
          >
            + {formatTime(slot.starts_at, timezone)}
          </button>;
        }))}

        {bookings.map((booking) => {
          const start = zonedParts(booking.startsAt, timezone);
          const end = zonedParts(booking.endsAt, timezone);
          const dayIndex = days.findIndex((day) => day.date === start.date);
          if (dayIndex < 0) return null;
          const startRow = Math.max(2, Math.floor((start.minutes - START_MINUTES) / rowMinutes) + 2);
          const span = Math.max(2, Math.ceil((Math.max(end.minutes, start.minutes + rowMinutes) - start.minutes) / rowMinutes));
          return <a
            className={styles.calendarBooking}
            href={`/coach/clients/${booking.clientId}`}
            key={booking.id}
            style={{ gridColumn: dayIndex + 2, gridRow: `${startRow} / span ${span}` }}
          >
            <strong>{booking.clientName}</strong>
            <span>{formatTime(booking.startsAt, timezone)} · {booking.sessionType || "Training"}</span>
          </a>;
        })}
      </div>
    </div>

    {selectedSlotObject && selectedClient && <div className={styles.calendarConfirmBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setSelectedSlot(null); }}>
      <form action={action} className={styles.calendarConfirmCard}>
        <div><p className={styles.eyebrow}>Confirm session</p><h3>Book {selectedClient.name}</h3></div>
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
          <button className={styles.secondaryAction} disabled={pending} type="button" onClick={() => setSelectedSlot(null)}>Cancel</button>
          <button className={styles.action} disabled={pending || state.status === "success"} type="submit">{pending ? "Booking…" : state.status === "success" ? "Booked" : "Confirm & Book"}</button>
        </div>
      </form>
    </div>}
  </section>;
}
