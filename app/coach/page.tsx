import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

type PendingInvitation = { delivery_status: string; email: string; expires_at: string; id: string };

export default async function CoachPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("client_user_id, status").eq("organization_id", membership.organization_id).eq("status", "active"),
  ]);
  const clientIds = (assignments ?? []).map((row: { client_user_id: string }) => row.client_user_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", clientIds)
    : { data: [] };
  const photos = new Map(await Promise.all((clients ?? []).map(async (client: { id: string; avatar_path: string | null }) => [client.id, await getProfileImageUrl(supabase, client.avatar_path)] as const)));
  const { data: pendingRows } = await supabase
    .from("organization_invitations")
    .select("id,email,expires_at,delivery_status")
    .eq("organization_id", membership.organization_id)
    .eq("invited_by", userId)
    .eq("role", "client")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const pendingInvitations = (pendingRows ?? []) as PendingInvitation[];

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Coach"} role="coach">
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Assigned clients</h2>
          {(clients ?? []).length ? (
            <ul className={styles.list}>{(clients ?? []).map((client: { id: string; full_name: string; preferred_name: string | null }) => { const name = client.preferred_name || client.full_name; return <li key={client.id}><ProfilePhoto name={name} size="small" url={photos.get(client.id)} /><Link href={`/coach/clients/${client.id}`}>{name}</Link><small>Open profile →</small></li>; })}</ul>
          ) : <p className={styles.empty}>No clients are assigned yet.</p>}
        </section>
        <section className={styles.panel}>
          <h2>Invite a client</h2>
          <InviteForm role="client" />
          {pendingInvitations.length ? (
            <>
              <h3 className={styles.subheading}>Pending invitations</h3>
              <ul className={styles.activityList}>
                {pendingInvitations.map((invitation) => (
                  <li key={invitation.id}>
                    <div><strong>{invitation.email}</strong><small>Email: {invitation.delivery_status.replaceAll("_", " ")}</small></div>
                    <span>Expires<time dateTime={invitation.expires_at}>{new Date(invitation.expires_at).toLocaleDateString("en-US")}</time></span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
