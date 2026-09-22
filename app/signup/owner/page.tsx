import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RoleSignupShell } from "@/components/role-signup-shell";
import { getInvitationContext } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Gym Owner Signup | Ravoge",
};

export default async function OwnerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; status?: string }>;
}) {
  const { invite, status } = await searchParams;
  if (invite) {
    const invitation = await getInvitationContext(invite);
    redirect(invitation?.role === "owner" ? `/enroll/owner?token=${encodeURIComponent(invite)}` : "/signup/owner?status=invalid-invitation");
  }
  return (
    <RoleSignupShell
      accountType="Gym Owner"
      description="For operators managing coaches, clients, and private training."
      invalidInvitation={status === "invalid-invitation"}
      role="owner"
    />
  );
}
