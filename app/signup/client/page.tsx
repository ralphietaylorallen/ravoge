import type { Metadata } from "next";

import { RoleSignupShell } from "@/components/role-signup-shell";

export const metadata: Metadata = {
  title: "Client Signup | Ravoge",
};

export default function ClientSignupPage() {
  return (
    <RoleSignupShell
      accountType="Client"
      description="For members training with a Ravoge coach."
      role="client"
    />
  );
}
