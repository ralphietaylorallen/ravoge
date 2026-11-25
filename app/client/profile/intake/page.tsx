import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { clientDayLabel, displayIntakeGoal, displayIntakeOption } from "@/lib/client-display";
import { HISTORY_CATEGORIES, type InjurySpot, type IntakeContext } from "@/lib/intake-history";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import { canonicalPounds } from "@/lib/weight-units";
import ui from "../../client-home.module.css";

type Fact = readonly [label: string, value: string | number | null | undefined];

function IntakeSection({ title, facts }: { title: string; facts: Fact[] }) {
  const recorded = facts.filter(([, value]) => typeof value === "number" || value?.trim());
  if (!recorded.length) return null;
  return <section className={ui.surface}>
    <h2>{title}</h2>
    <dl className={ui.facts}>{recorded.map(([label, value]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl>
  </section>;
}

function withUnit(value: number | null | undefined, unit: string) {
  return typeof value === "number" && Number.isFinite(value) ? `${value} ${unit}` : null;
}

function liftResult(weight: number | null, method: string, variation: string) {
  if (method === "not_tested") return "Not tested";
  return weight == null ? null : `${canonicalPounds(weight)} lb · ${displayIntakeOption(method)} · ${displayIntakeOption(variation)}`;
}

export default async function ClientIntakePage() {
  const { membership, supabase, userId } = await requireRole("client");
  const gym = membership.organization_id;
  const [profile, organization, intake] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", gym).single(),
    supabase.from("client_intakes").select(`
      id, completed_at, primary_goal, secondary_goal, birth_year, experience_level, training_years,
      recent_consistency, training_frequency_goal, preferred_training_days, session_duration_minutes,
      preferred_exercises, avoided_exercises, sleep_quality, stress_level, recovery_perception,
      soreness_fatigue, current_injuries, movement_limitations, pain_areas, movements_to_avoid,
      strength_baseline, conditioning_baseline, mobility_baseline,
      context:custom_fields->intakeContext, targets:custom_fields->bodyCompositionGoals
    `).eq("organization_id", gym).eq("client_user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const row = intake.data;
  const [baseline, measurements, injuries] = row ? await Promise.all([
    supabase.from("client_intake_baselines")
      .select("squat_variation,squat_one_rm_kg,squat_one_rm_method,bench_variation,bench_one_rm_kg,bench_one_rm_method,pullup_strict_reps,pullup_mode,rower_distance_m,rower_time_seconds,versa_duration_seconds,versa_feet")
      .eq("organization_id", gym).eq("client_user_id", userId).eq("intake_id", row.id).maybeSingle(),
    supabase.from("client_body_composition_assessments").select("weight_kg,body_fat_percentage,skeletal_muscle_mass_kg,inbody_score")
      .eq("organization_id", gym).eq("client_user_id", userId).eq("intake_id", row.id)
      .order("measured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("client_injury_spots").select("id,details")
      .eq("organization_id", gym).eq("client_user_id", userId).is("removed_at", null).order("created_at").limit(50),
  ]) : [null, null, null];
  const tests = baseline?.data;
  const body = measurements?.data;
  const context = row?.context as Partial<IntakeContext> | null | undefined;
  const targets = row?.targets as { weightKg?: number; bodyFatPercentage?: number; skeletalMuscleMassKg?: number } | null | undefined;
  const timezone = organization.data?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const savedDate = row && localDateInTimeZone(new Date(row.completed_at), timezone);
  const targetDate = context?.targetDate;
  const name = profile.data?.preferred_name || profile.data?.full_name || "Client";

  return <DashboardShell compact gymName={organization.data?.name ?? "Ravoge gym"} name={name} role="client">
    <div className={ui.stack}>
      <Link className={ui.quietLink} href="/client/profile">← Back to profile</Link>
      <header className={ui.heading}>
        <h1>Your intake</h1>
        {savedDate && <p className={ui.muted}>Last saved {clientDayLabel(savedDate, { year: "numeric" })}</p>}
      </header>
      {intake.error ? <p role="alert">Your intake could not be loaded. Reload to try again.</p> : row ? <>
        <div className={ui.intakeGrid}>
          <IntakeSection title="Goals" facts={[
            ["Primary goal", displayIntakeGoal(row.primary_goal)],
            ["Secondary goal", row.secondary_goal && displayIntakeGoal(row.secondary_goal)],
            ["What success looks like", context?.success],
            ["Goal target", context?.goalTarget],
            ["Target date", targetDate && Number.isFinite(Date.parse(targetDate)) ? clientDayLabel(targetDate, { year: "numeric" }) : null],
            ["Target weight", targets?.weightKg != null ? `${canonicalPounds(targets.weightKg)} lb` : null],
            ["Target body fat", withUnit(targets?.bodyFatPercentage, "%")],
            ["Target skeletal muscle", targets?.skeletalMuscleMassKg != null ? `${canonicalPounds(targets.skeletalMuscleMassKg)} lb` : null],
          ]} />
          <IntakeSection title="Training & preferences" facts={[
            ["Age at intake", context?.age],
            ["Birth year", context?.age == null ? row.birth_year : null],
            ["Weight at intake", withUnit(context?.currentWeightLb, "lb")],
            ["Experience", displayIntakeOption(row.experience_level)],
            ["Years training", row.training_years],
            ["Recent sessions per week", context?.recentWorkoutDays],
            ["Recent consistency", context?.recentWorkoutDays == null ? displayIntakeOption(row.recent_consistency) : null],
            ["Target sessions per week", row.training_frequency_goal],
            ["Session length", withUnit(row.session_duration_minutes, "min")],
            ["Preferred days", row.preferred_training_days?.join(", ")],
            ["Other activity", context?.outsideActivity],
            ["Other activity frequency", context?.outsideFrequency],
            ["Barriers", context?.barriers?.map(displayIntakeOption).join(", ")],
            ["Preferred exercises", row.preferred_exercises?.join(", ")],
            ["Exercises to avoid", row.avoided_exercises?.join(", ")],
          ]} />
          <IntakeSection title="Movement & limitations" facts={[
            ["Injury history", row.current_injuries],
            ["Movement limitations", row.movement_limitations],
            ["Pain areas", row.pain_areas?.join(", ")],
            ["Movements to avoid", row.movements_to_avoid?.join(", ")],
          ]} />
          <IntakeSection title="Recovery & baseline ratings" facts={[
            ["Strength baseline", withUnit(row.strength_baseline, "out of 5")],
            ["Conditioning baseline", withUnit(row.conditioning_baseline, "out of 5")],
            ["Mobility baseline", withUnit(row.mobility_baseline, "out of 5")],
            ["Usual sleep", withUnit(context?.sleepHours, "hours")],
            ["Sleep quality", withUnit(row.sleep_quality, "out of 5")],
            ["Stress", withUnit(row.stress_level, "out of 5")],
            ["Perceived recovery", withUnit(row.recovery_perception, "out of 5")],
            ["Soreness or fatigue", withUnit(row.soreness_fatigue, "out of 5")],
          ]} />
          {tests && <IntakeSection title="Baseline tests" facts={[
            ["Squat 1RM", liftResult(tests.squat_one_rm_kg, tests.squat_one_rm_method, tests.squat_variation)],
            ["Bench 1RM", liftResult(tests.bench_one_rm_kg, tests.bench_one_rm_method, tests.bench_variation)],
            ["Strict pull-ups", `${tests.pullup_strict_reps} · ${displayIntakeOption(tests.pullup_mode)}`],
            ["Rower", tests.rower_distance_m && tests.rower_time_seconds
              ? `${tests.rower_distance_m} m in ${tests.rower_time_seconds} sec` : null],
            ["Versa Climber", tests.versa_feet && tests.versa_duration_seconds
              ? `${tests.versa_feet} ft in ${tests.versa_duration_seconds} sec` : null],
          ]} />}
          {body && <IntakeSection title="Body composition" facts={[
            ["Weight", body.weight_kg != null ? `${canonicalPounds(body.weight_kg)} lb` : null],
            ["Body fat", withUnit(body.body_fat_percentage, "%")],
            ["Skeletal muscle", body.skeletal_muscle_mass_kg != null ? `${canonicalPounds(body.skeletal_muscle_mass_kg)} lb` : null],
            ["InBody score", body.inbody_score],
          ]} />}
          {injuries?.data?.map(({ id, details }) => {
            const spot = details as InjurySpot;
            return <IntakeSection key={id} title={`Current injury history · ${displayIntakeOption(spot.region)}${spot.side === "midline" ? "" : ` (${spot.side})`}`} facts={[
              ["History", spot.categories.map(category => HISTORY_CATEGORIES.find(([key]) => key === category)?.[1] ?? displayIntakeOption(category)).join(", ")],
              ["Pain at assessment", withUnit(spot.pain, "out of 10")],
              ["Onset", spot.onset],
              ["Triggers", spot.triggers],
              ["Limitations", spot.limitations],
              ["Post-surgery restrictions", spot.postoperativeRestrictions],
            ]} />;
          })}
        </div>
        {(baseline?.error || measurements?.error || injuries?.error) && <p role="alert">Some assessment details could not be loaded. Reload to try again.</p>}
        <p className={ui.muted}>To update these answers, ask your coach or gym.</p>
      </> : <section className={ui.surface}>
        <h2>No intake saved yet</h2>
        <p className={ui.muted}>Once your coach saves your intake, you’ll be able to review it here.</p>
      </section>}
    </div>
  </DashboardShell>;
}
