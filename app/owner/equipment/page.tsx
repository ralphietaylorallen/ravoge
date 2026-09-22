import { setEquipmentAvailabilityAction } from "@/app/owner/actions";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { EquipmentForm } from "@/components/equipment-form";
import { requireRole } from "@/lib/auth";
import { MutationActionForm } from "@/components/mutation-action-form";

type EquipmentRow = {
  equipment_type: string;
  id: string;
  is_available: boolean;
  name: string;
  notes: string | null;
  quantity: number | null;
};

export default async function OwnerEquipmentPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: equipment }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_equipment").select("id,equipment_type,name,quantity,is_available,notes").eq("organization_id", membership.organization_id).order("name"),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Gym foundation</p><h2>Equipment</h2></div>
        <p>Prescription recommendations use only equipment marked available here.</p>
      </div>
      <div className={styles.detailGrid}>
        <section className={`${styles.panel} ${styles.createPanel}`}>
          <h2>Add equipment</h2>
          <EquipmentForm />
        </section>
        <section className={styles.panel}>
          <h2>Available inventory</h2>
          {(equipment ?? []).length ? (
            <ul className={styles.equipmentList}>
              {(equipment as EquipmentRow[]).map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.equipment_type.replaceAll("_", " ")}{item.quantity ? ` · ${item.quantity}` : ""}</span>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <MutationActionForm action={setEquipmentAvailabilityAction.bind(null, item.id, !item.is_available)} className={styles.secondaryAction} label={item.is_available ? "Available" : "Unavailable"} pendingLabel="Updating…" />
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>Add the Pitt’s actual equipment before generating a workout.</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
