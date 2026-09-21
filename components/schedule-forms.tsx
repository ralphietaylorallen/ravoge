"use client";

import { useActionState } from "react";

import {
  addAvailabilityAction,
  addAvailabilityExceptionAction,
  addClosureAction,
  bookSessionAction,
  cancelSessionAction,
  rescheduleSessionAction,
  saveOrganizationScheduleAction,
  type ScheduleActionState,
} from "@/app/schedule/actions";

import styles from "./dashboard.module.css";

const initial: ScheduleActionState = { status: "idle" };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Result({ state }: { state: ScheduleActionState }) {
  return state.message ? <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p> : null;
}

type Hours = { closes_at: string | null; day_of_week: number; is_closed: boolean; opens_at: string | null };
type Settings = { buffer_after_minutes: number; buffer_before_minutes: number; cancellation_cutoff_minutes: number; default_duration_minutes: number; maximum_advance_days: number; minimum_notice_minutes: number; permitted_durations: number[]; slot_increment_minutes: number };

export function OrganizationScheduleForm({ address, hours, settings, timezone }: { address?: string | null; hours: Hours[]; settings: Settings; timezone: string }) {
  const [state, action, pending] = useActionState(saveOrganizationScheduleAction, initial);
  const byDay = new Map(hours.map((row) => [row.day_of_week, row]));
  return <form action={action} className={styles.scheduleForm}>
    <div className={styles.formColumns}><div className={styles.field}><label htmlFor="timezone">Organization timezone</label><input defaultValue={timezone} id="timezone" name="timezone" required /></div><div className={styles.field}><label htmlFor="gym-address">Gym address <span>Optional</span></label><input defaultValue={address ?? ""} id="gym-address" maxLength={500} name="address" /></div></div>
    <div className={styles.hoursGrid}>{days.map((day, index) => { const row = byDay.get(index); return <fieldset className={styles.hourRow} key={day}><legend>{day}</legend><label><input defaultChecked={row?.is_closed ?? true} name={`day-${index}-closed`} type="checkbox" /> Closed</label><label>Open<input defaultValue={row?.opens_at?.slice(0, 5) ?? "08:00"} name={`day-${index}-open`} type="time" /></label><label>Close<input defaultValue={row?.closes_at?.slice(0, 5) ?? "18:00"} name={`day-${index}-close`} type="time" /></label></fieldset>; })}</div>
    <div className={styles.threeColumns}><div className={styles.field}><label htmlFor="default-duration">Default duration</label><select defaultValue={settings.default_duration_minutes} id="default-duration" name="defaultDuration">{[30,45,60,90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></div><div className={styles.field}><label htmlFor="slot-increment">Booking interval</label><select defaultValue={settings.slot_increment_minutes} id="slot-increment" name="slotIncrement">{[5,10,15,20,30,60].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></div><div className={styles.field}><label htmlFor="max-advance">Maximum advance</label><input defaultValue={settings.maximum_advance_days} id="max-advance" max={365} min={1} name="maximumAdvance" type="number" /></div></div>
    <fieldset className={styles.choiceField}><legend>Permitted durations</legend><div className={styles.choiceGrid}>{[30,45,60,90].map((value) => <label key={value}><input defaultChecked={settings.permitted_durations.includes(value)} name="permittedDuration" type="checkbox" value={value} /> {value} min</label>)}</div></fieldset>
    <div className={styles.threeColumns}><div className={styles.field}><label htmlFor="minimum-notice">Minimum notice <span>minutes</span></label><input defaultValue={settings.minimum_notice_minutes} id="minimum-notice" min={0} name="minimumNotice" type="number" /></div><div className={styles.field}><label htmlFor="cancel-cutoff">Cancellation cutoff <span>minutes</span></label><input defaultValue={settings.cancellation_cutoff_minutes} id="cancel-cutoff" min={0} name="cancellationCutoff" type="number" /></div><div className={styles.field}><label htmlFor="buffer-before">Buffer before <span>minutes</span></label><input defaultValue={settings.buffer_before_minutes} id="buffer-before" max={120} min={0} name="bufferBefore" type="number" /></div></div>
    <div className={styles.field}><label htmlFor="buffer-after">Buffer after <span>minutes</span></label><input defaultValue={settings.buffer_after_minutes} id="buffer-after" max={120} min={0} name="bufferAfter" type="number" /></div>
    <button className={styles.action} disabled={pending} type="submit">{pending ? "Saving…" : "Save scheduling"}</button><Result state={state} />
  </form>;
}

export function ClosureForm() {
  const [state, action, pending] = useActionState(addClosureAction, initial);
  return <form action={action} className={styles.form}><div className={styles.formColumns}><div className={styles.field}><label htmlFor="closure-date">Date</label><input id="closure-date" name="date" required type="date" /></div><div className={styles.field}><label htmlFor="closure-label">Label</label><input defaultValue="Gym closed" id="closure-label" maxLength={120} name="label" required /></div></div><button className={styles.secondaryAction} disabled={pending} type="submit">Add closure</button><Result state={state} /></form>;
}

export function AvailabilityWindowForm() {
  const [state, action, pending] = useActionState(addAvailabilityAction, initial);
  return <form action={action} className={styles.form}><div className={styles.threeColumns}><div className={styles.field}><label htmlFor="availability-day">Day</label><select id="availability-day" name="day">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div><div className={styles.field}><label htmlFor="availability-start">Start</label><input id="availability-start" name="startsAt" required type="time" /></div><div className={styles.field}><label htmlFor="availability-end">End</label><input id="availability-end" name="endsAt" required type="time" /></div></div><button className={styles.action} disabled={pending} type="submit">Add weekly window</button><Result state={state} /></form>;
}

export function AvailabilityExceptionForm({ timezone }: { timezone: string }) {
  const [state, action, pending] = useActionState(addAvailabilityExceptionAction, initial);
  return <form action={action} className={styles.form}><p className={styles.formHint}>Times are interpreted in {timezone}. Nonexistent DST times are rejected.</p><div className={styles.threeColumns}><div className={styles.field}><label htmlFor="exception-kind">Type</label><select id="exception-kind" name="kind"><option value="unavailable">Unavailable</option><option value="personal_block">Personal block</option><option value="vacation">Vacation / time off</option><option value="available_override">One-off availability</option></select></div><div className={styles.field}><label htmlFor="exception-start">Start</label><input id="exception-start" name="startsAt" required type="datetime-local" /></div><div className={styles.field}><label htmlFor="exception-end">End</label><input id="exception-end" name="endsAt" required type="datetime-local" /></div></div><div className={styles.field}><label htmlFor="exception-label">Label <span>Optional</span></label><input id="exception-label" maxLength={160} name="label" /></div><button className={styles.secondaryAction} disabled={pending} type="submit">Add exception</button><Result state={state} /></form>;
}

type Slot = { ends_at: string; starts_at: string };
export function BookingForm({ bookingId, duration, slots, timezone }: { bookingId?: string; duration: number; slots: Slot[]; timezone: string }) {
  const boundAction = bookingId ? rescheduleSessionAction.bind(null, bookingId) : bookSessionAction;
  const [state, action, pending] = useActionState(boundAction, initial);
  return <form action={action} className={styles.form}><input name="duration" type="hidden" value={duration} /><fieldset className={styles.choiceField}><legend>Available times</legend><div className={styles.slotGrid}>{slots.map((slot, index) => <label key={slot.starts_at}><input defaultChecked={index === 0} name="startsAt" required type="radio" value={slot.starts_at} /><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(slot.starts_at))}</span></label>)}</div></fieldset>{!bookingId && <div className={styles.field}><label htmlFor="booking-notes">Session note <span>Optional · no health details</span></label><textarea id="booking-notes" maxLength={1000} name="notes" rows={3} /></div>}<button className={styles.action} disabled={pending || slots.length === 0} type="submit">{pending ? "Confirming…" : bookingId ? "Confirm reschedule" : "Confirm session"}</button><Result state={state} /></form>;
}

export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(cancelSessionAction.bind(null, bookingId), initial);
  return <form action={action} className={styles.cancelForm}><input aria-label="Cancellation reason" maxLength={500} name="reason" placeholder="Reason (optional)" /><button className={styles.secondaryAction} disabled={pending} type="submit">Cancel session</button><Result state={state} /></form>;
}
