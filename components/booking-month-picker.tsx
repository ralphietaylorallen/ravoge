import Link from "next/link";
import { bookingCalendarHref, bookingCalendarMonth } from "@/lib/booking-calendar-navigation";
import { monthDates } from "@/lib/coach-availability";
import dashboard from "./dashboard.module.css";
import styles from "./coach-availability-calendar.module.css";

export const calendarDateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

export function BookingMonthPicker({ date, today, timezone, basePath, extraParams = {}, counts = {}, minDate, maxDate }: {
  date: string; today: string; timezone: string; basePath: string;
  extraParams?: Record<string, string | undefined>; counts?: Record<string, number>; minDate?: string; maxDate?: string;
}) {
  const { dates, offset, previous, next } = bookingCalendarMonth(date);
  const previousAllowed = !minDate || monthDates(previous).at(-1)! >= minDate;
  const nextAllowed = !maxDate || next <= maxDate;
  const href = (target: string) => bookingCalendarHref(basePath, target, extraParams);
  return <section className={`${dashboard.panel} ${styles.calendar}`} aria-label="Monthly booking calendar">
    <div className={styles.monthHeading}>
      {previousAllowed ? <Link aria-label="Previous month" href={href(minDate && previous < minDate ? minDate : previous)}>‹</Link> : <button type="button" aria-label="Previous month" disabled>‹</button>}
      <h2>{calendarDateLabel(date, { month: "long", year: "numeric" })}</h2>
      {nextAllowed ? <Link aria-label="Next month" href={href(next)}>›</Link> : <button type="button" aria-label="Next month" disabled>›</button>}
    </div>
    <div className={styles.grid}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span className={styles.weekday} key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
      {dates.map(day => {
        const disabled = Boolean(minDate && day < minDate || maxDate && day > maxDate);
        const label = calendarDateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const content = <><span>{Number(day.slice(-2))}</span><small>{day === today ? "Today" : counts[day] ? `${counts[day]} booked` : ""}</small></>;
        return disabled ? <button type="button" className={styles.date} aria-label={label} disabled key={day}>{content}</button>
          : <Link className={styles.date} aria-current={day === date ? "date" : undefined} aria-label={`${label}${counts[day] ? `, ${counts[day]} booked sessions` : ""}`} href={href(day)} key={day}>{content}</Link>;
      })}
    </div>
    <p className={dashboard.formHint}>Tap a date, then choose an available time. All times use {timezone}.</p>
  </section>;
}

export function BookingDurationButtons({ date, duration, durations, basePath, extraParams = {} }: {
  date: string; duration: number; durations: number[]; basePath: string; extraParams?: Record<string, string | undefined>;
}) {
  return <fieldset className={styles.increments}><legend>Session length</legend><div>{durations.map(value => <Link className={styles.durationChoice} aria-current={duration === value ? "true" : undefined} key={value} href={bookingCalendarHref(basePath, date, { ...extraParams, duration: String(value) })}>{value} minutes</Link>)}</div></fieldset>;
}
