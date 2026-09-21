import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Gym Owner Signup | Ravoge",
};

export default async function OwnerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return (
    <RoleSignupShell
      accountType="Gym Owner"
      description="For operators managing coaches, clients, and private training."
      invitationToken={invite}
      role="owner"
    />
  );
}
