"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton({ className, fallbackHref }: { className: string; fallbackHref: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (!promptEvent) {
    return <Link className={className} href={fallbackHref}>Add Ravoge to Home Screen <span aria-hidden="true">→</span></Link>;
  }

  return (
    <button
      className={className}
      onClick={async () => {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
      type="button"
    >
      Add Ravoge to Home Screen <span aria-hidden="true">→</span>
    </button>
  );
}
