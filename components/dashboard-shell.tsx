import type { ReactNode } from "react";

import { logoutAction } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import type { AccountRole } from "@/lib/auth";

import styles from "./dashboard.module.css";

export function DashboardShell({
  children,
  gymName,
  name,
  role,
}: {
  children: ReactNode;
  gymName: string;
  name: string;
  role: AccountRole;
}) {
  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <Logo />
          <div className={styles.headerActions}>
            <span className={styles.role}>{role} access</span>
            <form action={logoutAction}>
              <button className={styles.logout} type="submit">Log out</button>
            </form>
          </div>
        </header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{gymName}</p>
          <h1 className={styles.title}>Welcome, {name}.</h1>
          <p className={styles.lede}>Your identity and gym access are verified server-side.</p>
        </section>
        {children}
      </div>
    </main>
  );
}

export { styles as dashboardStyles };
