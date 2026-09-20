import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Coach Signup | Ravoge",
};

export default function CoachSignupPage() {
  return (
    <RoleSignupShell
      accountType="Coach"
      description="For trainers programming and managing their clients."
    />
  );
}
