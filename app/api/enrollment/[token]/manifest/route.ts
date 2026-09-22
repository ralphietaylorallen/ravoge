import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrganizationEnrollmentContext } from "@/lib/invitations";

const icons = [
  { purpose: "any", sizes: "192x192", src: "/brand/ravoge-app-icon-192.png", type: "image/png" },
  { purpose: "any", sizes: "512x512", src: "/brand/ravoge-app-icon-512.png", type: "image/png" },
  { purpose: "maskable", sizes: "512x512", src: "/brand/ravoge-app-icon-512.png", type: "image/png" },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const enrollment = await getOrganizationEnrollmentContext(token);
  if (!enrollment || !["coach", "client"].includes(enrollment.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const response = NextResponse.json({
    background_color: "#050606",
    description: `${enrollment.organizationName} ${enrollment.role} access through Ravoge.`,
    display: "standalone",
    icons,
    id: "/",
    name: `Ravoge — ${enrollment.organizationName}`,
    orientation: "any",
    scope: "/",
    short_name: "Ravoge",
    start_url: `/launch?enrollment=${encodeURIComponent(token)}`,
    theme_color: "#050606",
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
