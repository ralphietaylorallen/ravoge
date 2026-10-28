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

test("SMTP requires server-only credentials, TLS and explicit recipient acceptance", async (t) => {
  const keys = ["RAVOGE_SMTP_HOST", "RAVOGE_SMTP_PORT", "RAVOGE_SMTP_USER", "SMTP_USER", "SMTP_PASS", "RAVOGE_SMTP_PASSWORD", "RAVOGE_EMAIL_FROM", "RAVOGE_EMAIL_REPLY_TO"];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let requests = 0;
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  let outcome: "accepted" | "rejected" | "auth" | "network" | "alias" = "accepted";
  t.mock.method(nodemailer, "createTransport", ((options: Record<string, unknown>) => {
    requests++;
    assert.equal(options.host, "smtp.office365.com");
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.tls, { minVersion: "TLSv1.2" });
    assert.deepEqual(options.auth, { user: "dane@ravoge.com", pass: " fixture password with spaces " });
    return { sendMail: async (mail: Record<string, unknown>) => {
      assert.deepEqual(mail.from, { name: "Ravoge", address: "info@ravoge.com" });
      assert.deepEqual(mail.replyTo, mail.from);
      assert.equal(mail.to, input.recipientEmail);
      assert.deepEqual(mail.envelope, { from: "info@ravoge.com", to: [input.recipientEmail] });
      assert.ok(!String(mail.html).includes("fixture password"));
      if (outcome === "auth") throw Object.assign(new Error("sensitive recipient@example.test token=secret password=secret"), { code: "EAUTH", responseCode: 535 });
      if (outcome === "alias") throw Object.assign(new Error("sensitive transport error"), { code: "EENVELOPE", responseCode: 550, response: "550 5.7.60 Client doesn't have permissions to send as this sender. secret" });
      if (outcome === "network") throw new Error("sensitive connection detail");
      return { messageId: "smtp-test-id", envelope: mail.envelope, accepted: outcome === "accepted" ? [input.recipientEmail] : [], rejected: outcome === "rejected" ? [input.recipientEmail] : [] };
    } };
  }) as unknown as typeof nodemailer.createTransport);
  try {
    for (const key of keys) delete process.env[key];
    process.env.SMTP_PASS = "legacy-must-not-be-used";
    process.env.SMTP_USER = "obsolete-alias@example.test";
    assert.equal((await sendInvitationEmail(input)).status, "not_configured");
    assert.equal(requests, 0);
    Object.assign(process.env, { RAVOGE_SMTP_HOST: "smtp.office365.com", RAVOGE_SMTP_PORT: "587", RAVOGE_SMTP_USER: "dane@ravoge.com", RAVOGE_SMTP_PASSWORD: " fixture password with spaces ", RAVOGE_EMAIL_FROM: "Ravoge <info@ravoge.com>", RAVOGE_EMAIL_REPLY_TO: "info@ravoge.com" });
    assert.equal((await sendInvitationEmail(input)).status, "sent");
    outcome = "rejected";
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    outcome = "auth";
    const failed = await sendInvitationEmail(input);
    assert.equal(failed.status, "failed");
    assert.ok(failed.error?.includes("authenticate"));
    assert.ok(!JSON.stringify(diagnostics).includes("secret"));
    assert.ok(!JSON.stringify(diagnostics).includes("recipient@example.test"));
    assert.ok(JSON.stringify(diagnostics).includes("535"));
    outcome = "alias";
    assert.match((await sendInvitationEmail(input)).error ?? "", /Microsoft 365 Send From Alias must be enabled/);
    assert.ok(JSON.stringify(diagnostics).includes("5.7.60"));
    assert.ok(!JSON.stringify(diagnostics).includes("secret"));
    outcome = "network";
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    process.env.RAVOGE_SMTP_PORT = "invalid";
    assert.equal((await sendInvitationEmail(input)).status, "failed");
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
  assert.ok(!client.html.includes("info@ravoge.com"));
  assert.ok(createInvitationEmailContent(input).html.includes(">Create your account</a>"));
});

test("Client SMTP recipient is normalized independently of sender credentials, with no fallback", async t => {
  const keys = ["RAVOGE_SMTP_HOST", "RAVOGE_SMTP_USER", "RAVOGE_SMTP_PORT", "RAVOGE_SMTP_PASSWORD", "RAVOGE_EMAIL_FROM", "RAVOGE_EMAIL_REPLY_TO"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let calls = 0;
  t.mock.method(nodemailer, "createTransport", (() => ({ sendMail: async (mail: Record<string, unknown>) => {
    calls++;
    assert.equal(mail.to, "client+training@external.example.test");
    assert.deepEqual(mail.envelope, { from: "info@ravoge.com", to: ["client+training@external.example.test"] });
    assert.deepEqual(mail.replyTo, { name: "Ravoge", address: "info@ravoge.com" });
    return { messageId: "client-test-id", envelope: mail.envelope, accepted: ["client+training@external.example.test"], rejected: [] };
  } })) as unknown as typeof nodemailer.createTransport);
  try {
    Object.assign(process.env, { RAVOGE_SMTP_HOST: "smtp.office365.com", RAVOGE_SMTP_USER: "dane@ravoge.com", RAVOGE_SMTP_PORT: "587", RAVOGE_SMTP_PASSWORD: "mock-password", RAVOGE_EMAIL_FROM: "Ravoge <info@ravoge.com>", RAVOGE_EMAIL_REPLY_TO: "info@ravoge.com" });
    assert.equal((await sendInvitationEmail({ ...input, role: "client", recipientEmail: " CLIENT+Training@External.Example.Test " })).status, "sent");
    for (const recipientEmail of ["", "info", "client@example.test,other@example.test"]) assert.equal((await sendInvitationEmail({ ...input, role: "client", recipientEmail })).status, "failed");
    assert.equal(calls, 1);
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
