import type { ReactNode } from "react";

import { logoutAction } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import type { AccountRole } from "@/lib/auth";
import { DashboardNavigation } from "./dashboard-navigation";
import { ProfilePhoto } from "./profile-photo";
import { createClient } from "@/lib/supabase/server";
import { getProfileImageUrl } from "@/lib/profile-images";

import styles from "./dashboard.module.css";

export async function DashboardShell({
  children,
  gymName,
  name,
  role,
  compact = false,
}: {
  children: ReactNode;
  gymName: string;
  name: string;
  role: AccountRole;
  compact?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle() : { data: null };
  const photo = await getProfileImageUrl(supabase, profile?.avatar_path);
  const navigation = role === "owner"
    ? [{ href: "/owner", label: "Overview" }, { href: "/owner/team", label: "Team" }, { href: "/owner/schedule", label: "Schedule" }, { href: "/owner/clients", label: "Clients" }, { href: "/owner/reports", label: "Reports" }, { href: "/owner/revenue", label: "Revenue" }, { href: "/owner/equipment", label: "Equipment" }, { href: "/owner/training-library", label: "Training library" }, { href: "/owner/apps", label: "Apps & access" }]
    : role === "coach"
      ? [{ href: "/coach", label: "Overview & clients" }, { href: "/coach/schedule", label: "Schedule" }, { href: "/coach/availability", label: "Availability" }, { href: "/coach/profile", label: "Profile" }]
      : [{ href: "/client", label: "Workouts" }, { href: "/client/book", label: "Book session" }, { href: "/client/schedule", label: "Schedule" }, { href: "/client/profile", label: "Profile" }];
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Logo />
        <DashboardNavigation items={navigation} role={role} />
        <div className={styles.identity}>
          <ProfilePhoto name={name} size="small" url={photo} />
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
        {!compact && <section className={styles.hero}>
          <p className={styles.eyebrow}>{gymName}</p>
          <h1 className={styles.title}>Welcome, {name}.</h1>
          <p className={styles.lede}>Secure training operations, built around coach judgment.</p>
        </section>}
        {compact && <div className={styles.operationTopSpace} />}
        {children}
      </div>
    </main>
  );
}

export { styles as dashboardStyles };
