"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function PwaInstallButton({ className, continueHref, roleLabel }: {
  className: string;
  continueHref: string;
  roleLabel: string;
}) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [iosMode, setIosMode] = useState<"safari" | "other" | null>(null);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
    document.documentElement.dataset.pwaStandalone = String(isStandalone);
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = isIos && /Safari/.test(navigator.userAgent) && !/(CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV)/.test(navigator.userAgent);
    const frame = window.requestAnimationFrame(() => {
      setStandalone(isStandalone);
      setIosMode(isIos ? safari ? "safari" : "other" : null);
    });
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.cancelAnimationFrame(frame);
      delete document.documentElement.dataset.pwaStandalone;
    };
  }, []);

  if (standalone) {
    return <Link className={className} href={continueHref}>Continue to {roleLabel} access <span aria-hidden="true">→</span></Link>;
  }

  return (
    <div className="install-primary-wrap">
      <button
        aria-describedby="install-guidance"
        className={className}
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
            return;
          }
          document.querySelector<HTMLElement>("[data-install-instructions]")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        type="button"
      >
        Install Ravoge <span aria-hidden="true">→</span>
      </button>
      <p id="install-guidance" role="status">
        {iosMode === "safari" ? "In Safari: tap Share, then Add to Home Screen."
          : iosMode === "other" ? "For installation, rescan this QR with Camera and open it in Safari."
            : promptEvent ? "Your browser will open its secure installation prompt."
              : "Use your browser menu to install or add Ravoge to the Home Screen."}
      </p>
    </div>
  );
}
