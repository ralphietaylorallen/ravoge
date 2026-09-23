import { ClientDirectory } from "@/components/client-directory";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
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
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
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
  const latestByClient = <T extends { client_user_id: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => { if (!map.has(row.client_user_id)) map.set(row.client_user_id, row); });
    return map;
  };
  const requestTime = new Date().getTime();
  const latestAppointments = latestByClient(((bookings ?? []) as { client_user_id: string; starts_at: string; status: string }[]).filter((booking) => booking.status === "scheduled" && Date.parse(booking.starts_at) >= requestTime).reverse());
  const latestIntakes = latestByClient((intakes ?? []) as { client_user_id: string; completed_at: string }[]);
  const latestWorkouts = latestByClient((workouts ?? []) as { client_user_id: string; completed_at: string | null; status: string; updated_at: string }[]);

  const timezone = organization?.timezone ?? "America/Denver";
  const date = (value: string, time = false) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } as const : {}) }).format(new Date(value));
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
    <div className={styles.pageHeading}><div><h2>Clients</h2><p className={styles.profileMeta}>Manage all clients in {organization?.name ?? "your gym"}.</p></div></div>
    <ClientDirectory clients={clients.map((client) => {
      const coachId = coachByClient.get(client.user_id);
      const next = latestAppointments.get(client.user_id);
      const workout = latestWorkouts.get(client.user_id);
      return { id: client.user_id, name: names.get(client.user_id) ?? "Client", photo: photos.get(client.user_id) ?? null, status: client.status, coachId: coachId ?? null, coach: coachId ? names.get(coachId) ?? "Coach" : "Not assigned", joined: date(client.created_at), nextSession: next ? date(next.starts_at, true) : "None", intake: latestIntakes.has(client.user_id) ? "Complete" : "Pending", workout: workout ? date(workout.completed_at ?? workout.updated_at) : "None" };
    })} />
  </DashboardShell>;
}
