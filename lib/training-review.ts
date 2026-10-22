export type LibraryExerciseOption = { id: string; name: string; equipment_requirements?: string[] };
import type { WorkoutProtocol } from "./workout-protocol";
export type ReviewedExercise = { libraryExerciseId: string; sourceText: string; sets: number | null; reps: number | null; load: number | null; loadUnit?: string | null; restSeconds: number | null; notes: string; protocol?: WorkoutProtocol };
type SourceCell = { header?: string; raw?: unknown; display?: string };

export function sourceFields(content: unknown): Array<{ header: string; value: string }> {
  if (!content || typeof content !== "object" || !Array.isArray((content as { cells?: unknown }).cells)) return [];
  return ((content as { cells: SourceCell[] }).cells).map(cell => ({ header: String(cell.header ?? ""), value: String(cell.raw ?? cell.display ?? "") }));
}

// Recognize only explicit, fixed-set prescriptions. Timed/EMOM/ranges and
// unfamiliar movement names retain their source text for a human to review.
export function suggestTrainingReview(content: unknown, library: LibraryExerciseOption[]) {
  const fields = sourceFields(content);
  const get = (name: string) => fields.find(field => field.header.toLowerCase().trim() === name)?.value.trim() ?? "";
  const exercises: ReviewedExercise[] = [];
  const issues: string[] = [];
  const normalized = (name: string) => name.toLowerCase().replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string> = { "bb bench press": "bench press", "db bench press": "dumbbell bench press", "db incline press": "incline dumbbell press", "db rdl": "dumbbell rdl", "ski erg": "skierg interval", "rower": "rower interval" };
  const match = (name: string) => { const key = normalized(name); return library.find(ex => normalized(ex.name) === (aliases[key] ?? key)); };
  const rowName = get("exercise") || get("exercise name");
  const protocolText = [get("description"), get("score type"), get("load"), get("weight"), get("instructions")].join(" ");
  const complex = /\b(?:emom|amrap|seconds?|minutes?|stations?|each|per[- ]side)\b|%|\d\s*[-–]\s*\d/i.test(protocolText);
  if (complex) issues.push("Timed stations, EMOMs, percentage loads, rep ranges and per-side instructions need protocol review and cannot be published as fixed-set workouts.");
  if (get("load") || get("weight") || get("instructions")) issues.push("Load and instruction columns require protocol review before publication.");
  if (rowName) {
    const exercise = match(rowName);
    const sets = get("sets"), reps = get("reps");
    if (!complex && exercise && /^\d+$/.test(sets) && /^\d+$/.test(reps) && Number(sets) >= 1 && Number(sets) <= 100 && Number(reps) >= 1 && Number(reps) <= 1000) {
      exercises.push({ libraryExerciseId: exercise.id, sourceText: `${rowName}; Sets: ${sets}; Reps: ${reps}`, sets: Number(sets), reps: Number(reps), load: null, restSeconds: null, notes: "" });
    } else issues.push("This row needs a recognized exercise and explicit fixed sets and reps.");
  } else {
    const description = get("description");
    if (!description) issues.push("No recognizable exercise or Description column was found.");
    for (const line of description.replaceAll("\\n", "\n").split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      const prescription = line.match(/^(?:[-•]\s*)?(.+?)\s+(\d+)\s*[x×]\s*(\d+)\s*$/i);
      const exercise = prescription && match(prescription[1]);
      if (!complex && exercise && prescription && Number(prescription[2]) >= 1 && Number(prescription[2]) <= 100 && Number(prescription[3]) >= 1 && Number(prescription[3]) <= 1000) exercises.push({ libraryExerciseId: exercise.id, sourceText: line, sets: Number(prescription[2]), reps: Number(prescription[3]), load: null, restSeconds: null, notes: "" });
      else {
        // Safe mapping assistance only: preserve the COMPLETE source instruction
        // and leave all unresolved quantities/protocols blank. Never flatten an
        // EMOM, combination, per-side or percentage line into invented fixed sets.
        const name = line.replace(/^[-•]\s*/, "").split(/\s+(?:x\s*\d|\d+\s*[x×]|\d+\s*(?:sec|min))\b/i)[0];
        const recognized = match(name);
        if (recognized && !exercises.some(ex => ex.sourceText === line)) exercises.push({ libraryExerciseId: recognized.id, sourceText: line, sets: null, reps: null, load: null, restSeconds: null, notes: line });
        issues.push(`Review source: ${line.slice(0, 160)}`);
      }
    }
  }
  return { title: get("title"), exercises, issues, status: issues.length || !exercises.length ? "needs_review" : "draft" };
}
