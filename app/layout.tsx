import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  applicationName: "Ravoge",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ravoge",
  },
  title: "Ravoge | Private training that learns",
  description:
    "Ravoge gives independent gyms one connected place for adaptive training, coach continuity, client progress, and booking.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#050606",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}<PwaRegistration /></body>
    </html>
  );
}
