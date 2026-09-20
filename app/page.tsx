import type { Metadata } from "next";
import Link from "next/link";

import { GoldAtmosphere } from "@/components/gold-atmosphere";

export const metadata: Metadata = {
  title: "Ravoge | Coming Soon",
  description: "Ravoge is coming soon. Higher standards ahead.",
};

export default function Home() {
  return (
    <main className="coming-soon-shell">
      <div className="coming-soon-frame">
        <picture className="coming-soon-picture">
          <source
            media="(max-width: 767px)"
            srcSet="/images/ravoge-coming-soon-mobile.webp"
          />
          <img
            alt="Ravoge — coming soon. Higher standards ahead."
            className="coming-soon-artwork"
            decoding="async"
            fetchPriority="high"
            height="941"
            src="/images/ravoge-coming-soon-desktop.webp"
            width="1672"
          />
        </picture>

        <GoldAtmosphere />

        <Link
          aria-label="Login"
          className="coming-soon-login"
          href="/login"
          prefetch={false}
        >
          <span className="visually-hidden">Login</span>
        </Link>
      </div>
    </main>
  );
}
