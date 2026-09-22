"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./dashboard.module.css";

type RollingDateStripProps = {
  basePath: string;
  selectedDate: string;
  today: string;
  timezone: string;
  duration: number;
  durations: number[];
  extraParams?: Record<string, string | undefined>;
};

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function label(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(value),
    number: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(value),
    month: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(value),
  };
}

export function RollingDateStrip({ basePath, selectedDate, today, timezone, duration, durations, extraParams = {} }: RollingDateStripProps) {
  const router = useRouter();
  const [currentToday, setCurrentToday] = useState(today);
  const dates = Array.from({ length: 31 }, (_, index) => addDays(currentToday, index));

  function navigate(date: string, selectedDuration: number) {
    const params = new URLSearchParams();
    params.set("date", date);
    params.set("duration", String(selectedDuration));
    Object.entries(extraParams).forEach(([key, value]) => { if (value) params.set(key, value); });
    router.push(`${basePath}?${params.toString()}`);
  }

  useEffect(() => {
    function refreshDate() {
      const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone: timezone, year: "numeric" }).formatToParts(new Date());
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const nextToday = `${values.year}-${values.month}-${values.day}`;
      setCurrentToday(nextToday);
      if (selectedDate < nextToday) navigate(nextToday, duration);
    }
    const timer = window.setInterval(refreshDate, 60_000);
    return () => window.clearInterval(timer);
    // The visible window is recalculated after hydration and then every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, selectedDate, duration]);

  return <div className={styles.rollingSchedule}>
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Rolling booking window</p><h3>Next 30 days</h3></div>
      <label className={styles.field}>Session duration
        <select aria-label="Session duration" value={duration} onChange={(event) => navigate(selectedDate, Number(event.target.value))}>
          {durations.map((value) => <option key={value} value={value}>{value} minutes</option>)}
        </select>
      </label>
    </div>
    <div aria-label="Choose a session date" className={styles.dateStrip} role="group">
      {dates.map((date) => { const parts = label(date); return <button aria-pressed={date === selectedDate} className={date === selectedDate ? styles.dateCardActive : styles.dateCard} key={date} onClick={() => navigate(date, duration)} type="button"><span>{parts.day}</span><strong>{parts.number}</strong><small>{parts.month}</small></button>; })}
    </div>
  </div>;
}
