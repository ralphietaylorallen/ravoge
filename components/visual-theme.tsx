import type { ReactNode } from "react";
import styles from "./visual-theme.module.css";

// Shared presentation only: no role, account, routing or authorization state.
export function VisualTheme({ children }: { children: ReactNode }) {
  return <div className={styles.theme} data-ravoge-visual="cinematic">{children}</div>;
}
