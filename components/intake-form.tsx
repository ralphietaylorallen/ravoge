"use client";

import { useActionState } from "react";

import { saveClientIntakeAction } from "@/app/coach/actions";

import styles from "./dashboard.module.css";

type IntakeDefaults = Partial<{
  avoided_exercises: string[];
  birth_year: number;
  coach_notes: string;
  conditioning_baseline: number;
  constraint_tags: string[];
  current_injuries: string;
  experience_level: string;
  medical_coach_notes: string;
  mobility_baseline: number;
  movement_limitations: string;
  movements_to_avoid: string[];
  pain_areas: string[];
  preferred_exercises: string[];
  preferred_training_days: string[];
  primary_goal: string;
  recent_consistency: string;
  recovery_perception: number;
  secondary_goal: string;
  session_duration_minutes: number;
  sleep_quality: number;
  soreness_fatigue: number;
  strength_baseline: number;
  stress_level: number;
  training_frequency_goal: number;
  training_years: number;
}>;

const goals = [
  ["strength", "Strength"], ["muscle_gain", "Muscle gain"],
  ["general_fitness", "General fitness"], ["conditioning", "Conditioning"],
  ["fat_loss", "Fat loss"], ["athletic_performance", "Athletic performance"],
];
const constraints = [
  ["knee_flexion", "Knee flexion"], ["hinge", "Hip hinge"],
  ["axial_load", "Axial loading"], ["horizontal_push", "Horizontal pressing"],
  ["vertical_push", "Overhead pressing"], ["impact", "Impact"],
  ["balance", "Balance"], ["conditioning", "Conditioning"],
];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ScaleSelect({ defaultValue, id, label, required = true }: { defaultValue?: number; id: string; label: string; required?: boolean }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select defaultValue={defaultValue ?? ""} id={id} name={id} required={required}>
        <option disabled value="">Choose 1–5</option>
        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
  );
}

export function IntakeForm({ clientId, defaults = {} }: { clientId: string; defaults?: IntakeDefaults }) {
  const saveForClient = saveClientIntakeAction.bind(null, clientId);
  const [state, action, pending] = useActionState(saveForClient, { status: "idle" as const });
  return (
    <form action={action} className={styles.intakeForm}>
      <details className={styles.formSection} open>
        <summary><span>01</span> Goals &amp; context</summary>
        <div className={styles.sectionFields}>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="birthYear">Birth year <span>optional</span></label><input defaultValue={defaults.birth_year} id="birthYear" max={2100} min={1900} name="birthYear" type="number" /></div>
            <div className={styles.field}><label htmlFor="trainingFrequencyGoal">Weekly frequency goal</label><input defaultValue={defaults.training_frequency_goal ?? 3} id="trainingFrequencyGoal" max={7} min={1} name="trainingFrequencyGoal" required type="number" /></div>
          </div>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="primaryGoal">Primary goal</label><select defaultValue={defaults.primary_goal ?? "strength"} id="primaryGoal" name="primaryGoal">{goals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className={styles.field}><label htmlFor="secondaryGoal">Secondary goal <span>optional</span></label><select defaultValue={defaults.secondary_goal ?? ""} id="secondaryGoal" name="secondaryGoal"><option value="">None</option>{goals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
        </div>
      </details>

      <details className={styles.formSection} open>
        <summary><span>02</span> Training history</summary>
        <div className={styles.sectionFields}>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="trainingYears">Years training</label><input defaultValue={defaults.training_years ?? 0} id="trainingYears" max={80} min={0} name="trainingYears" required step="0.5" type="number" /></div>
            <div className={styles.field}><label htmlFor="experienceLevel">Experience</label><select defaultValue={defaults.experience_level ?? "beginner"} id="experienceLevel" name="experienceLevel"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
          </div>
          <div className={styles.field}><label htmlFor="recentConsistency">Recent consistency</label><select defaultValue={defaults.recent_consistency ?? "building"} id="recentConsistency" name="recentConsistency"><option value="inconsistent">Inconsistent</option><option value="building">Building</option><option value="consistent">Consistent</option></select></div>
          <fieldset className={styles.choiceField}><legend>Preferred training days</legend><div className={styles.choiceGrid}>{days.map((day) => <label key={day}><input defaultChecked={defaults.preferred_training_days?.includes(day)} name="preferredTrainingDays" type="checkbox" value={day} />{day.slice(0, 3)}</label>)}</div></fieldset>
        </div>
      </details>

      <details className={styles.formSection} open>
        <summary><span>03</span> Limitations &amp; movement</summary>
        <div className={styles.sectionFields}>
          <div className={styles.field}><label htmlFor="currentInjuries">Current injuries</label><textarea defaultValue={defaults.current_injuries} id="currentInjuries" maxLength={4000} name="currentInjuries" rows={3} /></div>
          <div className={styles.field}><label htmlFor="movementLimitations">Movement limitations</label><textarea defaultValue={defaults.movement_limitations} id="movementLimitations" maxLength={4000} name="movementLimitations" rows={3} /></div>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="painAreas">Pain areas <span>comma separated</span></label><input defaultValue={defaults.pain_areas?.join(", ")} id="painAreas" name="painAreas" /></div>
            <div className={styles.field}><label htmlFor="movementsToAvoid">Movements to avoid <span>comma separated</span></label><input defaultValue={defaults.movements_to_avoid?.join(", ")} id="movementsToAvoid" name="movementsToAvoid" /></div>
          </div>
          <fieldset className={styles.choiceField}><legend>Structured movement constraints</legend><div className={styles.choiceGrid}>{constraints.map(([value, label]) => <label key={value}><input defaultChecked={defaults.constraint_tags?.includes(value)} name="constraintTags" type="checkbox" value={value} />{label}</label>)}</div></fieldset>
          <div className={styles.field}><label htmlFor="medicalCoachNotes">Relevant medical / coach notes</label><textarea defaultValue={defaults.medical_coach_notes} id="medicalCoachNotes" maxLength={4000} name="medicalCoachNotes" rows={3} /></div>
        </div>
      </details>

      <details className={styles.formSection}>
        <summary><span>04</span> Baseline &amp; recovery</summary>
        <div className={styles.sectionFields}>
          <p className={styles.formHint}>Baseline scores are optional. Leaving them blank intentionally lowers state confidence.</p>
          <div className={styles.threeColumns}>
            <ScaleSelect defaultValue={defaults.strength_baseline} id="strengthBaseline" label="Strength baseline" required={false} />
            <ScaleSelect defaultValue={defaults.conditioning_baseline} id="conditioningBaseline" label="Conditioning baseline" required={false} />
            <ScaleSelect defaultValue={defaults.mobility_baseline} id="mobilityBaseline" label="Mobility baseline" required={false} />
          </div>
          <div className={styles.threeColumns}>
            <ScaleSelect defaultValue={defaults.sleep_quality ?? 3} id="sleepQuality" label="Sleep quality" />
            <ScaleSelect defaultValue={defaults.stress_level ?? 3} id="stressLevel" label="Stress level" />
            <ScaleSelect defaultValue={defaults.recovery_perception ?? 3} id="recoveryPerception" label="Recovery perception" />
          </div>
          <ScaleSelect defaultValue={defaults.soreness_fatigue ?? 3} id="sorenessFatigue" label="Soreness / fatigue" />
        </div>
      </details>

      <details className={styles.formSection}>
        <summary><span>05</span> Preferences &amp; notes</summary>
        <div className={styles.sectionFields}>
          <div className={styles.formColumns}>
            <div className={styles.field}><label htmlFor="preferredExercises">Preferred exercises <span>comma separated</span></label><input defaultValue={defaults.preferred_exercises?.join(", ")} id="preferredExercises" name="preferredExercises" /></div>
            <div className={styles.field}><label htmlFor="avoidedExercises">Avoided exercises <span>comma separated</span></label><input defaultValue={defaults.avoided_exercises?.join(", ")} id="avoidedExercises" name="avoidedExercises" /></div>
          </div>
          <div className={styles.field}><label htmlFor="sessionDurationMinutes">Session duration</label><input defaultValue={defaults.session_duration_minutes ?? 60} id="sessionDurationMinutes" max={180} min={20} name="sessionDurationMinutes" required type="number" /></div>
          <div className={styles.field}><label htmlFor="coachNotes">Other coach notes</label><textarea defaultValue={defaults.coach_notes} id="coachNotes" maxLength={4000} name="coachNotes" rows={3} /></div>
        </div>
      </details>

      <button className={styles.action} disabled={pending} type="submit">{pending ? "Calculating…" : "Save intake & calculate state"}</button>
      {state.message && <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p>}
    </form>
  );
}
