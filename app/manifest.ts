import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ravoge",
    short_name: "Ravoge",
    description: "Private training operations for owners, coaches, and clients.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#050606",
    theme_color: "#050606",
    orientation: "any",
    icons: [
      {
        src: "/brand/ravoge-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/ravoge-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/ravoge-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Coach App", short_name: "Coach", url: "/coach/install" },
      { name: "Client App", short_name: "Client", url: "/client/install" },
    ],
  };
}
