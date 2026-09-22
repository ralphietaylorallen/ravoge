import { Logo } from "@/components/logo";

export function RouteLoading({ label = "Loading your Ravoge workspace" }: { label?: string }) {
  return <main className="route-state" aria-busy="true" aria-live="polite"><Logo /><span className="route-state-line" /><p>{label}…</p></main>;
}
