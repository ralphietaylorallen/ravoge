import assert from "node:assert/strict";
import { test } from "node:test";
import { groupMonday, groupWeek, groupStatus, publishableGroupDates, validGroupDate, type GroupProgram } from "../../lib/group-programming.ts";

const program = { id: "test", programming_date: "2026-11-02", raw_workout_text: "  EMOM 12\n1. Row 250 m\n2. 8 / side @ 55 lb  \n", revision: 1, published_revision: null, mindbody_sync_status: "not_configured" } as GroupProgram;
test("Monday–Saturday dates are stable across DST, month/year boundaries and invalid input", () => {
  assert.equal(groupMonday("2026-11-01"), "2026-10-26");
  assert.deepEqual(groupWeek("2026-12-28"), ["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02"]);
  for (const value of ["2026-02-30", "2026-11-08", "2026-11-02junk", "1999-12-31", "2101-01-01"]) assert.equal(validGroupDate(value), false);
  assert.equal(validGroupDate("2026-11-02"), true);
});
test("status never infers Mindbody success from Ravoge publication", () => {
  assert.equal(groupStatus(), "Empty"); assert.equal(groupStatus(program), "Draft Saved");
  assert.equal(groupStatus(program,true), "Unsaved Changes");
  assert.equal(groupStatus({ ...program, published_revision: 1, mindbody_sync_status: "blocked" }), "Published to Ravoge");
  assert.equal(groupStatus({ ...program, published_revision: 1, revision: 2 }), "Updated Draft");
  assert.equal(groupStatus({ ...program, published_revision: 1, mindbody_sync_status: "failed" }), "Mindbody Sync Failed — Retry");
});
test("selection publishes only checked saved non-empty dates without altering raw text", () => {
  const before = program.raw_workout_text;
  const rows = [program, { ...program, programming_date: "2026-11-03", raw_workout_text: "   \n\t" }, { ...program, programming_date: "2026-11-04" }];
  assert.deepEqual(publishableGroupDates(rows,["2026-11-02","2026-11-02","2026-11-03","2026-11-05"]),["2026-11-02"]);
  assert.deepEqual(publishableGroupDates(rows,groupWeek("2026-11-02")),["2026-11-02","2026-11-04"]);
  assert.equal(program.raw_workout_text,before);
});
