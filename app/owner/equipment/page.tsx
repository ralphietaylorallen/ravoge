import { DashboardShell } from "@/components/dashboard-shell";
import { EquipmentWorkspace } from "@/components/equipment-workspace";
import { requireRole } from "@/lib/auth";

export default async function OwnerEquipmentPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: equipment, error: equipmentError }, { data: facilities, error: facilityError }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_equipment").select("id,equipment_type,name,quantity,is_available,notes,min_weight_lb,max_weight_lb,weight_sizes_lb,paired_sizes_confirmed").eq("organization_id", membership.organization_id).order("name"),
    supabase.from("organization_facilities").select("id,name,feature_type,usable_length,length_unit,is_available,notes").eq("organization_id", membership.organization_id).order("name"),
  ]);
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
    <EquipmentWorkspace equipment={equipment ?? []} facilities={facilities ?? []} loadError={!!equipmentError || !!facilityError}/>
  </DashboardShell>;
}
