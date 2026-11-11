import type { RecommendationExercise } from "../components/prescription-review-form";
export type SavedWorkoutPreparation = {
  title:string; instructions:string; scheduledDate:string; duration:number; exercises:RecommendationExercise[];
};
export function savedWorkoutPreparation(value:unknown):SavedWorkoutPreparation|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const draft=value as SavedWorkoutPreparation;
  if(typeof draft.title!=="string"||typeof draft.instructions!=="string"||typeof draft.scheduledDate!=="string"||typeof draft.duration!=="number"||!Array.isArray(draft.exercises)||!draft.exercises.length)return null;
  if(draft.exercises.some(row=>!row||typeof row.libraryExerciseId!=="string"||typeof row.name!=="string"||!Number.isInteger(row.sets)||!Number.isInteger(row.reps)))return null;
  return draft;
}
