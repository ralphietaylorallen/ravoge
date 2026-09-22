import "server-only";

import type { AccountRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type InvitationContext = {
  email: string;
  expiresAt: string;
  inviterName: string;
  inviterRole: AccountRole;
  organizationName: string;
  role: AccountRole;
};

type InvitationContextRow = {
  email: string;
  expires_at: string;
  inviter_name: string;
  inviter_role: AccountRole;
  organization_name: string;
  role: AccountRole;
};

export async function getInvitationContext(invitationToken?: string) {
  const token = invitationToken?.trim() ?? "";
  if (token.length < 32) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_organization_invitation_context_v2",
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
    email: row.email,
    expiresAt: row.expires_at,
    inviterName: row.inviter_name,
    inviterRole: row.inviter_role,
    organizationName: row.organization_name,
    role: row.role,
  } satisfies InvitationContext;
}
