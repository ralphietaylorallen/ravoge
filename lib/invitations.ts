import "server-only";

import type { AccountRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type InvitationContext = {
  accountExists: boolean;
  email: string;
  expiresAt: string;
  inviterName: string;
  inviterRole: AccountRole;
  organizationName: string;
  role: AccountRole;
};

export type EnrollmentContext = {
  accountExists: boolean;
  email: string | null;
  enrollmentKind: "email_invitation" | "organization_qr";
  expiresAt: string | null;
  inviterName: string;
  inviterRole: AccountRole;
  organizationName: string;
  role: AccountRole;
};

type InvitationContextRow = {
  account_exists: boolean;
  email: string;
  expires_at: string;
  inviter_name: string;
  inviter_role: AccountRole;
  organization_name: string;
  role: AccountRole;
};

type EnrollmentContextRow = {
  account_exists: boolean;
  email: string | null;
  enrollment_kind: "email_invitation" | "organization_qr";
  expires_at: string | null;
  inviter_name: string;
  inviter_role: AccountRole;
  organization_name: string;
  role: AccountRole;
};

export async function getOrganizationEnrollmentContext(enrollmentToken?: string) {
  const token = enrollmentToken?.trim() ?? "";
  if (token.length < 32) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_organization_enrollment_handoff",
    { enrollment_token: token },
  );
  const row = (data as EnrollmentContextRow[] | null)?.[0];
  if (
    error || !row
    || !["email_invitation", "organization_qr"].includes(row.enrollment_kind)
    || !["owner", "coach", "client"].includes(row.role)
    || !["owner", "coach", "client"].includes(row.inviter_role)
  ) return null;

  return {
    accountExists: row.account_exists,
    email: row.email,
    enrollmentKind: row.enrollment_kind,
    expiresAt: row.expires_at,
    inviterName: row.inviter_name,
    inviterRole: row.inviter_role,
    organizationName: row.organization_name,
    role: row.role,
  } satisfies EnrollmentContext;
}

export async function getInvitationContext(invitationToken?: string) {
  const token = invitationToken?.trim() ?? "";
  if (token.length < 32) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_organization_invitation_handoff",
    { invitation_token: token },
  );
  const row = (data as InvitationContextRow[] | null)?.[0];
  if (
    error || !row
    || !["owner", "coach", "client"].includes(row.role)
    || !["owner", "coach", "client"].includes(row.inviter_role)
  ) {
    return null;
  }
  return {
    accountExists: row.account_exists,
    email: row.email,
    expiresAt: row.expires_at,
    inviterName: row.inviter_name,
    inviterRole: row.inviter_role,
    organizationName: row.organization_name,
    role: row.role,
  } satisfies InvitationContext;
}
