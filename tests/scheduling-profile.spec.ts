import { expect, test } from "@playwright/test";

import { createBookingIcs, createGoogleCalendarUrl } from "../lib/calendar";
import { createBookingEmailContent, sendBookingEmail } from "../lib/booking-email";

test("new profile and schedule routes remain server protected", async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of ["/owner/schedule", "/owner/setup", "/owner/reports", "/owner/revenue", "/coach/profile", "/coach/schedule", "/coach/availability", "/client/profile", "/client/book", "/client/schedule", "/client/welcome"]) {
    await page.goto(path);
    const roleRoot = `/${path.split("/")[1]}`;
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${roleRoot.replaceAll("/", "\\/")}$`));
  }
});

test("calendar exports use stable booking identity and no private health content", async ({ request }) => {
  const booking = { bookingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", coachName: "Taylor Coach", endsAt: "2026-10-05T17:00:00.000Z", gymAddress: "123 Main Street", gymName: "The Pitt", startsAt: "2026-10-05T16:00:00.000Z" };
  const calendar = createBookingIcs(booking);
  expect(calendar).toContain("UID:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@ravoge.com");
  expect(calendar).toContain("SUMMARY:Training with Taylor Coach — Ravoge");
  expect(calendar).toContain("DESCRIPTION:Ravoge training session.");
  expect(calendar).not.toMatch(/injur|medical|intake|workout detail/i);
  const google = new URL(createGoogleCalendarUrl(booking));
  expect(google.hostname).toBe("calendar.google.com");
  expect(google.searchParams.get("text")).toBe("Training with Taylor Coach — Ravoge");
  const response = await request.get(`/api/bookings/${booking.bookingId}/calendar.ics`);
  expect(response.status()).toBe(401);
});

test("booking email renders the authorized Coach identity and safe event details", () => {
  const content = createBookingEmailContent({
    bookingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    coachName: "Taylor & Coach",
    coachPhotoUrl: "https://example.test/signed-coach-photo",
    durationMinutes: 60,
    endsAt: "2026-10-05T17:00:00.000Z",
    event: "booked",
    gymAddress: "123 Main Street",
    gymName: "The Pitt",
    manageUrl: "https://ravoge.com/client/schedule",
    recipientEmail: "client@example.test",
    startsAt: "2026-10-05T16:00:00.000Z",
    timezone: "America/Denver",
  });
  expect(content.subject).toBe("Session booked · Taylor & Coach");
  expect(content.html).toContain("Taylor &amp; Coach");
  expect(content.html).toContain("https://example.test/signed-coach-photo");
  expect(content.html).toContain("60 minutes");
  expect(content.html).toContain("The Pitt");
  expect(content.html).toContain("ADD TO GOOGLE CALENDAR");
  expect(content.calendar).toContain("UID:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@ravoge.com");
  expect(content.html).not.toMatch(/medical history|injury|intake response|workout detail:/i);
});

test("missing email credentials skip delivery without throwing", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RAVOGE_EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.RAVOGE_EMAIL_FROM;
  try {
    const result = await sendBookingEmail({
      bookingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      coachName: "Taylor Coach",
      durationMinutes: 60,
      endsAt: "2026-10-05T17:00:00.000Z",
      event: "booked",
      gymName: "The Pitt",
      manageUrl: "https://ravoge.com/client/schedule",
      recipientEmail: "client@example.test",
      startsAt: "2026-10-05T16:00:00.000Z",
      timezone: "America/Denver",
    });
    expect(result).toEqual({ error: null, id: null, status: "skipped" });
  } finally {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RAVOGE_EMAIL_FROM;
    else process.env.RAVOGE_EMAIL_FROM = originalFrom;
  }
});
