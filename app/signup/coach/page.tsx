import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleSignupShell } from "@/components/role-signup-shell";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Coach Signup | Ravoge",
};

export default async function CoachSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; status?: string }>;
}) {
  const { invite, status } = await searchParams;
  if (invite) {
    const enrollment = await getOrganizationEnrollmentContext(invite);
    redirect(enrollment?.role === "coach" ? `/enroll/coach?token=${encodeURIComponent(invite)}` : "/signup/coach?status=invalid-invitation");
  }
  return (
    <RoleSignupShell
      accountType="Coach"
      description="For trainers programming and managing their clients."
      invalidInvitation={status === "invalid-invitation"}
      role="coach"
    />
  );
}
