import { requireRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { OwnerDemo } from "@/components/owner-demo";

export default async function OwnerDemoPage() {
  const {membership,supabase,userId}=await requireRole("owner");
  const [{data:profile},{data:organization},{data:exercises}]=await Promise.all([
    supabase.from("profiles").select("full_name").eq("id",userId).single(),
    supabase.from("organizations").select("name").eq("id",membership.organization_id).single(),
    supabase.from("exercise_library").select("id,name,default_rep_min,default_set_min,equipment_requirements").eq("is_active",true).or(`organization_id.is.null,organization_id.eq.${membership.organization_id}`).order("name"),
  ]);
  return <DashboardShell role="owner" gymName={organization?.name??"Ravoge"} name={profile?.full_name??"Owner"} compact>
    <OwnerDemo exerciseOptions={exercises??[]} storageKey={`ravoge-owner-demo:v1:${membership.organization_id}:${userId}`}/>
  </DashboardShell>;
}
