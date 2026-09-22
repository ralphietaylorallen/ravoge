import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstallAccessPage } from "@/components/install-access-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ enrollment?: string }> }): Promise<Metadata> {
  const { enrollment } = await searchParams;
  return {
    description: "Open or install the Ravoge Coach App on an iPad or phone.",
    manifest: enrollment ? `/api/enrollment/${encodeURIComponent(enrollment)}/manifest` : "/manifest.webmanifest",
    robots: { follow: false, index: false },
    title: "Install Coach App | Ravoge",
  };
}

export default async function CoachInstallPage({ searchParams }: { searchParams: Promise<{ enrollment?: string; invite?: string; status?: string }> }) {
  const { invite, status } = await searchParams;
  if (invite) redirect(`/enroll/coach?token=${encodeURIComponent(invite)}`);
  return <InstallAccessPage role="coach" status={status} />;
}
