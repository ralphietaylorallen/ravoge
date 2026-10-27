import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, transpileModule } from "typescript";
import { normalizeInvitationEmail, parseInvitationEmails, MAX_BULK_INVITATIONS } from "../../lib/invitation-input.ts";

// Execute the real Server Action, replacing only its Auth/DB/request boundaries.
// Membership role/org remain the existing RPC's authority; no real identities are used.
function harness(valid = true) {
  let accepted = false;
  const signups: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "get_organization_enrollment_handoff") return { data: valid ? [{ email: "client@example.test", role: "client", enrollment_kind: "email_invitation" }] : [], error: null };
      if (name === "accept_organization_enrollment") { accepted = true; return { data: "client", error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
    auth: {
      signUp: async (args: Record<string, unknown>) => { signups.push(args); return { data: { session: {}, user: { id: "test-client" } }, error: null }; },
      getUser: async () => ({ data: { user: { id: "test-client" } }, error: null }),
    },
  };
  const cookies = { get: () => undefined, set: () => {}, delete: () => {} };
  const dependencies: Record<string, unknown> = {
    "node:crypto": { createHash, randomBytes },
    "next/cache": { revalidatePath: () => {} },
    "next/headers": { cookies: async () => cookies, headers: async () => ({ get: () => "ravoge.com" }) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/auth": { getActiveMembership: async () => accepted ? { role: "client", organization_id: "record-gym" } : null, dashboardForRole: (role: string) => `/${role}` },
    "@/lib/enrollment": { getEnrollmentHandoff: async () => null, clearEnrollmentHandoff: async () => {} },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/invitation-email": { sendInvitationEmail: () => { throw new Error("Signup must not send another invitation"); } },
    "@/lib/invitation-input": { normalizeInvitationEmail, parseInvitationEmails, MAX_BULK_INVITATIONS },
  };
  const source = transpileModule(readFileSync(new URL("../../app/auth/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<{ status: string; message?: string }>> = {};
  new Function("require", "exports", source)((name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  const form = () => {
    const value = new FormData();
    Object.entries({ fullName: "Test Client", email: "client@example.test", password: "SyntheticPassword123", confirmPassword: "SyntheticPassword123", invitationToken: "synthetic-client-token-00000000000000", role: "owner", organizationId: "forged-gym" }).forEach(([key, item]) => value.set(key, item));
    return value;
  };
  return { signups, rpcCalls, form, signup: exports.signupAction };
}

test("Client invitation rejects owner/coach route tampering, recipient mismatch and invalid token before account creation", async () => {
  for (const role of ["owner", "coach"]) {
    const h = harness(); const result = await h.signup(role, {}, h.form());
    assert.equal(result.status, "error"); assert.equal(h.signups.length, 0);
  }
  const wrong = harness(); const form = wrong.form(); form.set("email", "unrelated@example.test");
  assert.equal((await wrong.signup("client", {}, form)).status, "error"); assert.equal(wrong.signups.length, 0);
  const invalid = harness(false);
  assert.equal((await invalid.signup("client", {}, invalid.form())).status, "error"); assert.equal(invalid.signups.length, 0);
});

test("Client signup ignores editable role/gym fields and goes directly home after record-backed acceptance", async () => {
  const h = harness();
  await assert.rejects(h.signup("client", {}, h.form()), /redirect:\/client$/);
  assert.equal(h.signups.length, 1);
  assert.deepEqual((h.signups[0].options as { data: object }).data, { full_name: "Test Client" });
  const acceptance = h.rpcCalls.find(call => call.name === "accept_organization_enrollment")!;
  assert.deepEqual(Object.keys(acceptance.args), ["enrollment_token"]);
});
