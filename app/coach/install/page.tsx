import type { Metadata } from "next";

import { InstallAccessPage } from "@/components/install-access-page";

export const metadata: Metadata = {
  title: "Install Coach App | Ravoge",
  description: "Open or install the Ravoge Coach App on an iPad or phone.",
};

export default async function CoachInstallPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return <InstallAccessPage invitationToken={invite} role="coach" />;
}
