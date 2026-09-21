export type CalendarBooking = {
  bookingId: string;
  coachName: string;
  endsAt: string;
  gymAddress?: string | null;
  gymName: string;
  startsAt: string;
};

function compactUtc(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function bookingCalendarTitle(booking: CalendarBooking) {
  return `Training with ${booking.coachName} — Ravoge`;
}

export function createBookingIcs(booking: CalendarBooking) {
  const location = [booking.gymName, booking.gymAddress].filter(Boolean).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ravoge//Training Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.bookingId}@ravoge.com`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(booking.startsAt)}`,
    `DTEND:${compactUtc(booking.endsAt)}`,
    `SUMMARY:${escapeIcs(bookingCalendarTitle(booking))}`,
    `LOCATION:${escapeIcs(location)}`,
    "DESCRIPTION:Ravoge training session.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function createGoogleCalendarUrl(booking: CalendarBooking) {
  const location = [booking.gymName, booking.gymAddress].filter(Boolean).join(", ");
  const query = new URLSearchParams({
    action: "TEMPLATE",
    dates: `${compactUtc(booking.startsAt)}/${compactUtc(booking.endsAt)}`,
    details: "Ravoge training session.",
    location,
    text: bookingCalendarTitle(booking),
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}
