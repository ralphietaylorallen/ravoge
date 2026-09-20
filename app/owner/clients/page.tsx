import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

type ClientMembership = {
  status: "active" | "inactive";
  user_id: string;
};

type Assignment = {
  client_user_id: string;
  coach_user_id: string;
  status: "active" | "inactive";
};

export default async function OwnerClientsPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [
    { data: owner },
    { data: organization },
    { data: clientMemberships },
    { data: assignments },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase
      .from("organization_memberships")
      .select("user_id,status")
      .eq("organization_id", organizationId)
      .eq("role", "client")
      .order("created_at"),
    supabase
      .from("coach_client_assignments")
      .select("client_user_id,coach_user_id,status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  const clients = (clientMemberships ?? []) as ClientMembership[];
  const activeAssignments = (assignments ?? []) as Assignment[];
  const profileIds = [...new Set([
    ...clients.map((client) => client.user_id),
    ...activeAssignments.map((assignment) => assignment.coach_user_id),
  ])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile: { id: string; full_name: string }) => [profile.id, profile.full_name]));
  const coachByClient = new Map(activeAssignments.map((assignment) => [assignment.client_user_id, assignment.coach_user_id]));

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Owner View</p><h2>Clients</h2></div>
        <p>Review every client in this organization, their primary coach, intake state, prescriptions, and workout history.</p>
      </div>
      <section className={`${styles.panel} ${styles.panelWide}`}>
        <h2>Organization clients</h2>
        {clients.length ? (
          <ul className={styles.directoryList}>
            {clients.map((client) => {
              const coachId = coachByClient.get(client.user_id);
              return (
                <li key={client.user_id}>
                  <div>
                    <Link href={`/owner/clients/${client.user_id}`}>{names.get(client.user_id) ?? "Client"}</Link>
                    <small>{coachId ? `Coach: ${names.get(coachId) ?? "Assigned coach"}` : "Coach not assigned"}</small>
                  </div>
                  <span className={client.status === "active" ? styles.statusPill : styles.mutedPill}>{client.status}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className={styles.empty}>No client memberships yet.</p>}
      </section>
    </DashboardShell>
  );
}
