import { localDateInTimeZone, localDateStartIso, shiftLocalDate } from "./timezone.ts";

export const CALENDAR_AVAILABILITY_LABEL = "Ravoge calendar availability v1:";
export type MinuteRange = { start: number; end: number };
export type WeeklyWindow = { day_of_week: number; starts_at: string; ends_at: string };
export type DayException = { kind: string; starts_at: string; ends_at: string; label: string | null };
export type GymHours = { day_of_week: number; is_closed: boolean; opens_at: string | null; closes_at: string | null };
export type SpecialHours = Omit<GymHours, "day_of_week"> & { local_date: string };

export function validLocalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && shiftLocalDate(value, 0) === value;
}
export function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export function minuteTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const result: MinuteRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.end <= range.start) continue;
    const last = result.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push({ ...range });
  }
  return result;
}
export function subtractRanges(ranges: MinuteRange[], blocks: MinuteRange[]) {
  let result = mergeRanges(ranges);
  for (const block of blocks) result = result.flatMap(range => {
    if (block.end <= range.start || block.start >= range.end) return [range];
    return [{ start: range.start, end: Math.min(range.end, block.start) }, { start: Math.max(range.start, block.end), end: range.end }].filter(r => r.start < r.end);
  });
  return result;
}
export function rangeCovered(ranges: MinuteRange[], slot: MinuteRange) {
  return ranges.some(range => range.start <= slot.start && range.end >= slot.end);
}
export function overlaps(a: MinuteRange, b: MinuteRange) { return a.start < b.end && b.start < a.end; }

function exceptionRange(row: DayException, date: string, timezone: string): MinuteRange | null {
  const start = localDateStartIso(date, timezone);
  const next = shiftLocalDate(date, 1);
  const end = next && localDateStartIso(next, timezone);
  if (!start || !end || Date.parse(row.starts_at) >= Date.parse(end) || Date.parse(row.ends_at) <= Date.parse(start)) return null;
  const minute = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(value));
    return Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
  };
  return { start: Date.parse(row.starts_at) <= Date.parse(start) ? 0 : minute(row.starts_at), end: Date.parse(row.ends_at) >= Date.parse(end) ? 1440 : minute(row.ends_at) };
}

export function availabilityForDate(date: string, timezone: string, windows: WeeklyWindow[], exceptions: DayException[], hours: GymHours[], specials: SpecialHours[]) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const gym = specials.find(row => row.local_date === date) ?? hours.find(row => row.day_of_week === day);
  const open = gym ? !gym.is_closed && gym.opens_at && gym.closes_at ? { start: timeMinutes(gym.opens_at), end: timeMinutes(gym.closes_at) } : null : hours.length || day === 0 ? null : { start: 300, end: 1200 };
  const rows = exceptions.flatMap(row => {
    const range = exceptionRange(row, date, timezone);
    return range ? [{ row, range }] : [];
  });
  const calendarRows = rows.filter(({ row }) => row.label?.startsWith(CALENDAR_AVAILABILITY_LABEL));
  const blocks = rows.filter(({ row }) => row.kind !== "available_override").map(({ range }) => range);
  const externalBlocks = rows.filter(({ row }) => row.kind !== "available_override" && !row.label?.startsWith(CALENDAR_AVAILABILITY_LABEL)).map(({ range }) => range);
  const recurring = windows.length ? windows.filter(w => w.day_of_week === day).map(w => ({ start: timeMinutes(w.starts_at), end: timeMinutes(w.ends_at) })) : day !== 0 ? [{ start: 300, end: 1200 }] : [];
  const overrides = rows.filter(({ row }) => row.kind === "available_override").map(({ range }) => range);
  const selected = subtractRanges(calendarRows.length ? calendarRows.filter(({ row }) => row.kind === "available_override").map(({ range }) => range) : [...recurring, ...overrides], blocks);
  const duration = calendarRows.some(({ row }) => row.label === `${CALENDAR_AVAILABILITY_LABEL}45`) ? 45 : 60;
  return { open, selected, externalBlocks, duration, saved: calendarRows.length > 0 };
}

export function monthDates(date: string) {
  const start = `${date.slice(0, 7)}-01`;
  const days = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => shiftLocalDate(start, index)!);
}

export function calendarExceptionDate(row: DayException, timezone: string) {
  return localDateInTimeZone(row.starts_at, timezone);
}
