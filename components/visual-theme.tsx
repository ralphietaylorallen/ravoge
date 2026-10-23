"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./visual-theme.module.css";

// Preview gate is presentation-only. It never changes roles, routing or access.
export function VisualTheme({ children }: { children: ReactNode }) {
  const path = usePathname();
  const representative = path === "/coach" || path === "/coach/profile" ||
    path.startsWith("/coach/clients/") || path === "/client" || path.startsWith("/client/workouts/");
  return <div className={representative ? styles.theme : undefined} data-ravoge-visual={representative ? "cinematic" : undefined}>{children}</div>;
}
