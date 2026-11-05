import test from "node:test";
import assert from "node:assert/strict";
import { parseAccessSelection, selectAuthorizedMembership, type AuthorizedMembership } from "../../lib/access-selection.ts";

const gym = "a1000000-0000-4000-8000-000000000001";
const coach: AuthorizedMembership = { id: "membership", organization_id: gym, organization_name: "Test", role: "coach", status: "active" };
const client: AuthorizedMembership = { ...coach, role: "client" };
test("selection is matched to authorized gym and role, with no arbitrary multi-role fallback", () => {
  assert.equal(selectAuthorizedMembership([coach, client], null), null);
  assert.equal(selectAuthorizedMembership([coach, client], { organizationId: gym, role: "client" }), client);
  assert.equal(selectAuthorizedMembership([client], { organizationId: gym, role: "coach" }), null);
  assert.equal(selectAuthorizedMembership([client], { organizationId: "different", role: "client" }), null);
  assert.equal(selectAuthorizedMembership([client], null), client);
  assert.equal(selectAuthorizedMembership([], null), null);
});
test("view preference rejects malformed identities and roles", () => {
  for (const value of [undefined, "", `${gym}:admin`, `${gym}:coach:extra`, "other:coach", `${gym}:COACH`]) assert.equal(parseAccessSelection(value), null);
  assert.deepEqual(parseAccessSelection(`${gym}:coach`), { organizationId: gym, role: "coach" });
});
