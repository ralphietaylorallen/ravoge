import assert from "node:assert/strict";
import test from "node:test";
import { bookingCalendarHref, bookingCalendarMonth } from "../../lib/booking-calendar-navigation.ts";

test("monthly navigation handles year changes and leap years without browser timezone shifts", () => {
  assert.deepEqual(bookingCalendarMonth("2028-02-15").dates.slice(-2), ["2028-02-28", "2028-02-29"]);
  assert.equal(bookingCalendarMonth("2026-12-11").next, "2027-01-01");
  assert.equal(bookingCalendarMonth("2027-01-11").previous, "2026-12-01");
  assert.equal(bookingCalendarMonth("2026-11-11").offset, 0);
  assert.throws(() => bookingCalendarMonth("2026-02-31"), /Invalid/);
});

test("date navigation retains the client, duration, intake, embedded tab and reschedule identity", () => {
  const url = new URL(bookingCalendarHref("/coach/clients/client-a", "2026-12-02", {
    client: "client-a", duration: "45", kind: "intake", tab: "schedule", reschedule: "booking-a", date: "2026-11-11", week: "2026-11-09", coach: undefined,
  }), "https://ravoge.com");
  assert.equal(url.searchParams.get("date"), "2026-12-02");
  for (const [key, value] of Object.entries({client:"client-a",duration:"45",kind:"intake",tab:"schedule",reschedule:"booking-a"})) assert.equal(url.searchParams.get(key),value);
  assert.equal(url.searchParams.has("week"),false);
  assert.equal(url.searchParams.has("coach"),false);
});
