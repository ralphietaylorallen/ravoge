import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL("../../" + path, import.meta.url), "utf8");

test("Coach schedule renders a seven-day booking calendar for assigned clients", async () => {
  const [page, calendar] = await Promise.all([
    read("app/coach/schedule/page.tsx"),
    read("components/coach-booking-calendar.tsx"),
  ]);

  assert.match(page, /coach_client_assignments/);
  assert.match(page, /get_staff_booking_calendar/);
  assert.match(page, /Array\.from\(\{ length: 7 \}/);
  assert.match(page, /CoachBookingCalendar/);
  assert.match(calendar, /Weekly calendar/);
  assert.match(calendar, /Client/);
  assert.match(calendar, /Confirm & Book/);
  assert.match(calendar, /Existing sessions stay visible/);
});

test("Coach calendar booking always uses the authenticated coach", async () => {
  const actions = await read("app/schedule/staff-actions.ts");

  assert.match(actions, /createCoachCalendarBookingAction/);
  assert.match(actions, /requireRole\("coach"\)/);
  assert.match(actions, /target_coach_user_id: userId/);
  assert.match(actions, /coach_client_assignments/);
  assert.match(actions, /create_staff_appointment/);
});

test("Coach calendar confirmation requires an explicit submit after selecting a time", async () => {
  const calendar = await read("components/coach-booking-calendar.tsx");

  assert.match(calendar, /setSelectedSlot\(slot\.starts_at\)/);
  assert.match(calendar, /Confirm session/);
  assert.match(calendar, /type="submit"/);
  assert.match(calendar, /Confirm & Book/);
  assert.doesNotMatch(calendar, /onClick=\{[^}]*createCoachCalendarBookingAction/);
});
