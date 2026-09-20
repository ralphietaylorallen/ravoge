"use client";

import { useActionState, useId } from "react";

import {
  assignClientCoachAction,
  type CoachAssignmentActionState,
} from "@/app/owner/actions";

import styles from "./dashboard.module.css";

type CoachOption = {
  id: string;
  name: string;
};

export function ClientCoachAssignmentForm({
  clientId,
  coaches,
  currentCoachId,
}: {
  clientId: string;
  coaches: CoachOption[];
  currentCoachId?: string;
}) {
  const selectId = useId();
  const action = assignClientCoachAction.bind(null, clientId);
  const initialState: CoachAssignmentActionState = { status: "idle" };
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={selectId}>Primary coach</label>
        <select defaultValue={currentCoachId ?? ""} id={selectId} name="coachId" required>
          <option disabled value="">Choose a coach</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>{coach.name}</option>
          ))}
        </select>
      </div>
      <button className={styles.action} disabled={pending || coaches.length === 0} type="submit">
        {pending ? "Updating…" : currentCoachId ? "Reassign coach" : "Assign coach"}
      </button>
      {state.message && (
        <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">
          {state.message}
        </p>
      )}
      <p className={styles.formHint}>This changes gym access only. You remain signed in as the Owner.</p>
    </form>
  );
}
