import { setEquipmentAvailabilityAction } from "@/app/owner/actions";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { EquipmentForm, EquipmentChecklist } from "@/components/equipment-form";
import { EquipmentPhotoScan } from "@/components/equipment-photo-scan";
import { requireRole } from "@/lib/auth";
import { MutationActionForm } from "@/components/mutation-action-form";
import type { WorkoutReadiness } from "@/lib/workout-readiness";

type EquipmentRow = {
  equipment_type: string;
  id: string;
  is_available: boolean;
  name: string;
  notes: string | null;
  quantity: number | null;
};

export default async function OwnerEquipmentPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client: requestedClient } = await searchParams;
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: organization }, { data: equipment }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_equipment").select("id,equipment_type,name,quantity,is_available,notes").eq("organization_id", membership.organization_id).order("name"),
  ]);
  const { data: members } = await supabase.from("organization_memberships").select("user_id").eq("organization_id", membership.organization_id).eq("role", "client").eq("status", "active");
  const { data: facilities } = await supabase.from("organization_facilities").select("id,name,feature_type,usable_length,length_unit,is_available,notes").eq("organization_id", membership.organization_id).order("name");
  const { data: clients } = members?.length ? await supabase.from("profiles").select("id,full_name").in("id", members.map(m => m.user_id)).order("full_name") : { data: [] };
  const clientId = clients?.some(client => client.id === requestedClient) ? requestedClient : clients?.[0]?.id;
  const { data: readinessData } = clientId ? await supabase.rpc("get_workout_generation_readiness", { target_client_user_id: clientId }) : { data: null };
  const readiness = readinessData as WorkoutReadiness | null;

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Gym foundation</p><h2>Equipment</h2></div>
        <p>Prescription recommendations use only equipment marked available here.</p>
      </div>
      <section className={styles.operationCard}><h2>Available equipment checklist</h2><EquipmentChecklist existing={[...new Set((equipment ?? []).map(item => item.equipment_type))]}/></section>
      <section className={styles.operationCard}><h2>Workout readiness by Client</h2>
        {clients?.length ? <form method="get" className={styles.accessActions}><label className={styles.field}><span>Client</span><select name="client" defaultValue={clientId}>{clients.map(client => <option key={client.id} value={client.id}>{client.full_name}</option>)}</select></label><button className={styles.secondaryAction}>Check readiness</button></form> : <p>Add or enroll a Client, then have their Coach save the intake.</p>}
        {readiness && <><p>{readiness.compatibleExercises} safe compatible movement blocks for the latest intake, goal, experience, restrictions and actual equipment. {readiness.ready ? "Ready for Coach generation." : "Setup or review is needed."}</p><ul>{readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{!readiness.ready && Boolean(readiness.missingEquipment?.length) && <p className={styles.formHint}>Missing equipment among potential matches: {readiness.missingEquipment!.join(", ").replaceAll("_", " ")}. Do not select equipment you do not have.</p>}</>}
      </section>
      <EquipmentPhotoScan />
      <section className={styles.operationCard}><h2>Facility features</h2><p>Turf is a measured training space, not a generic equipment count. Confirm its usable length and availability. SkiErgs, rowers and sleds are separate inventory types.</p>
        {(facilities ?? []).map(item => <details className={styles.operationCard} key={item.id}><summary>{item.name} · {item.usable_length ?? "Length not set"} {item.length_unit} · {item.is_available ? "Available" : "Unavailable"}</summary><EquipmentForm facility item={item} /></details>)}
        <details className={styles.operationCard}><summary>Add turf or training space</summary><EquipmentForm facility /></details>
      </section>
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
                  <details><summary>Edit inventory</summary><EquipmentForm item={item}/></details>
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>Select your gym’s actual equipment before generating a workout.</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
