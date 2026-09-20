import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { requireRole } from "@/lib/auth";

export default async function OwnerPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_memberships").select("user_id, role, status").eq("organization_id", membership.organization_id),
  ]);
  const memberRows = memberships ?? [];
  const { data: profiles } = memberRows.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberRows.map((row: { user_id: string }) => row.user_id))
    : { data: [] };
  const names = new Map((profiles ?? []).map((row: { id: string; full_name: string }) => [row.id, row.full_name]));

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.grid}>
        {(["owner", "coach", "client"] as const).map((role) => (
          <section className={styles.panel} key={role}>
            <h2>{role}s</h2>
            <ul className={styles.list}>
              {memberRows.filter((row: { role: string }) => row.role === role).map((row: { status: string; user_id: string }) => (
                <li key={row.user_id}><span>{names.get(row.user_id) ?? "Member"}</span><small>{row.status}</small></li>
              ))}
            </ul>
          </section>
        ))}
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Invite a member</h2>
          <p className={styles.empty}>Links expire after seven days and fix the gym and role server-side.</p>
          <InviteForm canInviteCoach />
        </section>
      </div>
    </DashboardShell>
  );
}
