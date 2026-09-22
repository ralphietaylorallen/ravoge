import assert from "node:assert/strict";
import test from "node:test";

import {
  localDateInTimeZone,
  localWeekStartDate,
  organizationTodayWindow,
  shiftLocalDate,
} from "../../lib/timezone.ts";

test("Bozeman evening remains on the organization day after UTC advances", () => {
  const evening = new Date("2026-09-22T05:30:00.000Z");
  assert.equal(localDateInTimeZone(evening, "America/Denver"), "2026-09-21");
  assert.equal(shiftLocalDate(localDateInTimeZone(evening, "America/Denver"), 1), "2026-09-22");
  assert.equal(organizationTodayWindow("America/Denver", evening)?.localDate, "2026-09-21");
});

test("organization week keys use the local day rather than UTC", () => {
  const sundayNight = "2026-09-21T05:30:00.000Z";
  assert.equal(localDateInTimeZone(sundayNight, "America/Denver"), "2026-09-20");
  assert.equal(localWeekStartDate(sundayNight, "America/Denver"), "2026-09-14");
});
