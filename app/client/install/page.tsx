import type { Metadata } from "next";

import { InstallAccessPage } from "@/components/install-access-page";

export const metadata: Metadata = {
  title: "Install Client App | Ravoge",
  description: "Open or install the mobile-first Ravoge Client App.",
};

export default async function ClientInstallPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return <InstallAccessPage invitationToken={invite} role="client" />;
}
