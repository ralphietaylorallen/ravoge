import { CoachDashboardSummary } from "@/components/coach-dashboard-summary";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { getProfileThumbnailUrl } from "@/lib/profile-images";

export default async function CoachPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [{ data: profile }, { data: organization }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const ids = (assignments ?? []).map(row => row.client_user_id);
  const { data: clients, error: clientError } = ids.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name,avatar_path").in("id", ids)
    : { data: [], error: null };
  const photos = new Map(await Promise.all((clients ?? []).map(async client =>
    [client.id, await getProfileThumbnailUrl(supabase, client.avatar_path)] as const
  )));

  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={profile?.preferred_name || profile?.full_name || "Coach"} role="coach">
    <CoachDashboardSummary
      organizationId={membership.organization_id} timezone={organization?.timezone ?? "America/Denver"}
      supabase={supabase} userId={userId} clients={clients ?? []} photos={photos}
      clientError={!!(assignmentError || clientError)}
    />
  </DashboardShell>;
}
