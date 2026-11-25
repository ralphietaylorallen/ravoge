import Link from "next/link";
import { ClaimClientForm } from "@/components/claim-client-form";
import { CoachClientDirectory } from "@/components/coach-client-directory";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import workspace from "@/components/coach-workspace.module.css";
import { requireRole } from "@/lib/auth";
import { getProfileThumbnailUrl } from "@/lib/profile-images";

type PoolClient = { client_user_id: string; full_name: string; preferred_name: string | null; account_status: string; joined_at: string; avatar_path: string | null };
type OtherClient = { client_user_id: string; full_name: string; preferred_name: string | null; assigned_coach_name: string };

export default async function CoachClientsPage({ searchParams }: { searchParams: Promise<{ assign?: string }> }) {
  const { assign } = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  const organizationId = membership.organization_id;
  const [profile, gym, assignments, pool, others] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.from("coach_client_assignments").select("client_user_id")
      .eq("organization_id", organizationId).eq("coach_user_id", userId).eq("status", "active"),
    supabase.rpc("list_unassigned_clients_for_coach"),
    supabase.rpc("list_other_assigned_clients_for_coach"),
  ]);
  const ids = (assignments.data ?? []).map(row => row.client_user_id);
  const { data: clients, error: clientError } = ids.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", ids).order("full_name")
    : { data: [], error: null };
  const [directory, poolPhotos] = await Promise.all([
    Promise.all((clients ?? []).map(async client => ({
      id: client.id, name: client.preferred_name || client.full_name, photo: await getProfileThumbnailUrl(supabase, client.avatar_path),
    }))),
    Promise.all(((pool.data ?? []) as PoolClient[]).map(async client => ({
      ...client, photo: await getProfileThumbnailUrl(supabase, client.avatar_path),
    }))),
  ]);

  return <DashboardShell compact role="coach" name={profile.data?.preferred_name || profile.data?.full_name || "Coach"} gymName={gym.data?.name ?? "Ravoge gym"}>
    <div className={workspace.workday}>
      <header className={workspace.workdayHeading}>
        <h1>My Clients</h1>
        <Link className={workspace.primaryButton} href="/coach/add-client">Add Client <span aria-hidden="true">+</span></Link>
      </header>
      {assignments.error || clientError
        ? <p role="alert" className={styles.notice}>Your client list could not be loaded. Reload to try again.</p>
        : <CoachClientDirectory clients={directory} />}
      <details className={workspace.disclosure} id="assign-clients" open={assign === "1"}>
        <summary>Assign more clients</summary>
        {pool.error ? <p role="alert" className={workspace.muted}>Unassigned clients could not be loaded.</p> :
          poolPhotos.length ? <ul className={workspace.agendaList}>{poolPhotos.map(client => {
            const name = client.preferred_name || client.full_name;
            return <li className={workspace.poolRow} key={client.client_user_id}>
              <ProfilePhoto name={name} size="small" url={client.photo} />
              <span className={workspace.rowDetails}><strong>{name}</strong><small>{client.account_status} · Joined {new Date(client.joined_at).toLocaleDateString("en-US")}</small></span>
              <ClaimClientForm clientId={client.client_user_id} openIntake={assign === "1"} />
            </li>;
          })}</ul> : <p className={workspace.muted}>No unassigned clients are available.</p>}
      </details>
      {others.error ? <p role="alert" className={styles.notice}>Clients assigned to other coaches could not be loaded.</p> :
        !!others.data?.length && <details className={workspace.disclosure}>
          <summary>Clients assigned to another coach</summary>
          <ul className={workspace.agendaList}>{(others.data as OtherClient[]).map(client => <li className={workspace.poolRow} key={client.client_user_id}>
            <span className={workspace.rowDetails}><strong>{client.preferred_name || client.full_name}</strong><small>Assigned to {client.assigned_coach_name}</small></span>
          </li>)}</ul>
        </details>}
    </div>
  </DashboardShell>;
}
