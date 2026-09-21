import { createBookingIcs, createGoogleCalendarUrl, type CalendarBooking } from "@/lib/calendar";

type BookingEmailEvent = "booked" | "rescheduled" | "cancelled";
export type BookingEmail = CalendarBooking & {
  coachPhotoUrl?: string | null;
  durationMinutes: number;
  event: BookingEmailEvent;
  manageUrl: string;
  recipientEmail: string;
  timezone: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function formatParts(value: string, timezone: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: timezone }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone, timeZoneName: "short" }).format(date),
  };
}

export function isBookingEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RAVOGE_EMAIL_FROM);
}

export function createBookingEmailContent(input: BookingEmail) {
  const starts = formatParts(input.startsAt, input.timezone);
  const ends = formatParts(input.endsAt, input.timezone);
  const heading = input.event === "booked" ? "SESSION BOOKED" : input.event === "rescheduled" ? "SESSION RESCHEDULED" : "SESSION CANCELLED";
  const calendar = createBookingIcs(input);
  const googleUrl = createGoogleCalendarUrl(input);
  const photo = input.coachPhotoUrl ? `<img alt="" src="${escapeHtml(input.coachPhotoUrl)}" width="96" height="96" style="border-radius:999px;object-fit:cover;border:1px solid #d9c8aa" />` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;color:#171918;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="background:#fff;border:1px solid #ddd8ce;padding:38px"><p style="margin:0 0 34px;letter-spacing:.28em;font-weight:700">RAVOGE</p><p style="margin:0;color:#8a6b3d;font-size:12px;letter-spacing:.18em;font-weight:700">${heading}</p><div style="text-align:center;padding:34px 0">${photo}<p style="margin:18px 0 5px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:.12em">Training with</p><h1 style="margin:0;font-size:31px">${escapeHtml(input.coachName)}</h1></div><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:14px 0;border-top:1px solid #eee;color:#777">Date</td><td style="padding:14px 0;border-top:1px solid #eee;text-align:right;font-weight:700">${escapeHtml(starts.date)}</td></tr><tr><td style="padding:14px 0;border-top:1px solid #eee;color:#777">Time</td><td style="padding:14px 0;border-top:1px solid #eee;text-align:right;font-weight:700">${escapeHtml(starts.time)}–${escapeHtml(ends.time)}</td></tr><tr><td style="padding:14px 0;border-top:1px solid #eee;color:#777">Duration</td><td style="padding:14px 0;border-top:1px solid #eee;text-align:right;font-weight:700">${input.durationMinutes} minutes</td></tr><tr><td style="padding:14px 0;border-top:1px solid #eee;color:#777">Gym</td><td style="padding:14px 0;border-top:1px solid #eee;text-align:right;font-weight:700">${escapeHtml(input.gymName)}</td></tr></table><div style="display:grid;gap:10px;margin-top:28px"><a href="${escapeHtml(googleUrl)}" style="display:block;padding:14px;background:#171918;color:#fff;text-align:center;text-decoration:none;font-weight:700">ADD TO GOOGLE CALENDAR</a><a href="${escapeHtml(input.manageUrl)}" style="display:block;padding:14px;border:1px solid #b89a68;color:#5c421f;text-align:center;text-decoration:none;font-weight:700">VIEW / MANAGE SESSION</a></div><p style="margin:26px 0 0;color:#777;font-size:12px">An .ics calendar event is attached. No health, intake, or workout details are included.</p></div></div></body></html>`;
  return { calendar, googleUrl, html, subject: `Session ${input.event} · ${input.coachName}` };
}

export async function sendBookingEmail(input: BookingEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RAVOGE_EMAIL_FROM;
  if (!apiKey || !from) return { error: null, id: null, status: "skipped" as const };
  const { calendar, html, subject } = createBookingEmailContent(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        attachments: [{ content: Buffer.from(calendar, "utf8").toString("base64"), filename: `ravoge-${input.bookingId}.ics` }],
        from,
        html,
        subject,
        to: [input.recipientEmail],
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await response.json() as { id?: string; message?: string };
    if (!response.ok || !payload.id) return { error: payload.message ?? `Email provider returned ${response.status}.`, id: null, status: "failed" as const };
    return { error: null, id: payload.id, status: "sent" as const };
  } catch {
    return { error: "Transactional email provider could not be reached.", id: null, status: "failed" as const };
  }
}
