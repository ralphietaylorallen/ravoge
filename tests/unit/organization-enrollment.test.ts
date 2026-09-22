import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveOrganizationEnrollmentToken,
  hashOrganizationEnrollmentToken,
  organizationEnrollmentUrl,
} from "../../lib/organization-enrollment.ts";

const fixtureKey = "00".repeat(32);

test("organization enrollment tokens are deterministic opaque 256-bit credentials", () => {
  const first = deriveOrganizationEnrollmentToken(
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    fixtureKey,
  );
  const same = deriveOrganizationEnrollmentToken(
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    fixtureKey,
  );
  const rotated = deriveOrganizationEnrollmentToken(
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000003",
    fixtureKey,
  );
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first, same);
  assert.notEqual(first, rotated);
  assert.match(hashOrganizationEnrollmentToken(first), /^[0-9a-f]{64}$/);
  assert.equal(organizationEnrollmentUrl("client", first), `https://ravoge.com/enroll/client?token=${first}`);
  assert.doesNotMatch(first, /client|00000000/i);
});

test("organization enrollment token derivation fails closed without a 32-byte secret", () => {
  assert.throws(
    () => deriveOrganizationEnrollmentToken("id", "nonce", "not-a-secret"),
    /32-byte/,
  );
});
