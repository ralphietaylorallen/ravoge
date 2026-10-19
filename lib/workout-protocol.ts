// Shared display/validation contract. Legacy fixed-set rows remain valid when
// protocol is absent. For time/distance rows, legacy reps=1 is a storage sentinel,
// never a displayed or inferred repetition prescription.
export const BLOCKS = ["warmup", "preparation", "strength", "power", "accessory", "conditioning", "finisher", "cooldown"] as const;
export const FORMATS = ["straight", "superset", "circuit", "stations", "emom", "amrap", "rounds", "interval"] as const;
export type WorkoutProtocol = {
  block: typeof BLOCKS[number]; format: typeof FORMATS[number]; group: string;
  measurement: "reps" | "time" | "distance"; workSeconds: number | null;
  distance: number | null; distanceUnit: "meters" | "yards";
  intervalSeconds: number | null; blockDurationSeconds: number | null;
  percentageLoad: number | null; perSide: boolean; targetRpe: number | null;
  substitutionIds: string[];
};
export const defaultProtocol = (measurement: WorkoutProtocol["measurement"] = "reps"): WorkoutProtocol => ({
  block: "strength", format: "straight", group: "", measurement, workSeconds: measurement === "time" ? 30 : null,
  distance: measurement === "distance" ? 10 : null, distanceUnit: "meters", intervalSeconds: null,
  blockDurationSeconds: null, percentageLoad: null, perSide: false, targetRpe: 6, substitutionIds: [],
});
const finiteRange = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validateProtocol(raw: unknown): WorkoutProtocol {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Review the workout format.");
  const p = raw as WorkoutProtocol;
  const keys = Object.keys(defaultProtocol());
  if (Object.keys(p).some(k => !keys.includes(k)) || keys.some(k => !(k in p))
    || !BLOCKS.includes(p.block) || !FORMATS.includes(p.format) || !["reps", "time", "distance"].includes(p.measurement)
    || typeof p.group !== "string" || p.group.length > 60 || !["meters", "yards"].includes(p.distanceUnit)
    || typeof p.perSide !== "boolean" || !Array.isArray(p.substitutionIds) || p.substitutionIds.length > 5
    || p.substitutionIds.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    || (p.targetRpe !== null && !finiteRange(p.targetRpe, 1, 10))
    || (p.percentageLoad !== null && !finiteRange(p.percentageLoad, 1, 100))
    || (p.workSeconds !== null && (!Number.isInteger(p.workSeconds) || !finiteRange(p.workSeconds, 5, 1200)))
    || (p.distance !== null && !finiteRange(p.distance, 1, 3000))
    || (p.intervalSeconds !== null && (!Number.isInteger(p.intervalSeconds) || !finiteRange(p.intervalSeconds, 10, 1200)))
    || (p.blockDurationSeconds !== null && (!Number.isInteger(p.blockDurationSeconds) || !finiteRange(p.blockDurationSeconds, 30, 3600)))
    || (p.measurement === "time" ? p.workSeconds === null || p.distance !== null : p.workSeconds !== null)
    || (p.measurement === "distance" ? p.distance === null : p.distance !== null)
    || (["superset", "circuit", "stations", "emom", "amrap", "rounds"].includes(p.format) && !p.group.trim())
    || (p.format === "emom" && (p.intervalSeconds === null || (p.workSeconds !== null && p.workSeconds >= p.intervalSeconds)))
    || (p.format === "amrap" && p.blockDurationSeconds === null)) throw new Error("Complete the selected format without guessing missing targets.");
  return p;
}
export function protocolTarget(sets: number, reps: number, p?: WorkoutProtocol | null) {
  if (!p) return `${sets} sets × ${reps} reps`;
  const target = p.measurement === "time" ? `${p.workSeconds}s work` : p.measurement === "distance" ? `${p.distance} ${p.distanceUnit}` : `${reps} reps`;
  return `${p.format === "amrap" ? "Repeat within block" : `${sets} ${p.format === "emom" ? "visits" : ["rounds", "circuit", "superset", "stations"].includes(p.format) ? "rounds" : "sets"}`} · ${target}${p.perSide ? " each side" : ""}${p.percentageLoad ? ` · ${p.percentageLoad}% of Coach-confirmed 1RM` : ""}${p.targetRpe ? ` · RPE ${p.targetRpe}` : ""}`;
}
// A circuit/EMOM advances between movements each round, not through all sets
// of one movement first. This affects guidance only; stored targets stay intact.
export function orderedPlayerSets<T extends { id: string; prescription_details: WorkoutProtocol | null; workout_sets: { id: string; set_number: number }[] }>(exercises: T[]) {
  const visited = new Set<string>();
  return exercises.flatMap(exercise => {
    if (visited.has(exercise.id)) return [];
    const p = exercise.prescription_details;
    const grouped = p?.group && ["superset", "circuit", "stations", "emom", "rounds"].includes(p.format);
    const members = grouped ? exercises.filter(e => e.prescription_details?.block === p.block && e.prescription_details?.format === p.format && e.prescription_details?.group === p.group) : [exercise];
    for (const member of members) visited.add(member.id);
    const rounds = [...new Set(members.flatMap(e => e.workout_sets.map(s => s.set_number)))].sort((a, b) => a - b);
    return rounds.flatMap(round => members.flatMap(e => e.workout_sets.filter(s => s.set_number === round).map(set => ({ exercise: e, set }))));
  });
}
export function estimateWorkoutSeconds(rows: { sets: number; reps: number; restSeconds: number | null; protocol?: WorkoutProtocol | null }[]) {
  const groups = new Set<string>();
  return rows.reduce((sum, row) => {
    const p = row.protocol;
    if (p?.format === "amrap") {
      const key = `${p.block}:${p.group}`;
      if (groups.has(key)) return sum;
      groups.add(key); return sum + (p.blockDurationSeconds ?? 0) + 60;
    }
    // Distance pace is deliberately conservative, not a promised performance.
    const work = p?.measurement === "time" ? p.workSeconds ?? 0 : p?.measurement === "distance" ? (p.distance ?? 0) * (p.perSide ? 4 : 2) : row.reps * (p?.perSide ? 8 : 4);
    return sum + row.sets * (p?.format === "emom" ? p.intervalSeconds ?? 0 : work + (row.restSeconds ?? 60)) + 30;
  }, 0);
}

export function protocolsFromForm(form: FormData, count: number, validate = true): WorkoutProtocol[] {
  const columns = Object.fromEntries(Object.keys(defaultProtocol()).map(key => [key, form.getAll(`protocol-${key}`).map(String)]));
  if (Object.values(columns).some(values => values.length !== count)) throw new Error("Check every protocol row.");
  const numeric = ["workSeconds", "distance", "intervalSeconds", "blockDurationSeconds", "percentageLoad", "targetRpe"];
  return Array.from({ length: count }, (_, index) => {
    const raw = Object.fromEntries(Object.entries(columns).map(([key, values]) => [key,
    numeric.includes(key) ? values[index] === "" ? null : Number(values[index]) : key === "perSide" ? values[index] === "true" : key === "substitutionIds" ? JSON.parse(values[index]) : values[index],
    ]));
    return validate ? validateProtocol(raw) : raw as WorkoutProtocol;
  });
}
