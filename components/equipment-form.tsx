"use client";

import { useActionState } from "react";

import { saveEquipmentChecklistAction } from "@/app/owner/actions";
import { saveResourceAction } from "@/app/owner/equipment/actions";

import styles from "./dashboard.module.css";

const equipmentTypes = [
  ["barbell", "Barbell"], ["plates", "Plates"], ["squat_rack", "Squat rack"],
  ["bench", "Bench"], ["dumbbells", "Dumbbells"], ["kettlebells", "Kettlebells"],
  ["cable_machine", "Cable machine"], ["selectorized_machine", "Selectorized machine"],
  ["cardio_equipment", "Cardio equipment"], ["sled", "Sled"], ["bands", "Bands"],
  ["medicine_balls", "Medicine balls"], ["specialty_equipment", "Specialty equipment"],
  ["other", "Other"],
];

export function EquipmentChecklist({ existing }: { existing: string[] }) {
  const [state, action, pending] = useActionState(saveEquipmentChecklistAction, { status: "idle" as const });
  return <form action={action} className={styles.form}>
    <div className={styles.checklistGrid}>{equipmentTypes.map(([value, label]) => <label className={styles.checkboxLabel} key={value}><input name="equipmentType" value={value} type="checkbox" disabled={existing.includes(value)}/>{label}{existing.includes(value) ? " — already saved" : ""}</label>)}</div>
    <p className={styles.formHint}>Select only equipment you actually have. This adds missing types without replacing inventory or guessing quantities. Manage availability of saved items below.</p>
    <button className={styles.action} disabled={pending}>Save available equipment</button>
    {state.message && <p role="status" className={styles.notice}>{state.message}</p>}
  </form>;
}

type Resource = { id: string; name: string; quantity?: number | null; equipment_type?: string; feature_type?: string; notes: string | null; is_available: boolean; usable_length?: number | null; length_unit?: string };
export function EquipmentForm({ item, facility = false }: { item?: Resource; facility?: boolean }) {
  const [state, action, pending] = useActionState(saveResourceAction.bind(null, item?.id ?? null, facility ? "facility" : "equipment"), { status: "idle" as const });
  const prefix = `resource-${item?.id ?? (facility ? "facility" : "new")}`;
  return (
    <form action={action} className={styles.form}>
      <div className={styles.formColumns}>
        <div className={styles.field}>
          <label htmlFor={`${prefix}-type`}>{facility ? "Facility feature" : "Equipment type"}</label>
          <select id={`${prefix}-type`} name="equipmentType" required defaultValue={item?.equipment_type ?? item?.feature_type}>
            {(facility ? [["turf", "Turf"], ["open_training_area", "Open training area"]] : [...equipmentTypes, ["ski_erg", "SkiErg"], ["rower", "Rower"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${prefix}-quantity`}>{facility ? "Usable length" : "Quantity (optional)"}</label>
          <input id={`${prefix}-quantity`} max={facility ? 1000 : 10000} min={facility ? 0.1 : 1} step={facility ? "0.1" : "1"} name={facility ? "length" : "quantity"} defaultValue={facility ? item?.usable_length ?? "" : item?.quantity ?? ""} type="number" />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-name`}>Name</label>
        <input id={`${prefix}-name`} maxLength={120} name="name" placeholder={facility ? "e.g. 25-yard turf" : "e.g. Rogue squat racks"} defaultValue={item?.name} required />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-notes`}>Notes</label>
        <textarea id={`${prefix}-notes`} maxLength={1000} name="notes" defaultValue={item?.notes ?? ""} rows={3} />
      </div>
      {facility && <label className={styles.field}><span>Length unit</span><select name="lengthUnit" defaultValue={item?.length_unit ?? "yards"}><option value="yards">Yards</option><option value="meters">Meters</option></select></label>}
      <label className={styles.checkboxLabel}><input type="checkbox" name="available" value="yes" defaultChecked={item?.is_available ?? true} />Available for training</label>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Saving…" : item ? "Save changes" : facility ? "Add facility feature" : "Add equipment"}
      </button>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    </form>
  );
}
