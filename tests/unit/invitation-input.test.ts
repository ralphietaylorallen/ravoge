import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInvitationEmail, parseInvitationEmails } from "../../lib/invitation-input.ts";

test("bulk invitations normalize case and whitespace and deduplicate without changing recipients", () => {
  assert.deepEqual(parseInvitationEmails(" First@Example.test \r\nsecond@example.test\nFIRST@example.test\n\n"), {
    emails: ["first@example.test", "second@example.test"], duplicates: ["first@example.test"], invalid: [], tooMany: false,
  });
});
test("bulk invitations reject multiple recipients per line and malformed values", () => {
  assert.equal(normalizeInvitationEmail("a@example.test,b@example.test"), null);
  assert.equal(normalizeInvitationEmail("Name <a@example.test>"), null);
  const result = parseInvitationEmails("bad\nx@y\nvalid+coach@example.test");
  assert.deepEqual(result.invalid, ["bad", "x@y"]);
  assert.deepEqual(result.emails, ["valid+coach@example.test"]);
  assert.equal(parseInvitationEmails(Array.from({ length: 26 }, (_, i) => `coach${i}@example.test`).join("\n")).tooMany, true);
});
