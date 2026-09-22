import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { dashboardForRole, getActiveMembership } from "@/lib/auth";
import { ENROLLMENT_HANDOFF_COOKIE, getEnrollmentHandoff } from "@/lib/enrollment";
import { createClient } from "@/lib/supabase/server";

function redirectResponse(request: NextRequest, destination: string, consume = false) {
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (consume) response.cookies.delete(ENROLLMENT_HANDOFF_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const membership = data.user ? await getActiveMembership(data.user.id, supabase) : null;
  if (membership) return redirectResponse(request, dashboardForRole(membership.role), true);

  const handoff = await getEnrollmentHandoff();
  if (!handoff) return redirectResponse(request, "/login", true);
  if (!data.user) {
    return redirectResponse(
      request,
      handoff.invitation.accountExists ? "/login" : `/signup/${handoff.invitation.role}`,
    );
  }

  const { error } = await supabase.rpc("accept_organization_invitation", {
    invitation_token: handoff.token,
  });
  if (error) {
    return redirectResponse(
      request,
      `/${handoff.invitation.role}/install?status=invalid-invitation`,
      true,
    );
  }
  const acceptedMembership = await getActiveMembership(data.user.id, supabase);
  return acceptedMembership
    ? redirectResponse(request, dashboardForRole(acceptedMembership.role), true)
    : redirectResponse(request, "/login?status=membership-unavailable", true);
}
