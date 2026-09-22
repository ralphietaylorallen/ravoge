import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleSignupShell } from "@/components/role-signup-shell";
import { getOrganizationEnrollmentContext } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Client Signup | Ravoge",
};

export default async function ClientSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ enrollment?: string; invite?: string; status?: string }>;
}) {
  const { enrollment, invite, status } = await searchParams;
  if (invite) {
    const enrollment = await getOrganizationEnrollmentContext(invite);
    redirect(enrollment?.role === "client" ? `/enroll/client?token=${encodeURIComponent(invite)}` : "/signup/client?status=invalid-invitation");
  }
  return (
    <RoleSignupShell
      accountType="Client"
      description="For members training with a Ravoge coach."
      enrollmentToken={enrollment}
      invalidInvitation={status === "invalid-invitation"}
      role="client"
    />
  );
}
