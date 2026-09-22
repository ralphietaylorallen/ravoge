import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountRole } from "@/lib/auth";

export type EnrollmentRole = Extract<AccountRole, "coach" | "client">;

export type OrganizationEnrollmentCredential = {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  organizationId: string;
  organizationName: string;
  revokedAt: string | null;
  role: EnrollmentRole;
  rotatedAt: string | null;
  status: "active" | "disabled";
  token: string;
  url: string;
};

type CredentialRow = {
  authorized_role: EnrollmentRole;
  created_at: string;
  credential_id: string;
  credential_status: "active" | "disabled";
  expires_at: string | null;
  organization_id: string;
  organization_name: string;
  revoked_at: string | null;
  rotated_at: string | null;
  rotation_nonce: string;
};

function enrollmentKey(value = process.env.RAVOGE_ENROLLMENT_TOKEN_KEY) {
  const normalized = value?.trim() ?? "";
  const bytes = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : /^[A-Za-z0-9_-]{43}$/.test(normalized)
      ? Buffer.from(normalized, "base64url")
      : Buffer.alloc(0);
  if (bytes.length !== 32) {
    throw new Error("RAVOGE_ENROLLMENT_TOKEN_KEY must be a 32-byte hex or base64url server secret.");
  }
  return bytes;
}

export function deriveOrganizationEnrollmentToken(
  credentialId: string,
  rotationNonce: string,
  secret?: string,
) {
  return createHmac("sha256", enrollmentKey(secret))
    .update(`ravoge:organization-enrollment:v1:${credentialId}:${rotationNonce}`)
    .digest("base64url");
}

export function hashOrganizationEnrollmentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function organizationEnrollmentUrl(role: EnrollmentRole, token: string) {
  return `https://ravoge.com/enroll/${role}?token=${encodeURIComponent(token)}`;
}

function credentialFromRow(row: CredentialRow): OrganizationEnrollmentCredential {
  const token = deriveOrganizationEnrollmentToken(row.credential_id, row.rotation_nonce);
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.credential_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    revokedAt: row.revoked_at,
    role: row.authorized_role,
    rotatedAt: row.rotated_at,
    status: row.credential_status,
    token,
    url: organizationEnrollmentUrl(row.authorized_role, token),
  };
}

export async function ensureOrganizationEnrollmentCredential(
  supabase: SupabaseClient,
  role: EnrollmentRole,
) {
  const credentialId = randomUUID();
  const rotationNonce = randomUUID();
  const token = deriveOrganizationEnrollmentToken(credentialId, rotationNonce);
  const { data, error } = await supabase.rpc("ensure_organization_enrollment_credential", {
    requested_credential_id: credentialId,
    requested_role: role,
    requested_rotation_nonce: rotationNonce,
    requested_token_hash: hashOrganizationEnrollmentToken(token),
  });
  const row = (data as CredentialRow[] | null)?.[0];
  if (error || !row) throw new Error("Ravoge could not prepare the organization enrollment credential.");
  return credentialFromRow(row);
}

export async function rotateOrganizationEnrollmentCredential(
  supabase: SupabaseClient,
  role: EnrollmentRole,
) {
  const current = await ensureOrganizationEnrollmentCredential(supabase, role);
  const rotationNonce = randomUUID();
  const token = deriveOrganizationEnrollmentToken(current.id, rotationNonce);
  const { error } = await supabase.rpc("rotate_organization_enrollment_credential", {
    requested_role: role,
    requested_rotation_nonce: rotationNonce,
    requested_token_hash: hashOrganizationEnrollmentToken(token),
  });
  if (error) throw new Error("Ravoge could not rotate the organization enrollment credential.");
}
