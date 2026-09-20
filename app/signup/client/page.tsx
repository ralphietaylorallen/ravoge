import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Client Signup | Ravoge",
};

export default async function ClientSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return (
    <RoleSignupShell
      accountType="Client"
      description="For members training with a Ravoge coach."
      invitationToken={invite}
      role="client"
    />
  );
}
