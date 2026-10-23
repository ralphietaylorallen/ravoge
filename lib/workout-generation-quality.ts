import "server-only";
import { kilogramsToPounds } from "./weight-units.ts";
import { generatedWeightTextIsLoadFree } from "./equipment-weights.ts";
import type { GenerationInput, AssistedWorkout } from "./workout-generation.ts";
import { BLOCKS, FORMATS, estimateWorkoutSeconds, validateProtocol, type WorkoutProtocol } from "./workout-protocol.ts";
import { programmingEvidence } from "./programming-evidence.ts";
import { provenanceSchema, validateWorkoutProvenance, type RowProvenance } from "./workout-provenance.ts";

// Fixed application-owned diagnostics only: never retain or echo rejected model
// text, client information, request bodies or provider exception messages.
export const QUALITY_REPAIR_HINTS = {
  header: "Use the exact schema; durationMinutes must be between 20 and requestedDurationMinutes.",
  row_shape: "Use only the declared exercise-row fields and supplied exercise aliases.",
  protocol: "Complete every protocol field. Time uses workSeconds only; distance uses distance only; reps uses neither. Grouped formats need a group. EMOM work must be shorter than its interval; AMRAP needs a block duration.",
  row_constraints: "Check each exercise's available equipment, measurement, repMax and laterality. Non-rep rows use reps=1. Respect experience-specific sets/RPE and the lower trainingAnalysis.intensityCeiling, rest, AMRAP sets=1 and all schema limits.",
  planned_intensity: "Every targetRpe must be at or below trainingAnalysis.intensityCeiling, even when the general experience limit is higher.",
  numeric_load: "Do not include numeric lb loads or percentages in notes/reasons. Leave load selection to the Coach; do not repeat numeric body-composition targets there.",
  turf: "Distance per length must fit the available turf after converting yards/meters correctly.",
  group: "A group label must have identical block, format, rounds/sets and block duration. Use separate labels for separate groups.",
  volume: "Use no more than 28 total sets and respect the per-row/experience limits.",
  duration: "Recalculate actual duration using the supplied formula, including rest, unilateral work, transitions and shared blocks. It must reach min(15, requestedDurationMinutes*0.4) minutes and not exceed requestedDurationMinutes plus 3 minutes. Do not just change the declared duration.",
  response_incomplete: "Return a complete compact JSON workout within the output budget; keep prose brief and use only the necessary movement rows.",
  response_json: "Return exactly one complete JSON object matching the schema, with no surrounding prose or markdown. Keep the workout compact and all original constraints intact.",
  references: "Cite only unique supplied reference keys that influenced this session. Include recognized movements from each cited raw example; keep source combinations primary and add at most two other canonical movements. At least one credit is required when references exist; otherwise use an empty array.",
} as const;
export class QualityValidationError extends Error {
  readonly issue: keyof typeof QUALITY_REPAIR_HINTS;
  readonly repair?: QualityRepairContext;
  constructor(issue: keyof typeof QUALITY_REPAIR_HINTS, repair?: QualityRepairContext) { super("invalid_output"); this.issue = issue; this.repair = repair; }
}
export type QualityRepairContext = { timing: { estimatedSeconds:number; minimumSeconds:number; maximumSeconds:number } }
  | { row: { exerciseKey:string; field:"reps"|"perSide"|"measurement"|"sets"; maximum?:number; required?:number|boolean|string } };

// Normalize database validation failures without logging SQL details, user
// data, model output, request payloads or provider error objects.
export function generationSaveIssue(message: string) {
  const known = ["Invalid training analysis", "Invalid training analysis lists", "Invalid training intensity", "Unapproved training analysis value",
    "Invalid source credits", "Source is not currently approved and compatible in this gym", "Draft exceeds planned intensity ceiling",
    "Training or weight capabilities changed", "Training inputs changed", "Review targets and measurement units", "Invalid protocol value",
    "Incomplete or unsupported workout structure", "Missing or conflicting timed/distance/load prescription", "Generated intensity exceeds review limits",
    "Group format and rounds must agree", "Workout exceeds available duration; reduce workload or use a shorter source", "Draft duration is not plausible for these targets"];
  return known.includes(message) ? message : "other_database_validation";
}

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
export function qualitySchemaFor(input: GenerationInput) {
  const row = qualitySchema.properties.exercises.items;
  const ceiling = Math.min(input.experience === "beginner" ? 7 : 8, input.intelligence?.analysis.intensityCeiling ?? 8);
  const reviewText={type:"string",minLength:5,maxLength:500};
  return { ...qualitySchema,
    required: [...qualitySchema.required,...(input.intelligence?["sourceReferenceKeys"]:[]),...(input.intakeContext?.version===2?["coachReview"]:[])],
    properties: { ...qualitySchema.properties,
      ...(input.intakeContext?.version===2?{coachReview:{type:"object",additionalProperties:false,required:["goalSupport","weeklyPlan","injuryAdaptations","progression","regression","unresolvedQuestions"],properties:{goalSupport:reviewText,
        weeklyPlan:{type:"array",minItems:input.frequency,maxItems:input.frequency,items:{type:"object",additionalProperties:false,required:["day","focus"],properties:{day:{type:"integer",minimum:1,maximum:input.frequency},focus:reviewText}}},
        injuryAdaptations:{type:"array",maxItems:50,items:reviewText},progression:reviewText,regression:reviewText,unresolvedQuestions:{type:"array",maxItems:10,items:reviewText}}}}:{}),
      exercises: { ...qualitySchema.properties.exercises, items: { ...row, required:[...row.required,...(input.intakeContext?.version===2?["provenance"]:[])], properties: { ...row.properties,
        ...(input.intakeContext?.version===2?{provenance:provenanceSchema}:{}),
        sets: { ...row.properties.sets, maximum: input.experience === "beginner" ? 3 : 4 },
        protocol: { ...row.properties.protocol, properties: { ...row.properties.protocol.properties,
          targetRpe: { ...row.properties.protocol.properties.targetRpe, maximum: ceiling },
        } },
      } } },
      ...(input.intelligence ? { sourceReferenceKeys: { type:"array",minItems:input.references.length?1:0,maxItems:Math.min(5,input.references.length),items:{type:"string",enum:input.references.length ? input.references.map((_,i)=>`reference_${i+1}`) : ["none"]} } } : {}),
    },
  };
}
export const QUALITY_RULES = [
  "Every weight is pounds (lb), including body composition, targets, history and equipment. Do not convert pounds again. Unknown bar/plate quantities are unknown; never infer extra pairs. Coach selects and verifies absolute loads. Do not put numeric loads or percentages in exercise notes or reasons; Coach review chooses them. Do not emit kilograms.",
  "Adult Coach-review draft only. Never diagnose, rehabilitate injuries, guarantee results, or assign automatically.",
  "Select only supplied exercise aliases. Respect metadata, structured restrictions, avoided exercises, actual equipment and available facilities. Do not infer missing equipment or quantities.",
  "Use the client's goal, experience, frequency, intake measurements/targets, recent assigned/completed work and logged outcomes. Do not infer capacity from body composition or prescribe absolute/percentage loads.",
  "Choose a purposeful sequence: appropriate warm-up/preparation, goal-specific main work, optional accessories/conditioning/finisher and cooldown. Not every workout needs every section.",
  "For strength prioritize relevant compound work early with more recovery and fewer reps. Hypertrophy uses manageable accessory volume. Beginners use simple formats, modest volume and RPE at most 7. Athletic goals may use low-volume power and conditioning only when compatible.",
  "Use 3–12 movement rows, at most 28 total sets, at most 4 sets per row (3 for beginners), 1–20 reps bounded by each exercise's repMax, RPE 4–8 (7 beginner). Use low-repetition power work, not fatiguing high-rep throws. Preserve recovery; never prescribe failure as a target.",
  "When trainingAnalysis is supplied, its intensityCeiling is an additional hard RPE maximum. Use the lower of that ceiling and the experience limit on every row, not just the main exercises.",
  "Use supplied Owner-enabled gym references as compatible stylistic/structural examples, adapted to this Client, not copied unchanged. Raw examples need no structured publication; only records labeled structured_template have verified protocols. Excluded or foreign sources are never provided. If none, state general-library fallback honestly.",
  "Retrieved references are alternative examples, not complete workouts to concatenate. Select a coherent subset, budget warm-up/transitions/recovery inside timingBudget, and calculate the actual work/rest total before returning. Do not stack full reference sessions or merely label a shorter/longer session with the requested duration.",
  "Raw gym examples are authorized style references, NOT verified templates. Prefer their recognized exercise combinations, sequencing and format signals as the session identity; adapt to this Client. Add only one or two canonical movements when materially helpful. Unknown names and missing source quantities are not executable targets. Never claim a raw source supplied a verified protocol. Choose conservative explicit adapted targets, not invented historical values. No source prose or numerical loads are provided.",
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
    timingBudget: { requestedSeconds:input.duration*60, minimumEstimatedSeconds:Math.min(15,input.duration*0.4)*60, maximumEstimatedSeconds:input.duration*60+180 },
    trainingAnalysis: input.intelligence?.analysis,
    evidencePrinciples: programmingEvidence().principles,
    evidenceCacheVersion: programmingEvidence().version,
    liveWebResearch: !!input.evidence && !input.evidence.cacheHit,
    todayReadiness: input.todayReadiness ? { answers: input.todayReadiness.answers, hasPain: input.todayReadiness.hasPain, coachDecision: input.todayReadiness.coachDecision } : null,
    publishedStructures: input.references.map((r, index) => {
      const groups = new Map<string, string>();
      return { referenceKey: `reference_${index + 1}`, goal: r.goal, durationMinutes: r.duration, sourceKind:r.sourceKind??"structured_template",
        segments:r.segments?.map(s=>({key:s.key,exerciseKeys:s.exerciseIds.filter(id=>aliases.has(id)).map(id=>aliases.get(id))})),
        ...(r.rawStyle?{rawExample:{protocolsVerified:false,exerciseKeys:r.rawStyle.exerciseIds.filter(id=>aliases.has(id)).map(id=>aliases.get(id)),
          formats:r.rawStyle.formats.filter(f=>(FORMATS as readonly string[]).includes(f)),terms:r.rawStyle.terms.filter(t=>['per side','each side','tempo','ladder','finisher','warmup','strength','conditioning','power','mobility','percentage'].includes(t))}}:{}),
        sequence: r.exercises.filter(e => aliases.has(e.libraryExerciseId ?? "")).map(e => {
        if (e.protocol?.group && !groups.has(e.protocol.group)) groups.set(e.protocol.group, `reference_${index + 1}_group_${groups.size + 1}`);
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
  if (!value || Array.isArray(value) || Object.keys(value).some(k => !["title", "rationale", "durationMinutes", "exercises",...(input.intelligence?["sourceReferenceKeys"]:[]),...(input.intakeContext?.version===2?["coachReview"]:[])].includes(k))
    || !text(value.title, 2, 120) || !text(value.rationale, 2, 2000) || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 20 || value.durationMinutes > input.duration
    || !Array.isArray(value.exercises) || value.exercises.length < 3 || value.exercises.length > 12) throw new QualityValidationError("header");
  const referenceKeys=input.references.map((_,index)=>`reference_${index+1}`);
  if(input.intakeContext?.version===2) {
    const r=value.coachReview;
    if(!r || !text(r.goalSupport,5,500) || !text(r.progression,5,500) || !text(r.regression,5,500)
      || !Array.isArray(r.weeklyPlan)||r.weeklyPlan.length!==input.frequency||new Set(r.weeklyPlan.map((d:{day:number})=>d.day)).size!==input.frequency
      || r.weeklyPlan.some((d:{day:number;focus:string})=>!Number.isInteger(d.day)||d.day<1||d.day>input.frequency||!text(d.focus,5,500))
      || !Array.isArray(r.injuryAdaptations)||r.injuryAdaptations.length>50||r.injuryAdaptations.some((s:unknown)=>!text(s,5,500))
      || !Array.isArray(r.unresolvedQuestions)||r.unresolvedQuestions.length>10||r.unresolvedQuestions.some((s:unknown)=>!text(s,5,500))
      || (input.injurySpots?.length && !r.injuryAdaptations.length)) throw new QualityValidationError("header");
  }
  if(input.intelligence && (!Array.isArray(value.sourceReferenceKeys) || value.sourceReferenceKeys.length>(input.references.length?5:0) || (input.references.length && !value.sourceReferenceKeys.length)
    || new Set(value.sourceReferenceKeys).size!==value.sourceReferenceKeys.length || value.sourceReferenceKeys.some((key:unknown)=>typeof key!=="string"||!referenceKeys.includes(key)))) throw new QualityValidationError("references");
  const groups = new Map<string, string>();
  const exercises = value.exercises.map((raw: Record<string, unknown>) => {
    if (!raw || Object.keys(raw).some(k => !["exerciseKey", "sets", "reps", "restSeconds", "notes", "reason", "protocol",...(input.intakeContext?.version===2?["provenance"]:[])].includes(k))) throw new QualityValidationError("row_shape");
    const index = typeof raw.exerciseKey === "string" && /^exercise_[1-9]\d*$/.test(raw.exerciseKey) ? Number(raw.exerciseKey.slice(9)) - 1 : -1;
    const e = input.candidates[index];
    let p: WorkoutProtocol;
    try { p = validateProtocol(raw.protocol); } catch { throw new QualityValidationError("protocol"); }
    if (input.intelligence && p.targetRpe !== null && p.targetRpe > input.intelligence.analysis.intensityCeiling) throw new QualityValidationError("planned_intensity");
    const row = { exerciseKey:`exercise_${index+1}` };
    if(e && p.measurement==="reps" && Number(raw.reps)>Math.min(20,e.repMax??20)) throw new QualityValidationError("row_constraints",{row:{...row,field:"reps",maximum:Math.min(20,e.repMax??20)}});
    if(e?.laterality==="unilateral" && !p.perSide) throw new QualityValidationError("row_constraints",{row:{...row,field:"perSide",required:true}});
    if(e && ((p.measurement==="reps" && e.measurement && e.measurement!=="reps") || (p.measurement==="distance" && e.measurement!=="distance"))) throw new QualityValidationError("row_constraints",{row:{...row,field:"measurement",required:e.measurement??"reps"}});
    if(p.measurement!=="reps" && Number(raw.reps)!==1) throw new QualityValidationError("row_constraints",{row:{...row,field:"reps",required:1}});
    if(p.format==="amrap" && Number(raw.sets)!==1) throw new QualityValidationError("row_constraints",{row:{...row,field:"sets",required:1}});
    if (!e || !e.equipment.every(t => input.equipment.includes(t)) || !Number.isInteger(raw.sets) || Number(raw.sets) < 1 || Number(raw.sets) > (input.experience === "beginner" ? 3 : 4)
      || !Number.isInteger(raw.reps) || Number(raw.reps) < 1 || Number(raw.reps) > 20 || !Number.isInteger(raw.restSeconds) || Number(raw.restSeconds) < 0 || Number(raw.restSeconds) > 300
      || (p.measurement !== "reps" && Number(raw.reps) !== 1) || (p.measurement === "reps" && ((e.measurement && e.measurement !== "reps") || Number(raw.reps) > Math.min(20, e.repMax ?? 20)))
      || (p.measurement === "distance" && e.measurement !== "distance") || (p.format === "amrap" && Number(raw.sets) !== 1)
      || p.percentageLoad !== null || p.targetRpe === null || p.targetRpe < 4 || p.targetRpe > Math.min(input.intelligence?.analysis.intensityCeiling??8,input.experience === "beginner" ? 7 : 8) || p.substitutionIds.length
      || (e.laterality === "unilateral" && !p.perSide) || !text(raw.notes, 0, 500) || !text(raw.reason, 2, 500)) throw new QualityValidationError("row_constraints");
    if (!generatedWeightTextIsLoadFree(raw.notes as string, raw.reason as string)) throw new QualityValidationError("numeric_load");
    if (e.equipment.includes("turf") && !(input.facilities ?? []).some(f => f.type === "turf" && f.length * (f.unit === "yards" ? 0.9144 : 1) >= (p.distance ?? 1) * (p.distanceUnit === "yards" ? 0.9144 : 1))) throw new QualityValidationError("turf");
    if (p.group) {
      const signature = JSON.stringify([p.block, p.format, p.blockDurationSeconds, raw.sets]);
      if (groups.has(p.group) && groups.get(p.group) !== signature) throw new QualityValidationError("group");
      groups.set(p.group, signature);
    }
    return { libraryExerciseId: e.id, name: e.name, sets: Number(raw.sets), reps: Number(raw.reps), restSeconds: Number(raw.restSeconds), load: null, loadUnit: "lb" as const,
      targetRpe: p.targetRpe, notes: raw.notes, reason: raw.reason, protocol: p };
  });
  const seconds = estimateWorkoutSeconds(exercises);
  let provenanceAudit;
  if(input.intakeContext?.version===2) {
    try { provenanceAudit=validateWorkoutProvenance(exercises,value.exercises.map((r:{provenance:RowProvenance})=>r.provenance),input); }
    catch { throw new QualityValidationError("references"); }
  }
  if(input.intelligence && input.references.some(r=>r.sourceKind==='raw_reference')) {
    const used=input.references.filter((_,i)=>value.sourceReferenceKeys.includes(`reference_${i+1}`));
    const sourceIds=new Set(used.flatMap(r=>r.rawStyle?.exerciseIds??r.exercises.map(e=>e.libraryExerciseId??'')));
    for(const r of used) if(r.rawStyle?.exerciseIds.length && !exercises.some((e:{libraryExerciseId:string})=>r.rawStyle!.exerciseIds.includes(e.libraryExerciseId))) throw new QualityValidationError('references');
    if(sourceIds.size>=3 && exercises.filter((e:{libraryExerciseId:string})=>!sourceIds.has(e.libraryExerciseId)).length>2) throw new QualityValidationError('references');
  }
  if (exercises.reduce((sum: number, e: { sets: number }) => sum + e.sets, 0) > 28) throw new QualityValidationError("volume");
  if (seconds > input.duration * 60 + 180 || seconds < Math.min(15, input.duration * 0.4) * 60) throw new QualityValidationError("duration",{timing:{estimatedSeconds:Math.ceil(seconds),minimumSeconds:Math.min(15,input.duration*0.4)*60,maximumSeconds:input.duration*60+180}});
  return { title: value.title, rationale: value.rationale, durationMinutes: Math.max(20, Math.min(input.duration, Math.ceil(seconds / 60))), exercises,
    ...(provenanceAudit?{provenanceAudit}:{}),
    ...(input.intakeContext?.version===2?{coachReview:value.coachReview}:{}),
    ...(input.intelligence?{sourceReviewIds:value.sourceReferenceKeys.map((key:string)=>input.references[referenceKeys.indexOf(key)].id)}:{}) };
}
