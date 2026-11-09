import Link from "next/link";
import { CoachDashboardSummary } from "@/components/coach-dashboard-summary";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileThumbnailUrl as getProfileImageUrl } from "@/lib/profile-images";
import { ClaimClientForm } from "@/components/claim-client-form";


export default async function CoachPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("client_user_id, status").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const clientIds = (assignments ?? []).map((row: { client_user_id: string }) => row.client_user_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", clientIds)
    : { data: [] };
  const photos = new Map(await Promise.all((clients ?? []).map(async (client: { id: string; avatar_path: string | null }) => [client.id, await getProfileImageUrl(supabase, client.avatar_path)] as const)));
  const { data: unassignedClients } = await supabase.rpc("list_unassigned_clients_for_coach");
  const { data: otherAssignedClients } = await supabase.rpc("list_other_assigned_clients_for_coach");
  const unassignedPhotos = new Map<string, string | null>(await Promise.all((unassignedClients ?? []).map(async (client: { client_user_id: string; avatar_path: string | null }) => [client.client_user_id, await getProfileImageUrl(supabase, client.avatar_path)] as [string, string | null])));

  return (
    <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Coach"} role="coach">
      <CoachDashboardSummary organizationId={membership.organization_id} timezone={organization?.timezone ?? "America/Denver"} supabase={supabase} userId={userId} clients={clients ?? []} photos={photos} />
      <div className={styles.pageHeading}><div><h2>Clients</h2><p className={styles.profileMeta}>Your schedule, upcoming workouts, and clients.</p></div></div><div className={styles.overviewCards}>
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

      </div>
    </DashboardShell>
  );
}
