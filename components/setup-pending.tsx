import Link from "next/link";
import { ArrowRight } from "./icons";
import { Logo } from "./logo";

type SetupPendingProps = {
  audience: "Owner" | "Coach" | "Client";
  eyebrow: string;
  description: string;
};

export function SetupPending({ audience, eyebrow, description }: SetupPendingProps) {
  return (
    <main className="min-h-screen bg-[#050606] px-5 py-6 text-[#F6F5F3] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <Logo />
          <Link className="nav-link text-sm" href="/">Back to home</Link>
        </div>
        <section className="grid flex-1 place-items-center py-16">
          <div className="relative w-full max-w-2xl overflow-hidden border border-white/12 bg-[#0A1211] p-7 sm:p-12">
            <div aria-hidden="true" className="absolute right-0 top-0 h-44 w-44 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B4AC9B]/10 blur-3xl" />
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-5 font-display text-5xl leading-[0.96] tracking-[-0.055em] sm:text-7xl">{audience} access is coming next.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#B4AC9B] sm:text-lg">{description}</p>
            <div className="mt-10 border-l-2 border-[#B4AC9B] bg-white/[0.035] p-5 text-sm leading-6 text-[#E6E4DF]">
              Setup is intentionally pending. This preview does not collect credentials, create accounts, or simulate authentication.
            </div>
            <Link className="button button-light mt-8" href="/">
              Explore Ravoge <ArrowRight />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
