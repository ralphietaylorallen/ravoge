import type { Metadata } from "next";

import { UnaffiliatedOnboarding } from "@/components/unaffiliated-onboarding";

export const metadata: Metadata = { title: "Coach Onboarding | Ravoge" };

export default function CoachOnboardingPage() {
  return <UnaffiliatedOnboarding role="coach" />;
}
