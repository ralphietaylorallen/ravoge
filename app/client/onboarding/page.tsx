import type { Metadata } from "next";

import { UnaffiliatedOnboarding } from "@/components/unaffiliated-onboarding";

export const metadata: Metadata = { title: "Client Onboarding | Ravoge" };

export default function ClientOnboardingPage() {
  return <UnaffiliatedOnboarding role="client" />;
}
