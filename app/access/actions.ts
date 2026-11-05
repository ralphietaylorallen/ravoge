"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, parseAccessSelection } from "@/lib/access-selection";
import { dashboardForRole, getActiveMemberships, getVerifiedUser } from "@/lib/auth";

export async function switchViewAction(form: FormData) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const selection = parseAccessSelection(String(form.get("view") ?? ""));
  const memberships = await getActiveMemberships(userId, supabase);
  const authorized = memberships.find(m => m.organization_id === selection?.organizationId && m.role === selection.role);
  if (!authorized) redirect("/access?status=access-unavailable");
  (await cookies()).set(ACCESS_COOKIE, `${authorized.organization_id}:${authorized.role}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400,
  });
  redirect(dashboardForRole(authorized.role));
}

export async function createMyClientProfileAction(form: FormData) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const organizationId = String(form.get("organizationId") ?? "");
  const memberships = await getActiveMemberships(userId, supabase);
  if (!memberships.some(m => m.organization_id === organizationId && m.role === "coach")) {
    redirect("/access?status=access-unavailable");
  }
  const { error } = await supabase.rpc("create_my_client_access", { target_organization_id: organizationId });
  if (error) redirect("/access?status=setup-failed");
  (await cookies()).set(ACCESS_COOKIE, `${organizationId}:client`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400,
  });
  redirect("/client/welcome");
}
