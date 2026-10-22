"use client";
import { useActionState } from "react";
import { saveLoadRule } from "@/app/owner/training-library/actions";
import styles from "./dashboard.module.css";

export type LoadRule = { id: string; exercise_id: string; organization_id: string | null; version: number; prescription_type: string; intake_anchor: string | null; coefficient: number | null; weight_semantics: string; minimum_lb: number; maximum_lb: number; calibration_strategy: string; equivalent_exercise_id: string | null; explanation: string };
export function LoadRuleEditor({ rule, name, library }: { rule: LoadRule; name: string; library: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveLoadRule, { status: "idle" as const });
  return <details className={styles.operationCard}><summary>{name} · {rule.prescription_type} · rule {rule.version}{rule.organization_id ? " (gym override)" : " (default)"}</summary>
    <p>Conservative coaching starting default, not a universal scientific conversion. Uses actual successful sets first. New versions affect future drafts only.</p>
    <form action={action} className={styles.reviewForm}>
      <input type="hidden" name="exerciseId" value={rule.exercise_id}/>
      <div className={styles.formColumns}>
        <label className={styles.field}>Measured anchor<select name="anchor" defaultValue={rule.intake_anchor ?? ""}><option value="">No conversion — calibration</option>{["back_squat","bench","deadlift","romanian_deadlift","overhead_press"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label className={styles.field}>Starting coefficient (fraction of total anchor)<input type="number" name="coefficient" min={0.001} max={0.8} step={0.001} defaultValue={rule.coefficient ?? ""}/></label>
        <label className={styles.field}>Weight means<select name="semantics" defaultValue={rule.weight_semantics}>{["total","each_hand","added","sled","none"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label className={styles.field}>Minimum (lb)<input name="minimum" type="number" min={0} step="any" defaultValue={rule.minimum_lb} required/></label>
        <label className={styles.field}>Maximum (lb)<input name="maximum" type="number" min={0.001} max={10000} step="any" defaultValue={rule.maximum_lb} required/></label>
        <label className={styles.field}>First-use strategy<select name="calibration" defaultValue={rule.calibration_strategy}><option value="lightest_confirmed">Lightest confirmed technique load</option><option value="coach_required">Coach-required calibration</option></select></label>
        <label className={styles.field}>Explicitly approved equivalent (same equipment and semantics only)<select name="equivalent" defaultValue={rule.equivalent_exercise_id ?? ""}><option value="">None — do not infer equivalence</option>{library.filter(e => e.id !== rule.exercise_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      </div>
      <label className={styles.field}>Coach explanation<textarea name="explanation" maxLength={1000} defaultValue={rule.explanation} required/></label>
      <button className={styles.secondaryAction} disabled={pending}>Save new gym rule version</button>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </details>;
}
