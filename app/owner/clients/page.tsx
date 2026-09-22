import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

type ClientMembership = {
  created_at: string;
  invitation_id: string | null;
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
    { data: invitations },
    { data: bookings },
    { data: intakes },
    { data: workouts },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase
      .from("organization_memberships")
      .select("user_id,status,invitation_id,created_at")
      .eq("organization_id", organizationId)
      .eq("role", "client")
      .order("created_at"),
    supabase
      .from("coach_client_assignments")
      .select("client_user_id,coach_user_id,status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase.from("organization_invitations").select("id,invited_by").eq("organization_id", organizationId).eq("role", "client"),
    supabase.from("bookings").select("client_user_id,starts_at,status").eq("organization_id", organizationId).order("starts_at", { ascending: false }),
    supabase.from("client_intakes").select("client_user_id,completed_at").eq("organization_id", organizationId).order("completed_at", { ascending: false }),
    supabase.from("workout_assignments").select("client_user_id,updated_at,completed_at,status").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
  ]);

  const clients = (clientMemberships ?? []) as ClientMembership[];
  const activeAssignments = (assignments ?? []) as Assignment[];
  const profileIds = [...new Set([
    ...clients.map((client) => client.user_id),
    ...activeAssignments.map((assignment) => assignment.coach_user_id),
    ...(invitations ?? []).map((invitation: { invited_by: string }) => invitation.invited_by),
  ])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", profileIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile: { id: string; full_name: string; preferred_name: string | null }) => [profile.id, profile.preferred_name || profile.full_name]));
  const photos = new Map(await Promise.all((profiles ?? []).map(async (profile: { id: string; avatar_path: string | null }) => [profile.id, await getProfileImageUrl(supabase, profile.avatar_path)] as const)));
  const coachByClient = new Map(activeAssignments.map((assignment) => [assignment.client_user_id, assignment.coach_user_id]));
  const invitationById = new Map((invitations ?? []).map((invitation: { id: string; invited_by: string }) => [invitation.id, invitation]));
  const latestByClient = <T extends { client_user_id: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => { if (!map.has(row.client_user_id)) map.set(row.client_user_id, row); });
    return map;
  };
  const latestAppointments = latestByClient((bookings ?? []) as { client_user_id: string; starts_at: string; status: string }[]);
  const latestIntakes = latestByClient((intakes ?? []) as { client_user_id: string; completed_at: string }[]);
  const latestWorkouts = latestByClient((workouts ?? []) as { client_user_id: string; completed_at: string | null; status: string; updated_at: string }[]);

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
                  <ProfilePhoto name={names.get(client.user_id) ?? "Client"} size="small" url={photos.get(client.user_id)} />
                  <div>
                    <Link href={`/owner/clients/${client.user_id}`}>{names.get(client.user_id) ?? "Client"}</Link>
                    <small>{coachId ? `Coach: ${names.get(coachId) ?? "Assigned coach"}` : "Coach not assigned"}</small>
                    <small>
                      Invited by: {client.invitation_id
                        ? names.get(invitationById.get(client.invitation_id)?.invited_by ?? "") ?? "Organization member"
                        : "Owner setup / legacy"}
                    </small>
                    <small>Latest appointment: {latestAppointments.has(client.user_id) ? `${new Date(latestAppointments.get(client.user_id)!.starts_at).toLocaleString("en-US")} · ${latestAppointments.get(client.user_id)!.status}` : "None"}</small>
                    <small>Latest intake: {latestIntakes.has(client.user_id) ? new Date(latestIntakes.get(client.user_id)!.completed_at).toLocaleDateString("en-US") : "Pending"}</small>
                    <small>Latest workout: {latestWorkouts.has(client.user_id) ? `${new Date(latestWorkouts.get(client.user_id)!.completed_at ?? latestWorkouts.get(client.user_id)!.updated_at).toLocaleDateString("en-US")} · ${latestWorkouts.get(client.user_id)!.status}` : "None"}</small>
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
