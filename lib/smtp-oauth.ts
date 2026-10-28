import "server-only";

import { constants, createHash, createPrivateKey, randomUUID, sign } from "node:crypto";

let cached: { key: string; token: string; expires: number } | undefined;
let pending: { key: string; promise: Promise<string> } | undefined;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// App-only Exchange SMTP, scoped to the sending mailbox by Exchange application RBAC.
// Do not fall back to a mailbox password if OAuth configuration/token acquisition fails.
export async function getSmtpOAuthAccessToken(): Promise<string> {
  const tenant = process.env.RAVOGE_SMTP_OAUTH_TENANT_ID?.trim();
  const client = process.env.RAVOGE_SMTP_OAUTH_CLIENT_ID?.trim();
  const thumbprint = process.env.RAVOGE_SMTP_OAUTH_CERT_SHA256?.trim();
  const pem = process.env.RAVOGE_SMTP_OAUTH_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!tenant || !client || !guid.test(tenant) || !guid.test(client) || !thumbprint || !/^[0-9a-f]{64}$/i.test(thumbprint) || !pem) throw { code: "ECONFIG" };
  const key = createHash("sha256").update(JSON.stringify([tenant, client, thumbprint, pem])).digest("hex");
  if (cached?.key === key && cached.expires > Date.now() + 120_000) return cached.token;
  if (pending?.key === key) return pending.promise;

  const promise = (async () => {
    try {
      const privateKey = createPrivateKey(pem);
      if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw { code: "ECONFIG" };
      const endpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const unsigned = `${encode({ alg: "PS256", typ: "JWT", "x5t#S256": Buffer.from(thumbprint, "hex").toString("base64url") })}.${encode({ aud: endpoint, iss: client, sub: client, jti: randomUUID(), iat: now, nbf: now - 30, exp: now + 300 })}`;
      const assertion = `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }).toString("base64url")}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: client, scope: "https://outlook.office365.com/.default", grant_type: "client_credentials", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion }),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      // Never log token responses, assertions, private keys or provider descriptions.
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error_codes?: unknown[] } | null;
        const value = failure?.error_codes?.[0];
        throw { code: "EOAUTH", oauthStatus: response.status, aadErrorCode: typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 100_000_000 ? value : undefined };
      }
      const data = await response.json() as { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
      if (typeof data.access_token !== "string" || !data.access_token || data.token_type !== "Bearer" || typeof data.expires_in !== "number" || data.expires_in < 180 || data.expires_in > 86400) throw { code: "EOAUTH" };
      cached = { key, token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
      return data.access_token;
    } catch (error) {
      if ((error as { code?: string })?.code === "ECONFIG") throw { code: "ECONFIG" };
      const failure = error as { code?: string; oauthStatus?: number; aadErrorCode?: number } | null;
      throw { code: "EOAUTH", oauthStatus: failure?.code === "EOAUTH" ? failure.oauthStatus : undefined, aadErrorCode: failure?.code === "EOAUTH" ? failure.aadErrorCode : undefined };
    }
  })();
  pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}
