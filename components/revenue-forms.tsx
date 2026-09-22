"use client";

import { useActionState } from "react";

import {
  saveCoachCompensationAction,
  saveSessionPricingAction,
} from "@/app/owner/actions";

import styles from "./dashboard.module.css";

type Compensation = {
  commission_basis_points: number | null;
  hourly_rate_minor: number | null;
  model: "none" | "hourly" | "percentage";
};

function ActionNotice({ message, status }: { message?: string; status: string }) {
  return message ? <p className={`${styles.notice} ${status === "error" ? styles.error : ""}`} role="status">{message}</p> : null;
}

export function SessionPricingForm({ priceMinor }: { priceMinor: number | null }) {
  const [state, action, pending] = useActionState(saveSessionPricingAction, { status: "idle" as const });
  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>Default session value (USD)
        <input defaultValue={priceMinor === null ? "" : (priceMinor / 100).toFixed(2)} inputMode="decimal" name="sessionPrice" placeholder="100.00" />
      </label>
      <p className={styles.formHint}>Leave blank to remove pricing. This records reporting value only; Ravoge does not collect payment.</p>
      <button className={styles.action} disabled={pending} type="submit">{pending ? "Saving…" : "Save session value"}</button>
      <ActionNotice message={state.message} status={state.status} />
    </form>
  );
}

export function CoachCompensationForm({ coachId, compensation }: { coachId: string; compensation?: Compensation }) {
  const actionWithCoach = saveCoachCompensationAction.bind(null, coachId);
  const [state, action, pending] = useActionState(actionWithCoach, { status: "idle" as const });
  const model = compensation?.model ?? "none";
  return (
    <form action={action} className={styles.compensationForm}>
      <label className={styles.field}>Model
        <select defaultValue={model} name="model">
          <option value="none">None</option>
          <option value="hourly">Hourly</option>
          <option value="percentage">Percentage</option>
        </select>
      </label>
      <label className={styles.field}>Hourly rate (USD)
        <input defaultValue={compensation?.hourly_rate_minor == null ? "" : (compensation.hourly_rate_minor / 100).toFixed(2)} inputMode="decimal" name="hourlyRate" placeholder="50.00" />
      </label>
      <label className={styles.field}>Commission %
        <input defaultValue={compensation?.commission_basis_points == null ? "" : (compensation.commission_basis_points / 100).toFixed(2)} inputMode="decimal" name="commissionPercentage" placeholder="30" />
      </label>
      <button className={styles.secondaryAction} disabled={pending} type="submit">{pending ? "Saving…" : "Save compensation"}</button>
      <ActionNotice message={state.message} status={state.status} />
    </form>
  );
}
