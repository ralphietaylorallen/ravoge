import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function OwnerPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_memberships").select("role, status").eq("organization_id", membership.organization_id),
  ]);
  const memberRows = memberships ?? [];

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.grid}>
        {(["owner", "coach", "client"] as const).map((role) => (
          <section className={styles.panel} key={role}>
            <h2>{role}s</h2>
            <p className={styles.metric}>{memberRows.filter((row: { role: string; status: string }) => row.role === role && row.status === "active").length}</p>
            <p className={styles.empty}>Active {role} memberships</p>
          </section>
        ))}
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Beta setup</h2>
          <p className={styles.empty}>Confirm gym, team, equipment, scheduling, training-history, and App-access readiness.</p>
          <Link className={styles.inlineAction} href="/owner/setup">Review setup →</Link>
        </section>
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Team access</h2>
          <p className={styles.empty}>Review owners, coaches, clients, and pending invitations in one place.</p>
          <Link className={styles.inlineAction} href="/owner/team">Manage team →</Link>
        </section>
      </div>
    </DashboardShell>
  );
}
