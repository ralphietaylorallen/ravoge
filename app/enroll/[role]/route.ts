import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { dashboardForRole, getActiveMembership } from "@/lib/auth";
import { ENROLLMENT_HANDOFF_COOKIE, ENROLLMENT_HANDOFF_MAX_AGE } from "@/lib/enrollment";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

const HANDOFF_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ role: string }> },
) {
  const { role } = await params;
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const enrollment = token ? await getOrganizationEnrollmentContext(token) : null;
  const validRole = role === "coach" || role === "client" || role === "owner";
  const destination = role === "owner" ? "/signup/owner" : validRole ? `/${role}/install` : "/signup";
  if (enrollment && enrollment.role === role) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const membership = data.user ? await getActiveMembership(data.user.id, supabase) : null;
    if (membership) {
      const { error } = await supabase.rpc("accept_organization_enrollment", {
        enrollment_token: token,
      });
      const response = NextResponse.redirect(new URL(
        error ? `${destination}?status=membership-conflict` : dashboardForRole(membership.role),
        request.url,
      ));
      Object.entries(HANDOFF_HEADERS).forEach(([name, value]) => response.headers.set(name, value));
      response.cookies.delete(ENROLLMENT_HANDOFF_COOKIE);
      return response;
    }
  }
  const response = NextResponse.redirect(new URL(
    enrollment && enrollment.role === role
      ? role === "owner"
        ? destination
        : `${destination}?enrollment=${encodeURIComponent(token)}`
      : `${destination}?status=invalid-invitation`,
    request.url,
  ));

  Object.entries(HANDOFF_HEADERS).forEach(([name, value]) => response.headers.set(name, value));
  if (enrollment && enrollment.role === role) {
    response.cookies.set(ENROLLMENT_HANDOFF_COOKIE, token, {
      httpOnly: true,
      maxAge: Math.min(
        ENROLLMENT_HANDOFF_MAX_AGE,
        enrollment.expiresAt
          ? Math.max(0, Math.floor((Date.parse(enrollment.expiresAt) - Date.now()) / 1000))
          : ENROLLMENT_HANDOFF_MAX_AGE,
      ),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    response.cookies.delete(ENROLLMENT_HANDOFF_COOKIE);
  }
  return response;
}
