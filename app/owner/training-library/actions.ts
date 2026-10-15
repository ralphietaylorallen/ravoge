"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { suggestTrainingReview } from "@/lib/training-review";

export type ReviewState = { status: "idle" | "error" | "success"; message?: string };
export async function saveTrainingReview(itemId: string, _state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { status: "error", message: "Source unavailable." };
  const ids = form.getAll("libraryExerciseId").map(String);
  const values = (name: string) => form.getAll(name).map(String);
  const sets = values("sets"), reps = values("reps"), loads = values("load"), rests = values("rest"), source = values("sourceText"), notes = values("notes");
  if ([sets, reps, loads, rests, source, notes].some(list => list.length !== ids.length) || ids.length > 30) return { status: "error", message: "Check every exercise row." };
  if (form.get("intent") === "published" && form.get("sourceConfirmed") !== "yes") return { status: "error", message: "Confirm that you reviewed the source and resolved every ambiguous protocol before publishing." };
  if (form.get("intent") === "published") {
    const [{ data: item }, { data: library }] = await Promise.all([
      supabase.from("training_library_items").select("normalized_content").eq("id", itemId).maybeSingle(),
      supabase.from("exercise_library").select("id,name").eq("is_active", true),
    ]);
    if (!item || suggestTrainingReview(item.normalized_content, library ?? []).issues.length) return { status: "error", message: "This source contains unresolved or unsupported protocols. It must remain in Needs review; do not convert it to guessed fixed sets." };
  }
  const exercises = ids.map((id, index) => ({ libraryExerciseId: id, sets: sets[index] ? Number(sets[index]) : null, reps: reps[index] ? Number(reps[index]) : null, load: loads[index] === "" ? null : Number(loads[index]), restSeconds: rests[index] === "" ? null : Number(rests[index]), sourceText: source[index], notes: notes[index] }));
  if (form.get("intent") === "published" && exercises.some(ex => !/^[0-9a-f-]{36}$/i.test(ex.libraryExerciseId) || ex.sets === null || !Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 100 || ex.reps === null || !Number.isInteger(ex.reps) || ex.reps < 1 || ex.reps > 1000 || (ex.load !== null && !Number.isFinite(ex.load)) || (ex.restSeconds !== null && !Number.isInteger(ex.restSeconds)))) return { status: "error", message: "Choose a recognized exercise and explicit fixed sets and reps for each row. Keep ambiguous timed/range protocols in Needs review." };
  const { error } = await supabase.rpc("review_training_library_item", {
    target_item_id: itemId, review_title: String(form.get("title") ?? "").trim(), review_status: String(form.get("intent") ?? "review"),
    goal: String(form.get("goal") ?? "") || null, duration_minutes: form.get("duration") ? Number(form.get("duration")) : null, review_exercises: exercises,
    review_notes: String(form.get("reviewNotes") ?? "").trim() || "Source requires protocol review.",
  });
  if (error) return { status: "error", message: "Review was not saved. Check the title, goal, duration, source evidence and exercise values." };
  revalidatePath("/owner/training-library"); revalidatePath(`/owner/training-library/${itemId}`);
  return { status: "success", message: form.get("intent") === "published" ? "Published for your gym’s generator. Coach review is still required before Client assignment." : "Review revision saved. This source will not be used by the generator until published." };
}
