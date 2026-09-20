import type { ReactNode } from "react";
import Link from "next/link";

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
  const navigation = role === "owner"
    ? [{ href: "/owner", label: "Overview" }, { href: "/owner/equipment", label: "Equipment" }, { href: "/owner/training-library", label: "Training library" }]
    : role === "coach"
      ? [{ href: "/coach", label: "Overview & clients" }]
      : [{ href: "/client", label: "Workouts" }];
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Logo />
        <nav aria-label={`${role} navigation`}>
          {navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className={styles.identity}>
          <span>{role}</span>
          <strong>{name}</strong>
          <small>{gymName}</small>
        </div>
      </aside>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div><span className={styles.mobileBrand}>Ravoge</span><small>{gymName}</small></div>
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
          <p className={styles.lede}>Secure training operations, built around coach judgment.</p>
        </section>
        {children}
      </div>
    </main>
  );
}

export { styles as dashboardStyles };
