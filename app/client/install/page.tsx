import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstallAccessPage } from "@/components/install-access-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ enrollment?: string }> }): Promise<Metadata> {
  const { enrollment } = await searchParams;
  return {
    description: "Open or install the mobile-first Ravoge Client App.",
    manifest: enrollment ? `/api/enrollment/${encodeURIComponent(enrollment)}/manifest` : "/manifest.webmanifest",
    robots: { follow: false, index: false },
    title: "Install Client App | Ravoge",
  };
}

export default async function ClientInstallPage({ searchParams }: { searchParams: Promise<{ enrollment?: string; invite?: string; status?: string }> }) {
  const { enrollment, invite, status } = await searchParams;
  if (invite) redirect(`/enroll/client?token=${encodeURIComponent(invite)}`);
  return <InstallAccessPage enrollmentToken={enrollment} role="client" status={status} />;
}
