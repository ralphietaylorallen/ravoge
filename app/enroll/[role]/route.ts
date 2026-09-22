import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ENROLLMENT_HANDOFF_COOKIE, ENROLLMENT_HANDOFF_MAX_AGE } from "@/lib/enrollment";
import { getInvitationContext } from "@/lib/invitations";

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
  const invitation = token ? await getInvitationContext(token) : null;
  const validRole = role === "coach" || role === "client" || role === "owner";
  const destination = role === "owner" ? "/signup/owner" : validRole ? `/${role}/install` : "/signup";
  const response = NextResponse.redirect(new URL(
    invitation && invitation.role === role ? destination : `${destination}?status=invalid-invitation`,
    request.url,
  ));

  Object.entries(HANDOFF_HEADERS).forEach(([name, value]) => response.headers.set(name, value));
  if (invitation && invitation.role === role) {
    response.cookies.set(ENROLLMENT_HANDOFF_COOKIE, token, {
      httpOnly: true,
      maxAge: Math.min(
        ENROLLMENT_HANDOFF_MAX_AGE,
        Math.max(0, Math.floor((Date.parse(invitation.expiresAt) - Date.now()) / 1000)),
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
