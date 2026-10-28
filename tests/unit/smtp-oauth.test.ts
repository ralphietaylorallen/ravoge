import assert from "node:assert/strict";
import { constants, generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import nodemailer from "nodemailer";
import { getSmtpOAuthAccessToken } from "../../lib/smtp-oauth.ts";
import { sendInvitationEmail } from "../../lib/invitation-email.ts";

test("certificate OAuth signs short-lived assertions, caches tokens, refreshes before expiry and never uses a mailbox password", async t => {
  const keys = ["RAVOGE_SMTP_AUTH", "RAVOGE_SMTP_OAUTH_TENANT_ID", "RAVOGE_SMTP_OAUTH_CLIENT_ID", "RAVOGE_SMTP_OAUTH_CERT_SHA256", "RAVOGE_SMTP_OAUTH_PRIVATE_KEY", "RAVOGE_SMTP_HOST", "RAVOGE_SMTP_USER", "RAVOGE_SMTP_PORT", "RAVOGE_EMAIL_FROM", "RAVOGE_EMAIL_REPLY_TO", "RAVOGE_SMTP_PASSWORD"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const tenant = "00000000-0000-4000-8000-000000000001";
  const client = "00000000-0000-4000-8000-000000000002";
  const endpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  let requests = 0;
  let fail = false;
  let malformed = false;
  let sent = 0;
  const assertions = new Set<string>();
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requests++;
    assert.equal(url, endpoint);
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    const form = options.body as URLSearchParams;
    assert.equal(form.get("scope"), "https://outlook.office365.com/.default");
    assert.equal(form.get("grant_type"), "client_credentials");
    assert.equal(form.get("client_secret"), null);
    const jwt = form.get("client_assertion")!;
    const [header, claims, signature] = jwt.split(".");
    assert.ok(verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, Buffer.from(signature, "base64url")));
    assert.equal(JSON.parse(Buffer.from(header, "base64url").toString()).alg, "PS256");
    const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
    assert.equal(payload.aud, endpoint);
    assert.equal(payload.iss, client);
    assert.equal(payload.sub, client);
    assert.equal(payload.exp - payload.iat, 300);
    assert.ok(!assertions.has(payload.jti));
    assertions.add(payload.jti);
    if (fail) return new Response(JSON.stringify({ error_description: "private-provider-detail", error_codes: [700027] }), { status: 401 });
    return Response.json(malformed ? { access_token: "private-access-token" } : { token_type: "Bearer", access_token: "private-access-token", expires_in: 3600 });
  });
  t.mock.method(nodemailer, "createTransport", ((options: Record<string, unknown>) => {
    assert.deepEqual(options.auth, { type: "OAuth2", user: "dane@ravoge.com", accessToken: "private-access-token" });
    assert.ok(!JSON.stringify(options).includes("must-not-read"));
    return { sendMail: async (mail: Record<string, unknown>) => {
      sent++;
      assert.deepEqual(mail.from, { name: "Ravoge", address: "info@ravoge.com" });
      assert.deepEqual(mail.replyTo, mail.from);
      assert.equal(mail.to, "client@example.test");
      return { messageId: "oauth-test", envelope: mail.envelope, accepted: [mail.to], rejected: [] };
    } };
  }) as unknown as typeof nodemailer.createTransport);
  const input = { role: "client" as const, recipientEmail: "client@example.test", organizationName: "Test Gym", invitationUrl: "https://ravoge.com/signup/client?enrollment=test-only" };
  try {
    Object.assign(process.env, { RAVOGE_SMTP_AUTH: "oauth2", RAVOGE_SMTP_OAUTH_TENANT_ID: tenant, RAVOGE_SMTP_OAUTH_CLIENT_ID: client, RAVOGE_SMTP_OAUTH_CERT_SHA256: "a".repeat(64), RAVOGE_SMTP_OAUTH_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"), RAVOGE_SMTP_HOST: "smtp.office365.com", RAVOGE_SMTP_PORT: "587", RAVOGE_SMTP_USER: "dane@ravoge.com", RAVOGE_EMAIL_FROM: "Ravoge <info@ravoge.com>", RAVOGE_EMAIL_REPLY_TO: "info@ravoge.com", RAVOGE_SMTP_PASSWORD: "must-not-read" });
    assert.deepEqual(await Promise.all([getSmtpOAuthAccessToken(), getSmtpOAuthAccessToken()]), ["private-access-token", "private-access-token"]);
    assert.equal(requests, 1);
    assert.equal((await sendInvitationEmail(input)).status, "sent");
    assert.equal(requests, 1);
    const now = Date.now();
    const clock = t.mock.method(Date, "now", () => now + 3_500_000);
    assert.equal(await getSmtpOAuthAccessToken(), "private-access-token");
    assert.equal(requests, 2);
    clock.mock.restore();
    delete process.env.RAVOGE_SMTP_OAUTH_CLIENT_ID;
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    assert.equal(sent, 1);
    process.env.RAVOGE_SMTP_OAUTH_CLIENT_ID = client;
    process.env.RAVOGE_SMTP_OAUTH_TENANT_ID = "https://attacker.example.test";
    await assert.rejects(getSmtpOAuthAccessToken(), { code: "ECONFIG" });
    assert.equal(requests, 2);
    process.env.RAVOGE_SMTP_OAUTH_TENANT_ID = tenant;
    process.env.RAVOGE_SMTP_OAUTH_CERT_SHA256 = "b".repeat(64);
    fail = true;
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    assert.equal(sent, 1);
    assert.ok(JSON.stringify(logs).includes("EOAUTH"));
    assert.ok(JSON.stringify(logs).includes("700027"));
    assert.ok(!JSON.stringify(logs).includes("private-"));
    assert.ok(!JSON.stringify(logs).includes("must-not-read"));
    fail = false;
    malformed = true;
    await assert.rejects(getSmtpOAuthAccessToken(), { code: "EOAUTH" });
    process.env.RAVOGE_SMTP_AUTH = "typo";
    assert.equal((await sendInvitationEmail(input)).status, "failed");
    assert.equal(sent, 1);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
