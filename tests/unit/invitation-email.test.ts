import assert from "node:assert/strict";
import test from "node:test";
import { sendInvitationEmail } from "../../lib/invitation-email.ts";

test("invitation adapter skips missing configuration and reports provider results truthfully", async () => {
  const originalKey = process.env.RESEND_API_KEY, originalFrom = process.env.RAVOGE_EMAIL_FROM, originalFetch = globalThis.fetch;
  const input = { invitationUrl: "https://ravoge.com/enroll/coach?token=test-only-opaque-fixture", organizationName: "Test <gym>", recipientEmail: "intended@example.test", role: "coach" as const };
  let requests = 0;
  try {
    delete process.env.RESEND_API_KEY; delete process.env.RAVOGE_EMAIL_FROM;
    globalThis.fetch = async () => { requests += 1; throw new Error("Must not contact provider"); };
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    assert.equal(requests, 0);
    process.env.RESEND_API_KEY = "unit-test-placeholder";
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    process.env.RAVOGE_EMAIL_FROM = "Ravoge <test@example.test>";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.to, ["intended@example.test"]);
      assert.ok(body.html.includes("Test &lt;gym&gt;"));
      assert.ok(!body.html.includes("unit-test-placeholder"));
      return new Response(JSON.stringify({ id: "unit-test-message" }), { status: 200 });
    };
    assert.equal((await sendInvitationEmail(input)).status, "sent");
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "provider detail must not leak" }), { status: 403 });
    const failed = await sendInvitationEmail(input);
    assert.equal(failed.status, "failed"); assert.ok(!failed.error?.includes("provider detail"));
    globalThis.fetch = async () => { throw new Error("Connection failed"); };
    assert.equal((await sendInvitationEmail(input)).status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RAVOGE_EMAIL_FROM; else process.env.RAVOGE_EMAIL_FROM = originalFrom;
  }
});
