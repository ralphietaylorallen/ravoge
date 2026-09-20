import type { ReactNode } from "react";

import { GoldAtmosphere } from "@/components/gold-atmosphere";
import { Logo } from "@/components/logo";

import styles from "./auth-entry.module.css";

type AuthEntryShellProps = {
  children: ReactNode;
  wide?: boolean;
};

export function AuthEntryShell({ children, wide = false }: AuthEntryShellProps) {
  return (
    <main className={styles.shell}>
      <div aria-hidden="true" className={styles.atmosphere}>
        <GoldAtmosphere />
      </div>

      <div className={styles.frame}>
        <header className={styles.header}>
          <Logo />
          <span>Train with intent</span>
        </header>

        <div className={`${styles.stage} ${wide ? styles.stageWide : ""}`}>
          <div aria-hidden="true" className={styles.mantra}>
            <span>Train</span>
            <span>Build</span>
            <span>Evolve</span>
            <i />
          </div>
          <section className={styles.panel}>{children}</section>
        </div>
      </div>
    </main>
  );
}
