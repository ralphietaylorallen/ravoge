"use client";

import { useActionState } from "react";

import { addEquipmentAction, saveEquipmentChecklistAction } from "@/app/owner/actions";

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

export function EquipmentForm() {
  const [state, action, pending] = useActionState(addEquipmentAction, { status: "idle" as const });
  return (
    <form action={action} className={styles.form}>
      <div className={styles.formColumns}>
        <div className={styles.field}>
          <label htmlFor="equipment-type">Equipment type</label>
          <select id="equipment-type" name="equipmentType" required>
            {equipmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="equipment-quantity">Quantity</label>
          <input id="equipment-quantity" max={10000} min={1} name="quantity" type="number" />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="equipment-name">Name</label>
        <input id="equipment-name" maxLength={120} name="name" placeholder="e.g. Rogue squat racks" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="equipment-notes">Notes</label>
        <textarea id="equipment-notes" maxLength={1000} name="notes" rows={3} />
      </div>
      <button className={styles.action} disabled={pending} type="submit">
        {pending ? "Adding…" : "Add equipment"}
      </button>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    </form>
  );
}
