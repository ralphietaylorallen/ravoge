export type LibraryExerciseOption = { id: string; name: string; equipment_requirements?: string[] };
import type { WorkoutProtocol } from "./workout-protocol";
export type ReviewedExercise = { libraryExerciseId: string; sourceText: string; sets: number | null; reps: number | null; load: number | null; restSeconds: number | null; notes: string; protocol?: WorkoutProtocol };
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
  const match = (name: string) => library.find(ex => ex.name.toLowerCase() === name.trim().toLowerCase());
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
      else issues.push(`Review source: ${line.slice(0, 160)}`);
    }
  }
  return { title: get("title"), exercises, issues, status: issues.length || !exercises.length ? "needs_review" : "draft" };
}
