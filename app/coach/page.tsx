import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { requireRole } from "@/lib/auth";

export default async function CoachPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("client_user_id, status").eq("organization_id", membership.organization_id).eq("status", "active"),
  ]);
  const clientIds = (assignments ?? []).map((row: { client_user_id: string }) => row.client_user_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", clientIds)
    : { data: [] };

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Coach"} role="coach">
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Assigned clients</h2>
          {(clients ?? []).length ? (
            <ul className={styles.list}>{(clients ?? []).map((client: { id: string; full_name: string }) => <li key={client.id}><Link href={`/coach/clients/${client.id}`}>{client.full_name}</Link><small>Open profile →</small></li>)}</ul>
          ) : <p className={styles.empty}>No clients are assigned yet.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Invite a client</h2>
          <InviteForm role="client" />
        </section>
      </div>
    </DashboardShell>
  );
}
