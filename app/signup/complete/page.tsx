import { redirect } from "next/navigation";

import { completeSignupProvisioning } from "@/app/auth/actions";
import { dashboardForRole } from "@/lib/auth";

export default async function SignupCompletePage() {
  const role = await completeSignupProvisioning();
  redirect(role ? dashboardForRole(role) : "/signup?status=invite-required");
}
