export function formatZonedDateTime(value: string, timezone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", options ?? {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function partsInZone(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit",
    second: "2-digit", timeZone: timezone, year: "numeric",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: Number(values.day), hour: Number(values.hour) % 24, minute: Number(values.minute), month: Number(values.month), second: Number(values.second), year: Number(values.year) };
}

export function zonedLocalDateTimeToIso(localValue: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: 0 };
  const desiredUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, 0);
  let guess = desiredUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = partsInZone(guess, timezone);
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    guess += desiredUtc - observedUtc;
  }
  const final = partsInZone(guess, timezone);
  if (final.year !== desired.year || final.month !== desired.month || final.day !== desired.day || final.hour !== desired.hour || final.minute !== desired.minute) return null;
  return new Date(guess).toISOString();
}

export function localDateInTimeZone(value: Date | string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const mapped = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

export function shiftLocalDate(localDate: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return shifted.toISOString().slice(0, 10);
}

export function localDateStartIso(localDate: string, timezone: string) {
  return zonedLocalDateTimeToIso(`${localDate}T00:00`, timezone);
}

export function organizationTodayWindow(timezone: string, now = new Date()) {
  const localDate = localDateInTimeZone(now, timezone);
  const nextDate = shiftLocalDate(localDate, 1);
  const startIso = localDateStartIso(localDate, timezone);
  const endIso = nextDate ? localDateStartIso(nextDate, timezone) : null;
  return startIso && endIso ? { endIso, localDate, startIso } : null;
}

export function organizationWeekWindow(timezone: string, now = new Date()) {
  const localDate = localDateInTimeZone(now, timezone);
  const [year, month, day] = localDate.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = shiftLocalDate(localDate, mondayOffset);
  const endDate = startDate ? shiftLocalDate(startDate, 7) : null;
  const startIso = startDate ? localDateStartIso(startDate, timezone) : null;
  const endIso = endDate ? localDateStartIso(endDate, timezone) : null;
  return startIso && endIso ? { endIso, startDate, startIso } : null;
}
