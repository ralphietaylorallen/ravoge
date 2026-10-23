"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { protocolsFromForm } from "@/lib/workout-protocol";

export type ReviewState = { status: "idle" | "error" | "success"; message?: string };
export async function setGymReferences(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  const intent=String(form.get("intent"));
  const ids=[...new Set(form.getAll("itemId").map(String))];
  if (!['enable','exclude','delete','restore','refresh'].includes(intent) || ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id))) return {status:"error",message:"Choose an available library action."};
  const {data,error}=await supabase.rpc("set_gym_references",{item_ids:ids,all_matching:form.get("allMatching")==="yes",search_text:String(form.get("search")??""),operation:intent,confirmed:form.get("confirmed")==="yes"});
  if(error) return {status:"error",message:"Nothing changed. Select workouts in your gym and confirm the requested action."};
  revalidatePath("/owner/training-library");
  return {status:"success",message:`${data} workout(s) ${intent==='enable'?'enabled as gym references':intent==='exclude'?'excluded from generation':intent==='delete'?'moved to Deleted; original rows preserved':intent==='restore'?'restored (still excluded until enabled)':'reference excerpts refreshed'}.`};
}
export async function saveLoadRule(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  const number = (key: string) => String(form.get(key) ?? "").trim() ? Number(form.get(key)) : null;
  const coefficient = number("coefficient"), minimum = number("minimum"), maximum = number("maximum");
  if ([coefficient, minimum, maximum].some(v => v !== null && !Number.isFinite(v))) return { status: "error", message: "Use finite rule values." };
  const { error } = await supabase.rpc("save_exercise_load_rule", { target_exercise_id: String(form.get("exerciseId")), starting_coefficient: coefficient,
    anchor: String(form.get("anchor") ?? "") || null, semantics: String(form.get("semantics")), minimum_lb: minimum, maximum_lb: maximum,
    calibration: String(form.get("calibration")), equivalent_id: String(form.get("equivalent") ?? "") || null, explanation: String(form.get("explanation") ?? "").trim() });
  if (error) return { status: "error", message: "Rule not saved. Check the anchor/coefficient pair, safeguards, and equivalent equipment/semantics." };
  revalidatePath("/owner/training-library/load-rules");
  return { status: "success", message: "New gym rule version saved. Existing assigned workouts remain unchanged." };
}
export async function setTrainingStatus(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  const ids = [...new Set(form.getAll("itemId").map(String))];
  const intent = String(form.get("intent"));
  if (!ids.length || ids.length > 100 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id)) || !["publish", "unpublish", "exclude"].includes(intent)
    || (intent === "publish" && form.get("confirmed") !== "yes")) return { status: "error", message: "Select records and confirm individual source review before publishing." };
  const { data, error } = await supabase.rpc("set_training_generation_status", { item_ids: ids, publish: intent === "publish", excluded: intent === "exclude" });
  if (error) return { status: "error", message: "Nothing changed. Publishing requires a complete, individually confirmed structured review for every selected record." };
  revalidatePath("/owner/training-library");
  return { status: "success", message: `${data} record(s) ${intent === "publish" ? "published" : intent === "exclude" ? "excluded from generation" : "returned to review"}. Original raw rows and prior revisions are preserved.` };
}
export async function saveProgrammingProfile(_state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  const { error } = await supabase.rpc("save_programming_profile", { profile_summary: String(form.get("summary") ?? "").trim(), preferred_formats: form.getAll("formats").map(String), preferred_emphasis: form.getAll("emphasis").map(String) });
  if (error) return { status: "error", message: "Profile not saved. Check the summary and preferences." };
  revalidatePath("/owner/training-library");
  return { status: "success", message: "Programming profile version saved against the current reviewed, published sources." };
}
export async function saveTrainingReview(itemId: string, _state: ReviewState, form: FormData): Promise<ReviewState> {
  const { supabase } = await requireRole("owner");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { status: "error", message: "Source unavailable." };
  const ids = form.getAll("libraryExerciseId").map(String);
  const values = (name: string) => form.getAll(name).map(String);
  const sets = values("sets"), reps = values("reps"), loads = values("load"), rests = values("rest"), source = values("sourceText"), notes = values("notes");
  if ([sets, reps, loads, rests, source, notes].some(list => list.length !== ids.length) || ids.length > 30) return { status: "error", message: "Check every exercise row." };
  if (form.get("intent") === "published" && form.get("sourceConfirmed") !== "yes") return { status: "error", message: "Confirm that you reviewed the source and resolved every ambiguous protocol before publishing." };
  let protocols: ReturnType<typeof protocolsFromForm> | undefined;
  try { protocols = protocolsFromForm(form, ids.length, form.get("intent") === "published"); }
  catch { if (form.get("intent") === "published") return { status: "error", message: "Complete each format and target. Keep missing information in Needs review; do not invent it." }; }
  const exercises = ids.map((id, index) => ({ libraryExerciseId: id, sets: sets[index] ? Number(sets[index]) : null, reps: reps[index] ? Number(reps[index]) : null, load: loads[index] === "" ? null : Number(loads[index]), loadUnit: "lb", restSeconds: rests[index] === "" ? null : Number(rests[index]), sourceText: source[index], notes: notes[index], protocol: protocols?.[index] }));
  if (form.get("intent") === "published" && exercises.some(ex => !/^[0-9a-f-]{36}$/i.test(ex.libraryExerciseId) || ex.sets === null || !Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 100 || ex.reps === null || !Number.isInteger(ex.reps) || ex.reps < 1 || ex.reps > 1000 || (ex.load !== null && !Number.isFinite(ex.load)) || (ex.restSeconds !== null && !Number.isInteger(ex.restSeconds)))) return { status: "error", message: "Choose a recognized exercise and explicit fixed sets and reps for each row. Keep ambiguous timed/range protocols in Needs review." };
  const { error } = await supabase.rpc("review_structured_training_item", {
    target_item_id: itemId, review_title: String(form.get("title") ?? "").trim(), review_status: String(form.get("intent") ?? "review"),
    goal: String(form.get("goal") ?? "") || null, duration_minutes: form.get("duration") ? Number(form.get("duration")) : null, review_exercises: exercises,
    review_notes: String(form.get("reviewNotes") ?? "").trim() || "Source requires protocol review.", source_confirmed: form.get("sourceConfirmed") === "yes",
  });
  if (error) return { status: "error", message: "Review was not saved. Check the title, goal, duration, source evidence and exercise values." };
  revalidatePath("/owner/training-library"); revalidatePath(`/owner/training-library/${itemId}`);
  return { status: "success", message: form.get("intent") === "published" ? "Published for your gym’s generator. Coach review is still required before Client assignment." : "Review revision saved. This source will not be used by the generator until published." };
}
