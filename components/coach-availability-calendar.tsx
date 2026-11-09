"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveDayAvailabilityAction, type AvailabilityState } from "@/app/coach/availability/actions";
import { mergeRanges, minuteTime, monthDates, overlaps, rangeCovered, subtractRanges, type MinuteRange } from "@/lib/coach-availability";
import dashboard from "./dashboard.module.css";
import styles from "./coach-availability-calendar.module.css";

export type AvailabilityDay = { open: MinuteRange | null; selected: MinuteRange[]; externalBlocks: MinuteRange[]; duration: number; saved: boolean };
const label = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
function timeLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
export function CoachAvailabilityCalendar({ date, today, timezone, days }: { date: string; today: string; timezone: string; days: Record<string, AvailabilityDay> }) {
  const day = days[date];
  const [ranges, setRanges] = useState(day.selected);
  const [increment, setIncrement] = useState(day.duration);
  const [state, action, pending] = useActionState<AvailabilityState, FormData>(saveDayAvailabilityAction, { status: "idle" });
  const baseline = state.status === "success" ? state.ranges : day.selected;
  const dirty = JSON.stringify(ranges) !== JSON.stringify(baseline) || increment !== (state.status === "success" ? state.increment : day.duration);
  const dates = monthDates(date);
  const offset = new Date(`${dates[0]}T12:00:00Z`).getUTCDay();
  const month = new Date(`${dates[0]}T12:00:00Z`);
  const adjacent = (delta: number) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1)).toISOString().slice(0, 10);
  const canLeave = () => !pending && (!dirty || window.confirm("Leave without saving this date’s availability?"));
  const slots: MinuteRange[] = [];
  if (day.open) for (let start = day.open.start; start + increment <= day.open.end; start += increment) slots.push({ start, end: start + increment });
  function toggle(slot: MinuteRange) {
    setRanges(current => rangeCovered(current, slot) ? subtractRanges(current, [slot]) : mergeRanges([...current, slot]));
  }
  return <div className={styles.layout}>
    <section className={`${dashboard.panel} ${styles.calendar}`} aria-label="Monthly availability calendar">
      <div className={styles.monthHeading}>
        <Link aria-label="Previous month" href={`?date=${adjacent(-1)}`} onClick={e => { if (!canLeave()) e.preventDefault(); }}>‹</Link>
        <h2>{label(date, { month: "long", year: "numeric" })}</h2>
        <Link aria-label="Next month" href={`?date=${adjacent(1)}`} onClick={e => { if (!canLeave()) e.preventDefault(); }}>›</Link>
      </div>
      <div className={styles.grid}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span className={styles.weekday} key={d}>{d}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
        {dates.map(d => <Link key={d} className={styles.date} href={`?date=${d}`} aria-current={d === date ? "date" : undefined} aria-label={`${label(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${days[d].saved ? ", saved availability" : ""}`} onClick={e => { if (d === date || !canLeave()) e.preventDefault(); }}>
          <span>{Number(d.slice(-2))}</span><small>{d === today ? "Today" : days[d].saved ? "Saved" : ""}</small>
        </Link>)}
      </div>
      <p className={dashboard.formHint}>Tap a date, choose your times, then save. All times use {timezone}.</p>
    </section>
    <section className={dashboard.panel} aria-label="Day availability">
      <h2>{label(date, { weekday: "long", month: "long", day: "numeric" })}</h2>
      <p className={dashboard.empty}>Tap times to make yourself available or unavailable for this date. Existing bookings and time off stay protected.</p>
      <form action={action} className={dashboard.form}>
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="increment" value={increment} />
        <input type="hidden" name="ranges" value={JSON.stringify(ranges)} />
        <fieldset className={styles.increments} disabled={pending}><legend>Appointment increments</legend><div>{[45, 60].map(value => <button type="button" aria-pressed={increment === value} onClick={() => setIncrement(value)} key={value}>{value} minutes</button>)}</div></fieldset>
        <p className={dashboard.formHint}>Selected = available · Partial = some time selected. Changing increments keeps your selected hours. Gym booking duration rules still apply.</p>
        {day.open ? <div className={styles.slots}>{slots.map(slot => {
          const selected = rangeCovered(ranges, slot);
          const partial = !selected && ranges.some(r => overlaps(r, slot));
          const blocked = day.externalBlocks.some(r => overlaps(r, slot));
          return <button type="button" key={minuteTime(slot.start)} aria-pressed={partial ? "mixed" : selected} disabled={pending || blocked || date < today} onClick={() => toggle(slot)}><strong>{timeLabel(slot.start)} – {timeLabel(slot.end)}</strong><span>{blocked ? "Time off" : selected ? "✓ Available" : partial ? "Partially available" : "Unavailable"}</span></button>;
        })}</div> : <p className={dashboard.empty}>The gym is closed on this date.</p>}
        <div className={styles.save}><button className={dashboard.action} disabled={pending || date < today || !day.open} type="submit">{pending ? "Saving…" : "Save Availability"}</button><span>{date < today ? "Past dates are read only." : dirty ? "Unsaved changes" : day.saved || state.status === "success" ? "Saved availability" : "Current weekly availability"}</span></div>
        {state.message && (state.status === "error" || !dirty) && <p role={state.status === "error" ? "alert" : "status"} className={`${dashboard.notice} ${state.status === "error" ? dashboard.error : ""}`}>{state.message}</p>}
      </form>
    </section>
  </div>;
}
