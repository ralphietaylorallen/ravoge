import { NextResponse, type NextRequest } from "next/server";

import { completeSignupProvisioning } from "@/app/auth/actions";
import { dashboardForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const invitationToken = requestUrl.searchParams.get("invite") ?? undefined;
  const ownerSignupToken = requestUrl.searchParams.get("owner") ?? undefined;
  const requestedNext = requestUrl.searchParams.get("next") ?? "/login";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/login";

  if (!code) {
    return NextResponse.redirect(new URL("/login?status=invalid-callback", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?status=invalid-callback", request.url));
  }

  if (next === "/signup/complete") {
    const role = await completeSignupProvisioning({
      invitationToken,
      ownerSignupToken,
    });
    if (role) {
      return NextResponse.redirect(new URL(dashboardForRole(role), request.url));
    }
    return NextResponse.redirect(new URL("/signup?status=invite-required", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
