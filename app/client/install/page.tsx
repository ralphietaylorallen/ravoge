import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstallAccessPage } from "@/components/install-access-page";

export const metadata: Metadata = {
  title: "Install Client App | Ravoge",
  description: "Open or install the mobile-first Ravoge Client App.",
  robots: { follow: false, index: false },
};
export const dynamic = "force-dynamic";

export default async function ClientInstallPage({ searchParams }: { searchParams: Promise<{ invite?: string; status?: string }> }) {
  const { invite, status } = await searchParams;
  if (invite) redirect(`/enroll/client?token=${encodeURIComponent(invite)}`);
  return <InstallAccessPage invalidInvitation={status === "invalid-invitation"} role="client" />;
}
