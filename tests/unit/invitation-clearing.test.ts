import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ModuleKind, transpileModule } from "typescript";

const id = "99000000-0000-0000-0000-000000000001";
function harness(role = "owner", fail = "") {
  const calls: { name: string; args: unknown }[] = [], paths: string[] = [];
  const source = transpileModule(readFileSync(new URL("../../app/owner/team/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => paths.push(path) },
    "@/lib/auth": { requireRole: async (expected: string) => {
      if (role !== expected) throw new Error("denied");
      return { supabase: { rpc: (name: string, args: unknown) => { calls.push({ name, args }); return { abortSignal: async () => {
        if (fail === "network") throw new Error("private detail");
        return { data: fail ? null : 1, error: fail ? { code: "42501", message: "private detail" } : null };
      } }; } } };
    } },
  };
  const exports: Record<string, (ids: unknown) => Promise<{ status: string; message: string }>> = {};
  new Function("require", "exports", source)((name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, exports);
  return { clear: exports.clearEmailInvitationsAction, calls, paths };
}

test("clearing requires Owner authorization and accepts only bounded invitation IDs", async () => {
  for (const role of ["coach", "client", "anonymous"]) { const h = harness(role); await assert.rejects(h.clear([id]), /denied/); assert.equal(h.calls.length, 0); }
  const h = harness();
  for (const input of [[], ["invalid"], [null], [{ id, role: "owner", organization_id: "forged" }], Array(1001).fill(id), null]) assert.equal((await h.clear(input)).status, "error");
  assert.equal(h.calls.length, 0);
  assert.equal((await h.clear([id, id])).status, "success");
  assert.deepEqual(h.calls, [{ name: "clear_email_invitations", args: { invitation_ids: [id] } }]);
  assert.deepEqual(h.paths, ["/owner/team"]);
});

test("clearing reports permission/network failures inline without claiming success or exposing details", async () => {
  for (const failure of ["permission", "network"]) {
    const h = harness("owner", failure), result = await h.clear([id]);
    assert.equal(result.status, "error"); assert.match(result.message, /not be confirmed|not confirmed/);
    assert.ok(!result.message.includes("private detail")); assert.equal(h.calls.length, 1); assert.equal(h.paths.length, 0);
  }
});

test("invitation clearing fixtures cannot target hosted production", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-beta-ui.mjs"], { encoding: "utf8", env: { ...process.env, SUPABASE_DB_TARGET: "hosted", RAVOGE_BETA_QA: "yes", RAVOGE_INVITATION_CLEAR_QA: "yes", PLAYWRIGHT_BASE_URL: "https://ravoge.com" } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Invitation clearing fixtures require isolated local Supabase/);
  assert.ok(!result.stdout.includes("Preparing"));
});
