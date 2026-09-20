import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Gym Owner Signup | Ravoge",
};

export default function OwnerSignupPage() {
  return (
    <RoleSignupShell
      accountType="Gym Owner"
      description="For operators managing coaches, clients, and private training."
    />
  );
}
