import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleSignupShell } from "@/components/role-signup-shell";
import { getInvitationContext } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Client Signup | Ravoge",
};

export default async function ClientSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; status?: string }>;
}) {
  const { invite, status } = await searchParams;
  if (invite) {
    const invitation = await getInvitationContext(invite);
    redirect(invitation?.role === "client" ? `/enroll/client?token=${encodeURIComponent(invite)}` : "/signup/client?status=invalid-invitation");
  }
  return (
    <RoleSignupShell
      accountType="Client"
      description="For members training with a Ravoge coach."
      invalidInvitation={status === "invalid-invitation"}
      role="client"
    />
  );
}
