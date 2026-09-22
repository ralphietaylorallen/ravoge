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
  const queryToken = request.nextUrl.searchParams.get("enrollment")?.trim() ?? "";
  if (queryToken) {
    const { getOrganizationEnrollmentContext } = await import("@/lib/invitations");
    const enrollment = await getOrganizationEnrollmentContext(queryToken);
    const response = redirectResponse(request, enrollment ? "/launch" : "/login?status=invalid-invitation");
    if (enrollment) {
      response.cookies.set(ENROLLMENT_HANDOFF_COOKIE, queryToken, {
        httpOnly: true,
        maxAge: 2 * 60 * 60,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const membership = data.user ? await getActiveMembership(data.user.id, supabase) : null;
  const handoff = await getEnrollmentHandoff();
  if (membership && handoff) {
    const { error } = await supabase.rpc("accept_organization_enrollment", {
      enrollment_token: handoff.token,
    });
    return error
      ? redirectResponse(request, `/${handoff.enrollment.role}/install?status=membership-conflict`, true)
      : redirectResponse(request, dashboardForRole(membership.role), true);
  }
  if (membership) return redirectResponse(request, dashboardForRole(membership.role), true);
  if (!handoff) return redirectResponse(request, "/login", true);
  if (!data.user) {
    return redirectResponse(
      request,
      handoff.enrollment.accountExists ? "/login" : `/signup/${handoff.enrollment.role}`,
    );
  }

  const { error } = await supabase.rpc("accept_organization_enrollment", {
    enrollment_token: handoff.token,
  });
  if (error) {
    return redirectResponse(
      request,
      `/${handoff.enrollment.role}/install?status=invalid-invitation`,
      true,
    );
  }
  const acceptedMembership = await getActiveMembership(data.user.id, supabase);
  return acceptedMembership
    ? redirectResponse(request, dashboardForRole(acceptedMembership.role), true)
    : redirectResponse(request, "/login?status=membership-unavailable", true);
}
