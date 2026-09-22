"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><main className="route-state"><p className="route-state-kicker">RAVOGE</p><h1>The application couldn’t load.</h1><p>Reload safely or try again.</p><button onClick={reset} type="button">Try again</button></main></body></html>;
}
