import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, transpileModule } from "typescript";
import { groupWeek, moveGroupDate, validGroupDate, type DuplicateWeekResult } from "../../lib/group-programming.ts";

function harness(role = "owner", outcome: Record<string,unknown> = { status: "success", programs: [], destinationWeek: "2026-11-02" }, error: { code: string } | null = null) {
  const calls: { name: string; args: Record<string,unknown> }[] = [];
  const source = transpileModule(readFileSync(new URL("../../app/group-programming-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string,(...args:unknown[])=>Promise<DuplicateWeekResult>> = {};
  const dependencies: Record<string,unknown> = {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/group-programming": { groupWeek, validGroupDate },
    "@/lib/auth": { requireRole: async (expected: string) => { if (role !== expected) throw new Error("denied"); return { supabase: { rpc: (name: string, args: Record<string,unknown>) => { calls.push({name,args}); return { abortSignal: async () => ({ data: outcome, error }) }; } } }; } },
  };
  new Function("require", "exports", source)((name:string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, exports);
  return { duplicate: exports.duplicateGroupWeekAction, calls };
}
test("duplicate action requires Owner authorization and never accepts a browser gym or workout payload", async () => {
  for (const role of ["coach", "client"]) { const h = harness(role); await assert.rejects(h.duplicate("2026-10-26"), /denied/); assert.equal(h.calls.length, 0); }
  const h = harness();
  assert.equal((await h.duplicate("2026-10-26")).status, "success");
  assert.deepEqual(h.calls[0], {name:"duplicate_group_programming_week",args:{source_monday:"2026-10-26",conflict_mode:"check",expected_destination:null}});
  for (const value of ["2026-10-27", "2026-11-01", "2026-02-30", "gym-id", "2026-10-26junk"]) assert.equal((await h.duplicate(value)).status, "error");
  assert.equal((await h.duplicate("2026-10-26", "overwrite-everything")).status, "error");
  assert.equal(h.calls.length, 1);
});
test("destination conflicts do not publish or silently retry; explicit replacement passes the reviewed versions", async () => {
  const expectedDestination = Object.fromEntries(groupWeek("2026-11-02").map(date => [date, 1]));
  const h = harness("owner", {status:"conflict",destinationWeek:"2026-11-02",expectedDestination});
  const result = await h.duplicate("2026-10-26");
  assert.equal(result.status, "conflict"); assert.deepEqual(result.expectedDestination, expectedDestination);
  assert.equal(h.calls.length, 1);
  await h.duplicate("2026-10-26", "replace", expectedDestination);
  assert.deepEqual(h.calls.at(-1)?.args, {source_monday:"2026-10-26",conflict_mode:"replace",expected_destination:expectedDestination});
  await h.duplicate("2026-10-26", "empty", expectedDestination);
  assert.equal(h.calls.at(-1)?.args.expected_destination, null);
});
test("stale destination and empty source return useful errors inside the existing page", async () => {
  assert.match((await harness("owner", {}, {code:"40001"}).duplicate("2026-10-26")).message, /next week changed/);
  assert.match((await harness("owner", {}, {code:"P0002"}).duplicate("2026-10-26")).message, /Save at least one/);
});
test("calendar-date duplication retains weekdays across gym DST and year boundaries", () => {
  for (const monday of ["2026-10-26", "2026-03-02", "2026-12-28"]) {
    const next = moveGroupDate(monday, 7);
    assert.deepEqual(groupWeek(monday).map(date => moveGroupDate(date, 7)), groupWeek(next));
    for (let i=0;i<6;i++) assert.equal(new Date(`${groupWeek(next)[i]}T12:00:00Z`).getUTCDay(), i+1);
  }
});
