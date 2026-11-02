import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nodemailer from "nodemailer";
import { createInvitationEmailContent, sendInvitationEmail } from "../../lib/invitation-email.ts";

const input = { invitationUrl: "https://ravoge.com/enroll/coach?token=unit-test-opaque-fixture", organizationName: "Test <gym>", recipientEmail: "intended@example.test", role: "coach" as const, inviterName: "Test Owner" };

test("invitation content uses existing email-bound signup, escaped branding and plain-link fallback", () => {
  const body = createInvitationEmailContent(input);
  assert.equal(body.subject, "You’re invited to coach at Test <gym> on Ravoge");
  assert.ok(body.html.includes("Test &lt;gym&gt;"));
  assert.ok(body.html.includes(">Create your account</a>"));
  assert.ok(body.html.includes("/brand/ravoge-wolf-transparent.png"));
  assert.ok(body.text.includes("https://ravoge.com/signup/coach?enrollment=unit-test-opaque-fixture"));
  assert.ok(body.text.includes(input.recipientEmail));
  assert.ok(body.text.includes("Test Owner invited you"));
});

test("Resend requires its own server-only configuration, with no SMTP dependency or fallback", async (t) => {
  const keys = ["RESEND_API_KEY", "RAVOGE_EMAIL_FROM", "RAVOGE_EMAIL_REPLY_TO"];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let requests = 0;
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  t.mock.method(console, "info", (...args: unknown[]) => diagnostics.push(args));
  const smtp = t.mock.method(nodemailer, "createTransport", () => { throw new Error("Invitations must never use SMTP"); });
  let outcome: "accepted" | "rejected" | "auth" | "network" | "missing-id" | "invalid-json" | "timeout" = "accepted";
  t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    requests++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options?.method, "POST");
    assert.deepEqual(options?.headers, { Authorization: "Bearer unit-fixture-only", "Content-Type": "application/json" });
    assert.ok(options?.signal instanceof AbortSignal);
    const mail = JSON.parse(String(options?.body));
    assert.equal(mail.from, "Ravoge <hello@ravoge.com>");
    assert.equal(mail.reply_to, "hello@ravoge.com");
    assert.deepEqual(mail.to, [input.recipientEmail]);
    assert.equal(mail.subject, createInvitationEmailContent(input).subject);
    assert.ok(mail.html.includes("/signup/coach?enrollment=unit-test-opaque-fixture"));
    assert.ok(mail.text.includes("/signup/coach?enrollment=unit-test-opaque-fixture"));
    assert.ok(!options?.body?.toString().includes("unit-fixture-only"));
    if (outcome === "network") throw new Error("sensitive recipient@example.test token=secret password=secret");
    if (outcome === "timeout") throw new DOMException("private timeout detail", "TimeoutError");
    if (outcome === "invalid-json") return new Response("private-provider-detail", { status: 502 });
    if (outcome === "auth" || outcome === "rejected") return new Response(JSON.stringify({ message: "private-provider-detail", id: "not-accepted" }), { status: outcome === "auth" ? 401 : 403 });
    return new Response(JSON.stringify(outcome === "missing-id" ? {} : { id: "resend-test-id" }), { status: 200 });
  });
  try {
    for (const key of keys) delete process.env[key];
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    assert.equal(requests, 0);
    process.env.RESEND_API_KEY = "unit-fixture-only";
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    Object.assign(process.env, { RAVOGE_EMAIL_FROM: "Ravoge <hello@ravoge.com>", RAVOGE_EMAIL_REPLY_TO: "hello@ravoge.com" });
    assert.deepEqual(await sendInvitationEmail(input), { error: null, id: "resend-test-id", status: "sent" });
    const connected = requests;
    for (const oldSender of ["dane@ravoge.com", "info@ravoge.com"]) {
      process.env.RAVOGE_EMAIL_FROM = `Ravoge <${oldSender}>`;
      process.env.RAVOGE_EMAIL_REPLY_TO = oldSender;
      assert.equal((await sendInvitationEmail(input)).status, "failed");
    }
    process.env.RAVOGE_EMAIL_FROM = "Ravoge <hello@ravoge.com>";
    process.env.RAVOGE_EMAIL_REPLY_TO = "info@ravoge.com";
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    assert.equal(requests, connected);
    process.env.RAVOGE_EMAIL_REPLY_TO = "hello@ravoge.com";
    for (const failure of ["rejected", "auth", "network", "missing-id", "invalid-json", "timeout"] as const) {
      outcome = failure;
      const before: number = requests;
      const result = await sendInvitationEmail(input);
      assert.equal(result.status, "failed");
      assert.equal(result.id, null);
      assert.match(result.error ?? "", /secure invite link/);
      assert.equal(requests, before + 1, "One API attempt, never an automatic retry");
      assert.ok(!JSON.stringify(result).includes("private-provider-detail"));
    }
    delete process.env.RESEND_API_KEY;
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    assert.equal(smtp.mock.callCount(), 0);
    for (const sensitive of ["secret", "recipient@example.test", "unit-fixture-only", "unit-test-opaque-fixture", "private-provider-detail", input.recipientEmail]) assert.ok(!JSON.stringify(diagnostics).includes(sensitive));
    const source = readFileSync(new URL("../../lib/invitation-email.ts", import.meta.url), "utf8");
    assert.ok(source.includes('import "server-only"'));
    assert.ok(!source.includes("RAVOGE_SMTP_"));
  } finally {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});

test("Client email has the requested copy and a direct role-locked signup button; Coach copy is preserved", () => {
  const client = createInvitationEmailContent({ ...input, role: "client", invitationUrl: "https://ravoge.com/enroll/client?token=client-unit-test-token" });
  assert.equal(client.subject, "You’re invited to join Test <gym> on Ravoge");
  assert.ok(client.text.includes("Test <gym> has invited you to use Ravoge for your training, workouts, progress and scheduling."));
  assert.ok(client.html.includes(">Create your Ravoge account</a>"));
  assert.ok(client.html.includes("https://ravoge.com/signup/client?enrollment=client-unit-test-token"));
  assert.ok(!client.html.includes("/signup/owner"));
  assert.ok(!client.html.includes("/signup/coach"));
  assert.ok(!client.html.includes("hello@ravoge.com"));
  assert.ok(createInvitationEmailContent(input).html.includes(">Create your account</a>"));
});

test("Resend preserves each invitation role and normalized recipient, with no recipient fallback", async t => {
  const keys = ["RESEND_API_KEY", "RAVOGE_EMAIL_FROM", "RAVOGE_EMAIL_REPLY_TO"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let calls = 0;
  let role: "coach" | "client" | "owner" = "client";
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    calls++;
    const mail = JSON.parse(String(options?.body));
    assert.deepEqual(mail.to, ["client+training@external.example.test"]);
    assert.equal(mail.from, "Ravoge <hello@ravoge.com>");
    assert.equal(mail.reply_to, "hello@ravoge.com");
    assert.ok(mail.html.includes(`/signup/${role}?enrollment=role-unit-test-token`));
    return new Response(JSON.stringify({ id: "role-test-id" }), { status: 200 });
  });
  try {
    Object.assign(process.env, { RESEND_API_KEY: "unit-fixture-only", RAVOGE_EMAIL_FROM: "Ravoge <hello@ravoge.com>", RAVOGE_EMAIL_REPLY_TO: "hello@ravoge.com" });
    for (role of ["coach", "client", "owner"] as const) {
      assert.equal((await sendInvitationEmail({ ...input, role, invitationUrl: `https://ravoge.com/enroll/${role}?token=role-unit-test-token`, recipientEmail: " CLIENT+Training@External.Example.Test " })).status, "sent");
    }
    for (const recipientEmail of ["", "info", "client@example.test,other@example.test"]) assert.equal((await sendInvitationEmail({ ...input, role: "client", recipientEmail })).status, "failed");
    assert.equal(calls, 3);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});

test("invitation UI keeps email and copy fallback, never a misleading mailto send", () => {
  const source = readFileSync(new URL("../../components/invite-form.tsx", import.meta.url), "utf8");
  for (const expected of ['useState("")', '"Sending…"', '"Send Coach Invite"', "disabled={pending}", '"Retry invitation"', 'label="Copy secure invitation"']) assert.ok(source.includes(expected));
  assert.ok(!source.includes("SMTP_PASSWORD"));
  assert.ok(!source.includes("mailto:"));
  const actions = readFileSync(new URL("../../app/auth/actions.ts", import.meta.url), "utf8");
  assert.ok(actions.includes('membership.role !== "owner"'));
  assert.ok(actions.includes('return refreshInvitationAction(pendingInvite.id'));
  assert.ok(actions.includes("< 60_000"));
});
