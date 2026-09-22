import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstallAccessPage } from "@/components/install-access-page";

export const metadata: Metadata = {
  title: "Install Coach App | Ravoge",
  description: "Open or install the Ravoge Coach App on an iPad or phone.",
  robots: { follow: false, index: false },
};
export const dynamic = "force-dynamic";

export default async function CoachInstallPage({ searchParams }: { searchParams: Promise<{ invite?: string; status?: string }> }) {
  const { invite, status } = await searchParams;
  if (invite) redirect(`/enroll/coach?token=${encodeURIComponent(invite)}`);
  return <InstallAccessPage invalidInvitation={status === "invalid-invitation"} role="coach" />;
}
