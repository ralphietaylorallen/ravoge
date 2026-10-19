import "server-only";
import { kilogramsToPounds } from "./weight-units.ts";
import { generatedWeightTextIsLoadFree } from "./equipment-weights.ts";
import type { GenerationInput, AssistedWorkout } from "./workout-generation.ts";
import { BLOCKS, FORMATS, estimateWorkoutSeconds, validateProtocol, type WorkoutProtocol } from "./workout-protocol.ts";

const protocolProperties = {
  block: { type: "string", enum: BLOCKS }, format: { type: "string", enum: FORMATS }, group: { type: "string", maxLength: 60 },
  measurement: { type: "string", enum: ["reps", "time", "distance"] }, workSeconds: { type: ["integer", "null"], minimum: 5, maximum: 1200 },
  distance: { type: ["number", "null"], minimum: 1, maximum: 3000 }, distanceUnit: { type: "string", enum: ["meters", "yards"] },
  intervalSeconds: { type: ["integer", "null"], minimum: 10, maximum: 1200 }, blockDurationSeconds: { type: ["integer", "null"], minimum: 30, maximum: 3600 },
  percentageLoad: { type: "null" }, perSide: { type: "boolean" }, targetRpe: { type: "number", minimum: 4, maximum: 8 },
  substitutionIds: { type: "array", maxItems: 0, items: { type: "string" } },
};
export const qualitySchema = {
  type: "object", additionalProperties: false, required: ["title", "rationale", "durationMinutes", "exercises"], properties: {
    title: { type: "string", minLength: 2, maxLength: 120 }, rationale: { type: "string", minLength: 2, maxLength: 2000 },
    durationMinutes: { type: "integer", minimum: 20, maximum: 180 }, exercises: { type: "array", minItems: 3, maxItems: 12, items: {
      type: "object", additionalProperties: false, required: ["exerciseKey", "sets", "reps", "restSeconds", "notes", "reason", "protocol"], properties: {
        exerciseKey: { type: "string" }, sets: { type: "integer", minimum: 1, maximum: 4 }, reps: { type: "integer", minimum: 1, maximum: 20 },
        restSeconds: { type: "integer", minimum: 0, maximum: 300 }, notes: { type: "string", maxLength: 500 }, reason: { type: "string", minLength: 2, maxLength: 500 },
        protocol: { type: "object", additionalProperties: false, required: Object.keys(protocolProperties), properties: protocolProperties },
      },
    } },
  },
};
export const QUALITY_RULES = [
  "Every weight is pounds (lb), including body composition, targets, history and equipment. Do not convert pounds again. Unknown bar/plate quantities are unknown; never infer extra pairs. Coach selects and verifies absolute loads. Do not put numeric loads or percentages in exercise notes or reasons; Coach review chooses them. Do not emit kilograms.",
  "Adult Coach-review draft only. Never diagnose, rehabilitate injuries, guarantee results, or assign automatically.",
  "Select only supplied exercise aliases. Respect metadata, structured restrictions, avoided exercises, actual equipment and available facilities. Do not infer missing equipment or quantities.",
  "Use the client's goal, experience, frequency, intake measurements/targets, recent assigned/completed work and logged outcomes. Do not infer capacity from body composition or prescribe absolute/percentage loads.",
  "Choose a purposeful sequence: appropriate warm-up/preparation, goal-specific main work, optional accessories/conditioning/finisher and cooldown. Not every workout needs every section.",
  "For strength prioritize relevant compound work early with more recovery and fewer reps. Hypertrophy uses manageable accessory volume. Beginners use simple formats, modest volume and RPE at most 7. Athletic goals may use low-volume power and conditioning only when compatible.",
  "Use 3–12 movement rows, at most 28 total sets, at most 4 sets per row (3 for beginners), 1–20 reps bounded by each exercise's repMax, RPE 4–8 (7 beginner). Use low-repetition power work, not fatiguing high-rep throws. Preserve recovery; never prescribe failure as a target.",
  "Use supplied published gym references as compatible stylistic/structural examples, adapted to this client, not copied unchanged. Draft/unpublished sources are never provided. If none, state general-library fallback honestly.",
  "Supported formats: straight, superset, circuit, stations, rounds, intervals, EMOM and AMRAP. Rows sharing a group must share format, block, set/round count and block duration. Use distinct group labels for distinct blocks.",
  "Reps are actual reps only for measurement=reps. For time/distance set reps=1 as a compatibility sentinel; prescribe actual workSeconds or distance. Unilateral work must say perSide=true. Never turn carries or ergs into arbitrary repetitions.",
  "EMOM uses explicit intervalSeconds and sets=number of visits per movement; timed work must leave recovery in the slot. AMRAP uses sets=1 and blockDurationSeconds shared by the group; do not invent a fixed round count. Rounds/circuits use sets=rounds per movement.",
  "Turf distance per length must not exceed the available lane in its stated unit. Sleds require both sled inventory and turf. SkiErg/rower need their specific available type; do not force them into every workout.",
  "Match a plausible duration: sum sets*(reps*4s or workSeconds or distance*2s + restSeconds), double unilateral reps/distance work, plus 30s transitions per row. EMOM uses slot duration; count each AMRAP group's duration once. Stay within the requested duration and avoid implausibly short plans.",
  "Give a short factual rationale for major block selection, restrictions, equipment and goal. No internal reasoning transcript. Coach chooses loads and substitutions after local review.",
];

export function projectQualityContext(input: GenerationInput) {
  const aliases = new Map(input.candidates.map((c, index) => [c.id, `exercise_${index + 1}`]));
  const cleanProtocol = (p?: WorkoutProtocol) => p ? {
    block: p.block, format: p.format, measurement: p.measurement, workSeconds: p.workSeconds, distance: p.distance,
    distanceUnit: p.distanceUnit, intervalSeconds: p.intervalSeconds, blockDurationSeconds: p.blockDurationSeconds,
    perSide: p.perSide, targetRpe: p.targetRpe,
  } : undefined;
  return {
    approvedExerciseMetadata: input.candidates.map(c => ({ exerciseKey: aliases.get(c.id), canonicalName: c.canonicalName ?? undefined,
      measurement: c.measurement ?? "reps", laterality: c.laterality, repMin: c.repMin, repMax: c.repMax, primaryMuscles: c.primaryMuscles, secondaryMuscles: c.secondaryMuscles, purposes: c.purposes })),
    availableFacilities: input.facilities?.map(f => ({ type: f.type, length: f.length, unit: f.unit })),
    gymProfile: input.gymProfile && input.references.length > 0 ? { version: input.gymProfile.version, preferences: input.gymProfile.preferences,
      formats: input.gymProfile.statistics.formats, emphasis: input.gymProfile.statistics.emphasis, sets: input.gymProfile.statistics.sets,
      reps: input.gymProfile.statistics.reps, restSeconds: input.gymProfile.statistics.restSeconds,
      terminology: input.gymProfile.statistics.terminology, progressionPatterns: input.gymProfile.statistics.progressionPatterns, resourceUse: input.gymProfile.statistics.resourceUse } : null,
    publishedCount: input.publishedCount ?? 0,
    todayReadiness: input.todayReadiness ? { answers: input.todayReadiness.answers, hasPain: input.todayReadiness.hasPain, coachDecision: input.todayReadiness.coachDecision } : null,
    publishedStructures: input.references.map((r, index) => {
      const groups = new Map<string, string>();
      return { referenceKey: `reference_${index + 1}`, goal: r.goal, durationMinutes: r.duration, sequence: r.exercises.filter(e => aliases.has(e.libraryExerciseId ?? "")).map(e => {
        if (e.protocol?.group && !groups.has(e.protocol.group)) groups.set(e.protocol.group, `group_${groups.size + 1}`);
        return { exerciseKey: aliases.get(e.libraryExerciseId ?? ""), sets: e.sets, reps: e.reps, restSeconds: e.restSeconds,
          protocol: e.protocol ? { ...cleanProtocol(e.protocol), group: groups.get(e.protocol.group) ?? "" } : undefined };
      }) };
    }),
    recentPerformance: input.history.map(w => ({ status: w.status, exercises: w.exercises.filter(e => aliases.has(e.id ?? "")).map(e => ({
      exerciseKey: aliases.get(e.id ?? ""), sets: e.sets, reps: e.reps, restSeconds: e.restSeconds, protocol: cleanProtocol(e.protocol), performance: e.performance ? {
        recorded: e.performance.recorded, problematic: e.performance.problematic, averageReps: e.performance.averageReps,
        averageLoadLb: kilogramsToPounds(e.performance.averageLoad), averageRpe: e.performance.averageRpe, averageWorkSeconds: e.performance.averageWorkSeconds, averageDistance: e.performance.averageDistance,
      } : undefined,
    })) })),
  };
}

export function validateQualityWorkout(output: string, input: GenerationInput): AssistedWorkout {
  const value = JSON.parse(output);
  const text = (s: unknown, min: number, max: number): s is string => typeof s === "string" && s.trim().length >= min && s.length <= max && !/(https?:|@|kg\b|kilograms?|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b)/i.test(s);
  if (!value || Array.isArray(value) || Object.keys(value).some(k => !["title", "rationale", "durationMinutes", "exercises"].includes(k))
    || !text(value.title, 2, 120) || !text(value.rationale, 2, 2000) || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 20 || value.durationMinutes > input.duration
    || !Array.isArray(value.exercises) || value.exercises.length < 3 || value.exercises.length > 12) throw new Error("invalid_output");
  const groups = new Map<string, string>();
  const exercises = value.exercises.map((raw: Record<string, unknown>) => {
    if (!raw || Object.keys(raw).some(k => !["exerciseKey", "sets", "reps", "restSeconds", "notes", "reason", "protocol"].includes(k))) throw new Error("invalid_output");
    const index = typeof raw.exerciseKey === "string" && /^exercise_[1-9]\d*$/.test(raw.exerciseKey) ? Number(raw.exerciseKey.slice(9)) - 1 : -1;
    const e = input.candidates[index];
    let p: WorkoutProtocol;
    try { p = validateProtocol(raw.protocol); } catch { throw new Error("invalid_output"); }
    if (!e || !e.equipment.every(t => input.equipment.includes(t)) || !Number.isInteger(raw.sets) || Number(raw.sets) < 1 || Number(raw.sets) > (input.experience === "beginner" ? 3 : 4)
      || !Number.isInteger(raw.reps) || Number(raw.reps) < 1 || Number(raw.reps) > 20 || !Number.isInteger(raw.restSeconds) || Number(raw.restSeconds) < 0 || Number(raw.restSeconds) > 300
      || (p.measurement !== "reps" && Number(raw.reps) !== 1) || (p.measurement === "reps" && ((e.measurement && e.measurement !== "reps") || Number(raw.reps) > Math.min(20, e.repMax ?? 20)))
      || (p.measurement === "distance" && e.measurement !== "distance") || (p.format === "amrap" && Number(raw.sets) !== 1)
      || p.percentageLoad !== null || p.targetRpe === null || p.targetRpe < 4 || p.targetRpe > (input.experience === "beginner" ? 7 : 8) || p.substitutionIds.length
      || (e.laterality === "unilateral" && !p.perSide) || !text(raw.notes, 0, 500) || !text(raw.reason, 2, 500) || !generatedWeightTextIsLoadFree(raw.notes, raw.reason)) throw new Error("invalid_output");
    if (e.equipment.includes("turf") && !(input.facilities ?? []).some(f => f.type === "turf" && f.length * (f.unit === "yards" ? 0.9144 : 1) >= (p.distance ?? 1) * (p.distanceUnit === "yards" ? 0.9144 : 1))) throw new Error("invalid_output");
    if (p.group) {
      const signature = JSON.stringify([p.block, p.format, p.blockDurationSeconds, raw.sets]);
      if (groups.has(p.group) && groups.get(p.group) !== signature) throw new Error("invalid_output");
      groups.set(p.group, signature);
    }
    return { libraryExerciseId: e.id, name: e.name, sets: Number(raw.sets), reps: Number(raw.reps), restSeconds: Number(raw.restSeconds), load: null, loadUnit: "lb" as const,
      targetRpe: p.targetRpe, notes: raw.notes, reason: raw.reason, protocol: p };
  });
  const seconds = estimateWorkoutSeconds(exercises);
  if (exercises.reduce((sum: number, e: { sets: number }) => sum + e.sets, 0) > 28 || seconds > input.duration * 60 + 180 || seconds < Math.min(15, input.duration * 0.4) * 60) throw new Error("invalid_output");
  return { title: value.title, rationale: value.rationale, durationMinutes: Math.max(20, Math.min(input.duration, Math.ceil(seconds / 60))), exercises };
}
