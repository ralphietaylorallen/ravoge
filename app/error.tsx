"use client";

import { useEffect } from "react";

import { Logo } from "@/components/logo";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Ravoge route error]", error.digest ?? "no-digest"); }, [error]);
  return <main className="route-state"><Logo /><p className="route-state-kicker">Something interrupted this set</p><h1>Ravoge couldn’t load this page.</h1><p>Your access has not changed. Try the request again.</p><button onClick={reset} type="button">Try again</button></main>;
}
