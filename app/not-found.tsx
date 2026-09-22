import Link from "next/link";

import { Logo } from "@/components/logo";

export default function NotFound() {
  return <main className="route-state"><Logo /><p className="route-state-kicker">404 · Route not found</p><h1>This path isn’t in today’s program.</h1><p>Return to Ravoge and continue from a verified route.</p><Link href="/">Return home</Link></main>;
}
