// A view preference only. Every use must be matched against current database access.
export const ACCESS_COOKIE = "ravoge_view";
export type AccessRole = "owner" | "coach" | "client";
export type AccessSelection = { organizationId: string; role: AccessRole };

export function parseAccessSelection(value?: string): AccessSelection | null {
  if (!value) return null;
  const [organizationId, role, extra] = value.split(":");
  if (extra || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)
    || !["owner", "coach", "client"].includes(role)) return null;
  return { organizationId, role: role as AccessRole };
}

export type AuthorizedMembership = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: AccessRole;
  status: "active";
};

export function selectAuthorizedMembership(memberships: AuthorizedMembership[], selection: AccessSelection | null) {
  return memberships.find(m => m.organization_id === selection?.organizationId && m.role === selection.role)
    ?? (!selection && memberships.length === 1 ? memberships[0] : null);
}
