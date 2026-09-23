import Link from "next/link";

import { revokeInvitationAction } from "@/app/auth/actions";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { MutationActionForm } from "@/components/mutation-action-form";
import { ClaimClientForm } from "@/components/claim-client-form";

type PendingInvitation = { accepted_at: string | null; delivery_status: string; email: string; expires_at: string; id: string; revoked_at: string | null };

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
  const { data: unassignedClients } = await supabase.rpc("list_unassigned_clients_for_coach");
  const { data: otherAssignedClients } = await supabase.rpc("list_other_assigned_clients_for_coach");
  const unassignedPhotos = new Map<string, string | null>(await Promise.all((unassignedClients ?? []).map(async (client: { client_user_id: string; avatar_path: string | null }) => [client.client_user_id, await getProfileImageUrl(supabase, client.avatar_path)] as [string, string | null])));
  const { data: pendingRows } = await supabase
    .from("organization_invitations")
    .select("id,email,expires_at,delivery_status,accepted_at,revoked_at")
    .eq("organization_id", membership.organization_id)
    .eq("invited_by", userId)
    .eq("role", "client")
    .order("created_at", { ascending: false });
  const pendingInvitations = (pendingRows ?? []) as PendingInvitation[];
  const nowIso = new Date().toISOString();

  return (
    <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Coach"} role="coach">
      <div className={styles.pageHeading}><div><h2>Clients</h2><p className={styles.profileMeta}>Your training floor, organized around your clients.</p></div></div><div className={styles.overviewCards}>
        <section className={styles.operationCard}>
          <h2>My Clients</h2>
          {(clients ?? []).length ? (
            <ul className={styles.coachClientGrid}>{(clients??[]).map((client:{id:string;full_name:string;preferred_name:string|null})=>{const name=client.preferred_name||client.full_name;return <li key={client.id}><Link className={styles.coachClientCard} href={`/coach/clients/${client.id}`}><div><ProfilePhoto name={name} size="small" url={photos.get(client.id)}/><strong>{name}</strong></div><span className={styles.successPill}>Assigned to you</span><small>Open Client →</small></Link></li>;})}</ul>
          ) : <p className={styles.empty}>No clients are assigned yet.</p>}
        </section>
        <section className={styles.operationCard}>
          <h2>Unassigned Clients</h2>
          <p className={styles.empty}>Only name, photo, join date, and account status are visible until you assign an unclaimed Client to yourself.</p>
          {(unassignedClients ?? []).length ? <ul className={styles.coachClientGrid}>{(unassignedClients ?? []).map((client: { client_user_id: string; full_name: string; preferred_name: string | null; account_status: string; joined_at: string }) => <li className={styles.coachClientCard} key={client.client_user_id}><div><ProfilePhoto name={client.preferred_name || client.full_name} size="small" url={unassignedPhotos.get(client.client_user_id)} /><strong>{client.preferred_name || client.full_name}</strong><small>{client.account_status}</small></div><small>Joined {new Date(client.joined_at).toLocaleDateString("en-US")}</small><ClaimClientForm clientId={client.client_user_id} /></li>)}</ul> : <p className={styles.empty}>No unassigned Clients are available.</p>}
        </section>
        {otherAssignedClients?.length ? <section className={styles.operationCard}><h2>Assigned to another Coach</h2><p className={styles.empty}>Only an Owner can change these assignments. Private client records stay restricted.</p><ul className={styles.coachClientGrid}>{otherAssignedClients.map((client: {client_user_id:string;full_name:string;preferred_name:string|null;assigned_coach_name:string})=><li className={styles.coachClientCard} key={client.client_user_id}><strong>{client.preferred_name||client.full_name}</strong><small>Assigned to {client.assigned_coach_name}</small></li>)}</ul></section>:null}
        <section className={styles.panel}>
          <h2>Invite a client</h2>
          <InviteForm role="client" />
          {pendingInvitations.length ? (
            <>
              <h3 className={styles.subheading}>Invitation history</h3>
              <ul className={styles.activityList}>
                {pendingInvitations.map((invitation) => {
                  const status = invitation.accepted_at ? "accepted" : invitation.revoked_at ? "revoked" : invitation.expires_at <= nowIso ? "expired" : "pending";
                  return <li key={invitation.id}>
                    <div><strong>{invitation.email}</strong><small>{status} · Email: {invitation.delivery_status.replaceAll("_", " ")}</small></div>
                    {status === "pending" ? <MutationActionForm action={revokeInvitationAction.bind(null, invitation.id)} confirmMessage={`Revoke the invitation for ${invitation.email}?`} label="Revoke" /> : <span>Expires<time dateTime={invitation.expires_at}>{new Date(invitation.expires_at).toLocaleDateString("en-US")}</time></span>}
                  </li>;
                })}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
