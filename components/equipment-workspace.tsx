import { setEquipmentAvailabilityAction } from "@/app/owner/actions";
import { dashboardStyles as styles } from "./dashboard-shell";
import { EquipmentForm, type Resource } from "./equipment-form";
import { EquipmentPhotoScan } from "./equipment-photo-scan";
import { MutationActionForm } from "./mutation-action-form";
import local from "./equipment-workspace.module.css";

export function EquipmentWorkspace({equipment,facilities,loadError=false}:{equipment:Resource[];facilities:Resource[];loadError?:boolean}) {
  const available=equipment.filter(e=>e.is_available).length;
  return <div className={local.root}>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Your gym</p><h2>Equipment</h2></div></div>
    {loadError&&<p role="alert">Some inventory could not be loaded. Refresh before changing equipment.</p>}
    <section className={styles.operationCard} aria-labelledby="add-equipment-title"><h3 id="add-equipment-title">Add equipment</h3><p className={styles.formHint}>Save it here to make it available for new workouts.</p><EquipmentForm/></section>
    <EquipmentPhotoScan/>
    <details className={styles.operationCard}><summary>Add turf or training space</summary><EquipmentForm facility/></details>
    <details className={`${styles.operationCard} ${local.manage}`}>
      <summary>Manage equipment <span>{loadError?"Inventory unavailable":`${available} available · ${equipment.length} saved`}</span></summary>
      {!loadError&&<>
        {equipment.length?<ul className={local.inventory}>{equipment.map(item=><li key={item.id}>
          <div className={local.itemHeader}><div><strong>{item.name}</strong><span>{item.is_available?"Available":"Removed from workouts"}{item.quantity!==null&&item.quantity!==undefined?` · Qty ${item.quantity}`:""}</span></div>
            <MutationActionForm action={setEquipmentAvailabilityAction.bind(null,item.id,!item.is_available)} className={styles.secondaryAction} label={item.is_available?"Remove":"Restore"} pendingLabel="Updating…"/>
          </div>
          <details className={local.edit}><summary>Edit {item.name}</summary><EquipmentForm item={item}/></details>
        </li>)}</ul>:<p className={styles.empty}>No equipment saved yet.</p>}
        {facilities.length>0&&<><h3>Training spaces</h3>{facilities.map(item=><details className={local.space} key={item.id}><summary>{item.name} · {item.is_available?"Available":"Unavailable"}{item.usable_length?` · ${item.usable_length} ${item.length_unit}`:""}</summary><EquipmentForm facility item={item}/></details>)}</>}
      </>}
    </details>
  </div>;
}
