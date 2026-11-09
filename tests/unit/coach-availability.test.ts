import test from "node:test";
import assert from "node:assert/strict";
import { availabilityForDate, CALENDAR_AVAILABILITY_LABEL, mergeRanges, monthDates, rangeCovered, subtractRanges, validLocalDate } from "../../lib/coach-availability.ts";
const zone = "America/Denver";
const day = "2026-11-10"; // Tuesday, after Denver's DST transition.
test("calendar validates real dates and month boundaries", () => {
  assert.equal(validLocalDate("2026-02-30"), false);
  assert.equal(validLocalDate("2028-02-29"), true);
  assert.equal(monthDates("2028-02-20").length, 29);
  assert.equal(monthDates("2026-12-31").at(-1), "2026-12-31");
});
test("availability matches existing Monday–Saturday defaults and Sunday closure", () => {
  assert.deepEqual(availabilityForDate(day, zone, [], [], [], []).selected, [{ start: 300, end: 1200 }]);
  assert.equal(availabilityForDate("2026-11-15", zone, [], [], [], []).open, null);
});
test("partial recurring weeks do not open unspecified weekdays", () => {
  assert.deepEqual(availabilityForDate(day, zone, [{ day_of_week: 1, starts_at: "08:00:00", ends_at: "12:00:00" }], [], [], []).selected, []);
});
test("slot toggles preserve partial ranges across 45/60 minute increments", () => {
  const ranges = subtractRanges([{ start: 300, end: 1200 }], [{ start: 345, end: 390 }]);
  assert.equal(rangeCovered(ranges, { start: 300, end: 360 }), false);
  assert.deepEqual(mergeRanges([...ranges, { start: 345, end: 390 }]), [{ start: 300, end: 1200 }]);
});
test("calendar selections reload in local timezone and retain their increment", () => {
  const marker = `${CALENDAR_AVAILABILITY_LABEL}45`;
  const rows = [
    { kind: "unavailable", starts_at: "2026-11-10T07:00:00+00:00", ends_at: "2026-11-10T12:00:00+00:00", label: marker },
    { kind: "available_override", starts_at: "2026-11-10T12:00:00+00:00", ends_at: "2026-11-10T12:45:00+00:00", label: marker },
    { kind: "unavailable", starts_at: "2026-11-10T12:45:00+00:00", ends_at: "2026-11-11T07:00:00+00:00", label: marker },
  ];
  const result = availabilityForDate(day, zone, [], rows, [], []);
  assert.deepEqual(result.selected, [{ start: 300, end: 345 }]);
  assert.equal(result.duration, 45);
  assert.equal(result.saved, true);
  assert.deepEqual(result.externalBlocks, []);
});
test("an empty saved date stays unavailable despite default windows", () => {
  const result = availabilityForDate(day, zone, [], [{ kind: "unavailable", starts_at: "2026-11-10T07:00:00Z", ends_at: "2026-11-11T07:00:00Z", label: `${CALENDAR_AVAILABILITY_LABEL}60` }], [], []);
  assert.deepEqual(result.selected, []);
  assert.equal(result.saved, true);
});
test("multi-day vacations remain protected, including DST boundary days", () => {
  const vacation = { kind: "vacation", starts_at: "2026-10-31T06:00:00Z", ends_at: "2026-11-03T07:00:00Z", label: "Vacation" };
  const result = availabilityForDate("2026-11-02", zone, [], [vacation], [], []);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.externalBlocks, [{ start: 0, end: 1440 }]);
});
test("special closures and partial gym hours retain priority", () => {
  const hours = [{ day_of_week: 1, opens_at: "08:00", closes_at: "17:00", is_closed: false }];
  assert.equal(availabilityForDate(day, zone, [], [], hours, []).open, null);
  assert.equal(availabilityForDate(day, zone, [], [], [], [{ local_date: day, opens_at: null, closes_at: null, is_closed: true }]).open, null);
});
