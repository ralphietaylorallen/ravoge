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
