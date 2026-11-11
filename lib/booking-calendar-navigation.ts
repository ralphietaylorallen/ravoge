import { monthDates, validLocalDate } from "./coach-availability.ts";

export function bookingCalendarHref(basePath: string, date: string, extraParams: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) if (value !== undefined && key !== "date" && key !== "week") params.set(key, value);
  params.set("date", date);
  return `${basePath}?${params.toString()}`;
}

export function bookingCalendarMonth(date: string) {
  if (!validLocalDate(date)) throw new Error("Invalid calendar date");
  const dates = monthDates(date);
  const month = new Date(`${dates[0]}T12:00:00Z`);
  const adjacent = (delta: number) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1)).toISOString().slice(0, 10);
  return { dates, offset: month.getUTCDay(), previous: adjacent(-1), next: adjacent(1) };
}
