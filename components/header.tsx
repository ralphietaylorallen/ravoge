import Link from "next/link";
import { Logo } from "./logo";

export function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 border-b border-white/10 bg-[#050606]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-8 lg:px-12">
        <Logo />
        <nav aria-label="Primary" className="order-3 flex w-full items-center justify-between gap-5 text-sm text-[#E6E4DF] sm:order-2 sm:w-auto sm:justify-start">
          <Link className="nav-link" href="#what-we-do">What we do</Link>
          <Link className="nav-link" href="/coach">Coach access</Link>
          <Link className="nav-link" href="/client">Client access</Link>
        </nav>
        <div className="order-2 flex items-center gap-2 sm:order-3">
          <Link className="button button-ghost hidden sm:inline-flex" href="/owner?intent=login">Owner login</Link>
          <Link className="button button-light" href="/owner?intent=signup">Create account</Link>
        </div>
      </div>
    </header>
  );
}
