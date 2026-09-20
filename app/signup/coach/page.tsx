import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Coach Signup | Ravoge",
};

export default async function CoachSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  return (
    <RoleSignupShell
      accountType="Coach"
      description="For trainers programming and managing their clients."
      invitationToken={invite}
      role="coach"
    />
  );
}
